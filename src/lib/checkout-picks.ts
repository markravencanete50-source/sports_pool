import {
  checkoutCardPicksSchema,
  type CheckoutPickInput,
} from "@/lib/validations";

const METADATA_CHUNK_SIZE = 450;

export function encodeCheckoutPicks(
  picks: CheckoutPickInput[],
): Record<string, string> {
  const compact = picks.map((pick) => [
    pick.gameId,
    pick.prediction,
    pick.totalScorePrediction ?? null,
  ]);
  const serialized = JSON.stringify(compact);
  const chunks = serialized.match(
    new RegExp(`.{1,${METADATA_CHUNK_SIZE}}`, "g"),
  ) ?? [""];

  return Object.fromEntries([
    ["pickChunks", String(chunks.length)],
    ...chunks.map((chunk, index) => [`picks${index}`, chunk]),
  ]);
}

export function decodeCheckoutPicks(
  metadata: Record<string, string> | null | undefined,
): CheckoutPickInput[] | null {
  if (!metadata?.pickChunks) return null;
  const count = Number(metadata.pickChunks);
  if (!Number.isInteger(count) || count < 1 || count > 10) {
    throw new Error("Invalid pick metadata");
  }

  let serialized = "";
  for (let index = 0; index < count; index += 1) {
    const chunk = metadata[`picks${index}`];
    if (typeof chunk !== "string") throw new Error("Incomplete pick metadata");
    serialized += chunk;
  }

  const compact = JSON.parse(serialized) as unknown;
  if (!Array.isArray(compact)) throw new Error("Invalid pick metadata");
  const expanded = compact.map((item) => {
    if (!Array.isArray(item)) return item;
    return {
      gameId: item[0],
      prediction: item[1],
      ...(item[2] == null ? {} : { totalScorePrediction: item[2] }),
    };
  });
  return checkoutCardPicksSchema.parse(expanded);
}
