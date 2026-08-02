"use client";

import Image from "next/image";
import { cn } from "@/lib/utils";

export function SportPoolLogo({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        "relative flex items-center justify-center shrink-0",
        className
      )}
    >
      <Image
        src="/sport_pool_logo.svg"
        alt="Sports Pool"
        width={64}
        height={40}
        className="w-full h-full object-contain"
        priority
      />
    </div>
  );
}
