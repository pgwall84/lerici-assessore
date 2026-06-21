import { NextResponse } from "next/server";

export async function GET() {
  return NextResponse.json({
    DATABASE_URL: process.env.DATABASE_URL ? process.env.DATABASE_URL.substring(0, 50) + "..." : "MANCANTE",
    NEXTAUTH_SECRET: process.env.NEXTAUTH_SECRET ? "PRESENTE" : "MANCANTE",
    NEXTAUTH_URL: process.env.NEXTAUTH_URL ?? "MANCANTE",
  });
}
