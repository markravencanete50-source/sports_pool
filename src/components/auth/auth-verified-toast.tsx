"use client";

import { useSearchParams, usePathname, useRouter } from "next/navigation";
import { toast } from "sonner";
import { useEffect, useRef } from "react";

export function AuthVerifiedToast() {
  const searchParams = useSearchParams();
  const pathname = usePathname();
  const router = useRouter();
  const shownRef = useRef(false);

  useEffect(() => {
    if (shownRef.current) return;
    const verified = searchParams.get("verified");
    if (verified !== "1") return;

    shownRef.current = true;
    toast.success("Email verified successfully!");

    const params = new URLSearchParams(searchParams);
    params.delete("verified");
    const query = params.toString();
    const url = query ? `${pathname}?${query}` : pathname;
    router.replace(url, { scroll: false });
  }, [searchParams, pathname, router]);

  return null;
}
