/**
 * O que os nós dos FLUXOS precisam do navegador: ler UM protocolo da Centi (emitido POR CÓDIGO com a emissão aprendida
 * — a mesma da tarefa "Ler a Tela Protocolo" — e lido no navegador: capa + DFDs, conferido contra o protocolo pedido).
 * Sem a emissão aprendida, o erro diz como ensinar (o fluxo nunca mexe na tela da Centi).
 */
import { analisarRespostaCenti, operacaoRecusada } from "./automacao-centi-core";
import { coerceEmissaoProtocolo, conferirLeituraProtocolo, corpoEmissaoProtocolo, type EmissaoProtocolo } from "./automacao-tela-protocolo";
import { baixarPelaExtensao, comoBlob, deBase64, type PedirExtensao, pdfDoAchado, pdfDosBytes } from "./arquivo-navegador";
import { dataIsoBrasilia } from "./format";
import type { Item } from "./fluxo-core";

export async function emissaoDoServidor(): Promise<EmissaoProtocolo | null> {
  const r = (await fetch("/api/admin/automacao/config", { cache: "no-store" })
    .then((x) => x.json())
    .catch(() => null)) as { ok?: boolean; config?: { emissaoProtocolo?: unknown } } | null;
  return r?.ok ? coerceEmissaoProtocolo(r.config?.emissaoProtocolo) : null;
}

const s = (v: unknown) => (v == null ? "" : String(v).trim());

/** Lê um protocolo (item com protocolo, ano e id) → a capa + os DFDs. Lança com a mensagem quando não dá. */
export async function lerProtocoloPorCodigo(pedir: PedirExtensao, emissao: EmissaoProtocolo | null, it: Item): Promise<Item> {
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
  const { indexarProtocoloPdf } = await import("./parse-protocolo-pdf");
  const { index, doc } = await indexarProtocoloPdf(new File([comoBlob(x.pdf)], `Protocolo ${alvo.protocolo}.pdf`, { type: "application/pdf" }));
  await doc.destroy().catch(() => undefined);
  const numeros = index.dfds.map((d) => d.numero);
  const leitura = conferirLeituraProtocolo(alvo, index.protocolo, numeros);
  return {
    leitura: leitura.estado,
    leituraTexto: leitura.texto,
    capa: { ...index.protocolo },
    totalDfds: numeros.length,
    dfds: index.dfds.map((d) => ({ numero: d.numero, sigla: d.siglaSetor, orgao: d.orgaoEntidade, objeto: d.objeto, assinaturas: d.assinaturas.length })),
  };
}
