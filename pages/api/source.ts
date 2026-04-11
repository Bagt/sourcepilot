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
  return firstLine.length > 80 ? firstLine.slice(0, 80) : firstLine
}

async function scrapeAlibaba(query: string): Promise<{
  suppliers: string[]
  productLinks: string[]
  prices: string[]
  minOrders: string[]
}> {
  const user = process.env.OXYLABS_USER || ''
  const pass = process.env.OXYLABS_PASS || ''

  const response = await fetch('https://realtime.oxylabs.io/v1/queries', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Basic ${Buffer.from(`${user}:${pass}`).toString('base64')}`,
    },
    body: JSON.stringify({
      source: 'alibaba_search',
      query: query,
      render: 'html',
    }),
  })

  const data = await response.json()
  const html = data?.results?.[0]?.content || ''

  if (html.length < 1000) throw new Error('Alibaba returned no content')

  // Only look at first 50KB — product data is near the top
  const htmlSlice = html.slice(0, 50000)

  const prices = htmlSlice.match(/US\$\s*[\d,.]+\s*[-–]\s*[\d,.]+|US\$\s*[\d,.]+/g) || []
  const minOrders = htmlSlice.match(/[\d,]+\s*(?:Pieces?|Units?|Sets?)\s*\(Min/gi) || []
  const productLinks = Array.from(new Set(
    (htmlSlice.match(/\/product-detail\/[^"&\s?]{10,150}/g) || [])
      .map((l: string) => `https://www.alibaba.com${l.split('?')[0]}`)
  ))
  const suppliers = Array.from(new Set(
    (htmlSlice.match(/"companyName"\s*:\s*"([^"]{3,60})"/g) || [])
      .map((m: string) => m.replace(/"companyName"\s*:\s*"/, '').replace(/"$/, ''))
  ))

  return {
    suppliers: suppliers.slice(0, 8) as string[],
    productLinks: productLinks.slice(0, 8) as string[],
    prices: prices.slice(0, 8) as string[],
    minOrders: minOrders.slice(0, 5) as string[],
  }
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })
  const spec: PartSpec = req.body
  if (!spec.description?.trim()) return res.status(400).json({ error: 'Component description is required' })

  const searchQuery = getSearchQuery(spec.description)

  try {
    let contextData = ''

    // Search Alibaba only — distributor search causes rate limit issues
    let alibabaContext = 'Alibaba: unavailable'
    try {
      const alibaba = await scrapeAlibaba(searchQuery)
      alibabaContext = `Suppliers: ${alibaba.suppliers.slice(0, 3).join(' | ')} | Prices: ${alibaba.prices.slice(0, 3).join(' | ')} | URLs: ${alibaba.productLinks.slice(0, 3).join(' ')}`
    } catch {}

    contextData = alibabaContext

    // Structure results with AI
    const structureMessage = await client.messages.create({
      model: 'claude-sonnet-4-5',
      max_tokens: 1000,
      system: 'You are a JSON API. You ONLY output valid JSON. Never use markdown. Never use code blocks. Never add explanations. Your entire response must be a single JSON object starting with { and ending with }.',
      messages: [{
        role: 'user',
        content: `Return supplier data for "${searchQuery}" as JSON.

DATA:
${contextData.slice(0, 800)}

Specs: qty=${spec.quantity || 'any'}, target=${spec.targetPrice ? '$'+spec.targetPrice : 'any'}, certs=${spec.certifications || 'none'}

{"summary":"one sentence summary","no_results":false,"suggestions":[],"suppliers":[{"name":"supplier name","platform":"Alibaba","country":"China","unit_price":"$X-Y","moq":"X units","lead_time":"2-4 weeks","certifications":"CE/RoHS","score":"A","score_reason":"one sentence","notes":"two sentences","search_tip":"product name","product_url":"exact url from data"}]}`
      }],
    })

    const rawText = structureMessage.content.map((b: any) => b.type === 'text' ? b.text : '').join('')
    console.log('AI raw response length:', rawText.length, 'sample:', rawText.slice(0, 200))
    // Strip all possible markdown wrappers
    const text = rawText
      .replace(/```json\s*/gi, '')
      .replace(/```\s*/g, '')
      .replace(/^\s*json\s*/i, '')
      .trim()
    if (!text?.trim()) throw new Error('Empty response')
    const jsonStr = extractJSON(text)
    if (!jsonStr) {
      // Last resort: try to find JSON anywhere in the response
      const anyJson = rawText.match(/\{[\s\S]{50,}\}/)
      if (anyJson) {
        try {
          const result: SearchResult = JSON.parse(anyJson[0])
          return res.status(200).json(result)
        } catch {}
      }
      return res.status(500).json({ 
        error: 'Our AI agent had trouble processing the results. Please try a shorter, simpler description — e.g. "peristaltic pump 12V food grade".',
        rawResponse: rawText.slice(0, 800)
      })
    }

    const result: SearchResult = JSON.parse(jsonStr)
    return res.status(200).json(result)

  } catch (err: unknown) {
    console.error('Sourcing API error:', err)
    return res.status(500).json({ error: 'Search failed: ' + (err instanceof Error ? err.message : 'Unknown error') })
  }
}
