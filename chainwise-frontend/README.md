# ⚡ ChainWise — Crypto Routing Agent

> An AI-powered agent that finds the cheapest cross-chain withdrawal routes, bridges tokens via LI.FI, recovers stuck assets, scans exchange giveaways, and navigates P2P markets globally — especially across Africa.

Built for the **Dev3Pack Hackathon** | Tracks: Best AI Agent · LI.FI Cross-chain · ElevenLabs · Solana

---

## 🏗️ Architecture

```
chainwise/
├── backend/                  Node.js + Express API
│   └── src/
│       ├── agent/            Claude tool definitions + agentic loop
│       ├── controllers/      Route handlers (separated from routes)
│       ├── middlewares/      CORS, rate limiting, auth, validation, error handling
│       ├── models/           Mongoose schemas (ExchangeFee, Giveaway)
│       ├── routes/           Express routers
│       ├── services/         CoinGecko, LI.FI, Twitter/X wrappers
│       └── utils/            Logger (Winston), response envelope
└── frontend/                 Next.js 14 App Router
    ├── app/                  Pages (chat, fees)
    ├── components/           Chat UI, fee tables, sidebar
    ├── hooks/                useChat
    └── lib/                  API client, TypeScript types
```

### Data flow

```
User Message
    ↓
Next.js frontend  →  POST /api/agent
    ↓
Express controller  →  Claude claude-opus-4-5 (tool use)
    ↓
Agentic loop (up to 5 iterations):
    ├── get_withdrawal_fees      →  MongoDB (fee database)
    ├── find_cheapest_withdrawal →  MongoDB
    ├── get_bridge_route         →  LI.FI API (live)
    ├── get_coin_chains          →  CoinGecko API (cached 5min)
    ├── get_coin_exchanges       →  CoinGecko API
    ├── check_p2p_availability   →  MongoDB
    ├── plan_zero_gas_recovery   →  MongoDB + LI.FI
    ├── compare_exchanges        →  MongoDB
    └── scan_giveaways           →  Twitter/X API v2
    ↓
Structured JSON response  →  Frontend renders markdown
```

---

## 🚀 Quick Start

### Prerequisites

- Node.js 18+
- MongoDB Atlas account (free tier works)
- Anthropic API key

### Backend

```bash
cd backend
npm install
cp .env.example .env
# → Fill in MONGODB_URI and ANTHROPIC_API_KEY

# Seed the database with real exchange fee data
node scripts/seedFees.js

# Start dev server
npm run dev
# ⚡ ChainWise API → http://localhost:5000
```

### Frontend

```bash
cd frontend
npm install
cp .env.local.example .env.local
# → Set NEXT_PUBLIC_API_URL=http://localhost:5000

npm run dev
# → http://localhost:3000
```

---

## 🔑 Environment Variables

### Backend `.env`

| Variable | Required | Description |
|---|---|---|
| `PORT` | No | Server port (default: 5000) |
| `NODE_ENV` | No | `development` or `production` |
| `MONGODB_URI` | **Yes** | MongoDB Atlas connection string |
| `ANTHROPIC_API_KEY` | **Yes** | Claude API key |
| `COINGECKO_API_KEY` | No | Free tier works without key (30 req/min) |
| `TWITTER_BEARER_TOKEN` | No | For live giveaway scanning |
| `FRONTEND_URL` | No | CORS origin (default: localhost:3000) |
| `SUPABASE_URL` | No | For auth (future) |
| `SUPABASE_ANON_KEY` | No | For auth (future) |

### Frontend `.env.local`

| Variable | Required | Description |
|---|---|---|
| `NEXT_PUBLIC_API_URL` | **Yes** | Backend base URL |

---

## 📡 API Reference

### Agent

```
POST /api/agent
Content-Type: application/json

{
  "messages": [
    { "role": "user", "content": "Cheapest chain to withdraw USDT from Bybit?" }
  ]
}

Response:
{
  "success": true,
  "data": {
    "message": "...(Claude's response)...",
    "toolsUsed": [{ "tool": "find_cheapest_withdrawal", "input": {...}, "result": {...} }],
    "usage": { "inputTokens": 1200, "outputTokens": 380 }
  },
  "timestamp": "2025-05-01T10:00:00.000Z"
}
```

### Fees

```
GET  /api/fees                              # All exchanges
GET  /api/fees/:exchange                    # One exchange (binance, bybit, ...)
GET  /api/fees/:exchange/:coin              # Coin fees on exchange (e.g. /bybit/USDT)
GET  /api/fees/compare?coin=USDT            # Cross-exchange comparison
GET  /api/fees/compare?coin=USDT&chain=arb  # Filtered by chain
```

### Health

```
GET /health
→ { "status": "ok", "uptime": 142, "environment": "development" }
```

---

## 🤖 Agent Tools

| Tool | Source | Description |
|---|---|---|
| `get_withdrawal_fees` | MongoDB | All networks + fees for a coin on an exchange |
| `find_cheapest_withdrawal` | MongoDB | Single cheapest network for a given amount |
| `get_bridge_route` | LI.FI API | Optimal bridge route between chains |
| `get_coin_chains` | CoinGecko | Which blockchains a coin exists on |
| `get_coin_exchanges` | CoinGecko | CEX + DEX listings for a coin |
| `check_p2p_availability` | MongoDB | P2P-supported exchanges by country |
| `plan_zero_gas_recovery` | MongoDB + LI.FI | Step-by-step plan for stuck tokens |
| `compare_exchanges` | MongoDB | Fee comparison across all exchanges |
| `scan_giveaways` | Twitter/X API | Active promos from exchange accounts |

---

## 🗄️ Fee Database

Seeded with **real data** from Bybit and Binance withdrawal interfaces (May 2025).

**Exchanges:** Bybit, Binance, CoinEx, Bitget, KuCoin, Gate.io

**Coins per exchange:** USDT, USDC, ETH (add more in `scripts/seedFees.js`)

**Data per network:** withdrawal fee, USD equivalent, min withdrawal, min deposit, arrival time, chain ID

**P2P coverage:** Kenya 🇰🇪, Nigeria 🇳🇬, Ghana 🇬🇭, South Africa 🇿🇦, Uganda 🇺🇬, Tanzania 🇹🇿, India 🇮🇳, Pakistan 🇵🇰

### Updating fees

Exchange fees change every few weeks. Update in `scripts/seedFees.js` and re-run:

```bash
node scripts/seedFees.js
```

Source pages:
- Binance: `binance.com/en/fee/cryptoFee`
- Bybit: `bybit.com/en/help-center/article/Withdrawal-Fee`
- CoinEx: `coinex.com/fees`

---

## 🔐 Authentication (Upcoming)

The `src/middlewares/auth.js` file is fully wired and ready. The `requireAuth` middleware is currently a stub that passes all requests. To activate:

1. `npm install @supabase/supabase-js`
2. Set `SUPABASE_URL` and `SUPABASE_ANON_KEY` in `.env`
3. Uncomment the Supabase verifier block in `auth.js`
4. Supabase supports: **Google, GitHub, Facebook, Twitter/X, Apple** OAuth out of the box

Frontend auth flow (to be implemented):
```
User clicks "Sign in with Google"
  → Supabase handles OAuth redirect
  → Returns JWT session token
  → Frontend passes token as Authorization: Bearer <token>
  → Backend verifies via Supabase and attaches req.user
```

---

## 🏆 Hackathon Tracks

| Track | Implementation | Status |
|---|---|---|
| **Best AI Agent** | Claude claude-opus-4-5 with 9 custom tools, full agentic loop | ✅ |
| **LI.FI Cross-chain** | `get_bridge_route` + `plan_zero_gas_recovery` use LI.FI API | ✅ |
| **Solana Overall** | Solana chains in fee DB + LI.FI Solana routing | ✅ |
| **ElevenLabs** | Voice narration of agent responses — add after core is done | 🔜 |

### Adding ElevenLabs voice

```ts
// In frontend/components/chat/ChatWindow.tsx
// After receiving assistant message:
const speak = async (text: string) => {
  const res = await fetch('https://api.elevenlabs.io/v1/text-to-speech/YOUR_VOICE_ID', {
    method: 'POST',
    headers: {
      'xi-api-key': process.env.NEXT_PUBLIC_ELEVENLABS_KEY!,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      text: text.slice(0, 500), // Keep it short
      model_id: 'eleven_monolingual_v1',
      voice_settings: { stability: 0.4, similarity_boost: 0.6 },
    }),
  });
  const blob = await res.blob();
  new Audio(URL.createObjectURL(blob)).play();
};
```

---

## 🚢 Deployment

### Backend → Render

1. Create a new Web Service on render.com
2. Connect your GitHub repo
3. Build command: `npm install`
4. Start command: `npm start`
5. Add all `.env` variables in the Render dashboard
6. Set `NODE_ENV=production`

### Frontend → Vercel

```bash
npx vercel
# Set NEXT_PUBLIC_API_URL to your Render backend URL
```

---

## 📁 Full File Tree

```
chainwise/
├── backend/
│   ├── scripts/
│   │   └── seedFees.js               Real fee data from Bybit/Binance screenshots
│   ├── src/
│   │   ├── agent/
│   │   │   ├── executor.js           Maps tool names → real functions
│   │   │   ├── loop.js               Claude agentic loop (multi-turn tool use)
│   │   │   └── tools.js              Tool definitions + system prompt
│   │   ├── config/
│   │   │   └── db.js                 MongoDB connection
│   │   ├── controllers/
│   │   │   ├── agent.controller.js   Chat endpoint handler
│   │   │   └── fees.controller.js    Fee read handlers
│   │   ├── middlewares/
│   │   │   ├── auth.js               Auth stub (Supabase-ready)
│   │   │   ├── cors.js               CORS policy
│   │   │   ├── errorHandler.js       404 + global error handler
│   │   │   ├── rateLimiter.js        Per-route rate limits
│   │   │   ├── requestLogger.js      UUID per request + timing
│   │   │   └── validate.js           Request body validation
│   │   ├── models/
│   │   │   ├── ExchangeFee.js        Exchange/coin/network schema
│   │   │   └── Giveaway.js           Giveaway schema
│   │   ├── routes/
│   │   │   ├── agent.js              POST /api/agent
│   │   │   └── fees.js               GET  /api/fees/*
│   │   ├── services/
│   │   │   ├── coingecko.js          CoinGecko API + 5min cache
│   │   │   ├── lifi.js               LI.FI bridge routing
│   │   │   └── twitter.js            Twitter/X giveaway scanner
│   │   ├── utils/
│   │   │   ├── logger.js             Winston (console + file in prod)
│   │   │   └── response.js           Standardized API envelope
│   │   └── server.js                 Entry: middleware, routes, graceful shutdown
│   ├── .env.example
│   └── package.json
└── frontend/
    ├── app/
    │   ├── chat/page.tsx             Chat page
    │   ├── fees/page.tsx             Fee tables page
    │   ├── globals.css               Fonts + markdown + scrollbar styles
    │   ├── layout.tsx                Root layout with sidebar
    │   └── page.tsx                  → redirects to /chat
    ├── components/
    │   ├── chat/
    │   │   ├── ChatWindow.tsx        Main chat container
    │   │   ├── Message.tsx           User + assistant bubbles w/ markdown
    │   │   ├── MessageInput.tsx      Textarea with auto-resize + send button
    │   │   ├── SuggestedPrompts.tsx  Hero + clickable example prompts
    │   │   └── ToolBadge.tsx         Color-coded tool usage indicators
    │   ├── fees/
    │   │   └── FeeTable.tsx          Comparison table + per-exchange breakdowns
    │   └── layout/
    │       └── Sidebar.tsx           Navigation sidebar
    ├── hooks/
    │   └── useChat.ts                Message state, send, clear
    ├── lib/
    │   ├── api.ts                    Typed fetch wrappers for all endpoints
    │   └── types.ts                  TypeScript interfaces
    ├── .env.local.example
    ├── next.config.ts
    ├── tailwind.config.ts
    └── package.json
```

---

## 🛠️ Tech Stack

| Layer | Technology |
|---|---|
| AI Agent | Anthropic Claude claude-opus-4-5 (tool use) |
| Backend | Node.js, Express, Mongoose |
| Database | MongoDB Atlas |
| Bridge Data | LI.FI Protocol API |
| Market Data | CoinGecko API |
| Giveaways | Twitter/X API v2 |
| Frontend | Next.js 14 App Router, TypeScript, Tailwind CSS |
| Animations | Framer Motion |
| Markdown | react-markdown + remark-gfm |
| Logging | Winston |
| Auth (upcoming) | Supabase (Google, GitHub, Facebook, Twitter/X) |
| Deployment | Render (backend), Vercel (frontend) |

---

## 👤 Author

**Brian Ouma (Yoo)** — [github.com/rockstarbryant](https://github.com/rockstarbryant) · [linkedin.com/in/rockstarbryant](https://linkedin.com/in/rockstarbryant)

Built in Nairobi, Kenya 🇰🇪