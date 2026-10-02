"use client";

import { type MutableRefObject, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { analisarRespostaCenti, linkDaResposta, type ProtocoloAutomacao } from "@/lib/automacao-centi-core";
import { cancelarExecucao, concluirPassos, iniciarExecucaoLeitura } from "@/lib/automacao-cliente";
import {
  coerceEmissaoProtocolo,
  corpoEmissaoProtocolo,
  dadosCentiValidos,
  departamentosEscolhidosValidos,
  type EmissaoProtocolo,
  emissaoDoPedido,
  mesmaEmissao,
  nomePdfEmAnalise,
  normalizarProtocolosTela,
  noSistemaTela,
  type ProtocoloEmAnalise,
} from "@/lib/automacao-tela-protocolo";
import { amostraBytes, baixarPelaExtensao, comoBlob, deBase64, pdfDoAchado, pdfDosBytes } from "@/lib/arquivo-navegador";
import { Badge, type Tone } from "./Badge";
import { BotaoCopiar, CelulaCopiavel } from "./BotaoCopiar";
import { Button } from "./Button";
import { Callout } from "./Callout";
import { type Column, DataTable } from "./DataTable";
import { Checkbox } from "./Field";
import { ProtocoloUploadForm } from "./ProtocoloUploadForm";
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

type EstadoDoc = "fila" | "emitindo" | "analise" | "feito" | "falha";
const DOC: Record<EstadoDoc, { rotulo: string; tone: Tone }> = {
  fila: { rotulo: "Na fila", tone: "slate" },
  emitindo: { rotulo: "Emitindo…", tone: "blue" },
  analise: { rotulo: "Em análise", tone: "violet" },
  feito: { rotulo: "Analisado", tone: "emerald" },
  falha: { rotulo: "Falhou", tone: "red" },
};

const CHAVE_ESCOLHA = "automacao:tela-departamentos";
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
 * "Em Análise" e devolve os protocolos. Tocar num protocolo (ou "Emitir e analisar" nos marcados): a extensão abre o
 * cadastro dele na Centi, lê TODOS os dados, emite pelo Operações → Emitir documentos e o PDF abre na MESMA análise da
 * importação de protocolo da Mesa (capa, DFDs e itens) — nada é protocolado sozinho; um por vez.
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
  const [lidos, setLidos] = useState<{ protocolos: ProtocoloEmAnalise[]; total: number; reparticoes: string[] } | null>(null);
  const [sel, setSel] = useState<Set<string | number>>(new Set());
  const [ocupado, setOcupado] = useState<"deps" | "ler" | null>(null);
  // O andamento do documento de cada protocolo.
  // O Id da Centi de cada protocolo lido do CADASTRO (quando a grade não o trouxe).
  const [ids, setIds] = useState<Map<string, string>>(new Map());
  // A emissão "por código" do Emitir documentos (aprendida da tela da Centi; vale para todos — config do servidor).
  const [emissao, setEmissao] = useState<EmissaoProtocolo | null>(null);
  const [docs, setDocs] = useState<Map<string, { estado: EstadoDoc; erro?: string }>>(new Map());
  const [arquivo, setArquivo] = useState<{ file: File; n: number } | null>(null);
  const [atual, setAtual] = useState<string | null>(null);
  const fila = useRef<ProtocoloEmAnalise[]>([]);
  const pdfs = useRef(new Map<string, File>());
  const execucao = useRef<{ id: number; feitos: { chave: string; estado: "ok" | "falhou"; texto: string }[] } | null>(null);
  const emitindo = [...docs.values()].some((d) => d.estado === "fila" || d.estado === "emitindo" || d.estado === "analise");
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

  function alternar(d: string) {
    setEscolha((e) => {
      const n = e.includes(d) ? e.filter((x) => x !== d) : [...e, d];
      gravarEscolha(n);
      return n;
    });
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

  useEffect(() => {
    fetch("/api/admin/automacao/config")
      .then((r) => r.json() as Promise<{ ok?: boolean; config?: { emissaoProtocolo?: unknown } }>)
      .then((x) => setEmissao(x?.ok ? coerceEmissaoProtocolo(x.config?.emissaoProtocolo) : null))
      .catch(() => {});
  }, []);

  /** O operation da tela + o Id → a emissão "por código" (grava no servidor só quando mudou). */
  async function aprenderEmissao(operacao: unknown, id: string | null | undefined) {
    const nova = emissaoDoPedido(operacao, id);
    if (!nova || mesmaEmissao(nova, emissao)) return;
    setEmissao(nova);
    await fetch("/api/admin/automacao/config", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ emissaoProtocolo: nova }),
    }).catch(() => {});
  }

  // ---------------------------------------------------------------- EMITIR + ANALISAR (um por vez)
  const marcar = (chave: string, estado: EstadoDoc, erro?: string) =>
    setDocs((m) => {
      const n = new Map(m);
      n.set(chave, { estado, erro });
      return n;
    });

  /** O PDF de uma resposta da Centi ao operation: o arquivo cru (PDF ou ZIP) ou a chave do arquivo — baixado por ela. */
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

  /** A emissão POR CÓDIGO (o operation aprendido com o Id do protocolo), como o Emitir DFD. Sem modelo/Id ou recusada = null. */
  async function emitirPorCodigo(id: string): Promise<{ pdf: Uint8Array } | { erro: string; amostra?: string } | null> {
    const corpo = emissao ? corpoEmissaoProtocolo(emissao, id) : null;
    if (!corpo) return null;
    const r = await pedir("pedir", { metodo: "POST", caminho: "restauth/operation", corpo }, 150_000);
    if (!r.ok || r.b64 == null) return null;
    return pdfDaResposta(r.b64, r.status ?? 0);
  }

  /** Emite o próximo da fila e abre a análise (falhou → marca e segue). */
  async function proximo() {
    const p = fila.current.shift();
    setAtual(p?.chave ?? null);
    if (!p) {
      if (execucao.current) {
        await concluirPassos(execucao.current.id, execucao.current.feitos);
        if (interrompido.current) await cancelarExecucao(execucao.current.id);
      }
      execucao.current = null;
      if (lote.current) await pedir("lote", { fase: "fim", loteId: lote.current, resumo: interrompido.current ? "Interrompido." : "Protocolos analisados." }, 8000);
      lote.current = null;
      if (interrompido.current) {
        setDocs((m) => new Map([...m].map(([k, v]) => [k, v.estado === "fila" ? { estado: "falha" as const, erro: "Interrompido na extensão." } : v])));
        toast.warning("Interrompido na extensão.");
      }
      return;
    }
    const falhar = (erro: string, diagnostico?: string) => {
      marcar(p.chave, "falha", erro);
      setFalha({ erro: `Protocolo ${p.protocolo}/${p.ano}: ${erro}`, diagnostico });
      execucao.current?.feitos.push({ chave: p.chave, estado: "falhou", texto: erro });
      if (interrompido.current) fila.current = [];
      void proximo();
    };
    const ja = pdfs.current.get(p.chave);
    if (ja) {
      marcar(p.chave, "analise");
      return setArquivo((a) => ({ file: ja, n: (a?.n ?? 0) + 1 }));
    }
    marcar(p.chave, "emitindo");
    if (lote.current) await pedir("lote", { fase: "passo", loteId: lote.current, feito: 0, total: 1, texto: `Emitindo os documentos do protocolo ${p.protocolo}/${p.ano}` }, 8000);
    // 1) POR CÓDIGO (o Emitir documentos aprendido + o Id): direto, como os DFDs. 2) Sem ele (ou recusado): pela TELA
    // da Centi — abre o cadastro, Operações → Emitir documentos —, que também ensina a emissão por código.
    const id = p.id || ids.get(p.chave) || "";
    let x = id ? await emitirPorCodigo(id) : null;
    if (!x || "erro" in x) {
      const r = await pedir("telaEmitir", { protocolo: p.protocolo, ano: p.ano, departamentos: lidos?.reparticoes ?? [] }, 300_000);
      if (r.interrompido) interrompido.current = true;
      const d = r.ok ? dadosCentiValidos(r.dados) : null;
      if (d?.id) setIds((m) => new Map(m).set(p.chave, d.id as string));
      if (!r.ok) return falhar(r.erro ?? "A extensão não respondeu.", r.diagnostico);
      x = await pdfDaEmissao(r.arquivo);
      if (r.operacao) await aprenderEmissao(r.operacao, d?.id || id);
    }
    if ("erro" in x) return falhar(x.erro, x.amostra);
    const file = new File([comoBlob(x.pdf)], nomePdfEmAnalise(p), { type: "application/pdf" });
    pdfs.current.set(p.chave, file);
    marcar(p.chave, "analise");
    setArquivo((a) => ({ file, n: (a?.n ?? 0) + 1 }));
  }

  /** A análise foi fechada (ou o PDF não abriu): o atual termina e segue o próximo. */
  function aoFechar(erro?: string) {
    if (!atual) return;
    marcar(atual, erro ? "falha" : "feito", erro);
    if (erro) setFalha({ erro });
    execucao.current?.feitos.push({ chave: atual, estado: erro ? "falhou" : "ok", texto: erro ?? "Aberto na análise da importação." });
    void proximo();
  }

  async function emitir(lista: ProtocoloEmAnalise[]) {
    if (!lista.length || ocupado || emitindo) return;
    interrompido.current = false;
    setFalha(null);
    fila.current = [...lista];
    setDocs((m) => {
      const n = new Map(m);
      for (const p of lista) n.set(p.chave, { estado: "fila" });
      return n;
    });
    const l = await pedir("lote", { fase: "inicio", titulo: "Tela Protocolo · Emitir e analisar", total: lista.length }, 8000);
    lote.current = l.loteId ?? null;
    const ex = await iniciarExecucaoLeitura(
      "protocolos-por-reparticao",
      "baixar",
      lista.map((p) => ({ chave: p.chave, alvo: `Protocolo ${p.protocolo}/${p.ano}` })),
      { protocolos: lista.length },
    );
    execucao.current = "id" in ex ? { id: ex.id, feitos: [] } : null;
    void proximo();
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
        value: (p) => DOC[docs.get(p.chave)?.estado ?? "fila"].rotulo,
        render: (p) => {
          const d = docs.get(p.chave);
          return d ? (
            <span title={d.erro}>
              <Badge tone={DOC[d.estado].tone} dot>
                {DOC[d.estado].rotulo}
              </Badge>
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

  const todas = !!deps?.length && escolha.length === deps.length;
  return (
    <div className="flex min-h-0 flex-col gap-[var(--gap-block)] xl:h-full">
      <section className={`${CARTAO} space-y-3`}>
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="text-sm font-bold text-text">1 · Repartições</h2>
          <span className="text-xs text-muted">{deps ? `${escolha.length} de ${deps.length} escolhida(s)` : "da Tela Protocolo (PO011) da Centi"}</span>
          <div className="ml-auto flex flex-wrap items-center gap-2">
            {deps && deps.length > 1 && (
              <Button size="sm" variant="ghost" onClick={() => definirEscolha(todas ? [] : deps)}>
                {todas ? "Nenhuma" : "Todas"}
              </Button>
            )}
            <Button size="sm" variant={deps ? "secondary" : "primary"} onClick={() => void buscarReparticoes()} loading={ocupado === "deps"} disabled={!pronto || !!ocupado}>
              {deps ? "Buscar de novo" : "Buscar repartições"}
            </Button>
          </div>
        </div>
        {deps && (
          <div className="grid gap-x-4 gap-y-1 sm:grid-cols-2 xl:grid-cols-4">
            {deps.map((d) => (
              <Checkbox key={d} label={d} checked={escolha.includes(d)} onChange={() => alternar(d)} disabled={!!ocupado} />
            ))}
          </div>
        )}
        <div className="flex flex-wrap items-center gap-2 border-t border-border pt-3">
          <h2 className="text-sm font-bold text-text">2 · Em Análise</h2>
          <span className="text-xs text-muted">
            {lidos ? `${lidos.protocolos.length} protocolo(s) · ${lidos.reparticoes.length} repartição(ões)` : "a extensão escolhe as repartições, pesquisa e lê a aba"}
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
          onRowClick={pronto && !ocupado && !emitindo ? (p) => void emitir([p]) : undefined}
          activeKey={atual}
          density="compact"
          scrollInterno
          exportar={{ nome: "Em Análise" }}
          acoesRodape={
            <Button
              size="sm"
              onClick={() => void emitir((lidos?.protocolos ?? []).filter((p) => sel.has(p.chave)))}
              disabled={!pronto || !!ocupado || emitindo || !sel.size}
              loading={emitindo}
              title="Emite os documentos de cada marcado na Centi e abre a análise, um por vez"
            >
              Emitir e analisar ({sel.size})
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
