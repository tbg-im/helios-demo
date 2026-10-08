import type { Metadata, Viewport } from 'next';
import { Geist, Geist_Mono } from 'next/font/google';
import './globals.css';
import './helios.css';

const geistSans = Geist({
  variable: '--font-geist-sans',
  subsets: ['latin'],
});

const geistMono = Geist_Mono({
  variable: '--font-geist-mono',
  subsets: ['latin'],
});

export const metadata: Metadata = {
  title: 'Helios',
  description: 'Meet Helios, the Teambridge assistant that sets up and runs your team.',
  applicationName: 'Helios',
  // Saved to the home screen, the app opens on its own with no browser bars. The manifest
  // covers Android; iOS reads these tags.
  appleWebApp: { capable: true, title: 'Helios', statusBarStyle: 'black-translucent' },
  other: { 'apple-mobile-web-app-capable': 'yes' },
  formatDetection: { telephone: false },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  // Draw under the notch and home indicator; the page pads itself with the safe-area insets.
  viewportFit: 'cover',
  themeColor: '#07090B',
  colorScheme: 'dark',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  // A public page opened directly (not embedded in Teambridge), so it has no TBProvider or TBRouter.
  return (
    <html lang="en" className="dark">
      <body className={`${geistSans.variable} ${geistMono.variable} antialiased`}>{children}</body>
    </html>
  );
}
