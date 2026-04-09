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
        query: 'peristaltic pump 12v food grade',
        parse: true,
      }),
    })

    clearTimeout(timeout)
    const rawText = await response.text()

    let data: any = {}
    try { data = JSON.parse(rawText) } catch {
      return res.status(200).json({
        httpStatus: response.status,
        rawSample: rawText.slice(0, 500),
        parseError: true,
        debug: { userLength: user.length, passLength: pass.length }
      })
    }

    // With parse:true, Oxylabs returns structured data
    const parsed = data?.results?.[0]?.content
    const html = typeof parsed === 'string' ? parsed : JSON.stringify(parsed || '')

    // Extract product data
    const prices = html.match(/US\$[\d,.]+[-–]?[\d,.]*/g) || []
    const minOrders = html.match(/[\d,]+\s*(Pieces?|Units?|Sets?)\s*\(Min/gi) || []
    const productLinks = html.match(/\/product-detail\/[^"?\s]{10,120}/g) || []
    const companyNames = html.match(/"companyName"\s*:\s*"([^"]{5,60})"/g) || []
    const productTitles = html.match(/"subject"\s*:\s*"([^"]{10,100})"/g) || []

    return res.status(200).json({
      jobStatus: data?.job?.status,
      httpStatus: response.status,
      htmlLength: html.length,
      isParsed: typeof parsed !== 'string',
      parsedKeys: typeof parsed === 'object' && parsed ? Object.keys(parsed).slice(0, 10) : [],
      prices: prices.slice(0, 8),
      minOrders: minOrders.slice(0, 5),
      productLinks: productLinks.slice(0, 5),
      companyNames: companyNames.slice(0, 6),
      productTitles: productTitles.slice(0, 5),
      htmlSample: html.slice(0, 1000),
    })
  } catch (err: unknown) {
    return res.status(500).json({ error: String(err) })
  }
}
