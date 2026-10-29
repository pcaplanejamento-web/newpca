import { exigirAdmin } from "@/lib/api-auth";
import { listarCursores, listarLeituras } from "@/lib/frota";
import { ok } from "@/lib/http";

export const dynamic = "force-dynamic";

/** O HISTÓRICO das leituras da Vólus (as últimas, ou de um contrato) e os cursores da automática. */
export async function GET(req: Request) {
  const a = await exigirAdmin();
  if ("erro" in a) return a.erro;
  const sp = new URL(req.url).searchParams;
  const contrato = /^\d{12}$/.test(sp.get("contrato") ?? "") ? (sp.get("contrato") as string) : undefined;
  return ok({ leituras: await listarLeituras(Number(sp.get("limite")) || 200, contrato), cursores: await listarCursores() });
}
