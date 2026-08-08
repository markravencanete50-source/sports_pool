// parseInt returns NaN for a non-numeric value, and NaN passes every "<"
// guard below (NaN < 1 is false), so a typo'd env var used to propagate NaN
// straight into the Zod min/max in validations.ts. Coerce and validate.
function readPositiveInt(value: string | undefined, fallback: number): number {
  if (value == null || value.trim() === "") return fallback;
  const n = Number(value);
  if (!Number.isInteger(n) || n < 1) {
    throw new Error(
      `Invalid pool config value "${value}" — expected a positive integer`
    );
  }
  return n;
}

export const poolConfig = {
  minGames: readPositiveInt(process.env.NEXT_PUBLIC_POOL_MIN_GAMES, 6),
  maxGames: readPositiveInt(process.env.NEXT_PUBLIC_POOL_MAX_GAMES, 9),
} as const;

if (poolConfig.maxGames < poolConfig.minGames) {
  throw new Error("NEXT_PUBLIC_POOL_MAX_GAMES must be greater than or equal to NEXT_PUBLIC_POOL_MIN_GAMES");
}
