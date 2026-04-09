import type { NextApiRequest, NextApiResponse } from 'next'
import Anthropic from '@anthropic-ai/sdk'
import { PartSpec, SearchResult } from '../../lib/types'

export const config = { maxDuration: 60 }

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
  const isElectronics = /sensor|resistor|capacitor|microcontroller|esp32|arduino|ic |chip|transistor|diode|led|pcb|module|battery|cr203/i.test(spec.description)

  try {
    // STEP 1: Search for real suppliers
    const searchMessage = await client.messages.create({
      model: 'claude-sonnet-4-5',
      max_tokens: 1000,
      tools: [{ type: 'web_search_20250305', name: 'web_search' } as any],
      messages: [{
        role: 'user',
        content: isElectronics
          ? `Search for "${searchQuery}" on digikey.com, mouser.com, and farnell.com. For each site find: exact product URL, price, stock level, MOQ. Report only real data you find.`
          : `Search alibaba.com for "${searchQuery}" suppliers. Find 4 real suppliers with: company name, product URL on alibaba.com, price range, MOQ, and certifications. Also search for "${searchQuery} manufacturer" to find direct suppliers. Report exact URLs and prices you find.`
      }],
    })

    const rawData = searchMessage.content
      .map((b: any) => (b.type === 'text' ? b.text : ''))
      .join('')

    // STEP 2: Structure results
    const structureMessage = await client.messages.create({
      model: 'claude-sonnet-4-5',
      max_tokens: 1200,
      messages: [{
        role: 'user',
        content: `Structure these supplier results for "${searchQuery}" into JSON. Use ONLY suppliers and URLs from the data below.

DATA FOUND:
${rawData.slice(0, 2000)}

Quantity: ${spec.quantity || 'not specified'} | Target price: ${spec.targetPrice ? '$' + spec.targetPrice : 'any'} | Certs: ${spec.certifications || 'none'}

Return ONLY valid JSON:
{"summary":"2 sentences with real supplier names and prices found","no_results":false,"suggestions":[],"suppliers":[{"name":"exact supplier name","platform":"Alibaba / Digi-Key / Mouser / Farnell / RS Components","country":"China / USA / UK","unit_price":"real price","moq":"real MOQ","lead_time":"2-4 weeks / In stock","certifications":"CE/RoHS/etc","score":"A/B/C","score_reason":"one sentence","notes":"2 sentences with real data","search_tip":"exact MPN or product name","product_url":"exact URL found in data"}]}`
      }],
    })

    const text = structureMessage.content
      .map((b: any) => (b.type === 'text' ? b.text : ''))
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
