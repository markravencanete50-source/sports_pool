import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Sign up",
  description: "Create your Sports Pool account and join NFL pools.",
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
