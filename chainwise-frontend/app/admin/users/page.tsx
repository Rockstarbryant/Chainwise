'use client';

import { useEffect, useState, useCallback } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { useRouter } from 'next/navigation';
import {
  Users, Shield, Mail,
  Trash2, RefreshCw, Search, CheckCircle,
  XCircle, Clock, TrendingUp, UserCheck, AlertTriangle,
} from 'lucide-react';

// ── Inline SVG brand icons (lucide removed these) ─────────────────────────────
const GithubIcon = ({ className }: { className?: string }) => (
  <svg viewBox="0 0 24 24" className={className} fill="currentColor">
    <path d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.531 1.032 1.531 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0022 12.017C22 6.484 17.522 2 12 2z"/>
  </svg>
);

const TwitterIcon = ({ className }: { className?: string }) => (
  <svg viewBox="0 0 24 24" className={className} fill="currentColor">
    <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-4.714-6.231-5.401 6.231H2.746l7.73-8.835L1.254 2.25H8.08l4.253 5.622zm-1.161 17.52h1.833L7.084 4.126H5.117z"/>
  </svg>
);

const FacebookIcon = ({ className }: { className?: string }) => (
  <svg viewBox="0 0 24 24" className={className} fill="#1877F2">
    <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/>
  </svg>
);

const GoogleIcon = ({ className }: { className?: string }) => (
  <svg viewBox="0 0 24 24" className={className}>
    <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
    <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
    <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
    <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
  </svg>
);

// ── Types ────────────────────────────────────────────────────────────────────
interface AdminUser {
  id:            string;
  email:         string | null;
  name:          string | null;
  avatar:        string | null;
  provider:      string;
  providers:     string[];
  emailVerified: boolean;
  phoneVerified: boolean;
  lastSignIn:    string | null;
  createdAt:     string;
  isBanned:      boolean;
}

interface Stats {
  total:      number;
  byProvider: Record<string, number>;
  verified:   number;
}

interface UsersResponse {
  users:   AdminUser[];
  total:   number;
  page:    number;
  perPage: number;
  stats:   Stats;
}

// ── Helpers ──────────────────────────────────────────────────────────────────
const PROVIDER_META: Record<string, { label: string; Icon: React.FC<{ className?: string }>; color: string }> = {
  google:   { label: 'Google',      Icon: GoogleIcon,   color: 'text-red-400    bg-red-400/10    border-red-400/30'    },
  github:   { label: 'GitHub',      Icon: GithubIcon,   color: 'text-gray-300   bg-gray-300/10   border-gray-300/30'   },
  twitter:  { label: 'X / Twitter', Icon: TwitterIcon,  color: 'text-sky-400    bg-sky-400/10    border-sky-400/30'    },
  facebook: { label: 'Facebook',    Icon: FacebookIcon, color: 'text-blue-400   bg-blue-400/10   border-blue-400/30'   },
  email:    { label: 'Email',       Icon: Mail,         color: 'text-brand-green bg-brand-green/10 border-brand-green/30' },
};

const providerMeta = (p: string) =>
  PROVIDER_META[p] ?? { label: p, Icon: Shield, color: 'text-purple-400 bg-purple-400/10 border-purple-400/30' };

const fmtDate = (iso: string | null) => {
  if (!iso) return '—';
  const d = new Date(iso);
  return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) +
    ' ' + d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
};

const timeAgo = (iso: string | null) => {
  if (!iso) return 'Never';
  const diff = Date.now() - new Date(iso).getTime();
  const mins  = Math.floor(diff / 60_000);
  if (mins < 1)   return 'Just now';
  if (mins < 60)  return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs  < 24)  return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 30)  return `${days}d ago`;
  return fmtDate(iso).split(' ').slice(0, 2).join(' ');
};

// ── Stat Card ────────────────────────────────────────────────────────────────
function StatCard({ label, value, sub, icon: Icon, accent }: {
  label: string; value: string | number; sub?: string;
  icon: React.FC<{ className?: string }>; accent: string;
}) {
  return (
    <div className={`bg-brand-surface border border-brand-border rounded-2xl p-5 flex items-start gap-4`}>
      <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${accent}`}>
        <Icon className="w-5 h-5" />
      </div>
      <div className="min-w-0">
        <div className="font-mono text-2xl font-bold text-brand-text leading-none">{value}</div>
        <div className="font-mono text-xs text-brand-muted mt-1 tracking-widest uppercase">{label}</div>
        {sub && <div className="font-mono text-[10px] text-brand-dim mt-0.5">{sub}</div>}
      </div>
    </div>
  );
}

// ── Provider Badge ────────────────────────────────────────────────────────────
function ProviderBadge({ provider }: { provider: string }) {
  const { label, Icon, color } = providerMeta(provider);
  return (
    <span className={`inline-flex items-center gap-1.5 px-2 py-1 rounded-lg border font-mono text-[10px] uppercase tracking-wider ${color}`}>
      <Icon className="w-3 h-3" />
      {label}
    </span>
  );
}

// ── Main Page ────────────────────────────────────────────────────────────────
export default function AdminUsersPage() {
  const { user, getToken, loading: authLoading } = useAuth();
  const router = useRouter();

  const [data,    setData]    = useState<UsersResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState('');
  const [search,  setSearch]  = useState('');
  const [filter,  setFilter]  = useState<string>('all');
  const [deleting, setDeleting] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<AdminUser | null>(null);

  const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000';
  const ADMIN_EMAIL = process.env.NEXT_PUBLIC_ADMIN_EMAIL;

  // ── Guard ──────────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!authLoading && (!user || user.email !== ADMIN_EMAIL)) {
      router.push('/chat');
    }
  }, [user, authLoading, router, ADMIN_EMAIL]);

  // ── Fetch ──────────────────────────────────────────────────────────────────
  const fetchUsers = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const token = await getToken();
      const res = await fetch(`${API}/api/admin/users?limit=200`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error?.message || 'Failed to load users');
      setData(json.data);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to load users');
    } finally {
      setLoading(false);
    }
  }, [API, getToken]);

  useEffect(() => { if (user) fetchUsers(); }, [user, fetchUsers]);

  // ── Delete ─────────────────────────────────────────────────────────────────
  const handleDelete = async (u: AdminUser) => {
    setDeleting(u.id);
    try {
      const token = await getToken();
      const res = await fetch(`${API}/api/admin/users/${u.id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error('Delete failed');
      setData(prev => prev ? {
        ...prev,
        users: prev.users.filter(x => x.id !== u.id),
        total: prev.total - 1,
        stats: { ...prev.stats, total: prev.stats.total - 1 },
      } : null);
      setConfirmDelete(null);
    } catch {
      alert('Failed to delete user. Try again.');
    } finally {
      setDeleting(null);
    }
  };

  // ── Filter & search ────────────────────────────────────────────────────────
  const filtered = (data?.users ?? []).filter(u => {
    const matchesProvider = filter === 'all' || u.provider === filter;
    const q = search.toLowerCase();
    const matchesSearch = !q ||
      u.email?.toLowerCase().includes(q) ||
      u.name?.toLowerCase().includes(q);
    return matchesProvider && matchesSearch;
  });

  // ── Loading / error states ─────────────────────────────────────────────────
  if (authLoading || (!user && !authLoading)) {
    return (
      <div className="min-h-screen bg-brand-bg flex items-center justify-center">
        <div className="font-mono text-xs text-brand-muted animate-pulse tracking-widest">LOADING...</div>
      </div>
    );
  }

  const stats = data?.stats;
  const providers = stats ? Object.keys(stats.byProvider) : [];

  return (
    <div className="min-h-screen bg-brand-bg">
      <div className="max-w-7xl mx-auto px-4 py-8 space-y-6">

        {/* ── Header ─────────────────────────────────────────────────────── */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="font-mono font-bold text-xl text-brand-green tracking-widest">
              USER MANAGEMENT
            </h1>
            <p className="font-mono text-xs text-brand-muted mt-1">
              All registered users — ChainWise Admin
            </p>
          </div>
          <button
            onClick={fetchUsers}
            disabled={loading}
            className="flex items-center gap-2 px-4 py-2 rounded-xl border border-brand-border font-mono text-xs text-brand-muted hover:text-brand-text hover:border-brand-green/40 transition-all disabled:opacity-40"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </button>
        </div>

        {/* ── Error ──────────────────────────────────────────────────────── */}
        {error && (
          <div className="flex items-center gap-3 px-4 py-3 rounded-xl bg-red-950/50 border border-red-800/50 text-red-400 font-mono text-xs">
            <AlertTriangle className="w-4 h-4 shrink-0" />
            {error}
          </div>
        )}

        {/* ── Stats row ──────────────────────────────────────────────────── */}
        {stats && (
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <StatCard
              label="Total Users"
              value={stats.total}
              icon={Users}
              accent="bg-brand-green/10 text-brand-green"
            />
            <StatCard
              label="Verified"
              value={stats.verified}
              sub={`${Math.round((stats.verified / Math.max(stats.total, 1)) * 100)}% of total`}
              icon={UserCheck}
              accent="bg-blue-400/10 text-blue-400"
            />
            <StatCard
              label="OAuth Providers"
              value={providers.length}
              sub={providers.join(', ')}
              icon={Shield}
              accent="bg-purple-400/10 text-purple-400"
            />
            <StatCard
              label="Most Popular"
              value={
                providers.sort((a, b) => (stats.byProvider[b] ?? 0) - (stats.byProvider[a] ?? 0))[0]
                ?? '—'
              }
              sub={stats.byProvider[providers[0]] ? `${stats.byProvider[providers[0]]} users` : undefined}
              icon={TrendingUp}
              accent="bg-amber-400/10 text-amber-400"
            />
          </div>
        )}

        {/* ── Provider breakdown ─────────────────────────────────────────── */}
        {stats && providers.length > 0 && (
          <div className="bg-brand-surface border border-brand-border rounded-2xl p-5">
            <div className="font-mono text-xs text-brand-muted tracking-widest uppercase mb-4">
              Provider Breakdown
            </div>
            <div className="flex flex-wrap gap-3">
              {providers
                .sort((a, b) => (stats.byProvider[b] ?? 0) - (stats.byProvider[a] ?? 0))
                .map(p => {
                  const { label, Icon, color } = providerMeta(p);
                  const count = stats.byProvider[p] ?? 0;
                  const pct = Math.round((count / stats.total) * 100);
                  return (
                    <button
                      key={p}
                      onClick={() => setFilter(f => f === p ? 'all' : p)}
                      className={`flex items-center gap-2 px-3 py-2 rounded-xl border font-mono text-xs transition-all ${color} ${filter === p ? 'ring-1 ring-current opacity-100' : 'opacity-70 hover:opacity-100'}`}
                    >
                      <Icon className="w-3.5 h-3.5" />
                      {label}
                      <span className="font-bold">{count}</span>
                      <span className="text-[10px] opacity-60">({pct}%)</span>
                    </button>
                  );
                })}
              {filter !== 'all' && (
                <button
                  onClick={() => setFilter('all')}
                  className="flex items-center gap-2 px-3 py-2 rounded-xl border border-brand-border font-mono text-xs text-brand-muted hover:text-brand-text transition-all"
                >
                  Clear filter
                </button>
              )}
            </div>
          </div>
        )}

        {/* ── Search + table ─────────────────────────────────────────────── */}
        <div className="bg-brand-surface border border-brand-border rounded-2xl overflow-hidden">

          {/* Search bar */}
          <div className="p-4 border-b border-brand-border">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-brand-muted" />
              <input
                type="text"
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Search by email or name..."
                className="w-full bg-brand-bg border border-brand-border rounded-xl pl-10 pr-4 py-2.5 font-mono text-sm text-brand-text placeholder:text-brand-muted outline-none focus:border-brand-green/50 transition-colors"
              />
            </div>
            <div className="font-mono text-[10px] text-brand-muted mt-2">
              Showing {filtered.length} of {data?.total ?? 0} users
              {filter !== 'all' && ` · filtered by ${filter}`}
              {search && ` · matching "${search}"`}
            </div>
          </div>

          {/* Table */}
          {loading ? (
            <div className="p-12 text-center font-mono text-xs text-brand-muted animate-pulse tracking-widest">
              LOADING USERS...
            </div>
          ) : filtered.length === 0 ? (
            <div className="p-12 text-center font-mono text-xs text-brand-muted">
              No users found.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-brand-border">
                    {['User', 'Provider', 'Verified', 'Joined', 'Last Sign-in', ''].map(h => (
                      <th key={h} className="text-left px-4 py-3 font-mono text-[10px] text-brand-muted tracking-widest uppercase">
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((u, i) => (
                    <tr
                      key={u.id}
                      className={`border-b border-brand-border/50 hover:bg-brand-green/[0.02] transition-colors ${i % 2 === 0 ? '' : 'bg-white/[0.01]'}`}
                    >
                      {/* User */}
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-3">
                          {u.avatar ? (
                            <img
                              src={u.avatar}
                              alt={u.name ?? u.email ?? ''}
                              className="w-8 h-8 rounded-full border border-brand-border object-cover shrink-0"
                              onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }}
                            />
                          ) : (
                            <div className="w-8 h-8 rounded-full bg-brand-green/10 border border-brand-green/20 flex items-center justify-center shrink-0">
                              <span className="font-mono text-xs font-bold text-brand-green">
                                {(u.name || u.email || '?')[0].toUpperCase()}
                              </span>
                            </div>
                          )}
                          <div className="min-w-0">
                            {u.name && (
                              <div className="font-mono text-xs text-brand-text font-medium truncate max-w-[180px]">
                                {u.name}
                              </div>
                            )}
                            <div className="font-mono text-[10px] text-brand-muted truncate max-w-[200px]">
                              {u.email ?? <span className="italic">no email</span>}
                            </div>
                            <div className="font-mono text-[9px] text-brand-dim truncate max-w-[200px] opacity-50">
                              {u.id.slice(0, 8)}…
                            </div>
                          </div>
                        </div>
                      </td>

                      {/* Provider */}
                      <td className="px-4 py-3">
                        <div className="flex flex-wrap gap-1">
                          {u.providers.map(p => (
                            <ProviderBadge key={p} provider={p} />
                          ))}
                        </div>
                      </td>

                      {/* Verified */}
                      <td className="px-4 py-3">
                        {u.emailVerified ? (
                          <span className="flex items-center gap-1.5 font-mono text-[10px] text-brand-green">
                            <CheckCircle className="w-3.5 h-3.5" /> Verified
                          </span>
                        ) : (
                          <span className="flex items-center gap-1.5 font-mono text-[10px] text-amber-400">
                            <XCircle className="w-3.5 h-3.5" /> Unverified
                          </span>
                        )}
                      </td>

                      {/* Joined */}
                      <td className="px-4 py-3">
                        <div className="font-mono text-[10px] text-brand-muted">
                          {fmtDate(u.createdAt)}
                        </div>
                      </td>

                      {/* Last sign-in */}
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1.5 font-mono text-[10px] text-brand-muted">
                          <Clock className="w-3 h-3 shrink-0" />
                          {timeAgo(u.lastSignIn)}
                        </div>
                      </td>

                      {/* Actions */}
                      <td className="px-4 py-3">
                        <button
                          onClick={() => setConfirmDelete(u)}
                          className="p-1.5 rounded-lg text-brand-muted hover:text-red-400 hover:bg-red-400/10 transition-all"
                          title="Delete user"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {/* ── Delete confirmation modal ───────────────────────────────────────── */}
      {confirmDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm px-4">
          <div className="w-full max-w-sm bg-brand-surface border border-red-800/50 rounded-2xl p-6 space-y-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-red-400/10 flex items-center justify-center">
                <AlertTriangle className="w-5 h-5 text-red-400" />
              </div>
              <div>
                <div className="font-mono font-bold text-sm text-brand-text">Delete User</div>
                <div className="font-mono text-xs text-brand-muted">This action is permanent</div>
              </div>
            </div>

            <div className="bg-brand-bg border border-brand-border rounded-xl px-4 py-3">
              <div className="font-mono text-xs text-brand-text">{confirmDelete.name ?? 'Unknown'}</div>
              <div className="font-mono text-[10px] text-brand-muted">{confirmDelete.email}</div>
              <div className="font-mono text-[10px] text-brand-dim mt-1">{confirmDelete.id}</div>
            </div>

            <p className="font-mono text-xs text-brand-muted leading-relaxed">
              This will permanently delete the user from Supabase. Their conversation history in MongoDB will remain.
            </p>

            <div className="flex gap-3">
              <button
                onClick={() => setConfirmDelete(null)}
                className="flex-1 py-2.5 rounded-xl border border-brand-border font-mono text-xs text-brand-muted hover:text-brand-text transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={() => handleDelete(confirmDelete)}
                disabled={deleting === confirmDelete.id}
                className="flex-1 py-2.5 rounded-xl bg-red-900/50 border border-red-700/50 font-mono text-xs text-red-400 hover:bg-red-900 transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {deleting === confirmDelete.id
                  ? <><RefreshCw className="w-3.5 h-3.5 animate-spin" /> Deleting...</>
                  : <><Trash2 className="w-3.5 h-3.5" /> Delete</>
                }
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}