import type { NextApiRequest, NextApiResponse } from 'next'

export const config = {
  api: { responseLimit: false },
  maxDuration: 60,
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' })

  try {
    const user = process.env.OXYLABS_USER || 'MISSING'
    const pass = process.env.OXYLABS_PASS || 'MISSING'

    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 55000)

    const response = await fetch('https://realtime.oxylabs.io/v1/queries', {
      method: 'POST',
      signal: controller.signal,
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Basic ${Buffer.from(`${user}:${pass}`).toString('base64')}`,
      },
      body: JSON.stringify({
        source: 'alibaba_search',
        query: 'Stainless beer tap ball lock connector 7/16 20UNF thread',
      }),
    })

    clearTimeout(timeout)
    const data = await response.json()
    const html = data?.results?.[0]?.content || ''

    // Extract product data from raw HTML
    const prices = html.match(/US\$\s*[\d,.]+\s*[-–]\s*[\d,.]+|US\$\s*[\d,.]+/g) || []
    const minOrders = html.match(/[\d,]+\s*(?:Pieces?|Units?|Sets?)\s*\(Min/gi) || []
    const productLinks = Array.from(new Set(html.match(/\/product-detail\/[^"&\s]{10,150}/g) || []))
    const supplierNames = Array.from(new Set((html.match(/"companyName"\s*:\s*"([^"]{3,60})"/g) || []).map((m: string) => m.replace(/"companyName"\s*:\s*"/, '').replace(/"$/, ''))))
    const subjects = Array.from(new Set((html.match(/"subject"\s*:\s*"([^"]{10,120})"/g) || []).map((m: string) => m.replace(/"subject"\s*:\s*"/, '').replace(/"$/, ''))))

    return res.status(200).json({
      jobStatus: data?.job?.status,
      httpStatus: response.status,
      htmlLength: html.length,
      prices: prices.slice(0, 8),
      minOrders: minOrders.slice(0, 5),
      productLinks: productLinks.slice(0, 6),
      supplierNames: supplierNames.slice(0, 8),
      subjects: subjects.slice(0, 5),
      htmlSample: html.slice(2000, 4000),
    })
  } catch (err: unknown) {
    return res.status(500).json({ error: String(err) })
  }
}
