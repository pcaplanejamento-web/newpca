"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import {
  type CampoTratavel,
  ESTADO_ROTULO,
  type EstadoDfd,
  estadoCor,
  estadoDfd,
  normalizarSecoesDfd,
  setTextoSecao,
  TRATAVEIS,
} from "@/lib/dfd-tratamento";
import { faltasObrigatorias } from "@/lib/dfd-validation";
import { num } from "@/lib/format";
import { enviarDfdEmLotes } from "@/lib/importar-dfd";
import { MESES, type Prioridade } from "@/lib/normalize";
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
import { buildPrevisao, DfdConferir } from "./DfdConferir";
import { Checkbox, TextField } from "./Field";
import { inputCls, labelCls, selectCls } from "./formStyles";
import { IconAlert, IconCheck, IconClipboard, IconFile, IconSpinner, IconUpload } from "./icons";
import { Modal } from "./Modal";
import { Progress } from "./Progress";
import { Segmented } from "./Segmented";

type Rep = { id: number; codigo: string; nome: string };
type DfdExistente = { numero: string; protocoloNumero: string | null };
type Status = "idle" | "parsing" | "error";
type Extra = { documento: string | null; localReparticao: string | null; valorCapa: number | null; nomeArquivo: string | null };
type Situacao = "novo" | "substitui" | "move";
type CampoBulk = "reparticao" | "prioridade" | "previsao" | "fundamentacao";

const EXTRA_VAZIO: Extra = { documento: null, localReparticao: null, valorCapa: null, nomeArquivo: null };
const CAP_ANALISE = 300; // teto de DFDs analisados na abertura (escala): além disto, "pendente" até abrir/protocolar

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
  const docRef = useRef<PdfDoc | null>(null);
  const [status, setStatus] = useState<Status>("idle");
  const [erro, setErro] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const [aberto, setAberto] = useState(false);

  // Metadados do protocolo.
  const [numero, setNumero] = useState("");
  const [data, setData] = useState("");
  const [interessado, setInteressado] = useState("");
  const [assunto, setAssunto] = useState("");
  const [observacao, setObservacao] = useState("");
  const [protoRepId, setProtoRepId] = useState<number | null>(null);
  const [extra, setExtra] = useState<Extra>(EXTRA_VAZIO);

  // Índice leve + repartição por DFD.
  const [index, setIndex] = useState<ProtocoloIndex | null>(null);
  const [dfdRepIds, setDfdRepIds] = useState<(number | null)[]>([]);
  const [autoRepIds, setAutoRepIds] = useState<(number | null)[]>([]);

  // Cache de parse/edição por DFD (idx) + estados.
  const [parsed, setParsed] = useState<Map<number, DfdParseado>>(new Map());
  const [autoMap, setAutoMap] = useState<Map<number, CampoTratavel[]>>(new Map());
  const [editados, setEditados] = useState<Set<number>>(new Set());
  const [analisando, setAnalisando] = useState(false);

  // Split-view (DFD aberto) + seleção/edição em massa.
  const [abertoIdx, setAbertoIdx] = useState(-1);
  const [carregandoIdx, setCarregandoIdx] = useState<number | null>(null);
  const [sel, setSel] = useState<Set<string | number>>(new Set()); // chaves = idx (number); tipo do DataTable
  const [bulkCampo, setBulkCampo] = useState<CampoBulk>("reparticao");
  const [bulkRep, setBulkRep] = useState<number | null>(null);
  const [bulkPrio, setBulkPrio] = useState<Prioridade | "">("");
  const [bulkMes, setBulkMes] = useState("");
  const [bulkAno, setBulkAno] = useState("");
  const [bulkAnual, setBulkAnual] = useState(false);
  const [bulkFund, setBulkFund] = useState("Lei 14.133/2021");

  const [importando, setImportando] = useState(false);
  const [progresso, setProgresso] = useState<{ feito: number; total: number; label: string } | null>(null);
  const [relatorio, setRelatorio] = useState<{ numero: string; importados: number; bloqueados: { numero: string; motivo: string }[] } | null>(null);

  useEffect(() => () => void docRef.current?.destroy(), []);
  useEffect(() => {
    if (!importando) return;
    const h = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", h);
    return () => window.removeEventListener("beforeunload", h);
  }, [importando]);

  function limparDoc() {
    docRef.current?.destroy();
    docRef.current = null;
  }
  function resetCache() {
    setParsed(new Map());
    setAutoMap(new Map());
    setEditados(new Set());
    setSel(new Set());
    setAbertoIdx(-1);
  }

  function abrirVazio() {
    limparDoc();
    resetCache();
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
      resetCache();
      const { index: idx, doc } = await indexarProtocoloPdf(file);
      const p = idx.protocolo;
      // Separa as vias / recusa documento errado: protocolo exige capa OU ≥2 DFDs.
      if (p.numero == null && idx.dfds.length <= 1) {
        setStatus("error");
        setErro(
          idx.dfds.length === 1
            ? "Isto parece um DFD avulso — importe pela aba DFDs."
            : "Não reconheci um protocolo (capa) nem DFDs neste PDF.",
        );
        await doc.destroy();
        return;
      }
      docRef.current = doc;
      const autos = idx.dfds.map((d) => casarReparticao(d, reparticoes));
      // Repartição do protocolo: pelo Interessado → senão 1º DFD casado → senão ativa.
      const repInteressado = p.interessado
        ? casarReparticao({ setorRequisitante: p.interessado, orgaoEntidade: p.interessado }, reparticoes)
        : null;
      setNumero(p.numero ?? "");
      setData(p.data ?? "");
      setInteressado(p.interessado ?? "");
      setAssunto(p.assunto ?? "");
      setObservacao(p.observacao ?? "");
      setExtra({ documento: p.documento, localReparticao: p.localReparticao, valorCapa: p.valorCapa, nomeArquivo: p.nomeArquivo });
      setIndex(idx);
      setDfdRepIds(autos);
      setAutoRepIds(autos);
      setProtoRepId(repInteressado ?? autos.find((x) => x != null) ?? reparticaoAtivaId);
      setStatus("idle");
      setAberto(true);
      void analisarTodos(idx, doc); // parse + estados em background (até o teto)
    } catch (e) {
      setStatus("error");
      setErro(e instanceof Error ? e.message : "Falha ao ler o protocolo.");
      limparDoc();
    }
  }

  /** Parseia (background) os DFDs até o teto, atualizando os estados incrementalmente. */
  async function analisarTodos(idx0: ProtocoloIndex, doc: PdfDoc) {
    const nome = idx0.protocolo.nomeArquivo ?? "protocolo.pdf";
    const total = Math.min(idx0.dfds.length, CAP_ANALISE);
    if (total === 0) return;
    setAnalisando(true);
    for (let i = 0; i < total; i++) {
      try {
        const raw = await parseDfdDoProtocolo(doc, idx0.dfds[i], nome);
        const { dfd, auto } = normalizarSecoesDfd(raw);
        setParsed((m) => new Map(m).set(i, dfd));
        if (auto.length) setAutoMap((m) => new Map(m).set(i, auto));
      } catch {
        // fica "pendente"; será tratado/bloqueado no import.
      }
      if (i % 5 === 4) await new Promise((r) => setTimeout(r, 0)); // cede o event loop
    }
    setAnalisando(false);
  }

  function fechar() {
    setAberto(false);
    setAbertoIdx(-1);
    limparDoc();
  }

  const nomeArq = extra.nomeArquivo ?? "protocolo.pdf";

  const classificar = (dfdNumero: string): Situacao => {
    const ex = dfdsExistentes.find((x) => x.numero.trim() === dfdNumero.trim());
    if (!ex) return "novo";
    if (ex.protocoloNumero && ex.protocoloNumero.trim() !== numero.trim()) return "move";
    return "substitui";
  };

  const estado = (idx: number): EstadoDfd => {
    const d = parsed.get(idx);
    if (!d) return "pendente";
    const faltas = faltasObrigatorias({ reparticaoId: dfdRepIds[idx], itens: d.itens, secoes: d.secoes });
    return estadoDfd(faltas.length, (autoMap.get(idx)?.length ?? 0) > 0, editados.has(idx));
  };

  function setRepDfd(idx: number, id: number | null) {
    setDfdRepIds((arr) => arr.map((x, i) => (i === idx ? id : x)));
    setEditados((s) => new Set(s).add(idx));
  }

  /** Garante o DFD parseado+normalizado no cache (uso: abrir/bulk). */
  async function garantirParse(idx: number): Promise<DfdParseado | null> {
    const doc = docRef.current;
    const di = index?.dfds[idx];
    if (!doc || !di) return null;
    const cached = parsed.get(idx);
    if (cached) return cached;
    const raw = await parseDfdDoProtocolo(doc, di, nomeArq);
    const { dfd, auto } = normalizarSecoesDfd(raw);
    setParsed((m) => new Map(m).set(idx, dfd));
    setAutoMap((m) => new Map(m).set(idx, auto));
    return dfd;
  }

  async function abrir(idx: number) {
    setErro(null);
    setCarregandoIdx(idx);
    try {
      await garantirParse(idx);
      setAbertoIdx(idx);
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Não foi possível ler este DFD.");
    } finally {
      setCarregandoIdx(null);
    }
  }

  const onSecoesAberto = (secoes: DfdParseado["secoes"]) => {
    setParsed((m) => {
      const d = m.get(abertoIdx);
      if (!d) return m;
      return new Map(m).set(abertoIdx, { ...d, secoes });
    });
    setEditados((s) => new Set(s).add(abertoIdx));
  };

  async function aplicarBulk() {
    const idxs = [...sel].map(Number); // chaves são idx numéricos
    if (idxs.length === 0) return;
    if (bulkCampo === "reparticao") {
      setDfdRepIds((arr) => arr.map((x, i) => (sel.has(i) ? bulkRep : x)));
    } else {
      const cfg = bulkCampo === "prioridade" ? TRATAVEIS[0] : bulkCampo === "previsao" ? TRATAVEIS[1] : TRATAVEIS[2];
      const texto =
        bulkCampo === "prioridade" ? bulkPrio : bulkCampo === "previsao" ? buildPrevisao(bulkMes, bulkAno, bulkAnual) : bulkFund;
      if (!texto) return;
      for (const i of idxs) {
        const d = await garantirParse(i);
        if (!d) continue;
        setParsed((m) => new Map(m).set(i, { ...d, secoes: setTextoSecao(d.secoes, cfg, texto) }));
      }
    }
    setEditados((s) => {
      const n = new Set(s);
      for (const i of idxs) n.add(i);
      return n;
    });
    setSel(new Set());
  }

  async function protocolar() {
    if (!index) return;
    setImportando(true);
    setErro(null);
    setRelatorio(null);
    try {
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

      const doc = docRef.current;
      const dfds = index.dfds;
      const bloqueados: { numero: string; motivo: string }[] = [];
      let importados = 0;
      for (let i = 0; i < dfds.length; i++) {
        const di = dfds[i];
        setProgresso({ feito: i, total: dfds.length, label: `DFD ${di.numero} (${i + 1}/${dfds.length})` });
        // Usa a cópia EDITADA do cache; senão parseia local (streaming, sem acumular).
        let full = parsed.get(i) ?? null;
        if (!full) {
          if (!doc) break;
          try {
            full = normalizarSecoesDfd(await parseDfdDoProtocolo(doc, di, nomeArq)).dfd;
          } catch (e) {
            bloqueados.push({ numero: di.numero, motivo: e instanceof Error ? e.message : "falha ao ler o DFD" });
            continue;
          }
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

  const SITUACAO: Record<Situacao, string> = { novo: "Novo", substitui: "Substitui", move: "Move" };

  const cols: Column<{ idx: number }>[] = [
    { key: "numero", header: "Nº DFD", filter: "none", render: (r) => <span className="font-mono">{index?.dfds[r.idx].numero}</span> },
    {
      key: "setor",
      header: "Setor / Repartição",
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
            <span className="shrink-0 text-[10px] font-semibold uppercase text-accent" title="Detectada automaticamente">
              auto
            </span>
          )}
        </div>
      ),
    },
    {
      key: "estado",
      header: "Estado",
      filter: "none",
      minWidth: 120,
      render: (r) => {
        const e = estado(r.idx);
        return (
          <span className="inline-flex items-center gap-1.5 text-[12px] font-medium" style={{ color: estadoCor(e) }}>
            <span className="h-2 w-2 rounded-full" style={{ background: estadoCor(e) }} />
            {ESTADO_ROTULO[e]}
          </span>
        );
      },
    },
    {
      key: "situacao",
      header: "Situação",
      filter: "none",
      minWidth: 90,
      render: (r) => <span className="text-[12px] text-muted">{SITUACAO[classificar(index?.dfds[r.idx].numero ?? "")]}</span>,
    },
  ];

  const linhas = (index?.dfds ?? []).map((_, idx) => ({ idx }));
  const semRep = (index?.dfds.length ?? 0) - dfdRepIds.filter((x) => x != null).length;
  const podeProtocolar = numero.trim().length > 0 && protoRepId != null && !importando;
  const pct = progresso && progresso.total > 0 ? Math.round((progresso.feito / progresso.total) * 100) : 0;
  const dfdAberto = abertoIdx >= 0 ? (parsed.get(abertoIdx) ?? null) : null;
  const temDfds = (index?.dfds.length ?? 0) > 0;

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
          O sistema identifica cada DFD, analisa e trata os campos. DFD com pendência nunca é protocolado — aparece
          no relatório ao final.
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

      {/* Banner */}
      <Modal
        open={aberto}
        onClose={fechar}
        titulo={numero ? `Protocolo ${numero}` : "Novo protocolo"}
        size="lg"
        fecharNoBackdrop={false}
        bloqueado={importando}
        lateral={
          temDfds
            ? {
                aberto: abertoIdx >= 0,
                titulo: abertoIdx >= 0 ? `DFD ${index?.dfds[abertoIdx]?.numero ?? ""}` : "DFD",
                onClose: () => setAbertoIdx(-1),
                rodape:
                  abertoIdx >= 0 ? (
                    <div className="flex items-center justify-between gap-3">
                      {dfdAberto ? (
                        <span
                          className="inline-flex items-center gap-1.5 text-[12px] font-medium"
                          style={{ color: estadoCor(estado(abertoIdx)) }}
                        >
                          <span className="h-2 w-2 rounded-full" style={{ background: estadoCor(estado(abertoIdx)) }} />
                          {ESTADO_ROTULO[estado(abertoIdx)]}
                        </span>
                      ) : (
                        <span />
                      )}
                      <Button variant="secondary" onClick={() => setAbertoIdx(-1)} disabled={importando}>
                        Fechar
                      </Button>
                    </div>
                  ) : undefined,
                children: (
                  <div key={abertoIdx} className="animate-fade-in-up">
                    {carregandoIdx === abertoIdx || !dfdAberto ? (
                      <Callout kind="info" icon={<IconSpinner className="h-5 w-5" />}>
                        Lendo o DFD...
                      </Callout>
                    ) : (
                      <DfdConferir
                        dfd={dfdAberto}
                        reparticoes={reparticoes}
                        reparticaoAtivaId={reparticaoAtivaId}
                        repId={dfdRepIds[abertoIdx] ?? null}
                        autoMatch={dfdRepIds[abertoIdx] != null && dfdRepIds[abertoIdx] === autoRepIds[abertoIdx]}
                        autoCampos={autoMap.get(abertoIdx) ?? []}
                        onRepChange={(id) => setRepDfd(abertoIdx, id)}
                        onSecoesChange={onSecoesAberto}
                      />
                    )}
                  </div>
                ),
              }
            : undefined
        }
        rodape={
          <div className="flex flex-wrap items-center justify-between gap-3">
            {importando && progresso ? (
              <div className="min-w-[200px] flex-1">
                <Progress value={pct} label={`Protocolando ${progresso.label}... ${pct}% — não feche esta janela`} />
              </div>
            ) : (
              <span className="text-[12px] text-muted">
                {!temDfds
                  ? "Sem DFDs — cria só o protocolo."
                  : `${index?.dfds.length} DFD(s) · ${semRep} sem repartição${analisando ? " · analisando..." : ""}`}
              </span>
            )}
            <div className="flex gap-2">
              {!importando && (
                <Button variant="secondary" onClick={fechar}>
                  Cancelar
                </Button>
              )}
              <Button onClick={protocolar} loading={importando} disabled={!podeProtocolar} icon={<IconUpload className="h-[18px] w-[18px]" />}>
                Protocolar
              </Button>
            </div>
          </div>
        }
      >
        <div className="space-y-5">
          {/* Metadados do protocolo */}
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
                Repartição do protocolo (pelo Interessado) <span style={{ color: "var(--danger)" }}>*</span>
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

          {!temDfds ? (
            <Callout kind="info">
              Nenhum DFD detectado. O protocolo será criado vazio — adicione DFDs depois (aba DFDs) ou vincule
              existentes.
            </Callout>
          ) : (
            <section className="space-y-3">
              {/* Barra de edição em massa (quando há seleção) */}
              {sel.size > 0 && (
                <div className="flex flex-wrap items-end gap-3 rounded-card border border-border bg-surface-2 p-3">
                  <div>
                    <span className="mb-1 block text-[11px] font-semibold uppercase text-muted">
                      Editar {sel.size} selecionado(s)
                    </span>
                    <Segmented<CampoBulk>
                      value={bulkCampo}
                      options={[
                        { value: "reparticao", label: "Repartição" },
                        { value: "prioridade", label: "Prioridade" },
                        { value: "previsao", label: "Previsão" },
                        { value: "fundamentacao", label: "Fund. legal" },
                      ]}
                      onChange={setBulkCampo}
                    />
                  </div>
                  <div className="flex flex-1 flex-wrap items-center gap-2">
                    {bulkCampo === "reparticao" && (
                      <select className={inputCls} style={{ width: "auto", minWidth: 200 }} value={bulkRep ?? ""} onChange={(e) => setBulkRep(e.target.value ? Number(e.target.value) : null)}>
                        <option value="">— Repartição —</option>
                        {reparticoes.map((r) => (
                          <option key={r.id} value={r.id}>
                            {r.codigo} · {r.nome}
                          </option>
                        ))}
                      </select>
                    )}
                    {bulkCampo === "prioridade" && (
                      <Segmented<Prioridade | "">
                        value={bulkPrio}
                        options={[
                          { value: "ALTA", label: "Alta" },
                          { value: "MÉDIA", label: "Média" },
                          { value: "BAIXA", label: "Baixa" },
                        ]}
                        onChange={setBulkPrio}
                      />
                    )}
                    {bulkCampo === "previsao" && (
                      <>
                        <select className={inputCls} style={{ width: "auto", flex: "0 1 140px" }} value={bulkMes} disabled={bulkAnual} onChange={(e) => setBulkMes(e.target.value)}>
                          <option value="">— Mês —</option>
                          {MESES.map((m) => (
                            <option key={m} value={m}>
                              {m[0] + m.slice(1).toLowerCase()}
                            </option>
                          ))}
                        </select>
                        <input className={inputCls} style={{ width: 84 }} inputMode="numeric" maxLength={4} placeholder="Ano" value={bulkAno} onChange={(e) => setBulkAno(e.target.value.replace(/\D/g, "").slice(0, 4))} />
                        <Checkbox label="Anual" checked={bulkAnual} onChange={(e) => setBulkAnual(e.target.checked)} />
                      </>
                    )}
                    {bulkCampo === "fundamentacao" && (
                      <div className="min-w-[220px] flex-1">
                        <TextField aria-label="Fundamentação legal" value={bulkFund} onChange={(e) => setBulkFund(e.target.value)} />
                      </div>
                    )}
                    <Button onClick={aplicarBulk}>Aplicar aos {sel.size}</Button>
                    <Button variant="ghost" onClick={() => setSel(new Set())}>
                      Limpar
                    </Button>
                  </div>
                </div>
              )}

              {/* Tabela dos DFDs (banner principal). Clique numa linha abre o banner
                  do DFD AO LADO (Modal `lateral`); trocar de DFD atualiza o lateral. */}
              <DataTable
                columns={cols}
                rows={linhas}
                getKey={(r) => r.idx}
                selectable
                selected={sel}
                onSelected={setSel}
                onRowClick={(r) => abrir(r.idx)}
                pageSize={25}
                minWidth={640}
                footer={`${index?.dfds.length} DFD(s) — clique numa linha para conferir/tratar ao lado`}
              />
            </section>
          )}
        </div>
      </Modal>
    </div>
  );
}
