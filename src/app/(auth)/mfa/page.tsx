"use client";

import Layout from "@/components/layout";
import { AuthForm } from "@/components/auth/auth-form";
import { FormInput } from "@/components/auth/form-input";
import { useAuth } from "@/lib/hooks/use-auth";
import { safeInternalPath } from "@/lib/routes";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import { toast } from "sonner";
import Link from "next/link";
import { ShieldCheck } from "lucide-react";

/**
 * Step-up challenge: enter the authenticator code to raise THIS session to
 * aal2. The admin console redirects here (src/proxy.ts) whenever a signed-in
 * admin's session has not yet presented their second factor, so a lingering
 * cookie on a shared machine stops at this prompt.
 */
type StepUpState = { hasFactor: boolean; currentLevel: string; satisfied: boolean };

function MfaChallenge() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const next = safeInternalPath(searchParams.get("next"));
  const { isAuthenticated, isLoadingUser } = useAuth();
  const [state, setState] = useState<StepUpState | null>(null);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (isLoadingUser) return;
    if (!isAuthenticated) {
      router.replace(`/login?redirect=${encodeURIComponent(`/mfa?next=${next}`)}`);
      return;
    }
    let cancelled = false;
    fetch("/api/me/mfa/step-up", { credentials: "include" })
      .then((r) => r.json())
      .then((json: StepUpState) => {
        if (cancelled) return;
        if (json.satisfied) {
          router.replace(next);
          return;
        }
        setState(json);
      })
      .catch(() => {
        if (!cancelled) toast.error("Could not check your session. Try again.");
      });
    return () => {
      cancelled = true;
    };
  }, [isAuthenticated, isLoadingUser, next, router]);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!/^\d{6}$/.test(code) || busy) return;
    setBusy(true);
    try {
      const res = await fetch("/api/me/mfa/step-up", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code }),
        credentials: "include",
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error((json as { error?: string }).error ?? "That code was not accepted.");
        setCode("");
        return;
      }
      toast.success("Verified");
      // Full navigation so the proxy sees the upgraded session cookie.
      window.location.assign(next);
    } finally {
      setBusy(false);
    }
  };

  if (isLoadingUser || (isAuthenticated && !state)) {
    return (
      <Layout>
        <div className="flex items-center justify-center min-h-[80vh]">
          <div className="text-muted-foreground">Checking your session…</div>
        </div>
      </Layout>
    );
  }

  if (state && !state.hasFactor) {
    return (
      <Layout>
        <div className="max-w-md mx-auto py-16">
          <div className="glass-panel rounded-2xl p-8 space-y-4 text-center">
            <ShieldCheck className="w-10 h-10 text-primary mx-auto" />
            <h1 className="text-2xl font-black font-display italic uppercase">Two-factor required</h1>
            <p className="text-sm text-muted-foreground">
              The admin console can only be opened with an authenticator app. Set one up once and every admin session will ask for its code.
            </p>
            <Link href={`/account/security?reason=admin_mfa&next=${encodeURIComponent(next)}`} className="btn-3d-primary inline-flex px-6 py-3 text-sm">
              Set up two-factor authentication
            </Link>
          </div>
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <AuthForm
        title="Verify it's you"
        subtitle="Enter the 6-digit code from your authenticator app to continue to the admin console."
        onSubmit={onSubmit}
        footerText="Lost your authenticator?"
        footerLinkText="Contact a super admin"
        footerLinkHref="/contact"
      >
        <FormInput
          label="Authenticator code"
          id="mfa-step-up-code"
          type="text"
          inputMode="numeric"
          autoComplete="one-time-code"
          pattern="[0-9]{6}"
          maxLength={6}
          value={code}
          onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
          placeholder="123456"
        />
        <button
          type="submit"
          disabled={busy || code.length !== 6}
          className="btn-3d-primary w-full py-3 text-sm disabled:opacity-50"
        >
          {busy ? "Verifying…" : "Continue"}
        </button>
      </AuthForm>
    </Layout>
  );
}

export default function MfaPage() {
  return (
    <Suspense
      fallback={
        <Layout>
          <div className="flex items-center justify-center min-h-[80vh]">
            <div className="text-muted-foreground">Loading…</div>
          </div>
        </Layout>
      }
    >
      <MfaChallenge />
    </Suspense>
  );
}
