'use client';

/**
 * frontend/app/p2p/page.tsx
 *
 * Live P2P market page — shows real merchant ads from all exchanges.
 * Matches ChainWise's dark terminal aesthetic (brand-green, brand-surface, font-mono).
 *
 * Add to Sidebar.tsx nav links:
 *   { href: '/p2p', label: 'P2P Market', icon: ArrowLeftRight }
 */

import { useState, useEffect, useCallback } from 'react';
import {
  ArrowLeftRight, RefreshCw, TrendingUp, TrendingDown,
  Shield, ShieldCheck, ChevronDown, AlertCircle, Wifi, WifiOff,
  Search
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

// ─── Types ────────────────────────────────────────────────────────────────

interface Merchant {
  name:           string;
  completionRate: number;
  orderCount:     number;
  isVerified:     boolean;
}

interface P2PAd {
  exchange:       string;
  tradeType:      'BUY' | 'SELL';
  asset:          string;
  fiat:           string;
  price:          number;
  minAmount:      number;
  maxAmount:      number;
  available:      number;
  paymentMethods: string[];
  merchant:       Merchant;
}

interface P2PSummary {
  lowestRate:          number | null;
  highestRate:         number | null;
  averageRate:         number | null;
  exchangesQueried:    number;
  exchangesWithData:   number;
}

interface P2PResult {
  asset:     string;
  fiat:      string;
  tradeType: string;
  totalAds:  number;
  ads:       P2PAd[];
  summary:   P2PSummary;
  cached?:   boolean;
  stale?:    boolean;
  staleAge?: string;
  warning?:  string;
  errors?:   Record<string, string>;
}

interface SupportedPairs {
  exchanges: string[];
  fiats:     string[];
  assets:    string[];
}

// ─── Constants ────────────────────────────────────────────────────────────

const API_URL = process.env.NEXT_PUBLIC_API_URL;

const EXCHANGE_COLORS: Record<string, string> = {
  binance: '#F0B90B',
  bybit:   '#F7A600',
  okx:     '#FFFFFF',
  kucoin:  '#23AF91',
  bitget:  '#00F0FF',
  htx:     '#1E80FF',
  mexc:    '#00D4AA',
};

const EXCHANGE_LABELS: Record<string, string> = {
  binance: 'Binance',
  bybit:   'Bybit',
  okx:     'OKX',
  kucoin:  'KuCoin',
  bitget:  'Bitget',
  htx:     'HTX',
  mexc:    'MEXC',
};

// ─── Sub-components ───────────────────────────────────────────────────────

function ExchangeBadge({ exchange }: { exchange: string }) {
  const color = EXCHANGE_COLORS[exchange] || '#888';
  const label = EXCHANGE_LABELS[exchange] || exchange.toUpperCase();
  return (
    <span
      className="inline-flex items-center px-2 py-0.5 rounded font-mono text-[10px] font-bold tracking-wider"
      style={{ color, border: `1px solid ${color}30`, background: `${color}12` }}
    >
      {label}
    </span>
  );
}

function MerchantBadge({ merchant }: { merchant: Merchant }) {
  const rate = merchant.completionRate;
  const color = rate >= 95 ? '#00ff88' : rate >= 85 ? '#f0b90b' : '#ef4444';
  return (
    <div className="flex items-center gap-1.5">
      {merchant.isVerified
        ? <ShieldCheck className="w-3 h-3 text-brand-green flex-shrink-0" />
        : <Shield      className="w-3 h-3 text-brand-muted flex-shrink-0" />
      }
      <span className="font-mono text-xs text-brand-text truncate max-w-[120px]" title={merchant.name}>
        {merchant.name}
      </span>
      <span className="font-mono text-[10px]" style={{ color }}>
        {rate.toFixed(0)}%
      </span>
      <span className="font-mono text-[10px] text-brand-muted">
        ({merchant.orderCount} orders)
      </span>
    </div>
  );
}

function PaymentTags({ methods }: { methods: string[] }) {
  const shown = methods.slice(0, 3);
  const extra = methods.length - 3;
  return (
    <div className="flex flex-wrap gap-1">
      {shown.map(m => (
        <span key={m} className="px-1.5 py-0.5 rounded font-mono text-[9px] bg-brand-surface border border-brand-border text-brand-muted">
          {m}
        </span>
      ))}
      {extra > 0 && (
        <span className="px-1.5 py-0.5 rounded font-mono text-[9px] bg-brand-surface border border-brand-border text-brand-muted">
          +{extra}
        </span>
      )}
    </div>
  );
}

function AdRow({ ad, fiat }: { ad: P2PAd; fiat: string }) {
  const [expanded, setExpanded] = useState(false);
  const isBuy = ad.tradeType === 'BUY';

  return (
    <motion.div
      className="border border-brand-border rounded-xl overflow-hidden hover:border-brand-dim transition-colors"
      layout
    >
      {/* Main row */}
      <div
        className="grid items-center gap-3 px-4 py-3 cursor-pointer"
        style={{ gridTemplateColumns: '1fr 1fr 1fr 1fr 40px' }}
        onClick={() => setExpanded(e => !e)}
      >
        {/* Price */}
        <div>
          <div className={`font-mono font-bold text-lg ${isBuy ? 'text-brand-green' : 'text-red-400'}`}>
            {ad.price.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 4 })}
          </div>
          <div className="font-mono text-[10px] text-brand-muted">{fiat} per {ad.asset}</div>
        </div>

        {/* Limits */}
        <div>
          <div className="font-mono text-xs text-brand-text">
            {ad.minAmount.toLocaleString()} – {ad.maxAmount.toLocaleString()}
          </div>
          <div className="font-mono text-[10px] text-brand-muted">{fiat} limit</div>
        </div>

        {/* Merchant */}
        <MerchantBadge merchant={ad.merchant} />

        {/* Exchange + available */}
        <div className="flex flex-col gap-1">
          <ExchangeBadge exchange={ad.exchange} />
          <span className="font-mono text-[10px] text-brand-muted">
            {ad.available.toLocaleString(undefined, { maximumFractionDigits: 2 })} {ad.asset} avail.
          </span>
        </div>

        {/* Expand toggle */}
        <ChevronDown
          className={`w-4 h-4 text-brand-muted transition-transform ${expanded ? 'rotate-180' : ''}`}
        />
      </div>

      {/* Expanded details */}
      <AnimatePresence>
        {expanded && (
          <motion.div
            className="border-t border-brand-border px-4 py-3 bg-[rgba(0,0,0,0.25)]"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.15 }}
          >
            <div className="flex flex-wrap gap-6">
              <div>
                <div className="font-mono text-[10px] text-brand-muted tracking-widest mb-1.5">PAYMENT METHODS</div>
                <PaymentTags methods={ad.paymentMethods} />
              </div>
              <div>
                <div className="font-mono text-[10px] text-brand-muted tracking-widest mb-1.5">MERCHANT STATS</div>
                <div className="font-mono text-xs text-brand-text space-y-0.5">
                  <div>Completion: <span style={{ color: ad.merchant.completionRate >= 95 ? '#00ff88' : '#f0b90b' }}>{ad.merchant.completionRate.toFixed(1)}%</span></div>
                  <div>Orders: <span className="text-brand-green">{ad.merchant.orderCount.toLocaleString()}</span></div>
                  <div>Verified: <span className={ad.merchant.isVerified ? 'text-brand-green' : 'text-brand-muted'}>{ad.merchant.isVerified ? 'Yes ✓' : 'No'}</span></div>
                </div>
              </div>
              <div>
                <div className="font-mono text-[10px] text-brand-muted tracking-widest mb-1.5">TRADE DETAILS</div>
                <div className="font-mono text-xs text-brand-text space-y-0.5">
                  <div>Min: <span className="text-brand-green">{ad.minAmount.toLocaleString()} {fiat}</span></div>
                  <div>Max: <span className="text-brand-green">{ad.maxAmount.toLocaleString()} {fiat}</span></div>
                  <div>Available: <span className="text-brand-green">{ad.available.toLocaleString(undefined, { maximumFractionDigits: 4 })} {ad.asset}</span></div>
                </div>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────

export default function P2PPage() {
  const [result,    setResult]    = useState<P2PResult | null>(null);
  const [supported, setSupported] = useState<SupportedPairs | null>(null);
  const [loading,   setLoading]   = useState(false);
  const [error,     setError]     = useState<string | null>(null);

  // Filters
  const [exchange,   setExchange]   = useState('all');
  const [asset,      setAsset]      = useState('USDT');
  const [fiat,       setFiat]       = useState('KES');
  const [tradeType,  setTradeType]  = useState<'BUY' | 'SELL'>('BUY');
  const [minComp,    setMinComp]    = useState(0);   // min completion rate filter
  const [verifiedOnly, setVerifiedOnly] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');

  // Load supported pairs for dropdowns
  useEffect(() => {
    fetch(`${API_URL}/api/p2p/supported`)
      .then(r => r.json())
      .then(d => d.success && setSupported(d.data))
      .catch(() => {});
  }, []);

  const fetchAds = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ exchange, asset, fiat, tradeType, limit: '20' });
      const res  = await fetch(`${API_URL}/api/p2p?${params}`);
      const data = await res.json();
      if (data.success) {
        setResult(data.data);
      } else {
        setError(data.error?.message || 'Failed to load P2P data');
      }
    } catch (e: any) {
      setError(e.message || 'Network error');
    } finally {
      setLoading(false);
    }
  }, [exchange, asset, fiat, tradeType]);

  // Fetch on filter change
  useEffect(() => { fetchAds(); }, [fetchAds]);

  // Client-side filter
 // Client-side filter — FIXED & ROBUST
const filteredAds = (result?.ads || []).filter(ad => {
  // Asset filter (case-insensitive)
  if (asset && ad.asset.toUpperCase() !== asset.toUpperCase()) return false;

  // Exchange filter
  if (exchange !== 'all' && ad.exchange.toLowerCase() !== exchange.toLowerCase()) return false;

  // Other user filters
  if (verifiedOnly && !ad.merchant.isVerified) return false;
  if (ad.merchant.completionRate < minComp) return false;

  // Search term
  if (searchTerm) {
    const q = searchTerm.toLowerCase();
    return (
      ad.merchant.name.toLowerCase().includes(q) ||
      ad.paymentMethods.some(p => p.toLowerCase().includes(q)) ||
      ad.exchange.toLowerCase().includes(q)
    );
  }

  return true;
});

// DEBUG: Remove after confirming fix
useEffect(() => {
  if (result?.ads?.length) {
    const okxUsdt = result.ads.filter(a => a.exchange === 'okx' && a.asset === 'USDT');
    console.log(`Total ads: ${result.ads.length} | OKX USDT ads: ${okxUsdt.length}`);
    console.log('First OKX ad sample:', okxUsdt[0]);
    console.log('Filtered count:', filteredAds.length);
  }
}, [result, filteredAds, asset, exchange]);

  const { summary } = result || {};

  return (
    <div className="h-full overflow-y-auto px-6 py-6">
      <div className="max-w-5xl mx-auto space-y-5">

        {/* ── Header ── */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="font-mono font-bold text-xl text-brand-green tracking-[0.15em]">
              P2P MARKET
            </h1>
            <p className="font-mono text-[10px] text-brand-muted mt-1 tracking-widest">
              LIVE MERCHANT ADS · CROSS-EXCHANGE · REAL-TIME RATES
            </p>
          </div>
          <button
            onClick={fetchAds}
            disabled={loading}
            className="flex items-center gap-2 px-3 py-2 rounded-xl border border-brand-border font-mono text-xs text-brand-muted hover:text-brand-green hover:border-brand-dim transition-all disabled:opacity-50"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </button>
        </div>

        {/* ── Filter Bar ── */}
        <div className="bg-brand-surface border border-brand-border rounded-xl p-4">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-3">
            {/* Trade type toggle */}
            <div className="col-span-2 md:col-span-1">
              <label className="font-mono text-[10px] text-brand-muted tracking-widest block mb-1.5">I WANT TO</label>
              <div className="flex rounded-lg overflow-hidden border border-brand-border">
                {(['BUY', 'SELL'] as const).map(t => (
                  <button
                    key={t}
                    onClick={() => setTradeType(t)}
                    className={`flex-1 py-2 font-mono text-xs font-bold transition-all ${
                      tradeType === t
                        ? t === 'BUY'
                          ? 'bg-brand-green text-black'
                          : 'bg-red-500 text-white'
                        : 'bg-transparent text-brand-muted hover:text-brand-text'
                    }`}
                  >
                    {t} CRYPTO
                  </button>
                ))}
              </div>
            </div>

            {/* Asset */}
            <div>
              <label className="font-mono text-[10px] text-brand-muted tracking-widest block mb-1.5">ASSET</label>
              <select
                value={asset}
                onChange={e => setAsset(e.target.value)}
                className="w-full bg-brand-bg border border-brand-border rounded-lg px-3 py-2 font-mono text-xs text-brand-text outline-none focus:border-brand-dim"
              >
                {(supported?.assets || ['USDT', 'USDC', 'BTC', 'ETH', 'BNB']).map(a => (
                  <option key={a} value={a}>{a}</option>
                ))}
              </select>
            </div>

            {/* Fiat */}
            <div>
              <label className="font-mono text-[10px] text-brand-muted tracking-widest block mb-1.5">FIAT CURRENCY</label>
              <select
                value={fiat}
                onChange={e => setFiat(e.target.value)}
                className="w-full bg-brand-bg border border-brand-border rounded-lg px-3 py-2 font-mono text-xs text-brand-text outline-none focus:border-brand-dim"
              >
                {(supported?.fiats || ['KES', 'NGN', 'GHS', 'ZAR', 'INR', 'PKR', 'USD', 'EUR']).map(f => (
                  <option key={f} value={f}>{f}</option>
                ))}
              </select>
            </div>

            {/* Exchange */}
            <div>
              <label className="font-mono text-[10px] text-brand-muted tracking-widest block mb-1.5">EXCHANGE</label>
              <select
                value={exchange}
                onChange={e => setExchange(e.target.value)}
                className="w-full bg-brand-bg border border-brand-border rounded-lg px-3 py-2 font-mono text-xs text-brand-text outline-none focus:border-brand-dim"
              >
                <option value="all">All Exchanges</option>
                {(supported?.exchanges || ['binance', 'bybit', 'okx', 'kucoin', 'bitget']).map(ex => (
                  <option key={ex} value={ex}>{EXCHANGE_LABELS[ex] || ex}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Secondary filters */}
          <div className="flex flex-wrap items-center gap-4 pt-3 border-t border-brand-border">
            {/* Search */}
            <div className="relative flex-1 min-w-[160px]">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3 h-3 text-brand-muted" />
              <input
                type="text"
                value={searchTerm}
                onChange={e => setSearchTerm(e.target.value)}
                placeholder="Search merchant or payment..."
                className="w-full bg-brand-bg border border-brand-border rounded-lg pl-7 pr-3 py-1.5 font-mono text-xs text-brand-text placeholder:text-brand-muted/40 outline-none focus:border-brand-dim"
              />
            </div>

            {/* Min completion rate */}
            <div className="flex items-center gap-2">
              <label className="font-mono text-[10px] text-brand-muted whitespace-nowrap">MIN COMPLETION</label>
              <select
                value={minComp}
                onChange={e => setMinComp(Number(e.target.value))}
                className="bg-brand-bg border border-brand-border rounded-lg px-2 py-1.5 font-mono text-xs text-brand-text outline-none focus:border-brand-dim"
              >
                <option value={0}>Any</option>
                <option value={80}>≥ 80%</option>
                <option value={90}>≥ 90%</option>
                <option value={95}>≥ 95%</option>
                <option value={99}>≥ 99%</option>
              </select>
            </div>

            {/* Verified only */}
            <label className="flex items-center gap-2 cursor-pointer">
              <div
                onClick={() => setVerifiedOnly(v => !v)}
                className={`w-8 h-4 rounded-full transition-all relative ${verifiedOnly ? 'bg-brand-green' : 'bg-brand-border'}`}
              >
                <div className={`absolute top-0.5 w-3 h-3 rounded-full bg-white transition-all ${verifiedOnly ? 'left-4' : 'left-0.5'}`} />
              </div>
              <span className="font-mono text-[10px] text-brand-muted">VERIFIED ONLY</span>
            </label>
          </div>
        </div>

        {/* ── Summary Cards ── */}
        {summary && !loading && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {[
              {
                label: tradeType === 'BUY' ? 'BEST BUY RATE' : 'BEST SELL RATE',
                value: tradeType === 'BUY'
                  ? summary.lowestRate?.toLocaleString(undefined, { maximumFractionDigits: 2 })
                  : summary.highestRate?.toLocaleString(undefined, { maximumFractionDigits: 2 }),
                sub:   `${fiat} per ${asset}`,
                color: tradeType === 'BUY' ? 'text-brand-green' : 'text-red-400',
                icon:  tradeType === 'BUY' ? TrendingDown : TrendingUp,
              },
              {
                label: 'AVG RATE',
                value: summary.averageRate?.toLocaleString(undefined, { maximumFractionDigits: 2 }) || '—',
                sub:   `${fiat} per ${asset}`,
                color: 'text-brand-blue',
                icon:  ArrowLeftRight,
              },
              {
                label: 'TOTAL ADS',
                value: filteredAds.length,
                sub:   `of ${result?.totalAds || 0} fetched`,
                color: 'text-yellow-400',
                icon:  null,
              },
              {
                label: 'EXCHANGES',
                value: summary.exchangesWithData,
                sub:   `of ${summary.exchangesQueried} queried`,
                color: 'text-brand-green',
                icon:  null,
              },
            ].map(card => (
              <div key={card.label} className="bg-brand-surface border border-brand-border rounded-xl p-4">
                <div className="font-mono text-[10px] text-brand-muted tracking-widest mb-1">{card.label}</div>
                <div className={`font-mono font-bold text-xl ${card.color}`}>{card.value ?? '—'}</div>
                <div className="font-mono text-[10px] text-brand-muted mt-0.5">{card.sub}</div>
              </div>
            ))}
          </div>
        )}

        {/* ── Status banners ── */}
        {result?.stale && (
          <div className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-yellow-950/50 border border-yellow-800/40 font-mono text-xs text-yellow-400">
            <WifiOff className="w-3.5 h-3.5 flex-shrink-0" />
            Showing cached data ({result.staleAge}) — live fetch failed. Refreshing automatically.
          </div>
        )}
        {result?.cached && !result?.stale && (
          <div className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-brand-surface border border-brand-border font-mono text-[10px] text-brand-muted">
            <Wifi className="w-3 h-3 text-brand-green" />
            Data cached · auto-refreshes every 15 minutes
          </div>
        )}
        {result?.errors && Object.keys(result.errors).length > 0 && (
          <div className="flex items-start gap-2 px-4 py-2.5 rounded-xl bg-red-950/30 border border-red-800/30 font-mono text-[10px] text-red-400">
            <AlertCircle className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
            <div>
              Some exchanges failed: {Object.entries(result.errors).map(([ex, err]) => (
                <span key={ex} className="mr-3"><span className="text-red-300">{ex}</span>: {err}</span>
              ))}
            </div>
          </div>
        )}

        {/* ── Table header ── */}
        {!loading && filteredAds.length > 0 && (
          <div
            className="grid px-4 py-2 font-mono text-[10px] text-brand-muted tracking-widest"
            style={{ gridTemplateColumns: '1fr 1fr 1fr 1fr 40px' }}
          >
            <div>PRICE ({fiat})</div>
            <div>LIMITS ({fiat})</div>
            <div>MERCHANT</div>
            <div>EXCHANGE / AVAILABLE</div>
            <div />
          </div>
        )}

        {/* ── Ad rows ── */}
        {loading ? (
          <div className="space-y-2">
            {[...Array(6)].map((_, i) => (
              <div key={i} className="h-16 rounded-xl bg-brand-surface border border-brand-border animate-pulse" />
            ))}
          </div>
        ) : error ? (
          <div className="flex flex-col items-center justify-center py-20 gap-3 text-center">
            <AlertCircle className="w-8 h-8 text-red-400" />
            <div className="font-mono text-sm text-red-400">{error}</div>
            <button onClick={fetchAds} className="font-mono text-xs text-brand-green underline">Try again</button>
          </div>
        ) : filteredAds.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 gap-3 text-center">
            <ArrowLeftRight className="w-8 h-8 text-brand-muted" />
            <div className="font-mono text-sm text-brand-muted">No ads match your filters</div>
            <div className="font-mono text-xs text-brand-muted">Try a different fiat, asset, or exchange</div>
          </div>
        ) : (
          <div className="space-y-2">
            <AnimatePresence mode="popLayout">
              {filteredAds.map((ad, i) => (
                <motion.div
                  key={`${ad.exchange}-${ad.merchant.name}-${i}`}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0 }}
                  transition={{ delay: i * 0.02, duration: 0.2 }}
                >
                  <AdRow ad={ad} fiat={fiat} />
                </motion.div>
              ))}
            </AnimatePresence>
          </div>
        )}

        {/* ── Safety reminder ── */}
        <div className="flex items-start gap-3 bg-[rgba(0,255,136,0.03)] border border-brand-green/10 rounded-xl px-4 py-3 mt-4">
          <ShieldCheck className="w-4 h-4 text-brand-green flex-shrink-0 mt-0.5" />
          <div className="font-mono text-[10px] text-brand-muted leading-relaxed">
            <span className="text-brand-green font-bold">Safety tips: </span>
            Always trade with merchants with <span className="text-brand-text">≥95% completion rate</span> and{' '}
            <span className="text-brand-text">≥100 orders</span>. Never release crypto before confirming payment.
            Only use official exchange P2P portals — ChainWise links directly to the exchange. Rates update every 15 minutes.
          </div>
        </div>

      </div>
    </div>
  );
}
