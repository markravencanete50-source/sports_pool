import { config } from "dotenv";
config();

import { seedAdminUser } from "../src/lib/seed-admin";

seedAdminUser().then((r) => {
  console.log(r.message);
  process.exit(r.ok ? 0 : 1);
});
