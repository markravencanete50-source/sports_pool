"use client";

import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DASHBOARD_PATH } from "@/lib/routes";

export default function NotFound() {
  return (
    <div className="min-h-screen w-full flex items-center justify-center bg-background text-foreground px-4">
      <div className="glass-panel w-full max-w-md rounded-3xl p-8 text-center animate-in fade-in zoom-in-95 duration-500">
        <p className="font-display text-7xl font-black italic text-primary neon-text">
          404
        </p>
        <h1 className="mt-4 text-2xl font-bold">Fumble! Page not found.</h1>
        <p className="mt-3 text-sm leading-6 text-muted-foreground">
          The page you&apos;re looking for doesn&apos;t exist or has moved.
        </p>
        <Button asChild className="mt-8 min-h-11 px-6 font-semibold uppercase">
          <Link href={DASHBOARD_PATH}>
            <ArrowLeft />
            Back to Dashboard
          </Link>
        </Button>
      </div>
    </div>
  );
}
