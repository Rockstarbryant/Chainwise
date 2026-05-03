'use client';

import { useState, useEffect } from 'react';
import { getExchanges, compareExchanges } from '@/lib/api';
import type { ExchangeFee } from '@/lib/types';

const COINS = ['USDT', 'USDC', 'ETH'];

export default function FeeTable() {
  const [exchanges, setExchanges] = useState<ExchangeFee[]>([]);
  const [selectedCoin, setSelectedCoin] = useState('USDT');
  const [comparison, setComparison] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getExchanges()
      .then(res => setExchanges(res.data || []))
      .catch(console.error);
  }, []);

  useEffect(() => {
    setLoading(true);
    compareExchanges(selectedCoin)
      .then((res: any) => setComparison(res.data?.comparison || []))
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [selectedCoin]);

  return (
    <div className="space-y-6">

      {/* Coin selector */}
      <div className="flex items-center gap-3">
        <span className="font-mono text-xs text-brand-muted tracking-widest">COMPARE</span>
        <div className="flex gap-2">
          {COINS.map(coin => (
            <button
              key={coin}
              onClick={() => setSelectedCoin(coin)}
              className={`
                font-mono text-xs px-4 py-1.5 rounded-lg border transition-all duration-150
                ${selectedCoin === coin
                  ? 'bg-[rgba(0,255,136,0.1)] border-brand-dim text-brand-green'
                  : 'border-brand-border text-brand-muted hover:border-brand-muted'
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
            CHEAPEST {selectedCoin} WITHDRAWAL BY EXCHANGE
          </h2>
        </div>
        {loading ? (
          <div className="px-4 py-8 text-center font-mono text-xs text-brand-muted animate-pulse">
            Fetching live fee data...
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
    </div>
  );
}