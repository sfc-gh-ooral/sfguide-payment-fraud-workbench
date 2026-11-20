'use client';

// App shell: top bar (logo, tabs, environment badge, role chip, theme), a ticker of the newest open
// alerts, a bottom tab bar on phones, and the disclaimer. No sidebar by design (docs/DESIGN.md).
import { Bot, Gauge, LayoutDashboard, ListChecks, Moon, SlidersHorizontal, Sun, UserRound } from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState, type ReactNode } from 'react';
import { Wordmark } from '@/components/Brand';
import { ModeChip } from '@/components/ModeChip';
import { nice, usd } from '@/components/ui';
import { fetchAlerts } from '@/lib/client';
import type { Alert } from '@/lib/types';

const NAV = [
  { href: '/', label: 'Overview', short: 'Overview', icon: LayoutDashboard },
  { href: '/alerts/', label: 'Alert queue', short: 'Queue', icon: ListChecks },
  { href: '/case/', label: 'Case', short: 'Case', icon: Gauge },
  { href: '/model/', label: 'Model & rules', short: 'Model', icon: SlidersHorizontal },
  { href: '/ask/', label: 'Ask', short: 'Ask', icon: Bot },
];

function ThemeToggle() {
  const [light, setLight] = useState(false);
  useEffect(() => setLight(document.documentElement.dataset.theme === 'light'), []);
  const flip = () => {
    const next = !light; setLight(next);
    if (next) document.documentElement.dataset.theme = 'light'; else delete document.documentElement.dataset.theme;
    try { localStorage.setItem('pfw-theme', next ? 'light' : 'dark'); } catch { /* private mode */ }
  };
  return (
    <button className="btn btn-sm !p-2" onClick={flip} aria-label={light ? 'Switch to dark theme' : 'Switch to light theme'} title="Theme">
      {light ? <Moon className="w-4 h-4" /> : <Sun className="w-4 h-4" />}
    </button>
  );
}

function Ticker() {
  const [rows, setRows] = useState<Alert[]>([]);
  useEffect(() => { fetchAlerts('OPEN').then((q) => setRows(q.rows.slice(0, 12))).catch(() => setRows([])); }, []);
  if (!rows.length) return <div className="h-9 border-b border-line" />;
  const chip = (a: Alert, k: string) => (
    <Link key={k} href={`/case/?id=${a.ALERT_ID}`} className="mono text-[11.5px] flex items-center gap-2 px-2.5 py-1 rounded inset no-underline whitespace-nowrap hover:border-[var(--line-strong)]">
      <span className={a.PRIORITY === 'HIGH' ? 'text-fraud' : 'text-warn'}>●</span>
      <span className="font-semibold">{a.ALERT_ID}</span>
      <span className="muted">{nice(a.CHANNEL)}</span>
      <span>{usd(a.AMOUNT)}</span>
      <span className="text-signal">{a.SCORE.toFixed(2)}</span>
    </Link>
  );
  return (
    <div className="border-b border-line bg-[color-mix(in_srgb,var(--surface)_70%,transparent)] h-9 flex items-center gap-3 px-4">
      <span className="eyebrow flex items-center gap-2 shrink-0 text-fraud"><span className="pulse" />Open signals</span>
      <div className="ticker overflow-hidden flex-1" aria-label="Newest open alerts">
        <div className="ticker-track">{rows.map((a) => chip(a, a.ALERT_ID))}{rows.map((a) => chip(a, a.ALERT_ID + '-dup'))}</div>
      </div>
    </div>
  );
}

export default function Shell({ children }: { children: ReactNode }) {
  const path = usePathname() || '/';
  const active = (href: string) => (href === '/' ? path === '/' : path.startsWith(href.replace(/\/$/, '')));
  return (
    <div className="min-h-screen flex flex-col">
      <header className="sticky top-0 z-40 border-b border-line backdrop-blur-md bg-[color-mix(in_srgb,var(--bg)_82%,transparent)]">
        <div className="max-w-[1440px] mx-auto px-4 flex items-center gap-4 h-[52px]">
          <Link href="/" className="no-underline shrink-0" aria-label="Ferrovane Fraud Desk home"><Wordmark /></Link>
          <nav className="hidden md:flex items-center ml-4" aria-label="Main">
            {NAV.map(({ href, label, icon: I }) => (
              <Link key={href} href={href} className="tab" aria-current={active(href) ? 'page' : undefined}><I className="w-4 h-4" aria-hidden />{label}</Link>
            ))}
          </nav>
          <div className="ml-auto flex items-center gap-2">
            <ModeChip />
            <span className="hidden lg:inline-flex items-center gap-2 inset px-2.5 py-1 text-xs" title="Persona for this example">
              <UserRound className="w-3.5 h-3.5 muted" aria-hidden /><span className="font-semibold">R. Okafor</span><span className="muted">Fraud analyst · Tier 2</span>
            </span>
            <ThemeToggle />
          </div>
        </div>
        <Ticker />
      </header>

      <main className="flex-1 w-full max-w-[1440px] mx-auto px-4 py-5 pb-24 md:pb-8">{children}</main>

      <footer className="border-t border-line text-xs muted px-4 py-4 pb-24 md:pb-4">
        <div className="max-w-[1440px] mx-auto flex flex-wrap gap-x-6 gap-y-1 justify-between">
          <span>Ferrovane and Northwind Financial are fictional. Synthetic data and illustrative logic only: not a production fraud system, and not regulatory, compliance, or legal advice.</span>
          <span className="mono">Data as of 2026-11-15 09:00 · <a className="underline" href="https://github.com/sfc-gh-ooral/sfguide-payment-fraud-workbench">Repository</a></span>
        </div>
      </footer>

      <nav className="md:hidden fixed bottom-0 inset-x-0 z-40 flex border-t border-line bg-[color-mix(in_srgb,var(--surface)_94%,transparent)] backdrop-blur-md" aria-label="Main">
        {NAV.map(({ href, short, icon: I }) => (
          <Link key={href} href={href} className="btab" aria-current={active(href) ? 'page' : undefined}><I className="w-5 h-5" aria-hidden />{short}</Link>
        ))}
      </nav>
    </div>
  );
}
