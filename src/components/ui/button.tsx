"use client";

import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-xl text-sm font-medium transition-[transform,box-shadow,background-color,border-color,color,opacity] duration-200 ease-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/80 focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:pointer-events-none disabled:opacity-50 motion-reduce:transform-none motion-reduce:transition-none [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        default:
          "border border-primary/70 bg-primary text-primary-foreground shadow-[0_10px_30px_rgba(244,63,94,0.22)] hover:-translate-y-0.5 hover:bg-primary/92 hover:shadow-[0_18px_40px_rgba(244,63,94,0.3)] active:translate-y-0 active:shadow-[0_8px_22px_rgba(244,63,94,0.22)]",
        destructive:
          "border border-destructive/70 bg-destructive text-destructive-foreground shadow-[0_10px_28px_rgba(220,38,38,0.22)] hover:-translate-y-0.5 hover:bg-destructive/92 hover:shadow-[0_18px_36px_rgba(220,38,38,0.28)] active:translate-y-0",
        outline:
          "border border-white/15 bg-white/5 text-foreground shadow-[0_10px_24px_rgba(0,0,0,0.18)] hover:-translate-y-0.5 hover:border-primary/45 hover:bg-white/10 hover:text-white hover:shadow-[0_18px_36px_rgba(0,0,0,0.24)] active:translate-y-0",
        secondary:
          "border border-white/10 bg-secondary/80 text-secondary-foreground shadow-[0_8px_20px_rgba(0,0,0,0.14)] hover:-translate-y-0.5 hover:bg-secondary hover:shadow-[0_14px_28px_rgba(0,0,0,0.18)] active:translate-y-0",
        ghost:
          "border border-transparent text-foreground/90 hover:-translate-y-0.5 hover:bg-white/8 hover:text-white active:translate-y-0",
        link: "text-primary underline-offset-4 hover:underline",
      },
      size: {
        default: "min-h-10 px-4 py-2",
        sm: "min-h-9 px-3 text-xs",
        lg: "min-h-11 px-8",
        icon: "h-9 w-9",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : "button";
    return (
      <Comp
        className={cn(buttonVariants({ variant, size, className }))}
        ref={ref}
        {...props}
      />
    );
  }
);
Button.displayName = "Button";

export { Button, buttonVariants };
