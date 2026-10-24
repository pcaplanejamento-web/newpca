import { registrarAuditoria } from "./auditoria";
import { diaUtil, feriadosNoIntervalo } from "./calendario-core";
import { getDb } from "./db";
import { anosDoCard, type CardEmpenho, cardPorOrgao } from "./empenho-cards-core";
import { cardsAtivos, orgaosLiquidacao } from "./empenho-cards";
import { criarLote, getLote, listarPassos, loteEmAndamento, ultimaLeituraPorAno } from "./empenhos";
import {
  hojeIso,
  anoDaVez,
  CONDUTOR_AUTO,
  cardNaHora,
  errosSeguidos,
  LEITOR_EMPENHOS,
  type LoteCenti,
  lotePorMes,
  lotePorOrgao,
  MAX_ERROS_AUTO,
  proximoPedido,
  QUEM_AUTO,
  rotuloPeriodo,
  usaPeriodo,
} from "./empenhos-core";
import { avancarLeitura, iniciarPaginaAuto, leituraDoLote } from "./empenhos-fragmentos";
import { concluirLoteEmpenhos, fecharLoteEmpenhos, fecharParcial, PedidoInvalido, type ResultadoPagina } from "./empenhos-importacao";
import { comandoConduzir, comandoSoltarAuto, comandosFecharLote, comandoTravarAuto } from "./empenhos-sql";
import { listarFeriados } from "./feriados";
import { horaAgoraBrasilia } from "./tarefas-core";

/**
 * A ATUALIZAÇÃO AUTOMÁTICA dos cards de empenhos, liquidações e pagamentos (o cron chama DUAS vezes por minuto): para cada card LIGADO (desligados por
 * padrão), continua o lote que está lendo ou, na hora certa (horário, dias úteis, frequência do card), começa o do ano da
 * vez — UMA tarefa pequena por execução (uma página pequena, um fragmento da resposta grande ou uma janela dela —
 * `empenhos-fragmentos.ts`), dentro do limite de CPU do plano gratuito, com a MESMA conferência da importação manual. Nunca aceita uma
 * QUEDA suspeita sozinha (o lote fecha como parcial — a pessoa confirma numa importação manual) e nunca disputa o lote com
 * uma aba (a trava de quem conduz). Nos cards de LIQUIDAÇÕES, o lote lê todos os órgãos do cadastro com o "ID na Centi".
 */
export async function atualizarEmpenhosAuto(agora = new Date()): Promise<{ card: number; situacao: string }[]> {
  const cards = await cardsAtivos();
  if (!cards.length) return [];
  const hoje = hojeIso(agora);
  const util = cards.some((c) => c.diasUteis) ? diaUtil(hoje, feriadosNoIntervalo(await listarFeriados(), hoje, hoje)) : true;
  const instante = { ms: agora.getTime(), hora: horaAgoraBrasilia(agora), diaUtil: util, ano: Number(hoje.slice(0, 4)) };
  const r: { card: number; situacao: string }[] = [];
  // UMA tarefa pesada por execução (o limite de CPU do plano gratuito vale para a execução inteira): os cards em RODÍZIO
  // por meio minuto (o cron roda DUAS vezes por minuto, uma a cada 30 s) — o 1º que trabalhar encerra a execução; os
  // demais esperam a próxima.
  const inicio = Math.floor(agora.getTime() / 30_000) % cards.length;
  for (const card of [...cards.slice(inicio), ...cards.slice(0, inicio)]) {
    try {
      const u = await umCard(card, instante);
      r.push({ card: card.id, situacao: u.situacao });
      if (u.trabalhou) break;
    } catch (e) {
      console.error(`[cron empenhos] card ${card.id}:`, (e as Error).message);
      r.push({ card: card.id, situacao: `erro: ${(e as Error).message}` });
      break;
    }
  }
  return r;
}

type Feito = { situacao: string; trabalhou: boolean };

async function umCard(card: CardEmpenho, agora: { ms: number; hora: string; diaUtil: boolean; ano: number }): Promise<Feito> {
  const db = getDb();
  let lote = await loteEmAndamento(card.id);
  if (!lote) {
    if (!cardNaHora(card, agora)) return { situacao: "fora da hora", trabalhou: false };
    const anos = anosDoCard(card.anos, agora.ano);
    if (!anos.length) return { situacao: "nenhum ano", trabalhou: false };
    const ano = anoDaVez(anos, await ultimaLeituraPorAno(card.id));
    // LIQUIDAÇÕES e PAGAMENTOS: o lote lê TODOS os órgãos do cadastro com o "ID na Centi" (a API exige o órgão — um por "página").
    const orgaos = cardPorOrgao(card.tipo) ? (await orgaosLiquidacao()).map((o) => o.idOrgao) : null;
    if (orgaos && !orgaos.length) return { situacao: "nenhum órgão com o ID na Centi", trabalhou: false };
    lote = await criarLote(card.id, ano, QUEM_AUTO, CONDUTOR_AUTO, card.tipo === "empenhos" ? "dados" : card.tipo, orgaos);
    await registrarAuditoria({ usuario: null, acao: "importar", entidade: "empenho_card", entidadeId: card.id, resumo: `${card.nome} ${ano}: atualização automática começou${orgaos ? ` (${orgaos.length} órgão(s) da Centi)` : ""}` });
  }
  if (lote.leitor !== LEITOR_EMPENHOS) {
    // Um lote começado por uma versão anterior do leitor nunca é terminado por outra: a automática encerra o dela.
    if (lote.iniciadoPor !== QUEM_AUTO) return { situacao: "importação manual de versão anterior em andamento", trabalhou: false };
    await db.batch(comandosFecharLote(db, lote.id, "cancelado", "Começou com uma versão anterior do leitor.") as never);
    return { situacao: "lote de versão anterior encerrado", trabalhou: true };
  }
  const [conduz] = await comandoConduzir(db, lote.id, CONDUTOR_AUTO);
  if (!conduz) return { situacao: "conduzida por uma aba", trabalhou: false };
  // A outra execução do minuto (o cron roda duas vezes) ainda está neste lote: esta não começa a mesma página.
  const [trava] = await comandoTravarAuto(db, lote.id);
  if (!trava) return { situacao: "outra execução automática está neste lote", trabalhou: false };
  try {
    // A LEITURA FRAGMENTADA em andamento vem primeiro (a resposta grande: captura ou a próxima janela).
    const aberta = await leituraDoLote(lote.id);
    if (aberta) {
      const a = await avancarLeitura(card, lote, aberta);
      return { situacao: (await tratarErro(card, lote, a.resultado)) ?? a.situacao, trabalhou: true };
    }
    const passos = await listarPassos(lote.id);
    const pedido = proximoPedido(lote.ano, passos, usaPeriodo(card.parametros), lotePorOrgao(lote) ? (lote.orgaosCenti?.length ?? 0) : undefined, lotePorMes(lote));
    if (!pedido) return { situacao: await concluir(card, lote), trabalhou: true };
    if (errosSeguidos(passos, pedido) >= MAX_ERROS_AUTO) {
      await fecharLoteEmpenhos(card, lote, "falhou", `${rotuloPeriodo(pedido.periodo)}, página ${pedido.pagina}: ${MAX_ERROS_AUTO} erros seguidos — a atualização automática desistiu.`);
      return { situacao: "falhou (erros seguidos)", trabalhou: true };
    }
    const a = await iniciarPaginaAuto(card, lote, pedido.periodo, pedido.pagina);
    return { situacao: (await tratarErro(card, lote, a.resultado)) ?? `${lote.ano}: ${a.situacao}`, trabalhou: true };
  } catch (e) {
    if (!(e instanceof PedidoInvalido)) throw e;
    await fecharLoteEmpenhos(card, lote, "falhou", e.message);
    return { situacao: "falhou (pedido inválido)", trabalhou: true };
  } finally {
    await comandoSoltarAuto(db, lote.id).catch(() => {});
  }
}

/** O erro de uma página na automática: a resposta que não é a lista e a grande demais que não se divide encerram o lote
 * (repetir não adianta); o erro de rede tenta de novo na próxima execução. Sem erro = null. */
async function tratarErro(card: CardEmpenho, lote: LoteCenti, res: ResultadoPagina | undefined): Promise<string | null> {
  if (!res?.erro || res.dividir) return null;
  if (res.erro.tipo === "resposta" || res.erro.tipo === "grande") {
    await fecharLoteEmpenhos(card, lote, "falhou", res.erro.mensagem);
    return `falhou (${res.erro.tipo === "grande" ? "resposta grande demais" : "resposta inválida"})`;
  }
  return "erro de rede — tenta na próxima execução";
}

async function concluir(card: CardEmpenho, lote: NonNullable<Awaited<ReturnType<typeof getLote>>>): Promise<string> {
  const c = await concluirLoteEmpenhos(card, lote, { aceitarQueda: false, usuario: null });
  if (c.estado !== "queda") return c.estado;
  // A QUEDA nunca passa sozinha: o lote fecha como parcial e a pessoa confirma numa importação manual.
  const motivo = `${c.queda} Confirme numa importação manual (a atualização automática não aceita uma queda sozinha).`;
  await fecharParcial(card, lote, motivo, motivo, null);
  return "parcial (queda)";
}
