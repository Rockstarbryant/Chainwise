const axios = require('axios');

const BASE = 'https://li.quest/v1';

// Chain name → LI.FI chain ID
const CHAIN_IDS = {
  ethereum: 1,
  bsc: 56,
  polygon: 137,
  arbitrum: 42161,
  optimism: 10,
  base: 8453,
  avalanche: 43114,
  solana: 1151111081099710,
};

// Token addresses per chain
const TOKENS = {
  ethereum: {
    USDC: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',
    USDT: '0xdAC17F958D2ee523a2206206994597C13D831ec7',
    ETH:  '0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE',
  },
  arbitrum: {
    USDC: '0xaf88d065e77c8cC2239327C5EDb3A432268e5831',
    USDT: '0xFd086bC7CD5C481DCC9C85ebE478A1C0b69FCbb9',
    ETH:  '0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE',
  },
  base: {
    USDC: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
    ETH:  '0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE',
  },
  polygon: {
    USDC: '0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174',
    USDT: '0xc2132D05D31c914a87C6611C10748AEb04B58e8F',
  },
  bsc: {
    USDC: '0x8AC76a51cc950d9822D68b83fE1Ad97B32Cd580d',
    USDT: '0x55d398326f99059fF775485246999027B3197955',
  },
  optimism: {
    USDC: '0x0b2C639c533813f4Aa9D7837CAf62653d097Ff85',
    USDT: '0x94b008aA00579c1307B0EF2c499aD98a8ce58e58',
    ETH:  '0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE',
  },
};

function toUnits(amountUSD, token) {
  const decimals = token === 'ETH' ? 18 : 6;
  return Math.floor(amountUSD * Math.pow(10, decimals)).toString();
}

function fromUnits(raw, token) {
  const decimals = token === 'ETH' ? 18 : 6;
  return parseFloat(raw) / Math.pow(10, decimals);
}

async function getBestRoute({ fromChain, toChain, fromToken, toToken, amountUSD }) {
  const fromChainId = CHAIN_IDS[fromChain.toLowerCase()];
  const toChainId   = CHAIN_IDS[toChain.toLowerCase()];
  const fromAddr    = TOKENS[fromChain.toLowerCase()]?.[fromToken.toUpperCase()];
  const toAddr      = TOKENS[toChain.toLowerCase()]?.[toToken.toUpperCase()];

  if (!fromChainId || !toChainId) {
    return { error: `Unsupported chain: ${fromChain} or ${toChain}` };
  }
  if (!fromAddr || !toAddr) {
    return { error: `Token ${fromToken} not supported on ${fromChain}, or ${toToken} on ${toChain}` };
  }

  try {
    const { data } = await axios.get(`${BASE}/quote`, {
      params: {
        fromChain:  fromChainId,
        toChain:    toChainId,
        fromToken:  fromAddr,
        toToken:    toAddr,
        fromAmount: toUnits(amountUSD, fromToken),
        fromAddress: '0x0000000000000000000000000000000000000001',
      },
      timeout: 10000,
    });

    const estimate = data.estimate || {};
    const gasCostUSD   = (estimate.gasCosts   || []).reduce((s, g) => s + parseFloat(g.amountUSD || 0), 0);
    const bridgeFeeUSD = (estimate.feeCosts   || []).reduce((s, f) => s + parseFloat(f.amountUSD || 0), 0);
    const toAmountHuman = fromUnits(estimate.toAmount || '0', toToken);

    return {
      fromChain, toChain, fromToken, toToken,
      fromAmountUSD: amountUSD,
      toAmount: toAmountHuman.toFixed(4),
      gasCostUSD:   parseFloat(gasCostUSD.toFixed(4)),
      bridgeFeeUSD: parseFloat(bridgeFeeUSD.toFixed(4)),
      totalCostUSD: parseFloat((gasCostUSD + bridgeFeeUSD).toFixed(4)),
      durationMins: Math.ceil((data.estimate?.executionDuration || 60) / 60),
      bridge: data.toolDetails?.name || data.tool || 'unknown',
      steps: (data.includedSteps || []).map(s => ({
        type: s.type,
        tool: s.toolDetails?.name || s.tool,
        from: `${s.action?.fromToken?.symbol} on ${s.action?.fromChainId}`,
        to:   `${s.action?.toToken?.symbol} on ${s.action?.toChainId}`,
      })),
    };
  } catch (err) {
    const msg = err.response?.data?.message || err.message;
    return { error: `LI.FI: ${msg}` };
  }
}

module.exports = { getBestRoute, CHAIN_IDS, TOKENS };