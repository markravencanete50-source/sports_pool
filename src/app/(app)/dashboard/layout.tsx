import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Dashboard",
  description: "Your pools, cards and balance at a glance.",
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
