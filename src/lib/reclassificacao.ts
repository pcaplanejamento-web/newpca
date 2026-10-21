import { getDb } from "./db";
import { listarPadronizacao } from "./padronizacao";
import { classificarItem, criarClassificador, type ItemClassificado, versaoPadronizacao } from "./padronizacao-core";
import { comandoGravarDfd, comandoGravarPlanilha, consultaPendentesDfd, consultaPendentesPlanilha, type Resultados } from "./reclassificacao-sql";

/**
 * GRAVA no banco a classificação (do Catálogo) e o domínio de TODO item — dos DFDs e das planilhas — com a versão do
 * cadastro: o item novo, ou o de uma versão antiga do cadastro, é (re)classificado aqui. Chamado pelo cron (a cada 5 min — um comando por tabela por passada),
 * depois de uma importação e depois de mudar classificações/unidades de medida. Best-effort: nunca lança.
 */
const LOTE = 1500;

function resultados<T extends { id: number }>(linhas: T[], f: (l: T) => ItemClassificado): Resultados {
  const r: Resultados = {};
  for (const l of linhas) {
    const c = f(l);
    r[l.id] = [c.classificacao, c.dominio];
  }
  return r;
}

/** Uma passada: até `LOTE` itens de cada tabela. Devolve quantos gravou (0 = tudo em dia). */
export async function reclassificarPendentes(): Promise<number> {
  try {
    const db = getDb();
    const padr = await listarPadronizacao();
    const versao = versaoPadronizacao(padr);
    const classificar = criarClassificador(padr.classificacoes, padr.unidades);
    const [dfd, plan] = await Promise.all([consultaPendentesDfd(db, versao, LOTE), consultaPendentesPlanilha(db, versao, LOTE)]);
    const cmds = [];
    if (dfd.length) cmds.push(comandoGravarDfd(db, versao, resultados(dfd, (l) => classificarItem(classificar, { descricao: l.descricao, unidade: l.unidade }))));
    if (plan.length)
      cmds.push(
        comandoGravarPlanilha(
          db,
          versao,
          resultados(plan, (l) => classificarItem(classificar, { descricao: l.descricao, unidade: l.unidade, classificacaoArquivo: l.classificacao, dominioArquivo: l.dominio })),
        ),
      );
    if (cmds.length) await db.batch(cmds as [(typeof cmds)[number], ...(typeof cmds)[number][]]);
    return dfd.length + plan.length;
  } catch (e) {
    console.error("Falha ao reclassificar itens:", e);
    return 0;
  }
}

/** Várias passadas (até `max`), para pôr o banco em dia logo após uma mudança grande. */
export async function reclassificarTudo(max = 6): Promise<void> {
  for (let i = 0; i < max; i++) if ((await reclassificarPendentes()) < LOTE) return;
}
