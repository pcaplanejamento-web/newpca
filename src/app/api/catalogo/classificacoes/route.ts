import { exigirEditor, exigirUsuario } from "@/lib/api-auth";
import { registrarAuditoria } from "@/lib/auditoria";
import { erro, ok, parseCorpo } from "@/lib/http";
import { criarClassificacao, listarPadronizacao, prepararClassificacao } from "@/lib/padronizacao";
import { classificacaoItemSchema } from "@/lib/padronizacao-validation";

export const dynamic = "force-dynamic";

/** Catálogo → Classificações: as classificações cadastradas e as unidades de medida (a classificação que cada uma indica). */
export async function GET() {
  const g = await exigirUsuario();
  if ("erro" in g) return g.erro;
  return ok({ ...(await listarPadronizacao()) });
}

export async function POST(req: Request) {
  const g = await exigirEditor();
  if ("erro" in g) return g.erro;
  const p = await parseCorpo(classificacaoItemSchema, req);
  if ("resp" in p) return p.resp;
  const pr = await prepararClassificacao(p.data, null);
  if ("erro" in pr) return erro(pr.erro, pr.status);
  const r = await criarClassificacao(pr.dados);
  await registrarAuditoria({
    usuario: g.u,
    acao: "criar",
    entidade: "classificacao_item",
    entidadeId: r.id,
    resumo: `Classificação "${pr.dados.nome}" cadastrada (${pr.dados.palavras.length} palavra(s)-chave)`,
    depois: pr.dados,
  });
  return ok({ id: r.id });
}
