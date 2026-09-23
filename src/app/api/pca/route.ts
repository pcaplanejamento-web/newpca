import { exigirEditor } from "@/lib/api-auth";
import { registrarAuditoria } from "@/lib/auditoria";
import { gerarPca } from "@/lib/dfd";
import { gerarPcaSchema } from "@/lib/dfd-validation";
import { erro, ok, parseCorpo } from "@/lib/http";
import { criarPcaEspaco } from "@/lib/pca-espaco";
import { criarPcaEspacoSchema } from "@/lib/pca-espaco-validation";

export const dynamic = "force-dynamic";

/**
 * Cria um PCA. Com `fonte` = o PCA como ESPAÇO (card 4×5: nome + ano + fonte, nasce em Preview); com
 * `dfdIds` = a edição LEGADA que une DFDs selecionados.
 */
export async function POST(req: Request) {
  const a = await exigirEditor();
  if ("erro" in a) return a.erro;

  const corpo = (await req.clone().json().catch(() => null)) as Record<string, unknown> | null;
  if (corpo && "fonte" in corpo) {
    const e = await parseCorpo(criarPcaEspacoSchema, req);
    if ("resp" in e) return e.resp;
    const id = await criarPcaEspaco(e.data, a.u.id);
    await registrarAuditoria({
      usuario: a.u,
      acao: "criar",
      entidade: "pca",
      entidadeId: id,
      resumo: `PCA "${e.data.nome}" criado (${e.data.fonte === "lista" ? "lista pronta" : "protocolos"}, ${e.data.ano})`,
      depois: e.data,
    });
    return ok({ id });
  }

  const p = await parseCorpo(gerarPcaSchema, req);
  if ("resp" in p) return p.resp;

  const r = await gerarPca(p.data, a.u.id);
  if ("erro" in r) return erro(r.erro, 422);
  await registrarAuditoria({ usuario: a.u, acao: "criar", entidade: "pca", entidadeId: r.id, resumo: `Edição de PCA "${p.data.nome}" gerada`, depois: { nome: p.data.nome, ano: p.data.ano } });
  return ok({ id: r.id });
}
