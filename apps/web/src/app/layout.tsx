import type { Metadata } from 'next';
import { Press_Start_2P, JetBrains_Mono } from 'next/font/google';
import './globals.css';

const pixelFont = Press_Start_2P({
  weight: '400',
  subsets: ['latin'],
  variable: '--font-pixel',
});

const monoFont = JetBrains_Mono({
  subsets: ['latin'],
  variable: '--font-mono',
});

export const metadata: Metadata = {
  title: 'Whalez',
  description: 'Autonomous Trading Agent with Self-Critique',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className={`${pixelFont.variable} ${monoFont.variable} font-mono bg-white text-black antialiased`}>
        {children}
      </body>
    </html>
  );
}
