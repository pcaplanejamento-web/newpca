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
  lotePorMes,
  lotePorOrgao,
  MAX_ERROS_AUTO,
  PAGINAS_POR_PASSADA,
  proximoPedido,
  QUEM_AUTO,
  rotuloPeriodo,
  usaPeriodo,
} from "./empenhos-core";
import { concluirLoteEmpenhos, fecharLoteEmpenhos, fecharParcial, lerPaginaDoLote, PedidoInvalido } from "./empenhos-importacao";
import { comandoConduzir, comandosFecharLote } from "./empenhos-sql";
import { listarFeriados } from "./feriados";
import { horaAgoraBrasilia } from "./tarefas-core";

/**
 * A ATUALIZAÇÃO AUTOMÁTICA dos cards de empenhos (o cron chama a cada 5 min): para cada card LIGADO (desligados por
 * padrão), continua o lote que está lendo ou, na hora certa (horário, dias úteis, frequência do card), começa o do ano da
 * vez — e lê poucas páginas por passada, com a MESMA leitura e a MESMA conferência da importação manual. Nunca aceita uma
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
  for (const card of cards) {
    try {
      r.push({ card: card.id, situacao: await umCard(card, instante) });
    } catch (e) {
      console.error(`[cron empenhos] card ${card.id}:`, (e as Error).message);
      r.push({ card: card.id, situacao: `erro: ${(e as Error).message}` });
    }
  }
  return r;
}

async function umCard(card: CardEmpenho, agora: { ms: number; hora: string; diaUtil: boolean; ano: number }): Promise<string> {
  const db = getDb();
  let lote = await loteEmAndamento(card.id);
  if (!lote) {
    if (!cardNaHora(card, agora)) return "fora da hora";
    const anos = anosDoCard(card.anos, agora.ano);
    if (!anos.length) return "nenhum ano";
    const ano = anoDaVez(anos, await ultimaLeituraPorAno(card.id));
    // LIQUIDAÇÕES: o lote lê TODOS os órgãos do cadastro com o "ID na Centi" (a API exige o órgão — um por "página").
    const orgaos = cardPorOrgao(card.tipo) ? (await orgaosLiquidacao()).map((o) => o.idOrgao) : null;
    if (orgaos && !orgaos.length) return "nenhum órgão com o ID na Centi";
    lote = await criarLote(card.id, ano, QUEM_AUTO, CONDUTOR_AUTO, card.tipo === "empenhos" ? "dados" : card.tipo, orgaos);
    await registrarAuditoria({ usuario: null, acao: "importar", entidade: "empenho_card", entidadeId: card.id, resumo: `${card.nome} ${ano}: atualização automática começou${orgaos ? ` (${orgaos.length} órgão(s) da Centi)` : ""}` });
  }
  if (lote.leitor !== LEITOR_EMPENHOS) {
    // Um lote começado por uma versão anterior do leitor nunca é terminado por outra: a automática encerra o dela.
    if (lote.iniciadoPor !== QUEM_AUTO) return "importação manual de versão anterior em andamento";
    await db.batch(comandosFecharLote(db, lote.id, "cancelado", "Começou com uma versão anterior do leitor.") as never);
    return "lote de versão anterior encerrado";
  }
  for (let i = 0; i < PAGINAS_POR_PASSADA; i++) {
    const [conduz] = await comandoConduzir(db, lote.id, CONDUTOR_AUTO);
    if (!conduz) return "conduzida por uma aba";
    const passos = await listarPassos(lote.id);
    const pedido = proximoPedido(lote.ano, passos, usaPeriodo(card.parametros), lotePorOrgao(lote) ? (lote.orgaosCenti?.length ?? 0) : undefined, lotePorMes(lote));
    if (!pedido) return concluir(card, lote);
    if (errosSeguidos(passos, pedido) >= MAX_ERROS_AUTO) {
      await fecharLoteEmpenhos(card, lote, "falhou", `${rotuloPeriodo(pedido.periodo)}, página ${pedido.pagina}: ${MAX_ERROS_AUTO} erros seguidos — a atualização automática desistiu.`);
      return "falhou (erros seguidos)";
    }
    let res: Awaited<ReturnType<typeof lerPaginaDoLote>>;
    try {
      res = await lerPaginaDoLote(card, lote, pedido.periodo, pedido.pagina);
    } catch (e) {
      if (!(e instanceof PedidoInvalido)) throw e;
      await fecharLoteEmpenhos(card, lote, "falhou", e.message);
      return "falhou (pedido inválido)";
    }
    if (res.erro && !res.dividir) {
      // A Centi respondeu algo que não é a lista: repetir não adianta. Erro de rede: tenta de novo na próxima passada.
      if (res.erro.tipo === "resposta") {
        await fecharLoteEmpenhos(card, lote, "falhou", res.erro.mensagem);
        return "falhou (resposta inválida)";
      }
      return "erro de rede — tenta na próxima passada";
    }
    const atual = await getLote(lote.id, card.id);
    if (!atual || atual.estado !== "lendo") return "encerrado no meio";
    lote = atual;
  }
  return `lendo ${lote.ano}`;
}

async function concluir(card: CardEmpenho, lote: NonNullable<Awaited<ReturnType<typeof getLote>>>): Promise<string> {
  const c = await concluirLoteEmpenhos(card, lote, { aceitarQueda: false, usuario: null });
  if (c.estado !== "queda") return c.estado;
  // A QUEDA nunca passa sozinha: o lote fecha como parcial e a pessoa confirma numa importação manual.
  const motivo = `${c.queda} Confirme numa importação manual (a atualização automática não aceita uma queda sozinha).`;
  await fecharParcial(card, lote, motivo, motivo, null);
  return "parcial (queda)";
}
