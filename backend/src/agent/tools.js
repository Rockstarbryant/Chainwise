const tools = [
  {
    type: 'function',
    function: {
      name: 'get_withdrawal_fees',
      description: 'Get all withdrawal networks and fees for a coin on a specific exchange. Returns chains ranked by cheapest fee.',
      parameters: {
        type: 'object',
        properties: {
          exchange: { type: 'string', description: 'Exchange: binance, bybit, coinex, bitget, kucoin, gateio' },
          coin:     { type: 'string', description: 'Coin symbol: USDT, USDC, ETH, BNB, SOL' },
        },
        required: ['exchange', 'coin'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'find_cheapest_withdrawal',
      description: 'Find the single cheapest chain to withdraw a coin from an exchange. Optionally filter by minimum withdrawal amount.',
      parameters: {
        type: 'object',
        properties: {
          exchange: { type: 'string', description: 'Exchange: binance, bybit, coinex, bitget, kucoin, gateio' },
          coin:     { type: 'string', description: 'Coin symbol: USDT, USDC, ETH' },
          amount:   { type: 'number', description: 'Amount in coin units. Filters out networks where amount < minimum.' },
        },
        required: ['exchange', 'coin'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_bridge_route',
      description: 'Get the cheapest bridge route to move tokens between blockchains using LI.FI.',
      parameters: {
        type: 'object',
        properties: {
          fromChain: { type: 'string', description: 'Source chain: ethereum, arbitrum, base, polygon, bsc, optimism, solana' },
          toChain:   { type: 'string', description: 'Destination chain' },
          fromToken: { type: 'string', description: 'Token on source chain: USDC, USDT, ETH' },
          toToken:   { type: 'string', description: 'Token on destination chain' },
          amountUSD: { type: 'number', description: 'Amount in USD' },
        },
        required: ['fromChain', 'toChain', 'fromToken', 'toToken', 'amountUSD'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_coin_chains',
      description: 'Look up which blockchains a coin exists on (from CoinGecko). Returns chain names and contract addresses.',
      parameters: {
        type: 'object',
        properties: {
          coin: { type: 'string', description: 'Coin symbol: USDC, USDT, SOL, ETH, WBTC, etc.' },
        },
        required: ['coin'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_coin_exchanges',
      description: 'Find which CEX and DEX exchanges list a specific coin.',
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
      description: 'Check which exchanges support P2P trading in a specific country.',
      parameters: {
        type: 'object',
        properties: {
          country: { type: 'string', description: 'ISO 3166-1 alpha-2 country code: KE, NG, GH, ZA, IN, PK' },
        },
        required: ['country'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'plan_zero_gas_recovery',
      description: 'Build a full step-by-step plan for recovering tokens stuck on a chain when the user has zero gas.',
      parameters: {
        type: 'object',
        properties: {
          stuckToken:     { type: 'string', description: 'Token symbol stuck in wallet' },
          stuckChain:     { type: 'string', description: 'Chain the token is stuck on' },
          stuckAmountUSD: { type: 'number', description: 'USD value of stuck tokens' },
          userCountry:    { type: 'string', description: 'ISO country code for P2P options' },
          targetExchange: { type: 'string', description: 'Where user wants to deposit' },
        },
        required: ['stuckToken', 'stuckChain', 'stuckAmountUSD'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'scan_giveaways',
      description: 'Scan an exchange official Twitter/X account for active giveaways, airdrops, and promotions.',
      parameters: {
        type: 'object',
        properties: {
          exchange: { type: 'string', description: 'Exchange name: binance, bybit, coinex, bitget, kucoin, gateio' },
        },
        required: ['exchange'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'compare_exchanges',
      description: 'Compare withdrawal fees for the same coin across all exchanges.',
      parameters: {
        type: 'object',
        properties: {
          coin:   { type: 'string', description: 'Coin symbol: USDT, USDC, ETH' },
          chain:  { type: 'string', description: 'Optional: filter by chain like arbitrum, bsc, tron' },
          amount: { type: 'number', description: 'Optional: filter by amount to check minimums' },
        },
        required: ['coin'],
      },
    },
  },
];

const SYSTEM_PROMPT = `You are ChainWise, a crypto routing expert. Be direct and concise.

RESPONSE RULES:
- Answer in bullet points or numbered steps only
- No long explanations or preambles
- Lead with the answer immediately
- Include exact fees, chain names, and amounts
- Flag risks in one line max: ⚠️ wrong network = lost funds
- End fee answers with one line: "Verify on exchange before sending."

CAPABILITIES:
- Cheapest withdrawal routes per exchange
- Cross-chain bridge routing via LI.FI
- Zero-gas token recovery plans
- P2P availability by country (Africa: Kenya, Nigeria, Ghana, SA)
- Exchange giveaway scanning
- Cross-exchange fee comparison`;

module.exports = { tools, SYSTEM_PROMPT };