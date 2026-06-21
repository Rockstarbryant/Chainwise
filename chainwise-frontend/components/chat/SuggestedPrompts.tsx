'use client';

import { motion } from 'framer-motion';
import { DollarSign, Battery, Globe, Route, Scale, Gift, Sparkles } from 'lucide-react';

const PROMPTS = [
  { icon: <DollarSign className="w-5 h-5 shrink-0 text-white" />, text: 'Cheapest chain to withdraw USDT from Bybit?', bg: 'bg-cyan-600 border-cyan-800' },
  { icon: <Battery className="w-5 h-5 shrink-0 text-white" />,    text: 'I have 7 USDC on Ethereum but zero gas. Help.', bg: 'bg-indigo-600 border-indigo-800' },
  { icon: <Globe className="w-5 h-5 shrink-0 text-white" />,      text: 'I am in Kenya. CoinEx P2P doesn\'t work. How do I deposit $3 to CoinEx?', bg: 'bg-fuchsia-600 border-fuchsia-800' },
  { icon: <Route className="w-5 h-5 shrink-0 text-white" />,      text: 'Best bridge route: USDC on Ethereum → Base chain?', bg: 'bg-orange-600 border-orange-800' },
  { icon: <Scale className="w-5 h-5 shrink-0 text-white" />,      text: 'Compare USDT withdrawal fees across all exchanges', bg: 'bg-teal-600 border-teal-800' },
  { icon: <Gift className="w-5 h-5 shrink-0 text-white" />,       text: 'Any active giveaways on Binance right now?', bg: 'bg-rose-600 border-rose-800' },
];

const STATS = [
  { label: 'Exchanges', value: '6+', bg: 'bg-red-500 border-red-800' },
  { label: 'Bridges',   value: 'LI.FI', bg: 'bg-amber-500 border-amber-800' },
  { label: 'Live Data', value: 'CoinGecko', bg: 'bg-lime-500 border-lime-800' },
  { label: 'Chains',    value: '10+', bg: 'bg-blue-500 border-blue-800' },
];

export default function SuggestedPrompts({ onSelect }: { onSelect: (text: string) => void }) {
  return (
    <div className="h-full flex flex-col justify-between px-3 sm:px-6 py-6 sm:py-8 max-w-3xl mx-auto w-full">

      {/* ── Hero ──────────────────────────────────────────────────────── */}
      <motion.div
        className="flex flex-col items-center text-center gap-3"
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
      >
        <div className="p-3 bg-violet-600 text-white border-4 border-violet-900 shadow-none">
          <Sparkles className="w-8 h-8" />
        </div>
        <div>
          <h1 className="font-sans font-black text-3xl sm:text-4xl text-slate-900 dark:text-white uppercase tracking-tight">
            ChainWise
          </h1>
          <p className="bg-black text-white px-3 py-1 font-black text-[10px] tracking-widest uppercase mt-2 border-2 border-slate-700">
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
            className={`${stat.bg} border-2 px-2 py-3 text-center`}
          >
            <div className="text-white font-black text-sm sm:text-base leading-none">
              {stat.value}
            </div>
            <div className="text-white font-black text-[9px] sm:text-[10px] tracking-widest mt-1.5 uppercase leading-none bg-black/30 py-0.5">
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
        <p className="bg-slate-900 text-white text-center font-black text-xs py-1.5 mb-3 border-2 border-slate-700 uppercase tracking-widest">
          Try asking
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 sm:gap-3">
          {PROMPTS.map((p, i) => (
            <motion.button
              key={i}
              onClick={() => onSelect(p.text)}
              className={`
                flex items-start gap-3 text-left px-4 py-3 border-4 text-white
                font-sans font-black text-xs sm:text-sm leading-snug
                ${p.bg}
              `}
              whileTap={{ scale: 0.985 }}
            >
              <span className="mt-0.5 bg-black/30 p-1">{p.icon}</span>
              <span>{p.text}</span>
            </motion.button>
          ))}
        </div>
      </motion.div>

    </div>
  );
}