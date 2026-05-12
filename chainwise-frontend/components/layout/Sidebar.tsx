'use client';

import Link from 'next/link';
import Image from 'next/image';
import { usePathname, useRouter } from 'next/navigation';
import {
  MessageSquare, BarChart3, Zap, Search,
  LogOut, LogIn, ShieldCheck, ArrowLeftRight, Gift,
  X, RefreshCw, UsersRound,
} from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import ConversationHistory from './ConversationHistory';
import { useSidebarRefresh } from '@/contexts/SidebarRefreshContext';

const NAV_TOP = [
  { href: '/chat',       icon: MessageSquare, label: 'Agent Chat',       adminOnly: false },
  { href: '/coins',      icon: Search,        label: 'Coin Explorer',    adminOnly: false },
  { href: '/fees',       icon: BarChart3,     label: 'Fee Tables',       adminOnly: false },
  { href: '/p2p',        icon: ArrowLeftRight, label: 'P2P Market',      adminOnly: false },
  { href: '/giveaways',  icon: Gift,          label: 'Giveaways',        adminOnly: false },
  { href: '/admin',      icon: ShieldCheck,   label: 'Admin',            adminOnly: true  },
  { href: '/admin/sync', icon: RefreshCw,     label: 'Auto-Sync',        adminOnly: true  },
  { href: '/admin/users',icon: UsersRound,    label: 'User Management',  adminOnly: true  },
];

interface Props {
  isOpen: boolean;
  onClose: () => void;
}

export default function Sidebar({ isOpen, onClose }: Props) {
  const pathname = usePathname();
  const router   = useRouter();
  const { user, isAuthenticated, signOut, loading } = useAuth();
  const { historyRefreshTrigger } = useSidebarRefresh();

  const ADMIN_EMAIL = process.env.NEXT_PUBLIC_ADMIN_EMAIL || 'yobra194@gmail.com';
  const isAdmin = user?.email === ADMIN_EMAIL;

  const handleNewChat = () => {
    onClose();
    router.push('/chat');
  };

  const handleNavClick = () => onClose();

  /* ─── Shared sidebar body ─────────────────────────────────────────────── */
  const sidebarBody = (
    <aside className="
      w-60 h-full
      border-r border-zinc-200 dark:border-zinc-800
      bg-white dark:bg-zinc-950
      flex flex-col
      transition-colors duration-200
    ">

      {/* Logo row */}
      <div className="px-4 py-4 border-b border-zinc-200 dark:border-zinc-800 flex items-center justify-between flex-shrink-0">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-emerald-500 dark:bg-emerald-600 flex items-center justify-center">
            <Zap className="w-4 h-4 text-zinc-950" />
          </div>
          <div>
            <div className="font-sans font-bold text-emerald-600 dark:text-emerald-500 text-sm tracking-[0.15em]">CHAINWISE</div>
            <div className="font-sans text-[9px] font-medium text-zinc-500 dark:text-zinc-400 tracking-widest uppercase">CRYPTO AGENT</div>
          </div>
        </div>
        {/* Close — visible on mobile drawer */}
        <button
          onClick={onClose}
          aria-label="Close menu"
          className="
            p-1.5 rounded-lg
            text-zinc-500 dark:text-zinc-400
            hover:bg-zinc-100 dark:hover:bg-zinc-800
            transition-colors duration-150
          "
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Nav links */}
      <nav className="px-3 pt-3 pb-1 space-y-0.5 flex-shrink-0">
        {NAV_TOP
          .filter(item => !item.adminOnly || isAdmin)
          .map(({ href, icon: Icon, label }) => {
            const active = pathname.startsWith(href);
            return (
              <Link
                key={href}
                href={href}
                onClick={handleNavClick}
                className={`
                  flex items-center gap-2.5 px-3 py-2 rounded-lg
                  font-sans text-sm transition-colors duration-200
                  ${active
                    ? 'bg-emerald-50 dark:bg-emerald-500/10 text-emerald-600 dark:text-emerald-500 border border-emerald-200 dark:border-emerald-500/20'
                    : 'text-zinc-500 dark:text-zinc-400 hover:bg-zinc-50 dark:hover:bg-zinc-900 hover:text-zinc-700 dark:hover:text-zinc-300'
                  }
                `}
              >
                <Icon className="w-4 h-4 flex-shrink-0" />
                {label}
                {active && <span className="ml-auto w-1.5 h-1.5 rounded-full bg-emerald-500" />}
              </Link>
            );
          })}
      </nav>

      {/* Conversation history */}
      <div className="border-t border-zinc-200 dark:border-zinc-800 mt-2 flex-1 min-h-0 flex flex-col">
        <ConversationHistory
          onNewChat={handleNewChat}
          refreshTrigger={historyRefreshTrigger}
        />
      </div>

      {/* User footer */}
      <div className="px-3 py-3 border-t border-zinc-200 dark:border-zinc-800 flex-shrink-0">
        {loading ? (
          <div className="h-8 bg-zinc-100 dark:bg-zinc-800 rounded-lg animate-pulse" />
        ) : isAuthenticated && user ? (
          <div className="space-y-1">
            <div className="flex items-center gap-2 px-2 py-1">
              {user.user_metadata?.avatar_url ? (
                <Image
                  src={user.user_metadata.avatar_url}
                  width={24}
                  height={24}
                  className="rounded-full"
                  alt="User avatar"
                />
              ) : (
                <div className="w-6 h-6 rounded-full bg-emerald-500 flex items-center justify-center text-zinc-950 text-[10px] font-bold">
                  {user.email?.[0]?.toUpperCase()}
                </div>
              )}
              <span className="font-sans text-xs text-zinc-900 dark:text-zinc-100 truncate flex-1">
                {user.user_metadata?.full_name || user.email}
              </span>
            </div>
            <button
              onClick={() => { signOut(); onClose(); }}
              className="w-full flex items-center gap-2 px-2 py-1.5 rounded-lg font-sans text-xs text-zinc-500 dark:text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-900 transition-colors duration-200"
            >
              <LogOut className="w-3.5 h-3.5" />
              Sign out
            </button>
          </div>
        ) : (
          <Link
            href="/login"
            onClick={handleNavClick}
            className="flex items-center gap-2 px-3 py-2 rounded-lg font-sans text-sm text-zinc-500 dark:text-zinc-400 border border-zinc-200 dark:border-zinc-800 hover:border-zinc-300 dark:hover:border-zinc-700 hover:text-zinc-700 dark:hover:text-zinc-300 transition-colors duration-200"
          >
            <LogIn className="w-4 h-4" />
            Sign in
          </Link>
        )}
      </div>
    </aside>
  );

  return (
    <>
      {/* ── Desktop: static sidebar ───────────────────────────────────── */}
      <div
        className={`
          hidden md:flex flex-shrink-0 h-full
          transform transition-transform duration-[250ms] ease-in-out
          ${isOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0'}
        `}
      >
        {sidebarBody}
      </div>

      {/* ── Mobile: backdrop ──────────────────────────────────────────── */}
      {isOpen && (
        <div
          className="md:hidden fixed inset-0 z-40 bg-zinc-950/60 backdrop-blur-sm"
          onClick={onClose}
        />
      )}

      {/* ── Mobile: slide-in drawer ───────────────────────────────────── */}
      <div
        className={`
          md:hidden fixed top-0 left-0 z-50 h-full
          transform transition-transform duration-[250ms] ease-in-out
          ${isOpen ? 'translate-x-0' : '-translate-x-full'}
        `}
      >
        {sidebarBody}
      </div>
    </>
  );
}