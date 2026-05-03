import type { Metadata } from 'next';
import './globals.css';
import Sidebar from '@/components/layout/Sidebar';

export const metadata: Metadata = {
  title: 'ChainWise — Crypto Routing Agent',
  description: 'Find the cheapest withdrawal routes, bridge tokens cross-chain, recover stuck assets, and scan exchange giveaways.',
  keywords: ['crypto', 'DeFi', 'bridge', 'exchange fees', 'LI.FI', 'Solana'],
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className="flex h-screen overflow-hidden bg-brand-bg">
        <Sidebar />
        <main className="flex-1 overflow-hidden">
          {children}
        </main>
      </body>
    </html>
  );
}