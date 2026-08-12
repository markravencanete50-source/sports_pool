import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "My games",
  description: "Your cards and picks across active pools.",
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
