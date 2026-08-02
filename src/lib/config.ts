export const poolConfig = {
  minGames: parseInt(process.env.NEXT_PUBLIC_POOL_MIN_GAMES || "6", 10),
  maxGames: parseInt(process.env.NEXT_PUBLIC_POOL_MAX_GAMES || "9", 10),
} as const;

if (poolConfig.minGames < 1) {
  throw new Error("NEXT_PUBLIC_POOL_MIN_GAMES must be at least 1");
}

if (poolConfig.maxGames < poolConfig.minGames) {
  throw new Error("NEXT_PUBLIC_POOL_MAX_GAMES must be greater than or equal to NEXT_PUBLIC_POOL_MIN_GAMES");
}
