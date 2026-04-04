import type { NextApiRequest, NextApiResponse } from 'next'
import Anthropic from '@anthropic-ai/sdk'
import { buildSourcingPrompt } from '../../lib/prompts'
import { PartSpec, SearchResult } from '../../lib/types'

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

  const spec: PartSpec = req.body

  if (!spec.description?.trim()) {
    return res.status(400).json({ error: 'Component description is required' })
  }

  try {
    const message = await client.messages.create({
      model: 'claude-opus-4-5',
      max_tokens: 1500,
      messages: [
        {
          role: 'user',
          content: buildSourcingPrompt(spec),
        },
      ],
    })

    const text = message.content
      .map((block) => (block.type === 'text' ? block.text : ''))
      .join('')

    const clean = text.replace(/```json|```/g, '').trim()
    const result: SearchResult = JSON.parse(clean)

    return res.status(200).json(result)
  } catch (err: unknown) {
    console.error('Sourcing API error:', err)
    const errorMessage = err instanceof Error ? err.message : 'Unknown error'
    return res.status(500).json({ error: 'Search failed: ' + errorMessage })
  }
}
