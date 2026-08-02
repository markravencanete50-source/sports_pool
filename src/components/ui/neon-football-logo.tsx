"use client";

import { cn } from "@/lib/utils";

export function NeonFootballLogo({ className }: { className?: string }) {
  return (
    <div className={cn("relative flex items-center justify-center", className)}>
      <svg
        viewBox="0 0 100 60"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        className="w-full h-full overflow-visible"
      >
        <defs>
          <filter id="neon-glow" x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur stdDeviation="2.5" result="coloredBlur" />
            <feMerge>
              <feMergeNode in="coloredBlur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
          <linearGradient
            id="ball-gradient"
            x1="50"
            y1="0"
            x2="50"
            y2="60"
            gradientUnits="userSpaceOnUse"
          >
            <stop offset="0%" stopColor="#ff4d4d" />
            <stop offset="50%" stopColor="#cc0000" />
            <stop offset="100%" stopColor="#800000" />
          </linearGradient>
          <linearGradient
            id="lace-gradient"
            x1="50"
            y1="15"
            x2="50"
            y2="45"
            gradientUnits="userSpaceOnUse"
          >
            <stop offset="0%" stopColor="#ffffff" />
            <stop offset="100%" stopColor="#cccccc" />
          </linearGradient>
        </defs>

        {/* Outer Glow Layer */}
        <ellipse
          cx="50"
          cy="30"
          rx="48"
          ry="28"
          stroke="#ff0000"
          strokeWidth="4"
          className="opacity-80 blur-md"
        />

        {/* Main Ball Body */}
        <ellipse
          cx="50"
          cy="30"
          rx="45"
          ry="25"
          fill="url(#ball-gradient)"
          stroke="#ff4d4d"
          strokeWidth="2"
          filter="url(#neon-glow)"
        />

        {/* Stripes */}
        <path
          d="M25 12 C22 18, 22 42, 25 48"
          stroke="white"
          strokeWidth="3"
          strokeLinecap="round"
          fill="none"
          opacity="1"
          filter="url(#neon-glow)"
        />
        <path
          d="M75 12 C78 18, 78 42, 75 48"
          stroke="white"
          strokeWidth="3"
          strokeLinecap="round"
          fill="none"
          opacity="1"
          filter="url(#neon-glow)"
        />

        {/* Laces */}
        <g filter="url(#neon-glow)">
          {/* Main vertical lace */}
          <path
            d="M35 30 L65 30"
            stroke="white"
            strokeWidth="3"
            strokeLinecap="round"
          />
          {/* Cross laces - creating a 3D curvature effect */}
          <path
            d="M40 25 L40 35"
            stroke="white"
            strokeWidth="3"
            strokeLinecap="round"
          />
          <path
            d="M45 24 L45 36"
            stroke="white"
            strokeWidth="3"
            strokeLinecap="round"
          />
          <path
            d="M50 23 L50 37"
            stroke="white"
            strokeWidth="3"
            strokeLinecap="round"
          />
          <path
            d="M55 24 L55 36"
            stroke="white"
            strokeWidth="3"
            strokeLinecap="round"
          />
          <path
            d="M60 25 L60 35"
            stroke="white"
            strokeWidth="3"
            strokeLinecap="round"
          />
        </g>

        {/* Shine/Highlight */}
        <ellipse
          cx="50"
          cy="15"
          rx="30"
          ry="8"
          fill="white"
          opacity="0.3"
          filter="url(#neon-glow)"
        />
      </svg>
    </div>
  );
}
