import { PartSpec } from './types'

export function buildSourcingPrompt(spec: PartSpec): string {
  return `You are a hardware sourcing agent. Search for this component and return 4 suppliers.

COMPONENT: ${spec.description}
QUANTITY: ${spec.quantity || 'not specified'} units
TARGET PRICE: ${spec.targetPrice ? '$' + spec.targetPrice : 'not specified'}
LEAD TIME: ${spec.leadTime || 'flexible'}
CERTIFICATIONS: ${spec.certifications || 'none'}

Search these platforms: Alibaba, Digi-Key, Mouser, Farnell, RS Components.

Return ONLY this JSON, no other text:

{"summary":"2 sentence recommendation","no_results":false,"suggestions":[],"suppliers":[{"name":"supplier name","platform":"Alibaba/Digi-Key/Mouser/Farnell/RS Components","country":"country","unit_price":"$X-Y","moq":"X units","lead_time":"X weeks","certifications":"CE/RoHS/etc","score":"A/B/C","score_reason":"one sentence","notes":"2 sentences max","search_tip":"exact model number","product_url":"direct marketplace URL"}]}`
}

export function buildRFQPrompt(
  supplierName: string,
  platform: string,
  spec: PartSpec
): string {
  return `Write a professional RFQ email.

Supplier: ${supplierName} (${platform})
Component: ${spec.description}
Quantity: ${spec.quantity || 'TBD'} units
Target price: ${spec.targetPrice ? '$' + spec.targetPrice + '/unit' : 'competitive'}
Certifications: ${spec.certifications || 'none'}
Lead time: ${spec.leadTime || 'flexible'}

Format:
SUBJECT: [subject]

[body - max 150 words, professional, mention EU/HK market, request samples]`
}
