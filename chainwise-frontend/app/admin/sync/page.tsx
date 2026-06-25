'use client';

import { useState, useEffect } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { createClient } from '@/lib/supabase/client';
import {
  Key, RefreshCw, Trash2, CheckCircle,
  XCircle, Clock, Play, Zap, Eye, EyeOff, AlertCircle
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

const EXCHANGES = [
  { key: 'binance', label: 'Binance',  needsPassphrase: false, docs: 'https://www.binance.com/en/my/settings/api-management' },
  { key: 'bybit',   label: 'Bybit',    needsPassphrase: false, docs: 'https://www.bybit.com/app/user/api-management' },
  { key: 'okx',     label: 'OKX',      needsPassphrase: true,  docs: 'https://www.okx.com/account/my-api' },
  { key: 'kucoin',  label: 'KuCoin',   needsPassphrase: true,  docs: 'https://www.kucoin.com/account/api' },
  { key: 'kraken', label: 'Kraken', needsPassphrase: false, docs: 'https://www.kraken.com/u/security/api' },
  { key: 'phemex', label: 'Phemex', needsPassphrase: false, docs: 'https://phemex.com/account/api-management' },
  { key: 'bitget',  label: 'Bitget',   needsPassphrase: true,  docs: 'https://www.bitget.com/account/newapi' },
  { key: 'gateio',  label: 'Gate.io',  needsPassphrase: false, docs: 'https://www.gate.io/myaccount/apiv4keys' },
  { key: 'mexc',    label: 'MEXC',     needsPassphrase: false, docs: 'https://www.mexc.com/user/openapi' },
  { key: 'bingx',   label: 'BingX',    needsPassphrase: false, docs: 'https://www.bingx.com/account/api' },
  { key: 'bitmart', label: 'BitMart',  needsPassphrase: true,  docs: 'https://www.bitmart.com/account/api' },
  { key: 'huobi',   label: 'Huobi/HTX',needsPassphrase: false, docs: 'https://www.htx.com/account/api' },
  { key: 'coinex',  label: 'CoinEx',   needsPassphrase: false, docs: 'https://www.coinex.com/account/api' },
];

interface KeyStatus {
  exchange: string;
  isValid: boolean;
  autoSync: boolean;
  lastSync: string | null;
  lastError: string | null;
}

interface QueueStats {
  wait: number;
  active: number;
  completed: number;
  failed: number;
}

export default function SyncPage() {
  const { user, getToken } = useAuth();
  const supabase = createClient();

  const [keyStatuses, setKeyStatuses] = useState<KeyStatus[]>([]);
  const [queueStats,  setQueueStats]  = useState<QueueStats | null>(null);
  const [loading,     setLoading]     = useState(true);
  const [saving,      setSaving]      = useState<string | null>(null);
  const [syncing,     setSyncing]     = useState<string | null>(null);
  const [toast,       setToast]       = useState<{ type: 'success'|'error'; text: string } | null>(null);

  // Per-exchange form state
  const [forms, setForms]             = useState<Record<string, { apiKey: string; apiSecret: string; passphrase?: string }>>({});
  const [showSecret, setShowSecret]   = useState<Record<string, boolean>>({});
  const [expanded,   setExpanded]     = useState<string | null>(null);

  const getFreshToken = async () => {
    const { data: { session } } = await supabase.auth.getSession();
    return session?.access_token ?? null;
  };

  const showToast = (type: 'success'|'error', text: string) => {
    setToast({ type, text });
    setTimeout(() => setToast(null), 4500);
  };

  useEffect(() => {
    loadStatus();
    const interval = setInterval(loadStatus, 30000); // refresh every 30s
    return () => clearInterval(interval);
  }, []);

  const loadStatus = async () => {
    try {
      const token = await getFreshToken();
      const res   = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/sync/status`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (data.success) {
        setKeyStatuses(data.data.exchanges || []);
        setQueueStats(data.data.queue || null);
      }
    } catch {}
    finally { setLoading(false); }
  };

  const saveKeys = async (exchangeKey: string) => {
    const form = forms[exchangeKey];
    if (!form?.apiKey || !form?.apiSecret) {
      showToast('error', 'Both API Key and Secret are required');
      return;
    }
    const ex = EXCHANGES.find(e => e.key === exchangeKey);
    if (ex?.needsPassphrase && !form.passphrase?.trim()) {
      showToast('error', `API Passphrase is required for ${ex.label}`);
      return;
    }
    setSaving(exchangeKey);
    try {
      const token = await getFreshToken();
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/sync/keys`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          exchange:      exchangeKey,
          apiKey:        form.apiKey.trim(),
          apiSecret:     form.apiSecret.trim(),
          ...(ex?.needsPassphrase && { apiPassphrase: form.passphrase?.trim() || '' }),
          autoSync:      true,
        }),
      });
      const data = await res.json();
      if (data.success) {
        showToast('success', data.data.message);
        setForms(prev => ({ ...prev, [exchangeKey]: { apiKey: '', apiSecret: '', passphrase: '' } }));
        setExpanded(null);
        await loadStatus();
      } else {
        showToast('error', data.error?.message || 'Failed to save keys');
      }
    } catch {
      showToast('error', 'Network error');
    } finally {
      setSaving(null);
    }
  };

  const deleteKeys = async (exchangeKey: string) => {
    if (!confirm(`Remove API keys for ${exchangeKey}? Auto-sync will stop.`)) return;
    try {
      const token = await getFreshToken();
      await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/sync/keys/${exchangeKey}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });
      showToast('success', `Keys for ${exchangeKey} removed`);
      await loadStatus();
    } catch {
      showToast('error', 'Delete failed');
    }
  };

  const testConnection = async (exchangeKey: string) => {
  setSyncing(`test-${exchangeKey}`);
  try {
    const token = await getFreshToken();
    const res = await fetch(
      `${process.env.NEXT_PUBLIC_API_URL}/api/sync/test/${exchangeKey}`,
      { method: 'POST', headers: { Authorization: `Bearer ${token}` } }
    );
    const data = await res.json();
    if (data.success) {
      showToast(
        data.data.isValid ? 'success' : 'error',
        data.data.message
      );
      await loadStatus(); // refresh the connected/error state
    } else {
      showToast('error', data.error?.message || 'Test failed');
    }
  } catch {
    showToast('error', 'Network error');
  } finally {
    setSyncing(null);
  }
};

  const triggerSync = async (exchangeKey: string) => {
    setSyncing(exchangeKey);
    try {
      const token = await getFreshToken();
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/sync/trigger/${exchangeKey}`, {
        method:  'POST',
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (data.success) {
        showToast('success', data.data.message);
        setTimeout(loadStatus, 5000);
      } else {
        showToast('error', data.error?.message);
      }
    } catch {
      showToast('error', 'Sync trigger failed');
    } finally {
      setTimeout(() => setSyncing(null), 3000);
    }
  };

  const triggerAll = async () => {
    setSyncing('all');
    try {
      const token = await getFreshToken();
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/sync/trigger-all`, {
        method:  'POST',
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (data.success) {
        showToast('success', data.data.message);
        setTimeout(loadStatus, 5000);
      } else {
        showToast('error', data.error?.message);
      }
    } catch {
      showToast('error', 'Sync all failed');
    } finally {
      setTimeout(() => setSyncing(null), 3000);
    }
  };

  const getKeyStatus = (exKey: string) =>
    keyStatuses.find(k => k.exchange === exKey);

  const validKeyCount = keyStatuses.filter(k => k.isValid).length;

  return (
    <div className="h-full overflow-y-auto px-6 py-6">
      <div className="max-w-4xl mx-auto">

        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="font-mono font-bold text-xl text-brand-green tracking-[0.15em]">
              AUTO-SYNC — EXCHANGE API KEYS
            </h1>
            <p className="font-mono text-[10px] text-brand-muted mt-1 tracking-widest">
              ADD READ-ONLY API KEYS → FEES AUTO-UPDATE HOURLY VIA REDIS QUEUE
            </p>
          </div>
          <button
            onClick={triggerAll}
            disabled={syncing === 'all' || validKeyCount === 0}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-gradient-to-r from-brand-green to-brand-blue text-black font-mono text-xs font-bold disabled:opacity-50 hover:shadow-[0_0_15px_rgba(0,255,136,0.3)] transition-all"
          >
            {syncing === 'all'
              ? <RefreshCw className="w-3.5 h-3.5 animate-spin" />
              : <Zap className="w-3.5 h-3.5" />
            }
            Sync All Now
          </button>
        </div>

        {/* Toast */}
        <AnimatePresence>
          {toast && (
            <motion.div
              className={`mb-4 px-4 py-3 rounded-xl font-mono text-xs border ${
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

        {/* Queue stats */}
        {queueStats && (
          <div className="grid grid-cols-4 gap-3 mb-6">
            {[
              { label: 'Queued',    value: queueStats.wait,      color: 'text-yellow-400' },
              { label: 'Running',   value: queueStats.active,    color: 'text-blue-400'   },
              { label: 'Completed', value: queueStats.completed, color: 'text-brand-green'},
              { label: 'Failed',    value: queueStats.failed,    color: 'text-red-400'    },
            ].map(stat => (
              <div key={stat.label} className="bg-brand-surface border border-brand-border rounded-xl p-4 text-center">
                <div className={`font-mono font-bold text-xl ${stat.color}`}>{stat.value}</div>
                <div className="font-mono text-[10px] text-brand-muted tracking-widest mt-1">{stat.label}</div>
              </div>
            ))}
          </div>
        )}

        {/* Security notice */}
        <div className="flex items-start gap-3 bg-[rgba(0,255,136,0.04)] border border-brand-green/15 rounded-xl px-4 py-3 mb-6">
          <AlertCircle className="w-4 h-4 text-brand-green flex-shrink-0 mt-0.5" />
          <div className="font-mono text-[11px] text-brand-muted leading-relaxed">
            <span className="text-brand-green font-bold">Security: </span>
            Only add <span className="text-brand-text">read-only API keys</span> — enable only "Read" permissions on each exchange.
            Never enable trading, withdrawal, or transfer permissions.
            Keys are encrypted with AES-256 before storage.
          </div>
        </div>

        {/* Exchange cards */}
        <div className="space-y-3">
          {EXCHANGES.map(ex => {
            const status     = getKeyStatus(ex.key);
            const hasKeys    = !!status;
            const isExpanded = expanded === ex.key;
            const form       = forms[ex.key] || { apiKey: '', apiSecret: '', passphrase: '' };

            return (
              <div key={ex.key} className="bg-brand-surface border border-brand-border rounded-xl overflow-hidden">

                {/* Exchange row */}
                <div className="flex items-center justify-between px-5 py-4">
                  <div className="flex items-center gap-3">
                    {/* Status indicator */}
                    {hasKeys ? (
                      status!.isValid
                        ? <CheckCircle className="w-4 h-4 text-brand-green" />
                        : <XCircle    className="w-4 h-4 text-red-400" />
                    ) : (
                      <div className="w-4 h-4 rounded-full border-2 border-brand-muted" />
                    )}

                    <div>
                      <div className="font-mono text-sm text-brand-text font-bold">{ex.label}</div>
                      <div className="font-mono text-[10px] text-brand-muted mt-0.5">
                        {hasKeys ? (
                          status!.isValid ? (
                            <>
                              <span className="text-brand-green">Connected</span>
                              {status!.lastSync && (
                                <span className="ml-2 opacity-60">
                                  Last sync: {new Date(status!.lastSync).toLocaleTimeString()}
                                </span>
                              )}
                            </>
                          ) : (
                            <span className="text-red-400">{status!.lastError || 'Connection failed'}</span>
                          )
                        ) : (
                          'No API keys — add to enable auto-sync'
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
  {/* Test stored connection — no re-entry needed */}
  {hasKeys && (
    <button
      onClick={() => testConnection(ex.key)}
      disabled={syncing === `test-${ex.key}`}
      className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg border font-mono text-xs transition-all disabled:opacity-50 ${
        status!.isValid
          ? 'border-brand-border text-brand-muted hover:text-brand-green hover:border-brand-green/40'
          : 'border-red-800/50 text-red-400 hover:border-red-500'
      }`}
      title="Re-test stored keys"
    >
      {syncing === `test-${ex.key}`
        ? <RefreshCw className="w-3 h-3 animate-spin" />
        : <CheckCircle className="w-3 h-3" />
      }
      {syncing === `test-${ex.key}` ? 'Testing...' : 'Test'}
    </button>
  )}

  {/* Sync now */}
  {hasKeys && status!.isValid && (
    <button
      onClick={() => triggerSync(ex.key)}
      disabled={syncing === ex.key}
      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-brand-border font-mono text-xs text-brand-muted hover:text-brand-green hover:border-brand-dim transition-all disabled:opacity-50"
    >
      <Play className={`w-3 h-3 ${syncing === ex.key ? 'animate-spin' : ''}`} />
      {syncing === ex.key ? 'Syncing...' : 'Sync'}
    </button>
  )}

  {/* Delete */}
  {hasKeys && (
    <button
      onClick={() => deleteKeys(ex.key)}
      className="p-1.5 rounded-lg border border-brand-border text-brand-muted hover:text-red-400 hover:border-red-500/40 transition-all"
    >
      <Trash2 className="w-3.5 h-3.5" />
    </button>
  )}

  {/* Add / Update keys */}
  <button
    onClick={() => setExpanded(isExpanded ? null : ex.key)}
    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg font-mono text-xs transition-all ${
      isExpanded
        ? 'bg-brand-green/10 border border-brand-green/30 text-brand-green'
        : 'border border-brand-border text-brand-muted hover:text-brand-text'
    }`}
  >
    <Key className="w-3 h-3" />
    {hasKeys ? 'Update Keys' : 'Add Keys'}
  </button>
</div>
                </div>

                {/* Expandable form */}
                <AnimatePresence>
                  {isExpanded && (
                    <motion.div
                      className="border-t border-brand-border px-5 py-5 bg-[rgba(0,0,0,0.2)]"
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: 'auto', opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      transition={{ duration: 0.2 }}
                    >
                      <div className="flex items-center justify-between mb-4">
                        <p className="font-mono text-[10px] text-brand-muted tracking-widest">
                          READ-ONLY API KEY — {ex.label.toUpperCase()}
                        </p>
                        <a
                          href={ex.docs}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="font-mono text-[10px] text-brand-blue hover:underline"
                        >
                          How to get API keys ↗
                        </a>
                      </div>

                      <div className="grid grid-cols-2 gap-3 mb-4">
                        {/* API Key */}
                        <div>
                          <label className="font-mono text-[10px] text-brand-muted block mb-1.5 tracking-wider">
                            API KEY
                          </label>
                          <input
                            type="text"
                            value={form.apiKey}
                            onChange={e => setForms(prev => ({
                              ...prev,
                              [ex.key]: { ...prev[ex.key], apiKey: e.target.value }
                            }))}
                            placeholder="Paste your API key here"
                            className="w-full bg-brand-bg border border-brand-border rounded-lg px-3 py-2.5 font-mono text-xs text-brand-text placeholder:text-brand-muted/40 outline-none focus:border-brand-dim transition-colors"
                          />
                        </div>

                        {/* API Secret */}
                        <div>
                          <label className="font-mono text-[10px] text-brand-muted block mb-1.5 tracking-wider">
                            API SECRET
                          </label>
                          <div className="relative">
                            <input
                              type={showSecret[ex.key] ? 'text' : 'password'}
                              value={form.apiSecret}
                              onChange={e => setForms(prev => ({
                                ...prev,
                                [ex.key]: { ...prev[ex.key], apiSecret: e.target.value }
                              }))}
                              placeholder="Paste your secret here"
                              className="w-full bg-brand-bg border border-brand-border rounded-lg px-3 py-2.5 pr-10 font-mono text-xs text-brand-text placeholder:text-brand-muted/40 outline-none focus:border-brand-dim transition-colors"
                            />
                            <button
                              type="button"
                              onClick={() => setShowSecret(prev => ({ ...prev, [ex.key]: !prev[ex.key] }))}
                              className="absolute right-3 top-1/2 -translate-y-1/2 text-brand-muted hover:text-brand-text"
                            >
                              {showSecret[ex.key] ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                            </button>
                          </div>
                        </div>

                        {/* Passphrase field — only for KuCoin and Bitget */}
                        {ex.needsPassphrase && (
                          <div className="col-span-2">
                            <label className="font-mono text-[10px] text-yellow-400 block mb-1.5 tracking-wider">
                              API PASSPHRASE ⚠️ Required for {ex.label}
                            </label>
                            <input
                              type="password"
                              value={form.passphrase || ''}
                              onChange={e => setForms(prev => ({
                                ...prev,
                                [ex.key]: { ...prev[ex.key], passphrase: e.target.value }
                              }))}
                              placeholder={`Your ${ex.label} API passphrase`}
                              className="w-full bg-brand-bg border border-yellow-800/50 rounded-lg px-3 py-2.5 font-mono text-xs text-brand-text placeholder:text-brand-muted/40 outline-none focus:border-yellow-600 transition-colors"
                            />
                          </div>
                        )}
                      </div>

                      <div className="flex gap-2">
                        <button
                          onClick={() => saveKeys(ex.key)}
                          disabled={saving === ex.key}
                          className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-gradient-to-r from-brand-green to-brand-blue text-black font-mono text-xs font-bold disabled:opacity-50 transition-all"
                        >
                          {saving === ex.key
                            ? <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                            : <CheckCircle className="w-3.5 h-3.5" />
                          }
                          {saving === ex.key ? 'Testing & Saving...' : 'Save & Test Connection'}
                        </button>
                        <button
                          onClick={() => setExpanded(null)}
                          className="px-4 py-2 rounded-lg border border-brand-border font-mono text-xs text-brand-muted hover:text-brand-text transition-colors"
                        >
                          Cancel
                        </button>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            );
          })}
        </div>

        {/* How it works */}
        <div className="mt-8 bg-brand-surface border border-brand-border rounded-xl p-5">
          <h3 className="font-mono text-xs text-brand-green tracking-widest mb-4">HOW AUTO-SYNC WORKS</h3>
          <div className="grid grid-cols-4 gap-4">
            {[
              { step: '1', label: 'Add Keys',    desc: 'Paste read-only API keys for each exchange' },
              { step: '2', label: 'Auto-Fetch',  desc: 'System fetches fees & minimums via CCXT' },
              { step: '3', label: 'Redis Queue', desc: 'BullMQ processes syncs, retries on failure' },
              { step: '4', label: 'Hourly Cron', desc: 'Runs every hour, manual overrides preserved' },
            ].map(item => (
              <div key={item.step} className="text-center">
                <div className="w-8 h-8 rounded-full bg-brand-green/10 border border-brand-green/30 flex items-center justify-center font-mono text-sm text-brand-green font-bold mx-auto mb-2">
                  {item.step}
                </div>
                <div className="font-mono text-xs text-brand-text mb-1">{item.label}</div>
                <div className="font-mono text-[10px] text-brand-muted leading-relaxed">{item.desc}</div>
              </div>
            ))}
          </div>
        </div>

      </div>
    </div>
  );
}