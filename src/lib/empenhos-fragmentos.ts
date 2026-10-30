import { and, desc, eq, gt, lt, sql } from "drizzle-orm";
import { centiBrutos, centiLeituras, centiLotePassos } from "@/db/schema";
import { baixarSeguro } from "./busca-segura";
import { getDb } from "./db";
import { type CardEmpenho, urlDoCard } from "./empenho-cards-core";
import {
  gravarParte,
  gravarTextoInteiro,
  lerPaginaDoModo,
  type Pedido,
  PedidoInvalido,
  prepararPedido,
  registrarFalha,
  type ResultadoPagina,
  TEMPO_MS,
} from "./empenhos-importacao";
import { type AndamentoLote, fracaoDoAno, type LoteCenti, type PassoLote, type Periodo, podePular } from "./empenhos-core";
import { comandoPaginaIgual, comandoRecontarLote, consultaBytesDoAno, consultaPaginaAnterior, consultaUltimoPasso, type LinhaPasso } from "./empenhos-sql";
import { comandosFechoPeriodoLiquidacoes } from "./liquidacoes-sql";
import { paraPasso } from "./empenhos";
import {
  BYTES_CAPTURA,
  capturaDaTentativa,
  corteUtf8,
  type FormaResposta,
  hexDe,
  JANELA,
  janelaDaTentativa,
  janelaDosPedacos,
  MAX_REINICIOS,
  MAX_TENTATIVAS_LEITURA,
  processarJanela,
  semRepetidos,
  TAM_CAUDA,
} from "./fragmentos-centi-core";
import type { ResumoPagina } from "./importacao-partes-core";

/**
 * A LEITURA FRAGMENTADA da atualização AUTOMÁTICA (o cron, sem navegador) — cada execução faz UMA coisa pequena e para,
 * bem abaixo do limite de CPU do plano gratuito do Worker, qualquer que seja o tamanho da resposta da Centi:
 *  1. a resposta pequena (até `JANELA` bytes) é lida e guardada de uma vez;
 *  2. a grande é CAPTURADA em fragmentos de texto, ~1 MB por execução (a Centi é chamada de novo e só a faixa seguinte é
 *     convertida — a CAUDA confere que a resposta é a mesma; se a Centi a mudou no meio, a captura recomeça);
 *  3. capturada, é PROCESSADA uma janela de `JANELA` caracteres por execução, pelas MESMAS funções e a MESMA gravação em
 *     partes da importação pela tela (`gravarParte`). O fim da última janela fecha o passo e apaga os fragmentos.
 * A leitura em andamento mora em `centi_leituras` (+ `centi_brutos`); quem chama (`empenhos-auto.ts`) a continua antes de
 * pedir a página seguinte.
 */

type Leitura = typeof centiLeituras.$inferSelect;

/** A leitura em andamento do lote (a automática continua ela antes de pedir outra página) — só as colunas LEVES: o texto
 * que ficou da janela (`resto`) e as chaves já vistas (`vistas`) vêm só na reserva, quem processa. */
export async function leituraDoLote(loteId: number) {
  const [l] = await getDb()
    .select({
      id: centiLeituras.id,
      inicio: centiLeituras.inicio,
      fim: centiLeituras.fim,
      pagina: centiLeituras.pagina,
      bytesCapturados: centiLeituras.bytesCapturados,
      charsCapturados: centiLeituras.charsCapturados,
      comprimento: centiLeituras.comprimento,
      capturado: centiLeituras.capturado,
      pos: centiLeituras.pos,
      passoId: centiLeituras.passoId,
      progressoEm: centiLeituras.progressoEm,
    })
    .from(centiLeituras)
    .where(eq(centiLeituras.loteId, loteId))
    .orderBy(centiLeituras.id)
    .limit(1);
  return l ?? null;
}

/**
 * O ANDAMENTO de um lote que está lendo (a tela do card e o painel do canto — a MESMA conta): o ano lido pelos dias, a
 * resposta grande em fragmentos e os bytes (os lidos × os da última importação promovida do ano).
 */
export async function andamentoDoLote(lote: LoteCenti & { cardId: number | null }, passos: PassoLote[]): Promise<AndamentoLote> {
  const [l, esperados] = await Promise.all([leituraDoLote(lote.id), lote.cardId ? consultaBytesDoAno(getDb(), lote.cardId, lote.ano, lote.modo) : Promise.resolve(null)]);
  return {
    fracao: fracaoDoAno(lote.ano, passos),
    leitura: l ? { inicio: l.inicio, fim: l.fim, bytes: l.bytesCapturados, comprimento: l.comprimento, capturado: !!l.capturado, pos: l.pos, chars: l.charsCapturados } : null,
    bytes: { lidos: passos.reduce((s, p) => s + (p.estado === "ok" ? (p.bytes ?? 0) : 0), 0), esperados },
  };
}

/** Reserva a leitura por 45 s — menos que a trava do lote (50 s), então a execução que pega o lote acha a leitura livre (duas execuções nunca avançam a mesma) e CONTA a tentativa ANTES do trabalho (a execução
 * cortada pelo limite de CPU não grava nada — a tentativa contada é o rastro dela; todo avanço zera); null = outra
 * execução está nela. */
async function reservar(id: number): Promise<Leitura | null> {
  const [l] = await getDb()
    .update(centiLeituras)
    .set({ reservadoAte: sql`datetime('now', '+45 seconds')`, tentativas: sql`${centiLeituras.tentativas} + 1` })
    .where(and(eq(centiLeituras.id, id), sql`(${centiLeituras.reservadoAte} IS NULL OR ${centiLeituras.reservadoAte} < datetime('now'))`))
    .returning();
  return l ?? null;
}

const apagar = (id: number) => getDb().delete(centiLeituras).where(eq(centiLeituras.id, id));
/** DESCARTA a leitura: apaga e, se ela já gravava partes, o passo "Guardando a página…" vira um ERRO com o motivo real
 * (nunca fica girando para sempre no painel — e conta para a espera e a desistência). */
export function descartarLeitura(l: { id: number; passoId: number | null }, motivo: string) {
  const db = getDb();
  return [
    apagar(l.id),
    ...(l.passoId ? [db.update(centiLotePassos).set({ estado: "erro", mensagem: `Leitura interrompida: ${motivo}`.slice(0, 400) }).where(eq(centiLotePassos.id, l.passoId))] : []),
  ];
}
const periodoDe = (l: Leitura): Periodo => ({ inicio: l.inicio, fim: l.fim });

/** Baixa a faixa [de, ate) da resposta da página (o que vem antes é lido sem converter). */
function baixarFaixa(card: CardEmpenho, ped: Pedido, de: number, ate: number, assinar = false) {
  return baixarSeguro(urlDoCard(card), { accept: "application/json", maxBytes: ped.maxBytes, quem: "A API da Centi", tempoMs: TEMPO_MS, post: ped.base.corpo ?? "", faixa: { de, ate, assinar } });
}

/** O PROCESSAMENTO interrompido pelo limite do servidor (passageiro — não é "grande demais"). */
export const MSG_CPU = "Processamento interrompido pelo limite do servidor";

/** `pulou` = a página era IDÊNTICA à da última volta: nada foi lido nem gravado (uma tarefa LEVE — a execução segue);
 * `ocupada` = outra execução está na leitura (esta não trabalhou — a fila segue para o próximo card). */
export type Avanco = { resultado?: ResultadoPagina; situacao: string; pulou?: boolean; ocupada?: boolean; adiada?: boolean };

/** O SHA-256 (hex) dos bytes exatos da resposta — nativo (`crypto.subtle`), sem custo de JS. */
export async function assinaturaDosBytes(bytes: Uint8Array): Promise<string> {
  const h = new Uint8Array(await crypto.subtle.digest("SHA-256", bytes as Uint8Array<ArrayBuffer>));
  return Array.from(h, (b) => b.toString(16).padStart(2, "0")).join("");
}

/**
 * A PÁGINA IDÊNTICA à da última volta promovida (`podePular`): o passo é COPIADO num batch — nada é decodificado, lido como
 * JSON, conferido nem gravado. null = não pode pular (lê como sempre).
 */
async function pularSeIgual(card: CardEmpenho, lote: LoteCenti, periodo: Periodo, ped: Pedido, assinatura: string): Promise<ResultadoPagina | null> {
  const db = getDb();
  const anterior = await consultaPaginaAnterior(db, ped.modo, { ...lote, cardId: card.id }, periodo, ped.base.pagina);
  if (!anterior || !podePular(anterior, assinatura, ped.modo)) return null;
  const res = await db.batch([
    comandoPaginaIgual(db, lote.id, anterior.passo, ped.base.corpo ?? null, ped.porOrgao),
    ...(ped.porOrgao ? comandosFechoPeriodoLiquidacoes(db, lote.id, periodo, lote.orgaosCenti?.length ?? 0) : []),
    comandoRecontarLote(db, lote.id),
    consultaUltimoPasso(db, lote.id),
  ] as never);
  const passo = paraPasso((res as LinhaPasso[][]).at(-1)?.[0] as LinhaPasso);
  return { passo, continuar: ped.porOrgao ? ped.base.pagina < (lote.orgaosCenti?.length ?? 0) : !passo.fimPeriodo };
}

/**
 * COMEÇA a página na automática: a resposta pequena é lida e guardada já; a grande abre a leitura fragmentada com o 1º
 * fragmento capturado.
 */
export async function iniciarPaginaAuto(
  card: CardEmpenho,
  lote: LoteCenti,
  periodo: Periodo,
  pagina: number,
  /** Só PULA: a página que mudou não é processada nesta execução (o orçamento de consultas não cobre) — fica para a próxima. */
  soPular = false,
): Promise<Avanco> {
  const db = getDb();
  const ped = prepararPedido(card, lote, periodo, pagina);
  const t0 = Date.now();
  let r: Awaited<ReturnType<typeof baixarFaixa>>;
  try {
    // A resposta é lida até o FIM pelo SHA-256 nativo (só o 1º fragmento é guardado): a página IDÊNTICA à da última volta
    // é pulada já aqui, qualquer que seja o tamanho — nada é capturado, processado nem gravado.
    r = await baixarFaixa(card, ped, 0, BYTES_CAPTURA, true);
  } catch (e) {
    const mensagem = e instanceof Error ? e.message : "Não foi possível ler a página.";
    return { resultado: await registrarFalha(card, lote, periodo, ped, { mensagem, status: null, bytes: null, ms: Date.now() - t0 }), situacao: "erro" };
  }
  const ms = Date.now() - t0;
  const bytes = r.bytes ?? new Uint8Array();
  // `inteira` = a resposta coube no 1º fragmento (o `terminou` da faixa assinada só diz que ela foi lida até o fim).
  const inteira = r.terminou === true && (r.lidos ?? 0) <= BYTES_CAPTURA;
  // Sem `crypto.DigestStream` (fora do Worker), a assinatura sai dos bytes quando a resposta coube inteira.
  const assinatura = r.assinatura ?? (inteira ? await assinaturaDosBytes(bytes) : null);
  if (assinatura) {
    const igual = await pularSeIgual(card, lote, periodo, ped, assinatura);
    if (igual) return { resultado: igual, situacao: "sem mudança", pulou: true };
  }
  if (soPular) return { situacao: "página com mudança — lida na próxima execução", adiada: true };
  if (inteira && bytes.length <= JANELA) {
    const texto = new TextDecoder().decode(bytes);
    return { resultado: await gravarTextoInteiro(card, lote, periodo, ped, texto, r.status, ms, assinatura), situacao: "página lida" };
  }
  const corte = inteira ? bytes.length : corteUtf8(bytes, bytes.length);
  const texto = new TextDecoder().decode(bytes.subarray(0, corte));
  // A leitura e o 1º fragmento num lote ATÔMICO (a execução que cai no meio não deixa leitura sem o começo).
  await db.batch([
    db.insert(centiLeituras).values({
      loteId: lote.id,
      inicio: periodo.inicio,
      fim: periodo.fim,
      pagina,
      bytesCapturados: corte,
      charsCapturados: texto.length,
      cauda: hexDe(bytes.subarray(Math.max(0, corte - TAM_CAUDA), corte)),
      capturado: inteira ? 1 : 0,
      comprimento: r.comprimento ?? null,
      status: r.status,
      ms,
      assinatura,
      progressoEm: sql`CURRENT_TIMESTAMP`,
    }),
    db.insert(centiBrutos).select(
      db
        .select({
          leituraId: sql<number>`${centiLeituras.id}`.as("leitura_id"),
          ordem: sql<number>`0`.as("ordem"),
          ini: sql<number>`0`.as("ini"),
          chars: sql<number>`${texto.length}`.as("chars"),
          texto: sql<string>`${texto}`.as("texto"),
        })
        .from(centiLeituras)
        .where(eq(centiLeituras.loteId, lote.id))
        .orderBy(desc(centiLeituras.id))
        .limit(1) as never,
    ),
  ] as never);
  return { situacao: `resposta grande: capturando (${Math.round(corte / 1000)} KB)` };
}

/** CONTINUA a leitura fragmentada: captura o próximo fragmento ou processa a próxima janela. */
export async function avancarLeitura(card: CardEmpenho, lote: LoteCenti, aberta: { id: number }): Promise<Avanco> {
  const l = await reservar(aberta.id);
  if (!l) return { situacao: "leitura em andamento em outra execução", ocupada: true };
  // Execuções seguidas sem avançar (cortadas pelo limite de processamento, a Centi ou o banco falhando): a leitura é
  // descartada com o ERRO no passo — a espera e a desistência de sempre decidem o resto (nunca um laço eterno).
  // A resposta "grande demais" para o limite de processamento DIVIDE o período (a de um dia encerra o lote com o motivo).
  if (l.tentativas > MAX_TENTATIVAS_LEITURA) {
    // As primeiras vezes são PASSAGEIRAS (o mesmo trecho pode passar na próxima — a janela recomeça menor): a leitura é
    // descartada e o pedido volta à espera de sempre. Só a TERCEIRA vez no mesmo pedido trata a resposta como grande demais
    // (divide o período — a de um dia ou o mês dos pagamentos encerra o lote com o motivo).
    const [{ n }] = await getDb()
      .select({ n: sql<number>`COUNT(*)` })
      .from(centiLotePassos)
      .where(and(eq(centiLotePassos.loteId, lote.id), eq(centiLotePassos.inicio, l.inicio), eq(centiLotePassos.fim, l.fim), eq(centiLotePassos.pagina, l.pagina), sql`${centiLotePassos.mensagem} LIKE ${`${MSG_CPU}%`}`));
    const motivo = Number(n) >= 2 ? `Página grande demais para processar no servidor: ${MAX_TENTATIVAS_LEITURA} execuções seguidas sem avançar, ${Number(n) + 1}ª vez.` : `${MSG_CPU}: ${MAX_TENTATIVAS_LEITURA} execuções seguidas sem avançar — a leitura recomeça mais tarde.`;
    const ped = prepararPedido(card, lote, periodoDe(l), l.pagina);
    const resultado = await registrarFalha(card, lote, periodoDe(l), ped, { mensagem: motivo, status: l.status, bytes: l.bytesCapturados, ms: l.ms }, descartarLeitura(l, motivo));
    return { resultado, situacao: "leitura descartada (sem avançar)" };
  }
  let ped: Pedido;
  try {
    ped = prepararPedido(card, lote, periodoDe(l), l.pagina);
  } catch (e) {
    // O cadastro mudou (parâmetros, órgãos): a leitura não vale mais — quem chama encerra o lote.
    await getDb().batch(descartarLeitura(l, e instanceof Error ? e.message : "o cadastro mudou") as never);
    throw e;
  }
  try {
    return l.capturado ? await processar(card, lote, l, ped) : await capturar(card, lote, l, ped);
  } catch (e) {
    // A página mudou por outro caminho (passo excluído, a tela leu de novo): a leitura recomeça do zero na próxima vez.
    if (e instanceof PedidoInvalido) {
      await getDb().batch(descartarLeitura(l, e.message) as never);
      return { situacao: `leitura recomeça: ${e.message}` };
    }
    // Qualquer outra falha SOLTA a reserva (a próxima execução pode tentar — quem chama conta o erro e desiste depois).
    await getDb().update(centiLeituras).set({ reservadoAte: null }).where(eq(centiLeituras.id, l.id)).catch(() => {});
    throw e;
  }
}

async function capturar(card: CardEmpenho, lote: LoteCenti, l: Leitura, ped: Pedido): Promise<Avanco> {
  const db = getDb();
  const de = Math.max(0, l.bytesCapturados - TAM_CAUDA);
  const t0 = Date.now();
  let r: Awaited<ReturnType<typeof baixarFaixa>>;
  try {
    r = await baixarFaixa(card, ped, de, l.bytesCapturados + capturaDaTentativa(l.tentativas));
  } catch (e) {
    const mensagem = e instanceof Error ? e.message : "Não foi possível ler a página.";
    return { resultado: await registrarFalha(card, lote, periodoDe(l), ped, { mensagem, status: null, bytes: l.bytesCapturados, ms: Date.now() - t0 }, [apagar(l.id)]), situacao: "erro" };
  }
  const bytes = r.bytes ?? new Uint8Array();
  const nCauda = l.bytesCapturados - de;
  // A MESMA resposta? A cauda (os últimos bytes já capturados) e o tamanho informado têm de bater.
  const mesma = hexDe(bytes.subarray(0, nCauda)) === (l.cauda ?? "") && (l.comprimento == null || r.comprimento == null || l.comprimento === r.comprimento);
  if (!mesma) {
    if (l.reinicios + 1 >= MAX_REINICIOS) {
      const mensagem = `A Centi mudou a resposta durante a leitura ${MAX_REINICIOS} vezes — a página será lida de novo mais tarde.`;
      return { resultado: await registrarFalha(card, lote, periodoDe(l), ped, { mensagem, status: r.status, bytes: null, ms: Date.now() - t0 }, [apagar(l.id)]), situacao: "erro" };
    }
    await db.batch([
      db.delete(centiBrutos).where(eq(centiBrutos.leituraId, l.id)),
      db
        .update(centiLeituras)
        .set({ bytesCapturados: 0, charsCapturados: 0, cauda: null, comprimento: null, capturado: 0, reinicios: l.reinicios + 1, reservadoAte: null, tentativas: 0, assinatura: null })
        .where(eq(centiLeituras.id, l.id)),
    ] as never);
    return { situacao: "a Centi mudou a resposta — a captura recomeça" };
  }
  const novo = bytes.subarray(nCauda);
  const corte = r.terminou ? novo.length : corteUtf8(novo, novo.length);
  const texto = new TextDecoder().decode(novo.subarray(0, corte));
  const bytesAgora = l.bytesCapturados + corte;
  const ultimos = bytes.subarray(0, nCauda + corte);
  await db.batch([
    ...(texto.length ? [db.insert(centiBrutos).values({ leituraId: l.id, ordem: l.bytesCapturados, ini: l.charsCapturados, chars: texto.length, texto })] : []),
    db
      .update(centiLeituras)
      .set({
        bytesCapturados: bytesAgora,
        charsCapturados: l.charsCapturados + texto.length,
        cauda: hexDe(ultimos.subarray(Math.max(0, ultimos.length - TAM_CAUDA))),
        comprimento: r.comprimento ?? l.comprimento,
        capturado: r.terminou ? 1 : 0,
        ms: (l.ms ?? 0) + (Date.now() - t0),
        reservadoAte: null,
        tentativas: 0,
        progressoEm: sql`CURRENT_TIMESTAMP`,
      })
      .where(eq(centiLeituras.id, l.id)),
  ] as never);
  return { situacao: r.terminou ? `capturada (${Math.round(bytesAgora / 1000)} KB) — processando em janelas` : `capturando (${Math.round(bytesAgora / 1000)} KB)` };
}

async function processar(card: CardEmpenho, lote: LoteCenti, l: Leitura, ped: Pedido): Promise<Avanco> {
  const db = getDb();
  // A janela ENCOLHE a cada execução que não avançou: o trecho pesado demais para o limite de CPU passa em pedaços menores.
  const janela = janelaDaTentativa(l.tentativas);
  const pedacos = await db
    .select({ ini: centiBrutos.ini, texto: sql<string>`substr(${centiBrutos.texto}, max(1, ${l.pos} - ${centiBrutos.ini} + 1), ${janela})` })
    .from(centiBrutos)
    .where(and(eq(centiBrutos.leituraId, l.id), lt(centiBrutos.ini, l.pos + janela), gt(sql`${centiBrutos.ini} + ${centiBrutos.chars}`, l.pos)));
  const bruto = janelaDosPedacos(l.pos, janela, pedacos);
  const r = processarJanela({ pos: l.pos, tamanho: l.charsCapturados, forma: (l.forma as FormaResposta | null) ?? null, resto: l.resto }, bruto);
  const falhar = async (mensagem: string) => ({
    resultado: await registrarFalha(card, lote, periodoDe(l), ped, { mensagem, status: l.status, bytes: l.bytesCapturados, ms: l.ms }, descartarLeitura(l, mensagem)),
    situacao: "erro",
  });
  if (!r.ok) return falhar(r.erro);
  let lida: ReturnType<typeof lerPaginaDoModo> | null = null;
  let vistas = l.vistas;
  if (r.registros) {
    try {
      lida = lerPaginaDoModo(ped, r.registros, lote.ano);
    } catch (e) {
      return falhar(e instanceof Error ? e.message : "Não foi possível ler a página.");
    }
    // O registro que a Centi repete em DUAS janelas da mesma resposta conta como repetido (como na leitura inteira).
    const s = semRepetidos(l.vistas, lida.linhas as { chave: string }[]);
    vistas = s.vistas;
    if (s.repetidos) lida = { ...lida, linhas: s.linhas as never, repetidos: lida.repetidos + s.repetidos };
  }
  const contas = {
    recebidos: l.recebidos + (lida?.recebidos ?? 0),
    recusados: l.recusados + (lida?.recusados ?? 0),
    repetidos: l.repetidos + (lida?.repetidos ?? 0),
    total: l.total ?? lida?.total ?? null,
    reparado: l.reparado || lida?.reparado ? 1 : 0,
  };
  const estado = { pos: r.estado.pos, forma: r.estado.forma, resto: r.estado.resto, vistas };
  const periodo = periodoDe(l);
  if (r.fim) {
    const resumo: ResumoPagina = { status: l.status, bytes: l.bytesCapturados, ms: l.ms, recebidos: contas.recebidos, recusados: contas.recusados, repetidos: contas.repetidos, total: contas.total, reparado: !!contas.reparado };
    const resultado = await gravarParte(card, lote, periodo, ped, { parte: l.parte, ultima: true, passo: l.passoId, linhas: lida?.linhas ?? [], resumo, assinatura: l.assinatura }, [apagar(l.id)]);
    return { resultado, situacao: "página lida (fragmentada)" };
  }
  if (!lida || !lida.linhas.length) {
    // Nenhum registro terminou nesta janela (ou só recusados/repetidos): só avança — e conta o que veio.
    await db.update(centiLeituras).set({ ...estado, ...contas, reservadoAte: null, tentativas: 0, progressoEm: sql`CURRENT_TIMESTAMP` }).where(eq(centiLeituras.id, l.id));
    return { situacao: `processando (${Math.round((100 * r.estado.pos) / Math.max(1, l.charsCapturados))}%)` };
  }
  const passoNovo = sql<number>`(SELECT MAX(${centiLotePassos.id}) FROM ${centiLotePassos} WHERE ${centiLotePassos.loteId} = ${lote.id})`;
  const avancar = db
    .update(centiLeituras)
    .set({ ...estado, ...contas, parte: l.parte + 1, passoId: l.passoId ?? passoNovo, reservadoAte: null, tentativas: 0, progressoEm: sql`CURRENT_TIMESTAMP` })
    .where(eq(centiLeituras.id, l.id));
  await gravarParte(card, lote, periodo, ped, { parte: l.parte, ultima: false, passo: l.passoId, linhas: lida.linhas, resumo: null }, [avancar]);
  return { situacao: `processando (${Math.round((100 * r.estado.pos) / Math.max(1, l.charsCapturados))}%)` };
}
