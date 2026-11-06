import { sql } from "drizzle-orm";
import { dfdProtocolos, dfds } from "@/db/schema";
import { getDb } from "./db";
import { listarDocumentos } from "./documentos";
import { comparativoPorUnidade } from "./orcamento-comparativo";
import { dashboardDoPca, getPcaEspaco, listarPcasPublicados, orcamentoDoAno, orcamentoDoPca } from "./pca-espaco";
import { mascararTexto } from "./pca-publico-core";
import type { DadosPesquisaPublica } from "./pesquisa-publica-core";
import { getConfigPublico } from "./publico";
import { podeLerPublico, vistasDoMenu } from "./publico-core";
import { memoPorVersao } from "./versao-dados";

/** Os ids num parâmetro JSON (sem lista de IN — o limite de 100 parâmetros do D1). */
const emIds = (col: typeof dfds.id | typeof dfdProtocolos.id, ids: number[]) => sql`${col} IN (SELECT value FROM json_each(${JSON.stringify(ids)}))`;

/**
 * O índice da PESQUISA DA TELA PÚBLICA de um PCA — o corpo JSON pronto (os itens no texto compacto do Dashboard, sem
 * serializar de novo). SÓ o que a página pública mostra: PCA publicado (`podeLerPublico` sem sessão — vale também para
 * quem está logado) e cada bloco só com a aba dele publicada; os textos livres passam pela máscara (`mascararTexto`). Uma
 * vez por versão dos dados (`memoPorVersao`). `null` = não pesquisável (a rota responde 404).
 */
export async function pesquisaPublica(pcaId: number): Promise<string | null> {
  const [cfg, pca] = await Promise.all([getConfigPublico(), getPcaEspaco(pcaId)]);
  if (!pca || !podeLerPublico(pca, cfg, "dashboard", false)) return null;
  return memoPorVersao(`pesquisa-publica:${pcaId}:${cfg.abas.join(",")}`, async () => {
    const [publicados, dash] = await Promise.all([listarPcasPublicados(), dashboardDoPca(pca)]);
    const vazio = dash.resumo.count === 0; // a página mostra "em breve": nada a pesquisar além das abas e dos PCAs
    const dfdIds = vazio ? [] : dash.dfdsLista.map((d) => d.id);
    const protoIds = vazio ? [] : dash.protocolosLista.map((p) => p.id);
    const db = getDb();
    const [textosDfd, textosProto, documentos, orcamento] = await Promise.all([
      dfdIds.length
        ? db.select({ id: dfds.id, objeto: dfds.objeto, setor: dfds.setorRequisitante, orgao: dfds.orgaoEntidade }).from(dfds).where(emIds(dfds.id, dfdIds))
        : [],
      protoIds.length
        ? db
            .select({ id: dfdProtocolos.id, idExterno: dfdProtocolos.idExterno, interessado: dfdProtocolos.interessado, observacao: dfdProtocolos.observacao })
            .from(dfdProtocolos)
            .where(emIds(dfdProtocolos.id, protoIds))
        : [],
      podeLerPublico(pca, cfg, "documentos", false) ? listarDocumentos(null, pca.id) : [],
      podeLerPublico(pca, cfg, "orcamento", false)
        ? orcamentoDoAno(pca.ano).then((ano) => orcamentoDoPca(pca, ano, null))
        : null,
    ]);
    const porDfd = new Map(textosDfd.map((t) => [t.id, t]));
    const porProto = new Map(textosProto.map((t) => [t.id, t]));
    const dados: Omit<DadosPesquisaPublica, "itens"> = {
      pca: { id: pca.id, nome: pca.nome, ano: pca.ano },
      vistas: vistasDoMenu(cfg),
      pcas: publicados.map((p) => ({ id: p.id, nome: p.nome, ano: p.ano })),
      unidades: vazio ? [] : dash.unidades,
      dfds: (vazio ? [] : dash.dfdsLista).map((d) => {
        const t = porDfd.get(d.id);
        return { ...d, objeto: mascararTexto(t?.objeto ?? null), setor: mascararTexto(t?.setor ?? null), orgao: t?.orgao ?? null };
      }),
      protocolos: (vazio ? [] : dash.protocolosLista).map((p) => {
        const t = porProto.get(p.id);
        return { ...p, idExterno: t?.idExterno ?? null, interessado: mascararTexto(t?.interessado ?? null), observacao: mascararTexto(t?.observacao ?? null) };
      }),
      documentos: documentos.map((d) => ({ id: d.id, nome: d.nome, paginas: d.paginas })),
      orcamento: orcamento
        ? comparativoPorUnidade(orcamento.planejado, orcamento.linhas, orcamento.unidades).map((l) => ({
            chave: l.unidadeId == null ? "sem" : `u${l.unidadeId}`,
            sigla: l.sigla,
            nome: l.nome,
            orgaoSigla: l.orgaoSigla ?? null,
            orcamento: l.orcamento,
            planejado: l.planejado,
          }))
        : [],
    };
    // Os itens entram como o texto compacto já montado (`itensTexto`, dentro do memo do Dashboard).
    return `${JSON.stringify({ ok: true, ...dados }).slice(0, -1)},"itens":${vazio ? '{"c":[],"l":[]}' : dash.itensTexto}}`;
  });
}
