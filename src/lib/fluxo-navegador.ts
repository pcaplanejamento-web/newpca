/**
 * O que os nós dos FLUXOS precisam do navegador: ler UM protocolo da Centi (emitido POR CÓDIGO com a emissão aprendida
 * — a mesma da tarefa "Ler a Tela Protocolo" — e lido no navegador: capa + DFDs, conferido contra o protocolo pedido).
 * Sem a emissão aprendida, o erro diz como ensinar (o fluxo nunca mexe na tela da Centi).
 */
import { analisarRespostaCenti, caminhoLoadPlanejamento, lerConfigCenti, operacaoRecusada, pedidoEmitirDfd } from "./automacao-centi-core";
import { acharValor } from "./fluxo-core";
import { parseDfdPdf } from "./parse-dfd-pdf";
import { coerceEmissaoProtocolo, conferirLeituraProtocolo, corpoEmissaoProtocolo, type EmissaoProtocolo } from "./automacao-tela-protocolo";
import { baixarPelaExtensao, comoBlob, deBase64, type PedirExtensao, pdfDoAchado, pdfDosBytes } from "./arquivo-navegador";
import { dataIsoBrasilia } from "./format";
import type { Item } from "./fluxo-core";
import type { RegrasAvaliacao } from "./avaliacao-core";
import { lerProtocoloCompleto, type ProtocoloLido } from "./importar-protocolo-auto";

/** Os protocolos lidos NESTA execução (o nó "Importar protocolo" usa a mesma leitura — não emite de novo). */
export type CacheLeitura = Map<string, ProtocoloLido>;
export const chaveLeitura = (protocolo: unknown, ano: unknown) => `${s(protocolo).split("/")[0]}/${s(ano)}`;

export async function emissaoDoServidor(): Promise<EmissaoProtocolo | null> {
  const r = (await fetch("/api/admin/automacao/config", { cache: "no-store" })
    .then((x) => x.json())
    .catch(() => null)) as { ok?: boolean; config?: { emissaoProtocolo?: unknown } } | null;
  return r?.ok ? coerceEmissaoProtocolo(r.config?.emissaoProtocolo) : null;
}

const s = (v: unknown) => (v == null ? "" : String(v).trim());

/** Lê um protocolo (item com protocolo, ano e id) → a capa + os DFDs. Lança com a mensagem quando não dá. */
export async function lerProtocoloPorCodigo(
  pedir: PedirExtensao,
  emissao: EmissaoProtocolo | null,
  it: Item,
  regras: RegrasAvaliacao,
  cache?: CacheLeitura,
): Promise<Item> {
  const alvo = { id: s(it.id ?? it.idExterno), protocolo: s(it.protocolo ?? it.numero).split("/")[0], ano: s(it.ano) };
  if (!alvo.protocolo) throw new Error("O item não tem o nº do protocolo (campo “protocolo”).");
  if (!emissao) throw new Error("A emissão do protocolo ainda não foi aprendida — emita UM protocolo pela tarefa “Ler a Tela Protocolo”.");
  if (!alvo.id) throw new Error(`Protocolo ${alvo.protocolo}: sem o Id da Centi (campo “id”).`);
  const corpo = corpoEmissaoProtocolo(emissao, { ...alvo, hoje: dataIsoBrasilia(new Date().toISOString()) });
  if (!corpo) throw new Error("Não consegui montar a emissão do protocolo.");
  const r = (await pedir("pedir", { metodo: "POST", caminho: "restauth/operation", corpo }, 300_000)) as { ok?: boolean; erro?: string; b64?: string; status?: number; interrompido?: boolean };
  if (r.interrompido) throw new Error("Interrompido na extensão.");
  if (!r.ok || r.b64 == null) throw new Error(r.erro || "A extensão não respondeu.");
  const bytes = deBase64(r.b64);
  if (bytes.length < 64 * 1024 && operacaoRecusada(new TextDecoder().decode(bytes)))
    throw new Error("A Centi recusou a emissão guardada — emita UM protocolo pela tarefa “Ler a Tela Protocolo” para reaprender.");
  const direto = await pdfDosBytes(bytes).catch(() => null);
  const x = direto ? { pdf: direto } : await pdfDoAchado(analisarRespostaCenti(bytes, r.status ?? 0), baixarPelaExtensao(pedir));
  if (!("pdf" in x)) throw new Error(x.erro);
  const lido = await lerProtocoloCompleto(new File([comoBlob(x.pdf)], `Protocolo ${alvo.protocolo}.pdf`, { type: "application/pdf" }), regras);
  const numeros = lido.dfds.map((d) => d.numero);
  const leitura = conferirLeituraProtocolo(alvo, lido.capa, numeros);
  if (leitura.estado !== "falha") cache?.set(chaveLeitura(alvo.protocolo, alvo.ano), lido);
  return {
    leitura: leitura.estado,
    leituraTexto: leitura.texto,
    capa: { ...lido.capa },
    assunto: lido.capa.assunto ?? "",
    totalDfds: numeros.length,
    dfds: lido.dfds.map((d) => ({
      numero: d.numero,
      planejamento: d.planejamento ?? "",
      tipo: d.tipo ?? "",
      sigla: d.siglaSetor ?? "",
      orgao: d.orgaoEntidade ?? "",
      objeto: d.objeto ?? "",
      valor: d.valorTotal ?? 0,
      itens: d.itens.length,
      assinaturas: d.assinaturas.length,
    })),
  };
}

/** A configuração do Emitir DFD deste aparelho (a mesma do "Baixar DFDs" — Ajustes da Automação). */
function configDfd() {
  try {
    return lerConfigCenti(JSON.parse(localStorage.getItem("automacao:centi") || "null"));
  } catch {
    return lerConfigCenti(null);
  }
}

/** Busca UM DFD na Centi pelo nº de PLANEJAMENTO — o mesmo Emitir DFD do "Baixar DFDs" (por API) — e lê o PDF:
 * nº, tipo, objeto, valor total e itens como estão na Centi. Lança com a mensagem quando não dá. */
export async function lerDfdCentiPorCodigo(pedir: PedirExtensao, planejamento: string, entidade?: string, comPdf = true): Promise<Item> {
  const plan = s(planejamento).replace(/\D/g, "");
  if (!plan) throw new Error("O DFD não tem nº de planejamento.");
  // 1) O planejamento (CM002) pela API — como a tela faz antes de emitir: dá a SITUAÇÃO e libera a operação.
  const l = (await pedir("ler", { metodo: "GET", caminho: caminhoLoadPlanejamento(plan), entidade: entidade || undefined }, 60_000)) as {
    ok?: boolean;
    erro?: string;
    j?: unknown;
    interrompido?: boolean;
  };
  if (l.interrompido) throw new Error("Interrompido na extensão.");
  if (!l.ok) throw new Error(`Planejamento ${plan} não encontrado na Centi: ${l.erro ?? "sem resposta"}`);
  const situacao = s(acharValor(l.j, /^situa/i));
  if (!comPdf) return { planejamento: plan, situacao };
  const r = (await pedir(
    "pedir",
    { metodo: "POST", caminho: "restauth/operation", corpo: pedidoEmitirDfd(plan, configDfd(), new Date()), entidade: entidade || undefined },
    150_000,
  )) as { ok?: boolean; erro?: string; b64?: string; status?: number; interrompido?: boolean };
  if (r.interrompido) throw new Error("Interrompido na extensão.");
  if (!r.ok || r.b64 == null) throw new Error(r.erro || "A extensão não respondeu.");
  const a = analisarRespostaCenti(deBase64(r.b64), r.status ?? 0);
  if (a.tipo === "nada" && operacaoRecusada(a.amostra ?? a.erro))
    throw new Error("A Centi recusou o Emitir DFD — emita UM DFD pela tarefa “Baixar DFDs” (ou pela tela da Centi) para a extensão pegar a operação nova.");
  const x = await pdfDoAchado(a, baixarPelaExtensao(pedir, entidade || undefined));
  if (!("pdf" in x)) throw new Error(x.erro);
  const d = await parseDfdPdf(new File([comoBlob(x.pdf)], `Planejamento ${plan}.pdf`, { type: "application/pdf" }));
  if (s(d.planejamento).replace(/\D/g, "").replace(/^0+/, "") !== plan.replace(/^0+/, ""))
    throw new Error(`A Centi devolveu o DFD de outro planejamento (${s(d.planejamento) || "sem nº"}).`);
  return {
    numero: d.numero,
    planejamento: d.planejamento,
    tipo: d.tipo,
    objeto: d.objeto,
    valor: d.valorTotal ?? 0,
    totalItens: d.itens.length,
    situacao,
  };
}
