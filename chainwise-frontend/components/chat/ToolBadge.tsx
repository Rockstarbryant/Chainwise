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

const TOOL_META: Record<string, { label: string; icon: React.ReactNode; bg: string }> = {
  get_withdrawal_fees:      { label: 'Fetched withdrawal fees',      icon: <BarChart className="w-3 h-3" />,   bg: 'bg-blue-600 border-blue-800' },
  find_cheapest_withdrawal: { label: 'Found cheapest route',         icon: <DollarSign className="w-3 h-3" />, bg: 'bg-emerald-600 border-emerald-800' },
  get_bridge_route:         { label: 'Queried bridge',               icon: <Route className="w-3 h-3" />,      bg: 'bg-orange-600 border-orange-800' },
  get_coin_chains:          { label: 'Checked coin chains',          icon: <Link className="w-3 h-3" />,       bg: 'bg-cyan-600 border-cyan-800' },
  get_coin_exchanges:       { label: 'Scanned exchanges',            icon: <Building2 className="w-3 h-3" />,  bg: 'bg-violet-600 border-violet-800' },
  check_p2p_availability:   { label: 'Checked P2P availability',     icon: <Globe className="w-3 h-3" />,      bg: 'bg-fuchsia-600 border-fuchsia-800' },
  plan_zero_gas_recovery:   { label: 'Built gas recovery plan',      icon: <Battery className="w-3 h-3" />,    bg: 'bg-lime-600 border-lime-800 text-black' },
  scan_giveaways:           { label: 'Scanned giveaways',            icon: <Gift className="w-3 h-3" />,       bg: 'bg-rose-600 border-rose-800' },
  compare_exchanges:        { label: 'Compared exchange fees',       icon: <Scale className="w-3 h-3" />,      bg: 'bg-teal-600 border-teal-800' },
};

export default function ToolBadge({ tool }: { tool: string }) {
  const meta = TOOL_META[tool] || { label: tool, icon: <Wrench className="w-3 h-3" />, bg: 'bg-slate-600 border-slate-800' };

  return (
    <span className={`inline-flex items-center gap-1.5 text-[11px] font-black border-2 px-2 py-1 text-white ${meta.bg}`}>
      <span className="bg-black/30 p-0.5">{meta.icon}</span>
      {meta.label}
    </span>
  );
}