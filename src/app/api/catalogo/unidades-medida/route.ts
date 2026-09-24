import { exigirEditor, exigirUsuario } from "@/lib/api-auth";
import { registrarAuditoria } from "@/lib/auditoria";
import { getReparticaoFiltro } from "@/lib/grupos";
import { erro, ok, parseCorpo } from "@/lib/http";
import { criarUnidadeMedida, listarClassificacoes, listarUnidadesMedida, prepararUnidade, usoDasUnidades } from "@/lib/padronizacao";
import { unidadeMedidaSchema } from "@/lib/padronizacao-validation";

export const dynamic = "force-dynamic";

/**
 * Catálogo → Unidades de medida: as unidades CADASTRADAS, as classificações (a que cada unidade indica) e o USO de cada
 * grafia de unidade nos itens (DFDs no escopo da unidade ativa — "Geral" = todos — e o catálogo) — a comparação.
 */
export async function GET() {
  const g = await exigirUsuario();
  if ("erro" in g) return g.erro;
  const rep = await getReparticaoFiltro(g.u);
  const [unidades, classificacoes, uso] = await Promise.all([listarUnidadesMedida(), listarClassificacoes(), usoDasUnidades(rep?.id)]);
  return ok({ unidades, classificacoes, uso });
}

export async function POST(req: Request) {
  const g = await exigirEditor();
  if ("erro" in g) return g.erro;
  const p = await parseCorpo(unidadeMedidaSchema, req);
  if ("resp" in p) return p.resp;
  const pr = await prepararUnidade(p.data, null);
  if ("erro" in pr) return erro(pr.erro, pr.status);
  const r = await criarUnidadeMedida(pr.dados);
  await registrarAuditoria({
    usuario: g.u,
    acao: "criar",
    entidade: "unidade_medida",
    entidadeId: r.id,
    resumo: `Unidade de medida ${pr.dados.sigla} (${pr.dados.nome}) cadastrada`,
    depois: pr.dados,
  });
  return ok({ id: r.id });
}
