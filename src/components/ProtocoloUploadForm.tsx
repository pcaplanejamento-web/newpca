"use client";

import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { faltasObrigatorias } from "@/lib/dfd-validation";
import { brl, num } from "@/lib/format";
import type { DfdParseado } from "@/lib/parse-dfd-comum";
import { parseProtocoloPdf, type ProtocoloDfdErro } from "@/lib/parse-protocolo-pdf";
import { casarReparticao } from "@/lib/reparticao-match";
import { Button } from "./Button";
import { Callout } from "./Callout";
import { type Column, DataTable } from "./DataTable";
import { DfdView, type DfdVisual } from "./DfdView";
import { TextField } from "./Field";
import { inputCls, labelCls, selectCls } from "./formStyles";
import { IconAlert, IconCheck, IconClipboard, IconFile, IconSpinner, IconUpload } from "./icons";
import { Modal } from "./Modal";

type Rep = { id: number; codigo: string; nome: string };
type Status = "idle" | "parsing" | "error";

/** Metadados carregados da capa que não são editados no banner. */
type Extra = {
  documento: string | null;
  localReparticao: string | null;
  valorCapa: number | null;
  nomeArquivo: string | null;
};

const EXTRA_VAZIO: Extra = { documento: null, localReparticao: null, valorCapa: null, nomeArquivo: null };

/** Mapeia um DFD parseado (+ repartição escolhida) para a visão completa. */
function toVisual(d: DfdParseado, rep: Rep | null): DfdVisual {
  return {
    numero: d.numero,
    planejamento: d.planejamento,
    tipo: d.tipo,
    objeto: d.objeto,
    orgaoEntidade: d.orgaoEntidade,
    setorRequisitante: d.setorRequisitante,
    responsavel: d.responsavel,
    matricula: d.matricula,
    email: d.email,
    telefone: d.telefone,
    valorEstimado: d.valorEstimado,
    valorTotal: d.valorTotal,
    reparticaoCodigo: rep?.codigo ?? null,
    reparticaoNome: rep?.nome ?? null,
    totalItens: d.itens.length,
    itens: d.itens,
    secoes: d.secoes,
  };
}

export function ProtocoloUploadForm({
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
  const [dragging, setDragging] = useState(false);
  const [aberto, setAberto] = useState(false);
  const [salvando, setSalvando] = useState(false);

  // Metadados editáveis do protocolo.
  const [numero, setNumero] = useState("");
  const [data, setData] = useState("");
  const [interessado, setInteressado] = useState("");
  const [assunto, setAssunto] = useState("");
  const [observacao, setObservacao] = useState("");
  const [protoRepId, setProtoRepId] = useState<number | null>(null);
  const [extra, setExtra] = useState<Extra>(EXTRA_VAZIO);

  // DFDs detectados + repartição por DFD + erros de parse + qual "Ver".
  const [dfdsParsed, setDfdsParsed] = useState<DfdParseado[]>([]);
  const [dfdRepIds, setDfdRepIds] = useState<(number | null)[]>([]);
  const [errosParse, setErrosParse] = useState<ProtocoloDfdErro[]>([]);
  const [verIdx, setVerIdx] = useState<number | null>(null);

  const [resultado, setResultado] = useState<{ numero: string; importados: number; bloqueados: number } | null>(null);

  function abrirVazio() {
    setErro(null);
    setResultado(null);
    setNumero("");
    setData("");
    setInteressado("");
    setAssunto("");
    setObservacao("");
    setExtra(EXTRA_VAZIO);
    setProtoRepId(reparticaoAtivaId);
    setDfdsParsed([]);
    setDfdRepIds([]);
    setErrosParse([]);
    setVerIdx(null);
    setAberto(true);
  }

  async function handleFile(file: File) {
    setErro(null);
    setResultado(null);
    if (!/\.pdf$/i.test(file.name)) {
      setStatus("error");
      setErro("Envie o protocolo em .pdf (o processo com os DFDs).");
      return;
    }
    setStatus("parsing");
    try {
      const r = await parseProtocoloPdf(file);
      const p = r.protocolo;
      setNumero(p.numero ?? "");
      setData(p.data ?? "");
      setInteressado(p.interessado ?? "");
      setAssunto(p.assunto ?? "");
      setObservacao(p.observacao ?? "");
      setExtra({
        documento: p.documento,
        localReparticao: p.localReparticao,
        valorCapa: p.valorCapa,
        nomeArquivo: p.nomeArquivo,
      });
      const reps = r.dfds.map((d) => casarReparticao(d, reparticoes));
      setDfdsParsed(r.dfds);
      setDfdRepIds(reps);
      setErrosParse(r.erros);
      setProtoRepId(reps.find((x) => x != null) ?? reparticaoAtivaId);
      setVerIdx(null);
      setStatus("idle");
      setAberto(true);
    } catch (e) {
      setStatus("error");
      setErro(e instanceof Error ? e.message : "Falha ao ler o protocolo.");
    }
  }

  function fechar() {
    setAberto(false);
    setVerIdx(null);
  }

  const repDe = (id: number | null) => reparticoes.find((r) => r.id === id) ?? null;
  const faltasDe = (i: number) =>
    faltasObrigatorias({ reparticaoId: dfdRepIds[i], itens: dfdsParsed[i].itens, secoes: dfdsParsed[i].secoes });

  const linhas = dfdsParsed.map((_, idx) => ({ idx }));
  // Totais reativos (status por DFD depende da repartição escolhida) — barato p/ ≤200 DFDs.
  const validos = dfdsParsed.reduce((n, _d, i) => n + (faltasDe(i).length === 0 ? 1 : 0), 0);
  const bloqueados = dfdsParsed.length - validos;

  function setRepDfd(idx: number, id: number | null) {
    setDfdRepIds((arr) => arr.map((x, i) => (i === idx ? id : x)));
  }

  async function protocolar() {
    setSalvando(true);
    setErro(null);
    try {
      const dfds = dfdsParsed
        .map((d, i) => ({ d, i }))
        .filter(({ i }) => faltasDe(i).length === 0)
        .map(({ d, i }) => ({
          numero: d.numero,
          planejamento: d.planejamento,
          tipo: d.tipo,
          objeto: d.objeto,
          orgaoEntidade: d.orgaoEntidade,
          setorRequisitante: d.setorRequisitante,
          siglaSetor: d.siglaSetor,
          responsavel: d.responsavel,
          matricula: d.matricula,
          email: d.email,
          telefone: d.telefone,
          reparticaoId: dfdRepIds[i],
          valorEstimado: d.valorEstimado,
          valorTotal: d.valorTotal,
          nomeArquivo: d.nomeArquivo,
          secoes: d.secoes,
          itens: d.itens,
        }));
      const body = {
        protocolo: {
          numero,
          data: data || null,
          interessado: interessado || null,
          documento: extra.documento,
          assunto: assunto || null,
          observacao: observacao || null,
          valorCapa: extra.valorCapa,
          reparticaoId: protoRepId,
          localReparticao: extra.localReparticao,
          nomeArquivo: extra.nomeArquivo,
        },
        dfds,
      };
      const res = await fetch("/api/protocolo", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const j = (await res.json()) as { ok?: boolean; error?: string; importados?: number };
      if (!res.ok || !j.ok) throw new Error(j.error ?? "Erro ao protocolar.");
      setResultado({ numero, importados: dfds.length, bloqueados: dfdsParsed.length - dfds.length });
      fechar();
      router.refresh();
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Erro ao protocolar.");
    } finally {
      setSalvando(false);
    }
  }

  const cols: Column<{ idx: number }>[] = [
    {
      key: "numero",
      header: "Nº DFD",
      filter: "none",
      render: (r) => <span className="font-mono">{dfdsParsed[r.idx].numero}</span>,
    },
    {
      key: "setor",
      header: "Setor",
      filter: "none",
      minWidth: 150,
      render: (r) => <span className="line-clamp-1">{dfdsParsed[r.idx].setorRequisitante ?? "—"}</span>,
    },
    {
      key: "rep",
      header: "Repartição",
      filter: "none",
      minWidth: 190,
      render: (r) => (
        <select
          className={selectCls}
          aria-label={`Repartição do DFD ${dfdsParsed[r.idx].numero}`}
          value={dfdRepIds[r.idx] ?? ""}
          onChange={(e) => setRepDfd(r.idx, e.target.value ? Number(e.target.value) : null)}
        >
          <option value="">— Selecione —</option>
          {reparticoes.map((rep) => (
            <option key={rep.id} value={rep.id}>
              {rep.codigo} · {rep.nome}
            </option>
          ))}
        </select>
      ),
    },
    {
      key: "itens",
      header: "Itens",
      align: "right",
      filter: "none",
      render: (r) => num(dfdsParsed[r.idx].itens.length),
    },
    {
      key: "valor",
      header: "Valor",
      align: "right",
      filter: "none",
      render: (r) => brl(dfdsParsed[r.idx].valorTotal ?? dfdsParsed[r.idx].valorEstimado ?? 0),
    },
    {
      key: "status",
      header: "Status",
      filter: "none",
      minWidth: 150,
      render: (r) => {
        const f = faltasDe(r.idx);
        return f.length === 0 ? (
          <span className="inline-flex items-center gap-1 font-medium" style={{ color: "var(--ok)" }}>
            <IconCheck className="h-4 w-4" /> Será protocolado
          </span>
        ) : (
          <span
            className="inline-flex items-center gap-1 font-medium"
            style={{ color: "var(--danger)" }}
            title={`Falta: ${f.join(", ")}`}
          >
            <IconAlert className="h-4 w-4" /> Bloqueado ({f.length})
          </span>
        );
      },
    },
    {
      key: "ver",
      header: "",
      filter: "none",
      render: (r) => (
        <Button variant="ghost" onClick={() => setVerIdx(r.idx)}>
          Ver
        </Button>
      ),
    },
  ];

  const podeProtocolar = numero.trim().length > 0 && protoRepId != null && !salvando;
  const verDfd = verIdx != null ? dfdsParsed[verIdx] : null;

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
          accept=".pdf"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) handleFile(f);
          }}
        />
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-accent-soft text-accent">
          <IconClipboard className="h-7 w-7" />
        </div>
        <p className="mt-4 text-sm font-medium text-text-2">Arraste o protocolo (.pdf) aqui ou</p>
        <div className="mt-2 flex flex-wrap justify-center gap-2">
          <Button onClick={() => inputRef.current?.click()} icon={<IconFile className="h-[18px] w-[18px]" />}>
            Escolher protocolo (.pdf)
          </Button>
          <Button variant="secondary" onClick={abrirVazio}>
            Novo protocolo (sem PDF)
          </Button>
        </div>
        <p className="mt-3 text-xs text-faint">
          O sistema identifica cada DFD no PDF e mostra tudo num banner para conferência — só grava ao protocolar.
          DFD com pendência nunca é protocolado.
        </p>
      </div>

      {erro && status === "error" && (
        <Callout kind="danger" icon={<IconAlert className="h-5 w-5" />} className="mt-4">
          <p className="font-semibold">Não foi possível ler o protocolo</p>
          <p className="opacity-90">{erro}</p>
        </Callout>
      )}

      {status === "parsing" && (
        <Callout kind="info" icon={<IconSpinner className="h-5 w-5" />} className="mt-4">
          Lendo o protocolo e identificando os DFDs...
        </Callout>
      )}

      {resultado && (
        <Callout kind="ok" icon={<IconCheck className="h-5 w-5" />} className="mt-4">
          <p className="font-semibold">Protocolo {resultado.numero} salvo!</p>
          <p className="opacity-90">
            {num(resultado.importados)} DFD{resultado.importados === 1 ? "" : "s"} protocolado
            {resultado.importados === 1 ? "" : "s"}
            {resultado.bloqueados > 0 ? ` · ${resultado.bloqueados} bloqueado(s) (pendências)` : ""}.
          </p>
        </Callout>
      )}

      {/* Banner: conferir o protocolo + DFDs e protocolar (só grava ao confirmar). */}
      <Modal
        open={aberto}
        onClose={fechar}
        titulo={numero ? `Protocolo ${numero}` : "Novo protocolo"}
        size="xl"
        fecharNoBackdrop={false}
        rodape={
          <div className="flex flex-wrap items-center justify-between gap-3">
            <span className="text-[12px] text-muted">
              {dfdsParsed.length === 0
                ? "Sem DFDs — o protocolo será criado vazio."
                : `${validos} será(ão) protocolado(s) · ${bloqueados} bloqueado(s)`}
            </span>
            <div className="flex gap-2">
              <Button variant="secondary" disabled={salvando} onClick={fechar}>
                Cancelar
              </Button>
              <Button
                onClick={protocolar}
                loading={salvando}
                disabled={!podeProtocolar}
                icon={<IconUpload className="h-[18px] w-[18px]" />}
              >
                Protocolar
              </Button>
            </div>
          </div>
        }
      >
        <div className="space-y-5">
          {/* Metadados do protocolo (editáveis) */}
          <section className="grid gap-3 sm:grid-cols-2">
            <TextField label="Número do processo" value={numero} onChange={(e) => setNumero(e.target.value)} placeholder="Ex.: 144756/2026" />
            <TextField label="Data/Hora" value={data} onChange={(e) => setData(e.target.value)} placeholder="—" />
            <div className="sm:col-span-2">
              <TextField label="Interessado" value={interessado} onChange={(e) => setInteressado(e.target.value)} />
            </div>
            <TextField label="Assunto" value={assunto} onChange={(e) => setAssunto(e.target.value)} />
            <TextField label="Observação" value={observacao} onChange={(e) => setObservacao(e.target.value)} />
            <div className="sm:col-span-2">
              <label className={labelCls} htmlFor="proto-rep">
                Repartição do protocolo <span style={{ color: "var(--danger)" }}>*</span>
              </label>
              <select
                id="proto-rep"
                className={inputCls}
                value={protoRepId ?? ""}
                onChange={(e) => setProtoRepId(e.target.value ? Number(e.target.value) : null)}
              >
                <option value="">— Selecione a repartição —</option>
                {reparticoes.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.codigo} · {r.nome}
                  </option>
                ))}
              </select>
            </div>
          </section>

          {errosParse.length > 0 && (
            <Callout kind="warn" icon={<IconAlert className="h-5 w-5" />}>
              <p className="font-semibold">
                {errosParse.length} trecho(s) não reconhecido(s) como DFD e ignorado(s):
              </p>
              <ul className="mt-1 list-disc space-y-0.5 pl-5 opacity-90">
                {errosParse.map((e) => (
                  <li key={`${e.ordem}-${e.numero}`}>
                    DFD {e.numero ?? `#${e.ordem}`}: {e.erro}
                  </li>
                ))}
              </ul>
            </Callout>
          )}

          {/* DFDs detectados (tabela compacta; a visão completa carrega ao clicar "Ver") */}
          <section>
            <h3 className="mb-2 text-sm font-bold text-text">
              DFDs detectados ({dfdsParsed.length})
            </h3>
            {dfdsParsed.length === 0 ? (
              <Callout kind="info">
                Nenhum DFD neste protocolo. Você pode criá-lo vazio e adicionar DFDs depois (na aba DFDs).
              </Callout>
            ) : (
              <DataTable
                columns={cols}
                rows={linhas}
                getKey={(r) => r.idx}
                minWidth={760}
                footer={`${dfdsParsed.length} DFD${dfdsParsed.length === 1 ? "" : "s"} · ${validos} ok · ${bloqueados} bloqueado(s)`}
              />
            )}
            <p className="mt-2 text-xs text-faint">
              Ajuste a repartição de cada DFD. Só os DFDs sem pendências serão protocolados.
            </p>
          </section>
        </div>
      </Modal>

      {/* Visão completa de um DFD (sob demanda) */}
      <Modal
        open={verDfd != null}
        onClose={() => setVerIdx(null)}
        titulo={verDfd ? `DFD ${verDfd.numero}` : ""}
        size="lg"
      >
        {verDfd && verIdx != null && <DfdView dfd={toVisual(verDfd, repDe(dfdRepIds[verIdx]))} />}
      </Modal>
    </div>
  );
}
