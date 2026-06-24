const ExchangeFee = require('../models/ExchangeFee');
const { fetchP2PAds } = require('../services/p2p');
const coingecko   = require('../services/coingecko');
const { cachedExecuteTool } = require('./toolCache');
const lifi        = require('../services/lifi');
const twitter     = require('../services/twitter');

// ─── HELPERS ──────────────────────────────────────────────────────────────

/**
 * Normalise chainId strings so "arbitrum one", "arb1", "arbitrum" all match.
 */
function normaliseChain(id = '') {
  const s = id.toLowerCase().trim();
  if (s.includes('arbitrum')) return 'arbitrum';
  if (s.includes('optimis')) return 'optimism';
  if (s.includes('base'))    return 'base';
  if (s.includes('bsc') || s.includes('bnb') || s.includes('bep20') || s === 'bnb smart chain') return 'bsc';
  if (s.includes('tron') || s.includes('trc')) return 'tron';
  if (s.includes('polygon') || s.includes('matic')) return 'polygon';
  if (s.includes('solana') || s === 'sol') return 'solana';
  if (s.includes('eth') || s.includes('erc20') || s === 'ethereum') return 'ethereum';
  if (s.includes('ton'))    return 'ton';
  if (s.includes('avax') || s.includes('avalanche')) return 'avalanche';
  if (s.includes('near'))   return 'near';
  if (s.includes('sui'))    return 'sui';
  return s;
}

/**
 * Estimate arrival time label from chainId.
 */
function arrivalLabel(chainId) {
  const id = normaliseChain(chainId);
  const instant = ['tron', 'bsc', 'solana', 'ton'];
  const fast    = ['arbitrum', 'base', 'optimism', 'polygon', 'avalanche'];
  const slow    = ['ethereum'];
  if (instant.includes(id)) return '~1–3 min';
  if (fast.includes(id))    return '~1–5 min';
  if (slow.includes(id))    return '~5–15 min';
  return '~2–5 min';
}

/**
 * Build a human-readable fee warning if a fee looks too high.
 */
function feeWarning(fee, coin) {
  const stables = ['USDT', 'USDC', 'BUSD', 'DAI'];
  if (stables.includes(coin.toUpperCase()) && fee >= 3) {
    return `⚠️ High fee alert: ${fee} ${coin} fee is unusually expensive. Consider a different network.`;
  }
  return null;
}

function exchangeNotFound(exchange) {
  return {
    error: `Exchange '${exchange}' not found.`,
    suggestion: "Supported exchanges: binance, bybit, bitget, kucoin, gateio, coinex, bingx, mexc, okx",
    supportedExchanges: ["binance", "bybit", "bitget", "kucoin", "gateio", "coinex", "bingx", "mexc", "okx"]
  };
}

// ── 1. get_withdrawal_fees ─────────────────────────────────────────────────
async function getWithdrawalFees({ exchange, coin }) {
  const doc = await ExchangeFee.findOne({ exchange: exchange.toLowerCase() });
  if (!doc) return { error: `Exchange '${exchange}' not in our database. Supported: binance, bybit, coinex, bitget, kucoin, gateio` };

  const coinData = doc.coins.find(c => c.symbol === coin.toUpperCase());
  if (!coinData) {
    return {
      error: `${coin.toUpperCase()} not found on ${doc.displayName}.`,
      suggestion: 'The coin may be listed under a different symbol, or not yet in our database.',
      availableCoins: doc.coins.map(c => c.symbol).slice(0, 20),
    };
  }

  const sorted = [...coinData.networks]
    .filter(n => n.isActive !== false)
    .sort((a, b) => a.withdrawFee - b.withdrawFee);

  return {
    exchange: doc.displayName,
    coin: coinData.symbol,
    lastUpdated: doc.lastUpdated,
    dataAge: Math.round((Date.now() - new Date(doc.lastUpdated)) / 3600000) + ' hours ago',
    networks: sorted.map(n => ({
      chain:          n.chain,
      chainId:        n.chainId,
      withdrawFee:    n.withdrawFee,
      withdrawFeeDisplay: `${n.withdrawFee} ${coinData.symbol}`,
      withdrawFeeUSD: n.withdrawFeeUSD != null ? `~$${n.withdrawFeeUSD}` : 'unknown',
      minWithdraw:    n.minWithdraw,
      minDeposit:     n.minDeposit,
      arrivalTime:    arrivalLabel(n.chainId),
      warning:        feeWarning(n.withdrawFee, coinData.symbol),
    })),
  };
}

// ── 2. find_cheapest_withdrawal ────────────────────────────────────────────
async function findCheapestWithdrawal({ exchange, coin, amount }) {
  const doc = await ExchangeFee.findOne({ exchange: exchange.toLowerCase() });
  if (!doc) return { error: `Exchange '${exchange}' not found.` };

  const coinData = doc.coins.find(c => c.symbol === coin.toUpperCase());
  if (!coinData) return { error: `${coin} not found on ${doc.displayName}.` };

  let networks = [...coinData.networks]
    .filter(n => n.isActive !== false)
    .sort((a, b) => a.withdrawFee - b.withdrawFee);

  if (amount !== undefined) {
    const valid = networks.filter(n => amount >= n.minWithdraw);
    if (valid.length === 0) {
      return {
        error: `Amount ${amount} ${coin} is below the minimum withdrawal on all networks for ${doc.displayName}.`,
        minimums: networks.map(n => ({ chain: n.chain, minWithdraw: n.minWithdraw })),
        suggestion: `Minimum needed: ${Math.min(...networks.map(n => n.minWithdraw))} ${coin} (via ${networks.sort((a,b)=>a.minWithdraw-b.minWithdraw)[0].chain})`,
      };
    }
    networks = valid;
  }

  const cheapest = networks[0];

  return {
    exchange: doc.displayName,
    coin: coinData.symbol,
    amount: amount || 'not specified',
    cheapest: {
      chain:          cheapest.chain,
      chainId:        cheapest.chainId,
      withdrawFee:    cheapest.withdrawFee,
      withdrawFeeUSD: cheapest.withdrawFeeUSD,
      minWithdraw:    cheapest.minWithdraw,
      arrivalTime:    arrivalLabel(cheapest.chainId),
      netReceived:    amount ? parseFloat((amount - cheapest.withdrawFee).toFixed(6)) : 'depends on amount',
    },
    warning: feeWarning(cheapest.withdrawFee, coin),
    allOptions: networks.slice(0, 6).map(n => ({
      chain:       n.chain,
      fee:         `${n.withdrawFee} ${coin}`,
      feeUSD:      n.withdrawFeeUSD ? `~$${n.withdrawFeeUSD}` : 'unknown',
      minWithdraw: n.minWithdraw,
      arrival:     arrivalLabel(n.chainId),
    })),
  };
}

// ── 3. get_bridge_route ────────────────────────────────────────────────────
async function getBridgeRoute({ fromChain, toChain, fromToken, toToken, amountUSD }) {
  try {
    return await lifi.getBestRoute({ fromChain, toChain, fromToken, toToken, amountUSD });
  } catch (err) {
    if (err.message?.includes('429') || err.message?.includes('rate')) {
      return {
        error: 'rate_limit',
        userMessage: '⏳ LI.FI bridge data is temporarily rate-limited. Try again in 60 seconds.',
        fallback: `For ${fromChain}→${toChain} bridges, check: bridge.arbitrum.io (Arbitrum), app.optimism.io (Optimism), or relay.link for any chain.`,
      };
    }
    return { error: err.message, userMessage: `Bridge route lookup failed: ${err.message}` };
  }
}

// ── 4. get_coin_chains ─────────────────────────────────────────────────────
async function getCoinChains({ coin }) {
  try {
    const id = await coingecko.resolveSymbol(coin);
    if (!id) return { error: `Coin '${coin}' not found on CoinGecko.`, suggestion: 'Check the symbol spelling.' };

    const data = await coingecko.getCoinPlatforms(id);
    const chains = Object.keys(data.platforms);

    return {
      coin: coin.toUpperCase(),
      coingeckoId: id,
      chainCount: chains.length,
      chains,
      contracts: data.platforms,
    };
  } catch (err) {
    if (err.response?.status === 429) {
      return {
        error: 'rate_limit',
        userMessage: '⏳ CoinGecko is rate-limiting requests right now. Cached data: ' + coin.toUpperCase() + ' is a widely-supported token available on Ethereum, BSC, Arbitrum, Polygon, and Tron for most major stablecoins.',
      };
    }
    return { error: err.message };
  }
}

// ── 5. get_coin_exchanges ──────────────────────────────────────────────────
async function getCoinExchanges({ coin }) {
  try {
    const id = await coingecko.resolveSymbol(coin);
    if (!id) return { error: `Coin '${coin}' not found on CoinGecko.` };

    const tickers = await coingecko.getCoinTickers(id);
    const DEX_KEYWORDS = ['uniswap', 'sushi', 'curve', 'raydium', 'orca', 'pancake', 'camelot', 'aerodrome', 'velodrome', 'dex', 'swap'];

    const allExchanges = [...new Set(tickers.map(t => t.market.name))];
    const cexList = allExchanges.filter(name => !DEX_KEYWORDS.some(d => name.toLowerCase().includes(d))).slice(0, 15);
    const dexList = allExchanges.filter(name => DEX_KEYWORDS.some(d => name.toLowerCase().includes(d))).slice(0, 10);

    const topByVolume = [...tickers]
      .sort((a, b) => (b.volume * b.last) - (a.volume * a.last))
      .slice(0, 5)
      .map(t => ({
        exchange: t.market.name,
        pair: `${t.base}/${t.target}`,
        volumeUSD: Math.round(t.volume * t.last),
      }));

    return { coin: coin.toUpperCase(), totalMarkets: tickers.length, cexList, dexList, topByVolume };
  } catch (err) {
    if (err.response?.status === 429) {
      return { error: 'rate_limit', userMessage: '⏳ CoinGecko rate limit hit. Try again in 60 seconds.' };
    }
    return { error: err.message };
  }
}

// ── 6. check_p2p_availability ──────────────────────────────────────────────
 
async function checkP2PAvailability({ country }) {
  const code        = country.toUpperCase();
  const allExchanges = await ExchangeFee.find({});
 
  // ── 1. Static country support (from ExchangeFee DB) ───────────────────
  // These fields (p2p, p2pCountries) still come from your seed/admin data.
  // They tell us WHICH exchanges operate in the country.
  const supported   = [];
  const unsupported = [];
 
  for (const ex of allExchanges) {
    if (ex.p2p && ex.p2pCountries.includes(code)) {
      supported.push({ exchange: ex.displayName, exchangeKey: ex.exchange, minUSD: ex.p2pMinUSD });
    } else {
      unsupported.push(ex.displayName);
    }
  }
 
  // ── 2. Live rate snapshot (from P2P API) ──────────────────────────────
  // Map country code → fiat currency for the live rate lookup
  const COUNTRY_FIAT = {
    KE: 'KES', NG: 'NGN', GH: 'GHS', ZA: 'ZAR',
    IN: 'INR', PK: 'PKR', TZ: 'TZS', UG: 'UGX',
    EG: 'EGP', MA: 'MAD', US: 'USD', GB: 'GBP',
  };
 
  const fiat      = COUNTRY_FIAT[code];
  let liveRates   = null;
 
  if (fiat) {
    try {
      const [buyResult, sellResult] = await Promise.all([
        fetchP2PAds({ exchange: 'all', asset: 'USDT', fiat, tradeType: 'BUY',  limit: 3 }),
        fetchP2PAds({ exchange: 'all', asset: 'USDT', fiat, tradeType: 'SELL', limit: 3 }),
      ]);
 
      liveRates = {
        fiat,
        asset:    'USDT',
        buyRate:  buyResult.summary.lowestRate,   // cheapest seller = best buy rate for user
        sellRate: sellResult.summary.highestRate, // highest buyer   = best sell rate for user
        avgBuy:   buyResult.summary.averageRate,
        avgSell:  sellResult.summary.averageRate,
        topBuyAds: buyResult.ads.slice(0, 2).map(a => ({
          exchange:       a.exchange,
          price:          a.price,
          minAmount:      a.minAmount,
          maxAmount:      a.maxAmount,
          paymentMethods: a.paymentMethods.slice(0, 2),
          merchant:       { name: a.merchant.name, completionRate: a.merchant.completionRate },
        })),
        topSellAds: sellResult.ads.slice(0, 2).map(a => ({
          exchange:       a.exchange,
          price:          a.price,
          minAmount:      a.minAmount,
          maxAmount:      a.maxAmount,
          paymentMethods: a.paymentMethods.slice(0, 2),
          merchant:       { name: a.merchant.name, completionRate: a.merchant.completionRate },
        })),
      };
    } catch (_) {
      // Live rates unavailable — still return static data
      liveRates = { error: 'Live rates temporarily unavailable', fiat };
    }
  }
 
  const MOBILE_MONEY = {
    KE: ['M-Pesa', 'Airtel Money'],
    NG: ['Bank Transfer', 'Opay', 'Palmpay'],
    GH: ['MTN Mobile Money', 'Vodafone Cash'],
    ZA: ['FNB', 'Standard Bank', 'Capitec'],
    TZ: ['M-Pesa TZ', 'Tigopesa', 'Halopesa'],
    UG: ['MTN MoMo', 'Airtel Money UG'],
    ET: ['Telebirr', 'CBE Birr'],
  };
 
  return {
    country:              code,
    fiat:                 fiat || 'unknown',
    supported,
    unsupported,
    hasMobileMoneySupport: ['KE','NG','GH','TZ','UG','ET','ZM','RW'].includes(code),
    paymentMethods:       MOBILE_MONEY[code] || ['Bank Transfer', 'Cash'],
    liveRates,
    recommendation:       supported.length > 0
      ? `For ${code}: Use ${supported[0].exchange} P2P (min $${supported[0].minUSD})${liveRates?.buyRate ? ` — current best buy rate: ${liveRates.buyRate} ${fiat}/USDT` : ''}`
      : `No P2P in our database for ${code}. Try: Noones.com or Paxful.com.`,
  };
}

// ── 7. plan_zero_gas_recovery ──────────────────────────────────────────────
async function planZeroGasRecovery({ stuckToken, stuckChain, stuckAmountUSD, userCountry, targetExchange }) {
  const country = (userCountry || 'KE').toUpperCase();
  const targetEx = (targetExchange || 'bybit').toLowerCase();
  const normStuckChain = normaliseChain(stuckChain);

  // Determine native gas token needed for the stuck chain
  let gasToken = 'USDT'; // fallback - most liquid
  if (['ethereum', 'arbitrum', 'base', 'optimism'].includes(normStuckChain)) {
    gasToken = 'ETH';
  } else if (normStuckChain === 'solana') {
    gasToken = 'SOL';
  } else if (normStuckChain === 'sui') {
    gasToken = 'SUI';
  } else if (normStuckChain === 'ton') {
    gasToken = 'TON';
  } else if (normStuckChain === 'near') {
    gasToken = 'NEAR';
  }

  // Step 1: Get P2P options — ALWAYS buy USDT first (most liquid, lowest mins)
  const p2p = await checkP2PAvailability({ country });
  let bestP2PBuy = null;
  try {
    // Prefer low-min USDT P2P
    const p2pAds = await findP2PBestRate({ country, coin: 'USDT', direction: 'BUY' });
    bestP2PBuy = p2pAds?.buy?.ads?.[0] || p2p.supported[0];
  } catch (e) {
    bestP2PBuy = p2p.supported[0];
  }

  // Step 2: Find best exchange + network for cheap small gas withdrawal
  const allExchanges = await ExchangeFee.find({});
  let bestGasExchange = null;
  let bestGasRoute = null;
  let minViableGas = Infinity;

  for (const ex of allExchanges) {
    const coinData = ex.coins.find(c => c.symbol === gasToken.toUpperCase());
    if (!coinData) continue;

    const validNetworks = coinData.networks
      .filter(n => n.isActive !== false)
      .sort((a, b) => (a.withdrawFee + (a.minWithdraw || 0)) - (b.withdrawFee + (b.minWithdraw || 0)));

    if (validNetworks.length > 0) {
      const candidate = validNetworks[0];
      const totalCost = (candidate.minWithdraw || 0) + candidate.withdrawFee;
      if (totalCost < minViableGas) {
        minViableGas = totalCost;
        bestGasExchange = ex;
        bestGasRoute = candidate;
      }
    }
  }

  // Fallback
  if (!bestGasExchange) {
    bestGasExchange = await ExchangeFee.findOne({ exchange: targetEx });
    const gasData = bestGasExchange?.coins.find(c => c.symbol === gasToken.toUpperCase());
    bestGasRoute = gasData?.networks?.filter(n => n.isActive !== false)[0];
  }

  // Recommend small realistic gas amount: $1.6 - $2.8 USD
  const gasNeeded = 2.2; // fixed safe small amount in USD equivalent

  const steps = [];

  // Live rate if available
  const liveRate = p2p.liveRates?.buyRate;
  const fiatAmount = liveRate ? `≈ ${(gasNeeded * liveRate).toFixed(0)} ${p2p.fiat}` : '';

  if (bestP2PBuy) {
    steps.push(
      `**Step 1 — Buy USDT via P2P (lowest limits):**
Buy ~$${gasNeeded.toFixed(1)} USDT on **${bestP2PBuy.exchange || bestP2PBuy.exchangeKey}** P2P (often min 150-300 KES). Pay with ${(p2p.paymentMethods || []).slice(0,2).join(' or ')}.` +
      (liveRate ? `\nCurrent best rate: **${liveRate} ${p2p.fiat}/USDT**` : '')
    );

    steps.push(
      `**Step 2 — Convert USDT to gas token on spot:**
On the exchange, swap USDT → **${gasToken}** (spot trade, very low fee).
Buy at least $${gasNeeded.toFixed(1)} worth of ${gasToken} (enough for gas + buffer).`
    );

    steps.push(
      `**Step 3 — Withdraw gas to your wallet:**
Withdraw **${gasToken}** via **${bestGasRoute?.chain || 'fast network'}** to your ${normStuckChain} wallet.
Fee: ~${bestGasRoute?.withdrawFee || '0.001'} ${gasToken} | Arrival: ${arrivalLabel(bestGasRoute?.chainId || 'bsc')}`
    );
  } else {
    steps.push(`**Step 1:** Buy small USDT on Noones.com or Paxful for your region.`);
    steps.push(`**Step 2:** Swap to ${gasToken} on spot and withdraw to wallet.`);
  }

  // Handle moving the stuck tokens
  steps.push(
    `**Step 4 — Recover your ${stuckToken}:**
Once you have gas in your wallet, send your ${stuckAmountUSD} USD worth of ${stuckToken} from ${stuckChain} to your target exchange deposit address.`
  );

  return {
    situation: `${stuckAmountUSD} USD of ${stuckToken} stuck on ${stuckChain} with zero gas`,
    gasToken,
    bestP2P: bestP2PBuy,
    bestGasExchange: bestGasExchange?.displayName || targetEx,
    gasNeededUSD: gasNeeded,
    totalEstimatedCostUSD: (gasNeeded + 0.5).toFixed(2),
    steps,
    p2pOptions: p2p.supported,
    liveRates: p2p.liveRates,
    recommendation: `Best small gas route: Buy USDT on P2P → swap to ${gasToken} → withdraw via low-fee network on ${bestGasExchange?.displayName || 'Bybit/OKX'}.`,
    warning: '⚠️ Verify current min trade/withdrawal fees on the exchange. Use merchants with ≥95% completion rate. Never send more than you can afford to test.',
  };
}

// ── 8. scan_giveaways ──────────────────────────────────────────────────────
// ── 8. scan_giveaways ──────────────────────────────────────────────────────
async function scanGiveaways({ exchange }) {
  try {
    // getGiveawaysForAgent reads from MongoDB cache — never calls Twitter live
    return await twitter.getGiveawaysForAgent(exchange || null);
  } catch (err) {
    return {
      error: err.message,
      userMessage: `Could not retrieve giveaways: ${err.message}`,
    };
  }
}

async function getGiveawayDetails({ giveawayId, exchange }) {
  let doc = await Giveaway.findOne({ tweetId: giveawayId });
  if (!doc && exchange) {
    doc = await Giveaway.findOne({ exchange, isActive: true }).sort({ confidence: -1 });
  }
  if (!doc) return { error: 'Giveaway not found' };

  // Analyze requirements more intelligently
  const analysis = analyzeParticipation(doc);

  return {
    ...doc.toObject(),
    participationGuide: analysis.guide,
    riskLevel: analysis.risk,
    recommended: analysis.recommended,
    exampleSteps: analysis.steps
  };
}

// ── 9. compare_exchanges ───────────────────────────────────────────────────
async function compareExchanges({ coin, chain, amount }) {
  const all = await ExchangeFee.find({});
  const results = [];

  for (const ex of all) {
    const coinData = ex.coins.find(c => c.symbol === coin.toUpperCase());
    if (!coinData) continue;

    let networks = coinData.networks.filter(n => n.isActive !== false);
    if (chain) {
      networks = networks.filter(n =>
        normaliseChain(n.chainId) === normaliseChain(chain) ||
        n.chain.toLowerCase().includes(chain.toLowerCase())
      );
    }
    if (amount !== undefined) {
      networks = networks.filter(n => amount >= n.minWithdraw);
    }
    if (networks.length === 0) continue;

    const cheapest = networks.sort((a, b) => a.withdrawFee - b.withdrawFee)[0];
    results.push({
      exchange:      ex.displayName,
      cheapestChain: cheapest.chain,
      fee:           cheapest.withdrawFee,
      feeUSD:        cheapest.withdrawFeeUSD,
      minWithdraw:   cheapest.minWithdraw,
      arrival:       arrivalLabel(cheapest.chainId),
    });
  }

  results.sort((a, b) => a.fee - b.fee);

  return {
    coin: coin.toUpperCase(),
    chain: chain || 'all chains',
    amount: amount || 'any',
    comparison: results,
    cheapest: results[0] || null,
    notFound: all.filter(ex => !results.find(r => r.exchange === ex.displayName)).map(ex => ex.displayName),
  };
}

// ── 10. plan_cross_exchange_transfer ───────────────────────────────────────
async function planCrossExchangeTransfer({ fromExchange, toExchange, coin, amount }) {
  const fromEx = fromExchange.toLowerCase();
  const toEx   = toExchange.toLowerCase();
  const sym    = coin.toUpperCase();

  const [fromDoc, toDoc] = await Promise.all([
    ExchangeFee.findOne({ exchange: fromEx }),
    ExchangeFee.findOne({ exchange: toEx }),
  ]);

  if (!fromDoc) return { error: `Source exchange '${fromExchange}' not in database.` };
  if (!toDoc)   return { error: `Destination exchange '${toExchange}' not in database.` };

  const fromCoin = fromDoc.coins.find(c => c.symbol === sym);
  const toCoin   = toDoc.coins.find(c => c.symbol === sym);

  // ── Case 1: Direct transfer possible ──────────────────────────────────
  if (fromCoin && toCoin) {
    const fromNetworks = fromCoin.networks.filter(n => n.isActive !== false);
    const toNetworks   = toCoin.networks.filter(n => n.isActive !== false);

    // Find overlapping networks (both can withdraw AND deposit)
    const overlaps = [];
    for (const wn of fromNetworks) {
      const wnNorm = normaliseChain(wn.chainId);
      const match  = toNetworks.find(dn => normaliseChain(dn.chainId) === wnNorm);
      if (match) {
        // Check minimum deposit
        const meetsMin = amount === undefined || (amount - wn.withdrawFee) >= match.minDeposit;
        overlaps.push({
          chain:           wn.chain,
          chainId:         wnNorm,
          withdrawFee:     wn.withdrawFee,
          withdrawFeeUSD:  wn.withdrawFeeUSD,
          minDeposit:      match.minDeposit,
          meetsMinDeposit: meetsMin,
          netReceived:     amount ? parseFloat((amount - wn.withdrawFee).toFixed(6)) : null,
          arrival:         arrivalLabel(wnNorm),
          warning:         !meetsMin
            ? `⚠️ After fee, you'd receive ${(amount - wn.withdrawFee).toFixed(4)} ${sym} but min deposit on ${toDoc.displayName} via ${wn.chain} is ${match.minDeposit} ${sym}`
            : feeWarning(wn.withdrawFee, sym),
        });
      }
    }

    if (overlaps.length > 0) {
      const valid    = overlaps.filter(o => o.meetsMinDeposit).sort((a, b) => a.withdrawFee - b.withdrawFee);
      const invalid  = overlaps.filter(o => !o.meetsMinDeposit);
      const best     = valid[0] || overlaps.sort((a, b) => a.withdrawFee - b.withdrawFee)[0];

      return {
        type:          'direct_transfer',
        from:          fromDoc.displayName,
        to:            toDoc.displayName,
        coin:          sym,
        recommended:   best,
        allRoutes:     overlaps.sort((a, b) => a.withdrawFee - b.withdrawFee),
        blockedRoutes: invalid.length > 0 ? invalid : undefined,
        summary: valid.length > 0
          ? `✅ Direct transfer possible via ${best.chain}. Fee: ${best.withdrawFee} ${sym}${amount ? `. You receive: ${best.netReceived} ${sym}` : ''}.`
          : `⚠️ ${sym} transfer possible but your amount may be below minimum deposit thresholds. Check amounts carefully.`,
      };
    }

    // Both have the coin but no overlapping networks
    return {
      type:    'no_common_network',
      from:    fromDoc.displayName,
      to:      toDoc.displayName,
      coin:    sym,
      problem: `${sym} is listed on both exchanges but they share no common deposit/withdrawal networks.`,
      fromNetworks: fromNetworks.map(n => n.chain),
      toNetworks:   toNetworks.map(n => n.chain),
      suggestion:   `Consider converting ${sym} to USDT or USDC which have wider network support.`,
      nextStep:     'Use find_conversion_route to find an alternative path.',
    };
  }

  // ── Case 2: Coin not listed on destination ─────────────────────────────
  if (fromCoin && !toCoin) {
    const conversionResult = await findConversionRoute({ fromExchange: fromEx, toExchange: toEx, fromCoin: sym, amount });
    return {
      type:    'conversion_required',
      from:    fromDoc.displayName,
      to:      toDoc.displayName,
      coin:    sym,
      problem: `${sym} is NOT listed on ${toDoc.displayName}. A conversion is required.`,
      ...conversionResult,
    };
  }

  // ── Case 3: Coin not listed on source ──────────────────────────────────
  if (!fromCoin) {
    return {
      type:    'not_on_source',
      from:    fromDoc.displayName,
      to:      toDoc.displayName,
      coin:    sym,
      problem: `${sym} does not appear in our database for ${fromDoc.displayName}.`,
      availableCoins: fromDoc.coins.map(c => c.symbol).slice(0, 20),
      suggestion: 'The coin may be listed under a different symbol or not yet synced. Check the exchange directly.',
    };
  }

  return { error: `${sym} not found on either exchange in our database.` };
}

// ── 11. check_coin_listed_on_exchange ──────────────────────────────────────
async function checkCoinListedOnExchange({ exchange, coin }) {
  const doc = await ExchangeFee.findOne({ exchange: exchange.toLowerCase() });
  if (!doc) return { error: `Exchange '${exchange}' not found.` };

  const coinData = doc.coins.find(c => c.symbol === coin.toUpperCase());

  if (!coinData) {
    return {
      listed:    false,
      exchange:  doc.displayName,
      coin:      coin.toUpperCase(),
      message:   `${coin.toUpperCase()} is NOT in our database for ${doc.displayName}.`,
      note:      'Database may not be complete. Verify directly on the exchange.',
      availableStables: doc.coins.filter(c => ['USDT','USDC','BUSD','DAI','TUSD'].includes(c.symbol)).map(c => c.symbol),
    };
  }

  const networks = coinData.networks.filter(n => n.isActive !== false);

  return {
    listed:           true,
    exchange:         doc.displayName,
    coin:             coinData.symbol,
    withdrawNetworks: networks.map(n => ({ chain: n.chain, chainId: n.chainId, fee: n.withdrawFee, minWithdraw: n.minWithdraw })),
    depositNetworks:  networks.map(n => ({ chain: n.chain, chainId: n.chainId, minDeposit: n.minDeposit })),
    lastUpdated:      doc.lastUpdated,
  };
}

// ── 12. get_deposit_networks ───────────────────────────────────────────────
async function getDepositNetworks({ exchange, coin }) {
  const doc = await ExchangeFee.findOne({ exchange: exchange.toLowerCase() });
  if (!doc) return { error: `Exchange '${exchange}' not found.` };

  const coinData = doc.coins.find(c => c.symbol === coin.toUpperCase());
  if (!coinData) {
    return {
      error:     `${coin.toUpperCase()} not found on ${doc.displayName} in our database.`,
      note:      'Verify deposit support directly on the exchange website.',
      stables:   doc.coins.filter(c => ['USDT','USDC'].includes(c.symbol)).map(c => c.symbol),
    };
  }

  const networks = coinData.networks.filter(n => n.isActive !== false);

  return {
    exchange:   doc.displayName,
    coin:       coinData.symbol,
    networks:   networks.map(n => ({
      chain:      n.chain,
      chainId:    n.chainId,
      minDeposit: n.minDeposit,
      depositFee: n.depositFee || 0,
      arrival:    arrivalLabel(n.chainId),
    })),
    lowestMinDeposit: Math.min(...networks.map(n => n.minDeposit || 0)),
    lastUpdated: doc.lastUpdated,
  };
}

// ── 13. find_common_networks ───────────────────────────────────────────────
async function findCommonNetworks({ fromExchange, toExchange, coin }) {
  const [fromDoc, toDoc] = await Promise.all([
    ExchangeFee.findOne({ exchange: fromExchange.toLowerCase() }),
    ExchangeFee.findOne({ exchange: toExchange.toLowerCase() }),
  ]);

  if (!fromDoc) return { error: `Source '${fromExchange}' not found.` };
  if (!toDoc)   return { error: `Destination '${toExchange}' not found.` };

  const sym      = coin.toUpperCase();
  const fromCoin = fromDoc.coins.find(c => c.symbol === sym);
  const toCoin   = toDoc.coins.find(c => c.symbol === sym);

  if (!fromCoin) return { error: `${sym} not on ${fromDoc.displayName} in our database.`, coinNotOnSource: true };
  if (!toCoin)   return { error: `${sym} not on ${toDoc.displayName} in our database.`, coinNotOnDest: true, suggestion: 'Use find_conversion_route to find an alternative path.' };

  const fromNets = fromCoin.networks.filter(n => n.isActive !== false);
  const toNets   = toCoin.networks.filter(n => n.isActive !== false);

  const common = [];
  for (const wn of fromNets) {
    const match = toNets.find(dn => normaliseChain(dn.chainId) === normaliseChain(wn.chainId));
    if (match) {
      common.push({
        chain:          wn.chain,
        chainId:        normaliseChain(wn.chainId),
        withdrawFee:    wn.withdrawFee,
        withdrawFeeUSD: wn.withdrawFeeUSD,
        minWithdraw:    wn.minWithdraw,
        minDeposit:     match.minDeposit,
        arrival:        arrivalLabel(wn.chainId),
        warning:        feeWarning(wn.withdrawFee, sym),
      });
    }
  }

  common.sort((a, b) => a.withdrawFee - b.withdrawFee);

  return {
    from:         fromDoc.displayName,
    to:           toDoc.displayName,
    coin:         sym,
    commonCount:  common.length,
    common,
    fromOnly:     fromNets.filter(n => !common.find(c => c.chainId === normaliseChain(n.chainId))).map(n => n.chain),
    toOnly:       toNets.filter(n => !common.find(c => c.chainId === normaliseChain(n.chainId))).map(n => n.chain),
    recommendation: common.length > 0
      ? `Use ${common[0].chain} — cheapest common network. Fee: ${common[0].withdrawFee} ${sym}`
      : `No common networks found for ${sym} between ${fromDoc.displayName} and ${toDoc.displayName}.`,
  };
}

// ── 14. find_conversion_route ──────────────────────────────────────────────
async function findConversionRoute({ fromExchange, toExchange, fromCoin, amount }) {
  const fromEx = fromExchange.toLowerCase();
  const toEx   = toExchange.toLowerCase();

  const [fromDoc, toDoc] = await Promise.all([
    ExchangeFee.findOne({ exchange: fromEx }),
    ExchangeFee.findOne({ exchange: toEx }),
  ]);

  if (!fromDoc) return { error: `Source '${fromExchange}' not found.` };
  if (!toDoc)   return { error: `Destination '${toExchange}' not found.` };

  // Try intermediary coins in priority order
  const INTERMEDIARIES = ['USDT', 'USDC', 'ETH', 'BNB', 'BTC'];
  const routes = [];

  for (const inter of INTERMEDIARIES) {
    if (inter === fromCoin.toUpperCase()) continue;

    const fromInter = fromDoc.coins.find(c => c.symbol === inter);
    const toInter   = toDoc.coins.find(c => c.symbol === inter);

    if (!fromInter || !toInter) continue;

    const fromNets = fromInter.networks.filter(n => n.isActive !== false);
    const toNets   = toInter.networks.filter(n => n.isActive !== false);

    // Find common networks for this intermediary
    for (const wn of fromNets) {
      const match = toNets.find(dn => normaliseChain(dn.chainId) === normaliseChain(wn.chainId));
      if (!match) continue;

      const conversionSpread = 0.001; // ~0.1% typical spot conversion
      const estimatedConversionCost = amount ? amount * conversionSpread : null;

      routes.push({
        intermediary:          inter,
        steps: [
          `Convert ${fromCoin.toUpperCase()} → ${inter} on ${fromDoc.displayName} (spot trade, ~${conversionSpread * 100}% spread)`,
          `Withdraw ${inter} from ${fromDoc.displayName} via ${wn.chain}`,
          `Deposit ${inter} to ${toDoc.displayName} via ${wn.chain}`,
        ],
        network:               wn.chain,
        chainId:               normaliseChain(wn.chainId),
        withdrawFee:           wn.withdrawFee,
        withdrawFeeUSD:        wn.withdrawFeeUSD,
        minDeposit:            match.minDeposit,
        estimatedConversionCost,
        totalEstimatedFeeUSD:  wn.withdrawFeeUSD ? parseFloat(wn.withdrawFeeUSD) + (estimatedConversionCost || 0) : null,
        arrival:               arrivalLabel(wn.chainId),
        warning:               feeWarning(wn.withdrawFee, inter),
      });
    }
  }

  if (routes.length === 0) {
    return {
      found: false,
      problem: `No conversion route found between ${fromDoc.displayName} and ${toDoc.displayName} for any common intermediary coin.`,
      suggestion: 'Consider using a DEX bridge (LI.FI) to convert on-chain, then deposit.',
    };
  }

  // Sort by withdrawal fee (lowest first)
  routes.sort((a, b) => a.withdrawFee - b.withdrawFee);

  return {
    found:          true,
    from:           fromDoc.displayName,
    to:             toDoc.displayName,
    originalCoin:   fromCoin.toUpperCase(),
    routes,
    bestRoute:      routes[0],
    summary:        `Best: Convert ${fromCoin.toUpperCase()}→${routes[0].intermediary} on ${fromDoc.displayName}, withdraw via ${routes[0].network}. Fee: ${routes[0].withdrawFee} ${routes[0].intermediary}`,
  };
}

// ── 15. estimate_transfer_cost ─────────────────────────────────────────────
async function estimateTransferCost({ fromExchange, toExchange, coin, network, amount }) {
  const doc = await ExchangeFee.findOne({ exchange: fromExchange.toLowerCase() });
  if (!doc) return { error: `Exchange '${fromExchange}' not found.` };

  const coinData = doc.coins.find(c => c.symbol === coin.toUpperCase());
  if (!coinData) return { error: `${coin} not on ${doc.displayName}.` };

  const net = coinData.networks.find(n => normaliseChain(n.chainId) === normaliseChain(network));
  if (!net) return { error: `Network '${network}' not found for ${coin} on ${doc.displayName}.` };

  const withdrawFee   = net.withdrawFee;
  const received      = parseFloat((amount - withdrawFee).toFixed(6));
  const feePercent    = ((withdrawFee / amount) * 100).toFixed(2);

  return {
    from:          doc.displayName,
    to:            toExchange || 'destination',
    coin:          coin.toUpperCase(),
    network:       net.chain,
    amount,
    withdrawFee,
    withdrawFeeUSD: net.withdrawFeeUSD ? `~$${net.withdrawFeeUSD}` : 'unknown',
    netReceived:   received,
    feePercent:    `${feePercent}%`,
    meetsMinWithdraw: amount >= net.minWithdraw,
    minWithdraw:   net.minWithdraw,
    arrival:       arrivalLabel(net.chainId),
    warning: received <= 0
      ? `⚠️ Fee (${withdrawFee}) exceeds or equals your amount (${amount}). You would receive nothing.`
      : feeWarning(withdrawFee, coin),
  };
}

// ── 16. get_coin_price ─────────────────────────────────────────────────────
async function getCoinPrice({ coin }) {
  try {
    const id = await coingecko.resolveSymbol(coin);
    if (!id) return { error: `Coin '${coin}' not found on CoinGecko.` };
    const price = await coingecko.getPrice(id);
    return { coin: coin.toUpperCase(), coingeckoId: id, priceUSD: price };
  } catch (err) {
    if (err.response?.status === 429) {
      return { error: 'rate_limit', userMessage: '⏳ CoinGecko rate limit hit. Try again in 60 seconds.' };
    }
    return { error: err.message };
  }
}

// ── 17. convert_amount ─────────────────────────────────────────────────────
async function convertAmount({ amount, fromUnit, toUnit }) {
  const stables = ['USDT', 'USDC', 'BUSD', 'DAI', 'TUSD'];
  const fromUp  = fromUnit.toUpperCase();
  const toUp    = toUnit.toUpperCase();

  if (fromUp === 'USD' && stables.includes(toUp)) return { result: amount, rate: 1, note: `${toUp} ≈ 1 USD` };
  if (toUp === 'USD' && stables.includes(fromUp)) return { result: amount, rate: 1, note: `${fromUp} ≈ 1 USD` };

  try {
    const coinSym  = fromUp === 'USD' ? toUp : fromUp;
    const id       = await coingecko.resolveSymbol(coinSym);
    if (!id) return { error: `Could not resolve price for ${coinSym}` };
    const price    = await coingecko.getPrice(id);
    if (!price) return { error: `No price data for ${coinSym}` };

    let result;
    if (fromUp === 'USD') {
      result = parseFloat((amount / price).toFixed(8));
    } else {
      result = parseFloat((amount * price).toFixed(2));
    }

    return {
      input: `${amount} ${fromUp}`,
      output: `${result} ${toUp}`,
      rate: price,
      result,
    };
  } catch (err) {
    return { error: err.message };
  }
}

// ── 18. find_cheapest_stable_exit ──────────────────────────────────────────
async function findCheapestStableExit({ exchange, fromCoin, amount, targetChain }) {
  const doc = await ExchangeFee.findOne({ exchange: exchange.toLowerCase() });
  if (!doc) return { error: `Exchange '${exchange}' not found.` };

  const STABLES = ['USDT', 'USDC', 'BUSD', 'DAI', 'TUSD'];
  const results = [];

  for (const stable of STABLES) {
    const stableData = doc.coins.find(c => c.symbol === stable);
    if (!stableData) continue;

    let networks = stableData.networks.filter(n => n.isActive !== false);
    if (targetChain) {
      networks = networks.filter(n => normaliseChain(n.chainId) === normaliseChain(targetChain));
    }
    if (networks.length === 0) continue;

    const cheapestNet = networks.sort((a, b) => a.withdrawFee - b.withdrawFee)[0];

    // Skip absurdly expensive routes
    if (feeWarning(cheapestNet.withdrawFee, stable)) {
      const cheaper = networks.find(n => n.withdrawFee < 3);
      if (!cheaper) continue;
    }

    const best = networks.sort((a, b) => a.withdrawFee - b.withdrawFee)[0];
    results.push({
      stable,
      network:    best.chain,
      chainId:    best.chainId,
      fee:        best.withdrawFee,
      feeUSD:     best.withdrawFeeUSD,
      minWithdraw: best.minWithdraw,
      conversionStep: fromCoin.toUpperCase() !== stable
        ? `Convert ${fromCoin.toUpperCase()} → ${stable} on ${doc.displayName} spot (~0.1% spread)`
        : 'No conversion needed',
      arrival:    arrivalLabel(best.chainId),
    });
  }

  results.sort((a, b) => a.fee - b.fee);

  return {
    exchange:   doc.displayName,
    fromCoin:   fromCoin.toUpperCase(),
    routes:     results,
    bestRoute:  results[0] || null,
    summary:    results[0]
      ? `Best exit: Convert to ${results[0].stable}, withdraw via ${results[0].network}. Fee: ${results[0].fee} ${results[0].stable}`
      : `No viable stable exit found on ${doc.displayName}.`,
  };
}

// ── 19. get_exchange_supported_chains ──────────────────────────────────────
async function getExchangeSupportedChains({ exchange }) {
  const doc = await ExchangeFee.findOne({ exchange: exchange.toLowerCase() });
  if (!doc) return { error: `Exchange '${exchange}' not found.` };

  const chainSet = new Map(); // chainId → { chain, coinCount, coins[] }

  for (const coin of doc.coins) {
    for (const net of coin.networks) {
      if (net.isActive === false) continue;
      const norm = normaliseChain(net.chainId);
      if (!chainSet.has(norm)) {
        chainSet.set(norm, { chainId: norm, chainName: net.chain, coins: [], coinCount: 0 });
      }
      const entry = chainSet.get(norm);
      entry.coins.push(coin.symbol);
      entry.coinCount++;
    }
  }

  const chains = Array.from(chainSet.values()).sort((a, b) => b.coinCount - a.coinCount);

  return {
    exchange:   doc.displayName,
    chainCount: chains.length,
    chains:     chains.map(c => ({ ...c, coins: [...new Set(c.coins)].slice(0, 10) })),
  };
}

// ── 20. plan_deposit_to_exchange ───────────────────────────────────────────
async function planDepositToExchange({ coin, currentChain, targetExchange, amountUSD }) {
  const doc = await ExchangeFee.findOne({ exchange: targetExchange.toLowerCase() });
  if (!doc) return { error: `Exchange '${targetExchange}' not found.` };

  const coinData  = doc.coins.find(c => c.symbol === coin.toUpperCase());
  const normChain = normaliseChain(currentChain);

  if (!coinData) {
    return {
      type:     'coin_not_listed',
      exchange: doc.displayName,
      coin:     coin.toUpperCase(),
      problem:  `${coin.toUpperCase()} is not in our database for ${doc.displayName}.`,
      suggestion: `Consider converting or spot buy/sell to USDT or USDC on specific exchanges which are widely supported, then deposit those instead.`,
    };
  }

  const networks   = coinData.networks.filter(n => n.isActive !== false);
  const directNet  = networks.find(n => normaliseChain(n.chainId) === normChain);

  if (directNet) {
    return {
      type:        'direct_deposit',
      exchange:    doc.displayName,
      coin:        coin.toUpperCase(),
      chain:       directNet.chain,
      minDeposit:  directNet.minDeposit,
      depositFee:  directNet.depositFee || 0,
      arrival:     arrivalLabel(directNet.chainId),
      instruction: `Send ${coin.toUpperCase()} from ${currentChain} directly to your ${doc.displayName} deposit address on the ${directNet.chain} network.`,
      warning:     directNet.minDeposit > 0 ? `⚠️ Min deposit: ${directNet.minDeposit} ${coin.toUpperCase()}` : null,
    };
  }

  // Need to bridge to a supported chain first
  const supportedChains = networks.map(n => ({ chain: n.chain, chainId: normaliseChain(n.chainId), minDeposit: n.minDeposit }));

  // Try to get a bridge route to cheapest-minimum chain
  const cheapestTarget = supportedChains.sort((a, b) => a.minDeposit - b.minDeposit)[0];
  let bridgeRoute = null;

  if (amountUSD) {
    try {
      bridgeRoute = await lifi.getBestRoute({
        fromChain: normChain, toChain: cheapestTarget.chainId,
        fromToken: coin, toToken: coin, amountUSD,
      });
      if (bridgeRoute?.error) bridgeRoute = null;
    } catch (_) {}
  }

  return {
    type:            'bridge_required',
    exchange:        doc.displayName,
    coin:            coin.toUpperCase(),
    currentChain,
    problem:         `${doc.displayName} does not support ${coin.toUpperCase()} deposits directly from ${currentChain}.`,
    supportedChains,
    recommendedTarget: cheapestTarget,
    bridgeRoute,
    steps: [
      bridgeRoute
        ? `Bridge ${coin.toUpperCase()} from ${currentChain} → ${cheapestTarget.chainId} via ${bridgeRoute.bridge || 'LI.FI'}. Cost: ~$${bridgeRoute.totalCostUSD || '0.50'}`
        : `Bridge ${coin.toUpperCase()} from ${currentChain} → ${cheapestTarget.chainId} using relay.link or LI.FI.`,
      `Deposit ${coin.toUpperCase()} to ${doc.displayName} via ${cheapestTarget.chain}. Min deposit: ${cheapestTarget.minDeposit} ${coin.toUpperCase()}`,
    ],
  };
}

// ── 21. check_withdrawal_minimums ──────────────────────────────────────────
async function checkWithdrawalMinimums({ exchange, coin, amount }) {
  const doc = await ExchangeFee.findOne({ exchange: exchange.toLowerCase() });
  if (!doc) return { error: `Exchange '${exchange}' not found.` };

  const coinData = doc.coins.find(c => c.symbol === coin.toUpperCase());
  if (!coinData) return { error: `${coin} not on ${doc.displayName}.` };

  const networks = coinData.networks.filter(n => n.isActive !== false);
  const available = networks.filter(n => amount >= n.minWithdraw).sort((a, b) => a.withdrawFee - b.withdrawFee);
  const blocked   = networks.filter(n => amount < n.minWithdraw).sort((a, b) => a.minWithdraw - b.minWithdraw);

  return {
    exchange:   doc.displayName,
    coin:       coin.toUpperCase(),
    amount,
    available:  available.map(n => ({
      chain: n.chain, fee: n.withdrawFee, minWithdraw: n.minWithdraw,
      netReceived: parseFloat((amount - n.withdrawFee).toFixed(6)),
    })),
    blocked: blocked.map(n => ({
      chain: n.chain, minRequired: n.minWithdraw,
      shortBy: parseFloat((n.minWithdraw - amount).toFixed(6)),
    })),
    canWithdraw:   available.length > 0,
    lowestMinimum: Math.min(...networks.map(n => n.minWithdraw)),
    recommendation: available.length > 0
      ? `Use ${available[0].chain} — cheapest available for your amount. Fee: ${available[0].fee} ${coin}`
      : `Amount ${amount} ${coin} is too low for all networks. Minimum needed: ${Math.min(...networks.map(n => n.minWithdraw))} ${coin}`,
  };
}

// ── 22. get_network_congestion ─────────────────────────────────────────────
async function getNetworkCongestion({ networks }) {
  // Static estimates — in production this would hit a gas oracle
  const NETWORK_DATA = {
    ethereum:  { speed: 'slow',    typicalMins: '5–15',  gasCostUSD: '$2–$20',  notes: 'Highly variable gas. Avoid for small transfers.' },
    arbitrum:  { speed: 'fast',    typicalMins: '1–3',   gasCostUSD: '$0.10–$0.50', notes: 'Best L2 for ETH ecosystem transfers.' },
    base:      { speed: 'fast',    typicalMins: '1–3',   gasCostUSD: '$0.05–$0.30', notes: 'Coinbase L2. Cheap and fast.' },
    optimism:  { speed: 'fast',    typicalMins: '1–3',   gasCostUSD: '$0.10–$0.50', notes: 'Reliable L2.' },
    bsc:       { speed: 'fast',    typicalMins: '1–3',   gasCostUSD: '$0.05–$0.20', notes: 'Most widely supported for P2P.' },
    polygon:   { speed: 'fast',    typicalMins: '2–5',   gasCostUSD: '$0.01–$0.10', notes: 'Very cheap but bridging can be slow.' },
    tron:      { speed: 'fast',    typicalMins: '1–3',   gasCostUSD: '$1–$5 energy', notes: 'Cheapest for USDT. Widely used for P2P. Requires TRX for energy.' },
    solana:    { speed: 'instant', typicalMins: '<1',    gasCostUSD: '$0.001',  notes: 'Fastest. Low exchange support for deposits.' },
    avalanche: { speed: 'fast',    typicalMins: '1–3',   gasCostUSD: '$0.10–$0.50', notes: 'C-Chain. Moderate exchange support.' },
    ton:       { speed: 'fast',    typicalMins: '1–3',   gasCostUSD: '$0.05',   notes: 'Growing support. Check exchange compatibility.' },
  };

  const result = {};
  for (const net of networks) {
    const norm = normaliseChain(net);
    result[norm] = NETWORK_DATA[norm] || { speed: 'unknown', notes: 'No data for this network.' };
  }

  return { networks: result, dataSource: 'static_estimates', note: 'For real-time gas prices, check etherscan.io/gastracker or bscscan.com' };
}

// ── 23. get_all_exchange_coins ─────────────────────────────────────────────
async function getAllExchangeCoins({ exchange, search }) {
  const searchTerm = search ? search.toUpperCase() : null;

  if (exchange.toLowerCase() === 'all') {
    const allDocs = await ExchangeFee.find({}).lean();
    let results = [];

    for (const doc of allDocs) {
      const coins = doc.coins
        .filter(c => !searchTerm || c.symbol.toUpperCase().includes(searchTerm))
        .map(c => {
          const activeNetworks = c.networks.filter(n => n.isActive !== false);
          return {
            symbol:       c.symbol,
            exchange:     doc.displayName,
            exchangeSlug: doc.exchange,
            networkCount: activeNetworks.length,
            cheapestFee:  activeNetworks.length 
              ? Math.min(...activeNetworks.map(n => n.withdrawFee)) 
              : null,
            cheapestChain: activeNetworks.length
              ? activeNetworks.sort((a, b) => a.withdrawFee - b.withdrawFee)[0]?.chain
              : null,
          };
        });

      results = results.concat(coins);
    }

    return {
      search: searchTerm || 'all',
      totalExchanges: allDocs.length,
      totalCoinsFound: results.length,
      coins: results.slice(0, 80), // prevent huge responses
    };
  }

  // Original single exchange logic
  const doc = await ExchangeFee.findOne({ exchange: exchange.toLowerCase() });
  if (!doc) return exchangeNotFound(exchange);
  //if (!doc) return { error: `Exchange '${exchange}' not found.` };

  let coins = doc.coins.map(c => ({
    symbol:       c.symbol,
    networkCount: c.networks.filter(n => n.isActive !== false).length,
    cheapestFee:  Math.min(...c.networks.filter(n => n.isActive !== false).map(n => n.withdrawFee)),
    cheapestChain: c.networks.filter(n => n.isActive !== false)
      .sort((a, b) => a.withdrawFee - b.withdrawFee)[0]?.chain,
  }));

  if (searchTerm) {
    coins = coins.filter(c => c.symbol.includes(searchTerm));
  }

  return {
    exchange:   doc.displayName,
    totalCoins: coins.length,
    coins:      coins.slice(0, 50),
    lastUpdated: doc.lastUpdated,
  };
}

// ── 24. compare_deposit_fees ───────────────────────────────────────────────
async function compareDepositFees({ coin, network }) {
  const all = await ExchangeFee.find({});
  const results = [];

  for (const ex of all) {
    const coinData = ex.coins.find(c => c.symbol === coin.toUpperCase());
    if (!coinData) continue;

    let networks = coinData.networks.filter(n => n.isActive !== false);
    if (network) {
      networks = networks.filter(n => normaliseChain(n.chainId) === normaliseChain(network));
    }
    if (networks.length === 0) continue;

    const cheapest = networks.sort((a, b) => (a.minDeposit || 0) - (b.minDeposit || 0))[0];
    results.push({
      exchange:    ex.displayName,
      network:     cheapest.chain,
      depositFee:  cheapest.depositFee || 0,
      minDeposit:  cheapest.minDeposit || 0,
    });
  }

  results.sort((a, b) => (a.minDeposit || 0) - (b.minDeposit || 0));

  return {
    coin:       coin.toUpperCase(),
    network:    network || 'all',
    comparison: results,
    lowestMinDeposit: results[0] || null,
  };
}

// ── 25. find_p2p_best_rate ─────────────────────────────────────────────────

async function findP2PBestRate({ country, coin = 'USDT', direction }) {
  const code = country.toUpperCase();
 
  const COUNTRY_FIAT = {
    KE: 'KES', NG: 'NGN', GH: 'GHS', ZA: 'ZAR',
    IN: 'INR', PK: 'PKR', TZ: 'TZS', UG: 'UGX',
    EG: 'EGP', MA: 'MAD', US: 'USD', GB: 'GBP',
  };
 
  const MOBILE_MONEY = {
    KE: ['M-Pesa', 'Airtel Money'],
    NG: ['Bank Transfer', 'Opay', 'Palmpay'],
    GH: ['MTN Mobile Money', 'Vodafone Cash'],
    ZA: ['FNB', 'Standard Bank', 'Capitec'],
    TZ: ['M-Pesa TZ', 'Tigopesa', 'Halopesa'],
    UG: ['MTN MoMo', 'Airtel Money UG'],
    ET: ['Telebirr', 'CBE Birr'],
  };
 
  const fiat = COUNTRY_FIAT[code];
  if (!fiat) {
    return {
      error:      `No fiat currency mapping for country ${code}`,
      suggestion: `Supported countries: ${Object.keys(COUNTRY_FIAT).join(', ')}`,
    };
  }
 
  // Determine which trade types to fetch
  const types = direction?.toUpperCase() === 'BUY'  ? ['BUY']  :
                direction?.toUpperCase() === 'SELL' ? ['SELL'] :
                ['BUY', 'SELL'];
 
  const fetches = types.map(t =>
    fetchP2PAds({ exchange: 'all', asset: coin.toUpperCase(), fiat, tradeType: t, limit: 10 })
      .then(r => ({ type: t, result: r }))
      .catch(e => ({ type: t, error: e.message }))
  );
 
  const fetched = await Promise.all(fetches);
  const output  = {};
 
  for (const { type, result, error } of fetched) {
    if (error) {
      output[type.toLowerCase()] = { error };
      continue;
    }
 
    output[type.toLowerCase()] = {
      bestRate:    type === 'BUY' ? result.summary.lowestRate : result.summary.highestRate,
      worstRate:   type === 'BUY' ? result.summary.highestRate : result.summary.lowestRate,
      averageRate: result.summary.averageRate,
      totalAds:    result.totalAds,
      // Top 5 ads with full merchant + payment details
      ads: result.ads.slice(0, 5).map(ad => ({
        exchange:       ad.exchange,
        price:          ad.price,
        minAmount:      ad.minAmount,
        maxAmount:      ad.maxAmount,
        available:      ad.available,
        paymentMethods: ad.paymentMethods,
        merchant: {
          name:           ad.merchant.name,
          completionRate: ad.merchant.completionRate,
          orderCount:     ad.merchant.orderCount,
          isVerified:     ad.merchant.isVerified,
        },
      })),
      exchangesWithData: result.summary.exchangesWithData,
      errors:            result.errors,
    };
  }
 
  return {
    country:        code,
    fiat,
    coin:           coin.toUpperCase(),
    direction:      direction || 'buy/sell',
    paymentMethods: MOBILE_MONEY[code] || ['Bank Transfer', 'Cash'],
    ...output,
    tip: `Always check merchant completion rate ≥95% and ≥100 orders. Never release crypto before confirming payment is cleared.`,
  };
}

// ── 26. get_exchange_info ──────────────────────────────────────────────────
async function getExchangeInfo({ exchange }) {
  const doc = await ExchangeFee.findOne({ exchange: exchange.toLowerCase() });
  if (!doc) return { error: `Exchange '${exchange}' not found. Supported: binance, bybit, coinex, bitget, kucoin, gateio` };

  return {
    exchange:      doc.displayName,
    website:       doc.website,
    twitter:       doc.twitterHandle,
    p2p:           doc.p2p,
    p2pMinUSD:     doc.p2pMinUSD,
    p2pCountries:  doc.p2pCountries,
    coinsInDB:     doc.coins.length,
    lastUpdated:   doc.lastUpdated,
    dataSource:    doc.dataSource,
  };
}

// ── 27. search_coin_across_exchanges ───────────────────────────────────────
async function searchCoinAcrossExchanges({ coin, minNetworks = 1 }) {
  const symbol = coin.toUpperCase();
  
  const allDocs = await ExchangeFee.find({}).lean();
  
  const results = [];

  for (const doc of allDocs) {
    const coinData = doc.coins.find(c => c.symbol === symbol);
    if (!coinData) continue;

    const activeNetworks = coinData.networks.filter(n => n.isActive !== false);
    
    if (activeNetworks.length < minNetworks) continue;

    const sorted = [...activeNetworks].sort((a, b) => a.withdrawFee - b.withdrawFee);
    const cheapest = sorted[0];

    results.push({
      exchange:       doc.displayName,
      exchangeSlug:   doc.exchange,
      coin:           symbol,
      networkCount:   activeNetworks.length,
      cheapestChain:  cheapest.chain,
      cheapestFee:    cheapest.withdrawFee,
      cheapestFeeUSD: cheapest.withdrawFeeUSD,
      minWithdraw:    cheapest.minWithdraw,
      allNetworks:    sorted.map(n => ({
        chain:       n.chain,
        chainId:     n.chainId,
        fee:         n.withdrawFee,
        minWithdraw: n.minWithdraw,
        arrival:     arrivalLabel(n.chainId),
      })),
    });
  }

  results.sort((a, b) => a.cheapestFee - b.cheapestFee);

  return {
    coin: symbol,
    foundOnExchanges: results.length,
    results: results,
    summary: results.length > 0 
      ? `Found ${symbol} on ${results.length} exchanges. Cheapest: ${results[0].exchange} via ${results[0].cheapestChain} (${results[0].cheapestFee} ${symbol})`
      : `No exchanges in our database currently support ${symbol}.`,
    suggestion: results.length === 0 
      ? "Try checking CoinGecko for listings and major CEXs (Binance, Bybit, KuCoin, MEXC, Gate.io)." 
      : "Use the cheapest option above for withdrawal.",
  };
}

// ── get_p2p_rates ──────────────────────────────────────────────────────────
// Returns best/avg/worst buy AND sell rates for a pair across all exchanges.
// Lightweight — used when agent just needs rate context, not full ad list.
async function getP2PRates({ asset, fiat }) {
  try {
    const [buyResult, sellResult] = await Promise.all([
      fetchP2PAds({ exchange: 'all', asset, fiat, tradeType: 'BUY',  limit: 5 }),
      fetchP2PAds({ exchange: 'all', asset, fiat, tradeType: 'SELL', limit: 5 }),
    ]);
 
    return {
      asset: asset.toUpperCase(),
      fiat:  fiat.toUpperCase(),
      buy: {
        bestRate:    buyResult.summary.lowestRate,   // lowest = cheapest seller
        worstRate:   buyResult.summary.highestRate,
        averageRate: buyResult.summary.averageRate,
        topAds: buyResult.ads.slice(0, 3).map(ad => ({
          exchange:       ad.exchange,
          price:          ad.price,
          minAmount:      ad.minAmount,
          maxAmount:      ad.maxAmount,
          paymentMethods: ad.paymentMethods.slice(0, 3),
          merchant:       ad.merchant,
        })),
      },
      sell: {
        bestRate:    sellResult.summary.highestRate, // highest = best buyer price
        worstRate:   sellResult.summary.lowestRate,
        averageRate: sellResult.summary.averageRate,
        topAds: sellResult.ads.slice(0, 3).map(ad => ({
          exchange:       ad.exchange,
          price:          ad.price,
          minAmount:      ad.minAmount,
          maxAmount:      ad.maxAmount,
          paymentMethods: ad.paymentMethods.slice(0, 3),
          merchant:       ad.merchant,
        })),
      },
      spread: (buyResult.summary.lowestRate && sellResult.summary.highestRate)
        ? parseFloat((buyResult.summary.lowestRate - sellResult.summary.highestRate).toFixed(4))
        : null,
      fetchedAt: new Date().toISOString(),
      errors: { ...buyResult.errors, ...sellResult.errors } || undefined,
    };
  } catch (err) {
    return {
      error:       err.message,
      userMessage: '⏳ P2P rate data temporarily unavailable. Try again shortly.',
    };
  }
}
 
// ── get_p2p_ads ────────────────────────────────────────────────────────────
// Returns full merchant ad list with all details.
// Used when agent needs to show merchant options or specific payment methods.
async function getP2PAds({ asset, fiat, tradeType, exchange = 'all', limit = 10 }) {
  try {
    const result = await fetchP2PAds({
      exchange: exchange || 'all',
      asset,
      fiat,
      tradeType: tradeType.toUpperCase(),
      limit: Math.min(limit || 10, 15),
    });
 
    return {
      asset:     result.asset,
      fiat:      result.fiat,
      tradeType: result.tradeType,
      totalAds:  result.totalAds,
      summary:   result.summary,
      // Trim to essentials so agent context stays lean
      ads: result.ads.slice(0, 8).map(ad => ({
        exchange:       ad.exchange,
        price:          ad.price,
        minAmount:      ad.minAmount,
        maxAmount:      ad.maxAmount,
        available:      ad.available,
        paymentMethods: ad.paymentMethods,
        merchant:       ad.merchant,
      })),
      errors:  result.errors,
      warning: result.stale ? '⚠️ Showing cached data — live fetch temporarily failed.' : undefined,
    };
  } catch (err) {
    return {
      error:       err.message,
      userMessage: '⏳ P2P ad data temporarily unavailable. Try again shortly.',
    };
  }
}

// ── Input sanitizer — coerce types the LLM sometimes gets wrong ────────────
function sanitizeInput(name, input) {
  const numericFields = ['amount', 'limit', 'amountUSD', 'stuckAmountUSD', 'minNetworks'];
  for (const field of numericFields) {
    if (input[field] !== undefined && typeof input[field] === 'string') {
      const parsed = parseFloat(input[field]);
      if (!isNaN(parsed)) input[field] = parsed;
    }
  }
  // Ensure arrays are arrays
  if (name === 'get_network_congestion' && typeof input.networks === 'string') {
    try { input.networks = JSON.parse(input.networks); } catch { input.networks = [input.networks]; }
  }
  return input;
}
 

// ── Main dispatcher ────────────────────────────────────────────────────────
async function executeTool(name, input) {
  const map = {
    // Original 9
    get_withdrawal_fees:          getWithdrawalFees,
    find_cheapest_withdrawal:     findCheapestWithdrawal,
    get_bridge_route:             getBridgeRoute,
    get_coin_chains:              getCoinChains,
    get_coin_exchanges:           getCoinExchanges,
    check_p2p_availability:       checkP2PAvailability,
    plan_zero_gas_recovery:       planZeroGasRecovery,
    scan_giveaways:               scanGiveaways,
    compare_exchanges:            compareExchanges,
    // New 17
    plan_cross_exchange_transfer: planCrossExchangeTransfer,
    check_coin_listed_on_exchange: checkCoinListedOnExchange,
    get_deposit_networks:         getDepositNetworks,
    find_common_networks:         findCommonNetworks,
    find_conversion_route:        findConversionRoute,
    estimate_transfer_cost:       estimateTransferCost,
    get_coin_price:               getCoinPrice,
    convert_amount:               convertAmount,
    find_cheapest_stable_exit:    findCheapestStableExit,
    get_exchange_supported_chains: getExchangeSupportedChains,
    plan_deposit_to_exchange:     planDepositToExchange,
    check_withdrawal_minimums:    checkWithdrawalMinimums,
    get_network_congestion:       getNetworkCongestion,
    get_all_exchange_coins:       getAllExchangeCoins,
    search_coin_across_exchanges: searchCoinAcrossExchanges,
    compare_deposit_fees:         compareDepositFees,
    find_p2p_best_rate:           findP2PBestRate,
    get_exchange_info:            getExchangeInfo,
    get_p2p_rates:               getP2PRates,
    get_p2p_ads:                 getP2PAds,
  };

  const fn = map[name];
  if (!fn) return { error: `Unknown tool: ${name}`, availableTools: Object.keys(map) };

  try {
    return await cachedExecuteTool(name, input, fn);
  } catch (err) {
    // Classify the error for better user messaging
    const msg = err.message || '';
    if (msg.includes('429') || msg.toLowerCase().includes('rate limit') || msg.toLowerCase().includes('too many')) {
      return {
        error:       'rate_limit',
        tool:        name,
        userMessage: '⏳ The data service is temporarily rate-limited. Here\'s what I can tell you from cached data — please retry in 60 seconds for live figures.',
        retryAfter:  60,
      };
    }
    if (msg.includes('ECONNREFUSED') || msg.includes('ETIMEDOUT') || msg.includes('network')) {
      return {
        error:       'network_error',
        tool:        name,
        userMessage: '🔌 Could not reach the data service right now. Our cached fee database is still available — let me answer from that.',
      };
    }
    if (msg.includes('401') || msg.includes('403') || msg.toLowerCase().includes('unauthorized')) {
      return {
        error:       'auth_error',
        tool:        name,
        userMessage: '🔑 API authentication issue detected. Falling back to cached data.',
      };
    }
    // Generic fallback
    return {
      error:       msg,
      tool:        name,
      userMessage: `Tool '${name}' encountered an issue: ${msg}. I'll answer from what I know.`,
    };
  }
}

module.exports = { executeTool };