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
    // STEP 1: Search each distributor directly
    const searchMessage = await client.messages.create({
      model: 'claude-sonnet-4-5',
      max_tokens: 1500,
      tools: [{ type: 'web_search_20250305', name: 'web_search' } as any],
      messages: [{
        role: 'user',
        content: `Search for "${searchQuery}" on each of these distributor sites and report exactly what you find — product URL, price, and stock for each:

1. Search: "${searchQuery}" site:digikey.com
2. Search: "${searchQuery}" site:mouser.com  
3. Search: "${searchQuery}" site:farnell.com
4. Search: "${searchQuery}" site:uk.rs-online.com

For each result found, report:
- Distributor name
- Exact product page URL
- Price (exact number)
- Stock quantity
- MOQ

Report only what you actually find on each site. Do not guess or fill in missing data.`
      }],
    })

    const rawData = searchMessage.content
      .map((b) => (b.type === 'text' ? b.text : ''))
      .join('')

    // STEP 2: Structure into JSON
    const structureMessage = await client.messages.create({
      model: 'claude-sonnet-4-5',
      max_tokens: 1500,
      messages: [{
        role: 'user',
        content: `Here is distributor data found for "${searchQuery}":

${rawData}

Structure the best 4 results into JSON. Only use distributors and URLs from above. Do not invent data.

Context: Quantity: ${spec.quantity || 'not specified'} | Target: ${spec.targetPrice ? '$' + spec.targetPrice : 'any'} | Certs: ${spec.certifications || 'none'}

Return ONLY valid JSON:
{"summary":"2 sentences naming real distributors with exact prices and stock found","no_results":false,"suggestions":[],"suppliers":[{"name":"distributor name","platform":"Mouser / Digi-Key / Farnell / RS Components","country":"USA / UK","unit_price":"exact price","moq":"MOQ","lead_time":"In stock / X days","certifications":"RoHS / CE","score":"A/B/C","score_reason":"one sentence","notes":"2 sentences from real data","search_tip":"exact MPN","product_url":"exact URL from search results"}]}`
      }],
    })

    const text = structureMessage.content
      .map((b) => (b.type === 'text' ? b.text : ''))
      .join('')

    if (!text?.trim()) throw new Error('Empty response')
    const jsonStr = extractJSON(text)
    if (!jsonStr) throw new Error('Could not extract JSON — try again')

    const result: SearchResult = JSON.parse(jsonStr)
    return res.status(200).json(result)

  } catch (err: unknown) {
    console.error('Sourcing API error:', err)
    return res.status(500).json({ error: 'Search failed: ' + (err instanceof Error ? err.message : 'Unknown error') })
  }
}
