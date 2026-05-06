'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  Gift, RefreshCw, ExternalLink, MessageSquare, Zap,
  Heart, Repeat2, MessageCircle, Clock, Trophy,
  ChevronDown, ChevronUp, Shield, AlertTriangle,
  Filter, TrendingUp, Search,
} from 'lucide-react';

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
}

interface ExchangeMeta {
  key:    string;
  name:   string;
  handle: string;
  color:  string;
}

interface ApiResponse {
  giveaways:  Giveaway[];
  pagination: { total: number; page: number; limit: number; pages: number };
  lastScan:   string | null;
  exchanges:  ExchangeMeta[];
}

// ─── Constants ─────────────────────────────────────────────────────────────────
const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000';

const SORT_OPTIONS = [
  { value: 'confidence', label: 'Best Match'  },
  { value: 'recent',     label: 'Most Recent' },
  { value: 'prize',      label: 'Highest Prize' },
];

const REQ_ICONS: Record<string, string> = {
  follow:  '👤',
  repost:  '🔁',
  reply:   '💬',
  tag:     '🏷️',
  like:    '❤️',
  other:   '✅',
};

// ─── Helper Functions ──────────────────────────────────────────────────────────
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

// ─── Sub-Components ────────────────────────────────────────────────────────────

function ExchangeTab({
  exchange, active, count, onClick,
}: {
  exchange: ExchangeMeta | { key: 'all'; name: 'All Exchanges'; color: '#6366f1' };
  active:   boolean;
  count:    number;
  onClick:  () => void;
}) {
  return (
    <button
      onClick={onClick}
      className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all whitespace-nowrap"
      style={{
        background: active
          ? `${exchange.color}22`
          : 'transparent',
        border:  `1px solid ${active ? exchange.color : 'rgba(255,255,255,0.08)'}`,
        color:   active ? exchange.color : '#94a3b8',
        boxShadow: active ? `0 0 12px ${exchange.color}33` : 'none',
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

function RequirementBadge({ req }: { req: Requirement }) {
  const colors: Record<string, string> = {
    follow: '#818cf8',
    repost: '#34d399',
    reply:  '#f472b6',
    tag:    '#fb923c',
    like:   '#f87171',
    other:  '#94a3b8',
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

function GiveawayCard({ g }: { g: Giveaway }) {
  const [expanded, setExpanded] = useState(false);
  const { text: confText, color: confColor, bg: confBg } = confidenceLabel(g.confidence);

  // Build agent prompt
  const agentPrompt = encodeURIComponent(
    `How do I participate in the ${g.exchangeDisplayName} giveaway? Tweet: ${g.tweetUrl}`
  );

  return (
    <div
      className="rounded-xl overflow-hidden transition-all duration-300"
      style={{
        background:  'rgba(15, 20, 35, 0.85)',
        border:      '1px solid rgba(255,255,255,0.07)',
        backdropFilter: 'blur(12px)',
      }}
      onMouseEnter={e => {
        (e.currentTarget as HTMLDivElement).style.border = '1px solid rgba(255,255,255,0.14)';
        (e.currentTarget as HTMLDivElement).style.transform = 'translateY(-2px)';
        (e.currentTarget as HTMLDivElement).style.boxShadow = '0 8px 32px rgba(0,0,0,0.3)';
      }}
      onMouseLeave={e => {
        (e.currentTarget as HTMLDivElement).style.border = '1px solid rgba(255,255,255,0.07)';
        (e.currentTarget as HTMLDivElement).style.transform = 'translateY(0)';
        (e.currentTarget as HTMLDivElement).style.boxShadow = 'none';
      }}
    >
      {/* Card Header */}
      <div className="p-4 pb-0 flex items-start justify-between gap-3">
        <div className="flex items-center gap-2.5">
          {/* Exchange badge */}
          <div
            className="h-8 w-8 rounded-lg flex items-center justify-center text-xs font-bold"
            style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', color: '#fff' }}
          >
            {g.exchangeDisplayName.substring(0, 2).toUpperCase()}
          </div>
          <div>
            <div className="flex items-center gap-1.5">
              <span className="text-sm font-semibold text-white">{g.exchangeDisplayName}</span>
              {g.isVerifiedGiveaway && (
                <div title="High-confidence giveaway">
                  <Shield size={12} className="text-emerald-400" />
                </div>
              )}
            </div>
            <span className="text-xs text-slate-500">@{g.authorHandle}</span>
          </div>
        </div>

        {/* Confidence badge */}
        <span
          className="text-xs font-mono px-2 py-0.5 rounded-full shrink-0"
          style={{ background: confBg, color: confColor, border: `1px solid ${confColor}30` }}
        >
          {confText} · {Math.round(g.confidence * 100)}%
        </span>
      </div>

      {/* Prize Pool */}
      {g.prizePool && (
        <div className="px-4 pt-3">
          <div
            className="flex items-center gap-2 rounded-lg px-3 py-2"
            style={{ background: 'rgba(251,191,36,0.08)', border: '1px solid rgba(251,191,36,0.2)' }}
          >
            <Trophy size={14} className="text-amber-400 shrink-0" />
            <span className="text-sm font-semibold text-amber-300">{g.prizePool}</span>
          </div>
        </div>
      )}

      {/* Coin Tags */}
      {g.coins.length > 0 && (
        <div className="px-4 pt-2 flex flex-wrap gap-1.5">
          {g.coins.map(coin => (
            <span
              key={coin}
              className="text-xs px-2 py-0.5 rounded font-mono"
              style={{ background: 'rgba(99,102,241,0.12)', color: '#818cf8', border: '1px solid rgba(99,102,241,0.2)' }}
            >
              {coin}
            </span>
          ))}
        </div>
      )}

      {/* Tweet Preview */}
      <div className="px-4 pt-3">
        <p className="text-sm text-slate-300 leading-relaxed line-clamp-3">
          {g.tweetText}
        </p>
        {g.tweetText.length > 150 && (
          <button
            onClick={() => setExpanded(!expanded)}
            className="flex items-center gap-1 text-xs text-slate-500 hover:text-slate-300 mt-1 transition-colors"
          >
            {expanded ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
            {expanded ? 'Show less' : 'Show more'}
          </button>
        )}
      </div>

      {/* Requirements */}
      {g.requirements.length > 0 && (
        <div className="px-4 pt-3">
          <p className="text-xs text-slate-500 mb-1.5 uppercase tracking-wider">How to enter</p>
          <div className="flex flex-wrap gap-1.5">
            {g.requirements.map((req, i) => (
              <RequirementBadge key={i} req={req} />
            ))}
          </div>
        </div>
      )}

      {/* Footer */}
      <div className="px-4 pt-3 pb-4 flex items-center justify-between mt-1">
        {/* Metrics */}
        <div className="flex items-center gap-3 text-xs text-slate-600">
          <span className="flex items-center gap-1">
            <Heart size={11} /> {g.likeCount.toLocaleString()}
          </span>
          <span className="flex items-center gap-1">
            <Repeat2 size={11} /> {g.retweetCount.toLocaleString()}
          </span>
          <span className="flex items-center gap-1">
            <Clock size={11} /> {timeAgo(g.tweetCreatedAt)}
          </span>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-2">
          <Link
            href={`/chat?q=${agentPrompt}`}
            className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg transition-all"
            style={{ background: 'rgba(99,102,241,0.12)', color: '#818cf8', border: '1px solid rgba(99,102,241,0.2)' }}
          >
            <MessageSquare size={11} /> Ask Agent
          </Link>
          <a
            href={g.tweetUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg transition-all"
            style={{ background: 'rgba(255,255,255,0.06)', color: '#94a3b8', border: '1px solid rgba(255,255,255,0.08)' }}
          >
            <ExternalLink size={11} /> View Post
          </a>
        </div>
      </div>
    </div>
  );
}

function EmptyState({ isLoading }: { isLoading: boolean }) {
  if (isLoading) return null;
  return (
    <div className="col-span-full flex flex-col items-center justify-center py-24 text-center">
      <div
        className="w-16 h-16 rounded-2xl flex items-center justify-center mb-4"
        style={{ background: 'rgba(99,102,241,0.08)', border: '1px solid rgba(99,102,241,0.15)' }}
      >
        <Gift size={24} className="text-indigo-400" />
      </div>
      <p className="text-slate-300 font-medium mb-1">No giveaways found</p>
      <p className="text-sm text-slate-500 max-w-sm">
        Background scans run every 2 hours. Check back soon or try a different exchange filter.
      </p>
    </div>
  );
}

// ─── Main Page ─────────────────────────────────────────────────────────────────
export default function GiveawaysPage() {
  const [data,        setData]        = useState<ApiResponse | null>(null);
  const [loading,     setLoading]     = useState(true);
  const [scanning,    setScanning]    = useState(false);
  const [activeExchange, setActiveExchange] = useState('all');
  const [sort,        setSort]        = useState('confidence');
  const [page,        setPage]        = useState(1);
  const [error,       setError]       = useState<string | null>(null);

  // Exchange counts from stats
  const [counts, setCounts] = useState<Record<string, number>>({});

  const fetchData = useCallback(async (opts?: { exchange?: string; sort?: string; page?: number }) => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({
        exchange: opts?.exchange ?? activeExchange,
        sort:     opts?.sort     ?? sort,
        page:     String(opts?.page ?? page),
        limit:    '18',
      });
      const res = await fetch(`${API_URL}/api/giveaways?${params}`);
      if (!res.ok) throw new Error('Failed to fetch giveaways');
      const json = await res.json();
      setData(json.data);
    } catch (err: any) {
      setError(err.message || 'Something went wrong');
    } finally {
      setLoading(false);
    }
  }, [activeExchange, sort, page]);

  const fetchStats = useCallback(async () => {
    try {
      const res  = await fetch(`${API_URL}/api/giveaways/stats`);
      const json = await res.json();
      const map: Record<string, number> = { all: 0 };
      for (const s of json.data?.stats || []) {
        map[s._id] = s.count;
        map.all   += s.count;
      }
      setCounts(map);
    } catch { /* stats are optional */ }
  }, []);

  useEffect(() => {
    fetchData();
    fetchStats();
  }, []);

  const handleExchangeChange = (key: string) => {
    setActiveExchange(key);
    setPage(1);
    fetchData({ exchange: key, page: 1 });
  };

  const handleSortChange = (s: string) => {
    setSort(s);
    setPage(1);
    fetchData({ sort: s, page: 1 });
  };

  const handleRefresh = async () => {
    await fetchData();
    await fetchStats();
  };

  const exchanges: ExchangeMeta[] = data?.exchanges || [];
  const allTab = { key: 'all', name: 'All Exchanges', color: '#6366f1', handle: '' };

  return (
    <div className="min-h-screen" style={{ background: '#080c14' }}>
      {/* ── Background texture ── */}
      <div
        className="fixed inset-0 pointer-events-none"
        style={{
          backgroundImage: `radial-gradient(ellipse 80% 50% at 50% -20%, rgba(99,102,241,0.12) 0%, transparent 70%)`,
        }}
      />

      <div className="relative max-w-7xl mx-auto px-4 sm:px-6 py-8">

        {/* ── Page Header ── */}
        <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 mb-8">
          <div>
            <div className="flex items-center gap-3 mb-1">
              <div
                className="w-8 h-8 rounded-lg flex items-center justify-center"
                style={{ background: 'rgba(99,102,241,0.15)', border: '1px solid rgba(99,102,241,0.3)' }}
              >
                <Gift size={16} className="text-indigo-400" />
              </div>
              <h1 className="text-2xl font-bold text-white tracking-tight">Live Giveaways</h1>
              {counts.all > 0 && (
                <span
                  className="text-xs font-mono px-2 py-0.5 rounded-full"
                  style={{ background: 'rgba(99,102,241,0.15)', color: '#818cf8' }}
                >
                  {counts.all} active
                </span>
              )}
            </div>
            <p className="text-sm text-slate-500">
              CEX-verified promotions scanned every 2 hours from official X accounts
            </p>
          </div>

          <div className="flex items-center gap-3">
            {data?.lastScan && (
              <span className="text-xs text-slate-600 flex items-center gap-1">
                <Clock size={11} />
                Scanned {timeAgo(data.lastScan)}
              </span>
            )}
            <button
              onClick={handleRefresh}
              disabled={loading || scanning}
              className="flex items-center gap-2 text-sm px-4 py-2 rounded-lg transition-all disabled:opacity-50"
              style={{ background: 'rgba(99,102,241,0.1)', color: '#818cf8', border: '1px solid rgba(99,102,241,0.2)' }}
            >
              <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
              Refresh
            </button>
          </div>
        </div>

        {/* ── Safety Banner ── */}
        <div
          className="flex items-center gap-3 rounded-xl px-4 py-3 mb-6 text-sm"
          style={{ background: 'rgba(245,158,11,0.06)', border: '1px solid rgba(245,158,11,0.15)' }}
        >
          <AlertTriangle size={14} className="text-amber-400 shrink-0" />
          <span className="text-amber-200/70">
            Only participate through <strong className="text-amber-300">official exchange posts</strong>. 
            Never send funds first. Use the <strong className="text-amber-300">Ask Agent</strong> button for participation guidance.
          </span>
        </div>

        {/* ── Exchange Filter Tabs ── */}
        <div className="overflow-x-auto pb-2 mb-6 scrollbar-none">
          <div className="flex gap-2 min-w-max">
            <ExchangeTab
              exchange={allTab}
              active={activeExchange === 'all'}
              count={counts.all || 0}
              onClick={() => handleExchangeChange('all')}
            />
            {exchanges.map(ex => (
              <ExchangeTab
                key={ex.key}
                exchange={ex}
                active={activeExchange === ex.key}
                count={counts[ex.key] || 0}
                onClick={() => handleExchangeChange(ex.key)}
              />
            ))}
          </div>
        </div>

        {/* ── Sort Bar ── */}
        <div className="flex items-center justify-between mb-5">
          <p className="text-sm text-slate-500">
            {loading
              ? 'Loading…'
              : `${data?.pagination.total ?? 0} giveaways`}
          </p>
          <div className="flex items-center gap-2">
            <Filter size={13} className="text-slate-600" />
            <div className="flex gap-1">
              {SORT_OPTIONS.map(opt => (
                <button
                  key={opt.value}
                  onClick={() => handleSortChange(opt.value)}
                  className="text-xs px-3 py-1.5 rounded-lg transition-all"
                  style={{
                    background: sort === opt.value ? 'rgba(99,102,241,0.15)' : 'transparent',
                    color:      sort === opt.value ? '#818cf8' : '#64748b',
                    border:     `1px solid ${sort === opt.value ? 'rgba(99,102,241,0.3)' : 'rgba(255,255,255,0.05)'}`,
                  }}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* ── Error State ── */}
        {error && (
          <div
            className="rounded-xl p-4 mb-6 text-sm text-red-300"
            style={{ background: 'rgba(239,68,68,0.06)', border: '1px solid rgba(239,68,68,0.15)' }}
          >
            {error}
          </div>
        )}

        {/* ── Giveaway Grid ── */}
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
          {loading && Array.from({ length: 6 }).map((_, i) => (
            <div
              key={i}
              className="rounded-xl h-56 animate-pulse"
              style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.05)' }}
            />
          ))}

          {!loading && (data?.giveaways || []).map(g => (
            <GiveawayCard key={g._id} g={g} />
          ))}

          {!loading && !(data?.giveaways?.length) && (
            <EmptyState isLoading={loading} />
          )}
        </div>

        {/* ── Pagination ── */}
        {data && data.pagination.pages > 1 && (
          <div className="flex items-center justify-center gap-2 mt-8">
            <button
              disabled={page <= 1}
              onClick={() => { const p = page - 1; setPage(p); fetchData({ page: p }); }}
              className="text-sm px-4 py-2 rounded-lg disabled:opacity-30 transition-all"
              style={{ background: 'rgba(255,255,255,0.04)', color: '#94a3b8', border: '1px solid rgba(255,255,255,0.08)' }}
            >
              Previous
            </button>
            <span className="text-xs text-slate-600 font-mono">
              {page} / {data.pagination.pages}
            </span>
            <button
              disabled={page >= data.pagination.pages}
              onClick={() => { const p = page + 1; setPage(p); fetchData({ page: p }); }}
              className="text-sm px-4 py-2 rounded-lg disabled:opacity-30 transition-all"
              style={{ background: 'rgba(255,255,255,0.04)', color: '#94a3b8', border: '1px solid rgba(255,255,255,0.08)' }}
            >
              Next
            </button>
          </div>
        )}

        {/* ── Agent CTA ── */}
        <div
          className="mt-10 rounded-2xl p-6 flex flex-col sm:flex-row items-start sm:items-center gap-5"
          style={{
            background:    'linear-gradient(135deg, rgba(99,102,241,0.08) 0%, rgba(139,92,246,0.06) 100%)',
            border:        '1px solid rgba(99,102,241,0.2)',
          }}
        >
          <div
            className="w-12 h-12 rounded-xl flex items-center justify-center shrink-0"
            style={{ background: 'rgba(99,102,241,0.15)', border: '1px solid rgba(99,102,241,0.3)' }}
          >
            <Zap size={20} className="text-indigo-400" />
          </div>
          <div className="flex-1">
            <h3 className="text-white font-semibold mb-1">Not sure how to participate?</h3>
            <p className="text-sm text-slate-400">
              Ask the ChainWise agent — it will break down exact steps, verify the post is legitimate,
              and tell you exactly what to do to enter any giveaway.
            </p>
          </div>
          <Link
            href="/chat"
            className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-medium whitespace-nowrap transition-all"
            style={{
              background: 'rgba(99,102,241,0.2)',
              color:      '#a5b4fc',
              border:     '1px solid rgba(99,102,241,0.35)',
            }}
          >
            <MessageSquare size={15} />
            Open Agent
          </Link>
        </div>

      </div>
    </div>
  );
}