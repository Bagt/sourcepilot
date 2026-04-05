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
  if (!data.access_token) throw new Error('No token received')
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
                prices { quantity price currency }
              }
            }
          }
        }
      }
    }
  `
  const res = await fetch(NEXAR_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
    body: JSON.stringify({ query: gql, variables: { q: query, limit: 6 } }),
  })
  return res.json()
}

function formatNexarResults(nexarData: any): string {
  try {
    const results = nexarData?.data?.supSearch?.results || []
    if (!results.length) return 'No parts found in distributor databases.'
    return results.slice(0, 5).map((r: any) => {
      const part = r.part
      const sellers = part.sellers?.slice(0, 4).map((s: any) => {
        const offer = s.offers?.[0]
        const price = offer?.prices?.[0]
        return `  - ${s.company?.name}: ${price ? `$${price.price} (MOQ: ${offer?.moq || 1})` : 'price on request'}, stock: ${offer?.inventoryLevel || 'unknown'}, url: ${offer?.clickUrl || 'n/a'}`
      }).join('\n') || '  - No distributors listed'
      return `MPN: ${part.mpn} | Manufacturer: ${part.manufacturer?.name}\nDesc: ${part.shortDescription || 'n/a'}\nDistributors:\n${sellers}`
    }).join('\n\n')
  } catch {
    return 'Could not parse distributor data.'
  }
}

function extractJSON(text: string): string | null {
  let depth = 0, start = text.indexOf('{'), end = -1
  if (start === -1) return null
  for (let i = start; i < text.length; i++) {
    if (text[i] === '{') depth++
    else if (text[i] === '}') { depth--; if (depth === 0) { end = i; break } }
  }
  if (end === -1) return null
  return text.slice(start, end + 1)
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })
  const spec: PartSpec = req.body
  if (!spec.description?.trim()) return res.status(400).json({ error: 'Component description is required' })

  try {
    // Step 1: Get live distributor data
    let nexarContext = ''
    try {
      const token = await getNexarToken()
      const nexarData = await searchNexar(spec.description, token)
      nexarContext = formatNexarResults(nexarData)
    } catch (e) {
      console.log('Nexar unavailable, using AI fallback:', e)
      nexarContext = 'Live distributor data unavailable - using knowledge base.'
    }

    // Step 2: AI structures and ranks results
    const prompt = `You are a hardware sourcing agent for DTC brands. Return supplier results for this component.

COMPONENT: ${spec.description}
QUANTITY: ${spec.quantity || 'not specified'} units
TARGET PRICE: ${spec.targetPrice ? '$' + spec.targetPrice : 'not specified'}
LEAD TIME: ${spec.leadTime || 'flexible'}
CERTIFICATIONS: ${spec.certifications || 'none'}

LIVE DISTRIBUTOR DATA (from Mouser, Digi-Key, Farnell, RS Components and others):
${nexarContext}

Using the live data above, return 4 suppliers. Use exact distributor names like Mouser, Digi-Key, Farnell, RS Components, Arrow. Use real prices and URLs from the data. Add Alibaba if needed for volume pricing.

Return ONLY valid JSON, absolutely nothing else before or after:
{"summary":"2 sentences mentioning specific distributors and prices found","no_results":false,"suggestions":[],"suppliers":[{"name":"exact distributor name e.g. Mouser Electronics","platform":"Mouser / Digi-Key / Farnell / RS Components / Arrow / Alibaba","country":"country","unit_price":"exact price from data","moq":"exact MOQ","lead_time":"In stock / 1-2 days / X weeks","certifications":"CE/RoHS/UL/etc","score":"A/B/C","score_reason":"one sentence","notes":"2 sentences using actual data found","search_tip":"exact MPN","product_url":"exact URL from distributor data"}]}`

    const message = await client.messages.create({
      model: 'claude-sonnet-4-5',
      max_tokens: 1500,
      messages: [{ role: 'user', content: prompt }],
    })

    const text = message.content.map((b) => (b.type === 'text' ? b.text : '')).join('')
    
    if (!text || text.trim().length === 0) {
      throw new Error('Empty response from AI')
    }

    const jsonStr = extractJSON(text)
    if (!jsonStr) {
      console.error('Raw AI response:', text.slice(0, 500))
      throw new Error('Could not extract JSON from response')
    }

    const result: SearchResult = JSON.parse(jsonStr)
    return res.status(200).json(result)

  } catch (err: unknown) {
    console.error('Sourcing API error:', err)
    return res.status(500).json({ error: 'Search failed: ' + (err instanceof Error ? err.message : 'Unknown error') })
  }
}
