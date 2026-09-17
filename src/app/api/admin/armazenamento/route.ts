import { z } from "zod";
import { exigirAdmin } from "@/lib/api-auth";
import { expurgarSessoesExpiradas, getArmazenamento } from "@/lib/armazenamento";
import { getUsoOficial } from "@/lib/cf-analytics";
import { ok, parseCorpo } from "@/lib/http";

export const dynamic = "force-dynamic";

/** Snapshot de armazenamento do banco + uso oficial da Cloudflare (só ADM). */
export async function GET() {
  const g = await exigirAdmin();
  if ("erro" in g) return g.erro;
  const [dados, oficial] = await Promise.all([getArmazenamento(), getUsoOficial()]);
  return ok({ ...dados, oficial });
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
