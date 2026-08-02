"use client";

import { Check } from "lucide-react";
import { FeatureListProps } from "@/lib/interfaces";

export function FeatureList({ title, features, className }: FeatureListProps) {
  return (
    <div className={className}>
      <h3 className="text-2xl font-bold font-display uppercase italic mb-4 text-black">
        {title}
      </h3>
      <ul className="space-y-4">
        {features.map((feature, i) => (
          <li key={i} className="flex items-start gap-3 text-lg">
            <div className="mt-1 w-6 h-6 rounded-full bg-primary/20 flex items-center justify-center border border-primary/50 text-primary flex-shrink-0">
              <Check className="w-3 h-3" strokeWidth={3} />
            </div>
            <span className="text-black font-medium">{feature}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
