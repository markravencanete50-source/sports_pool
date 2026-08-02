"use client";

import { forwardRef } from "react";
import { FormInputProps } from "@/lib/interfaces";

export const FormInput = forwardRef<HTMLInputElement, FormInputProps>(
  ({ label, rightElement, error, className, ...props }, ref) => {
    return (
      <div className="space-y-2">
        {rightElement ? (
          <div className="flex justify-between">
            <label className="text-xs font-mono uppercase text-muted-foreground">
              {label}
            </label>
            {rightElement}
          </div>
        ) : (
          <label className="text-xs font-mono uppercase text-muted-foreground">
            {label}
          </label>
        )}
        <input
          ref={ref}
          className={`w-full bg-black/20 border ${
            error ? "border-destructive" : "border-white/10"
          } rounded-lg px-4 py-3 focus:outline-none focus:ring-1 focus:ring-primary focus:border-primary/50 transition-all ${
            className || ""
          }`}
          {...props}
        />
        {error && (
          <p className="text-xs text-destructive mt-1">{error}</p>
        )}
      </div>
    );
  }
);

FormInput.displayName = "FormInput";
