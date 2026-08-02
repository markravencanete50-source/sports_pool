"use client";

import Link from "next/link";
import { ArrowRight, TrendingUp } from "lucide-react";
import { PoolCard } from "@/components/pool-card";
import { Pool } from "@/lib/mock-data";
import { FeaturedPoolsSectionProps } from "@/lib/interfaces";

export function FeaturedPoolsSection({ pools }: FeaturedPoolsSectionProps) {
  return (
    <section>
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-2xl font-bold flex items-center gap-2">
          <TrendingUp className="w-6 h-6 text-primary" />
          Trending Pools
        </h2>
        <Link href="/public-pools">
          <span className="text-sm text-muted-foreground hover:text-primary cursor-pointer flex items-center gap-1 transition-colors">
            View All <ArrowRight className="w-4 h-4" />
          </span>
        </Link>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {pools.map((pool) => (
          <PoolCard key={pool.id} pool={pool} />
        ))}
      </div>
    </section>
  );
}
