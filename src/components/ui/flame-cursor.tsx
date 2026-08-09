"use client";

import { useEffect } from 'react';

const MAX_LIVE_PARTICLES = 40;

export function FlameCursor() {
  useEffect(() => {
    // Only a decorative mouse effect: skip on touch devices and for users
    // who prefer reduced motion.
    if (
      !window.matchMedia("(pointer: fine)").matches ||
      window.matchMedia("(prefers-reduced-motion: reduce)").matches
    ) {
      return;
    }

    let lastX = 0;
    let lastY = 0;
    let lastTime = 0;
    let liveParticles = 0;

    const createParticle = (x: number, y: number) => {
      if (liveParticles >= MAX_LIVE_PARTICLES) return;
      liveParticles++;
      const particle = document.createElement('div');
      particle.classList.add('flame-particle');
      
      // Randomize movement slightly
      const tx = (Math.random() - 0.5) * 30;
      const ty = -30 - Math.random() * 30; // Always moves up (heat rises)
      const scale = 0.5 + Math.random() * 0.8;
      const rotation = Math.random() * 360;
      
      particle.style.setProperty('--tx', `${tx}px`);
      particle.style.setProperty('--ty', `${ty}px`);
      particle.style.setProperty('--rot', `${rotation}deg`);
      particle.style.left = `${x}px`;
      particle.style.top = `${y}px`;
      particle.style.transform = `scale(${scale})`;
      
      // Random flame colors (Bright Red -> Orange -> Yellow -> White for heat)
      const colors = ['#ef4444', '#f97316', '#facc15', '#ffffff'];
      const color = colors[Math.floor(Math.random() * colors.length)];
      particle.style.background = `radial-gradient(circle, ${color} 20%, transparent 70%)`;
      particle.style.border = `1px solid rgba(0,0,0,0.1)`; // Slight outline for contrast on white

      document.body.appendChild(particle);
      
      // Cleanup
      setTimeout(() => {
        particle.remove();
        liveParticles--;
      }, 600);
    };

    const handleMouseMove = (e: MouseEvent) => {
      const now = Date.now();
      const dist = Math.hypot(e.clientX - lastX, e.clientY - lastY);
      
      // Throttle particle creation slightly but scale with speed
      if (now - lastTime > 10 || dist > 20) {
        createParticle(e.clientX, e.clientY);
        
        // If moving fast, add extra particles to fill gaps
        if (dist > 30) {
          createParticle((e.clientX + lastX) / 2, (e.clientY + lastY) / 2);
        }
        
        lastX = e.clientX;
        lastY = e.clientY;
        lastTime = now;
      }
    };

    window.addEventListener('mousemove', handleMouseMove);
    return () => window.removeEventListener('mousemove', handleMouseMove);
  }, []);

  return null;
}
