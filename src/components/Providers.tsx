"use client";

import { PropsWithChildren } from "react";
import { AuthProvider } from "@/contexts/AuthContext";
import { NearWalletProvider } from "@/contexts/NearWalletContext";
import { DappKitProvider } from "@/components/DappKitProvider";
import { ThemeProvider } from "./Theme-provider";
import { ModeToggle } from "./ModeToggle";

export function Providers({ children }: PropsWithChildren) {
  return (
    <ThemeProvider
      attribute="class"
      defaultTheme="system"
      enableSystem
      disableTransitionOnChange
    >
      <DappKitProvider>
        <NearWalletProvider>
          <AuthProvider>{children}</AuthProvider>
        </NearWalletProvider>
        <div className="fixed bottom-4 right-4 z-50">
          <ModeToggle />
        </div>
      </DappKitProvider>
    </ThemeProvider>
  );
}
