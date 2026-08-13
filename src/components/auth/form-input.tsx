"use client";

import { forwardRef, useId } from "react";
import { FormInputProps } from "@/lib/interfaces";

/**
 * Labelled text input for the auth forms.
 *
 * ACCESSIBILITY. The label used to be a bare <label> with no htmlFor, sitting as
 * a SIBLING of the input rather than wrapping it — so it was never
 * programmatically associated with anything. Visually it looked correct, which
 * is why it survived; to a screen reader every field on signup and login was an
 * unlabelled edit box, including the password and the date of birth that gates
 * the whole product on age.
 *
 * The jsx-a11y gate did not catch it because the rule sees a <label> containing
 * text in the same component and cannot prove the sibling <input> is unrelated.
 * An automated floor is not a usability verdict — this is what that phrase means
 * in practice. tests/browser/a11y.spec.ts now asserts every input on both forms
 * exposes an accessible name, so it cannot silently return.
 *
 * The error text is wired through aria-describedby and aria-invalid, so the
 * reason a field was rejected is announced with the field rather than being
 * purely visual.
 */
export const FormInput = forwardRef<HTMLInputElement, FormInputProps>(
  ({ label, rightElement, error, className, id, ...props }, ref) => {
    const generatedId = useId();
    const inputId = id ?? generatedId;
    const errorId = `${inputId}-error`;

    const labelEl = (
      <label
        htmlFor={inputId}
        className="text-xs font-mono uppercase text-muted-foreground"
      >
        {label}
      </label>
    );

    return (
      <div className="space-y-2">
        {rightElement ? (
          <div className="flex justify-between">
            {labelEl}
            {rightElement}
          </div>
        ) : (
          labelEl
        )}
        <input
          ref={ref}
          id={inputId}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? errorId : undefined}
          className={`w-full bg-black/20 border ${
            error ? "border-destructive" : "border-white/10"
          } rounded-lg px-4 py-3 focus:outline-none focus:ring-1 focus:ring-primary focus:border-primary/50 transition-all ${
            className || ""
          }`}
          {...props}
        />
        {error && (
          <p id={errorId} className="text-xs text-destructive mt-1">
            {error}
          </p>
        )}
      </div>
    );
  }
);

FormInput.displayName = "FormInput";
