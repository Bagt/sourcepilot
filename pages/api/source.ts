import type { NextApiRequest, NextApiResponse } from 'next'
import Anthropic from '@anthropic-ai/sdk'
import { PartSpec, SearchResult } from '../../lib/types'

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

function extractJSON(text: string): string | null {
  let depth = 0, start = text.indexOf('{'), end = -1
  if (start === -1) return null
  for (let i = start; i < text.length; i++) {
    if (text[i] === '{') depth++
    else if (text[i] === '}') { depth--; if (depth === 0) { end = i; break } }
  }
  return end === -1 ? null : text.slice(start, end + 1)
}

function getSearchQuery(description: string): string {
  const firstLine = description.split('\n')[0].trim()
  return firstLine.length > 60 ? firstLine.slice(0, 60) : firstLine
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })
  const spec: PartSpec = req.body
  if (!spec.description?.trim()) return res.status(400).json({ error: 'Component description is required' })

  const searchQuery = getSearchQuery(spec.description)

  try {
    const prompt = `You are a hardware sourcing agent. Search Octopart first, then individual distributors, to find real pricing and stock for this component.

COMPONENT: ${spec.description}
SEARCH TERM: "${searchQuery}"
QUANTITY: ${spec.quantity || 'not specified'} units
TARGET PRICE: ${spec.targetPrice ? '$' + spec.targetPrice : 'not specified'}
LEAD TIME: ${spec.leadTime || 'flexible'}
CERTIFICATIONS: ${spec.certifications || 'none'}

SEARCH STEPS:
1. Search octopart.com for "${searchQuery}" — this shows all distributors at once with real prices and stock
2. Search mouser.com for "${searchQuery}" — get direct product URL
3. Search digikey.com for "${searchQuery}" — get direct product URL
4. Search farnell.com for "${searchQuery}" — get direct product URL

From Octopart you will find: exact prices per distributor, stock levels, SKU numbers, and direct buy links to Mouser/Digi-Key/Farnell/RS. Use these real URLs and prices in your response.

Return ONLY valid JSON, nothing before or after:
{"summary":"2 sentences with real distributor names, exact prices, and stock levels found on Octopart","no_results":false,"suggestions":[],"suppliers":[{"name":"exact distributor name e.g. Mouser Electronics","platform":"Mouser / Digi-Key / Farnell / RS Components / Alibaba","country":"USA / UK / China","unit_price":"exact price e.g. $0.185","moq":"exact MOQ e.g. 1","lead_time":"In stock / 1-2 days / X weeks","certifications":"RoHS / CE / etc","score":"A/B/C","score_reason":"one sentence","notes":"2 sentences with real stock and pricing data","search_tip":"exact MPN e.g. CR2032","product_url":"direct URL to product on mouser.com, digikey.com, farnell.com, or rs-online.com"}]}`

    const message = await client.messages.create({
      model: 'claude-sonnet-4-5',
      max_tokens: 1500,
      tools: [{ type: 'web_search_20250305', name: 'web_search' } as any],
      messages: [{ role: 'user', content: prompt }],
    })

    const text = message.content.map((b) => (b.type === 'text' ? b.text : '')).join('')
    if (!text?.trim()) throw new Error('Empty response from AI')

    const jsonStr = extractJSON(text)
    if (!jsonStr) throw new Error('Could not extract JSON — try again')

    const result: SearchResult = JSON.parse(jsonStr)
    return res.status(200).json(result)

  } catch (err: unknown) {
    console.error('Sourcing API error:', err)
    return res.status(500).json({ error: 'Search failed: ' + (err instanceof Error ? err.message : 'Unknown error') })
  }
}
