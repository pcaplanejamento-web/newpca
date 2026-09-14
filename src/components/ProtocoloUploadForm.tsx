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
import { brl, num } from "@/lib/format";
import { enviarDfdEmLotes } from "@/lib/importar-dfd";
import { MESES, type Prioridade, valoresBatem } from "@/lib/normalize";
import type { DfdParseado } from "@/lib/parse-dfd-comum";
import {
  indexarProtocoloPdf,
  parseDfdDoProtocolo,
  type PdfDoc,
  type ProtocoloIndex,
} from "@/lib/parse-protocolo-pdf";
import { casarReparticao } from "@/lib/reparticao-match";
import {
  pdfExigeAssinatura,
  type Responsaveis,
  RESPONSAVEIS_VAZIO,
  validarAssinatura,
} from "@/lib/reparticao-responsaveis";
import { Button } from "./Button";
import { Callout } from "./Callout";
import { type Column, DataTable } from "./DataTable";
import { buildPrevisao, DfdConferir } from "./DfdConferir";
import { Dropzone } from "./Dropzone";
import { Checkbox, TextField } from "./Field";
import { inputCls, labelCls, selectCls } from "./formStyles";
import { IconAlert, IconCheck, IconClipboard, IconFile, IconSpinner, IconUpload } from "./icons";
import { Modal } from "./Modal";
import { Progress } from "./Progress";
import { Segmented } from "./Segmented";
import { StatMini } from "./StatMini";

type Rep = { id: number; codigo: string; nome: string; responsaveis: Responsaveis };
type DfdExistente = { numero: string; protocoloNumero: string | null };
type Status = "idle" | "parsing" | "error";
type Extra = { idExterno: string | null; documento: string | null; localReparticao: string | null; valorCapa: number | null; nomeArquivo: string | null };
type Situacao = "novo" | "substitui" | "move";
type CampoBulk = "reparticao" | "prioridade" | "previsao" | "fundamentacao";

const EXTRA_VAZIO: Extra = { idExterno: null, documento: null, localReparticao: null, valorCapa: null, nomeArquivo: null };
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
  const docRef = useRef<PdfDoc | null>(null);
  const [status, setStatus] = useState<Status>("idle");
  const [erro, setErro] = useState<string | null>(null);
  const [aberto, setAberto] = useState(false);
  const [launcher, setLauncher] = useState(false); // banner lançador (soltar/escolher | criar manual)
  // Origem PDF → os dados da CAPA são IMUTÁVEIS (só leitura); no "criar manual" (sem
  // PDF) o usuário digita a capa que está criando.
  const [origemPdf, setOrigemPdf] = useState(false);

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
  // Motivo de falha na LEITURA de um DFD (ex.: tabela de itens incompleta no PDF) —
  // vira estado "erro" com a mensagem, em vez de ficar "pendente" sem explicação.
  const [errosParse, setErrosParse] = useState<Map<number, string>>(new Map());
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
    setErrosParse(new Map());
    setSel(new Set());
    setAbertoIdx(-1);
  }

  function abrirVazio() {
    limparDoc();
    resetCache();
    setOrigemPdf(false); // criação manual: capa editável
    setErro(null);
    setRelatorio(null);
    setNumero("");
    setData("");
    setInteressado("");
    setAssunto("");
    setObservacao("");
    setExtra(EXTRA_VAZIO);
    setProtoRepId(reparticaoAtivaId);
    setIndex({ protocolo: { numero: null, idExterno: null, data: null, interessado: null, documento: null, assunto: null, valorCapa: null, observacao: null, localReparticao: null, nomeArquivo: null }, dfds: [] });
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
      setExtra({ idExterno: p.idExterno, documento: p.documento, localReparticao: p.localReparticao, valorCapa: p.valorCapa, nomeArquivo: p.nomeArquivo });
      setOrigemPdf(true); // capa lida do PDF: imutável (só leitura)
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
      } catch (e) {
        // Leitura falhou (ex.: item sem número no PDF → tabela incompleta). Guarda o
        // motivo → estado "erro" com a mensagem (não fica "pendente" sem explicação).
        setErrosParse((m) => new Map(m).set(i, e instanceof Error ? e.message : "Falha ao ler o DFD."));
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

  /** Confere a assinatura do DFD contra o responsável da repartição escolhida. */
  const confereAssinatura = (idx: number, d: DfdParseado) =>
    validarAssinatura(d.assinaturas, reparticoes.find((r) => r.id === dfdRepIds[idx])?.responsaveis ?? RESPONSAVEIS_VAZIO, {
      exigeAssinatura: pdfExigeAssinatura(d.nomeArquivo),
    });

  const estado = (idx: number): EstadoDfd => {
    if (errosParse.has(idx)) return "erro"; // falha de leitura (ex.: tabela incompleta)
    const d = parsed.get(idx);
    if (!d) return "pendente";
    // Assinatura não conferida (PDF sem assinatura, sem responsável, ou assinante
    // não autorizado) = erro → bloqueia protocolar (regra 6).
    if (confereAssinatura(idx, d).status === "erro") return "erro";
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
            idExterno: extra.idExterno,
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
        // Confere a assinatura (mesma regra do servidor) — não protocola DFD com
        // assinatura não permitida.
        const resAss = confereAssinatura(i, full);
        if (resAss.status === "erro") {
          bloqueados.push({ numero: di.numero, motivo: resAss.motivo });
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
              assinaturas: full.assinaturas,
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

  // Com o banner do DFD aberto ao lado, o principal fica estreito → colunas se ajustam
  // (sem minWidths e sem a coluna "Situação") p/ caber sem scroll lateral.
  const compacta = abertoIdx >= 0;
  const cols: Column<{ idx: number }>[] = [
    { key: "numero", header: "Nº DFD", filter: "none", render: (r) => <span className="font-mono">{index?.dfds[r.idx].numero}</span> },
    {
      key: "setor",
      header: "Setor / Repartição",
      filter: "none",
      minWidth: compacta ? undefined : 200,
      render: (r) => (
        <div className="flex items-center gap-1.5">
          <select
            className={selectCls}
            style={compacta ? { maxWidth: 150 } : undefined}
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
      minWidth: compacta ? undefined : 120,
      render: (r) => {
        const e = estado(r.idx);
        const motivo = errosParse.get(r.idx);
        return (
          <span
            className="inline-flex items-center gap-1.5 text-[12px] font-medium"
            style={{ color: estadoCor(e) }}
            title={motivo ?? undefined}
          >
            <span className="h-2 w-2 rounded-full" style={{ background: estadoCor(e) }} />
            {motivo ? "Leitura incompleta" : ESTADO_ROTULO[e]}
          </span>
        );
      },
    },
    ...(compacta
      ? []
      : [
          {
            key: "situacao",
            header: "Situação",
            filter: "none" as const,
            minWidth: 90,
            render: (r: { idx: number }) => (
              <span className="text-[12px] text-muted">{SITUACAO[classificar(index?.dfds[r.idx].numero ?? "")]}</span>
            ),
          },
        ]),
  ];

  const linhas = (index?.dfds ?? []).map((_, idx) => ({ idx }));
  // Agrupa por estado (erros no topo, p/ tratar) — muda de grupo ao mudar de estado.
  const ORDEM_ESTADO: Record<EstadoDfd, number> = { erro: 0, editado: 1, regularizado: 2, regular: 3, pendente: 4 };
  const linhasOrdenadas = [...linhas].sort((a, b) => ORDEM_ESTADO[estado(a.idx)] - ORDEM_ESTADO[estado(b.idx)]);
  const semRep = (index?.dfds.length ?? 0) - dfdRepIds.filter((x) => x != null).length;
  // Bloqueia a protocolação enquanto houver DFD com erro (não permite protocolo com DFDs defeituosos).
  const dfdsComErro = linhas.filter(({ idx }) => estado(idx) === "erro").length;
  const temDfds = (index?.dfds.length ?? 0) > 0;
  // Somatória dos valores dos DFDs (valor do DFD = soma dos seus itens). Só é completa
  // quando todos foram analisados e nenhum está com erro.
  const somatorioDfds = [...parsed.values()].reduce((s, d) => s + (d.valorTotal ?? d.valorEstimado ?? 0), 0);
  const itensDfds = [...parsed.values()].reduce((s, d) => s + d.itens.length, 0);
  const conciliavel = temDfds && !analisando && dfdsComErro === 0;
  // Regra 2: NÃO protocola com o Valor da capa **zerado/nulo** OU **diferente** da
  // somatória dos valores dos DFDs — divergência trava (substituível pela somatória).
  const capaZeradaOuNula = extra.valorCapa == null || extra.valorCapa <= 0;
  const capaDivergente = conciliavel && (capaZeradaOuNula || !valoresBatem(extra.valorCapa, somatorioDfds));
  const podeProtocolar =
    numero.trim().length > 0 &&
    protoRepId != null &&
    !importando &&
    !analisando &&
    dfdsComErro === 0 &&
    !capaDivergente;
  const pct = progresso && progresso.total > 0 ? Math.round((progresso.feito / progresso.total) * 100) : 0;
  const dfdAberto = abertoIdx >= 0 ? (parsed.get(abertoIdx) ?? null) : null;

  // Barra de edição em massa — FIXA no rodapé do banner, tamanho constante:
  // cima = controle do valor (altura fixa); baixo = seletor do campo + Aplicar + Limpar.
  const barraMassa = sel.size > 0 && !importando && (
    <div className="mb-3 rounded-card border border-border bg-surface-2 p-3">
      <div className="flex min-h-[42px] flex-wrap items-center gap-2">
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
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-2">
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
        <Button onClick={aplicarBulk}>Aplicar</Button>
        <Button variant="ghost" onClick={() => setSel(new Set())}>
          Limpar
        </Button>
        <span className="ml-auto text-[11px] font-semibold uppercase text-muted">{sel.size} selecionado(s)</span>
      </div>
    </div>
  );

  return (
    <div className="space-y-4">
      {/* Botão único de importação (à direita) — abre o lançador */}
      <div className="flex justify-end">
        <Button onClick={() => setLauncher(true)} icon={<IconUpload className="h-[18px] w-[18px]" />}>
          Importar protocolo
        </Button>
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

      {/* Lançador de importação — banner dividido ao meio: soltar/escolher | criar manual */}
      <Modal open={launcher} onClose={() => setLauncher(false)} titulo="Importar protocolo" size="xl">
        <div className="grid gap-4 sm:grid-cols-2">
          <Dropzone
            accept=".pdf"
            onFile={(f) => {
              setLauncher(false);
              handleFile(f);
            }}
            titulo="Soltar o protocolo (.pdf)"
            icon={<IconClipboard className="h-7 w-7" />}
            dica="O sistema identifica cada DFD, analisa e trata os campos."
          />
          <div className="flex flex-col items-center justify-center rounded-card border border-border bg-surface-2 p-6 text-center">
            <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-surface text-muted">
              <IconFile className="h-7 w-7" />
            </span>
            <h4 className="mt-4 text-sm font-bold text-text">Criar manualmente</h4>
            <p className="mt-1 text-xs text-muted">Sem PDF — você preenche os dados e adiciona/vincula DFDs depois.</p>
            <Button
              variant="secondary"
              className="mt-4"
              onClick={() => {
                setLauncher(false);
                abrirVazio();
              }}
            >
              Novo protocolo (sem PDF)
            </Button>
          </div>
        </div>
      </Modal>

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
          <div>
            {barraMassa}
            <div className="flex flex-wrap items-center justify-between gap-3">
              {importando && progresso ? (
                <div className="min-w-[200px] flex-1">
                  <Progress value={pct} label={`Protocolando ${progresso.label}... ${pct}% — não feche esta janela`} />
                </div>
              ) : (
              <span
                className="text-[12px]"
                style={{ color: dfdsComErro > 0 || capaDivergente ? "var(--danger)" : "var(--muted)" }}
              >
                {!temDfds
                  ? "Sem DFDs — cria só o protocolo."
                  : analisando
                    ? `Analisando ${index?.dfds.length} DFD(s)...`
                    : dfdsComErro > 0
                      ? `${dfdsComErro} DFD(s) com erro — trate antes de protocolar`
                      : capaDivergente
                        ? "Valor da capa diverge da somatória — substitua para liberar"
                        : `${index?.dfds.length} DFD(s) · ${semRep} sem repartição · tudo certo`}
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
          </div>
        }
      >
        <div className="space-y-5">
          {/* Head — mini banners (um por informação) + conferência do valor da capa */}
          {temDfds && (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              <StatMini label="Total de DFDs" value={num(index?.dfds.length ?? 0)} />
              <StatMini label="Total de itens" value={num(itensDfds)} hint={analisando ? "analisando…" : undefined} />
              <StatMini
                label="Somatória dos DFDs"
                value={brl(somatorioDfds)}
                tone={capaDivergente ? "warn" : "default"}
                hint={analisando ? "analisando…" : undefined}
                className="col-span-2 sm:col-span-1"
              />
            </div>
          )}
          {capaDivergente && (
            <Callout kind="danger" icon={<IconAlert className="h-5 w-5" />}>
              <p className="font-semibold">
                {capaZeradaOuNula
                  ? "O valor da capa está zerado — não é possível protocolar"
                  : "O valor da capa diverge da somatória dos DFDs"}
              </p>
              <p className="mt-1 opacity-90">
                Valor da capa: {extra.valorCapa != null ? brl(extra.valorCapa) : "—"} · Somatória dos DFDs:{" "}
                {brl(somatorioDfds)}. Substitua o valor da capa pela somatória para liberar a protocolação.
              </p>
              <div className="mt-2">
                <Button variant="secondary" onClick={() => setExtra((x) => ({ ...x, valorCapa: somatorioDfds }))}>
                  Substituir pela somatória ({brl(somatorioDfds)})
                </Button>
              </div>
            </Callout>
          )}

          {/* Metadados do protocolo */}
          <section className="grid gap-3 sm:grid-cols-2">
            <TextField label="Número do processo" value={numero} onChange={(e) => setNumero(e.target.value)} disabled={origemPdf} readOnly={origemPdf} placeholder="Ex.: 144756/2026" />
            <TextField label="Id do processo" value={extra.idExterno ?? ""} disabled readOnly placeholder="—" />
            <TextField label="Data/Hora" value={data} onChange={(e) => setData(e.target.value)} disabled={origemPdf} readOnly={origemPdf} placeholder="—" />
            <TextField label="CPF/CNPJ" value={extra.documento ?? ""} onChange={(e) => setExtra((x) => ({ ...x, documento: e.target.value || null }))} disabled={origemPdf} readOnly={origemPdf} placeholder="—" />
            <div className="sm:col-span-2">
              <TextField label="Interessado" value={interessado} onChange={(e) => setInteressado(e.target.value)} disabled={origemPdf} readOnly={origemPdf} />
            </div>
            <TextField label="Assunto" value={assunto} onChange={(e) => setAssunto(e.target.value)} disabled={origemPdf} readOnly={origemPdf} />
            <TextField label="Observação" value={observacao} onChange={(e) => setObservacao(e.target.value)} disabled={origemPdf} readOnly={origemPdf} />
            <TextField label="Valor (capa)" value={extra.valorCapa != null ? brl(extra.valorCapa) : "—"} disabled readOnly />
            <TextField label="Local (capa)" value={extra.localReparticao ?? ""} disabled readOnly placeholder="—" />
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
              {/* Tabela dos DFDs (banner principal). Clique numa linha abre o banner
                  do DFD AO LADO (Modal `lateral`); trocar de DFD atualiza o lateral. */}
              <DataTable
                columns={cols}
                rows={linhasOrdenadas}
                getKey={(r) => r.idx}
                selectable
                selected={sel}
                onSelected={setSel}
                onRowClick={(r) => abrir(r.idx)}
                pageSize={compacta ? 12 : 20}
                minWidth={compacta ? 320 : 640}
                footer={`${index?.dfds.length} DFD(s) — clique numa linha para conferir/tratar ao lado`}
              />
            </section>
          )}
        </div>
      </Modal>
    </div>
  );
}
