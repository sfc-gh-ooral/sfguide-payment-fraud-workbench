'use client';

// App frame: navigation, the Sample/Live switch, mode notice, and the disclaimer.
import { Bot, LayoutDashboard, ListChecks, Menu, ShieldAlert, SlidersHorizontal, X } from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { ModeChip } from '@/components/ModeChip';
import { HOSTED_EXAMPLE } from '@/lib/hosted';


const NAV = [
  { href: '/', label: 'Fraud overview', icon: LayoutDashboard },
  { href: '/alerts', label: 'Alert queue', icon: ListChecks },
  { href: '/model', label: 'Model & rules', icon: SlidersHorizontal },
  { href: '/ask', label: 'Ask', icon: Bot },
];

export default function Shell({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();
  useEffect(() => setOpen(false), [pathname]);
  // Mobile drawer: Escape closes, focus moves into the drawer on open and back to the toggle on close.
  const toggleRef = useRef<HTMLButtonElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const wasOpen = useRef(false);
  useEffect(() => {
    if (open) closeRef.current?.focus();
    else if (wasOpen.current) toggleRef.current?.focus();
    wasOpen.current = open;
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);
  const active = (href: string) => (href === '/' ? pathname === '/' : pathname.startsWith(href) || (href === '/alerts' && pathname.startsWith('/case')));
  const title = pathname.startsWith('/case') ? 'Case detail' : NAV.find((n) => active(n.href))?.label ?? 'Fraud overview';

  return (
    <div className="min-h-screen flex">
      <aside id="main-nav" className={`sidebar fixed inset-y-0 left-0 z-40 w-60 flex flex-col border-r md:translate-x-0 md:visible ${open ? 'translate-x-0 transition-transform' : '-translate-x-full invisible transition-[transform,visibility]'}`}
        aria-label="Main navigation">
        <div className="px-5 py-5 border-b flex items-center gap-3" style={{ borderColor: 'rgba(255,255,255,.08)' }}>
          <div className="icon-tile w-9 h-9 rounded-xl flex items-center justify-center"><ShieldAlert className="w-4 h-4" aria-hidden /></div>
          <div>
            <div className="text-sm font-semibold leading-tight text-white">Payment Fraud Workbench</div>
            <div className="text-[11px] muted">Example on synthetic data</div>
          </div>
          <button ref={closeRef} className="md:hidden ml-auto btn !px-2" onClick={() => setOpen(false)} aria-label="Close menu"><X className="w-4 h-4" /></button>
        </div>
        <nav className="flex-1 px-3 py-3 space-y-1">
          {NAV.map(({ href, label, icon: Icon }) => (
            <Link key={href} href={href} aria-current={active(href) ? 'page' : undefined}
              className="nav-link flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium no-underline">
              <Icon className="w-4 h-4" aria-hidden />{label}
            </Link>
          ))}
        </nav>
        <div className="px-4 py-4 border-t text-[11px] muted leading-relaxed" style={{ borderColor: 'rgba(255,255,255,.08)' }}>
          Synthetic data and illustrative logic. Not a production fraud system, and not regulatory, compliance, or legal advice. Model results describe this synthetic data set only.
        </div>
      </aside>

      <div className="flex-1 md:ml-60 min-w-0">
        {HOSTED_EXAMPLE && (
          <div role="note" className="px-4 md:px-8 py-2 text-xs border-b" style={{ background: 'var(--sample-soft)', borderColor: 'var(--border)', color: 'var(--text-2)' }}>
            <strong style={{ color: 'var(--text)' }}>Sample data mode.</strong> Runs entirely in your browser on synthetic data captured from a live run; no Snowflake account needed. AI answers are scripted samples, not live Cortex output.{' '}
            <a href="https://github.com/sfc-gh-ooral/sfguide-payment-fraud-workbench" className="underline underline-offset-2">Run it in your own account</a>
          </div>
        )}
        <header className="glass sticky top-0 z-30 flex items-center gap-3 px-4 md:px-8 py-3 border-b" style={{ borderColor: 'var(--border)' }}>
          <button ref={toggleRef} className="md:hidden btn !px-2" onClick={() => setOpen(true)} aria-label="Open menu" aria-expanded={open} aria-controls="main-nav"><Menu className="w-4 h-4" /></button>
          <div className="min-w-0">
            <div className="text-sm font-semibold truncate">{title}</div>
            <div className="text-xs muted truncate">Northwind Financial · fraud operations · data as of Nov 15, 2026 09:00</div>
          </div>
          <div className="ml-auto"><ModeChip /></div>
        </header>
        <main key={pathname} className="fade-up px-4 md:px-8 py-6 max-w-[1400px]">{children}</main>
      </div>
      {open && <div className="fixed inset-0 z-30 bg-black/40 md:hidden" onClick={() => setOpen(false)} aria-hidden />}
    </div>
  );
}
