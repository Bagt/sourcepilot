export interface PartSpec {
  description: string
  quantity: string
  targetPrice: string
  leadTime: string
  certifications: string
}

export interface Supplier {
  name: string
  platform: string
  country: string
  unit_price: string
  moq: string
  lead_time: string
  certifications: string
  score: 'A' | 'B' | 'C'
  score_reason: string
  notes: string
  search_tip: string
  storefront_url?: string
  product_url?: string
}

export interface Suggestion {
  field: string
  issue: string
  suggestion: string
}

export interface SearchResult {
  summary: string
  no_results?: boolean
  suggestions?: Suggestion[]
  suppliers: Supplier[]
}

export interface HistoryEntry {
  id: string
  timestamp: number
  spec: PartSpec
  result: SearchResult
}
