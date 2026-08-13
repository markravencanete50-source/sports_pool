"use client";

import { forwardRef, useId, useState } from "react";
import { Eye, EyeOff } from "lucide-react";
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
 *
 * REVEAL TOGGLE. Password fields get a show/hide control. It is a real
 * <button type="button"> — not a div with an onClick — so it is keyboard
 * reachable and cannot accidentally submit the form, and it carries aria-pressed
 * so a screen reader announces the current state rather than just "button".
 * The input's `type` is what changes; the value is never copied anywhere.
 */
export const FormInput = forwardRef<HTMLInputElement, FormInputProps>(
  ({ label, rightElement, error, className, id, type, revealToggle, ...props }, ref) => {
    const generatedId = useId();
    const inputId = id ?? generatedId;
    const errorId = `${inputId}-error`;

    const isPassword = type === "password";
    const canReveal = revealToggle ?? isPassword;
    const [revealed, setRevealed] = useState(false);

    // Only a password field has anything to reveal; everything else keeps the
    // type it was given.
    const effectiveType = isPassword && revealed ? "text" : type;

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

        <div className="relative">
          <input
            ref={ref}
            id={inputId}
            type={effectiveType}
            aria-invalid={error ? true : undefined}
            aria-describedby={error ? errorId : undefined}
            className={`w-full bg-black/20 border ${
              error ? "border-destructive" : "border-white/10"
            } rounded-lg px-4 py-3 ${
              canReveal ? "pr-12" : ""
            } focus:outline-none focus:ring-1 focus:ring-primary focus:border-primary/50 transition-all ${
              className || ""
            }`}
            {...props}
          />

          {canReveal && (
            <button
              type="button"
              onClick={() => setRevealed((v) => !v)}
              aria-label={revealed ? `Hide ${label.toLowerCase()}` : `Show ${label.toLowerCase()}`}
              aria-pressed={revealed}
              aria-controls={inputId}
              // -mt-px keeps the icon optically centred against the 3-unit
              // vertical padding above.
              className="absolute right-0 top-0 flex h-full w-12 items-center justify-center rounded-r-lg text-muted-foreground transition-colors hover:text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
            >
              {revealed ? (
                <EyeOff className="size-4" aria-hidden="true" />
              ) : (
                <Eye className="size-4" aria-hidden="true" />
              )}
            </button>
          )}
        </div>

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
