"use client";

import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { faltasObrigatorias } from "@/lib/dfd-validation";
import { num } from "@/lib/format";
import { stripAccents } from "@/lib/normalize";
import { type DfdParseado, parseDfd } from "@/lib/parse-dfd";
import { parseDfdPdf } from "@/lib/parse-dfd-pdf";
import { Button } from "./Button";
import { Callout } from "./Callout";
import { DfdView, type DfdVisual } from "./DfdView";
import { inputCls, labelCls } from "./formStyles";
import { IconAlert, IconBuilding, IconCheck, IconFile, IconSpinner, IconUpload } from "./icons";
import { Modal } from "./Modal";

type Rep = { id: number; codigo: string; nome: string };
type Status = "idle" | "parsing" | "ready" | "sending" | "done" | "error";

const norm = (s: string) => stripAccents(s.trim().toUpperCase());

/** Chave de NOME p/ casar secretarias com siglas divergentes (ignora acentos,
 * conectores e "MUNICIPAL"). Ex.: "SECRETARIA MUNICIPAL DE INFRAESTRUTURA RURAL"
 * e "Secretaria de Infraestrutura Rural" → "SECRETARIA INFRAESTRUTURA RURAL". */
const chaveNome = (s: string) =>
  stripAccents(s)
    .toUpperCase()
    .replace(/\b(DE|DA|DO|DAS|DOS|E|MUNICIPAL)\b/g, " ")
    .replace(/[^A-Z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");

export function DfdUploadForm({
  reparticoes,
  reparticaoAtivaId = null,
}: {
  reparticoes: Rep[];
  reparticaoAtivaId?: number | null;
}) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [status, setStatus] = useState<Status>("idle");
  const [erro, setErro] = useState<string | null>(null);
  const [preview, setPreview] = useState<DfdParseado | null>(null);
  const [repId, setRepId] = useState<number | null>(null);
  const [autoMatch, setAutoMatch] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [resultado, setResultado] = useState<{
    numero: string;
    itens: number;
    repNome: string | null;
    foraDoHead: boolean;
  } | null>(null);

  async function handleFile(file: File) {
    setErro(null);
    setResultado(null);
    const ehPdf = /\.pdf$/i.test(file.name);
    if (!ehPdf && !/\.xlsx?$/i.test(file.name)) {
      setStatus("error");
      setErro("Envie o DFD em .xlsx ou .pdf (emitido pelo sistema).");
      return;
    }
    setStatus("parsing");
    try {
      const d = ehPdf ? await parseDfdPdf(file) : await parseDfd(file);
      let matched: number | null = null;
      // 1) casa a sigla do Setor Requisitante com o código da repartição.
      if (d.siglaSetor) {
        const r = reparticoes.find((x) => norm(x.codigo) === d.siglaSetor);
        if (r) matched = r.id;
      }
      // 2) fallback pelo NOME da secretaria (cobre sigla divergente, ex.: SMIR × SIR).
      if (matched == null && d.setorRequisitante) {
        const nomeSetor =
          d.setorRequisitante.split(/\s+[-–—]\s+/).slice(1).join(" - ") || d.setorRequisitante;
        const alvo = chaveNome(nomeSetor);
        const r = alvo ? reparticoes.find((x) => chaveNome(x.nome) === alvo) : undefined;
        if (r) matched = r.id;
      }
      setPreview(d);
      setRepId(matched);
      setAutoMatch(matched != null);
      setStatus("ready");
    } catch (e) {
      setStatus("error");
      setErro(e instanceof Error ? e.message : "Falha ao ler o DFD.");
    }
  }

  async function enviar() {
    if (!preview) return;
    setStatus("sending");
    setErro(null);
    try {
      const res = await fetch("/api/dfd", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          numero: preview.numero,
          planejamento: preview.planejamento,
          tipo: preview.tipo,
          objeto: preview.objeto,
          orgaoEntidade: preview.orgaoEntidade,
          setorRequisitante: preview.setorRequisitante,
          siglaSetor: preview.siglaSetor,
          responsavel: preview.responsavel,
          matricula: preview.matricula,
          email: preview.email,
          telefone: preview.telefone,
          reparticaoId: repId,
          valorEstimado: preview.valorEstimado,
          valorTotal: preview.valorTotal,
          nomeArquivo: preview.nomeArquivo,
          secoes: preview.secoes,
          itens: preview.itens,
        }),
      });
      const json = (await res.json()) as { ok?: boolean; error?: string };
      if (!res.ok || !json.ok) throw new Error(json.error ?? "Erro ao importar o DFD.");
      setResultado({
        numero: preview.numero,
        itens: preview.itens.length,
        repNome: reparticoes.find((r) => r.id === repId)?.nome ?? null,
        foraDoHead: repId != null && reparticaoAtivaId != null && repId !== reparticaoAtivaId,
      });
      setStatus("done");
      router.refresh();
    } catch (e) {
      setStatus("error");
      setErro(e instanceof Error ? e.message : "Erro ao importar o DFD.");
    }
  }

  function reset() {
    setStatus("idle");
    setPreview(null);
    setErro(null);
    setRepId(null);
    setAutoMatch(false);
    if (inputRef.current) inputRef.current.value = "";
  }

  const rep = preview ? (reparticoes.find((r) => r.id === repId) ?? null) : null;
  const faltas = preview
    ? faltasObrigatorias({ reparticaoId: repId, itens: preview.itens, secoes: preview.secoes })
    : [];
  const foraDoHead = repId != null && reparticaoAtivaId != null && repId !== reparticaoAtivaId;
  const visual: DfdVisual | null = preview
    ? {
        numero: preview.numero,
        planejamento: preview.planejamento,
        tipo: preview.tipo,
        objeto: preview.objeto,
        orgaoEntidade: preview.orgaoEntidade,
        setorRequisitante: preview.setorRequisitante,
        responsavel: preview.responsavel,
        matricula: preview.matricula,
        email: preview.email,
        telefone: preview.telefone,
        valorEstimado: preview.valorEstimado,
        valorTotal: preview.valorTotal,
        reparticaoCodigo: rep?.codigo ?? null,
        reparticaoNome: rep?.nome ?? null,
        totalItens: preview.itens.length,
        itens: preview.itens,
        secoes: preview.secoes,
      }
    : null;
  const modalAberto = !!preview && (status === "ready" || status === "sending");

  return (
    <div>
      {/* Dropzone */}
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          const f = e.dataTransfer.files?.[0];
          if (f) handleFile(f);
        }}
        className={`rounded-card border-2 border-dashed p-8 text-center transition ${
          dragging ? "border-accent bg-accent-soft" : "border-border-2 bg-surface"
        }`}
      >
        <input
          ref={inputRef}
          type="file"
          accept=".xlsx,.xls,.pdf"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) handleFile(f);
          }}
        />
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-accent-soft text-accent">
          <IconUpload className="h-7 w-7" />
        </div>
        <p className="mt-4 text-sm font-medium text-text-2">Arraste o DFD (.xlsx ou .pdf) aqui ou</p>
        <div className="mt-2 flex justify-center">
          <Button onClick={() => inputRef.current?.click()} icon={<IconFile className="h-[18px] w-[18px]" />}>
            Escolher DFD (.xlsx ou .pdf)
          </Button>
        </div>
        <p className="mt-3 text-xs text-faint">
          O arquivo é lido no seu navegador e mostrado num banner para conferência — só grava ao confirmar.
          Reimportar o mesmo Número DFD substitui os itens.
        </p>
      </div>

      {erro && status === "error" && (
        <Callout kind="danger" icon={<IconAlert className="h-5 w-5" />} className="mt-4">
          <p className="font-semibold">Não foi possível importar</p>
          <p className="opacity-90">{erro}</p>
        </Callout>
      )}

      {status === "parsing" && (
        <Callout kind="info" icon={<IconSpinner className="h-5 w-5" />} className="mt-4">
          Lendo o DFD...
        </Callout>
      )}

      {/* Sucesso */}
      {status === "done" && resultado && (
        <div
          className="animate-fade-in-up mt-4 rounded-card border p-6"
          style={{
            borderColor: "color-mix(in srgb, var(--ok) 30%, transparent)",
            background: "color-mix(in srgb, var(--ok) 8%, var(--surface))",
          }}
        >
          <div className="flex items-center gap-3">
            <div
              className="flex h-11 w-11 items-center justify-center rounded-full text-white"
              style={{ background: "var(--ok)" }}
            >
              <IconCheck className="h-6 w-6" />
            </div>
            <div>
              <h3 className="font-bold" style={{ color: "var(--ok)" }}>
                DFD {resultado.numero} importado!
              </h3>
              <p className="text-sm text-muted">
                {num(resultado.itens)} itens{resultado.repNome ? ` · Repartição ${resultado.repNome}` : ""}
              </p>
            </div>
          </div>
          {resultado.foraDoHead && (
            <Callout kind="warn" icon={<IconAlert className="h-5 w-5" />} className="mt-4">
              Este DFD foi salvo na repartição <strong>{resultado.repNome}</strong>, diferente da ativa
              no cabeçalho. Selecione essa repartição (ou "Geral") no topo para vê-lo na lista.
            </Callout>
          )}
          <div className="mt-5">
            <Button variant="secondary" onClick={reset}>
              Importar outro DFD
            </Button>
          </div>
        </div>
      )}

      {/* Banner flutuante: conferir o DFD completo e importar (só grava ao confirmar) */}
      <Modal
        open={modalAberto}
        onClose={() => reset()}
        titulo={`Conferir e importar — DFD ${preview?.numero ?? ""}`}
        size="lg"
        scrollable
        fecharNoBackdrop={false}
      >
        {visual && (
          <div className="space-y-4">
            {/* Repartição (auto-detectada, confirmável) */}
            <div>
              <label className={labelCls} htmlFor="dfd-rep">
                Repartição / órgão <span style={{ color: "var(--danger)" }}>*</span>
              </label>
              <select
                id="dfd-rep"
                className={inputCls}
                value={repId ?? ""}
                onChange={(e) => {
                  setRepId(e.target.value ? Number(e.target.value) : null);
                  setAutoMatch(false);
                }}
              >
                <option value="">— Selecione a repartição —</option>
                {reparticoes.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.codigo} · {r.nome}
                  </option>
                ))}
              </select>
              {autoMatch && (
                <Callout kind="ok" icon={<IconBuilding className="h-4 w-4" />} className="mt-2">
                  Repartição detectada automaticamente
                  {preview?.siglaSetor ? ` pela sigla "${preview.siglaSetor}"` : ""}. Confirme ou ajuste.
                </Callout>
              )}
            </div>

            {/* Validação obrigatória — mostra os erros, mas não bloqueia a conferência */}
            {faltas.length > 0 && (
              <Callout kind="danger" icon={<IconAlert className="h-5 w-5" />}>
                <p className="font-semibold">Importação bloqueada — faltam dados obrigatórios:</p>
                <ul className="mt-1 list-disc space-y-0.5 pl-5 opacity-90">
                  {faltas.map((f) => (
                    <li key={f}>{f}</li>
                  ))}
                </ul>
                <p className="mt-1.5 opacity-90">
                  Você pode conferir o DFD abaixo; a importação fica liberada quando estiver completo.
                </p>
              </Callout>
            )}
            {foraDoHead && faltas.length === 0 && (
              <Callout kind="warn" icon={<IconAlert className="h-4 w-4" />}>
                A repartição escolhida é diferente da ativa no cabeçalho — o DFD ficará visível ao
                selecioná-la (ou "Geral") no topo.
              </Callout>
            )}

            {/* Ações */}
            <div className="flex flex-wrap justify-end gap-2">
              <Button variant="secondary" disabled={status === "sending"} onClick={() => reset()}>
                Cancelar
              </Button>
              <Button
                onClick={enviar}
                loading={status === "sending"}
                disabled={faltas.length > 0 || status === "sending"}
                icon={<IconUpload className="h-[18px] w-[18px]" />}
              >
                Importar DFD
              </Button>
            </div>

            {/* Documento completo (conferência) */}
            <div className="border-t border-border pt-4">
              <DfdView dfd={visual} />
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
