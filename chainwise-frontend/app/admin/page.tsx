'use client';

import { useState, useEffect, useRef } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { useRouter } from 'next/navigation';
import {
  Plus, Pencil, Trash2, Save, X,
  ShieldAlert, Search,
  ChevronRight, AlertCircle, ArrowLeft,
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

// ── Types ──────────────────────────────────────────────────────────────────
interface CgCoin {
  symbol: string;
  name: string;
  coinGeckoId: string | null;
  volume: number;
}

interface Network {
  chain: string;
  chainId: string;
  withdrawFee: number;
  withdrawFeeUSD: number;
  minWithdraw: number;
  minDeposit: number;
  depositFee: number;
  arrivalMins: number;
  isActive: boolean;
}

interface DbCoin {
  symbol: string;
  networks: Network[];
}

interface DbExchange {
  _id: string;
  exchange: string;
  displayName: string;
  coins: DbCoin[];
  lastUpdated: string;
}

interface EditingNetwork extends Network {
  _original: string;
}

const EMPTY_NETWORK = {
  chain: '', chainId: '',
  withdrawFee: 0, withdrawFeeUSD: 0,
  minWithdraw: 0, minDeposit: 0,
  depositFee: 0, arrivalMins: 1,
};

const ADMIN_EMAIL = process.env.NEXT_PUBLIC_ADMIN_EMAIL || 'yobra194@gmail.com';

const EXCHANGES = [
  { key: 'binance', label: 'Binance' },
  { key: 'bybit',   label: 'Bybit'   },
  { key: 'coinex',  label: 'CoinEx'  },
  { key: 'bitget',  label: 'Bitget'  },
  { key: 'kucoin',  label: 'KuCoin'  },
  { key: 'gateio',  label: 'Gate.io' },
];

// Mobile steps: 0 = exchange list, 1 = coin list, 2 = fee editor
type MobileStep = 0 | 1 | 2;

export default function AdminPage() {
  const { user, isAuthenticated, loading, getToken } = useAuth();
  const router = useRouter();

  const [selectedEx,       setSelectedEx]       = useState('');
  const [cgCoins,          setCgCoins]          = useState<CgCoin[]>([]);
  const [cgLoading,        setCgLoading]        = useState(false);
  const [cgPage,           setCgPage]           = useState(1);
  const [cgSearch,         setCgSearch]         = useState('');
  const [selectedCoin,     setSelectedCoin]     = useState<CgCoin | null>(null);
  const [dbExchanges,      setDbExchanges]      = useState<DbExchange[]>([]);
  const [existingNetworks, setExistingNetworks] = useState<Network[]>([]);
  const [editingNetwork,   setEditingNetwork]   = useState<EditingNetwork | null>(null);
  const [addingNetwork,    setAddingNetwork]    = useState(false);
  const [newNetwork,       setNewNetwork]       = useState({ ...EMPTY_NETWORK });
  const [saving,           setSaving]           = useState(false);
  const [toast,            setToast]            = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [fetchError,       setFetchError]       = useState<string | null>(null);
  const [mobileStep,       setMobileStep]       = useState<MobileStep>(0);

  const searchRef = useRef<HTMLInputElement>(null);
  const isAdmin   = !!user?.email && user.email.toLowerCase() === ADMIN_EMAIL.toLowerCase();

  useEffect(() => {
    if (!loading && !isAuthenticated) router.push('/login');
  }, [loading, isAuthenticated, router]);

  useEffect(() => {
    if (!loading && isAuthenticated && isAdmin) loadDbExchanges();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, isAuthenticated, user]);

  const loadDbExchanges = async () => {
    try {
      const token = await getToken();
      const res   = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/admin/fees`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (data.success) setDbExchanges(data.data || []);
    } catch (err: unknown) {
      if (err instanceof Error) setFetchError(err.message);
    }
  };

  const selectExchange = async (exKey: string, page = 1) => {
    setSelectedEx(exKey);
    setSelectedCoin(null);
    setExistingNetworks([]);
    setAddingNetwork(false);
    setEditingNetwork(null);
    setCgSearch('');
    setCgPage(page);
    setCgLoading(true);
    setFetchError(null);
    setMobileStep(1);

    try {
      const res  = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL}/api/fees/${exKey}/coins?page=${page}`
      );
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data?.error?.message || 'Failed to load coins');
      setCgCoins(data.data?.coins || []);
    } catch (err: unknown) {
      setFetchError(err instanceof Error ? err.message : 'Failed to load coins');
      setCgCoins([]);
    } finally {
      setCgLoading(false);
      setTimeout(() => searchRef.current?.focus(), 100);
    }
  };

  const selectCoin = (coin: CgCoin) => {
    setSelectedCoin(coin);
    setAddingNetwork(false);
    setEditingNetwork(null);
    setMobileStep(2);

    const dbEx   = dbExchanges.find(e => e.exchange === selectedEx);
    const dbCoin = dbEx?.coins.find(c => c.symbol === coin.symbol.toUpperCase());
    setExistingNetworks(dbCoin?.networks || []);
  };

  const showToast = (type: 'success' | 'error', text: string) => {
    setToast({ type, text });
    setTimeout(() => setToast(null), 4000);
  };

  const refreshCoinNetworks = async (symbol: string): Promise<Network[]> => {
    await loadDbExchanges();
    const dbEx   = dbExchanges.find(e => e.exchange === selectedEx);
    const dbCoin = dbEx?.coins.find(c => c.symbol === symbol.toUpperCase());
    return dbCoin?.networks || [];
  };

  const saveEdit = async () => {
    if (!editingNetwork || !selectedCoin) return;
    setSaving(true);
    try {
      const token = await getToken();
      const res = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL}/api/admin/fees/${selectedEx}/${selectedCoin.symbol}/${encodeURIComponent(editingNetwork._original)}`,
        {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify({
            withdrawFee:    Number(editingNetwork.withdrawFee),
            withdrawFeeUSD: Number(editingNetwork.withdrawFeeUSD),
            minWithdraw:    Number(editingNetwork.minWithdraw),
            minDeposit:     Number(editingNetwork.minDeposit),
            depositFee:     Number(editingNetwork.depositFee),
            arrivalMins:    Number(editingNetwork.arrivalMins),
            isActive:       editingNetwork.isActive,
          }),
        }
      );
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data?.error?.message);
      showToast('success', `✓ Updated ${editingNetwork.chain}`);
      setEditingNetwork(null);
      const updated = await refreshCoinNetworks(selectedCoin.symbol);
      setExistingNetworks(updated);
    } catch (err: unknown) {
      showToast('error', err instanceof Error ? err.message : 'Update failed');
    } finally { setSaving(false); }
  };

  const saveNewNetwork = async () => {
    if (!selectedCoin) return;
    if (!newNetwork.chain.trim() || !newNetwork.chainId.trim()) {
      showToast('error', 'Chain name and Chain ID are required');
      return;
    }
    setSaving(true);
    try {
      const token = await getToken();
      const res = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL}/api/admin/fees/${selectedEx}/${selectedCoin.symbol}/networks`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify({ ...newNetwork, isActive: true }),
        }
      );
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data?.error?.message);
      showToast('success', `✓ Added ${newNetwork.chain} for ${selectedCoin.symbol}`);
      setAddingNetwork(false);
      setNewNetwork({ ...EMPTY_NETWORK });
      const updated = await refreshCoinNetworks(selectedCoin.symbol);
      setExistingNetworks(updated);
    } catch (err: unknown) {
      showToast('error', err instanceof Error ? err.message : 'Add failed');
    } finally { setSaving(false); }
  };

  const deleteNetwork = async (chain: string) => {
    if (!selectedCoin) return;
    if (!confirm(`Delete "${chain}" from ${selectedCoin.symbol} on ${selectedEx}?`)) return;
    try {
      const token = await getToken();
      const res = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL}/api/admin/fees/${selectedEx}/${selectedCoin.symbol}/${encodeURIComponent(chain)}`,
        { method: 'DELETE', headers: { Authorization: `Bearer ${token}` } }
      );
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data?.error?.message);
      showToast('success', `✓ Deleted ${chain}`);
      const updated = await refreshCoinNetworks(selectedCoin.symbol);
      setExistingNetworks(updated);
    } catch (err: unknown) {
      showToast('error', err instanceof Error ? err.message : 'Delete failed');
    }
  };

  const filteredCoins = cgCoins.filter(c =>
    c.symbol.toLowerCase().includes(cgSearch.toLowerCase()) ||
    c.name.toLowerCase().includes(cgSearch.toLowerCase())
  );

  // ── Guard renders ─────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="h-full flex items-center justify-center">
        <p className="font-mono text-xs text-brand-muted animate-pulse tracking-widest">CHECKING AUTH...</p>
      </div>
    );
  }

  if (!isAdmin) {
    return (
      <div className="h-full flex items-center justify-center px-4">
        <div className="text-center space-y-3">
          <ShieldAlert className="w-10 h-10 text-red-400 mx-auto" />
          <p className="font-mono text-sm text-red-400 font-bold">ACCESS DENIED</p>
          <p className="font-mono text-xs text-brand-muted">
            Signed in as <span className="text-red-400">{user?.email}</span>
          </p>
          <p className="font-mono text-xs text-brand-muted">
            Admin: <span className="text-brand-text">{ADMIN_EMAIL}</span>
          </p>
        </div>
      </div>
    );
  }

  // ── Shared sub-components ─────────────────────────────────────────────────

  const ExchangeList = () => (
    <div className="h-full flex flex-col overflow-hidden">
      <div className="px-4 py-3 border-b border-brand-border flex-shrink-0">
        <p className="font-mono text-[9px] text-brand-muted tracking-widest">EXCHANGES</p>
      </div>
      <div className="flex-1 overflow-y-auto">
        {EXCHANGES.map(ex => (
          <button
            key={ex.key}
            onClick={() => selectExchange(ex.key)}
            className={`
              w-full flex items-center justify-between px-4 py-4 text-left
              border-b border-brand-border/50 transition-all duration-150
              ${selectedEx === ex.key
                ? 'bg-[rgba(0,255,136,0.08)] text-brand-green border-l-2 border-l-brand-green'
                : 'text-brand-muted hover:text-brand-text hover:bg-[rgba(255,255,255,0.02)]'
              }
            `}
          >
            <span className="font-mono text-sm md:text-xs">{ex.label}</span>
            <ChevronRight className="w-4 h-4 md:w-3 md:h-3" />
          </button>
        ))}
      </div>
    </div>
  );

  const CoinList = () => (
    <div className="h-full flex flex-col overflow-hidden">
      {/* Mobile back button */}
      <div className="md:hidden px-4 py-3 border-b border-brand-border flex items-center gap-3 flex-shrink-0">
        <button
          onClick={() => setMobileStep(0)}
          className="text-brand-muted hover:text-brand-green transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
        </button>
        <span className="font-mono text-xs text-brand-green font-bold">
          {EXCHANGES.find(e => e.key === selectedEx)?.label}
        </span>
      </div>

      {/* Search */}
      <div className="p-3 border-b border-brand-border flex-shrink-0">
        <div className="flex items-center gap-2 bg-brand-bg border border-brand-border rounded-lg px-3 py-2 focus-within:border-brand-dim transition-colors">
          <Search className="w-3.5 h-3.5 text-brand-muted flex-shrink-0" />
          <input
            ref={searchRef}
            type="text"
            value={cgSearch}
            onChange={e => setCgSearch(e.target.value)}
            placeholder="Search coin..."
            className="flex-1 bg-transparent font-mono text-xs text-brand-text placeholder:text-brand-muted outline-none"
          />
          {cgSearch && (
            <button onClick={() => setCgSearch('')} className="text-brand-muted hover:text-brand-text">
              <X className="w-3 h-3" />
            </button>
          )}
        </div>
        {cgCoins.length > 0 && (
          <p className="font-mono text-[9px] text-brand-muted mt-1.5 tracking-widest">
            {filteredCoins.length} / {cgCoins.length} COINS
          </p>
        )}
      </div>

      {/* Coins */}
      <div className="flex-1 overflow-y-auto">
        {cgLoading ? (
          <div className="p-4 space-y-2">
            {[...Array(8)].map((_, i) => (
              <div key={i} className="h-12 bg-brand-surface border border-brand-border rounded-lg animate-pulse" />
            ))}
          </div>
        ) : fetchError ? (
          <div className="p-4">
            <div className="flex items-start gap-2 text-red-400">
              <AlertCircle className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
              <p className="font-mono text-xs">{fetchError}</p>
            </div>
            <button
              onClick={() => selectExchange(selectedEx)}
              className="mt-2 font-mono text-[10px] text-brand-green hover:underline"
            >
              Retry
            </button>
          </div>
        ) : filteredCoins.length === 0 ? (
          <p className="p-4 font-mono text-xs text-brand-muted">No coins found.</p>
        ) : (
          filteredCoins.map(coin => {
            const dbEx    = dbExchanges.find(e => e.exchange === selectedEx);
            const hasData = dbEx?.coins.some(c => c.symbol === coin.symbol.toUpperCase());
            return (
              <button
                key={coin.symbol}
                onClick={() => selectCoin(coin)}
                className={`
                  w-full flex items-center justify-between px-4 py-3
                  border-b border-brand-border/40 text-left transition-all
                  ${selectedCoin?.symbol === coin.symbol
                    ? 'bg-[rgba(0,255,136,0.08)] text-brand-green border-l-2 border-l-brand-green'
                    : 'text-brand-muted hover:text-brand-text hover:bg-[rgba(255,255,255,0.02)]'
                  }
                `}
              >
                <div>
                  <div className="font-mono text-xs font-bold">{coin.symbol}</div>
                  <div className="font-mono text-[9px] opacity-50 truncate max-w-[140px]">{coin.name}</div>
                </div>
                {hasData ? (
                  <span className="font-mono text-[9px] text-brand-green bg-brand-green/10 border border-brand-green/20 rounded px-1.5 py-0.5">
                    IN DB
                  </span>
                ) : (
                  <span className="font-mono text-[9px] text-brand-muted opacity-50">NEW</span>
                )}
              </button>
            );
          })
        )}

        {!cgLoading && cgCoins.length >= 100 && (
          <button
            onClick={() => { const next = cgPage + 1; setCgPage(next); selectExchange(selectedEx, next); }}
            className="w-full py-3 font-mono text-xs text-brand-muted hover:text-brand-green transition-colors border-t border-brand-border"
          >
            Load more →
          </button>
        )}
      </div>
    </div>
  );

  const FeeEditor = () => (
    <div className="h-full overflow-y-auto p-4 md:p-5">
      {!selectedCoin ? (
        <div className="h-full flex flex-col items-center justify-center gap-3 text-center">
          <div className="text-5xl opacity-10">💱</div>
          <p className="font-mono text-xs text-brand-muted tracking-widest">
            SELECT A COIN TO VIEW AND EDIT ITS FEE SETTINGS
          </p>
        </div>
      ) : (
        <div>
          {/* Mobile back + coin header */}
          <div className="flex items-start justify-between mb-5">
            <div className="flex items-start gap-3">
              <button
                onClick={() => setMobileStep(1)}
                className="md:hidden mt-1 text-brand-muted hover:text-brand-green transition-colors flex-shrink-0"
              >
                <ArrowLeft className="w-4 h-4" />
              </button>
              <div>
                <h2 className="font-mono font-bold text-lg text-brand-green">
                  {selectedCoin.symbol}
                  <span className="text-brand-muted text-sm font-normal ml-2">
                    on {EXCHANGES.find(e => e.key === selectedEx)?.label}
                  </span>
                </h2>
                <p className="font-mono text-[11px] text-brand-muted mt-0.5">
                  {existingNetworks.length > 0
                    ? `${existingNetworks.length} chains in database`
                    : 'Not in database yet — add the first chain below'
                  }
                </p>
              </div>
            </div>
            <button
              onClick={() => { setAddingNetwork(true); setEditingNetwork(null); }}
              className="flex items-center gap-1.5 font-mono text-xs text-brand-green border border-brand-green/30 hover:bg-brand-green/10 rounded-lg px-3 py-2 transition-all flex-shrink-0"
            >
              <Plus className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Add Chain</span>
              <span className="sm:hidden">Add</span>
            </button>
          </div>

          {/* Networks — card layout on mobile, table on desktop */}
          {existingNetworks.length > 0 && (
            <div className="mb-5">
              {/* Desktop table */}
              <div className="hidden md:block bg-brand-surface border border-brand-border rounded-xl overflow-hidden">
                <div className="grid grid-cols-8 gap-2 px-4 py-2.5 bg-[rgba(0,0,0,0.2)] border-b border-brand-border">
                  {['Chain', 'Chain ID', 'Withdraw Fee', 'Fee USD', 'Min Withdraw', 'Min Deposit', 'ETA', 'Actions'].map(h => (
                    <div key={h} className="font-mono text-[9px] text-brand-muted tracking-widest">{h}</div>
                  ))}
                </div>
                <div className="divide-y divide-brand-border/40">
                  {existingNetworks.map((network, i) => (
                    <div key={i}>
                      {editingNetwork?._original === network.chain ? (
                        <div className="grid grid-cols-8 gap-2 px-4 py-3 bg-[rgba(0,255,136,0.03)] items-center">
                          <div className="font-mono text-xs text-brand-green font-bold truncate">{network.chain}</div>
                          <div className="font-mono text-[10px] text-brand-muted truncate">{network.chainId}</div>
                          {(['withdrawFee', 'withdrawFeeUSD', 'minWithdraw', 'minDeposit', 'arrivalMins'] as const).map(field => (
                            <input
                              key={field}
                              type="number"
                              step="any"
                              min="0"
                              value={editingNetwork[field]}
                              onChange={e => setEditingNetwork(prev =>
                                prev ? { ...prev, [field]: parseFloat(e.target.value) || 0 } : null
                              )}
                              className="w-full bg-brand-bg border border-brand-dim rounded-lg px-2 py-1.5 font-mono text-xs text-brand-text outline-none"
                            />
                          ))}
                          <div className="flex gap-1">
                            <button onClick={saveEdit} disabled={saving} className="flex items-center gap-1 px-2 py-1.5 rounded-lg bg-brand-green text-black font-mono text-[10px] font-bold disabled:opacity-50">
                              <Save className="w-3 h-3" />{saving ? '...' : 'Save'}
                            </button>
                            <button onClick={() => setEditingNetwork(null)} className="p-1.5 rounded-lg border border-brand-border text-brand-muted">
                              <X className="w-3 h-3" />
                            </button>
                          </div>
                        </div>
                      ) : (
                        <div className="grid grid-cols-8 gap-2 px-4 py-3 items-center hover:bg-[rgba(255,255,255,0.01)] group transition-colors">
                          <div className="font-mono text-xs text-brand-text truncate">{network.chain}</div>
                          <div className="font-mono text-[10px] text-brand-muted truncate">{network.chainId}</div>
                          <div className={`font-mono text-xs font-bold ${network.withdrawFee === 0 ? 'text-brand-green' : 'text-brand-text'}`}>
                            {network.withdrawFee === 0 ? '🆓 FREE' : network.withdrawFee}
                          </div>
                          <div className="font-mono text-[11px] text-brand-muted">{network.withdrawFeeUSD != null ? `$${network.withdrawFeeUSD}` : '—'}</div>
                          <div className="font-mono text-[11px] text-brand-muted">{network.minWithdraw}</div>
                          <div className="font-mono text-[11px] text-brand-muted">{network.minDeposit}</div>
                          <div className="font-mono text-[11px] text-brand-muted">{network.arrivalMins}m</div>
                          <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                            <button onClick={() => setEditingNetwork({ ...network, _original: network.chain })} className="p-1.5 rounded-lg border border-brand-border text-brand-muted hover:text-brand-green hover:border-brand-green/40 transition-all">
                              <Pencil className="w-3 h-3" />
                            </button>
                            <button onClick={() => deleteNetwork(network.chain)} className="p-1.5 rounded-lg border border-brand-border text-brand-muted hover:text-red-400 hover:border-red-500/40 transition-all">
                              <Trash2 className="w-3 h-3" />
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>

              {/* Mobile cards */}
              <div className="md:hidden space-y-3">
                {existingNetworks.map((network, i) => (
                  <div key={i} className="bg-brand-surface border border-brand-border rounded-xl p-4">
                    {editingNetwork?._original === network.chain ? (
                      <div className="space-y-3">
                        <p className="font-mono text-xs text-brand-green font-bold">{network.chain}</p>
                        <div className="grid grid-cols-2 gap-2">
                          {([
                            { field: 'withdrawFee',    label: 'Withdraw Fee'    },
                            { field: 'withdrawFeeUSD', label: 'Fee (USD)'       },
                            { field: 'minWithdraw',    label: 'Min Withdraw'    },
                            { field: 'minDeposit',     label: 'Min Deposit'     },
                            { field: 'arrivalMins',    label: 'ETA (mins)'      },
                          ] as { field: keyof Pick<Network, 'withdrawFee'|'withdrawFeeUSD'|'minWithdraw'|'minDeposit'|'arrivalMins'>; label: string }[]).map(({ field, label }) => (
                            <div key={field}>
                              <label className="font-mono text-[9px] text-brand-muted tracking-wider block mb-1">{label}</label>
                              <input
                                type="number"
                                step="any"
                                min="0"
                                value={editingNetwork[field]}
                                onChange={e => setEditingNetwork(prev =>
                                  prev ? { ...prev, [field]: parseFloat(e.target.value) || 0 } : null
                                )}
                                className="w-full bg-brand-bg border border-brand-dim rounded-lg px-2 py-2 font-mono text-xs text-brand-text outline-none"
                              />
                            </div>
                          ))}
                        </div>
                        <div className="flex gap-2">
                          <button onClick={saveEdit} disabled={saving} className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-brand-green text-black font-mono text-xs font-bold disabled:opacity-50">
                            <Save className="w-3.5 h-3.5" />{saving ? 'Saving...' : 'Save'}
                          </button>
                          <button onClick={() => setEditingNetwork(null)} className="px-4 py-2 rounded-lg border border-brand-border font-mono text-xs text-brand-muted">
                            Cancel
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div>
                        <div className="flex items-center justify-between mb-3">
                          <div>
                            <p className="font-mono text-xs font-bold text-brand-text">{network.chain}</p>
                            <p className="font-mono text-[10px] text-brand-muted">{network.chainId}</p>
                          </div>
                          <div className="flex gap-1.5">
                            <button onClick={() => setEditingNetwork({ ...network, _original: network.chain })} className="p-2 rounded-lg border border-brand-border text-brand-muted hover:text-brand-green hover:border-brand-green/40 transition-all">
                              <Pencil className="w-3.5 h-3.5" />
                            </button>
                            <button onClick={() => deleteNetwork(network.chain)} className="p-2 rounded-lg border border-brand-border text-brand-muted hover:text-red-400 hover:border-red-500/40 transition-all">
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>
                        <div className="grid grid-cols-3 gap-2">
                          {[
                            { label: 'Fee',      value: network.withdrawFee === 0 ? '🆓 FREE' : String(network.withdrawFee) },
                            { label: 'Fee USD',  value: network.withdrawFeeUSD != null ? `$${network.withdrawFeeUSD}` : '—' },
                            { label: 'Min Out',  value: String(network.minWithdraw) },
                            { label: 'Min In',   value: String(network.minDeposit)  },
                            { label: 'ETA',      value: `${network.arrivalMins}m`   },
                          ].map(({ label, value }) => (
                            <div key={label} className="bg-brand-bg rounded-lg px-2 py-2">
                              <p className="font-mono text-[9px] text-brand-muted tracking-wider">{label}</p>
                              <p className={`font-mono text-xs font-bold mt-0.5 ${value.includes('FREE') ? 'text-brand-green' : 'text-brand-text'}`}>{value}</p>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Add new chain form */}
          {addingNetwork && (
            <motion.div
              className="bg-brand-surface border border-brand-green/20 rounded-xl p-4 md:p-5"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
            >
              <div className="flex items-center justify-between mb-4">
                <p className="font-mono text-xs text-brand-green tracking-widest font-bold">
                  ✦ ADD CHAIN — {selectedCoin.symbol}
                </p>
                <button onClick={() => { setAddingNetwork(false); setNewNetwork({ ...EMPTY_NETWORK }); }} className="text-brand-muted hover:text-brand-text">
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="grid grid-cols-2 md:grid-cols-4 gap-3 md:gap-4 mb-4">
                {[
                  { key: 'chain',          label: 'Chain Name *',       placeholder: 'e.g. Arbitrum One', type: 'text'   },
                  { key: 'chainId',        label: 'Chain ID *',         placeholder: 'e.g. arbitrum',     type: 'text'   },
                  { key: 'withdrawFee',    label: 'Withdraw Fee',       placeholder: '0',                 type: 'number' },
                  { key: 'withdrawFeeUSD', label: 'Fee (USD)',          placeholder: '0.00',              type: 'number' },
                  { key: 'minWithdraw',    label: 'Min Withdrawal',     placeholder: '1',                 type: 'number' },
                  { key: 'minDeposit',     label: 'Min Deposit',        placeholder: '1',                 type: 'number' },
                  { key: 'depositFee',     label: 'Deposit Fee',        placeholder: '0',                 type: 'number' },
                  { key: 'arrivalMins',    label: 'Arrival (min)',      placeholder: '1',                 type: 'number' },
                ].map(({ key, label, placeholder, type }) => (
                  <div key={key}>
                    <label className="font-mono text-[10px] text-brand-muted block mb-1.5 tracking-wider">{label}</label>
                    <input
                      type={type}
                      step="any"
                      min="0"
                      placeholder={placeholder}
                      value={(newNetwork as Record<string, string | number>)[key]}
                      onChange={e => setNewNetwork(prev => ({
                        ...prev,
                        [key]: type === 'text' ? e.target.value : (parseFloat(e.target.value) || 0),
                      }))}
                      className="w-full bg-brand-bg border border-brand-border rounded-lg px-3 py-2.5 font-mono text-xs text-brand-text placeholder:text-brand-muted/40 outline-none focus:border-brand-dim transition-colors"
                    />
                  </div>
                ))}
              </div>

              <div className="flex gap-2">
                <button onClick={saveNewNetwork} disabled={saving} className="flex items-center gap-1.5 px-5 py-2.5 rounded-xl bg-gradient-to-r from-brand-green to-brand-blue text-black font-mono text-xs font-bold disabled:opacity-50 transition-all">
                  <Save className="w-3.5 h-3.5" />
                  {saving ? 'Saving...' : 'Save Chain'}
                </button>
                <button onClick={() => { setAddingNetwork(false); setNewNetwork({ ...EMPTY_NETWORK }); }} className="flex items-center gap-1.5 px-5 py-2.5 rounded-xl border border-brand-border font-mono text-xs text-brand-muted hover:text-brand-text transition-colors">
                  <X className="w-3.5 h-3.5" />
                  Cancel
                </button>
              </div>
            </motion.div>
          )}

          {existingNetworks.length === 0 && !addingNetwork && (
            <div className="bg-brand-surface border border-dashed border-brand-border rounded-xl p-10 text-center">
              <p className="font-mono text-sm text-brand-muted mb-1">{selectedCoin.symbol} has no fee data yet</p>
              <p className="font-mono text-[11px] text-brand-muted/60 mb-4">Add withdrawal chains and their fees manually</p>
              <button onClick={() => setAddingNetwork(true)} className="inline-flex items-center gap-1.5 font-mono text-xs text-brand-green border border-brand-green/30 hover:bg-brand-green/10 rounded-lg px-4 py-2 transition-all">
                <Plus className="w-3.5 h-3.5" />
                Add First Chain
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );

  // ── Main render ────────────────────────────────────────────────────────────
  return (
    <div className="h-full flex flex-col overflow-hidden">

      {/* Header */}
      <div className="flex items-center justify-between px-4 md:px-6 py-3 md:py-4 border-b border-brand-border flex-shrink-0">
        <div>
          <h1 className="font-mono font-bold text-base md:text-xl text-brand-green tracking-[0.1em] md:tracking-[0.15em]">
            ADMIN — FEE MANAGER
          </h1>
          {/* Mobile breadcrumb */}
          <p className="md:hidden font-mono text-[10px] text-brand-muted mt-0.5">
            {mobileStep === 0 && 'Select exchange'}
            {mobileStep === 1 && `${EXCHANGES.find(e => e.key === selectedEx)?.label} → select coin`}
            {mobileStep === 2 && `${selectedCoin?.symbol} · ${EXCHANGES.find(e => e.key === selectedEx)?.label}`}
          </p>
          <p className="hidden md:block font-mono text-[10px] text-brand-muted mt-0.5 tracking-widest">
            SELECT EXCHANGE → SEARCH COIN → UPDATE FEES
          </p>
        </div>
        <span className="hidden sm:block font-mono text-xs text-brand-muted border border-brand-border rounded-lg px-3 py-1.5">
          <span className="text-brand-green">{user?.email}</span>
        </span>
      </div>

      {/* Toast */}
      <AnimatePresence>
        {toast && (
          <motion.div
            className={`mx-4 md:mx-6 mt-3 px-4 py-2.5 rounded-xl font-mono text-xs border flex-shrink-0 ${
              toast.type === 'success'
                ? 'bg-brand-green/10 border-brand-green/30 text-brand-green'
                : 'bg-red-950 border-red-800 text-red-400'
            }`}
            initial={{ opacity: 0, y: -6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
          >
            {toast.text}
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── DESKTOP: 3-column layout ───────────────────────────────────────── */}
      <div className="hidden md:flex flex-1 overflow-hidden">
        <div className="w-44 flex-shrink-0 border-r border-brand-border overflow-y-auto">
          <ExchangeList />
        </div>
        <div className="w-56 flex-shrink-0 border-r border-brand-border flex flex-col overflow-hidden">
          {!selectedEx ? (
            <div className="flex-1 flex items-center justify-center p-4">
              <p className="font-mono text-[10px] text-brand-muted tracking-widest text-center">
                SELECT AN EXCHANGE TO SEE LISTED COINS
              </p>
            </div>
          ) : (
            <CoinList />
          )}
        </div>
        <div className="flex-1 overflow-hidden">
          <FeeEditor />
        </div>
      </div>

      {/* ── MOBILE: step-based single-panel view ──────────────────────────── */}
      <div className="md:hidden flex-1 overflow-hidden">
        {mobileStep === 0 && <ExchangeList />}
        {mobileStep === 1 && <CoinList />}
        {mobileStep === 2 && <FeeEditor />}
      </div>
    </div>
  );
}