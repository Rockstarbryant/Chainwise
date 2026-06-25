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
  telegramHtml?:       string;
  embeddedLinks?:      Array<{ text: string; url: string }>;
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
  { value: 'confidence', label: 'BEST MATCH'    },
  { value: 'recent',     label: 'MOST RECENT'   },
  { value: 'prize',      label: 'HIGHEST PRIZE' },
];

const SOURCE_OPTIONS = [
  { value: 'all',      label: 'ALL SOURCES' },
  { value: 'telegram', label: 'TELEGRAM'    },
  { value: 'twitter',  label: 'X / TWITTER' },
];

const REQ_ICONS: Record<string, string> = {
  follow: '👤', repost: '🔁', reply: '💬',
  tag: '🏷️',   like: '❤️',   other: '✅',
};

// ─── Helpers ───────────────────────────────────────────────────────────────────
function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1)  return 'JUST NOW';
  if (m < 60) return `${m}M AGO`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}H AGO`;
  return `${Math.floor(h / 24)}D AGO`;
}

function confidenceLabel(c: number) {
  if (c >= 0.8) return { text: 'HIGH',   classes: 'bg-emerald-400 text-black' };
  if (c >= 0.6) return { text: 'MEDIUM', classes: 'bg-amber-400 text-black' };
  return               { text: 'LOW',    classes: 'bg-slate-400 text-black' };
}

// ─── Source Badge ──────────────────────────────────────────────────────────────
function SourceBadge({ source }: { source?: 'twitter' | 'telegram' }) {
  if (source === 'telegram') {
    return (
      <span className="inline-flex items-center gap-1 text-[10px] font-black tracking-widest uppercase px-2 py-1 bg-blue-600 text-white border-2 border-black">
        <Send size={10} /> TELEGRAM
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 text-[10px] font-black tracking-widest uppercase px-2 py-1 bg-black text-white border-2 border-black">
      <span style={{ fontSize: 10 }}>𝕏</span> TWITTER
    </span>
  );
}

// ─── Free / Effort Badge ───────────────────────────────────────
function StatusBadges({ isFree, effort }: { isFree?: boolean; effort?: string }) {
  return (
    <div className="flex gap-2 mt-2">
      {isFree && (
        <span className="inline-flex items-center gap-1 text-[10px] font-black tracking-widest uppercase px-2 py-1 bg-emerald-400 text-black border-2 border-black">
          ✅ FREE TO ENTER
        </span>
      )}
      {effort && (
        <span className={`inline-flex items-center gap-1 text-[10px] font-black tracking-widest uppercase px-2 py-1 border-2 border-black ${
          effort === 'low' ? 'bg-green-400 text-black' :
          effort === 'medium' ? 'bg-amber-400 text-black' :
          'bg-red-500 text-white'
        }`}>
          {effort === 'low' ? '🔥 LOW EFFORT' : effort === 'medium' ? '⚡ MEDIUM EFFORT' : '💼 HIGH EFFORT'}
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
      className={`flex items-center gap-2 px-4 py-2 text-sm font-black tracking-widest uppercase border-4 touch-manipulation whitespace-nowrap ${
        active 
          ? 'bg-black text-white border-black' 
          : 'bg-white dark:bg-slate-800 text-black dark:text-white border-black'
      }`}
    >
      <span>{exchange.name}</span>
      {count > 0 && (
        <span className={`text-[10px] px-1.5 py-0.5 border-2 ${
          active ? 'bg-yellow-400 text-black border-black' : 'bg-slate-200 text-black border-black'
        }`}>
          {count}
        </span>
      )}
    </button>
  );
}

// ─── Requirement Badge ─────────────────────────────────────────────────────────
function RequirementBadge({ req }: { req: Requirement }) {
  return (
    <span className="inline-flex items-center gap-1.5 text-[10px] font-black tracking-widest uppercase px-2 py-1 bg-white text-black border-2 border-black">
      <span>{REQ_ICONS[req.type] || '✅'}</span>
      {req.description}
    </span>
  );
}

// ─── Giveaway Card ─────────────────────────────────────────────────────────────
function GiveawayCard({ g }: { g: Giveaway }) {
  const [expanded, setExpanded] = useState(false);
  const { text: confText, classes: confClasses } = confidenceLabel(g.confidence);
  const isTelegram = g.source === 'telegram';
  const postUrl    = isTelegram ? (g.telegramMessageUrl || g.tweetUrl) : g.tweetUrl;
  const agentPrompt = encodeURIComponent(
    `Give me exact step-by-step instructions to participate in this ${g.exchangeDisplayName} giveaway. Include all requirements and warnings. Post: ${postUrl}`
  );

  return (
    <div className="flex flex-col bg-white dark:bg-slate-900 border-4 border-black transition-none overflow-hidden hover:-translate-y-1 hover:shadow-[4px_4px_0px_0px_rgba(0,0,0,1)]">
      {/* Header */}
      <div className="p-4 border-b-4 border-black bg-slate-100 dark:bg-slate-800 flex items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 bg-black flex items-center justify-center text-sm font-black text-white border-2 border-black">
            {g.exchangeDisplayName.substring(0, 2).toUpperCase()}
          </div>
          <div>
            <div className="flex items-center gap-2 flex-wrap mb-1">
              <span className="text-sm font-black tracking-widest uppercase text-black dark:text-white">{g.exchangeDisplayName}</span>
              {g.isVerifiedGiveaway && (
                <Shield size={14} className="text-emerald-500" />
              )}
              <SourceBadge source={g.source} />
            </div>
            <span className="text-[10px] font-black tracking-widest text-slate-500 uppercase">
              {isTelegram ? (g.telegramChannel ? `@${g.telegramChannel}` : `@${g.authorHandle}`) : `@${g.authorHandle}`}
            </span>
            <StatusBadges isFree={g.isFreeToEnter} effort={g.effortLevel} />
          </div>
        </div>
        <span className={`text-[10px] font-black px-2 py-1 border-2 border-black uppercase tracking-widest ${confClasses}`}>
          {confText} · {Math.round(g.confidence * 100)}%
        </span>
      </div>

      {/* Prize */}
      {g.prizePool && (
        <div className="border-b-4 border-black bg-amber-400 p-3 flex items-center gap-2">
          <Trophy size={16} className="text-black shrink-0" />
          <span className="text-sm font-black text-black tracking-widest uppercase">{g.prizePool}</span>
        </div>
      )}

      {/* Coins */}
      {g.coins.length > 0 && (
        <div className="p-3 border-b-4 border-black flex flex-wrap gap-2 bg-slate-50 dark:bg-slate-800">
          {g.coins.map(coin => (
            <span key={coin} className="text-[10px] font-black tracking-widest uppercase px-2 py-1 bg-indigo-400 text-black border-2 border-black">
              {coin}
            </span>
          ))}
        </div>
      )}

      {/* Text */}
      <div className="p-4 flex-1">
        {g.telegramHtml ? (
          <div 
            className="text-sm text-black dark:text-white font-bold leading-relaxed break-words"
            dangerouslySetInnerHTML={{ __html: g.telegramHtml }} 
          />
        ) : (
          <p className="text-sm text-black dark:text-white font-bold leading-relaxed"
            style={{ display: '-webkit-box', WebkitLineClamp: expanded ? 'unset' : 4, WebkitBoxOrient: 'vertical', overflow: expanded ? 'visible' : 'hidden' }}>
            {g.tweetText}
          </p>
        )}

        {g.tweetText.length > 180 && !g.telegramHtml && (
          <button onClick={() => setExpanded(!expanded)} className="flex items-center gap-1 text-[10px] font-black uppercase tracking-widest text-slate-500 hover:text-black dark:hover:text-white mt-2 p-1 border-2 border-transparent hover:border-black">
            {expanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
            {expanded ? 'SHOW LESS' : 'SHOW MORE'}
          </button>
        )}
      </div>

      {/* Embedded Links */}
      {g.embeddedLinks && g.embeddedLinks.length > 0 && (
        <div className="px-4 pb-3">
          <p className="text-[10px] font-black uppercase tracking-widest text-black dark:text-white mb-2 bg-yellow-400 inline-block px-1 border-2 border-black">LINKS</p>
          <div className="flex flex-wrap gap-2">
            {g.embeddedLinks.map((link, i) => (
              <a
                key={i}
                href={link.url}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 text-[10px] font-black tracking-widest uppercase px-2 py-1.5 bg-blue-600 text-white border-2 border-black hover:bg-black hover:text-white touch-manipulation"
              >
                <ExternalLink size={12} />
                {link.text || 'OPEN LINK'}
              </a>
            ))}
          </div>
        </div>
      )}

      {/* Requirements */}
      {g.requirements.length > 0 && (
        <div className="px-4 pb-4">
          <p className="text-[10px] font-black uppercase tracking-widest text-black dark:text-white mb-2 bg-emerald-400 inline-block px-1 border-2 border-black">HOW TO ENTER</p>
          <div className="flex flex-wrap gap-2">
            {g.requirements.map((req, i) => <RequirementBadge key={i} req={req} />)}
          </div>
        </div>
      )}

      {/* Footer */}
      <div className="p-3 border-t-4 border-black bg-slate-100 dark:bg-slate-800 flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3 text-[10px] font-black tracking-widest text-slate-600 uppercase">
          {isTelegram ? (
            <>
              {(g.viewCount ?? 0) > 0 && (
                <span className="flex items-center gap-1">
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
                  {(g.viewCount ?? 0).toLocaleString()}
                </span>
              )}
              {(g.forwardCount ?? 0) > 0 && (
                <span className="flex items-center gap-1"><Repeat2 size={12} />{(g.forwardCount ?? 0).toLocaleString()}</span>
              )}
            </>
          ) : (
             <>
              <span className="flex items-center gap-1"><Heart size={12} />{g.likeCount.toLocaleString()}</span>
              <span className="flex items-center gap-1"><Repeat2 size={12} />{g.retweetCount.toLocaleString()}</span>
            </>
          )}
          <span className="flex items-center gap-1"><Clock size={12} />{timeAgo(g.tweetCreatedAt)}</span>
        </div>
        <div className="flex items-center gap-2">
          <Link href={`/chat?q=${agentPrompt}`}
            className="flex items-center gap-1.5 text-[10px] font-black uppercase tracking-widest px-3 py-2 bg-fuchsia-600 text-white border-2 border-black hover:bg-black hover:text-white touch-manipulation">
            <MessageSquare size={12} /> ASK AGENT
          </Link>
          <a href={postUrl} target="_blank" rel="noopener noreferrer"
            className="flex items-center gap-1.5 text-[10px] font-black uppercase tracking-widest px-3 py-2 bg-black text-white border-2 border-black hover:bg-yellow-400 hover:text-black touch-manipulation">
            {isTelegram ? <Send size={12} /> : <ExternalLink size={12} />}
            {isTelegram ? 'VIEW CHAT' : 'VIEW POST'}
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
    <div className={`fixed bottom-6 right-6 z-50 flex items-start gap-4 p-4 border-4 border-black shadow-[8px_8px_0px_0px_rgba(0,0,0,1)] ${
      isSuccess ? 'bg-emerald-400 text-black' : 'bg-red-600 text-white'
    }`}>
      {isSuccess
        ? <CheckCircle size={24} className="shrink-0" />
        : <XCircle    size={24} className="shrink-0" />}
      <div className="flex-1">
        <p className="font-black tracking-widest uppercase">
          {result.source} SCAN {isSuccess ? 'COMPLETE' : 'FAILED'}
        </p>
        <p className="text-xs font-bold mt-1 uppercase">
          {isSuccess
            ? `${result.added ?? 0} NEW ADDED (${result.total ?? 0} PROCESSED)`
            : result.error}
        </p>
      </div>
      <button onClick={onClose} className="p-1 border-2 border-transparent hover:border-black touch-manipulation">✕</button>
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
    <div className="flex items-center gap-2 border-l-4 border-black pl-3 ml-1">
      <button
        onClick={onScanX}
        disabled={scanningX || scanningTelegram}
        title={`Trigger X scan${exchange !== 'all' ? ` for ${exchange}` : ''}`}
        className="flex items-center gap-1.5 text-[10px] font-black uppercase tracking-widest px-3 py-2 bg-black text-white border-2 border-black disabled:opacity-50 hover:bg-yellow-400 hover:text-black touch-manipulation"
      >
        {scanningX
          ? <RefreshCw size={12} className="animate-spin" />
          : <span style={{ fontSize: 12, fontWeight: 900 }}>𝕏</span>}
        {scanningX ? 'SCANNING…' : 'SCAN X'}
      </button>

      <button
        onClick={onScanTelegram}
        disabled={scanningX || scanningTelegram}
        title={`Trigger Telegram scan${exchange !== 'all' ? ` for ${exchange}` : ''}`}
        className="flex items-center gap-1.5 text-[10px] font-black uppercase tracking-widest px-3 py-2 bg-blue-600 text-white border-2 border-black disabled:opacity-50 hover:bg-yellow-400 hover:text-black touch-manipulation"
      >
        {scanningTelegram
          ? <RefreshCw size={12} className="animate-spin" />
          : <Send size={12} />}
        {scanningTelegram ? 'SCANNING…' : 'SCAN TELEGRAM'}
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
    } catch { }
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
  const allTab = { key: 'all', name: 'ALL EXCHANGES', color: '', handle: '' };

  return (
    <div className="min-h-screen bg-slate-200 dark:bg-slate-900">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-8">

        {/* ── Page Header ── */}
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-6 mb-8">
          <div>
            <div className="flex items-center gap-4 mb-2">
              <div className="w-12 h-12 bg-yellow-400 border-4 border-black flex items-center justify-center">
                <Gift size={24} className="text-black" />
              </div>
              <h1 className="text-3xl font-black text-black dark:text-white tracking-widest uppercase bg-white dark:bg-slate-800 inline-block px-3 py-1 border-4 border-black shadow-[4px_4px_0px_0px_rgba(0,0,0,1)]">
                LIVE GIVEAWAYS
              </h1>
            </div>
            <div className="flex items-center gap-3 flex-wrap mt-3">
              {counts.all > 0 && (
                <span className="text-[10px] font-black tracking-widest uppercase px-2 py-1 bg-black text-white border-2 border-black">
                  {counts.all} ACTIVE
                </span>
              )}
              {isAdmin && (
                <span className="text-[10px] font-black tracking-widest uppercase px-2 py-1 bg-red-600 text-white border-2 border-black shadow-[2px_2px_0px_0px_rgba(0,0,0,1)]">
                  ADMIN
                </span>
              )}
            </div>
          </div>

          <div className="flex items-center gap-3 flex-wrap">
            <div className="flex items-center gap-3 bg-white dark:bg-slate-800 p-2 border-4 border-black">
              {data?.lastScan && (
                <span className="text-[10px] font-black tracking-widest uppercase flex items-center gap-1.5 text-black dark:text-white">
                  <span style={{ fontSize: 12 }}>𝕏</span> {timeAgo(data.lastScan)}
                </span>
              )}
              {data?.lastTelegramScan && (
                <span className="text-[10px] font-black tracking-widest uppercase flex items-center gap-1.5 text-blue-600">
                  <Send size={12} /> {timeAgo(data.lastTelegramScan)}
                </span>
              )}
            </div>

            <button
              onClick={handleRefresh}
              disabled={loading || scanningX || scanningTelegram}
              className="flex items-center gap-2 text-[10px] font-black tracking-widest uppercase px-4 py-3 bg-white dark:bg-slate-800 text-black dark:text-white border-4 border-black hover:bg-yellow-400 hover:text-black disabled:opacity-50 touch-manipulation shadow-[4px_4px_0px_0px_rgba(0,0,0,1)]"
            >
              <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
              REFRESH
            </button>

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

        {/* ── Safety Banner ──
        <div className="flex items-center gap-4 bg-red-600 text-white border-4 border-black p-4 mb-6 shadow-[4px_4px_0px_0px_rgba(0,0,0,1)]">
          <AlertTriangle size={24} className="shrink-0 text-yellow-400" />
          <span className="text-xs font-black tracking-widest uppercase leading-relaxed">
            ONLY PARTICIPATE THROUGH OFFICIAL EXCHANGE POSTS. NEVER SEND FUNDS FIRST. USE THE "ASK AGENT" BUTTON FOR GUIDANCE.
          </span>
        </div>
         */}

        {/* ── Source Filter ── */}
        <div className="flex items-center gap-3 mb-6">
          {SOURCE_OPTIONS.map(opt => (
            <button key={opt.value} onClick={() => handleSourceChange(opt.value)}
              className={`flex items-center gap-2 text-[10px] font-black tracking-widest uppercase px-4 py-2 border-4 border-black touch-manipulation ${
                activeSource === opt.value
                  ? 'bg-black text-white shadow-[4px_4px_0px_0px_rgba(250,204,21,1)]'
                  : 'bg-white dark:bg-slate-800 text-black dark:text-white hover:bg-yellow-400 hover:text-black'
              }`}>
              {opt.value === 'telegram' && <Send size={12} />}
              {opt.value === 'twitter'  && <span style={{ fontSize: 12 }}>𝕏</span>}
              {opt.label}
            </button>
          ))}
        </div>

        {/* ── Exchange Tabs ── */}
        <div className="overflow-x-auto pb-4 mb-6 scrollbar-none flex gap-3 min-w-max border-b-4 border-black">
          <ExchangeTab exchange={allTab} active={activeExchange === 'all'} count={counts.all || 0} onClick={() => handleExchangeChange('all')} />
          {exchanges.map(ex => (
            <ExchangeTab key={ex.key} exchange={ex} active={activeExchange === ex.key} count={counts[ex.key] || 0} onClick={() => handleExchangeChange(ex.key)} />
          ))}
        </div>

        {/* ── Sort Bar ── */}
        <div className="flex items-center justify-between mb-6 bg-white dark:bg-slate-800 border-4 border-black p-3">
          <p className="text-[10px] font-black tracking-widest uppercase text-black dark:text-white bg-yellow-400 px-2 py-1 border-2 border-black inline-block">
            {loading ? 'LOADING…' : `${data?.pagination.total ?? 0} GIVEAWAYS`}
          </p>
          <div className="flex items-center gap-3">
            <Filter size={16} className="text-black dark:text-white" />
            <div className="flex gap-2">
              {SORT_OPTIONS.map(opt => (
                <button key={opt.value} onClick={() => handleSortChange(opt.value)}
                  className={`text-[10px] font-black tracking-widest uppercase px-3 py-1.5 border-2 border-black touch-manipulation ${
                    sort === opt.value ? 'bg-blue-600 text-white' : 'bg-slate-200 dark:bg-slate-700 text-black dark:text-white hover:bg-yellow-400 hover:text-black'
                  }`}>
                  {opt.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* ── Error ── */}
        {error && (
          <div className="bg-red-600 text-white border-4 border-black p-4 mb-6 text-sm font-black tracking-widest uppercase">
            {error}
          </div>
        )}

        {/* ── Grid ── */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {loading && Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="bg-white dark:bg-slate-800 border-4 border-black h-64 animate-pulse p-4 flex flex-col">
              <div className="h-10 w-full bg-slate-300 dark:bg-slate-700 mb-4 border-2 border-black"></div>
              <div className="flex-1 bg-slate-200 dark:bg-slate-600 border-2 border-black"></div>
            </div>
          ))}
          {!loading && (data?.giveaways || []).map(g => <GiveawayCard key={g._id} g={g} />)}
          {!loading && !(data?.giveaways?.length) && (
            <div className="col-span-full flex flex-col items-center justify-center py-24 bg-white dark:bg-slate-800 border-4 border-black shadow-[8px_8px_0px_0px_rgba(0,0,0,1)] text-center">
              <div className="w-20 h-20 bg-yellow-400 border-4 border-black flex items-center justify-center mb-6">
                <Gift size={32} className="text-black" />
              </div>
              <p className="text-2xl font-black text-black dark:text-white uppercase tracking-widest mb-2">NO GIVEAWAYS FOUND</p>
              <p className="text-xs font-bold text-slate-500 uppercase tracking-widest max-w-md">
                TELEGRAM CHANNELS SCAN EVERY 24H, X EVERY 2H.
                {isAdmin && ' USE THE SCAN BUTTONS ABOVE TO TRIGGER A MANUAL SCAN.'}
              </p>
            </div>
          )}
        </div>

        {/* ── Pagination ── */}
        {data && data.pagination.pages > 1 && (
          <div className="flex items-center justify-center gap-4 mt-12">
            <button disabled={page <= 1}
              onClick={() => { const p = page - 1; setPage(p); fetchData({ page: p }); }}
              className="text-[10px] font-black uppercase tracking-widest px-6 py-3 bg-white dark:bg-slate-800 text-black dark:text-white border-4 border-black disabled:opacity-50 hover:bg-yellow-400 hover:text-black touch-manipulation shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] disabled:shadow-none">
              PREVIOUS
            </button>
            <span className="text-sm font-black tracking-widest uppercase bg-black text-white px-4 py-2 border-4 border-black">
              {page} / {data.pagination.pages}
            </span>
            <button disabled={page >= data.pagination.pages}
              onClick={() => { const p = page + 1; setPage(p); fetchData({ page: p }); }}
              className="text-[10px] font-black uppercase tracking-widest px-6 py-3 bg-white dark:bg-slate-800 text-black dark:text-white border-4 border-black disabled:opacity-50 hover:bg-yellow-400 hover:text-black touch-manipulation shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] disabled:shadow-none">
              NEXT
            </button>
          </div>
        )}

        {/* ── Telegram Info ── */}
        <div className="mt-12 bg-blue-600 text-white border-4 border-black p-6 flex flex-col md:flex-row items-start gap-4 shadow-[8px_8px_0px_0px_rgba(0,0,0,1)]">
          <div className="bg-black p-3 border-4 border-black inline-flex">
            <Send size={24} className="text-blue-400" />
          </div>
          <div>
            <p className="text-lg font-black tracking-widest uppercase mb-2">TELEGRAM SCANNING ACTIVE</p>
            <p className="text-xs font-bold uppercase tracking-widest leading-relaxed text-blue-100 max-w-3xl">
              OFFICIAL EXCHANGE TELEGRAM CHANNELS ARE SCANNED EVERY 24 HOURS AUTOMATICALLY.
              POSTS ARE SCORED USING THE SAME CONFIDENCE SYSTEM AS X POSTS.
              {isAdmin && ' USE "SCAN TELEGRAM" ABOVE TO TRIGGER AN IMMEDIATE SCAN.'}
            </p>
          </div>
        </div>

        {/* ── Agent CTA ── */}
        <div className="mt-8 bg-fuchsia-600 text-white border-4 border-black p-8 flex flex-col md:flex-row items-start md:items-center gap-6 shadow-[8px_8px_0px_0px_rgba(0,0,0,1)]">
          <div className="w-16 h-16 bg-yellow-400 border-4 border-black flex items-center justify-center shrink-0">
            <Zap size={32} className="text-black" />
          </div>
          <div className="flex-1">
            <h3 className="text-2xl font-black uppercase tracking-widest mb-2 text-black">NOT SURE HOW TO PARTICIPATE?</h3>
            <p className="text-xs font-bold uppercase tracking-widest text-fuchsia-100 leading-relaxed max-w-2xl">
              ASK THE CHAINWISE AGENT — IT WILL BREAK DOWN EXACT STEPS, VERIFY THE POST IS LEGITIMATE,
              AND TELL YOU EXACTLY WHAT TO DO TO ENTER ANY GIVEAWAY.
            </p>
          </div>
          <Link href="/chat"
            className="flex items-center gap-2 px-6 py-4 bg-black text-white border-4 border-black text-sm font-black tracking-widest uppercase whitespace-nowrap hover:bg-yellow-400 hover:text-black touch-manipulation">
            <MessageSquare size={16} /> OPEN AGENT
          </Link>
        </div>

      </div>

      {/* ── Scan Toast ── */}
      {scanToast && <ScanToast result={scanToast} onClose={() => setScanToast(null)} />}
    </div>
  );
}