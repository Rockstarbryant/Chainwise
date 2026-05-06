'use client';

import { useState, useEffect, useRef } from 'react';
import { getExchanges, compareExchanges } from '@/lib/api';
import type { ExchangeFee } from '@/lib/types';
import { Search, X } from 'lucide-react';

const POPULAR_COINS = ['USDT', 'USDC', 'ETH', 'BTC', 'BNB', 'SOL'];

export default function FeeTable() {
  const [exchanges, setExchanges]     = useState<ExchangeFee[]>([]);
  const [inputValue, setInputValue]   = useState('USDT');
  const [selectedCoin, setSelectedCoin] = useState('USDT');
  const [comparison, setComparison]   = useState<any[]>([]);
  const [loading, setLoading]         = useState(true);
  const [noData, setNoData]           = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const inputRef    = useRef<HTMLInputElement>(null);

  useEffect(() => {
    getExchanges()
      .then(res => setExchanges(res.data || []))
      .catch(console.error);
  }, []);

  // Search is debounced 500ms so we don't fire on every keystroke
  useEffect(() => {
    const coin = selectedCoin.trim().toUpperCase();
    if (!coin) return;

    setLoading(true);
    setNoData(false);

    compareExchanges(coin)
      .then((res: any) => {
        const rows = res.data?.comparison || [];
        setComparison(rows);
        setNoData(rows.length === 0);
      })
      .catch(() => {
        setComparison([]);
        setNoData(true);
      })
      .finally(() => setLoading(false));
  }, [selectedCoin]);

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
    setComparison([]);
    setNoData(false);
    inputRef.current?.focus();
  };

  const handlePopularClick = (coin: string) => {
    setInputValue(coin);
    setSelectedCoin(coin);
  };

  return (
    <div className="space-y-6">

      {/* Search bar */}
      <div className="space-y-3">
        <div className="flex items-center gap-3">
          <span className="font-mono text-xs text-brand-muted tracking-widest shrink-0">COMPARE</span>
          <div className="relative flex-1 max-w-xs">
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

      {/* Comparison table */}
      <div className="rounded-xl border border-brand-border overflow-hidden">
        <div className="px-4 py-3 bg-brand-surface border-b border-brand-border">
          <h2 className="font-mono text-xs text-brand-green tracking-widest">
            CHEAPEST {selectedCoin || '—'} WITHDRAWAL BY EXCHANGE
          </h2>
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
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs font-mono">
              <thead>
                <tr className="border-b border-brand-border">
                  {['Rank', 'Exchange', 'Cheapest Chain', 'Fee', 'Fee USD', 'Min Withdraw', 'ETA'].map(h => (
                    <th key={h} className="text-left px-4 py-3 text-brand-muted tracking-widest font-normal">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {comparison.map((row, i) => (
                  <tr
                    key={row.exchange}
                    className="border-b border-brand-border/50 hover:bg-brand-surface/50 transition-colors"
                  >
                    <td className="px-4 py-3">
                      <span className={`
                        w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold
                        ${i === 0 ? 'bg-brand-green text-black' : 'bg-brand-border text-brand-muted'}
                      `}>
                        {i + 1}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-brand-text">{row.exchange}</td>
                    <td className="px-4 py-3">
                      <span className="bg-[rgba(0,255,136,0.08)] border border-[rgba(0,255,136,0.15)] text-brand-green px-2 py-0.5 rounded text-[11px]">
                        {row.cheapestChain}
                      </span>
                    </td>
                    <td className={`px-4 py-3 font-bold ${row.withdrawFee === 0 ? 'text-brand-green' : 'text-brand-text'}`}>
                      {row.withdrawFee === 0 ? '🆓 FREE' : `${row.withdrawFee} ${selectedCoin}`}
                    </td>
                    <td className="px-4 py-3 text-brand-muted">
                      {row.withdrawFeeUSD != null ? `~$${row.withdrawFeeUSD}` : '—'}
                    </td>
                    <td className="px-4 py-3 text-brand-muted">{row.minWithdraw} {selectedCoin}</td>
                    <td className="px-4 py-3 text-brand-muted">~{row.arrivalMins}m</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Exchange cards with all networks */}
      {!loading && !noData && comparison.length > 0 && (
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
          {exchanges.map(ex => {
            const coinData = ex.coins?.find((c: any) => c.symbol === selectedCoin);
            if (!coinData) return null;
            const sorted = [...coinData.networks].sort((a: any, b: any) => a.withdrawFee - b.withdrawFee);
            return (
              <div key={ex.exchange} className="rounded-xl border border-brand-border overflow-hidden">
                <div className="px-4 py-3 bg-brand-surface border-b border-brand-border flex items-center justify-between">
                  <div>
                    <h3 className="font-mono text-sm text-brand-green font-bold">{ex.displayName}</h3>
                    <p className="font-mono text-[10px] text-brand-muted">
                      {ex.twitterHandle} · {ex.p2p ? `P2P ✓ (min $${ex.p2pMinUSD})` : 'No P2P'}
                    </p>
                  </div>
                  <a
                    href={ex.website}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="font-mono text-[10px] text-brand-blue hover:underline"
                  >
                    Visit ↗
                  </a>
                </div>
                <div className="divide-y divide-brand-border/50">
                  {sorted.map((n: any, i: number) => (
                    <div key={n.chain} className="flex items-center justify-between px-4 py-2.5">
                      <div className="flex items-center gap-2">
                        {i === 0 && (
                          <span className="text-[9px] bg-brand-green text-black font-bold px-1.5 py-0.5 rounded font-mono">
                            CHEAPEST
                          </span>
                        )}
                        <span className="font-mono text-xs text-brand-text">{n.chain}</span>
                      </div>
                      <div className="flex items-center gap-4 text-[11px] font-mono">
                        <span className={n.withdrawFee === 0 ? 'text-brand-green font-bold' : 'text-brand-muted'}>
                          {n.withdrawFee === 0 ? 'FREE' : `${n.withdrawFee} ${selectedCoin}`}
                        </span>
                        <span className="text-brand-muted">min: {n.minWithdraw}</span>
                        <span className="text-brand-muted">~{n.arrivalMins}m</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}