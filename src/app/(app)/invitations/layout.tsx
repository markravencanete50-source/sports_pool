import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Invitations",
  description: "Pool invitations waiting for your answer.",
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
