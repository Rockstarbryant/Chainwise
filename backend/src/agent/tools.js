const tools = [
  // ── EXISTING TOOLS (improved descriptions) ────────────────────────────────

  {
    type: 'function',
    function: {
      name: 'get_withdrawal_fees',
      description: 'Get ALL withdrawal networks and fees for a coin on a specific exchange, sorted cheapest first. Use this when user asks about withdrawal options or wants to see all available chains.',
      parameters: {
        type: 'object',
        properties: {
          exchange: { type: 'string', description: 'Exchange slug: binance, bybit, coinex, bitget, kucoin, gateio' },
          coin:     { type: 'string', description: 'Coin symbol uppercase: USDT, USDC, ETH, BNB, SOL, BTC' },
        },
        required: ['exchange', 'coin'],
      },
    },
  },

  {
    type: 'function',
    function: {
      name: 'find_cheapest_withdrawal',
      description: 'Find the single cheapest withdrawal chain for a coin on an exchange, optionally filtered by a minimum amount. Use when user wants the cheapest option specifically.',
      parameters: {
        type: 'object',
        properties: {
          exchange: { type: 'string', description: 'Exchange slug: binance, bybit, coinex, bitget, kucoin, gateio' },
          coin:     { type: 'string', description: 'Coin symbol: USDT, USDC, ETH' },
          amount:   { type: 'number', description: 'Amount in coin units. Filters out networks where this amount is below the minimum.' },
        },
        required: ['exchange', 'coin'],
      },
    },
  },

  {
    type: 'function',
    function: {
      name: 'get_bridge_route',
      description: 'Get the cheapest bridge route to move tokens between two blockchains using LI.FI. Use for on-chain bridging, NOT exchange withdrawals.',
      parameters: {
        type: 'object',
        properties: {
          fromChain: { type: 'string', description: 'Source chain: ethereum, arbitrum, base, polygon, bsc, optimism, solana' },
          toChain:   { type: 'string', description: 'Destination chain: ethereum, arbitrum, base, polygon, bsc, optimism' },
          fromToken: { type: 'string', description: 'Token on source chain: USDC, USDT, ETH, WETH' },
          toToken:   { type: 'string', description: 'Token on destination chain (often same symbol)' },
          amountUSD: { type: 'number', description: 'Amount in USD equivalent' },
        },
        required: ['fromChain', 'toChain', 'fromToken', 'toToken', 'amountUSD'],
      },
    },
  },

  {
    type: 'function',
    function: {
      name: 'get_coin_chains',
      description: 'Look up which blockchains a coin exists on (from CoinGecko). Returns contract addresses per chain. Use to understand what chains are available before planning a route.',
      parameters: {
        type: 'object',
        properties: {
          coin: { type: 'string', description: 'Coin symbol: USDC, USDT, SOL, ETH, WBTC, ARB, OP, etc.' },
        },
        required: ['coin'],
      },
    },
  },

  {
    type: 'function',
    function: {
      name: 'get_coin_exchanges',
      description: 'Find which CEX and DEX exchanges list a specific coin. Use when user asks where to buy/sell a coin or which exchanges support it.',
      parameters: {
        type: 'object',
        properties: {
          coin: { type: 'string', description: 'Coin symbol' },
        },
        required: ['coin'],
      },
    },
  },

  {
    type: 'function',
    function: {
      name: 'check_p2p_availability',
      description: 'Check which exchanges support P2P trading in a specific country. Essential for African users (KE, NG, GH, ZA) who need on/off ramp.',
      parameters: {
        type: 'object',
        properties: {
          country: { type: 'string', description: 'ISO 3166-1 alpha-2 code: KE, NG, GH, ZA, IN, PK, EG, TZ, UG' },
        },
        required: ['country'],
      },
    },
  },

  {
    type: 'function',
    function: {
      name: 'plan_zero_gas_recovery',
      description: 'Build a complete step-by-step recovery plan when user has tokens stuck on a chain with zero gas. Coordinates P2P purchase + bridge + deposit.',
      parameters: {
        type: 'object',
        properties: {
          stuckToken:     { type: 'string', description: 'Token symbol stuck in wallet (e.g. USDT, USDC, ARB)' },
          stuckChain:     { type: 'string', description: 'Chain the token is stuck on (e.g. arbitrum, ethereum, polygon)' },
          stuckAmountUSD: { type: 'number', description: 'USD value of stuck tokens' },
          userCountry:    { type: 'string', description: 'ISO country code for P2P options (e.g. KE, NG)' },
          targetExchange: { type: 'string', description: 'Where user wants to deposit the recovered funds' },
        },
        required: ['stuckToken', 'stuckChain', 'stuckAmountUSD'],
      },
    },
  },

  
  {
  type: 'function',
  function: {
    name: 'scan_giveaways',
    description: `Retrieve active crypto giveaways from major CEX exchanges.
Returns prize pool, participation requirements (follow/repost/reply), post link, confidence score.
Sources: official X/Twitter accounts (scanned every 2h) AND official Telegram channels (scanned every 24h).
Reads from MongoDB cache — never calls Twitter or Telegram live per query.
Use when user asks about: giveaways, airdrops, free crypto, promotions, how to win on Binance, etc.`,
    parameters: {
      type: 'object',
      properties: {
        exchange: {
          type: 'string',
          description: 'Optional filter: binance, bybit, kucoin, bitget, gateio, coinex, okx, htx, mexc, cryptocom',
        },
      },
      required: [],
    },
  },
},

{
  type: 'function',
  function: {
    name: 'get_giveaway_details',
    description: 'Get full details + participation guide for a specific giveaway. Use when user asks about a particular post.',
    parameters: {
      type: 'object',
      properties: {
        giveawayId: { type: 'string', description: 'tweetId from scan_giveaways result' },
        exchange: { type: 'string' } // fallback
      },
      required: ['giveawayId']
    }
  }
},

{
  type: 'function',
  function: {
    name: 'recommend_giveaways',
    description: 'Recommend best giveaways for user profile (free vs paid, by exchange, effort level).',
    parameters: {
      type: 'object',
      properties: {
        exchange: { type: 'string' },
        userBalance: { type: 'number', description: 'Optional: user USDT balance' },
        preferFree: { type: 'boolean', default: true }
      }
    }
  }
},

  {
    type: 'function',
    function: {
      name: 'compare_exchanges',
      description: 'Compare withdrawal fees for the same coin across ALL exchanges in the database. Shows cheapest exchange first. Use for cross-exchange comparisons.',
      parameters: {
        type: 'object',
        properties: {
          coin:   { type: 'string', description: 'Coin symbol: USDT, USDC, ETH, BNB' },
          chain:  { type: 'string', description: 'Optional: filter to a specific chain like arbitrum, bsc, tron' },
          amount: { type: 'number', description: 'Optional: filter by amount to enforce minimum withdrawal checks' },
        },
        required: ['coin'],
      },
    },
  },

  // ── NEW TOOLS ─────────────────────────────────────────────────────────────

  {
    type: 'function',
    function: {
      name: 'plan_cross_exchange_transfer',
      description: `MOST IMPORTANT TOOL. Use this whenever a user wants to move funds FROM one exchange TO another exchange.
This tool intelligently handles the full routing problem:
- Checks if the coin is listed on the destination exchange
- If NOT listed: finds the best intermediary coin (USDT/USDC/ETH) to convert to first
- Checks supported deposit networks on destination
- Finds overlapping withdrawal/deposit chains between source and destination
- Calculates total cost for each viable route
- Returns ranked routes sorted by total cost (cheapest first)
- Flags minimum deposit requirements so funds don't get stuck
Always call this tool for transfer/move/send/withdraw-to questions between two exchanges.`,
      parameters: {
        type: 'object',
        properties: {
          fromExchange: { type: 'string', description: 'Source exchange: binance, bybit, coinex, bitget, kucoin, gateio' },
          toExchange:   { type: 'string', description: 'Destination exchange: binance, bybit, coinex, bitget, kucoin, gateio' },
          coin:         { type: 'string', description: 'Coin to transfer (e.g. USDT, ETH, BNB, SOL)' },
          amount:       { type: 'number', description: 'Amount in coin units (optional but improves accuracy)' },
        },
        required: ['fromExchange', 'toExchange', 'coin'],
      },
    },
  },

  {
    type: 'function',
    function: {
      name: 'check_coin_listed_on_exchange',
      description: 'Check if a specific coin is listed/supported on an exchange for withdrawal or deposit. Returns supported networks and minimum deposit amounts. Use before recommending any transfer to verify the coin lands safely.',
      parameters: {
        type: 'object',
        properties: {
          exchange: { type: 'string', description: 'Exchange slug: binance, bybit, coinex, bitget, kucoin, gateio' },
          coin:     { type: 'string', description: 'Coin symbol: USDT, USDC, ETH, BNB, etc.' },
        },
        required: ['exchange', 'coin'],
      },
    },
  },

  {
    type: 'function',
    function: {
      name: 'get_deposit_networks',
      description: 'Get all deposit networks for a coin on an exchange with minimum deposit amounts. CRITICAL: Always check this for the destination exchange before recommending a withdrawal network — wrong network = lost funds, below minimum = funds delayed.',
      parameters: {
        type: 'object',
        properties: {
          exchange: { type: 'string', description: 'Destination exchange slug' },
          coin:     { type: 'string', description: 'Coin symbol' },
        },
        required: ['exchange', 'coin'],
      },
    },
  },

  {
    type: 'function',
    function: {
      name: 'find_common_networks',
      description: 'Find blockchain networks supported by BOTH the source (for withdrawal) and destination (for deposit) exchange for the same coin. This is the safest routing — only chains where both sides confirmed. Returns overlap ranked by cheapest withdrawal fee.',
      parameters: {
        type: 'object',
        properties: {
          fromExchange: { type: 'string', description: 'Source exchange slug' },
          toExchange:   { type: 'string', description: 'Destination exchange slug' },
          coin:         { type: 'string', description: 'Coin symbol' },
        },
        required: ['fromExchange', 'toExchange', 'coin'],
      },
    },
  },

  {
    type: 'function',
    function: {
      name: 'find_conversion_route',
      description: `When a coin is NOT listed on the destination exchange, find the best conversion route.
Tries: USDT → USDC → ETH → BNB as intermediaries in that priority order.
For each intermediary: checks if source exchange supports withdrawal AND destination supports deposit.
Returns cheapest valid conversion path with estimated total cost including conversion spread.
Use this when plan_cross_exchange_transfer detects a listing mismatch.`,
      parameters: {
        type: 'object',
        properties: {
          fromExchange: { type: 'string', description: 'Source exchange where original coin is held' },
          toExchange:   { type: 'string', description: 'Destination exchange where funds need to arrive' },
          fromCoin:     { type: 'string', description: 'Original coin that is NOT listed on destination' },
          amount:       { type: 'number', description: 'Amount of original coin (optional)' },
        },
        required: ['fromExchange', 'toExchange', 'fromCoin'],
      },
    },
  },

  {
    type: 'function',
    function: {
      name: 'estimate_transfer_cost',
      description: 'Calculate the complete end-to-end cost of a transfer: withdrawal fee + optional bridge fee + optional conversion spread. Returns net amount received. Use to give users exact dollar figures for a proposed route.',
      parameters: {
        type: 'object',
        properties: {
          fromExchange: { type: 'string', description: 'Source exchange' },
          toExchange:   { type: 'string', description: 'Destination exchange' },
          coin:         { type: 'string', description: 'Coin being transferred' },
          network:      { type: 'string', description: 'Network/chain to use (chainId like arbitrum, bsc, tron)' },
          amount:       { type: 'number', description: 'Amount in coin units' },
        },
        required: ['fromExchange', 'coin', 'network', 'amount'],
      },
    },
  },

  {
    type: 'function',
    function: {
      name: 'get_coin_price',
      description: 'Get the current USD price of a coin from CoinGecko. Use when user asks about price, or when you need to convert between coin units and USD for fee calculations.',
      parameters: {
        type: 'object',
        properties: {
          coin: { type: 'string', description: 'Coin symbol: BTC, ETH, BNB, SOL, USDT, etc.' },
        },
        required: ['coin'],
      },
    },
  },

  {
    type: 'function',
    function: {
      name: 'convert_amount',
      description: 'Convert between coin units and USD using live prices. Use when user says "I have $50 worth of ETH" or "withdraw 0.1 BTC" and you need to normalize to the other unit.',
      parameters: {
        type: 'object',
        properties: {
          amount:    { type: 'number', description: 'Amount to convert' },
          fromUnit:  { type: 'string', description: 'Source unit: coin symbol (ETH, BTC) or "USD"' },
          toUnit:    { type: 'string', description: 'Target unit: coin symbol or "USD"' },
        },
        required: ['amount', 'fromUnit', 'toUnit'],
      },
    },
  },

  {
    type: 'function',
    function: {
      name: 'find_cheapest_stable_exit',
      description: 'Find the cheapest stable coin (USDT/USDC/BUSD/DAI) to convert to and withdraw from an exchange, considering both conversion path and withdrawal fees. Use when user wants to cash out or move to a stable with minimum fees.',
      parameters: {
        type: 'object',
        properties: {
          exchange:    { type: 'string', description: 'Exchange to exit from' },
          fromCoin:    { type: 'string', description: 'Coin currently held on the exchange' },
          amount:      { type: 'number', description: 'Amount in coin units (optional)' },
          targetChain: { type: 'string', description: 'Preferred destination chain (optional): arbitrum, bsc, tron' },
        },
        required: ['exchange', 'fromCoin'],
      },
    },
  },

  {
    type: 'function',
    function: {
      name: 'get_exchange_supported_chains',
      description: 'Get ALL blockchain networks an exchange supports for deposits and withdrawals across all coins. Use to understand what chains an exchange is connected to, useful for planning entry/exit routes.',
      parameters: {
        type: 'object',
        properties: {
          exchange: { type: 'string', description: 'Exchange slug' },
        },
        required: ['exchange'],
      },
    },
  },

  {
    type: 'function',
    function: {
      name: 'plan_deposit_to_exchange',
      description: 'Given tokens on a specific blockchain, build a complete plan to deposit them into an exchange. Handles: direct deposit if chain supported, bridge to supported chain if not, with costs.',
      parameters: {
        type: 'object',
        properties: {
          coin:           { type: 'string', description: 'Coin to deposit (e.g. USDC, ETH, USDT)' },
          currentChain:   { type: 'string', description: 'Chain the tokens are currently on (e.g. arbitrum, base, ethereum)' },
          targetExchange: { type: 'string', description: 'Exchange to deposit into' },
          amountUSD:      { type: 'number', description: 'USD value to deposit (optional)' },
        },
        required: ['coin', 'currentChain', 'targetExchange'],
      },
    },
  },

  {
    type: 'function',
    function: {
      name: 'check_withdrawal_minimums',
      description: 'Check if a specific amount meets the minimum withdrawal requirements on all networks for a coin. Returns which networks are available for that amount and which are blocked.',
      parameters: {
        type: 'object',
        properties: {
          exchange: { type: 'string', description: 'Exchange slug' },
          coin:     { type: 'string', description: 'Coin symbol' },
          amount:   { type: 'number', description: 'Amount the user wants to withdraw in coin units' },
        },
        required: ['exchange', 'coin', 'amount'],
      },
    },
  },

  {
    type: 'function',
    function: {
      name: 'get_network_congestion',
      description: 'Get estimated arrival times and congestion status for major blockchain networks. Use when user asks about speed, or to flag slow networks before recommending them.',
      parameters: {
        type: 'object',
        properties: {
          networks: {
            type: 'array',
            items: { type: 'string' },
            description: 'Array of network chainIds to check: ["ethereum", "arbitrum", "bsc", "tron", "polygon"]',
          },
        },
        required: ['networks'],
      },
    },
  },

  {
  type: 'function',
  function: {
    name: 'get_all_exchange_coins',
    description: `Get all coins listed on one or ALL exchanges in our database.
Use exchange="all" when searching for a new/unknown coin like SOMI.
You can also pass search term to filter symbols.`,
    parameters: {
      type: 'object',
      properties: {
        exchange: { 
          type: 'string', 
          description: 'Exchange slug (binance, bybit, etc.) OR "all" to search across every exchange' 
        },
        search:   { 
          type: 'string', 
          description: 'Optional: filter by symbol prefix or partial match (e.g. "SOMI", "USDT")' 
        },
      },
      required: ['exchange'],
    },
  },
},

{
  type: 'function',
  function: {
    name: 'search_coin_across_exchanges',
    description: `BEST TOOL for new or unknown coins (SOMI, etc.).
Searches our entire fee database across ALL exchanges.
Returns which exchanges support the coin, supported networks, cheapest withdrawal options, and minimums.
Use this first when user asks about buying/withdrawing a lesser-known token.`,
    parameters: {
      type: 'object',
      properties: {
        coin: { 
          type: 'string', 
          description: 'Coin symbol (e.g. SOMI, USDT, ETH)' 
        },
        minNetworks: { 
          type: 'number', 
          description: 'Optional: minimum number of networks to consider useful (default 1)' 
        },
      },
      required: ['coin'],
    },
  },
},

  {
    type: 'function',
    function: {
      name: 'compare_deposit_fees',
      description: 'Compare deposit fees and minimum deposits for the same coin across multiple exchanges. Use when user is deciding which exchange to deposit into.',
      parameters: {
        type: 'object',
        properties: {
          coin:    { type: 'string', description: 'Coin symbol' },
          network: { type: 'string', description: 'Optional: filter to specific network like arbitrum, bsc' },
        },
        required: ['coin'],
      },
    },
  },

  {
    type: 'function',
    function: {
      name: 'find_p2p_best_rate',
      description: 'Find P2P trading availability and typical rates for a country and coin. Returns which exchanges offer P2P in that region with minimum trade sizes. Prioritizes mobile money supported exchanges for African users.',
      parameters: {
        type: 'object',
        properties: {
          country:   { type: 'string', description: 'ISO country code: KE, NG, GH, ZA, TZ, UG, ET, EG' },
          coin:      { type: 'string', description: 'Coin to buy/sell via P2P: USDT, USDC, BTC, ETH' },
          direction: { type: 'string',  enum: ['BUY', 'SELL', 'buy', 'sell'], description: 'buy or sell' },
        },
        required: ['country', 'coin'],
      },
    },
  },

  {
    type: 'function',
    function: {
      name: 'get_exchange_info',
      description: 'Get general information about an exchange: website, P2P support, supported countries, Twitter handle. Use for general exchange queries.',
      parameters: {
        type: 'object',
        properties: {
          exchange: { type: 'string', description: 'Exchange slug: binance, bybit, coinex, bitget, kucoin, gateio, okx, bingX, htx, mexc, cryptocom' },
        },
        required: ['exchange'],
      },
    },
  },

  {
  type: 'function',
  function: {
    name: 'get_p2p_rates',
    description: `Get live P2P buy/sell rates for a crypto asset in a specific fiat currency.
Returns best rate, worst rate, average rate, and top 3 merchant ads for both BUY and SELL sides.
Use when user asks: "What's the P2P rate for USDT in Kenya?", "How much is BTC on P2P?",
"Best rate to buy USDT with KES?", or any question about P2P prices/rates.`,
    parameters: {
      type: 'object',
      properties: {
        asset: { type: 'string', description: 'Crypto to buy/sell: USDT, USDC, BTC, ETH, BNB' },
        fiat:  { type: 'string', description: 'Fiat currency ISO code: KES, NGN, GHS, ZAR, INR, PKR, USD, EUR, GBP' },
      },
      required: ['asset', 'fiat'],
    },
  },
},

{
  type: 'function',
  function: {
    name: 'get_p2p_ads',
    description: `Fetch live P2P merchant ads with full details: price, min/max limits, payment methods,
merchant completion rate and order count. Use when user wants to see actual ads/merchants,
compare rates across exchanges, or find the best P2P offer for a specific amount.
Supports filtering by exchange, trade direction (BUY/SELL), and amount.`,
    parameters: {
      type: 'object',
      properties: {
        asset:     { type: 'string', description: 'Crypto asset: USDT, USDC, BTC, ETH' },
        fiat:      { type: 'string', description: 'Fiat currency: KES, NGN, GHS, ZAR, INR, PKR, USD, EUR' },
        tradeType: { type: 'string', description: 'BUY = user buying crypto with fiat | SELL = user selling crypto for fiat' },
        exchange:  { type: 'string', description: 'Optional: filter to one exchange — binance, bybit, okx, kucoin, bitget, htx, mexc. Default: all' },
        limit:     { type: 'integer', description: 'Number of ads to return (default 10, max 20)' },
      },
      required: ['asset', 'fiat', 'tradeType'],
    },
  },
},
];

// ── SYSTEM PROMPT ──────────────────────────────────────────────────────────
const SYSTEM_PROMPT = `You are ChainWise, an expert crypto routing and fee intelligence agent. Your job is to solve real money problems — not just answer questions.

## WHEN NOT TO CALL ANY TOOL

NEVER call a tool for:
- Greetings: "hi", "hello", "hey", "what's up", "good morning"
- Conversational filler: "thanks", "ok", "got it", "sure"
- Vague intent: if the user hasn't specified a coin, exchange, country, or action

For greetings, respond with a SHORT welcome message (2-3 lines max). Example:
"Hey! I'm ChainWise — I help you find cheapest withdrawal routes, P2P rates, bridge paths, and more. What are you working on?"

Do NOT attempt to "guess" what the user wants from a greeting.

##When user asks about giveaways:
Call scan_giveaways or recommend_giveaways first.
For specific posts → get_giveaway_details.
Always classify as Free / Low Effort vs requires deposit/trading.
Give numbered participation steps + direct clickable links.
Warn: Never send money to anyone claiming to help with giveaways.

## WHEN TO ASK FOR CLARIFICATION (BEFORE calling any tool)

You MUST ask for clarification when the user's message is ambiguous and calling
a tool would fail or return useless results. Do NOT guess — ask one short question.

**Always clarify before acting when:**

| User says        | Missing info needed        | Ask                                          |
|------------------|---------------------------|----------------------------------------------|
| "fees"           | exchange + coin           | "Which exchange and coin? e.g. Binance USDT" |
| "withdrawal"     | exchange + coin + amount  | "Withdraw what, from where?"                 |
| "p2p rates"      | country or fiat           | "Which country are you in?"                  |
| "transfer"       | from exchange + to + coin | "Move what from where to where?"             |
| "bridge"         | chain + token + amount    | "Bridge what token, from which chain?"       |
| "compare"        | coin at minimum           | "Compare withdrawal fees for which coin?"    |
| "cheapest"       | cheapest WHAT on WHERE    | "Cheapest withdrawal of which coin, on which exchange?" |
| "giveaways"      | no clarification needed   | Call scan_giveaways directly                 |

**Rules:**
- Ask ONE question only. Never list multiple questions at once.
- Keep it short — one sentence max, with a concrete example.
- If the user gave PARTIAL context (e.g. "fees on Binance" — missing coin),
  ask only for the missing piece: "Which coin? e.g. USDT, ETH, BNB"
- If the user gave FULL context, proceed immediately — never ask unnecessary questions.
- After asking, WAIT for the answer. Do not call any tool until you have enough info.

**Examples of good clarification responses:**
- User: "fees" → "Which exchange and coin? For example: *Binance USDT* or *Bybit ETH*"
- User: "p2p" → "Which country are you in? I'll find the best P2P rates for you."
- User: "transfer" → "What do you want to transfer, and between which exchanges?"
- User: "fees on Binance" → "Which coin? e.g. USDT, ETH, BNB"
- User: "cheapest withdrawal" → "Cheapest withdrawal of which coin? And from which exchange?"

**Examples of when NOT to ask (enough context given):**
- "fees on Binance for USDT" → call get_withdrawal_fees immediately
- "P2P rates in Kenya" → call get_p2p_rates with KES immediately  
- "compare USDT across exchanges" → call compare_exchanges immediately

## CORE REASONING RULES

## HANDLING NEW / UNKNOWN COINS (SOMI, Somnia, etc.)

**For unknown coins like SOMI:**
→ Call \`search_coin_across_exchanges\` first.
→ Then \`get_coin_exchanges\` and \`get_coin_chains\` for extra context.
→ Finally recommend best exchange + withdrawal route.

When a coin is not well-known:
1. First call \`get_coin_chains\` and \`get_coin_exchanges\` (CoinGecko data).
2. Then call \`get_all_exchange_coins\` with \`exchange: "all"\` and the search term.
3. Use \`compare_exchanges\` tool if you want withdrawal fee comparison.
4. Never say "I couldn't find any information" if CoinGecko or our DB has partial data.
5. Provide helpful fallback: list exchanges that support it + general advice.

Example flow for SOMI:
- Call \`get_coin_exchanges\`("SOMI")
- Call \`get_all_exchange_coins\`({exchange: "all", search: "SOMI"})
- Then recommend best exchange based on fees/minimums.

**1. ALWAYS understand intent before acting.**
When a user says "move X from Exchange A to Exchange B", that is a FULL ROUTING PROBLEM, not just a withdrawal question. You must:
  - Check if the coin is listed on the DESTINATION exchange (not just the source)
  - Find networks supported by BOTH exchanges (overlap)
  - Verify minimum deposit amounts on the destination
  - Calculate total end-to-end cost

**1a. IMPLICIT SOURCE EXCHANGE — CRITICAL.**
The source exchange is NOT always restated in the current message. If the conversation has already established WHERE the user's funds currently sit (e.g. they bought USDT via P2P on Bybit, or earlier said "I have funds on X"), then ANY later question like:
  - "which exchange is best to deposit into?"
  - "where should I deposit this?"
  - "what's the cheapest way to get this onto [exchange]?"
is STILL a routing problem between the established source and the named destination — even though the user did not repeat "from Bybit" in this message.

NEVER call compare_exchanges or compare_deposit_fees alone for this kind of question if a source exchange is identifiable anywhere earlier in the conversation. compare_exchanges only tells you the cheapest withdrawal per exchange in isolation — it has NO knowledge of where the user's funds currently are, so it can recommend a route (e.g. "withdraw via TRC20") that is NOT the cheapest actual option once the real source/destination pair is known (e.g. a shared zero-fee network like Plasma might exist between the true source and destination but never surface from compare_exchanges alone).

When in doubt about whether a source exchange is established: re-read the last 5-10 turns. If a source is identifiable, ALWAYS call plan_cross_exchange_transfer or find_common_networks FIRST, before any isolated comparison tool. Only fall back to compare_exchanges when no source exchange can be identified anywhere in the conversation.

**2. DESTINATION-FIRST THINKING.**
Before recommending any withdrawal, always verify the destination can receive it:
  - Is the coin listed on the destination?
  - Does the destination support deposit on the same network?
  - Is the amount above the minimum deposit threshold?
If any check fails → find an alternative route.

**3. WHEN COIN IS NOT LISTED ON DESTINATION — find a conversion route:**
Priority order for intermediary coins: USDT → USDC → ETH → BNB
For each: check if source can withdraw it AND destination can receive it, then compare total cost including conversion spread (~0.1%).
Always pick the path with lowest total cost.
Example: User has CAKE on Gate.io, wants Binance. CAKE is listed on Binance so direct works. If not, try: convert CAKE→USDT on Gate, withdraw USDT via cheapest common network to Binance.

**4. ALWAYS CHECK MINIMUM DEPOSITS.**
A withdrawal that arrives below the exchange's minimum deposit = funds frozen/lost. Always flag: "⚠️ Min deposit on [exchange] via [network]: X [coin]"

**5. FEE HIERARCHY — always find cheapest valid route:**
Tron (TRC20) → usually cheapest for USDT (~1 USDT fee) but slow (3-5 min)
Arbitrum/Base/Optimism → fast L2s, usually $0.10-0.50
BEP20 (BSC) → cheap, fast, widely supported
ERC20 (Ethereum) → most expensive, avoid unless only option
If a fee is absurdly high (e.g., 4.5 USDT for ERC20 USDT) → REJECT it and propose alternative.

## RESPONSE FORMAT

**For transfer/routing questions:**
1. State the recommended route upfront in one line
2. Show step-by-step numbered plan with exact fees
3. Show total cost and net received
4. Flag any risks (⚠️) on their own line
5. End with: "Verify deposit address and network on [exchange] before sending."

**For simple fee queries:**
**For compare_exchanges results — ALWAYS show the full table:**
Never summarize to one line. Always render a markdown table:

| Exchange | Chain | Fee | Min Withdraw | Arrival |
|----------|-------|-----|-------------|---------|
| Bybit    | TON   | 0 USDT | 2 USDT | ~2-5 min |
| ...      | ...   | ... | ...     | ...      |

Then add one line: "✅ Cheapest: [exchange] via [chain] — [fee] USDT"
- Table or bullet list sorted cheapest first
- Include: chain | fee | min withdrawal | arrival time
- End with one-line verification reminder

**For giveaways: call scan_giveaways tool. Give the user:**
  1. Exchange name + tweet link (always include the link)
  2. Prize pool and coins
  3. Exact steps: Follow @handle → Repost → Reply with [text]
  4. Confidence % — warn if below 60%
  5. ⚠️ Never send funds. Only official exchange accounts. Verify before participating.

**For errors / unavailable data:**
- Be specific about what failed (rate limit, not listed, below minimum)
- Always offer an alternative approach
- Never leave user with no path forward

## ERROR HANDLING

**Rate limit hit:** "⏳ The price/data service is temporarily busy. Here's what I know from our database: [give cached answer]. Refresh in 60 seconds for live data."

**Coin not in database:** "This coin isn't in our fee database yet. Based on CoinGecko: [give chain/exchange info]. For exact fees, check the exchange withdrawal page directly."

**Exchange API unavailable:** "Live data for [exchange] is temporarily unavailable. Here are the last known fees (synced [date]): [show cached data]. Verify on exchange before withdrawing."

**Amount below minimums everywhere:** "Your amount of X [coin] is below the minimum withdrawal on all available networks. Options: (1) accumulate more until you reach [lowest minimum], (2) swap to a coin with lower minimums."

## REGIONAL INTELLIGENCE

For users in Kenya (KE), Nigeria (NG), Ghana (GH), South Africa (ZA), Tanzania (TZ):
- Always mention P2P as on/off ramp option
- Prioritize exchanges with M-Pesa / mobile money support
- Flag exchanges that block African IP addresses
- BEP20 and TRC20 are most popular for African P2P

## P2P INTELLIGENCE

When users ask about P2P rates or want to buy/sell crypto with local currency:
- Use get_p2p_rates for a quick rate overview (best/avg/worst across all exchanges)
- Use get_p2p_ads when they need merchant details, specific limits, or payment methods
- Always show: best rate | fiat currency | payment methods available | min trade size
- For African users: M-Pesa (KES), Bank Transfer (NGN/GHS/ZAR) are primary payment methods
- WARN users: Always check merchant completion rate ≥95% and ≥100 orders before trading
- NEVER release crypto before confirming fiat payment is received and cleared
- P2P rates fluctuate — tell users to verify on the exchange before executing

## ABSOLUTE RULES
- NEVER recommend a network without verifying the destination exchange supports that deposit network
- NEVER ignore minimum deposit amounts
- NEVER recommend ERC20 if a cheaper option exists
- ALWAYS show net received amount (after fees) not just the fee
- NEVER summarize compare_exchanges to a single sentence — always show the full ranked table
- NEVER omit exchanges from comparison results — show ALL exchanges in the database
- NEVER use compare_exchanges/compare_deposit_fees in isolation when a source exchange is identifiable from earlier conversation context — always check for routing (plan_cross_exchange_transfer / find_common_networks) first
- ALWAYS use exact numbers from the database, not estimates`;

module.exports = { tools, SYSTEM_PROMPT };