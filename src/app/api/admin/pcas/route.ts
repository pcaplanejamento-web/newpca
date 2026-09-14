import { exigirAdmin } from "@/lib/api-auth";
import { cadastrarPca } from "@/lib/dfd";
import { cadastrarPcaSchema } from "@/lib/dfd-validation";
import { ok, parseCorpo } from "@/lib/http";

export const dynamic = "force-dynamic";

/** Cadastra um PCA (registro leve: nome + ano) — controle do ADM nas Configurações. */
export async function POST(req: Request) {
  const g = await exigirAdmin();
  if ("erro" in g) return g.erro;

  const p = await parseCorpo(cadastrarPcaSchema, req);
  if ("resp" in p) return p.resp;

  const r = await cadastrarPca(p.data, g.u.id);
  return ok({ id: r.id });
}
