'use client';

import { motion } from 'framer-motion';

const PROMPTS = [
  { icon: '💸', text: 'Cheapest chain to withdraw USDT from Bybit?' },
  { icon: '🔋', text: 'I have 7 USDC on Ethereum mainnet but zero gas. Help.' },
  { icon: '🌍', text: 'I am in Kenya. CoinEx P2P doesn\'t work. How do I deposit $3?' },
  { icon: '🌉', text: 'Best bridge route: USDC on Ethereum → Base chain?' },
  { icon: '⚖️', text: 'Compare USDT withdrawal fees across all exchanges' },
  { icon: '🎁', text: 'Any active giveaways on Binance right now?' },
];

export default function SuggestedPrompts({ onSelect }: { onSelect: (text: string) => void }) {
  return (
    <div className="flex flex-col items-center gap-8 py-10">

      {/* Hero */}
      <motion.div
        className="text-center"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
      >
        <div className="text-5xl mb-4 drop-shadow-[0_0_20px_rgba(0,255,136,0.6)]">⚡</div>
        <h1 className="font-mono font-bold text-3xl text-brand-green tracking-[0.2em] mb-2">
          CHAINWISE
        </h1>
        <p className="text-brand-muted text-xs tracking-[0.3em] font-mono">
          SMART ROUTING · ZERO FEES · CROSS-CHAIN INTELLIGENCE
        </p>
      </motion.div>

      {/* Stats */}
      <motion.div
        className="grid grid-cols-4 gap-3 w-full max-w-lg"
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
            className="bg-brand-surface border border-brand-border rounded-xl p-3 text-center"
          >
            <div className="text-brand-green font-mono font-bold text-sm">{stat.value}</div>
            <div className="text-brand-muted font-mono text-[9px] tracking-widest mt-0.5">{stat.label}</div>
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
        <p className="text-brand-muted font-mono text-[10px] tracking-[0.3em] mb-3">TRY ASKING</p>
        <div className="grid grid-cols-1 gap-2">
          {PROMPTS.map((p, i) => (
            <motion.button
              key={i}
              onClick={() => onSelect(p.text)}
              className="
                flex items-center gap-3 text-left px-4 py-3 rounded-xl
                bg-brand-surface border border-brand-border
                text-brand-text font-mono text-xs
                hover:border-brand-dim hover:bg-[rgba(0,255,136,0.05)]
                hover:text-brand-green transition-all duration-200
                active:scale-[0.99]
              "
              whileHover={{ x: 4 }}
              transition={{ type: 'spring', stiffness: 400, damping: 30 }}
            >
              <span className="text-base">{p.icon}</span>
              {p.text}
            </motion.button>
          ))}
        </div>
      </motion.div>
    </div>
  );
}