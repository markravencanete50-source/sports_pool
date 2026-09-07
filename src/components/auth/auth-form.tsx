"use client";

import Link from "next/link";
import { AuthFormProps } from "@/lib/interfaces";

export function AuthForm({
  title,
  subtitle,
  children,
  footerText,
  footerLinkText,
  footerLinkHref,
  onSubmit,
}: AuthFormProps) {
  return (
    <div className="flex items-center justify-center min-h-[80vh]">
      <div className="w-full max-w-md">
        <div className="bg-background/95 border border-white/10 shadow-xl p-6 sm:p-8 rounded-2xl space-y-8">
            <div className="text-center space-y-2">
              <h1 className="text-3xl font-black font-display italic uppercase">
                {title}
              </h1>
              <p className="text-muted-foreground">{subtitle}</p>
            </div>

            <form className="space-y-4" onSubmit={onSubmit}>
              {children}
            </form>

            <div className="text-center text-sm text-muted-foreground">
              {footerText}{" "}
              <Link
                href={footerLinkHref}
                className="inline-flex min-h-11 items-center px-1 text-primary hover:underline"
              >
                {footerLinkText}
              </Link>
            </div>
        </div>
      </div>
    </div>
  );
}
