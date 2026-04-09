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

async function scrapeAlibaba(query: string): Promise<string> {
  const searchUrl = `https://www.alibaba.com/trade/search?SearchText=${encodeURIComponent(query)}&IndexArea=product_en`
  
  const response = await fetch('https://realtime.oxylabs.io/v1/queries', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': 'Basic ' + Buffer.from(`${process.env.OXYLABS_USER}:${process.env.OXYLABS_PASS}`).toString('base64'),
    },
    body: JSON.stringify({
      source: 'universal',
      url: searchUrl,
    }),
  })

  const data = await response.json()
  // Truncate HTML to first 8000 chars to avoid token limits
  const html = (data?.results?.[0]?.content || '').slice(0, 8000)
  
  const priceMatches = html.match(/US\$[\d,.]+[-–]?[\d,.]*|[\d,.]+\s*\/\s*(piece|unit|set)/gi) || []
  const minOrderMatches = html.match(/[\d,]+\s*(pieces?|units?|sets?)\s*\(Min/gi) || []
  // Extract supplier names from common Alibaba HTML patterns
  const supplierMatches = html.match(/company-name[^>]*>([^<]{5,60})</g)?.map((m: string) => m.replace(/company-name[^>]*>/, '').replace(/<.*/, '')) || []

  return `Alibaba results for "${query}":
Search URL: ${searchUrl}
Prices: ${priceMatches.slice(0, 6).join(' | ') || 'not extracted'}
Min orders: ${minOrderMatches.slice(0, 4).join(' | ') || 'not extracted'}
Suppliers: ${supplierMatches.slice(0, 4).join(' | ') || 'not extracted'}`
}

async function scrapeTaobao(query: string): Promise<string> {
  const searchUrl = `https://s.taobao.com/search?q=${encodeURIComponent(query)}`
  
  const response = await fetch('https://realtime.oxylabs.io/v1/queries', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': 'Basic ' + Buffer.from(`${process.env.OXYLABS_USER}:${process.env.OXYLABS_PASS}`).toString('base64'),
    },
    body: JSON.stringify({
      source: 'universal',
      url: searchUrl,
      render: 'html',
    }),
  })

  const data = await response.json()
  const html = data?.results?.[0]?.content || ''
  
  const priceMatches = html.match(/¥[\d,.]+|[\d,.]+元/g) || []
  
  return `Taobao search URL: ${searchUrl}
Prices found: ${priceMatches.slice(0, 5).join(' | ') || 'Login required to see prices'}`
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })
  const spec: PartSpec = req.body
  if (!spec.description?.trim()) return res.status(400).json({ error: 'Component description is required' })

  const searchQuery = getSearchQuery(spec.description)

  try {
    // Run scraping + web search in parallel
    const [alibabaData, webSearchMessage] = await Promise.allSettled([
      scrapeAlibaba(searchQuery),
      client.messages.create({
        model: 'claude-sonnet-4-5',
        max_tokens: 600,
        tools: [{ type: 'web_search_20250305', name: 'web_search' } as any],
        messages: [{
          role: 'user',
          content: `Search "${searchQuery}" site:digikey.com and "${searchQuery}" site:mouser.com. Return product URL, price, stock for each. Be brief.`
        }],
      })
    ])

    const alibabaContext = alibabaData.status === 'fulfilled' 
      ? alibabaData.value 
      : 'Alibaba scraping unavailable'

    const webContext = webSearchMessage.status === 'fulfilled'
      ? webSearchMessage.value.content.map((b: any) => b.type === 'text' ? b.text : '').join('')
      : 'Web search unavailable'

    // Structure all results
    const structureMessage = await client.messages.create({
      model: 'claude-sonnet-4-5',
      max_tokens: 1500,
      messages: [{
        role: 'user',
        content: `You have live data for "${searchQuery}". Structure the best 4 supplier results.

ALIBABA LIVE DATA:
${alibabaContext}

DISTRIBUTOR DATA (Digi-Key/Mouser):
${webContext}

Rules:
- Use the Alibaba search URL for Alibaba suppliers: https://www.alibaba.com/trade/search?SearchText=${encodeURIComponent(searchQuery)}&IndexArea=product_en
- Each supplier must be different
- Use real prices from the data above
- For Alibaba suppliers: use realistic MOQ (100-1000 units) and price ranges from the data

Context: Quantity: ${spec.quantity || 'not specified'} | Target: ${spec.targetPrice ? '$' + spec.targetPrice : 'any'} | Certs: ${spec.certifications || 'none'}

Return ONLY valid JSON:
{"summary":"2 sentences with real data found across Alibaba and distributors","no_results":false,"suggestions":[],"suppliers":[{"name":"supplier or distributor name","platform":"Alibaba / Digi-Key / Mouser / Farnell / RS Components","country":"China / USA / UK","unit_price":"price from data","moq":"MOQ","lead_time":"2-4 weeks / In stock","certifications":"CE/RoHS/etc","score":"A/B/C","score_reason":"one sentence","notes":"2 sentences from real data","search_tip":"exact search term","product_url":"exact URL"}]}`
      }],
    })

    const text = structureMessage.content.map((b: any) => b.type === 'text' ? b.text : '').join('')
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
