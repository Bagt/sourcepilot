import type { NextApiRequest, NextApiResponse } from 'next'
import Anthropic from '@anthropic-ai/sdk'
import { buildRFQPrompt } from '../../lib/prompts'
import { PartSpec } from '../../lib/types'

const client = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
})

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const { supplierName, platform, spec }: {
    supplierName: string
    platform: string
    spec: PartSpec
  } = req.body

  try {
    const message = await client.messages.create({
      model: 'claude-opus-4-5',
      max_tokens: 600,
      messages: [
        {
          role: 'user',
          content: buildRFQPrompt(supplierName, platform, spec),
        },
      ],
    })

    const text = message.content
      .map((block) => (block.type === 'text' ? block.text : ''))
      .join('')

    return res.status(200).json({ rfq: text })
  } catch (err: unknown) {
    console.error('RFQ API error:', err)
    const errorMessage = err instanceof Error ? err.message : 'Unknown error'
    return res.status(500).json({ error: 'RFQ generation failed: ' + errorMessage })
  }
}
