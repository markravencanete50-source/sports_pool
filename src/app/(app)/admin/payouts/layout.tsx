import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Admin \u2014 payouts",
  description: "Review and complete payout requests.",
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
