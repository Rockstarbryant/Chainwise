'use client';

/**
 * frontend/app/p2p/page.tsx
 *
 * Live P2P market page — shows real merchant ads from all exchanges.
 * Fully responsive, minimalist design supporting light and dark modes.
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
  okx:     '#888888', // Adjusted for light/dark mode contrast
  kucoin:  '#23AF91',
  bitget:  '#00D4AA',
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
  const color = EXCHANGE_COLORS[exchange] || '#888888';
  const label = EXCHANGE_LABELS[exchange] || exchange.toUpperCase();
  return (
    <span
      className="inline-flex items-center px-1.5 py-0.5 rounded font-mono text-[10px] font-bold tracking-wider"
      style={{ color, border: `1px solid ${color}40`, backgroundColor: `${color}10` }}
    >
      {label}
    </span>
  );
}

function MerchantBadge({ merchant }: { merchant: Merchant }) {
  const rate = merchant.completionRate;
  const rateColor = rate >= 95 ? 'text-emerald-600 dark:text-emerald-400' : rate >= 85 ? 'text-amber-600 dark:text-amber-500' : 'text-red-600 dark:text-red-400';
  
  return (
    <div className="flex items-center gap-1.5">
      {merchant.isVerified
        ? <ShieldCheck className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400 flex-shrink-0" />
        : <Shield className="w-3.5 h-3.5 text-zinc-400 dark:text-zinc-500 flex-shrink-0" />
      }
      <span className="font-mono text-xs text-zinc-900 dark:text-zinc-100 truncate max-w-[120px]" title={merchant.name}>
        {merchant.name}
      </span>
      <span className={`font-mono text-[10px] ${rateColor}`}>
        {rate.toFixed(0)}%
      </span>
      <span className="font-mono text-[10px] text-zinc-500 dark:text-zinc-400">
        ({merchant.orderCount})
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
        <span key={m} className="px-1.5 py-0.5 rounded font-mono text-[9px] bg-zinc-100 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 text-zinc-600 dark:text-zinc-300">
          {m}
        </span>
      ))}
      {extra > 0 && (
        <span className="px-1.5 py-0.5 rounded font-mono text-[9px] bg-zinc-100 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 text-zinc-600 dark:text-zinc-300">
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
      className="border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 overflow-hidden hover:border-zinc-300 dark:hover:border-zinc-700 transition-colors"
      layout
    >
      <div
        className="flex flex-col md:grid items-start md:items-center gap-3 px-4 py-4 cursor-pointer"
        style={{ gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr) minmax(0, 1fr) minmax(0, 1fr) 24px' }}
        onClick={() => setExpanded(e => !e)}
      >
        {/* Mobile Header (Hidden on Desktop) */}
        <div className="flex items-center justify-between w-full md:hidden mb-2">
           <ExchangeBadge exchange={ad.exchange} />
           <ChevronDown className={`w-4 h-4 text-zinc-400 transition-transform ${expanded ? 'rotate-180' : ''}`} />
        </div>

        {/* Price */}
        <div className="w-full flex justify-between md:block items-center">
          <div className="md:hidden font-mono text-[10px] text-zinc-500 tracking-widest">PRICE</div>
          <div>
            <div className={`font-mono font-bold text-lg ${isBuy ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'}`}>
              {ad.price.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 4 })}
            </div>
            <div className="font-mono text-[10px] text-zinc-500 dark:text-zinc-400">{fiat} per {ad.asset}</div>
          </div>
        </div>

        {/* Limits */}
        <div className="w-full flex justify-between md:block items-center">
          <div className="md:hidden font-mono text-[10px] text-zinc-500 tracking-widest">LIMITS</div>
          <div className="text-right md:text-left">
            <div className="font-mono text-xs text-zinc-900 dark:text-zinc-100">
              {ad.minAmount.toLocaleString()} – {ad.maxAmount.toLocaleString()}
            </div>
            <div className="font-mono text-[10px] text-zinc-500 dark:text-zinc-400">{fiat} limit</div>
          </div>
        </div>

        {/* Merchant */}
        <div className="w-full flex justify-between md:block items-center">
          <div className="md:hidden font-mono text-[10px] text-zinc-500 tracking-widest">MERCHANT</div>
          <MerchantBadge merchant={ad.merchant} />
        </div>

        {/* Exchange + Available (Desktop Layout focus) */}
        <div className="w-full flex justify-between md:block items-center md:flex-col md:items-start gap-1">
          <div className="md:hidden font-mono text-[10px] text-zinc-500 tracking-widest">AVAILABLE</div>
          <div className="hidden md:block"><ExchangeBadge exchange={ad.exchange} /></div>
          <span className="font-mono text-[10px] text-zinc-500 dark:text-zinc-400 text-right md:text-left">
            {ad.available.toLocaleString(undefined, { maximumFractionDigits: 2 })} {ad.asset} avail.
          </span>
        </div>

        {/* Expand toggle (Desktop only) */}
        <div className="hidden md:flex justify-end">
          <ChevronDown className={`w-4 h-4 text-zinc-400 transition-transform ${expanded ? 'rotate-180' : ''}`} />
        </div>
      </div>

      {/* Expanded details */}
      <AnimatePresence>
        {expanded && (
          <motion.div
            className="border-t border-zinc-100 dark:border-zinc-800 px-4 py-4 bg-zinc-50 dark:bg-zinc-900/50"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.15 }}
          >
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
              <div>
                <div className="font-mono text-[10px] text-zinc-500 dark:text-zinc-400 tracking-widest mb-2">PAYMENT METHODS</div>
                <PaymentTags methods={ad.paymentMethods} />
              </div>
              <div>
                <div className="font-mono text-[10px] text-zinc-500 dark:text-zinc-400 tracking-widest mb-2">MERCHANT STATS</div>
                <div className="font-mono text-xs text-zinc-800 dark:text-zinc-200 space-y-1">
                  <div className="flex justify-between sm:justify-start sm:gap-2">
                    <span>Completion:</span>
                    <span className={ad.merchant.completionRate >= 95 ? 'text-emerald-600 dark:text-emerald-400' : 'text-amber-600 dark:text-amber-500'}>
                      {ad.merchant.completionRate.toFixed(1)}%
                    </span>
                  </div>
                  <div className="flex justify-between sm:justify-start sm:gap-2">
                    <span>Orders:</span> 
                    <span className="text-emerald-600 dark:text-emerald-400">{ad.merchant.orderCount.toLocaleString()}</span>
                  </div>
                  <div className="flex justify-between sm:justify-start sm:gap-2">
                    <span>Verified:</span> 
                    <span className={ad.merchant.isVerified ? 'text-emerald-600 dark:text-emerald-400' : 'text-zinc-500'}>
                      {ad.merchant.isVerified ? 'Yes' : 'No'}
                    </span>
                  </div>
                </div>
              </div>
              <div>
                <div className="font-mono text-[10px] text-zinc-500 dark:text-zinc-400 tracking-widest mb-2">TRADE DETAILS</div>
                <div className="font-mono text-xs text-zinc-800 dark:text-zinc-200 space-y-1">
                  <div className="flex justify-between sm:justify-start sm:gap-2">
                    <span>Min:</span> 
                    <span className="text-zinc-900 dark:text-zinc-100">{ad.minAmount.toLocaleString()} {fiat}</span>
                  </div>
                  <div className="flex justify-between sm:justify-start sm:gap-2">
                    <span>Max:</span> 
                    <span className="text-zinc-900 dark:text-zinc-100">{ad.maxAmount.toLocaleString()} {fiat}</span>
                  </div>
                  <div className="flex justify-between sm:justify-start sm:gap-2">
                    <span>Available:</span> 
                    <span className="text-zinc-900 dark:text-zinc-100">{ad.available.toLocaleString(undefined, { maximumFractionDigits: 4 })} {ad.asset}</span>
                  </div>
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
  const [minComp,    setMinComp]    = useState(0); 
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

  useEffect(() => { fetchAds(); }, [fetchAds]);

  const filteredAds = (result?.ads || []).filter(ad => {
    if (asset && ad.asset.toUpperCase() !== asset.toUpperCase()) return false;
    if (exchange !== 'all' && ad.exchange.toLowerCase() !== exchange.toLowerCase()) return false;
    if (verifiedOnly && !ad.merchant.isVerified) return false;
    if (ad.merchant.completionRate < minComp) return false;

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

  // Keep debug logging strictly per logic preservation
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
    <div className="min-h-full bg-white dark:bg-zinc-950 overflow-y-auto px-4 py-6 md:px-6">
      <div className="max-w-5xl mx-auto space-y-6">

        {/* ── Header ── */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="font-mono font-bold text-xl text-zinc-900 dark:text-zinc-100 tracking-[0.1em]">
              P2P MARKET
            </h1>
            <p className="font-mono text-[10px] text-zinc-500 dark:text-zinc-400 mt-1 tracking-widest uppercase">
              Live Merchant Ads · Cross-Exchange · Real-Time Rates
            </p>
          </div>
          <button
            onClick={fetchAds}
            disabled={loading}
            className="flex items-center justify-center gap-2 px-4 py-2 bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 font-mono text-xs text-zinc-600 dark:text-zinc-300 hover:text-zinc-900 dark:hover:text-white transition-colors disabled:opacity-50 w-full sm:w-auto"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </button>
        </div>

        {/* ── Filter Bar ── */}
        <div className="border border-zinc-200 dark:border-zinc-800 p-4 bg-zinc-50 dark:bg-zinc-900">
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4 mb-4">
            
            {/* Trade type toggle */}
            <div className="col-span-1 sm:col-span-2 md:col-span-1">
              <label className="font-mono text-[10px] text-zinc-500 dark:text-zinc-400 tracking-widest block mb-2">I WANT TO</label>
              <div className="flex overflow-hidden border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-950">
                {(['BUY', 'SELL'] as const).map(t => (
                  <button
                    key={t}
                    onClick={() => setTradeType(t)}
                    className={`flex-1 py-2 font-mono text-xs font-bold transition-colors ${
                      tradeType === t
                        ? t === 'BUY'
                          ? 'bg-zinc-900 text-white dark:bg-zinc-100 dark:text-black'
                          : 'bg-zinc-900 text-white dark:bg-zinc-100 dark:text-black'
                        : 'bg-transparent text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-200'
                    }`}
                  >
                    {t}
                  </button>
                ))}
              </div>
            </div>

            {/* Asset */}
            <div>
              <label className="font-mono text-[10px] text-zinc-500 dark:text-zinc-400 tracking-widest block mb-2">ASSET</label>
              <select
                value={asset}
                onChange={e => setAsset(e.target.value)}
                className="w-full bg-white dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-700 px-3 py-2 font-mono text-xs text-zinc-900 dark:text-zinc-100 outline-none focus:border-zinc-400 dark:focus:border-zinc-500 transition-colors rounded-none appearance-none"
              >
                {(supported?.assets || ['USDT', 'USDC', 'BTC', 'ETH', 'BNB']).map(a => (
                  <option key={a} value={a}>{a}</option>
                ))}
              </select>
            </div>

            {/* Fiat */}
            <div>
              <label className="font-mono text-[10px] text-zinc-500 dark:text-zinc-400 tracking-widest block mb-2">FIAT CURRENCY</label>
              <select
                value={fiat}
                onChange={e => setFiat(e.target.value)}
                className="w-full bg-white dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-700 px-3 py-2 font-mono text-xs text-zinc-900 dark:text-zinc-100 outline-none focus:border-zinc-400 dark:focus:border-zinc-500 transition-colors rounded-none appearance-none"
              >
                {(supported?.fiats || ['KES', 'NGN', 'GHS', 'ZAR', 'INR', 'PKR', 'USD', 'EUR']).map(f => (
                  <option key={f} value={f}>{f}</option>
                ))}
              </select>
            </div>

            {/* Exchange */}
            <div>
              <label className="font-mono text-[10px] text-zinc-500 dark:text-zinc-400 tracking-widest block mb-2">EXCHANGE</label>
              <select
                value={exchange}
                onChange={e => setExchange(e.target.value)}
                className="w-full bg-white dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-700 px-3 py-2 font-mono text-xs text-zinc-900 dark:text-zinc-100 outline-none focus:border-zinc-400 dark:focus:border-zinc-500 transition-colors rounded-none appearance-none"
              >
                <option value="all">All Exchanges</option>
                {(supported?.exchanges || ['binance', 'bybit', 'okx', 'kucoin', 'bitget']).map(ex => (
                  <option key={ex} value={ex}>{EXCHANGE_LABELS[ex] || ex}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Secondary filters */}
          <div className="flex flex-col md:flex-row items-start md:items-center gap-4 pt-4 border-t border-zinc-200 dark:border-zinc-800">
            
            {/* Search */}
            <div className="relative w-full md:flex-1 md:max-w-xs">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-zinc-400" />
              <input
                type="text"
                value={searchTerm}
                onChange={e => setSearchTerm(e.target.value)}
                placeholder="Search merchant or payment..."
                className="w-full bg-white dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-700 pl-8 pr-3 py-2 font-mono text-xs text-zinc-900 dark:text-zinc-100 placeholder:text-zinc-400 dark:placeholder:text-zinc-600 outline-none focus:border-zinc-400 dark:focus:border-zinc-500 transition-colors"
              />
            </div>

            <div className="flex items-center gap-4 w-full md:w-auto justify-between md:justify-start">
                {/* Min completion rate */}
                <div className="flex items-center gap-2">
                <label className="font-mono text-[10px] text-zinc-500 dark:text-zinc-400 whitespace-nowrap">MIN COMPLETION</label>
                <select
                    value={minComp}
                    onChange={e => setMinComp(Number(e.target.value))}
                    className="bg-white dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-700 px-2 py-1.5 font-mono text-xs text-zinc-900 dark:text-zinc-100 outline-none focus:border-zinc-400 dark:focus:border-zinc-500 transition-colors appearance-none"
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
                    className={`w-8 h-4 transition-colors relative border ${verifiedOnly ? 'bg-zinc-900 border-zinc-900 dark:bg-zinc-100 dark:border-zinc-100' : 'bg-zinc-200 border-zinc-300 dark:bg-zinc-800 dark:border-zinc-700'}`}
                >
                    <div className={`absolute top-0.5 w-2.5 h-2.5 bg-white dark:bg-zinc-900 transition-all ${verifiedOnly ? 'left-[18px]' : 'left-1'}`} />
                </div>
                <span className="font-mono text-[10px] text-zinc-500 dark:text-zinc-400">VERIFIED ONLY</span>
                </label>
            </div>
          </div>
        </div>

        {/* ── Summary Cards ── */}
        {summary && !loading && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {[
              {
                label: tradeType === 'BUY' ? 'BEST BUY RATE' : 'BEST SELL RATE',
                value: tradeType === 'BUY'
                  ? summary.lowestRate?.toLocaleString(undefined, { maximumFractionDigits: 2 })
                  : summary.highestRate?.toLocaleString(undefined, { maximumFractionDigits: 2 }),
                sub:   `${fiat} per ${asset}`,
                color: tradeType === 'BUY' ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400',
              },
              {
                label: 'AVG RATE',
                value: summary.averageRate?.toLocaleString(undefined, { maximumFractionDigits: 2 }) || '—',
                sub:   `${fiat} per ${asset}`,
                color: 'text-zinc-900 dark:text-zinc-100',
              },
              {
                label: 'TOTAL ADS',
                value: filteredAds.length,
                sub:   `of ${result?.totalAds || 0} fetched`,
                color: 'text-zinc-900 dark:text-zinc-100',
              },
              {
                label: 'EXCHANGES',
                value: summary.exchangesWithData,
                sub:   `of ${summary.exchangesQueried} queried`,
                color: 'text-zinc-900 dark:text-zinc-100',
              },
            ].map(card => (
              <div key={card.label} className="border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 p-4">
                <div className="font-mono text-[10px] text-zinc-500 dark:text-zinc-400 tracking-widest mb-1">{card.label}</div>
                <div className={`font-mono font-bold text-xl ${card.color}`}>{card.value ?? '—'}</div>
                <div className="font-mono text-[10px] text-zinc-500 dark:text-zinc-400 mt-1">{card.sub}</div>
              </div>
            ))}
          </div>
        )}

        {/* ── Status banners ── */}
        <div className="space-y-2">
            {result?.stale && (
            <div className="flex items-center gap-2 px-4 py-3 bg-amber-50 dark:bg-amber-900/10 border border-amber-200 dark:border-amber-900/50 font-mono text-xs text-amber-800 dark:text-amber-500">
                <WifiOff className="w-4 h-4 flex-shrink-0" />
                <span>Showing cached data ({result.staleAge}) — live fetch failed. Refreshing automatically.</span>
            </div>
            )}
            {result?.cached && !result?.stale && (
            <div className="flex items-center gap-2 px-4 py-3 bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 font-mono text-[10px] text-zinc-500 dark:text-zinc-400">
                <Wifi className="w-4 h-4 text-emerald-600 dark:text-emerald-500 flex-shrink-0" />
                <span>Data cached · auto-refreshes every 15 minutes</span>
            </div>
            )}
            {result?.errors && Object.keys(result.errors).length > 0 && (
            <div className="flex items-start gap-2 px-4 py-3 bg-red-50 dark:bg-red-900/10 border border-red-200 dark:border-red-900/50 font-mono text-xs text-red-800 dark:text-red-400">
                <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
                <div className="flex flex-col gap-1">
                <span className="font-bold">Some exchanges failed:</span>
                <div>
                    {Object.entries(result.errors).map(([ex, err]) => (
                    <span key={ex} className="block sm:inline sm:mr-4">
                        <span className="capitalize">{ex}</span>: {err}
                    </span>
                    ))}
                </div>
                </div>
            </div>
            )}
        </div>

        {/* ── Desktop Table Header (Hidden on Mobile) ── */}
        {!loading && filteredAds.length > 0 && (
          <div
            className="hidden md:grid px-4 py-2 font-mono text-[10px] text-zinc-500 dark:text-zinc-400 tracking-widest border-b border-zinc-200 dark:border-zinc-800"
            style={{ gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr) minmax(0, 1fr) minmax(0, 1fr) 24px' }}
          >
            <div>PRICE ({fiat})</div>
            <div>LIMITS ({fiat})</div>
            <div>MERCHANT</div>
            <div>EXCHANGE / AVAILABLE</div>
            <div />
          </div>
        )}

        {/* ── Ad rows ── */}
        <div className="space-y-3 md:space-y-2">
            {loading ? (
            [...Array(6)].map((_, i) => (
                <div key={i} className="h-24 md:h-16 bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 animate-pulse" />
            ))
            ) : error ? (
            <div className="flex flex-col items-center justify-center py-16 gap-4 border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950">
                <AlertCircle className="w-8 h-8 text-red-500" />
                <div className="font-mono text-sm text-zinc-900 dark:text-zinc-100">{error}</div>
                <button onClick={fetchAds} className="font-mono text-xs text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100 border-b border-zinc-500 transition-colors pb-0.5">Try again</button>
            </div>
            ) : filteredAds.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 gap-3 border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900/50">
                <ArrowLeftRight className="w-8 h-8 text-zinc-300 dark:text-zinc-700" />
                <div className="font-mono text-sm text-zinc-600 dark:text-zinc-400">No ads match your filters</div>
                <div className="font-mono text-xs text-zinc-500">Try a different fiat, asset, or exchange</div>
            </div>
            ) : (
            <AnimatePresence mode="popLayout">
                {filteredAds.map((ad, i) => (
                <motion.div
                    key={`${ad.exchange}-${ad.merchant.name}-${i}`}
                    initial={{ opacity: 0, y: 4 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0 }}
                    transition={{ delay: i * 0.02, duration: 0.2 }}
                >
                    <AdRow ad={ad} fiat={fiat} />
                </motion.div>
                ))}
            </AnimatePresence>
            )}
        </div>

        {/* ── Safety reminder ── */}
        <div className="flex items-start gap-3 bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 p-4 mt-6">
          <ShieldCheck className="w-4 h-4 text-zinc-700 dark:text-zinc-300 flex-shrink-0 mt-0.5" />
          <div className="font-mono text-[10px] text-zinc-600 dark:text-zinc-400 leading-relaxed">
            <span className="text-zinc-900 dark:text-zinc-100 font-bold uppercase tracking-wider">Safety tips: </span>
            Always trade with merchants with <span className="text-zinc-900 dark:text-zinc-100">≥95% completion rate</span> and{' '}
            <span className="text-zinc-900 dark:text-zinc-100">≥100 orders</span>. Never release crypto before confirming payment.
            Only use official exchange P2P portals — ChainWise links directly to the exchange. Rates update every 15 minutes.
          </div>
        </div>

      </div>
    </div>
  );
}