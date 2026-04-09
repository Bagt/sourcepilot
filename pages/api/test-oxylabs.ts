import type { NextApiRequest, NextApiResponse } from 'next'

export const config = {
  api: { responseLimit: false },
  maxDuration: 60,
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' })

  try {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 55000)

    const response = await fetch('https://realtime.oxylabs.io/v1/queries', {
      method: 'POST',
      signal: controller.signal,
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Basic ' + Buffer.from(`${process.env.OXYLABS_USER}:${process.env.OXYLABS_PASS}`).toString('base64'),
      },
      body: JSON.stringify({
        source: 'universal',
        url: 'https://www.alibaba.com/trade/search?SearchText=peristaltic+pump+12v',
      }),
    })

    clearTimeout(timeout)
    const rawText = await response.text()

    let data: any = {}
    try { data = JSON.parse(rawText) } catch {
      return res.status(200).json({
        httpStatus: response.status,
        rawSample: rawText.slice(0, 1000),
        parseError: true
      })
    }

    const html = data?.results?.[0]?.content || ''
    const prices = html.match(/US\$[\d,.]+[-–]?[\d,.]*/g) || []
    const minOrders = html.match(/[\d,]+\s*(Pieces?|Units?)\s*\(Min/gi) || []
    const productLinks = html.match(/\/product-detail\/[^"?\s]{10,120}/g) || []

    return res.status(200).json({
      jobStatus: data?.job?.status,
      httpStatus: response.status,
      htmlLength: html.length,
      prices: prices.slice(0, 8),
      minOrders: minOrders.slice(0, 5),
      productLinks: productLinks.slice(0, 5),
      htmlSample: html.slice(0, 1000),
    })
  } catch (err: unknown) {
    return res.status(500).json({ error: String(err) })
  }
}
