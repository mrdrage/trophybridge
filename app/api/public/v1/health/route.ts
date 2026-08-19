import { NextResponse } from "next/server";

export function GET() {
  return NextResponse.json({
    service: "trophybridge",
    version: "0.1.0",
    status: "ok",
  });
}
