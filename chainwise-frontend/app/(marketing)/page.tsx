// app/(marketing)/page.tsx  — Server Component (SSR)
import Link from 'next/link';
import {
  Zap, ArrowRight, Database, RefreshCw, Shield,
  BarChart3, ArrowLeftRight, Bot, Layers, Clock,
  TrendingDown, Search, Globe, CheckCircle,
} from 'lucide-react';

/* ─── Static data (rendered server-side) ────────────────────────────── */

const EXCHANGES = ['Binance', 'Bybit', 'KuCoin', 'MEXC', 'HTX', 'Gate.io', 'OKX'];

const CAPABILITIES = [
  {
    icon: TrendingDown,
    title: 'Withdrawal Fee Intelligence',
    description:
      'Aggregated withdrawal fees, minimum amounts, and ETAs for every token across 7 exchanges — updated hourly via exchange APIs.',
  },
  {
    icon: BarChart3,
    title: 'Cross-Exchange Fee Tables',
    description:
      'Search any coin and instantly see a ranked table of cheapest withdrawal routes per chain per exchange. No more tab-switching.',
  },
  {
    icon: ArrowLeftRight,
    title: 'Live P2P Market Data',
    description:
      'Active P2P ads from Binance, Bybit, KuCoin, MEXC, HTX, Gate.io and OKX — refreshed every 15 minutes so you always see real rates.',
  },
  {
    icon: Bot,
    title: 'AI Routing Agent',
    description:
      'Ask in plain language. The agent queries the database directly to find cheapest routes, compare chains, and surface the best path for your funds.',
  },
  {
    icon: Layers,
    title: 'Multi-Chain Coverage',
    description:
      'Every supported withdrawal network per token per exchange — ERC-20, TRC-20, BEP-20, Solana, Arbitrum, Base, and more.',
  },
  {
    icon: Search,
    title: 'Deposit Compatibility Check',
    description:
      'Verify whether an exchange supports your coin before depositing. Saves you from sending to unsupported networks.',
  },
];

const HOW_IT_WORKS = [
  {
    step: '01',
    title: 'Data is fetched from exchange APIs',
    detail: 'Fee data is pulled directly from CEX APIs and enriched with CoinGecko pricing and chain info.',
  },
  {
    step: '02',
    title: 'Stored in MongoDB, cached in Redis',
    detail: 'Fees refresh every hour. P2P ads refresh every 15 minutes and expire automatically via TTL.',
  },
  {
    step: '03',
    title: 'Query via the AI agent or fee tables',
    detail: 'Ask the agent a question or use the fee table and P2P pages to browse and compare directly.',
  },
];

const STATS = [
  { value: '7',        label: 'Exchanges' },
  { value: '10+',      label: 'Chains' },
  { value: '15 min',   label: 'P2P refresh' },
  { value: '1 hr',     label: 'Fee refresh' },
];

/* ─── Component ──────────────────────────────────────────────────────── */

export default function HomePage() {
  return (
    <div className="min-h-screen bg-white dark:bg-zinc-950 text-zinc-900 dark:text-zinc-100 font-sans">

      {/* ── Nav ──────────────────────────────────────────────────────── */}
      <nav className="border-b border-zinc-200 dark:border-zinc-800 h-14 flex items-center px-5 sm:px-8 lg:px-12">
        <div className="max-w-6xl mx-auto w-full flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-emerald-500 dark:bg-emerald-600 flex items-center justify-center">
              <Zap className="w-4 h-4 text-zinc-950" />
            </div>
            <div>
              <div className="font-bold text-emerald-600 dark:text-emerald-500 text-sm tracking-[0.15em]">CHAINWISE</div>
              <div className="text-[9px] font-medium text-zinc-500 dark:text-zinc-400 tracking-widest uppercase leading-none">CRYPTO AGENT</div>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <Link
              href="/fees"
              className="hidden sm:inline text-xs font-medium text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100 transition-colors tracking-wide uppercase"
            >
              Fee Tables
            </Link>
            <Link
              href="/p2p"
              className="hidden sm:inline text-xs font-medium text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100 transition-colors tracking-wide uppercase"
            >
              P2P Market
            </Link>
            <Link
              href="/chat"
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-emerald-500 dark:border-emerald-500 text-emerald-600 dark:text-emerald-500 text-xs font-medium tracking-wide uppercase hover:bg-emerald-50 dark:hover:bg-emerald-500/10 transition-colors"
            >
              <Bot className="w-3.5 h-3.5" />
              Ask Agent
            </Link>
          </div>
        </div>
      </nav>

      {/* ── Hero ─────────────────────────────────────────────────────── */}
      <section className="border-b border-zinc-200 dark:border-zinc-800">
        <div className="max-w-6xl mx-auto px-5 sm:px-8 lg:px-12 py-16 sm:py-24">
          <div className="max-w-3xl">

            {/* Status badge */}
            <div className="inline-flex items-center gap-2 border border-zinc-200 dark:border-zinc-800 rounded-full px-3 py-1 mb-8">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
              <span className="text-xs font-medium text-zinc-500 dark:text-zinc-400 tracking-wide uppercase">
                Live data · 7 exchanges
              </span>
            </div>

            <h1 className="text-4xl sm:text-5xl lg:text-6xl font-bold tracking-tight leading-[1.08] text-zinc-900 dark:text-zinc-100 mb-6">
              Stop paying more than you should to move crypto.
            </h1>

            <p className="text-zinc-500 dark:text-zinc-400 text-base sm:text-lg leading-relaxed mb-10 max-w-2xl">
              ChainWise aggregates real-time withdrawal fees, minimum amounts, and P2P rates
              across 7 major exchanges so you can find the cheapest route in seconds —
              without visiting each exchange one by one.
            </p>

            <div className="flex flex-col sm:flex-row gap-3">
              <Link
                href="/chat"
                className="inline-flex items-center justify-center gap-2 px-5 py-3 rounded-lg bg-emerald-500 dark:bg-emerald-600 text-zinc-950 font-semibold text-sm tracking-wide hover:bg-emerald-400 dark:hover:bg-emerald-500 transition-colors"
              >
                <Bot className="w-4 h-4" />
                Ask the Agent
                <ArrowRight className="w-4 h-4" />
              </Link>
              <Link
                href="/fees"
                className="inline-flex items-center justify-center gap-2 px-5 py-3 rounded-lg border border-zinc-200 dark:border-zinc-800 text-zinc-700 dark:text-zinc-300 font-medium text-sm tracking-wide hover:border-zinc-300 dark:hover:border-zinc-700 hover:text-zinc-900 dark:hover:text-zinc-100 transition-colors"
              >
                <BarChart3 className="w-4 h-4" />
                Browse Fee Tables
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* ── Stats strip ──────────────────────────────────────────────── */}
      <section className="border-b border-zinc-200 dark:border-zinc-800">
        <div className="max-w-6xl mx-auto px-5 sm:px-8 lg:px-12">
          <div className="grid grid-cols-2 sm:grid-cols-4 divide-x divide-y sm:divide-y-0 divide-zinc-200 dark:divide-zinc-800">
            {STATS.map(stat => (
              <div key={stat.label} className="px-6 py-6 text-center">
                <div className="text-2xl sm:text-3xl font-bold text-zinc-900 dark:text-zinc-100 tabular-nums">
                  {stat.value}
                </div>
                <div className="text-xs font-medium text-zinc-500 dark:text-zinc-400 uppercase tracking-widest mt-1">
                  {stat.label}
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Exchange logos row ────────────────────────────────────────── */}
      <section className="border-b border-zinc-200 dark:border-zinc-800 py-8">
        <div className="max-w-6xl mx-auto px-5 sm:px-8 lg:px-12">
          <p className="text-xs font-medium text-zinc-400 dark:text-zinc-600 uppercase tracking-widest mb-6 text-center">
            Data sourced from
          </p>
          <div className="flex flex-wrap items-center justify-center gap-3">
            {EXCHANGES.map(name => (
              <span
                key={name}
                className="px-3 py-1.5 border border-zinc-200 dark:border-zinc-800 rounded-md text-xs font-medium text-zinc-500 dark:text-zinc-400 tracking-wide"
              >
                {name}
              </span>
            ))}
            <span className="px-3 py-1.5 border border-zinc-200 dark:border-zinc-800 rounded-md text-xs font-medium text-zinc-500 dark:text-zinc-400 tracking-wide">
              CoinGecko
            </span>
          </div>
        </div>
      </section>

      {/* ── What ChainWise does ───────────────────────────────────────── */}
      <section className="border-b border-zinc-200 dark:border-zinc-800 py-16 sm:py-20">
        <div className="max-w-6xl mx-auto px-5 sm:px-8 lg:px-12">
          <div className="mb-12">
            <p className="text-xs font-medium text-zinc-500 dark:text-zinc-400 uppercase tracking-widest mb-3">Capabilities</p>
            <h2 className="text-2xl sm:text-3xl font-bold tracking-tight text-zinc-900 dark:text-zinc-100">
              Everything in one place.
            </h2>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-px bg-zinc-200 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-800 rounded-xl overflow-hidden">
            {CAPABILITIES.map(({ icon: Icon, title, description }) => (
              <div
                key={title}
                className="bg-white dark:bg-zinc-950 p-6 flex flex-col gap-3"
              >
                <div className="w-8 h-8 rounded-lg bg-zinc-100 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 flex items-center justify-center">
                  <Icon className="w-4 h-4 text-zinc-700 dark:text-zinc-300" />
                </div>
                <div>
                  <h3 className="font-semibold text-sm text-zinc-900 dark:text-zinc-100 mb-1.5 leading-snug">
                    {title}
                  </h3>
                  <p className="text-xs text-zinc-500 dark:text-zinc-400 leading-relaxed">
                    {description}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── How it works ─────────────────────────────────────────────── */}
      <section className="border-b border-zinc-200 dark:border-zinc-800 py-16 sm:py-20">
        <div className="max-w-6xl mx-auto px-5 sm:px-8 lg:px-12">
          <div className="mb-12">
            <p className="text-xs font-medium text-zinc-500 dark:text-zinc-400 uppercase tracking-widest mb-3">Architecture</p>
            <h2 className="text-2xl sm:text-3xl font-bold tracking-tight text-zinc-900 dark:text-zinc-100">
              Fresh data, always.
            </h2>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-8 md:gap-0 md:divide-x divide-zinc-200 dark:divide-zinc-800">
            {HOW_IT_WORKS.map(({ step, title, detail }) => (
              <div key={step} className="md:px-8 first:pl-0 last:pr-0">
                <div className="text-[10px] font-bold text-zinc-400 dark:text-zinc-600 tracking-[0.2em] uppercase mb-4 font-mono">
                  {step}
                </div>
                <h3 className="font-semibold text-sm text-zinc-900 dark:text-zinc-100 mb-2 leading-snug">
                  {title}
                </h3>
                <p className="text-xs text-zinc-500 dark:text-zinc-400 leading-relaxed">
                  {detail}
                </p>
              </div>
            ))}
          </div>

          {/* Tech stack row */}
          <div className="mt-12 pt-8 border-t border-zinc-200 dark:border-zinc-800 flex flex-wrap gap-2">
            {[
              { icon: Database, label: 'MongoDB' },
              { icon: RefreshCw, label: 'Redis Cache' },
              { icon: Clock, label: 'Cron Jobs' },
              { icon: Shield, label: 'CEX APIs' },
              { icon: Globe, label: 'CoinGecko' },
              { icon: CheckCircle, label: 'TTL Expiry' },
            ].map(({ icon: Icon, label }) => (
              <span
                key={label}
                className="inline-flex items-center gap-1.5 px-2.5 py-1.5 border border-zinc-200 dark:border-zinc-800 rounded-md text-xs text-zinc-500 dark:text-zinc-400 font-medium"
              >
                <Icon className="w-3 h-3" />
                {label}
              </span>
            ))}
          </div>
        </div>
      </section>

      {/* ── Use case callouts ─────────────────────────────────────────── */}
      <section className="border-b border-zinc-200 dark:border-zinc-800 py-16 sm:py-20">
        <div className="max-w-6xl mx-auto px-5 sm:px-8 lg:px-12">
          <div className="mb-12">
            <p className="text-xs font-medium text-zinc-500 dark:text-zinc-400 uppercase tracking-widest mb-3">Who it's for</p>
            <h2 className="text-2xl sm:text-3xl font-bold tracking-tight text-zinc-900 dark:text-zinc-100">
              Problems we solve.
            </h2>
          </div>

          <div className="space-y-px border border-zinc-200 dark:border-zinc-800 rounded-xl overflow-hidden">
            {[
              {
                scenario: 'You want to withdraw USDT but don\'t know which chain is cheapest.',
                solution: 'Fee tables show you every chain, every exchange, ranked by cost.',
              },
              {
                scenario: 'You\'re about to deposit a token but unsure if the exchange supports it.',
                solution: 'Search the coin — if the exchange lists withdrawal methods, they support it.',
              },
              {
                scenario: 'You need to sell crypto P2P but rates vary across platforms.',
                solution: 'The P2P market page shows active ads from 7 exchanges side by side.',
              },
              {
                scenario: 'You have USDC on Ethereum and need it on Base with minimal fees.',
                solution: 'Ask the agent — it queries live bridge and fee data to recommend the cheapest route.',
              },
            ].map(({ scenario, solution }, i) => (
              <div
                key={i}
                className="bg-white dark:bg-zinc-950 p-5 sm:p-6 grid grid-cols-1 sm:grid-cols-2 gap-4 sm:gap-8"
              >
                <div className="flex gap-3">
                  <div className="w-1 rounded-full bg-zinc-200 dark:bg-zinc-800 flex-shrink-0 mt-1" />
                  <p className="text-sm text-zinc-500 dark:text-zinc-400 leading-relaxed">{scenario}</p>
                </div>
                <div className="flex gap-3">
                  <div className="w-1 rounded-full bg-emerald-500 flex-shrink-0 mt-1" />
                  <p className="text-sm text-zinc-700 dark:text-zinc-300 leading-relaxed font-medium">{solution}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Final CTA ────────────────────────────────────────────────── */}
      <section className="py-16 sm:py-24">
        <div className="max-w-6xl mx-auto px-5 sm:px-8 lg:px-12">
          <div className="border border-zinc-200 dark:border-zinc-800 rounded-2xl p-8 sm:p-12 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-8">
            <div>
              <h2 className="text-xl sm:text-2xl font-bold tracking-tight text-zinc-900 dark:text-zinc-100 mb-2">
                Ready to stop guessing at fees?
              </h2>
              <p className="text-sm text-zinc-500 dark:text-zinc-400">
                Use the AI agent or browse the fee tables — no account required to start.
              </p>
            </div>
            <div className="flex flex-col sm:flex-row gap-3 flex-shrink-0">
              <Link
                href="/chat"
                className="inline-flex items-center justify-center gap-2 px-5 py-3 rounded-lg bg-emerald-500 dark:bg-emerald-600 text-zinc-950 font-semibold text-sm tracking-wide hover:bg-emerald-400 dark:hover:bg-emerald-500 transition-colors whitespace-nowrap"
              >
                <Bot className="w-4 h-4" />
                Open Agent Chat
              </Link>
              <Link
                href="/fees"
                className="inline-flex items-center justify-center gap-2 px-5 py-3 rounded-lg border border-zinc-200 dark:border-zinc-800 text-zinc-700 dark:text-zinc-300 font-medium text-sm hover:border-zinc-300 dark:hover:border-zinc-700 transition-colors whitespace-nowrap"
              >
                <BarChart3 className="w-4 h-4" />
                Fee Tables
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* ── Footer ───────────────────────────────────────────────────── */}
      <footer className="border-t border-zinc-200 dark:border-zinc-800 py-6">
        <div className="max-w-6xl mx-auto px-5 sm:px-8 lg:px-12 flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 rounded-md bg-emerald-500 dark:bg-emerald-600 flex items-center justify-center">
              <Zap className="w-3 h-3 text-zinc-950" />
            </div>
            <span className="text-xs font-bold text-emerald-600 dark:text-emerald-500 tracking-[0.15em] uppercase">ChainWise</span>
          </div>
          <nav className="flex items-center gap-6">
            {[
              { href: '/chat',     label: 'Agent Chat' },
              { href: '/fees',     label: 'Fee Tables' },
              { href: '/p2p',      label: 'P2P Market' },
              { href: '/coins',    label: 'Coin Explorer' },
              { href: '/giveaways',label: 'Giveaways' },
            ].map(({ href, label }) => (
              <Link
                key={href}
                href={href}
                className="text-xs text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100 transition-colors tracking-wide"
              >
                {label}
              </Link>
            ))}
          </nav>
        </div>
      </footer>

    </div>
  );
}