import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Public pools",
  description: "Browse open NFL pools anyone can join.",
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
