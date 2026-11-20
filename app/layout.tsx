import type { Metadata } from 'next';
import './globals.css';
import Shell from '@/components/Shell';

export const metadata: Metadata = {
  title: 'Payment Fraud Investigation Workbench: Snowflake example',
  description: 'Score card and real-time payments, see linked accounts and devices, and close fraud cases with an AI case summary. Synthetic data.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body><Shell>{children}</Shell></body>
    </html>
  );
}
