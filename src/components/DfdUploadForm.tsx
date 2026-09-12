"use client";

import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { brl, num } from "@/lib/format";
import { stripAccents } from "@/lib/normalize";
import { type DfdParseado, parseDfd } from "@/lib/parse-dfd";
import { parseDfdPdf } from "@/lib/parse-dfd-pdf";
import { Button } from "./Button";
import { Callout } from "./Callout";
import { type Column, DataTable } from "./DataTable";
import { inputCls, labelCls } from "./formStyles";
import { IconAlert, IconBuilding, IconCheck, IconFile, IconSpinner, IconUpload } from "./icons";

type Rep = { id: number; codigo: string; nome: string };
type Status = "idle" | "parsing" | "ready" | "sending" | "done" | "error";
type ItemPreview = DfdParseado["itens"][number] & { _k: number };

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

const COLS: Column<ItemPreview>[] = [
  { key: "item", header: "Item", align: "right", render: (r) => r.item ?? "—" },
  {
    key: "codigo",
    header: "Código",
    render: (r) => <span className="font-mono text-[12px]">{r.codigo ?? "—"}</span>,
  },
  {
    key: "descricao",
    header: "Descrição",
    minWidth: 300,
    render: (r) => <span className="line-clamp-2">{r.descricao ?? "—"}</span>,
  },
  { key: "unidade", header: "Unidade", render: (r) => r.unidade ?? "—" },
  {
    key: "quantidade",
    header: "Qtd.",
    align: "right",
    render: (r) => (r.quantidade != null ? num(r.quantidade) : "—"),
  },
  {
    key: "vunit",
    header: "Vlr. unit.",
    align: "right",
    render: (r) => (r.valorUnitario != null ? brl(r.valorUnitario) : "—"),
  },
  {
    key: "vtot",
    header: "Vlr. total",
    align: "right",
    render: (r) => (r.valorTotal != null ? brl(r.valorTotal) : "—"),
  },
];

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

  async function handleFile(file: File) {
    setErro(null);
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

  // ---- Sucesso ----
  if (status === "done" && preview) {
    const foraDoHead =
      repId != null && reparticaoAtivaId != null && repId !== reparticaoAtivaId;
    const repNome = reparticoes.find((r) => r.id === repId)?.nome;
    return (
      <div
        className="animate-fade-in-up rounded-card border p-6"
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
              DFD {preview.numero} importado!
            </h3>
            <p className="text-sm text-muted">
              {num(preview.itens.length)} itens · {repNome ? `Repartição ${repNome}` : "sem repartição (visível em Geral)"}
            </p>
          </div>
        </div>
        {foraDoHead && (
          <Callout kind="warn" icon={<IconAlert className="h-5 w-5" />} className="mt-4">
            Este DFD foi salvo na repartição <strong>{repNome}</strong>, diferente da ativa no
            cabeçalho. Selecione essa repartição (ou "Geral") no topo para vê-lo na lista.
          </Callout>
        )}
        <div className="mt-5">
          <Button variant="secondary" onClick={reset}>
            Importar outro DFD
          </Button>
        </div>
      </div>
    );
  }

  const rowsPreview: ItemPreview[] = preview
    ? preview.itens.map((it, i) => ({ ...it, _k: i }))
    : [];

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
          O arquivo é lido no seu navegador. Reimportar o mesmo Número DFD substitui os itens.
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

      {/* Preview + confirmar */}
      {preview && (status === "ready" || status === "sending") && (
        <div className="mt-4 animate-fade-in-up space-y-4 rounded-card border border-border bg-surface p-5 shadow-ring">
          <div className="flex items-center gap-2 text-sm font-semibold text-text">
            <IconFile className="h-[18px] w-[18px] text-accent" />
            DFD {preview.numero}
            {preview.tipo && <span className="text-muted">· {preview.tipo}</span>}
          </div>

          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Campo label="Nº DFD" valor={preview.numero} />
            <Campo label="Planejamento" valor={preview.planejamento ?? "—"} />
            <Campo label="Objeto" valor={preview.objeto ?? "—"} span />
            <Campo label="Órgão/Entidade" valor={preview.orgaoEntidade ?? "—"} span />
            <Campo label="Setor Requisitante" valor={preview.setorRequisitante ?? "—"} span />
            <Campo label="Responsável" valor={preview.responsavel ?? "—"} />
            <Campo label="Matrícula" valor={preview.matricula ?? "—"} />
            <Campo label="E-mail" valor={preview.email ?? "—"} span />
            <Campo label="Telefone" valor={preview.telefone ?? "—"} />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-control bg-surface-2 p-3">
              <div className="text-xs text-muted">Valor estimado (nota)</div>
              <div className="text-xl font-bold text-text">
                {preview.valorEstimado != null ? brl(preview.valorEstimado) : "—"}
              </div>
            </div>
            <div className="rounded-control bg-surface-2 p-3">
              <div className="text-xs text-muted">Valor total (tabela)</div>
              <div className="text-xl font-bold text-text">
                {preview.valorTotal != null ? brl(preview.valorTotal) : "—"}
              </div>
            </div>
          </div>

          {preview.secoes.length > 0 && (
            <p className="text-xs text-muted">
              + {preview.secoes.length} seç{preview.secoes.length === 1 ? "ão" : "ões"} capturada
              {preview.secoes.length === 1 ? "" : "s"} (identificação, justificativa, previsão,
              fundamentação legal…) — visíveis ao abrir o DFD.
            </p>
          )}

          {/* Repartição (auto-detectada, confirmável) */}
          <div>
            <label className={labelCls} htmlFor="dfd-rep">
              Repartição / órgão
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
              <option value="">— Sem repartição (visível em Geral) —</option>
              {reparticoes.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.codigo} · {r.nome}
                </option>
              ))}
            </select>
            {autoMatch ? (
              <Callout kind="ok" icon={<IconBuilding className="h-4 w-4" />} className="mt-2">
                Repartição detectada automaticamente pela sigla do Setor Requisitante
                {preview.siglaSetor ? ` (${preview.siglaSetor})` : ""}. Confirme ou ajuste.
              </Callout>
            ) : preview.siglaSetor && repId == null ? (
              <Callout kind="warn" icon={<IconAlert className="h-4 w-4" />} className="mt-2">
                Não encontrei uma repartição com a sigla "{preview.siglaSetor}". Selecione manualmente.
              </Callout>
            ) : null}
          </div>

          <div>
            <div className="mb-2 text-xs font-semibold text-muted">
              Itens do DFD ({num(preview.itens.length)})
            </div>
            <DataTable
              columns={COLS}
              rows={rowsPreview}
              getKey={(r) => r._k}
              minWidth={640}
              footer={`${preview.itens.length} ${preview.itens.length === 1 ? "item" : "itens"}`}
            />
          </div>

          <div className="flex flex-wrap gap-3">
            <Button
              disabled={status === "sending"}
              onClick={enviar}
              icon={
                status === "sending" ? (
                  <IconSpinner className="h-[18px] w-[18px]" />
                ) : (
                  <IconUpload className="h-[18px] w-[18px]" />
                )
              }
            >
              {status === "sending" ? "Importando..." : "Importar DFD"}
            </Button>
            <Button variant="secondary" disabled={status === "sending"} onClick={reset}>
              Cancelar
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

function Campo({ label, valor, span }: { label: string; valor: string; span?: boolean }) {
  return (
    <div className={span ? "col-span-2" : ""}>
      <div className="text-xs text-muted">{label}</div>
      <div className="truncate font-semibold text-text" title={valor}>
        {valor}
      </div>
    </div>
  );
}
