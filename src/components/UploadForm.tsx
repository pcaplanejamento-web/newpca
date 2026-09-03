"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { brl, num } from "@/lib/format";
import { normalizarLinha } from "@/lib/normalize";
import { parsePlanilha, type PlanilhaParseada } from "@/lib/parse-xlsx";
import {
  IconAlert,
  IconCheck,
  IconFile,
  IconSpinner,
  IconUpload,
} from "./icons";

type Preview = PlanilhaParseada & { total: number; count: number };
type Status = "idle" | "parsing" | "ready" | "sending" | "done" | "error";
type Resultado = {
  codigo: string;
  municipio: string;
  totalItens: number;
  valorTotal: number;
};

export function UploadForm() {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [status, setStatus] = useState<Status>("idle");
  const [erro, setErro] = useState<string | null>(null);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [resultado, setResultado] = useState<Resultado | null>(null);
  const [dragging, setDragging] = useState(false);

  async function handleFile(file: File) {
    setErro(null);
    setResultado(null);
    if (!/\.xlsx?$/i.test(file.name)) {
      setStatus("error");
      setErro("Envie um arquivo .xlsx (planilha do Excel).");
      return;
    }
    setStatus("parsing");
    try {
      const parsed = await parsePlanilha(file);
      const norm = parsed.rows.map(normalizarLinha);
      const total = norm.reduce((s, r) => s + (r.valorTotal ?? 0), 0);
      setPreview({ ...parsed, total, count: parsed.rows.length });
      setStatus("ready");
    } catch (e) {
      setStatus("error");
      setErro(e instanceof Error ? e.message : "Falha ao ler a planilha.");
    }
  }

  async function enviar() {
    if (!preview) return;
    setStatus("sending");
    setErro(null);
    try {
      const res = await fetch("/api/upload", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          codigo: preview.codigo,
          municipio: preview.municipio,
          nomeArquivo: preview.nomeArquivo,
          rows: preview.rows,
        }),
      });
      const json = (await res.json()) as {
        ok?: boolean;
        error?: string;
      } & Resultado;
      if (!res.ok || !json.ok) {
        throw new Error(json.error ?? "Erro ao importar.");
      }
      setResultado({
        codigo: json.codigo,
        municipio: json.municipio,
        totalItens: json.totalItens,
        valorTotal: json.valorTotal,
      });
      setStatus("done");
      router.refresh();
    } catch (e) {
      setStatus("error");
      setErro(e instanceof Error ? e.message : "Erro ao importar.");
    }
  }

  function reset() {
    setStatus("idle");
    setPreview(null);
    setErro(null);
    setResultado(null);
    if (inputRef.current) inputRef.current.value = "";
  }

  // ---- Sucesso ----
  if (status === "done" && resultado) {
    return (
      <div className="animate-fade-in-up rounded-2xl border border-emerald-200 bg-emerald-50 p-6 dark:border-emerald-500/30 dark:bg-emerald-500/10">
        <div className="flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-full bg-emerald-500 text-white">
            <IconCheck className="h-6 w-6" />
          </div>
          <div>
            <h3 className="font-bold text-emerald-800 dark:text-emerald-300">
              Planilha importada com sucesso!
            </h3>
            <p className="text-sm text-emerald-700/80 dark:text-emerald-300/80">
              {resultado.municipio} · unidade {resultado.codigo}
            </p>
          </div>
        </div>
        <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
          <div className="rounded-xl bg-white/70 p-3 dark:bg-slate-900/40">
            <div className="text-xs text-slate-500 dark:text-slate-400">Itens</div>
            <div className="text-lg font-bold text-slate-800 dark:text-white">
              {num(resultado.totalItens)}
            </div>
          </div>
          <div className="rounded-xl bg-white/70 p-3 dark:bg-slate-900/40">
            <div className="text-xs text-slate-500 dark:text-slate-400">
              Valor total
            </div>
            <div className="text-lg font-bold text-slate-800 dark:text-white">
              {brl(resultado.valorTotal)}
            </div>
          </div>
        </div>
        <div className="mt-5 flex flex-wrap gap-3">
          <Link
            href="/"
            className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-emerald-700"
          >
            Ver no dashboard
          </Link>
          <button
            type="button"
            onClick={reset}
            className="inline-flex items-center gap-2 rounded-lg border border-slate-300 px-4 py-2.5 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 dark:border-slate-600 dark:text-slate-200 dark:hover:bg-slate-800"
          >
            Importar outra
          </button>
        </div>
      </div>
    );
  }

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
        className={`rounded-2xl border-2 border-dashed p-8 text-center transition ${
          dragging
            ? "border-emerald-400 bg-emerald-50 dark:bg-emerald-500/10"
            : "border-slate-300 bg-white dark:border-slate-700 dark:bg-slate-900"
        }`}
      >
        <input
          ref={inputRef}
          type="file"
          accept=".xlsx,.xls"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) handleFile(f);
          }}
        />
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-emerald-100 text-emerald-600 dark:bg-emerald-500/20 dark:text-emerald-300">
          <IconUpload className="h-7 w-7" />
        </div>
        <p className="mt-4 text-sm font-medium text-slate-700 dark:text-slate-200">
          Arraste a planilha do PCA aqui ou
        </p>
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          className="mt-2 inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-emerald-700"
        >
          <IconFile className="h-[18px] w-[18px]" />
          Escolher arquivo .xlsx
        </button>
        <p className="mt-3 text-xs text-slate-400">
          O arquivo é lido no seu navegador. Reimportar a mesma unidade
          (Código) substitui os itens anteriores.
        </p>
      </div>

      {/* Erro */}
      {erro && status === "error" && (
        <div className="mt-4 flex items-start gap-3 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-300">
          <IconAlert className="mt-0.5 h-5 w-5 shrink-0" />
          <div>
            <p className="font-semibold">Não foi possível importar</p>
            <p className="text-red-600/90 dark:text-red-300/80">{erro}</p>
          </div>
        </div>
      )}

      {/* Parsing */}
      {status === "parsing" && (
        <div className="mt-4 flex items-center gap-3 rounded-xl border border-slate-200 bg-white p-4 text-sm text-slate-600 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300">
          <IconSpinner className="h-5 w-5" />
          Lendo a planilha...
        </div>
      )}

      {/* Preview + confirmar */}
      {preview && (status === "ready" || status === "sending") && (
        <div className="mt-4 animate-fade-in-up rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
          <div className="flex items-center gap-2 text-sm font-semibold text-slate-800 dark:text-slate-100">
            <IconFile className="h-[18px] w-[18px] text-emerald-600" />
            {preview.nomeArquivo}
          </div>
          <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Field label="Unidade (Código)" value={preview.codigo} />
            <Field label="Município" value={preview.municipio} span />
            <Field label="Itens" value={num(preview.count)} />
          </div>
          <div className="mt-3 rounded-xl bg-slate-50 p-3 dark:bg-slate-800/50">
            <div className="text-xs text-slate-500 dark:text-slate-400">
              Valor total estimado
            </div>
            <div className="text-xl font-bold text-slate-800 dark:text-white">
              {brl(preview.total)}
            </div>
          </div>
          <div className="mt-5 flex flex-wrap gap-3">
            <button
              type="button"
              disabled={status === "sending"}
              onClick={enviar}
              className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-emerald-700 disabled:opacity-60"
            >
              {status === "sending" ? (
                <>
                  <IconSpinner className="h-[18px] w-[18px]" />
                  Importando...
                </>
              ) : (
                <>
                  <IconUpload className="h-[18px] w-[18px]" />
                  Importar {num(preview.count)} itens
                </>
              )}
            </button>
            <button
              type="button"
              disabled={status === "sending"}
              onClick={reset}
              className="inline-flex items-center gap-2 rounded-lg border border-slate-300 px-4 py-2.5 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 disabled:opacity-60 dark:border-slate-600 dark:text-slate-200 dark:hover:bg-slate-800"
            >
              Cancelar
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function Field({
  label,
  value,
  span,
}: {
  label: string;
  value: string;
  span?: boolean;
}) {
  return (
    <div className={span ? "col-span-2" : ""}>
      <div className="text-xs text-slate-500 dark:text-slate-400">{label}</div>
      <div className="truncate font-semibold text-slate-800 dark:text-slate-100" title={value}>
        {value}
      </div>
    </div>
  );
}
