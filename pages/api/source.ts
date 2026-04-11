import type { NextApiRequest, NextApiResponse } from 'next'
import Anthropic from '@anthropic-ai/sdk'
import { PartSpec, SearchResult } from '../../lib/types'

export const config = { maxDuration: 60 }

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

function extractJSON(text: string): string | null {
  const clean = text.replace(/```json\s*/gi, '').replace(/```\s*/g, '').trim()
  let depth = 0, start = clean.indexOf('{'), end = -1
  if (start === -1) return null
  for (let i = start; i < clean.length; i++) {
    if (clean[i] === '{') depth++
    else if (clean[i] === '}') { depth--; if (depth === 0) { end = i; break } }
  }
  return end === -1 ? null : clean.slice(start, end + 1)
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
    // Step 1: Search for real suppliers
    const searchMessage = await client.messages.create({
      model: 'claude-sonnet-4-5',
      max_tokens: 1000,
      tools: [{ type: 'web_search_20250305', name: 'web_search' } as any],
      messages: [{
        role: 'user',
        content: `Search alibaba.com for "${searchQuery}" suppliers. Find 4 real suppliers with company names, product page URLs on alibaba.com, price ranges, and MOQ. Report exactly what you find.`
      }],
    })

    const rawData = searchMessage.content
      .map((b: any) => (b.type === 'text' ? b.text : ''))
      .join('')

    // Step 2: Structure into JSON
    const structureMessage = await client.messages.create({
      model: 'claude-sonnet-4-5',
      max_tokens: 1000,
      system: 'You are a JSON API. Output only valid JSON, no markdown, no explanation.',
      messages: [{
        role: 'user',
        content: `Structure this supplier data for "${searchQuery}" into JSON.

DATA:
${rawData.slice(0, 1200)}

Specs: qty=${spec.quantity || 'any'}, price=${spec.targetPrice ? '$'+spec.targetPrice : 'any'}, certs=${spec.certifications || 'none'}

{"summary":"one sentence","no_results":false,"suggestions":[],"suppliers":[{"name":"","platform":"Alibaba","country":"China","unit_price":"","moq":"","lead_time":"2-4 weeks","certifications":"CE/RoHS","score":"A","score_reason":"","notes":"","search_tip":"","product_url":""}]}`
      }],
    })

    const text = structureMessage.content.map((b: any) => b.type === 'text' ? b.text : '').join('')
    const jsonStr = extractJSON(text)
    if (!jsonStr) throw new Error('Could not parse results — please try again')

    const result: SearchResult = JSON.parse(jsonStr)
    return res.status(200).json(result)

  } catch (err: unknown) {
    console.error('Sourcing error:', err)
    return res.status(500).json({ error: err instanceof Error ? err.message : 'Search failed' })
  }
}
