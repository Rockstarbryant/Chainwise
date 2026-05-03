import FeeTable from '@/components/fees/FeeTable';

export const metadata = { title: 'Fee Tables — ChainWise' };

export default function FeesPage() {
  return (
    <div className="h-full overflow-y-auto px-6 py-6">
      <div className="max-w-6xl mx-auto">
        <div className="mb-6">
          <h1 className="font-mono font-bold text-2xl text-brand-green tracking-[0.15em]">FEE TABLES</h1>
          <p className="font-mono text-xs text-brand-muted mt-1 tracking-widest">
            LIVE WITHDRAWAL FEES ACROSS EXCHANGES — RANKED CHEAPEST FIRST
          </p>
        </div>
        <FeeTable />
      </div>
    </div>
  );
}