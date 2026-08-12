import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Admin \u2014 games",
  description: "Manage games and outcomes.",
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
