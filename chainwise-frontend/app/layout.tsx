// app/layout.tsx  — server component (metadata export is fine here)
import type { Metadata } from 'next';
import './globals.css';
import ClientLayout from './ClientLayout';

export const metadata: Metadata = {
  title: 'ChainWise — Crypto Routing Agent',
  description:
    'Find the cheapest withdrawal routes, bridge tokens cross-chain, recover stuck assets, and scan exchange giveaways.',
  keywords: ['crypto', 'DeFi', 'bridge', 'exchange fees', 'LI.FI', 'Solana'],
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      {/*
        h-dvh  → uses the *dynamic* viewport height unit so the layout
        correctly tracks the mobile browser chrome (URL bar) shrinking/
        expanding, instead of the static 100vh which causes a layout shift
        that clips the sticky header on first paint.
      */}
      <body className="flex h-dvh overflow-hidden bg-brand-bg">
        <ClientLayout>{children}</ClientLayout>
      </body>
    </html>
  );
}