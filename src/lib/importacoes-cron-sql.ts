import { sql } from "drizzle-orm";
import type { DrizzleD1Database } from "drizzle-orm/d1";
import type * as schema from "../db/schema.ts";
import { importacoesCron } from "../db/schema.ts";

type Db = DrizzleD1Database<typeof schema>;

/** A situação de uma importação automática nesta execução (`chave` = `centi:<card>`, `centi:geral`, `frota:geral`). */
export type SituacaoCron = { chave: string; situacao: string; erro: boolean };

/** Uma linha confirmada só é REESCRITA depois disto (a mesma situação a cada meio minuto não gasta escritas do D1). */
export const MINUTOS_CONFIRMAR_CRON = 10;
/** Linhas por INSERT (5 parâmetros cada — ≤ 100 do D1). */
const POR_INSERT = 20;

/**
 * GRAVA as situações da execução: a situação NOVA (ou o erro que mudou) escreve na hora e reinicia o `desde`; a MESMA só
 * renova o `em` depois de `MINUTOS_CONFIRMAR_CRON` — poucas escritas por dia, com a hora da última execução à vista.
 */
export function comandosRegistrarCron(db: Db, itens: readonly SituacaoCron[], agoraIso: string) {
  const em = agoraIso.slice(0, 19).replace("T", " ");
  const limite = new Date(Date.parse(agoraIso) - MINUTOS_CONFIRMAR_CRON * 60_000).toISOString().slice(0, 19).replace("T", " ");
  const vistos = new Map(itens.map((i) => [i.chave, i]));
  const linhas = [...vistos.values()].map((i) => ({ chave: i.chave, situacao: i.situacao.slice(0, 300), erro: i.erro ? 1 : 0, em, desde: em }));
  const r = [];
  for (let i = 0; i < linhas.length; i += POR_INSERT)
    r.push(
      db
        .insert(importacoesCron)
        .values(linhas.slice(i, i + POR_INSERT))
        .onConflictDoUpdate({
          target: importacoesCron.chave,
          set: {
            situacao: sql`excluded.situacao`,
            erro: sql`excluded.erro`,
            em: sql`excluded.em`,
            desde: sql`CASE WHEN ${importacoesCron.situacao} = excluded.situacao AND ${importacoesCron.erro} = excluded.erro THEN ${importacoesCron.desde} ELSE excluded.desde END`,
          },
          setWhere: sql`${importacoesCron.situacao} <> excluded.situacao OR ${importacoesCron.erro} <> excluded.erro OR ${importacoesCron.em} < ${limite}`,
        }),
    );
  return r;
}

/** É um erro (vermelho na tela)? A falha, o erro registrado e a espera depois de um erro. */
export const situacaoComErro = (s: string): boolean => /^(erro|falhou|leitura descartada)|depois de um erro|erro de rede/i.test(s);

/** As situações de uma execução da automática da Centi (`card` 0 = a automática inteira). */
export function situacoesDaCenti(r: readonly { card: number; situacao: string }[]): SituacaoCron[] {
  return r.map((x) => ({ chave: x.card ? `centi:${x.card}` : "centi:geral", situacao: x.situacao, erro: situacaoComErro(x.situacao) }));
}

/** Uma situação gravada (o que a tela recebe). */
export type LinhaCron = { chave: string; situacao: string; erro: number; em: string; desde: string };
