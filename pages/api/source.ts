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
    const prompt = `You are a hardware sourcing agent. Search Octopart to find real pricing, stock and buy links for this component.

COMPONENT: ${spec.description}
SEARCH TERM: "${searchQuery}"
QUANTITY: ${spec.quantity || 'not specified'} units
TARGET PRICE: ${spec.targetPrice ? '$' + spec.targetPrice : 'not specified'}
LEAD TIME: ${spec.leadTime || 'flexible'}
CERTIFICATIONS: ${spec.certifications || 'none'}

SEARCH STEPS:
1. Search octopart.com for "${searchQuery}" — this page shows ALL distributors with real prices, stock, and buy buttons
2. From the Octopart results page, get the direct buy/product URLs for each distributor — these are the links shown next to each distributor name
3. Also search digikey.com and mouser.com directly for "${searchQuery}" to get additional URLs

CRITICAL RULES:
- Use the exact buy URLs from Octopart — e.g. https://uk.farnell.com/...?CMP=grhb-synd-e14-octo-buynow-invf or https://www.digikey.com/en/products/detail/...
- Each supplier must be a DIFFERENT distributor — never list the same distributor twice
- Use exact prices shown on Octopart
- Score A = best price+stock, B = good alternative, C = acceptable — rank correctly

Return ONLY valid JSON, nothing before or after:
{"summary":"2 sentences with real distributor names, exact prices, and stock levels","no_results":false,"suggestions":[],"suppliers":[{"name":"exact distributor name","platform":"Mouser / Digi-Key / Farnell / RS Components / Alibaba","country":"USA / UK / China","unit_price":"exact price from Octopart","moq":"exact MOQ","lead_time":"In stock / X days","certifications":"RoHS / CE","score":"A/B/C","score_reason":"one sentence","notes":"2 sentences with real stock and pricing","search_tip":"exact MPN","product_url":"exact buy URL from Octopart results"}]}`

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
