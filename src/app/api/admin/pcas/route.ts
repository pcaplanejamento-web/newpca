import { exigirAdmin } from "@/lib/api-auth";
import { registrarAuditoria } from "@/lib/auditoria";
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
  await registrarAuditoria({ usuario: g.u, acao: "criar", entidade: "pca", entidadeId: r.id, resumo: `PCA "${p.data.nome}" cadastrado${p.data.ano ? ` (${p.data.ano})` : ""}`, depois: { nome: p.data.nome, ano: p.data.ano } });
  return ok({ id: r.id });
}
