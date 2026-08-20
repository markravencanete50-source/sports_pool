/**
 * Read image dimensions from header bytes, without decoding the image.
 *
 * WHY THIS EXISTS. File size does not bound how much memory an image costs to
 * display. PNG and WebP are compressed formats, and a flat-colour image
 * compresses enormously: a 2MB PNG can legitimately declare 30000x30000
 * pixels, which a browser expands to roughly 3.6GB of RGBA to paint. Uploaded
 * as an avatar, that is a stored denial of service against every OTHER user
 * who loads the page it appears on — self-service, by any registered account,
 * and it passes a magic-byte check and a size check without complaint.
 *
 * The defence is to read the DECLARED dimensions out of the header and refuse
 * anything implausible for an avatar. Deliberately no decoding: parsing a
 * handful of header bytes cannot itself be exploited by a malicious payload
 * the way a full decode can, and it needs no native image library.
 *
 * Returns null when the dimensions cannot be established, which callers must
 * treat as a refusal — an image whose header we cannot parse is not one we
 * should be storing and serving to other people.
 */

export interface ImageDimensions {
  width: number;
  height: number;
}

/** PNG: IHDR is always the first chunk; width/height are big-endian uint32. */
function pngDimensions(b: Uint8Array): ImageDimensions | null {
  // 8-byte signature, 4-byte length, "IHDR", then width and height.
  if (b.length < 24) return null;
  if (b[12] !== 0x49 || b[13] !== 0x48 || b[14] !== 0x44 || b[15] !== 0x52) return null;
  const view = new DataView(b.buffer, b.byteOffset, b.byteLength);
  return { width: view.getUint32(16), height: view.getUint32(20) };
}

/**
 * JPEG: walk the marker segments to a Start Of Frame, which carries the size.
 *
 * Bounded by both the buffer length and an iteration cap, because a crafted
 * file can otherwise describe segments that walk in circles.
 */
function jpegDimensions(b: Uint8Array): ImageDimensions | null {
  const view = new DataView(b.buffer, b.byteOffset, b.byteLength);
  let offset = 2; // Skip SOI (FF D8).
  let guard = 0;

  while (offset + 9 < b.length && guard++ < 2048) {
    if (b[offset] !== 0xff) {
      offset++; // Re-sync over padding rather than giving up immediately.
      continue;
    }
    const marker = b[offset + 1];

    // Standalone markers with no length field.
    if (marker === 0xd8 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) {
      offset += 2;
      continue;
    }
    // Start of Scan: entropy-coded data follows, no dimensions past here.
    if (marker === 0xda) return null;

    const length = view.getUint16(offset + 2);
    if (length < 2) return null;

    // SOF0-SOF15 carry the frame size. C4 (DHT), C8 (JPG) and CC (DAC) do not.
    const isSof =
      marker >= 0xc0 && marker <= 0xcf &&
      marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc;

    if (isSof) {
      if (offset + 9 > b.length) return null;
      return {
        height: view.getUint16(offset + 5),
        width: view.getUint16(offset + 7),
      };
    }
    offset += 2 + length;
  }
  return null;
}

/** WebP: three container variants, each storing the size differently. */
function webpDimensions(b: Uint8Array): ImageDimensions | null {
  if (b.length < 30) return null;
  const view = new DataView(b.buffer, b.byteOffset, b.byteLength);
  // Chunk fourCC at offset 12.
  const fourCC = String.fromCharCode(b[12], b[13], b[14], b[15]);

  if (fourCC === "VP8 ") {
    // Lossy: 16-bit width/height at offset 26, 14 significant bits each.
    return {
      width: view.getUint16(26, true) & 0x3fff,
      height: view.getUint16(28, true) & 0x3fff,
    };
  }
  if (fourCC === "VP8L") {
    // Lossless: 14 bits width then 14 bits height, packed little-endian.
    const bits = view.getUint32(21, true);
    return {
      width: (bits & 0x3fff) + 1,
      height: ((bits >> 14) & 0x3fff) + 1,
    };
  }
  if (fourCC === "VP8X") {
    // Extended: 24-bit minus-one width/height at offsets 24 and 27.
    const width = (b[24] | (b[25] << 8) | (b[26] << 16)) + 1;
    const height = (b[27] | (b[28] << 8) | (b[29] << 16)) + 1;
    return { width, height };
  }
  return null;
}

/**
 * Dimensions for a JPEG, PNG or WebP, or null if they cannot be read.
 * `kind` comes from the caller's magic-byte check, so this never has to guess
 * the format from an untrusted content-type.
 */
export function readImageDimensions(
  bytes: Uint8Array,
  kind: "image/jpeg" | "image/png" | "image/webp"
): ImageDimensions | null {
  let dims: ImageDimensions | null = null;
  try {
    if (kind === "image/png") dims = pngDimensions(bytes);
    else if (kind === "image/jpeg") dims = jpegDimensions(bytes);
    else dims = webpDimensions(bytes);
  } catch {
    // A malformed header that walks off the end is a refusal, not a crash.
    return null;
  }

  if (!dims) return null;
  if (
    !Number.isFinite(dims.width) || !Number.isFinite(dims.height) ||
    dims.width <= 0 || dims.height <= 0
  ) {
    return null;
  }
  return dims;
}
