import { NextResponse } from "next/server";
import { getUsuarioAtual } from "@/lib/auth";

export const dynamic = "force-dynamic";

export async function GET() {
  const usuario = await getUsuarioAtual();
  return NextResponse.json({ usuario });
}
