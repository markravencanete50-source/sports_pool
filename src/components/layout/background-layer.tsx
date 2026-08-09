"use client";

import Image from "next/image";

export function BackgroundLayer() {
  return (
    <div className="fixed inset-0 z-0 opacity-20 pointer-events-none" aria-hidden="true">
      <Image
        src="/generated_images/abstract_red_neon_stadium_background.png"
        alt=""
        fill
        sizes="100vw"
        className="w-full h-full object-cover"
      />
      <div className="absolute inset-0 bg-gradient-to-b from-background/90 via-background/80 to-background"></div>
    </div>
  );
}
