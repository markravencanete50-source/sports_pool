import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Private pools",
  description: "Your invite-only NFL pools.",
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
