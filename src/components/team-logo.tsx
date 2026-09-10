"use client";

import Image from "next/image";
import { useState, type CSSProperties } from "react";
import { getTeamLogoUrl } from "@/lib/constants";
import { cn } from "@/lib/utils";

type TeamLogoProps = {
  abbreviation: string;
  name?: string | null;
  src?: string | null;
  size: number;
  className?: string;
  style?: CSSProperties;
};

function trustedLogoUrl(src: string | null | undefined): string | null {
  if (!src) return null;
  try {
    const url = new URL(src);
    return url.protocol === "https:" && url.hostname === "a.espncdn.com"
      ? url.toString()
      : null;
  } catch {
    return null;
  }
}

export function TeamLogo({
  abbreviation,
  name,
  src,
  size,
  className,
  style,
}: TeamLogoProps) {
  const [failed, setFailed] = useState(false);
  const logoUrl = trustedLogoUrl(src) ?? getTeamLogoUrl(abbreviation);
  const label = name || abbreviation;

  return (
    <div
      className={cn(
        "relative shrink-0 overflow-hidden rounded-full border border-white/10 bg-gradient-to-br from-gray-800 to-black",
        className,
      )}
      style={{ width: size, height: size, ...style }}
    >
      {!failed ? (
        <Image
          src={logoUrl}
          alt={`${label} logo`}
          fill
          sizes={`${size}px`}
          className="object-contain p-1"
          onError={() => setFailed(true)}
        />
      ) : (
        <span
          className="flex h-full w-full items-center justify-center text-xs font-black tracking-tight text-white/80"
          aria-label={`${label} logo unavailable`}
        >
          {abbreviation.toUpperCase()}
        </span>
      )}
    </div>
  );
}
