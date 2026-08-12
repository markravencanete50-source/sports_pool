import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "White label",
  description: "Run Sports Pool for your own community.",
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
