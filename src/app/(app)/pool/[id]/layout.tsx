import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Pool",
  description: "Pool details, games and standings.",
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
