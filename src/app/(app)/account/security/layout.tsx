import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Security",
  description: "Two-factor authentication for your account.",
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
