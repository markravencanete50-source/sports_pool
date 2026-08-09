"use client";

import { FormEvent, useState } from "react";
import { toast } from "sonner";
import { ZodError } from "zod";
import { Mail, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { apiRequest } from "@/lib/queryClient";
import { newsletterSignupSchema } from "@/lib/validations";

export function NewsletterSignup() {
  const [email, setEmail] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    try {
      const validated = newsletterSignupSchema.parse({ email });
      setIsSubmitting(true);

      const response = await apiRequest("POST", "/api/newsletter/subscribe", {
        email: validated.email,
      });
      const payload = await response.json();

      toast.success(payload.message || "You are on the list.");
      setEmail("");
    } catch (error) {
      const message =
        error instanceof ZodError
          ? "Please enter a valid email address."
          : error instanceof Error
            ? error.message
            : "Failed to subscribe.";
      toast.error(message);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="overflow-hidden rounded-[2rem] border border-primary/20 bg-gradient-to-r from-primary/15 via-black/70 to-black/80 p-6 shadow-[0_20px_80px_rgba(0,0,0,0.28)] sm:p-8">
      <div className="grid gap-6 lg:grid-cols-[1fr_auto] lg:items-end">
        <div className="space-y-3">
          <div className="inline-flex items-center gap-2 rounded-full border border-primary/20 bg-primary/10 px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.28em] text-primary">
            <Sparkles className="h-3.5 w-3.5" />
            Newsletter
          </div>
          <h3 className="text-3xl font-black italic text-white">
            Get pool drops, weekly hype, and product updates.
          </h3>
          <p className="max-w-2xl text-sm leading-7 text-muted-foreground sm:text-base">
            One clean email when we ship something worth opening: featured pools,
            weekly NFL momentum, and major platform releases.
          </p>
        </div>

        <form
          onSubmit={handleSubmit}
          className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto]"
        >
          <label className="sr-only" htmlFor="newsletter-email">
            Email address
          </label>
          <div className="relative">
            <Mail className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              id="newsletter-email"
              type="email"
              autoComplete="email"
              placeholder="Enter your email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              disabled={isSubmitting}
              className="min-h-12 rounded-2xl border-white/15 bg-black/35 pl-11 text-white placeholder:text-muted-foreground/80 focus-visible:ring-primary"
            />
          </div>
          <Button
            type="submit"
            disabled={isSubmitting}
            className="min-h-12 px-6 font-semibold uppercase"
          >
            {isSubmitting ? "Joining..." : "Join Newsletter"}
          </Button>
        </form>
      </div>
    </div>
  );
}
