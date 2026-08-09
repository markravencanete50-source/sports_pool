"use client";

import { Card3D } from "@/components/ui/3d-card";
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
      <div className="w-full max-w-md animate-in fade-in slide-in-from-bottom-4 duration-500">
        <Card3D intensity={10}>
          <div className="glass-panel p-6 sm:p-8 rounded-2xl space-y-8">
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
              <Link href={footerLinkHref}>
                <span className="text-primary hover:underline cursor-pointer">
                  {footerLinkText}
                </span>
              </Link>
            </div>
          </div>
        </Card3D>
      </div>
    </div>
  );
}
