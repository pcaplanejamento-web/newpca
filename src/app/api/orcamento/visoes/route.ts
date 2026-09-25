import { exigirEditor } from "@/lib/api-auth";
import { registrarAuditoria } from "@/lib/auditoria";
import { ok, parseCorpo } from "@/lib/http";
import { coerceFiltros, resumoVisao } from "@/lib/orcamento-visao";
import { criarVisaoOrcamento } from "@/lib/pca-espaco";
import { visaoOrcamentoSchema } from "@/lib/pca-espaco-validation";

export const dynamic = "force-dynamic";

/** Cria uma VISÃO SALVA do orçamento (filtro por vários valores de cada dimensão do CUBO). A lista vem do servidor
 * (página do orçamento / Configuração do PCA). */
export async function POST(req: Request) {
  const g = await exigirEditor();
  if ("erro" in g) return g.erro;
  const p = await parseCorpo(visaoOrcamentoSchema, req);
  if ("resp" in p) return p.resp;
  const filtros = coerceFiltros(p.data.filtros);
  const id = await criarVisaoOrcamento(p.data.nome, filtros);
  await registrarAuditoria({ usuario: g.u, acao: "criar", entidade: "orcamento_visao", entidadeId: id, resumo: `Visão "${p.data.nome}" criada (${resumoVisao(filtros)})` });
  return ok({ id });
}
