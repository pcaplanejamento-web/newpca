"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { classificarAssunto, comportamentoNo, gateProtocolo, protocolarHabilitado, type RegrasAvaliacao, regrasPadrao } from "@/lib/avaliacao-core";
import type { ConferenciaItem } from "@/lib/catalogo-conferencia";
import { conferirItensCliente } from "@/lib/catalogo-conferir-cliente";
import { encerrarOcr } from "@/lib/ocr-assinatura";
import { mesclarAssinaturasOcr, precisaOcr } from "@/lib/ocr-assinatura-core";
import {
  avaliarDfd,
  type CampoTratavel,
  estadoRotulo,
  type EstadoDfd,
  estadoCor,
  dfdsDuplicados,
  editarItemDfd,
  estadoDfd,
  FALTA_REFERENCIA_RENOVACAO,
  faltasCirurgicasDfd,
  type GrupoAssinatura,
  gruposAssinatura,
  linhasRelatorioProtocolo,
  normalizarSecoesDfd,
  type ResumoEstado,
  resumoEstado,
  setTextoSecao,
  STATUS_MENSAGEM_COR,
  TRATAVEIS,
} from "@/lib/dfd-tratamento";
import { faltasObrigatorias } from "@/lib/dfd-validation";
import { brl, num } from "@/lib/format";
import { enviarDfdEmLotes } from "@/lib/importar-dfd";
import { MESES, type Prioridade, valoresBatem } from "@/lib/normalize";
import { type DfdParseado, tipoCurtoDfd } from "@/lib/parse-dfd-comum";
import {
  indexarProtocoloPdf,
  ocrAssinaturasEmPaginas,
  parseDfdDoProtocolo,
  type PdfDoc,
  type ProtocoloIndex,
} from "@/lib/parse-protocolo-pdf";
import { casarPorInteressado, preverUnidadeDoDfd } from "@/lib/reparticao-match";
import {
  bloqueiaAssinatura,
  pdfExigeAssinatura,
  type Responsaveis,
  RESPONSAVEIS_VAZIO,
  validarAssinatura,
} from "@/lib/reparticao-responsaveis";
import { Button } from "./Button";
import { Callout } from "./Callout";
import { buildPrevisao, DfdConferir, mensagensDoDfd, type PainelDfd } from "./DfdConferir";
import { DfdCabecalho } from "./DfdView";
import { Dropzone } from "./Dropzone";
import { Checkbox, TextField } from "./Field";
import { inputCls, labelCls } from "./formStyles";
import { IconAlert, IconCheck, IconClipboard, IconFile, IconSpinner, IconUpload } from "./icons";
import { ItemDetalhe } from "./ItemDetalhe";
import { BotaoVerMensagens, MensagensDfd } from "./MensagensDfd";
import { Modal } from "./Modal";
import { type PcaOpcao, PcaPicker } from "./PcaPicker";
import { type LinhaDfd, PlanilhaDfds } from "./PlanilhaDfds";
import { Progress } from "./Progress";
import { CapaCampos, ProtocoloCabecalho } from "./ProtocoloView";
import { RelatorioErros } from "./RelatorioErros";
import { Segmented } from "./Segmented";
import { StatMini } from "./StatMini";

type Rep = {
  id: number;
  codigo: string;
  nome: string;
  orgaoId?: number | null;
  orgaoProprio?: boolean | null;
  setorRequisitante?: string | null;
  numeroInteressado?: string | null;
  oculto?: boolean | null;
  responsaveis: Responsaveis;
};
type Orgao = { id: number; sigla: string; nome: string; orgaoEntidade: string | null; assinaturaUnica?: boolean | null };
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
  pcas = [],
  regras = regrasPadrao(),
  orgaos = [],
}: {
  reparticoes: Rep[];
  reparticaoAtivaId?: number | null;
  dfdsExistentes?: DfdExistente[];
  pcas?: PcaOpcao[];
  regras?: RegrasAvaliacao;
  orgaos?: Orgao[];
}) {
  const router = useRouter();
  const docRef = useRef<PdfDoc | null>(null);
  // DFDs em que o OCR do carimbo Foxit (Formato E) já foi tentado — não repete (o OCR é caro; roda só
  // uma vez por DFD, ao abrir/protocolar um que ficou sem assinatura de texto).
  const ocrTentadoRef = useRef<Set<number>>(new Set());
  const [status, setStatus] = useState<Status>("idle");
  const [erro, setErro] = useState<string | null>(null);
  const [aberto, setAberto] = useState(false);
  const [launcher, setLauncher] = useState(false); // banner lançador (soltar/escolher | criar manual)
  // Origem PDF → os dados da CAPA são IMUTÁVEIS (só leitura); no "criar manual" (sem
  // PDF) o usuário digita a capa que está criando.
  const [origemPdf, setOrigemPdf] = useState(false);
  const [relatorioAberto, setRelatorioAberto] = useState(false); // banner de relatório de erros
  const [incluirAtencao, setIncluirAtencao] = useState(true); // incluir DFD-R sem referência no relatório

  // Metadados do protocolo.
  const [numero, setNumero] = useState("");
  const [data, setData] = useState("");
  const [interessado, setInteressado] = useState("");
  const [assunto, setAssunto] = useState("");
  const [observacao, setObservacao] = useState("");
  const [protoRepId, setProtoRepId] = useState<number | null>(null);
  const [protoOrgaoId, setProtoOrgaoId] = useState<number | null>(null); // protocolo em nome do ÓRGÃO (ponto 2)
  const [extra, setExtra] = useState<Extra>(EXTRA_VAZIO);
  // PCA do protocolo (ano). Adivinhado pela descrição; o usuário confirma/escolhe. Os
  // DFDs herdam este ano ao protocolar. Obrigatório para protocolar.
  const [anoPca, setAnoPca] = useState<number | null>(null);
  const [anoPcaDetectado, setAnoPcaDetectado] = useState<number | null>(null);

  // Índice leve + repartição por DFD.
  const [index, setIndex] = useState<ProtocoloIndex | null>(null);
  const [dfdRepIds, setDfdRepIds] = useState<(number | null)[]>([]);
  const [autoRepIds, setAutoRepIds] = useState<(number | null)[]>([]);

  // Cache de parse/edição por DFD (idx) + estados.
  const [parsed, setParsed] = useState<Map<number, DfdParseado>>(new Map());
  const [autoMap, setAutoMap] = useState<Map<number, CampoTratavel[]>>(new Map());
  const [editados, setEditados] = useState<Set<number>>(new Set());
  // DFDs DUPLICADOS descartados pelo usuário (o "perdedor" de cada grupo) — ficam cinza,
  // fora da somatória e da protocolação. Chave = idx do DFD no `index.dfds`.
  const [descartados, setDescartados] = useState<Set<number>>(new Set());
  // Motivo de falha na LEITURA de um DFD (ex.: tabela de itens incompleta no PDF) —
  // vira estado "erro" com a mensagem, em vez de ficar "pendente" sem explicação.
  const [errosParse, setErrosParse] = useState<Map<number, string>>(new Map());
  const [analisando, setAnalisando] = useState(false);

  // Split-view (DFD aberto) + seleção/edição em massa.
  const [abertoIdx, setAbertoIdx] = useState(-1);
  // Painel da DIREITA (lateral2) do DFD aberto: mensagens OU detalhe de um item + rolagem/destaque.
  const [painel, setPainel] = useState<PainelDfd | null>(null);
  const [ancoraAlvo, setAncoraAlvo] = useState<{ ancora: string; cor: string; nonce: number } | null>(null);
  const [carregandoIdx, setCarregandoIdx] = useState<number | null>(null);
  // Conformidade do DFD ABERTO com o catálogo (lazy — só o DFD aberto; a lista fica leve/escalável).
  const [conformidade, setConformidade] = useState<Map<string, ConferenciaItem>>();
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

  useEffect(() => () => {
    void docRef.current?.destroy();
    void encerrarOcr(); // libera o worker do OCR ao desmontar
  }, []);
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
    ocrTentadoRef.current.clear(); // novo protocolo → o OCR pode ser tentado de novo
    void encerrarOcr(); // libera o worker do OCR entre protocolos
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
    setAnoPca(null);
    setAnoPcaDetectado(null);
    setProtoRepId(reparticaoAtivaId);
    setProtoOrgaoId(null);
    setIndex({ protocolo: { numero: null, idExterno: null, anoPca: null, data: null, interessado: null, documento: null, assunto: null, valorCapa: null, observacao: null, localReparticao: null, nomeArquivo: null }, dfds: [] });
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
      const autos = idx.dfds.map((d) => preverUnidadeDoDfd(d, orgaos, reparticoes));
      // Ponto 2: o protocolo pode vir em nome do ÓRGÃO ou da UNIDADE (pelo Interessado — número
      // cadastrado, senão nome). Unidade → vira a unidade do protocolo; Órgão → guarda o órgão
      // (a unidade cai no 1º DFD casado / a ativa).
      const alvoInteressado = casarPorInteressado(p.interessado, orgaos, reparticoes);
      const repInteressado = alvoInteressado?.tipo === "unidade" ? alvoInteressado.id : null;
      const orgaoInteressado = alvoInteressado?.tipo === "orgao" ? alvoInteressado.id : null;
      setNumero(p.numero ?? "");
      setData(p.data ?? "");
      setInteressado(p.interessado ?? "");
      setAssunto(p.assunto ?? "");
      setObservacao(p.observacao ?? "");
      setExtra({ idExterno: p.idExterno, documento: p.documento, localReparticao: p.localReparticao, valorCapa: p.valorCapa, nomeArquivo: p.nomeArquivo });
      // Adivinha o PCA pela capa; pré-seleciona só se o ano existir cadastrado.
      setAnoPcaDetectado(p.anoPca);
      setAnoPca(p.anoPca != null && pcas.some((x) => x.ano === p.anoPca) ? p.anoPca : null);
      setOrigemPdf(true); // capa lida do PDF: imutável (só leitura)
      setIndex(idx);
      setDfdRepIds(autos);
      setAutoRepIds(autos);
      setProtoRepId(repInteressado ?? autos.find((x) => x != null) ?? reparticaoAtivaId);
      setProtoOrgaoId(orgaoInteressado);
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
        // Previsão segue o PCA do PROTOCOLO (ponto 7) — usa o ano detectado na capa (o estado
        // `anoPca` ainda não reflete o setState recém-disparado; `idx0.protocolo.anoPca` é fresco).
        const { dfd, auto } = normalizarSecoesDfd(raw, regras, idx0.protocolo.anoPca);
        setParsed((m) => new Map(m).set(i, dfd));
        if (auto.length) setAutoMap((m) => new Map(m).set(i, auto));
        // Refina a UNIDADE com as assinaturas do PARSE COMPLETO — que inclui a **Dropsigner**
        // (o índice só tem A/B, então DFD só-Dropsigner ficava sem previsão). A lógica é a MESMA
        // p/ todas as assinaturas (`preverUnidadeDoDfd`). Só PREENCHE quando ainda está sem unidade
        // (não sobrescreve previsão do índice nem escolha manual do usuário).
        const refino = preverUnidadeDoDfd(dfd, orgaos, reparticoes);
        if (refino != null) {
          setDfdRepIds((arr) => (arr[i] == null ? arr.map((x, j) => (j === i ? refino : x)) : arr));
          setAutoRepIds((arr) => (arr[i] == null ? arr.map((x, j) => (j === i ? refino : x)) : arr));
        }
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

  // Categoria do protocolo (classifica o assunto livre) → aplica as exceções por categoria.
  const categoria = classificarAssunto(assunto);

  /** Confere a assinatura do DFD contra o responsável da repartição escolhida. */
  const confereAssinatura = (idx: number, d: DfdParseado) =>
    validarAssinatura(d.assinaturas, reparticoes.find((r) => r.id === dfdRepIds[idx])?.responsaveis ?? RESPONSAVEIS_VAZIO, {
      exigeAssinatura: pdfExigeAssinatura(d.nomeArquivo),
    });

  // ---- DFDs DUPLICADOS (mesmo nº de DFD ou de planejamento) — ponto configurável `protocolo.dfdDuplicado`.
  const dupComp = comportamentoNo(regras, "protocolo.dfdDuplicado", { categoria });
  const gruposDup =
    dupComp === "ignora"
      ? []
      : dfdsDuplicados(
          (index?.dfds ?? []).map((di, i) => ({ numero: di.numero, planejamento: parsed.get(i)?.planejamento ?? null })),
        );
  const grupoDupDe = (idx: number): number[] | undefined => gruposDup.find((g) => g.includes(idx));
  /** Duplicata AINDA não resolvida: o grupo tem 2+ DFDs não-descartados (falta escolher um). */
  const dupPendente = (idx: number): boolean => {
    const g = grupoDupDe(idx);
    return !!g && g.filter((i) => !descartados.has(i)).length > 1;
  };
  /** "Manter este DFD": descarta os OUTROS do grupo (o escolhido continua). */
  const manterDfd = (idx: number) => {
    const g = grupoDupDe(idx);
    if (!g) return;
    setDescartados((prev) => {
      const s = new Set(prev);
      for (const j of g) if (j !== idx) s.add(j);
      return s;
    });
    setSel(new Set()); // as linhas mudam de tabela → limpa a seleção em massa
  };
  /** Reincluir um DFD descartado (o grupo volta a "pendente"). */
  const restaurarDfd = (idx: number) => {
    setDescartados((prev) => {
      const s = new Set(prev);
      s.delete(idx);
      return s;
    });
  };
  /** Este DFD substitui/move um já CADASTRADO (conflito com o banco)? */
  const conflitaComExistente = (idx: number): boolean => {
    const n = index?.dfds[idx]?.numero;
    return n != null && classificar(n) !== "novo";
  };
  /** "Manter o existente": descarta ESTE DFD do envio → o já cadastrado PREVALECE (não é
   * sobrescrito). Sem descartar, o novo prevalece (substitui/move). É a escolha de qual DFD vence. */
  const descartarDfd = (idx: number) => {
    setDescartados((prev) => new Set(prev).add(idx));
    setSel(new Set());
  };

  const estadoBase = (idx: number): EstadoDfd => {
    if (errosParse.has(idx)) return "erro"; // falha de leitura (ex.: tabela incompleta)
    const d = parsed.get(idx);
    if (!d) return "pendente";
    const compAss = comportamentoNo(regras, "dfd.assinatura", { dfdTipo: tipoCurtoDfd(d.tipo), categoria });
    // Assinatura não conferida — bloqueia só se `dfd.assinatura` estiver numa importância que bloqueia (regra 6).
    const assRes = confereAssinatura(idx, d);
    if (bloqueiaAssinatura(assRes, compAss)) return "erro";
    // Avaliação configurável: bloqueantes (bloqueia) → erro; atenções (avisa/automático,
    // incl. DFD-R sem referência e quantidade) → âmbar.
    const av = avaliarDfd({ ...d, reparticaoId: dfdRepIds[idx] }, regras, { categoria });
    if (av.bloqueantes.length > 0) return "erro";
    const assAtencao = assRes.status === "erro" && compAss === "avisa";
    const atencao = av.atencoes.length > 0 || assAtencao;
    return estadoDfd(0, (autoMap.get(idx)?.length ?? 0) > 0, editados.has(idx), atencao);
  };

  /** Estado FINAL: descartado (cinza) › duplicata pendente (bloqueia→erro / avisa→atenção) › base. */
  const estado = (idx: number): EstadoDfd => {
    if (descartados.has(idx)) return "descartado";
    const base = estadoBase(idx);
    if (dupComp !== "ignora" && dupPendente(idx)) {
      if (dupComp === "bloqueia") return "erro";
      return base === "erro" ? "erro" : "atencao"; // "avisa" não rebaixa um erro real
    }
    return base;
  };

  // Resumo da célula "Estado" (erro/atenção ESPECÍFICO + contadores + tooltip) — reusa
  // `mensagensDoDfd`. ALINHADO ao AGRUPAMENTO (`estado`/`avaliarDfd`): sem catálogo (lazy), SEM as
  // flags de órgão (não entram no agrupamento → `orgaos: []`) e EXCLUINDO o ano do PCA (portão do
  // PROTOCOLO, resolvido uma vez no PcaPicker — não é falta por-DFD). Assim a célula nunca contradiz
  // a seção (erro/atenção/regular) em que a linha foi colocada. Sem parse ainda ⇒ undefined.
  const resumoDfd = (idx: number): ResumoEstado | undefined => {
    if (descartados.has(idx)) return undefined; // célula mostra "Descartado" (rótulo do estado)
    const dup = dupComp !== "ignora" && dupPendente(idx);
    const d = parsed.get(idx);
    const rep = reparticoes.find((r) => r.id === dfdRepIds[idx]) ?? null;
    const msgs = d ? mensagensDoDfd(d, rep, anoPca, regras, categoria, []).filter((m) => m.chave !== "dfd.anoPca") : [];
    if (dup)
      msgs.unshift({
        status: dupComp === "bloqueia" ? "erro" : "atencao",
        chave: "protocolo.dfdDuplicado",
        texto: "DFD duplicado (mesmo nº ou planejamento) — escolha um para manter.",
        ancora: "",
      });
    return msgs.length > 0 ? resumoEstado(msgs) : undefined;
  };
  // Tipos de assinatura do DFD (Centi/Dropsigner/Adobe). Antes do parse completo, cai nas A/B do índice.
  const assinaturasDfd = (idx: number): GrupoAssinatura[] =>
    gruposAssinatura(parsed.get(idx)?.assinaturas ?? index?.dfds[idx]?.assinaturas ?? []);

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
    const { dfd, auto } = normalizarSecoesDfd(raw, regras, anoPca);
    setParsed((m) => new Map(m).set(idx, dfd));
    setAutoMap((m) => new Map(m).set(idx, auto));
    return dfd;
  }

  /** Assinatura ACHATADA (Dropsigner/Foxit/Adobe sem camada de texto) — se o DFD ficou sem assinatura
   * NOMEADA de texto (`precisaOcr`), tenta o OCR UMA vez e MESCLA no parse cacheado (preserva edições).
   * Lazy/best-effort: roda só ao abrir/protocolar (nunca no background) e nunca trava o import. */
  async function mesclarOcrSePreciso(idx: number, d: DfdParseado | null): Promise<void> {
    const doc = docRef.current;
    const di = index?.dfds[idx];
    // `d` vem do `garantirParse` (o `parsed` do closure ainda não reflete o `setParsed` recém-agendado,
    // então DFD não-cacheado — idx ≥ CAP_ANALISE ou antes do background — leria `undefined` aqui).
    if (!doc || !di || !d || !precisaOcr(d.assinaturas) || ocrTentadoRef.current.has(idx)) return;
    ocrTentadoRef.current.add(idx);
    const ocr = await ocrAssinaturasEmPaginas(doc, di.pages);
    if (ocr.length > 0)
      setParsed((m) => {
        const cur = m.get(idx);
        return cur ? new Map(m).set(idx, { ...cur, assinaturas: mesclarAssinaturasOcr(cur.assinaturas, ocr) }) : m;
      });
  }

  async function abrir(idx: number) {
    setErro(null);
    setCarregandoIdx(idx);
    setPainel(null); // abre só o DFD (sem mensagens/detalhe do DFD anterior)
    setAncoraAlvo(null);
    try {
      const d = await garantirParse(idx);
      await mesclarOcrSePreciso(idx, d); // assinatura achatada: OCR se faltou assinatura nomeada de texto
      setAbertoIdx(idx);
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Não foi possível ler este DFD.");
    } finally {
      setCarregandoIdx(null);
    }
  }

  /** Fecha o DFD do lateral (e o painel da direita, se aberto). */
  function fecharDfdLateral() {
    setAbertoIdx(-1);
    setPainel(null);
    setAncoraAlvo(null);
  }
  /** Clique numa mensagem: rola/destaca a âncora no DFD (que segue ao lado) na cor do status. */
  function irParaMensagem(m: { ancora: string; status: "erro" | "atencao" | "acerto" }) {
    setAncoraAlvo({ ancora: m.ancora, cor: STATUS_MENSAGEM_COR[m.status], nonce: Date.now() });
  }

  const onSecoesAberto = (secoes: DfdParseado["secoes"]) => {
    setParsed((m) => {
      const d = m.get(abertoIdx);
      if (!d) return m;
      return new Map(m).set(abertoIdx, { ...d, secoes });
    });
    setEditados((s) => new Set(s).add(abertoIdx));
  };

  // Edição manual das referências de renovação (DFD-R) do DFD aberto no lateral.
  const onRefsAberto = (refs: { numeroContrato: string | null; numeroAta: string | null; numeroLicitacao: string | null }) => {
    setParsed((m) => {
      const d = m.get(abertoIdx);
      if (!d) return m;
      return new Map(m).set(abertoIdx, { ...d, ...refs });
    });
    setEditados((s) => new Set(s).add(abertoIdx));
  };

  // Edição dos campos de CONTEÚDO do cabeçalho do DFD aberto no lateral (cadeado por campo).
  const onCamposAberto = (campos: Partial<DfdParseado>) => {
    setParsed((m) => {
      const d = m.get(abertoIdx);
      if (!d) return m;
      return new Map(m).set(abertoIdx, { ...d, ...campos });
    });
    setEditados((s) => new Set(s).add(abertoIdx));
  };

  // Edição de UM item (índice `painelIdx`) do DFD aberto no lateral (recomputa o total do DFD).
  const onItemAberto = (painelIdx: number, patch: Partial<DfdParseado["itens"][number]>) => {
    setParsed((m) => {
      const d = m.get(abertoIdx);
      if (!d) return m;
      return new Map(m).set(abertoIdx, editarItemDfd(d, painelIdx, patch));
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
            anoPca,
            data: data || null,
            interessado: interessado || null,
            documento: extra.documento,
            assunto: assunto || null,
            observacao: observacao || null,
            valorCapa: extra.valorCapa,
            reparticaoId: protoRepId,
            orgaoId: protoOrgaoId,
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
        if (descartados.has(i)) continue; // DFD duplicado descartado — não protocola
        const di = dfds[i];
        setProgresso({ feito: i, total: dfds.length, label: `DFD ${di.numero} (${i + 1}/${dfds.length})` });
        // Usa a cópia EDITADA do cache; senão parseia local (streaming, sem acumular).
        let full = parsed.get(i) ?? null;
        if (!full) {
          if (!doc) break;
          try {
            full = normalizarSecoesDfd(await parseDfdDoProtocolo(doc, di, nomeArq), regras, anoPca).dfd;
          } catch (e) {
            bloqueados.push({ numero: di.numero, motivo: e instanceof Error ? e.message : "falha ao ler o DFD" });
            continue;
          }
        }
        // Assinatura achatada — DFD sem assinatura NOMEADA de texto: tenta o OCR e mescla (uma vez). A
        // assinatura lida entra no `full` → é conferida (gate de assinatura) e GRAVADA com o DFD.
        if (precisaOcr(full.assinaturas) && !ocrTentadoRef.current.has(i) && doc) {
          ocrTentadoRef.current.add(i);
          setProgresso({ feito: i, total: dfds.length, label: `DFD ${di.numero} — lendo assinatura…` });
          try {
            const ocr = await ocrAssinaturasEmPaginas(doc, di.pages);
            if (ocr.length > 0) full = { ...full, assinaturas: mesclarAssinaturasOcr(full.assinaturas, ocr) };
          } catch {
            /* OCR é auxiliar — segue sem assinatura (o gate decide) */
          }
        }
        const faltas = faltasObrigatorias(
          {
            reparticaoId: dfdRepIds[i],
            itens: full.itens,
            secoes: full.secoes,
            tipo: full.tipo,
            numeroContrato: full.numeroContrato,
            numeroAta: full.numeroAta,
            numeroLicitacao: full.numeroLicitacao,
          },
          regras,
          { categoria },
        );
        if (faltas.length > 0) {
          bloqueados.push({ numero: di.numero, motivo: faltas.join(", ") });
          continue;
        }
        // Confere a assinatura (mesma regra do servidor) — o nível `dfd.assinatura` decide.
        const resAss = confereAssinatura(i, full);
        if (bloqueiaAssinatura(resAss, comportamentoNo(regras, "dfd.assinatura", { dfdTipo: tipoCurtoDfd(full.tipo), categoria }))) {
          bloqueados.push({ numero: di.numero, motivo: resAss.status === "erro" ? resAss.motivo : "assinatura" });
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
              // Regra: todos os DFDs do protocolo herdam o ano do PCA do protocolo.
              anoPca,
              numeroContrato: full.numeroContrato,
              numeroAta: full.numeroAta,
              numeroLicitacao: full.numeroLicitacao,
              reparticaoId: dfdRepIds[i],
              protocoloId,
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

  const compacta = abertoIdx >= 0; // DFD aberto ao lado → tabela estreita (rola no eixo x)
  // Acessores por linha (puxam do cache de parse + repartição atribuída).
  const repCod = (idx: number): string => {
    const id = dfdRepIds[idx];
    const c = id != null ? reparticoes.find((r) => r.id === id)?.codigo : null;
    return c ?? index?.dfds[idx].siglaSetor ?? "—";
  };
  const planNum = (idx: number): string => parsed.get(idx)?.planejamento ?? "";
  const qtdItens = (idx: number): number | null => parsed.get(idx)?.itens.length ?? null;
  const valorItens = (idx: number): number | null => {
    const d = parsed.get(idx);
    return d ? (d.valorTotal ?? null) : null;
  };
  // Uma linha NORMALIZADA por DFD para a planilha única (`PlanilhaDfds`). O `key` é o
  // idx (chave da seleção/edição em massa). Estado/Situação/valores vêm do parse+validação.
  const linhasDfd: LinhaDfd[] = (index?.dfds ?? []).map((di, idx) => ({
    key: idx,
    numero: di.numero,
    planejamento: planNum(idx) || null,
    sigla: repCod(idx),
    auto: dfdRepIds[idx] != null && dfdRepIds[idx] === autoRepIds[idx],
    tipo: tipoCurtoDfd(parsed.get(idx)?.tipo),
    itens: qtdItens(idx),
    valor: valorItens(idx),
    estado: estado(idx),
    resumo: resumoDfd(idx),
    assinaturas: assinaturasDfd(idx),
    estadoMotivo: errosParse.get(idx) ?? null,
    situacao: SITUACAO[classificar(di.numero)],
  }));
  const linhasErro = linhasDfd.filter((l) => l.estado === "erro");
  const linhasAtencao = linhasDfd.filter((l) => l.estado === "atencao"); // DFD-R sem referência
  const semRep = (index?.dfds.length ?? 0) - dfdRepIds.filter((x) => x != null).length;
  // Bloqueia a protocolação enquanto houver DFD com erro (não permite protocolo com DFDs defeituosos).
  const dfdsComErro = linhasErro.length;
  const temDfds = (index?.dfds.length ?? 0) > 0;
  // Somatória dos valores dos DFDs (valor do DFD = soma dos seus itens). Só é completa
  // quando todos foram analisados e nenhum está com erro.
  // Somatória/contagem IGNORAM os DFDs duplicados descartados (fora do processo).
  const somatorioDfds = [...parsed.entries()].reduce((s, [i, d]) => (descartados.has(i) ? s : s + (d.valorTotal ?? 0)), 0);
  const itensDfds = [...parsed.entries()].reduce((s, [i, d]) => (descartados.has(i) ? s : s + d.itens.length), 0);
  const conciliavel = temDfds && !analisando && dfdsComErro === 0;
  // Regra 2 (configurável por `protocolo.valorCapa` + categoria): capa **zerada/nula** OU
  // **diferente** da somatória dos DFDs. "ignora" desliga; "bloqueia" trava; senão avisa.
  const compCapa = comportamentoNo(regras, "protocolo.valorCapa", { categoria });
  const capaZeradaOuNula = extra.valorCapa == null || extra.valorCapa <= 0;
  const capaMismatch =
    conciliavel && compCapa !== "ignora" && (capaZeradaOuNula || !valoresBatem(extra.valorCapa, somatorioDfds));
  const capaBloqueia = capaMismatch && compCapa === "bloqueia";
  // Portões do protocolo respeitando os níveis do ADM (número é sempre obrigatório).
  const repBloqueia = protoRepId == null && comportamentoNo(regras, "protocolo.reparticao", { categoria }) === "bloqueia";
  const anoPcaBloqueia = anoPca == null && comportamentoNo(regras, "protocolo.anoPca", { categoria }) === "bloqueia";
  const semErroBloqueia = dfdsComErro > 0 && comportamentoNo(regras, "protocolo.semDfdEmErro", { categoria }) === "bloqueia";
  // DFD duplicado não resolvido (mesmo nº/planejamento) — bloqueia até escolher um (regra própria).
  const dupBloqueia = dupComp === "bloqueia" && (index?.dfds ?? []).some((_, i) => dupPendente(i));
  // Trava de protocolação do ADM (Configurações → Avaliação → Protocolação): assunto não
  // cadastrado / tipo de DFD não permitido barram o protocolo INTEIRO; e o botão pode estar
  // desligado. Os tipos vêm dos DFDs JÁ analisados (o servidor reconfere cada um, por garantia).
  const tiposCurtosGate = (index?.dfds ?? [])
    .map((_, i) => parsed.get(i))
    .filter((d): d is DfdParseado => !!d)
    .map((d) => tipoCurtoDfd(d.tipo));
  const gateTrava = gateProtocolo(assunto, tiposCurtosGate, regras);
  const protocolarDesligado = !protocolarHabilitado(regras);
  const bloqueadoPorRegra =
    repBloqueia || anoPcaBloqueia || semErroBloqueia || capaBloqueia || dupBloqueia || !gateTrava.ok || protocolarDesligado;
  const podeProtocolar =
    numero.trim().length > 0 && !importando && !analisando && !bloqueadoPorRegra;
  const pct = progresso && progresso.total > 0 ? Math.round((progresso.feito / progresso.total) * 100) : 0;
  const dfdAberto = abertoIdx >= 0 ? (parsed.get(abertoIdx) ?? null) : null;
  const repAberto = abertoIdx >= 0 ? (reparticoes.find((r) => r.id === dfdRepIds[abertoIdx]) ?? null) : null;
  // Mensagens (erro/atenção/acerto) do DFD aberto — botão + painel lateral (herda o anoPca do protocolo).
  const mensagensAberto = dfdAberto ? mensagensDoDfd(dfdAberto, repAberto, anoPca, regras, categoria, orgaos, conformidade) : [];

  // Confere o DFD ABERTO contra o catálogo (lazy — só ao abrir/trocar de DFD; itens estáveis
  // na edição de seções/refs). Fechar o lateral (dfdAberto = null) limpa o veredito.
  const itensAberto = dfdAberto?.itens;
  const tipoAberto = dfdAberto?.tipo ?? null;
  useEffect(() => {
    if (!itensAberto || itensAberto.length === 0) {
      setConformidade(undefined);
      return;
    }
    const ac = new AbortController();
    setConformidade(undefined);
    conferirItensCliente(itensAberto, tipoAberto, ac.signal).then((m) => {
      if (!ac.signal.aborted) setConformidade(m);
    });
    return () => ac.abort();
  }, [itensAberto, tipoAberto]);

  // Relatório de erros do protocolo em DESPACHO (copiável) — pendências CIRÚRGICAS por
  // DFD com erro + capa (aponta o que corrigir e onde).
  const faltasDoDfd = (idx: number): string[] => {
    const parseErr = errosParse.get(idx);
    if (parseErr) return [`Leitura incompleta da tabela de itens (${parseErr}). Reenviar o DFD com a tabela completa.`];
    const d = parsed.get(idx);
    if (!d) return ["DFD ainda em análise — reabrir para conferir."];
    const resAss = confereAssinatura(idx, d);
    return faltasCirurgicasDfd(
      {
        itens: d.itens,
        secoes: d.secoes,
        reparticaoId: dfdRepIds[idx],
        assinaturaMotivo: resAss.status === "erro" ? resAss.motivo : null,
        tipo: d.tipo,
      },
      regras,
      { categoria },
    );
  };
  const capaMotivo = capaMismatch
    ? capaZeradaOuNula
      ? `Valor da capa ausente/zerado — informar o valor da capa (usar "Substituir pela somatória": ${brl(somatorioDfds)}).`
      : `Valor da capa (${extra.valorCapa != null ? brl(extra.valorCapa) : "—"}) diferente da somatória dos DFDs (${brl(somatorioDfds)}) — corrigir a capa (usar "Substituir pela somatória").`
    : null;
  const temErroProto = dfdsComErro > 0 || capaMismatch;
  // O relatório (despacho) fica disponível quando há erro OU DFD-R em atenção (o usuário
  // escolhe incluir os de atenção). Só de atenção também gera um despacho.
  const temAtencao = linhasAtencao.length > 0;
  const temRelatorio = temErroProto || temAtencao;
  const dfdsRelatorio = [
    ...linhasErro.map((l) => ({
      numero: index?.dfds[l.key].numero ?? "?",
      planejamento: l.planejamento,
      tipo: parsed.get(l.key)?.tipo ?? null,
      faltas: faltasDoDfd(l.key),
    })),
    ...(incluirAtencao
      ? linhasAtencao.map((l) => ({
          numero: index?.dfds[l.key].numero ?? "?",
          planejamento: l.planejamento,
          tipo: parsed.get(l.key)?.tipo ?? null,
          faltas: [FALTA_REFERENCIA_RENOVACAO],
        }))
      : []),
  ];
  const relatorioLinhas = linhasRelatorioProtocolo({
    numero,
    idExterno: extra.idExterno,
    interessado: interessado || null,
    assunto: assunto || null,
    capaMotivo,
    dfds: dfdsRelatorio,
  });

  // Barra de edição em massa — FIXA no rodapé do banner, tamanho constante:
  // cima = controle do valor (altura fixa); baixo = seletor do campo + Aplicar + Limpar.
  const barraMassa = sel.size > 0 && !importando && (
    <div className="mb-3 rounded-card border border-border bg-surface-2 p-3">
      <div className="flex min-h-[42px] flex-wrap items-center gap-2">
        {bulkCampo === "reparticao" && (
          <select className={inputCls} style={{ width: "auto", minWidth: 200 }} value={bulkRep ?? ""} onChange={(e) => setBulkRep(e.target.value ? Number(e.target.value) : null)}>
            <option value="">— Unidade —</option>
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
        cabecalho={<ProtocoloCabecalho numero={numero || "novo"} idExterno={extra.idExterno} assunto={assunto || null} />}
        size="lg"
        fecharNoBackdrop={false}
        bloqueado={importando}
        lateral={
          temDfds
            ? {
                aberto: abertoIdx >= 0,
                titulo: abertoIdx >= 0 ? `DFD ${index?.dfds[abertoIdx]?.numero ?? ""}` : "DFD",
                cabecalho:
                  abertoIdx >= 0 ? (
                    <DfdCabecalho
                      numero={index?.dfds[abertoIdx]?.numero ?? ""}
                      tipo={dfdAberto?.tipo ?? null}
                      planejamento={dfdAberto?.planejamento ?? null}
                    />
                  ) : undefined,
                onClose: fecharDfdLateral,
                rodape:
                  abertoIdx < 0 ? undefined : (
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      {dfdAberto ? (
                        <span
                          className="inline-flex items-center gap-1.5 text-[12px] font-medium"
                          style={{ color: estadoCor(estado(abertoIdx), regras) }}
                        >
                          <span className="h-2 w-2 rounded-full" style={{ background: estadoCor(estado(abertoIdx), regras) }} />
                          {estadoRotulo(estado(abertoIdx), regras)}
                        </span>
                      ) : (
                        <span />
                      )}
                      <div className="flex items-center gap-2">
                        {/* DFD duplicado: manter ESTE (descarta os demais do grupo) ou restaurar o descartado. */}
                        {abertoIdx >= 0 && descartados.has(abertoIdx) && (
                          <Button variant="secondary" onClick={() => restaurarDfd(abertoIdx)} disabled={importando}>
                            Restaurar
                          </Button>
                        )}
                        {abertoIdx >= 0 && !descartados.has(abertoIdx) && dupComp !== "ignora" && dupPendente(abertoIdx) && (
                          <Button onClick={() => manterDfd(abertoIdx)} disabled={importando}>
                            Manter este DFD
                          </Button>
                        )}
                        {/* Conflito com um DFD já cadastrado (substitui/move): manter o EXISTENTE
                            = descartar este do envio (o novo, se mantido, prevalece/sobrescreve). */}
                        {abertoIdx >= 0 &&
                          !descartados.has(abertoIdx) &&
                          !(dupComp !== "ignora" && dupPendente(abertoIdx)) &&
                          conflitaComExistente(abertoIdx) && (
                            <Button variant="secondary" onClick={() => descartarDfd(abertoIdx)} disabled={importando}>
                              Manter o existente
                            </Button>
                          )}
                        {dfdAberto && (
                          <BotaoVerMensagens
                            mensagens={mensagensAberto}
                            aberto={painel?.tipo === "mensagens"}
                            onToggle={() => setPainel((p) => (p?.tipo === "mensagens" ? null : { tipo: "mensagens" }))}
                          />
                        )}
                        <Button variant="secondary" onClick={fecharDfdLateral} disabled={importando}>
                          Fechar
                        </Button>
                      </div>
                    </div>
                  ),
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
                        anoPca={anoPca}
                        autoMatch={dfdRepIds[abertoIdx] != null && dfdRepIds[abertoIdx] === autoRepIds[abertoIdx]}
                        autoCampos={autoMap.get(abertoIdx) ?? []}
                        regras={regras}
                        orgaos={orgaos}
                        conformidade={conformidade}
                        ancoraAlvo={ancoraAlvo}
                        itemAtivo={painel?.tipo === "item" ? painel.idx : null}
                        onItemClick={(idx) => setPainel({ tipo: "item", idx })}
                        onRepChange={(id) => setRepDfd(abertoIdx, id)}
                        onSecoesChange={onSecoesAberto}
                        onRefsChange={onRefsAberto}
                        onCamposChange={onCamposAberto}
                      />
                    )}
                  </div>
                ),
              }
            : undefined
        }
        lateral2={
          temDfds
            ? {
                aberto: abertoIdx >= 0 && painel != null,
                titulo:
                  painel?.tipo === "item"
                    ? `Item ${dfdAberto?.itens[painel.idx]?.item ?? painel.idx + 1} — DFD ${index?.dfds[abertoIdx]?.numero ?? ""}`
                    : `Mensagens — DFD ${index?.dfds[abertoIdx]?.numero ?? ""}`,
                onClose: () => setPainel(null),
                children:
                  painel?.tipo === "item" && dfdAberto?.itens[painel.idx] ? (
                    <ItemDetalhe
                      key={painel.idx}
                      item={dfdAberto.itens[painel.idx]}
                      conformidade={conformidade}
                      regras={regras}
                      tipo={dfdAberto.tipo}
                      editavel
                      onChange={(patch) => onItemAberto((painel as { idx: number }).idx, patch)}
                    />
                  ) : (
                    <MensagensDfd
                      mensagens={mensagensAberto}
                      numero={index?.dfds[abertoIdx]?.numero ?? ""}
                      tipo={dfdAberto?.tipo}
                      onIrPara={irParaMensagem}
                    />
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
                style={{ color: bloqueadoPorRegra ? "var(--danger)" : "var(--muted)" }}
              >
                {protocolarDesligado
                  ? "Protocolação desabilitada nas Configurações"
                  : !gateTrava.ok
                    ? gateTrava.motivos.join(" ")
                    : anoPcaBloqueia
                  ? "Defina o PCA do processo para protocolar"
                  : repBloqueia
                    ? "Defina a unidade do processo para protocolar"
                    : !temDfds
                      ? "Sem DFDs — cria só o protocolo."
                      : analisando
                        ? `Analisando ${index?.dfds.length} DFD(s)...`
                        : semErroBloqueia
                          ? `${dfdsComErro} DFD(s) com erro`
                          : capaBloqueia
                            ? "Valor da capa diverge da somatória — substitua para liberar"
                            : `${index?.dfds.length} DFD(s) · ${semRep} sem unidade · ${dfdsComErro > 0 ? `${dfdsComErro} com erro (não bloqueia)` : temAtencao ? `${linhasAtencao.length} em atenção` : "tudo certo"}`}
              </span>
            )}
            <div className="ml-auto flex flex-wrap items-center justify-end gap-2">
              {!importando && temRelatorio && (
                <Button
                  variant="secondary"
                  onClick={() => setRelatorioAberto(true)}
                  icon={<IconAlert className="h-4 w-4" style={{ color: temErroProto ? "var(--danger)" : "var(--warn)" }} />}
                >
                  {temErroProto ? "Relatório de erro" : "Relatório de atenção"}
                </Button>
              )}
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
                tone={capaMismatch ? "warn" : "default"}
                hint={analisando ? "analisando…" : undefined}
                className="col-span-2 sm:col-span-1"
              />
            </div>
          )}
          {capaMismatch && (
            <Callout kind={capaBloqueia ? "danger" : "warn"} icon={<IconAlert className="h-5 w-5" />}>
              <p className="font-semibold">
                {capaZeradaOuNula
                  ? capaBloqueia
                    ? "O valor da capa está zerado — não é possível protocolar"
                    : "O valor da capa está zerado (atenção — não bloqueia)"
                  : capaBloqueia
                    ? "O valor da capa diverge da somatória dos DFDs"
                    : "O valor da capa diverge da somatória dos DFDs (atenção — não bloqueia)"}
              </p>
              <p className="mt-1 opacity-90">
                Valor da capa: {extra.valorCapa != null ? brl(extra.valorCapa) : "—"} · Somatória dos DFDs:{" "}
                {brl(somatorioDfds)}. Substitua o valor da capa pela somatória para conciliar.
              </p>
              <div className="mt-2">
                <Button variant="secondary" onClick={() => setExtra((x) => ({ ...x, valorCapa: somatorioDfds }))}>
                  Substituir pela somatória ({brl(somatorioDfds)})
                </Button>
              </div>
            </Callout>
          )}

          {/* Dados da capa — MESMA grade (`CapaCampos`) do protocolo gravado. Criação manual
              = inputs simples; importação de PDF = cadeado por campo nos de CONTEÚDO
              (identificadores número/Id/data ficam travados). */}
          <section className="rounded-card border border-border bg-surface p-5 shadow-ring">
            <h3 className="mb-4 text-sm font-bold text-text">Dados do processo</h3>
            <CapaCampos
              numero={numero}
              idExterno={extra.idExterno}
              data={data}
              documento={extra.documento ?? ""}
              interessado={interessado}
              assunto={assunto}
              observacao={observacao}
              valorCapa={extra.valorCapa}
              localReparticao={extra.localReparticao}
              modo={origemPdf ? "cadeado" : "criar"}
              onChange={(c, v) => {
                if (c === "numero") setNumero(v);
                else if (c === "data") setData(v);
                else if (c === "interessado") setInteressado(v);
                else if (c === "assunto") setAssunto(v);
                else if (c === "observacao") setObservacao(v);
                else if (c === "localReparticao") setExtra((x) => ({ ...x, localReparticao: v || null }));
                else setExtra((x) => ({ ...x, documento: v || null }));
              }}
              onChangeValorCapa={(v) => setExtra((x) => ({ ...x, valorCapa: v }))}
            >
              <div className="sm:col-span-2">
                <label className={labelCls} htmlFor="proto-rep">
                  Unidade do protocolo (pelo Interessado) <span style={{ color: "var(--danger)" }}>*</span>
                </label>
                <select id="proto-rep" className={inputCls} value={protoRepId ?? ""} onChange={(e) => setProtoRepId(e.target.value ? Number(e.target.value) : null)}>
                  <option value="">— Selecione a unidade —</option>
                  {reparticoes.map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.codigo} · {r.nome}
                    </option>
                  ))}
                </select>
              </div>
              {/* PCA do protocolo (obrigatório) — os DFDs herdam este ano ao protocolar. */}
              <div className="sm:col-span-2">
                <PcaPicker pcas={pcas} value={anoPca} detectado={anoPcaDetectado} onChange={setAnoPca} />
              </div>
            </CapaCampos>
          </section>

          {!temDfds ? (
            <Callout kind="info">
              Nenhum DFD detectado. O protocolo será criado vazio — adicione DFDs depois (aba DFDs) ou vincule
              existentes.
            </Callout>
          ) : (
            <section>
              {/* Planilha ÚNICA de DFDs (a mesma do protocolo gravado e da aba DFDs):
                  DFDs com erro em tabela separada; clique numa linha abre o DFD ao lado. */}
              <PlanilhaDfds
                linhas={linhasDfd}
                selecionavel
                selected={sel}
                onSelected={setSel}
                onRowClick={abrir}
                ativa={abertoIdx >= 0 ? abertoIdx : null}
                compacta={compacta}
                regras={regras}
              />
            </section>
          )}
        </div>
      </Modal>

      <RelatorioErros
        open={relatorioAberto}
        onClose={() => setRelatorioAberto(false)}
        titulo={`Relatório do protocolo ${numero || ""}`.trim()}
        linhas={relatorioLinhas}
        toggle={
          temAtencao
            ? {
                label: `Incluir ${linhasAtencao.length} DFD-R sem referência (atenção) no relatório`,
                checked: incluirAtencao,
                onChange: setIncluirAtencao,
              }
            : undefined
        }
      />
    </div>
  );
}
