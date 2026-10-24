import { and, eq } from "drizzle-orm";
import { centiLotePassos } from "@/db/schema";
import type { Ator } from "./auditoria-core";
import { registrarAuditoria } from "./auditoria";
import { type LinhaDoModo, linhasDaParte, type ModoParte, partesDaPagina, type ResumoPagina, resumoValido, somaDaLinha } from "./importacao-partes-core";
import { baixarSeguro } from "./busca-segura";
import { type CardEmpenho, catalogoDasLinhas, mapaDosVinculos, urlDoCard, vinculoDaLinha } from "./empenho-cards-core";
import { corpoLiquidacoes, lerPaginaLiquidacoes, orgaoDaPagina } from "./liquidacoes-core";
import { corpoPagamentos, lerPaginaPagamentos, mesDoPeriodo } from "./pagamentos-core";
import {
  comandoRealinharPagamentos,
  comandosConferirPagamentos,
  comandosGuardarPagamentos,
  comandosPromoverPagamentos,
  contagemPagamentos,
  pagamentosSuspeitos,
  ultimoPagamentoPromovido,
} from "./pagamentos-sql";
import {
  comandoRealinharLiquidacoes,
  comandosFechoPeriodoLiquidacoes,
  comandosConferirLiquidacoes,
  comandosGuardarLiquidacoes,
  comandosPromoverLiquidacoes,
  contagemLiquidacoes,
  liquidacoesSuspeitas,
  ultimaLiquidacaoPromovida,
} from "./liquidacoes-sql";
import { registrarLeituraCard } from "./empenho-cards";
import { comandoRegistrarCatalogo, consultaVinculosCard } from "./empenho-cards-sql";
import { getDb } from "./db";
import { listarPassos, paraPasso } from "./empenhos";
import {
  anoInteiro,
  conferirLote,
  continuarPeriodo,
  corpoDaPagina,
  diasDoPeriodo,
  dividirPeriodo,
  hojeIso,
  lacunasDoAno,
  type LoteCenti,
  lerPaginaEmpenhos,
  lotePorOrgao,
  motivoValoresSuspeitos,
  type PassoLote,
  type PassoNovo,
  type Periodo,
  periodosLidos,
  quedaSuspeita,
  rotuloPeriodo,
  type TipoErro,
  tipoDoErro,
  totalDoPeriodo,
  usaPeriodo,
} from "./empenhos-core";
import {
  comandoDividirPeriodo,
  comandoRecontarLote,
  comandoRegistrarPasso,
  comandosConferirPagina,
  comandosFecharLote,
  comandosGuardarFora,
  comandosGuardarPagina,
  comandosPromover,
  consultaUltimoPasso,
  contagemDaPromocao,
  jaNoLote,
  lidoNoPeriodo,
  ultimoPromovido,
  valoresSuspeitos,
} from "./empenhos-sql";

/**
 * A IMPORTAÇÃO de um CARD de empenhos no SERVIDOR — UMA página e a CONCLUSÃO conferida —, a MESMA na importação manual
 * (a tela conduz pela rota) e na atualização AUTOMÁTICA (o cron conduz). Quem chama confere o acesso e a trava do lote.
 */

type Linha = typeof centiLotePassos.$inferSelect;

/**
 * Até 1 MB por resposta (a semana média tem ~0,7 MB; o que passa disso é dividido ao meio) e, no período de UM dia ou no mês
 * dos pagamentos (que não se dividem), até 12 MB. Ler e consertar o JSON custa ~20 ms de CPU por MB (medido) e o plano
 * gratuito dá ~10 ms por requisição — por isso nenhuma requisição lê a resposta inteira: na importação pela TELA o JSON é
 * lido no NAVEGADOR e chega em PARTES de tamanho fixo (`importacao-partes-core.ts`); na AUTOMÁTICA, a resposta grande é
 * capturada e processada em fragmentos, uma janela por execução do cron (`empenhos-fragmentos.ts`).
 */
const MAX_BYTES = 1_000_000;
/** Pela TELA o servidor só repassa os bytes (o navegador lê o JSON): a semana cabe inteira em até 4 MB — menos divisões e
 * menos pedidos. A automática segue com 1 MB (a resposta grande é baixada de novo a cada fragmento capturado). */
const MAX_BYTES_TELA = 4_000_000;
const MAX_BYTES_DIA = 12_000_000;
export const TEMPO_MS = 30_000;

/** O pedido não vale (período fora do ano, parâmetros inválidos) — a rota responde com o status. */
export class PedidoInvalido extends Error {
  constructor(
    mensagem: string,
    readonly status = 422,
  ) {
    super(mensagem);
  }
}

export type ResultadoPagina = {
  passo: PassoLote;
  continuar?: boolean;
  erro?: { tipo: TipoErro; mensagem: string };
  dividir?: [Periodo, Periodo] | null;
  /** A parte foi guardada e a página ainda não terminou (mande a próxima com o `passo.id`). */
  parcial?: boolean;
};

/** O status HTTP citado na mensagem do erro ("… respondeu 503."). */
const statusDaMensagem = (m: string) => Number(m.match(/respondeu (\d{3})/)?.[1]) || null;

/** A marca do passo de uma página que ainda recebe as partes (se a leitura parar no meio, o passo fica como erro). */
const guardando = (parte: number) => `Guardando a página — ${parte} parte(s) recebida(s); se parar aqui, a página é lida de novo.`;

export type Pedido = {
  modo: ModoParte;
  pag: boolean;
  porOrgao: boolean;
  idOrgao: number | null;
  base: Pick<PassoNovo, "inicio" | "fim" | "pagina" | "corpo">;
  maxBytes: number;
};

/** Confere o pedido de UMA página com o cadastro SALVO (o corpo enviado à Centi é sempre o do servidor). */
export function prepararPedido(card: CardEmpenho, lote: LoteCenti, periodo: Periodo, pagina: number, tela = false): Pedido {
  // O MODO segue o tipo do card: liquidações e pagamentos só no card do mesmo tipo; os empenhos (e o catálogo) no de empenhos.
  const tipoDoModo = lote.modo === "liquidacoes" || lote.modo === "pagamentos" ? lote.modo : "empenhos";
  if (tipoDoModo !== card.tipo) throw new PedidoInvalido(`Este card (${card.tipo}) não importa ${lote.modo === "dados" || lote.modo === "unidades" ? "empenhos" : lote.modo}.`);
  const porOrgao = lotePorOrgao(lote);
  const pag = lote.modo === "pagamentos";
  const doAno = anoInteiro(lote.ano);
  if (periodo.inicio > periodo.fim || periodo.inicio < doAno.inicio || periodo.fim > doAno.fim) throw new PedidoInvalido("Período fora do ano da importação.");
  // PAGAMENTOS: a Centi só recorta por MÊS — o período tem de ser um mês inteiro (os parâmetros não precisam do {inicio}/{fim}).
  if (pag && mesDoPeriodo(periodo) == null) throw new PedidoInvalido("Os pagamentos só se leem por mês inteiro.");
  if (!pag && !usaPeriodo(card.parametros) && (periodo.inicio !== doAno.inicio || periodo.fim !== doAno.fim)) {
    throw new PedidoInvalido("Os parâmetros desta API não usam {inicio} e {fim} — o ano só pode ser lido inteiro.");
  }
  // LIQUIDAÇÕES e PAGAMENTOS: a "página" N do período é o N-ésimo órgão da Centi do lote (a API não pagina e exige o órgão).
  const idOrgao = porOrgao ? orgaoDaPagina(lote.orgaosCenti, pagina) : null;
  if (porOrgao && idOrgao == null) throw new PedidoInvalido("Página fora dos órgãos da Centi desta importação — cancele e importe de novo.");
  let enviado: string;
  try {
    enviado = JSON.stringify(
      pag
        ? corpoPagamentos(card.parametros, lote.ano, periodo, idOrgao ?? 0)
        : porOrgao
          ? corpoLiquidacoes(card.parametros, lote.ano, periodo, idOrgao ?? 0)
          : corpoDaPagina(card.parametros, lote.ano, pagina, periodo),
    );
  } catch (e) {
    throw new PedidoInvalido(e instanceof Error ? e.message : "Parâmetros inválidos.");
  }
  // O mês dos pagamentos não se divide: vale o teto do período que não se divide.
  const maxBytes = pag || diasDoPeriodo(periodo) <= 1 ? MAX_BYTES_DIA : tela ? MAX_BYTES_TELA : MAX_BYTES;
  return { modo: tipoDoModo, pag, porOrgao, idOrgao, base: { inicio: periodo.inicio, fim: periodo.fim, pagina, corpo: enviado }, maxBytes };
}

/** O ERRO também é um passo — com o detalhe (status, tempo, o corpo enviado), à vista na hora; o grande demais divide. */
export async function registrarFalha(
  card: CardEmpenho,
  lote: LoteCenti,
  periodo: Periodo,
  ped: Pedido,
  f: { mensagem: string; status: number | null; bytes: number | null; ms: number | null },
  extras: unknown[] = [],
): Promise<ResultadoPagina> {
  const db = getDb();
  const tipo = tipoDoErro(f.mensagem);
  const metades = tipo === "grande" && !ped.pag && usaPeriodo(card.parametros) ? dividirPeriodo(periodo) : null;
  const passo: PassoNovo = {
    ...ped.base,
    estado: metades ? "dividido" : "erro",
    fimPeriodo: false,
    status: f.status ?? statusDaMensagem(f.mensagem),
    bytes: f.bytes,
    ms: f.ms,
    recebidos: 0,
    novos: 0,
    recusados: 0,
    repetidos: 0,
    total: null,
    soma: null,
    mensagem: metades ? `${f.mensagem} — ${rotuloPeriodo(periodo)} será lido em duas partes: ${rotuloPeriodo(metades[0])} e ${rotuloPeriodo(metades[1])}.` : f.mensagem,
  };
  const res = await db.batch([comandoRegistrarPasso(db, lote.id, passo).returning(), ...(metades ? [comandoDividirPeriodo(db, lote.id, periodo), comandoRecontarLote(db, lote.id)] : []), ...extras] as never);
  return { passo: paraPasso((res as Linha[][])[0][0]), erro: { tipo, mensagem: f.mensagem }, dividir: metades };
}

/**
 * BAIXA a resposta da Centi para UMA página (a importação pela TELA): o corpo volta como veio, em pedaços — o servidor não
 * lê nem decodifica (quase nenhum trabalho de CPU); o navegador lê o JSON. A falha (rede, status, grande demais) já é
 * registrada como passo aqui.
 */
export async function baixarPaginaDoLote(
  card: CardEmpenho,
  lote: LoteCenti,
  periodo: Periodo,
  pagina: number,
): Promise<{ ok: true; pedacos: Uint8Array[]; status: number; ms: number } | { ok: false; r: ResultadoPagina }> {
  const ped = prepararPedido(card, lote, periodo, pagina, true);
  const t0 = Date.now();
  try {
    const r = await baixarSeguro(urlDoCard(card), { accept: "application/json", maxBytes: ped.maxBytes, quem: "A API da Centi", tempoMs: TEMPO_MS, post: ped.base.corpo ?? "", pedacos: true });
    return { ok: true, pedacos: r.pedacos ?? [], status: r.status, ms: Date.now() - t0 };
  } catch (e) {
    const mensagem = e instanceof Error ? e.message : "Não foi possível ler a página.";
    return { ok: false, r: await registrarFalha(card, lote, periodo, ped, { mensagem, status: null, bytes: null, ms: Date.now() - t0 }) };
  }
}

/** A leitura da página no NAVEGADOR falhou (a resposta não é a lista): registra o passo de erro (o grande demais divide). */
export async function falhaDaPagina(card: CardEmpenho, lote: LoteCenti, periodo: Periodo, pagina: number, f: { mensagem: string; status: number | null; bytes: number | null; ms: number | null }): Promise<ResultadoPagina> {
  return registrarFalha(card, lote, periodo, prepararPedido(card, lote, periodo, pagina), f);
}

/** `parte` = quantas partes já vieram antes desta (0 = a 1ª); `ultima` traz o `resumo`. */
export type ParteLida = { parte: number; ultima: boolean; passo: number | null; linhas: object[]; resumo: ResumoPagina | null };

/**
 * GUARDA UMA PARTE da página (as linhas já lidas — conferidas antes): cada parte = um lote de comandos de tamanho FIXO,
 * qualquer que seja o tamanho do mês. A 1ª parte cria o passo; as seguintes acumulam nele (as linhas, a soma, os novos e o
 * resultado da conferência em tempo real); a ÚLTIMA traz o resumo da leitura, fecha o passo como lido e reconta o lote.
 */
export async function gravarParte(card: CardEmpenho, lote: LoteCenti, periodo: Periodo, ped: Pedido, p: ParteLida, extras: unknown[] = []): Promise<ResultadoPagina> {
  const db = getDb();
  const pagina = ped.base.pagina;
  const ultima = p.ultima;
  if (p.parte < 0 || ultima !== (p.resumo != null) || (p.parte === 0) !== (p.passo == null)) throw new PedidoInvalido("Parte fora de ordem — leia a página de novo.");
  let antes: Linha | null = null;
  if (p.passo != null) {
    const [a] = await db
      .select()
      .from(centiLotePassos)
      .where(and(eq(centiLotePassos.id, p.passo), eq(centiLotePassos.loteId, lote.id), eq(centiLotePassos.inicio, periodo.inicio), eq(centiLotePassos.fim, periodo.fim), eq(centiLotePassos.pagina, pagina), eq(centiLotePassos.estado, "erro")));
    if (!a || a.mensagem !== guardando(p.parte)) throw new PedidoInvalido("A página recomeçou em outro pedido — leia de novo.", 409);
    antes = a;
  }
  const chaves = p.linhas.map((l) => (l as { chave: string }).chave);
  const novos = (antes?.novos ?? 0) + p.linhas.length - (await jaNoLote(db, lote.id, chaves));
  const linhasPagina = (antes?.recebidos ?? 0) + p.linhas.length;
  const soma = (antes?.soma ?? 0) + p.linhas.reduce((t: number, l) => t + somaDaLinha(ped.modo, l), 0);
  const alvo = p.passo ?? undefined;

  // Os comandos da parte (guardar + a conferência em tempo real) — os mesmos de sempre, no passo da página.
  const daParte: unknown[] = [];
  if (ped.modo === "pagamentos") {
    daParte.push(
      ...comandosGuardarPagamentos(db, lote.id, pagina, ped.idOrgao ?? 0, p.linhas as LinhaDoModo<"pagamentos">[]),
      ...comandosConferirPagamentos(db, lote.id, card.id, lote.leitor, chaves, alvo),
    );
  } else if (ped.modo === "liquidacoes") {
    daParte.push(
      ...comandosGuardarLiquidacoes(db, lote.id, pagina, ped.idOrgao ?? 0, p.linhas as LinhaDoModo<"liquidacoes">[]),
      ...comandosConferirLiquidacoes(db, lote.id, card.id, lote.leitor, chaves, alvo),
    );
  } else {
    // SÓ O VINCULADO ENTRA NO BANCO: o registro que nenhum vínculo do card cobre não é guardado — dele fica só a CHAVE até
    // o fim da importação, para a conferência com a Centi. Na leitura só do catálogo, nenhum.
    const linhas = p.linhas as LinhaDoModo<"empenhos">[];
    const mapa = lote.modo === "unidades" ? null : mapaDosVinculos(await consultaVinculosCard(db, card.id));
    const guardar = mapa ? linhas.filter((l) => vinculoDaLinha(mapa, l)) : [];
    const soContar = mapa ? linhas.filter((l) => !vinculoDaLinha(mapa, l)) : linhas;
    // Os órgãos gestores, as unidades orçamentárias e as ações entram no CATÁLOGO (a base das escolhas dos vínculos).
    const catalogo = catalogoDasLinhas(linhas);
    daParte.push(
      ...comandosGuardarPagina(db, lote.id, pagina, guardar),
      ...comandosGuardarFora(db, lote.id, soContar.map((l) => l.chave)),
      ...(catalogo.length ? [comandoRegistrarCatalogo(db, lote.id, lote.ano, catalogo)] : []),
      ...(mapa ? comandosConferirPagina(db, lote.id, card.id, lote.leitor, guardar.map((l) => l.chave), soContar.length, alvo) : []),
    );
  }

  if (!ultima) {
    const meio = { recebidos: linhasPagina, novos, soma, mensagem: guardando(p.parte + 1) };
    const passo: PassoNovo = { ...ped.base, estado: "erro", fimPeriodo: false, status: null, bytes: null, ms: null, recusados: 0, repetidos: 0, total: null, ...meio };
    const res = await db.batch([
      ...(p.passo == null ? [comandoRegistrarPasso(db, lote.id, passo)] : [db.update(centiLotePassos).set(meio).where(eq(centiLotePassos.id, p.passo))]),
      ...daParte,
      ...extras,
      consultaUltimoPasso(db, lote.id, alvo),
    ] as never);
    return { passo: paraPasso((res as Linha[][]).at(-1)?.[0] as Linha), parcial: true };
  }

  const r = p.resumo as ResumoPagina;
  if (!resumoValido(r, linhasPagina)) throw new PedidoInvalido("O resumo da página não confere com as linhas recebidas — leia de novo.");
  // LIQUIDAÇÕES e PAGAMENTOS: o total é o DESTE órgão = os distintos + os recusados (contado aqui); o do período = a soma dos
  // órgãos (`comandoRecontarLote`), e o fim do período é decidido no banco quando todos chegaram (`comandosFechoPeriodoLiquidacoes`).
  const lido = ped.porOrgao ? null : await lidoNoPeriodo(db, lote.id, periodo);
  const total = ped.porOrgao ? linhasPagina + r.recusados : (totalDoPeriodo({ total: r.total, recebidos: r.recebidos }, pagina) ?? lido?.total ?? null);
  const continuar = ped.porOrgao
    ? pagina < (lote.orgaosCenti?.length ?? 0)
    : continuarPeriodo({ recebidos: (lido?.recebidos ?? 0) + r.recebidos, paginas: (lido?.paginas ?? 0) + 1, total }, { recebidos: r.recebidos, novos });
  const final = {
    estado: "ok" as const,
    fimPeriodo: !ped.porOrgao && !continuar,
    status: r.status,
    bytes: r.bytes,
    ms: r.ms,
    recebidos: r.recebidos,
    novos,
    recusados: r.recusados,
    repetidos: r.repetidos,
    total,
    soma,
    mensagem: r.reparado ? "A Centi mandou textos com aspas sem escape (ex.: num histórico) — a leitura consertou; nada se perdeu." : null,
  };
  const fecho = ped.porOrgao ? comandosFechoPeriodoLiquidacoes(db, lote.id, periodo, lote.orgaosCenti?.length ?? 0, alvo) : [];
  const res = await db.batch([
    ...(p.passo == null ? [comandoRegistrarPasso(db, lote.id, { ...ped.base, ...final })] : []),
    ...daParte,
    ...(p.passo == null ? [] : [db.update(centiLotePassos).set({ ...final, fimPeriodo: final.fimPeriodo ? 1 : 0 }).where(eq(centiLotePassos.id, p.passo))]),
    ...fecho,
    comandoRecontarLote(db, lote.id),
    ...extras,
    consultaUltimoPasso(db, lote.id, alvo),
  ] as never);
  return { passo: paraPasso((res as Linha[][]).at(-1)?.[0] as Linha), continuar };
}

/** Uma PARTE mandada pelo navegador: confere cada linha (`linhasDaParte`) e guarda. */
export async function guardarParteDoLote(
  card: CardEmpenho,
  lote: LoteCenti,
  periodo: Periodo,
  pagina: number,
  p: { parte: number; partes: number; passo: number | null; tuplas: unknown[]; resumo: ResumoPagina | null },
): Promise<ResultadoPagina> {
  const ped = prepararPedido(card, lote, periodo, pagina);
  const v = linhasDaParte(ped.modo, lote.ano, p.tuplas);
  if (!v.ok) throw new PedidoInvalido(`Parte recusada: ${v.motivo}`);
  if (p.parte < 0 || p.parte >= p.partes) throw new PedidoInvalido("Parte fora de ordem — leia a página de novo.");
  return gravarParte(card, lote, periodo, ped, { parte: p.parte, ultima: p.parte === p.partes - 1, passo: p.passo, linhas: v.linhas, resumo: p.resumo });
}

/**
 * Lê e guarda uma página PEQUENA já baixada (o texto inteiro) NO SERVIDOR — a atualização automática, quando a resposta
 * cabe numa janela (`JANELA`); a maior é fragmentada (`empenhos-fragmentos.ts`). Guarda pelas MESMAS partes da tela.
 */
export async function gravarTextoInteiro(card: CardEmpenho, lote: LoteCenti, periodo: Periodo, ped: Pedido, texto: string, status: number | null, ms: number): Promise<ResultadoPagina> {
  let lida: ReturnType<typeof lerPaginaEmpenhos> | ReturnType<typeof lerPaginaLiquidacoes> | ReturnType<typeof lerPaginaPagamentos>;
  try {
    lida = lerPaginaDoModo(ped, texto, lote.ano);
  } catch (e) {
    const mensagem = e instanceof Error ? e.message : "Não foi possível ler a página.";
    return registrarFalha(card, lote, periodo, ped, { mensagem, status, bytes: texto.length || null, ms });
  }
  const resumo: ResumoPagina = { status, bytes: texto.length || null, ms, recebidos: lida.recebidos, recusados: lida.recusados, repetidos: lida.repetidos, total: lida.total, reparado: lida.reparado };
  const partes = partesDaPagina(ped.modo, lida.linhas);
  let passo: number | null = null;
  let res: ResultadoPagina | null = null;
  let feitas = 0;
  for (let i = 0; i < partes.length; i++) {
    const linhas = lida.linhas.slice(feitas, feitas + partes[i].length);
    feitas += linhas.length;
    res = await gravarParte(card, lote, periodo, ped, { parte: i, ultima: i === partes.length - 1, passo, linhas, resumo: i === partes.length - 1 ? resumo : null });
    passo = res.passo.id;
  }
  return res as ResultadoPagina;
}

/** A leitura do JSON pelo modo do pedido (as MESMAS funções da tela). */
export function lerPaginaDoModo(ped: Pick<Pedido, "pag" | "porOrgao">, texto: string, ano: number) {
  return ped.pag ? lerPaginaPagamentos(texto, ano) : ped.porOrgao ? lerPaginaLiquidacoes(texto, ano) : lerPaginaEmpenhos(texto, ano);
}

/** Fecha o lote sem promover (cancelado pela pessoa ou falhou) — a falha conta como a última leitura do card. */
export async function fecharLoteEmpenhos(card: CardEmpenho, lote: LoteCenti, estado: "cancelado" | "falhou", motivo: string): Promise<void> {
  const db = getDb();
  await db.batch(comandosFecharLote(db, lote.id, estado, motivo) as never);
  if (estado === "falhou") await registrarLeituraCard(card.id, "falhou", lote.unicos + lote.recusados, lote.totalInformado);
}

export type Conclusao = { estado: "promovido" | "parcial" | "unidades"; motivo?: string } | { estado: "queda"; queda: string };

/** Fecha o lote como PARCIAL (nada é gravado nos empenhos) — a mesma na conclusão manual e na automática. */
export async function fecharParcial(card: CardEmpenho, lote: LoteCenti, motivo: string, resumo: string, usuario: Ator): Promise<Conclusao> {
  const db = getDb();
  const quem = usuario ? "" : " (atualização automática)";
  await db.batch(comandosFecharLote(db, lote.id, "parcial", motivo) as never);
  await registrarLeituraCard(card.id, "parcial", lote.unicos + lote.recusados, lote.totalInformado);
  await registrarAuditoria({ usuario, acao: "importar", entidade: "empenho_card", entidadeId: card.id, resumo: `${card.nome} ${lote.ano}${quem}: importação PARCIAL — ${resumo}` });
  return { estado: "parcial", motivo };
}

/**
 * CONCLUI o lote: a CONFERÊNCIA decide — todo o ano lido (nenhum período faltando), a contagem batendo com a Centi e os
 * valores no esperado — e só então PROMOVE; senão fecha como parcial (nada é gravado). A QUEDA (pelas regras do card) em
 * relação à última importação concluída do ano só passa com `aceitarQueda` (o lote segue aberto para a pessoa confirmar).
 * `usuario` null = a atualização automática.
 */
export async function concluirLoteEmpenhos(card: CardEmpenho, lote: LoteCenti, opcoes: { aceitarQueda: boolean; usuario: Ator }): Promise<Conclusao> {
  const db = getDb();
  const quem = opcoes.usuario ? "" : " (atualização automática)";
  const parcial = (motivo: string, resumo: string) => fecharParcial(card, lote, motivo, resumo, opcoes.usuario);
  // O "hoje" é o do INÍCIO do lote: atravessar a meia-noite não cria uma lacuna nova na conclusão.
  const lacunas = lacunasDoAno(lote.ano, periodosLidos(await listarPassos(lote.id)), hojeIso(new Date(`${lote.iniciadoEm.replace(" ", "T")}Z`)));
  if (lote.modo === "unidades") {
    // Só PUXAR o catálogo: nada é gravado nos empenhos — o lote fecha com o que foi visto.
    const msg = `Catálogo da Centi atualizado com ${lote.ano}${lacunas.length ? ` — ${lacunas.length} período(s) não lido(s)` : ""}. Nenhum empenho foi gravado.`;
    await db.batch(comandosFecharLote(db, lote.id, "unidades", msg) as never);
    await registrarAuditoria({ usuario: opcoes.usuario, acao: "importar", entidade: "empenho_card", entidadeId: card.id, resumo: `${card.nome} ${lote.ano}${quem}: unidades puxadas — ${msg}` });
    return { estado: "unidades", motivo: msg };
  }
  const conf = lacunas.length
    ? { completo: false as const, motivo: `Períodos não lidos: ${lacunas.slice(0, 6).map(rotuloPeriodo).join(", ")}${lacunas.length > 6 ? ` e mais ${lacunas.length - 6}` : ""}.` }
    : conferirLote(lote);
  if (!conf.completo) return parcial(conf.motivo, `${conf.motivo} (nada foi gravado)`);
  // Os VALORES: negativo ou acima do limite = a leitura está errada — não promove.
  const suspeitos = motivoValoresSuspeitos(await valoresSuspeitos(db, lote.id));
  if (suspeitos) return parcial(suspeitos, suspeitos);
  if (lote.modo === "liquidacoes") return concluirLiquidacoes(card, lote, opcoes);
  if (lote.modo === "pagamentos") return concluirPagamentos(card, lote, opcoes);
  const queda = quedaSuspeita(await ultimoPromovido(db, card.id, lote.ano, lote.id), lote, { soma: card.quedaSoma, registros: card.quedaRegistros });
  if (queda && !opcoes.aceitarQueda) return { estado: "queda", queda };
  const contagem = await contagemDaPromocao(db, lote.id, card.id, lote.ano, lote.leitor);
  // As LIQUIDAÇÕES e os PAGAMENTOS seguem o empenho de mesmo número: as dos empenhos que chegaram (ou mudaram de unidade) realinham juntas.
  await db.batch([...comandosPromover(db, lote.id, card.id, lote.ano, lote.leitor, card.removidos, contagem), comandoRealinharLiquidacoes(db), comandoRealinharPagamentos(db)] as never);
  await registrarLeituraCard(card.id, "completo", lote.unicos + lote.recusados, lote.totalInformado);
  await registrarAuditoria({
    usuario: opcoes.usuario,
    acao: "importar",
    entidade: "empenho_card",
    entidadeId: card.id,
    resumo: `${card.nome} ${lote.ano}${quem}: ${lote.unicos} conferidos com a Centi (Σ empenhado ${(lote.soma ?? 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}) — ${contagem.inseridos} novos, ${contagem.atualizados} atualizados, ${lote.unicos - contagem.fora - contagem.inseridos - contagem.atualizados} sem mudança, ${contagem.removidos} ${card.removidos === "apagar" ? "apagados" : "marcados como removidos"} (não vieram mais), ${contagem.fora} sem vínculo no card (não gravados)${queda ? ` — queda confirmada: ${queda}` : ""}`,
  });
  return { estado: "promovido" };
}

/** A promoção das LIQUIDAÇÕES (o lote já conferido: o ano todo lido, todos os órgãos). Os valores e a QUEDA pelas mesmas
 * regras do card. */
async function concluirLiquidacoes(card: CardEmpenho, lote: LoteCenti, opcoes: { aceitarQueda: boolean; usuario: Ator }): Promise<Conclusao> {
  const db = getDb();
  const quem = opcoes.usuario ? "" : " (atualização automática)";
  const orgaos = lote.orgaosCenti ?? [];
  const n = await liquidacoesSuspeitas(db, lote.id);
  if (n) {
    const m = `${n} liquidação(ões) com valor negativo ou acima do limite — a leitura parece errada; nada foi gravado.`;
    return fecharParcial(card, lote, m, m, opcoes.usuario);
  }
  const queda = quedaSuspeita(await ultimaLiquidacaoPromovida(db, card.id, lote.ano, lote.id), lote, { soma: card.quedaSoma, registros: card.quedaRegistros });
  if (queda && !opcoes.aceitarQueda) return { estado: "queda", queda: queda.replace("a soma empenhada", "a soma liquidada").replace("os empenhos caíram", "as liquidações caíram") };
  const contagem = await contagemLiquidacoes(db, lote.id, card.id, lote.ano, orgaos, lote.leitor);
  await db.batch(comandosPromoverLiquidacoes(db, lote.id, card.id, lote.ano, orgaos, lote.leitor, card.removidos, contagem) as never);
  await registrarLeituraCard(card.id, "completo", lote.unicos + lote.recusados, lote.totalInformado);
  await registrarAuditoria({
    usuario: opcoes.usuario,
    acao: "importar",
    entidade: "empenho_card",
    entidadeId: card.id,
    resumo: `${card.nome} ${lote.ano}${quem}: liquidações de ${orgaos.length} órgão(s) da Centi — ${lote.unicos} lidas (Σ ${(lote.soma ?? 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}): ${contagem.inseridos} novas, ${contagem.atualizados} atualizadas, ${contagem.removidos} ${card.removidos === "apagar" ? "apagadas" : "marcadas como removidas"}, ${contagem.fora} sem empenho nem órgão no cadastro (não gravadas)${queda ? ` — queda confirmada: ${queda}` : ""}`,
  });
  return { estado: "promovido" };
}

/** A promoção dos PAGAMENTOS (o lote já conferido: o ano todo lido, mês a mês, todos os órgãos). Os valores e a QUEDA pelas
 * mesmas regras do card (a soma = o pago líquido das ordens não anuladas). */
async function concluirPagamentos(card: CardEmpenho, lote: LoteCenti, opcoes: { aceitarQueda: boolean; usuario: Ator }): Promise<Conclusao> {
  const db = getDb();
  const quem = opcoes.usuario ? "" : " (atualização automática)";
  const orgaos = lote.orgaosCenti ?? [];
  const n = await pagamentosSuspeitos(db, lote.id);
  if (n) {
    const m = `${n} pagamento(s) com valor negativo ou acima do limite — a leitura parece errada; nada foi gravado.`;
    return fecharParcial(card, lote, m, m, opcoes.usuario);
  }
  const queda = quedaSuspeita(await ultimoPagamentoPromovido(db, card.id, lote.ano, lote.id), lote, { soma: card.quedaSoma, registros: card.quedaRegistros });
  if (queda && !opcoes.aceitarQueda) return { estado: "queda", queda: queda.replace("a soma empenhada", "a soma paga").replace("os empenhos caíram", "os pagamentos caíram") };
  const contagem = await contagemPagamentos(db, lote.id, card.id, lote.ano, orgaos, lote.leitor);
  await db.batch(comandosPromoverPagamentos(db, lote.id, card.id, lote.ano, orgaos, lote.leitor, card.removidos, contagem) as never);
  await registrarLeituraCard(card.id, "completo", lote.unicos + lote.recusados, lote.totalInformado);
  await registrarAuditoria({
    usuario: opcoes.usuario,
    acao: "importar",
    entidade: "empenho_card",
    entidadeId: card.id,
    resumo: `${card.nome} ${lote.ano}${quem}: pagamentos de ${orgaos.length} órgão(s) da Centi — ${lote.unicos} lidos (Σ pago líquido ${(lote.soma ?? 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}): ${contagem.inseridos} novos, ${contagem.atualizados} atualizados, ${contagem.removidos} ${card.removidos === "apagar" ? "apagados" : "marcados como removidos"}, ${contagem.fora} sem empenho nem órgão no cadastro (não gravados)${queda ? ` — queda confirmada: ${queda}` : ""}`,
  });
  return { estado: "promovido" };
}
