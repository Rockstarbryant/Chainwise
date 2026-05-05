'use client';

import { 
  BarChart, 
  DollarSign, 
  Route, 
  Link, 
  Building2, 
  Globe, 
  Battery, 
  Gift, 
  Scale, 
  Wrench 
} from 'lucide-react';

const TOOL_META: Record<string, { label: string; icon: React.ReactNode }> = {
  get_withdrawal_fees:      { label: 'Fetched withdrawal fees',      icon: <BarChart className="w-3 h-3" /> },
  find_cheapest_withdrawal: { label: 'Found cheapest route',         icon: <DollarSign className="w-3 h-3" /> },
  get_bridge_route:         { label: 'Queried bridge',               icon: <Route className="w-3 h-3" /> },
  get_coin_chains:          { label: 'Checked coin chains',          icon: <Link className="w-3 h-3" /> },
  get_coin_exchanges:       { label: 'Scanned exchanges',            icon: <Building2 className="w-3 h-3" /> },
  check_p2p_availability:   { label: 'Checked P2P availability',     icon: <Globe className="w-3 h-3" /> },
  plan_zero_gas_recovery:   { label: 'Built gas recovery plan',      icon: <Battery className="w-3 h-3" /> },
  scan_giveaways:           { label: 'Scanned giveaways',            icon: <Gift className="w-3 h-3" /> },
  compare_exchanges:        { label: 'Compared exchange fees',       icon: <Scale className="w-3 h-3" /> },
};

export default function ToolBadge({ tool }: { tool: string }) {
  const meta = TOOL_META[tool] || { label: tool, icon: <Wrench className="w-3 h-3" /> };

  return (
    <span className="inline-flex items-center gap-1.5 text-[11px] font-sans font-medium border rounded-md px-2 py-1 bg-zinc-50 dark:bg-zinc-900 border-zinc-200 dark:border-zinc-800 text-zinc-600 dark:text-zinc-400">
      {meta.icon}
      {meta.label}
    </span>
  );
}