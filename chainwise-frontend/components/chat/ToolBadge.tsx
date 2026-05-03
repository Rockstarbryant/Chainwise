'use client';

const TOOL_META: Record<string, { label: string; icon: string; color: string }> = {
  get_withdrawal_fees:      { label: 'Fetched withdrawal fees',      icon: '📊', color: 'text-green-400 border-green-800 bg-green-950' },
  find_cheapest_withdrawal: { label: 'Found cheapest route',         icon: '💸', color: 'text-emerald-400 border-emerald-800 bg-emerald-950' },
  get_bridge_route:         { label: 'Queried LI.FI bridge',         icon: '🌉', color: 'text-blue-400 border-blue-800 bg-blue-950' },
  get_coin_chains:          { label: 'Checked coin chains',          icon: '⛓️', color: 'text-purple-400 border-purple-800 bg-purple-950' },
  get_coin_exchanges:       { label: 'Scanned exchanges',            icon: '🏦', color: 'text-cyan-400 border-cyan-800 bg-cyan-950' },
  check_p2p_availability:   { label: 'Checked P2P availability',     icon: '🌍', color: 'text-yellow-400 border-yellow-800 bg-yellow-950' },
  plan_zero_gas_recovery:   { label: 'Built gas recovery plan',      icon: '🔋', color: 'text-orange-400 border-orange-800 bg-orange-950' },
  scan_giveaways:           { label: 'Scanned giveaways',            icon: '🎁', color: 'text-pink-400 border-pink-800 bg-pink-950' },
  compare_exchanges:        { label: 'Compared exchange fees',       icon: '⚖️', color: 'text-indigo-400 border-indigo-800 bg-indigo-950' },
};

export default function ToolBadge({ tool }: { tool: string }) {
  const meta = TOOL_META[tool] || { label: tool, icon: '🔧', color: 'text-gray-400 border-gray-700 bg-gray-900' };

  return (
    <span className={`inline-flex items-center gap-1.5 text-[11px] font-mono border rounded-md px-2 py-0.5 ${meta.color}`}>
      <span className="text-xs">{meta.icon}</span>
      {meta.label}
    </span>
  );
}