"use client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
const IndexerLayout = ({ children }: { children: React.ReactNode }) => {
  const queryclient = new QueryClient();
  return (
    <QueryClientProvider client={queryclient}>{children}</QueryClientProvider>
  );
};

export default IndexerLayout;
