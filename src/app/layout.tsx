import type { PropsWithChildren } from "react";
import type { Metadata } from "next";

import { Providers } from "@/components/Providers";

import "./global.css";
import { ConditionalNavigation } from "@/components/ConditionalNavigation";
export const metadata: Metadata = {
  title: "Abyss Protocol - Private Intent Trading",
  description: "Private intent-based trading on Sui with zkLogin",
};

export default async function RootLayout({ children }: PropsWithChildren) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body>
        <Providers>
          <ConditionalNavigation />
          <div className="app-root">{children}</div>
        </Providers>
      </body>
    </html>
  );
}
