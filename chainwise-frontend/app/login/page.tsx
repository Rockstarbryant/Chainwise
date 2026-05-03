'use client';

import { useState } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { motion, AnimatePresence } from 'framer-motion';
import { useSearchParams } from 'next/navigation';
import { Zap, Mail, Lock, Eye, EyeOff, ArrowRight } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';

// ── Brand icons ──────────────────────────────────────────────────────────────
const GoogleIcon = () => (
  <svg viewBox="0 0 24 24" className="w-4 h-4 flex-shrink-0">
    <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
    <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
    <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
    <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
  </svg>
);

const GithubIcon = () => (
  <svg viewBox="0 0 24 24" className="w-4 h-4 flex-shrink-0" fill="currentColor">
    <path d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.531 1.032 1.531 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0022 12.017C22 6.484 17.522 2 12 2z"/>
  </svg>
);

const XIcon = () => (
  <svg viewBox="0 0 24 24" className="w-4 h-4 flex-shrink-0" fill="currentColor">
    <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-4.714-6.231-5.401 6.231H2.746l7.73-8.835L1.254 2.25H8.08l4.253 5.622zm-1.161 17.52h1.833L7.084 4.126H5.117z"/>
  </svg>
);

const FacebookIcon = () => (
  <svg viewBox="0 0 24 24" className="w-4 h-4 flex-shrink-0">
    <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z" fill="#1877F2"/>
  </svg>
);

const OAUTH_PROVIDERS = [
  { id: 'google',   label: 'Google',   Icon: GoogleIcon,   border: 'hover:border-red-500/40  hover:bg-red-500/5'  },
  { id: 'github',   label: 'GitHub',   Icon: GithubIcon,   border: 'hover:border-gray-400/40 hover:bg-gray-500/5' },
  { id: 'twitter',  label: 'X',        Icon: XIcon,        border: 'hover:border-sky-500/40  hover:bg-sky-500/5'  },
  { id: 'facebook', label: 'Facebook', Icon: FacebookIcon, border: 'hover:border-blue-500/40 hover:bg-blue-500/5' },
] as const;

type Tab = 'oauth' | 'signin' | 'signup';

export default function LoginPage() {
  const { signIn }    = useAuth();
  const supabase      = createClient();
  const searchParams  = useSearchParams();
  const redirectMsg   = searchParams.get('message');
  const authError     = searchParams.get('error');

  const [tab, setTab]                       = useState<Tab>('oauth');
  const [loadingProvider, setLoadingProvider] = useState<string | null>(null);
  const [email, setEmail]                   = useState('');
  const [password, setPassword]             = useState('');
  const [showPassword, setShowPassword]     = useState(false);
  const [formLoading, setFormLoading]       = useState(false);
  const [formError, setFormError]           = useState('');
  const [formSuccess, setFormSuccess]       = useState('');

  // ── OAuth ──────────────────────────────────────────────────────────────────
  const handleOAuth = async (provider: string) => {
    setLoadingProvider(provider);
    try { await signIn(provider as any); }
    catch { setLoadingProvider(null); }
  };

  // ── Email sign in ──────────────────────────────────────────────────────────
  const handleSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError('');
    setFormLoading(true);
    try {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) throw error;
      window.location.href = '/chat';
    } catch (err: any) {
      setFormError(err.message || 'Sign in failed');
    } finally {
      setFormLoading(false);
    }
  };

  // ── Email sign up ──────────────────────────────────────────────────────────
  const handleSignUp = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError('');
    setFormLoading(true);
    try {
      const { error } = await supabase.auth.signUp({
        email,
        password,
        options: { emailRedirectTo: `${window.location.origin}/auth/callback` },
      });
      if (error) throw error;
      setFormSuccess('Account created! Check your email to verify before signing in.');
      setEmail('');
      setPassword('');
    } catch (err: any) {
      setFormError(err.message || 'Sign up failed');
    } finally {
      setFormLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-brand-bg flex items-center justify-center px-4">
      <motion.div
        className="w-full max-w-sm"
        initial={{ opacity: 0, y: 24 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
      >
        {/* Logo */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-gradient-to-br from-brand-green to-brand-blue mb-4 shadow-[0_0_30px_rgba(0,255,136,0.3)]">
            <Zap className="w-7 h-7 text-black" />
          </div>
          <h1 className="font-mono font-bold text-2xl text-brand-green tracking-[0.2em]">CHAINWISE</h1>
          <p className="font-mono text-xs text-brand-muted mt-1 tracking-widest">CRYPTO ROUTING AGENT</p>
        </div>

        {/* Banners */}
        {redirectMsg && (
          <div className="mb-4 px-4 py-3 rounded-xl bg-brand-green/10 border border-brand-green/20 text-brand-green font-mono text-xs text-center">
            {redirectMsg}
          </div>
        )}
        {authError && (
          <div className="mb-4 px-4 py-3 rounded-xl bg-red-950 border border-red-800 text-red-400 font-mono text-xs text-center">
            Authentication failed. Please try again.
          </div>
        )}

        {/* Card */}
        <div className="bg-brand-surface border border-brand-border rounded-2xl overflow-hidden">

          {/* Tab switcher */}
          <div className="grid grid-cols-3 border-b border-brand-border">
            {([
              { id: 'oauth',  label: 'Social'   },
              { id: 'signin', label: 'Sign In'  },
              { id: 'signup', label: 'Sign Up'  },
            ] as { id: Tab; label: string }[]).map(t => (
              <button
                key={t.id}
                onClick={() => { setTab(t.id); setFormError(''); setFormSuccess(''); }}
                className={`
                  py-3 font-mono text-xs tracking-widest transition-all duration-150
                  ${tab === t.id
                    ? 'text-brand-green border-b-2 border-brand-green bg-[rgba(0,255,136,0.05)]'
                    : 'text-brand-muted hover:text-brand-text'
                  }
                `}
              >
                {t.label}
              </button>
            ))}
          </div>

          <div className="p-6">
            <AnimatePresence mode="wait">

              {/* ── SOCIAL TAB ──────────────────────────────────────────── */}
              {tab === 'oauth' && (
                <motion.div
                  key="oauth"
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: 10 }}
                  transition={{ duration: 0.18 }}
                >
                  <p className="font-mono text-xs text-brand-muted text-center mb-5">
                    Sign in with your social account
                  </p>
                  <div className="space-y-2.5">
                    {OAUTH_PROVIDERS.map(({ id, label, Icon, border }) => (
                      <button
                        key={id}
                        onClick={() => handleOAuth(id)}
                        disabled={!!loadingProvider}
                        className={`
                          w-full flex items-center gap-3 px-4 py-3 rounded-xl
                          border border-brand-border font-mono text-xs text-brand-text
                          transition-all duration-200 ${border}
                          disabled:opacity-50 disabled:cursor-not-allowed
                        `}
                      >
                        {loadingProvider === id
                          ? <div className="w-4 h-4 border-2 border-brand-green/30 border-t-brand-green rounded-full animate-spin" />
                          : <Icon />
                        }
                        {loadingProvider === id ? 'Redirecting...' : `Continue with ${label}`}
                      </button>
                    ))}
                  </div>
                </motion.div>
              )}

              {/* ── SIGN IN TAB ─────────────────────────────────────────── */}
              {tab === 'signin' && (
                <motion.div
                  key="signin"
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: 10 }}
                  transition={{ duration: 0.18 }}
                >
                  <p className="font-mono text-xs text-brand-muted text-center mb-5">
                    Sign in with email and password
                  </p>
                  <form onSubmit={handleSignIn} className="space-y-3">
                    {/* Email */}
                    <div className="relative">
                      <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-brand-muted" />
                      <input
                        type="email"
                        value={email}
                        onChange={e => setEmail(e.target.value)}
                        placeholder="Email address"
                        required
                        className="w-full bg-brand-bg border border-brand-border rounded-xl pl-10 pr-4 py-3 font-mono text-sm text-brand-text placeholder:text-brand-muted outline-none focus:border-brand-dim transition-colors"
                      />
                    </div>
                    {/* Password */}
                    <div className="relative">
                      <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-brand-muted" />
                      <input
                        type={showPassword ? 'text' : 'password'}
                        value={password}
                        onChange={e => setPassword(e.target.value)}
                        placeholder="Password"
                        required
                        className="w-full bg-brand-bg border border-brand-border rounded-xl pl-10 pr-10 py-3 font-mono text-sm text-brand-text placeholder:text-brand-muted outline-none focus:border-brand-dim transition-colors"
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword(s => !s)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-brand-muted hover:text-brand-text transition-colors"
                      >
                        {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </button>
                    </div>

                    {formError && (
                      <p className="font-mono text-xs text-red-400 bg-red-950/50 border border-red-800/50 rounded-lg px-3 py-2">
                        {formError}
                      </p>
                    )}

                    <button
                      type="submit"
                      disabled={formLoading}
                      className="w-full flex items-center justify-center gap-2 py-3 rounded-xl bg-gradient-to-r from-brand-green to-brand-blue text-black font-mono font-bold text-sm disabled:opacity-60 disabled:cursor-not-allowed hover:shadow-[0_0_20px_rgba(0,255,136,0.3)] transition-all"
                    >
                      {formLoading
                        ? <div className="w-4 h-4 border-2 border-black/30 border-t-black rounded-full animate-spin" />
                        : <><ArrowRight className="w-4 h-4" /> Sign In</>
                      }
                    </button>
                  </form>
                </motion.div>
              )}

              {/* ── SIGN UP TAB ─────────────────────────────────────────── */}
              {tab === 'signup' && (
                <motion.div
                  key="signup"
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: 10 }}
                  transition={{ duration: 0.18 }}
                >
                  <p className="font-mono text-xs text-brand-muted text-center mb-5">
                    Create a free account
                  </p>
                  {formSuccess ? (
                    <div className="px-4 py-4 rounded-xl bg-brand-green/10 border border-brand-green/20 text-brand-green font-mono text-xs text-center leading-relaxed">
                      ✓ {formSuccess}
                    </div>
                  ) : (
                    <form onSubmit={handleSignUp} className="space-y-3">
                      <div className="relative">
                        <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-brand-muted" />
                        <input
                          type="email"
                          value={email}
                          onChange={e => setEmail(e.target.value)}
                          placeholder="Email address"
                          required
                          className="w-full bg-brand-bg border border-brand-border rounded-xl pl-10 pr-4 py-3 font-mono text-sm text-brand-text placeholder:text-brand-muted outline-none focus:border-brand-dim transition-colors"
                        />
                      </div>
                      <div className="relative">
                        <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-brand-muted" />
                        <input
                          type={showPassword ? 'text' : 'password'}
                          value={password}
                          onChange={e => setPassword(e.target.value)}
                          placeholder="Password (min 6 characters)"
                          minLength={6}
                          required
                          className="w-full bg-brand-bg border border-brand-border rounded-xl pl-10 pr-10 py-3 font-mono text-sm text-brand-text placeholder:text-brand-muted outline-none focus:border-brand-dim transition-colors"
                        />
                        <button
                          type="button"
                          onClick={() => setShowPassword(s => !s)}
                          className="absolute right-3 top-1/2 -translate-y-1/2 text-brand-muted hover:text-brand-text transition-colors"
                        >
                          {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                        </button>
                      </div>

                      {formError && (
                        <p className="font-mono text-xs text-red-400 bg-red-950/50 border border-red-800/50 rounded-lg px-3 py-2">
                          {formError}
                        </p>
                      )}

                      <button
                        type="submit"
                        disabled={formLoading}
                        className="w-full flex items-center justify-center gap-2 py-3 rounded-xl bg-gradient-to-r from-brand-green to-brand-blue text-black font-mono font-bold text-sm disabled:opacity-60 disabled:cursor-not-allowed hover:shadow-[0_0_20px_rgba(0,255,136,0.3)] transition-all"
                      >
                        {formLoading
                          ? <div className="w-4 h-4 border-2 border-black/30 border-t-black rounded-full animate-spin" />
                          : <><ArrowRight className="w-4 h-4" /> Create Account</>
                        }
                      </button>
                    </form>
                  )}
                </motion.div>
              )}

            </AnimatePresence>

            <p className="font-mono text-[10px] text-brand-muted text-center mt-5 leading-relaxed">
              By signing in you agree to our Terms of Service.
              <br />Your data is never sold or shared.
            </p>
          </div>
        </div>
      </motion.div>
    </div>
  );
}