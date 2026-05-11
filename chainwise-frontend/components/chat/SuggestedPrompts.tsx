'use client';

import { motion } from 'framer-motion';
import { DollarSign, Battery, Globe, Route, Scale, Gift, Sparkles } from 'lucide-react';

const PROMPTS = [
  { icon: <DollarSign className="w-4 h-4 shrink-0" />, text: 'Cheapest chain to withdraw USDT from Bybit?' },
  { icon: <Battery className="w-4 h-4 shrink-0" />,    text: 'I have 7 USDC on Ethereum but zero gas. Help.' },
  { icon: <Globe className="w-4 h-4 shrink-0" />,      text: 'I am in Kenya. CoinEx P2P doesn\'t work. How do I deposit $3 to CoinEx?' },
  { icon: <Route className="w-4 h-4 shrink-0" />,      text: 'Best bridge route: USDC on Ethereum → Base chain?' },
  { icon: <Scale className="w-4 h-4 shrink-0" />,      text: 'Compare USDT withdrawal fees across all exchanges' },
  { icon: <Gift className="w-4 h-4 shrink-0" />,       text: 'Any active giveaways on Binance right now?' },
];

const STATS = [
  { label: 'Exchanges', value: '6+' },
  { label: 'Bridges',   value: 'LI.FI' },
  { label: 'Live Data', value: 'CoinGecko' },
  { label: 'Chains',    value: '10+' },
];

export default function SuggestedPrompts({ onSelect }: { onSelect: (text: string) => void }) {
  return (
    /*
     * h-full + flex flex-col: this component fills whatever height the parent
     * gives it (the non-scrolling zone in ChatWindow) and distributes space
     * between hero, stats, and prompts without ever needing to scroll.
     */
    <div className="h-full flex flex-col justify-between px-3 sm:px-6 py-6 sm:py-8 max-w-3xl mx-auto w-full">

      {/* ── Hero ──────────────────────────────────────────────────────── */}
      <motion.div
        className="flex flex-col items-center text-center gap-3"
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
      >
        <div className="w-11 h-11 rounded-2xl bg-zinc-100 dark:bg-zinc-800 flex items-center justify-center">
          <Sparkles className="w-5 h-5 text-zinc-900 dark:text-zinc-100" />
        </div>
        <div>
          <h1 className="font-sans font-semibold text-2xl sm:text-3xl text-zinc-900 dark:text-zinc-100 tracking-tight">
            ChainWise
          </h1>
          <p className="text-zinc-500 text-[10px] tracking-widest font-sans uppercase mt-1">
            Smart Routing · Zero Fees · Cross-Chain Intelligence
          </p>
        </div>
      </motion.div>

      {/* ── Stats strip ───────────────────────────────────────────────── */}
      <motion.div
        className="grid grid-cols-4 gap-2 sm:gap-3"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.15, duration: 0.35 }}
      >
        {STATS.map(stat => (
          <div
            key={stat.label}
            className="bg-zinc-50 dark:bg-zinc-900/60 border border-zinc-200 dark:border-zinc-800 rounded-xl px-2 py-3 text-center"
          >
            <div className="text-zinc-900 dark:text-zinc-100 font-sans font-semibold text-xs sm:text-sm leading-none">
              {stat.value}
            </div>
            <div className="text-zinc-500 font-sans text-[9px] sm:text-[10px] tracking-wide mt-1.5 uppercase leading-none">
              {stat.label}
            </div>
          </div>
        ))}
      </motion.div>

      {/* ── Prompts ───────────────────────────────────────────────────── */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.28, duration: 0.35 }}
      >
        <p className="text-zinc-400 dark:text-zinc-500 font-sans text-xs font-medium mb-3">
          Try asking
        </p>
        {/*
          2-column grid on sm+, 1-column on mobile.
          Each button is intentionally compact (py-3 instead of py-4) so
          6 items fit in the remaining height without overflow.
        */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 sm:gap-2.5">
          {PROMPTS.map((p, i) => (
            <motion.button
              key={i}
              onClick={() => onSelect(p.text)}
              className="
                flex items-start gap-3 text-left px-4 py-3 rounded-xl
                bg-white dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800
                text-zinc-600 dark:text-zinc-400 font-sans text-xs sm:text-sm leading-snug
                hover:border-zinc-300 dark:hover:border-zinc-700
                hover:bg-zinc-50 dark:hover:bg-zinc-900
                hover:text-zinc-900 dark:hover:text-zinc-200
                transition-all duration-150
              "
              whileTap={{ scale: 0.985 }}
            >
              <span className="text-zinc-400 dark:text-zinc-500 mt-0.5">{p.icon}</span>
              <span>{p.text}</span>
            </motion.button>
          ))}
        </div>
      </motion.div>

    </div>
  );
}