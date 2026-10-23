import type { centiLotePassos } from "@/db/schema";
import type { Ator } from "./auditoria-core";
import { registrarAuditoria } from "./auditoria";
import { baixarSeguro } from "./busca-segura";
import { registrarLeitura } from "./centi-apis";
import { acoesDasLinhas, linhaVinculada, paresDasLinhas } from "./centi-unidades-core";
import { comandoRegistrarAcoes, comandoRegistrarUnidades, consultaMapaVinculo, contagemUnidadesDoLote } from "./centi-unidades-sql";
import { type ApiCenti, urlDaApi } from "./centi-apis-core";
import { getDb } from "./db";
import { listarPassos, paraPasso } from "./empenhos";
import {
  anoInteiro,
  conferirLote,
  continuarPeriodo,
  corpoDaPagina,
  diasDoPeriodo,
  dividirPeriodo,
  lacunasDoAno,
  type LoteCenti,
  lerPaginaEmpenhos,
  motivoValoresSuspeitos,
  type PassoLote,
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
  comandosFecharLote,
  comandosGuardarFora,
  comandosGuardarPagina,
  comandosPromover,
  contagemDaPromocao,
  jaNoLote,
  lidoNoPeriodo,
  ultimoPromovido,
  valoresSuspeitos,
} from "./empenhos-sql";

/**
 * A IMPORTAÇÃO dos empenhos no SERVIDOR — UMA página e a CONCLUSÃO conferida —, a MESMA na importação manual (a tela
 * conduz pela rota) e na atualização AUTOMÁTICA (o cron conduz). Quem chama confere o acesso e a trava do lote.
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
export async function lerPaginaDoLote(api: ApiCenti, lote: LoteCenti, periodo: Periodo, pagina: number): Promise<ResultadoPagina> {
  const db = getDb();
  const doAno = anoInteiro(lote.ano);
  if (periodo.inicio > periodo.fim || periodo.inicio < doAno.inicio || periodo.fim > doAno.fim) throw new PedidoInvalido("Período fora do ano da importação.");
  if (!usaPeriodo(api.parametros) && (periodo.inicio !== doAno.inicio || periodo.fim !== doAno.fim)) {
    throw new PedidoInvalido("Os parâmetros desta API não usam {inicio} e {fim} — o ano só pode ser lido inteiro.");
  }
  let enviado: string;
  try {
    enviado = JSON.stringify(corpoDaPagina(api.parametros, lote.ano, pagina, periodo));
  } catch (e) {
    throw new PedidoInvalido(e instanceof Error ? e.message : "Parâmetros inválidos.");
  }
  const base = { inicio: periodo.inicio, fim: periodo.fim, pagina, corpo: enviado };
  const t0 = Date.now();
  let texto = "";
  let status: number | null = null;
  let falha: string | null = null;
  let lida: ReturnType<typeof lerPaginaEmpenhos> | null = null;
  try {
    const r = await baixarSeguro(urlDaApi(api), { accept: "application/json", maxBytes: diasDoPeriodo(periodo) > 1 ? MAX_BYTES : MAX_BYTES_DIA, quem: "A API da Centi", tempoMs: TEMPO_MS, post: enviado });
    texto = r.texto;
    status = r.status;
    lida = lerPaginaEmpenhos(texto, lote.ano);
  } catch (e) {
    falha = e instanceof Error ? e.message : "Não foi possível ler a página.";
  }
  const ms = Date.now() - t0;
  const bytes = texto.length || null;

  if (falha || !lida) {
    // O ERRO também é um passo — com o detalhe (status, tempo, o corpo enviado), à vista na hora.
    const mensagem = falha ?? "Resposta inválida da Centi.";
    const tipo = tipoDoErro(mensagem);
    const metades = tipo === "grande" && usaPeriodo(api.parametros) ? dividirPeriodo(periodo) : null;
    const passo: Omit<PassoLote, "id" | "em"> = {
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
  const total = totalDoPeriodo(lida, pagina) ?? lido.total;
  const continuar = continuarPeriodo({ recebidos: lido.recebidos + lida.recebidos, paginas: lido.paginas + 1, total }, { recebidos: lida.recebidos, novos });
  const passo: Omit<PassoLote, "id" | "em"> = {
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
  // SÓ O VINCULADO ENTRA NO BANCO: o registro de unidade/ação sem vínculo no cadastro (Órgãos e Unidades) não é guardado
  // — dele fica só a CHAVE até o fim da importação, para a conferência com a Centi. Na leitura só das unidades, nenhum.
  const mapa = lote.modo === "unidades" ? null : await consultaMapaVinculo(db);
  const guardar = mapa ? lida.linhas.filter((l) => linhaVinculada(mapa, l)) : [];
  const soContar = mapa ? lida.linhas.filter((l) => !linhaVinculada(mapa, l)) : lida.linhas;
  // As UNIDADES e as AÇÕES da página entram no catálogo (o ADM as vincula ao cadastro) — também na leitura só das unidades.
  const pares = paresDasLinhas(lida.linhas);
  const acoes = acoesDasLinhas(lida.linhas);
  const res = await db.batch([
    comandoRegistrarPasso(db, lote.id, passo).returning(),
    ...comandosGuardarPagina(db, lote.id, pagina, guardar),
    ...comandosGuardarFora(db, lote.id, soContar.map((l) => l.chave)),
    ...(pares.length ? [comandoRegistrarUnidades(db, lote.id, lote.ano, pares)] : []),
    ...(acoes.length ? [comandoRegistrarAcoes(db, lote.id, lote.ano, acoes)] : []),
    comandoRecontarLote(db, lote.id),
  ] as never);
  return { passo: paraPasso((res as Linha[][])[0][0]), continuar };
}

/** Fecha o lote sem promover (cancelado pela pessoa ou falhou) — a falha conta como a última leitura da API. */
export async function fecharLoteEmpenhos(api: ApiCenti, lote: LoteCenti, estado: "cancelado" | "falhou", motivo: string): Promise<void> {
  const db = getDb();
  await db.batch(comandosFecharLote(db, lote.id, estado, motivo) as never);
  if (estado === "falhou") await registrarLeitura(api.id, "falhou", lote.unicos + lote.recusados, lote.totalInformado);
}

export type Conclusao = { estado: "promovido" | "parcial" | "unidades"; motivo?: string } | { estado: "queda"; queda: string };

/**
 * CONCLUI o lote: a CONFERÊNCIA decide — todo o ano lido (nenhum período faltando), a contagem batendo com a Centi e os
 * valores no esperado — e só então PROMOVE; senão fecha como parcial (nada é gravado). A QUEDA em relação à última
 * importação concluída do ano só passa com `aceitarQueda` (o lote segue aberto para a pessoa confirmar).
 * `usuario` null = a atualização automática.
 */
export async function concluirLoteEmpenhos(api: ApiCenti, lote: LoteCenti, opcoes: { aceitarQueda: boolean; usuario: Ator }): Promise<Conclusao> {
  const db = getDb();
  const quem = opcoes.usuario ? "" : " (atualização automática)";
  const parcial = async (motivo: string, resumo: string): Promise<Conclusao> => {
    await db.batch(comandosFecharLote(db, lote.id, "parcial", motivo) as never);
    await registrarLeitura(api.id, "parcial", lote.unicos + lote.recusados, lote.totalInformado);
    await registrarAuditoria({ usuario: opcoes.usuario, acao: "importar", entidade: "centi_api", entidadeId: api.id, resumo: `${api.nome} ${lote.ano}${quem}: importação PARCIAL — ${resumo}` });
    return { estado: "parcial", motivo };
  };
  const lacunas = lacunasDoAno(lote.ano, periodosLidos(await listarPassos(lote.id)));
  if (lote.modo === "unidades") {
    // Só PUXAR as unidades: nada é gravado nos empenhos — o lote fecha com o que foi visto.
    const u = await contagemUnidadesDoLote(db, lote.id);
    const msg = `${u.total} unidade(s) da Centi lida(s) em ${lote.ano}, ${u.semVinculo} sem vínculo${lacunas.length ? ` — ${lacunas.length} período(s) não lido(s)` : ""}. Nenhum empenho foi gravado.`;
    await db.batch(comandosFecharLote(db, lote.id, "unidades", msg) as never);
    await registrarAuditoria({ usuario: opcoes.usuario, acao: "importar", entidade: "centi_api", entidadeId: api.id, resumo: `${api.nome} ${lote.ano}${quem}: unidades puxadas — ${msg}` });
    return { estado: "unidades", motivo: msg };
  }
  const conf = lacunas.length
    ? { completo: false as const, motivo: `Períodos não lidos: ${lacunas.slice(0, 6).map(rotuloPeriodo).join(", ")}${lacunas.length > 6 ? ` e mais ${lacunas.length - 6}` : ""}.` }
    : conferirLote(lote);
  if (!conf.completo) return parcial(conf.motivo, `${conf.motivo} (nada foi gravado)`);
  // Os VALORES: negativo ou acima do limite = a leitura está errada — não promove.
  const suspeitos = motivoValoresSuspeitos(await valoresSuspeitos(db, lote.id));
  if (suspeitos) return parcial(suspeitos, suspeitos);
  const queda = quedaSuspeita(await ultimoPromovido(db, api.chave, lote.ano, lote.id), lote);
  if (queda && !opcoes.aceitarQueda) return { estado: "queda", queda };
  const contagem = await contagemDaPromocao(db, lote.id, lote.ano, lote.leitor);
  await db.batch(comandosPromover(db, lote.id, lote.ano, lote.leitor, contagem) as never);
  await registrarLeitura(api.id, "completo", lote.unicos + lote.recusados, lote.totalInformado);
  await registrarAuditoria({
    usuario: opcoes.usuario,
    acao: "importar",
    entidade: "centi_api",
    entidadeId: api.id,
    resumo: `${api.nome} ${lote.ano}${quem}: ${lote.unicos} conferidos com a Centi (Σ empenhado ${(lote.soma ?? 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}) — ${contagem.inseridos} novos, ${contagem.atualizados} atualizados, ${lote.unicos - contagem.fora - contagem.inseridos - contagem.atualizados} sem mudança, ${contagem.removidos} marcados como removidos, ${contagem.fora} sem vínculo no cadastro (não gravados)${queda ? ` — queda confirmada: ${queda}` : ""}`,
  });
  return { estado: "promovido" };
}
