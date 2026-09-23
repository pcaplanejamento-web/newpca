"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  classificarAssunto,
  comportamentoNo,
  gateProtocolo,
  opcoesAssunto,
  protocolarHabilitado,
  type RegrasAvaliacao,
  regrasPadrao,
} from "@/lib/avaliacao-core";
import { avaliarLinhaDfd, conferirAssinaturaDfd, estadoDeMensagens, type LinhaAvaliada, mensagensDoDfd } from "@/lib/conferencia-dfd";
import {
  type AcaoMassa,
  aplicarMassaDfd,
  type CampoTratavel,
  conciliacaoCapa,
  dfdsDuplicados,
  editarItemDfd,
  faltasCirurgicasDfd,
  gruposAssinatura,
  linhasRelatorioProtocolo,
  normalizarSecoesDfd,
  removerItemDfd,
  STATUS_MENSAGEM_COR,
} from "@/lib/dfd-tratamento";
import { num } from "@/lib/format";
import { enviarDfdEmLotes } from "@/lib/importar-dfd";
import { encerrarOcr } from "@/lib/ocr-assinatura";
import { mesclarAssinaturasOcr, precisaOcr } from "@/lib/ocr-assinatura-core";
import { type DfdParseado, tipoCurtoDfd } from "@/lib/parse-dfd-comum";
import {
  indexarProtocoloPdf,
  ocrAssinaturasEmPaginas,
  parseDfdDoProtocolo,
  type PdfDoc,
  type ProtocoloIndex,
} from "@/lib/parse-protocolo-pdf";
import { casarPorInteressado, preverUnidadeDoDfd } from "@/lib/reparticao-match";
import type { Responsaveis } from "@/lib/reparticao-responsaveis";
import { BarraEdicaoMassa } from "./BarraEdicaoMassa";
import { Button } from "./Button";
import { Callout } from "./Callout";
import { DfdConferir, type PainelDfd } from "./DfdConferir";
import { DfdPainelDireito, RodapePainelItem, tituloPainelDfd } from "./DfdPainelDireito";
import { DfdRodape } from "./DfdRodape";
import { DfdCabecalho } from "./DfdView";
import { Dropzone } from "./Dropzone";
import { IconAlert, IconCheck, IconClipboard, IconFile, IconSpinner, IconUpload } from "./icons";
import { Modal } from "./Modal";
import { type PcaOpcao, PcaPicker } from "./PcaPicker";
import type { LinhaDfd, ProcessandoDfd } from "./PlanilhaDfds";
import { Progress } from "./Progress";
import { ProtocoloCabecalho, ProtocoloView } from "./ProtocoloView";
import { RelatorioErros } from "./RelatorioErros";
import { useConformidade } from "./useConformidade";

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
/** DFD já cadastrado (conflito de número): de qual protocolo é + seus totais (p/ a somatória quando ele PREVALECE). */
type DfdExistente = { numero: string; protocoloNumero: string | null; valorTotal?: number | null; totalItens?: number | null };
type Status = "idle" | "parsing" | "error";
type Extra = { idExterno: string | null; documento: string | null; localReparticao: string | null; valorCapa: number | null; nomeArquivo: string | null };
type Situacao = "novo" | "substitui" | "move";
/** Progresso REAL da análise em background: 1ª passada (texto) e 2ª (assinaturas por OCR). */
type Analise = { fase: "texto" | "ocr"; feito: number; total: number; atual: number | null };

const EXTRA_VAZIO: Extra = { idExterno: null, documento: null, localReparticao: null, valorCapa: null, nomeArquivo: null };
const CAP_ANALISE = 300; // teto de DFDs analisados na abertura (escala): além disto, "pendente" até abrir/protocolar
const SITUACAO: Record<Situacao, string> = { novo: "Novo", substitui: "Substitui", move: "Move" };

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
  // DFDs em que o OCR da assinatura achatada já foi tentado — não repete (o OCR é caro).
  const ocrTentadoRef = useRef<Set<number>>(new Set());
  const [status, setStatus] = useState<Status>("idle");
  const [leitura, setLeitura] = useState<{ pagina: number; total: number } | null>(null); // leitura do PDF (índice)
  const [erro, setErro] = useState<string | null>(null);
  const [aberto, setAberto] = useState(false);
  const [launcher, setLauncher] = useState(false); // banner lançador (soltar/escolher | criar manual)
  // Origem PDF → a CAPA mostra cadeado por campo nos de conteúdo; no "criar manual" os campos são inputs.
  const [origemPdf, setOrigemPdf] = useState(false);
  const [relatorioAberto, setRelatorioAberto] = useState(false); // banner de relatório de erros
  const [incluirAtencao, setIncluirAtencao] = useState(true); // incluir DFDs em atenção no relatório

  // Metadados do protocolo.
  const [numero, setNumero] = useState("");
  const [data, setData] = useState("");
  const [interessado, setInteressado] = useState("");
  const [assunto, setAssunto] = useState("");
  const [observacao, setObservacao] = useState("");
  const [protoRepId, setProtoRepId] = useState<number | null>(null);
  const [protoOrgaoId, setProtoOrgaoId] = useState<number | null>(null); // protocolo em nome do ÓRGÃO (ponto 2)
  const [extra, setExtra] = useState<Extra>(EXTRA_VAZIO);
  // PCA do protocolo (ano). Adivinhado pela descrição; o usuário confirma/escolhe. Os DFDs herdam
  // este ano ao protocolar. Obrigatório para protocolar.
  const [anoPca, setAnoPca] = useState<number | null>(null);
  const [anoPcaDetectado, setAnoPcaDetectado] = useState<number | null>(null);

  // Índice leve + unidade por DFD.
  const [index, setIndex] = useState<ProtocoloIndex | null>(null);
  const [dfdRepIds, setDfdRepIds] = useState<(number | null)[]>([]);
  const [autoRepIds, setAutoRepIds] = useState<(number | null)[]>([]);

  // Cache de parse/edição por DFD (idx) + estados.
  const [parsed, setParsed] = useState<Map<number, DfdParseado>>(new Map());
  // Espelho do cache p/ a análise em background (closure antiga): não re-parsear/sobrescrever um DFD
  // que o usuário já abriu (e talvez editou) antes de a análise chegar nele.
  const parsedRef = useRef(parsed);
  parsedRef.current = parsed;
  const [autoMap, setAutoMap] = useState<Map<number, CampoTratavel[]>>(new Map());
  const [editados, setEditados] = useState<Set<number>>(new Set());
  // DFDs DUPLICADOS descartados pelo usuário (o "perdedor" de cada grupo) — cinza, fora da
  // somatória e da protocolação. Chave = idx do DFD no `index.dfds`.
  const [descartados, setDescartados] = useState<Set<number>>(new Set());
  // Descartados por "Manter o existente" (subconjunto de `descartados`): o DFD já cadastrado PREVALECE —
  // se ele é deste MESMO protocolo, continua no processo e entra na somatória da capa.
  const [mantidosExistentes, setMantidosExistentes] = useState<Set<number>>(new Set());
  // Motivo de falha na LEITURA de um DFD (ex.: tabela de itens incompleta) → estado "erro".
  const [errosParse, setErrosParse] = useState<Map<number, string>>(new Map());
  // Análise em background com progresso REAL (fase, n/N e o DFD atual).
  const [analise, setAnalise] = useState<Analise | null>(null);
  // DFDs cuja assinatura ACHATADA ainda será lida por OCR — ficam "pendente" (não apontam "sem
  // assinatura" antes da leitura) e a protocolação espera.
  const [ocrPendente, setOcrPendente] = useState<Set<number>>(new Set());

  // Split-view (DFD aberto) + seleção/edição em massa.
  const [abertoIdx, setAbertoIdx] = useState(-1);
  // Painel da DIREITA (lateral2) do DFD aberto: mensagens OU detalhe de um item + rolagem/destaque.
  const [painel, setPainel] = useState<PainelDfd | null>(null);
  const [ancoraAlvo, setAncoraAlvo] = useState<{ ancora: string; cor: string; nonce: number } | null>(null);
  const [carregandoIdx, setCarregandoIdx] = useState<number | null>(null);
  const [sel, setSel] = useState<Set<string | number>>(new Set()); // chaves = idx (number)
  const [aplicandoMassa, setAplicandoMassa] = useState(false);

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
    setDescartados(new Set());
    setMantidosExistentes(new Set());
    setErrosParse(new Map());
    setSel(new Set());
    setAbertoIdx(-1);
    setPainel(null);
    setOcrPendente(new Set());
    setAnalise(null);
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
    setLeitura(null);
    try {
      limparDoc();
      resetCache();
      const { index: idx, doc } = await indexarProtocoloPdf(file, (pagina, total) => setLeitura({ pagina, total }));
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
      // cadastrado, senão nome). Unidade → vira a unidade do protocolo; Órgão → guarda o órgão.
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
      setOrigemPdf(true);
      setIndex(idx);
      setDfdRepIds(autos);
      setAutoRepIds(autos);
      setProtoRepId(repInteressado ?? autos.find((x) => x != null) ?? reparticaoAtivaId);
      setProtoOrgaoId(orgaoInteressado);
      setStatus("idle");
      setLeitura(null);
      setAberto(true);
      void analisarTodos(idx, doc); // parse + estados em background (até o teto)
    } catch (e) {
      setStatus("error");
      setLeitura(null);
      setErro(e instanceof Error ? e.message : "Falha ao ler o protocolo.");
      limparDoc();
    }
  }

  /** Parseia (background) os DFDs até o teto, atualizando estados e o PROGRESSO real. */
  async function analisarTodos(idx0: ProtocoloIndex, doc: PdfDoc) {
    const nome = idx0.protocolo.nomeArquivo ?? "protocolo.pdf";
    const total = Math.min(idx0.dfds.length, CAP_ANALISE);
    if (total === 0) return;
    const paraOcr: { i: number; dfd: DfdParseado }[] = []; // DFDs sem assinatura NOMEADA de texto (achatada)
    /** DFD que JÁ está no cache (o usuário abriu / editou em massa antes da análise chegar): não
     * re-parseia nem sobrescreve (preserva as edições), mas a previsão da unidade e a fila do OCR valem. */
    const viaCache = (i: number, d: DfdParseado) => {
      refinarUnidade(i, d);
      if (precisaOcr(d.assinaturas) && !ocrTentadoRef.current.has(i)) {
        paraOcr.push({ i, dfd: d });
        setOcrPendente((s) => new Set(s).add(i));
      }
    };
    for (let i = 0; i < total; i++) {
      if (docRef.current !== doc) return; // outro protocolo foi aberto / banner fechado — aborta
      setAnalise({ fase: "texto", feito: i, total, atual: i });
      const jaLido = parsedRef.current.get(i);
      if (jaLido) {
        viaCache(i, jaLido);
        continue;
      }
      try {
        const raw = await parseDfdDoProtocolo(doc, idx0.dfds[i], nome);
        if (docRef.current !== doc) return;
        // Previsão segue o PCA do PROTOCOLO (ponto 7) — o ano detectado na capa (fresco no índice).
        const { dfd, auto } = normalizarSecoesDfd(raw, regras, idx0.protocolo.anoPca);
        const abertoNoMeio = parsedRef.current.get(i); // aberto pelo usuário durante o parse
        if (abertoNoMeio) {
          viaCache(i, abertoNoMeio);
          continue;
        }
        setParsed((m) => (m.has(i) ? m : new Map(m).set(i, dfd)));
        if (auto.length) setAutoMap((m) => (m.has(i) ? m : new Map(m).set(i, auto)));
        // Refina a UNIDADE com as assinaturas do PARSE COMPLETO (inclui Dropsigner/Adobe inline). Só
        // PREENCHE quando ainda está sem unidade (não sobrescreve previsão do índice nem escolha manual).
        refinarUnidade(i, dfd);
        if (precisaOcr(dfd.assinaturas)) {
          paraOcr.push({ i, dfd });
          setOcrPendente((s) => new Set(s).add(i));
        }
      } catch (e) {
        if (docRef.current !== doc) return;
        // Leitura falhou (ex.: item sem número → tabela incompleta): estado "erro" com o motivo.
        setErrosParse((m) => new Map(m).set(i, e instanceof Error ? e.message : "Falha ao ler o DFD."));
      }
      if (i % 5 === 4) await new Promise((r) => setTimeout(r, 0)); // cede o event loop
    }
    // 2ª passada — assinaturas ACHATADAS (sem camada de texto) lidas por OCR ANTES de apontar "sem
    // assinatura": cada DFD fica "pendente" até a leitura; ao ler, a assinatura é mesclada no cache
    // (preserva edições feitas nesse meio-tempo) e a UNIDADE é prevista pelo assinante.
    for (let k = 0; k < paraOcr.length; k++) {
      const { i, dfd } = paraOcr[k];
      if (docRef.current !== doc) return;
      setAnalise({ fase: "ocr", feito: k, total: paraOcr.length, atual: i });
      if (!ocrTentadoRef.current.has(i)) {
        ocrTentadoRef.current.add(i);
        const ocr = await ocrAssinaturasEmPaginas(doc, idx0.dfds[i].pages);
        if (docRef.current !== doc) return;
        if (ocr.length > 0) {
          setParsed((m) => {
            const cur = m.get(i);
            return cur ? new Map(m).set(i, { ...cur, assinaturas: mesclarAssinaturasOcr(cur.assinaturas, ocr) }) : m;
          });
          // As assinaturas não são editadas nesse meio-tempo → a cópia local basta p/ prever a unidade.
          refinarUnidade(i, { ...dfd, assinaturas: mesclarAssinaturasOcr(dfd.assinaturas, ocr) });
        }
      }
      setOcrPendente((s) => {
        const n = new Set(s);
        n.delete(i);
        return n;
      });
    }
    if (docRef.current === doc) setAnalise(null);
  }

  /** Prevê a UNIDADE do DFD pela ASSINATURA (lógica única `preverUnidadeDoDfd`, todas as formas —
   * texto e OCR). Só PREENCHE quando ainda está sem unidade (não sobrescreve escolha manual). */
  function refinarUnidade(i: number, dfd: DfdParseado) {
    const refino = preverUnidadeDoDfd(dfd, orgaos, reparticoes);
    if (refino == null) return;
    setDfdRepIds((arr) => (arr[i] == null ? arr.map((x, j) => (j === i ? refino : x)) : arr));
    setAutoRepIds((arr) => (arr[i] == null ? arr.map((x, j) => (j === i ? refino : x)) : arr));
  }

  function fechar() {
    setAberto(false);
    setAbertoIdx(-1);
    setPainel(null);
    setAnalise(null);
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
  const repDe = (id: number | null | undefined): Rep | null => (id != null ? (reparticoes.find((r) => r.id === id) ?? null) : null);

  // ---- DFDs DUPLICADOS (mesmo nº de DFD ou de planejamento) — ponto configurável `protocolo.dfdDuplicado`.
  const dupComp = comportamentoNo(regras, "protocolo.dfdDuplicado", { categoria });
  const gruposDup =
    dupComp === "ignora"
      ? []
      : dfdsDuplicados((index?.dfds ?? []).map((di, i) => ({ numero: di.numero, planejamento: parsed.get(i)?.planejamento ?? null })));
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
    setSel(new Set());
  };
  /** Reincluir um DFD descartado (o grupo volta a "pendente"). */
  const restaurarDfd = (idx: number) => {
    const tirar = (prev: Set<number>) => {
      const s = new Set(prev);
      s.delete(idx);
      return s;
    };
    setDescartados(tirar);
    setMantidosExistentes(tirar);
  };
  /** Este DFD substitui/move um já CADASTRADO (conflito com o banco)? */
  const conflitaComExistente = (idx: number): boolean => {
    const n = index?.dfds[idx]?.numero;
    return n != null && classificar(n) !== "novo";
  };
  /** "Manter o existente": descarta ESTE DFD do envio → o já cadastrado PREVALECE. */
  const descartarDfd = (idx: number) => {
    setDescartados((prev) => new Set(prev).add(idx));
    setMantidosExistentes((prev) => new Set(prev).add(idx));
    setSel(new Set());
  };

  // ---- Conferência por LINHA — a MESMA do protocolo gravado (`avaliarLinhaDfd`). Cache por objeto
  // de DFD (só o DFD editado é reavaliado a cada tecla); zera quando as regras/cadastros mudam.
  // biome-ignore lint/correctness/useExhaustiveDependencies: as dependências INVALIDAM o cache (regras/cadastros novos ⇒ reconferir tudo).
  const cacheLinha = useMemo(() => new WeakMap<DfdParseado, { k: string; r: LinhaAvaliada }>(), [regras, orgaos, reparticoes]);
  const avaliarLinha = (idx: number, d: DfdParseado): LinhaAvaliada => {
    const repId = dfdRepIds[idx] ?? null;
    const dup = dupComp !== "ignora" && dupPendente(idx) ? (dupComp === "bloqueia" ? "erro" : "atencao") : null;
    const auto = (autoMap.get(idx)?.length ?? 0) > 0;
    const editado = editados.has(idx);
    const k = `${repId}|${anoPca}|${categoria}|${auto}|${editado}|${dup}`;
    const c = cacheLinha.get(d);
    if (c && c.k === k) return c.r;
    const r = avaliarLinhaDfd(d, repDe(repId), { anoPca, regras, categoria, orgaos, auto, editado, duplicado: dup });
    cacheLinha.set(d, { k, r });
    return r;
  };
  /** O que está acontecendo com a linha AGORA (feedback real da análise). */
  const processandoDe = (idx: number): ProcessandoDfd | null => {
    if (errosParse.has(idx) || descartados.has(idx)) return null;
    if (carregandoIdx === idx) return "texto";
    if (!parsed.has(idx)) {
      if (analise?.fase === "texto") return analise.atual === idx ? "texto" : idx < CAP_ANALISE ? "fila" : null;
      return null; // além do teto: analisado ao abrir/protocolar
    }
    if (ocrPendente.has(idx)) return analise?.fase === "ocr" && analise.atual === idx ? "ocr" : "fila";
    return null;
  };

  const compacta = abertoIdx >= 0; // DFD aberto ao lado → tabela estreita (rola no eixo x)
  // Uma linha por DFD para a planilha (`PlanilhaDfds`). `key` = idx (chave da seleção/edição em massa).
  const avaliacoes = new Map<number, LinhaAvaliada>();
  const linhasDfd: LinhaDfd[] = (index?.dfds ?? []).map((di, idx): LinhaDfd => {
    const d = parsed.get(idx);
    const id = dfdRepIds[idx];
    const base = {
      key: idx,
      numero: di.numero,
      planejamento: d?.planejamento ?? null,
      sigla: repDe(id)?.codigo ?? di.siglaSetor ?? "—",
      auto: id != null && id === autoRepIds[idx],
      tipo: tipoCurtoDfd(d?.tipo),
      itens: d ? d.itens.length : null,
      valor: d ? (d.valorTotal ?? 0) : null,
      // Tipos de assinatura (Centi/Dropsigner/Adobe/Foxit). Antes do parse completo, as A/B do índice.
      assinaturas: gruposAssinatura(d?.assinaturas ?? di.assinaturas),
      situacao: SITUACAO[classificar(di.numero)],
      processando: processandoDe(idx),
    };
    if (descartados.has(idx)) return { ...base, estado: "descartado" };
    const motivo = errosParse.get(idx);
    if (motivo) return { ...base, estado: "erro", estadoMotivo: motivo };
    if (!d || ocrPendente.has(idx)) return { ...base, estado: "pendente" };
    const r = avaliarLinha(idx, d);
    avaliacoes.set(idx, r);
    return { ...base, estado: r.estado, resumo: r.resumo, validacao: r.validacao };
  });
  const linhasErro = linhasDfd.filter((l) => l.estado === "erro");
  const linhasAtencao = linhasDfd.filter((l) => l.estado === "atencao"); // não bloqueiam (avisos)
  const dfdsComErro = linhasErro.length;
  const totalDfds = index?.dfds.length ?? 0;
  const temDfds = totalDfds > 0;
  const analisando = analise != null;
  const semRep = linhasDfd.filter((l) => l.estado !== "descartado" && dfdRepIds[l.key] == null).length;

  // ---- Conciliação do VALOR DA CAPA × somatória (mesma régua do gravado). A somatória IGNORA os
  // descartados; só é conferida com a análise COMPLETA — e NÃO depende de os DFDs estarem sem erro.
  const ativos = linhasDfd.filter((l) => l.estado !== "descartado").map((l) => l.key);
  // "Manter o existente" de um DFD deste MESMO protocolo (re-importação): o cadastrado continua no
  // processo → entra na somatória/contagem da capa (o de outro protocolo sai — segue lá).
  const existentesMantidos = [...mantidosExistentes]
    .map((i) => index?.dfds[i]?.numero)
    .filter((n): n is string => n != null && classificar(n) === "substitui")
    .map((n) => dfdsExistentes.find((x) => x.numero.trim() === n.trim()))
    .filter((x): x is DfdExistente => !!x);
  const somatorioDfds =
    ativos.reduce((s, i) => s + (parsed.get(i)?.valorTotal ?? 0), 0) + existentesMantidos.reduce((s, x) => s + (x.valorTotal ?? 0), 0);
  const itensDfds =
    ativos.reduce((s, i) => s + (parsed.get(i)?.itens.length ?? 0), 0) + existentesMantidos.reduce((s, x) => s + (x.totalItens ?? 0), 0);
  const totalConsiderados = ativos.length + existentesMantidos.length;
  // Somatória COMPLETA = todos os DFDs do processo LIDOS (um DFD ilegível somaria 0 → falsa divergência).
  const lidos = ativos.filter((i) => parsed.has(i)).length;
  const completo = !analisando && lidos === ativos.length;
  const conc = conciliacaoCapa({ valorCapa: extra.valorCapa, somatorio: somatorioDfds, totalDfds: totalConsiderados, completo }, regras, { categoria });

  // Portões do protocolo respeitando os níveis do ADM (número é sempre obrigatório).
  const repBloqueia = protoRepId == null && comportamentoNo(regras, "protocolo.reparticao", { categoria }) === "bloqueia";
  const anoPcaBloqueia = anoPca == null && comportamentoNo(regras, "protocolo.anoPca", { categoria }) === "bloqueia";
  const semErroBloqueia = dfdsComErro > 0 && comportamentoNo(regras, "protocolo.semDfdEmErro", { categoria }) === "bloqueia";
  const dupBloqueia = dupComp === "bloqueia" && (index?.dfds ?? []).some((_, i) => dupPendente(i));
  // Trava de protocolação do ADM (assunto não cadastrado / tipo de DFD não permitido / botão desligado).
  const tiposCurtosGate = ativos.map((i) => parsed.get(i)).filter((d): d is DfdParseado => !!d).map((d) => tipoCurtoDfd(d.tipo));
  const gateTrava = gateProtocolo(assunto, tiposCurtosGate, regras);
  const protocolarDesligado = !protocolarHabilitado(regras);
  const bloqueadoPorRegra =
    repBloqueia || anoPcaBloqueia || semErroBloqueia || conc.bloqueia || dupBloqueia || !gateTrava.ok || protocolarDesligado;
  const podeProtocolar = numero.trim().length > 0 && !importando && !analisando && ocrPendente.size === 0 && !bloqueadoPorRegra;
  const pct = progresso && progresso.total > 0 ? Math.round((progresso.feito / progresso.total) * 100) : 0;

  // ---- DFD aberto ao lado.
  const dfdAberto = abertoIdx >= 0 ? (parsed.get(abertoIdx) ?? null) : null;
  const repAberto = abertoIdx >= 0 ? repDe(dfdRepIds[abertoIdx]) : null;
  // Conformidade do DFD ABERTO com o catálogo (lazy — só o DFD aberto; a lista fica leve).
  const conformidade = useConformidade(dfdAberto?.itens, dfdAberto?.tipo ?? null);
  // Mensagens (erro/atenção/acerto) do DFD aberto — botão + painel lateral (herda o anoPca do protocolo).
  const mensagensAberto = dfdAberto ? mensagensDoDfd(dfdAberto, repAberto, anoPca, regras, categoria, orgaos, conformidade) : [];

  function setRepDfd(idx: number, id: number | null) {
    setDfdRepIds((arr) => arr.map((x, i) => (i === idx ? id : x)));
    setEditados((s) => new Set(s).add(idx));
  }

  /** Garante o DFD parseado+normalizado no cache (uso: abrir/edição em massa). */
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
    refinarUnidade(idx, dfd); // prevê a unidade pela assinatura (só preenche se vazia)
    return dfd;
  }

  /** Assinatura ACHATADA — se o DFD ficou sem assinatura NOMEADA de texto e o OCR ainda não foi
   * tentado, tenta UMA vez e MESCLA no parse cacheado (preserva edições). Best-effort. */
  async function mesclarOcrSePreciso(idx: number, d: DfdParseado | null): Promise<void> {
    const doc = docRef.current;
    const di = index?.dfds[idx];
    if (!doc || !di || !d || !precisaOcr(d.assinaturas) || ocrTentadoRef.current.has(idx)) return;
    ocrTentadoRef.current.add(idx);
    const ocr = await ocrAssinaturasEmPaginas(doc, di.pages);
    if (ocr.length > 0) {
      setParsed((m) => {
        const cur = m.get(idx);
        return cur ? new Map(m).set(idx, { ...cur, assinaturas: mesclarAssinaturasOcr(cur.assinaturas, ocr) }) : m;
      });
      refinarUnidade(idx, { ...d, assinaturas: mesclarAssinaturasOcr(d.assinaturas, ocr) });
    }
    setOcrPendente((s) => {
      if (!s.has(idx)) return s;
      const n = new Set(s);
      n.delete(idx);
      return n;
    });
  }

  async function abrir(idx: number) {
    setErro(null);
    setCarregandoIdx(idx);
    setPainel(null); // abre só o DFD (sem mensagens/detalhe do DFD anterior)
    setAncoraAlvo(null);
    try {
      const d = await garantirParse(idx);
      await mesclarOcrSePreciso(idx, d);
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

  /** Aplica um patch ao DFD aberto no lateral (seções/refs/cabeçalho/tipo/assinaturas) e o marca editado. */
  const editarAberto = (fn: (d: DfdParseado) => DfdParseado) => {
    setParsed((m) => {
      const d = m.get(abertoIdx);
      return d ? new Map(m).set(abertoIdx, fn(d)) : m;
    });
    setEditados((s) => new Set(s).add(abertoIdx));
  };

  /** Edição EM MASSA (mesma barra do protocolo gravado): unidade no host; conteúdo por `aplicarMassaDfd`. */
  async function aplicarMassa(acao: AcaoMassa) {
    const idxs = [...sel].map(Number);
    if (idxs.length === 0) return;
    setAplicandoMassa(true);
    setErro(null);
    const aplicados: number[] = [];
    const falhas: string[] = [];
    try {
      if (acao.campo === "reparticao") {
        setDfdRepIds((arr) => arr.map((x, i) => (sel.has(i) ? acao.reparticaoId : x)));
        aplicados.push(...idxs);
      } else {
        for (const i of idxs) {
          try {
            const d = await garantirParse(i);
            if (!d) continue;
            setParsed((m) => new Map(m).set(i, aplicarMassaDfd(m.get(i) ?? d, acao)));
            aplicados.push(i);
          } catch {
            falhas.push(index?.dfds[i]?.numero ?? String(i)); // DFD ilegível — segue com os demais
          }
        }
      }
      setEditados((s) => {
        const n = new Set(s);
        for (const i of aplicados) n.add(i);
        return n;
      });
      if (falhas.length > 0) setErro(`Não foi possível aplicar em ${falhas.length} DFD(s) com leitura incompleta: ${falhas.join(", ")}.`);
    } finally {
      setSel(new Set());
      setAplicandoMassa(false);
    }
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
        if (descartados.has(i)) continue; // DFD descartado (duplicado / "manter o existente") — não protocola
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
        // Assinatura achatada de um DFD além do teto da análise: tenta o OCR (uma vez) e mescla.
        if (precisaOcr(full.assinaturas) && !ocrTentadoRef.current.has(i) && doc) {
          ocrTentadoRef.current.add(i);
          setProgresso({ feito: i, total: dfds.length, label: `DFD ${di.numero} — lendo assinatura…` });
          try {
            const ocr = await ocrAssinaturasEmPaginas(doc, di.pages);
            if (ocr.length > 0) full = { ...full, assinaturas: mesclarAssinaturasOcr(full.assinaturas, ocr) };
          } catch {
            /* OCR é auxiliar — segue sem assinatura (a conferência decide) */
          }
        }
        // MESMA conferência da tabela (fonte única): DFD com erro nunca é protocolado.
        const conf = avaliarLinhaDfd(full, repDe(dfdRepIds[i]), { anoPca, regras, categoria, orgaos });
        if (conf.estado === "erro") {
          bloqueados.push({
            numero: di.numero,
            motivo: conf.mensagens.filter((m) => m.status === "erro").map((m) => m.texto).join(" "),
          });
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

  // ---- Relatório de erros do protocolo em DESPACHO (copiável): pendências CIRÚRGICAS por DFD + capa.
  const ERRO_EXTRA = new Set(["protocolo.dfdDuplicado", "dfd.orgao", "dfd.orgaoUnidadeDivergente"]);
  const faltasDoDfd = (idx: number): string[] => {
    const parseErr = errosParse.get(idx);
    if (parseErr) return [`Leitura incompleta da tabela de itens (${parseErr}). Reenviar o DFD com a tabela completa.`];
    const d = parsed.get(idx);
    if (!d) return ["DFD ainda em análise — reabrir para conferir."];
    const resAss = conferirAssinaturaDfd(d, repDe(dfdRepIds[idx]));
    const cirurgicas = faltasCirurgicasDfd(
      { itens: d.itens, secoes: d.secoes, reparticaoId: dfdRepIds[idx], assinaturaMotivo: resAss.status === "erro" ? resAss.motivo : null, tipo: d.tipo, anoPca },
      regras,
      { categoria },
    );
    // Erros que não são faltas do formulário (duplicado, órgão) também vão ao despacho.
    const extras = (avaliacoes.get(idx)?.mensagens ?? []).filter((m) => m.status === "erro" && ERRO_EXTRA.has(m.chave)).map((m) => m.texto);
    return [...extras, ...cirurgicas];
  };
  const temErroProto = dfdsComErro > 0 || conc.divergente;
  const temAtencao = linhasAtencao.length > 0;
  const temRelatorio = temErroProto || temAtencao;
  const atencoesDe = (idx: number) => (avaliacoes.get(idx)?.mensagens ?? []).filter((m) => m.status === "atencao").map((m) => m.texto);
  const dfdsRelatorio = [
    ...linhasErro.map((l) => ({ numero: l.numero, planejamento: l.planejamento, tipo: parsed.get(l.key)?.tipo ?? null, faltas: faltasDoDfd(l.key) })),
    ...(incluirAtencao
      ? linhasAtencao.map((l) => ({ numero: l.numero, planejamento: l.planejamento, tipo: parsed.get(l.key)?.tipo ?? null, faltas: atencoesDe(l.key) }))
      : []),
  ];
  const relatorioLinhas = linhasRelatorioProtocolo({
    numero,
    idExterno: extra.idExterno,
    interessado: interessado || null,
    assunto: assunto || null,
    capaMotivo: conc.motivo,
    dfds: dfdsRelatorio,
  });

  // Texto de estado do rodapé (o PROGRESSO real da análise tem precedência, com barra).
  const statusTexto = protocolarDesligado
    ? "Protocolação desabilitada nas Configurações"
    : !numero.trim()
      ? "Informe o número do processo para protocolar"
      : !gateTrava.ok
        ? gateTrava.motivos.join(" ")
        : anoPcaBloqueia
          ? "Defina o PCA do processo para protocolar"
          : repBloqueia
            ? "Defina a unidade do processo para protocolar"
            : !temDfds
              ? "Sem DFDs — cria só o protocolo."
              : semErroBloqueia
                ? `${dfdsComErro} DFD(s) com erro`
                : conc.bloqueia
                  ? "Valor da capa diverge da somatória — substitua para liberar"
                  : dupBloqueia
                    ? "DFD duplicado — escolha qual manter"
                    : `${totalDfds} DFD(s) · ${semRep} sem unidade · ${dfdsComErro > 0 ? `${dfdsComErro} com erro (não bloqueia)` : temAtencao ? `${linhasAtencao.length} em atenção` : "tudo certo"}`;
  const pctAnalise = analise && analise.total > 0 ? Math.round((analise.feito / analise.total) * 100) : 0;
  const numeroAtual = analise?.atual != null ? (index?.dfds[analise.atual]?.numero ?? "") : "";
  const rotuloAnalise = !analise
    ? ""
    : analise.fase === "texto"
      ? `Analisando DFD ${numeroAtual} (${analise.feito + 1} de ${analise.total})…`
      : `Lendo assinatura por OCR — DFD ${numeroAtual} (${analise.feito + 1} de ${analise.total})…`;
  // Estado do DFD ABERTO no rodapé = a MESMA régua do painel ao lado (mensagens completas, incl. catálogo
  // e ano do PCA) + o duplicado pendente; descartado segue "Descartado".
  const estadoAberto =
    abertoIdx < 0 || !dfdAberto
      ? null
      : descartados.has(abertoIdx)
        ? "descartado"
        : estadoDeMensagens(
            [...(avaliacoes.get(abertoIdx)?.mensagens.filter((m) => m.chave === "protocolo.dfdDuplicado") ?? []), ...mensagensAberto],
            { auto: (autoMap.get(abertoIdx)?.length ?? 0) > 0, editado: editados.has(abertoIdx) },
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
          <p className="font-semibold">Lendo o protocolo e identificando os DFDs…</p>
          {leitura && (
            <div className="mt-2">
              <Progress
                value={(leitura.pagina / Math.max(1, leitura.total)) * 100}
                label={`Página ${num(leitura.pagina)} de ${num(leitura.total)}`}
              />
            </div>
          )}
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
                    <DfdCabecalho numero={index?.dfds[abertoIdx]?.numero ?? ""} tipo={dfdAberto?.tipo ?? null} planejamento={dfdAberto?.planejamento ?? null} />
                  ) : undefined,
                onClose: fecharDfdLateral,
                rodape:
                  abertoIdx < 0 ? undefined : (
                    <DfdRodape
                      estado={estadoAberto}
                      regras={regras}
                      mensagens={mensagensAberto}
                      mensagensAbertas={painel?.tipo === "mensagens"}
                      onToggleMensagens={() => setPainel((p) => (p?.tipo === "mensagens" ? null : { tipo: "mensagens" }))}
                      onFechar={fecharDfdLateral}
                      bloqueado={importando}
                      acoes={
                        <>
                          {/* DFD duplicado: manter ESTE (descarta os demais do grupo) ou restaurar o descartado. */}
                          {descartados.has(abertoIdx) && (
                            <Button variant="secondary" onClick={() => restaurarDfd(abertoIdx)} disabled={importando}>
                              Restaurar
                            </Button>
                          )}
                          {!descartados.has(abertoIdx) && dupComp !== "ignora" && dupPendente(abertoIdx) && (
                            <Button onClick={() => manterDfd(abertoIdx)} disabled={importando}>
                              Manter este DFD
                            </Button>
                          )}
                          {/* Conflito com um DFD já cadastrado: manter o EXISTENTE = descartar este do envio. */}
                          {!descartados.has(abertoIdx) && !(dupComp !== "ignora" && dupPendente(abertoIdx)) && conflitaComExistente(abertoIdx) && (
                            <Button variant="secondary" onClick={() => descartarDfd(abertoIdx)} disabled={importando}>
                              Manter o existente
                            </Button>
                          )}
                        </>
                      }
                    />
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
                        categoria={categoria}
                        autoMatch={dfdRepIds[abertoIdx] != null && dfdRepIds[abertoIdx] === autoRepIds[abertoIdx]}
                        autoCampos={autoMap.get(abertoIdx) ?? []}
                        regras={regras}
                        orgaos={orgaos}
                        conformidade={conformidade}
                        ancoraAlvo={ancoraAlvo}
                        itemAtivo={painel?.tipo === "item" ? painel.idx : null}
                        onItemClick={(idx) => setPainel({ tipo: "item", idx })}
                        onRepChange={(id) => setRepDfd(abertoIdx, id)}
                        onSecoesChange={(secoes) => editarAberto((d) => ({ ...d, secoes }))}
                        onRefsChange={(refs) => editarAberto((d) => ({ ...d, ...refs }))}
                        onCamposChange={(campos) => editarAberto((d) => ({ ...d, ...campos }))}
                        onTipoChange={(tipo) => editarAberto((d) => ({ ...d, tipo }))}
                        onAssinaturasChange={(assinaturas) => editarAberto((d) => ({ ...d, assinaturas }))}
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
                titulo: tituloPainelDfd(painel, dfdAberto, index?.dfds[abertoIdx]?.numero ?? ""),
                onClose: () => setPainel(null),
                rodape: painel?.tipo === "item" ? <RodapePainelItem onVerDfd={() => setPainel(null)} /> : undefined,
                children: (
                  <DfdPainelDireito
                    painel={painel}
                    dfd={dfdAberto}
                    numero={index?.dfds[abertoIdx]?.numero ?? ""}
                    mensagens={mensagensAberto}
                    onIrPara={irParaMensagem}
                    conformidade={conformidade}
                    regras={regras}
                    editavel
                    onEditarItem={(i, patch) => editarAberto((d) => editarItemDfd(d, i, patch))}
                    onRemoverItem={(i) => {
                      setPainel(null);
                      editarAberto((d) => removerItemDfd(d, i));
                    }}
                  />
                ),
              }
            : undefined
        }
        rodape={
          <div>
            {/* Falha ao abrir um DFD / ao protocolar — aparece DENTRO do banner (antes ficava invisível). */}
            {erro && (
              <Callout kind="danger" icon={<IconAlert className="h-4 w-4" />} className="mb-3">
                {erro}
              </Callout>
            )}
            {sel.size > 0 && !importando && (
              <BarraEdicaoMassa
                qtd={sel.size}
                reparticoes={reparticoes}
                anoPadrao={anoPca}
                regras={regras}
                aplicando={aplicandoMassa}
                onAplicar={aplicarMassa}
                onLimpar={() => setSel(new Set())}
              />
            )}
            <div className="flex flex-wrap items-center justify-between gap-3">
              {importando && progresso ? (
                <div className="min-w-[200px] flex-1">
                  <Progress value={pct} label={`Protocolando ${progresso.label}... ${pct}% — não feche esta janela`} />
                </div>
              ) : analise ? (
                <div className="min-w-[200px] flex-1">
                  <Progress value={pctAnalise} label={rotuloAnalise} />
                </div>
              ) : (
                <span className="text-[12px]" style={{ color: bloqueadoPorRegra || !numero.trim() ? "var(--danger)" : "var(--muted)" }}>
                  {statusTexto}
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
        {/* CORPO ÚNICO do protocolo (o MESMO do protocolo gravado): mini banners + conciliação da capa
            + dados do processo (capa com cadeado por campo) + planilha de DFDs (erro/atenção separados). */}
        <ProtocoloView
          capa={{
            numero,
            idExterno: extra.idExterno,
            data,
            documento: extra.documento ?? "",
            interessado,
            assunto,
            observacao,
            valorCapa: extra.valorCapa,
            localReparticao: extra.localReparticao,
          }}
          modoCapa={origemPdf ? "cadeado" : "criar"}
          numeroEditavel={origemPdf && index?.protocolo.numero == null}
          assuntos={opcoesAssunto(regras, assunto)}
          onCapaChange={(c, v) => {
            if (c === "numero") setNumero(v);
            else if (c === "data") setData(v);
            else if (c === "interessado") setInteressado(v);
            else if (c === "assunto") setAssunto(v);
            else if (c === "observacao") setObservacao(v);
            else if (c === "localReparticao") setExtra((x) => ({ ...x, localReparticao: v || null }));
            else setExtra((x) => ({ ...x, documento: v || null }));
          }}
          onValorCapaChange={(v) => setExtra((x) => ({ ...x, valorCapa: v }))}
          unidade={{ id: protoRepId, opcoes: reparticoes, onChange: setProtoRepId, rotulo: "Unidade do protocolo (pelo Interessado)", obrigatoria: true }}
          pca={<PcaPicker pcas={pcas} value={anoPca} detectado={anoPcaDetectado} onChange={setAnoPca} />}
          totais={{
            dfds: totalConsiderados,
            itens: itensDfds,
            somatorio: somatorioDfds,
            dica: analisando ? "analisando…" : !completo ? `parcial — ${num(lidos)} de ${num(ativos.length)} DFDs lidos` : undefined,
          }}
          conciliacao={conc}
          onSubstituir={() => setExtra((x) => ({ ...x, valorCapa: conc.somatorio }))}
          linhas={linhasDfd}
          selecionavel
          selected={sel}
          onSelected={setSel}
          onVerDfd={abrir}
          dfdAtivo={abertoIdx >= 0 ? abertoIdx : null}
          compacta={compacta}
          regras={regras}
          vazio={
            <Callout kind="info">
              Nenhum DFD detectado. O protocolo será criado vazio — adicione DFDs depois (aba DFDs) ou vincule existentes.
            </Callout>
          }
        />
      </Modal>

      <RelatorioErros
        open={relatorioAberto}
        onClose={() => setRelatorioAberto(false)}
        titulo={`Relatório do protocolo ${numero || ""}`.trim()}
        linhas={relatorioLinhas}
        toggle={
          temAtencao
            ? {
                label: `Incluir ${linhasAtencao.length} DFD(s) em atenção no relatório`,
                checked: incluirAtencao,
                onChange: setIncluirAtencao,
              }
            : undefined
        }
      />
    </div>
  );
}
