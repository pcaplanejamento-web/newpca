import { exigirEditor } from "@/lib/api-auth";
import { gerarPca } from "@/lib/dfd";
import { gerarPcaSchema } from "@/lib/dfd-validation";
import { erro, ok, parseCorpo } from "@/lib/http";

export const dynamic = "force-dynamic";

/** Gera uma edição de PCA unindo os DFDs selecionados. */
export async function POST(req: Request) {
  const a = await exigirEditor();
  if ("erro" in a) return a.erro;

  const p = await parseCorpo(gerarPcaSchema, req);
  if ("resp" in p) return p.resp;

  const r = await gerarPca(p.data, a.u.id);
  if ("erro" in r) return erro(r.erro, 422);
  return ok({ id: r.id });
}
