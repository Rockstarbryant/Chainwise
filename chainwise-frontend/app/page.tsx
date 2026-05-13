// app/page.tsx — SSR Server Component
// Replace the existing page.tsx (which redirected to /chat) with this file.
import Link from 'next/link';
import {
  ArrowRight,
  Bot,
  BarChart3,
  ArrowLeftRight,
  Search,
  Database,
  RefreshCw,
  Zap,
  Shield,
  Clock,
  TrendingDown,
  Layers,
} from 'lucide-react';

/* ─── Static data ─────────────────────────────────────────────────────────── */

const FEATURES = [
  {
    icon: BarChart3,
    title: 'Withdrawal Fee Tables',
    desc: 'Every supported token, every chain, every exchange. Withdrawal fees, minimum amounts, and ETAs — sourced directly from CEX APIs and enriched by CoinGecko. Auto-refreshed every hour.',
  },
  {
    icon: ArrowLeftRight,
    title: 'P2P Market Aggregator',
    desc: 'Live buy and sell ads from Binance, Bybit, KuCoin, MEXC, HTX, Gate.io, and OKX in one view. Ads are refreshed every 15 minutes via direct exchange APIs and purged on expiry.',
  },
  {
    icon: Bot,
    title: 'AI Routing Agent',
    desc: 'Ask in plain language: cheapest withdrawal route, whether an exchange supports a token, or how to move funds cross-chain with minimal fees. The agent queries live data from the database.',
  },
  {
    icon: Search,
    title: 'Coin Explorer',
    desc: 'Search any coin or token and instantly see which exchanges list it, what each charges to withdraw per network, and the minimum deposit requirements — before you fund your account.',
  },
];

const STATS = [
  { value: '7',     label: 'Exchanges tracked'  },
  { value: '500+',  label: 'Tokens indexed'      },
  { value: '15 min', label: 'P2P data refresh'   },
  { value: '1 hr',  label: 'Fee data refresh'    },
];

const HOW_IT_WORKS = [
  {
    step: '01',
    icon: Database,
    title: 'Ingestion',
    desc: 'CEX APIs feed withdrawal fees, supported networks, and minimum amounts directly into MongoDB. CoinGecko supplies token prices and additional chain metadata.',
  },
  {
    step: '02',
    icon: RefreshCw,
    title: 'Caching & refresh',
    desc: 'All data is cached in Redis. Fee tables auto-refresh every hour. P2P ads carry a 15-minute TTL — expired entries are purged and replaced by background cron jobs automatically.',
  },
  {
    step: '03',
    icon: Zap,
    title: 'Query',
    desc: 'Ask the AI agent in natural language, or use the fee tables and P2P market pages to browse raw data directly. No account required for basic lookups.',
  },
];

const EXCHANGES = ['Binance', 'Bybit', 'KuCoin', 'MEXC', 'HTX', 'Gate.io', 'OKX'];

const USE_CASES = [
  {
    icon: TrendingDown,
    title: 'Minimise withdrawal costs',
    desc: 'Before withdrawing, check which network on which exchange charges the least — across all seven exchanges at once, without logging in to any of them.',
  },
  {
    icon: Layers,
    title: 'Best P2P exit rate',
    desc: 'Find the exchange with the highest buy rate in your region, then plan the cheapest route to get funds there using withdrawal fee data.',
  },
  {
    icon: Shield,
    title: 'Verify before depositing',
    desc: 'Confirm an exchange supports your token and the exact network you plan to use before sending a deposit. Avoid funds stuck at an unsupported address.',
  },
  {
    icon: Clock,
    title: 'Estimate transfer time',
    desc: 'ETA data tells you how long a withdrawal will take on each network so you can plan time-sensitive moves without guessing.',
  },
];

/* ─── Page ────────────────────────────────────────────────────────────────── */

export default function HomePage() {
  return (
    <div className="flex-1 overflow-y-auto bg-white dark:bg-zinc-950 text-zinc-900 dark:text-zinc-100">

      {/* ── Hero ──────────────────────────────────────────────────────────── */}
      <section className="max-w-5xl mx-auto px-5 sm:px-8 pt-16 sm:pt-24 pb-14 sm:pb-20">

        {/* Live badge */}
        <div className="inline-flex items-center gap-2 mb-8 px-3 py-1.5 border border-zinc-200 dark:border-zinc-800 rounded-full">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse flex-shrink-0" />
          <span className="font-mono text-[10px] text-zinc-500 dark:text-zinc-400 uppercase tracking-[0.18em]">
            Live data · 7 exchanges · AI-powered
          </span>
        </div>

        <h1 className="font-mono text-[2.35rem] sm:text-5xl lg:text-[3.5rem] font-bold leading-[1.08] tracking-tight text-zinc-900 dark:text-zinc-50 mb-6 max-w-3xl">
          Find the cheapest<br />
          crypto route.<br />
          <span className="text-emerald-600 dark:text-emerald-500">Before you move.</span>
        </h1>

        <p className="font-sans text-base sm:text-lg text-zinc-500 dark:text-zinc-400 max-w-xl mb-10 leading-relaxed">
          ChainWise aggregates withdrawal fees, P2P market rates, and supported chains
          across seven major exchanges — so you stop overpaying and start routing smart.
        </p>

        <div className="flex flex-wrap items-center gap-3">
          <Link
            href="/chat"
            className="
              inline-flex items-center gap-2
              px-5 py-2.5
              bg-emerald-600 dark:bg-emerald-500
              text-white dark:text-zinc-950
              rounded-lg
              font-mono text-xs font-bold uppercase tracking-widest
              hover:bg-emerald-700 dark:hover:bg-emerald-400
              transition-colors duration-150
            "
          >
            Ask the Agent
            <ArrowRight className="w-3.5 h-3.5" />
          </Link>
          <Link
            href="/fees"
            className="
              inline-flex items-center gap-2
              px-5 py-2.5
              border border-zinc-200 dark:border-zinc-800
              text-zinc-600 dark:text-zinc-400
              rounded-lg
              font-mono text-xs uppercase tracking-widest
              hover:border-zinc-400 dark:hover:border-zinc-600
              hover:text-zinc-900 dark:hover:text-zinc-200
              transition-colors duration-150
            "
          >
            Fee Tables
          </Link>
          <Link
            href="/p2p"
            className="
              inline-flex items-center gap-2
              px-5 py-2.5
              border border-zinc-200 dark:border-zinc-800
              text-zinc-600 dark:text-zinc-400
              rounded-lg
              font-mono text-xs uppercase tracking-widest
              hover:border-zinc-400 dark:hover:border-zinc-600
              hover:text-zinc-900 dark:hover:text-zinc-200
              transition-colors duration-150
            "
          >
            P2P Market
          </Link>
        </div>
      </section>

      {/* ── Stats bar ─────────────────────────────────────────────────────── */}
      <section className="border-y border-zinc-200 dark:border-zinc-800">
        <div className="max-w-5xl mx-auto px-5 sm:px-8 py-8 grid grid-cols-2 md:grid-cols-4 gap-6 sm:gap-8">
          {STATS.map(({ value, label }) => (
            <div key={label} className="text-center">
              <div className="font-mono text-2xl sm:text-3xl font-bold text-zinc-900 dark:text-zinc-50 mb-1 tabular-nums">
                {value}
              </div>
              <div className="font-sans text-[10px] text-zinc-500 dark:text-zinc-500 uppercase tracking-[0.14em]">
                {label}
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* ── Exchanges strip ───────────────────────────────────────────────── */}
      <section className="border-b border-zinc-200 dark:border-zinc-800">
        <div className="max-w-5xl mx-auto px-5 sm:px-8 py-4 flex flex-wrap items-center gap-x-6 gap-y-2">
          <span className="font-mono text-[10px] text-zinc-400 uppercase tracking-[0.16em] flex-shrink-0">
            Tracks
          </span>
          {EXCHANGES.map((name) => (
            <span
              key={name}
              className="font-mono text-xs font-medium text-zinc-500 dark:text-zinc-500 uppercase tracking-wider"
            >
              {name}
            </span>
          ))}
        </div>
      </section>

      {/* ── Features ──────────────────────────────────────────────────────── */}
      <section className="max-w-5xl mx-auto px-5 sm:px-8 py-14 sm:py-20">
        <div className="mb-8">
          <span className="font-mono text-[10px] text-zinc-400 uppercase tracking-[0.16em]">
            What ChainWise does
          </span>
        </div>

        {/* 2×2 grid — interior lines only via border-l border-t on container + border-r border-b on each cell */}
        <div className="grid sm:grid-cols-2 border-l border-t border-zinc-200 dark:border-zinc-800">
          {FEATURES.map(({ icon: Icon, title, desc }) => (
            <div
              key={title}
              className="border-r border-b border-zinc-200 dark:border-zinc-800 p-6 sm:p-8"
            >
              <div className="w-9 h-9 rounded-lg border border-zinc-200 dark:border-zinc-800 flex items-center justify-center mb-5">
                <Icon className="w-4 h-4 text-emerald-600 dark:text-emerald-500" />
              </div>
              <h3 className="font-mono text-xs font-bold text-zinc-900 dark:text-zinc-100 mb-3 uppercase tracking-[0.12em]">
                {title}
              </h3>
              <p className="font-sans text-sm text-zinc-500 dark:text-zinc-400 leading-relaxed">
                {desc}
              </p>
            </div>
          ))}
        </div>
      </section>

      {/* ── How it works ──────────────────────────────────────────────────── */}
      <section className="border-t border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-[#0d0d0d]">
        <div className="max-w-5xl mx-auto px-5 sm:px-8 py-14 sm:py-20">
          <div className="mb-10">
            <span className="font-mono text-[10px] text-zinc-400 uppercase tracking-[0.16em]">
              Under the hood
            </span>
          </div>

          <div className="grid sm:grid-cols-3 border-l border-t border-zinc-200 dark:border-zinc-800">
            {HOW_IT_WORKS.map(({ step, icon: Icon, title, desc }) => (
              <div
                key={step}
                className="border-r border-b border-zinc-200 dark:border-zinc-800 p-6 sm:p-8 bg-white dark:bg-zinc-950"
              >
                <div className="flex items-start justify-between mb-5">
                  <div className="w-9 h-9 rounded-lg border border-zinc-200 dark:border-zinc-800 flex items-center justify-center">
                    <Icon className="w-4 h-4 text-emerald-600 dark:text-emerald-500" />
                  </div>
                  <span className="font-mono text-4xl font-bold text-zinc-100 dark:text-zinc-800 leading-none select-none tabular-nums">
                    {step}
                  </span>
                </div>
                <h3 className="font-mono text-xs font-bold text-zinc-900 dark:text-zinc-100 mb-2 uppercase tracking-[0.12em]">
                  {title}
                </h3>
                <p className="font-sans text-sm text-zinc-500 dark:text-zinc-400 leading-relaxed">
                  {desc}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Use cases ─────────────────────────────────────────────────────── */}
      <section className="border-t border-zinc-200 dark:border-zinc-800">
        <div className="max-w-5xl mx-auto px-5 sm:px-8 py-14 sm:py-20">
          <div className="mb-10">
            <span className="font-mono text-[10px] text-zinc-400 uppercase tracking-[0.16em]">
              Built for traders who move funds
            </span>
          </div>

          <div className="grid sm:grid-cols-2 gap-8 sm:gap-10">
            {USE_CASES.map(({ icon: Icon, title, desc }) => (
              <div key={title} className="flex gap-4">
                <div className="flex-shrink-0 mt-0.5">
                  <Icon className="w-4 h-4 text-emerald-600 dark:text-emerald-500" />
                </div>
                <div>
                  <h4 className="font-mono text-xs font-bold text-zinc-900 dark:text-zinc-100 mb-1.5 uppercase tracking-[0.1em]">
                    {title}
                  </h4>
                  <p className="font-sans text-sm text-zinc-500 dark:text-zinc-400 leading-relaxed">
                    {desc}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Bottom CTA ────────────────────────────────────────────────────── */}
      <section className="border-t border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-[#0d0d0d]">
        <div className="max-w-5xl mx-auto px-5 sm:px-8 py-14 sm:py-20 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-8">
          <div className="max-w-md">
            <div className="flex items-center gap-2 mb-4">
              <div className="w-7 h-7 rounded-md bg-emerald-500 dark:bg-emerald-600 flex items-center justify-center flex-shrink-0">
                <Zap className="w-3.5 h-3.5 text-zinc-950" />
              </div>
              <span className="font-mono font-bold text-emerald-600 dark:text-emerald-500 text-sm tracking-[0.15em] uppercase">
                ChainWise
              </span>
            </div>
            <h2 className="font-mono text-xl sm:text-2xl font-bold text-zinc-900 dark:text-zinc-50 mb-2 leading-snug">
              Ready to route smarter?
            </h2>
            <p className="font-sans text-sm text-zinc-500 dark:text-zinc-400 leading-relaxed">
              Ask the agent a question or explore fee tables directly.
              No account required to get started.
            </p>
          </div>

          <div className="flex flex-col sm:flex-row gap-3 flex-shrink-0">
            <Link
              href="/chat"
              className="
                inline-flex items-center justify-center gap-2
                px-5 py-2.5
                bg-emerald-600 dark:bg-emerald-500
                text-white dark:text-zinc-950
                rounded-lg
                font-mono text-xs font-bold uppercase tracking-widest
                hover:bg-emerald-700 dark:hover:bg-emerald-400
                transition-colors duration-150
              "
            >
              Ask the Agent
              <ArrowRight className="w-3.5 h-3.5" />
            </Link>
            <Link
              href="/fees"
              className="
                inline-flex items-center justify-center gap-2
                px-5 py-2.5
                border border-zinc-200 dark:border-zinc-800
                text-zinc-600 dark:text-zinc-400
                rounded-lg
                font-mono text-xs uppercase tracking-widest
                hover:border-zinc-400 dark:hover:border-zinc-600
                hover:text-zinc-900 dark:hover:text-zinc-200
                transition-colors duration-150
              "
            >
              Browse Fee Tables
            </Link>
          </div>
        </div>
      </section>

      {/* ── Footer ────────────────────────────────────────────────────────── */}
      <footer className="border-t border-zinc-200 dark:border-zinc-800">
        <div className="max-w-5xl mx-auto px-5 sm:px-8 py-5 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2">
          <span className="font-mono text-[10px] text-zinc-400 uppercase tracking-widest">
            ChainWise · Crypto Routing Agent
          </span>
          <span className="font-mono text-[10px] text-zinc-400 uppercase tracking-widest">
            Data from CEX APIs &amp; CoinGecko
          </span>
        </div>
      </footer>
    </div>
  );
}