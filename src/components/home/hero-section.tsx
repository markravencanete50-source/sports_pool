"use client";

import Link from "next/link";
import { Flame } from "lucide-react";
import { FeaturedPoolCard } from "./featured-pool-card";
import type { Pool } from "@/lib/types";
import { NeonFootballLogo } from "@/components/ui/neon-football-logo";

export function HeroSection({ featuredPool }: { featuredPool?: Pool | null }) {
  return (
    <div className="relative rounded-2xl overflow-hidden bg-gradient-to-r from-black to-gray-900 p-8 md:p-12 border border-white/10 shadow-2xl group">
      <div className="absolute top-0 right-0 w-1/2 h-full bg-gradient-to-l from-primary/20 to-transparent skew-x-12 transform translate-x-20 pointer-events-none" />
      <div className="relative z-10 max-w-2xl space-y-6">
          <div className="relative inline-block">
            <h1 className="text-5xl md:text-6xl font-black font-display tracking-tighter text-white italic uppercase relative z-10">
              Dominate the{" "}
              <span className="text-primary neon-text">Gridiron</span>
            </h1>

            {/* Fire Trail Animation - CSS Effect */}
            <div className="absolute -bottom-2 left-0 w-full h-2 fire-trail pointer-events-none z-0 opacity-80" />
            <div className="absolute -bottom-2 left-0 w-full h-1 bg-orange-500/20 blur-md animate-pulse pointer-events-none z-0" />
          </div>

          <p className="text-xl text-muted-foreground font-medium leading-relaxed relative z-10">
            Join the ultimate NFL betting community. Predict winners, climb
            the leaderboard, and take home the pot.
          </p>
          <div className="flex flex-wrap gap-4 pt-4 relative z-10">
            <Link href="/public-pools">
              <div className="btn-3d-primary px-8 py-4 text-sm flex items-center gap-2 cursor-pointer">
                <Flame className="w-5 h-5" /> Join Public Pool
              </div>
            </Link>
            <Link href="/create-pool">
              <div className="btn-3d-secondary px-8 py-4 text-sm cursor-pointer">
                Create Private Pool
              </div>
            </Link>
          </div>

        {/* Main Public Pool Featured Box */}
        <div className="pt-6 relative z-10">
          <FeaturedPoolCard pool={featuredPool} />
        </div>
      </div>

      {/* Right Side - Animated Logo (Absolutely Positioned) */}
      <div className="absolute top-0 right-0 w-1/2 h-full hidden lg:flex items-center justify-center pointer-events-none">
        <div className="relative w-full h-full max-w-md flex items-center justify-center translate-x-8 xl:translate-x-12">
          {/* Animated background glow */}
          <div className="absolute inset-0 flex items-center justify-center">
            <div 
              className="absolute w-[70%] h-[70%] blur-3xl opacity-60 animate-pulse"
              style={{
                background: 'radial-gradient(ellipse, hsl(var(--primary) / 0.4) 0%, hsl(var(--primary) / 0.1) 50%, transparent 100%)'
              }}
            />
          </div>

          {/* Rotating outer ring */}
          <div 
            className="absolute w-[85%] h-[85%] border-2 border-primary/20 rounded-full animate-[spin_20s_linear_infinite]"
          >
            <div className="absolute top-0 left-1/2 w-1 h-3 bg-primary/40 rounded-full -translate-x-1/2" />
            <div className="absolute bottom-0 left-1/2 w-1 h-3 bg-primary/40 rounded-full -translate-x-1/2" />
            <div className="absolute left-0 top-1/2 w-3 h-1 bg-primary/40 rounded-full -translate-y-1/2" />
            <div className="absolute right-0 top-1/2 w-3 h-1 bg-primary/40 rounded-full -translate-y-1/2" />
          </div>

          {/* Counter-rotating inner ring */}
          <div 
            className="absolute w-[60%] h-[60%] border border-primary/10 rounded-full animate-[spin_15s_linear_infinite] [animation-direction:reverse]"
          />

          {/* Main Logo Container */}
          <div className="relative z-10 w-[50%] h-[50%] flex items-center justify-center transform transition-transform duration-300 group-hover:scale-110">
            {/* Pulsing glow behind logo */}
            <div className="absolute inset-0 bg-primary/30 rounded-full blur-2xl animate-pulse" />
            <div 
              className="absolute inset-0 bg-primary/20 rounded-full blur-xl"
              style={{
                animation: 'pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite'
              }}
            />
            
            {/* Rotating logo */}
            <div 
              className="relative z-10 transform transition-transform duration-300 group-hover:scale-105 animate-[spin_25s_linear_infinite] [animation-direction:reverse]"
            >
              <NeonFootballLogo className="w-full h-full" />
            </div>

            {/* Orbiting particles */}
            <div className="absolute inset-0 pointer-events-none">
              {[...Array(6)].map((_, i) => {
                const duration = 10 + i * 1.5;
                return (
                  <div
                    key={i}
                    className="absolute w-1.5 h-1.5 bg-primary rounded-full blur-sm opacity-70"
                    style={{
                      top: '50%',
                      left: '50%',
                      transform: `translate(-50%, -50%) rotate(${i * 60}deg) translateY(-100px)`,
                      animation: `spin ${duration}s linear infinite`,
                      transformOrigin: '0 100px',
                      boxShadow: '0 0 6px hsl(var(--primary))'
                    }}
                  />
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
