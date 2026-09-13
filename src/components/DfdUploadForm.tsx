"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { type CampoTratavel, normalizarSecoesDfd } from "@/lib/dfd-tratamento";
import { faltasObrigatorias } from "@/lib/dfd-validation";
import { num } from "@/lib/format";
import { enviarDfdEmLotes } from "@/lib/importar-dfd";
import { type DfdParseado, parseDfd } from "@/lib/parse-dfd";
import { parseDfdPdf } from "@/lib/parse-dfd-pdf";
import { casarReparticao } from "@/lib/reparticao-match";
import { Button } from "./Button";
import { Callout } from "./Callout";
import { DfdConferir } from "./DfdConferir";
import { IconAlert, IconCheck, IconFile, IconSpinner, IconUpload } from "./icons";
import { Modal } from "./Modal";
import { Progress } from "./Progress";

type Rep = { id: number; codigo: string; nome: string };
type Status = "idle" | "parsing" | "ready" | "sending" | "done" | "error";

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
  const [autoCampos, setAutoCampos] = useState<CampoTratavel[]>([]);
  const [dragging, setDragging] = useState(false);
  const [progresso, setProgresso] = useState(0);
  const [resultado, setResultado] = useState<{
    numero: string;
    itens: number;
    repNome: string | null;
    foraDoHead: boolean;
  } | null>(null);

  // Enquanto grava (lotes), avisa antes de fechar/atualizar a aba.
  useEffect(() => {
    if (status !== "sending") return;
    const h = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", h);
    return () => window.removeEventListener("beforeunload", h);
  }, [status]);

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
      const parsed = ehPdf ? await parseDfdPdf(file) : await parseDfd(file);
      const { dfd: d, auto } = normalizarSecoesDfd(parsed); // padroniza PRIORIDADE/PREVISÃO
      const matched = casarReparticao(d, reparticoes);
      setPreview(d);
      setAutoCampos(auto);
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
    setProgresso(0);
    try {
      // Grava em LOTES de itens (start-dfd + append) — escala a milhares de itens.
      await enviarDfdEmLotes(
        {
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
        },
        preview.itens,
        (enviados, total) => setProgresso(Math.round((enviados / total) * 100)),
      );
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
    setAutoCampos([]);
    if (inputRef.current) inputRef.current.value = "";
  }

  const faltas = preview
    ? faltasObrigatorias({ reparticaoId: repId, itens: preview.itens, secoes: preview.secoes })
    : [];
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

      {/* Banner flutuante: conferir o DFD completo e importar (só grava ao confirmar).
          Cabeçalho e botões ficam FIXOS (via Modal); o corpo rola. */}
      <Modal
        open={modalAberto}
        onClose={() => reset()}
        titulo={`Conferir e importar — DFD ${preview?.numero ?? ""}`}
        size="lg"
        fecharNoBackdrop={false}
        bloqueado={status === "sending"}
        rodape={
          preview ? (
            <div className="flex flex-wrap items-center justify-between gap-3">
              {status === "sending" ? (
                <div className="min-w-[180px] flex-1">
                  <Progress value={progresso} label={`Enviando ${num(preview?.itens.length ?? 0)} itens... ${progresso}% — não feche esta janela`} />
                </div>
              ) : (
                <span className="text-[12px] text-muted">
                  {faltas.length > 0
                    ? `${faltas.length} pendência${faltas.length === 1 ? "" : "s"} — importação bloqueada`
                    : "Tudo certo — pronto para importar"}
                </span>
              )}
              <div className="flex gap-2">
                {status !== "sending" && (
                  <Button variant="secondary" onClick={() => reset()}>
                    Cancelar
                  </Button>
                )}
                <Button
                  onClick={enviar}
                  loading={status === "sending"}
                  disabled={faltas.length > 0 || status === "sending"}
                  icon={<IconUpload className="h-[18px] w-[18px]" />}
                >
                  Importar DFD
                </Button>
              </div>
            </div>
          ) : undefined
        }
      >
        {preview && (
          <DfdConferir
            dfd={preview}
            reparticoes={reparticoes}
            reparticaoAtivaId={reparticaoAtivaId}
            repId={repId}
            autoMatch={autoMatch}
            autoCampos={autoCampos}
            onRepChange={(id) => {
              setRepId(id);
              setAutoMatch(false);
            }}
            onSecoesChange={(secoes) => setPreview((p) => (p ? { ...p, secoes } : p))}
          />
        )}
      </Modal>
    </div>
  );
}
