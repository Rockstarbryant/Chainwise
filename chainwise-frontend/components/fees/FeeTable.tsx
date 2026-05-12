'use client';

import { useState, useEffect, useRef, useMemo } from 'react';
import { getExchanges, compareExchanges } from '@/lib/api';
import type { ExchangeFee } from '@/lib/types';
import { Search, X, ChevronDown, ChevronUp, Check, ExternalLink } from 'lucide-react';

const POPULAR_COINS = ['USDT', 'USDC', 'ETH', 'BTC', 'BNB', 'SOL'];

// Maximum chain pills to show inline before hiding the rest behind "more"
const CHAIN_PILLS_VISIBLE = 6;

interface AvailableChain {
  chain: string;
  chainId: string;
}

interface NetworkRow {
  chain: string;
  chainId: string;
  withdrawFee: number;
  withdrawFeeUSD: number | null;
  minWithdraw: number;
  minDeposit: number;
  depositFee: number;
  arrivalMins: number;
  isActive: boolean;
  dataSource?: string;
}

interface ComparisonRow {
  exchange: string;
  exchangeSlug: string;
  cheapestChain: string;
  withdrawFee: number;
  withdrawFeeUSD: number | null;
  minWithdraw: number;
  arrivalMins: number;
  allNetworks: NetworkRow[];
}

interface CompareResponse {
  coin: string;
  comparison: ComparisonRow[];
  availableChains: AvailableChain[];
}

export default function FeeTable() {
  const [exchanges, setExchanges]       = useState<ExchangeFee[]>([]);
  const [inputValue, setInputValue]     = useState('USDT');
  const [selectedCoin, setSelectedCoin] = useState('USDT');
  const [fullData, setFullData]         = useState<CompareResponse | null>(null);
  const [loading, setLoading]           = useState(true);
  const [noData, setNoData]             = useState(false);

  // Chain filter state
  const [selectedChain, setSelectedChain]     = useState<string | null>(null); // null = "all / cheapest"
  const [showAllChains, setShowAllChains]     = useState(false);

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const inputRef    = useRef<HTMLInputElement>(null);

  // Exchange metadata (website, twitter, p2p info) — joined by exchangeSlug
  useEffect(() => {
    getExchanges()
      .then(res => setExchanges(res.data || []))
      .catch(console.error);
  }, []);

  // Fetch comparison data when coin changes; reset chain selection
  useEffect(() => {
    const coin = selectedCoin.trim().toUpperCase();
    if (!coin) return;

    setLoading(true);
    setNoData(false);
    setSelectedChain(null);
    setShowAllChains(false);

    compareExchanges(coin)
      .then((res: any) => {
        const data: CompareResponse = res.data || { coin, comparison: [], availableChains: [] };
        setFullData(data);
        setNoData(data.comparison.length === 0);
      })
      .catch(() => {
        setFullData(null);
        setNoData(true);
      })
      .finally(() => setLoading(false));
  }, [selectedCoin]);

  // ---------------------------------------------------------------------------
  // Client-side chain filtering — no re-fetch needed
  // ---------------------------------------------------------------------------
  const displayComparison = useMemo<ComparisonRow[]>(() => {
    if (!fullData) return [];

    // "All chains" mode: show cheapest chain per exchange (already sorted by backend)
    if (!selectedChain) return fullData.comparison;

    return fullData.comparison
      .map(row => {
        const net = row.allNetworks.find(
          n => n.chainId?.toLowerCase() === selectedChain.toLowerCase()
        );
        if (!net) return null; // exchange doesn't support this chain → exclude from table
        return {
          ...row,
          cheapestChain:  net.chain,
          withdrawFee:    net.withdrawFee,
          withdrawFeeUSD: net.withdrawFeeUSD,
          minWithdraw:    net.minWithdraw,
          arrivalMins:    net.arrivalMins,
        } as ComparisonRow;
      })
      .filter((r): r is ComparisonRow => r !== null)
      .sort((a, b) => a.withdrawFee - b.withdrawFee);
  }, [fullData, selectedChain]);

  // How many exchanges support the currently selected chain
  const supportedCount = useMemo(() => {
    if (!fullData || !selectedChain) return fullData?.comparison.length ?? 0;
    return fullData.comparison.filter(r =>
      r.allNetworks.some(n => n.chainId?.toLowerCase() === selectedChain.toLowerCase())
    ).length;
  }, [fullData, selectedChain]);

  // Chain pills — hide overflow behind "X more" toggle
  const allChains    = fullData?.availableChains ?? [];
  const visibleChains = showAllChains ? allChains : allChains.slice(0, CHAIN_PILLS_VISIBLE);
  const hiddenCount  = allChains.length - CHAIN_PILLS_VISIBLE;

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value.toUpperCase();
    setInputValue(val);

    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (!val.trim()) return;

    debounceRef.current = setTimeout(() => {
      setSelectedCoin(val.trim());
    }, 500);
  };

  const handleClear = () => {
    setInputValue('');
    setFullData(null);
    setNoData(false);
    setSelectedChain(null);
    inputRef.current?.focus();
  };

  const handlePopularClick = (coin: string) => {
    setInputValue(coin);
    setSelectedCoin(coin);
  };

  const handleChainSelect = (chainId: string) => {
    setSelectedChain(prev => (prev === chainId ? null : chainId)); // toggle off on re-click
  };

  // Table column label changes based on mode
  const chainColumnLabel = selectedChain
    ? (allChains.find(c => c.chainId === selectedChain)?.chain ?? 'Chain')
    : 'Cheapest Chain';

  return (
    <div className="space-y-6 text-neutral-900 dark:text-neutral-100">

      {/* ── Search bar ────────────────────────────────────────────────────── */}
      <div className="space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center gap-4">
          <span className="font-mono text-xs text-neutral-500 dark:text-neutral-400 tracking-widest shrink-0">COMPARE</span>
          {/* suppressHydrationWarning: Proton Pass / 1Password inject data attrs
              client-side onto inputs. The server HTML lacks them, causing React
              hydration warnings. Suppressing here + telling managers to ignore. */}
          <div className="relative flex-1 max-w-md" suppressHydrationWarning>
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-neutral-400 pointer-events-none" />
            <input
              ref={inputRef}
              type="text"
              value={inputValue}
              onChange={handleInputChange}
              placeholder="Search any coin… e.g. XRP"
              className="
                w-full pl-10 pr-10 py-2
                font-mono text-sm bg-transparent
                border border-neutral-300 dark:border-neutral-700 rounded-md
                placeholder:text-neutral-400 dark:placeholder:text-neutral-500
                focus:outline-none focus:border-neutral-900 dark:focus:border-neutral-100
                transition-colors duration-200
              "
              spellCheck={false}
              autoComplete="off"
              data-1p-ignore="true"
              data-lpignore="true"
            />
            {inputValue && (
              <button
                onClick={handleClear}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-neutral-400 hover:text-neutral-900 dark:hover:text-neutral-100 transition-colors"
                aria-label="Clear search"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>

        {/* Popular quick-picks */}
        <div className="flex items-center gap-2 flex-wrap">
          <span className="font-mono text-[11px] text-neutral-500 dark:text-neutral-400 tracking-widest mr-2">POPULAR:</span>
          {POPULAR_COINS.map(coin => {
            const isActive = selectedCoin === coin && inputValue === coin;
            return (
              <button
                key={coin}
                onClick={() => handlePopularClick(coin)}
                className={`
                  font-mono text-[11px] px-3 py-1.5 rounded-md border transition-all duration-200
                  ${isActive
                    ? 'bg-neutral-900 text-white border-neutral-900 dark:bg-white dark:text-black dark:border-white'
                    : 'bg-transparent text-neutral-600 border-neutral-200 hover:border-neutral-400 dark:text-neutral-400 dark:border-neutral-800 dark:hover:border-neutral-600'
                  }
                `}
              >
                {coin}
              </button>
            );
          })}
        </div>
      </div>

      {/* ── Chain filter pills ────────────────────────────────────────────── */}
      {!loading && allChains.length > 1 && (
        <div className="rounded-lg border border-neutral-200 dark:border-neutral-800 bg-neutral-50 dark:bg-[#0a0a0a] px-4 py-4 space-y-3">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <span className="font-mono text-[11px] text-neutral-500 dark:text-neutral-400 tracking-widest uppercase">
              Filter by Chain
            </span>
            {selectedChain && (
              <span className="font-mono text-[11px] text-neutral-500 dark:text-neutral-400">
                {supportedCount} of {fullData?.comparison.length} exchange{fullData?.comparison.length !== 1 ? 's' : ''} support this chain
              </span>
            )}
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            {/* "All chains" pill */}
            <button
              onClick={() => setSelectedChain(null)}
              className={`
                font-mono text-[11px] px-3 py-1.5 rounded-md border transition-all duration-200 shrink-0
                ${!selectedChain
                  ? 'bg-neutral-900 text-white border-neutral-900 dark:bg-white dark:text-black dark:border-white'
                  : 'bg-white dark:bg-transparent text-neutral-600 border-neutral-200 hover:border-neutral-400 dark:text-neutral-400 dark:border-neutral-700 dark:hover:border-neutral-500'
                }
              `}
            >
              All chains
            </button>

            {/* Individual chain pills */}
            {visibleChains.map(c => {
              const isActive = selectedChain === c.chainId;
              // How many exchanges support this chain (shown on hover via title)
              const supportCount = fullData?.comparison.filter(r =>
                r.allNetworks.some(n => n.chainId?.toLowerCase() === c.chainId.toLowerCase())
              ).length ?? 0;

              return (
                <button
                  key={c.chainId}
                  onClick={() => handleChainSelect(c.chainId)}
                  title={`${supportCount} exchange${supportCount !== 1 ? 's' : ''} support ${c.chain}`}
                  className={`
                    font-mono text-[11px] px-3 py-1.5 rounded-md border transition-all duration-200 shrink-0 flex items-center gap-1.5
                    ${isActive
                      ? 'bg-neutral-900 text-white border-neutral-900 dark:bg-white dark:text-black dark:border-white'
                      : 'bg-white dark:bg-transparent text-neutral-600 border-neutral-200 hover:border-neutral-400 dark:text-neutral-400 dark:border-neutral-700 dark:hover:border-neutral-500'
                    }
                  `}
                >
                  {c.chain}
                  <span className={isActive ? 'text-neutral-300 dark:text-neutral-500' : 'text-neutral-400 dark:text-neutral-600'}>
                    {supportCount}
                  </span>
                </button>
              );
            })}

            {/* "X more / Show less" toggle */}
            {hiddenCount > 0 && (
              <button
                onClick={() => setShowAllChains(v => !v)}
                className="
                  flex items-center gap-1
                  font-mono text-[11px] px-3 py-1.5 rounded-md border
                  bg-white dark:bg-transparent border-neutral-200 dark:border-neutral-700 
                  text-neutral-600 dark:text-neutral-400
                  hover:border-neutral-400 dark:hover:border-neutral-500
                  transition-all duration-200 shrink-0
                "
              >
                {showAllChains ? (
                  <>Show less <ChevronUp className="w-3 h-3" /></>
                ) : (
                  <>+{hiddenCount} more <ChevronDown className="w-3 h-3" /></>
                )}
              </button>
            )}
          </div>
        </div>
      )}

      {/* ── Comparison table ─────────────────────────────────────────────── */}
      <div className="border border-neutral-200 dark:border-neutral-800 rounded-lg overflow-hidden bg-white dark:bg-[#0a0a0a]">
        <div className="px-4 py-3 border-b border-neutral-200 dark:border-neutral-800 flex items-center justify-between bg-neutral-50 dark:bg-[#0f0f0f]">
          <h2 className="font-mono text-[11px] text-neutral-900 dark:text-white tracking-widest uppercase">
            {selectedChain
              ? `${allChains.find(c => c.chainId === selectedChain)?.chain ?? 'CHAIN'} WITHDRAWAL — ${selectedCoin || '—'}`
              : `CHEAPEST ${selectedCoin || '—'} WITHDRAWAL BY EXCHANGE`
            }
          </h2>
          {selectedChain && (
            <button
              onClick={() => setSelectedChain(null)}
              className="flex items-center gap-1.5 font-mono text-[11px] text-neutral-500 hover:text-neutral-900 dark:text-neutral-400 dark:hover:text-white transition-colors"
            >
              <X className="w-3.5 h-3.5" /> Clear
            </button>
          )}
        </div>

        {!inputValue ? (
          <div className="px-4 py-12 text-center font-mono text-sm text-neutral-500 dark:text-neutral-400">
            Enter a coin symbol above to compare fees.
          </div>
        ) : loading ? (
          <div className="px-4 py-12 text-center font-mono text-sm text-neutral-500 dark:text-neutral-400 animate-pulse">
            Fetching live fee data…
          </div>
        ) : noData ? (
          <div className="px-4 py-12 text-center font-mono text-sm text-neutral-500 dark:text-neutral-400">
            No fee data found for <span className="font-semibold text-neutral-900 dark:text-white">{selectedCoin}</span>. Try another coin.
          </div>
        ) : displayComparison.length === 0 && selectedChain ? (
          <div className="px-4 py-12 text-center font-mono text-sm text-neutral-500 dark:text-neutral-400">
            No exchanges in our database support{' '}
            <span className="font-semibold text-neutral-900 dark:text-white">
              {allChains.find(c => c.chainId === selectedChain)?.chain ?? selectedChain}
            </span>{' '}
            withdrawals for <span className="font-semibold text-neutral-900 dark:text-white">{selectedCoin}</span>.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm font-mono min-w-[600px]">
              <thead className="bg-white dark:bg-[#0a0a0a]">
                <tr className="border-b border-neutral-200 dark:border-neutral-800">
                  <th className="text-left px-4 py-3 text-neutral-500 dark:text-neutral-400 tracking-widest text-[11px] font-normal uppercase w-12">Rank</th>
                  <th className="text-left px-4 py-3 text-neutral-500 dark:text-neutral-400 tracking-widest text-[11px] font-normal uppercase">Exchange</th>
                  <th className="text-left px-4 py-3 text-neutral-500 dark:text-neutral-400 tracking-widest text-[11px] font-normal uppercase">{chainColumnLabel}</th>
                  <th className="text-left px-4 py-3 text-neutral-500 dark:text-neutral-400 tracking-widest text-[11px] font-normal uppercase">Fee</th>
                  <th className="text-left px-4 py-3 text-neutral-500 dark:text-neutral-400 tracking-widest text-[11px] font-normal uppercase hidden sm:table-cell">Fee USD</th>
                  <th className="text-left px-4 py-3 text-neutral-500 dark:text-neutral-400 tracking-widest text-[11px] font-normal uppercase hidden md:table-cell">Min Withdraw</th>
                  <th className="text-left px-4 py-3 text-neutral-500 dark:text-neutral-400 tracking-widest text-[11px] font-normal uppercase hidden sm:table-cell">ETA</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-100 dark:divide-neutral-800/50">
                {displayComparison.map((row, i) => (
                  <tr
                    key={row.exchange}
                    className="hover:bg-neutral-50 dark:hover:bg-neutral-900/30 transition-colors"
                  >
                    <td className="px-4 py-4">
                      <span className="text-neutral-400 dark:text-neutral-500">
                        {String(i + 1).padStart(2, '0')}
                      </span>
                    </td>
                    <td className="px-4 py-4 font-medium">{row.exchange}</td>
                    <td className="px-4 py-4">
                      <span className="border border-neutral-200 dark:border-neutral-700 bg-neutral-50 dark:bg-neutral-900 text-neutral-700 dark:text-neutral-300 px-2.5 py-1 rounded-md text-[11px] whitespace-nowrap">
                        {row.cheapestChain}
                      </span>
                    </td>
                    <td className="px-4 py-4 whitespace-nowrap">
                      {row.withdrawFee === 0 ? (
                        <span className="font-bold">FREE</span>
                      ) : (
                        <span>{row.withdrawFee} <span className="text-neutral-400 text-xs">{selectedCoin}</span></span>
                      )}
                    </td>
                    <td className="px-4 py-4 text-neutral-500 dark:text-neutral-400 hidden sm:table-cell">
                      {row.withdrawFeeUSD != null ? `$${row.withdrawFeeUSD.toFixed(2)}` : '—'}
                    </td>
                    <td className="px-4 py-4 text-neutral-500 dark:text-neutral-400 whitespace-nowrap hidden md:table-cell">
                      {row.minWithdraw} <span className="text-xs">{selectedCoin}</span>
                    </td>
                    <td className="px-4 py-4 text-neutral-500 dark:text-neutral-400 hidden sm:table-cell">~{row.arrivalMins}m</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ── Exchange detail cards ─────────────────────────────────────────── */}
      {!loading && !noData && fullData && fullData.comparison.length > 0 && (
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
          {fullData.comparison.map(row => {
            // Join exchange metadata from the separate listExchanges call
            const meta = exchanges.find(e => e.exchange === row.exchangeSlug);

            // In "chain filter" mode: only show cards for exchanges that support the chain
            const networksToShow = selectedChain
              ? row.allNetworks.filter(n => n.chainId?.toLowerCase() === selectedChain.toLowerCase())
              : row.allNetworks;

            if (networksToShow.length === 0) return null;

            return (
              <div key={row.exchange} className="border border-neutral-200 dark:border-neutral-800 rounded-lg overflow-hidden bg-white dark:bg-[#0a0a0a]">
                {/* Card header */}
                <div className="px-5 py-4 border-b border-neutral-200 dark:border-neutral-800 flex items-center justify-between bg-neutral-50 dark:bg-[#0f0f0f]">
                  <div>
                    <h3 className="font-mono text-sm font-semibold text-neutral-900 dark:text-white">{row.exchange}</h3>
                    <div className="flex items-center gap-2 mt-1 font-mono text-[11px] text-neutral-500 dark:text-neutral-400">
                      {meta?.twitterHandle && <span>{meta.twitterHandle}</span>}
                      {meta?.twitterHandle && <span className="text-neutral-300 dark:text-neutral-700">•</span>}
                      {meta?.p2p ? (
                        <span className="flex items-center gap-1 text-neutral-700 dark:text-neutral-300">
                          P2P <Check className="w-3 h-3" /> <span className="text-neutral-400">(min ${meta.p2pMinUSD})</span>
                        </span>
                      ) : (
                        <span>No P2P</span>
                      )}
                    </div>
                  </div>
                  {meta?.website && (
                    <a
                      href={meta.website}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-1.5 font-mono text-[11px] text-neutral-600 hover:text-neutral-900 dark:text-neutral-400 dark:hover:text-white transition-colors"
                    >
                      Visit <ExternalLink className="w-3 h-3" />
                    </a>
                  )}
                </div>

                {/* Network rows */}
                <div className="divide-y divide-neutral-100 dark:divide-neutral-800/50">
                  {networksToShow.map((n, i) => {
                    const rowKey = `${n.chainId ?? n.chain}-${i}`;
                    const isCheapest = !selectedChain && i === 0;
                    
                    return (
                      <div key={rowKey} className="px-5 py-4">
                        {/* Chain name + CHEAPEST badge */}
                        <div className="flex items-center gap-3 mb-4 min-w-0">
                          {isCheapest && (
                            <span className="shrink-0 text-[10px] bg-neutral-900 text-white dark:bg-white dark:text-black font-semibold px-2 py-0.5 rounded-sm font-mono tracking-wider">
                              CHEAPEST
                            </span>
                          )}
                          <span className="font-mono text-sm font-medium truncate text-neutral-900 dark:text-neutral-200">
                            {n.chain}
                          </span>
                        </div>

                        {/* 3-column labeled data grid */}
                        <div className="grid grid-cols-3 gap-4">
                          {/* Fee */}
                          <div className="space-y-1">
                            <p className="font-mono text-[10px] text-neutral-500 dark:text-neutral-400 tracking-widest uppercase">
                              Fee
                            </p>
                            <p className="font-mono text-sm font-medium">
                              {n.withdrawFee === 0 ? 'FREE' : n.withdrawFee}
                            </p>
                            {n.withdrawFee !== 0 && (
                              <p className="font-mono text-[11px] text-neutral-500 dark:text-neutral-400">
                                {selectedCoin}
                                {n.withdrawFeeUSD != null && (
                                  <span className="ml-1 text-neutral-400 dark:text-neutral-500">
                                    (~${n.withdrawFeeUSD.toFixed(2)})
                                  </span>
                                )}
                              </p>
                            )}
                          </div>

                          {/* Min Withdraw */}
                          <div className="space-y-1">
                            <p className="font-mono text-[10px] text-neutral-500 dark:text-neutral-400 tracking-widest uppercase">
                              Min Withdraw
                            </p>
                            <p className="font-mono text-sm font-medium">
                              {n.minWithdraw}
                            </p>
                            <p className="font-mono text-[11px] text-neutral-500 dark:text-neutral-400">
                              {selectedCoin}
                            </p>
                          </div>

                          {/* ETA */}
                          <div className="space-y-1">
                            <p className="font-mono text-[10px] text-neutral-500 dark:text-neutral-400 tracking-widest uppercase">
                              ETA
                            </p>
                            <p className="font-mono text-sm font-medium">
                              ~{n.arrivalMins}
                            </p>
                            <p className="font-mono text-[11px] text-neutral-500 dark:text-neutral-400">
                              {n.arrivalMins === 1 ? 'minute' : 'minutes'}
                            </p>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}