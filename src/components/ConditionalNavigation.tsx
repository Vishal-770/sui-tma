"use client";

import { usePathname } from "next/navigation";
import { Navigation } from "@/components/Navigation";

export function ConditionalNavigation() {
  const pathname = usePathname();

  // Don't show navigation on /trade routes
  if (pathname.startsWith("/trade/")) {
    return null;
  }

  return <Navigation />;
}
