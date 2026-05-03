const ExchangeFee = require('../models/ExchangeFee');
const coingecko   = require('../services/coingecko');
const lifi        = require('../services/lifi');
const twitter     = require('../services/twitter');

// ── get_withdrawal_fees ────────────────────────────────────────────────────
async function getWithdrawalFees({ exchange, coin }) {
  const doc = await ExchangeFee.findOne({ exchange: exchange.toLowerCase() });
  if (!doc) return { error: `Exchange '${exchange}' not in database.` };

  const coinData = doc.coins.find(c => c.symbol === coin.toUpperCase());
  if (!coinData) {
    return {
      error: `${coin.toUpperCase()} not found on ${doc.displayName}.`,
      availableCoins: doc.coins.map(c => c.symbol),
    };
  }

  const sorted = [...coinData.networks].sort((a, b) => a.withdrawFee - b.withdrawFee);

  return {
    exchange: doc.displayName,
    coin: coinData.symbol,
    lastUpdated: doc.lastUpdated,
    networks: sorted.map(n => ({
      chain:          n.chain,
      chainId:        n.chainId,
      withdrawFee:    `${n.withdrawFee} ${coinData.symbol}`,
      withdrawFeeUSD: n.withdrawFeeUSD !== null ? `~$${n.withdrawFeeUSD}` : 'unknown',
      minWithdraw:    `${n.minWithdraw} ${coinData.symbol}`,
      minDeposit:     `${n.minDeposit} ${coinData.symbol}`,
      arrivalMins:    `~${n.arrivalMins} min`,
    })),
  };
}

// ── find_cheapest_withdrawal ───────────────────────────────────────────────
async function findCheapestWithdrawal({ exchange, coin, amount }) {
  const doc = await ExchangeFee.findOne({ exchange: exchange.toLowerCase() });
  if (!doc) return { error: `Exchange '${exchange}' not found.` };

  const coinData = doc.coins.find(c => c.symbol === coin.toUpperCase());
  if (!coinData) return { error: `${coin} not found on ${doc.displayName}.` };

  let networks = [...coinData.networks].sort((a, b) => a.withdrawFee - b.withdrawFee);

  // Filter by amount if provided
  if (amount !== undefined) {
    networks = networks.filter(n => amount >= n.minWithdraw);
    if (networks.length === 0) {
      return {
        error: `Amount ${amount} ${coin} is below minimum for all networks on ${doc.displayName}.`,
        minimums: coinData.networks.map(n => ({
          chain: n.chain,
          minWithdraw: n.minWithdraw,
        })),
      };
    }
  }

  const cheapest = networks[0];

  return {
    exchange: doc.displayName,
    coin: coinData.symbol,
    amount: amount || 'not specified',
    cheapest: {
      chain:       cheapest.chain,
      chainId:     cheapest.chainId,
      fee:         cheapest.withdrawFee,
      feeUSD:      cheapest.withdrawFeeUSD,
      minWithdraw: cheapest.minWithdraw,
      arrivalMins: cheapest.arrivalMins,
      netReceived: amount ? (amount - cheapest.withdrawFee).toFixed(4) : 'depends on amount',
    },
    allOptions: networks.map(n => ({
      chain:       n.chain,
      fee:         `${n.withdrawFee} ${coin}`,
      feeUSD:      `~$${n.withdrawFeeUSD}`,
      minWithdraw: n.minWithdraw,
    })),
  };
}

// ── get_bridge_route ───────────────────────────────────────────────────────
async function getBridgeRoute({ fromChain, toChain, fromToken, toToken, amountUSD }) {
  return await lifi.getBestRoute({ fromChain, toChain, fromToken, toToken, amountUSD });
}

// ── get_coin_chains ────────────────────────────────────────────────────────
async function getCoinChains({ coin }) {
  const id = await coingecko.resolveSymbol(coin);
  if (!id) return { error: `Coin '${coin}' not found on CoinGecko.` };

  const data = await coingecko.getCoinPlatforms(id);
  const chains = Object.keys(data.platforms);

  return {
    coin: coin.toUpperCase(),
    coingeckoId: id,
    chainCount: chains.length,
    chains,
    contracts: data.platforms,
  };
}

// ── get_coin_exchanges ─────────────────────────────────────────────────────
async function getCoinExchanges({ coin }) {
  const id = await coingecko.resolveSymbol(coin);
  if (!id) return { error: `Coin '${coin}' not found on CoinGecko.` };

  const tickers = await coingecko.getCoinTickers(id);
  const DEX_KEYWORDS = ['uniswap', 'sushi', 'curve', 'raydium', 'orca', 'pancake', 'camelot', 'aerodrome', 'velodrome'];

  const allExchanges = [...new Set(tickers.map(t => t.market.name))];
  const cexList = allExchanges
    .filter(name => !DEX_KEYWORDS.some(d => name.toLowerCase().includes(d)))
    .slice(0, 15);
  const dexList = allExchanges
    .filter(name => DEX_KEYWORDS.some(d => name.toLowerCase().includes(d)))
    .slice(0, 10);

  const topByVolume = [...tickers]
    .sort((a, b) => (b.volume * b.last) - (a.volume * a.last))
    .slice(0, 5)
    .map(t => ({
      exchange: t.market.name,
      pair: `${t.base}/${t.target}`,
      volumeUSD: (t.volume * t.last).toFixed(0),
    }));

  return { coin: coin.toUpperCase(), totalMarkets: tickers.length, cexList, dexList, topByVolume };
}

// ── check_p2p_availability ─────────────────────────────────────────────────
async function checkP2PAvailability({ country }) {
  const code = country.toUpperCase();
  const allExchanges = await ExchangeFee.find({});

  const supported = [];
  const unsupported = [];

  for (const ex of allExchanges) {
    if (ex.p2p && ex.p2pCountries.includes(code)) {
      supported.push({ exchange: ex.displayName, minUSD: ex.p2pMinUSD });
    } else {
      unsupported.push(ex.displayName);
    }
  }

  return {
    country: code,
    supported,
    unsupported,
    recommendation: supported.length > 0
      ? `For ${code}: Use ${supported[0].exchange} P2P (min $${supported[0].minUSD})`
      : `No P2P found for ${code}. Try LocalBitcoins or Paxful.`,
  };
}

// ── plan_zero_gas_recovery ────────────────────────────────────────────────
async function planZeroGasRecovery({ stuckToken, stuckChain, stuckAmountUSD, userCountry, targetExchange }) {
  const country = userCountry || 'KE';
  const targetEx = targetExchange || 'bybit';

  // Find best P2P exchange in country
  const p2p = await checkP2PAvailability({ country });
  const bestP2P = p2p.supported[0];

  // Find cheapest deposit chain to target exchange for gas token
  const gasToken = 'USDT';
  const feesDoc = await ExchangeFee.findOne({ exchange: targetEx.toLowerCase() });
  const gasTokenData = feesDoc?.coins.find(c => c.symbol === gasToken);
  const l2Networks = gasTokenData?.networks
    .filter(n => ['arbitrum', 'base', 'optimism', 'bsc', 'polygon'].includes(n.chainId))
    .sort((a, b) => a.withdrawFee - b.withdrawFee) || [];

  const gasRoute = l2Networks[0];

  // Get bridge route for stuck tokens
  const bridgeTarget = gasRoute?.chainId || 'arbitrum';
  const bridgeRoute = await lifi.getBestRoute({
    fromChain: stuckChain,
    toChain: bridgeTarget,
    fromToken: stuckToken,
    toToken: stuckToken,
    amountUSD: stuckAmountUSD,
  });

  const steps = [];
  const gasNeeded = (gasRoute?.minWithdraw || 1) + (gasRoute?.withdrawFee || 0) + 1;

  if (bestP2P) {
    steps.push(`Step 1: Buy $${gasNeeded.toFixed(2)} ${gasToken} on ${bestP2P.exchange} P2P (min $${bestP2P.minUSD}). Pay with mobile money/bank.`);
    steps.push(`Step 2: Withdraw ${gasToken} from ${bestP2P.exchange} via ${gasRoute?.chain || 'BEP20'} to your wallet. Fee: ${gasRoute?.withdrawFee || 0.2} ${gasToken}.`);
  }

  steps.push(`Step 3: You now have gas on ${gasRoute?.chainId || 'bsc'}. Bridge a small amount to ${stuckChain} for gas if needed via relay.link.`);

  if (!bridgeRoute?.error) {
    steps.push(`Step 4: Bridge your ${stuckAmountUSD} USD worth of ${stuckToken} from ${stuckChain} → ${bridgeTarget} via ${bridgeRoute?.bridge || 'LI.FI'}. Cost: ~$${bridgeRoute?.totalCostUSD || '0.10'}.`);
    steps.push(`Step 5: Deposit ${stuckToken} to ${feesDoc?.displayName || targetEx} via ${gasRoute?.chain || 'Arbitrum'}.`);
  } else {
    steps.push(`Step 4: Send ${stuckAmountUSD} USD worth of ${stuckToken} directly to your ${feesDoc?.displayName || targetEx} deposit address on ${stuckChain}.`);
  }

  return {
    situation: `${stuckAmountUSD} USD of ${stuckToken} stuck on ${stuckChain}, zero gas`,
    totalEstimatedCostUSD: (gasNeeded + (bridgeRoute?.totalCostUSD || 0.5)).toFixed(2),
    steps,
    p2pOptions: p2p.supported,
    bridgeRoute: bridgeRoute?.error ? null : bridgeRoute,
    warning: 'Fees change frequently. Verify amounts on exchange before executing.',
  };
}

// ── compare_exchanges ──────────────────────────────────────────────────────
async function compareExchanges({ coin, chain, amount }) {
  const all = await ExchangeFee.find({});
  const results = [];

  for (const ex of all) {
    const coinData = ex.coins.find(c => c.symbol === coin.toUpperCase());
    if (!coinData) continue;

    let networks = coinData.networks;
    if (chain) {
      networks = networks.filter(n =>
        n.chainId.toLowerCase().includes(chain.toLowerCase()) ||
        n.chain.toLowerCase().includes(chain.toLowerCase())
      );
    }
    if (amount) {
      networks = networks.filter(n => amount >= n.minWithdraw);
    }
    if (networks.length === 0) continue;

    const cheapest = networks.sort((a, b) => a.withdrawFee - b.withdrawFee)[0];
    results.push({
      exchange: ex.displayName,
      cheapestChain:    cheapest.chain,
      fee:              cheapest.withdrawFee,
      feeUSD:           cheapest.withdrawFeeUSD,
      minWithdraw:      cheapest.minWithdraw,
    });
  }

  results.sort((a, b) => a.fee - b.fee);

  return {
    coin: coin.toUpperCase(),
    chain: chain || 'all chains',
    amount: amount || 'any',
    comparison: results,
    cheapest: results[0] || null,
  };
}

// ── scan_giveaways ─────────────────────────────────────────────────────────
async function scanGiveaways({ exchange }) {
  return await twitter.scanGiveaways(exchange);
}

// ── Main dispatcher ────────────────────────────────────────────────────────
async function executeTool(name, input) {
  const map = {
    get_withdrawal_fees:    getWithdrawalFees,
    find_cheapest_withdrawal: findCheapestWithdrawal,
    get_bridge_route:       getBridgeRoute,
    get_coin_chains:        getCoinChains,
    get_coin_exchanges:     getCoinExchanges,
    check_p2p_availability: checkP2PAvailability,
    plan_zero_gas_recovery: planZeroGasRecovery,
    compare_exchanges:      compareExchanges,
    scan_giveaways:         scanGiveaways,
  };

  const fn = map[name];
  if (!fn) return { error: `Unknown tool: ${name}` };

  try {
    return await fn(input);
  } catch (err) {
    console.error(`Tool '${name}' error:`, err.message);
    return { error: err.message };
  }
}

module.exports = { executeTool };