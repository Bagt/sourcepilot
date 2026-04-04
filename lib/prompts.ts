import { PartSpec } from './types'

export function buildSourcingPrompt(spec: PartSpec): string {
  return `You are a professional hardware sourcing agent with deep knowledge of global electronics and hardware supply chains. A hardware DTC brand needs to source the following component:

COMPONENT: ${spec.description}
QUANTITY: ${spec.quantity || 'not specified'} units
TARGET UNIT PRICE: ${spec.targetPrice ? '$' + spec.targetPrice : 'not specified'}
MAX LEAD TIME: ${spec.leadTime || 'flexible'}
CERTIFICATIONS REQUIRED: ${spec.certifications || 'none'}

Identify 4 specific, real suppliers for this component. Draw on your knowledge of:
- Alibaba / Made-in-China / Global Sources (Chinese manufacturers)
- Digi-Key / Mouser / Arrow (distribution)
- ThomasNet (North American manufacturers)
- Direct OEM manufacturers where known

For each supplier, provide realistic current market data. Be specific — name actual known suppliers or platforms, realistic price ranges, and genuine sourcing intelligence.

If you cannot find 4 real suppliers that match the specs, return fewer suppliers (minimum 1) and add a "suggestions" array explaining which spec is the bottleneck and how to adjust it. For example if the certification is too strict, or the target price is unrealistic, or the MOQ is too low for the category.

For each supplier you identify, you MUST provide:
1. The exact Alibaba subdomain storefront URL in format: https://[company-handle].en.alibaba.com — e.g. https://kamoer.en.alibaba.com or https://ningbobrace.en.alibaba.com
2. The exact product model number or series name — e.g. "KFS-B07" or "304 Ball Lock Beer Tap" — something you can paste directly into their storefront search bar to find the exact product
3. If you do not know the exact Alibaba subdomain, leave storefront_url as empty string

Respond ONLY with a valid JSON object. No markdown, no backticks, no explanation. Just the JSON:

{
  "summary": "2-3 sentence strategic sourcing overview with the single clearest recommendation",
  "no_results": false,
  "suggestions": [],
  "suppliers": [
    {
      "name": "Specific supplier or platform name",
      "platform": "Alibaba / Digi-Key / Mouser / Global Sources / ThomasNet / Direct OEM",
      "country": "Country of origin",
      "unit_price": "Realistic price range e.g. $6.50–8.00",
      "moq": "Minimum order quantity e.g. 100 units",
      "lead_time": "e.g. 4–6 weeks",
      "certifications": "Which of the required certs they typically meet, or 'Verify directly'",
      "score": "A or B or C",
      "score_reason": "One sentence explaining the score relative to the requirements",
      "notes": "2–3 sentences: product fit, key reliability signals, what to verify, known risks or advantages",
      "search_tip": "Exact model number or product series to search — e.g. 'Kamoer KFS' or 'NKP-DC-B02' — NOT a description. This gets pasted directly into the platform search bar.",
      "storefront_url": "Direct Alibaba storefront or product URL if known, e.g. https://kamoer.en.alibaba.com — leave empty string if unknown"
    }
  ],
  "suggestions": [
    {
      "field": "which spec is the problem e.g. certifications / target_price / quantity / lead_time",
      "issue": "one sentence explaining why this spec is limiting results",
      "suggestion": "concrete alternative e.g. 'Remove FDA requirement — CE+RoHS covers EU market' or 'Raise budget to $12-15 for this component category'"
    }
  ]
}

Score A = best overall fit for stated requirements. Score B = solid option with notable tradeoffs. Score C = worth knowing, significant tradeoffs. Rank suppliers from best to worst fit. First supplier is always the top recommendation.`
}

export function buildRFQPrompt(
  supplierName: string,
  platform: string,
  spec: PartSpec
): string {
  return `Write a professional, concise RFQ (Request for Quotation) email to a supplier. This is for a hardware DTC brand sourcing real components.

Supplier: ${supplierName} (${platform})
Component: ${spec.description}
Quantity: ${spec.quantity || 'TBD'} units
Target price: ${spec.targetPrice ? '$' + spec.targetPrice + ' per unit' : 'competitive pricing'}
Required certifications: ${spec.certifications || 'none specified'}
Lead time needed: ${spec.leadTime || 'flexible'}

Write a professional email with:
- Short subject line
- Brief company intro (hardware DTC brand, EU/US market)
- Clear component specifications
- Quantity and pricing ask
- Certification requirements
- Request for samples before bulk order
- Response timeline ask

Format as:
SUBJECT: [subject line]

[email body]

Keep it under 200 words. Direct and professional. No fluff.`
}
