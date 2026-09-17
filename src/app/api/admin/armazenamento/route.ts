import { z } from "zod";
import { exigirAdmin } from "@/lib/api-auth";
import { expurgarSessoesExpiradas, getArmazenamento } from "@/lib/armazenamento";
import { ok, parseCorpo } from "@/lib/http";

export const dynamic = "force-dynamic";

/** Snapshot de armazenamento do banco (só ADM). */
export async function GET() {
  const g = await exigirAdmin();
  if ("erro" in g) return g.erro;
  return ok(await getArmazenamento());
}

const acaoSchema = z.object({ acao: z.enum(["expurgar_sessoes"]) });

/** Ações de manutenção (só ADM). Hoje: expurgar sessões expiradas. */
export async function POST(req: Request) {
  const g = await exigirAdmin();
  if ("erro" in g) return g.erro;
  const p = await parseCorpo(acaoSchema, req);
  if ("resp" in p) return p.resp;
  return ok(await expurgarSessoesExpiradas());
}
