import type { centiLotePassos } from "@/db/schema";
import type { Ator } from "./auditoria-core";
import { registrarAuditoria } from "./auditoria";
import { baixarSeguro } from "./busca-segura";
import { type CardEmpenho, catalogoDasLinhas, mapaDosVinculos, urlDoCard, vinculoDaLinha } from "./empenho-cards-core";
import { corpoLiquidacoes, lerPaginaLiquidacoes, orgaoDaPagina } from "./liquidacoes-core";
import {
  comandoRealinharLiquidacoes,
  comandosConferirLiquidacoes,
  comandosGuardarLiquidacoes,
  comandosPromoverLiquidacoes,
  contagemLiquidacoes,
  liquidacoesSuspeitas,
  totalAntesDaPagina,
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
 * Até 1 MB por resposta (a semana média tem ~0,7 MB; o que passa disso é dividido ao meio — ler e consertar mais pesa no
 * limite de CPU do Worker) e, no período de UM dia (que não se divide), até 12 MB. 30 s por pedido.
 */
const MAX_BYTES = 1_000_000;
const MAX_BYTES_DIA = 12_000_000;
const TEMPO_MS = 30_000;

/** O pedido não vale (período fora do ano, parâmetros inválidos) — a rota responde com o status. */
export class PedidoInvalido extends Error {
  constructor(
    mensagem: string,
    readonly status = 422,
  ) {
    super(mensagem);
  }
}

export type ResultadoPagina = { passo: PassoLote; continuar?: boolean; erro?: { tipo: TipoErro; mensagem: string }; dividir?: [Periodo, Periodo] | null };

/** O status HTTP citado na mensagem do erro ("… respondeu 503."). */
const statusDaMensagem = (m: string) => Number(m.match(/respondeu (\d{3})/)?.[1]) || null;

/** Lê UMA página do período com o cadastro SALVO, guarda no staging e registra o PASSO (o erro também é um passo). */
export async function lerPaginaDoLote(card: CardEmpenho, lote: LoteCenti, periodo: Periodo, pagina: number): Promise<ResultadoPagina> {
  const db = getDb();
  const doAno = anoInteiro(lote.ano);
  if (periodo.inicio > periodo.fim || periodo.inicio < doAno.inicio || periodo.fim > doAno.fim) throw new PedidoInvalido("Período fora do ano da importação.");
  if (!usaPeriodo(card.parametros) && (periodo.inicio !== doAno.inicio || periodo.fim !== doAno.fim)) {
    throw new PedidoInvalido("Os parâmetros desta API não usam {inicio} e {fim} — o ano só pode ser lido inteiro.");
  }
  const liq = lote.modo === "liquidacoes";
  if (liq !== (card.tipo === "liquidacoes")) throw new PedidoInvalido(liq ? "Liquidações só se importam num card de liquidações." : "O card de liquidações só importa liquidações.");
  // LIQUIDAÇÕES: a "página" N do período é o N-ésimo órgão da Centi do lote (a API não pagina e exige o órgão).
  const idOrgao = liq ? orgaoDaPagina(lote.orgaosCenti, pagina) : null;
  if (liq && idOrgao == null) throw new PedidoInvalido("Página fora dos órgãos da Centi desta importação — cancele e importe de novo.");
  let enviado: string;
  try {
    enviado = JSON.stringify(liq ? corpoLiquidacoes(card.parametros, lote.ano, periodo, idOrgao ?? 0) : corpoDaPagina(card.parametros, lote.ano, pagina, periodo));
  } catch (e) {
    throw new PedidoInvalido(e instanceof Error ? e.message : "Parâmetros inválidos.");
  }
  const base = { inicio: periodo.inicio, fim: periodo.fim, pagina, corpo: enviado };
  const t0 = Date.now();
  let texto = "";
  let status: number | null = null;
  let falha: string | null = null;
  let lida: ReturnType<typeof lerPaginaEmpenhos> | ReturnType<typeof lerPaginaLiquidacoes> | null = null;
  try {
    const url = urlDoCard(card);
    const r = await baixarSeguro(url, { accept: "application/json", maxBytes: diasDoPeriodo(periodo) > 1 ? MAX_BYTES : MAX_BYTES_DIA, quem: "A API da Centi", tempoMs: TEMPO_MS, post: enviado });
    texto = r.texto;
    status = r.status;
    lida = liq ? lerPaginaLiquidacoes(texto, lote.ano) : lerPaginaEmpenhos(texto, lote.ano);
  } catch (e) {
    falha = e instanceof Error ? e.message : "Não foi possível ler a página.";
  }
  const ms = Date.now() - t0;
  const bytes = texto.length || null;

  if (falha || !lida) {
    // O ERRO também é um passo — com o detalhe (status, tempo, o corpo enviado), à vista na hora.
    const mensagem = falha ?? "Resposta inválida da Centi.";
    const tipo = tipoDoErro(mensagem);
    const metades = tipo === "grande" && usaPeriodo(card.parametros) ? dividirPeriodo(periodo) : null;
    const passo: PassoNovo = {
      ...base,
      estado: metades ? "dividido" : "erro",
      fimPeriodo: false,
      status: status ?? statusDaMensagem(mensagem),
      bytes,
      ms,
      recebidos: 0,
      novos: 0,
      recusados: 0,
      repetidos: 0,
      total: null,
      soma: null,
      mensagem: metades ? `${mensagem} — ${rotuloPeriodo(periodo)} será lido em duas partes: ${rotuloPeriodo(metades[0])} e ${rotuloPeriodo(metades[1])}.` : mensagem,
    };
    const res = await db.batch([comandoRegistrarPasso(db, lote.id, passo).returning(), ...(metades ? [comandoDividirPeriodo(db, lote.id, periodo), comandoRecontarLote(db, lote.id)] : [])] as never);
    return { passo: paraPasso((res as Linha[][])[0][0]), erro: { tipo, mensagem }, dividir: metades };
  }

  const lido = await lidoNoPeriodo(db, lote.id, periodo);
  const novos = lida.linhas.length - (await jaNoLote(db, lote.id, lida.linhas.map((l) => l.chave)));
  // LIQUIDAÇÕES: o período termina no último órgão; o total do período é ACUMULADO (o dos órgãos anteriores + o deste) —
  // o maior total do período (a régua da conferência do lote) é o de todos os órgãos.
  const total = liq ? (await totalAntesDaPagina(db, lote.id, periodo, pagina)) + (lida.total ?? 0) : (totalDoPeriodo(lida, pagina) ?? lido.total);
  const continuar = liq
    ? pagina < (lote.orgaosCenti?.length ?? 0)
    : continuarPeriodo({ recebidos: lido.recebidos + lida.recebidos, paginas: lido.paginas + 1, total }, { recebidos: lida.recebidos, novos });
  const passo: PassoNovo = {
    ...base,
    estado: "ok",
    fimPeriodo: !continuar,
    status,
    bytes,
    ms,
    recebidos: lida.recebidos,
    novos,
    recusados: lida.recusados,
    repetidos: lida.repetidos,
    total,
    soma: lida.soma,
    mensagem: lida.reparado ? "A Centi mandou textos com aspas sem escape (ex.: num histórico) — a leitura consertou; nada se perdeu." : null,
  };
  if ("orgaos" in lida) {
    // LIQUIDAÇÕES: a página é de UM órgão da Centi; o destino de cada uma é o do EMPENHO de mesmo número.
    const res = await db.batch([
      comandoRegistrarPasso(db, lote.id, passo),
      ...comandosGuardarLiquidacoes(db, lote.id, pagina, idOrgao ?? 0, lida.linhas),
      // A CONFERÊNCIA EM TEMPO REAL: o resultado da página no passo; as iguais à gravada saem do staging.
      ...comandosConferirLiquidacoes(db, lote.id, card.id, lote.leitor, lida.linhas.map((l) => l.chave)),
      comandoRecontarLote(db, lote.id),
      consultaUltimoPasso(db, lote.id),
    ] as never);
    return { passo: paraPasso((res as Linha[][]).at(-1)?.[0] as Linha), continuar };
  }
  // SÓ O VINCULADO ENTRA NO BANCO: o registro que nenhum vínculo do card cobre não é guardado — dele fica só a CHAVE até
  // o fim da importação, para a conferência com a Centi. Na leitura só do catálogo, nenhum.
  const mapa = lote.modo === "unidades" ? null : mapaDosVinculos(await consultaVinculosCard(db, card.id));
  const guardar = mapa ? lida.linhas.filter((l) => vinculoDaLinha(mapa, l)) : [];
  const soContar = mapa ? lida.linhas.filter((l) => !vinculoDaLinha(mapa, l)) : lida.linhas;
  // Os órgãos gestores, as unidades orçamentárias e as ações da página entram no CATÁLOGO (a base das escolhas dos vínculos).
  const catalogo = catalogoDasLinhas(lida.linhas);
  const res = await db.batch([
    comandoRegistrarPasso(db, lote.id, passo),
    ...comandosGuardarPagina(db, lote.id, pagina, guardar),
    ...comandosGuardarFora(db, lote.id, soContar.map((l) => l.chave)),
    ...(catalogo.length ? [comandoRegistrarCatalogo(db, lote.id, lote.ano, catalogo)] : []),
    // A CONFERÊNCIA EM TEMPO REAL (não no catálogo): o resultado da página no passo; os iguais ao gravado saem do staging.
    ...(mapa ? comandosConferirPagina(db, lote.id, card.id, lote.leitor, guardar.map((l) => l.chave), soContar.length) : []),
    comandoRecontarLote(db, lote.id),
    consultaUltimoPasso(db, lote.id),
  ] as never);
  return { passo: paraPasso((res as Linha[][]).at(-1)?.[0] as Linha), continuar };
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
  const queda = quedaSuspeita(await ultimoPromovido(db, card.id, lote.ano, lote.id), lote, { soma: card.quedaSoma, registros: card.quedaRegistros });
  if (queda && !opcoes.aceitarQueda) return { estado: "queda", queda };
  const contagem = await contagemDaPromocao(db, lote.id, card.id, lote.ano, lote.leitor);
  // As LIQUIDAÇÕES seguem o empenho de mesmo número: as dos empenhos que chegaram (ou mudaram de unidade) realinham juntas.
  await db.batch([...comandosPromover(db, lote.id, card.id, lote.ano, lote.leitor, card.removidos, contagem), comandoRealinharLiquidacoes(db)] as never);
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
