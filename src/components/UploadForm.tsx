"use client";

import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { brl, num } from "@/lib/format";
import { normalizarLinha } from "@/lib/normalize";
import { type PlanilhaParseada, parsePlanilha } from "@/lib/parse-xlsx";
import { Button } from "./Button";
import { Callout } from "./Callout";
import { IconAlert, IconCheck, IconFile, IconSpinner, IconUpload } from "./icons";

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
  const [progress, setProgress] = useState(0);

  // Linhas por requisição — mantém cada requisição pequena (dentro dos limites
  // do Worker/D1), permitindo importar planilhas de qualquer tamanho.
  const CHUNK = 200;

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
    setProgress(0);
    try {
      const all = preview.rows;
      let unidadeId: number | null = null;

      for (let i = 0; i < all.length; i += CHUNK) {
        const slice = all.slice(i, i + CHUNK);
        const body =
          i === 0
            ? {
                mode: "start" as const,
                codigo: preview.codigo,
                municipio: preview.municipio,
                nomeArquivo: preview.nomeArquivo,
                totalItens: preview.count,
                valorTotal: preview.total,
                rows: slice,
              }
            : { mode: "append" as const, unidadeId: unidadeId!, rows: slice };

        const res = await fetch("/api/upload", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
        const json = (await res.json()) as {
          ok?: boolean;
          error?: string;
          unidadeId?: number;
        };
        if (!res.ok || !json.ok) {
          throw new Error(json.error ?? "Erro ao importar.");
        }
        if (i === 0) unidadeId = json.unidadeId ?? null;
        setProgress(Math.round(((i + slice.length) / all.length) * 100));
      }

      setResultado({
        codigo: preview.codigo,
        municipio: preview.municipio,
        totalItens: preview.count,
        valorTotal: preview.total,
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
    setProgress(0);
    if (inputRef.current) inputRef.current.value = "";
  }

  // ---- Sucesso ----
  if (status === "done" && resultado) {
    return (
      <div
        className="animate-fade-in-up rounded-card border p-6"
        style={{
          borderColor: "color-mix(in srgb, var(--ok) 30%, transparent)",
          background: "color-mix(in srgb, var(--ok) 8%, var(--surface))",
        }}
      >
        <div className="flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-full text-white" style={{ background: "var(--ok)" }}>
            <IconCheck className="h-6 w-6" />
          </div>
          <div>
            <h3 className="font-bold" style={{ color: "var(--ok)" }}>
              Planilha importada com sucesso!
            </h3>
            <p className="text-sm text-muted">
              {resultado.municipio} · unidade {resultado.codigo}
            </p>
          </div>
        </div>
        <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
          <div className="rounded-control border border-border bg-surface p-3">
            <div className="text-xs text-muted">Itens</div>
            <div className="text-lg font-bold text-text">{num(resultado.totalItens)}</div>
          </div>
          <div className="rounded-control border border-border bg-surface p-3">
            <div className="text-xs text-muted">Valor total</div>
            <div className="text-lg font-bold text-text">{brl(resultado.valorTotal)}</div>
          </div>
        </div>
        <div className="mt-5 flex flex-wrap gap-3">
          <Button href="/">Ver no dashboard</Button>
          <Button variant="secondary" onClick={reset}>
            Importar outra
          </Button>
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
        className={`rounded-card border-2 border-dashed p-8 text-center transition ${
          dragging ? "border-accent bg-accent-soft" : "border-border-2 bg-surface"
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
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-accent-soft text-accent">
          <IconUpload className="h-7 w-7" />
        </div>
        <p className="mt-4 text-sm font-medium text-text-2">Arraste a planilha do PCA aqui ou</p>
        <div className="mt-2 flex justify-center">
          <Button onClick={() => inputRef.current?.click()} icon={<IconFile className="h-[18px] w-[18px]" />}>
            Escolher arquivo .xlsx
          </Button>
        </div>
        <p className="mt-3 text-xs text-faint">
          O arquivo é lido no seu navegador. Reimportar a mesma unidade (Código) substitui os itens anteriores.
        </p>
      </div>

      {/* Erro */}
      {erro && status === "error" && (
        <Callout kind="danger" icon={<IconAlert className="h-5 w-5" />} className="mt-4">
          <p className="font-semibold">Não foi possível importar</p>
          <p className="opacity-90">{erro}</p>
        </Callout>
      )}

      {/* Parsing */}
      {status === "parsing" && (
        <Callout kind="info" icon={<IconSpinner className="h-5 w-5" />} className="mt-4">
          Lendo a planilha...
        </Callout>
      )}

      {/* Preview + confirmar */}
      {preview && (status === "ready" || status === "sending") && (
        <div className="mt-4 animate-fade-in-up rounded-card border border-border bg-surface p-5 shadow-ring">
          <div className="flex items-center gap-2 text-sm font-semibold text-text">
            <IconFile className="h-[18px] w-[18px] text-accent" />
            {preview.nomeArquivo}
          </div>
          <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
            <InfoTile label="Unidade (Código)" value={preview.codigo} />
            <InfoTile label="Município" value={preview.municipio} span />
            <InfoTile label="Itens" value={num(preview.count)} />
          </div>
          <div className="mt-3 rounded-control bg-surface-2 p-3">
            <div className="text-xs text-muted">Valor total estimado</div>
            <div className="text-xl font-bold text-text">{brl(preview.total)}</div>
          </div>
          <div className="mt-5 flex flex-wrap gap-3">
            <Button
              disabled={status === "sending"}
              onClick={enviar}
              icon={status === "sending" ? <IconSpinner className="h-[18px] w-[18px]" /> : <IconUpload className="h-[18px] w-[18px]" />}
            >
              {status === "sending" ? `Importando... ${progress}%` : `Importar ${num(preview.count)} itens`}
            </Button>
            <Button variant="secondary" disabled={status === "sending"} onClick={reset}>
              Cancelar
            </Button>
          </div>

          {status === "sending" && (
            <div className="mt-4">
              <div className="h-2 w-full overflow-hidden rounded-full bg-track">
                <div className="h-full rounded-full bg-accent transition-all duration-300" style={{ width: `${progress}%` }} />
              </div>
              <p className="mt-1.5 text-xs text-muted">
                Enviando {num(preview.count)} itens em lotes... {progress}%
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function InfoTile({ label, value, span }: { label: string; value: string; span?: boolean }) {
  return (
    <div className={span ? "col-span-2" : ""}>
      <div className="text-xs text-muted">{label}</div>
      <div className="truncate font-semibold text-text" title={value}>
        {value}
      </div>
    </div>
  );
}
