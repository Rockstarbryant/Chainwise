'use client';

import { useState } from 'react';
import { motion } from 'framer-motion';
import { Zap, X } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';

// Inline SVG brand icons — no lucide dependency
const GoogleIcon = () => (
  <svg viewBox="0 0 24 24" className="w-3.5 h-3.5" fill="currentColor">
    <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
    <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
    <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
    <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
  </svg>
);

const GithubIcon = () => (
  <svg viewBox="0 0 24 24" className="w-3.5 h-3.5" fill="currentColor">
    <path d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.531 1.032 1.531 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0022 12.017C22 6.484 17.522 2 12 2z"/>
  </svg>
);

const XIcon = () => (
  <svg viewBox="0 0 24 24" className="w-3.5 h-3.5" fill="currentColor">
    <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-4.714-6.231-5.401 6.231H2.746l7.73-8.835L1.254 2.25H8.08l4.253 5.622zm-1.161 17.52h1.833L7.084 4.126H5.117z"/>
  </svg>
);

const FacebookIcon = () => (
  <svg viewBox="0 0 24 24" className="w-3.5 h-3.5" fill="#1877F2">
    <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/>
  </svg>
);

const PROVIDERS = [
  { id: 'google',   label: 'Google',   Icon: GoogleIcon,   border: 'hover:border-red-500/50' },
  { id: 'github',   label: 'GitHub',   Icon: GithubIcon,   border: 'hover:border-gray-400/50' },
  { id: 'twitter',  label: 'X',        Icon: XIcon,        border: 'hover:border-sky-500/50' },
  { id: 'facebook', label: 'Facebook', Icon: FacebookIcon, border: 'hover:border-blue-500/50' },
] as const;

interface Props {
  onClose?: () => void;
}

export default function AuthGate({ onClose }: Props) {
  const { signIn } = useAuth();
  const [loading, setLoading] = useState<string | null>(null);

  const handleSignIn = async (provider: string) => {
    setLoading(provider);
    try {
      await signIn(provider as any);
    } catch {
      setLoading(null);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm px-4">
      <motion.div
        className="w-full max-w-sm bg-brand-surface border border-brand-border rounded-2xl p-6 relative"
        initial={{ opacity: 0, scale: 0.95, y: 16 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        transition={{ duration: 0.25 }}
      >
        {onClose && (
          <button
            onClick={onClose}
            className="absolute top-4 right-4 text-brand-muted hover:text-brand-text transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        )}

        {/* Header */}
        <div className="text-center mb-6">
          <div className="inline-flex items-center justify-center w-12 h-12 rounded-xl bg-gradient-to-br from-brand-green to-brand-blue mb-3 shadow-[0_0_20px_rgba(0,255,136,0.3)]">
            <Zap className="w-6 h-6 text-black" />
          </div>
          <h2 className="font-mono font-bold text-brand-green text-base tracking-widest">
            5 FREE CHATS USED
          </h2>
          <p className="font-mono text-xs text-brand-muted mt-2 leading-relaxed">
            Sign in free to unlock unlimited conversations, chat history, coin explorer, and more.
          </p>
        </div>

        {/* Provider buttons */}
        <div className="grid grid-cols-2 gap-2 mb-5">
          {PROVIDERS.map(({ id, label, Icon, border }) => (
            <button
              key={id}
              onClick={() => handleSignIn(id)}
              disabled={!!loading}
              className={`
                flex items-center justify-center gap-2 px-3 py-2.5 rounded-xl
                border border-brand-border font-mono text-xs text-brand-text
                transition-all duration-150 ${border}
                disabled:opacity-50 disabled:cursor-not-allowed
              `}
            >
              {loading === id ? (
                <div className="w-3.5 h-3.5 border-2 border-brand-green/30 border-t-brand-green rounded-full animate-spin" />
              ) : (
                <Icon />
              )}
              {loading === id ? '...' : label}
            </button>
          ))}
        </div>

        {/* Feature list */}
        <div className="space-y-1.5 border-t border-brand-border pt-4">
          {[
            '✓ Unlimited conversations',
            '✓ Full chat history',
            '✓ Coin explorer',
            '✓ Fee table management',
          ].map(f => (
            <div key={f} className="font-mono text-[11px] text-brand-muted">{f}</div>
          ))}
        </div>
      </motion.div>
    </div>
  );
}