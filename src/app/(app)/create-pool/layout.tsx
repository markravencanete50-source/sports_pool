import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Create a pool",
  description: "Set up a new NFL pool.",
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
