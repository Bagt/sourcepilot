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
  // Strip model numbers and specs that confuse Alibaba search
  return firstLine
    .replace(/\b[A-Z]{2,}\d{4,}[A-Z]?\b/g, '') // strip model numbers like RDM1225B
    .replace(/\d+x\d+x\d+mm/gi, '')
    .replace(/\d+\.\d+[A-Z]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 50)
}

async function scrapeAlibaba(query: string): Promise<{
  suppliers: string[], productLinks: string[], prices: string[], minOrders: string[]
}> {
  const user = process.env.OXYLABS_USER || ''
  const pass = process.env.OXYLABS_PASS || ''

  const response = await fetch('https://realtime.oxylabs.io/v1/queries', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Basic ${Buffer.from(`${user}:${pass}`).toString('base64')}`,
    },
    body: JSON.stringify({ source: 'alibaba_search', query, render: 'html' }),
  })

  const data = await response.json()
  const html = (data?.results?.[0]?.content || '').slice(0, 80000)

  if (html.length < 1000) throw new Error('Blocked or empty')

  const prices = html.match(/US\$\s*[\d,.]+\s*[-–]\s*[\d,.]+|US\$\s*[\d,.]+/g) || []
  const minOrders = html.match(/[\d,]+\s*(?:Pieces?|Units?|Sets?)\s*\(Min/gi) || []
  const productLinks = Array.from(new Set(
    (html.match(/\/product-detail\/[^"&\s?]{10,150}/g) || [])
      .map((l: string) => `https://www.alibaba.com${l.split('?')[0]}`)
  )) as string[]
  const suppliers = Array.from(new Set(
    (html.match(/"companyName"\s*:\s*"([^"]{3,60})"/g) || [])
      .map((m: string) => m.replace(/"companyName"\s*:\s*"/, '').replace(/"$/, ''))
  )) as string[]

  return { suppliers, productLinks, prices, minOrders }
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })
  const spec: PartSpec = req.body
  if (!spec.description?.trim()) return res.status(400).json({ error: 'Component description is required' })

  const searchQuery = getSearchQuery(spec.description)

  try {
    let alibaba
    try {
      alibaba = await scrapeAlibaba(searchQuery)
      // If empty, try shorter query
      if (alibaba.suppliers.length === 0 && alibaba.productLinks.length === 0) {
        const shortQuery = searchQuery.split(' ').slice(0, 3).join(' ')
        alibaba = await scrapeAlibaba(shortQuery)
      }
    } catch {
      return res.status(200).json({
        summary: 'Alibaba is temporarily unavailable. Please try again in a few minutes.',
        no_results: true, suggestions: [], suppliers: []
      })
    }

    if (alibaba.suppliers.length === 0 && alibaba.productLinks.length === 0) {
      return res.status(200).json({
        summary: `No results found for "${searchQuery}". Try simpler keywords e.g. "DC cooling fan 120mm" instead of a model number.`,
        no_results: true,
        suggestions: [{ field: 'description', issue: 'No matches found', suggestion: 'Use generic product name without model numbers' }],
        suppliers: []
      })
    }

    const contextData = `Suppliers: ${alibaba.suppliers.slice(0, 4).join(' | ')}
Prices: ${alibaba.prices.slice(0, 4).join(' | ')}
MOQ: ${alibaba.minOrders.slice(0, 3).join(' | ')}
Product URLs:
${alibaba.productLinks.slice(0, 4).map((l, i) => `${i+1}. ${l}`).join('\n')}`

    const message = await client.messages.create({
      model: 'claude-sonnet-4-5',
      max_tokens: 800,
      system: 'You are a JSON API. Output only valid JSON, no markdown.',
      messages: [{
        role: 'user',
        content: `Return supplier JSON for "${searchQuery}".
Data: ${contextData}
Specs: qty=${spec.quantity||'any'} price=${spec.targetPrice?'$'+spec.targetPrice:'any'} certs=${spec.certifications||'none'}
{"summary":"one sentence","no_results":false,"suggestions":[],"suppliers":[{"name":"","platform":"Alibaba","country":"China","unit_price":"","moq":"","lead_time":"2-4 weeks","certifications":"CE/RoHS","score":"A","score_reason":"","notes":"","search_tip":"","product_url":""}]}`
      }],
    })

    const text = message.content.map((b: any) => b.type === 'text' ? b.text : '').join('')
    const jsonStr = extractJSON(text)
    if (!jsonStr) throw new Error('Please try again')

    const result: SearchResult = JSON.parse(jsonStr)
    return res.status(200).json(result)

  } catch (err: unknown) {
    console.error('Sourcing error:', err)
    return res.status(500).json({ error: err instanceof Error ? err.message : 'Search failed' })
  }
}
