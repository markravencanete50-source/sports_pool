import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Admin \u2014 users",
  description: "Manage user accounts and roles.",
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
