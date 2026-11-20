import type { Metadata } from 'next';
import './globals.css';
import Shell from '@/components/Shell';

export const metadata: Metadata = {
  title: 'Ferrovane Fraud Desk · Payment Fraud Investigation Workbench (Snowflake example)',
  description: 'Score card and real-time payments, see linked accounts and devices, and close fraud cases with an AI case summary. Synthetic data.',
};

// Applies the saved theme before paint (dark by default) so there is no flash.
const THEME = `try{var t=localStorage.getItem('pfw-theme');if(t==='light')document.documentElement.dataset.theme='light'}catch(e){}`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head><script dangerouslySetInnerHTML={{ __html: THEME }} /></head>
      <body><Shell>{children}</Shell></body>
    </html>
  );
}
