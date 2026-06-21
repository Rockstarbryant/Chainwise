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
  { href: '/chat',       icon: MessageSquare, label: 'AGENT CHAT',       adminOnly: false },
  { href: '/coins',      icon: Search,        label: 'COIN EXPLORER',    adminOnly: false },
  { href: '/fees',       icon: BarChart3,     label: 'FEE TABLES',       adminOnly: false },
  { href: '/p2p',        icon: ArrowLeftRight, label: 'P2P MARKET',      adminOnly: false },
  { href: '/giveaways',  icon: Gift,          label: 'GIVEAWAYS',        adminOnly: false },
  { href: '/admin',      icon: ShieldCheck,   label: 'ADMIN',            adminOnly: true  },
  { href: '/admin/sync', icon: RefreshCw,     label: 'AUTO-SYNC',        adminOnly: true  },
  { href: '/admin/users',icon: UsersRound,    label: 'USER MANAGEMENT',  adminOnly: true  },
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

  const sidebarBody = (
    <aside className="
      w-64 h-full flex flex-col
      border-r-4 border-black
      bg-white dark:bg-slate-900
    ">

      <div className="px-4 py-4 border-b-4 border-black bg-yellow-400 flex items-center justify-between flex-shrink-0">
        <div className="flex items-center gap-1">
          <div className="w-10 h-10 bg-black flex items-center justify-center border-2 border-black">
            <Zap className="w-5 h-5 text-yellow-400" />
          </div>
          <div>
            <div className="font-sans font-black text-black text-lg leading-none tracking-widest uppercase">CHAINWISE</div>
            <div className="font-sans font-black text-black text-[10px] tracking-widest uppercase bg-white border border-black px-1 mt-1 inline-block">CRYPTO AGENT</div>
          </div>
        </div>
        <button
          onClick={onClose}
          aria-label="Close menu"
          className="
            md:hidden p-2 bg-red-600 text-white border-2 border-black
          "
        >
          <X className="w-5 h-5 font-black" />
        </button>
      </div>

      <nav className="px-3 pt-4 pb-2 space-y-2 flex-shrink-0 bg-slate-100 dark:bg-slate-800 border-b-4 border-black">
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
                  flex items-center gap-3 px-3 py-0.5 border-2 font-sans text-sm font-black tracking-wide
                  ${active
                    ? 'bg-blue-600 text-white border-blue-900'
                    : 'bg-white dark:bg-slate-950 text-black dark:text-white border-black'
                  }
                `}
              >
                <div className={`p-1 border-2 ${active ? 'border-white/50' : 'border-black dark:border-slate-700'}`}>
                  <Icon className="w-4 h-4 flex-shrink-0" />
                </div>
                {label}
                {active && <span className="ml-auto w-2.5 h-2.5 bg-yellow-400 border-2 border-black" />}
              </Link>
            );
          })}
      </nav>

      <div className="flex-1 min-h-0 flex flex-col">
        <ConversationHistory
          onNewChat={handleNewChat}
          refreshTrigger={historyRefreshTrigger}
        />
      </div>

      <div className="p-4 border-t-4 border-black bg-emerald-400 dark:bg-emerald-800 flex-shrink-0">
        {loading ? (
          <div className="h-10 bg-black animate-pulse border-2 border-black" />
        ) : isAuthenticated && user ? (
          <div className="space-y-3">
            <div className="flex items-center gap-3 bg-white dark:bg-slate-900 p-2 border-2 border-black">
              {user.user_metadata?.avatar_url ? (
                <Image
                  src={user.user_metadata.avatar_url}
                  width={32}
                  height={32}
                  className="border-2 border-black"
                  alt="User avatar"
                />
              ) : (
                <div className="w-8 h-8 bg-black flex items-center justify-center text-white text-sm font-black border-2 border-white">
                  {user.email?.[0]?.toUpperCase()}
                </div>
              )}
              <span className="font-sans font-black text-xs text-black dark:text-white truncate flex-1 uppercase tracking-wider">
                {user.user_metadata?.full_name || user.email}
              </span>
            </div>
            <button
              onClick={() => { signOut(); onClose(); }}
              className="w-full flex items-center justify-center gap-2 px-3 py-2 bg-black text-white border-2 border-black font-sans text-xs font-black tracking-widest uppercase"
            >
              <LogOut className="w-4 h-4" />
              SIGN OUT
            </button>
          </div>
        ) : (
          <Link
            href="/login"
            onClick={handleNavClick}
            className="w-full flex items-center justify-center gap-2 px-3 py-3 bg-black text-white border-2 border-black font-sans text-sm font-black tracking-widest uppercase"
          >
            <LogIn className="w-4 h-4" />
            SIGN IN
          </Link>
        )}
      </div>
    </aside>
  );

  return (
    <>
      <div className={`
        hidden md:flex flex-shrink-0 h-full z-40
        ${isOpen ? 'block' : 'hidden'}
      `}>
        {sidebarBody}
      </div>

      {isOpen && (
        <div
          className="md:hidden fixed inset-0 z-40 bg-black/80"
          onClick={onClose}
        />
      )}

      <div className={`
        md:hidden fixed top-0 left-0 z-50 h-full
        ${isOpen ? 'block' : 'hidden'}
      `}>
        {sidebarBody}
      </div>
    </>
  );
}