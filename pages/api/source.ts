import type { NextApiRequest, NextApiResponse } from 'next'
import Anthropic from '@anthropic-ai/sdk'
import { PartSpec, SearchResult } from '../../lib/types'

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
const NEXAR_URL = 'https://api.nexar.com/graphql'

async function getNexarToken(): Promise<string> {
  const res = await fetch('https://identity.nexar.com/connect/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'client_credentials',
      client_id: process.env.NEXAR_CLIENT_ID || '',
      client_secret: process.env.NEXAR_CLIENT_SECRET || '',
    }),
  })
  const data = await res.json()
  return data.access_token
}

async function searchNexar(query: string, token: string) {
  const gql = `
    query SearchParts($q: String!, $limit: Int!) {
      supSearch(q: $q, limit: $limit) {
        results {
          part {
            mpn
            manufacturer { name }
            shortDescription
            sellers(includeBrokers: false) {
              company { name }
              offers {
                clickUrl
                inventoryLevel
                moq
                prices {
                  quantity
                  price
                  currency
                }
              }
            }
          }
        }
      }
    }
  `
  const res = await fetch(NEXAR_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
    },
    body: JSON.stringify({ query: gql, variables: { q: query, limit: 5 } }),
  })
  return res.json()
}

function formatNexarResults(nexarData: any): string {
  try {
    const results = nexarData?.data?.supSearch?.results || []
    if (!results.length) return 'No results found on Nexar/Octopart.'
    return results.slice(0, 6).map((r: any) => {
      const part = r.part
      const sellers = part.sellers?.slice(0, 4).map((s: any) => {
        const offer = s.offers?.[0]
        const price = offer?.prices?.[0]
        return `  - ${s.company?.name}: ${price ? `$${price.price} (MOQ: ${offer?.moq || 1})` : 'price on request'}, stock: ${offer?.inventoryLevel || 'unknown'}, url: ${offer?.clickUrl || 'n/a'}`
      }).join('\n') || '  - No sellers'
      return `Part: ${part.mpn} by ${part.manufacturer?.name}\nDescription: ${part.shortDescription || 'n/a'}\nSellers:\n${sellers}`
    }).join('\n\n')
  } catch {
    return 'Error parsing Nexar results.'
  }
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })
  const spec: PartSpec = req.body
  if (!spec.description?.trim()) return res.status(400).json({ error: 'Component description is required' })

  try {
    let nexarContext = ''
    try {
      const token = await getNexarToken()
      const nexarData = await searchNexar(spec.description, token)
      nexarContext = formatNexarResults(nexarData)
    } catch {
      nexarContext = 'Nexar API unavailable - using AI knowledge as fallback.'
    }

    const prompt = `You are a hardware sourcing agent. Here is LIVE data from Nexar/Octopart:

COMPONENT: ${spec.description}
QUANTITY: ${spec.quantity || 'not specified'} units
TARGET PRICE: ${spec.targetPrice ? '$' + spec.targetPrice : 'not specified'}
LEAD TIME: ${spec.leadTime || 'flexible'}
CERTIFICATIONS: ${spec.certifications || 'none'}

NEXAR LIVE DATA:
${nexarContext}

Return the best 4 suppliers using actual data above. Use exact seller names, prices, MOQs and URLs from Nexar. Supplement with Alibaba if needed.

Return ONLY this JSON, no other text:
{"summary":"2 sentence recommendation with specific suppliers and prices","no_results":false,"suggestions":[],"suppliers":[{"name":"seller name","platform":"Digi-Key/Mouser/Farnell/RS Components/Alibaba","country":"country","unit_price":"exact price","moq":"exact MOQ","lead_time":"in stock or X weeks","certifications":"CE/RoHS/etc","score":"A/B/C","score_reason":"one sentence","notes":"2 sentences from actual data","search_tip":"exact MPN","product_url":"exact clickUrl from Nexar or marketplace URL"}]}`

    const message = await client.messages.create({
      model: 'claude-sonnet-4-5',
      max_tokens: 1500,
      messages: [{ role: 'user', content: prompt }],
    })

    const text = message.content.map((b) => (b.type === 'text' ? b.text : '')).join('')
    let depth = 0, start = text.indexOf('{'), end = -1
    if (start !== -1) {
      for (let i = start; i < text.length; i++) {
        if (text[i] === '{') depth++
        else if (text[i] === '}') { depth--; if (depth === 0) { end = i; break } }
      }
    }
    if (start === -1 || end === -1) throw new Error('No JSON found in response')
    const result: SearchResult = JSON.parse(text.slice(start, end + 1))
    return res.status(200).json(result)
  } catch (err: unknown) {
    console.error('Sourcing API error:', err)
    return res.status(500).json({ error: 'Search failed: ' + (err instanceof Error ? err.message : 'Unknown error') })
  }
}
