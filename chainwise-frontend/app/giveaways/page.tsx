'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import {
  Gift, RefreshCw, ExternalLink, MessageSquare, Zap,
  Heart, Repeat2, Clock, Trophy,
  ChevronDown, ChevronUp, Shield, AlertTriangle,
  Filter, Send, CheckCircle, XCircle,
} from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';

// ─── Types ─────────────────────────────────────────────────────────────────────
interface Requirement {
  type:        'follow' | 'repost' | 'reply' | 'tag' | 'like' | 'other';
  description: string;
}

interface Giveaway {
  _id:                 string;
  tweetId:             string;
  exchange:            string;
  exchangeDisplayName: string;
  exchangeHandle:      string;
  tweetUrl:            string;
  tweetText:           string;
  telegramHtml?:       string;           // NEW
  embeddedLinks?:      Array<{ text: string; url: string }>; // NEW
  authorName:          string;
  authorHandle:        string;
  prizePool:           string | null;
  prizeAmountUSD:      number;
  coins:               string[];
  requirements:        Requirement[];
  requirementsRaw:     string[];
  confidence:          number;
  confidenceScore:     number;
  isVerifiedGiveaway:  boolean;
  keywordsMatched:     string[];
  likeCount:           number;
  retweetCount:        number;
  replyCount:          number;
  tweetCreatedAt:      string;
  scannedAt:           string;
  source?:             'twitter' | 'telegram';
  telegramMessageUrl?: string;
  telegramChannel?:    string;
  forwardCount?:       number;
  viewCount?:          number;
  isFreeToEnter?:      boolean;
  effortLevel?:        'low' | 'medium' | 'high';
}

interface ExchangeMeta {
  key:    string;
  name:   string;
  handle: string;
  color:  string;
}

interface ApiResponse {
  giveaways:        Giveaway[];
  pagination:       { total: number; page: number; limit: number; pages: number };
  lastScan:         string | null;
  lastTelegramScan: string | null;
  exchanges:        ExchangeMeta[];
}

interface ScanResult {
  success: boolean;
  message?: string;
  added?:   number;
  total?:   number;
  error?:   string;
}

// ─── Constants ─────────────────────────────────────────────────────────────────
const API_URL      = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000';
const ADMIN_EMAIL  = process.env.NEXT_PUBLIC_ADMIN_EMAIL || 'yobra194@gmail.com';

const SORT_OPTIONS = [
  { value: 'confidence', label: 'Best Match'    },
  { value: 'recent',     label: 'Most Recent'   },
  { value: 'prize',      label: 'Highest Prize' },
];

const SOURCE_OPTIONS = [
  { value: 'all',      label: 'All Sources' },
  { value: 'telegram', label: 'Telegram'    },
  { value: 'twitter',  label: 'X / Twitter' },
];

const REQ_ICONS: Record<string, string> = {
  follow: '👤', repost: '🔁', reply: '💬',
  tag: '🏷️',   like: '❤️',   other: '✅',
};

// ─── Helpers ───────────────────────────────────────────────────────────────────
function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1)  return 'just now';
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

function confidenceLabel(c: number): { text: string; color: string; bg: string } {
  if (c >= 0.8) return { text: 'High',   color: '#22c55e', bg: 'rgba(34,197,94,0.12)'  };
  if (c >= 0.6) return { text: 'Medium', color: '#f59e0b', bg: 'rgba(245,158,11,0.12)' };
  return               { text: 'Low',    color: '#94a3b8', bg: 'rgba(148,163,184,0.1)' };
}

// ─── Source Badge ──────────────────────────────────────────────────────────────
function SourceBadge({ source }: { source?: 'twitter' | 'telegram' }) {
  if (source === 'telegram') {
    return (
      <span
        className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full font-medium"
        style={{ background: 'rgba(38,140,246,0.12)', color: '#4da6ff', border: '1px solid rgba(38,140,246,0.25)' }}
      >
        <Send size={9} /> Telegram
      </span>
    );
  }
  return (
    <span
      className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full font-medium"
      style={{ background: 'rgba(255,255,255,0.06)', color: '#64748b', border: '1px solid rgba(255,255,255,0.1)' }}
    >
      <span style={{ fontSize: 9 }}>𝕏</span> Twitter
    </span>
  );
}

// ─── New Helper: Free / Effort Badge ───────────────────────────────────────
function StatusBadges({ isFree, effort }: { isFree?: boolean; effort?: string }) {
  return (
    <div className="flex gap-2 mt-2">
      {isFree && (
        <span className="inline-flex items-center gap-1 text-xs px-2.5 py-1 rounded-full font-medium bg-emerald-500/10 text-emerald-400 border border-emerald-500/30">
          ✅ Free to Enter
        </span>
      )}
      {effort && (
        <span className={`inline-flex items-center gap-1 text-xs px-2.5 py-1 rounded-full font-medium ${
          effort === 'low' ? 'bg-green-500/10 text-green-400 border border-green-500/30' :
          effort === 'medium' ? 'bg-amber-500/10 text-amber-400 border border-amber-500/30' :
          'bg-red-500/10 text-red-400 border border-red-500/30'
        }`}>
          {effort === 'low' ? '🔥 Low Effort' : effort === 'medium' ? '⚡ Medium Effort' : '💼 High Effort'}
        </span>
      )}
    </div>
  );
}

// ─── Exchange Tab ──────────────────────────────────────────────────────────────
function ExchangeTab({
  exchange, active, count, onClick,
}: {
  exchange: ExchangeMeta | { key: string; name: string; color: string; handle: string };
  active:   boolean;
  count:    number;
  onClick:  () => void;
}) {
  return (
    <button
      onClick={onClick}
      className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all whitespace-nowrap"
      style={{
        background: active ? `${exchange.color}22` : 'transparent',
        border:     `1px solid ${active ? exchange.color : 'rgba(255,255,255,0.08)'}`,
        color:      active ? exchange.color : '#94a3b8',
        boxShadow:  active ? `0 0 12px ${exchange.color}33` : 'none',
      }}
    >
      <span>{exchange.name}</span>
      {count > 0 && (
        <span
          className="text-xs px-1.5 py-0.5 rounded-full font-mono"
          style={{
            background: active ? `${exchange.color}33` : 'rgba(255,255,255,0.06)',
            color:      active ? exchange.color : '#64748b',
          }}
        >
          {count}
        </span>
      )}
    </button>
  );
}

// ─── Requirement Badge ─────────────────────────────────────────────────────────
function RequirementBadge({ req }: { req: Requirement }) {
  const colors: Record<string, string> = {
    follow: '#818cf8', repost: '#34d399', reply: '#f472b6',
    tag: '#fb923c',    like: '#f87171',   other: '#94a3b8',
  };
  const color = colors[req.type] || colors.other;
  return (
    <span
      className="inline-flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-full font-medium"
      style={{ background: `${color}18`, color, border: `1px solid ${color}30` }}
    >
      <span>{REQ_ICONS[req.type]}</span>
      {req.description}
    </span>
  );
}

// ─── Giveaway Card ─────────────────────────────────────────────────────────────
function GiveawayCard({ g }: { g: Giveaway }) {
  const [expanded, setExpanded] = useState(false);
  const { text: confText, color: confColor, bg: confBg } = confidenceLabel(g.confidence);
  const isTelegram = g.source === 'telegram';
  const postUrl    = isTelegram ? (g.telegramMessageUrl || g.tweetUrl) : g.tweetUrl;
  const agentPrompt = encodeURIComponent(
    `Give me exact step-by-step instructions to participate in this ${g.exchangeDisplayName} giveaway. Include all requirements and warnings. Post: ${postUrl}`
  );

  return (
    <div
      className="rounded-xl overflow-hidden transition-all duration-300"
      style={{ background: 'rgba(15,20,35,0.85)', border: '1px solid rgba(255,255,255,0.07)', backdropFilter: 'blur(12px)' }}
      onMouseEnter={e => {
        const el = e.currentTarget as HTMLDivElement;
        el.style.border    = '1px solid rgba(255,255,255,0.14)';
        el.style.transform = 'translateY(-2px)';
        el.style.boxShadow = '0 8px 32px rgba(0,0,0,0.3)';
      }}
      onMouseLeave={e => {
        const el = e.currentTarget as HTMLDivElement;
        el.style.border    = '1px solid rgba(255,255,255,0.07)';
        el.style.transform = 'translateY(0)';
        el.style.boxShadow = 'none';
      }}
    >
      {/* Header */}
      <div className="p-4 pb-0 flex items-start justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <div
            className="h-8 w-8 rounded-lg flex items-center justify-center text-xs font-bold"
            style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', color: '#fff' }}
          >
            {g.exchangeDisplayName.substring(0, 2).toUpperCase()}
          </div>
          <div>
            <div className="flex items-center gap-2.5 flex-wrap">
              <span className="text-sm font-semibold text-white">{g.exchangeDisplayName}</span>
              {g.isVerifiedGiveaway && (
                <span title="High-confidence" className="inline-flex">
                  <Shield size={12} className="text-emerald-400" />
                </span>
              )}
              <SourceBadge source={g.source} />
              <StatusBadges isFree={g.isFreeToEnter} effort={g.effortLevel} />   {/* ← NEW */}
            </div>
            <span className="text-xs text-slate-500">
              {isTelegram ? (g.telegramChannel ? `@${g.telegramChannel}` : `@${g.authorHandle}`) : `@${g.authorHandle}`}
            </span>
          </div>
        </div>
        <span
          className="text-xs font-mono px-2 py-0.5 rounded-full shrink-0"
          style={{ background: confBg, color: confColor, border: `1px solid ${confColor}30` }}
        >
          {confText} · {Math.round(g.confidence * 100)}%
        </span>
      </div>

      {/* Prize */}
      {g.prizePool && (
        <div className="px-4 pt-3">
          <div className="flex items-center gap-2 rounded-lg px-3 py-2" style={{ background: 'rgba(251,191,36,0.08)', border: '1px solid rgba(251,191,36,0.2)' }}>
            <Trophy size={14} className="text-amber-400 shrink-0" />
            <span className="text-sm font-semibold text-amber-300">{g.prizePool}</span>
          </div>
        </div>
      )}

      {/* Coins */}
      {g.coins.length > 0 && (
        <div className="px-4 pt-2 flex flex-wrap gap-1.5">
          {g.coins.map(coin => (
            <span key={coin} className="text-xs px-2 py-0.5 rounded font-mono"
              style={{ background: 'rgba(99,102,241,0.12)', color: '#818cf8', border: '1px solid rgba(99,102,241,0.2)' }}>
              {coin}
            </span>
          ))}
        </div>
      )}

      {/* Text */}
      <div className="px-4 pt-3">
        {g.telegramHtml ? (
          <div 
            className="text-sm text-slate-300 leading-relaxed prose prose-invert max-w-none"
            dangerouslySetInnerHTML={{ __html: g.telegramHtml }} 
          />
        ) : (
          <p className="text-sm text-slate-300 leading-relaxed"
            style={{ display: '-webkit-box', WebkitLineClamp: expanded ? 'unset' : 4, WebkitBoxOrient: 'vertical', overflow: expanded ? 'visible' : 'hidden' }}>
            {g.tweetText}
          </p>
        )}

        {g.tweetText.length > 180 && !g.telegramHtml && (
          <button onClick={() => setExpanded(!expanded)} className="flex items-center gap-1 text-xs text-slate-500 hover:text-slate-300 mt-1">
            {expanded ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
            {expanded ? 'Show less' : 'Show more'}
          </button>
        )}
      </div>

      {/* Embedded Links - NEW */}
      {g.embeddedLinks && g.embeddedLinks.length > 0 && (
        <div className="px-4 pt-3">
          <p className="text-xs text-slate-500 mb-2">Important Links</p>
          <div className="flex flex-wrap gap-2">
            {g.embeddedLinks.map((link, i) => (
              <a
                key={i}
                href={link.url}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg bg-blue-500/10 hover:bg-blue-500/20 text-blue-400 border border-blue-500/30 transition-colors"
              >
                <ExternalLink size={12} />
                {link.text || 'Open Link'}
              </a>
            ))}
          </div>
        </div>
      )}

      {/* Requirements */}
      {g.requirements.length > 0 && (
        <div className="px-4 pt-3">
          <p className="text-xs text-slate-500 mb-1.5 uppercase tracking-wider">How to enter</p>
          <div className="flex flex-wrap gap-1.5">
            {g.requirements.map((req, i) => <RequirementBadge key={i} req={req} />)}
          </div>
        </div>
      )}

      {/* Footer */}
      <div className="px-4 pt-3 pb-4 flex items-center justify-between mt-1">
        <div className="flex items-center gap-3 text-xs text-slate-600">
          {isTelegram ? (
            <>
              {(g.viewCount ?? 0) > 0 && (
                <span className="flex items-center gap-1">
                  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
                  {(g.viewCount ?? 0).toLocaleString()}
                </span>
              )}
              {(g.forwardCount ?? 0) > 0 && (
                <span className="flex items-center gap-1"><Repeat2 size={11} />{(g.forwardCount ?? 0).toLocaleString()}</span>
              )}
            </>
          ) : (
            <>
              <span className="flex items-center gap-1"><Heart size={11} />{g.likeCount.toLocaleString()}</span>
              <span className="flex items-center gap-1"><Repeat2 size={11} />{g.retweetCount.toLocaleString()}</span>
            </>
          )}
          <span className="flex items-center gap-1"><Clock size={11} />{timeAgo(g.tweetCreatedAt)}</span>
        </div>
        <div className="flex items-center gap-2">
          <Link href={`/chat?q=${agentPrompt}`}
            className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg transition-all"
            style={{ background: 'rgba(99,102,241,0.12)', color: '#818cf8', border: '1px solid rgba(99,102,241,0.2)' }}>
            <MessageSquare size={11} /> Ask Agent
          </Link>
          <a href={postUrl} target="_blank" rel="noopener noreferrer"
            className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg transition-all"
            style={{ background: isTelegram ? 'rgba(38,140,246,0.08)' : 'rgba(255,255,255,0.06)', color: isTelegram ? '#4da6ff' : '#94a3b8', border: `1px solid ${isTelegram ? 'rgba(38,140,246,0.2)' : 'rgba(255,255,255,0.08)'}` }}>
            {isTelegram ? <Send size={11} /> : <ExternalLink size={11} />}
            {isTelegram ? 'View Channel' : 'View Post'}
          </a>
        </div>
      </div>
    </div>
  );
}

// ─── Scan Result Toast ─────────────────────────────────────────────────────────
function ScanToast({ result, onClose }: { result: ScanResult & { source: string }; onClose: () => void }) {
  useEffect(() => {
    const t = setTimeout(onClose, 6000);
    return () => clearTimeout(t);
  }, [onClose]);

  const isSuccess = result.success;
  return (
    <div
      className="fixed bottom-6 right-6 z-50 flex items-start gap-3 px-4 py-3 rounded-xl text-sm max-w-sm shadow-2xl"
      style={{
        background: isSuccess ? 'rgba(20,30,20,0.97)' : 'rgba(30,15,15,0.97)',
        border: `1px solid ${isSuccess ? 'rgba(34,197,94,0.3)' : 'rgba(239,68,68,0.3)'}`,
        backdropFilter: 'blur(12px)',
      }}
    >
      {isSuccess
        ? <CheckCircle size={16} className="text-emerald-400 mt-0.5 shrink-0" />
        : <XCircle    size={16} className="text-red-400 mt-0.5 shrink-0" />}
      <div className="flex-1">
        <p className={`font-medium ${isSuccess ? 'text-emerald-300' : 'text-red-300'}`}>
          {result.source} Scan {isSuccess ? 'Complete' : 'Failed'}
        </p>
        <p className="text-slate-400 text-xs mt-0.5">
          {isSuccess
            ? `${result.added ?? 0} new giveaways added (${result.total ?? 0} total processed)`
            : result.error}
        </p>
      </div>
      <button onClick={onClose} className="text-slate-600 hover:text-slate-400 ml-1">✕</button>
    </div>
  );
}

// ─── Admin Scan Buttons ────────────────────────────────────────────────────────
function AdminScanButtons({
  onScanX,
  onScanTelegram,
  scanningX,
  scanningTelegram,
  exchange,
}: {
  onScanX:          () => void;
  onScanTelegram:   () => void;
  scanningX:        boolean;
  scanningTelegram: boolean;
  exchange:         string;
}) {
  return (
    <div className="flex items-center gap-2">
      {/* Divider */}
      <div className="w-px h-5 bg-white/10 mx-1" />

      {/* X / Twitter scan */}
      <button
        onClick={onScanX}
        disabled={scanningX || scanningTelegram}
        title={`Trigger X scan${exchange !== 'all' ? ` for ${exchange}` : ''}`}
        className="flex items-center gap-1.5 text-xs px-3 py-2 rounded-lg transition-all disabled:opacity-50 font-medium"
        style={{ background: 'rgba(255,255,255,0.06)', color: '#94a3b8', border: '1px solid rgba(255,255,255,0.12)' }}
      >
        {scanningX
          ? <RefreshCw size={12} className="animate-spin" />
          : <span style={{ fontSize: 11, fontWeight: 700 }}>𝕏</span>}
        {scanningX ? 'Scanning…' : 'Scan X'}
      </button>

      {/* Telegram scan */}
      <button
        onClick={onScanTelegram}
        disabled={scanningX || scanningTelegram}
        title={`Trigger Telegram scan${exchange !== 'all' ? ` for ${exchange}` : ''}`}
        className="flex items-center gap-1.5 text-xs px-3 py-2 rounded-lg transition-all disabled:opacity-50 font-medium"
        style={{ background: 'rgba(38,140,246,0.1)', color: '#4da6ff', border: '1px solid rgba(38,140,246,0.2)' }}
      >
        {scanningTelegram
          ? <RefreshCw size={12} className="animate-spin" />
          : <Send size={12} />}
        {scanningTelegram ? 'Scanning…' : 'Scan Telegram'}
      </button>
    </div>
  );
}

// ─── Main Page ─────────────────────────────────────────────────────────────────
export default function GiveawaysPage() {
  const { user } = useAuth();
  const isAdmin  = user?.email === ADMIN_EMAIL;

  const [data,           setData]           = useState<ApiResponse | null>(null);
  const [loading,        setLoading]        = useState(true);
  const [activeExchange, setActiveExchange] = useState('all');
  const [activeSource,   setActiveSource]   = useState('all');
  const [sort,           setSort]           = useState('confidence');
  const [page,           setPage]           = useState(1);
  const [error,          setError]          = useState<string | null>(null);
  const [counts,         setCounts]         = useState<Record<string, number>>({});

  // Admin scan state
  const [scanningX,        setScanningX]        = useState(false);
  const [scanningTelegram, setScanningTelegram] = useState(false);
  const [scanToast,        setScanToast]        = useState<(ScanResult & { source: string }) | null>(null);

  const fetchData = useCallback(async (opts?: {
    exchange?: string; source?: string; sort?: string; page?: number;
  }) => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({
        exchange: opts?.exchange ?? activeExchange,
        sort:     opts?.sort     ?? sort,
        page:     String(opts?.page ?? page),
        limit:    '18',
      });
      const src = opts?.source ?? activeSource;
      if (src && src !== 'all') params.set('source', src);

      const res  = await fetch(`${API_URL}/api/giveaways?${params}`);
      if (!res.ok) throw new Error('Failed to fetch giveaways');
      const json = await res.json();
      setData(json.data);
    } catch (err: any) {
      setError(err.message || 'Something went wrong');
    } finally {
      setLoading(false);
    }
  }, [activeExchange, activeSource, sort, page]);

  const fetchStats = useCallback(async () => {
    try {
      const res  = await fetch(`${API_URL}/api/giveaways/stats`);
      const json = await res.json();
      const map: Record<string, number> = { all: 0 };
      for (const s of json.data?.stats || []) {
        map[s._id]  = s.count;
        map.all    += s.count;
      }
      setCounts(map);
    } catch { /* stats are optional */ }
  }, []);

  useEffect(() => { fetchData(); fetchStats(); }, []);

  const handleExchangeChange = (key: string) => {
    setActiveExchange(key);
    setPage(1);
    fetchData({ exchange: key, page: 1 });
  };

  const handleSourceChange = (src: string) => {
    setActiveSource(src);
    setPage(1);
    fetchData({ source: src, page: 1 });
  };

  const handleSortChange = (s: string) => {
    setSort(s);
    setPage(1);
    fetchData({ sort: s, page: 1 });
  };

  const handleRefresh = async () => { await fetchData(); await fetchStats(); };

  // ── Admin: trigger X scan ─────────────────────────────────────────────────
  const handleScanX = async () => {
    setScanningX(true);
    try {
      const params = activeExchange !== 'all' ? `?exchange=${activeExchange}` : '';
      const res    = await fetch(`${API_URL}/api/giveaways/scan${params}`, { method: 'POST' });
      const json   = await res.json();
      if (!res.ok) throw new Error(json?.error?.message || json?.message || 'Scan failed');
      setScanToast({ source: 'X / Twitter', success: true, ...json.data });
      await fetchData();
      await fetchStats();
    } catch (err: any) {
      setScanToast({ source: 'X / Twitter', success: false, error: err.message });
    } finally {
      setScanningX(false);
    }
  };

  // ── Admin: trigger Telegram scan ──────────────────────────────────────────
  const handleScanTelegram = async () => {
    setScanningTelegram(true);
    try {
      const params = activeExchange !== 'all' ? `?exchange=${activeExchange}` : '';
      const res    = await fetch(`${API_URL}/api/giveaways/scan/telegram${params}`, { method: 'POST' });
      const json   = await res.json();
      if (!res.ok) throw new Error(json?.error?.message || json?.message || 'Scan failed');
      setScanToast({ source: 'Telegram', success: true, ...json.data });
      await fetchData();
      await fetchStats();
    } catch (err: any) {
      setScanToast({ source: 'Telegram', success: false, error: err.message });
    } finally {
      setScanningTelegram(false);
    }
  };

  const exchanges: ExchangeMeta[] = data?.exchanges || [];
  const allTab = { key: 'all', name: 'All Exchanges', color: '#6366f1', handle: '' };

  return (
    <div className="min-h-screen" style={{ background: '#080c14' }}>
      {/* Background */}
      <div className="fixed inset-0 pointer-events-none"
        style={{ backgroundImage: `radial-gradient(ellipse 80% 50% at 50% -20%, rgba(99,102,241,0.12) 0%, transparent 70%)` }} />

      <div className="relative max-w-7xl mx-auto px-4 sm:px-6 py-8">

        {/* ── Page Header ── */}
        <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 mb-8">
          <div>
            <div className="flex items-center gap-3 mb-1">
              <div className="w-8 h-8 rounded-lg flex items-center justify-center"
                style={{ background: 'rgba(99,102,241,0.15)', border: '1px solid rgba(99,102,241,0.3)' }}>
                <Gift size={16} className="text-indigo-400" />
              </div>
              <h1 className="text-2xl font-bold text-white tracking-tight">Live Giveaways</h1>
              {counts.all > 0 && (
                <span className="text-xs font-mono px-2 py-0.5 rounded-full"
                  style={{ background: 'rgba(99,102,241,0.15)', color: '#818cf8' }}>
                  {counts.all} active
                </span>
              )}
              {/* Admin badge */}
              {isAdmin && (
                <span className="text-xs px-2 py-0.5 rounded-full font-medium"
                  style={{ background: 'rgba(245,158,11,0.12)', color: '#f59e0b', border: '1px solid rgba(245,158,11,0.25)' }}>
                  ADMIN
                </span>
              )}
            </div>
            <p className="text-sm text-slate-500">
              CEX-verified promotions from official X accounts &amp; Telegram channels
            </p>
          </div>

          {/* Right controls */}
          <div className="flex items-center gap-2 flex-wrap justify-end">
            {/* Scan timestamps */}
            <div className="flex items-center gap-3">
              {data?.lastScan && (
                <span className="text-xs text-slate-600 flex items-center gap-1.5">
                  <span style={{ fontSize: 10 }}>𝕏</span> {timeAgo(data.lastScan)}
                </span>
              )}
              {data?.lastTelegramScan && (
                <span className="text-xs text-slate-600 flex items-center gap-1.5">
                  <Send size={10} className="text-blue-500" /> {timeAgo(data.lastTelegramScan)}
                </span>
              )}
            </div>

            {/* Refresh (always visible) */}
            <button
              onClick={handleRefresh}
              disabled={loading || scanningX || scanningTelegram}
              className="flex items-center gap-2 text-sm px-4 py-2 rounded-lg transition-all disabled:opacity-50"
              style={{ background: 'rgba(99,102,241,0.1)', color: '#818cf8', border: '1px solid rgba(99,102,241,0.2)' }}
            >
              <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
              Refresh
            </button>

            {/* Admin-only scan buttons */}
            {isAdmin && (
              <AdminScanButtons
                onScanX={handleScanX}
                onScanTelegram={handleScanTelegram}
                scanningX={scanningX}
                scanningTelegram={scanningTelegram}
                exchange={activeExchange}
              />
            )}
          </div>
        </div>

        {/* ── Safety Banner ── */}
        <div className="flex items-center gap-3 rounded-xl px-4 py-3 mb-6 text-sm"
          style={{ background: 'rgba(245,158,11,0.06)', border: '1px solid rgba(245,158,11,0.15)' }}>
          <AlertTriangle size={14} className="text-amber-400 shrink-0" />
          <span className="text-amber-200/70">
            Only participate through <strong className="text-amber-300">official exchange posts</strong>.
            Never send funds first. Use the <strong className="text-amber-300">Ask Agent</strong> button for guidance.
          </span>
        </div>

        {/* ── Source Filter ── */}
        <div className="flex items-center gap-2 mb-4">
          {SOURCE_OPTIONS.map(opt => (
            <button key={opt.value} onClick={() => handleSourceChange(opt.value)}
              className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg transition-all font-medium"
              style={{
                background: activeSource === opt.value
                  ? opt.value === 'telegram' ? 'rgba(38,140,246,0.15)' : 'rgba(99,102,241,0.15)'
                  : 'rgba(255,255,255,0.04)',
                color: activeSource === opt.value
                  ? opt.value === 'telegram' ? '#4da6ff' : '#818cf8'
                  : '#64748b',
                border: `1px solid ${activeSource === opt.value
                  ? opt.value === 'telegram' ? 'rgba(38,140,246,0.3)' : 'rgba(99,102,241,0.3)'
                  : 'rgba(255,255,255,0.06)'}`,
              }}>
              {opt.value === 'telegram' && <Send size={11} />}
              {opt.value === 'twitter'  && <span style={{ fontSize: 11 }}>𝕏</span>}
              {opt.label}
            </button>
          ))}
        </div>

        {/* ── Exchange Tabs ── */}
        <div className="overflow-x-auto pb-2 mb-6 scrollbar-none">
          <div className="flex gap-2 min-w-max">
            <ExchangeTab exchange={allTab} active={activeExchange === 'all'} count={counts.all || 0} onClick={() => handleExchangeChange('all')} />
            {exchanges.map(ex => (
              <ExchangeTab key={ex.key} exchange={ex} active={activeExchange === ex.key} count={counts[ex.key] || 0} onClick={() => handleExchangeChange(ex.key)} />
            ))}
          </div>
        </div>

        {/* ── Sort Bar ── */}
        <div className="flex items-center justify-between mb-5">
          <p className="text-sm text-slate-500">
            {loading ? 'Loading…' : `${data?.pagination.total ?? 0} giveaways`}
          </p>
          <div className="flex items-center gap-2">
            <Filter size={13} className="text-slate-600" />
            <div className="flex gap-1">
              {SORT_OPTIONS.map(opt => (
                <button key={opt.value} onClick={() => handleSortChange(opt.value)}
                  className="text-xs px-3 py-1.5 rounded-lg transition-all"
                  style={{
                    background: sort === opt.value ? 'rgba(99,102,241,0.15)' : 'transparent',
                    color:      sort === opt.value ? '#818cf8' : '#64748b',
                    border:     `1px solid ${sort === opt.value ? 'rgba(99,102,241,0.3)' : 'rgba(255,255,255,0.05)'}`,
                  }}>
                  {opt.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* ── Error ── */}
        {error && (
          <div className="rounded-xl p-4 mb-6 text-sm text-red-300"
            style={{ background: 'rgba(239,68,68,0.06)', border: '1px solid rgba(239,68,68,0.15)' }}>
            {error}
          </div>
        )}

        {/* ── Grid ── */}
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
          {loading && Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="rounded-xl h-56 animate-pulse"
              style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.05)' }} />
          ))}
          {!loading && (data?.giveaways || []).map(g => <GiveawayCard key={g._id} g={g} />)}
          {!loading && !(data?.giveaways?.length) && (
            <div className="col-span-full flex flex-col items-center justify-center py-24 text-center">
              <div className="w-16 h-16 rounded-2xl flex items-center justify-center mb-4"
                style={{ background: 'rgba(99,102,241,0.08)', border: '1px solid rgba(99,102,241,0.15)' }}>
                <Gift size={24} className="text-indigo-400" />
              </div>
              <p className="text-slate-300 font-medium mb-1">No giveaways found</p>
              <p className="text-sm text-slate-500 max-w-sm">
                Telegram channels scan every 24h, X every 2h.
                {isAdmin && ' Use the Scan buttons above to trigger a manual scan.'}
              </p>
            </div>
          )}
        </div>

        {/* ── Pagination ── */}
        {data && data.pagination.pages > 1 && (
          <div className="flex items-center justify-center gap-2 mt-8">
            <button disabled={page <= 1}
              onClick={() => { const p = page - 1; setPage(p); fetchData({ page: p }); }}
              className="text-sm px-4 py-2 rounded-lg disabled:opacity-30 transition-all"
              style={{ background: 'rgba(255,255,255,0.04)', color: '#94a3b8', border: '1px solid rgba(255,255,255,0.08)' }}>
              Previous
            </button>
            <span className="text-xs text-slate-600 font-mono">{page} / {data.pagination.pages}</span>
            <button disabled={page >= data.pagination.pages}
              onClick={() => { const p = page + 1; setPage(p); fetchData({ page: p }); }}
              className="text-sm px-4 py-2 rounded-lg disabled:opacity-30 transition-all"
              style={{ background: 'rgba(255,255,255,0.04)', color: '#94a3b8', border: '1px solid rgba(255,255,255,0.08)' }}>
              Next
            </button>
          </div>
        )}

        {/* ── Telegram Info ── */}
        <div className="mt-8 rounded-xl p-4 flex items-start gap-3 text-sm"
          style={{ background: 'rgba(38,140,246,0.05)', border: '1px solid rgba(38,140,246,0.12)' }}>
          <Send size={14} className="text-blue-400 mt-0.5 shrink-0" />
          <div>
            <p className="text-blue-300 font-medium mb-0.5">Telegram channel scanning active</p>
            <p className="text-slate-500 text-xs">
              Official exchange Telegram channels are scanned every 24 hours automatically.
              Posts are scored using the same confidence system as X posts.
              {isAdmin && ' Use "Scan Telegram" above to trigger an immediate scan.'}
            </p>
          </div>
        </div>

        {/* ── Agent CTA ── */}
        <div className="mt-6 rounded-2xl p-6 flex flex-col sm:flex-row items-start sm:items-center gap-5"
          style={{ background: 'linear-gradient(135deg, rgba(99,102,241,0.08) 0%, rgba(139,92,246,0.06) 100%)', border: '1px solid rgba(99,102,241,0.2)' }}>
          <div className="w-12 h-12 rounded-xl flex items-center justify-center shrink-0"
            style={{ background: 'rgba(99,102,241,0.15)', border: '1px solid rgba(99,102,241,0.3)' }}>
            <Zap size={20} className="text-indigo-400" />
          </div>
          <div className="flex-1">
            <h3 className="text-white font-semibold mb-1">Not sure how to participate?</h3>
            <p className="text-sm text-slate-400">
              Ask the ChainWise agent — it will break down exact steps, verify the post is legitimate,
              and tell you exactly what to do to enter any giveaway.
            </p>
          </div>
          <Link href="/chat"
            className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-medium whitespace-nowrap transition-all"
            style={{ background: 'rgba(99,102,241,0.2)', color: '#a5b4fc', border: '1px solid rgba(99,102,241,0.35)' }}>
            <MessageSquare size={15} /> Open Agent
          </Link>
        </div>

      </div>

      {/* ── Scan Toast ── */}
      {scanToast && <ScanToast result={scanToast} onClose={() => setScanToast(null)} />}
    </div>
  );
}