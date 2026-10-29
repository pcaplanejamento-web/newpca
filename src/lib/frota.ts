import { and, asc, desc, eq, inArray, lt, sql } from "drizzle-orm";
import { cache } from "react";
import { configuracoes, frotaClassificacoes, frotaContratos, frotaCursores, frotaLeituras, frotaTransacoes, frotaUnidades, frotaVeiculos, reparticoes } from "@/db/schema";
import { getDb } from "./db";
import type { EscopoEmpenhos } from "./empenhos-tela-core";
import { chaveEscopoEmpenhos, escopoVazio } from "./empenhos-tela-core";
import { doEscopo } from "./empenhos-tela-sql";
import { unidadeDoModulo } from "./escopo-cabecalho";
import { agoraBrasilia, avancarCursor, type ConfigFrota, credencialDefinida, esperaDaFalha, lerConfigFrota, motivoForaDaHora, novoPasso, proximoTrabalho } from "./frota-config-core";
import { comandoLeituraSemGravar, comandoTravarCursor, comandoRealinharContrato, comandoRealinharUnidade, comandoSubirVersao, comandosGravarExtrato, consultaAnosFrota, contagensDoLote, consultaPacoteFrota, consultaVersaoFrota, type Gravacao } from "./frota-sql";
import { cursoresLendo } from "./frota-andamento-core";
import { lerBlobConfiguracoes } from "./integracoes";
import { decifrarSegredo } from "./integracoes-segredos";
import { criarMemoVersao } from "./memo-versao-core";
import { clienteVolus, ErroVolus } from "./volus-api";
import { diasEntre, linhasDoExtrato, MAX_BYTES_EXTRATO, partesPara, type ProdutoContrato, type TipoTransacao, tiposDoProduto, transacoesDaResposta } from "./volus-core";

/**
 * FROTAS — o motor no servidor: a configuração (blob `frota`), a leitura de UM período da Vólus (contrato × tipo × dias —
 * dividido quando a resposta não cabe na CPU do Worker), a ATUALIZAÇÃO AUTOMÁTICA (um período por execução do cron, pelo
 * cursor de cada contrato), os contratos e as unidades da Vólus, e o PACOTE das telas na memória do Worker pela versão.
 */

// ─── CONFIGURAÇÃO ───────────────────────────────────────────────────────────────────────────────────────────────

/** A configuração SEM cache (a automática e a credencial valem na próxima execução). Falha ao ler = desligada. */
export async function getConfigFrota(): Promise<ConfigFrota> {
  try {
    return lerConfigFrota((await lerBlobConfiguracoes()).frota);
  } catch {
    return lerConfigFrota(undefined);
  }
}

export async function gravarConfigFrota(cfg: ConfigFrota, usuarioId: number): Promise<ConfigFrota> {
  const blob = await lerBlobConfiguracoes();
  const valor = lerConfigFrota(cfg);
  await getDb()
    .update(configuracoes)
    .set({ dados: JSON.stringify({ ...blob, frota: valor }), atualizadoPor: usuarioId, atualizadoEm: sql`(CURRENT_TIMESTAMP)` })
    .where(eq(configuracoes.id, 1));
  return valor;
}

/** O cliente da Vólus pela configuração (o segredo decifrado) — ou o motivo de não dar. */
export async function clienteDaConfig(cfg: ConfigFrota) {
  if (!credencialDefinida(cfg)) return { cliente: null, erro: "Configure o Client ID e o Client Secret da Vólus (Configurações → Importações → Frotas)." };
  const segredo = await decifrarSegredo(cfg.clientSecret);
  if (!segredo) return { cliente: null, erro: "Não foi possível ler o Client Secret da Vólus — confira a chave mestra (INTEGRACOES_CHAVE) e salve o segredo de novo." };
  return { cliente: clienteVolus({ clientId: cfg.clientId, clientSecret: segredo }), erro: null };
}

// ─── LEITURA DE UM PERÍODO ──────────────────────────────────────────────────────────────────────────────────────

export type ResultadoLeitura =
  | { estado: "ok"; registros: number; novos: number; alterados: number; iguais: number; ausentes: number; removidos: number; fora: number; bytes: number; ms: number }
  | { estado: "dividir"; partes: number; bytes: number }
  | { estado: "erro"; erro: string; transitorio: boolean; status: number; lento: boolean };

const carimbo = () => `${new Date().toISOString().slice(0, 23)}#${Math.random().toString(36).slice(2, 8)}`;

/**
 * LÊ e GRAVA um período (contrato × tipo × [inicio, fim]). A resposta acima do teto não é lida: volta `dividir` com em
 * quantas partes (um dia que sozinho não cabe vira erro — nunca uma gravação pela metade). Toda leitura fica no histórico.
 */
export async function lerPeriodo(
  cfg: ConfigFrota,
  p: { contrato: string; tipo: TipoTransacao; inicio: string; fim: string; origem: "manual" | "auto"; por: string },
): Promise<ResultadoLeitura> {
  const db = getDb();
  const g: Gravacao = { tipo: p.tipo, contrato: p.contrato, inicio: p.inicio, fim: p.fim, carimbo: carimbo(), origem: p.origem, por: p.por, bytes: 0, ms: 0, fora: 0 };
  const t0 = Date.now();
  const falha = async (erro: string, transitorio: boolean, status: number, lento = false): Promise<ResultadoLeitura> => {
    if (!g.ms) g.ms = Date.now() - t0;
    await db.batch([comandoLeituraSemGravar(db, g, "erro", erro)] as never).catch(() => {});
    return { estado: "erro", erro, transitorio, status, lento };
  };
  const c = await clienteDaConfig(cfg);
  if (!c.cliente) return falha(c.erro, false, 0);
  let texto: string;
  try {
    const r = await c.cliente.extrato(p.tipo, p.contrato, p.inicio, p.fim, MAX_BYTES_EXTRATO);
    g.bytes = r.bytes;
    g.ms = r.ms;
    if (r.grande) {
      if (diasEntre(p.inicio, p.fim) <= 1) return falha(`Um único dia (${p.inicio}) passa do limite de leitura (${Math.round(r.bytes / 1024)} KB).`, false, 0);
      await db.batch([comandoLeituraSemGravar(db, g, "dividido", null)] as never).catch(() => {});
      return { estado: "dividir", partes: partesPara(r.bytes), bytes: r.bytes };
    }
    texto = r.texto;
  } catch (e) {
    const ev = e instanceof ErroVolus ? e : new ErroVolus("Falha ao ler a Vólus.", 0);
    return falha(ev.message, ev.transitorio, ev.status, ev.lento);
  }
  let json: unknown;
  try {
    json = JSON.parse(texto);
  } catch {
    return falha("A Vólus respondeu num formato inesperado (não é JSON).", true, 0);
  }
  const tx = transacoesDaResposta(json);
  if ("erro" in tx) return falha(tx.erro, true, 0);
  const ex = linhasDoExtrato(p.tipo, p.contrato, tx.transacoes, p.inicio, p.fim);
  g.fora = ex.fora;
  let l: ReturnType<typeof contagensDoLote>;
  try {
    l = contagensDoLote((await db.batch(comandosGravarExtrato(db, g, ex.linhas) as never)) as unknown[]);
  } catch (e) {
    console.error("[frota] gravação:", (e as Error)?.message);
    return falha("Não foi possível gravar a leitura no banco (tente de novo).", true, 0);
  }
  return {
    estado: "ok",
    registros: ex.linhas.length,
    ...l,
    fora: ex.fora,
    bytes: g.bytes,
    ms: g.ms,
  };
}

// ─── A AUTOMÁTICA ───────────────────────────────────────────────────────────────────────────────────────────────

/** Garante um cursor por contrato ATIVO × tipo do produto (o contrato que deixou de ter o tipo perde o cursor). */
async function garantirCursores() {
  const db = getDb();
  const cs = await db.select({ codigo: frotaContratos.codigo, produto: frotaContratos.produto }).from(frotaContratos).where(eq(frotaContratos.ativo, true));
  const pares = cs.flatMap((c) => tiposDoProduto(c.produto as ProdutoContrato).map((tipo) => ({ contrato: c.codigo, tipo })));
  if (pares.length) await db.insert(frotaCursores).values(pares).onConflictDoNothing();
  // Só os cursores de um par VIGENTE (contrato ativo × tipo do produto dele): o tipo que o contrato deixou de ter não é lido.
  const vigentes = new Set(pares.map((x) => `${x.contrato}:${x.tipo}`));
  const todos = await db.select().from(frotaCursores).where(inArray(frotaCursores.contrato, cs.length ? cs.map((c) => c.codigo) : [""]));
  return todos.filter((k) => vigentes.has(`${k.contrato}:${k.tipo}`));
}

/** A automática está lendo este contrato × tipo AGORA (a trava do cursor no futuro)? A manual espera. */
export async function cursorLendo(contrato: string, tipo: string): Promise<boolean> {
  const [c] = await getDb()
    .select({ travaAte: frotaCursores.travaAte })
    .from(frotaCursores)
    .where(and(eq(frotaCursores.contrato, contrato), eq(frotaCursores.tipo, tipo)));
  return !!c?.travaAte && c.travaAte > new Date().toISOString();
}

/** A trava de um cursor durante a leitura: cobre o pior caso (autenticar 15 s + extrato 25 s, de novo depois de um 401)
 * e fica abaixo do intervalo do cron (3 min). */
export const TRAVA_CURSOR_MS = 150_000;

/**
 * UM PASSO da automática (o cron chama a cada poucos minutos): escolhe o cursor mais atrasado, TRAVA ele (150 s — outra
 * execução nunca lê o mesmo), lê um período e avança. Devolve o que fez (para o log do cron).
 */
export async function passoAutomaticoFrota(agora = new Date()): Promise<string> {
  const cfg = await getConfigFrota();
  const fora = motivoForaDaHora(cfg, agora);
  if (fora) return fora;
  const cursores = await garantirCursores();
  const t = proximoTrabalho(
    cursores.map((k) => ({ ...k, travaAte: k.travaAte })),
    cfg,
    agora,
  );
  if (!t) return "Nada a atualizar agora.";
  const db = getDb();
  const iso = agora.toISOString();
  const trava = new Date(agora.getTime() + TRAVA_CURSOR_MS).toISOString();
  // O cursor como estava quando o trabalho foi escolhido: outra execução que o avançou no meio tempo faz esta desistir
  // (nunca relê o período nem recomeça o ciclo por cima de um avanço).
  const visto = cursores.find((k) => k.contrato === t.contrato && k.tipo === t.tipo);
  const travou = await comandoTravarCursor(db, t, visto, iso, trava);
  if (!travou.length) return "Outra execução está lendo este contrato.";
  const dias = diasEntre(t.inicio, t.fim);
  // Depois de execuções INTERROMPIDAS, o período já veio encolhido (`passoEfetivo`): o passo gravado parte dele.
  const passo = Math.min(travou[0].passo, dias);
  const onde = and(eq(frotaCursores.contrato, t.contrato), eq(frotaCursores.tipo, t.tipo));
  let r: Awaited<ReturnType<typeof lerPeriodo>>;
  try {
    r = await lerPeriodo(cfg, { contrato: t.contrato, tipo: t.tipo as TipoTransacao, inicio: t.inicio, fim: t.fim, origem: "auto", por: "Atualização automática" });
  } catch (e) {
    // Uma exceção (o banco, um registro fora do esperado) segue o caminho do ERRO: solta a trava, espera e diz o motivo.
    r = { estado: "erro", erro: `Falha na leitura: ${(e as Error)?.message ?? String(e)}`, transitorio: true, status: 0, lento: false };
  }
  if (r.estado === "ok") {
    const proximo = avancarCursor(t.fim, agoraBrasilia(agora).dia);
    const terminou = proximo === null;
    await db
      .update(frotaCursores)
      .set({
        travaAte: null,
        falhas: 0,
        esperaAte: null,
        ultimoErro: null,
        passoDias: novoPasso(passo, dias, { bytes: r.bytes, ms: r.ms }, MAX_BYTES_EXTRATO),
        proximo,
        ...(terminou ? { cicloConcluidoEm: iso } : {}),
      })
      .where(onde);
    return `Lido ${t.contrato} ${t.tipo} ${t.inicio}..${t.fim}: ${r.registros} registros (${r.novos} novos, ${r.alterados} alterados).`;
  }
  if (r.estado === "dividir") {
    await db
      .update(frotaCursores)
      // A Vólus respondeu (só grande demais): não é falha — a contada na trava sai.
      .set({ travaAte: null, falhas: 0, ultimoErro: null, passoDias: novoPasso(passo, dias, { dividir: r.partes }, MAX_BYTES_EXTRATO) })
      .where(onde);
    return `Período grande demais (${t.contrato} ${t.tipo}); o passo diminui.`;
  }
  // A falha já foi contada na TRAVA (antes da leitura).
  const falhas = travou[0].falhas;
  const espera = new Date(agora.getTime() + esperaDaFalha(falhas, r.transitorio) * 60_000).toISOString();
  // A Vólus não respondeu a tempo: o MESMO período falharia de novo — a próxima tentativa pede a metade dos dias.
  await db
    .update(frotaCursores)
    .set({ travaAte: null, falhas, esperaAte: espera, ultimoErro: r.erro.slice(0, 300), ...(r.lento && dias > 1 ? { passoDias: novoPasso(passo, dias, { lento: true }, MAX_BYTES_EXTRATO) } : {}) })
    .where(onde);
  return `Erro em ${t.contrato} ${t.tipo}: ${r.erro}`;
}

/** Limpa o histórico de leituras antigo (só os últimos 120 dias ficam) — o cron dos e-mails chama. */
export async function limparLeiturasFrota() {
  await getDb()
    .delete(frotaLeituras)
    .where(lt(frotaLeituras.em, sql`datetime('now', '-120 days')`));
}

// ─── CONTRATOS, UNIDADES, CURSORES, HISTÓRICO (ADM) ─────────────────────────────────────────────────────────────

export const listarContratos = () => getDb().select().from(frotaContratos).orderBy(asc(frotaContratos.produto), asc(frotaContratos.codigo));

/** Grava a lista de contratos (o que mudou) e leva o órgão novo às transações — tudo num lote. */
export async function gravarContratos(lista: { codigo: string; nome: string; sigla: string; produto: ProdutoContrato; orgaoId: number | null; ativo: boolean }[]) {
  const db = getDb();
  const atuais = new Map((await listarContratos()).map((c) => [c.codigo, c]));
  const cmds: unknown[] = [];
  for (const c of lista) {
    const a = atuais.get(c.codigo);
    if (a && a.nome === c.nome && a.sigla === c.sigla && a.produto === c.produto && a.orgaoId === c.orgaoId && a.ativo === c.ativo) continue;
    cmds.push(
      db
        .insert(frotaContratos)
        .values({ ...c, atualizadoEm: sql`CURRENT_TIMESTAMP` })
        .onConflictDoUpdate({ target: frotaContratos.codigo, set: { nome: c.nome, sigla: c.sigla, produto: c.produto, orgaoId: c.orgaoId, ativo: c.ativo, atualizadoEm: sql`CURRENT_TIMESTAMP` } }),
    );
    if (!a || a.orgaoId !== c.orgaoId) cmds.push(comandoRealinharContrato(db, c.codigo));
  }
  if (!cmds.length) return 0;
  cmds.push(comandoSubirVersao(db, null));
  await db.batch(cmds as never);
  return cmds.length - 1;
}

/** As unidades da Vólus com quantas transações cada uma tem (vigentes) e a unidade do cadastro ligada. */
export async function listarUnidadesFrota() {
  const db = getDb();
  return db
    .select({
      chave: frotaUnidades.chave,
      nome: frotaUnidades.nome,
      contrato: frotaUnidades.contrato,
      reparticaoId: frotaUnidades.reparticaoId,
      registros: sql<number>`(SELECT COUNT(*) FROM "frota_transacoes" t WHERE t."unidade_chave" = ${frotaUnidades.chave} AND t."removido_em" IS NULL)`,
    })
    .from(frotaUnidades)
    .orderBy(asc(frotaUnidades.nome));
}

/** Liga (ou desliga) as unidades da Vólus às do cadastro e leva às transações — num lote. */
export async function gravarVinculosUnidades(lista: { chave: string; reparticaoId: number | null }[]) {
  const db = getDb();
  const atuais = new Map((await db.select({ chave: frotaUnidades.chave, r: frotaUnidades.reparticaoId }).from(frotaUnidades)).map((u) => [u.chave, u.r]));
  const cmds: unknown[] = [];
  for (const u of lista) {
    if (!atuais.has(u.chave) || atuais.get(u.chave) === u.reparticaoId) continue;
    cmds.push(db.update(frotaUnidades).set({ reparticaoId: u.reparticaoId, atualizadoEm: sql`CURRENT_TIMESTAMP` }).where(eq(frotaUnidades.chave, u.chave)));
    cmds.push(comandoRealinharUnidade(db, u.chave));
  }
  if (!cmds.length) return 0;
  cmds.push(comandoSubirVersao(db, null));
  await db.batch(cmds as never);
  return cmds.length / 2;
}

export const listarCursores = () => getDb().select().from(frotaCursores);

export async function listarLeituras(limite = 200, contrato?: string) {
  return getDb()
    .select()
    .from(frotaLeituras)
    .where(contrato ? eq(frotaLeituras.contrato, contrato) : undefined)
    .orderBy(desc(frotaLeituras.id))
    .limit(Math.min(500, limite));
}

/** A última leitura ok de cada contrato × tipo (o "atualizado em" das telas). */
export async function ultimasLeituras() {
  return getDb().all<{ contrato: string; tipo: string; em: string }>(
    sql`SELECT "contrato", "tipo", MAX("em") AS "em" FROM "frota_leituras" WHERE "estado" = 'ok' AND "em" >= datetime('now', '-120 days') GROUP BY "contrato", "tipo"`,
  );
}

// ─── AS TELAS ───────────────────────────────────────────────────────────────────────────────────────────────────

/** O ESCOPO da frota da pessoa (por requisição): a unidade do cabeçalho — ou as que ela acessa — e os órgãos delas. */
export const escopoDaFrota = cache(async (): Promise<EscopoEmpenhos> => {
  const { id } = await unidadeDoModulo("frotas");
  if (id === null) return null;
  if (id === false) return { unidades: [], orgaos: [] };
  const ids = typeof id === "number" ? [id] : [...id];
  if (!ids.length) return { unidades: [], orgaos: [] };
  const l = await getDb()
    .select({ id: reparticoes.id, orgaoId: reparticoes.orgaoId })
    .from(reparticoes)
    .where(inArray(reparticoes.id, ids.slice(0, 90)));
  return { unidades: l.map((r) => r.id), orgaos: [...new Set(l.map((r) => r.orgaoId).filter((o): o is number => o != null))] };
});

const memoPacote = criarMemoVersao({ max: 12, ttlMs: 2 * 60 * 60_000, agora: () => Date.now() });
const memoAnos = criarMemoVersao({ max: 24, ttlMs: 2 * 60 * 60_000, agora: () => Date.now() });

/** O pacote do ano no escopo (`tipo` = só um tipo), na memória enquanto a versão da frota for a mesma. */
export async function pacoteFrota(ano: number, escopo: EscopoEmpenhos, tipo?: TipoTransacao): Promise<{ texto: string; total: number; versao: string }> {
  const db = getDb();
  const versao = await consultaVersaoFrota(db);
  const r = await memoPacote.obter(`${ano}:${tipo ?? "todos"}:${chaveEscopoEmpenhos(escopo)}`, versao, () => consultaPacoteFrota(db, ano, escopo, { tipo }));
  return { ...r, versao };
}

export async function anosFrota(escopo: EscopoEmpenhos) {
  const db = getDb();
  const versao = await consultaVersaoFrota(db);
  return memoAnos.obter(chaveEscopoEmpenhos(escopo), versao, () => consultaAnosFrota(db, escopo));
}

/** UMA transação inteira (o banner de detalhe) — só no escopo; fora dele, `null`. */
export async function transacaoCompleta(id: number, escopo: EscopoEmpenhos) {
  if (escopoVazio(escopo)) return null;
  const [t] = await getDb()
    .select()
    .from(frotaTransacoes)
    .where(and(eq(frotaTransacoes.id, id), escopo === null ? undefined : doEscopo(escopo, '"frota_transacoes".')));
  return t ?? null;
}

/** Os VEÍCULOS do escopo: os lotados numa unidade dele ou com alguma transação nele (o escopo todo = todos). */
export async function veiculosDoEscopo(escopo: EscopoEmpenhos) {
  if (escopoVazio(escopo)) return [];
  const db = getDb();
  const noEscopo =
    escopo === null
      ? undefined
      : sql`(${frotaVeiculos.reparticaoId} IN (SELECT value FROM json_each(${JSON.stringify(escopo.unidades)})) OR EXISTS (SELECT 1 FROM "frota_transacoes" t WHERE t."placa" = ${frotaVeiculos.placa} AND ${doEscopo(escopo, "t.")}))`;
  return db.select().from(frotaVeiculos).where(noEscopo).orderBy(asc(frotaVeiculos.placa));
}

export const listarClassificacoesFrota = () => getDb().select().from(frotaClassificacoes).orderBy(asc(frotaClassificacoes.ordem), asc(frotaClassificacoes.nome));

/** O que as PÁGINAS da frota levam do servidor: os anos, a versão, os contratos (nomes), os limites dos alertas e a
 * última leitura da Vólus. */
export async function dadosDaPaginaFrota() {
  const escopo = await escopoDaFrota();
  const db = getDb();
  const [anos, versao, contratos, cfg, ultimas, cursores] = await Promise.all([anosFrota(escopo), consultaVersaoFrota(db), listarContratos(), getConfigFrota(), ultimasLeituras(), listarCursores()]);
  const atualizadoEm = ultimas.reduce<string | null>((m, u) => (!m || u.em > m ? u.em : m), null);
  const agoraIso = new Date().toISOString();
  return {
    escopo,
    anos: anos.map((a) => a.ano),
    versao,
    contratos: contratos.map((c) => ({ codigo: c.codigo, sigla: c.sigla, nome: c.nome })),
    /** Os contratos ATIVOS com o produto (o "Importar agora" das KPIs, só o ADM). */
    ativos: contratos.filter((c) => c.ativo).map((c) => ({ codigo: c.codigo, produto: c.produto as ProdutoContrato })),
    alertas: cfg.alertas,
    cores: cfg.cores,
    atualizadoEm,
    /** O canto das KPIs (o MESMO da Execução): a última leitura ok (UTC do banco → ISO) e quantos cursores lendo agora. */
    meta: {
      tipo: "frotas" as const,
      atualizado: atualizadoEm ? `${atualizadoEm.replace(" ", "T")}Z` : null,
      lendo: cursoresLendo(cursores, agoraIso).length,
    },
  };
}
