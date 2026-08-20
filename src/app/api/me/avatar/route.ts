import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { assertSameOrigin } from "@/lib/request-guards";
import { enforceRateLimit, RATE_LIMITS } from "@/lib/rate-limit";
import { readImageDimensions } from "@/lib/image-dimensions";

/**
 * Avatar upload and removal.
 *
 * THE THREAT HERE IS THE FILE, not the caller. An avatar is arbitrary bytes
 * supplied by a user and then served back to every other user, so the rules
 * are deliberately narrow:
 *
 *   - SVG IS REFUSED. It is an image format that executes script, and a stored
 *     SVG served from a domain a browser trusts is stored XSS. There is no
 *     configuration of this feature in which accepting SVG is worth it.
 *   - THE DECLARED CONTENT-TYPE IS NOT TRUSTED. A client sets it, so it says
 *     nothing. The first bytes of the file are checked against the magic
 *     numbers for JPEG, PNG and WebP, and the type we record is the one those
 *     bytes prove — not the one the request claimed.
 *   - SIZE IS BOUNDED before anything is read into memory where possible, and
 *     again after, because Content-Length is also client-supplied.
 *
 * The upload runs with the SERVICE ROLE on purpose. No storage write policy is
 * granted to clients (see migration 20260820000000), so this route is the only
 * path to the bucket, which is what makes the checks above unavoidable rather
 * than advisory. Ownership is still taken from the session, never from input:
 * the object path is derived from the authenticated user's id.
 */

export const dynamic = "force-dynamic";
export const maxDuration = 30;

const BUCKET = "avatars";
const MAX_BYTES = 2 * 1024 * 1024; // 2MB, matching the bucket's own limit.

/**
 * Dimension caps. Byte size does NOT bound the cost of displaying an image:
 * a 2MB PNG may declare 30000x30000, which a browser expands to roughly 3.6GB
 * of RGBA to paint. Stored as an avatar that is a denial of service against
 * every other user who loads a page it appears on, not against us.
 *
 * 4096 on a side is far beyond what an avatar needs and still leaves the
 * worst case at ~67MB decoded. The total-pixel cap additionally refuses long
 * thin images (1x50000000) that pass a per-side check.
 */
const MAX_DIMENSION = 4096;
const MAX_PIXELS = 4096 * 4096;

type ImageKind = { mime: string; ext: string };

/**
 * Identify an image by its magic bytes.
 *
 * Returns null for anything not provably one of the three permitted formats,
 * which is the same answer for a text file, an SVG, a PDF renamed to .png, and
 * a polyglot crafted to pass a content-type check.
 */
function sniffImage(bytes: Uint8Array): ImageKind | null {
  // JPEG: FF D8 FF
  if (bytes.length > 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return { mime: "image/jpeg", ext: "jpg" };
  }
  // PNG: 89 50 4E 47 0D 0A 1A 0A
  const PNG = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
  if (bytes.length > PNG.length && PNG.every((b, i) => bytes[i] === b)) {
    return { mime: "image/png", ext: "png" };
  }
  // WebP: "RIFF" .... "WEBP"
  if (
    bytes.length > 12 &&
    bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x46 &&
    bytes[8] === 0x57 && bytes[9] === 0x45 && bytes[10] === 0x42 && bytes[11] === 0x50
  ) {
    return { mime: "image/webp", ext: "webp" };
  }
  return null;
}

export async function POST(request: Request) {
  const csrf = assertSameOrigin(request);
  if (csrf) return csrf;

  const limited = await enforceRateLimit(
    request,
    "profile:avatar",
    RATE_LIMITS.avatarUpload
  );
  if (limited) return limited;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Reject on the declared length first — cheap, and refuses an obvious
  // oversize body before it is buffered. Not trusted as the only check.
  const declared = Number(request.headers.get("content-length") ?? 0);
  if (declared > MAX_BYTES * 1.1) {
    return NextResponse.json(
      { error: "Image must be 2MB or smaller." },
      { status: 413 }
    );
  }

  let file: File | null = null;
  try {
    const form = await request.formData();
    const entry = form.get("file");
    if (entry instanceof File) file = entry;
  } catch {
    return NextResponse.json(
      { error: "Could not read the uploaded file." },
      { status: 400 }
    );
  }

  if (!file) {
    return NextResponse.json(
      { error: "No file was uploaded." },
      { status: 400 }
    );
  }
  if (file.size === 0) {
    return NextResponse.json({ error: "That file is empty." }, { status: 400 });
  }
  // The authoritative size check: this is the actual byte count.
  if (file.size > MAX_BYTES) {
    return NextResponse.json(
      { error: "Image must be 2MB or smaller." },
      { status: 413 }
    );
  }

  const bytes = new Uint8Array(await file.arrayBuffer());
  const kind = sniffImage(bytes);
  if (!kind) {
    // Deliberately does not echo what was detected: a precise "that looked
    // like an SVG" is a hint for someone probing the filter.
    return NextResponse.json(
      { error: "Upload a JPEG, PNG or WebP image." },
      { status: 415 }
    );
  }

  // Declared dimensions, read from the header without decoding. A file whose
  // header cannot be parsed is refused: we are about to serve this to other
  // people, so "cannot tell" is not good enough.
  const dims = readImageDimensions(bytes, kind.mime as "image/jpeg" | "image/png" | "image/webp");
  if (!dims) {
    return NextResponse.json(
      { error: "That image could not be read. Try re-saving it, or use a different file." },
      { status: 415 }
    );
  }
  if (
    dims.width > MAX_DIMENSION ||
    dims.height > MAX_DIMENSION ||
    dims.width * dims.height > MAX_PIXELS
  ) {
    return NextResponse.json(
      {
        error: `Image is too large at ${dims.width}x${dims.height} pixels. ` +
          `Maximum is ${MAX_DIMENSION}x${MAX_DIMENSION}.`,
      },
      { status: 413 }
    );
  }

  const admin = createAdminClient();

  // Path is derived from the session, so a caller cannot write to another
  // user's prefix. The timestamp makes the URL change on replacement, which
  // is what busts any CDN or browser cache holding the previous avatar.
  const path = `${user.id}/${Date.now()}.${kind.ext}`;

  const { error: uploadError } = await admin.storage
    .from(BUCKET)
    .upload(path, bytes, {
      contentType: kind.mime, // The sniffed type, never the declared one.
      cacheControl: "3600",
      upsert: false,
    });

  if (uploadError) {
    // The bucket is created by migration 20260820000000, which SKIPS when the
    // deployment has no storage service. Say so plainly rather than failing
    // with a generic 500 that sends someone looking in the wrong place.
    const missingBucket = /bucket.*not.*found/i.test(uploadError.message);
    console.error("[avatar] upload failed:", uploadError.message);
    return NextResponse.json(
      {
        error: missingBucket
          ? "Avatar storage is not configured on this deployment."
          : "Could not store that image.",
      },
      { status: missingBucket ? 503 : 500 }
    );
  }

  const {
    data: { publicUrl },
  } = admin.storage.from(BUCKET).getPublicUrl(path);

  // Write through the user's own client so RLS still scopes the row, matching
  // the rename path. The service role is used for storage only.
  const { error: updateError } = await supabase
    .from("users")
    .update({ avatar: publicUrl, updated_at: new Date().toISOString() })
    .eq("id", user.id);

  if (updateError) {
    // The object is already stored; leaving it orphaned is better than
    // reporting success for a profile that still shows the old picture.
    await admin.storage.from(BUCKET).remove([path]).catch(() => {});
    console.error("[avatar] profile update failed:", updateError.message);
    return NextResponse.json(
      { error: "Could not update your profile picture." },
      { status: 500 }
    );
  }

  // Best effort: drop the previous objects for this user so replacing an
  // avatar does not accumulate storage forever. Never fatal — the new avatar
  // is already live and correct.
  try {
    const { data: existing } = await admin.storage.from(BUCKET).list(user.id);
    const stale = (existing ?? [])
      .filter((o) => `${user.id}/${o.name}` !== path)
      .map((o) => `${user.id}/${o.name}`);
    if (stale.length) await admin.storage.from(BUCKET).remove(stale);
  } catch (err) {
    console.warn("[avatar] could not clean up previous avatars:", err);
  }

  return NextResponse.json({ avatar: publicUrl }, { status: 200 });
}

/** Remove the current avatar and fall back to initials. */
export async function DELETE(request: Request) {
  const csrf = assertSameOrigin(request);
  if (csrf) return csrf;

  const limited = await enforceRateLimit(
    request,
    "profile:avatar",
    RATE_LIMITS.avatarUpload
  );
  if (limited) return limited;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { error } = await supabase
    .from("users")
    .update({ avatar: null, updated_at: new Date().toISOString() })
    .eq("id", user.id);

  if (error) {
    console.error("[avatar] removal failed:", error.message);
    return NextResponse.json(
      { error: "Could not remove your profile picture." },
      { status: 500 }
    );
  }

  try {
    const admin = createAdminClient();
    const { data: existing } = await admin.storage.from(BUCKET).list(user.id);
    const paths = (existing ?? []).map((o) => `${user.id}/${o.name}`);
    if (paths.length) await admin.storage.from(BUCKET).remove(paths);
  } catch (err) {
    console.warn("[avatar] could not delete stored avatars:", err);
  }

  return NextResponse.json({ avatar: null }, { status: 200 });
}
