# SourcePilot

AI-powered hardware sourcing agent for DTC brands. Find suppliers on Alibaba, Digi-Key, Mouser, Global Sources, and ThomasNet — with AI ranking and one-click RFQ generation.

## Deploy to Vercel in 15 minutes

### 1. Clone and push to GitHub

```bash
# From this directory
git init
git add .
git commit -m "init: sourcepilot v0.1"

# Create a new repo on github.com, then:
git remote add origin https://github.com/YOUR_USERNAME/sourcepilot.git
git push -u origin main
```

### 2. Deploy on Vercel

1. Go to [vercel.com](https://vercel.com) → New Project
2. Import your GitHub repo
3. Framework: **Next.js** (auto-detected)
4. Add environment variables:

| Key | Value |
|-----|-------|
| `ANTHROPIC_API_KEY` | `sk-ant-...` (from console.anthropic.com) |
| `NEXT_PUBLIC_INVITE_CODE` | your invite code, e.g. `minibrew2024` |

5. Click **Deploy** — done.

### 3. Run locally

```bash
cp .env.example .env.local
# Edit .env.local with your keys

npm install
npm run dev
# Open http://localhost:3000
```

## Architecture

```
sourcepilot/
├── pages/
│   ├── index.tsx          # Main UI — gate, search form, results, history
│   └── api/
│       ├── source.ts      # POST /api/source — AI supplier search
│       └── rfq.ts         # POST /api/rfq — AI RFQ email generation
├── lib/
│   ├── types.ts           # TypeScript types
│   └── prompts.ts         # Sourcing + RFQ prompt builders
└── styles/
    └── globals.css        # Full design system
```

## How it works

- **Gate**: Invite-code access (stored in localStorage). Change `NEXT_PUBLIC_INVITE_CODE` to control access.
- **Sourcing**: User enters component specs → `/api/source` calls Claude with structured sourcing prompt → returns 4 ranked suppliers as JSON.
- **RFQ**: Click "Draft RFQ" on any supplier → `/api/rfq` generates a ready-to-send email.
- **History**: Last 10 searches cached in localStorage — click to reload any previous search.
- **Search links**: "Search [Platform] ↗" opens the supplier's platform with pre-filled search query.

## Week 2 upgrades

When you're ready to share with more people:

- **Supabase cache**: Store `(component_hash → supplier_results)` to skip re-querying identical parts
- **Stripe subscription**: Use [Stripe Checkout](https://stripe.com/docs/checkout/quickstart) — add a `/api/create-checkout-session` route, gate the search API behind subscription check
- **Email invite flow**: Replace invite code with magic link auth via [Resend](https://resend.com) + a simple users table in Supabase

## MiniBrew preset parts

Pre-loaded with 5 real MiniBrew components:
- Peristaltic pump 12V DC (food-grade, CE+RoHS)
- NTC temperature sensor 10k
- Solenoid valve ½" food-grade
- NEMA17 stepper motor
- ESP32-WROOM-32 module

## Cost estimate

At ~5 searches/day: ~$0.30/day in Claude API costs. For 10 users doing 5 searches each: ~$3/day.
