// app/layout.tsx — server component
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
        IMPORTANT: overflow-hidden + h-dvh is required for the app shell
        (chat, fees, p2p etc) so the sidebar and chat input stay pinned.
        But it breaks scrolling on the marketing homepage which renders
        outside the shell.

        Fix: move overflow-hidden onto the shell wrapper inside ClientLayout,
        NOT on <body>. The body itself should scroll freely so the homepage
        (and any other full-page routes) work normally.
      */}
      <body className="flex bg-zinc-950 antialiased">
        <ClientLayout>{children}</ClientLayout>
      </body>
    </html>
  );
}