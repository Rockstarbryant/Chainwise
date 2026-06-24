'use client';

import { useState, useEffect, useRef, useMemo } from 'react';
import { getExchanges, compareExchanges } from '@/lib/api';
import type { ExchangeFee } from '@/lib/types';
import { Search, X, ChevronDown, ChevronUp, Check, ExternalLink } from 'lucide-react';

const POPULAR_COINS = ['USDT', 'USDC', 'ETH', 'BTC', 'BNB', 'SOL'];

const CHAIN_PILLS_VISIBLE = 6;

// Distinct solid colors for the exchange column cells based on index/rank
const EXCHANGE_SOLID_COLORS = [
  'bg-red-500 text-white dark:bg-red-700',
  'bg-orange-500 text-white dark:bg-orange-700',
  'bg-amber-500 text-black dark:bg-amber-600 dark:text-white',
  'bg-yellow-400 text-black dark:bg-yellow-600 dark:text-white',
  'bg-lime-500 text-black dark:bg-lime-700 dark:text-white',
  'bg-emerald-500 text-white dark:bg-emerald-700',
  'bg-teal-500 text-white dark:bg-teal-700',
  'bg-cyan-500 text-black dark:bg-cyan-700 dark:text-white',
  'bg-sky-500 text-white dark:bg-sky-700',
  'bg-blue-500 text-white dark:bg-blue-700',
  'bg-indigo-500 text-white dark:bg-indigo-700',
  'bg-violet-500 text-white dark:bg-violet-700',
  'bg-purple-500 text-white dark:bg-purple-700',
  'bg-fuchsia-500 text-white dark:bg-fuchsia-700',
  'bg-pink-500 text-white dark:bg-pink-700',
  'bg-rose-500 text-white dark:bg-rose-700',
];

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
  minDeposit: number;
  arrivalMins: number;
  allNetworks: NetworkRow[];
}

interface CompareResponse {
  coin: string;
  priceUSD?: number | null;
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

  const [selectedChain, setSelectedChain]     = useState<string | null>(null);
  const [showAllChains, setShowAllChains]     = useState(false);

  const [expandedCards, setExpandedCards] = useState<Record<string, boolean>>({});

  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);

  const inputRef    = useRef<HTMLInputElement>(null);

  const toggleCard = (slug: string) => {
    setExpandedCards(prev => ({ ...prev, [slug]: !prev[slug] }));
  };

  const expandAll = () => {
    if (!fullData) return;
    const next: Record<string, boolean> = {};
    fullData.comparison.forEach(r => { next[r.exchangeSlug] = true; });
    setExpandedCards(next);
  };

  const collapseAll = () => {
    setExpandedCards({});
  };

  useEffect(() => {
    getExchanges()
      .then(res => setExchanges(res.data || []))
      .catch(console.error);
  }, []);

  useEffect(() => {
    const coin = selectedCoin.trim().toUpperCase();
    if (!coin) return;

    setLoading(true);
    setNoData(false);
    setSelectedChain(null);
    setShowAllChains(false);
    setExpandedCards({});

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

  const fetchSuggestions = async (q: string) => {
  if (q.length < 1) { setSuggestions([]); setShowSuggestions(false); return; }
  try {
    // Fix: use your backend API URL, not just /api/fees/search
    const base = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000';
    const res = await fetch(`${base}/api/fees/search?q=${encodeURIComponent(q)}`);
    const data = await res.json();
    setSuggestions(data.data || []);
    setShowSuggestions((data.data || []).length > 0);
  } catch (_) {
    setSuggestions([]);
  }
};

  const displayComparison = useMemo<ComparisonRow[]>(() => {
    if (!fullData) return [];
    if (!selectedChain) return fullData.comparison;

    return fullData.comparison
      .map(row => {
        const net = row.allNetworks.find(
          n => n.chainId?.toLowerCase() === selectedChain.toLowerCase()
        );
        if (!net) return null;
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

  const supportedCount = useMemo(() => {
    if (!fullData || !selectedChain) return fullData?.comparison.length ?? 0;
    return fullData.comparison.filter(r =>
      r.allNetworks.some(n => n.chainId?.toLowerCase() === selectedChain.toLowerCase())
    ).length;
  }, [fullData, selectedChain]);

  const allChains    = fullData?.availableChains ?? [];
  const visibleChains = showAllChains ? allChains : allChains.slice(0, CHAIN_PILLS_VISIBLE);
  const hiddenCount  = allChains.length - CHAIN_PILLS_VISIBLE;

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
  const val = e.target.value.toUpperCase();
  setInputValue(val);
  fetchSuggestions(val); // autocomplete still works as you type
};

// Fires on Enter key
const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
  if (e.key === 'Enter' && inputValue.trim()) {
    setShowSuggestions(false);
    setSelectedCoin(inputValue.trim());
  }
};

// Fires on Search button click
const handleSearch = () => {
  if (inputValue.trim()) {
    setShowSuggestions(false);
    setSelectedCoin(inputValue.trim());
  }
};

  const handleClear = () => {
  setInputValue('');
  setFullData(null);
  setNoData(false);
  setSelectedCoin('');    // ← clear selected coin too
  setSelectedChain(null);
  setSuggestions([]);
  setShowSuggestions(false);
  inputRef.current?.focus();
};

  const handlePopularClick = (coin: string) => {
    setInputValue(coin);
    setSelectedCoin(coin);
  };

  const handleChainSelect = (chainId: string) => {
    setSelectedChain(prev => (prev === chainId ? null : chainId));
  };

  const chainColumnLabel = selectedChain
    ? (allChains.find(c => c.chainId === selectedChain)?.chain ?? 'Chain')
    : 'Cheapest Chain';

  return (
    <div className="space-y-6 text-slate-900 dark:text-slate-100 bg-slate-50 dark:bg-slate-900 p-6 rounded-xl">

      {/* ── Search bar ────────────────────────────────────────────────────── */}
      <div className="space-y-4 bg-white dark:bg-slate-950 p-4 border-2 border-pink-500 rounded-lg">
        <div className="flex flex-col sm:flex-row sm:items-center gap-4">
          <span className="font-mono text-xs bg-pink-600 text-white px-3 py-1 rounded tracking-widest shrink-0 font-bold">COMPARE</span>
          <div className="relative flex-1 max-w-md">
  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 
                     text-pink-600 pointer-events-none" />
  <input
    ref={inputRef}
    type="text"
    value={inputValue}
    onChange={handleInputChange}
    onKeyDown={handleKeyDown}
    onBlur={() => setTimeout(() => setShowSuggestions(false), 150)}
    placeholder="Search any coin… e.g. XRP, CITY, SOL"
    className="
      w-full pl-10 pr-10 py-2
      font-mono text-sm bg-pink-100 dark:bg-pink-950
      border-2 border-pink-400 rounded-l-md
      text-pink-900 dark:text-pink-100
      placeholder:text-pink-500
      focus:outline-none focus:border-pink-600
    "
    spellCheck={false}
    autoComplete="off"
  />
  {inputValue && (
    <button
      onClick={handleClear}
      className="absolute right-3 top-1/2 -translate-y-1/2 text-pink-600"
    >
      <X className="w-4 h-4" />
    </button>
  )}

  {/* Autocomplete dropdown */}
  {showSuggestions && suggestions.length > 0 && (
    <div className="absolute top-full left-0 right-0 z-50 mt-1 
                    bg-slate-900 border-2 border-pink-400 rounded-md 
                    shadow-lg max-h-48 overflow-y-auto">
      {suggestions.map(coin => (
        <button
          key={coin}
          onMouseDown={() => {
            setInputValue(coin);
            setSelectedCoin(coin); // selecting suggestion = immediate search
            setShowSuggestions(false);
          }}
          className="w-full text-left px-4 py-2 font-mono text-sm 
                     hover:bg-pink-950 text-pink-100 font-bold"
        >
          {coin}
        </button>
      ))}
    </div>
  )}
</div>

{/* Search button */}
<button
  onClick={handleSearch}
  disabled={!inputValue.trim()}
  className="
    px-4 py-2 font-mono text-sm font-black
    bg-pink-600 hover:bg-pink-700 text-white
    border-2 border-pink-700 rounded-r-md
    disabled:opacity-40 disabled:cursor-not-allowed
    transition-colors
  "
>
  SEARCH
</button>
        </div>

        {/* Popular quick-picks */}
        <div className="flex items-center gap-2 flex-wrap">
          <span className="font-mono text-[11px] text-fuchsia-700 dark:text-fuchsia-400 tracking-widest mr-2 font-bold">POPULAR:</span>
          {POPULAR_COINS.map(coin => {
            const isActive = selectedCoin === coin && inputValue === coin;
            return (
              <button
                key={coin}
                onClick={() => handlePopularClick(coin)}
                className={`
                  font-mono text-[11px] px-3 py-1.5 rounded-md border-2 font-bold
                  ${isActive
                    ? 'bg-fuchsia-600 text-white border-fuchsia-700'
                    : 'bg-fuchsia-200 text-fuchsia-900 border-fuchsia-400 dark:bg-fuchsia-900 dark:text-fuchsia-100'
                  }
                `}
              >
                {coin}
              </button>
            );
          })}
        </div>

        {/* Live Coin Price */}
        {fullData?.priceUSD !== undefined && (
          <div className="flex items-center gap-3 mt-2 text-sm font-mono bg-emerald-100 dark:bg-emerald-950 border-2 border-emerald-500 p-2 rounded">
            <span className="text-emerald-900 dark:text-emerald-100 font-bold">Current Price:</span>
            {fullData.priceUSD ? (
              <span className="text-emerald-800 dark:text-emerald-300 font-black">
                ${fullData.priceUSD.toLocaleString(undefined, {
                  minimumFractionDigits: 2,
                  maximumFractionDigits: 8,
                })}
              </span>
            ) : (
              <span className="text-emerald-700">—</span>
            )}
          </div>
        )}
      </div>

      {/* ── Chain filter pills ────────────────────────────────────────────── */}
      {!loading && allChains.length > 1 && (
        <div className="rounded-lg border-2 border-violet-500 bg-violet-100 dark:bg-violet-950 px-4 py-4 space-y-3">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <span className="font-mono text-[11px] bg-violet-600 text-white px-2 py-0.5 rounded tracking-widest uppercase font-bold">
              Filter by Chain
            </span>
            {selectedChain && (
              <span className="font-mono text-[11px] text-violet-900 dark:text-violet-200 bg-violet-300 dark:bg-violet-800 px-2 py-0.5 rounded font-bold">
                {supportedCount} of {fullData?.comparison.length} exchange{fullData?.comparison.length !== 1 ? 's' : ''} support this chain
              </span>
            )}
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            <button
              onClick={() => setSelectedChain(null)}
              className={`
                font-mono text-[11px] px-3 py-1.5 rounded-md border-2 font-bold
                ${!selectedChain
                  ? 'bg-violet-700 text-white border-violet-800'
                  : 'bg-white text-violet-900 border-violet-400 dark:bg-slate-900 dark:text-violet-100'
                }
              `}
            >
              All chains
            </button>

            {visibleChains.map(c => {
              const isActive = selectedChain === c.chainId;
              const supportCount = fullData?.comparison.filter(r =>
                r.allNetworks.some(n => n.chainId?.toLowerCase() === c.chainId.toLowerCase())
              ).length ?? 0;

              return (
                <button
                  key={c.chainId}
                  onClick={() => handleChainSelect(c.chainId)}
                  title={`${supportCount} exchange${supportCount !== 1 ? 's' : ''} support ${c.chain}`}
                  className={`
                    font-mono text-[11px] px-3 py-1.5 rounded-md border-2 shrink-0 flex items-center gap-1.5 font-bold
                    ${isActive
                      ? 'bg-violet-700 text-white border-violet-800'
                      : 'bg-white text-violet-900 border-violet-400 dark:bg-slate-900 dark:text-violet-100'
                    }
                  `}
                >
                  {c.chain}
                  <span className={`px-1.5 py-0.2 rounded text-[10px] ${isActive ? 'bg-violet-900 text-white' : 'bg-violet-200 text-violet-900 dark:bg-violet-800 dark:text-violet-100'}`}>
                    {supportCount}
                  </span>
                </button>
              );
            })}

            {hiddenCount > 0 && (
              <button
                onClick={() => setShowAllChains(v => !v)}
                className="
                  flex items-center gap-1 font-bold
                  font-mono text-[11px] px-3 py-1.5 rounded-md border-2
                  bg-yellow-400 border-yellow-500 text-black shrink-0
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
      <div className="border-2 border-blue-600 rounded-lg overflow-hidden bg-white dark:bg-slate-950">
        <div className="px-4 py-3 border-b-2 border-blue-600 flex items-center justify-between bg-blue-600 text-white">
          <h2 className="font-mono text-xs tracking-widest uppercase font-black">
            {selectedChain
              ? `${allChains.find(c => c.chainId === selectedChain)?.chain ?? 'CHAIN'} WITHDRAWAL — ${selectedCoin || '—'}`
              : `CHEAPEST ${selectedCoin || '—'} WITHDRAWAL BY EXCHANGE`
            }
          </h2>
          {selectedChain && (
            <button
              onClick={() => setSelectedChain(null)}
              className="flex items-center gap-1.5 font-mono text-[11px] bg-red-600 text-white px-2 py-1 rounded font-bold"
            >
              <X className="w-3.5 h-3.5" /> Clear
            </button>
          )}
        </div>

        {!inputValue ? (
          <div className="px-4 py-12 text-center font-mono text-sm bg-blue-50 dark:bg-slate-900 text-blue-900 dark:text-blue-100 font-bold">
            Enter a coin symbol above to compare fees.
          </div>
        ) : loading ? (
          <div className="px-4 py-12 text-center font-mono text-sm bg-blue-50 dark:bg-slate-900 text-blue-900 dark:text-blue-100 font-bold">
            Fetching live fee data…
          </div>
        ) : noData ? (
          <div className="px-4 py-12 text-center font-mono text-sm bg-red-100 dark:bg-slate-900 text-red-900 dark:text-red-100 font-bold">
            No fee data found for <span className="bg-red-600 text-white px-1.5 py-0.5 rounded">{selectedCoin}</span>. Try another coin.
          </div>
        ) : displayComparison.length === 0 && selectedChain ? (
          <div className="px-4 py-12 text-center font-mono text-sm bg-amber-100 dark:bg-slate-900 text-amber-900 dark:text-amber-100 font-bold">
            No exchanges support{' '}
            <span className="bg-amber-600 text-white px-1.5 py-0.5 rounded">
              {allChains.find(c => c.chainId === selectedChain)?.chain ?? selectedChain}
            </span>{' '}
            withdrawals for <span className="bg-amber-600 text-white px-1.5 py-0.5 rounded">{selectedCoin}</span>.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm font-mono min-w-[600px]">
              <thead className="bg-slate-200 dark:bg-slate-800 border-b-2 border-blue-600">
                <tr>
                  <th className="text-left px-4 py-3 text-slate-900 dark:text-slate-100 border-r border-slate-300 dark:border-slate-700 tracking-widest text-[11px] font-black uppercase w-14">Rank</th>
                  <th className="text-left px-4 py-3 text-slate-900 dark:text-slate-100 border-r border-slate-300 dark:border-slate-700 tracking-widest text-[11px] font-black uppercase">Exchange</th>
                  <th className="text-left px-4 py-3 text-slate-900 dark:text-slate-100 border-r border-slate-300 dark:border-slate-700 tracking-widest text-[11px] font-black uppercase">{chainColumnLabel}</th>
                  <th className="text-left px-4 py-3 text-slate-900 dark:text-slate-100 border-r border-slate-300 dark:border-slate-700 tracking-widest text-[11px] font-black uppercase">Fee</th>
                  <th className="text-left px-4 py-3 text-slate-900 dark:text-slate-100 border-r border-slate-300 dark:border-slate-700 tracking-widest text-[11px] font-black uppercase">Fee USD</th>
                  <th className="text-left px-4 py-3 text-slate-900 dark:text-slate-100 border-r border-slate-300 dark:border-slate-700 tracking-widest text-[11px] font-black uppercase hidden md:table-cell">Min Withdraw</th>
                  <th className="text-left px-4 py-3 text-slate-900 dark:text-slate-100 border-r border-slate-300 dark:border-slate-700 tracking-widest text-[11px] font-black uppercase hidden lg:table-cell">Min Deposit</th>
                  <th className="text-left px-4 py-3 text-slate-900 dark:text-slate-100 tracking-widest text-[11px] font-black uppercase hidden sm:table-cell">ETA</th>
                </tr>
              </thead>
              <tbody className="divide-y-2 divide-slate-200 dark:divide-slate-800 text-slate-950 dark:text-slate-50">
                {displayComparison.map((row, i) => {
                  const assignedColor = EXCHANGE_SOLID_COLORS[i % EXCHANGE_SOLID_COLORS.length];
                  return (
                    <tr key={row.exchange}>
                      <td className="px-4 py-4 font-black border-r border-slate-200 dark:border-slate-800 bg-slate-100 dark:bg-slate-900 text-center">
                        {String(i + 1).padStart(2, '0')}
                      </td>
                      {/* Exchanges column has its unique solid background text configuration separate from the rest */}
                      <td className={`px-4 py-4 font-black border-r border-slate-200 dark:border-slate-800 ${assignedColor}`}>
                        {row.exchange}
                      </td>
                      <td className="px-4 py-4 border-r border-slate-200 dark:border-slate-800 bg-indigo-600 text-white font-black">
                        {row.cheapestChain}
                      </td>
                      <td className="px-4 py-4 border-r border-slate-200 dark:border-slate-800 font-bold whitespace-nowrap bg-orange-100 dark:bg-orange-950 text-orange-950 dark:text-orange-100">
                        {row.withdrawFee === 0 ? (
                          <span className="bg-emerald-600 text-white px-2 py-0.5 rounded font-black">FREE</span>
                        ) : (
                          <span>{row.withdrawFee} <span className="text-xs font-normal">{selectedCoin}</span></span>
                        )}
                      </td>
                      <td className="px-4 py-4 border-r border-slate-200 dark:border-slate-800 whitespace-nowrap bg-teal-50 dark:bg-slate-900 text-teal-950 dark:text-teal-100 font-bold">
                        {row.withdrawFeeUSD != null ? `$${row.withdrawFeeUSD.toFixed(2)}` : '—'}
                      </td>
                      <td className="px-4 py-4 border-r border-slate-200 dark:border-slate-800 whitespace-nowrap hidden md:table-cell bg-blue-50 dark:bg-slate-900 font-bold">
                        {row.minWithdraw} <span className="text-xs font-normal">{selectedCoin}</span>
                      </td>
                      <td className="px-4 py-4 border-r border-slate-200 dark:border-slate-800 whitespace-nowrap hidden lg:table-cell bg-fuchsia-50 dark:bg-slate-900 font-bold">
                        {row.minDeposit} <span className="text-xs font-normal">{selectedCoin}</span>
                      </td>
                      <td className="px-4 py-4 hidden sm:table-cell bg-slate-100 dark:bg-slate-900 font-bold">
                        ~{row.arrivalMins}m
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ── Exchange detail cards ─────────────────────────────────────────── */}
      {!loading && !noData && fullData && fullData.comparison.length > 0 && (
        <>
          {/* Expand / Collapse all controls */}
          <div className="flex items-center justify-between bg-slate-200 dark:bg-slate-800 p-3 rounded-lg border-2 border-slate-400">
            <span className="font-mono text-xs bg-slate-700 text-white px-2 py-1 rounded tracking-widest uppercase font-black">
              Exchange Details
            </span>
            <div className="flex items-center gap-2">
              <button
                onClick={expandAll}
                className="font-mono text-[11px] px-3 py-1.5 rounded-md bg-emerald-600 text-white border-2 border-emerald-700 flex items-center gap-1 font-black"
              >
                Expand all <ChevronDown className="w-3 h-3" />
              </button>
              <button
                onClick={collapseAll}
                className="font-mono text-[11px] px-3 py-1.5 rounded-md bg-red-600 text-white border-2 border-red-700 flex items-center gap-1 font-black"
              >
                Collapse all <ChevronUp className="w-3 h-3" />
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
            {fullData.comparison.map((row, index) => {
              const meta = exchanges.find(e => e.exchange === row.exchangeSlug);
              const isExpanded = !!expandedCards[row.exchangeSlug];

              const networksToShow = selectedChain
                ? row.allNetworks.filter(n => n.chainId?.toLowerCase() === selectedChain.toLowerCase())
                : row.allNetworks;

              if (networksToShow.length === 0) return null;

              const cheapestNet = networksToShow[0];
              const cardHeaderColor = EXCHANGE_SOLID_COLORS[index % EXCHANGE_SOLID_COLORS.length];

              return (
                <div key={row.exchange} className="border-2 border-slate-700 rounded-lg overflow-hidden bg-white dark:bg-slate-950">
                  {/* Card header — always solid distinct background color */}
                  <button
                    onClick={() => toggleCard(row.exchangeSlug)}
                    className={`w-full px-5 py-4 border-b-2 border-slate-700 flex items-center justify-between text-left ${cardHeaderColor}`}
                    aria-expanded={isExpanded}
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="min-w-0">
                        <h3 className="font-mono text-base font-black uppercase tracking-wide">{row.exchange}</h3>
                        <div className="flex items-center gap-2 mt-1 font-mono text-[11px] bg-black/20 text-white px-2 py-0.5 rounded font-bold">
                          {meta?.twitterHandle && <span>{meta.twitterHandle}</span>}
                          {meta?.twitterHandle && <span>•</span>}
                          {meta?.p2p ? (
                            <span className="flex items-center gap-1">
                              P2P <Check className="w-3 h-3 stroke-[3]" /> (min ${meta.p2pMinUSD})
                            </span>
                          ) : (
                            <span>No P2P</span>
                          )}
                        </div>
                      </div>

                      {/* Collapsed summary */}
                      {!isExpanded && (
                        <div className="flex items-center gap-2 ml-2 shrink-0 font-mono">
                          <span className="bg-black text-white px-2 py-0.5 rounded text-[10px] font-black">
                            {cheapestNet?.chain ?? row.cheapestChain}
                          </span>
                          <span className="bg-white text-black px-2 py-0.5 rounded text-[11px] font-black">
                            {row.withdrawFee === 0 ? 'FREE' : `${row.withdrawFee} ${selectedCoin}`}
                          </span>
                        </div>
                      )}
                    </div>

                    <div className="flex items-center gap-3 shrink-0 ml-3">
                      {meta?.website && (
                        <a
                          href={meta.website}
                          target="_blank"
                          rel="noopener noreferrer"
                          onClick={e => e.stopPropagation()}
                          className="flex items-center gap-1 bg-white text-black px-2 py-1 rounded font-mono text-[11px] font-black"
                        >
                          Visit <ExternalLink className="w-3 h-3" />
                        </a>
                      )}
                      <span className="bg-black/20 p-1 rounded text-white">
                        {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                      </span>
                    </div>
                  </button>

                  {/* Network rows — expanded detailed view */}
                  {isExpanded && (
                    <div className="divide-y-2 divide-slate-200 dark:divide-slate-800 bg-slate-100 dark:bg-slate-900 text-slate-950 dark:text-slate-50">
                      {networksToShow.map((n, i) => {
                        const rowKey = `${n.chainId ?? n.chain}-${i}`;
                        const isCheapest = !selectedChain && i === 0;

                        return (
                          <div key={rowKey} className="px-5 py-4 border-l-4 border-indigo-600 bg-white dark:bg-slate-950">
                            <div className="flex items-center gap-3 mb-4 min-w-0">
                              {isCheapest && (
                                <span className="shrink-0 text-[10px] bg-emerald-600 text-white font-black px-2 py-0.5 rounded tracking-wider">
                                  CHEAPEST
                                </span>
                              )}
                              {/* Chain name explicitly given a unique solid highlight color */}
                              <span className="font-mono text-sm font-black tracking-wide px-3 py-1 bg-indigo-600 text-white rounded truncate">
                                {n.chain}
                              </span>
                            </div>

                            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                              {/* Fee Column -> Distinct Solid Orange Background */}
                              <div className="space-y-1 p-2 bg-orange-500 text-white rounded border border-orange-700">
                                <p className="font-mono text-[10px] tracking-widest uppercase font-black text-orange-100">Withdraw Fee</p>
                                <p className="font-mono text-sm font-black">
                                  {n.withdrawFee === 0 ? <span className="bg-white text-emerald-700 px-1.5 py-0.2 rounded font-black">FREE</span> : n.withdrawFee}
                                </p>
                                {n.withdrawFee !== 0 && (
                                  <p className="font-mono text-[11px] text-orange-200 font-bold">
                                    {selectedCoin}
                                    {n.withdrawFeeUSD != null && (
                                      <span className="ml-1 text-white block">(${n.withdrawFeeUSD.toFixed(2)})</span>
                                    )}
                                  </p>
                                )}
                              </div>

                              {/* Min Withdraw Column -> Distinct Solid Cyan/Blue Background */}
                              <div className="space-y-1 p-2 bg-cyan-600 text-white rounded border border-cyan-800">
                                <p className="font-mono text-[10px] tracking-widest uppercase font-black text-cyan-100">Min Withdraw</p>
                                <p className="font-mono text-sm font-black">{n.minWithdraw}</p>
                                <p className="font-mono text-[11px] text-cyan-200 font-bold">{selectedCoin}</p>
                              </div>

                              {/* Min Deposit Column -> Distinct Solid Fuchsia/Pink Background */}
                              <div className="space-y-1 p-2 bg-fuchsia-600 text-white rounded border border-fuchsia-800">
                                <p className="font-mono text-[10px] tracking-widest uppercase font-black text-fuchsia-100">Min Deposit</p>
                                <p className="font-mono text-sm font-black">{n.minDeposit}</p>
                                <p className="font-mono text-[11px] text-fuchsia-200 font-bold">{selectedCoin}</p>
                              </div>

                              {/* ETA Column -> Distinct Solid Slate Background */}
                              <div className="space-y-1 p-2 bg-slate-700 text-white rounded border border-slate-800">
                                <p className="font-mono text-[10px] tracking-widest uppercase font-black text-slate-300">ETA</p>
                                <p className="font-mono text-sm font-black">~{n.arrivalMins}m</p>
                                <p className="font-mono text-[11px] text-slate-400 font-bold">
                                  {n.arrivalMins === 1 ? 'minute' : 'minutes'}
                                </p>
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}