import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'ESCI brand study: ground truth for measuring AI recommendations',
  description:
    'Which brands did shoppers actually judge relevant? A human-labelled competitive landscape built from Amazon\u2019s Shopping Queries Dataset (ESCI), for checking whether AI recommendations are correct rather than merely present.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="antialiased">{children}</body>
    </html>
  );
}
