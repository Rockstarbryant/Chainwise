# ⚡ ChainWise — Crypto Routing Agent

> An AI-powered agent that finds the cheapest cross-chain withdrawal routes, bridges tokens via LI.FI, recovers stuck assets, scans exchange giveaways, and navigates P2P markets globally — with a full admin system for managing exchange fee data.

**Live:** https://chainwise-seven.vercel.app
**Author:** Brian Ouma (Yoo) — [@rockstarbryant](https://github.com/rockstarbryant)
**Built in:** Nairobi, Kenya 🇰🇪

---

## Table of Contents

1. [What ChainWise Does](#1-what-chainwise-does)
2. [Full Architecture](#2-full-architecture)
3. [Tech Stack](#3-tech-stack)
4. [Project Structure](#4-project-structure)
5. [Backend Deep Dive](#5-backend-deep-dive)
6. [Frontend Deep Dive](#6-frontend-deep-dive)
7. [Data Flow — End to End](#7-data-flow--end-to-end)
8. [AI Agent System](#8-ai-agent-system)
9. [Fee Database System](#9-fee-database-system)
10. [Auto-Sync System](#10-auto-sync-system)
11. [Authentication System](#11-authentication-system)
12. [Environment Variables](#12-environment-variables)
13. [API Reference](#13-api-reference)
14. [Setup & Installation](#14-setup--installation)
15. [Deployment](#15-deployment)
16. [For LLMs — Key Concepts](#16-for-llms--key-concepts)

---

## 1. What ChainWise Does

ChainWise solves real problems crypto users face daily:

| Problem | ChainWise Solution |
|---|---|
| "Which chain is cheapest to withdraw USDT from Binance?" | Agent queries fee DB, ranks all chains by cost |
| "I have 7 USDC on Ethereum but zero gas" | Agent builds step-by-step recovery plan using P2P + LI.FI bridge |
| "CoinEx P2P doesn't work in Kenya, how do I deposit $3?" | Agent checks P2P availability by country, finds cheapest route |
| "What's the cheapest bridge from ETH mainnet to Base?" | Agent calls LI.FI API for real-time bridge quotes |
| "Any active giveaways on Binance?" | Agent scans exchange Twitter/X accounts |
| "Which exchange has lowest USDT withdrawal fees?" | Agent compares across all exchanges in one query |

---

## 2. Full Architecture

```
┌─────────────────────────────────────────────────────────────────────────┐
│                         CHAINWISE SYSTEM                                 │
│                                                                           │
│  ┌──────────────────────────────────────────────────────────────────┐   │
│  │                     NEXT.JS FRONTEND                              │   │
│  │                                                                    │   │
│  │  /chat          → AI Agent chat interface                         │   │
│  │  /chat/[id]     → Persistent conversation (auth users)           │   │
│  │  /coins         → Coin Explorer (CoinGecko powered)              │   │
│  │  /fees          → Fee comparison tables                           │   │
│  │  /admin         → Fee Manager (admin only)                        │   │
│  │  /admin/sync    → Exchange API Key Manager (admin only)           │   │
│  │  /login         → Auth (Email + Google/GitHub/X/Facebook)        │   │
│  └─────────────────────┬────────────────────────────────────────────┘   │
│                         │ HTTP (fetch)                                    │
│  ┌──────────────────────▼────────────────────────────────────────────┐  │
│  │                   EXPRESS BACKEND (:5000)                          │  │
│  │                                                                    │  │
│  │  POST /api/agent              → AI Agent endpoint                 │  │
│  │  GET  /api/fees/*             → Fee data endpoints                │  │
│  │  /api/conversations/*         → Chat history (auth)               │  │
│  │  /api/admin/*                 → Fee management (admin)            │  │
│  │  /api/sync/*                  → API key + sync (admin)            │  │
│  │                                                                    │  │
│  │  ┌────────────┐  ┌─────────────┐  ┌──────────────────────────┐  │  │
│  │  │ AI Agent   │  │ Fee Manager │  │  Sync System              │  │  │
│  │  │ (Groq LLM) │  │ (MongoDB)   │  │  (BullMQ + Redis + CCXT) │  │  │
│  │  └──────┬─────┘  └──────┬──────┘  └────────────┬─────────────┘  │  │
│  └─────────┼───────────────┼──────────────────────┼────────────────┘  │
│            │               │                       │                    │
│  ┌─────────▼───────────────▼──────────────────────▼────────────────┐  │
│  │                    EXTERNAL SERVICES                              │  │
│  │                                                                    │  │
│  │  Groq API          → LLM (llama-3.3-70b) free tier               │  │
│  │  MongoDB Atlas     → Primary database                             │  │
│  │  Redis             → BullMQ job queue + 1hr response cache        │  │
│  │  Supabase          → Auth (JWT verification, OAuth)               │  │
│  │  CoinGecko API     → Coin data, exchange listings, prices         │  │
│  │  LI.FI API         → Cross-chain bridge routing quotes            │  │
│  │  Twitter/X API v2  → Giveaway scanning                            │  │
│  │  Exchange APIs via CCXT:                                          │  │
│  │    Binance, Bybit, KuCoin, Bitget, Gate.io, CoinEx               │  │
│  └───────────────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## 3. Tech Stack

### Backend
| Component | Technology | Purpose |
|---|---|---|
| Runtime | Node.js 18+ | Server runtime |
| Framework | Express.js | HTTP API |
| Database | MongoDB Atlas + Mongoose | Primary data store |
| Cache + Queue | Redis + IORedis | Response cache + job queue |
| Job Processing | BullMQ | Exchange sync workers |
| Scheduled Jobs | node-cron | Hourly auto-sync |
| AI Model | Groq (llama-3.3-70b-versatile) | Agent brain — free |
| Exchange Integration | CCXT | Unified exchange library |
| Bridge Routing | LI.FI API | Cross-chain routes |
| Market Data | CoinGecko API | Coin info + listings |
| Auth Verification | Supabase (service role key) | JWT verification |
| Encryption | crypto-js AES-256 | API key encryption at rest |
| Logging | Winston | Structured logs |
| Security | Helmet, CORS, rate-limit | API hardening |

### Frontend
| Component | Technology | Purpose |
|---|---|---|
| Framework | Next.js 14 App Router | React SSR |
| Language | TypeScript | Type safety |
| Styling | Tailwind CSS | Utility CSS |
| Auth | Supabase SSR | OAuth + email |
| Animations | Framer Motion | UI transitions |
| Markdown | react-markdown + remark-gfm | Agent response rendering |
| Icons | lucide-react | UI icons |

---

## 4. Project Structure

```
chainwise/
│
├── backend/
│   ├── scripts/
│   │   └── seedFees.js              # One-time DB seed with real fee data from exchange screenshots
│   │
│   └── src/
│       ├── agent/
│       │   ├── tools.js             # 9 tool definitions (OpenAI function-call format for Groq)
│       │   ├── executor.js          # Maps tool names → real functions
│       │   └── loop.js              # Groq agentic loop (multi-turn, up to 5 iterations)
│       │
│       ├── config/
│       │   ├── db.js                # MongoDB connection
│       │   └── redis.js             # Redis client factory — createBullConnection() for BullMQ,
│       │                            #   getCacheRedis() for cache. Separate instances required.
│       │
│       ├── controllers/
│       │   ├── agent.controller.js       # POST /api/agent
│       │   ├── fees.controller.js        # GET /api/fees/*
│       │   ├── conversation.controller.js # /api/conversations/* CRUD + agent call
│       │   ├── admin.controller.js       # Fee CRUD for admin UI
│       │   └── sync.controller.js        # API key save/test + sync triggers
│       │
│       ├── jobs/
│       │   ├── syncQueue.js         # BullMQ Queue + Worker + QueueEvents (3 separate connections)
│       │   └── cronJob.js           # node-cron: fires every hour → queues all exchanges
│       │
│       ├── middlewares/
│       │   ├── auth.js              # requireAuth, requireAdmin, optionalAuth (all via Supabase)
│       │   ├── cors.js              # Origin whitelist, preflight, credentials
│       │   ├── errorHandler.js      # 404 + global error handler with Mongoose/JWT error mapping
│       │   ├── rateLimiter.js       # general(200/15min), agent(15/min), fees(100/min), auth(10/15min)
│       │   ├── requestLogger.js     # UUID per request + response time logging
│       │   └── validate.js          # Body shape validation (agentRequest, exchangeParams)
│       │
│       ├── models/
│       │   ├── ExchangeFee.js       # Exchange → coins[] → networks[] schema with dataSource flag
│       │   ├── ExchangeApiKey.js    # Encrypted exchange API keys + passphrase + sync status
│       │   ├── Conversation.js      # Chat sessions with messages[], auto-title from first message
│       │   └── Giveaway.js          # Cached giveaway posts from Twitter/X
│       │
│       ├── routes/
│       │   ├── agent.js             # POST /api/agent (agentLimiter + optionalAuth + validate)
│       │   ├── fees.js              # GET /api/fees/* — ORDER MATTERS: /compare, /:exchange/coins
│       │   │                        #   before /:exchange and /:exchange/:coin
│       │   ├── conversations.js     # requireAuth on all routes
│       │   ├── admin.js             # requireAdmin on all routes
│       │   └── sync.js              # requireAdmin on all routes
│       │
│       ├── services/
│       │   ├── coingecko.js         # CoinGecko wrapper with 5min in-memory cache
│       │   │                        #   resolveSymbol, getCoinPlatforms, getCoinTickers,
│       │   │                        #   getExchangeTickers, getPrice
│       │   ├── lifi.js              # LI.FI bridge quote fetcher (getBestRoute, getAllRoutes)
│       │   ├── exchangeSync.js      # CCXT-based fetcher: buildExchangeInstance (exchange-specific
│       │   │                        #   options), fetchExchangeFeeData, syncExchange, testApiKeys
│       │   └── twitter.js           # Twitter/X API v2 recent search for giveaway tweets
│       │
│       ├── utils/
│       │   ├── logger.js            # Winston: colorized console in dev, JSON files in prod
│       │   └── response.js          # success(res, data), error(res, msg, status), paginated()
│       │
│       └── server.js                # Startup: middleware → routes → MongoDB → HTTP → BullMQ → cron
│                                    # Shutdown: SIGTERM/SIGINT → close HTTP → close MongoDB → exit
│
└── frontend/
    ├── app/
    │   ├── layout.tsx               # Root layout: fonts in <head>, Sidebar, main content area
    │   ├── page.tsx                 # Redirects to /chat
    │   ├── globals.css              # Tailwind base + prose-chainwise markdown styles + scrollbar
    │   ├── auth/callback/route.ts   # Exchanges Supabase OAuth code for session, redirects
    │   ├── login/page.tsx           # 3-tab login: Social / Sign In / Sign Up
    │   ├── chat/
    │   │   ├── page.tsx             # Anonymous chat (no conversation ID)
    │   │   └── [id]/page.tsx        # Authenticated persistent conversation
    │   ├── coins/page.tsx           # Coin Explorer: CoinGecko search + our fee DB
    │   ├── fees/page.tsx            # Fee comparison tables from our DB
    │   ├── admin/
    │   │   ├── page.tsx             # 3-column: exchanges | CoinGecko coins | fee editor
    │   │   └── sync/page.tsx        # API key manager + queue stats + sync triggers
    │   └── not-found.tsx
    │
    ├── components/
    │   ├── auth/
    │   │   └── AuthGate.tsx         # Overlay modal after 5 free messages
    │   ├── chat/
    │   │   ├── ChatWindow.tsx       # Container: toolbar, messages list, loading indicator, AuthGate
    │   │   ├── Message.tsx          # Bubble with ToolBadges + react-markdown for assistant
    │   │   ├── MessageInput.tsx     # Auto-resize textarea, Enter to send, Send button
    │   │   ├── SuggestedPrompts.tsx # Hero section + 6 clickable example queries
    │   │   └── ToolBadge.tsx        # Color-coded badge per tool (9 tools, 9 colors)
    │   ├── fees/
    │   │   └── FeeTable.tsx         # USDT/USDC/ETH selector + comparison table + exchange cards
    │   └── layout/
    │       ├── Sidebar.tsx          # Nav links (admin-gated), conversation history, user profile
    │       └── ConversationHistory.tsx # Fetches /api/conversations, shows list with delete
    │
    ├── hooks/
    │   ├── useAuth.ts               # Supabase session state, signIn(provider), signOut, getToken
    │   └── useChat.ts               # Messages state, send(), 5-msg anon gate, anon vs auth routing
    │
    ├── lib/
    │   ├── api.ts                   # Typed fetch wrappers: sendToAgent, getExchanges, compareExchanges
    │   ├── types.ts                 # ChatMessage, ToolCall, AgentResponse, ExchangeFee, NetworkFee
    │   └── supabase/
    │       ├── client.ts            # createBrowserClient (for components/hooks)
    │       └── server.ts            # createServerClient with cookie store (for SSR/middleware)
    │
    └── middleware.ts                # Protects /history/*, /admin/* — redirects to /login if no session
```

---

## 5. Backend Deep Dive

### Server Startup Sequence

```
1. Load .env
2. Apply middleware:
   helmet()         → Security headers (CSP in prod only)
   cors()           → Origin whitelist from FRONTEND_URL + localhost:3000
   compression()    → Gzip responses
   express.json()   → Body parsing, 100kb max
   requestLogger    → Attach UUID, log on response finish
   rateLimiter.general → 200 req/15min global ceiling
3. Register routes (order matters for /fees):
   /health          → No limit, no auth
   /api/agent       → agentLimiter(15/min) + optionalAuth + validate
   /api/fees        → feesLimiter(100/min) — /compare and /:exchange/coins BEFORE params
   /api/conversations → requireAuth
   /api/admin       → requireAdmin
   /api/sync        → requireAdmin
4. 404 handler → notFound middleware
5. Global error handler → globalError middleware
6. connectDB() → MongoDB Atlas
7. app.listen(PORT)
8. setTimeout(2000) → startWorker() + startCron()
   (delay lets Redis fully connect before BullMQ initializes)
9. process.on(SIGTERM/SIGINT) → graceful shutdown:
   server.close() → mongoose.connection.close() → process.exit(0)
   Force exit after 10s timeout
```

### Middleware Chain per Request

```
Incoming request
  ↓ helmet (security headers)
  ↓ cors (check origin whitelist, handle preflight)
  ↓ compression (gzip)
  ↓ express.json (parse body)
  ↓ requestLogger (assign UUID, start timer)
  ↓ rateLimiter.general (200/15min global)
  ↓ [route-specific rate limiter]
  ↓ [auth middleware: optionalAuth | requireAuth | requireAdmin]
  ↓ [validation middleware: agentRequest | exchangeParams]
  ↓ controller function
  ↓ response.success() or response.error()
  ↓ requestLogger fires on 'finish' event (logs method, url, status, ms, IP, UUID)
```

### Auth Middleware — Three Levels

All three call the shared `verifyToken()` function:

```javascript
async function verifyToken(req) {
  const header = req.headers.authorization; // "Bearer eyJ..."
  const token  = header.split(' ')[1];
  const { data: { user }, error } = await supabase.auth.getUser(token);
  // supabase uses SERVICE_ROLE_KEY — can verify any user's token
  return user || null;
}
```

- `optionalAuth` — attaches `req.user` if token valid, never blocks (agent endpoint)
- `requireAuth` — returns 401 if no valid token (conversations endpoint)
- `requireAdmin` — returns 403 if user email not in `ADMIN_EMAILS` (admin + sync endpoints)

### Route Ordering Rule (Critical)

In `routes/fees.js`, specific routes must come before parameterized ones:

```javascript
router.get('/compare', ...)            // 1st — specific path
router.get('/:exchange/coins', ...)    // 2nd — before /:exchange/:coin
router.get('/:exchange', ...)          // 3rd
router.get('/:exchange/:coin', ...)    // 4th — most general
```

If `/:exchange/coins` were registered after `/:exchange/:coin`, Express would match `/binance/coins` as `{ exchange: 'binance', coin: 'coins' }` and return 404.

---

## 6. Frontend Deep Dive

### Auth Flow (step by step)

```
1. User visits /chat (no session)
2. useAuth() runs supabase.auth.getSession() → returns null
3. User is anonymous: gets 5 free messages (tracked in localStorage "cw_anon_count")
4. After 5th message: useChat() sets showAuthGate = true
5. AuthGate modal appears over chat
6. User clicks "Continue with Google"
7. useAuth.signIn('google') calls supabase.auth.signInWithOAuth()
   → redirectTo: window.location.origin + '/auth/callback'
8. Browser redirects to Supabase → Google OAuth → back to /auth/callback?code=xxx
9. app/auth/callback/route.ts: supabase.auth.exchangeCodeForSession(code)
   → Sets session in cookies (via @supabase/ssr cookie store)
10. Redirect to /chat
11. useAuth() detects session via onAuthStateChange listener
    → isAuthenticated = true, user = { email, name, avatar }
12. Sidebar shows conversation history, user profile, sign out
```

### Anonymous vs Authenticated Chat Routing

```javascript
// useChat.ts — simplified
if (!isAuthenticated) {
  // Anonymous path
  const count = parseInt(localStorage.getItem('cw_anon_count') || '0');
  if (count >= 5) { setShowAuthGate(true); return; }

  // POST /api/agent (stateless — no DB)
  const res = await fetch(`${API_URL}/api/agent`, {
    body: JSON.stringify({ messages: allMessages }),
  });
  localStorage.setItem('cw_anon_count', (count + 1).toString());
  if (count + 1 >= 5) setTimeout(() => setShowAuthGate(true), 1500);

} else if (conversationId) {
  // Authenticated path
  const token = await getToken(); // Supabase JWT
  // POST /api/conversations/:id/message (persisted to MongoDB)
  const res = await fetch(`${API_URL}/api/conversations/${conversationId}/message`, {
    headers: { Authorization: `Bearer ${token}` },
    body: JSON.stringify({ content: text }),
  });
}
```

### Coin Explorer Data Sources

```
Search box input
  → debounced 350ms
  → CoinGecko /search?query={input}   (direct from browser — free, no auth)
  → dropdown: top 8 results

User selects coin
  → CoinGecko /coins/{id}             → platforms (chains + contract addresses)
  → CoinGecko /simple/price?ids={id}  → USD price
  → CoinGecko /coins/{id}/tickers     → CEX + DEX listings (filtered by DEX keywords)
  → Our backend /api/fees/compare?coin={symbol} → withdrawal fees from our DB

Display:
  - Coin header: name, symbol, price
  - Supported Chains panel: from CoinGecko platforms
  - Withdrawal Fees panel: from our MongoDB (empty if not seeded)
  - CEX Listings: from CoinGecko tickers (non-DEX)
  - DEX Listings: from CoinGecko tickers (matches DEX keywords)
```

---

## 7. Data Flow — End to End

### Fee Data Lifecycle

```
① SEED (one-time setup)
   node scripts/seedFees.js
   Source: real exchange withdrawal UI screenshots (Bybit, Binance)
   → Inserts ExchangeFee documents into MongoDB
   → dataSource: "manual" on all networks

② MANUAL UPDATE (admin, ongoing)
   Admin → /admin → select exchange → CoinGecko loads coins → select coin
   → existing networks shown (from MongoDB)
   → admin edits inline → PATCH /api/admin/fees/:exchange/:coin/:chain
   → MongoDB updated, dataSource stays "manual"
   → Redis cache busted for that exchange

③ AUTO-SYNC (hourly + on-demand)
   node-cron fires "0 * * * *"
   → queueAllExchanges(adminUserId) → BullMQ jobs added
   → Worker calls syncExchange(exchange, adminUserId):
       decrypt API key from MongoDB
       CCXT fetchCurrencies() → all coins with network fees
       for each coin/network:
         if network.dataSource === "manual" → SKIP
         if network exists → UPDATE fee data
         if network new → INSERT
       doc.save() → MongoDB updated
       cacheDelPattern("fees:{exchange}:*") → Redis cache busted
       ExchangeApiKey.lastSync = now

④ READ (all consumers)
   Frontend fee pages + AI agent tools
   → cacheGet("fees:{exchange}:{coin}") → Redis hit? return cached
   → Redis miss: query MongoDB → cacheSet with 1hr TTL → return
```

### AI Agent Request Lifecycle

```
User message arrives at POST /api/agent
  ↓ validate: messages array, role values, content length
  ↓ optionalAuth: attach user if token present
  ↓ runAgent(messages) in loop.js:

      Build Groq request:
        model: "llama-3.3-70b-versatile"
        system: SYSTEM_PROMPT (concise, bullet-point style)
        messages: conversation history
        tools: 9 tool definitions (OpenAI function-call format)
        temperature: 0.3
        max_tokens: 4096

      Loop (max 5 iterations):
        Groq responds with finish_reason: "tool_calls"
        → parse tool_calls[] from response
        → Promise.all(toolCalls.map(call => executeTool(call.name, call.input)))
        → each executeTool() hits MongoDB or external API
        → append { role: "assistant", tool_calls } + { role: "tool", content: result }
        → call Groq again with updated conversation
        → if finish_reason: "stop" → exit loop

      Return { message: finalText, toolsUsed, inputTokens, outputTokens }

  ↓ If authenticated + conversationId:
      Conversation.messages.push(userMsg, assistantMsg) → save()
  ↓ success(res, { message, toolsUsed, usage })

Frontend:
  → append assistant message to state
  → ToolBadge components rendered for each unique tool used
  → react-markdown renders response (tables, bold, lists, code)
```

---

## 8. AI Agent System

### 9 Tools

| Tool | Source | Returns |
|---|---|---|
| `get_withdrawal_fees` | MongoDB | All chains for coin on exchange, sorted cheapest first |
| `find_cheapest_withdrawal` | MongoDB | Single cheapest chain, filtered by amount if provided |
| `get_bridge_route` | LI.FI API | Best bridge route: cost, bridge name, duration, steps |
| `get_coin_chains` | CoinGecko | All blockchains coin exists on + contract addresses |
| `get_coin_exchanges` | CoinGecko | CEX + DEX listings sorted by volume |
| `check_p2p_availability` | MongoDB | Exchanges supporting P2P in given country code |
| `plan_zero_gas_recovery` | MongoDB + LI.FI | Numbered recovery plan for stuck tokens |
| `compare_exchanges` | MongoDB | Cross-exchange fee table for same coin |
| `scan_giveaways` | Twitter/X API v2 | Recent giveaway tweets from official exchange accounts |

### Tool Format (Groq/OpenAI)

```javascript
{
  type: 'function',
  function: {
    name: 'get_withdrawal_fees',
    description: 'Get all withdrawal networks and fees...',
    parameters: {
      type: 'object',
      properties: {
        exchange: { type: 'string', description: 'binance, bybit...' },
        coin:     { type: 'string', description: 'USDT, USDC, ETH' },
      },
      required: ['exchange', 'coin'],
    },
  },
}
```

Note: Groq uses OpenAI's format (`parameters`, wrapped in `function: {}`). Anthropic Claude uses a different format (`input_schema`, flat object). If switching from Groq to Claude, all tool definitions need reformatting.

### System Prompt Philosophy

```
- Answer in bullet points or numbered steps only
- Lead with the answer immediately — no preamble
- Include exact amounts, chain names, fee values
- Risk warning in one line: ⚠️ wrong network = lost funds
- Prioritize P2P for African users (Kenya, Nigeria, Ghana, SA)
- End every fee answer: "Verify on exchange before sending."
```

---

## 9. Fee Database System

### ExchangeFee MongoDB Schema

```javascript
ExchangeFee {
  exchange:      String    // "binance" — lowercase, unique
  displayName:   String    // "Binance"
  website:       String
  twitterHandle: String    // "@binance"
  p2p:           Boolean   // supports P2P?
  p2pMinUSD:     Number    // minimum P2P trade
  p2pCountries:  [String]  // ["KE","NG","GH","ZA","IN","PK"...]

  coins: [{
    symbol:   String       // "USDT"
    networks: [{
      chain:          String   // "Arbitrum One" — human display name
      chainId:        String   // "arbitrum" — used for CCXT matching
      withdrawFee:    Number   // 0.1 (in coin units)
      withdrawFeeUSD: Number   // ~0.10 (USD equivalent)
      minWithdraw:    Number   // 1 (minimum units)
      minDeposit:     Number   // 1
      depositFee:     Number   // 0 (almost always)
      arrivalMins:    Number   // 1
      isActive:       Boolean
      dataSource:     String   // "manual" | "api"
      lastSynced:     Date     // when auto-sync last touched this
    }]
  }]

  lastUpdated: Date
  dataSource:  String      // "manual" | "api"
}
```

### Manual Override Protection (Critical)

```javascript
// In syncExchange() — exchangeSync.js
for (const newNet of newNetworks) {
  const existing = coinData.networks.find(
    n => n.chainId?.toLowerCase() === newNet.chainId?.toLowerCase()
  );

  if (!existing) {
    coinData.networks.push(newNet); // new chain — add it
  } else if (existing.dataSource === 'manual') {
    skipped++; // ← NEVER touch manual entries
  } else {
    // API-sourced — safe to update
    existing.withdrawFee = newNet.withdrawFee;
    existing.minWithdraw = newNet.minWithdraw;
    existing.minDeposit  = newNet.minDeposit;
    existing.dataSource  = 'api';
    existing.lastSynced  = new Date();
  }
}
```

### Admin Fee Manager UX Flow

```
/admin (3-column layout)
│
├── Col 1: Exchange list (static — 6 exchanges)
│     Click Binance
│       → selectExchange("binance")
│       → GET /api/fees/binance/coins → CoinGecko exchange tickers
│       → coins list loads with "IN DB" / "NEW" badges
│
├── Col 2: Coin search + list
│     Search "USDT" → instant client-side filter
│     Click USDT
│       → selectCoin({ symbol: "USDT", ... })
│       → look up existing networks in dbExchanges state
│       → shows existing fee table or empty state
│
└── Col 3: Fee editor
      Existing networks table:
        hover row → ✏️ edit, 🗑️ delete appear
        click ✏️  → inline edit form for that row
        Save → PATCH /api/admin/fees/binance/USDT/TRC20
               body: { withdrawFee, minWithdraw, minDeposit, ... }
               dataSource remains "manual"

      "+ Add Chain" button
        → form: chain, chainId, withdrawFee, minWithdraw, minDeposit...
        → POST /api/admin/fees/binance/USDT/networks
        → dataSource: "manual" set by backend
```

---

## 10. Auto-Sync System

### Component Map

```
node-cron (cronJob.js)
  schedule: "0 * * * *" (top of every hour)
  → ExchangeApiKey.distinct('adminUserId', { isValid: true, autoSync: true })
  → for each adminUserId: queueAllExchanges(adminUserId)

queueAllExchanges() (syncQueue.js)
  → ExchangeApiKey.find({ adminUserId, isValid, autoSync })
  → for each key: queueSync(exchange, adminUserId)

queueSync() (syncQueue.js)
  → Queue.add(jobName, { exchangeKey, adminUserId }, {
      jobId: "{exchange}-{adminUserId}",  // prevents duplicate jobs
      attempts: 3,
      backoff: { type: 'exponential', delay: 5000 }
    })

BullMQ Worker (syncQueue.js)
  concurrency: 2 (2 exchanges processed simultaneously)
  → calls syncExchange(exchangeKey, adminUserId)
  → on failure: waits 5s → 10s → 20s, then marks failed
  → on success: logs coins synced + duration

syncExchange() (exchangeSync.js)
  1. Find ExchangeApiKey in MongoDB
  2. Decrypt apiKey + apiSecret (+ passphrase for KuCoin/Bitget)
  3. buildExchangeInstance(exchange, apiKey, apiSecret)
     → exchange-specific CCXT options (see table below)
  4. CCXT.fetchCurrencies()
     → returns all coins with network data
  5. Parse: symbol → networks[] → fees, minimums, arrival time
  6. Merge into MongoDB ExchangeFee (skip manual entries)
  7. cacheDelPattern("fees:{exchange}:*") → bust Redis
  8. Update ExchangeApiKey.lastSync + clear lastError
```

### Exchange-Specific CCXT Config

| Exchange | Config Key | Value | Reason |
|---|---|---|---|
| Binance | `defaultType` | `'spot'` | Standard |
| Bybit | `accountType` | `'UNIFIED'` | Bybit requires unified account API |
| KuCoin | `password` | passphrase | KuCoin requires 3rd credential |
| Bitget | `password` | passphrase | Bitget requires 3rd credential |
| Gate.io | — | standard | No special config |
| CoinEx | `api` | `'v2'` | Must use v2 endpoint |

### Redis — Two Connection Types

```javascript
// BullMQ REQUIRES separate connection per component
const getQueue  = () => new Queue(NAME, { connection: createBullConnection() });
const getWorker = () => new Worker(NAME, fn, { connection: createBullConnection() });
const getEvents = () => new QueueEvents(NAME, { connection: createBullConnection() });

// Cache uses a single shared client
const getCacheRedis = () => {
  if (!_cacheClient) _cacheClient = new Redis({ ...config, maxRetriesPerRequest: 3 });
  return _cacheClient;
};
// BullMQ clients need maxRetriesPerRequest: null
// Cache clients use maxRetriesPerRequest: 3
```

**If you share one Redis instance between Queue and Worker, jobs are queued but the Worker never processes them.** This was the original bug — the fix is `createBullConnection()` returning a fresh instance each call.

### API Key Security

```
User pastes key in /admin/sync form
  → POST /api/sync/keys { exchange, apiKey, apiSecret, passphrase? }
  → testApiKeys(): CCXT fetchBalance() to verify credentials
  → if valid: encrypt with AES-256 → store in MongoDB ExchangeApiKey
  → never stored or logged in plaintext

When syncing:
  → ExchangeApiKey.decrypt(doc.apiKeyEncrypted) → plaintext
  → used only in memory during CCXT call
  → never returned to frontend
```

Read-only permissions required on each exchange. ChainWise only calls:
- `fetchBalance()` — for key validity test only
- `fetchCurrencies()` — for fee + minimum data

---

## 11. Authentication System

### Supabase Setup Requirements

1. Create project at supabase.com (free tier)
2. **Settings → API Keys → Legacy tab:**
   - `anon public` key → frontend `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - `service_role secret` key → backend `SUPABASE_SERVICE_ROLE_KEY`
   - Project URL → both `.env` files as `SUPABASE_URL`

3. **Auth → URL Configuration:**
   ```
   Site URL: https://your-domain.com
   Redirect URLs:
     https://your-domain.com/auth/callback
     http://localhost:3000/auth/callback
   ```

4. **Auth → Providers** — enable each and paste credentials:

| Provider | Where to get credentials |
|---|---|
| Google | console.cloud.google.com → Credentials → OAuth 2.0 Client |
| GitHub | github.com → Settings → Developer settings → OAuth Apps |
| Twitter/X | developer.twitter.com → App → User authentication settings → OAuth 2.0 |
| Facebook | developers.facebook.com → App → Facebook Login |

Callback URL for all: `https://{your-project-id}.supabase.co/auth/v1/callback`

### Admin Access

No roles tables or complex RBAC. Simple email whitelist:

```bash
# backend/.env
ADMIN_EMAILS=youremail@gmail.com,co-admin@example.com
```

`requireAdmin` middleware checks `user.email.toLowerCase()` against this list. Add/remove admins by editing the env var and restarting backend.

Frontend admin visibility: `NEXT_PUBLIC_ADMIN_EMAIL=youremail@gmail.com` — sidebar shows Admin link only when this matches `user.email`.

---

## 12. Environment Variables

### `backend/.env`

```env
# Server
PORT=5000
NODE_ENV=development

# MongoDB
MONGODB_URI=mongodb+srv://user:password@cluster.mongodb.net/chainwise

# AI — free at console.groq.com
GROQ_API_KEY=gsk_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx

# Supabase — use SERVICE ROLE key (Settings → API → Legacy tab → service_role)
SUPABASE_URL=https://xxxxxxxxxxxx.supabase.co
SUPABASE_SERVICE_ROLE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...

# Admin (comma-separated, no spaces)
ADMIN_EMAILS=youremail@gmail.com

# CoinGecko — free demo key at coingecko.com/api
COINGECKO_API_KEY=CG-xxxxxxxxxxxxxxxxxxxxxxxx

# Twitter/X — optional, for live giveaway scanning (developer.twitter.com)
TWITTER_BEARER_TOKEN=AAAAAAAAAAAAAAAAAAAAAxx...

# Redis — local: sudo apt install redis-server && sudo service redis-server start
REDIS_HOST=127.0.0.1
REDIS_PORT=6379
REDIS_PASSWORD=

# API key encryption (EXACTLY 32 chars — never commit this)
API_KEY_ENCRYPTION_SECRET=chainwise-prod-32char-secret!!!

# CORS
FRONTEND_URL=http://localhost:3000
```

### `frontend/.env.local`

```env
NEXT_PUBLIC_API_URL=http://localhost:5000
NEXT_PUBLIC_SUPABASE_URL=https://xxxxxxxxxxxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=sb_publishable_xxxx...
NEXT_PUBLIC_ADMIN_EMAIL=youremail@gmail.com
```

---

## 13. API Reference

### Agent

```
POST /api/agent
Authorization: Bearer {token}  (optional)
Body: { messages: [{ role: "user"|"assistant", content: string }] }

Response:
{
  success: true,
  data: {
    message: string,           // markdown formatted response
    toolsUsed: [{
      tool: string,
      input: object,
      result: object
    }],
    usage: { inputTokens, outputTokens }
  }
}
```

### Fees (all public)

```
GET /api/fees
→ All exchanges: name, p2p, countries, lastUpdated

GET /api/fees/compare?coin=USDT&chain=arbitrum&amount=5
→ Cross-exchange comparison, sorted cheapest first

GET /api/fees/:exchange/coins?page=1
→ CoinGecko coins listed on that exchange (binance, bybit, etc.)

GET /api/fees/:exchange
→ Full fee data for one exchange

GET /api/fees/:exchange/:coin
→ All networks for coin on exchange, sorted cheapest first
```

### Conversations (auth required)

```
GET    /api/conversations              → User's conversation list
POST   /api/conversations              → Create new conversation
GET    /api/conversations/:id          → Full conversation + messages
POST   /api/conversations/:id/message  → Send message, get agent reply
DELETE /api/conversations/:id          → Soft delete
```

### Admin (admin required)

```
GET    /api/admin/fees
PATCH  /api/admin/fees/:exchange
POST   /api/admin/fees/:exchange/:coin/networks
PATCH  /api/admin/fees/:exchange/:coin/:chain
DELETE /api/admin/fees/:exchange/:coin/:chain
```

### Sync (admin required)

```
GET    /api/sync/status               → Queue stats + key connection statuses
GET    /api/sync/keys                 → Stored keys (no secrets shown)
POST   /api/sync/keys                 → Save keys (tests connection first)
DELETE /api/sync/keys/:exchange       → Remove keys
POST   /api/sync/trigger/:exchange    → Queue sync for one exchange
POST   /api/sync/trigger-all          → Queue all valid exchanges
```

---

## 14. Setup & Installation

### Prerequisites

- Node.js 18+
- MongoDB Atlas account (free tier: atlas.mongodb.com)
- Redis (local)
- Groq account (free: console.groq.com)
- Supabase project (free: supabase.com)
- CoinGecko API key (free: coingecko.com/api)

### Install Redis (WSL / Ubuntu)

```bash
sudo apt-get install redis-server
sudo service redis-server start
redis-cli ping   # → PONG
```

### Backend

```bash
cd backend
npm install
cp .env.example .env
# Fill all required variables

# Seed database with real fee data from exchange screenshots
node scripts/seedFees.js
# Output:
# ✓ Seeded Bybit
# ✓ Seeded Binance
# ✓ Seeded CoinEx
# ✓ Seeded Bitget
# ✓ Seeded KuCoin
# All exchanges seeded successfully.

npm run dev
# ⚡ ChainWise API → http://localhost:5000
# Redis cache connected
# ✓ BullMQ worker and hourly cron started
```

### Frontend

```bash
cd frontend
npm install
cp .env.local.example .env.local
# Fill Supabase keys and API URL

npm run dev
# → http://localhost:3000
```

### Verify Setup

```bash
# Health check
curl http://localhost:5000/health

# Test agent (no auth needed)
curl -X POST http://localhost:5000/api/agent \
  -H "Content-Type: application/json" \
  -d '{"messages":[{"role":"user","content":"Cheapest USDT from Bybit?"}]}'

# Check fee data
curl http://localhost:5000/api/fees/bybit/USDT

# Check exchange coin list (requires COINGECKO_API_KEY)
curl http://localhost:5000/api/fees/binance/coins
```

---

## 15. Deployment

### Backend → Render

1. New Web Service → connect GitHub → root directory: `backend`
2. Build command: `npm install`
3. Start command: `npm start`
4. Add all env vars from `backend/.env`
5. `NODE_ENV=production`
6. New Redis service → copy `REDIS_URL` → update `redis.js`:

```javascript
const REDIS_CONFIG = process.env.REDIS_URL
  ? { url: process.env.REDIS_URL, maxRetriesPerRequest: null }
  : { host: process.env.REDIS_HOST, port: parseInt(process.env.REDIS_PORT), ... };
```

### Frontend → Vercel

```bash
cd frontend
npx vercel
# Set env vars in Vercel dashboard:
#   NEXT_PUBLIC_API_URL = https://your-render-backend.onrender.com
#   NEXT_PUBLIC_SUPABASE_URL
#   NEXT_PUBLIC_SUPABASE_ANON_KEY
#   NEXT_PUBLIC_ADMIN_EMAIL
```

### Post-Deploy

Update Supabase redirect URLs to include your Vercel domain.
Update all OAuth app callback URLs (Google, GitHub, X, Facebook) to include your Supabase callback URL if not already set to `https://{project}.supabase.co/auth/v1/callback`.

---

## 16. For LLMs — Key Concepts

*This section helps AI assistants understand the codebase quickly when asked to make changes.*

### Which file to edit for each task

| Task | File |
|---|---|
| Change AI personality / response style | `backend/src/agent/tools.js` → `SYSTEM_PROMPT` |
| Add a new AI tool | `backend/src/agent/tools.js` (definition) + `backend/src/agent/executor.js` (function) |
| Add a new exchange to fee DB | `backend/scripts/seedFees.js` → new exchange object → `node scripts/seedFees.js` |
| Add exchange to auto-sync | `backend/src/services/exchangeSync.js` → `CCXT_MAP` + `buildExchangeInstance()` options |
| Change free message limit | `frontend/hooks/useChat.ts` → `ANON_LIMIT` constant |
| Add new admin email | `backend/.env` → `ADMIN_EMAILS` |
| Change Redis cache TTL | `backend/src/config/redis.js` → `CACHE_TTL` |
| Change sync frequency | `backend/src/jobs/cronJob.js` → cron expression string |
| Add new OAuth provider | Supabase dashboard → Auth → Providers + `frontend/app/login/page.tsx` |
| Change rate limits | `backend/src/middlewares/rateLimiter.js` |
| Add new fee field to schema | `backend/src/models/ExchangeFee.js` + seed script + admin UI form |

### Data relationships (plain English)

`ExchangeFee` (MongoDB) is the central data store. It starts from the seed script, gets manually edited via the admin UI, and gets auto-updated by the sync worker. Every consumer — fee tables, coin explorer, and the AI agent — reads from this collection (with Redis caching in front).

`ExchangeApiKey` holds encrypted exchange credentials per admin user. The sync worker decrypts these to call exchange APIs via CCXT and push updates into `ExchangeFee`.

`Conversation` holds chat sessions for authenticated users. Each document has a `messages[]` array. Anonymous users get no persistence — their messages exist only in browser state.

BullMQ jobs live in Redis, not MongoDB. They're ephemeral — created when sync is triggered, consumed by the worker, removed on completion.

### Critical invariants — never break these

1. **`dataSource: "manual"` in ExchangeFee.networks is sacred.** The sync worker must always skip these. Admin manual edits must always set dataSource to "manual".

2. **BullMQ Queue, Worker, and QueueEvents need separate IORedis instances** (`createBullConnection()` must be called 3 times, not once). Sharing causes silent worker failure.

3. **`/api/fees` route order:** `/compare` → `/:exchange/coins` → `/:exchange` → `/:exchange/:coin`. Never reorder.

4. **Backend uses `SUPABASE_SERVICE_ROLE_KEY`.** Frontend uses `NEXT_PUBLIC_SUPABASE_ANON_KEY`. These are different keys with different permission levels. Do not swap them.

5. **Groq tool definitions use OpenAI format** (`parameters`, wrapped in `function: {}`). If migrating to Anthropic Claude, rewrite to `input_schema` flat format.

6. **Agent loop max 5 iterations.** Prevents infinite tool-calling. Most queries complete in 1–3 iterations.

7. **Exchange-specific CCXT options are required.** Bybit: `accountType: 'UNIFIED'`. KuCoin + Bitget: `password: passphrase`. CoinEx: `api: 'v2'`. Missing these causes auth failures or wrong data.

## Recent Updates — Global Job Locking System (May 2026)

### Overview
Implemented a **distributed Redis-based mutex** to ensure that background jobs run **one at a time** instead of overlapping.

This prevents:
- Rate limit bans from overlapping P2P requests
- Duplicate work
- High server load
- Redis connection pressure

### New File
- `backend/src/utils/redisLock.js` — Global lock utility (`withLock`, `acquireLock`, `releaseLock`)

### Updated Files
- `backend/src/jobs/p2pCron.js`
- `backend/src/jobs/cronJob.js` 
- `backend/src/jobs/giveawayScan.js`
- `backend/src/jobs/syncQueue.js` (BullMQ Worker)
- `backend/src/server.js` (shutdown handling)

### How It Works

All major background jobs are now wrapped with:

```js
await withLock('job-name', async () => {
  // job logic here
});

Cron Triggers 
    ↓
withLock() → Redis NX + EX lock
    ↓
Job Execution (P2P / Sync / Giveaway)
    ↓
Lock Release