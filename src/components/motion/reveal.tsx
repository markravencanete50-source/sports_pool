"use client";

import * as React from "react";
import {
  motion,
  useReducedMotion,
  type HTMLMotionProps,
  type Variants,
} from "framer-motion";

import { cn } from "@/lib/utils";

const EASE_OUT = [0.21, 0.47, 0.32, 0.98] as const;

type RevealProps = HTMLMotionProps<"div"> & {
  /** Delay in seconds before the reveal starts. */
  delay?: number;
  /** Distance in px the element rises while fading in. */
  y?: number;
  /** Play once when scrolled into view (default) or on every entry. */
  once?: boolean;
};

/**
 * Fade-and-rise scroll reveal. Renders content immediately (no layout shift,
 * SSR-safe) and animates when the element enters the viewport. Falls back to
 * a plain fade when the user prefers reduced motion.
 */
export function Reveal({
  delay = 0,
  y = 24,
  once = true,
  className,
  children,
  ...props
}: RevealProps) {
  const reduceMotion = useReducedMotion();

  return (
    <motion.div
      initial={{ opacity: 0, y: reduceMotion ? 0 : y }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once, margin: "0px 0px -10% 0px" }}
      transition={{ duration: 0.6, delay, ease: EASE_OUT }}
      className={className}
      {...props}
    >
      {children}
    </motion.div>
  );
}

const staggerParent: Variants = {
  hidden: {},
  visible: (stagger: number) => ({
    transition: { staggerChildren: stagger, delayChildren: 0.08 },
  }),
};

type StaggerGroupProps = HTMLMotionProps<"div"> & {
  /** Seconds between each child's entrance. */
  stagger?: number;
  once?: boolean;
};

/**
 * Container that staggers the entrance of its <StaggerItem> children when it
 * scrolls into view. Use for card grids and lists.
 */
export function StaggerGroup({
  stagger = 0.08,
  once = true,
  className,
  children,
  ...props
}: StaggerGroupProps) {
  return (
    <motion.div
      initial="hidden"
      whileInView="visible"
      viewport={{ once, margin: "0px 0px -8% 0px" }}
      variants={staggerParent}
      custom={stagger}
      className={className}
      {...props}
    >
      {children}
    </motion.div>
  );
}

type StaggerItemProps = HTMLMotionProps<"div"> & {
  y?: number;
};

export function StaggerItem({
  y = 20,
  className,
  children,
  ...props
}: StaggerItemProps) {
  const reduceMotion = useReducedMotion();

  const item: Variants = {
    hidden: { opacity: 0, y: reduceMotion ? 0 : y },
    visible: {
      opacity: 1,
      y: 0,
      transition: { duration: 0.5, ease: EASE_OUT },
    },
  };

  return (
    <motion.div variants={item} className={className} {...props}>
      {children}
    </motion.div>
  );
}

type HoverLiftProps = HTMLMotionProps<"div"> & {
  /** Pixels to lift on hover. */
  lift?: number;
};

/**
 * Subtle lift-on-hover + press-on-tap wrapper for interactive cards.
 * Disabled entirely under reduced motion.
 */
export function HoverLift({
  lift = 4,
  className,
  children,
  ...props
}: HoverLiftProps) {
  const reduceMotion = useReducedMotion();

  return (
    <motion.div
      whileHover={reduceMotion ? undefined : { y: -lift }}
      whileTap={reduceMotion ? undefined : { scale: 0.985 }}
      transition={{ type: "spring", stiffness: 380, damping: 26 }}
      className={cn("will-change-transform", className)}
      {...props}
    >
      {children}
    </motion.div>
  );
}
