"use client";

import Link from "next/link";
import { EmptyStateProps } from "@/lib/interfaces";

export function EmptyState({
  icon: Icon,
  title,
  description,
  actionText,
  actionHref,
}: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center py-20 border border-dashed border-white/10 rounded-2xl bg-white/5">
      <div className="w-20 h-20 rounded-full bg-white/5 flex items-center justify-center mb-6">
        <Icon className="w-8 h-8 text-muted-foreground" />
      </div>
      <h3 className="text-xl font-bold font-display mb-2">{title}</h3>
      <p className="text-muted-foreground mb-6">{description}</p>
      <Link href={actionHref}>
        <button className="bg-white text-black px-8 py-3 rounded-lg font-bold uppercase tracking-wider hover:bg-gray-200 transition-colors">
          {actionText}
        </button>
      </Link>
    </div>
  );
}
