/**
 * O que os nós dos FLUXOS precisam do navegador: ler UM protocolo da Centi (emitido POR CÓDIGO com a emissão aprendida
 * — a mesma da tarefa "Ler a Tela Protocolo" — e lido no navegador: capa + DFDs, conferido contra o protocolo pedido).
 * Sem a emissão aprendida, o erro diz como ensinar (o fluxo nunca mexe na tela da Centi).
 */
import { analisarRespostaCenti, operacaoRecusada } from "./automacao-centi-core";
import { carregarPlanejamento, type ContextoEmissor, emitirUm } from "./automacao-dfds-motor";
import { acharValor } from "./fluxo-core";
import { parseDfdPdf } from "./parse-dfd-pdf";
import type { DfdParseado } from "./parse-dfd-comum";
import type { DfdDetalhe } from "./dfd";
import { herdarTratamentos } from "./comparar-protocolo";
import { normalizarSecoesDfd } from "./dfd-tratamento";
import { enviarDfdEmLotes, metaDoDfd } from "./importar-dfd";
import { coerceEmissaoProtocolo, conferirLeituraProtocolo, corpoEmissaoProtocolo, type EmissaoProtocolo } from "./automacao-tela-protocolo";
import { baixarPelaExtensao, comoBlob, deBase64, type PedirExtensao, pdfDoAchado, pdfDosBytes } from "./arquivo-navegador";
import { dataIsoBrasilia } from "./format";
import type { Item } from "./fluxo-core";
import type { RegrasAvaliacao } from "./avaliacao-core";
import { lerProtocoloCompleto, type ProtocoloLido } from "./importar-protocolo-auto";

/** Os protocolos lidos NESTA execução (o nó "Importar protocolo" usa a mesma leitura — não emite de novo). */
export type CacheLeitura = Map<string, ProtocoloLido>;
/** Quantos PDFs de protocolo ficam na memória para abrir a análise completa sem emitir de novo. */
export const PDFS_NA_MEMORIA = 8;
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
  /** Os ÚLTIMOS PDFs lidos (a análise completa abre sem emitir de novo) — até `PDFS_NA_MEMORIA`. */
  arquivos?: Map<string, File>,
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
  const file = new File([comoBlob(x.pdf)], `Protocolo ${alvo.protocolo}-${alvo.ano}.pdf`, { type: "application/pdf" });
  const lido = await lerProtocoloCompleto(file, regras);
  const numeros = lido.dfds.map((d) => d.numero);
  const leitura = conferirLeituraProtocolo(alvo, lido.capa, numeros);
  if (leitura.estado !== "falha") {
    cache?.set(chaveLeitura(alvo.protocolo, alvo.ano), lido);
    if (arquivos) {
      const k = chaveLeitura(alvo.protocolo, alvo.ano);
      arquivos.delete(k);
      arquivos.set(k, file);
      while (arquivos.size > PDFS_NA_MEMORIA) arquivos.delete(arquivos.keys().next().value as string);
    }
  }
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

/** Busca UM DFD na Centi pelo nº de PLANEJAMENTO com o MESMO emissor do "Baixar DFDs" (por API): o load do planejamento
 * (a SITUAÇÃO) e, com `comPdf`, o Emitir DFD lido SEM OCR (nº, tipo, objeto, valor e itens). Lança com a mensagem. */
export async function lerDfdCentiPorCodigo(
  c: ContextoEmissor,
  planejamento: string,
  entidade?: string,
  comPdf = true,
  /** Devolve também o DFD lido INTEIRO (`dfd`) — a base da substituição. */
  completo = false,
): Promise<Item> {
  const plan = s(planejamento).replace(/\D/g, "");
  if (!plan) throw new Error("O DFD não tem nº de planejamento.");
  const l = await carregarPlanejamento(c, plan, entidade || undefined);
  if ("erro" in l) throw new Error(l.erro);
  if (!l.j || (typeof l.j === "object" && !Object.keys(l.j as object).length)) throw new Error(`NAO_ENCONTRADO: o planejamento ${plan} não existe nesta entidade da Centi.`);
  const situacao = s(acharValor(l.j, /^situa/i));
  if (!comPdf) return { planejamento: plan, situacao };
  const e = await emitirUm(c, plan, entidade || undefined, false, true);
  if (!e.pdf) throw new Error(e.recusada ? `A Centi recusou o Emitir DFD — ${e.erro}` : (e.erro ?? "Falha ao emitir."));
  const d = await parseDfdPdf(new File([comoBlob(e.pdf)], `Planejamento ${plan}.pdf`, { type: "application/pdf" }), { ocr: false });
  if (s(d.planejamento).replace(/\D/g, "").replace(/^0+/, "") !== plan.replace(/^0+/, ""))
    throw new Error(`A Centi devolveu o DFD de outro planejamento (${s(d.planejamento) || "sem nº"}).`);
  const resumo = { numero: d.numero, planejamento: d.planejamento, tipo: d.tipo, objeto: d.objeto, valor: d.valorTotal ?? 0, totalItens: d.itens.length, situacao };
  return completo ? { ...resumo, dfd: d as unknown as Item } : resumo;
}

/** SUBSTITUI os dados do DFD gravado (`dfdId`) pelos do DFD lido na Centi — a MESMA sobrescrita do "Sobrescrever DFD":
 * o mesmo nº de planejamento é exigido; a unidade, o protocolo e o PCA ficam os do gravado; o que a Centi não traz e o
 * gravado já tratou é HERDADO (`herdarTratamentos`) e, sem assinatura lida (PDF sem OCR), ficam as do gravado. */
export async function substituirDfdPelaCenti(dfdId: number, novo: DfdParseado): Promise<{ numero: string; itens: number }> {
  const r = await fetch(`/api/dfd/${dfdId}`);
  const j = (await r.json().catch(() => null)) as { ok?: boolean; error?: string; dfd?: DfdDetalhe } | null;
  if (!r.ok || !j?.ok || !j.dfd) throw new Error(j?.error ?? "Não foi possível carregar o DFD gravado.");
  const g = j.dfd;
  const so = (v: unknown) => s(v).replace(/\D/g, "").replace(/^0+/, "");
  if (!so(g.planejamento) || so(g.planejamento) !== so(novo.planejamento))
    throw new Error(`O DFD da Centi é de outro planejamento (${s(novo.planejamento) || "sem nº"} × ${s(g.planejamento) || "sem nº"}).`);
  const anoPca = g.anoPca ?? g.protocoloAnoPca ?? novo.anoPca ?? null;
  const base: DfdParseado = { ...novo, numero: g.numero, assinaturas: novo.assinaturas.length ? novo.assinaturas : g.assinaturas };
  const { dfd } = herdarTratamentos(normalizarSecoesDfd(base, undefined, anoPca).dfd, g, anoPca);
  await enviarDfdEmLotes(metaDoDfd(dfd, { anoPca, reparticaoId: g.reparticaoId, origem: "sobrescrita" }), dfd.itens, undefined, { existia: true });
  return { numero: g.numero, itens: dfd.itens.length };
}
