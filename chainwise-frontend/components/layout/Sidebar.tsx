'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { MessageSquare, BarChart3, Zap, Search, Settings, LogOut, LogIn, ShieldCheck } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import ConversationHistory from './ConversationHistory';
import { useState } from 'react';

const NAV_TOP = [
  { href: '/chat',  icon: MessageSquare, label: 'Agent Chat',    adminOnly: false },
  { href: '/coins', icon: Search,        label: 'Coin Explorer', adminOnly: false },
  { href: '/fees',  icon: BarChart3,     label: 'Fee Tables',    adminOnly: false },
  { href: '/admin', icon: ShieldCheck,   label: 'Admin',         adminOnly: true  },
];

export default function Sidebar() {
  const pathname   = usePathname();
  const router     = useRouter();
  const { user, isAuthenticated, signOut, loading } = useAuth();
  const [newChatKey, setNewChatKey] = useState(0);

  const ADMIN_EMAIL = 'yobra194@gmail.com'; // or read from env
  const isAdmin = user?.email === ADMIN_EMAIL;

  const handleNewChat = () => {
    setNewChatKey(k => k + 1);
    router.push('/chat');
  };

  return (
    <aside className="w-56 flex-shrink-0 h-full border-r border-brand-border bg-brand-surface flex flex-col">

      {/* Logo */}
      <div className="px-4 py-4 border-b border-brand-border">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-brand-green to-brand-blue flex items-center justify-center shadow-[0_0_12px_rgba(0,255,136,0.4)]">
            <Zap className="w-4 h-4 text-black" />
          </div>
          <div>
            <div className="font-mono font-bold text-brand-green text-sm tracking-[0.15em]">CHAINWISE</div>
            <div className="font-mono text-[9px] text-brand-muted tracking-widest">CRYPTO AGENT</div>
          </div>
        </div>
      </div>

      {/* Nav */}
      <nav className="px-3 pt-3 pb-1 space-y-0.5">
        {NAV_TOP
        .filter(item => !item.adminOnly || isAdmin)
        .map(({ href, icon: Icon, label }) => {
          const active = pathname.startsWith(href);
          return (
            <Link
              key={href}
              href={href}
              className={`
                flex items-center gap-2.5 px-3 py-2 rounded-lg font-mono text-xs transition-all duration-150
                ${active
                  ? 'bg-[rgba(0,255,136,0.1)] text-brand-green border border-[rgba(0,255,136,0.2)]'
                  : 'text-brand-muted hover:text-brand-text hover:bg-[rgba(255,255,255,0.03)]'
                }
              `}
            >
              <Icon className="w-3.5 h-3.5" />
              {label}
              {active && <span className="ml-auto w-1.5 h-1.5 rounded-full bg-brand-green shadow-[0_0_6px_rgba(0,255,136,0.8)]" />}
            </Link>
          );
        })}
      </nav>

      {/* Conversation history */}
      <div className="border-t border-brand-border mt-2 flex-1 min-h-0 flex flex-col">
        <ConversationHistory onNewChat={handleNewChat} />
      </div>

      {/* User footer */}
      <div className="px-3 py-3 border-t border-brand-border">
        {loading ? (
          <div className="h-8 bg-brand-border rounded-lg animate-pulse" />
        ) : isAuthenticated && user ? (
          <div className="space-y-1">
            <div className="flex items-center gap-2 px-2 py-1">
              {user.user_metadata?.avatar_url ? (
                <img src={user.user_metadata.avatar_url} className="w-6 h-6 rounded-full" alt="" />
              ) : (
                <div className="w-6 h-6 rounded-full bg-brand-green flex items-center justify-center text-black text-[10px] font-bold">
                  {user.email?.[0]?.toUpperCase()}
                </div>
              )}
              <span className="font-mono text-[11px] text-brand-text truncate flex-1">
                {user.user_metadata?.full_name || user.email}
              </span>
            </div>
            <button
              onClick={() => signOut()}
              className="w-full flex items-center gap-2 px-2 py-1.5 rounded-lg font-mono text-[11px] text-brand-muted hover:text-red-400 hover:bg-red-950/30 transition-all"
            >
              <LogOut className="w-3 h-3" />
              Sign out
            </button>
          </div>
        ) : (
          <Link
            href="/login"
            className="flex items-center gap-2 px-3 py-2 rounded-lg font-mono text-xs text-brand-muted hover:text-brand-green hover:bg-[rgba(0,255,136,0.05)] border border-brand-border hover:border-brand-dim transition-all"
          >
            <LogIn className="w-3.5 h-3.5" />
            Sign in
          </Link>
        )}
      </div>
    </aside>
  );
}