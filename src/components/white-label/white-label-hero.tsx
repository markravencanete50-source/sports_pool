"use client";

import { Mail } from "lucide-react";

export function WhiteLabelHero() {
  return (
    <div className="text-center space-y-6 pt-10">
      <div className="inline-block px-4 py-1.5 rounded-full bg-primary/10 border border-primary/20 backdrop-blur-md text-sm font-mono uppercase tracking-widest text-primary mb-4">
        Enterprise Solutions
      </div>
      <h1 className="text-5xl md:text-7xl font-black font-display uppercase italic leading-none">
        Launch Your Own <br />
        <span className="text-primary neon-text">White Label</span> Platform
      </h1>
      <p className="text-xl text-muted-foreground max-w-2xl mx-auto leading-relaxed">
        Run fully branded sports pools for your company, bar, or large
        community. Get dedicated servers, custom domains, and advanced
        analytics.
      </p>
      <div className="flex justify-center pt-4">
        <button className="btn-3d-primary px-10 py-5 text-lg flex items-center gap-3">
          <Mail className="w-5 h-5" /> Contact Sales Team
        </button>
      </div>
    </div>
  );
}
