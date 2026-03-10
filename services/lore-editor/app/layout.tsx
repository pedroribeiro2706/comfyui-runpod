import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'tLotD — Lore Editor',
  description: 'Visualize and edit canonical lore artifacts for The Light of the Darkness',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR">
      <body className="min-h-screen bg-canvas text-text">
        <header className="border-b border-border px-6 py-4 flex items-center gap-4">
          <span className="text-xs font-bold tracking-widest uppercase text-gold">
            The Light of the Darkness
          </span>
          <span className="text-border">·</span>
          <span className="text-xs font-semibold tracking-widest uppercase text-dim">
            Lore Editor
          </span>
        </header>
        <main className="px-6 py-8 max-w-5xl mx-auto">{children}</main>
      </body>
    </html>
  );
}
