"use client";

import Link from "next/link";
import { Card3D } from "@/components/ui/3d-card";
import { PoolCard } from "@/components/pool-card";
import { Pool } from "@/lib/mock-data";
import { YourActivePoolsSectionProps } from "@/lib/interfaces";

export function YourActivePoolsSection({
  pools,
}: YourActivePoolsSectionProps) {
  return (
    <section>
      <h2 className="text-2xl font-bold mb-6 flex items-center gap-2">
        <Card3D intensity={20} className="inline-block w-8 h-8">
          <span className="text-2xl">🏈</span>
        </Card3D>
        Your Active Pools
      </h2>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {pools.map((pool) => (
          <PoolCard key={pool.id} pool={pool} />
        ))}

        {/* Create New Placeholder */}
        <Link href="/private-pools">
          <div className="h-full min-h-[250px] border-2 border-dashed border-white/10 rounded-xl flex flex-col items-center justify-center gap-4 text-muted-foreground hover:text-primary hover:border-primary/50 hover:bg-primary/5 transition-all cursor-pointer group">
            <div className="w-16 h-16 rounded-full bg-white/5 flex items-center justify-center group-hover:scale-110 transition-transform">
              <span className="text-3xl">+</span>
            </div>
            <span className="font-bold uppercase tracking-wider text-sm">
              Create New Pool
            </span>
          </div>
        </Link>
      </div>
    </section>
  );
}
