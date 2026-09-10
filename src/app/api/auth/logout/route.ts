import { NextResponse } from "next/server";
import { encerrarSessaoAtual } from "@/lib/auth";

export const dynamic = "force-dynamic";

export async function POST() {
  try {
    await encerrarSessaoAtual();
  } catch (err) {
    console.error("Falha no logout:", err);
  }
  return NextResponse.json({ ok: true });
}
