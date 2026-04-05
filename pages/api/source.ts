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
    // STEP 1: Search Octopart and collect raw data
    const searchMessage = await client.messages.create({
      model: 'claude-sonnet-4-5',
      max_tokens: 1000,
      tools: [{ type: 'web_search_20250305', name: 'web_search' } as any],
      messages: [{
        role: 'user',
        content: `Search octopart.com for "${searchQuery}" and return ONLY the raw data you find. List every distributor shown on the page with: distributor name, price, stock quantity, and the exact buy URL. Do not interpret or add anything — just copy the exact data from the page. If Octopart shows a buy button URL for each distributor, include that exact URL.`
      }],
    })

    const rawData = searchMessage.content
      .map((b) => (b.type === 'text' ? b.text : ''))
      .join('')

    // STEP 2: Structure the raw data into JSON
    const structureMessage = await client.messages.create({
      model: 'claude-sonnet-4-5',
      max_tokens: 1500,
      messages: [{
        role: 'user',
        content: `You found this raw distributor data for "${searchQuery}":

${rawData}

Now structure the best 4 results into JSON. ONLY use distributors and URLs from the data above — do not add any distributor not mentioned. If a URL is in the data, use it exactly as shown.

Context:
- Quantity needed: ${spec.quantity || 'not specified'} units
- Target price: ${spec.targetPrice ? '$' + spec.targetPrice : 'not specified'}
- Certifications: ${spec.certifications || 'none'}

Return ONLY valid JSON:
{"summary":"2 sentences with real distributor names and prices from the data","no_results":false,"suggestions":[],"suppliers":[{"name":"distributor name from data","platform":"Mouser / Digi-Key / Farnell / RS Components / Alibaba","country":"USA / UK / NL etc","unit_price":"exact price from data","moq":"MOQ from data","lead_time":"In stock / X days","certifications":"RoHS / CE","score":"A/B/C","score_reason":"one sentence based on price and stock","notes":"2 sentences using only the data found","search_tip":"exact MPN","product_url":"exact URL from the data above"}]}`
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
