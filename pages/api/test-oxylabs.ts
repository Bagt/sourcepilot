import type { NextApiRequest, NextApiResponse } from 'next'

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' })

  try {
    const response = await fetch('https://realtime.oxylabs.io/v1/queries', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Basic ' + Buffer.from(`${process.env.OXYLABS_USER}:${process.env.OXYLABS_PASS}`).toString('base64'),
      },
      body: JSON.stringify({
        source: 'universal',
        url: 'https://www.alibaba.com/trade/search?SearchText=peristaltic+pump+12v+food+grade&IndexArea=product_en',
        render: 'html',
      }),
    })

    const data = await response.json()
    const html = data?.results?.[0]?.content || ''
    
    // Extract key data points
    const prices = html.match(/US\$[\d,.]+[-–]?[\d,.]*|\$[\d,.]+/g) || []
    const minOrders = html.match(/[\d,]+\s*(Pieces?|Units?|Sets?)\s*\(Min/gi) || []
    const suppliers = html.match(/"companyName":"([^"]{5,60})"/g) || []
    const productLinks = html.match(/href="(\/product-detail\/[^"]{20,150})"/g) || []

    return res.status(200).json({
      htmlLength: html.length,
      prices: prices.slice(0, 10),
      minOrders: minOrders.slice(0, 5),
      suppliers: suppliers.slice(0, 8),
      productLinks: productLinks.slice(0, 5),
      htmlSample: html.slice(0, 500),
    })
  } catch (err: unknown) {
    return res.status(500).json({ error: String(err) })
  }
}
