import { PartSpec } from './types'

export function buildSourcingPrompt(spec: PartSpec): string {
  return `You are a hardware sourcing agent. Search for this component and return real product listings.

COMPONENT: ${spec.description}
QUANTITY: ${spec.quantity || 'not specified'} units
TARGET PRICE: ${spec.targetPrice ? '$' + spec.targetPrice : 'not specified'}
LEAD TIME: ${spec.leadTime || 'flexible'}
CERTIFICATIONS: ${spec.certifications || 'none'}

CRITICAL RULES:
1. Search Mouser, Digi-Key, Farnell, RS Components first — these have real product URLs you can find
2. For Alibaba — only include if you find a real product listing URL. NEVER invent Alibaba URLs or search tips
3. product_url must be a REAL URL you found via web search — if you cannot find a real URL, leave it as empty string ""
4. search_tip must be the exact MPN only — e.g. "CR2032" or "KFS-B07" — NEVER write instructions like "request quote" or "search for"
5. If a distributor has no real listing for this part, skip it — don't invent results

Search these sites:
- site:mouser.com "${spec.description}"
- site:digikey.com "${spec.description}"  
- site:farnell.com "${spec.description}"
- site:uk.rs-online.com "${spec.description}"

Return ONLY valid JSON, nothing else:
{"summary":"2 sentences naming specific distributors with real stock and prices found","no_results":false,"suggestions":[],"suppliers":[{"name":"exact distributor name","platform":"Mouser / Digi-Key / Farnell / RS Components / Alibaba","country":"country","unit_price":"real price","moq":"real MOQ","lead_time":"In stock / X days / X weeks","certifications":"from listing","score":"A/B/C","score_reason":"one sentence","notes":"2 sentences from real listing","search_tip":"EXACT MPN ONLY e.g. CR2032","product_url":"real URL or empty string if not found"}]}`
}

export function buildRFQPrompt(
  supplierName: string,
  platform: string,
  spec: PartSpec
): string {
  return `Write a professional RFQ email for a hardware DTC brand (EU/HK market).

Supplier: ${supplierName} (${platform})
Component: ${spec.description}
Quantity: ${spec.quantity || 'TBD'} units
Target price: ${spec.targetPrice ? '$' + spec.targetPrice + '/unit' : 'competitive'}
Certifications: ${spec.certifications || 'none'}
Lead time: ${spec.leadTime || 'flexible'}

Format:
SUBJECT: [subject]

[body - max 150 words, professional, request samples and lead time confirmation]`
}
