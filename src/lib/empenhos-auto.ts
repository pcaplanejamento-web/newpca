import { diaUtil, feriadosNoIntervalo } from "./calendario-core";
import { getDb } from "./db";
import { anosDoCard, type CardEmpenho, cardPorOrgao } from "./empenho-cards-core";
import { cardsAtivos, orgaosDoLote } from "./empenho-cards";
import { eq } from "drizzle-orm";
import { centiLeituras, centiLotePassos } from "@/db/schema";
import { criarLote, getLote, loteEmAndamento, passosDaRetomada, rodizioDosAnos } from "./empenhos";
import {
  hojeIso,
  anoDaVez,
  CONDUTOR_AUTO,
  cardNaHora,
  esperaDoErro,
  LEITOR_EMPENHOS,
  type LoteCenti,
  lotePorMes,
  lotePorOrgao,
  MAX_ERROS_AUTO,
  MINUTOS_DESISTIR_AUTO,
  type ModoLote,
  type Periodo,
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
      // Nunca em silêncio: o erro vira um passo do lote (umCard) e o log; o rodízio segue na próxima execução.
      console.error(`[cron empenhos] card ${card.id}:`, (e as Error).message);
      r.push({ card: card.id, situacao: `erro: ${(e as Error).message}` });
      break;
    }
  }
  return r;
}

type Feito = { situacao: string; trabalhou: boolean };

const modoDoCard = (card: CardEmpenho): ModoLote => (card.tipo === "empenhos" ? "dados" : card.tipo);

async function umCard(card: CardEmpenho, agora: { ms: number; hora: string; diaUtil: boolean; ano: number }): Promise<Feito> {
  const db = getDb();
  let lote = await loteEmAndamento(card.id);
  if (!lote) {
    if (!cardNaHora(card, agora)) return { situacao: "fora da hora", trabalhou: false };
    const { ultima, emEspera } = await rodizioDosAnos(card.id, modoDoCard(card));
    // Os anos cuja última automática falhou ou ficou parcial esperam (o mesmo motivo voltaria) — a manual os libera.
    const anos = anosDoCard(card.anos, agora.ano).filter((a) => !emEspera.has(a));
    if (!anos.length) return { situacao: emEspera.size ? "anos em espera (a última automática falhou)" : "nenhum ano", trabalhou: false };
    const ano = anoDaVez(anos, ultima);
    // POR ÓRGÃO: liquidações e pagamentos leem TODOS os órgãos do cadastro com o "ID na Centi" (a API exige o órgão — um por
    // "página"); os empenhos do card que lê por órgão, os dos vínculos (sem o ID de algum, o ano inteiro de todos).
    const orgaos = await orgaosDoLote(card, modoDoCard(card));
    if (cardPorOrgao(card.tipo) && !orgaos?.length) return { situacao: "nenhum órgão com o ID na Centi", trabalhou: false };
    // Sem auditoria no começo: só o FIM do lote (promovido, parcial ou falhou) é registrado — nada de uma linha por ciclo.
    lote = await criarLote(card.id, ano, QUEM_AUTO, CONDUTOR_AUTO, modoDoCard(card), orgaos);
  }
  // A automática só conduz o lote que ELA começou: a importação manual (esperando a confirmação de uma queda, pausada)
  // fica para a pessoa — continuar ou cancelar na tela; parada há 30 min, o abandono a encerra.
  if (lote.iniciadoPor !== QUEM_AUTO) return { situacao: "importação manual em andamento", trabalhou: false };
  if (lote.leitor !== LEITOR_EMPENHOS) {
    // Um lote começado por uma versão anterior do leitor nunca é terminado por outra: a automática encerra o dela.
    await db.batch(comandosFecharLote(db, lote.id, "cancelado", "Começou com uma versão anterior do leitor.") as never);
    return { situacao: "lote de versão anterior encerrado", trabalhou: true };
  }
  const [conduz] = await comandoConduzir(db, lote.id, CONDUTOR_AUTO);
  if (!conduz) return { situacao: "conduzida por uma aba", trabalhou: false };
  // A outra execução do minuto (o cron roda duas vezes) ainda está neste lote: esta não começa a mesma página.
  const [trava] = await comandoTravarAuto(db, lote.id);
  if (!trava) return { situacao: "outra execução automática está neste lote", trabalhou: false };
  let pedidoAtual: { periodo: Periodo; pagina: number } | null = null;
  try {
    // A LEITURA FRAGMENTADA em andamento vem primeiro (a resposta grande: captura ou a próxima janela).
    const aberta = await leituraDoLote(lote.id);
    if (aberta) {
      pedidoAtual = { periodo: { inicio: aberta.inicio, fim: aberta.fim }, pagina: aberta.pagina };
      const a = await avancarLeitura(card, lote, aberta);
      return { situacao: (await tratarErro(card, lote, a.resultado)) ?? a.situacao, trabalhou: true };
    }
    const passos = await passosDaRetomada(lote.id);
    const pedido = proximoPedido(lote.ano, passos, usaPeriodo(card.parametros), lotePorOrgao(lote) ? (lote.orgaosCenti?.length ?? 0) : undefined, lotePorMes(lote));
    if (!pedido) return { situacao: await concluir(card, lote), trabalhou: true };
    pedidoAtual = pedido;
    const erro = esperaDoErro(passos, pedido, agora.ms);
    if (erro.desistir) {
      await fecharLoteEmpenhos(card, lote, "falhou", `${rotuloPeriodo(pedido.periodo)}, página ${pedido.pagina}: ${MAX_ERROS_AUTO} erros seguidos em mais de ${MINUTOS_DESISTIR_AUTO} minutos — a atualização automática desistiu.`);
      return { situacao: "falhou (erros seguidos)", trabalhou: true };
    }
    // Dentro da espera do último erro (1, 2, 4… min): a Centi tem tempo de voltar; o rodízio segue para outro card.
    if (erro.esperar) return { situacao: "esperando depois de um erro", trabalhou: false };
    const a = await iniciarPaginaAuto(card, lote, pedido.periodo, pedido.pagina);
    return { situacao: (await tratarErro(card, lote, a.resultado)) ?? `${lote.ano}: ${a.situacao}`, trabalhou: true };
  } catch (e) {
    if (e instanceof PedidoInvalido && e.status === 409) {
      // A leitura que outra execução ou uma aba já completou: descartada (a página não conta duas vezes).
      await db.delete(centiLeituras).where(eq(centiLeituras.loteId, lote.id));
      return { situacao: "leitura repetida descartada", trabalhou: true };
    }
    if (e instanceof PedidoInvalido) {
      await fecharLoteEmpenhos(card, lote, "falhou", e.message);
      return { situacao: "falhou (pedido inválido)", trabalhou: true };
    }
    // Qualquer outro erro (o banco, um registro fora do esperado) vira um PASSO de erro do pedido: conta para a espera e
    // para a desistência — nunca repete a mesma falha para sempre em silêncio.
    if (pedidoAtual) {
      await db
        .insert(centiLotePassos)
        .values({ loteId: lote.id, inicio: pedidoAtual.periodo.inicio, fim: pedidoAtual.periodo.fim, pagina: pedidoAtual.pagina, estado: "erro", mensagem: `Falha na atualização automática: ${String((e as Error).message).slice(0, 300)}` })
        .catch(() => {});
    }
    throw e;
  } finally {
    await comandoSoltarAuto(db, lote.id, trava.ate).catch(() => {});
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
