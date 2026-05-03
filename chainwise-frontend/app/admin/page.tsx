'use client';

import { useState, useEffect } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { useRouter } from 'next/navigation';
import { Plus, Pencil, Trash2, Save, X, ShieldAlert, RefreshCw, AlertCircle } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

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

interface Coin { symbol: string; networks: Network[]; }

interface Exchange {
  _id: string;
  exchange: string;
  displayName: string;
  p2p: boolean;
  p2pMinUSD: number | null;
  p2pCountries: string[];
  coins: Coin[];
  lastUpdated: string;
}

const EMPTY_NETWORK = {
  chain: '', chainId: '', withdrawFee: 0, withdrawFeeUSD: 0,
  minWithdraw: 0, minDeposit: 0, depositFee: 0, arrivalMins: 1,
};

const ADMIN_EMAIL = process.env.NEXT_PUBLIC_ADMIN_EMAIL || 'yobra194@gmail.com';

export default function AdminPage() {
  const { user, isAuthenticated, loading, getToken } = useAuth();
  const router = useRouter();

  const [exchanges, setExchanges]           = useState<Exchange[]>([]);
  const [selectedEx, setSelectedEx]         = useState<string>('');
  const [selectedCoin, setSelectedCoin]     = useState<string>('');
  const [dataLoading, setDataLoading]       = useState(false);
  const [fetchError, setFetchError]         = useState<string | null>(null);
  const [saving, setSaving]                 = useState(false);
  const [toast, setToast]                   = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [editingNetwork, setEditingNetwork] = useState<(Network & { _original: string }) | null>(null);
  const [addingNetwork, setAddingNetwork]   = useState(false);
  const [newNetwork, setNewNetwork]         = useState({ ...EMPTY_NETWORK });

  const isAdmin = !!user?.email &&
    user.email.toLowerCase() === ADMIN_EMAIL.toLowerCase();

  // ── Auth guard ────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!loading && !isAuthenticated) router.push('/login');
  }, [loading, isAuthenticated]);

  // ── Load data once we know the user is admin ──────────────────────────────
  useEffect(() => {
    if (!loading && isAuthenticated && user) {
      if (isAdmin) {
        loadData();
      }
    }
  }, [loading, isAuthenticated, user]);

  const showToast = (type: 'success' | 'error', text: string) => {
    setToast({ type, text });
    setTimeout(() => setToast(null), 4000);
  };

  // ── Fetch all exchange fee data ───────────────────────────────────────────
  const loadData = async () => {
    setDataLoading(true);
    setFetchError(null);
    try {
      const token = await getToken();
      if (!token) throw new Error('No auth token — are you signed in?');

      const res = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL}/api/admin/fees`,
        { headers: { Authorization: `Bearer ${token}` } }
      );

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data?.error?.message || `HTTP ${res.status}`);
      }

      if (!data.success) {
        throw new Error(data?.error?.message || 'API returned success:false');
      }

      setExchanges(data.data || []);
      if (data.data?.length > 0 && !selectedEx) {
        setSelectedEx(data.data[0].exchange);
      }
    } catch (err: any) {
      const msg = err.message || 'Failed to load fee data';
      setFetchError(msg);
      console.error('[Admin loadData]', err);
    } finally {
      setDataLoading(false);
    }
  };

  // ── Save edited network ───────────────────────────────────────────────────
  const saveEdit = async () => {
    if (!editingNetwork) return;
    setSaving(true);
    try {
      const token = await getToken();
      const res = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL}/api/admin/fees/${selectedEx}/${selectedCoin}/${encodeURIComponent(editingNetwork._original)}`,
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
      if (!res.ok || !data.success) throw new Error(data?.error?.message || 'Update failed');
      showToast('success', `✓ Updated ${editingNetwork.chain} on ${selectedEx.toUpperCase()}`);
      setEditingNetwork(null);
      await loadData();
    } catch (err: any) {
      showToast('error', err.message);
    } finally {
      setSaving(false);
    }
  };

  // ── Add new network ───────────────────────────────────────────────────────
  const saveNewNetwork = async () => {
    if (!newNetwork.chain.trim() || !newNetwork.chainId.trim()) {
      showToast('error', 'Chain name and Chain ID are required');
      return;
    }
    setSaving(true);
    try {
      const token = await getToken();
      const res = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL}/api/admin/fees/${selectedEx}/${selectedCoin}/networks`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify({ ...newNetwork, isActive: true }),
        }
      );
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data?.error?.message || 'Add failed');
      showToast('success', `✓ Added ${newNetwork.chain} to ${selectedCoin} on ${selectedEx.toUpperCase()}`);
      setAddingNetwork(false);
      setNewNetwork({ ...EMPTY_NETWORK });
      await loadData();
    } catch (err: any) {
      showToast('error', err.message);
    } finally {
      setSaving(false);
    }
  };

  // ── Delete network ────────────────────────────────────────────────────────
  const deleteNetwork = async (chain: string) => {
    if (!confirm(`Delete "${chain}" from ${selectedCoin} on ${selectedEx}? This cannot be undone.`)) return;
    try {
      const token = await getToken();
      const res = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL}/api/admin/fees/${selectedEx}/${selectedCoin}/${encodeURIComponent(chain)}`,
        { method: 'DELETE', headers: { Authorization: `Bearer ${token}` } }
      );
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data?.error?.message || 'Delete failed');
      showToast('success', `✓ Deleted ${chain}`);
      await loadData();
    } catch (err: any) {
      showToast('error', err.message);
    }
  };

  const currentExchange = exchanges.find(e => e.exchange === selectedEx);
  const currentCoins    = currentExchange?.coins || [];
  const currentNetworks = currentCoins.find(c => c.symbol === selectedCoin)?.networks || [];

  // ── Loading / access denied states ───────────────────────────────────────
  if (loading) {
    return (
      <div className="h-full flex items-center justify-center">
        <div className="font-mono text-xs text-brand-muted animate-pulse tracking-widest">CHECKING AUTH...</div>
      </div>
    );
  }

  if (!isAuthenticated) return null; // middleware redirects

  if (!isAdmin) {
    return (
      <div className="h-full flex items-center justify-center">
        <div className="text-center space-y-3">
          <ShieldAlert className="w-12 h-12 text-red-400 mx-auto" />
          <p className="font-mono text-sm text-red-400 font-bold">ACCESS DENIED</p>
          <p className="font-mono text-xs text-brand-muted">
            Admin access is restricted to: <span className="text-brand-text">{ADMIN_EMAIL}</span>
          </p>
          <p className="font-mono text-xs text-brand-muted">
            Signed in as: <span className="text-red-400">{user?.email}</span>
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full overflow-y-auto px-6 py-6">
      <div className="max-w-6xl mx-auto">

        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="font-mono font-bold text-2xl text-brand-green tracking-[0.15em]">
              ADMIN — FEE MANAGER
            </h1>
            <p className="font-mono text-xs text-brand-muted mt-1 tracking-widest">
              MANAGE WITHDRAWAL FEES AND DEPOSIT MINIMUMS PER EXCHANGE
            </p>
          </div>
          <div className="flex items-center gap-3">
            <span className="font-mono text-xs text-brand-muted border border-brand-border rounded-lg px-3 py-2">
              <span className="text-brand-green">{user?.email}</span>
            </span>
            <button
              onClick={loadData}
              disabled={dataLoading}
              className="flex items-center gap-1.5 font-mono text-xs text-brand-muted hover:text-brand-green border border-brand-border hover:border-brand-dim rounded-lg px-3 py-2 transition-all disabled:opacity-50"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${dataLoading ? 'animate-spin' : ''}`} />
              Refresh
            </button>
          </div>
        </div>

        {/* Toast notification */}
        <AnimatePresence>
          {toast && (
            <motion.div
              className={`mb-4 px-4 py-3 rounded-xl font-mono text-xs border flex items-center gap-2 ${
                toast.type === 'success'
                  ? 'bg-brand-green/10 border-brand-green/30 text-brand-green'
                  : 'bg-red-950 border-red-800 text-red-400'
              }`}
              initial={{ opacity: 0, y: -8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
            >
              {toast.text}
            </motion.div>
          )}
        </AnimatePresence>

        {/* Error state */}
        {fetchError && (
          <div className="mb-4 px-4 py-4 rounded-xl bg-red-950/50 border border-red-800 flex items-start gap-3">
            <AlertCircle className="w-4 h-4 text-red-400 flex-shrink-0 mt-0.5" />
            <div>
              <p className="font-mono text-xs text-red-400 font-bold">Failed to load fee data</p>
              <p className="font-mono text-xs text-red-400/70 mt-1">{fetchError}</p>
              <div className="mt-2 space-y-1 font-mono text-[11px] text-red-400/60">
                <p>• Is the backend running? <span className="text-red-300">cd backend && npm run dev</span></p>
                <p>• Is SUPABASE_SERVICE_ROLE_KEY set in backend .env?</p>
                <p>• Is ADMIN_EMAILS set to your email in backend .env?</p>
              </div>
              <button
                onClick={loadData}
                className="mt-3 flex items-center gap-1.5 font-mono text-xs text-red-400 hover:text-red-300 border border-red-800 hover:border-red-600 rounded-lg px-3 py-1.5 transition-all"
              >
                <RefreshCw className="w-3 h-3" /> Try again
              </button>
            </div>
          </div>
        )}

        {/* Loading skeleton */}
        {dataLoading && !fetchError && (
          <div className="grid grid-cols-12 gap-4">
            <div className="col-span-3 space-y-2">
              {[1, 2, 3, 4, 5, 6].map(i => (
                <div key={i} className="h-10 bg-brand-surface border border-brand-border rounded-lg animate-pulse" />
              ))}
            </div>
            <div className="col-span-9">
              <div className="h-64 bg-brand-surface border border-brand-border rounded-xl animate-pulse" />
            </div>
          </div>
        )}

        {/* Main content */}
        {!dataLoading && !fetchError && (
          <div className="grid grid-cols-12 gap-4">

            {/* Left panel — exchange + coin selector */}
            <div className="col-span-3 space-y-3">

              {/* Exchange list */}
              <div className="bg-brand-surface border border-brand-border rounded-xl overflow-hidden">
                <div className="px-4 py-3 border-b border-brand-border bg-[rgba(0,0,0,0.2)]">
                  <h3 className="font-mono text-[10px] text-brand-muted tracking-widest">EXCHANGE</h3>
                </div>
                {exchanges.length === 0 ? (
                  <div className="px-4 py-4 font-mono text-xs text-red-400">
                    No exchanges found. Is the backend running and seeded?
                    <br />
                    <span className="text-[10px] text-brand-muted mt-1 block">
                      Run: <code className="text-brand-green">node scripts/seedFees.js</code>
                    </span>
                  </div>
                ) : (
                  <div className="divide-y divide-brand-border/50">
                    {exchanges.map(ex => (
                      <button
                        key={ex.exchange}
                        onClick={() => {
                          setSelectedEx(ex.exchange);
                          setSelectedCoin('');
                          setEditingNetwork(null);
                          setAddingNetwork(false);
                        }}
                        className={`w-full px-4 py-3 text-left transition-colors ${
                          selectedEx === ex.exchange
                            ? 'bg-[rgba(0,255,136,0.08)] text-brand-green border-l-2 border-brand-green'
                            : 'text-brand-muted hover:text-brand-text hover:bg-[rgba(255,255,255,0.02)]'
                        }`}
                      >
                        <div className="font-mono text-xs">{ex.displayName}</div>
                        <div className="font-mono text-[10px] opacity-50 mt-0.5">
                          {ex.coins?.length || 0} coins
                        </div>
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* Coin list */}
              {currentExchange && currentCoins.length > 0 && (
                <div className="bg-brand-surface border border-brand-border rounded-xl overflow-hidden">
                  <div className="px-4 py-3 border-b border-brand-border bg-[rgba(0,0,0,0.2)]">
                    <h3 className="font-mono text-[10px] text-brand-muted tracking-widest">COIN</h3>
                  </div>
                  <div className="divide-y divide-brand-border/50">
                    {currentCoins.map(coin => (
                      <button
                        key={coin.symbol}
                        onClick={() => {
                          setSelectedCoin(coin.symbol);
                          setEditingNetwork(null);
                          setAddingNetwork(false);
                        }}
                        className={`w-full px-4 py-3 text-left transition-colors ${
                          selectedCoin === coin.symbol
                            ? 'bg-[rgba(0,255,136,0.08)] text-brand-green border-l-2 border-brand-green'
                            : 'text-brand-muted hover:text-brand-text hover:bg-[rgba(255,255,255,0.02)]'
                        }`}
                      >
                        <div className="font-mono text-xs">{coin.symbol}</div>
                        <div className="font-mono text-[10px] opacity-50 mt-0.5">
                          {coin.networks.length} networks
                        </div>
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Right panel — network table */}
            <div className="col-span-9">
              {!selectedCoin ? (
                <div className="bg-brand-surface border border-brand-border rounded-xl flex flex-col items-center justify-center h-64 gap-3">
                  <div className="text-3xl opacity-20">💱</div>
                  <p className="font-mono text-xs text-brand-muted tracking-widest">
                    SELECT AN EXCHANGE AND COIN TO EDIT FEES
                  </p>
                </div>
              ) : (
                <div className="bg-brand-surface border border-brand-border rounded-xl overflow-hidden">

                  {/* Table header */}
                  <div className="flex items-center justify-between px-4 py-3 border-b border-brand-border bg-[rgba(0,0,0,0.2)]">
                    <h3 className="font-mono text-xs text-brand-green tracking-widest font-bold">
                      {currentExchange?.displayName} · {selectedCoin} · {currentNetworks.length} NETWORKS
                    </h3>
                    <button
                      onClick={() => { setAddingNetwork(true); setEditingNetwork(null); }}
                      className="flex items-center gap-1.5 font-mono text-xs text-brand-green hover:bg-brand-green/10 border border-brand-green/30 hover:border-brand-green/60 rounded-lg px-3 py-1.5 transition-all"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      Add Chain
                    </button>
                  </div>

                  {/* Column headers */}
                  <div className="grid grid-cols-8 gap-2 px-4 py-2.5 border-b border-brand-border bg-[rgba(0,0,0,0.15)]">
                    {['Chain', 'Chain ID', 'Withdraw Fee', 'Fee USD', 'Min Withdraw', 'Min Deposit', 'ETA (min)', 'Actions'].map(h => (
                      <div key={h} className="font-mono text-[9px] text-brand-muted tracking-widest uppercase">{h}</div>
                    ))}
                  </div>

                  {/* Network rows */}
                  <div className="divide-y divide-brand-border/40">
                    {currentNetworks.map((network, i) => (
                      <div key={`${network.chain}-${i}`}>
                        {editingNetwork?._original === network.chain ? (
                          // Edit row
                          <div className="grid grid-cols-8 gap-2 px-4 py-3 bg-[rgba(0,255,136,0.04)] items-center">
                            <div className="font-mono text-xs text-brand-green font-bold truncate">
                              {network.chain}
                            </div>
                            <div className="font-mono text-[10px] text-brand-muted truncate">
                              {network.chainId}
                            </div>
                            {(['withdrawFee', 'withdrawFeeUSD', 'minWithdraw', 'minDeposit', 'arrivalMins'] as const).map(field => (
                              <input
                                key={field}
                                type="number"
                                step="any"
                                min="0"
                                value={(editingNetwork as any)[field]}
                                onChange={e => setEditingNetwork(prev =>
                                  prev ? { ...prev, [field]: parseFloat(e.target.value) || 0 } : null
                                )}
                                className="w-full bg-brand-bg border border-brand-dim rounded-lg px-2 py-1.5 font-mono text-xs text-brand-text outline-none focus:border-brand-green transition-colors"
                              />
                            ))}
                            <div className="flex gap-1">
                              <button
                                onClick={saveEdit}
                                disabled={saving}
                                className="flex items-center gap-1 px-2 py-1.5 rounded-lg bg-brand-green text-black font-mono text-[10px] font-bold hover:bg-brand-dim disabled:opacity-50 transition-all"
                              >
                                <Save className="w-3 h-3" />
                                {saving ? '...' : 'Save'}
                              </button>
                              <button
                                onClick={() => setEditingNetwork(null)}
                                className="p-1.5 rounded-lg border border-brand-border text-brand-muted hover:text-brand-text transition-colors"
                              >
                                <X className="w-3 h-3" />
                              </button>
                            </div>
                          </div>
                        ) : (
                          // Display row
                          <div className="grid grid-cols-8 gap-2 px-4 py-3 items-center hover:bg-[rgba(255,255,255,0.01)] transition-colors group">
                            <div className="font-mono text-xs text-brand-text truncate">{network.chain}</div>
                            <div className="font-mono text-[10px] text-brand-muted truncate">{network.chainId}</div>
                            <div className={`font-mono text-xs font-bold ${network.withdrawFee === 0 ? 'text-brand-green' : 'text-brand-text'}`}>
                              {network.withdrawFee === 0 ? '🆓 FREE' : network.withdrawFee}
                            </div>
                            <div className="font-mono text-[11px] text-brand-muted">
                              {network.withdrawFeeUSD != null ? `$${network.withdrawFeeUSD}` : '—'}
                            </div>
                            <div className="font-mono text-[11px] text-brand-muted">{network.minWithdraw}</div>
                            <div className="font-mono text-[11px] text-brand-muted">{network.minDeposit}</div>
                            <div className="font-mono text-[11px] text-brand-muted">{network.arrivalMins}m</div>
                            <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                              <button
                                onClick={() => setEditingNetwork({ ...network, _original: network.chain })}
                                className="p-1.5 rounded-lg border border-brand-border text-brand-muted hover:text-brand-green hover:border-brand-green/40 transition-all"
                                title="Edit fees"
                              >
                                <Pencil className="w-3 h-3" />
                              </button>
                              <button
                                onClick={() => deleteNetwork(network.chain)}
                                className="p-1.5 rounded-lg border border-brand-border text-brand-muted hover:text-red-400 hover:border-red-500/40 transition-all"
                                title="Delete chain"
                              >
                                <Trash2 className="w-3 h-3" />
                              </button>
                            </div>
                          </div>
                        )}
                      </div>
                    ))}

                    {/* Add new chain form */}
                    {addingNetwork && (
                      <div className="px-4 py-5 bg-[rgba(0,255,136,0.03)] border-t-2 border-brand-green/20">
                        <p className="font-mono text-[10px] text-brand-green tracking-widest mb-4">
                          ✦ NEW CHAIN — {selectedCoin} on {currentExchange?.displayName}
                        </p>
                        <div className="grid grid-cols-4 gap-3 mb-4">
                          {[
                            { key: 'chain',          label: 'Chain Name *',     placeholder: 'e.g. Arbitrum One',  type: 'text'   },
                            { key: 'chainId',        label: 'Chain ID *',       placeholder: 'e.g. arbitrum',      type: 'text'   },
                            { key: 'withdrawFee',    label: 'Withdraw Fee',     placeholder: '0',                  type: 'number' },
                            { key: 'withdrawFeeUSD', label: 'Fee (USD approx)', placeholder: '0.00',               type: 'number' },
                            { key: 'minWithdraw',    label: 'Min Withdraw',     placeholder: '1',                  type: 'number' },
                            { key: 'minDeposit',     label: 'Min Deposit',      placeholder: '1',                  type: 'number' },
                            { key: 'depositFee',     label: 'Deposit Fee',      placeholder: '0',                  type: 'number' },
                            { key: 'arrivalMins',    label: 'Arrival (mins)',   placeholder: '1',                  type: 'number' },
                          ].map(({ key, label, placeholder, type }) => (
                            <div key={key}>
                              <label className="font-mono text-[10px] text-brand-muted block mb-1.5 tracking-wider">
                                {label}
                              </label>
                              <input
                                type={type}
                                step="any"
                                min="0"
                                placeholder={placeholder}
                                value={(newNetwork as any)[key]}
                                onChange={e => setNewNetwork(prev => ({
                                  ...prev,
                                  [key]: type === 'text' ? e.target.value : (parseFloat(e.target.value) || 0),
                                }))}
                                className="w-full bg-brand-bg border border-brand-border rounded-lg px-3 py-2 font-mono text-xs text-brand-text placeholder:text-brand-muted/50 outline-none focus:border-brand-dim transition-colors"
                              />
                            </div>
                          ))}
                        </div>
                        <div className="flex gap-2">
                          <button
                            onClick={saveNewNetwork}
                            disabled={saving}
                            className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-gradient-to-r from-brand-green to-brand-blue text-black font-mono text-xs font-bold disabled:opacity-50 hover:shadow-[0_0_15px_rgba(0,255,136,0.3)] transition-all"
                          >
                            <Save className="w-3.5 h-3.5" />
                            {saving ? 'Saving...' : 'Add Chain'}
                          </button>
                          <button
                            onClick={() => { setAddingNetwork(false); setNewNetwork({ ...EMPTY_NETWORK }); }}
                            className="flex items-center gap-1.5 px-4 py-2 rounded-lg border border-brand-border font-mono text-xs text-brand-muted hover:text-brand-text transition-colors"
                          >
                            <X className="w-3.5 h-3.5" />
                            Cancel
                          </button>
                        </div>
                      </div>
                    )}

                    {currentNetworks.length === 0 && !addingNetwork && (
                      <div className="px-4 py-10 text-center">
                        <p className="font-mono text-xs text-brand-muted">
                          No chains added for {selectedCoin} on {currentExchange?.displayName} yet.
                        </p>
                        <button
                          onClick={() => setAddingNetwork(true)}
                          className="mt-3 font-mono text-xs text-brand-green hover:underline"
                        >
                          + Add the first chain
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}