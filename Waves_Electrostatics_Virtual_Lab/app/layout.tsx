import type { Metadata, Viewport } from 'next';
import './globals.css';

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: 'cover',
  themeColor: '#050a14',
};

export const metadata: Metadata = {
  metadataBase: new URL('http://localhost:3000'),
  title: 'Physics University Virtual Laboratory',
  description:
    'Walk through two connected university physics rooms, operate real laboratory equipment, and complete seven interactive experiments.',
  openGraph: {
    title: 'Physics University Virtual Laboratory',
    description: 'Walk in. Operate the equipment. Complete seven experiments.',
    images: [{ url: '/og.png', alt: 'Physics University hallway connecting two interactive laboratory rooms' }],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Physics University Virtual Laboratory',
    description: 'Walk in. Operate the equipment. Complete seven experiments.',
    images: ['/og.png'],
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
