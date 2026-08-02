import { seedAdminUser } from "@/lib/seed-admin";
import { NextResponse } from "next/server";

export async function POST() {
  const result = await seedAdminUser();
  return NextResponse.json(
    { ok: result.ok, message: result.message },
    { status: result.ok ? 200 : 500 }
  );
}
