import { PartSpec } from './types'

export function buildSourcingPrompt(spec: PartSpec): string {
  return `You are a professional hardware sourcing agent. Use your web search tool to find REAL, CURRENT product listings for this component across multiple platforms.

COMPONENT: ${spec.description}
QUANTITY: ${spec.quantity || 'not specified'} units
TARGET UNIT PRICE: ${spec.targetPrice ? '$' + spec.targetPrice : 'not specified'}
MAX LEAD TIME: ${spec.leadTime || 'flexible'}
CERTIFICATIONS REQUIRED: ${spec.certifications || 'none'}

INSTRUCTIONS:
1. Search ALL of these platforms for this component:
   - Alibaba (Chinese manufacturers, best for high volume)
   - Digi-Key (global distributor, certified parts, US/EU)
   - Mouser (global distributor, certified parts, US/EU)
   - Farnell / Element14 (EU-focused distributor, strong CE/RoHS stock)
   - RS Components (EU/Asia distributor, strong in HK and mainland China)

2. Find the best match on each platform — real listings with actual URLs
3. product_url MUST be a direct link on one of these domains:
   - alibaba.com, digikey.com, mouser.com, farnell.com, element14.com, rs-online.com, rsdelivers.com, hken.rs-online.com
4. Extract real pricing, MOQ, stock availability, and lead time from listings
5. Prioritize in-stock items where possible

Search queries to run:
- site:alibaba.com "${spec.description}"
- site:digikey.com "${spec.description}"
- site:mouser.com "${spec.description}"
- site:farnell.com "${spec.description}"
- site:rs-online.com "${spec.description}"

After searching, respond ONLY with valid JSON, no text before or after:

{
  "summary": "2-3 sentence sourcing overview. Mention which platforms had stock and the clearest recommendation for EU/HK buyers.",
  "no_results": false,
  "suggestions": [],
  "suppliers": [
    {
      "name": "Exact supplier/manufacturer name from listing",
      "platform": "Alibaba / Digi-Key / Mouser / Farnell / RS Components",
      "country": "Country of origin or warehouse",
      "unit_price": "Price from listing e.g. $6.50-8.00",
      "moq": "MOQ e.g. 1 unit or 100 units",
      "lead_time": "In stock / 1-2 days / 4-6 weeks etc",
      "certifications": "CE / RoHS / UL / FDA from listing or Verify directly",
      "score": "A or B or C",
      "score_reason": "One sentence why this score for these requirements",
      "notes": "2-3 sentences: stock status, product fit, key specs match, what to verify",
      "search_tip": "Exact part number or model e.g. KFS-B07 or 2N7002",
      "product_url": "Direct product URL on alibaba.com, digikey.com, mouser.com, farnell.com, rs-online.com, or element14.com only"
    }
  ],
  "suggestions": [
    {
      "field": "certifications / target_price / quantity / lead_time",
      "issue": "Why this spec limits results",
      "suggestion": "Concrete alternative"
    }
  ]
}

Score A = best fit. Score B = good with tradeoffs. Score C = worth knowing. Return suggestions only if you could not find good matches.`
}

export function buildRFQPrompt(
  supplierName: string,
  platform: string,
  spec: PartSpec
): string {
  return `Write a professional RFQ email to a supplier for a hardware DTC brand.

Supplier: ${supplierName} (${platform})
Component: ${spec.description}
Quantity: ${spec.quantity || 'TBD'} units
Target price: ${spec.targetPrice ? '$' + spec.targetPrice + ' per unit' : 'competitive pricing'}
Required certifications: ${spec.certifications || 'none specified'}
Lead time needed: ${spec.leadTime || 'flexible'}

Write email with: subject line, company intro (hardware DTC brand, EU/HK market), specs, quantity/pricing ask, cert requirements, sample request, response timeline.

Format as:
SUBJECT: [subject line]

[email body]

Under 200 words. Direct and professional.`
}
