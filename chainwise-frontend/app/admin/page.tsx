'use client';

import { useState, useEffect, useRef } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { useRouter } from 'next/navigation';
import {
  Plus, Pencil, Trash2, Save, ShieldAlert, Search,
  ChevronRight, AlertCircle, ArrowLeft,
  Coins, Info, RefreshCw, ExternalLink,
  Globe, X, CheckCircle
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
  website?: string;
  twitterHandle?: string;
  p2p?: boolean;
  p2pCountries?: string[];
  coins: DbCoin[];
  lastUpdated: string;
  dataSource?: string;
}

interface CgExchangeInfo {
  name: string;
  website: string;
  twitterHandle: string;
  description: string;
  country: string;
  yearEstablished: number;
  image: string;
  trustScore: number;
  trustScoreRank: number;
  centralized: boolean;
  totalCoins: number;
  totalPairs: number;
  volume24hBTC: number;
}

interface P2PStats {
  p2pCountries: string[];
  minAmountFiat: number | null;
  totalAds: number;
}

interface ExchangeInfoData {
  db: DbExchange;
  coingecko: CgExchangeInfo | null;
  cgError: string | null;
  p2pStats?: P2PStats;
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

type MobileStep = 0 | 1 | 2;
type RightPanel = 'fees' | 'info';

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
  const [dbLoading,        setDbLoading]        = useState(true);
  const [existingNetworks, setExistingNetworks] = useState<Network[]>([]);
  const [editingNetwork,   setEditingNetwork]   = useState<EditingNetwork | null>(null);
  const [addingNetwork,    setAddingNetwork]    = useState(false);
  const [newNetwork,       setNewNetwork]       = useState({ ...EMPTY_NETWORK });
  const [saving,           setSaving]           = useState(false);
  const [toast,            setToast]            = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [fetchError,       setFetchError]       = useState<string | null>(null);
  const [mobileStep,       setMobileStep]       = useState<MobileStep>(0);
  const [rightPanel,       setRightPanel]       = useState<RightPanel>('fees');

  const [exInfo,           setExInfo]           = useState<ExchangeInfoData | null>(null);
  const [exInfoLoading,    setExInfoLoading]    = useState(false);
  const [exInfoForm,       setExInfoForm]       = useState({
    displayName: '', website: '', twitterHandle: '',
    p2p: false, p2pCountries: '',
  });
  const [savingInfo,       setSavingInfo]       = useState(false);

  const searchRef = useRef<HTMLInputElement>(null);
  const isAdmin   = !!user?.email && user.email.toLowerCase() === ADMIN_EMAIL.toLowerCase();

  const exchanges = dbExchanges
    .map(ex => ({ key: ex.exchange, label: ex.displayName }))
    .sort((a, b) => a.label.localeCompare(b.label));

  useEffect(() => {
    if (!loading && !isAuthenticated) router.push('/login');
  }, [loading, isAuthenticated, router]);

  useEffect(() => {
    if (!loading && isAuthenticated && isAdmin && dbExchanges.length === 0) {
      loadDbExchanges();
    }
  }, [loading, isAuthenticated, isAdmin, dbExchanges.length]);

  const loadDbExchanges = async () => {
    setDbLoading(true);
    try {
      const token = await getToken();
      const res   = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/admin/fees`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (data.success) setDbExchanges(data.data || []);
    } catch (err: unknown) {
      if (err instanceof Error) setFetchError(err.message);
    } finally {
      setDbLoading(false);
    }
  };

  const loadExchangeInfo = async (exKey: string) => {
    setExInfoLoading(true);
    setExInfo(null);
    try {
      const token = await getToken();
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/admin/fees/${exKey}/info`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();

      if (data.success && data.data) {
        setExInfo(data.data);
        const db = data.data.db || data.data;
        setExInfoForm({
          displayName:   db.displayName   || '',
          website:       db.website       || '',
          twitterHandle: db.twitterHandle || '',
          p2p:           db.p2p           || false,
          p2pCountries:  (db.p2pCountries || []).join(', '),
        });
      } else {
        throw new Error(data?.error?.message || 'Failed to load info');
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to load exchange info';
      showToast('error', message);
    } finally {
      setExInfoLoading(false);
    }
  };

  const enrichFromCoinGecko = async () => {
    setSavingInfo(true);
    try {
      const token = await getToken();
      const res   = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL}/api/admin/fees/${selectedEx}/enrich`,
        { method: 'POST', headers: { Authorization: `Bearer ${token}` } }
      );
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data?.error?.message);
      showToast('success', 'Enriched from CoinGecko and saved to DB');
      await loadExchangeInfo(selectedEx);
    } catch (err: unknown) {
      showToast('error', err instanceof Error ? err.message : 'Enrich failed');
    } finally {
      setSavingInfo(false);
    }
  };

  const autoFillFromCoinGecko = () => {
    if (!exInfo?.coingecko) return;
    const cg = exInfo.coingecko;
    setExInfoForm(prev => ({
      ...prev,
      displayName:   cg.name          || prev.displayName,
      website:       cg.website       || prev.website,
      twitterHandle: cg.twitterHandle || prev.twitterHandle,
    }));
    showToast('success', 'Auto-filled from CoinGecko — review and save');
  };

  const saveExchangeInfo = async () => {
    setSavingInfo(true);
    try {
      const token = await getToken();
      const res = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL}/api/admin/fees/${selectedEx}`,
        {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify({
            displayName:   exInfoForm.displayName,
            website:       exInfoForm.website,
            twitterHandle: exInfoForm.twitterHandle,
            p2p:           exInfoForm.p2p,
            p2pCountries:  exInfoForm.p2pCountries
              .split(',').map(s => s.trim().toUpperCase()).filter(Boolean),
          }),
        }
      );
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data?.error?.message);
      showToast('success', `${exInfoForm.displayName} info updated`);
      await loadDbExchanges();
      await loadExchangeInfo(selectedEx);
    } catch (err: unknown) {
      showToast('error', err instanceof Error ? err.message : 'Save failed');
    } finally {
      setSavingInfo(false);
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
    setRightPanel('fees');

    const [tickerResult] = await Promise.all([
      fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/fees/${exKey}/coins?page=${page}`)
        .then(r => r.json()).catch(() => ({ success: false, error: { message: 'Network error' } })),
      loadExchangeInfo(exKey),
    ]);

    if (!tickerResult.success) {
      setFetchError(tickerResult?.error?.message || 'Failed to load coins');
      setCgCoins([]);
    } else {
      setCgCoins(tickerResult.data?.coins || []);
    }
    setCgLoading(false);
    setTimeout(() => searchRef.current?.focus(), 100);
  };

  const selectCoin = (coin: CgCoin) => {
    setSelectedCoin(coin);
    setAddingNetwork(false);
    setEditingNetwork(null);
    setMobileStep(2);
    setRightPanel('fees');

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
      showToast('success', `Updated ${editingNetwork.chain}`);
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
      showToast('success', `Added ${newNetwork.chain} for ${selectedCoin.symbol}`);
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
      showToast('success', `Deleted ${chain}`);
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

  const currentExLabel = exchanges.find(e => e.key === selectedEx)?.label ?? selectedEx.toUpperCase();

  if (loading) {
    return (
      <div className="h-full flex items-center justify-center bg-gray-50 dark:bg-gray-950">
        <p className="font-mono text-xs text-gray-500 dark:text-gray-400 animate-pulse tracking-widest">CHECKING AUTH...</p>
      </div>
    );
  }

  if (!isAdmin) {
    return (
      <div className="h-full flex items-center justify-center px-4 bg-gray-50 dark:bg-gray-950">
        <div className="text-center space-y-3">
          <ShieldAlert className="w-10 h-10 text-red-500 dark:text-red-400 mx-auto" />
          <p className="font-mono text-sm text-red-600 dark:text-red-400 font-bold">ACCESS DENIED</p>
          <p className="font-mono text-xs text-gray-500 dark:text-gray-400">
            Signed in as <span className="text-red-600 dark:text-red-400">{user?.email}</span>
          </p>
        </div>
      </div>
    );
  }

  // ── Exchange Info Panel ───────────────────────────────────────────────────
  const ExchangeInfoPanel = () => (
    <div className="h-full overflow-y-auto p-4 md:p-5 bg-gray-50 dark:bg-gray-950">
      {exInfoLoading ? (
        <div className="space-y-3">
          {[...Array(5)].map((_, i) => (
            <div key={i} className="h-10 bg-gray-200 dark:bg-gray-800 rounded-lg animate-pulse" />
          ))}
        </div>
      ) : !exInfo ? (
        <div className="h-full flex items-center justify-center">
          <p className="font-mono text-xs text-gray-400 dark:text-gray-600">Select an exchange first</p>
        </div>
      ) : (
        <div className="space-y-6">

          {/* CoinGecko Reference Card */}
          {exInfo.coingecko && (
            <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl p-5">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-3">
                  {exInfo.coingecko.image && (
                    <img
                      src={exInfo.coingecko.image}
                      alt={exInfo.coingecko.name}
                      className="w-10 h-10 rounded-full border border-gray-200 dark:border-gray-700"
                    />
                  )}
                  <div>
                    <p className="font-mono text-sm font-semibold text-gray-900 dark:text-gray-100">
                      {exInfo.coingecko.name}
                    </p>
                    <p className="font-mono text-[10px] text-gray-500 dark:text-gray-400 tracking-widest">
                      COINGECKO DATA
                    </p>
                  </div>
                </div>
                <button
                  onClick={enrichFromCoinGecko}
                  disabled={savingInfo}
                  className="flex items-center gap-1.5 px-4 py-2 rounded-lg border border-emerald-500/40 text-emerald-600 dark:text-emerald-400 font-mono text-xs hover:bg-emerald-50 dark:hover:bg-emerald-900/20 transition-colors disabled:opacity-50"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${savingInfo ? 'animate-spin' : ''}`} />
                  Refresh
                </button>
              </div>

              <div className="grid grid-cols-2 md:grid-cols-3 gap-3 text-sm">
                {[
                  { label: 'Country',     value: exInfo.coingecko.country || '—' },
                  { label: 'Established', value: exInfo.coingecko.yearEstablished || '—' },
                  { label: 'Trust Score', value: `${exInfo.coingecko.trustScore}/10` },
                  { label: 'Rank',        value: `#${exInfo.coingecko.trustScoreRank}` },
                  { label: 'Coins',       value: exInfo.coingecko.totalCoins?.toLocaleString() || '—' },
                  { label: 'Pairs',       value: exInfo.coingecko.totalPairs?.toLocaleString() || '—' },
                  { label: '24h Vol (BTC)', value: exInfo.coingecko.volume24hBTC?.toFixed(0) || '—' },
                  { label: 'Centralized', value: exInfo.coingecko.centralized ? 'Yes' : 'No' },
                ].map(({ label, value }) => (
                  <div key={label} className="bg-gray-50 dark:bg-gray-950 rounded-lg px-3 py-2.5 border border-gray-100 dark:border-gray-800">
                    <p className="font-mono text-[10px] text-gray-500 dark:text-gray-400 tracking-wider">{label}</p>
                    <p className="font-mono text-xs font-medium text-gray-900 dark:text-gray-100 mt-0.5">{value}</p>
                  </div>
                ))}
              </div>

              {exInfo.coingecko.description && (
                <p className="mt-4 text-xs text-gray-600 dark:text-gray-400 leading-relaxed border-t border-gray-100 dark:border-gray-800 pt-4">
                  {exInfo.coingecko.description}
                </p>
              )}
            </div>
          )}

          {exInfo.cgError && (
            <div className="flex items-start gap-2 text-yellow-600 dark:text-yellow-400 bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800/40 rounded-xl px-4 py-3">
              <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
              <p className="font-mono text-sm">{exInfo.cgError}</p>
            </div>
          )}

          {/* Editable Exchange Settings */}
          <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl p-4">
            <p className="font-mono text-[10px] text-gray-500 dark:text-gray-400 tracking-widest mb-4">
              EXCHANGE SETTINGS — {currentExLabel.toUpperCase()}
            </p>

            <div className="space-y-3">
              {/* Display Name */}
              <div>
                <label className="font-mono text-[10px] text-gray-500 dark:text-gray-400 tracking-wider block mb-1.5">
                  DISPLAY NAME
                </label>
                <input
                  type="text"
                  value={exInfoForm.displayName}
                  onChange={e => setExInfoForm(p => ({ ...p, displayName: e.target.value }))}
                  className="w-full bg-gray-50 dark:bg-gray-950 border border-gray-300 dark:border-gray-700 rounded-lg px-3 py-2.5 font-mono text-xs text-gray-900 dark:text-gray-100 outline-none focus:border-emerald-500 transition-colors"
                />
              </div>

              {/* Website */}
              <div>
                <label className="font-mono text-[10px] text-gray-500 dark:text-gray-400 tracking-wider block mb-1.5">
                  WEBSITE
                </label>
                <div className="relative">
                  <Globe className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
                  <input
                    type="text"
                    value={exInfoForm.website}
                    onChange={e => setExInfoForm(p => ({ ...p, website: e.target.value }))}
                    placeholder="https://..."
                    className="w-full bg-gray-50 dark:bg-gray-950 border border-gray-300 dark:border-gray-700 rounded-lg pl-9 pr-3 py-2.5 font-mono text-xs text-gray-900 dark:text-gray-100 outline-none focus:border-emerald-500 transition-colors"
                  />
                </div>
              </div>

              {/* Twitter Handle */}
              <div>
                <label className="font-mono text-[10px] text-gray-500 dark:text-gray-400 tracking-wider block mb-1.5">
                  TWITTER HANDLE
                </label>
                <div className="relative">
                  <X className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
                  <input
                    type="text"
                    value={exInfoForm.twitterHandle}
                    onChange={e => setExInfoForm(p => ({ ...p, twitterHandle: e.target.value }))}
                    placeholder="binance"
                    className="w-full bg-gray-50 dark:bg-gray-950 border border-gray-300 dark:border-gray-700 rounded-lg pl-9 pr-3 py-2.5 font-mono text-xs text-gray-900 dark:text-gray-100 outline-none focus:border-emerald-500 transition-colors"
                  />
                </div>
              </div>

              {/* P2P Toggle */}
              <div className="flex items-center justify-between py-2">
                <div>
                  <p className="font-mono text-xs text-gray-900 dark:text-gray-100">P2P Trading</p>
                  <p className="font-mono text-[10px] text-gray-400 dark:text-gray-500">Has peer-to-peer market</p>
                </div>
                <button
                  onClick={() => setExInfoForm(p => ({ ...p, p2p: !p.p2p }))}
                  className={`w-10 h-5 rounded-full transition-colors relative ${
                    exInfoForm.p2p ? 'bg-emerald-500' : 'bg-gray-300 dark:bg-gray-700'
                  }`}
                >
                  <span className={`absolute top-0.5 w-4 h-4 rounded-full bg-white transition-transform ${
                    exInfoForm.p2p ? 'translate-x-5' : 'translate-x-0.5'
                  }`} />
                </button>
              </div>

              {/* P2P Countries */}
              {exInfoForm.p2p && (
                <div>
                  <label className="font-mono text-[10px] text-gray-500 dark:text-gray-400 tracking-wider block mb-1.5">
                    P2P COUNTRIES <span className="text-gray-400">(comma-separated ISO codes: KE, NG, GH)</span>
                  </label>
                  <input
                    type="text"
                    value={exInfoForm.p2pCountries}
                    onChange={e => setExInfoForm(p => ({ ...p, p2pCountries: e.target.value }))}
                    placeholder="KE, NG, GH, ZA"
                    className="w-full bg-gray-50 dark:bg-gray-950 border border-gray-300 dark:border-gray-700 rounded-lg px-3 py-2.5 font-mono text-xs text-gray-900 dark:text-gray-100 outline-none focus:border-emerald-500 transition-colors"
                  />
                </div>
              )}
            </div>

            {/* Save + links */}
            <div className="flex items-center gap-2 mt-5">
              <button
                onClick={saveExchangeInfo}
                disabled={savingInfo}
                className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-500 text-white font-mono text-xs font-bold disabled:opacity-50 transition-all"
              >
                {savingInfo
                  ? <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                  : <Save className="w-3.5 h-3.5" />
                }
                {savingInfo ? 'Saving...' : 'Save Info'}
              </button>

              {exInfoForm.website && (
                <a
                  href={exInfoForm.website}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-1 px-3 py-2.5 rounded-xl border border-gray-300 dark:border-gray-700 font-mono text-[10px] text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100 transition-colors"
                >
                  <ExternalLink className="w-3 h-3" />
                  Visit
                </a>
              )}

              {exInfoForm.twitterHandle && (
                <a
                  href={`https://twitter.com/${exInfoForm.twitterHandle}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-1 px-3 py-2.5 rounded-xl border border-gray-300 dark:border-gray-700 font-mono text-[10px] text-gray-500 dark:text-gray-400 hover:text-sky-500 transition-colors"
                >
                  <X className="w-3 h-3" />
                  @{exInfoForm.twitterHandle}
                </a>
              )}
            </div>
          </div>

          {/* Live P2P Stats */}
          {exInfo.p2pStats && (
            <div className="bg-emerald-50 dark:bg-emerald-950/50 border border-emerald-200 dark:border-emerald-800 rounded-xl p-4">
              <p className="font-mono text-[10px] text-emerald-600 dark:text-emerald-400 tracking-widest mb-3">LIVE P2P STATS</p>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
                <div>
                  <p className="text-gray-500 text-xs">Supported Countries</p>
                  <p className="font-medium mt-1">{(exInfo.p2pStats.p2pCountries || []).join(', ') || 'None'}</p>
                </div>
                <div>
                  <p className="text-gray-500 text-xs">Minimum Amount</p>
                  <p className="font-medium mt-1">
                    {exInfo.p2pStats.minAmountFiat ? `~$${exInfo.p2pStats.minAmountFiat}` : '—'}
                  </p>
                </div>
                <div>
                  <p className="text-gray-500 text-xs">Recent Ads</p>
                  <p className="font-medium mt-1">{exInfo.p2pStats.totalAds}</p>
                </div>
              </div>
            </div>
          )}

          {/* DB Meta */}
          <div className="font-mono text-[10px] text-gray-400 dark:text-gray-600 space-y-1 px-1">
            <p>Last updated: {exInfo.db?.lastUpdated ? new Date(exInfo.db.lastUpdated).toLocaleString() : '—'}</p>
            <p>Data source: {exInfo.db?.dataSource || 'manual'}</p>
            <p>Coins in DB: {exInfo.db?.coins?.length ?? 0}</p>
          </div>

        </div>
      )}
    </div>
  );

  // ── Exchange List ─────────────────────────────────────────────────────────
  const ExchangeList = () => (
    <div className="h-full flex flex-col overflow-hidden bg-white dark:bg-gray-900">
      <div className="px-4 py-3 border-b border-gray-200 dark:border-gray-800 flex-shrink-0">
        <p className="font-mono text-[9px] text-gray-500 dark:text-gray-400 tracking-widest">
          EXCHANGES {!dbLoading && `(${exchanges.length})`}
        </p>
      </div>
      <div className="flex-1 overflow-y-auto">
        {dbLoading ? (
          <div className="p-4 space-y-2">
            {[...Array(8)].map((_, i) => (
              <div key={i} className="h-12 bg-gray-100 dark:bg-gray-800 rounded-lg animate-pulse" />
            ))}
          </div>
        ) : exchanges.length === 0 ? (
          <div className="p-4">
            <p className="font-mono text-[10px] text-gray-400 dark:text-gray-600 tracking-widest text-center">
              NO EXCHANGES IN DB
            </p>
          </div>
        ) : (
          exchanges.map(ex => (
            <button
              key={ex.key}
              onClick={() => selectExchange(ex.key)}
              className={`
                w-full flex items-center justify-between px-4 py-4 text-left
                border-b border-gray-100 dark:border-gray-800/50 transition-none
                ${selectedEx === ex.key
                  ? 'bg-emerald-50 dark:bg-emerald-900/20 text-emerald-600 dark:text-emerald-400 border-l-2 border-l-emerald-500'
                  : 'text-gray-600 dark:text-gray-400 bg-transparent'
                }
              `}
            >
              <span className="font-mono text-sm md:text-xs">{ex.label}</span>
              <ChevronRight className="w-4 h-4 md:w-3 md:h-3" />
            </button>
          ))
        )}
      </div>
    </div>
  );

  // ── Coin List ─────────────────────────────────────────────────────────────
  const CoinList = () => (
    <div className="h-full flex flex-col overflow-hidden bg-white dark:bg-gray-900">
      <div className="md:hidden px-4 py-3 border-b border-gray-200 dark:border-gray-800 flex items-center gap-3 flex-shrink-0">
        <button onClick={() => setMobileStep(0)} className="text-gray-500 dark:text-gray-400">
          <ArrowLeft className="w-4 h-4" />
        </button>
        <span className="font-mono text-xs text-emerald-600 dark:text-emerald-400 font-bold">{currentExLabel}</span>
      </div>

      {selectedEx && (
        <div className="flex border-b border-gray-200 dark:border-gray-800 flex-shrink-0">
          <button
            onClick={() => setRightPanel('fees')}
            className={`flex-1 py-2.5 font-mono text-[10px] tracking-widest transition-colors ${
              rightPanel === 'fees'
                ? 'text-emerald-600 dark:text-emerald-400 border-b-2 border-emerald-500'
                : 'text-gray-400 dark:text-gray-600'
            }`}
          >
            FEES
          </button>
          <button
            onClick={() => setRightPanel('info')}
            className={`flex-1 py-2.5 font-mono text-[10px] tracking-widest transition-colors ${
              rightPanel === 'info'
                ? 'text-emerald-600 dark:text-emerald-400 border-b-2 border-emerald-500'
                : 'text-gray-400 dark:text-gray-600'
            }`}
          >
            INFO
          </button>
        </div>
      )}

      <div className="p-3 border-b border-gray-200 dark:border-gray-800 flex-shrink-0">
        <div className="flex items-center gap-2 bg-gray-50 dark:bg-gray-950 border border-gray-200 dark:border-gray-800 rounded-lg px-3 py-2">
          <Search className="w-3.5 h-3.5 text-gray-400 dark:text-gray-500 flex-shrink-0" />
          <input
            ref={searchRef}
            type="text"
            value={cgSearch}
            onChange={e => setCgSearch(e.target.value)}
            placeholder="Search coin..."
            className="flex-1 bg-transparent font-mono text-xs text-gray-900 dark:text-gray-100 placeholder:text-gray-400 dark:placeholder:text-gray-600 outline-none"
          />
          {cgSearch && (
            <button onClick={() => setCgSearch('')} className="text-gray-400 dark:text-gray-500">
              <X className="w-3 h-3" />
            </button>
          )}
        </div>
        {cgCoins.length > 0 && (
          <p className="font-mono text-[9px] text-gray-500 dark:text-gray-400 mt-1.5 tracking-widest">
            {filteredCoins.length} / {cgCoins.length} COINS
          </p>
        )}
      </div>

      <div className="flex-1 overflow-y-auto">
        {cgLoading ? (
          <div className="p-4 space-y-2">
            {[...Array(8)].map((_, i) => (
              <div key={i} className="h-12 bg-gray-100 dark:bg-gray-800 rounded-lg animate-pulse" />
            ))}
          </div>
        ) : fetchError ? (
          <div className="p-4">
            <div className="flex items-start gap-2 text-red-500 dark:text-red-400">
              <AlertCircle className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
              <p className="font-mono text-xs">{fetchError}</p>
            </div>
            <button onClick={() => selectExchange(selectedEx)} className="mt-2 font-mono text-[10px] text-emerald-600 dark:text-emerald-400 underline">
              Retry
            </button>
          </div>
        ) : filteredCoins.length === 0 ? (
          <p className="p-4 font-mono text-xs text-gray-500 dark:text-gray-400">No coins found.</p>
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
                  border-b border-gray-100 dark:border-gray-800/40 text-left transition-none
                  ${selectedCoin?.symbol === coin.symbol
                    ? 'bg-emerald-50 dark:bg-emerald-900/20 border-l-2 border-l-emerald-500'
                    : 'bg-transparent'
                  }
                `}
              >
                <div>
                  <div className="font-mono text-xs font-bold text-gray-900 dark:text-gray-100">{coin.symbol}</div>
                  <div className="font-mono text-[9px] text-gray-500 dark:text-gray-500 truncate max-w-[140px]">{coin.name}</div>
                </div>
                {hasData ? (
                  <span className="font-mono text-[9px] text-emerald-600 dark:text-emerald-400 bg-emerald-100 dark:bg-emerald-900/30 border border-emerald-200 dark:border-emerald-800/50 rounded px-1.5 py-0.5">
                    IN DB
                  </span>
                ) : (
                  <span className="font-mono text-[9px] text-gray-400 dark:text-gray-600">NEW</span>
                )}
              </button>
            );
          })
        )}

        {!cgLoading && cgCoins.length >= 100 && (
          <button
            onClick={() => { const next = cgPage + 1; setCgPage(next); selectExchange(selectedEx, next); }}
            className="w-full py-3 font-mono text-xs text-gray-500 dark:text-gray-400 border-t border-gray-200 dark:border-gray-800"
          >
            Load more →
          </button>
        )}
      </div>
    </div>
  );

  // ── Fee Editor ────────────────────────────────────────────────────────────
  const FeeEditor = () => (
    <div className="h-full overflow-y-auto p-4 md:p-5 bg-gray-50 dark:bg-gray-950">
      {!selectedCoin ? (
        <div className="h-full flex flex-col items-center justify-center gap-3 text-center">
          <Coins className="w-12 h-12 text-gray-300 dark:text-gray-700" />
          <p className="font-mono text-xs text-gray-500 dark:text-gray-400 tracking-widest">
            SELECT A COIN TO VIEW AND EDIT ITS FEE SETTINGS
          </p>
          {selectedEx && (
            <button
              onClick={() => setRightPanel('info')}
              className="flex items-center gap-1.5 font-mono text-[10px] text-emerald-600 dark:text-emerald-400 border border-emerald-300 dark:border-emerald-800 rounded-lg px-3 py-2 mt-2"
            >
              <Info className="w-3 h-3" />
              View / Edit Exchange Info
            </button>
          )}
        </div>
      ) : (
        <div>
          <div className="flex items-start justify-between mb-5">
            <div className="flex items-start gap-3">
              <button onClick={() => setMobileStep(1)} className="md:hidden mt-1 text-gray-500 dark:text-gray-400 flex-shrink-0">
                <ArrowLeft className="w-4 h-4" />
              </button>
              <div>
                <h2 className="font-mono font-bold text-lg text-emerald-600 dark:text-emerald-400">
                  {selectedCoin.symbol}
                  <span className="text-gray-500 dark:text-gray-400 text-sm font-normal ml-2">on {currentExLabel}</span>
                </h2>
                <p className="font-mono text-[11px] text-gray-500 dark:text-gray-400 mt-0.5">
                  {existingNetworks.length > 0
                    ? `${existingNetworks.length} chains in database`
                    : 'Not in database yet — add the first chain below'
                  }
                </p>
              </div>
            </div>
            <button
              onClick={() => { setAddingNetwork(true); setEditingNetwork(null); }}
              className="flex items-center gap-1.5 font-mono text-xs text-emerald-700 dark:text-emerald-400 border border-emerald-300 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-900/20 rounded-lg px-3 py-2 flex-shrink-0"
            >
              <Plus className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Add Chain</span>
              <span className="sm:hidden">Add</span>
            </button>
          </div>

          {existingNetworks.length > 0 && (
            <div className="mb-5">
              {/* Desktop table */}
              <div className="hidden md:block bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl overflow-hidden">
                <div className="grid grid-cols-8 gap-2 px-4 py-2.5 bg-gray-100 dark:bg-gray-950 border-b border-gray-200 dark:border-gray-800">
                  {['Chain', 'Chain ID', 'Withdraw Fee', 'Fee USD', 'Min Withdraw', 'Min Deposit', 'ETA', 'Actions'].map(h => (
                    <div key={h} className="font-mono text-[9px] text-gray-500 dark:text-gray-400 tracking-widest">{h}</div>
                  ))}
                </div>
                <div className="divide-y divide-gray-200 dark:divide-gray-800">
                  {existingNetworks.map((network, i) => (
                    <div key={i}>
                      {editingNetwork?._original === network.chain ? (
                        <div className="grid grid-cols-8 gap-2 px-4 py-3 bg-emerald-50 dark:bg-emerald-900/10 items-center">
                          <div className="font-mono text-xs text-emerald-700 dark:text-emerald-400 font-bold truncate">{network.chain}</div>
                          <div className="font-mono text-[10px] text-gray-500 dark:text-gray-400 truncate">{network.chainId}</div>
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
                              className="w-full bg-white dark:bg-gray-950 border border-gray-300 dark:border-gray-700 rounded-lg px-2 py-1.5 font-mono text-xs outline-none"
                            />
                          ))}
                          <div className="flex gap-1">
                            <button onClick={saveEdit} disabled={saving} className="flex items-center gap-1 px-2 py-1.5 rounded-lg bg-emerald-600 text-white font-mono text-[10px] font-bold disabled:opacity-50">
                              <Save className="w-3 h-3" />{saving ? '...' : 'Save'}
                            </button>
                            <button onClick={() => setEditingNetwork(null)} className="p-1.5 rounded-lg border border-gray-300 dark:border-gray-700 text-gray-500">
                              <X className="w-3 h-3" />
                            </button>
                          </div>
                        </div>
                      ) : (
                        <div className="grid grid-cols-8 gap-2 px-4 py-3 items-center">
                          <div className="font-mono text-xs text-gray-900 dark:text-gray-100 truncate">{network.chain}</div>
                          <div className="font-mono text-[10px] text-gray-500 dark:text-gray-400 truncate">{network.chainId}</div>
                          <div className={`font-mono text-xs font-bold ${network.withdrawFee === 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-gray-900 dark:text-gray-100'}`}>
                            {network.withdrawFee === 0 ? 'Free' : network.withdrawFee}
                          </div>
                          <div className="font-mono text-[11px] text-gray-500 dark:text-gray-400">{network.withdrawFeeUSD != null ? `$${network.withdrawFeeUSD}` : '—'}</div>
                          <div className="font-mono text-[11px] text-gray-500 dark:text-gray-400">{network.minWithdraw}</div>
                          <div className="font-mono text-[11px] text-gray-500 dark:text-gray-400">{network.minDeposit}</div>
                          <div className="font-mono text-[11px] text-gray-500 dark:text-gray-400">{network.arrivalMins}m</div>
                          <div className="flex gap-1">
                            <button onClick={() => setEditingNetwork({ ...network, _original: network.chain })} className="p-1.5 rounded-lg border border-gray-200 dark:border-gray-700 text-gray-500 dark:text-gray-400">
                              <Pencil className="w-3 h-3" />
                            </button>
                            <button onClick={() => deleteNetwork(network.chain)} className="p-1.5 rounded-lg border border-gray-200 dark:border-gray-700 text-gray-500 dark:text-gray-400">
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
                  <div key={i} className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl p-4">
                    {editingNetwork?._original === network.chain ? (
                      <div className="space-y-3">
                        <p className="font-mono text-xs text-emerald-600 dark:text-emerald-400 font-bold">{network.chain}</p>
                        <div className="grid grid-cols-2 gap-2">
                          {([
                            { field: 'withdrawFee',    label: 'Withdraw Fee' },
                            { field: 'withdrawFeeUSD', label: 'Fee (USD)'    },
                            { field: 'minWithdraw',    label: 'Min Withdraw' },
                            { field: 'minDeposit',     label: 'Min Deposit'  },
                            { field: 'arrivalMins',    label: 'ETA (mins)'   },
                          ] as { field: keyof Pick<Network, 'withdrawFee'|'withdrawFeeUSD'|'minWithdraw'|'minDeposit'|'arrivalMins'>; label: string }[]).map(({ field, label }) => (
                            <div key={field}>
                              <label className="font-mono text-[9px] text-gray-500 dark:text-gray-400 tracking-wider block mb-1">{label}</label>
                              <input
                                type="number" step="any" min="0"
                                value={editingNetwork[field]}
                                onChange={e => setEditingNetwork(prev =>
                                  prev ? { ...prev, [field]: parseFloat(e.target.value) || 0 } : null
                                )}
                                className="w-full bg-gray-50 dark:bg-gray-950 border border-gray-300 dark:border-gray-700 rounded-lg px-2 py-2 font-mono text-xs outline-none"
                              />
                            </div>
                          ))}
                        </div>
                        <div className="flex gap-2">
                          <button onClick={saveEdit} disabled={saving} className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-emerald-600 text-white font-mono text-xs font-bold disabled:opacity-50">
                            <Save className="w-3.5 h-3.5" />{saving ? 'Saving...' : 'Save'}
                          </button>
                          <button onClick={() => setEditingNetwork(null)} className="px-4 py-2 rounded-lg border border-gray-300 dark:border-gray-700 font-mono text-xs text-gray-600 dark:text-gray-400">
                            Cancel
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div>
                        <div className="flex items-center justify-between mb-3">
                          <div>
                            <p className="font-mono text-xs font-bold text-gray-900 dark:text-gray-100">{network.chain}</p>
                            <p className="font-mono text-[10px] text-gray-500 dark:text-gray-400">{network.chainId}</p>
                          </div>
                          <div className="flex gap-1.5">
                            <button onClick={() => setEditingNetwork({ ...network, _original: network.chain })} className="p-2 rounded-lg border border-gray-200 dark:border-gray-700 text-gray-500 dark:text-gray-400">
                              <Pencil className="w-3.5 h-3.5" />
                            </button>
                            <button onClick={() => deleteNetwork(network.chain)} className="p-2 rounded-lg border border-gray-200 dark:border-gray-700 text-gray-500 dark:text-gray-400">
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>
                        <div className="grid grid-cols-3 gap-2">
                          {[
                            { label: 'Fee',     value: network.withdrawFee === 0 ? 'Free' : String(network.withdrawFee) },
                            { label: 'Fee USD', value: network.withdrawFeeUSD != null ? `$${network.withdrawFeeUSD}` : '—' },
                            { label: 'Min Out', value: String(network.minWithdraw) },
                            { label: 'Min In',  value: String(network.minDeposit)  },
                            { label: 'ETA',     value: `${network.arrivalMins}m`   },
                          ].map(({ label, value }) => (
                            <div key={label} className="bg-gray-50 dark:bg-gray-950 rounded-lg px-2 py-2 border border-gray-100 dark:border-gray-800">
                              <p className="font-mono text-[9px] text-gray-500 dark:text-gray-400 tracking-wider">{label}</p>
                              <p className={`font-mono text-xs font-bold mt-0.5 ${value === 'Free' ? 'text-emerald-600 dark:text-emerald-400' : 'text-gray-900 dark:text-gray-100'}`}>{value}</p>
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

          {addingNetwork && (
            <motion.div
              className="bg-white dark:bg-gray-900 border border-emerald-500/30 rounded-xl p-4 md:p-5"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
            >
              <div className="flex items-center justify-between mb-4">
                <p className="font-mono text-xs text-emerald-700 dark:text-emerald-400 tracking-widest font-bold">
                  ADD CHAIN — {selectedCoin.symbol}
                </p>
                <button onClick={() => { setAddingNetwork(false); setNewNetwork({ ...EMPTY_NETWORK }); }} className="text-gray-500 dark:text-gray-400">
                  <X className="w-4 h-4" />
                </button>
              </div>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3 md:gap-4 mb-4">
                {[
                  { key: 'chain',          label: 'Chain Name *',   placeholder: 'e.g. Arbitrum One', type: 'text'   },
                  { key: 'chainId',        label: 'Chain ID *',     placeholder: 'e.g. arbitrum',     type: 'text'   },
                  { key: 'withdrawFee',    label: 'Withdraw Fee',   placeholder: '0',                 type: 'number' },
                  { key: 'withdrawFeeUSD', label: 'Fee (USD)',      placeholder: '0.00',              type: 'number' },
                  { key: 'minWithdraw',    label: 'Min Withdrawal', placeholder: '1',                 type: 'number' },
                  { key: 'minDeposit',     label: 'Min Deposit',    placeholder: '1',                 type: 'number' },
                  { key: 'depositFee',     label: 'Deposit Fee',    placeholder: '0',                 type: 'number' },
                  { key: 'arrivalMins',    label: 'Arrival (min)',  placeholder: '1',                 type: 'number' },
                ].map(({ key, label, placeholder, type }) => (
                  <div key={key}>
                    <label className="font-mono text-[10px] text-gray-600 dark:text-gray-400 block mb-1.5 tracking-wider">{label}</label>
                    <input
                      type={type} step="any" min="0" placeholder={placeholder}
                      value={(newNetwork as Record<string, string | number>)[key]}
                      onChange={e => setNewNetwork(prev => ({
                        ...prev,
                        [key]: type === 'text' ? e.target.value : (parseFloat(e.target.value) || 0),
                      }))}
                      className="w-full bg-gray-50 dark:bg-gray-950 border border-gray-300 dark:border-gray-700 rounded-lg px-3 py-2.5 font-mono text-xs text-gray-900 dark:text-gray-100 placeholder:text-gray-400 outline-none"
                    />
                  </div>
                ))}
              </div>
              <div className="flex gap-2">
                <button onClick={saveNewNetwork} disabled={saving} className="flex items-center gap-1.5 px-5 py-2.5 rounded-xl bg-emerald-600 text-white font-mono text-xs font-bold disabled:opacity-50">
                  <Save className="w-3.5 h-3.5" />{saving ? 'Saving...' : 'Save Chain'}
                </button>
                <button onClick={() => { setAddingNetwork(false); setNewNetwork({ ...EMPTY_NETWORK }); }} className="flex items-center gap-1.5 px-5 py-2.5 rounded-xl border border-gray-300 dark:border-gray-700 font-mono text-xs text-gray-600 dark:text-gray-400">
                  <X className="w-3.5 h-3.5" />Cancel
                </button>
              </div>
            </motion.div>
          )}

          {existingNetworks.length === 0 && !addingNetwork && (
            <div className="bg-white dark:bg-gray-900 border border-dashed border-gray-300 dark:border-gray-700 rounded-xl p-10 text-center">
              <p className="font-mono text-sm text-gray-600 dark:text-gray-400 mb-1">{selectedCoin.symbol} has no fee data yet</p>
              <p className="font-mono text-[11px] text-gray-400 dark:text-gray-500 mb-4">Add withdrawal chains and their fees manually</p>
              <button onClick={() => setAddingNetwork(true)} className="inline-flex items-center gap-1.5 font-mono text-xs text-emerald-700 dark:text-emerald-400 border border-emerald-300 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-900/20 rounded-lg px-4 py-2">
                <Plus className="w-3.5 h-3.5" />Add First Chain
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );

  // ── Main render ────────────────────────────────────────────────────────────
  return (
    <div className="h-full flex flex-col overflow-hidden bg-gray-50 dark:bg-gray-950 text-gray-900 dark:text-gray-100">
      <div className="flex items-center justify-between px-4 md:px-6 py-3 md:py-4 border-b border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 flex-shrink-0">
        <div>
          <h1 className="font-mono font-bold text-base md:text-xl text-emerald-600 dark:text-emerald-400 tracking-[0.1em] md:tracking-[0.15em]">
            ADMIN — FEE MANAGER
          </h1>
          <p className="md:hidden font-mono text-[10px] text-gray-500 dark:text-gray-400 mt-0.5">
            {mobileStep === 0 && 'Select exchange'}
            {mobileStep === 1 && `${currentExLabel} → select coin`}
            {mobileStep === 2 && `${selectedCoin?.symbol} · ${currentExLabel}`}
          </p>
          <p className="hidden md:block font-mono text-[10px] text-gray-500 dark:text-gray-400 mt-0.5 tracking-widest">
            SELECT EXCHANGE → SEARCH COIN → UPDATE FEES
          </p>
        </div>
        <span className="hidden sm:block font-mono text-xs text-gray-600 dark:text-gray-400 border border-gray-200 dark:border-gray-800 rounded-lg px-3 py-1.5">
          <span className="text-emerald-600 dark:text-emerald-400">{user?.email}</span>
        </span>
      </div>

      <AnimatePresence>
        {toast && (
          <motion.div
            className={`fixed top-4 right-4 md:right-6 z-[100] px-5 py-3 rounded-2xl font-mono text-sm border shadow-xl flex items-center gap-3 max-w-xs ${
              toast.type === 'success'
                ? 'bg-emerald-600 text-white border-emerald-500'
                : 'bg-red-600 text-white border-red-500'
            }`}
            initial={{ opacity: 0, y: -20, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -20, scale: 0.95 }}
            transition={{ duration: 0.2 }}
          >
            {toast.type === 'success' ? (
              <CheckCircle className="w-5 h-5 flex-shrink-0" />
            ) : (
              <AlertCircle className="w-5 h-5 flex-shrink-0" />
            )}
            <span>{toast.text}</span>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Desktop: 3-column */}
      <div className="hidden md:flex flex-1 overflow-hidden">
        <div className="w-44 flex-shrink-0 border-r border-gray-200 dark:border-gray-800 overflow-y-auto">
          <ExchangeList />
        </div>
        <div className="w-64 flex-shrink-0 border-r border-gray-200 dark:border-gray-800 flex flex-col overflow-hidden">
          {!selectedEx ? (
            <div className="flex-1 flex items-center justify-center p-4">
              <p className="font-mono text-[10px] text-gray-400 dark:text-gray-600 tracking-widest text-center">
                SELECT AN EXCHANGE
              </p>
            </div>
          ) : (
            <CoinList />
          )}
        </div>
        <div className="flex-1 overflow-hidden">
          {rightPanel === 'info' ? <ExchangeInfoPanel /> : <FeeEditor />}
        </div>
      </div>

      {/* Mobile: step-based */}
      <div className="md:hidden flex-1 overflow-hidden">
        {mobileStep === 0 && <ExchangeList />}
        {mobileStep === 1 && <CoinList />}
        {mobileStep === 2 && (rightPanel === 'info' ? <ExchangeInfoPanel /> : <FeeEditor />)}
      </div>
    </div>
  );
}