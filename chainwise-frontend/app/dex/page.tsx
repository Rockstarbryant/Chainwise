'use client';

import { useState, useRef, useCallback } from 'react';
import {
  Search, X, ExternalLink, AlertTriangle, ChevronDown,
  ChevronUp, Activity, Droplets, TrendingUp, TrendingDown,
  Shield, ShieldAlert, ShieldOff, Copy, Check, Zap,
} from 'lucide-react';

// ── Types ─────────────────────────────────────────────────────────────────
interface RiskFlag  { level: 'high' | 'medium' | 'low'; msg: string }
interface TokenInfo { address?: string; name?: string; symbol?: string }

interface Pool {
  dexId:       string;
  dexName:     string;
  chain:       string;
  chainName:   string;
  pairAddress: string;
  pair:        string;
  priceUSD:    number;
  liquidity:   number;
  volume24h:   number;
  volume1h:    number;
  priceChange: { h1: number; h6: number; h24: number };
  txns24h:     { buys: number; sells: number };
  fdv:         number;
  marketCap:   number;
  url:         string;
  createdAt:   string | null;
  trustScore:  number | null;
  riskFlags:   RiskFlag[];
  score:       number;
  baseToken:   TokenInfo;
  quoteToken:  TokenInfo;
  dexDetails:  {
    name: string;
    yearEstablished: number | null;
    country: string | null;
    description: string | null;
    website: string | null;
    image: string | null;
    trustScore: number | null;
    trustScoreRank: number | null;
    tradeVolume24h: number | null;
  } | null;
}

interface CoinData {
  id?: string;
  name: string;
  symbol: string;
  image?: string;
  description?: string;
  priceUSD: number;
  priceChange24h: number;
  marketCap: number;
  fdv: number;
  volume24h: number;
  chains: string[];
  contractAddresses?: Record<string, string>;
  links?: { website?: string; twitter?: string; telegram?: string; coingecko?: string };
  notOnCEX?: boolean;
}

interface DEXResult {
  query:       string;
  isCA:        boolean;
  coin:        CoinData | null;
  pools:       Pool[];
  totalPools:  number;
  chains:      string[];
  dexes:       string[];
  warnings:    string[];
  fetchedAt:   string;
}

// ── Helpers ───────────────────────────────────────────────────────────────
const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000';

function fmt(n: number): string {
  if (!n) return '—';
  if (n >= 1_000_000_000) return `$${(n / 1_000_000_000).toFixed(2)}B`;
  if (n >= 1_000_000)     return `$${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000)         return `$${(n / 1_000).toFixed(1)}K`;
  return `$${n.toFixed(2)}`;
}

function fmtPrice(n: number): string {
  if (!n) return '—';
  if (n >= 1)     return `$${n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 4 })}`;
  if (n >= 0.001) return `$${n.toFixed(6)}`;
  return `$${n.toExponential(4)}`;
}

function fmtChange(n: number): string {
  if (!n && n !== 0) return '—';
  return `${n >= 0 ? '+' : ''}${n.toFixed(2)}%`;
}

function shortAddr(addr: string): string {
  if (!addr) return '';
  return `${addr.slice(0, 6)}...${addr.slice(-4)}`;
}

const CHAIN_COLORS: Record<string, string> = {
  ethereum:  'bg-blue-900/60 text-blue-300 border-blue-700',
  bsc:       'bg-yellow-900/60 text-yellow-300 border-yellow-700',
  polygon:   'bg-purple-900/60 text-purple-300 border-purple-700',
  arbitrum:  'bg-sky-900/60 text-sky-300 border-sky-700',
  base:      'bg-indigo-900/60 text-indigo-300 border-indigo-700',
  optimism:  'bg-red-900/60 text-red-300 border-red-700',
  avalanche: 'bg-rose-900/60 text-rose-300 border-rose-700',
  solana:    'bg-violet-900/60 text-violet-300 border-violet-700',
  fantom:    'bg-cyan-900/60 text-cyan-300 border-cyan-700',
  default:   'bg-slate-800 text-slate-300 border-slate-600',
};

function chainColor(chain: string) {
  return CHAIN_COLORS[chain?.toLowerCase()] || CHAIN_COLORS.default;
}

// ── Sub-components ────────────────────────────────────────────────────────

function TrustBadge({ score }: { score: number | null }) {
  if (score === null) return (
    <span className="flex items-center gap-1 text-slate-500 text-[10px] font-mono">
      <ShieldOff className="w-3 h-3" /> No score
    </span>
  );
  if (score >= 7) return (
    <span className="flex items-center gap-1 text-emerald-400 text-[10px] font-mono font-bold">
      <Shield className="w-3 h-3" /> {score}/10
    </span>
  );
  if (score >= 4) return (
    <span className="flex items-center gap-1 text-yellow-400 text-[10px] font-mono font-bold">
      <ShieldAlert className="w-3 h-3" /> {score}/10
    </span>
  );
  return (
    <span className="flex items-center gap-1 text-red-400 text-[10px] font-mono font-bold">
      <ShieldOff className="w-3 h-3" /> {score}/10
    </span>
  );
}

function RiskPill({ flag }: { flag: RiskFlag }) {
  const colors = {
    high:   'bg-red-950 text-red-300 border-red-800',
    medium: 'bg-yellow-950 text-yellow-300 border-yellow-800',
    low:    'bg-slate-800 text-slate-400 border-slate-700',
  };
  return (
    <span className={`text-[10px] font-mono px-2 py-0.5 rounded border ${colors[flag.level]}`}>
      {flag.msg}
    </span>
  );
}

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  const copy = () => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };
  return (
    <button onClick={copy} className="text-slate-500 hover:text-slate-300 transition-colors">
      {copied ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
    </button>
  );
}

function PoolCard({ pool, rank }: { pool: Pool; rank: number }) {
  const [expanded, setExpanded] = useState(false);
  const pos = pool.priceChange.h24 >= 0;

  return (
    <div className="border border-slate-700/60 rounded-xl overflow-hidden bg-slate-900/50 hover:border-slate-600 transition-colors">
      {/* ── Card header ── */}
      <div className="p-4">
        <div className="flex items-start justify-between gap-3">
          {/* Rank + DEX + Chain */}
          <div className="flex items-center gap-3 min-w-0">
            <span className="font-mono text-[11px] text-slate-500 w-5 shrink-0">
              #{rank}
            </span>
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="font-mono text-sm font-bold text-white truncate">
                  {pool.dexName}
                </span>
                <span className={`text-[10px] font-mono px-2 py-0.5 rounded border ${chainColor(pool.chain)}`}>
                  {pool.chainName}
                </span>
                {pool.trustScore !== null && <TrustBadge score={pool.trustScore} />}
              </div>
              <div className="flex items-center gap-1.5 mt-1">
                <span className="font-mono text-xs text-slate-400">{pool.pair}</span>
                {pool.pairAddress && (
                  <>
                    <span className="font-mono text-[10px] text-slate-600">
                      {shortAddr(pool.pairAddress)}
                    </span>
                    <CopyButton text={pool.pairAddress} />
                  </>
                )}
              </div>
            </div>
          </div>

          {/* Price */}
          <div className="text-right shrink-0">
            <div className="font-mono text-sm font-bold text-white">
              {fmtPrice(pool.priceUSD)}
            </div>
            <div className={`font-mono text-[11px] font-bold ${pos ? 'text-emerald-400' : 'text-red-400'}`}>
              {pos ? <TrendingUp className="w-3 h-3 inline mr-0.5" /> : <TrendingDown className="w-3 h-3 inline mr-0.5" />}
              {fmtChange(pool.priceChange.h24)}
            </div>
          </div>
        </div>

        {/* Stats row */}
        <div className="grid grid-cols-3 gap-2 mt-3">
          <div className="bg-slate-800/60 rounded-lg p-2.5">
            <div className="flex items-center gap-1 text-slate-500 mb-1">
              <Droplets className="w-3 h-3" />
              <span className="text-[10px] font-mono uppercase tracking-wider">Liquidity</span>
            </div>
            <div className="font-mono text-xs font-bold text-white">{fmt(pool.liquidity)}</div>
          </div>
          <div className="bg-slate-800/60 rounded-lg p-2.5">
            <div className="flex items-center gap-1 text-slate-500 mb-1">
              <Activity className="w-3 h-3" />
              <span className="text-[10px] font-mono uppercase tracking-wider">Vol 24h</span>
            </div>
            <div className="font-mono text-xs font-bold text-white">{fmt(pool.volume24h)}</div>
          </div>
          <div className="bg-slate-800/60 rounded-lg p-2.5">
            <div className="flex items-center gap-1 text-slate-500 mb-1">
              <Zap className="w-3 h-3" />
              <span className="text-[10px] font-mono uppercase tracking-wider">Txns 24h</span>
            </div>
            <div className="font-mono text-xs font-bold">
              <span className="text-emerald-400">{pool.txns24h?.buys || '—'}</span>
              <span className="text-slate-600 mx-1">/</span>
              <span className="text-red-400">{pool.txns24h?.sells || '—'}</span>
            </div>
          </div>
        </div>

        {/* Risk flags */}
        {pool.riskFlags.length > 0 && (
          <div className="flex flex-wrap gap-1.5 mt-2.5">
            {pool.riskFlags.map((f, i) => <RiskPill key={i} flag={f} />)}
          </div>
        )}

        {/* Action buttons */}
        <div className="flex items-center justify-between mt-3">
          <button
            onClick={() => setExpanded(v => !v)}
            className="flex items-center gap-1 text-[11px] font-mono text-slate-400 hover:text-white transition-colors"
          >
            {expanded ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
            {expanded ? 'Less info' : 'DEX details'}
          </button>
          <a
            href={pool.url}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1.5 font-mono text-[11px] font-bold
                       bg-emerald-500 hover:bg-emerald-400 text-black
                       px-3 py-1.5 rounded-lg transition-colors"
          >
            Trade <ExternalLink className="w-3 h-3" />
          </a>
        </div>
      </div>

      {/* ── Expanded DEX details ── */}
      {expanded && pool.dexDetails && (
        <div className="border-t border-slate-700/60 bg-slate-800/30 p-4 space-y-3">
          <div className="flex items-center gap-3">
            {pool.dexDetails.image && (
              <img src={pool.dexDetails.image} alt={pool.dexDetails.name}
                   className="w-8 h-8 rounded-full" />
            )}
            <div>
              <div className="font-mono text-sm font-bold text-white">{pool.dexDetails.name}</div>
              <div className="font-mono text-[10px] text-slate-500">
                {pool.dexDetails.yearEstablished && `Est. ${pool.dexDetails.yearEstablished}`}
                {pool.dexDetails.country && ` · ${pool.dexDetails.country}`}
              </div>
            </div>
            {pool.dexDetails.trustScore !== null && (
              <div className="ml-auto text-right">
                <div className="font-mono text-[10px] text-slate-500">Trust Score</div>
                <TrustBadge score={pool.dexDetails.trustScore} />
              </div>
            )}
          </div>

          {pool.dexDetails.description && (
            <p className="font-mono text-[11px] text-slate-400 leading-relaxed line-clamp-3">
              {pool.dexDetails.description}
            </p>
          )}

          <div className="grid grid-cols-2 gap-2 text-[11px] font-mono">
            {pool.dexDetails.tradeVolume24h && (
              <div className="bg-slate-800 rounded p-2">
                <div className="text-slate-500">Global 24h Volume</div>
                <div className="text-white font-bold">
                  {pool.dexDetails.tradeVolume24h.toFixed(2)} BTC
                </div>
              </div>
            )}
            {pool.dexDetails.trustScoreRank && (
              <div className="bg-slate-800 rounded p-2">
                <div className="text-slate-500">Trust Rank</div>
                <div className="text-white font-bold">#{pool.dexDetails.trustScoreRank}</div>
              </div>
            )}
          </div>

          {pool.dexDetails.website && (
            <a href={pool.dexDetails.website} target="_blank" rel="noopener noreferrer"
               className="flex items-center gap-1 text-[11px] font-mono text-sky-400 hover:text-sky-300">
              {pool.dexDetails.website} <ExternalLink className="w-3 h-3" />
            </a>
          )}
        </div>
      )}
    </div>
  );
}

function CoinHeader({ coin }: { coin: CoinData }) {
  const pos = coin.priceChange24h >= 0;
  return (
    <div className="rounded-xl border border-slate-700/60 bg-slate-900/60 p-5">
      <div className="flex items-start gap-4">
        {coin.image && (
          <img src={coin.image} alt={coin.name}
               className="w-12 h-12 rounded-full shrink-0 ring-2 ring-slate-700" />
        )}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-3 flex-wrap">
            <h2 className="font-mono text-lg font-black text-white">{coin.name}</h2>
            <span className="font-mono text-sm text-slate-400 bg-slate-800 px-2 py-0.5 rounded">
              {coin.symbol}
            </span>
            {coin.notOnCEX && (
              <span className="font-mono text-[10px] bg-orange-950 text-orange-300 border border-orange-800 px-2 py-0.5 rounded font-bold">
                DEX ONLY
              </span>
            )}
          </div>

          {/* Price row */}
          <div className="flex items-baseline gap-3 mt-2 flex-wrap">
            <span className="font-mono text-2xl font-black text-white">
              {fmtPrice(coin.priceUSD)}
            </span>
            <span className={`font-mono text-sm font-bold ${pos ? 'text-emerald-400' : 'text-red-400'}`}>
              {pos ? <TrendingUp className="w-4 h-4 inline mr-1" /> : <TrendingDown className="w-4 h-4 inline mr-1" />}
              {fmtChange(coin.priceChange24h)} 24h
            </span>
          </div>

          {/* Stats */}
          <div className="flex flex-wrap gap-4 mt-3 text-[11px] font-mono">
            {coin.marketCap > 0 && (
              <div>
                <span className="text-slate-500">MCap </span>
                <span className="text-white font-bold">{fmt(coin.marketCap)}</span>
              </div>
            )}
            {coin.fdv > 0 && (
              <div>
                <span className="text-slate-500">FDV </span>
                <span className="text-white font-bold">{fmt(coin.fdv)}</span>
              </div>
            )}
            {coin.volume24h > 0 && (
              <div>
                <span className="text-slate-500">Vol 24h </span>
                <span className="text-white font-bold">{fmt(coin.volume24h)}</span>
              </div>
            )}
          </div>

          {/* Chain pills */}
          {coin.chains?.length > 0 && (
            <div className="flex flex-wrap gap-1.5 mt-3">
              {coin.chains.slice(0, 8).map(c => (
                <span key={c} className={`text-[10px] font-mono px-2 py-0.5 rounded border ${chainColor(c)}`}>
                  {c}
                </span>
              ))}
              {coin.chains.length > 8 && (
                <span className="text-[10px] font-mono text-slate-500">+{coin.chains.length - 8} more</span>
              )}
            </div>
          )}

          {/* Description */}
          {coin.description && (
            <p className="font-mono text-[11px] text-slate-400 mt-3 leading-relaxed line-clamp-2">
              {coin.description}
            </p>
          )}

          {/* Links */}
          {coin.links && (
            <div className="flex flex-wrap gap-2 mt-3">
              {coin.links.coingecko && (
                <a href={coin.links.coingecko} target="_blank" rel="noopener noreferrer"
                   className="font-mono text-[10px] bg-slate-800 hover:bg-slate-700 text-slate-300
                              px-2 py-1 rounded flex items-center gap-1 transition-colors">
                  CoinGecko <ExternalLink className="w-2.5 h-2.5" />
                </a>
              )}
              {coin.links.website && (
                <a href={coin.links.website} target="_blank" rel="noopener noreferrer"
                   className="font-mono text-[10px] bg-slate-800 hover:bg-slate-700 text-slate-300
                              px-2 py-1 rounded flex items-center gap-1 transition-colors">
                  Website <ExternalLink className="w-2.5 h-2.5" />
                </a>
              )}
              {coin.links.twitter && (
                <a href={coin.links.twitter} target="_blank" rel="noopener noreferrer"
                   className="font-mono text-[10px] bg-slate-800 hover:bg-slate-700 text-slate-300
                              px-2 py-1 rounded flex items-center gap-1 transition-colors">
                  Twitter <ExternalLink className="w-2.5 h-2.5" />
                </a>
              )}
              {coin.links.telegram && (
                <a href={coin.links.telegram} target="_blank" rel="noopener noreferrer"
                   className="font-mono text-[10px] bg-slate-800 hover:bg-slate-700 text-slate-300
                              px-2 py-1 rounded flex items-center gap-1 transition-colors">
                  Telegram <ExternalLink className="w-2.5 h-2.5" />
                </a>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Chain + DEX filter bar ─────────────────────────────────────────────────
function FilterBar({
  chains, dexes, activeChain, activeDex,
  onChain, onDex,
}: {
  chains: string[]; dexes: string[];
  activeChain: string | null; activeDex: string | null;
  onChain: (c: string | null) => void; onDex: (d: string | null) => void;
}) {
  return (
    <div className="space-y-2">
      {chains.length > 1 && (
        <div className="flex items-center gap-2 flex-wrap">
          <span className="font-mono text-[10px] text-slate-500 uppercase tracking-widest w-12 shrink-0">Chain</span>
          <button
            onClick={() => onChain(null)}
            className={`font-mono text-[10px] px-2.5 py-1 rounded-md border transition-colors
              ${!activeChain ? 'bg-white text-black border-white' : 'bg-transparent text-slate-400 border-slate-700 hover:border-slate-500'}`}
          >
            All
          </button>
          {chains.map(c => (
            <button key={c}
              onClick={() => onChain(activeChain === c ? null : c)}
              className={`font-mono text-[10px] px-2.5 py-1 rounded-md border transition-colors
                ${activeChain === c ? 'bg-white text-black border-white' : 'bg-transparent text-slate-400 border-slate-700 hover:border-slate-500'}`}
            >
              {c}
            </button>
          ))}
        </div>
      )}
      {dexes.length > 1 && (
        <div className="flex items-center gap-2 flex-wrap">
          <span className="font-mono text-[10px] text-slate-500 uppercase tracking-widest w-12 shrink-0">DEX</span>
          <button
            onClick={() => onDex(null)}
            className={`font-mono text-[10px] px-2.5 py-1 rounded-md border transition-colors
              ${!activeDex ? 'bg-white text-black border-white' : 'bg-transparent text-slate-400 border-slate-700 hover:border-slate-500'}`}
          >
            All
          </button>
          {dexes.slice(0, 8).map(d => (
            <button key={d}
              onClick={() => onDex(activeDex === d ? null : d)}
              className={`font-mono text-[10px] px-2.5 py-1 rounded-md border transition-colors
                ${activeDex === d ? 'bg-white text-black border-white' : 'bg-transparent text-slate-400 border-slate-700 hover:border-slate-500'}`}
            >
              {d}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Main page ──────────────────────────────────────────────────────────────
export default function DEXExplorer() {
  const [inputValue, setInputValue] = useState('');
  const [loading, setLoading]       = useState(false);
  const [result, setResult]         = useState<DEXResult | null>(null);
  const [error, setError]           = useState<string | null>(null);
  const [activeChain, setActiveChain] = useState<string | null>(null);
  const [activeDex, setActiveDex]     = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleSearch = useCallback(async () => {
    const q = inputValue.trim();
    if (!q) return;

    setLoading(true);
    setError(null);
    setResult(null);
    setActiveChain(null);
    setActiveDex(null);

    try {
      const res  = await fetch(`${API_BASE}/api/dex/search?q=${encodeURIComponent(q)}`);
      const data = await res.json();

      if (!res.ok) {
        setError(data?.message || 'No DEX data found. Try a different symbol or contract address.');
        return;
      }
      setResult(data.data);
    } catch {
      setError('Failed to connect to the server. Please try again.');
    } finally {
      setLoading(false);
    }
  }, [inputValue]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') handleSearch();
  };

  const handleClear = () => {
    setInputValue('');
    setResult(null);
    setError(null);
    inputRef.current?.focus();
  };

  // Filtered pools
  const filteredPools = result?.pools.filter(p => {
    if (activeChain && p.chain !== activeChain) return false;
    if (activeDex   && p.dexName !== activeDex) return false;
    return true;
  }) || [];

  const isCA = inputValue.trim().startsWith('0x') || /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(inputValue.trim());

  return (
    <div className="min-h-screen bg-[#0a0a0f] text-slate-100">
      <div className="max-w-4xl mx-auto px-4 py-8 space-y-6">

        {/* ── Header ── */}
        <div className="space-y-1">
          <h1 className="font-mono text-2xl font-black text-white tracking-tight">
            DEX Explorer
          </h1>
          <p className="font-mono text-sm text-slate-500">
            Find where any token trades on-chain — search by symbol or paste a contract address
          </p>
        </div>

        {/* ── Search bar ── */}
        <div className="flex gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500 pointer-events-none" />
            <input
              ref={inputRef}
              type="text"
              value={inputValue}
              onChange={e => setInputValue(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={isCA ? 'Contract address detected — press Search' : 'Search symbol (PEPE, SOMI) or paste contract address (0x...)'}
              className="
                w-full pl-10 pr-10 py-3
                font-mono text-sm
                bg-slate-900 border border-slate-700
                rounded-xl text-white placeholder:text-slate-600
                focus:outline-none focus:border-slate-500
                transition-colors
              "
              spellCheck={false}
              autoComplete="off"
            />
            {inputValue && (
              <button onClick={handleClear}
                className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-500 hover:text-white transition-colors">
                <X className="w-4 h-4" />
              </button>
            )}
          </div>
          <button
            onClick={handleSearch}
            disabled={!inputValue.trim() || loading}
            className="
              font-mono text-sm font-black px-5 py-3 rounded-xl
              bg-white text-black hover:bg-slate-200
              disabled:opacity-30 disabled:cursor-not-allowed
              transition-colors shrink-0
            "
          >
            {loading ? '...' : 'Search'}
          </button>
        </div>

        {/* ── Quick examples ── */}
        {!result && !loading && !error && (
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-mono text-[11px] text-slate-600">Try:</span>
            {['PEPE', 'SOMI', 'SHIB', '0x6982508145454Ce325dDbE47a25d4ec3d2311933'].map(ex => (
              <button key={ex}
                onClick={() => { setInputValue(ex); }}
                className="font-mono text-[11px] text-slate-500 hover:text-white border border-slate-800
                           hover:border-slate-600 px-2.5 py-1 rounded-lg transition-colors truncate max-w-[180px]">
                {ex.startsWith('0x') ? shortAddr(ex) : ex}
              </button>
            ))}
          </div>
        )}

        {/* ── Loading ── */}
        {loading && (
          <div className="flex flex-col items-center justify-center py-16 space-y-3">
            <div className="w-8 h-8 border-2 border-white border-t-transparent rounded-full animate-spin" />
            <p className="font-mono text-sm text-slate-500">Searching DexScreener, GeckoTerminal & CoinGecko...</p>
          </div>
        )}

        {/* ── Error ── */}
        {error && !loading && (
          <div className="flex items-start gap-3 bg-red-950/40 border border-red-800/50 rounded-xl p-4">
            <AlertTriangle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
            <p className="font-mono text-sm text-red-300">{error}</p>
          </div>
        )}

        {/* ── Results ── */}
        {result && !loading && (
          <div className="space-y-5">

            {/* Warnings */}
            {result.warnings.length > 0 && (
              <div className="space-y-2">
                {result.warnings.map((w, i) => (
                  <div key={i} className="flex items-start gap-2 bg-orange-950/30 border border-orange-800/40 rounded-lg px-3 py-2">
                    <AlertTriangle className="w-3.5 h-3.5 text-orange-400 shrink-0 mt-0.5" />
                    <span className="font-mono text-[11px] text-orange-300">{w}</span>
                  </div>
                ))}
              </div>
            )}

            {/* Coin header */}
            {result.coin && <CoinHeader coin={result.coin} />}

            {/* Summary stats */}
            <div className="grid grid-cols-3 gap-3">
              {[
                { label: 'Pools found',    value: result.totalPools },
                { label: 'Chains',         value: result.chains.length },
                { label: 'DEXes',          value: result.dexes.length },
              ].map(({ label, value }) => (
                <div key={label} className="bg-slate-900/60 border border-slate-800 rounded-xl p-3 text-center">
                  <div className="font-mono text-xl font-black text-white">{value}</div>
                  <div className="font-mono text-[10px] text-slate-500 mt-0.5 uppercase tracking-wider">{label}</div>
                </div>
              ))}
            </div>

            {/* Filters */}
            {(result.chains.length > 1 || result.dexes.length > 1) && (
              <div className="bg-slate-900/40 border border-slate-800 rounded-xl p-4">
                <FilterBar
                  chains={result.chains}
                  dexes={result.dexes}
                  activeChain={activeChain}
                  activeDex={activeDex}
                  onChain={setActiveChain}
                  onDex={setActiveDex}
                />
              </div>
            )}

            {/* Pool count after filter */}
            <div className="flex items-center justify-between">
              <span className="font-mono text-[11px] text-slate-500">
                Showing {filteredPools.length} of {result.totalPools} pools
                {(activeChain || activeDex) && ' (filtered)'}
              </span>
              <span className="font-mono text-[10px] text-slate-600">
                Ranked by liquidity · volume · trust
              </span>
            </div>

            {/* Pool cards */}
            <div className="space-y-3">
              {filteredPools.length > 0 ? filteredPools.map((pool, i) => (
                <PoolCard key={`${pool.dexId}-${pool.chain}-${pool.pairAddress}`} pool={pool} rank={i + 1} />
              )) : (
                <div className="text-center py-10 font-mono text-sm text-slate-500">
                  No pools match the selected filters.
                </div>
              )}
            </div>

            {/* Data sources footer */}
            <div className="border-t border-slate-800 pt-4">
              <p className="font-mono text-[10px] text-slate-600 text-center">
                Data from DexScreener · GeckoTerminal · CoinGecko
                {result.fetchedAt && ` · ${new Date(result.fetchedAt).toLocaleTimeString()}`}
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}