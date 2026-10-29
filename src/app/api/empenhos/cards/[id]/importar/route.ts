import { eq } from "drizzle-orm";
import { centiLeituras } from "@/db/schema";
import { exigirSessao, intId, recusa } from "@/lib/api-auth";
import { registrarAuditoria } from "@/lib/auditoria";
import { getDb } from "@/lib/db";
import { anosDoCard, cardPorOrgao, NOME_TIPO, pendenciasDoCard, proximaDoCard, telaDoCard, textoIntervalo } from "@/lib/empenho-cards-core";
import { orgaosDoLote, orgaosLiquidacao, vinculosDoCard } from "@/lib/empenho-cards";
import { cardDaRota } from "@/lib/empenho-card-rota";
import { excluirImportacaoSchema, importarCardSchema } from "@/lib/empenho-cards-validation";
import { anosDesatualizados, bytesEsperados, criarLote, getLote, listarLotes, listarPassos, loteEmAndamento } from "@/lib/empenhos";
import { LEITOR_EMPENHOS, QUEM_AUTO } from "@/lib/empenhos-core";
import { andamentoDoLote } from "@/lib/empenhos-fragmentos";
import { baixarPaginaDoLote, concluirLoteEmpenhos, falhaDaPagina, fecharLoteEmpenhos, guardarParteDoLote, PedidoInvalido } from "@/lib/empenhos-importacao";
import { MAX_CORPO_PARTE } from "@/lib/importacao-partes-core";
import { comandoConduzir, comandoExcluirPassos, consultaAssinaturas, comandoRecontarLote, comandoSoltarLote, comandosExcluirLotes } from "@/lib/empenhos-sql";
import { dataIsoBrasilia } from "@/lib/format";
import { erro, ok, parseCorpo } from "@/lib/http";
import { getConfigImportacoes } from "@/lib/importacoes-config";

export const dynamic = "force-dynamic";

/** Os últimos lotes do card (o histórico da importação) + o que está lendo agora; com `?lote=`, os PASSOS daquele lote. */
export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const g = await exigirSessao();
  if ("erro" in g) return g.erro;
  const a = await cardDaRota(ctx);
  if ("resp" in a) return a.resp;
  const negado = recusa(g.acesso, telaDoCard(a.card), "importar");
  if (negado) return negado;
  const busca = new URL(req.url).searchParams;
  // As ASSINATURAS gravadas do ano (chave → assinatura): o navegador manda inteiro só o que mudou. Um texto montado no banco,
  // repassado como veio (o Worker não lê nem serializa milhares de linhas).
  const anoAssinaturas = intId(busca.get("assinaturas") ?? "");
  if (anoAssinaturas) {
    // Em PÁGINAS (`depois` = o último id da página anterior; `ultimo` null = acabou): cada texto bem abaixo dos 2 MB do D1.
    const depois = Math.max(0, Math.trunc(Number(busca.get("depois") ?? 0)) || 0);
    const [r] = await consultaAssinaturas(getDb(), a.card.tipo, a.card.id, anoAssinaturas, depois);
    return new Response(`{"ok":true,"assinaturas":${r?.j ?? "{}"},"ultimo":${r?.ultimo == null ? "null" : Number(r.ultimo)}}`, { headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" } });
  }
  const loteId = intId(busca.get("lote") ?? "");
  if (loteId) {
    const lote = await getLote(loteId, a.card.id);
    if (!lote) return erro("Importação não encontrada.", 404);
    return ok({ lote, passos: await listarPassos(lote.id) });
  }
  const emAndamento = await loteEmAndamento(a.card.id);
  const { intervaloMin } = await getConfigImportacoes();
  const proxima = emAndamento ? null : proximaDoCard(a.card, intervaloMin);
  return ok({
    /** Antes disto nenhuma importação NOVA começa (o intervalo mínimo) — o texto do motivo. */
    intervalo: proxima ? { ate: new Date(proxima).toISOString(), texto: textoIntervalo(proxima, intervaloMin) } : null,
    lotes: await listarLotes(a.card.id),
    orgaosLiquidacao: cardPorOrgao(a.card.tipo) ? await orgaosLiquidacao() : null,
    emAndamento,
    andamento: emAndamento ? await andamentoDoLote({ ...emAndamento, cardId: a.card.id }, await listarPassos(emAndamento.id)) : null,
    desatualizados: await anosDesatualizados(a.card.id),
    leitor: LEITOR_EMPENHOS,
  });
}

/**
 * IMPORTAÇÃO MANUAL do card, passo a passo (a tela conduz — Importar): `iniciar` cria o lote · `baixar` traz UMA página da
 * Centi crua (o navegador lê o JSON) · `parte` guarda as linhas lidas em partes de tamanho fixo (só o que os vínculos
 * cobrem) · `falha` registra a leitura que falhou · `concluir` CONFERE (recebidos × total informado pela Centi) e só então PROMOVE
 * para a tabela final — senão fecha como parcial, sem tocar nela · `cancelar` fecha sem promover.
 */
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const g = await exigirSessao();
  if ("erro" in g) return g.erro;
  const a = await cardDaRota(ctx);
  if ("resp" in a) return a.resp;
  const negado = recusa(g.acesso, telaDoCard(a.card), "importar");
  if (negado) return negado;
  const { card } = a;
  // A PARTE tem tamanho fixo (o navegador divide): um corpo maior nem é lido.
  if (Number(req.headers.get("content-length") ?? 0) > MAX_CORPO_PARTE) return erro("Pedido grande demais — recarregue a página e importe de novo.", 413);
  const p = await parseCorpo(importarCardSchema, req);
  if ("resp" in p) return p.resp;
  const db = getDb();
  const corpo = p.data;

  if (corpo.acao === "iniciar") {
    const anos = anosDoCard(card.anos, Number(dataIsoBrasilia(new Date().toISOString()).slice(0, 4)));
    if (!anos.includes(corpo.ano)) return erro(`O ano ${corpo.ano} está fora dos anos deste card (Configuração).`, 422);
    // A CONFIGURAÇÃO vem antes de qualquer importação: o catálogo ("Buscar na Centi") exige a Configuração confirmada;
    // os empenhos, também os vínculos.
    // O MODO segue o tipo do card: no de liquidações, só liquidações; no de pagamentos, só pagamentos; no de empenhos, os
    // empenhos ou o catálogo.
    const modoDoCard = card.tipo === "empenhos" ? null : card.tipo;
    const modoPedido = corpo.modo === "liquidacoes" || corpo.modo === "pagamentos" ? corpo.modo : null;
    if (modoPedido !== modoDoCard) return erro(modoDoCard ? `Este card importa ${NOME_TIPO[modoDoCard].varios}.` : `${NOME_TIPO[modoPedido ?? "liquidacoes"].titulo} se importam num card de ${NOME_TIPO[modoPedido ?? "liquidacoes"].varios}.`, 422);
    // POR ÓRGÃO: liquidações e pagamentos leem TODOS os órgãos do cadastro com o "ID na Centi"; o catálogo pedido por órgão
    // (descobrir os IDs) também; os empenhos do card que lê por órgão, os dos vínculos (a lista fica no lote).
    const orgaos = await orgaosDoLote(card, corpo.modo ?? "dados", corpo.porOrgao);
    if (corpo.porOrgao && !orgaos?.length) return erro("Nenhum órgão com o “ID na Centi” no cadastro (Órgãos e Unidades) — cadastre os IDs antes de descobrir.", 409);
    const vinculos = cardPorOrgao(card.tipo) ? (orgaos?.length ?? 0) : (await vinculosDoCard(card.id)).length;
    const falta = pendenciasDoCard(card, vinculos).filter((x) => corpo.modo !== "unidades" || x.aba === "configuracao");
    if (falta.length) return erro(`Antes de importar: ${falta.map((x) => x.texto).join(" ")}`, 409);
    const andando = await loteEmAndamento(card.id);
    if (andando) return erro(`Já há uma importação em andamento (${andando.ano}) — continue ou cancele aquela antes.`, 409);
    // O INTERVALO MÍNIMO entre atualizações (Configurações → Importações): o catálogo ("Buscar na Centi") não grava dados.
    if (corpo.modo !== "unidades") {
      const { intervaloMin } = await getConfigImportacoes();
      const proxima = proximaDoCard(card, intervaloMin);
      if (proxima) return erro(textoIntervalo(proxima, intervaloMin), 409);
    }
    return ok({ lote: await criarLote(card.id, corpo.ano, g.u.nome, corpo.condutor, corpo.modo, orgaos) });
  }

  const lote = await getLote(corpo.lote, card.id);
  if (!lote) return erro("Importação não encontrada.", 404);
  if (lote.estado !== "lendo") return erro("Esta importação já foi encerrada.", 409);
  // UMA ABA POR VEZ: a que conduz renova a trava a cada pedido; outra só entra quando ela vence (2 min sem notícia).
  if (corpo.condutor || corpo.acao !== "cancelar") {
    const [conduz] = await comandoConduzir(db, lote.id, corpo.condutor ?? "");
    if (!conduz) return erro("Esta importação está em andamento em outra aba, com outra pessoa ou na atualização automática — acompanhe por lá ou espere 2 minutos sem atividade dela.", 409);
    // A aba que assume o lote descarta a leitura fragmentada que a automática deixou no meio (a página volta a ser lida
    // por quem conduz agora — nunca duas leituras da mesma página no lote).
    if (lote.iniciadoPor === QUEM_AUTO) await db.delete(centiLeituras).where(eq(centiLeituras.loteId, lote.id));
  } else if (lote.conduzido) {
    return erro("Esta importação está em andamento em outra aba — interrompa por lá.", 409);
  }
  // O leitor que começou o lote é o que o termina (nada de páginas lidas por versões diferentes no mesmo lote).
  if (lote.leitor !== LEITOR_EMPENHOS && corpo.acao !== "cancelar") {
    return erro("Esta importação começou com uma versão anterior do leitor — cancele e importe de novo.", 409);
  }

  if (corpo.acao === "baixar" || corpo.acao === "falha" || corpo.acao === "parte") {
    const periodo = { inicio: corpo.inicio, fim: corpo.fim };
    try {
      if (corpo.acao === "baixar") {
        // A resposta da Centi volta CRUA ao navegador (o servidor não lê o JSON — o limite de CPU do plano gratuito);
        // a falha (rede, status, grande demais) já é o passo registrado, na resposta JSON de sempre.
        const b = await baixarPaginaDoLote(card, lote, periodo, corpo.pagina);
        if (!b.ok) return ok({ lote: await getLote(lote.id, card.id), ...b.r });
        // O tamanho esperado (a barra do download): o informado pela Centi ou o do mesmo pedido na última importação.
        const esperado = b.comprimento ?? (await bytesEsperados(card.id, lote.ano, lote.modo, periodo.inicio, periodo.fim, corpo.pagina).catch(() => null));
        return new Response(b.corpo, {
          headers: {
            "content-type": "text/plain; charset=utf-8",
            "cache-control": "no-store",
            "x-centi-status": String(b.status),
            "x-centi-ms": String(b.ms),
            ...(esperado ? { "x-centi-bytes": String(esperado) } : {}),
          },
        });
      }
      const r =
        corpo.acao === "falha"
          ? await falhaDaPagina(card, lote, periodo, corpo.pagina, { mensagem: corpo.mensagem, status: corpo.status, bytes: corpo.bytes, ms: corpo.ms })
          : await guardarParteDoLote(card, lote, periodo, corpo.pagina, { parte: corpo.parte, partes: corpo.partes, passo: corpo.passo, tuplas: corpo.linhas, iguais: corpo.iguais, resumo: corpo.resumo });
      // A parte do meio não muda a contagem do lote (só a última reconta): não relê o lote.
      return ok({ lote: r.parcial ? null : await getLote(lote.id, card.id), ...r });
    } catch (e) {
      if (e instanceof PedidoInvalido) return erro(e.message, e.status);
      throw e;
    }
  }

  if (corpo.acao === "pausar") {
    await comandoSoltarLote(db, lote.id, corpo.condutor);
    return ok({ lote: await getLote(lote.id, card.id) });
  }

  if (corpo.acao === "cancelar") {
    await fecharLoteEmpenhos(card, lote, corpo.falhou ? "falhou" : "cancelado", corpo.motivo || "Cancelada por quem importava.");
    return ok({ lote: await getLote(lote.id, card.id) });
  }

  // concluir: a CONFERÊNCIA decide (a mesma da atualização automática); a QUEDA volta para a pessoa confirmar.
  const c = await concluirLoteEmpenhos(card, lote, { aceitarQueda: !!corpo.aceitarQueda, usuario: g.u });
  if (c.estado === "queda") return ok({ lote, queda: c.queda });
  return ok({ lote: await getLote(lote.id, card.id) });
}

/**
 * EXCLUI DO BANCO (Excluir), vários de uma vez: `{lotes}` = importações inteiras (passos, staging e o lote — os empenhos promovidos
 * ficam); `{lote, passos}` = passos de uma importação (a que ainda lê é recontada; o período volta a faltar).
 */
export async function DELETE(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const g = await exigirSessao();
  if ("erro" in g) return g.erro;
  const a = await cardDaRota(ctx);
  if ("resp" in a) return a.resp;
  const negado = recusa(g.acesso, telaDoCard(a.card), "excluir");
  if (negado) return negado;
  const { card } = a;
  const p = await parseCorpo(excluirImportacaoSchema, req);
  if ("resp" in p) return p.resp;
  const db = getDb();
  if ("passos" in p.data) {
    const lote = await getLote(p.data.lote, card.id);
    if (!lote) return erro("Importação não encontrada.", 404);
    const ids = [...new Set(p.data.passos)];
    const res = (await db.batch([comandoExcluirPassos(db, lote.id, ids), ...(lote.estado === "lendo" ? [comandoRecontarLote(db, lote.id)] : [])] as never)) as unknown[][];
    const excluidos = res[0].length;
    await registrarAuditoria({ usuario: g.u, acao: "excluir", entidade: "empenho_card", entidadeId: card.id, resumo: `${card.nome} ${lote.ano}: ${excluidos} passo(s) da importação ${lote.id} excluído(s)` });
    return ok({ excluidos, lote: await getLote(lote.id, card.id) });
  }
  const res = (await db.batch(comandosExcluirLotes(db, card.id, p.data.lotes) as never)) as unknown[][];
  const fora = (res.at(-1) ?? []) as { id: number; ano: number; estado: string }[];
  const excluidos = fora.length;
  if (excluidos)
    await registrarAuditoria({
      usuario: g.u,
      acao: "excluir",
      entidade: "empenho_card",
      entidadeId: card.id,
      resumo: `${card.nome}: ${excluidos} importaç${excluidos === 1 ? "ão excluída" : "ões excluídas"} do banco com os passos (${fora.map((l) => `${l.id} · ${l.ano} · ${l.estado}`).join("; ")})${fora.some((l) => l.estado === "promovido") ? " — o que as concluídas gravaram fica" : ""}`,
    });
  return ok({ excluidos });
}
