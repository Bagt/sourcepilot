import { PartSpec } from './types'

export function buildSourcingPrompt(spec: PartSpec): string {
  return `You are a professional hardware sourcing agent. Use your web search tool to find REAL, CURRENT product listings for this component.

COMPONENT: ${spec.description}
QUANTITY: ${spec.quantity || 'not specified'} units
TARGET UNIT PRICE: ${spec.targetPrice ? '$' + spec.targetPrice : 'not specified'}
MAX LEAD TIME: ${spec.leadTime || 'flexible'}
CERTIFICATIONS REQUIRED: ${spec.certifications || 'none'}

INSTRUCTIONS:
1. Search Alibaba, Digi-Key, Mouser, and Global Sources for this exact component
2. Find 4 real product listings with actual URLs
3. For each result, get the direct product page URL
4. Extract real pricing, MOQ, and lead time from the listings

Use web search with queries like:
- site:alibaba.com ${spec.description}
- site:digikey.com ${spec.description}
- site:mouser.com ${spec.description}

After searching, respond ONLY with a valid JSON object. No markdown, no backticks, no explanation:

{
  "summary": "2-3 sentence strategic sourcing overview with clearest recommendation",
  "no_results": false,
  "suggestions": [],
  "suppliers": [
    {
      "name": "Exact supplier name from listing",
      "platform": "Alibaba / Digi-Key / Mouser / Global Sources / ThomasNet",
      "country": "Country",
      "unit_price": "Price from listing e.g. $6.50-8.00",
      "moq": "MOQ e.g. 100 units",
      "lead_time": "Lead time from listing",
      "certifications": "Certs from listing or Verify directly",
      "score": "A or B or C",
      "score_reason": "One sentence why this score",
      "notes": "2-3 sentences about this listing and fit",
      "search_tip": "Exact product model e.g. Kamoer KFS-B07",
      "product_url": "Direct product page URL from your search"
    }
  ]
}

product_url must be a real URL from web search. Score A = best fit, B = tradeoffs, C = worth knowing.`
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

Write email with: subject line, company intro, specs, quantity/pricing ask, cert requirements, sample request, response timeline.

Format as:
SUBJECT: [subject line]

[email body]

Under 200 words. Direct and professional.`
}
