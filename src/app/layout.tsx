import type { Metadata } from 'next';
import Link from 'next/link';
import './globals.css';

export const metadata: Metadata = {
  title: 'JARVIS',
  description: 'Persistent personal memory, v0.1',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <div className="shell">
          <header className="top">
            <h1>JARVIS</h1>
            <nav>
              <Link href="/">Chat</Link>
              <Link href="/memory">Memory</Link>
            </nav>
          </header>
          {children}
        </div>
      </body>
    </html>
  );
}
