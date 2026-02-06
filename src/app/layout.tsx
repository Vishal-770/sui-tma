import type { PropsWithChildren } from 'react';
import type { Metadata } from 'next';

import { Providers } from '@/components/Providers';

import 'normalize.css/normalize.css';
import './_assets/globals.css';

export const metadata: Metadata = {
  title: 'SuiTrader - Private Intent Trading',
  description: 'Private intent-based trading on Sui with zkLogin',
};

export default async function RootLayout({ children }: PropsWithChildren) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body>
        <Providers>
          <div className="app-root">
            {children}
          </div>
        </Providers>
      </body>
    </html>
  );
}
