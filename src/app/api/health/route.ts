import { NextResponse } from "next/server";
import { env } from "@/lib/env";

export async function GET() {
  return NextResponse.json({
    status: "ok",
    providerMode: env.PROVIDER_MODE,
    timestamp: new Date().toISOString(),
  });
}
