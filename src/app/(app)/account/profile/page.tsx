"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Image from "next/image";
import { Check, Loader2, Trash2, Upload, X } from "lucide-react";
import Layout from "@/components/layout";
import { toast } from "sonner";
import {
  DISPLAY_NAME_MAX,
  describeDisplayNameProblem,
  displayNameKey,
  normalizeDisplayName,
} from "@/lib/display-name";

/*
 * Profile: display name and picture.
 *
 * The availability check is ADVISORY and the UI says so by never blocking on
 * it. The database holds the unique index, and the gap between "checked" and
 * "saved" is a real race — so Save is always enabled for a well-formed name
 * and a 409 is handled as a normal outcome rather than an error state. A
 * checker that promises more than it can keep is worse than none.
 *
 * Shape problems are reported locally (instant, and the wording is better than
 * "unavailable"); only uniqueness needs the round trip.
 */

interface Me {
  id: string;
  name: string | null;
  email: string | null;
  avatar: string | null;
}

type NameState =
  | { kind: "idle" }
  | { kind: "invalid"; message: string }
  | { kind: "checking" }
  | { kind: "available" }
  | { kind: "taken"; message: string }
  | { kind: "unknown" };

export default function ProfilePage() {
  const [me, setMe] = useState<Me | null>(null);
  const [loading, setLoading] = useState(true);
  const [name, setName] = useState("");
  const [nameState, setNameState] = useState<NameState>({ kind: "idle" });
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  // Guards against an out-of-order availability response overwriting a newer
  // one — the classic debounce bug where the slow answer for an old string
  // lands last and contradicts what is on screen.
  const requestSeq = useRef(0);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/auth/me", { cache: "no-store" });
      if (!res.ok) throw new Error("not signed in");
      const body = await res.json();
      const user: Me = body.user ?? body;
      setMe(user);
      setName(user.name ?? "");
    } catch {
      toast.error("Could not load your profile.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const savedName = me?.name ?? "";
  const trimmed = normalizeDisplayName(name);
  const unchanged = displayNameKey(trimmed) === displayNameKey(savedName);

  // Debounced availability check.
  useEffect(() => {
    if (!me) return;

    if (trimmed.length === 0) {
      setNameState({ kind: "idle" });
      return;
    }
    const problem = describeDisplayNameProblem(trimmed);
    if (problem) {
      setNameState({ kind: "invalid", message: problem });
      return;
    }
    if (unchanged) {
      setNameState({ kind: "idle" });
      return;
    }

    setNameState({ kind: "checking" });
    const seq = ++requestSeq.current;
    const timer = setTimeout(async () => {
      try {
        const res = await fetch(
          `/api/me/display-name?name=${encodeURIComponent(trimmed)}`,
          { cache: "no-store" }
        );
        if (seq !== requestSeq.current) return; // A newer keystroke won.
        if (!res.ok) {
          setNameState({ kind: "unknown" });
          return;
        }
        const body = await res.json();
        setNameState(
          body.available
            ? { kind: "available" }
            : { kind: "taken", message: body.reason ?? "That name is taken." }
        );
      } catch {
        if (seq === requestSeq.current) setNameState({ kind: "unknown" });
      }
    }, 400);

    return () => clearTimeout(timer);
  }, [trimmed, unchanged, me]);

  async function saveName() {
    if (saving) return;
    const problem = describeDisplayNameProblem(trimmed);
    if (problem) {
      toast.error(problem);
      return;
    }

    setSaving(true);
    try {
      const res = await fetch("/api/me/display-name", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: trimmed }),
      });
      const body = await res.json().catch(() => ({}));

      if (res.status === 409) {
        // Someone took it between the check and the save, or it is reserved.
        setNameState({ kind: "taken", message: body.error });
        toast.error(body.error ?? "That name is no longer available.");
        return;
      }
      if (!res.ok) {
        toast.error(body.error ?? "Could not save your display name.");
        return;
      }

      setMe((prev) => (prev ? { ...prev, name: body.name } : prev));
      setName(body.name);
      setNameState({ kind: "idle" });
      toast.success("Display name updated.");
    } catch {
      toast.error("Could not save your display name.");
    } finally {
      setSaving(false);
    }
  }

  async function uploadAvatar(file: File) {
    setUploading(true);
    try {
      const form = new FormData();
      form.append("file", file);
      const res = await fetch("/api/me/avatar", { method: "POST", body: form });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(body.error ?? "Could not upload that image.");
        return;
      }
      setMe((prev) => (prev ? { ...prev, avatar: body.avatar } : prev));
      toast.success("Profile picture updated.");
    } catch {
      toast.error("Could not upload that image.");
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  async function removeAvatar() {
    setUploading(true);
    try {
      const res = await fetch("/api/me/avatar", { method: "DELETE" });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(body.error ?? "Could not remove your picture.");
        return;
      }
      setMe((prev) => (prev ? { ...prev, avatar: null } : prev));
      toast.success("Profile picture removed.");
    } catch {
      toast.error("Could not remove your picture.");
    } finally {
      setUploading(false);
    }
  }

  const initials =
    (me?.name ?? me?.email ?? "?")
      .split(/\s+/)
      .map((part) => part[0])
      .join("")
      .toUpperCase()
      .slice(0, 2) || "?";

  const canSave =
    !saving &&
    trimmed.length > 0 &&
    !unchanged &&
    describeDisplayNameProblem(trimmed) === null;

  return (
    <Layout>
      <div className="mx-auto w-full max-w-2xl px-4 py-8">
        <h1 className="text-3xl font-bold">Profile</h1>
        <p className="mt-2 text-muted-foreground">
          Your display name and picture are shown to other players in pool
          chat, participant lists and the winners board.
        </p>

        {loading ? (
          <div className="mt-10 flex items-center gap-3 text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin" aria-hidden="true" />
            Loading your profile…
          </div>
        ) : (
          <>
            {/* ── Picture ─────────────────────────────────────────────── */}
            <section className="mt-8 rounded-xl border border-white/10 bg-black/20 p-5 sm:p-6">
              <h2 className="text-lg font-bold">Profile picture</h2>
              <div className="mt-5 flex flex-col gap-5 sm:flex-row sm:items-center">
                <div className="relative h-24 w-24 shrink-0 overflow-hidden rounded-full border border-white/15 bg-white/5">
                  {me?.avatar ? (
                    <Image
                      src={me.avatar}
                      alt="Your profile picture"
                      fill
                      sizes="96px"
                      className="object-cover"
                      unoptimized
                    />
                  ) : (
                    <span className="flex h-full w-full items-center justify-center text-2xl font-bold text-muted-foreground">
                      {initials}
                    </span>
                  )}
                </div>

                <div className="flex flex-col gap-3">
                  <div className="flex flex-wrap gap-3">
                    <button
                      type="button"
                      onClick={() => fileRef.current?.click()}
                      disabled={uploading}
                      className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg border border-white/15 bg-white/5 px-4 text-sm font-medium hover:bg-white/10 disabled:opacity-50"
                    >
                      {uploading ? (
                        <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                      ) : (
                        <Upload className="h-4 w-4" aria-hidden="true" />
                      )}
                      {me?.avatar ? "Change picture" : "Upload picture"}
                    </button>

                    {me?.avatar && (
                      <button
                        type="button"
                        onClick={removeAvatar}
                        disabled={uploading}
                        className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg border border-white/15 px-4 text-sm font-medium text-muted-foreground hover:bg-white/10 hover:text-foreground disabled:opacity-50"
                      >
                        <Trash2 className="h-4 w-4" aria-hidden="true" />
                        Remove
                      </button>
                    )}
                  </div>
                  <p className="text-sm text-muted-foreground">
                    JPEG, PNG or WebP. Up to 2MB.
                  </p>
                </div>
              </div>

              <input
                ref={fileRef}
                type="file"
                accept="image/jpeg,image/png,image/webp"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) void uploadAvatar(file);
                }}
              />
            </section>

            {/* ── Display name ────────────────────────────────────────── */}
            <section className="mt-6 rounded-xl border border-white/10 bg-black/20 p-5 sm:p-6">
              <h2 className="text-lg font-bold">Display name</h2>

              <label htmlFor="display-name" className="mt-4 block text-sm font-medium">
                Your name
              </label>
              <div className="mt-2">
                <input
                  id="display-name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  maxLength={DISPLAY_NAME_MAX * 2}
                  autoComplete="nickname"
                  aria-describedby="display-name-help display-name-status"
                  className="w-full min-h-11 rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-base focus:outline-none focus:ring-1 focus:ring-primary md:text-sm"
                />
              </div>

              <p id="display-name-status" aria-live="polite" className="mt-2 min-h-5 text-sm">
                {nameState.kind === "checking" && (
                  <span className="inline-flex items-center gap-1.5 text-muted-foreground">
                    <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
                    Checking availability…
                  </span>
                )}
                {nameState.kind === "available" && (
                  <span className="inline-flex items-center gap-1.5 text-green-400">
                    <Check className="h-3.5 w-3.5" aria-hidden="true" />
                    That name is available.
                  </span>
                )}
                {nameState.kind === "taken" && (
                  <span className="inline-flex items-center gap-1.5 text-destructive">
                    <X className="h-3.5 w-3.5" aria-hidden="true" />
                    {nameState.message}
                  </span>
                )}
                {nameState.kind === "invalid" && (
                  <span className="text-destructive">{nameState.message}</span>
                )}
                {nameState.kind === "unknown" && (
                  <span className="text-muted-foreground">
                    Could not check that name. You can still save it.
                  </span>
                )}
              </p>

              <p id="display-name-help" className="mt-1 text-sm text-muted-foreground">
                3 to {DISPLAY_NAME_MAX} characters. Letters, numbers, spaces and
                . _ - only. Names are unique regardless of capitalisation.
              </p>

              <button
                type="button"
                onClick={saveName}
                disabled={!canSave}
                className="mt-5 inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-lg bg-primary px-5 text-sm font-bold text-white hover:bg-primary/90 disabled:opacity-40 sm:w-auto"
              >
                {saving && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
                Save display name
              </button>
            </section>
          </>
        )}
      </div>
    </Layout>
  );
}
