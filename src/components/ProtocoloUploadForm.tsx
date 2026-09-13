"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { faltasObrigatorias } from "@/lib/dfd-validation";
import { num } from "@/lib/format";
import { enviarDfdEmLotes } from "@/lib/importar-dfd";
import type { DfdParseado } from "@/lib/parse-dfd-comum";
import {
  indexarProtocoloPdf,
  parseDfdDoProtocolo,
  type PdfDoc,
  type ProtocoloIndex,
} from "@/lib/parse-protocolo-pdf";
import { casarReparticao } from "@/lib/reparticao-match";
import { Button } from "./Button";
import { Callout } from "./Callout";
import { type Column, DataTable } from "./DataTable";
import { DfdView, type DfdVisual } from "./DfdView";
import { TextField } from "./Field";
import { inputCls, labelCls, selectCls } from "./formStyles";
import { IconAlert, IconCheck, IconClipboard, IconFile, IconSpinner, IconUpload } from "./icons";
import { Modal } from "./Modal";
import { Progress } from "./Progress";

type Rep = { id: number; codigo: string; nome: string };
type DfdExistente = { numero: string; protocoloNumero: string | null };
type Status = "idle" | "parsing" | "error";
type Extra = { documento: string | null; localReparticao: string | null; valorCapa: number | null; nomeArquivo: string | null };
type Situacao = "novo" | "substitui" | "move";

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
  dfdsExistentes = [],
}: {
  reparticoes: Rep[];
  reparticaoAtivaId?: number | null;
  dfdsExistentes?: DfdExistente[];
}) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const docRef = useRef<PdfDoc | null>(null); // documento pdf.js aberto (streaming)
  const [status, setStatus] = useState<Status>("idle");
  const [erro, setErro] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const [aberto, setAberto] = useState(false);

  // Metadados editáveis do protocolo.
  const [numero, setNumero] = useState("");
  const [data, setData] = useState("");
  const [interessado, setInteressado] = useState("");
  const [assunto, setAssunto] = useState("");
  const [observacao, setObservacao] = useState("");
  const [protoRepId, setProtoRepId] = useState<number | null>(null);
  const [extra, setExtra] = useState<Extra>(EXTRA_VAZIO);

  // Índice leve dos DFDs + repartição (auto e escolhida) por DFD.
  const [index, setIndex] = useState<ProtocoloIndex | null>(null);
  const [dfdRepIds, setDfdRepIds] = useState<(number | null)[]>([]);
  const [autoRepIds, setAutoRepIds] = useState<(number | null)[]>([]);

  // "Ver" um DFD (parse sob demanda) + import streamado.
  const [verDfd, setVerDfd] = useState<DfdParseado | null>(null);
  const [verIdx, setVerIdx] = useState<number>(-1);
  const [carregandoVer, setCarregandoVer] = useState<number | null>(null);
  const [importando, setImportando] = useState(false);
  const [progresso, setProgresso] = useState<{ feito: number; total: number; label: string } | null>(null);
  const [relatorio, setRelatorio] = useState<{ numero: string; importados: number; bloqueados: { numero: string; motivo: string }[] } | null>(null);

  // Destrói o documento pdf.js ao desmontar (libera memória).
  useEffect(() => () => void docRef.current?.destroy(), []);

  function limparDoc() {
    docRef.current?.destroy();
    docRef.current = null;
  }

  function abrirVazio() {
    limparDoc();
    setErro(null);
    setRelatorio(null);
    setNumero("");
    setData("");
    setInteressado("");
    setAssunto("");
    setObservacao("");
    setExtra(EXTRA_VAZIO);
    setProtoRepId(reparticaoAtivaId);
    setIndex({ protocolo: { numero: null, data: null, interessado: null, documento: null, assunto: null, valorCapa: null, observacao: null, localReparticao: null, nomeArquivo: null }, dfds: [] });
    setDfdRepIds([]);
    setAutoRepIds([]);
    setVerDfd(null);
    setAberto(true);
  }

  async function handleFile(file: File) {
    setErro(null);
    setRelatorio(null);
    if (!/\.pdf$/i.test(file.name)) {
      setStatus("error");
      setErro("Envie o protocolo em .pdf (o processo com os DFDs).");
      return;
    }
    setStatus("parsing");
    try {
      limparDoc();
      const { index: idx, doc } = await indexarProtocoloPdf(file);
      docRef.current = doc;
      const p = idx.protocolo;
      // Robustez: PDF sem texto / sem DFDs / sem capa.
      if (idx.dfds.length === 0 && p.numero == null) {
        setStatus("error");
        setErro(
          "Não reconheci nenhum DFD nem a capa neste PDF. Confirme que é o PDF do processo com texto (não digitalizado).",
        );
        limparDoc();
        return;
      }
      const autos = idx.dfds.map((d) => casarReparticao(d, reparticoes));
      setNumero(p.numero ?? "");
      setData(p.data ?? "");
      setInteressado(p.interessado ?? "");
      setAssunto(p.assunto ?? "");
      setObservacao(p.observacao ?? "");
      setExtra({ documento: p.documento, localReparticao: p.localReparticao, valorCapa: p.valorCapa, nomeArquivo: p.nomeArquivo });
      setIndex(idx);
      setDfdRepIds(autos);
      setAutoRepIds(autos);
      setProtoRepId(autos.find((x) => x != null) ?? reparticaoAtivaId);
      setVerDfd(null);
      setStatus("idle");
      setAberto(true);
    } catch (e) {
      setStatus("error");
      setErro(e instanceof Error ? e.message : "Falha ao ler o protocolo.");
      limparDoc();
    }
  }

  function fechar() {
    setAberto(false);
    setVerDfd(null);
    limparDoc();
  }

  const repDe = (id: number | null) => reparticoes.find((r) => r.id === id) ?? null;
  const nomeArq = extra.nomeArquivo ?? "protocolo.pdf";

  const classificar = (dfdNumero: string): Situacao => {
    const ex = dfdsExistentes.find((x) => x.numero.trim() === dfdNumero.trim());
    if (!ex) return "novo";
    if (ex.protocoloNumero && ex.protocoloNumero.trim() !== numero.trim()) return "move";
    return "substitui";
  };

  function setRepDfd(idx: number, id: number | null) {
    setDfdRepIds((arr) => arr.map((x, i) => (i === idx ? id : x)));
  }
  function aplicarRepTodos(id: number | null) {
    setDfdRepIds((arr) => arr.map(() => id));
  }

  async function verUmDfd(idx: number) {
    const doc = docRef.current;
    const di = index?.dfds[idx];
    if (!doc || !di) return;
    setCarregandoVer(idx);
    setErro(null);
    try {
      setVerDfd(await parseDfdDoProtocolo(doc, di, nomeArq));
      setVerIdx(idx);
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Não foi possível ler este DFD.");
    } finally {
      setCarregandoVer(null);
    }
  }

  async function protocolar() {
    if (!index) return;
    setImportando(true);
    setErro(null);
    setRelatorio(null);
    try {
      // 1) cria só o protocolo (capa).
      const res = await fetch("/api/protocolo", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mode: "start-protocolo",
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
        }),
      });
      const pj = (await res.json()) as { ok?: boolean; error?: string; protocoloId?: number };
      if (!res.ok || !pj.ok || !pj.protocoloId) throw new Error(pj.error ?? "Erro ao criar o protocolo.");
      const protocoloId = pj.protocoloId;

      // 2) importa os DFDs em STREAMING (parse → valida → envia em lotes → descarta).
      const doc = docRef.current;
      const dfds = index.dfds;
      const bloqueados: { numero: string; motivo: string }[] = [];
      let importados = 0;
      for (let i = 0; i < dfds.length; i++) {
        const di = dfds[i];
        setProgresso({ feito: i, total: dfds.length, label: `DFD ${di.numero} (${i + 1}/${dfds.length})` });
        if (!doc) break;
        let full: DfdParseado;
        try {
          full = await parseDfdDoProtocolo(doc, di, nomeArq);
        } catch (e) {
          bloqueados.push({ numero: di.numero, motivo: e instanceof Error ? e.message : "falha ao ler o DFD" });
          continue;
        }
        const faltas = faltasObrigatorias({ reparticaoId: dfdRepIds[i], itens: full.itens, secoes: full.secoes });
        if (faltas.length > 0) {
          bloqueados.push({ numero: di.numero, motivo: faltas.join(", ") });
          continue;
        }
        try {
          await enviarDfdEmLotes(
            {
              numero: full.numero,
              planejamento: full.planejamento,
              tipo: full.tipo,
              objeto: full.objeto,
              orgaoEntidade: full.orgaoEntidade,
              setorRequisitante: full.setorRequisitante,
              siglaSetor: full.siglaSetor,
              responsavel: full.responsavel,
              matricula: full.matricula,
              email: full.email,
              telefone: full.telefone,
              reparticaoId: dfdRepIds[i],
              protocoloId,
              valorEstimado: full.valorEstimado,
              valorTotal: full.valorTotal,
              nomeArquivo: full.nomeArquivo,
              secoes: full.secoes,
            },
            full.itens,
          );
          importados++;
        } catch (e) {
          bloqueados.push({ numero: di.numero, motivo: e instanceof Error ? e.message : "falha ao gravar" });
        }
        setProgresso({ feito: i + 1, total: dfds.length, label: `DFD ${di.numero} (${i + 1}/${dfds.length})` });
      }
      setRelatorio({ numero, importados, bloqueados });
      fechar();
      router.refresh();
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Erro ao protocolar.");
    } finally {
      setImportando(false);
      setProgresso(null);
    }
  }

  const SITUACAO: Record<Situacao, { txt: string; cor: string }> = {
    novo: { txt: "Novo", cor: "var(--ok)" },
    substitui: { txt: "Substitui", cor: "var(--warn)" },
    move: { txt: "Move de outro protocolo", cor: "var(--warn)" },
  };

  const cols: Column<{ idx: number }>[] = [
    { key: "numero", header: "Nº DFD", filter: "none", render: (r) => <span className="font-mono">{index?.dfds[r.idx].numero}</span> },
    {
      key: "setor",
      header: "Setor",
      filter: "none",
      minWidth: 150,
      render: (r) => <span className="line-clamp-1">{index?.dfds[r.idx].setorRequisitante ?? "—"}</span>,
    },
    {
      key: "rep",
      header: "Repartição",
      filter: "none",
      minWidth: 200,
      render: (r) => (
        <div className="flex items-center gap-1.5">
          <select
            className={selectCls}
            aria-label={`Repartição do DFD ${index?.dfds[r.idx].numero}`}
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
          {dfdRepIds[r.idx] != null && dfdRepIds[r.idx] === autoRepIds[r.idx] && (
            <span className="shrink-0 text-[10px] font-semibold uppercase text-accent" title="Repartição detectada automaticamente">
              auto
            </span>
          )}
        </div>
      ),
    },
    {
      key: "situacao",
      header: "Situação",
      filter: "none",
      minWidth: 120,
      render: (r) => {
        const s = SITUACAO[classificar(index?.dfds[r.idx].numero ?? "")];
        return (
          <span className="text-[12px] font-medium" style={{ color: s.cor }}>
            {s.txt}
          </span>
        );
      },
    },
    {
      key: "ver",
      header: "",
      filter: "none",
      render: (r) => (
        <Button variant="ghost" onClick={() => verUmDfd(r.idx)} loading={carregandoVer === r.idx}>
          Ver
        </Button>
      ),
    },
  ];

  const linhas = (index?.dfds ?? []).map((_, idx) => ({ idx }));
  const comRep = dfdRepIds.filter((x) => x != null).length;
  const semRep = (index?.dfds.length ?? 0) - comRep;
  const podeProtocolar = numero.trim().length > 0 && protoRepId != null && !importando;
  const pct = progresso && progresso.total > 0 ? Math.round((progresso.feito / progresso.total) * 100) : 0;

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
          O sistema identifica cada DFD e importa em streaming (escala a milhares). DFD com pendência nunca é
          protocolado — ele aparece no relatório ao final.
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

      {relatorio && (
        <Callout kind={relatorio.bloqueados.length > 0 ? "warn" : "ok"} icon={<IconCheck className="h-5 w-5" />} className="mt-4">
          <p className="font-semibold">Protocolo {relatorio.numero} salvo!</p>
          <p className="opacity-90">
            {num(relatorio.importados)} DFD{relatorio.importados === 1 ? "" : "s"} protocolado
            {relatorio.importados === 1 ? "" : "s"}
            {relatorio.bloqueados.length > 0 ? ` · ${relatorio.bloqueados.length} bloqueado(s)` : ""}.
          </p>
          {relatorio.bloqueados.length > 0 && (
            <ul className="mt-1.5 max-h-40 list-disc space-y-0.5 overflow-y-auto pl-5 text-[12px] opacity-90">
              {relatorio.bloqueados.map((b) => (
                <li key={b.numero}>
                  DFD {b.numero}: {b.motivo}
                </li>
              ))}
            </ul>
          )}
        </Callout>
      )}

      {/* Banner: conferir o protocolo + DFDs e protocolar (streaming). */}
      <Modal
        open={aberto}
        onClose={fechar}
        titulo={numero ? `Protocolo ${numero}` : "Novo protocolo"}
        size="xl"
        fecharNoBackdrop={false}
        rodape={
          <div className="flex flex-wrap items-center justify-between gap-3">
            {importando && progresso ? (
              <div className="min-w-[200px] flex-1">
                <Progress value={pct} label={`Protocolando ${progresso.label}... ${pct}%`} />
              </div>
            ) : (
              <span className="text-[12px] text-muted">
                {(index?.dfds.length ?? 0) === 0
                  ? "Sem DFDs — cria só o protocolo."
                  : `${index?.dfds.length} DFD(s) · ${semRep} sem repartição (serão bloqueados)`}
              </span>
            )}
            <div className="flex gap-2">
              <Button variant="secondary" disabled={importando} onClick={fechar}>
                Cancelar
              </Button>
              <Button onClick={protocolar} loading={importando} disabled={!podeProtocolar} icon={<IconUpload className="h-[18px] w-[18px]" />}>
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
              <select id="proto-rep" className={inputCls} value={protoRepId ?? ""} onChange={(e) => setProtoRepId(e.target.value ? Number(e.target.value) : null)}>
                <option value="">— Selecione a repartição —</option>
                {reparticoes.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.codigo} · {r.nome}
                  </option>
                ))}
              </select>
            </div>
          </section>

          {/* DFDs detectados */}
          {(index?.dfds.length ?? 0) === 0 ? (
            <Callout kind="info">
              Nenhum DFD detectado. O protocolo será criado vazio — adicione DFDs depois (aba DFDs) ou vincule
              existentes.
            </Callout>
          ) : (
            <section className="space-y-3">
              <div className="flex flex-wrap items-end justify-between gap-3">
                <h3 className="text-sm font-bold text-text">DFDs detectados ({index?.dfds.length})</h3>
                <div className="min-w-[220px]">
                  <label className={labelCls} htmlFor="rep-todos">
                    Aplicar repartição a todos
                  </label>
                  <select id="rep-todos" className={inputCls} value="" onChange={(e) => e.target.value && aplicarRepTodos(Number(e.target.value))}>
                    <option value="">— Escolha para aplicar a todos —</option>
                    {reparticoes.map((r) => (
                      <option key={r.id} value={r.id}>
                        {r.codigo} · {r.nome}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
              <DataTable columns={cols} rows={linhas} getKey={(r) => r.idx} pageSize={25} minWidth={720} footer={`${index?.dfds.length} DFD(s) · ${comRep} com repartição`} />
              <p className="text-xs text-faint">
                Só os DFDs sem pendências (repartição, valor unitário, seções obrigatórias) são protocolados; os
                demais entram no relatório ao final.
              </p>
            </section>
          )}
        </div>
      </Modal>

      {/* Visão completa de um DFD (sob demanda) */}
      <Modal open={verDfd != null} onClose={() => setVerDfd(null)} titulo={verDfd ? `DFD ${verDfd.numero}` : ""} size="lg">
        {verDfd && <DfdView dfd={toVisual(verDfd, repDe(dfdRepIds[verIdx] ?? null))} />}
      </Modal>
    </div>
  );
}
