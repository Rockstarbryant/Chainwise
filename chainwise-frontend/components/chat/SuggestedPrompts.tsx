'use client';

import { motion } from 'framer-motion';
import { DollarSign, Battery, Globe, Route, Scale, Gift, Sparkles } from 'lucide-react';

const PROMPTS = [
  { icon: <DollarSign className="w-5 h-5" />, text: 'Cheapest chain to withdraw USDT from Bybit?' },
  { icon: <Battery className="w-5 h-5" />, text: 'I have 7 USDC on Ethereum mainnet but zero gas. Help.' },
  { icon: <Globe className="w-5 h-5" />, text: 'I am in Kenya. CoinEx P2P doesn\'t work. How do I deposit $3?' },
  { icon: <Route className="w-5 h-5" />, text: 'Best bridge route: USDC on Ethereum → Base chain?' },
  { icon: <Scale className="w-5 h-5" />, text: 'Compare USDT withdrawal fees across all exchanges' },
  { icon: <Gift className="w-5 h-5" />, text: 'Any active giveaways on Binance right now?' },
];

export default function SuggestedPrompts({ onSelect }: { onSelect: (text: string) => void }) {
  return (
    <div className="flex flex-col items-center gap-10 py-12">

      {/* Hero */}
      <motion.div
        className="text-center flex flex-col items-center"
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
      >
        <div className="w-12 h-12 rounded-2xl bg-zinc-100 dark:bg-zinc-800 flex items-center justify-center mb-6">
          <Sparkles className="w-6 h-6 text-zinc-900 dark:text-zinc-100" />
        </div>
        <h1 className="font-sans font-semibold text-3xl text-zinc-900 dark:text-zinc-100 tracking-tight mb-2">
          Chainwise
        </h1>
        <p className="text-zinc-500 text-xs tracking-widest font-sans uppercase">
          Smart Routing · Zero Fees · Cross-Chain Intelligence
        </p>
      </motion.div>

      {/* Stats */}
      <motion.div
        className="grid grid-cols-4 gap-4 w-full max-w-lg"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.2, duration: 0.4 }}
      >
        {[
          { label: 'Exchanges', value: '6+' },
          { label: 'Bridges',   value: 'LI.FI' },
          { label: 'Live Data', value: 'CoinGecko' },
          { label: 'Chains',    value: '10+' },
        ].map(stat => (
          <div
            key={stat.label}
            className="bg-zinc-50 dark:bg-zinc-900/50 border border-zinc-200 dark:border-zinc-800 rounded-xl p-4 text-center"
          >
            <div className="text-zinc-900 dark:text-zinc-100 font-sans font-medium text-sm">{stat.value}</div>
            <div className="text-zinc-500 font-sans text-[10px] tracking-wide mt-1 uppercase">{stat.label}</div>
          </div>
        ))}
      </motion.div>

      {/* Prompts */}
      <motion.div
        className="w-full max-w-lg"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.35, duration: 0.4 }}
      >
        <p className="text-zinc-400 dark:text-zinc-500 font-sans text-xs font-medium mb-4">Try asking</p>
        <div className="grid grid-cols-1 gap-3">
          {PROMPTS.map((p, i) => (
            <motion.button
              key={i}
              onClick={() => onSelect(p.text)}
              className="
                flex items-center gap-4 text-left px-5 py-4 rounded-xl
                bg-white dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800
                text-zinc-700 dark:text-zinc-300 font-sans text-sm
                hover:border-zinc-300 dark:hover:border-zinc-700 hover:bg-zinc-50 dark:hover:bg-zinc-900
                transition-all duration-200
              "
              whileTap={{ scale: 0.99 }}
            >
              <span className="text-zinc-400 dark:text-zinc-500">{p.icon}</span>
              {p.text}
            </motion.button>
          ))}
        </div>
      </motion.div>
    </div>
  );
}