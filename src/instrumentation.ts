export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { seedAdminUser } = await import("./lib/seed-admin");
    const result = await seedAdminUser();
    if (result.message && !result.message.includes("skipping")) {
      console.log("[seed-admin]", result.message);
    }
  }
}
