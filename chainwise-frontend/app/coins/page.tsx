'use client';

import { useState, useCallback, useRef } from 'react';
import { Search, ExternalLink } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

const CHAIN_LABEL: Record<string, string> = {
  ethereum:              'Ethereum',
  'polygon-pos':         'Polygon',
  'arbitrum-one':        'Arbitrum',
  'base':                'Base',
  'optimistic-ethereum': 'Optimism',
  'binance-smart-chain': 'BNB Chain',
  solana:                'Solana',
  tron:                  'Tron',
  aptos:                 'Aptos',
  avalanche:             'Avalanche',
  'avalanche-2':         'Avalanche',
  'fantom':              'Fantom',
  'sui':                 'Sui',
};

const DEX_KEYWORDS = ['uniswap', 'sushi', 'curve', 'raydium', 'orca', 'pancake', 'camelot', 'aerodrome', 'velodrome'];

interface CoinResult {
  id: string;
  name: string;
  symbol: string;
  platforms: Record<string, string>;
  tickers: any[];
  price?: number;
  image?: string;
}

export default function CoinExplorer() {
  const [query, setQuery]           = useState('');
  const [dropdownResults, setDropdownResults] = useState<any[]>([]);
  const [selected, setSelected]     = useState<CoinResult | null>(null);
  const [searching, setSearching]   = useState(false);
  const [detailLoading, setDetailLoading] = useState(false);
  const [feeData, setFeeData]       = useState<any[]>([]);
  const debounceRef = useRef<NodeJS.Timeout | null>(null);

  // ── Fetch dropdown suggestions ───────────────────────────────────────────
  const fetchSuggestions = useCallback(async (q: string) => {
    if (q.trim().length < 2) { setDropdownResults([]); return; }
    setSearching(true);
    try {
      const res  = await fetch(`https://api.coingecko.com/api/v3/search?query=${encodeURIComponent(q)}`);
      const data = await res.json();
      setDropdownResults((data.coins || []).slice(0, 8));
    } catch {
      setDropdownResults([]);
    } finally {
      setSearching(false);
    }
  }, []);

  // ── Handle input change — debounced suggestions ──────────────────────────
  const handleQueryChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setQuery(val);
    // Clear selected result immediately when user types
    setSelected(null);
    setFeeData([]);

    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => fetchSuggestions(val), 350);
  };

  // ── Load full coin detail ────────────────────────────────────────────────
  const loadCoinDetail = async (coin: { id: string; name: string; symbol: string }) => {
    setDetailLoading(true);
    setSelected(null);
    setDropdownResults([]);
    setQuery(coin.name);

    try {
      const [coinRes, priceRes] = await Promise.all([
        fetch(`https://api.coingecko.com/api/v3/coins/${coin.id}?localization=false&tickers=true&market_data=true&community_data=false&developer_data=false`),
        fetch(`https://api.coingecko.com/api/v3/simple/price?ids=${coin.id}&vs_currencies=usd`),
      ]);
      const coinData  = await coinRes.json();
      const priceData = await priceRes.json();

      const result: CoinResult = {
        id:        coinData.id,
        name:      coinData.name,
        symbol:    coinData.symbol?.toUpperCase(),
        platforms: coinData.platforms || {},
        tickers:   coinData.tickers   || [],
        price:     priceData[coin.id]?.usd,
        image:     coinData.image?.small,
      };
      setSelected(result);

      // Fetch our own fee DB for this coin
      fetchFeeData(result.symbol);
    } catch {
      setSelected(null);
    } finally {
      setDetailLoading(false);
    }
  };

  // ── Fetch withdrawal fees from our backend ───────────────────────────────
  const fetchFeeData = async (symbol: string) => {
    try {
      const res  = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/fees/compare?coin=${symbol}`);
      const data = await res.json();
      setFeeData(data.data?.comparison || []);
    } catch {
      setFeeData([]);
    }
  };

  // ── Enter key / search button handler ────────────────────────────────────
  const handleSearch = async () => {
    if (!query.trim()) return;
    // If there are dropdown results, pick the first one
    if (dropdownResults.length > 0) {
      await loadCoinDetail(dropdownResults[0]);
      return;
    }
    // Otherwise search from scratch
    setSearching(true);
    try {
      const res  = await fetch(`https://api.coingecko.com/api/v3/search?query=${encodeURIComponent(query)}`);
      const data = await res.json();
      const coins = data.coins || [];
      if (coins.length > 0) await loadCoinDetail(coins[0]);
    } catch {}
    finally { setSearching(false); }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleSearch();
    }
    if (e.key === 'Escape') {
      setDropdownResults([]);
    }
  };

  // ── Derived lists ─────────────────────────────────────────────────────────
  const chains  = Object.entries(selected?.platforms || {});
  const dexList = (selected?.tickers || [])
    .filter(t => DEX_KEYWORDS.some(d => t.market?.identifier?.toLowerCase().includes(d)))
    .slice(0, 8);
  const cexList = (selected?.tickers || [])
    .filter(t => !DEX_KEYWORDS.some(d => t.market?.identifier?.toLowerCase().includes(d)))
    .slice(0, 12);

  return (
    <div className="h-full overflow-y-auto px-6 py-6">
      <div className="max-w-5xl mx-auto">

        {/* Header */}
        <div className="mb-6">
          <h1 className="font-mono font-bold text-2xl text-brand-green tracking-[0.15em]">COIN EXPLORER</h1>
          <p className="font-mono text-xs text-brand-muted mt-1 tracking-widest">
            SEARCH ANY COIN — CHAINS, EXCHANGES, DEPOSIT INFO
          </p>
        </div>

        {/* Search bar */}
        <div className="relative mb-6">
          <div className="flex items-center gap-2 bg-brand-surface border border-brand-border rounded-xl px-4 py-3 focus-within:border-brand-dim transition-colors">
            <Search className="w-4 h-4 text-brand-muted flex-shrink-0" />
            <input
              type="text"
              value={query}
              onChange={handleQueryChange}
              onKeyDown={handleKeyDown}
              placeholder="Search coin name or symbol — press Enter to search (e.g. BTC, USDT, Solana)"
              className="flex-1 bg-transparent font-mono text-sm text-brand-text placeholder:text-brand-muted outline-none"
              autoComplete="off"
            />
            {searching && (
              <div className="w-4 h-4 border-2 border-brand-green/30 border-t-brand-green rounded-full animate-spin flex-shrink-0" />
            )}
            <button
              onClick={handleSearch}
              disabled={!query.trim() || searching}
              className="flex-shrink-0 px-3 py-1.5 rounded-lg bg-brand-green/10 border border-brand-green/20 font-mono text-xs text-brand-green hover:bg-brand-green/20 disabled:opacity-40 disabled:cursor-not-allowed transition-all"
            >
              Search
            </button>
          </div>

          {/* Dropdown */}
          <AnimatePresence>
            {dropdownResults.length > 0 && !detailLoading && (
              <motion.div
                className="absolute top-full left-0 right-0 z-20 mt-1 bg-brand-surface border border-brand-border rounded-xl overflow-hidden shadow-2xl"
                initial={{ opacity: 0, y: -6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -6 }}
                transition={{ duration: 0.15 }}
              >
                {dropdownResults.map((coin, i) => (
                  <button
                    key={coin.id}
                    onClick={() => loadCoinDetail(coin)}
                    className="w-full flex items-center gap-3 px-4 py-3 hover:bg-[rgba(0,255,136,0.05)] transition-colors border-b border-brand-border/50 last:border-0 text-left"
                  >
                    {coin.thumb
                      ? <img src={coin.thumb} className="w-6 h-6 rounded-full flex-shrink-0" alt="" />
                      : <div className="w-6 h-6 rounded-full bg-brand-border flex-shrink-0" />
                    }
                    <span className="font-mono text-sm text-brand-text">{coin.name}</span>
                    <span className="font-mono text-xs text-brand-muted ml-auto">{coin.symbol?.toUpperCase()}</span>
                    {i === 0 && (
                      <span className="font-mono text-[9px] text-brand-green bg-brand-green/10 border border-brand-green/20 rounded px-1.5 py-0.5 ml-1">
                        ENTER
                      </span>
                    )}
                  </button>
                ))}
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Loading state */}
        {detailLoading && (
          <div className="text-center py-16 font-mono text-xs text-brand-muted animate-pulse tracking-widest">
            FETCHING COIN DATA...
          </div>
        )}

        {/* Empty state */}
        {!selected && !detailLoading && !query && (
          <div className="text-center py-16">
            <div className="text-4xl mb-3 opacity-20">🔍</div>
            <p className="font-mono text-xs text-brand-muted tracking-widest">
              TYPE A COIN NAME OR SYMBOL ABOVE
            </p>
            <p className="font-mono text-[11px] text-brand-muted mt-2 opacity-60">
              Try: BTC, ETH, USDT, SOL, BNB...
            </p>
          </div>
        )}

        {/* Coin detail */}
        {selected && !detailLoading && (
          <motion.div
            className="space-y-4"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.25 }}
          >
            {/* Coin header card */}
            <div className="flex items-center justify-between bg-brand-surface border border-brand-border rounded-xl px-5 py-4">
              <div className="flex items-center gap-3">
                {selected.image && (
                  <img src={selected.image} className="w-10 h-10 rounded-full" alt="" />
                )}
                <div>
                  <h2 className="font-mono font-bold text-lg text-brand-green">{selected.symbol}</h2>
                  <p className="font-mono text-xs text-brand-muted">
                    {selected.name}
                    <span className="ml-2 opacity-50">· id: {selected.id}</span>
                  </p>
                </div>
              </div>
              {selected.price != null && (
                <div className="text-right">
                  <div className="font-mono font-bold text-brand-text text-xl">
                    ${selected.price.toLocaleString(undefined, { maximumFractionDigits: 6 })}
                  </div>
                  <div className="font-mono text-[10px] text-brand-muted">USD Price</div>
                </div>
              )}
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">

              {/* Supported Chains */}
              <div className="bg-brand-surface border border-brand-border rounded-xl overflow-hidden">
                <div className="px-4 py-3 border-b border-brand-border flex items-center justify-between">
                  <h3 className="font-mono text-xs text-brand-green tracking-widest font-bold">
                    ⛓️ SUPPORTED CHAINS
                  </h3>
                  <span className="font-mono text-[10px] text-brand-muted">{chains.length} chains</span>
                </div>
                <div className="divide-y divide-brand-border/40 max-h-72 overflow-y-auto">
                  {chains.length === 0 ? (
                    <p className="px-4 py-3 font-mono text-xs text-brand-muted">
                      Native coin — no contract address needed
                    </p>
                  ) : (
                    chains.map(([chainId, address]) => (
                      <div key={chainId} className="px-4 py-2.5 flex items-center justify-between">
                        <span className="font-mono text-xs text-brand-text">
                          {CHAIN_LABEL[chainId] || chainId}
                        </span>
                        <span className="font-mono text-[10px] text-brand-muted">
                          {address
                            ? `${address.slice(0, 6)}...${address.slice(-4)}`
                            : <span className="text-brand-green">Native</span>
                          }
                        </span>
                      </div>
                    ))
                  )}
                </div>
              </div>

              {/* Withdrawal fees from our DB */}
              <div className="bg-brand-surface border border-brand-border rounded-xl overflow-hidden">
                <div className="px-4 py-3 border-b border-brand-border flex items-center justify-between">
                  <h3 className="font-mono text-xs text-brand-green tracking-widest font-bold">
                    💸 WITHDRAWAL FEES
                  </h3>
                  <span className="font-mono text-[10px] text-brand-muted">{selected.symbol}</span>
                </div>
                <div className="divide-y divide-brand-border/40 max-h-72 overflow-y-auto">
                  {feeData.length === 0 ? (
                    <p className="px-4 py-3 font-mono text-xs text-brand-muted">
                      {selected.symbol} not in fee database yet. Add it in Admin → Fee Manager.
                    </p>
                  ) : (
                    feeData.map((row, i) => (
                      <div key={i} className="px-4 py-2.5 flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          {i === 0 && (
                            <span className="font-mono text-[9px] bg-brand-green text-black px-1.5 py-0.5 rounded font-bold">
                              CHEAPEST
                            </span>
                          )}
                          <div>
                            <span className="font-mono text-xs text-brand-text">{row.exchange}</span>
                            <span className="font-mono text-[10px] text-brand-muted ml-2">
                              via {row.cheapestChain}
                            </span>
                          </div>
                        </div>
                        <span className={`font-mono text-xs font-bold ${row.withdrawFee === 0 ? 'text-brand-green' : 'text-brand-text'}`}>
                          {row.withdrawFee === 0 ? '🆓 FREE' : `${row.withdrawFee} ${selected.symbol}`}
                        </span>
                      </div>
                    ))
                  )}
                </div>
              </div>

              {/* CEX Listings */}
              <div className="bg-brand-surface border border-brand-border rounded-xl overflow-hidden">
                <div className="px-4 py-3 border-b border-brand-border flex items-center justify-between">
                  <h3 className="font-mono text-xs text-brand-green tracking-widest font-bold">
                    🏦 CEX LISTINGS
                  </h3>
                  <span className="font-mono text-[10px] text-brand-muted">{cexList.length} markets</span>
                </div>
                <div className="divide-y divide-brand-border/40 max-h-72 overflow-y-auto">
                  {cexList.map((t, i) => (
                    <div key={i} className="px-4 py-2.5 flex items-center justify-between">
                      <span className="font-mono text-xs text-brand-text">{t.market?.name}</span>
                      <span className="font-mono text-[11px] text-brand-muted">{t.base}/{t.target}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* DEX Listings */}
              <div className="bg-brand-surface border border-brand-border rounded-xl overflow-hidden">
                <div className="px-4 py-3 border-b border-brand-border flex items-center justify-between">
                  <h3 className="font-mono text-xs text-brand-green tracking-widest font-bold">
                    🔁 DEX LISTINGS
                  </h3>
                  <span className="font-mono text-[10px] text-brand-muted">{dexList.length} pools</span>
                </div>
                <div className="divide-y divide-brand-border/40 max-h-72 overflow-y-auto">
                  {dexList.length === 0 ? (
                    <p className="px-4 py-3 font-mono text-xs text-brand-muted">No DEX listings found</p>
                  ) : (
                    dexList.map((t, i) => (
                      <div key={i} className="px-4 py-2.5 flex items-center justify-between">
                        <span className="font-mono text-xs text-brand-text">{t.market?.name}</span>
                        <span className="font-mono text-[11px] text-brand-muted">{t.base}/{t.target}</span>
                      </div>
                    ))
                  )}
                </div>
              </div>

            </div>
          </motion.div>
        )}
      </div>
    </div>
  );
}