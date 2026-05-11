'use client';

import { useState, useEffect, useRef, useMemo } from 'react';
import { getExchanges, compareExchanges } from '@/lib/api';
import type { ExchangeFee } from '@/lib/types';
import { Search, X, ChevronDown, ChevronUp } from 'lucide-react';

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
    <div className="space-y-6">

      {/* ── Search bar ────────────────────────────────────────────────────── */}
      <div className="space-y-3">
        <div className="flex items-center gap-3">
          <span className="font-mono text-xs text-brand-muted tracking-widest shrink-0">COMPARE</span>
          {/* suppressHydrationWarning: Proton Pass / 1Password inject data attrs
              client-side onto inputs. The server HTML lacks them, causing React
              hydration warnings. Suppressing here + telling managers to ignore. */}
          <div className="relative flex-1 max-w-xs" suppressHydrationWarning>
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-brand-muted pointer-events-none" />
            <input
              ref={inputRef}
              type="text"
              value={inputValue}
              onChange={handleInputChange}
              placeholder="Search any coin… e.g. XRP"
              className="
                w-full pl-9 pr-8 py-1.5
                font-mono text-xs text-brand-text placeholder:text-brand-muted
                bg-brand-surface border border-brand-border rounded-lg
                focus:outline-none focus:border-brand-dim
                transition-colors duration-150
              "
              spellCheck={false}
              autoComplete="off"
              data-1p-ignore="true"
              data-lpignore="true"
            />
            {inputValue && (
              <button
                onClick={handleClear}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-brand-muted hover:text-brand-text transition-colors"
              >
                <X className="w-3 h-3" />
              </button>
            )}
          </div>
        </div>

        {/* Popular quick-picks */}
        <div className="flex items-center gap-2 flex-wrap">
          <span className="font-mono text-[10px] text-brand-muted tracking-widest">POPULAR:</span>
          {POPULAR_COINS.map(coin => (
            <button
              key={coin}
              onClick={() => handlePopularClick(coin)}
              className={`
                font-mono text-[10px] px-2.5 py-1 rounded border transition-all duration-150
                ${selectedCoin === coin && inputValue === coin
                  ? 'bg-[rgba(0,255,136,0.1)] border-brand-dim text-brand-green'
                  : 'border-brand-border text-brand-muted hover:border-brand-muted hover:text-brand-text'
                }
              `}
            >
              {coin}
            </button>
          ))}
        </div>
      </div>

      {/* ── Chain filter pills ────────────────────────────────────────────── */}
      {!loading && allChains.length > 1 && (
        <div className="rounded-xl border border-brand-border bg-brand-surface/40 px-4 py-3 space-y-2">
          <div className="flex items-center justify-between">
            <span className="font-mono text-[10px] text-brand-muted tracking-widest">
              FILTER BY CHAIN
            </span>
            {selectedChain && (
              <span className="font-mono text-[10px] text-brand-muted">
                {supportedCount} of {fullData?.comparison.length} exchange{fullData?.comparison.length !== 1 ? 's' : ''} support this chain
              </span>
            )}
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            {/* "All chains" pill */}
            <button
              onClick={() => setSelectedChain(null)}
              className={`
                font-mono text-[10px] px-2.5 py-1 rounded border transition-all duration-150 shrink-0
                ${!selectedChain
                  ? 'bg-[rgba(0,255,136,0.1)] border-brand-dim text-brand-green'
                  : 'border-brand-border text-brand-muted hover:border-brand-muted hover:text-brand-text'
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
                    font-mono text-[10px] px-2.5 py-1 rounded border transition-all duration-150 shrink-0
                    ${isActive
                      ? 'bg-[rgba(0,255,136,0.1)] border-brand-dim text-brand-green'
                      : 'border-brand-border text-brand-muted hover:border-brand-muted hover:text-brand-text'
                    }
                  `}
                >
                  {c.chain}
                  <span className={`ml-1 ${isActive ? 'text-brand-green/60' : 'text-brand-muted/50'}`}>
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
                  font-mono text-[10px] px-2.5 py-1 rounded border
                  border-brand-border text-brand-muted
                  hover:border-brand-muted hover:text-brand-text
                  transition-all duration-150 shrink-0
                "
              >
                {showAllChains ? (
                  <>Show less <ChevronUp className="w-2.5 h-2.5" /></>
                ) : (
                  <>+{hiddenCount} more <ChevronDown className="w-2.5 h-2.5" /></>
                )}
              </button>
            )}
          </div>
        </div>
      )}

      {/* ── Comparison table ─────────────────────────────────────────────── */}
      <div className="rounded-xl border border-brand-border overflow-hidden">
        <div className="px-4 py-3 bg-brand-surface border-b border-brand-border flex items-center justify-between">
          <h2 className="font-mono text-xs text-brand-green tracking-widest">
            {selectedChain
              ? `${allChains.find(c => c.chainId === selectedChain)?.chain.toUpperCase() ?? 'CHAIN'} WITHDRAWAL — ${selectedCoin || '—'}`
              : `CHEAPEST ${selectedCoin || '—'} WITHDRAWAL BY EXCHANGE`
            }
          </h2>
          {selectedChain && (
            <button
              onClick={() => setSelectedChain(null)}
              className="flex items-center gap-1 font-mono text-[10px] text-brand-muted hover:text-brand-text transition-colors"
            >
              <X className="w-3 h-3" /> Clear filter
            </button>
          )}
        </div>

        {!inputValue ? (
          <div className="px-4 py-10 text-center font-mono text-xs text-brand-muted">
            Enter a coin symbol above to compare fees.
          </div>
        ) : loading ? (
          <div className="px-4 py-8 text-center font-mono text-xs text-brand-muted animate-pulse">
            Fetching live fee data…
          </div>
        ) : noData ? (
          <div className="px-4 py-10 text-center font-mono text-xs text-brand-muted">
            No fee data found for <span className="text-brand-green">{selectedCoin}</span>. Try another coin.
          </div>
        ) : displayComparison.length === 0 && selectedChain ? (
          <div className="px-4 py-10 text-center font-mono text-xs text-brand-muted">
            No exchanges in our database support{' '}
            <span className="text-brand-green">
              {allChains.find(c => c.chainId === selectedChain)?.chain ?? selectedChain}
            </span>{' '}
            withdrawals for <span className="text-brand-green">{selectedCoin}</span>.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs font-mono min-w-[480px]">
              <thead>
                <tr className="border-b border-brand-border">
                  <th className="text-left px-3 py-3 text-brand-muted tracking-widest font-normal w-10">Rank</th>
                  <th className="text-left px-3 py-3 text-brand-muted tracking-widest font-normal">Exchange</th>
                  <th className="text-left px-3 py-3 text-brand-muted tracking-widest font-normal">{chainColumnLabel}</th>
                  <th className="text-left px-3 py-3 text-brand-muted tracking-widest font-normal">Fee</th>
                  <th className="text-left px-3 py-3 text-brand-muted tracking-widest font-normal hidden sm:table-cell">Fee USD</th>
                  <th className="text-left px-3 py-3 text-brand-muted tracking-widest font-normal hidden md:table-cell">Min Withdraw</th>
                  <th className="text-left px-3 py-3 text-brand-muted tracking-widest font-normal hidden sm:table-cell">ETA</th>
                </tr>
              </thead>
              <tbody>
                {displayComparison.map((row, i) => (
                  <tr
                    key={row.exchange}
                    className="border-b border-brand-border/50 hover:bg-brand-surface/50 transition-colors"
                  >
                    <td className="px-3 py-3">
                      <span className={`
                        w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold
                        ${i === 0 ? 'bg-brand-green text-black' : 'bg-brand-border text-brand-muted'}
                      `}>
                        {i + 1}
                      </span>
                    </td>
                    <td className="px-3 py-3 text-brand-text">{row.exchange}</td>
                    <td className="px-3 py-3">
                      <span className="bg-[rgba(0,255,136,0.08)] border border-[rgba(0,255,136,0.15)] text-brand-green px-2 py-0.5 rounded text-[11px] whitespace-nowrap">
                        {row.cheapestChain}
                      </span>
                    </td>
                    <td className={`px-3 py-3 font-bold whitespace-nowrap ${row.withdrawFee === 0 ? 'text-brand-green' : 'text-brand-text'}`}>
                      {row.withdrawFee === 0 ? '🆓 FREE' : `${row.withdrawFee} ${selectedCoin}`}
                    </td>
                    <td className="px-3 py-3 text-brand-muted hidden sm:table-cell">
                      {row.withdrawFeeUSD != null ? `~$${row.withdrawFeeUSD}` : '—'}
                    </td>
                    <td className="px-3 py-3 text-brand-muted whitespace-nowrap hidden md:table-cell">
                      {row.minWithdraw} {selectedCoin}
                    </td>
                    <td className="px-3 py-3 text-brand-muted hidden sm:table-cell">~{row.arrivalMins}m</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ── Exchange detail cards ─────────────────────────────────────────── */}
      {/*
        Previously these cards used `exchanges` state which lacks `coins`,
        causing them to silently render nothing. They now read `allNetworks`
        from the comparison data, which is always populated.
        Exchange metadata (website, twitter, p2p) is joined via exchangeSlug.
      */}
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
              <div key={row.exchange} className="rounded-xl border border-brand-border overflow-hidden">
                {/* Card header */}
                <div className="px-4 py-3 bg-brand-surface border-b border-brand-border flex items-center justify-between">
                  <div>
                    <h3 className="font-mono text-sm text-brand-green font-bold">{row.exchange}</h3>
                    <p className="font-mono text-[10px] text-brand-muted">
                      {meta?.twitterHandle ?? ''}
                      {meta?.twitterHandle ? ' · ' : ''}
                      {meta?.p2p ? `P2P ✓ (min $${meta.p2pMinUSD})` : 'No P2P'}
                    </p>
                  </div>
                  {meta?.website && (
                    <a
                      href={meta.website}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="font-mono text-[10px] text-brand-blue hover:underline"
                    >
                      Visit ↗
                    </a>
                  )}
                </div>

                {/* Network rows */}
                <div className="divide-y-0">
                  {networksToShow.map((n, i) => {
                    // Composite key prevents duplicate-key warning when an exchange has two
                    // networks that share the same chain display name (e.g. two "TRC20" entries).
                    const rowKey = `${n.chainId ?? n.chain}-${i}`;
                    // "CHEAPEST" badge: only in "all chains" mode for the first row
                    const isCheapest = !selectedChain && i === 0;
                    return (
                      <div
                        key={rowKey}
                        className="px-4 py-3 border-b border-brand-border/50 last:border-0"
                      >
                        {/* Chain name + CHEAPEST badge */}
                        <div className="flex items-center gap-2 mb-2.5 min-w-0">
                          {isCheapest && (
                            <span className="shrink-0 text-[9px] bg-brand-green text-black font-bold px-1.5 py-0.5 rounded font-mono">
                              CHEAPEST
                            </span>
                          )}
                          <span className="font-mono text-xs text-brand-text font-medium truncate">
                            {n.chain}
                          </span>
                        </div>

                        {/* 3-column labeled data grid — clear on all screen sizes */}
                        <div className="grid grid-cols-3 gap-2">
                          {/* Fee */}
                          <div className="space-y-0.5">
                            <p className="font-mono text-[9px] text-brand-muted tracking-widest uppercase">
                              Fee
                            </p>
                            <p className={`font-mono text-xs font-bold leading-tight ${
                              n.withdrawFee === 0 ? 'text-brand-green' : 'text-brand-text'
                            }`}>
                              {n.withdrawFee === 0 ? 'FREE' : n.withdrawFee}
                            </p>
                            {n.withdrawFee !== 0 && (
                              <p className="font-mono text-[10px] text-brand-muted leading-tight">
                                {selectedCoin}
                                {n.withdrawFeeUSD != null && (
                                  <span className="ml-1 text-brand-muted/60">
                                    (~${n.withdrawFeeUSD})
                                  </span>
                                )}
                              </p>
                            )}
                          </div>

                          {/* Min Withdraw */}
                          <div className="space-y-0.5">
                            <p className="font-mono text-[9px] text-brand-muted tracking-widest uppercase">
                              Min&nbsp;Withdraw
                            </p>
                            <p className="font-mono text-xs text-brand-text font-bold leading-tight">
                              {n.minWithdraw}
                            </p>
                            <p className="font-mono text-[10px] text-brand-muted leading-tight">
                              {selectedCoin}
                            </p>
                          </div>

                          {/* ETA */}
                          <div className="space-y-0.5">
                            <p className="font-mono text-[9px] text-brand-muted tracking-widest uppercase">
                              ETA
                            </p>
                            <p className="font-mono text-xs text-brand-text font-bold leading-tight">
                              ~{n.arrivalMins}
                            </p>
                            <p className="font-mono text-[10px] text-brand-muted leading-tight">
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