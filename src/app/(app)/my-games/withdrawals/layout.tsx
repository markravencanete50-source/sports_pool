import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Withdrawals",
  description: "Request and track payouts.",
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
