"use client";

import * as Dialog from "@radix-ui/react-dialog";
import { AlertCircle } from "lucide-react";

/**
 * Modal listing why a submission was rejected.
 *
 * WHY THIS EXISTS. Validation errors were shown only as small red text beneath
 * each field. On a long form that reads bottom-up on a phone, the failing field
 * is frequently off-screen when the submit button is pressed — so the button
 * appears to do nothing. "Nothing happened" is the worst possible feedback: the
 * user cannot tell a rejected form from a broken site, and the usual next move
 * is to press it again, or leave.
 *
 * The inline messages stay. They are the right place to say what is wrong with a
 * specific field once you are looking at it. This adds the thing they cannot
 * do: tell you, at the moment you press the button, that something was rejected
 * and where it is.
 *
 * ACCESSIBILITY. Radix Dialog gives focus trapping, Escape to close, focus
 * restoration to the trigger, and correct aria-modal/labelledby wiring. It is
 * built as a dialog rather than a toast deliberately: a toast can be missed,
 * auto-dismisses, and is announced politely — none of which suits "your account
 * was not created". The list uses <ol> because the order matches the form.
 */

export interface FormErrorDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title?: string;
  /** Field label paired with the message, in form order. */
  errors: Array<{ field: string; message: string }>;
}

export function FormErrorDialog({
  open,
  onOpenChange,
  title = "Check these before continuing",
  errors,
}: FormErrorDialogProps) {
  const count = errors.length;

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm data-[state=open]:animate-in data-[state=open]:fade-in-0" />
        <Dialog.Content
          className="fixed left-1/2 top-1/2 z-50 w-[calc(100vw-2rem)] max-w-md -translate-x-1/2 -translate-y-1/2 rounded-xl border border-destructive/30 bg-background p-6 shadow-2xl focus:outline-none data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95"
        >
          <div className="flex items-start gap-3">
            <AlertCircle className="mt-0.5 size-5 shrink-0 text-destructive" aria-hidden="true" />
            <div className="min-w-0 flex-1">
              <Dialog.Title className="text-lg font-bold">{title}</Dialog.Title>
              <Dialog.Description className="mt-1 text-sm text-muted-foreground">
                {count === 1
                  ? "One field needs fixing before your account can be created."
                  : `${count} fields need fixing before your account can be created.`}
              </Dialog.Description>
            </div>
          </div>

          <ol className="mt-4 space-y-2">
            {errors.map((e) => (
              <li
                key={e.field}
                className="rounded-lg border border-destructive/20 bg-destructive/10 px-3 py-2 text-sm"
              >
                <span className="font-mono text-xs uppercase text-muted-foreground">
                  {e.field}
                </span>
                <p className="mt-0.5">{e.message}</p>
              </li>
            ))}
          </ol>

          <Dialog.Close asChild>
            <button
              type="button"
              className="mt-5 w-full rounded-lg bg-primary px-5 py-3 text-sm font-semibold text-primary-foreground transition-opacity hover:opacity-90 focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2 focus:ring-offset-background"
            >
              Let me fix it
            </button>
          </Dialog.Close>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
