import { readFile } from "node:fs/promises";
import path from "node:path";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const filePath = path.join(
      process.cwd(),
      "public",
      "real-demo",
      "result.json",
    );
    const result = JSON.parse(await readFile(filePath, "utf8")) as unknown;
    return NextResponse.json({ available: true, data: result });
  } catch {
    return NextResponse.json({ available: false, data: null });
  }
}
