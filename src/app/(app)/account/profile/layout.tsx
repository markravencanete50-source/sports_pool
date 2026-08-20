import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Profile",
  description: "Your display name and profile picture.",
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
