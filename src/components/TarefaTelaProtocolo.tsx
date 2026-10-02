"use client";

import { type MutableRefObject, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { analisarRespostaCenti, linkDaResposta, operacaoRecusada, type ProtocoloAutomacao } from "@/lib/automacao-centi-core";
import { cancelarExecucao, concluirPassos, iniciarExecucaoLeitura } from "@/lib/automacao-cliente";
import {
  coerceEmissaoProtocolo,
  conferirLeituraProtocolo,
  corpoEmissaoProtocolo,
  dadosCentiValidos,
  departamentosEscolhidosValidos,
  type EmissaoProtocolo,
  emissaoDoPedido,
  falhaTransitoria,
  type LeituraProtocolo,
  mesmaEmissao,
  nomePdfEmAnalise,
  normalizarProtocolosTela,
  noSistemaTela,
  type ProtocoloEmAnalise,
} from "@/lib/automacao-tela-protocolo";
import { dataIsoBrasilia } from "@/lib/format";
import { buscarExistentes } from "@/lib/importar-dfd";
import { indexarProtocoloPdf } from "@/lib/parse-protocolo-pdf";
import { amostraBytes, baixarPelaExtensao, comoBlob, deBase64, pdfDoAchado, pdfDosBytes } from "@/lib/arquivo-navegador";
import { Badge, type Tone } from "./Badge";
import { BotaoCopiar, CelulaCopiavel } from "./BotaoCopiar";
import { Button } from "./Button";
import { Callout } from "./Callout";
import { type Column, DataTable } from "./DataTable";
import { ProtocoloUploadForm } from "./ProtocoloUploadForm";
import { SeletorMultiplo } from "./SeletorMultiplo";
import { toast } from "./Toast";

/** A resposta da extensão (o pedido à aba da Centi). */
export type RespostaTela = {
  ok: boolean;
  erro?: string;
  /** A forma da tela da Centi quando a leitura falha (para ajustar a extensão). */
  diagnostico?: string;
  departamentos?: string[];
  protocolos?: unknown[];
  total?: number;
  /** telaEmitir: o cadastro do protocolo e o documento emitido (o PDF, a resposta do operation ou o endereço). */
  dados?: unknown;
  arquivo?: { pdf?: string; resposta?: { status: number; b64: string }; link?: string };
  /** telaEmitir: o operation que a própria tela usou (a emissão "por código" é aprendida dele). */
  operacao?: unknown;
  /** pedir (GET do arquivo). */
  b64?: string;
  status?: number;
  interrompido?: boolean;
  loteId?: string;
};
type Pedir = (acao: string, dados: unknown, ms: number) => Promise<RespostaTela>;
/** O contexto da análise da importação de protocolo (a mesma da Mesa). */
type Analise = Pick<Parameters<typeof ProtocoloUploadForm>[0], "reparticoes" | "regras" | "orgaos" | "pcas">;

type EstadoDoc = "fila" | "emitindo" | "lendo" | "ok" | "atencao" | "falha";
const DOC: Record<EstadoDoc, { rotulo: string; tone: Tone }> = {
  fila: { rotulo: "Na fila", tone: "slate" },
  emitindo: { rotulo: "Emitindo…", tone: "blue" },
  lendo: { rotulo: "Lendo…", tone: "violet" },
  ok: { rotulo: "Lido", tone: "emerald" },
  atencao: { rotulo: "Atenção", tone: "amber" },
  falha: { rotulo: "Falhou", tone: "red" },
};
/** O documento de um protocolo no lote: o estado, o texto curto e o que a leitura achou. */
type Doc = { estado: EstadoDoc; texto?: string; leitura?: LeituraProtocolo; jaCadastrados?: number };
/** Quantos PDFs ficam na memória (para abrir a análise sem emitir de novo) — o resto é emitido de novo ao abrir. */
const PDFS_NA_MEMORIA = 8;

const CHAVE_ESCOLHA = "automacao:tela-departamentos";
/** Hoje em Brasília ("AAAA-MM-DD") — a data dos campos "hoje" da emissão aprendida. */
const hojeBrasilia = () => dataIsoBrasilia(new Date().toISOString());
const CARTAO = "rounded-card border border-border bg-surface p-[var(--pad-card)] shadow-ring";

function lerEscolha(): unknown {
  try {
    return JSON.parse(localStorage.getItem(CHAVE_ESCOLHA) ?? "null");
  } catch {
    return null;
  }
}
function gravarEscolha(v: string[]) {
  try {
    localStorage.setItem(CHAVE_ESCOLHA, JSON.stringify(v));
  } catch {}
}

/**
 * Tarefa "LER A TELA PROTOCOLO" (só leitura na Centi): a extensão entra na PO011 da aba "Automação PCA" pela própria
 * interface, devolve as REPARTIÇÕES do seletor Departamentos; o ADM escolhe; a extensão as seleciona, pesquisa, abre a aba
 * "Em Análise" e devolve os protocolos. "Emitir e ler" (os marcados ou TODOS): cada protocolo é emitido POR CÓDIGO e o PDF
 * é LIDO no navegador (capa + DFDs, conferido contra o protocolo pedido) — em LOTE, um por vez, sem abrir janelas, em
 * qualquer quantidade (só os últimos PDFs ficam na memória). Tocar num protocolo abre a ANÁLISE COMPLETA da importação de
 * protocolo da Mesa (capa, DFDs e itens) — nada é protocolado sozinho.
 */
export function TarefaTelaProtocolo({
  pedir,
  lote,
  interrompido,
  pronto,
  protocolos,
  analise,
  onRodando,
}: {
  pedir: Pedir;
  lote: MutableRefObject<string | null>;
  /** A interrupção pedida na extensão (o cartão da aba ou o popup). */
  interrompido: MutableRefObject<boolean>;
  /** A extensão atualizada e a Centi logada. */
  pronto: boolean;
  /** Os protocolos do sistema (a coluna "No sistema"). */
  protocolos: ProtocoloAutomacao[];
  analise: Analise;
  onRodando: (v: boolean) => void;
}) {
  const [deps, setDeps] = useState<string[] | null>(null);
  const [escolha, setEscolha] = useState<string[]>([]);
  const [lidos, setLidosEstado] = useState<{ protocolos: ProtocoloEmAnalise[]; total: number; reparticoes: string[] } | null>(null);
  const [sel, setSel] = useState<Set<string | number>>(new Set());
  const [ocupado, setOcupado] = useState<"deps" | "ler" | null>(null);
  // O andamento do documento de cada protocolo.
  // O Id da Centi de cada protocolo lido do CADASTRO (quando a grade não o trouxe).
  const [ids, setIdsEstado] = useState<Map<string, string>>(new Map());
  // A fila roda por várias chamadas assíncronas: o que ela lê (a emissão aprendida, os Ids, as repartições lidas) fica em
  // REFS — o aprendido no meio do lote vale já para os próximos protocolos (o estado seria o do render em que a fila começou).
  // A emissão "por código" do Emitir documentos (aprendida da tela da Centi; vale para todos — config do servidor).
  const emissaoRef = useRef<EmissaoProtocolo | null>(null);
  const idsRef = useRef(new Map<string, string>());
  const reparticoesRef = useRef<string[]>([]);
  const configRef = useRef<Promise<boolean> | null>(null);
  const setId = (chave: string, id: string) => {
    idsRef.current = new Map(idsRef.current).set(chave, id);
    setIdsEstado(idsRef.current);
  };
  const setLidos = (l: { protocolos: ProtocoloEmAnalise[]; total: number; reparticoes: string[] }) => {
    reparticoesRef.current = l.reparticoes;
    setLidosEstado(l);
  };
  const [docs, setDocs] = useState<Map<string, Doc>>(new Map());
  const [arquivo, setArquivo] = useState<{ file: File; n: number } | null>(null);
  // O protocolo aberto na análise completa (um por vez, à parte do lote).
  const [atual, setAtual] = useState<string | null>(null);
  const [abrindo, setAbrindo] = useState<string | null>(null);
  const [lote_, setLoteAndamento] = useState<{ feito: number; total: number } | null>(null);
  const pdfs = useRef(new Map<string, File>());
  const emitindo = lote_ !== null || abrindo !== null;
  const [falha, setFalha] = useState<{ erro: string; diagnostico?: string } | null>(null);
  function falhou(r: RespostaTela) {
    const erro = r.erro ?? "A extensão não respondeu.";
    setFalha({ erro, diagnostico: typeof r.diagnostico === "string" ? r.diagnostico.slice(0, 2000) : undefined });
    toast.error(erro, 12000);
  }
  useEffect(() => onRodando(ocupado !== null || emitindo), [ocupado, emitindo, onRodando]);

  /** Um lote curto na extensão (o cartão, a moldura e o título da aba da automação mostram o passo). */
  async function comLote<T>(titulo: string, passo: string, fn: () => Promise<T>, resumo: (r: T) => string): Promise<T> {
    const l = await pedir("lote", { fase: "inicio", titulo, total: 1 }, 8000);
    lote.current = l.loteId ?? null;
    await pedir("lote", { fase: "passo", loteId: lote.current, feito: 0, total: 1, texto: passo }, 8000);
    try {
      const r = await fn();
      if (lote.current) await pedir("lote", { fase: "fim", loteId: lote.current, resumo: resumo(r) }, 8000);
      return r;
    } finally {
      lote.current = null;
    }
  }

  async function buscarReparticoes() {
    if (ocupado) return;
    setOcupado("deps");
    setFalha(null);
    try {
      const r = await comLote("Tela Protocolo", "Lendo as repartições (Departamentos)", () => pedir("telaDepartamentos", null, 90_000), (x) =>
        x.ok ? `${x.departamentos?.length ?? 0} repartição(ões)` : (x.erro ?? "Falhou"),
      );
      if (!r.ok) return falhou(r);
      const lista = (r.departamentos ?? []).filter((d): d is string => typeof d === "string" && !!d.trim()).slice(0, 200);
      setDeps(lista);
      setEscolha(departamentosEscolhidosValidos(lerEscolha(), lista));
      if (!lista.length) toast.warning("A Centi não mostrou nenhuma repartição no seletor Departamentos.");
    } finally {
      setOcupado(null);
    }
  }

  function definirEscolha(n: string[]) {
    setEscolha(n);
    gravarEscolha(n);
  }

  async function lerEmAnalise() {
    if (ocupado || !escolha.length) return;
    setOcupado("ler");
    setSel(new Set());
    setFalha(null);
    try {
      const reparticoes = [...escolha];
      const ex = await iniciarExecucaoLeitura("protocolos-por-reparticao", "consultar", [{ chave: "em-analise", alvo: reparticoes.join("; ") }], {
        reparticoes: reparticoes.length,
      });
      const r = await comLote(
        "Tela Protocolo · Em Análise",
        `Lendo “Em Análise” de ${reparticoes.length} repartição(ões)`,
        () => pedir("telaEmAnalise", { departamentos: reparticoes }, 180_000),
        (x) => (x.ok ? `${x.protocolos?.length ?? 0} protocolo(s) em análise` : (x.erro ?? "Falhou")),
      );
      if ("id" in ex)
        await concluirPassos(ex.id, [
          { chave: "em-analise", estado: r.ok ? "ok" : "falhou", texto: r.ok ? `${r.protocolos?.length ?? 0} protocolo(s)` : (r.erro ?? "Falhou") },
        ]);
      if (!r.ok) return falhou(r);
      const ps = normalizarProtocolosTela(r.protocolos);
      setLidos({ protocolos: ps, total: typeof r.total === "number" ? r.total : ps.length, reparticoes });
      if (typeof r.total === "number" && r.total > ps.length) toast.warning(`A Centi indica ${r.total} protocolo(s), mas só ${ps.length} foram lidos.`, 10000);
      else toast.success(`${ps.length} protocolo(s) em análise.`);
    } finally {
      setOcupado(null);
    }
  }

  /** A emissão aprendida (config do servidor); a mesma leitura vale para todos (true = leu). */
  const carregarConfig = useCallback(() => {
    configRef.current = fetch("/api/admin/automacao/config", { cache: "no-store" })
      .then((r) => r.json() as Promise<{ ok?: boolean; config?: { emissaoProtocolo?: unknown } }>)
      .then((x) => {
        if (!x?.ok) return false;
        emissaoRef.current = coerceEmissaoProtocolo(x.config?.emissaoProtocolo);
        return true;
      })
      .catch(() => false);
    return configRef.current;
  }, []);
  useEffect(() => {
    void carregarConfig();
  }, [carregarConfig]);

  /** O operation da tela + o protocolo → a emissão "por código" (grava no servidor só quando mudou). */
  async function aprenderEmissao(operacao: unknown, alvo: { id: string; protocolo: string; ano: string }) {
    const nova = emissaoDoPedido(operacao, { ...alvo, hoje: hojeBrasilia() });
    if (!nova || mesmaEmissao(nova, emissaoRef.current)) return;
    emissaoRef.current = nova;
    await fetch("/api/admin/automacao/config", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ emissaoProtocolo: nova }),
    }).catch(() => {});
  }

  // ---------------------------------------------------------------- EMITIR + LER (o lote) · ABRIR A ANÁLISE (um)
  const marcar = (chave: string, d: Doc) =>
    setDocs((m) => {
      const n = new Map(m);
      n.set(chave, d);
      return n;
    });

  /** O PDF de uma resposta da Centi ao operation: o arquivo cru (PDF ou ZIP) ou a chave do arquivo — baixado direto. */
  async function pdfDaResposta(b64: string, status: number): Promise<{ pdf: Uint8Array } | { erro: string; amostra?: string }> {
    const bytes = deBase64(b64);
    const direto = await pdfDosBytes(bytes).catch(() => null);
    if (direto) return { pdf: direto };
    return pdfDoAchado(analisarRespostaCenti(bytes, status), baixarPelaExtensao(pedir));
  }

  /** O PDF do que a extensão capturou na emissão pela tela (o arquivo, a resposta do operation ou o endereço). */
  async function pdfDaEmissao(a: RespostaTela["arquivo"]): Promise<{ pdf: Uint8Array } | { erro: string; amostra?: string }> {
    if (a?.pdf) {
      const pdf = await pdfDosBytes(deBase64(a.pdf)).catch(() => null);
      return pdf ? { pdf } : { erro: "O arquivo emitido pela Centi não tem PDF.", amostra: amostraBytes(deBase64(a.pdf)) };
    }
    if (a?.resposta) return pdfDaResposta(a.resposta.b64, a.resposta.status);
    if (a?.link) {
      const baixar = baixarPelaExtensao(pedir);
      const d = await baixar(a.link);
      const pdf = await pdfDosBytes(d.bytes).catch(() => null);
      if (pdf) return { pdf };
      const link = d.bytes ? linkDaResposta(d.bytes) : null;
      const c = link ? await baixar(link) : null;
      const pdf2 = await pdfDosBytes(c?.bytes ?? null).catch(() => null);
      if (pdf2) return { pdf: pdf2 };
      return { erro: "Não consegui baixar o arquivo do “Emitir documentos”.", amostra: `${a.link.split("?")[0]} → ${d.status || d.erro || "sem resposta"} · ${amostraBytes(d.bytes)}` };
    }
    return { erro: "A Centi não entregou o PDF do “Emitir documentos”." };
  }

  /**
   * A emissão POR CÓDIGO (o operation aprendido com o protocolo), como o Emitir DFD — sem tocar na tela da Centi.
   * `recusada` = a extensão deste navegador ainda não conhece a operação, ou a Centi a recusou (a tela ensina de novo).
   */
  async function emitirPorCodigo(
    e: EmissaoProtocolo,
    alvo: { id: string; protocolo: string; ano: string },
  ): Promise<{ pdf: Uint8Array } | { erro: string; amostra?: string } | { recusada: string }> {
    const corpo = corpoEmissaoProtocolo(e, { ...alvo, hoje: hojeBrasilia() });
    if (!corpo) return { erro: "Sem o Id do protocolo na Centi." };
    const r = await pedir("pedir", { metodo: "POST", caminho: "restauth/operation", corpo }, 300_000);
    if (r.interrompido) interrompido.current = true;
    if (!r.ok || r.b64 == null) return /só a operação/i.test(r.erro ?? "") ? { recusada: r.erro ?? "" } : { erro: r.erro ?? "A extensão não respondeu." };
    // A Centi recusou a operação guardada (permissão, ou ela mudou a operação): a tela ensina de novo.
    const bytes = deBase64(r.b64);
    if (bytes.length < 64 * 1024 && operacaoRecusada(new TextDecoder().decode(bytes))) return { recusada: "A Centi recusou a operação guardada." };
    return pdfDaResposta(r.b64, r.status ?? 0);
  }

  /**
   * O PDF dos documentos de UM protocolo. POR CÓDIGO (o Emitir documentos aprendido + o protocolo): direto, como os DFDs
   * — a tela da Centi não é tocada. A tela emite só quando o código não dá: a operação ainda não foi aprendida (no sistema
   * ou neste navegador), a Centi a recusou (mudou ou sem permissão) ou a grade não trouxe o Id — e ensina de novo para os
   * próximos. Uma falha TRANSITÓRIA (rede, Centi fora do ar) tenta UMA vez de novo.
   */
  async function obterPdf(p: ProtocoloEmAnalise, tentativa = 0): Promise<{ pdf: Uint8Array } | { erro: string; diagnostico?: string }> {
    const id = p.id || idsRef.current.get(p.chave) || "";
    const e = emissaoRef.current;
    let x: { pdf: Uint8Array } | { erro: string; amostra?: string } | { recusada: string } | null =
      e && id ? await emitirPorCodigo(e, { id, protocolo: p.protocolo, ano: p.ano }) : null;
    if (interrompido.current) return { erro: "Interrompido na extensão." };
    if (!x || "recusada" in x) {
      const r = await pedir("telaEmitir", { protocolo: p.protocolo, ano: p.ano, departamentos: reparticoesRef.current }, 300_000);
      if (r.interrompido) interrompido.current = true;
      const d = r.ok ? dadosCentiValidos(r.dados) : null;
      if (d?.id) setId(p.chave, d.id);
      if (!r.ok) x = { erro: r.erro ?? "A extensão não respondeu.", amostra: r.diagnostico };
      else {
        if (r.operacao) await aprenderEmissao(r.operacao, { id: d?.id || id, protocolo: p.protocolo, ano: p.ano });
        x = await pdfDaEmissao(r.arquivo);
      }
    }
    if ("pdf" in x) return { pdf: x.pdf };
    if (tentativa === 0 && !interrompido.current && falhaTransitoria(x.erro)) {
      await new Promise((ok) => setTimeout(ok, 3000));
      return obterPdf(p, 1);
    }
    const em = emissaoRef.current;
    const enviado = em ? corpoEmissaoProtocolo(em, { id: id || "0", protocolo: p.protocolo, ano: p.ano, hoje: hojeBrasilia() }) : null;
    const op = em && enviado ? `operação enviada: ModuleKey ${em.moduleKey} · ${enviado.Params.map((q) => `${q.Key}=${q.Key === em.param ? "<Id>" : q.Value}`).join("; ")}` : "";
    return { erro: x.erro, diagnostico: [x.amostra, op].filter(Boolean).join("\n") || undefined };
  }

  /** Guarda o PDF na memória (os últimos PDFS_NA_MEMORIA — um lote enorme não acumula PDFs). */
  function guardarPdf(chave: string, file: File) {
    pdfs.current.delete(chave);
    pdfs.current.set(chave, file);
    while (pdfs.current.size > PDFS_NA_MEMORIA) pdfs.current.delete(pdfs.current.keys().next().value as string);
  }

  /** LÊ o PDF emitido (capa + DFDs, no navegador) e CONFERE que é do protocolo pedido; os DFDs já cadastrados contam. */
  async function lerPdf(p: ProtocoloEmAnalise, file: File): Promise<Doc> {
    try {
      const { index, doc } = await indexarProtocoloPdf(file);
      await doc.destroy().catch(() => undefined);
      const numeros = index.dfds.map((d) => d.numero);
      const leitura = conferirLeituraProtocolo({ ...p, id: p.id || idsRef.current.get(p.chave) || "" }, index.protocolo, numeros);
      if (leitura.estado === "falha") return { estado: "falha", texto: leitura.texto, leitura };
      const existentes = numeros.length ? await buscarExistentes(numeros).catch(() => null) : new Map();
      const ja = existentes ? numeros.filter((n) => existentes.has(n.trim())).length : undefined;
      const texto = `${leitura.texto}${ja != null ? ` · ${ja} já cadastrado(s)` : ""}`;
      return { estado: leitura.estado, texto, leitura, jaCadastrados: ja };
    } catch (e) {
      return { estado: "falha", texto: e instanceof Error ? e.message : "Não consegui ler o PDF." };
    }
  }

  /**
   * O LOTE: emite e lê cada protocolo, um por vez, sem abrir janelas — qualquer quantidade (o PDF não fica acumulado na
   * memória; o resultado de cada um fica na coluna Documento). A análise completa de um protocolo abre ao tocar na linha.
   */
  async function analisarLote(lista: ProtocoloEmAnalise[]) {
    if (!lista.length || ocupado || emitindo) return;
    // A emissão aprendida tem de estar carregada antes do 1º protocolo (sem ela, tudo iria pela tela); falhou = lê de novo.
    if (!(await (configRef.current ?? carregarConfig()))) await carregarConfig();
    interrompido.current = false;
    setFalha(null);
    setDocs((m) => {
      const n = new Map(m);
      for (const p of lista) n.set(p.chave, { estado: "fila" });
      return n;
    });
    setLoteAndamento({ feito: 0, total: lista.length });
    const l = await pedir("lote", { fase: "inicio", titulo: "Tela Protocolo · Emitir e ler", total: lista.length }, 8000);
    lote.current = l.loteId ?? null;
    const ex = await iniciarExecucaoLeitura(
      "protocolos-por-reparticao",
      "baixar",
      lista.map((p) => ({ chave: p.chave, alvo: `Protocolo ${p.protocolo}/${p.ano}` })),
      { protocolos: lista.length },
    );
    const exId = "id" in ex ? ex.id : null;
    let feitos: { chave: string; estado: "ok" | "falhou"; texto: string }[] = [];
    const descarregar = async () => {
      if (exId != null && feitos.length) await concluirPassos(exId, feitos).catch(() => undefined);
      feitos = [];
    };
    const conta = { ok: 0, atencao: 0, falha: 0 };
    try {
      for (let i = 0; i < lista.length; i++) {
        if (interrompido.current) break;
        const p = lista[i];
        setLoteAndamento({ feito: i, total: lista.length });
        if (lote.current)
          await pedir("lote", { fase: "passo", loteId: lote.current, feito: i, total: lista.length, texto: `Protocolo ${p.protocolo}/${p.ano}` }, 8000);
        marcar(p.chave, { estado: "emitindo" });
        const r = await obterPdf(p);
        let doc: Doc;
        if ("erro" in r) {
          doc = { estado: "falha", texto: r.erro };
          if (r.diagnostico) setFalha({ erro: `Protocolo ${p.protocolo}/${p.ano}: ${r.erro}`, diagnostico: r.diagnostico });
        } else {
          marcar(p.chave, { estado: "lendo" });
          const file = new File([comoBlob(r.pdf)], nomePdfEmAnalise(p), { type: "application/pdf" });
          doc = await lerPdf(p, file);
          if (doc.estado !== "falha") guardarPdf(p.chave, file);
        }
        marcar(p.chave, doc);
        conta[doc.estado === "ok" ? "ok" : doc.estado === "atencao" ? "atencao" : "falha"]++;
        feitos.push({ chave: p.chave, estado: doc.estado === "falha" ? "falhou" : "ok", texto: doc.texto ?? "" });
        if (feitos.length >= 50) await descarregar();
        // Cede o navegador entre um protocolo e outro (a tela segue respondendo num lote enorme).
        await new Promise((ok) => setTimeout(ok, 0));
      }
    } finally {
      await descarregar();
      if (interrompido.current) {
        setDocs((m) => new Map([...m].map(([k, v]) => [k, v.estado === "fila" ? { estado: "falha" as const, texto: "Interrompido na extensão." } : v])));
        if (exId != null) await cancelarExecucao(exId).catch(() => undefined);
      }
      const resumo = `${conta.ok} lido(s) · ${conta.atencao} em atenção · ${conta.falha} com falha`;
      if (lote.current) await pedir("lote", { fase: "fim", loteId: lote.current, resumo: interrompido.current ? `Interrompido — ${resumo}` : resumo }, 8000);
      lote.current = null;
      setLoteAndamento(null);
      if (interrompido.current) toast.warning(`Interrompido na extensão — ${resumo}.`, 10000);
      else if (conta.falha) toast.warning(resumo, 10000);
      else toast.success(resumo);
    }
  }

  /** Abre a ANÁLISE COMPLETA de um protocolo (a mesma da importação): o PDF da memória ou emitido agora. */
  async function abrirAnalise(p: ProtocoloEmAnalise) {
    if (ocupado || emitindo) return;
    const ja = pdfs.current.get(p.chave);
    if (ja) {
      setAtual(p.chave);
      return setArquivo((a) => ({ file: ja, n: (a?.n ?? 0) + 1 }));
    }
    if (!(await (configRef.current ?? carregarConfig()))) await carregarConfig();
    interrompido.current = false;
    setFalha(null);
    setAbrindo(p.chave);
    marcar(p.chave, { ...(docs.get(p.chave) ?? {}), estado: "emitindo" });
    try {
      const r = await obterPdf(p);
      if ("erro" in r) {
        marcar(p.chave, { estado: "falha", texto: r.erro });
        setFalha({ erro: `Protocolo ${p.protocolo}/${p.ano}: ${r.erro}`, diagnostico: r.diagnostico });
        return;
      }
      const file = new File([comoBlob(r.pdf)], nomePdfEmAnalise(p), { type: "application/pdf" });
      marcar(p.chave, { estado: "lendo" });
      const doc = await lerPdf(p, file);
      marcar(p.chave, doc);
      if (doc.estado === "falha") return setFalha({ erro: `Protocolo ${p.protocolo}/${p.ano}: ${doc.texto}` });
      guardarPdf(p.chave, file);
      setAtual(p.chave);
      setArquivo((a) => ({ file, n: (a?.n ?? 0) + 1 }));
    } finally {
      setAbrindo(null);
    }
  }

  /** A análise foi fechada (ou o PDF não abriu na análise). */
  function aoFechar(erro?: string) {
    setAtual(null);
    if (erro) setFalha({ erro });
  }

  const casarSistema = useMemo(() => noSistemaTela(protocolos), [protocolos]);
  const idDe = useCallback((p: ProtocoloEmAnalise) => p.id || ids.get(p.chave) || "", [ids]);
  const casar = useCallback((p: ProtocoloEmAnalise) => casarSistema({ ...p, id: idDe(p) }), [casarSistema, idDe]);
  const colunas = useMemo<Column<ProtocoloEmAnalise>[]>(
    () => [
      {
        key: "protocolo",
        header: "Protocolo",
        nowrap: true,
        value: (p) => p.protocolo,
        render: (p) => (
          <CelulaCopiavel copiar={p.protocolo} rotulo="nº do protocolo">
            {p.protocolo}
          </CelulaCopiavel>
        ),
      },
      { key: "ano", header: "Ano", nowrap: true, value: (p) => p.ano, render: (p) => p.ano || "—" },
      {
        key: "id",
        header: "Id",
        nowrap: true,
        value: (p) => idDe(p),
        render: (p) =>
          idDe(p) ? (
            <CelulaCopiavel copiar={idDe(p)} rotulo="Id do protocolo">
              {idDe(p)}
            </CelulaCopiavel>
          ) : (
            <span className="text-faint">—</span>
          ),
      },
      { key: "entrada", header: "Entrada", nowrap: true, value: (p) => p.entrada, render: (p) => p.entrada || "—" },
      { key: "departamento", header: "Departamento", value: (p) => p.departamento, render: (p) => p.departamento || "—" },
      { key: "interessado", header: "Interessado", value: (p) => p.interessado, render: (p) => p.interessado || "—" },
      { key: "solicitante", header: "Solicitante", value: (p) => p.solicitante, render: (p) => p.solicitante || "—" },
      { key: "natureza", header: "Natureza", value: (p) => p.natureza, render: (p) => p.natureza || "—" },
      {
        key: "documento",
        header: "Documento",
        nowrap: true,
        value: (p) => {
          const d = docs.get(p.chave);
          return d ? DOC[d.estado].rotulo : "—";
        },
        render: (p) => {
          const d = docs.get(p.chave);
          return d ? (
            <span className="inline-flex items-center gap-1.5" title={d.texto}>
              <Badge tone={DOC[d.estado].tone} dot>
                {DOC[d.estado].rotulo}
              </Badge>
              {d.texto && <span className="max-w-[18rem] truncate text-xs text-muted">{d.texto}</span>}
            </span>
          ) : (
            <span className="text-faint">—</span>
          );
        },
      },
      {
        key: "sistema",
        header: "No sistema",
        nowrap: true,
        value: (p) => (casar(p) ? "No sistema" : "Novo"),
        render: (p) =>
          casar(p) ? (
            <Badge tone="emerald" dot>
              No sistema
            </Badge>
          ) : (
            <Badge tone="slate">Novo</Badge>
          ),
      },
    ],
    [casar, docs, idDe],
  );

  const opcoesDeps = useMemo(() => (deps ?? []).map((valor) => ({ valor })), [deps]);
  return (
    <div className="flex min-h-0 flex-col gap-[var(--gap-block)] lg:h-full">
      <section className={`${CARTAO} shrink-0 space-y-3`}>
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="shrink-0 text-sm font-bold text-text">1 · Repartições</h2>
          <div className="min-w-0 flex-1 basis-56 lg:max-w-96">
            <SeletorMultiplo
              suspenso
              rotulo={deps ? "Repartições" : "Busque as repartições"}
              textoVazio="Nenhuma"
              opcoes={opcoesDeps}
              selecionados={escolha}
              onChange={definirEscolha}
              disabled={!deps || !!ocupado}
            />
          </div>
          <Button size="sm" variant={deps ? "secondary" : "primary"} onClick={() => void buscarReparticoes()} loading={ocupado === "deps"} disabled={!pronto || !!ocupado}>
            {deps ? "Buscar de novo" : "Buscar repartições"}
          </Button>
          <span className="mx-1 hidden h-6 w-px bg-border lg:block" />
          <h2 className="shrink-0 text-sm font-bold text-text">2 · Em Análise</h2>
          <span className="min-w-0 truncate text-xs text-muted">
            {lidos ? `${lidos.protocolos.length} protocolo(s) · ${lidos.reparticoes.length} repartição(ões)` : deps ? `${escolha.length} de ${deps.length} repartição(ões)` : "da Tela Protocolo (PO011) da Centi"}
          </span>
          <Button size="sm" className="ml-auto" onClick={() => void lerEmAnalise()} loading={ocupado === "ler"} disabled={!pronto || !!ocupado || !escolha.length}>
            Ler “Em Análise”
          </Button>
        </div>
        {falha && (
          <Callout kind="danger">
            <div className="flex flex-wrap items-center gap-2">
              <span className="min-w-0 flex-1">{falha.erro}</span>
              {falha.diagnostico && <BotaoCopiar texto={`${falha.erro}\n${falha.diagnostico}`} rotulo="Copiar diagnóstico" titulo="A forma da tela da Centi — cole na conversa para ajustar a leitura" />}
            </div>
          </Callout>
        )}
      </section>
      <div className="min-h-0 min-w-0 flex-1">
        <DataTable
          columns={colunas}
          rows={lidos?.protocolos ?? []}
          getKey={(p) => p.chave}
          selectable
          selected={sel}
          onSelected={setSel}
          onRowClick={pronto && !ocupado && !emitindo ? (p) => void abrirAnalise(p) : undefined}
          activeKey={atual}
          density="compact"
          scrollInterno
          exportar={{ nome: "Em Análise" }}
          acoesRodape={
            <Button
              size="sm"
              onClick={() => void analisarLote(sel.size ? (lidos?.protocolos ?? []).filter((p) => sel.has(p.chave)) : (lidos?.protocolos ?? []))}
              disabled={!pronto || !!ocupado || emitindo || !lidos?.protocolos.length}
              loading={lote_ !== null}
              title="Emite os documentos de cada protocolo na Centi e lê o PDF (capa e DFDs), um por vez, sem abrir janelas — toque numa linha para a análise completa"
            >
              {lote_ ? `Lendo ${lote_.feito + 1} de ${lote_.total}` : sel.size ? `Emitir e ler (${sel.size})` : `Emitir e ler todos (${lidos?.protocolos.length ?? 0})`}
            </Button>
          }
          vazio={lidos ? "Nenhum protocolo em análise nas repartições escolhidas." : "Escolha as repartições e toque em “Ler Em Análise”."}
          resumo={(ls) => `${ls.length} protocolo(s) · ${ls.filter((p) => casar(p)).length} no sistema`}
        />
      </div>
      <ProtocoloUploadForm
        reparticoes={analise.reparticoes}
        reparticaoAtivaId={null}
        pcas={analise.pcas}
        regras={analise.regras}
        orgaos={analise.orgaos}
        arquivo={arquivo}
        onFechado={aoFechar}
      />
    </div>
  );
}
