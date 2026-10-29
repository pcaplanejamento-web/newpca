import { diaUtil, feriadosNoIntervalo } from "./calendario-core";
import { getDb } from "./db";
import { anosAutomaticos, type CardEmpenho, type ConfigImportacoes, cardPorOrgao, cardsDaAutomatica, lotesForaDaEscolha, proximaDoCard } from "./empenho-cards-core";
import { cardsAtivos, orgaosDoLote, registrarLeituraCard } from "./empenho-cards";
import { and, eq } from "drizzle-orm";
import { centiLeituras, centiLotePassos, centiLotes } from "@/db/schema";
import { criarLote, encerrarParados, type getLote, loteEmAndamento, passosDaRetomada, rodizioDosAnos } from "./empenhos";
import {
  hojeIso,
  anoDaVez,
  CONDUTOR_AUTO,
  cabeOutroPulo,
  cardNaHora,
  custoDoPulo,
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
import { avancarLeitura, descartarLeitura, iniciarPaginaAuto, leituraDoLote } from "./empenhos-fragmentos";
import { concluirLoteEmpenhos, fecharLoteEmpenhos, fecharParcial, PedidoInvalido, type ResultadoPagina } from "./empenhos-importacao";
import { comandoConduzir, comandoSoltarAuto, comandosFecharLote, comandoTravarAuto } from "./empenhos-sql";
import { listarFeriados } from "./feriados";
import { getConfigImportacoes } from "./importacoes-config";
import { horaAgoraBrasilia } from "./tarefas-core";

/**
 * A ATUALIZAÇÃO AUTOMÁTICA das importações da Centi (o cron chama DUAS vezes por minuto), com a configuração CENTRAL
 * (Configurações → Importações — desligada por padrão): numa FILA ÚNICA (empenhos → liquidações → pagamentos), continua o
 * lote que está lendo ou, na hora certa (horário, dias úteis e frequência centrais), começa o do ano da
 * vez — UMA tarefa pequena por execução (uma página pequena, um fragmento da resposta grande ou uma janela dela —
 * `empenhos-fragmentos.ts`), dentro do limite de CPU do plano gratuito, com a MESMA conferência da importação manual. Nunca aceita uma
 * QUEDA suspeita sozinha (o lote fecha como parcial — a pessoa confirma numa importação manual) e nunca disputa o lote com
 * uma aba (a trava de quem conduz). Nos cards de LIQUIDAÇÕES, o lote lê todos os órgãos do cadastro com o "ID na Centi".
 */
export async function atualizarEmpenhosAuto(
  agora = new Date(),
  /** A vez na RODADA do cron (`rodada-cron-core.ts`): a limpeza só na 1ª; o rodízio começa num card diferente a cada vez. */
  vez = 0,
): Promise<{ situacoes: { card: number; situacao: string }[]; trabalhou: boolean }> {
  const nada = (situacoes: { card: number; situacao: string }[]) => ({ situacoes, trabalhou: false });
  // Os lotes PARADOS há mais de 30 min (a aba fechou, o Worker foi cortado) são encerrados em TODOS os cards — ligada ou
  // não a automática: nada fica "lendo" para sempre na Execução e no painel do canto.
  if (vez === 0) await encerrarParados().catch((e) => console.error("[empenhos-auto] encerrar parados", e));
  // A configuração CENTRAL (Configurações → Importações): desligada, nada roda; ligada, vale para todos os cards.
  const cfg = await getConfigImportacoes();
  // `card` 0 = a automática inteira (a tela mostra se ela está desligada, sem nada escolhido ou rodando).
  if (!cfg.ativa) return nada([{ card: 0, situacao: "Atualização automática desligada" }, ...(await encerrarLotesAuto())]);
  const hoje = hojeIso(agora);
  const anoAtual = Number(hoje.slice(0, 4));
  // SÓ as importações (card × ano) ESCOLHIDAS em Configurações → Importações; o lote da automática num card/ano que saiu
  // da escolha é cancelado (nada fica "Importando" para sempre).
  const prontos = await cardsAtivos();
  const cards = cardsDaAutomatica(prontos, cfg, anoAtual);
  const cancelados = vez === 0 ? await encerrarLotesAuto((l) => lotesForaDaEscolha(l, prontos, cfg, anoAtual), "A importação saiu da atualização automática.") : [];
  if (!cards.length) return nada([{ card: 0, situacao: "Nenhuma importação escolhida para a atualização automática" }, ...cancelados]);
  const util = cfg.diasUteis ? diaUtil(hoje, feriadosNoIntervalo(await listarFeriados(), hoje, hoje)) : true;
  const instante = { ms: agora.getTime(), hora: horaAgoraBrasilia(agora), diaUtil: util, ano: Number(hoje.slice(0, 4)) };
  const r: { card: number; situacao: string }[] = [{ card: 0, situacao: "Ligada" }, ...cancelados];
  // A FILA ÚNICA: empenhos → liquidações → pagamentos (a unidade das liquidações e dos pagamentos vem do empenho); UMA
  // tarefa pesada por execução (o limite de CPU do plano gratuito vale para a execução inteira) — o 1º card que trabalhar
  // encerra a execução; quem só espera (fora da hora, depois de um erro) passa a vez ao seguinte.
  // RODÍZIO: a fila começa num card diferente a cada meio minuto — uma leitura longa (horas num dia pesado) nunca deixa os
  // outros cards sem a vez.
  // Na RODADA, cada vez começa no card seguinte: Empenhos, Liquidações e Pagamentos andam juntos.
  const ini = (Math.floor(agora.getTime() / 30_000) + vez) % cards.length;
  let trabalhou = false;
  for (const card of [...cards.slice(ini), ...cards.slice(0, ini)]) {
    try {
      const u = await umCard(card, cfg, instante);
      r.push({ card: card.id, situacao: u.situacao });
      if (u.trabalhou) {
        trabalhou = true;
        break;
      }
    } catch (e) {
      // Nunca em silêncio: o erro vira um passo do lote (umCard) e o log; a fila segue na próxima execução.
      // O card que falha vai para a espera da frequência (a última leitura = falhou) e a fila SEGUE: um card com defeito
      // nunca prende os outros.
      console.error(`[cron empenhos] card ${card.id}:`, (e as Error).message);
      r.push({ card: card.id, situacao: `erro: ${(e as Error).message}` });
      await registrarLeituraCard(card.id, "falhou", card.ultimaContagem ?? 0, card.ultimoTotal).catch(() => undefined);
      // Uma tarefa pesada por execução: a que falhou já gastou a vez (o limite de CPU vale para a execução inteira); a
      // rodada para aqui (`trabalhou` falso).
      break;
    }
  }
  return { situacoes: r, trabalhou };
}

/**
 * A automática DESLIGADA: os lotes que ELA começou e ainda leem são cancelados (a mesma limpeza do fechamento) — nada fica
 * "Importando" para sempre. As importações manuais não mudam.
 */
export async function encerrarLotesAuto(
  /** Quais encerrar (padrão: todos — a automática desligada). */
  sai: <L extends { cardId: number | null; ano: number }>(lotes: L[]) => L[] = (l) => l,
  motivo = "A atualização automática foi desligada.",
): Promise<{ card: number; situacao: string }[]> {
  const db = getDb();
  const lendo = sai(
    await db
      .select({ id: centiLotes.id, cardId: centiLotes.cardId, ano: centiLotes.ano })
      .from(centiLotes)
      .where(and(eq(centiLotes.estado, "lendo"), eq(centiLotes.iniciadoPor, QUEM_AUTO))),
  );
  if (!lendo.length) return [];
  await db.batch(lendo.flatMap((l) => comandosFecharLote(db, l.id, "cancelado", motivo)) as never);
  return lendo.map((l) => ({ card: l.cardId ?? 0, situacao: `cancelado: ${motivo}` }));
}

type Feito = { situacao: string; trabalhou: boolean };


const modoDoCard = (card: CardEmpenho): ModoLote => (card.tipo === "empenhos" ? "dados" : card.tipo);

async function umCard(card: CardEmpenho, cfg: ConfigImportacoes, agora: { ms: number; hora: string; diaUtil: boolean; ano: number }): Promise<Feito> {
  const db = getDb();
  let lote = await loteEmAndamento(card.id);
  if (!lote) {
    // A PROGRAMAÇÃO é a central; a última leitura é a de cada card (cada um tem a sua vez na frequência).
    if (!cardNaHora({ ...cfg, ultimaExecucao: card.ultimaExecucao }, agora)) return { situacao: "fora da hora", trabalhou: false };
    // O INTERVALO MÍNIMO entre atualizações vale também para a automática.
    if (proximaDoCard(card, cfg.intervaloMin, agora.ms)) return { situacao: "intervalo mínimo", trabalhou: false };
    const { ultima, emEspera } = await rodizioDosAnos(card.id, modoDoCard(card));
    // Os anos cuja última automática falhou ou ficou parcial esperam (o mesmo motivo voltaria) — a manual os libera.
    const anos = anosAutomaticos(cfg, card, agora.ano).filter((a) => !emEspera.has(a));
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
      // A MESMA espera e desistência dos erros da página: a falha que se repete na leitura não prende o lote para sempre.
      const erro = esperaDoErro(await passosDaRetomada(lote.id), pedidoAtual, agora.ms);
      if (erro.desistir) {
        await db.batch(descartarLeitura(aberta, "erros seguidos") as never);
        await fecharLoteEmpenhos(card, lote, "falhou", `${rotuloPeriodo(pedidoAtual.periodo)}, página ${pedidoAtual.pagina}: ${MAX_ERROS_AUTO} erros seguidos na leitura em mais de ${MINUTOS_DESISTIR_AUTO} minutos — a atualização automática desistiu.`);
        return { situacao: "falhou (erros seguidos na leitura)", trabalhou: true };
      }
      if (erro.esperar) return { situacao: "esperando depois de um erro na leitura", trabalhou: false };
      const a = await avancarLeitura(card, lote, aberta);
      return { situacao: (await tratarErro(card, lote, a.resultado)) ?? a.situacao, trabalhou: !a.ocupada };
    }
    // As páginas IDÊNTICAS à última volta são LEVES (nada é lido nem gravado): a execução segue com a próxima enquanto cabe
    // um pulo inteiro no ORÇAMENTO de consultas ao D1 (`cabeOutroPulo`); a 1ª página com mudança encerra a execução.
    let pulos = 0;
    const porOrgao = lotePorOrgao(lote);
    for (;;) {
      const passos = await passosDaRetomada(lote.id);
      const pedido = proximoPedido(lote.ano, passos, usaPeriodo(card.parametros), porOrgao ? (lote.orgaosCenti?.length ?? 0) : undefined, lotePorMes(lote));
      if (!pedido) {
        // A conclusão é pesada (a promoção): depois de pulos, fica para a próxima execução.
        if (pulos) return { situacao: `${lote.ano}: ${pulos} página(s) sem mudança — conclui na próxima execução`, trabalhou: true };
        return { situacao: await concluir(card, lote), trabalhou: true };
      }
      pedidoAtual = pedido;
      const erro = esperaDoErro(passos, pedido, agora.ms);
      if (erro.desistir) {
        await fecharLoteEmpenhos(card, lote, "falhou", `${rotuloPeriodo(pedido.periodo)}, página ${pedido.pagina}: ${MAX_ERROS_AUTO} erros seguidos em mais de ${MINUTOS_DESISTIR_AUTO} minutos — a atualização automática desistiu.`);
        return { situacao: "falhou (erros seguidos)", trabalhou: true };
      }
      // Dentro da espera do último erro (1, 2, 4… min): a Centi tem tempo de voltar; o rodízio segue para outro card.
      if (erro.esperar) return { situacao: "esperando depois de um erro", trabalhou: pulos > 0 };
      const a = await iniciarPaginaAuto(card, lote, pedido.periodo, pedido.pagina);
      if (a.pulou && cabeOutroPulo(++pulos * custoDoPulo(porOrgao), porOrgao)) continue;
      const situacao = a.pulou ? `${pulos} página(s) sem mudança` : a.situacao;
      return { situacao: (await tratarErro(card, lote, a.resultado)) ?? `${lote.ano}: ${situacao}`, trabalhou: true };
    }
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
