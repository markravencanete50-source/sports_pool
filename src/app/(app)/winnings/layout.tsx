import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Winnings",
  description: "Your wins and claimable payouts.",
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
