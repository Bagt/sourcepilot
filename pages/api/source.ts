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
      model: 'claude-sonnet-4-5',
      max_tokens: 1500,
      tools: [
        {
          type: 'web_search_20250305',
          name: 'web_search',
        } as any,
      ],
      messages: [
        {
          role: 'user',
          content: buildSourcingPrompt(spec),
        },
      ],
    })

    // Extract text from all content blocks including after tool use
    const text = message.content
      .map((block) => (block.type === 'text' ? block.text : ''))
      .join('')

    // Extract JSON — handle truncated or malformed responses
    const jsonMatch = text.match(/\{[\s\S]*/)
    if (!jsonMatch) throw new Error('No JSON found in response')
    
    let clean = jsonMatch[0]
    
    // If JSON is truncated, try to close it gracefully
    try {
      JSON.parse(clean)
    } catch {
      // Try to salvage truncated JSON by closing open structures
      const openBrackets = (clean.match(/\[/g) || []).length - (clean.match(/\]/g) || []).length
      const openBraces = (clean.match(/\{/g) || []).length - (clean.match(/\}/g) || []).length
      // Remove trailing incomplete entry
      clean = clean.replace(/,\s*\{[^}]*$/, '')
      // Close any open arrays and objects
      for (let i = 0; i < openBrackets; i++) clean += ']'
      for (let i = 0; i < openBraces; i++) clean += '}'
    }
    
    const result: SearchResult = JSON.parse(clean)

    return res.status(200).json(result)
  } catch (err: unknown) {
    console.error('Sourcing API error:', err)
    const errorMessage = err instanceof Error ? err.message : 'Unknown error'
    return res.status(500).json({ error: 'Search failed: ' + errorMessage })
  }
}
