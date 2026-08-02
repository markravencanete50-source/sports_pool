import { config } from "dotenv";
config();

import { createClient } from "@supabase/supabase-js";
import { TEAM_MAP } from "../src/lib/constants";
import { ensureTeamsExist } from "../src/lib/teams-seed";
import { seedAdminUser } from "../src/lib/seed-admin";

async function main() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error(
      "NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set (e.g. in .env)"
    );
  }

  const supabase = createClient(url, key, { auth: { persistSession: false } });
  await ensureTeamsExist(supabase, Object.keys(TEAM_MAP));

  const { count, error: countErr } = await supabase
    .from("platform_settings")
    .select("*", { count: "exact", head: true });
  if (countErr) throw countErr;
  if (count === 0) {
    const { error: insErr } = await supabase.from("platform_settings").insert({
      platform_fee_percentage: 10,
      minimum_entry_fee: 20,
    });
    if (insErr) throw insErr;
    console.log("[OK] platform_settings: inserted defaults");
  } else {
    console.log("[OK] platform_settings: already present");
  }

  console.log("[OK] teams: upserted from TEAM_MAP");
  const admin = await seedAdminUser();
  console.log(admin.message);
  process.exit(admin.ok ? 0 : 1);
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
