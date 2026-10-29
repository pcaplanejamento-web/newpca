import { and, between, eq, isNull, lt, or, type SQL, sql } from "drizzle-orm";
import type { DrizzleD1Database } from "drizzle-orm/d1";
import type * as schema from "../db/schema.ts";
import { frotaContratos, frotaCursores, frotaEstado, frotaLeituras, frotaTransacoes, frotaUnidades, frotaVeiculos } from "../db/schema.ts";
import { type EscopoEmpenhos, escopoVazio } from "./empenhos-tela-core.ts";
import { doEscopo } from "./empenhos-tela-sql.ts";
import { assinaturaLinha, COLUNAS_TRANSACAO, chaveTexto, type LinhaTransacao, placaValida, type TipoTransacao, tuplaDaLinha } from "./volus-core.ts";
import { MSG_INTERROMPIDA } from "./frota-config-core.ts";

/**
 * FROTAS — os comandos da gravação como BUILDERS do Drizzle (testados pelo driver D1 REAL sobre `node:sqlite`, dentro de
 * `db.batch` — `tests/frota.test.ts`). Um extrato (contrato × tipo × período) é gravado num LOTE ATÔMICO:
 * 1. as transações, num parâmetro JSON (`json_each`) — SÓ as novas ou que MUDARAM (pela assinatura): a igual não é escrita
 *    (o limite diário de linhas escritas do D1);
 * 2. as que estavam gravadas NO PERÍODO e não vieram: a 1ª ausência só marca; a 2ª seguida as dá como REMOVIDAS na Vólus
 *    (uma resposta incompleta nunca apaga nada sozinha); a que volta é restaurada;
 * 3. as placas novas no cadastro (e a marca/modelo/ano que faltam), as unidades da Vólus que ainda não existiam;
 * 4. o registro da leitura, com as contagens contadas NO BANCO pelo carimbo da gravação.
 */
type Db = DrizzleD1Database<typeof schema>;

/** Teto de caracteres do JSON de UM comando (o D1 recusa texto acima de 2 MB; folga para os acentos). */
export const MAX_JSON_FROTA = 150_000;

const camel = (c: string) => c.replace(/_([a-z])/g, (_, l: string) => l.toUpperCase());

/** A linha pronta para gravar: a tupla + a assinatura + a chave da unidade da Vólus. */
export type LinhaGravar = { tupla: (string | number | null)[]; hash: string; unidadeChave: string | null };
export function linhaParaGravar(l: LinhaTransacao): LinhaGravar {
  const u = chaveTexto(l.unidade_nome as string | null);
  return { tupla: tuplaDaLinha(l), hash: assinaturaLinha(l), unidadeChave: u || null };
}

/** As linhas em pedaços de JSON (cada um abaixo do teto). */
export function pedacosDeLinhas(linhas: readonly LinhaGravar[]): string[] {
  const out: string[] = [];
  let atual: string[] = [];
  let tam = 2;
  for (const l of linhas) {
    const s = JSON.stringify([...l.tupla, l.hash, l.unidadeChave]);
    if (atual.length && tam + s.length + 1 > MAX_JSON_FROTA) {
      out.push(`[${atual.join(",")}]`);
      atual = [];
      tam = 2;
    }
    atual.push(s);
    tam += s.length + 1;
  }
  if (atual.length) out.push(`[${atual.join(",")}]`);
  return out;
}

const N = COLUNAS_TRANSACAO.length;
const I_TIPO = COLUNAS_TRANSACAO.indexOf("tipo");
const I_CHAVE = COLUNAS_TRANSACAO.indexOf("chave");
const jx = (i: number) => sql.raw(`json_extract(j.value, '$[${i}]')`);

/** A 2ª ausência só conta numa leitura ao menos 10 min depois da 1ª (as duas leituras seguidas da regra são leituras de
 * verdade, nunca a mesma resposta lida duas vezes quase juntas). */
export const JANELA_AUSENCIA_MS = 10 * 60_000;

/** O limite (texto comparável com o carimbo) antes do qual a ausência marcada já pode contar de novo; carimbo inválido = null. */
export function limiteAusencia(carimbo: string): string | null {
  const t = Date.parse(`${carimbo.slice(0, 23)}Z`);
  return Number.isFinite(t) ? new Date(t - JANELA_AUSENCIA_MS).toISOString().slice(0, 23) : null;
}

/** O contexto de uma gravação: o extrato e o CARIMBO (único — as contagens e a versão saem dele). */
export type Gravacao = {
  tipo: TipoTransacao;
  contrato: string;
  inicio: string;
  fim: string;
  carimbo: string;
  origem: "manual" | "auto";
  por: string;
  bytes: number;
  ms: number;
  fora: number;
};

function comandoTransacoes(db: Db, g: Gravacao, json: string) {
  const sel = db
    .select({
      id: sql<number>`NULL`.as("id"),
      ...Object.fromEntries(COLUNAS_TRANSACAO.map((c, i) => [camel(c), sql`${jx(i)}`.as(c)])),
      unidadeChave: sql<string | null>`${jx(N + 1)}`.as("unidade_chave"),
      orgaoId: sql<number | null>`(SELECT c."orgao_id" FROM "frota_contratos" c WHERE c."codigo" = ${g.contrato})`.as("orgao_id"),
      reparticaoId: sql<number | null>`(SELECT u."reparticao_id" FROM "frota_unidades" u WHERE u."chave" = ${jx(N + 1)})`.as("reparticao_id"),
      hash: sql<string>`${jx(N)}`.as("hash"),
      ausente: sql<number>`0`.as("ausente"),
      removidoEm: sql<string | null>`NULL`.as("removido_em"),
      criadoEm: sql<string>`${g.carimbo}`.as("criado_em"),
      atualizadoEm: sql<string>`${g.carimbo}`.as("atualizado_em"),
    })
    .from(sql`json_each(${json}) AS j`)
    // SÓ o que é novo ou mudou (a igual não é escrita): a gravada com a MESMA assinatura, valendo, fica como está.
    .where(
      sql`NOT EXISTS (SELECT 1 FROM "frota_transacoes" t WHERE t."tipo" = ${jx(I_TIPO)} AND t."chave" = ${jx(I_CHAVE)} AND t."hash" = ${jx(N)} AND t."ausente" = 0 AND t."removido_em" IS NULL)`,
    );
  const atualizar = Object.fromEntries(
    [...COLUNAS_TRANSACAO.filter((c) => c !== "tipo" && c !== "chave"), "unidade_chave", "orgao_id", "reparticao_id", "hash"].map((c) => [camel(c), sql.raw(`excluded."${c}"`)]),
  );
  return db
    .insert(frotaTransacoes)
    .select(sel as never)
    .onConflictDoUpdate({
      target: [frotaTransacoes.tipo, frotaTransacoes.chave],
      set: { ...atualizar, ausente: sql`0`, removidoEm: sql`NULL`, atualizadoEm: sql`excluded."atualizado_em"` },
      setWhere: sql`"frota_transacoes"."hash" IS NOT excluded."hash" OR "frota_transacoes"."ausente" > 0 OR "frota_transacoes"."removido_em" IS NOT NULL`,
    });
}

/**
 * A GRAVAÇÃO de um extrato (os comandos do lote atômico). `linhas` = TODAS as que vieram no período (as iguais também — a
 * ausência é decidida por elas). Devolve os comandos; o último insere a leitura.
 */
export function comandosGravarExtrato(db: Db, g: Gravacao, linhas: readonly LinhaTransacao[]) {
  const prontas = linhas.map(linhaParaGravar);
  const chaves = JSON.stringify(linhas.map((l) => l.chave));
  const placas = new Map<string, [string, string, string | null, string | null, number | null]>();
  const unidades = new Map<string, [string, string]>();
  for (const l of linhas) {
    const p = l.placa as string | null;
    if (p) {
      const atual = placas.get(p);
      // A marca/modelo/ano: o primeiro que vier preenchido (a Vólus só manda no abastecimento).
      placas.set(p, [
        p,
        placaValida(p) ? "veiculo" : "maquina",
        atual?.[2] ?? (l.marca as string | null),
        atual?.[3] ?? (l.modelo as string | null),
        atual?.[4] ?? (l.ano_fabricacao as number | null),
      ]);
    }
    const u = l.unidade_nome as string | null;
    const k = chaveTexto(u);
    if (u && k && !unidades.has(k)) unidades.set(k, [k, u]);
  }
  const doPeriodo = and(eq(frotaTransacoes.tipo, g.tipo), eq(frotaTransacoes.contrato, g.contrato), between(frotaTransacoes.dia, g.inicio, g.fim));
  const cmds: unknown[] = pedacosDeLinhas(prontas).map((json) => comandoTransacoes(db, g, json));
  // A AUSÊNCIA: a gravada no período que não veio — a 1ª vez só marca; a 2ª seguida = removida na Vólus.
  cmds.push(
    db
      .update(frotaTransacoes)
      .set({
        ausente: sql`"ausente" + 1`,
        removidoEm: sql`CASE WHEN "ausente" + 1 >= 2 THEN ${g.carimbo} ELSE NULL END`,
        atualizadoEm: g.carimbo,
      })
      .where(
        and(
          doPeriodo,
          isNull(frotaTransacoes.removidoEm),
          sql`${frotaTransacoes.chave} NOT IN (SELECT value FROM json_each(${chaves}))`,
          // Uma ausência marcada há menos de `JANELA_AUSENCIA_MS` não conta de novo: duas leituras quase juntas do MESMO
          // período (a manual e a automática, ou a nova tentativa de um pedido que já tinha gravado) nunca removem nada.
          ...(limiteAusencia(g.carimbo) ? [sql`NOT (${frotaTransacoes.ausente} > 0 AND ${frotaTransacoes.atualizadoEm} > ${limiteAusencia(g.carimbo)})`] : []),
        ),
      ),
  );
  if (placas.size) {
    const json = JSON.stringify([...placas.values()]);
    cmds.push(
      db
        .insert(frotaVeiculos)
        .select(
          db
            .select({
              placa: sql<string>`${jx(0)}`.as("placa"),
              tipo: sql<string>`${jx(1)}`.as("tipo"),
              classificacaoId: sql<number | null>`NULL`.as("classificacao_id"),
              marca: sql<string | null>`${jx(2)}`.as("marca"),
              modelo: sql<string | null>`${jx(3)}`.as("modelo"),
              ano: sql<number | null>`${jx(4)}`.as("ano"),
              situacao: sql<string>`'ativo'`.as("situacao"),
              origem: sql<string | null>`NULL`.as("origem"),
              fipe: sql<number | null>`NULL`.as("fipe"),
              locacao: sql<number | null>`NULL`.as("locacao"),
              contrato: sql<string | null>`NULL`.as("contrato"),
              capacidadeTanque: sql<number | null>`NULL`.as("capacidade_tanque"),
              reparticaoId: sql<number | null>`NULL`.as("reparticao_id"),
              observacao: sql<string | null>`NULL`.as("observacao"),
              criadoEm: sql<string>`${g.carimbo}`.as("criado_em"),
              atualizadoEm: sql<string>`${g.carimbo}`.as("atualizado_em"),
              atualizadoPor: sql<string | null>`NULL`.as("atualizado_por"),
            })
            .from(sql`json_each(${json}) AS j`)
            .where(sql`1`) as never,
        )
        // Só completa o que FALTA (o que o ADM editou nunca é sobrescrito); a placa que já está completa não é escrita.
        .onConflictDoUpdate({
          target: frotaVeiculos.placa,
          set: {
            marca: sql`COALESCE("frota_veiculos"."marca", excluded."marca")`,
            modelo: sql`COALESCE("frota_veiculos"."modelo", excluded."modelo")`,
            ano: sql`COALESCE("frota_veiculos"."ano", excluded."ano")`,
          },
          setWhere: sql`("frota_veiculos"."marca" IS NULL AND excluded."marca" IS NOT NULL) OR ("frota_veiculos"."modelo" IS NULL AND excluded."modelo" IS NOT NULL) OR ("frota_veiculos"."ano" IS NULL AND excluded."ano" IS NOT NULL)`,
        }),
    );
  }
  if (unidades.size) {
    const json = JSON.stringify([...unidades.values()]);
    cmds.push(
      db
        .insert(frotaUnidades)
        .select(
          db
            .select({
              id: sql<number>`NULL`.as("id"),
              chave: sql<string>`${jx(0)}`.as("chave"),
              nome: sql<string>`${jx(1)}`.as("nome"),
              contrato: sql<string>`${g.contrato}`.as("contrato"),
              reparticaoId: sql<number | null>`NULL`.as("reparticao_id"),
              vistoEm: sql<string>`${g.carimbo}`.as("visto_em"),
              atualizadoEm: sql<string>`${g.carimbo}`.as("atualizado_em"),
            })
            .from(sql`json_each(${json}) AS j`)
            .where(sql`1`) as never,
        )
        .onConflictDoNothing(),
    );
  }
  cmds.push(comandoLeitura(db, g, linhas));
  // A VERSÃO dos dados sobe só quando algo foi escrito (o pacote na memória do Worker vale enquanto ela for a mesma).
  cmds.push(comandoSubirVersao(db, g.carimbo));
  return cmds;
}

/** O REGISTRO da leitura: as contagens saem do banco pelo carimbo (o que de fato foi escrito). */
function comandoLeitura(db: Db, g: Gravacao, linhas: readonly LinhaTransacao[]) {
  const c = g.carimbo;
  const novos = sql`(SELECT COUNT(*) FROM "frota_transacoes" WHERE "atualizado_em" = ${c} AND "criado_em" = ${c})`;
  const alterados = sql`(SELECT COUNT(*) FROM "frota_transacoes" WHERE "atualizado_em" = ${c} AND "criado_em" <> ${c} AND "ausente" = 0)`;
  return db.insert(frotaLeituras).values({
    contrato: g.contrato,
    tipo: g.tipo,
    inicio: g.inicio,
    fim: g.fim,
    origem: g.origem,
    estado: "ok",
    registros: linhas.length,
    novos: sql`${novos}`,
    alterados: sql`${alterados}`,
    iguais: sql`${linhas.length} - ${novos} - ${alterados}`,
    ausentes: sql`(SELECT COUNT(*) FROM "frota_transacoes" WHERE "atualizado_em" = ${c} AND "ausente" > 0 AND "removido_em" IS NULL)`,
    // Pelo índice do carimbo (a ausência grava `atualizado_em` = carimbo): sem ele, o `removido_em` varria a tabela inteira.
    removidos: sql`(SELECT COUNT(*) FROM "frota_transacoes" WHERE "atualizado_em" = ${c} AND "removido_em" = ${c})`,
    fora: g.fora,
    valor: linhas.reduce((s, l) => s + Number(l.valor ?? 0), 0),
    bytes: g.bytes,
    ms: g.ms,
    por: g.por,
    em: g.carimbo.slice(0, 19).replace("T", " "),
  }).returning({ novos: frotaLeituras.novos, alterados: frotaLeituras.alterados, iguais: frotaLeituras.iguais, ausentes: frotaLeituras.ausentes, removidos: frotaLeituras.removidos });
}

/** As contagens da leitura no resultado do lote (`comandosGravarExtrato` — a penúltima instrução). */
export function contagensDoLote(resultados: unknown[]): { novos: number; alterados: number; iguais: number; ausentes: number; removidos: number } {
  const r = (resultados.at(-2) as { novos: number; alterados: number; iguais: number; ausentes: number; removidos: number }[] | undefined)?.[0];
  return { novos: r?.novos ?? 0, alterados: r?.alterados ?? 0, iguais: r?.iguais ?? 0, ausentes: r?.ausentes ?? 0, removidos: r?.removidos ?? 0 };
}

/** A leitura que NÃO gravou (dividida ou com erro) — fica no histórico. */
export function comandoLeituraSemGravar(db: Db, g: Gravacao, estado: "dividido" | "erro", erro: string | null) {
  return db.insert(frotaLeituras).values({
    contrato: g.contrato,
    tipo: g.tipo,
    inicio: g.inicio,
    fim: g.fim,
    origem: g.origem,
    estado,
    bytes: g.bytes,
    ms: g.ms,
    erro: erro?.slice(0, 500) ?? null,
    por: g.por,
    em: g.carimbo.slice(0, 19).replace("T", " "),
  });
}

/** Leva o ÓRGÃO do contrato a todas as transações dele (o ADM trocou o órgão) — só as que mudam são escritas. */
export function comandoRealinharContrato(db: Db, contrato: string) {
  const alvo = sql`(SELECT c."orgao_id" FROM "frota_contratos" c WHERE c."codigo" = ${contrato})`;
  return db
    .update(frotaTransacoes)
    .set({ orgaoId: sql`${alvo}` })
    .where(and(eq(frotaTransacoes.contrato, contrato), sql`${frotaTransacoes.orgaoId} IS NOT ${alvo}`));
}

/** Leva a UNIDADE do cadastro (o vínculo da unidade da Vólus) às transações dela. */
export function comandoRealinharUnidade(db: Db, chave: string) {
  const alvo = sql`(SELECT u."reparticao_id" FROM "frota_unidades" u WHERE u."chave" = ${chave})`;
  return db
    .update(frotaTransacoes)
    .set({ reparticaoId: sql`${alvo}` })
    .where(and(eq(frotaTransacoes.unidadeChave, chave), sql`${frotaTransacoes.reparticaoId} IS NOT ${alvo}`));
}

// ─── LEITURA (as telas) ───────────────────────────────────────────────────────────────────────────────────────

/**
 * As colunas do PACOTE de uma transação para as telas (tupla posicional): o MESMO formato para abastecimento e manutenção
 * — o painel e as tabelas leem pela posição (`frota-core.ts`, `CAMPOS_PACOTE`).
 */
const COLUNAS_PACOTE = [
  `t."id"`,
  `CASE t."tipo" WHEN 'abastecimento' THEN 0 ELSE 1 END`,
  `t."dia"`,
  `substr(t."data_hora", 12, 5)`,
  `t."contrato"`,
  `t."placa"`,
  `COALESCE(t."produtos", t."tipo_manutencao")`,
  `t."tipo_manutencao"`,
  `t."litros"`,
  `t."preco_litro"`,
  `t."valor"`,
  `t."hodometro"`,
  `t."km_rodado"`,
  `t."consumo"`,
  `t."estabelecimento"`,
  `t."estab_cidade"`,
  `t."estab_uf"`,
  `t."motorista"`,
  `t."unidade_nome"`,
  `t."reparticao_id"`,
  `t."orgao_id"`,
  `t."empenho"`,
  `t."processo"`,
  `t."qtd_itens"`,
  `CASE WHEN t."removido_em" IS NULL THEN 0 ELSE 1 END`,
  // A UNIDADE e o ÓRGÃO do SISTEMA (o cadastro): a unidade pela ligação da unidade da Vólus (a sigla, com " — ÓRGÃO" quando
  // a mesma sigla existe em outra unidade — o rótulo único da Execução) e o nome; o órgão = o da unidade, senão o do contrato.
  `CASE WHEN r."id" IS NULL THEN NULL ELSE r."codigo" || CASE WHEN dup."codigo" IS NOT NULL THEN ' — ' || COALESCE(NULLIF(o."sigla", ''), o."nome", '') ELSE '' END END`,
  `r."nome"`,
  `COALESCE(NULLIF(o."sigla", ''), o."nome")`,
  `o."nome"`,
];
/** As junções do pacote (por chave primária — uma busca por linha pelo índice, nada de varrer). */
const JUNCOES_PACOTE = `LEFT JOIN "reparticoes" r ON r."id" = t."reparticao_id"
      LEFT JOIN "orgaos" o ON o."id" = COALESCE(r."orgao_id", t."orgao_id")
      LEFT JOIN (SELECT "codigo" FROM "reparticoes" GROUP BY "codigo" HAVING COUNT(*) > 1) dup ON dup."codigo" = r."codigo"`;
/** Linhas por pedaço do pacote (cada texto bem abaixo do teto de 2 MB por valor do D1). */
export const TUPLAS_POR_PEDACO_FROTA = 4000;

/**
 * O PACOTE de um ano (os dois tipos, ou um) no escopo da pessoa, do mais recente ao mais antigo, montado NO BANCO em
 * pedaços de JSON — o Worker só os junta. `removidos` = também os removidos na Vólus.
 */
export async function consultaPacoteFrota(db: Db, ano: number, escopo: EscopoEmpenhos, o: { tipo?: TipoTransacao; removidos?: boolean } = {}): Promise<{ texto: string; total: number }> {
  if (escopoVazio(escopo)) return { texto: "[]", total: 0 };
  const filtros: SQL[] = [sql`t."ano" = ${ano}`];
  if (o.tipo) filtros.push(sql`t."tipo" = ${o.tipo}`);
  if (!o.removidos) filtros.push(sql`t."removido_em" IS NULL`);
  if (escopo !== null) filtros.push(doEscopo(escopo, "t."));
  const rows = await db.all<{ j: string; n: number }>(sql`
    SELECT json_group_array(json_array(${sql.raw(COLUNAS_PACOTE.map((_c, i) => `x."c${i}"`).join(", "))})) AS j, COUNT(*) AS n FROM (
      SELECT ${sql.raw(COLUNAS_PACOTE.map((c, i) => `${c} AS "c${i}"`).join(", "))}, row_number() OVER (ORDER BY t."dia" DESC, t."data_hora" DESC, t."id" DESC) AS "ord"
      FROM "frota_transacoes" t ${sql.raw(JUNCOES_PACOTE)} WHERE ${sql.join(filtros, sql` AND `)}
    ) x GROUP BY (x."ord" - 1) / ${TUPLAS_POR_PEDACO_FROTA} ORDER BY (x."ord" - 1) / ${TUPLAS_POR_PEDACO_FROTA}`);
  const partes = rows.map((r) => r.j.slice(1, -1)).filter(Boolean);
  return { texto: `[${partes.join(",")}]`, total: rows.reduce((s, r) => s + Number(r.n), 0) };
}

/** Os ANOS com transações no escopo (agrega primeiro — uma leitura do índice). */
export async function consultaAnosFrota(db: Db, escopo: EscopoEmpenhos): Promise<{ ano: number; n: number }[]> {
  if (escopoVazio(escopo)) return [];
  const so = escopo === null ? sql`` : sql` AND ${doEscopo(escopo, "t.")}`;
  return db.all<{ ano: number; n: number }>(sql`SELECT t."ano" AS ano, COUNT(*) AS n FROM "frota_transacoes" t WHERE t."removido_em" IS NULL${so} GROUP BY t."ano" ORDER BY t."ano" DESC`);
}

/** Sobe a VERSÃO quando a gravação do `carimbo` escreveu alguma transação (uma consulta pelo índice do carimbo). */
export function comandoSubirVersao(db: Db, carimbo: string | null) {
  return db
    .update(frotaEstado)
    .set({ versao: sql`"versao" + 1`, em: sql`CURRENT_TIMESTAMP` })
    .where(and(eq(frotaEstado.id, 1), carimbo == null ? sql`1` : sql`EXISTS (SELECT 1 FROM "frota_transacoes" WHERE "atualizado_em" = ${carimbo})`));
}

/** A VERSÃO dos dados da frota (uma linha — o pacote na memória do Worker vale enquanto ela for a mesma). */
export async function consultaVersaoFrota(db: Db): Promise<string> {
  const [r] = await db.select({ v: frotaEstado.versao }).from(frotaEstado).where(eq(frotaEstado.id, 1));
  return String(r?.v ?? 0);
}

/** Os contratos (para o comando de realinhamento em todos — usado depois de trocar órgãos em massa). */
export const contratosDoBanco = (db: Db) => db.select({ codigo: frotaContratos.codigo }).from(frotaContratos);

/**
 * TRAVA o cursor de um contrato × tipo para UMA leitura da automática: só se ninguém o trava agora E se ele ainda está como
 * estava quando o trabalho foi escolhido (`visto`) — outra execução que o avançou no meio tempo faz esta desistir (nunca
 * relê o período nem recomeça um ciclo por cima de um avanço). O ciclo novo grava o início junto. Devolve o passo e as
 * falhas do cursor travado (vazio = não travou).
 */
/** A TRAVA da importação MANUAL de um contrato × tipo (a mesma coluna da automática — nunca as duas lendo o mesmo par):
 * só a trava, sem mexer no ciclo nem nas falhas. Volta a linha só para quem a pegou. */
export function comandoTravarManual(db: Db, contrato: string, tipo: string, agoraIso: string, travaAte: string) {
  return db
    .update(frotaCursores)
    .set({ travaAte })
    .where(and(eq(frotaCursores.contrato, contrato), eq(frotaCursores.tipo, tipo), or(isNull(frotaCursores.travaAte), lt(frotaCursores.travaAte, agoraIso))))
    .returning({ ate: frotaCursores.travaAte });
}

/** Solta a trava manual — só se ainda for a desta leitura. */
export function comandoSoltarManual(db: Db, contrato: string, tipo: string, travaAte: string) {
  return db
    .update(frotaCursores)
    .set({ travaAte: null })
    .where(and(eq(frotaCursores.contrato, contrato), eq(frotaCursores.tipo, tipo), eq(frotaCursores.travaAte, travaAte)));
}

export function comandoTravarCursor(
  db: Db,
  t: { contrato: string; tipo: string; inicio: string; novoCiclo: boolean },
  visto: { proximo: string | null; cicloConcluidoEm: string | null } | undefined,
  agoraIso: string,
  travaAte: string,
) {
  return db
    .update(frotaCursores)
    // A falha e a marca de INTERROMPIDA são gravadas ANTES da leitura: a execução cortada (limite de CPU, exceção) fica
    // contada — o fim da leitura (ok ou erro) as substitui.
    .set({ travaAte, falhas: sql`${frotaCursores.falhas} + 1`, ultimoErro: MSG_INTERROMPIDA, ...(t.novoCiclo ? { cicloInicio: t.inicio, proximo: t.inicio, cicloIniciadoEm: agoraIso } : {}) })
    .where(
      and(
        eq(frotaCursores.contrato, t.contrato),
        eq(frotaCursores.tipo, t.tipo),
        or(isNull(frotaCursores.travaAte), lt(frotaCursores.travaAte, agoraIso)),
        // A ESPERA depois de uma falha também vale aqui (outra execução pode tê-la gravado depois da escolha).
        or(isNull(frotaCursores.esperaAte), lt(frotaCursores.esperaAte, agoraIso)),
        sql`${frotaCursores.proximo} IS ${visto?.proximo ?? null}`,
        sql`${frotaCursores.cicloConcluidoEm} IS ${visto?.cicloConcluidoEm ?? null}`,
      ),
    )
    .returning({ passo: frotaCursores.passoDias, falhas: frotaCursores.falhas });
}
