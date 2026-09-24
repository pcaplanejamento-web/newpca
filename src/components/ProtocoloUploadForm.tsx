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
  TIPOS_DFD,
} from "@/lib/avaliacao-core";
import {
  type ComparacaoDfd,
  compararCapa,
  compararDfd,
  compararDuplicados,
  type DfdComparavel,
  herdarTratamentos,
  identidadeReenvio,
  linhasRelatorioReenvio,
  rotuloSituacaoReenvio,
} from "@/lib/comparar-protocolo";
import {
  avaliarLinhaDfd,
  conferirAssinaturaDfd,
  estadoDeMensagens,
  type LinhaAvaliada,
  MSG_DFD_DUPLICADO,
  mensagensDoDfd,
} from "@/lib/conferencia-dfd";
import type { ConferenciaItem } from "@/lib/catalogo-conferencia";
import { conferirItensClienteResultado } from "@/lib/catalogo-conferir-cliente";
import type { DfdDetalhe } from "@/lib/dfd";
import { detalheParaParseado } from "@/lib/dfd-edicao";
import {
  type AcaoMassa,
  algumCatalogoFundamental,
  aplicarMassaDfd,
  type CampoTratavel,
  conciliacaoCapa,
  duplicadosDfds,
  editarItemDfd,
  faltasCirurgicasDfd,
  gruposAssinatura,
  linhasRelatorioProtocolo,
  type MensagemDfd,
  motivoDuplicidade,
  normalizarSecoesDfd,
  removerItemDfd,
  resumoEstado,
  STATUS_MENSAGEM_COR,
  unificarItensDfd,
} from "@/lib/dfd-tratamento";
import { num } from "@/lib/format";
import { buscarExistentes, enviarDfdEmLotes, type ExistenteImport } from "@/lib/importar-dfd";
import { encerrarOcr } from "@/lib/ocr-assinatura";
import { mesclarAssinaturasOcr, precisaOcr } from "@/lib/ocr-assinatura-core";
import { type Assinatura, type DfdParseado, tipoCurtoDfd } from "@/lib/parse-dfd-comum";
import {
  indexarProtocoloPdf,
  ocrAssinaturasEmPaginas,
  parseDfdDoProtocolo,
  type PdfDoc,
  type ProtocoloIndex,
} from "@/lib/parse-protocolo-pdf";
import type { DfdSobrescrito, ProtocoloDetalhe } from "@/lib/protocolo";
import { casarPorInteressado, preverUnidadeDoDfd } from "@/lib/reparticao-match";
import type { Responsaveis } from "@/lib/reparticao-responsaveis";
import type { UnidadeConferencia } from "@/lib/reparticoes";
import { comparacaoEscolha, entradasEscolha, escolhasParaHistorico, marcarItensNovos, resumoEscolhas, semMarcas } from "@/lib/sobrescrita-dfd";
import { BarraEdicaoMassa } from "./BarraEdicaoMassa";
import { AvisoFlutuante } from "./AvisoFlutuante";
import { BarraSelecaoDfds } from "./BarraSelecao";
import { Button } from "./Button";
import { Callout } from "./Callout";
import { ComparacaoDuplicados } from "./ComparacaoDuplicados";
import { ComparacaoProtocolo } from "./ComparacaoReenvio";
import { DfdConferir, type PainelDfd } from "./DfdConferir";
import { DfdPainelDireito, RodapePainelItem, tituloPainelDfd } from "./DfdPainelDireito";
import { DfdRodape } from "./DfdRodape";
import { DfdCabecalho } from "./DfdView";
import { Dropzone } from "./Dropzone";
import { IconAlert, IconCheck, IconClipboard, IconCompare, IconFile, IconRefresh, IconSpinner, IconUpload } from "./icons";
import { Modal } from "./Modal";
import { type PcaOpcao, PcaPicker } from "./PcaPicker";
import type { LinhaDfd, ProcessandoDfd } from "./PlanilhaDfds";
import { Progress } from "./Progress";
import { ProtocoloCabecalho, ProtocoloView } from "./ProtocoloView";
import { RelatorioErros } from "./RelatorioErros";
import { useConformidade } from "./useConformidade";
import { useSobrescrita } from "./useSobrescrita";

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
/** DFD já cadastrado (conflito de número): de qual protocolo é + seus totais (p/ a somatória quando ele
 * PREVALECE); `acessivel: false` = de outra unidade (não pode ser sobrescrito daqui). */
type DfdExistente = { numero: string; protocoloNumero: string | null; valorTotal?: number | null; totalItens?: number | null; id?: number; acessivel: boolean };
type Status = "idle" | "parsing" | "error";
type Extra = { idExterno: string | null; documento: string | null; localReparticao: string | null; valorCapa: number | null; nomeArquivo: string | null };
type Situacao = "novo" | "substitui" | "move" | "semAcesso";
/** Progresso REAL da análise em background: 1ª passada (texto) e 2ª (assinaturas por OCR). */
type Analise = { fase: "texto" | "ocr"; feito: number; total: number; atual: number | null };
/** Conferência dos itens de um DFD com o catálogo, com os ITENS e o TIPO conferidos (outros = reconferir); `ok: false`
 * = falha de rede (nova tentativa com espera; depois de 3, o servidor confere ao gravar). */
type ConfCat = { itens: DfdParseado["itens"]; tipo: string | null; conf?: Map<string, ConferenciaItem>; ok: boolean; falhas: number };
const MAX_FALHAS_CATALOGO = 3;

const EXTRA_VAZIO: Extra = { idExterno: null, documento: null, localReparticao: null, valorCapa: null, nomeArquivo: null };
const CAP_ANALISE = 300; // teto de DFDs analisados na abertura (escala): além disto, "pendente" até abrir/protocolar
const SITUACAO: Record<Situacao, string> = { novo: "Novo", substitui: "Substitui", move: "Move", semAcesso: "Sem acesso ou no PCA" };

/** REENVIO: o protocolo GRAVADO (capa + DFDs completos + o RASTRO dos DFDs dele sobrescritos por outro
 * protocolo + as UNIDADES reais dos DFDs, inclusive as sem acesso — a conferência usa a unidade REAL, como no
 * banner gravado) que o PDF reenviado vai SOBRESCREVER. */
export type BaseReenvio = { protocolo: ProtocoloDetalhe; dfds: DfdDetalhe[]; sobrescritos?: DfdSobrescrito[]; unidades?: UnidadeConferencia[] };
/** Nº do DFD comparável (o mesmo DFD no gravado e no PDF). */
const chaveDfd = (n: string | null | undefined) => String(n ?? "").trim();
/** DFD de mesmo nº numa unidade SEM ACESSO: o servidor recusa a sobrescrita (anti-sequestro) — é ERRO da linha
 * desde a análise (tabela, painel e despacho), resolvido por "Manter o existente". */
const MSG_SEM_ACESSO: MensagemDfd = {
  chave: "dfd.semAcesso",
  status: "erro",
  ancora: "reparticao",
  rotulo: "Não sobrescrevível",
  texto: "Já existe um DFD com este número que não pode ser sobrescrito daqui — numa unidade sem acesso para você ou num protocolo incorporado a um PCA (travado). Mantenha o já cadastrado (botão \"Manter…\" no rodapé do DFD).",
};
/** A avaliação da linha + o erro de unidade sem acesso (a MESMA régua da célula, do painel e do rodapé). */
function comSemAcesso(r: LinhaAvaliada): LinhaAvaliada {
  const mensagens = [MSG_SEM_ACESSO, ...r.mensagens];
  return { ...r, estado: "erro", mensagens, resumo: resumoEstado(mensagens) };
}

export function ProtocoloUploadForm({
  reparticoes,
  reparticaoAtivaId = null,
  pcas = [],
  regras = regrasPadrao(),
  orgaos = [],
  reenvio = null,
  iniciar = 0,
  onConcluido,
}: {
  reparticoes: Rep[];
  reparticaoAtivaId?: number | null;
  pcas?: PcaOpcao[];
  regras?: RegrasAvaliacao;
  orgaos?: Orgao[];
  /**
   * REENVIO (sobrescrever o protocolo GRAVADO com o mesmo PDF corrigido): só aceita o MESMO protocolo
   * (nº e Id); compara capa/DFDs/itens com o gravado, herda os tratamentos que o PDF não traz, deixa
   * editar tudo e, ao confirmar, regrava só o que mudou e exclui (ou mantém) os DFDs que não vieram.
   * Sem ele: importação normal ("Importar protocolo", no rodapé da tabela de protocolos da Mesa).
   */
  reenvio?: BaseReenvio | null;
  /** Contador do BOTÃO do host (rodapé da tabela de protocolos da Mesa; no reenvio, o banner do protocolo
   * gravado): cada valor NOVO abre o lançador. */
  iniciar?: number;
  /** (reenvio) sobrescrita concluída — o banner do gravado recarrega. */
  onConcluido?: () => void;
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
  // CATÁLOGO BLOQUEANTE (o ADM pôs um ponto de catálogo em "bloqueia"): o servidor confere os itens de TODO DFD ao
  // gravar — a análise confere também, DFD a DFD (fila), guardando COM os itens conferidos (editar reconfere).
  const [confCat, setConfCat] = useState<Map<number, ConfCat>>(new Map());
  const catEmCursoRef = useRef<number | null>(null);
  // Leituras de DFD em andamento (abrir, massa, comparação dos duplicados): UMA por DFD — a que chega depois nunca
  // sobrescreve o DFD já no cache (que pode ter edições).
  const parseEmCursoRef = useRef(new Map<number, Promise<DfdParseado | null>>());

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
  const [relatorio, setRelatorio] = useState<{
    numero: string;
    importados: number;
    bloqueados: { numero: string; motivo: string }[];
    /** (reenvio) DFDs sem diferença (não regravados) e gravados excluídos por não virem no PDF. */
    iguais?: number;
    excluidos?: number;
  } | null>(null);
  // REENVIO: DFDs gravados que NÃO vieram no PDF e o usuário decidiu MANTER (o padrão é excluir) +
  // tratamentos herdados do gravado por DFD (transparência) + relatório de diferenças.
  const [removidosManter, setRemovidosManter] = useState<Set<number>>(new Set());
  const [herdados, setHerdados] = useState<Map<number, string[]>>(new Map());
  const [relDiffAberto, setRelDiffAberto] = useState(false);
  // DFDs JÁ CADASTRADOS com os números do PDF — consultados no SERVIDOR (em qualquer unidade: a lista da Mesa é
  // filtrada pela unidade do cabeçalho). `null` = consultando; falha ⇒ não protocola às cegas.
  const [existentesSrv, setExistentesSrv] = useState<Map<string, ExistenteImport> | null>(null);
  const [erroExistentes, setErroExistentes] = useState<string | null>(null);
  // SOBRESCRITA com ESCOLHA POR DADO: o DFD GRAVADO de mesmo nº (carregado ao abrir o DFD) e o NOVO como veio
  // do arquivo (a base estável das escolhas — o `parsed` é o DFD de TRABALHO, com as escolhas/edições).
  const [gravadosSrv, setGravadosSrv] = useState<Map<string, DfdDetalhe>>(new Map());
  const gravadoPedidoRef = useRef(new Set<string>()); // nºs cujo gravado já foi pedido (não repete)
  const arquivosRef = useRef(new Map<number, DfdParseado>());
  // REENVIO: DFDs do PDF que ESTE processo já teve e foram SOBRESCRITOS por outro protocolo (o rastro) —
  // mantidos lá por padrão (não puxa de volta a versão antiga); "Restaurar" traz para cá.
  const [fantasmas, setFantasmas] = useState<Set<number>>(new Set());
  const gravadosPorNumero = useMemo(() => new Map((reenvio?.dfds ?? []).map((d) => [chaveDfd(d.numero), d])), [reenvio]);
  const gravadoDe = (numero: string | null | undefined): DfdDetalhe | null => (reenvio ? (gravadosPorNumero.get(chaveDfd(numero)) ?? null) : null);

  // Montado? Uma leitura de PDF em curso quando o form DESMONTA (ex.: saiu da Mesa) descarta o documento em vez de
  // seguir analisando sozinha — o pdf.js e o worker do OCR nunca ficam presos.
  const vivoRef = useRef(true);
  useEffect(() => {
    vivoRef.current = true;
    return () => {
      vivoRef.current = false;
      void docRef.current?.destroy();
      docRef.current = null; // a análise em curso para no próximo passo (`docRef.current !== doc`)
      void encerrarOcr(); // libera o worker do OCR ao desmontar
    };
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
    setConfCat(new Map());
    catEmCursoRef.current = null;
    parseEmCursoRef.current = new Map();
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
    setRemovidosManter(new Set());
    setHerdados(new Map());
    setGravadosSrv(new Map());
    gravadoPedidoRef.current = new Set();
    setFantasmas(new Set());
    setErroExistentes(null);
    arquivosRef.current = new Map();
  }

  // O botão do HOST abre o lançador (no reenvio, só o PDF — sem criação manual). Só um clique NOVO abre: o
  // contador vive no host e sobrevive a este form remontar (ex.: fechar/reabrir o protocolo); com a leitura de
  // um PDF em andamento, o clique é IGNORADO (o aviso flutuante mostra o progresso da leitura).
  const iniciarVisto = useRef(iniciar);
  // biome-ignore lint/correctness/useExhaustiveDependencies: reage só ao contador do host.
  useEffect(() => {
    if (iniciar <= 0 || iniciar === iniciarVisto.current) return;
    iniciarVisto.current = iniciar;
    if (status === "parsing") return;
    setErro(null);
    setStatus("idle");
    setRelatorio(null);
    setLauncher(true);
  }, [iniciar]);

  /** Normaliza o DFD lido do PDF e, no REENVIO, herda do gravado o que o PDF não traz (tratamentos). A
   * validação da ASSINATURA espera o OCR quando o DFD depende dele (`herdarAssinaturas`, após a leitura). */
  function prepararDfd(i: number, raw: DfdParseado, anoRef: number | null | undefined): { dfd: DfdParseado; auto: CampoTratavel[] } {
    // Os itens marcam a ORIGEM (arquivo novo) — a escolha da sobrescrita os reencontra depois de editados.
    const { dfd: normal, auto } = normalizarSecoesDfd(raw, regras, anoRef);
    const dfd = marcarItensNovos(normal);
    const g = gravadoDe(dfd.numero);
    if (!g) return { dfd, auto };
    const h = herdarTratamentos(dfd, g, anoRef, { assinaturas: !precisaOcr(dfd.assinaturas) });
    anotarHerdados(i, h.herdados);
    return { dfd: h.dfd, auto };
  }
  /** Guarda o DFD NOVO como veio do arquivo (a base da escolha) — só o 1º (as edições ficam no `parsed`). */
  function guardarArquivo(i: number, d: DfdParseado) {
    if (!arquivosRef.current.has(i)) arquivosRef.current.set(i, d);
  }
  /** A assinatura lida por OCR também é do ARQUIVO (a base da escolha acompanha a leitura). */
  function lerOcrNoArquivo(i: number, ocr: Assinatura[]) {
    const arq = arquivosRef.current.get(i);
    if (arq) arquivosRef.current.set(i, comOcr(arq, ocr).dfd);
  }
  /** REENVIO: herda do gravado a validação da assinatura pela equipe — DEPOIS do OCR (a assinatura
   * achatada só existe após a leitura). Puro: devolve o DFD + o que foi herdado. */
  function herdarAssinaturas(d: DfdParseado): { dfd: DfdParseado; herdados: string[] } {
    const g = gravadoDe(d.numero);
    return g ? herdarTratamentos(d, g, null, { tratamentos: false }) : { dfd: d, herdados: [] };
  }
  /** Assinaturas lidas por OCR (ou nenhuma) + a validação herdada do gravado — o que vai para o cache. */
  const comOcr = (d: DfdParseado, ocr: Assinatura[]) =>
    herdarAssinaturas(ocr.length > 0 ? { ...d, assinaturas: mesclarAssinaturasOcr(d.assinaturas, ocr) } : d);
  function anotarHerdados(i: number, lista: string[]) {
    if (lista.length === 0) return;
    setHerdados((m) => {
      const cur = m.get(i) ?? [];
      const novos = lista.filter((x) => !cur.includes(x));
      return novos.length > 0 ? new Map(m).set(i, [...cur, ...novos]) : m;
    });
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
    setExistentesSrv(new Map()); // sem PDF: nenhum DFD a conferir
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
      const { index: idx, doc } = await indexarProtocoloPdf(
        file,
        (pagina, total) => setLeitura({ pagina, total }),
        () => !vivoRef.current, // desmontou (saiu da Mesa): para na próxima página
      );
      if (!vivoRef.current) {
        await doc.destroy();
        return;
      }
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
      // REENVIO: só o MESMO protocolo (nº e Id) — senão recusa sem tocar em nada.
      if (reenvio) {
        const motivo = identidadeReenvio(reenvio.protocolo, { numero: p.numero, idExterno: p.idExterno });
        if (motivo) {
          setStatus("error");
          setErro(motivo);
          await doc.destroy();
          return;
        }
      }
      docRef.current = doc;
      // Unidade de cada DFD: a prevista pela assinatura; no REENVIO, a do DFD GRAVADO prevalece (é o
      // tratamento já feito pela equipe) — a prevista segue como referência do "auto".
      const previstos = idx.dfds.map((d) => preverUnidadeDoDfd(d, orgaos, reparticoes));
      const autos = reenvio ? idx.dfds.map((d, i) => gravadoDe(d.numero)?.reparticaoId ?? previstos[i]) : previstos;
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
      // Adivinha o PCA pela capa; pré-seleciona só se o ano existir cadastrado. No REENVIO, o PCA e a
      // unidade do protocolo GRAVADO prevalecem (já definidos pela equipe; a comparação mostra se mudar).
      setAnoPcaDetectado(p.anoPca);
      setAnoPca(
        reenvio?.protocolo.anoPca != null
          ? reenvio.protocolo.anoPca
          : p.anoPca != null && pcas.some((x) => x.ano === p.anoPca)
            ? p.anoPca
            : null,
      );
      setOrigemPdf(true);
      setIndex(idx);
      setDfdRepIds(autos);
      setAutoRepIds(previstos);
      setProtoRepId(reenvio ? (reenvio.protocolo.reparticaoId ?? repInteressado) : (repInteressado ?? autos.find((x) => x != null) ?? reparticaoAtivaId));
      setProtoOrgaoId(orgaoInteressado);
      setStatus("idle");
      setLeitura(null);
      setLauncher(false);
      setAberto(true);
      setExistentesSrv(null);
      void carregarExistentes(idx, doc, autos); // quem SOBRESCREVE quem (no servidor, em qualquer unidade)
      void analisarTodos(idx, doc); // parse + estados em background (até o teto)
    } catch (e) {
      if (!vivoRef.current) return; // leitura cancelada ao desmontar — nada a mostrar (o documento já foi liberado)
      setStatus("error");
      setLeitura(null);
      setErro(e instanceof Error ? e.message : "Falha ao ler o protocolo.");
      limparDoc();
    }
  }

  /**
   * Quais DFDs do PDF JÁ EXISTEM (em qualquer unidade) — consultado no SERVIDOR: a situação Novo/Substitui/Move
   * e a sobrescrita com escolha saem daqui. No REENVIO, os DFDs que ESTE processo teve e que um protocolo
   * POSTERIOR sobrescreveu (o rastro) ficam MANTIDOS lá por padrão — reenviar não puxa de volta a versão
   * antiga ("Restaurar" traz, se for o caso).
   */
  async function carregarExistentes(idx0: ProtocoloIndex, doc: PdfDoc, previstos: (number | null)[]) {
    try {
      const m = await buscarExistentes(idx0.dfds.map((d) => d.numero));
      if (docRef.current !== doc) return;
      setExistentesSrv(m);
      // O DFD que SOBRESCREVE um já cadastrado fica na UNIDADE dele (cadastro/tratamento da equipe — como no
      // reenvio e na sobrescrita pelo banner), salvo se o usuário já escolheu outra.
      setDfdRepIds((arr) =>
        arr.map((x, i) => {
          const e = m.get(chaveDfd(idx0.dfds[i]?.numero));
          return e?.acessivel && e.reparticaoId != null && (x == null || x === previstos[i]) ? e.reparticaoId : x;
        }),
      );
      const rastro = new Set((reenvio?.sobrescritos ?? []).map((s) => chaveDfd(s.numero)));
      if (!reenvio || rastro.size === 0) return;
      const f = new Set<number>();
      idx0.dfds.forEach((d, i) => {
        const e = m.get(chaveDfd(d.numero));
        if (rastro.has(chaveDfd(d.numero)) && e?.acessivel && e.protocoloId != null && e.protocoloId !== reenvio.protocolo.id) f.add(i);
      });
      if (f.size === 0) return;
      setFantasmas(f);
      setDescartados((s) => new Set([...s, ...f]));
      setMantidosExistentes((s) => new Set([...s, ...f]));
    } catch (e) {
      if (docRef.current !== doc) return;
      setErroExistentes(e instanceof Error ? e.message : "Não foi possível conferir os DFDs já cadastrados.");
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
        // Previsão segue o PCA do PROTOCOLO (ponto 7) — o ano detectado na capa (fresco no índice); no
        // reenvio, o do protocolo gravado. Reenvio: herda do gravado o que o PDF não traz.
        const { dfd, auto } = prepararDfd(i, raw, reenvio?.protocolo.anoPca ?? idx0.protocolo.anoPca);
        const abertoNoMeio = parsedRef.current.get(i); // aberto pelo usuário durante o parse
        if (abertoNoMeio) {
          viaCache(i, abertoNoMeio);
          continue;
        }
        guardarArquivo(i, dfd);
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
        // Lidas (ou não) — no REENVIO herda agora a validação da equipe do gravado.
        const local = comOcr(dfd, ocr);
        anotarHerdados(i, local.herdados);
        if (local.dfd.assinaturas !== dfd.assinaturas) {
          lerOcrNoArquivo(i, ocr);
          setParsed((m) => {
            const cur = m.get(i);
            return cur ? new Map(m).set(i, comOcr(cur, ocr).dfd) : m;
          });
          // As assinaturas não são editadas nesse meio-tempo → a cópia local basta p/ prever a unidade.
          refinarUnidade(i, local.dfd);
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

  // Fechar (ou concluir a protocolação) LIBERA a análise: o form segue montado na Mesa (o botão está no host), então
  // o índice, os DFDs lidos e as cópias dos arquivos não ficam na memória (nem são recalculados a cada render).
  function fechar() {
    setAberto(false);
    limparDoc();
    resetCache();
    setIndex(null);
  }

  const nomeArq = extra.nomeArquivo ?? "protocolo.pdf";

  /** O DFD JÁ cadastrado com esse nº: no reenvio, os do protocolo gravado; senão o que o SERVIDOR achou (em
   * qualquer unidade — o de unidade sem acesso vem só como `acessivel: false`). */
  const existenteDe = (dfdNumero: string | null | undefined): DfdExistente | null => {
    const g = gravadoDe(dfdNumero);
    const e = existentesSrv?.get(chaveDfd(dfdNumero));
    // Reenvio: o DFD do protocolo gravado (os valores dele) — de unidade SEM ACESSO, fica só leitura (o servidor
    // recusaria regravá-lo).
    if (g)
      return {
        id: g.id,
        numero: g.numero,
        protocoloNumero: reenvio?.protocolo.numero ?? null,
        valorTotal: g.valorTotal,
        totalItens: g.totalItens,
        acessivel: e?.acessivel !== false,
      };
    if (!e) return null;
    return e.acessivel
      ? { id: e.id, numero: e.numero, protocoloNumero: e.protocoloNumero, valorTotal: e.valorTotal, totalItens: e.totalItens, acessivel: true }
      : { numero: e.numero, protocoloNumero: null, acessivel: false };
  };
  const classificar = (dfdNumero: string): Situacao => {
    const ex = existenteDe(dfdNumero);
    if (!ex) return "novo";
    if (!ex.acessivel) return "semAcesso";
    if (ex.protocoloNumero && ex.protocoloNumero.trim() !== numero.trim()) return "move";
    return "substitui";
  };
  /** O DFD GRAVADO (completo) que este DFD do PDF sobrescreve — a base da ESCOLHA POR DADO: no reenvio, o do
   * protocolo; senão o carregado ao abrir o DFD. */
  const gravadoBase = (dfdNumero: string | null | undefined): DfdDetalhe | null =>
    gravadoDe(dfdNumero) ?? gravadosSrv.get(chaveDfd(dfdNumero)) ?? null;
  /** Este DFD do PDF tem o mesmo nº de um DFD de unidade SEM ACESSO (não pode ser sobrescrito daqui)? No
   * REENVIO, o gravado SEM diferença (não editado) não é regravado — então não é erro (fica como está). */
  const semAcessoDe = (idx: number): boolean => {
    const n = index?.dfds[idx]?.numero;
    if (n == null || classificar(n) !== "semAcesso") return false;
    return !(gravadoDe(n) && !editados.has(idx) && comparacaoDe(idx)?.situacao === "igual");
  };
  /** O DFD JÁ cadastrado é deste MESMO processo (o do reenvio, ou de um protocolo com este nº)? — o que
   * "Manter o existente" mantém NO processo (entra na somatória/contagem da capa). */
  const existenteNoProcesso = (dfdNumero: string): boolean => {
    if (gravadoDe(dfdNumero)) return true;
    const ex = existenteDe(dfdNumero);
    return !!ex?.protocoloNumero && ex.protocoloNumero.trim() === numero.trim();
  };

  // Categoria do protocolo (classifica o assunto livre) → aplica as exceções por categoria.
  const categoria = classificarAssunto(assunto);
  // A unidade da lista do usuário; no REENVIO, também a REAL de um DFD gravado de unidade sem acesso (conferido como no
  // banner gravado — nunca "sem unidade" por falta de acesso).
  const repDe = (id: number | null | undefined): Rep | null =>
    id != null ? (reparticoes.find((r) => r.id === id) ?? reenvio?.unidades?.find((u) => u.id === id) ?? null) : null;

  // ---- DFDs DUPLICADOS (mesmo nº de DFD ou de planejamento) — ponto configurável `protocolo.dfdDuplicado`. Relação
  // DIRETA (`duplicadosDfds`): cada DFD conhece os que conflitam com ELE — "manter este" descarta só esses (um DFD que
  // só se liga a um descartado não sai à toa). O planejamento entra quando o DFD é lido (análise).
  const dupComp = comportamentoNo(regras, "protocolo.dfdDuplicado", { categoria });
  // Com o ponto em "ignorar" o planejamento não liga DFDs e nada é apontado — mas o MESMO Nº sempre liga (só um DFD
  // por número é gravado): a comparação e a escolha seguem disponíveis.
  const dups = duplicadosDfds(
    (index?.dfds ?? []).map((di, i) => ({ numero: di.numero, planejamento: dupComp === "ignora" ? null : (parsed.get(i)?.planejamento ?? null) })),
  );
  const dupDe = (idx: number): number[] => dups[idx] ?? [];
  const mesmoNumero = (a: number, b: number) => chaveDfd(index?.dfds[a]?.numero) === chaveDfd(index?.dfds[b]?.numero);
  /** Duplicata AINDA não resolvida: este DFD (não descartado) conflita com outro também não descartado. */
  const dupPendente = (idx: number): boolean => !descartados.has(idx) && dupDe(idx).some((j) => !descartados.has(j));
  /** "Manter este DFD": descarta os que conflitam com ELE; se ele estava descartado, volta ao processo (troca). Ele
   * passa a gravar o nº dele — um "Manter o existente" de uma cópia de MESMO nº deixa de valer. */
  const manterDfd = (idx: number) => {
    const outros = dupDe(idx);
    if (outros.length === 0) return;
    const semEle = (prev: Set<number>) => {
      const s = new Set(prev);
      s.delete(idx);
      return s;
    };
    setDescartados((prev) => {
      const s = semEle(prev);
      for (const j of outros) s.add(j);
      return s;
    });
    setMantidosExistentes((prev) => {
      const s = semEle(prev);
      for (const j of outros) if (mesmoNumero(j, idx)) s.delete(j);
      return s;
    });
    setFantasmas(semEle);
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
    setFantasmas(tirar); // o DFD do rastro volta a este processo (a Situação passa a "Move")
  };
  /** Este DFD substitui/move um já CADASTRADO (conflito com o banco)? */
  const conflitaComExistente = (idx: number): boolean => {
    const n = index?.dfds[idx]?.numero;
    return n != null && classificar(n) !== "novo";
  };
  /** "Manter o existente": descarta ESTE DFD do envio → o já cadastrado PREVALECE — e também as cópias de MESMO nº no
   * PDF (senão uma delas o sobrescreveria mesmo assim). */
  const descartarDfd = (idx: number) => {
    const copias = [idx, ...dupDe(idx).filter((j) => mesmoNumero(j, idx))];
    const com = (prev: Set<number>) => {
      const s = new Set(prev);
      for (const j of copias) s.add(j);
      return s;
    };
    setDescartados(com);
    setMantidosExistentes(com);
    setSel(new Set());
  };

  // ---- Conferência por LINHA — a MESMA do protocolo gravado (`avaliarLinhaDfd`). Cache por objeto
  // de DFD (só o DFD editado é reavaliado a cada tecla); zera quando as regras/cadastros mudam.
  // biome-ignore lint/correctness/useExhaustiveDependencies: as dependências INVALIDAM o cache (regras/cadastros novos ⇒ reconferir tudo).
  const cacheLinha = useMemo(
    () => new WeakMap<DfdParseado, { k: string; conf?: Map<string, ConferenciaItem>; r: LinhaAvaliada }>(),
    [regras, orgaos, reparticoes],
  );
  // CATÁLOGO na linha só quando BLOQUEIA (padrão: avisa → conferido ao abrir o DFD, a lista fica leve) — resolvido UMA
  // vez por tipo de DFD (são 4), não a cada DFD/render.
  const catBloqueiaPorTipo = useMemo(() => {
    const m = new Map<string | null, boolean>();
    for (const t of [null, ...TIPOS_DFD]) m.set(t, algumCatalogoFundamental(regras, { categoria, dfdTipo: t }));
    return m;
  }, [regras, categoria]);
  const catBloqueia = (d: DfdParseado) => catBloqueiaPorTipo.get(tipoCurtoDfd(d.tipo)) ?? false;
  /** A conformidade do DFD com o catálogo para a linha: `pronto` = conferida para ESTES itens/tipo (ou não precisa);
   * `falhou` = a rede falhou 3× (a linha segue sem o catálogo — o servidor confere ao gravar). */
  const confDe = (idx: number, d: DfdParseado): { pronto: boolean; conf?: Map<string, ConferenciaItem>; falhou?: boolean } => {
    if (!catBloqueia(d)) return { pronto: true };
    const c = confCat.get(idx);
    if (!c || c.itens !== d.itens || c.tipo !== d.tipo) return { pronto: false };
    return c.ok ? { pronto: true, conf: c.conf } : c.falhas >= MAX_FALHAS_CATALOGO ? { pronto: true, falhou: true } : { pronto: false };
  };
  /** O DFD ainda espera a conferência do catálogo (a MESMA régua da fila, da linha e do botão Protocolar). */
  const catPendenteDe = (i: number, d: DfdParseado) => !descartados.has(i) && !errosParse.has(i) && !confDe(i, d).pronto;
  // Fila da conferência do catálogo (um DFD por vez): após cada resposta o estado muda e o próximo é pedido. Falha de
  // rede: nova tentativa com espera crescente, até 3.
  useEffect(() => {
    if (!aberto || catEmCursoRef.current != null) return; // banner fechado: nada a conferir
    const prox = [...parsed.entries()].find(([i, d]) => catPendenteDe(i, d));
    if (!prox) return;
    const [i, d] = prox;
    const doc = docRef.current;
    const antes = confCat.get(i);
    const falhas = antes && antes.itens === d.itens && antes.tipo === d.tipo ? antes.falhas : 0;
    catEmCursoRef.current = i;
    void (async () => {
      if (falhas > 0) await new Promise((r) => setTimeout(r, 1500 * falhas));
      const r = await conferirItensClienteResultado(d.itens, d.tipo);
      if (docRef.current !== doc) return;
      catEmCursoRef.current = null;
      setConfCat((m) => new Map(m).set(i, { itens: d.itens, tipo: d.tipo, conf: r.conf, ok: r.ok, falhas: r.ok ? 0 : falhas + 1 }));
    })();
  });
  const avaliarLinha = (idx: number, d: DfdParseado, conformidade?: Map<string, ConferenciaItem>): LinhaAvaliada => {
    const repId = dfdRepIds[idx] ?? null;
    const dup = dupComp !== "ignora" && dupPendente(idx) ? (dupComp === "bloqueia" ? "erro" : "atencao") : null;
    const auto = (autoMap.get(idx)?.length ?? 0) > 0;
    const editado = editados.has(idx);
    const k = `${repId}|${anoPca}|${categoria}|${auto}|${editado}|${dup}`;
    const c = cacheLinha.get(d);
    if (c && c.k === k && c.conf === conformidade) return c.r;
    const r = avaliarLinhaDfd(d, repDe(repId), { anoPca, regras, categoria, orgaos, auto, editado, duplicado: dup, conformidade });
    cacheLinha.set(d, { k, conf: conformidade, r });
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
    const d = parsed.get(idx);
    if (d && !confDe(idx, d).pronto) return "conferindo"; // itens sendo conferidos no catálogo (ponto bloqueante)
    return null;
  };

  // ---- REENVIO: comparação de cada DFD (PDF + edições) com o GRAVADO — cache por objeto de DFD.
  const rotuloUnidade = (id: number | null) => (id == null ? "—" : (repDe(id)?.codigo ?? `#${id}`));
  const anoGravado = (g: DfdDetalhe) => g.anoPca ?? reenvio?.protocolo.anoPca ?? null;
  const comparavelGravado = (g: DfdDetalhe): DfdComparavel => ({ ...g, anoPca: anoGravado(g) });
  // biome-ignore lint/correctness/useExhaustiveDependencies: as dependências INVALIDAM o cache (gravado/cadastros novos).
  const cacheComp = useMemo(() => new WeakMap<DfdParseado, { k: string; c: ComparacaoDfd }>(), [reenvio, reparticoes]);
  const comparacaoDe = (idx: number): ComparacaoDfd | null => {
    const d = parsed.get(idx);
    const g = gravadoDe(index?.dfds[idx]?.numero);
    if (!reenvio || !d) return null;
    const repId = dfdRepIds[idx] ?? null;
    const k = `${repId}|${anoPca}|${g?.id ?? "novo"}`;
    const hit = cacheComp.get(d);
    if (hit && hit.k === k) return hit.c;
    // O DFD herda o ANO do PCA do protocolo ao gravar — a comparação usa o mesmo.
    const c = compararDfd(g ? comparavelGravado(g) : null, { ...d, reparticaoId: repId, anoPca }, rotuloUnidade);
    cacheComp.set(d, { k, c });
    return c;
  };
  const situacaoDe = (idx: number, numeroDfd: string): string => {
    // REENVIO: DFD que este processo teve e um protocolo POSTERIOR sobrescreveu (o rastro) — hoje está lá.
    if (fantasmas.has(idx)) return `Sobrescrito — está no ${existenteDe(numeroDfd)?.protocoloNumero ? `protocolo ${existenteDe(numeroDfd)?.protocoloNumero}` : "outro protocolo"}`;
    if (!reenvio || !gravadoDe(numeroDfd)) return SITUACAO[classificar(numeroDfd)];
    const c = comparacaoDe(idx);
    return c ? rotuloSituacaoReenvio(c) : "A comparar";
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
      situacao: situacaoDe(idx, di.numero),
      processando: processandoDe(idx),
    };
    if (descartados.has(idx)) return { ...base, estado: "descartado" };
    const motivo = errosParse.get(idx);
    if (motivo) return { ...base, estado: "erro", estadoMotivo: motivo };
    const cat = d ? confDe(idx, d) : null;
    if (!d || !cat?.pronto || ocrPendente.has(idx)) return { ...base, estado: "pendente" };
    const r = semAcessoDe(idx) ? comSemAcesso(avaliarLinha(idx, d, cat.conf)) : avaliarLinha(idx, d, cat.conf);
    avaliacoes.set(idx, r);
    return { ...base, estado: r.estado, resumo: r.resumo, validacao: r.validacao };
  });
  // Registro da seleção (chips + somatório) — as linhas marcadas, na ordem da planilha.
  const linhasSel = linhasDfd.filter((l) => sel.has(l.key));
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
  const numerosAtivos = new Set(ativos.map((i) => chaveDfd(index?.dfds[i]?.numero)));
  // "Manter o existente" de um DFD deste MESMO protocolo (re-importação): o cadastrado continua no
  // processo → entra na somatória/contagem da capa (o de outro protocolo sai — segue lá). Um nº que um DFD ATIVO do
  // PDF ainda grava (ex.: o duplicado escolhido) não conta duas vezes — o ativo sobrescreve o cadastrado.
  const existentesMantidos = [
    ...new Set(
      [...mantidosExistentes].map((i) => chaveDfd(index?.dfds[i]?.numero)).filter((n) => n && existenteNoProcesso(n) && !numerosAtivos.has(n)),
    ),
  ]
    .map((n) => existenteDe(n))
    .filter((x): x is DfdExistente => !!x);
  // REENVIO: DFDs GRAVADOS que não vieram no PDF — excluídos ao sobrescrever, salvo os que o usuário MANTÉM
  // (esses continuam no processo → entram na somatória/contagem da capa).
  const numerosPdf = new Set((index?.dfds ?? []).map((d) => chaveDfd(d.numero)));
  const removidos = (reenvio?.dfds ?? [])
    .filter((g) => !numerosPdf.has(chaveDfd(g.numero)))
    .map((g) => ({ id: g.id, numero: g.numero, planejamento: g.planejamento, valorTotal: g.valorTotal, totalItens: g.totalItens, excluir: !removidosManter.has(g.id) }));
  const removidosMantidos = removidos.filter((r) => !r.excluir);
  // REENVIO: o RASTRO dos DFDs deste processo sobrescritos por outro protocolo segue na conciliação (a capa foi
  // emitida com eles, pelo valor da época) — menos os que o PDF traz de volta para cá (esses entram como ativos).
  const rastroMantido = (reenvio?.sobrescritos ?? []).filter((s) => !numerosAtivos.has(chaveDfd(s.numero)));
  const valorRastro = rastroMantido.reduce((s, x) => s + (x.valorTotal ?? 0), 0);
  const somatorioDfds =
    ativos.reduce((s, i) => s + (parsed.get(i)?.valorTotal ?? 0), 0) +
    [...existentesMantidos, ...removidosMantidos].reduce((s, x) => s + (x.valorTotal ?? 0), 0) +
    valorRastro;
  // Itens = só os DFDs VIVOS do processo (o rastro é o retrato da época — fica no "+N sobrescrito(s)").
  const itensDfds =
    ativos.reduce((s, i) => s + (parsed.get(i)?.itens.length ?? 0), 0) +
    [...existentesMantidos, ...removidosMantidos].reduce((s, x) => s + (x.totalItens ?? 0), 0);
  const totalVivos = ativos.length + existentesMantidos.length + removidosMantidos.length;
  const totalConsiderados = totalVivos + rastroMantido.length;
  // Somatória COMPLETA = todos os DFDs do processo LIDOS (um DFD ilegível somaria 0 → falsa divergência).
  const lidos = ativos.filter((i) => parsed.has(i)).length;
  const completo = !analisando && lidos === ativos.length;
  const conc = conciliacaoCapa({ valorCapa: extra.valorCapa, somatorio: somatorioDfds, totalDfds: totalConsiderados, completo }, regras, { categoria });

  // REENVIO: contagem por situação (os descartados — "Manter o gravado" — não contam), diferenças da capa.
  const contagemReenvio = { novos: 0, alterados: 0, iguais: 0, analisando: 0 };
  if (reenvio) {
    for (const i of ativos) {
      const g = gravadoDe(index?.dfds[i]?.numero);
      const c = comparacaoDe(i);
      if (!g) contagemReenvio.novos++;
      else if (!c) contagemReenvio.analisando++;
      else if (c.situacao === "igual") contagemReenvio.iguais++;
      else contagemReenvio.alterados++;
    }
  }
  const capaDiffs = reenvio
    ? compararCapa(
        { ...reenvio.protocolo },
        {
          data: data || null,
          interessado: interessado || null,
          documento: extra.documento,
          assunto: assunto || null,
          observacao: observacao || null,
          valorCapa: extra.valorCapa,
          localReparticao: extra.localReparticao,
          anoPca,
          reparticaoId: protoRepId,
        },
        rotuloUnidade,
      )
    : [];
  const relatorioDiffLinhas =
    reenvio && relDiffAberto
      ? linhasRelatorioReenvio({
        numero,
        idExterno: extra.idExterno,
        capa: capaDiffs,
          dfds: ativos.flatMap((i) => {
            const c = comparacaoDe(i);
            const di = index?.dfds[i];
            return c && di ? [{ numero: di.numero, planejamento: parsed.get(i)?.planejamento ?? null, comparacao: c }] : [];
          }),
          removidos,
          pendentes: ativos.flatMap((i) => {
            const di = index?.dfds[i];
            return di && gravadoDe(di.numero) && !comparacaoDe(i) ? [{ numero: di.numero, planejamento: gravadoDe(di.numero)?.planejamento ?? null }] : [];
          }),
        })
      : [];

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
  // Sem saber quem SOBRESCREVE quem (consulta dos já cadastrados), não protocola às cegas.
  const existentesPendentes = temDfds && (existentesSrv == null || erroExistentes != null);
  // DFDs cujos itens ainda estão sendo conferidos no catálogo (ponto bloqueante) — a protocolação espera; os que a
  // rede não deixou conferir seguem (o servidor confere ao gravar) e o rodapé avisa.
  const catPendentes = ativos.filter((i) => {
    const d = parsed.get(i);
    return !!d && catPendenteDe(i, d);
  }).length;
  const catFalhas = ativos.filter((i) => {
    const d = parsed.get(i);
    return !!d && !!confDe(i, d).falhou;
  }).length;
  const podeProtocolar =
    numero.trim().length > 0 &&
    !importando &&
    !analisando &&
    ocrPendente.size === 0 &&
    catPendentes === 0 &&
    !bloqueadoPorRegra &&
    !existentesPendentes;
  const pct = progresso && progresso.total > 0 ? Math.round((progresso.feito / progresso.total) * 100) : 0;

  // ---- DFD aberto ao lado.
  const dfdAberto = abertoIdx >= 0 ? (parsed.get(abertoIdx) ?? null) : null;
  const repAberto = abertoIdx >= 0 ? repDe(dfdRepIds[abertoIdx]) : null;
  const numeroAberto = abertoIdx >= 0 ? (index?.dfds[abertoIdx]?.numero ?? null) : null;
  // Conformidade do DFD ABERTO com o catálogo (lazy — só o DFD aberto; a lista fica leve).
  const conformidade = useConformidade(dfdAberto?.itens, dfdAberto?.tipo ?? null);
  // Mensagens (erro/atenção/acerto) do DFD aberto — botão + painel lateral (herda o anoPca do protocolo).
  // O DUPLICADO pendente entra no painel também (clicar nele abre a comparação dos duplicados) — a MESMA régua da
  // célula Estado e do rodapé.
  const msgDupAberto: MensagemDfd | null =
    abertoIdx >= 0 && dupComp !== "ignora" && dupPendente(abertoIdx)
      ? { status: dupComp === "bloqueia" ? "erro" : "atencao", chave: "protocolo.dfdDuplicado", texto: MSG_DFD_DUPLICADO, ancora: "duplicados" }
      : null;
  const mensagensAberto = dfdAberto
    ? [
        ...(msgDupAberto ? [msgDupAberto] : []),
        ...(semAcessoDe(abertoIdx) ? [MSG_SEM_ACESSO] : []),
        ...mensagensDoDfd(dfdAberto, repAberto, anoPca, regras, categoria, orgaos, conformidade),
      ]
    : [];

  // SOBRESCRITA com ESCOLHA POR DADO: ao abrir um DFD que substitui/move um já cadastrado (acessível), carrega o
  // GRAVADO completo (sob demanda — só o aberto; no reenvio ele já veio com o protocolo).
  // biome-ignore lint/correctness/useExhaustiveDependencies: reage ao DFD aberto e à consulta dos já cadastrados (o resto é lido na hora).
  useEffect(() => {
    if (numeroAberto == null || existentesSrv == null) return;
    const chave = chaveDfd(numeroAberto);
    const ex = existentesSrv.get(chave);
    if (gravadoDe(numeroAberto) || !ex?.acessivel || gravadoPedidoRef.current.has(chave)) return;
    gravadoPedidoRef.current.add(chave);
    const doc = docRef.current;
    void (async () => {
      try {
        const r = await fetch(`/api/dfd/${ex.id}`);
        const j = (await r.json().catch(() => ({}))) as { ok?: boolean; error?: string; dfd?: DfdDetalhe };
        if (!r.ok || !j.ok || !j.dfd) throw new Error(j.error ?? `HTTP ${r.status}`);
        const g = j.dfd;
        if (docRef.current === doc) setGravadosSrv((m) => new Map(m).set(chave, g));
      } catch {
        if (docRef.current !== doc) return;
        gravadoPedidoRef.current.delete(chave); // tenta de novo ao reabrir
        setErro(`Não foi possível carregar o DFD ${numeroAberto} já cadastrado para comparar — sem a comparação, ao protocolar vale o novo.`);
      }
    })();
  }, [numeroAberto, existentesSrv]);
  const gravadoAberto = numeroAberto != null ? gravadoBase(numeroAberto) : null;
  const gravadoAbertoP = useMemo(() => (gravadoAberto ? detalheParaParseado(gravadoAberto) : null), [gravadoAberto]);
  // Descartado ("Manter o existente"/duplicado), de unidade sem acesso ou com a assinatura em leitura (OCR): a
  // comparação fica só para leitura.
  const sob = useSobrescrita({
    gravado: gravadoAbertoP,
    novo: abertoIdx >= 0 ? (arquivosRef.current.get(abertoIdx) ?? null) : null,
    trabalho: dfdAberto,
    // A escolha vai ao DFD de TRABALHO (não o marca "editado": manter o gravado não é edição à mão).
    onTrabalho: (fn) =>
      setParsed((m) => {
        const d = m.get(abertoIdx);
        return d ? new Map(m).set(abertoIdx, fn(d)) : m;
      }),
    // …e enquanto a assinatura dele ainda é lida por OCR (a leitura mescla nas assinaturas de trabalho).
    bloqueado: importando || descartados.has(abertoIdx) || semAcessoDe(abertoIdx) || ocrPendente.has(abertoIdx),
    unidade: gravadoAberto ? { gravado: gravadoAberto.reparticaoId, trabalho: dfdRepIds[abertoIdx] ?? null, rotulo: rotuloUnidade } : undefined,
    anoPca: gravadoAberto
      ? { gravado: gravadoAberto.anoPca ?? gravadoAberto.protocoloAnoPca ?? (gravadoDe(numeroAberto) ? (reenvio?.protocolo.anoPca ?? null) : null), trabalho: anoPca }
      : undefined,
  });
  // Nº de diferenças do DFD aberto (o que muda ao sobrescrever) — o botão "Diferenças (N)".
  const difAberto = sob ? sob.final.total : reenvio && gravadoDe(numeroAberto) ? (comparacaoDe(abertoIdx)?.total ?? 0) : null;
  const sobrescreveAberto = abertoIdx >= 0 && !descartados.has(abertoIdx) && numeroAberto != null && ["substitui", "move"].includes(classificar(numeroAberto));

  // ---- DUPLICADOS do DFD aberto: a comparação lado a lado (aberto × cada duplicado, a régua do reenvio) e a
  // ESCOLHA de qual fica. O duplicado ainda não lido (além do teto da análise) é lido ao abrir a comparação.
  const dupsAberto = abertoIdx >= 0 ? dupDe(abertoIdx) : [];
  const verDuplicados = painel?.tipo === "duplicados" && abertoIdx >= 0;
  // biome-ignore lint/correctness/useExhaustiveDependencies: reage à abertura da comparação (o resto é lido na hora).
  useEffect(() => {
    if (!verDuplicados) return;
    for (const j of dupsAberto) {
      // A análise em andamento chega nele (não lê duas vezes); além do teto, lê agora.
      if (parsed.has(j) || errosParse.has(j) || (analise?.fase === "texto" && j < CAP_ANALISE)) continue;
      garantirParse(j).catch((e) => setErrosParse((m) => new Map(m).set(j, e instanceof Error ? e.message : "Falha ao ler o DFD.")));
    }
  }, [verDuplicados, abertoIdx, dupsAberto.join(",")]);
  const paginasDe = (i: number): string | null => {
    const pgs = index?.dfds[i]?.pages ?? [];
    if (pgs.length === 0) return null;
    const [a, b] = [Math.min(...pgs), Math.max(...pgs)];
    return a === b ? `pág. ${a} do PDF` : `págs. ${a}–${b} do PDF`;
  };
  const resumoDup = (i: number) => {
    const d = parsed.get(i);
    const plan = d?.planejamento ?? null;
    return {
      rotulo: `DFD ${index?.dfds[i]?.numero ?? ""}${plan ? ` · Planej. ${plan}` : ""}`,
      local: paginasDe(i),
      itens: d ? d.itens.length : null,
      valor: d ? (d.valorTotal ?? 0) : null,
      descartado: descartados.has(i),
    };
  };
  // Comparação do aberto × cada duplicado — cache por PAR de DFDs (objetos do cache de parse): recalculada só quando
  // um dos dois muda (edição), a unidade ou o ano — não a cada atualização da análise.
  // biome-ignore lint/correctness/useExhaustiveDependencies: as dependências INVALIDAM o cache (cadastros novos ⇒ recomparar).
  const cacheDup = useMemo(() => new WeakMap<DfdParseado, WeakMap<DfdParseado, { k: string; c: ComparacaoDfd }>>(), [reparticoes]);
  const comparacaoDup = (i: number, j: number): ComparacaoDfd | null => {
    const a = parsed.get(i);
    const b = parsed.get(j);
    if (!a || !b) return null;
    const k = `${dfdRepIds[i] ?? ""}|${dfdRepIds[j] ?? ""}|${anoPca}`;
    let porB = cacheDup.get(a);
    if (!porB) {
      porB = new WeakMap();
      cacheDup.set(a, porB);
    }
    const hit = porB.get(b);
    if (hit && hit.k === k) return hit.c;
    const c = compararDuplicados({ ...a, reparticaoId: dfdRepIds[i] ?? null, anoPca }, { ...b, reparticaoId: dfdRepIds[j] ?? null, anoPca }, rotuloUnidade);
    porB.set(b, { k, c });
    return c;
  };
  const painelDuplicados =
    verDuplicados && dupsAberto.length > 0 ? (
      <ComparacaoDuplicados
        key={abertoIdx}
        atual={resumoDup(abertoIdx)}
        outros={dupsAberto.map((j) => ({
          ...resumoDup(j),
          key: j,
          motivo: motivoDuplicidade(
            { numero: index?.dfds[abertoIdx]?.numero ?? null, planejamento: parsed.get(abertoIdx)?.planejamento ?? null },
            { numero: index?.dfds[j]?.numero ?? null, planejamento: parsed.get(j)?.planejamento ?? null },
          ),
          pendente: dupPendente(j),
          comparacao: comparacaoDup(abertoIdx, j),
          erro: errosParse.get(j) ?? null,
        }))}
        pendente={dupPendente(abertoIdx)}
        onManter={(k) => manterDfd(k ?? abertoIdx)}
        onAbrir={(k) => void abrir(k)}
        bloqueado={importando}
      />
    ) : null;

  function setRepDfd(idx: number, id: number | null) {
    setDfdRepIds((arr) => arr.map((x, i) => (i === idx ? id : x)));
    setEditados((s) => new Set(s).add(idx));
  }

  /** Garante o DFD parseado+normalizado no cache (uso: abrir/edição em massa). */
  async function garantirParse(idx: number): Promise<DfdParseado | null> {
    const doc = docRef.current;
    const di = index?.dfds[idx];
    if (!doc || !di) return null;
    const cached = parsedRef.current.get(idx);
    if (cached) return cached;
    const emCurso = parseEmCursoRef.current.get(idx);
    if (emCurso) return emCurso; // a MESMA leitura (não lê duas vezes)
    const leitura = (async () => {
      const raw = await parseDfdDoProtocolo(doc, di, nomeArq);
      if (docRef.current !== doc) return null;
      const jaNoCache = parsedRef.current.get(idx); // a análise chegou antes — vale o que está no cache
      if (jaNoCache) return jaNoCache;
      const { dfd, auto } = prepararDfd(idx, raw, anoPca);
      guardarArquivo(idx, dfd);
      setParsed((m) => (m.has(idx) ? m : new Map(m).set(idx, dfd)));
      setAutoMap((m) => (m.has(idx) ? m : new Map(m).set(idx, auto)));
      // Uma falha anterior de leitura (ex.: transitória na análise) deixa de valer.
      setErrosParse((m) => {
        if (!m.has(idx)) return m;
        const n = new Map(m);
        n.delete(idx);
        return n;
      });
      refinarUnidade(idx, dfd); // prevê a unidade pela assinatura (só preenche se vazia)
      return dfd;
    })();
    parseEmCursoRef.current.set(idx, leitura);
    try {
      return await leitura;
    } finally {
      if (parseEmCursoRef.current.get(idx) === leitura) parseEmCursoRef.current.delete(idx);
    }
  }

  /** Assinatura ACHATADA — se o DFD ficou sem assinatura NOMEADA de texto e o OCR ainda não foi
   * tentado, tenta UMA vez e MESCLA no parse cacheado (preserva edições). Best-effort. */
  async function mesclarOcrSePreciso(idx: number, d: DfdParseado | null): Promise<void> {
    const doc = docRef.current;
    const di = index?.dfds[idx];
    if (!doc || !di || !d || !precisaOcr(d.assinaturas) || ocrTentadoRef.current.has(idx)) return;
    ocrTentadoRef.current.add(idx);
    const ocr = await ocrAssinaturasEmPaginas(doc, di.pages);
    if (docRef.current !== doc) return; // outro PDF foi aberto no meio da leitura — o resultado não é dele
    const local = comOcr(d, ocr);
    anotarHerdados(idx, local.herdados);
    if (local.dfd.assinaturas !== d.assinaturas) {
      lerOcrNoArquivo(idx, ocr);
      setParsed((m) => {
        const cur = m.get(idx);
        return cur ? new Map(m).set(idx, comOcr(cur, ocr).dfd) : m;
      });
      refinarUnidade(idx, local.dfd);
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
    // O DFD duplicado não tem lugar no DFD: a mensagem abre a comparação dos duplicados.
    if (m.ancora === "duplicados") return setPainel({ tipo: "duplicados" });
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
    // REENVIO: confirma a sobrescrita com o resumo do que muda (o que é igual não é regravado).
    const aExcluir = removidos.filter((r) => r.excluir);
    const resumoReenvio = reenvio
      ? `${contagemReenvio.novos} novo(s), ${contagemReenvio.alterados} alterado(s), ${contagemReenvio.iguais} sem diferença` +
        `${contagemReenvio.analisando > 0 ? `, ${contagemReenvio.analisando} ainda a comparar` : ""}` +
        `${capaDiffs.length > 0 ? `, ${capaDiffs.length} campo(s) da capa` : ""}` +
        `${removidos.length > 0 ? `; fora do PDF: ${aExcluir.length} excluído(s), ${removidos.length - aExcluir.length} mantido(s)` : ""}`
      : "";
    // O que NÃO segue (o ADM deixou protocolar assim) — quem protocola vê a lista ANTES e decide: DFDs com erro (não
    // são gravados) e duplicados sem escolha (do mesmo nº de DFD só o 1º gravável segue).
    const nums = (l: LinhaDfd[]) => {
      const ns = l.map((x) => x.numero);
      return ns.length > 12 ? `${ns.slice(0, 12).join(", ")} e mais ${ns.length - 12}` : ns.join(", ");
    };
    // Duplicados sem escolha: do MESMO nº de DFD só um é gravado; do mesmo planejamento (nº diferentes) vão todos.
    const dupSemEscolha = linhasDfd.filter((l) => dupPendente(l.key));
    const mesmoNumeroPendente = (i: number) => dupDe(i).some((j) => !descartados.has(j) && mesmoNumero(i, j));
    const dupNumero = dupSemEscolha.filter((l) => mesmoNumeroPendente(l.key));
    const dupPlanejamento = dupSemEscolha.filter((l) => !mesmoNumeroPendente(l.key));
    const avisos = [
      linhasErro.length > 0 ? `${linhasErro.length} DFD(s) com erro NÃO serão protocolados: ${nums(linhasErro)}.` : "",
      dupNumero.length > 0 ? `${dupNumero.length} DFD(s) com o MESMO nº sem escolha (${nums(dupNumero)}) — de cada nº só um é gravado.` : "",
      dupPlanejamento.length > 0
        ? `${dupPlanejamento.length} DFD(s) com o mesmo nº de planejamento sem escolha (${nums(dupPlanejamento)}) — serão gravados todos.`
        : "",
    ]
      .filter(Boolean)
      .join("\n");
    if (
      reenvio &&
      !confirm(
        `Sobrescrever o protocolo ${numero} com o PDF reenviado?\n\n${resumoReenvio}.\n\n` +
          `${aExcluir.length > 0 ? `ATENÇÃO: ${aExcluir.length} DFD(s) gravado(s) serão EXCLUÍDOS (com os itens).\n` : ""}` +
          `${avisos ? `${avisos}\n` : ""}Esta ação regrava os dados no banco.`,
      )
    )
      return;
    if (!reenvio && avisos && !confirm(`${avisos}\n\nProtocolar os demais DFDs?`)) return;
    setImportando(true);
    setErro(null);
    setRelatorio(null);
    try {
      const res = await fetch("/api/protocolo", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mode: "start-protocolo",
          ...(reenvio ? { reenvio: { protocoloId: reenvio.protocolo.id, resumo: resumoReenvio.slice(0, 500) } } : {}),
          protocolo: {
            // Reenvio: o nº EXATAMENTE como gravado e o Id gravado quando o PDF não traz (nunca apaga o Id).
            numero: reenvio ? reenvio.protocolo.numero : numero,
            idExterno: extra.idExterno || (reenvio?.protocolo.idExterno ?? null),
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
      let iguais = 0;
      let excluidos = 0;
      // Nºs de DFD já GRAVADOS (ou mantidos sem diferença) nesta protocolação: um 2º DFD com o MESMO nº (duplicado sem
      // escolha — o ADM não bloqueia) nunca sobrescreve o 1º em silêncio.
      const numerosGravados = new Set<string>();
      for (let i = 0; i < dfds.length; i++) {
        if (descartados.has(i)) continue; // DFD descartado (duplicado / "manter o existente") — não protocola
        const di = dfds[i];
        if (numerosGravados.has(chaveDfd(di.numero))) {
          bloqueados.push({
            numero: di.numero,
            motivo: "Outro DFD com o MESMO nº já foi gravado nesta protocolação (duplicado no processo, sem escolha) — compare os duplicados e escolha qual fica.",
          });
          continue;
        }
        // Mesmo nº numa unidade SEM ACESSO: o servidor recusaria (anti-sequestro) — nem lê (no REENVIO, o
        // gravado sem diferença é pulado abaixo, como os demais).
        if (classificar(di.numero) === "semAcesso" && !gravadoDe(di.numero)) {
          bloqueados.push({ numero: di.numero, motivo: MSG_SEM_ACESSO.texto });
          continue;
        }
        setProgresso({ feito: i, total: dfds.length, label: `DFD ${di.numero} (${i + 1}/${dfds.length})` });
        // Usa a cópia EDITADA do cache; senão parseia local (streaming, sem acumular).
        let full = parsed.get(i) ?? null;
        if (!full) {
          if (!doc) break;
          try {
            full = prepararDfd(i, await parseDfdDoProtocolo(doc, di, nomeArq), anoPca).dfd;
          } catch (e) {
            bloqueados.push({ numero: di.numero, motivo: e instanceof Error ? e.message : "falha ao ler o DFD" });
            continue;
          }
        }
        // Assinatura achatada de um DFD além do teto da análise: tenta o OCR (uma vez) e mescla.
        if (precisaOcr(full.assinaturas) && !ocrTentadoRef.current.has(i) && doc) {
          ocrTentadoRef.current.add(i);
          setProgresso({ feito: i, total: dfds.length, label: `DFD ${di.numero} — lendo assinatura…` });
          let ocr: Assinatura[] = [];
          try {
            ocr = await ocrAssinaturasEmPaginas(doc, di.pages);
          } catch {
            /* OCR é auxiliar — segue sem assinatura (a conferência decide) */
          }
          lerOcrNoArquivo(i, ocr); // a base da escolha acompanha a leitura (o histórico não acusa "Assinaturas")
          full = comOcr(full, ocr).dfd; // + a validação herdada do gravado (reenvio)
        }
        // REENVIO: DFD sem NENHUMA diferença em relação ao gravado não é regravado (fica como está).
        const gravado = gravadoDe(di.numero);
        if (
          gravado &&
          !editados.has(i) &&
          compararDfd(comparavelGravado(gravado), { ...full, reparticaoId: dfdRepIds[i] ?? null, anoPca }).situacao === "igual"
        ) {
          iguais++;
          numerosGravados.add(chaveDfd(di.numero));
          setProgresso({ feito: i + 1, total: dfds.length, label: `DFD ${di.numero} (${i + 1}/${dfds.length}) — sem diferença` });
          continue;
        }
        // REENVIO: o gravado de unidade SEM ACESSO que mudou não pode ser regravado daqui.
        if (classificar(di.numero) === "semAcesso") {
          bloqueados.push({ numero: di.numero, motivo: MSG_SEM_ACESSO.texto });
          continue;
        }
        // MESMA conferência da tabela (fonte única, com o catálogo quando ele bloqueia): DFD com erro nunca é protocolado.
        const conf = avaliarLinhaDfd(full, repDe(dfdRepIds[i]), { anoPca, regras, categoria, orgaos, conformidade: confDe(i, full).conf });
        if (conf.estado === "erro") {
          bloqueados.push({
            numero: di.numero,
            motivo: conf.mensagens.filter((m) => m.status === "erro").map((m) => m.texto).join(" "),
          });
          continue;
        }
        // SOBRESCRITA com escolha por dado: o que foi MANTIDO do gravado / EDITADO antes de gravar → histórico.
        const gB = gravadoBase(di.numero);
        const arq = arquivosRef.current.get(i);
        let escolhas: ReturnType<typeof escolhasParaHistorico> = null;
        if (gB && arq) {
          const gP = detalheParaParseado(gB);
          escolhas = escolhasParaHistorico(resumoEscolhas(entradasEscolha(comparacaoEscolha(gP, arq)), full, gP, arq));
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
              origem: reenvio ? "reenvio" : "protocolacao", // histórico: por onde o DFD foi gravado
              ...(escolhas ? { escolhas } : {}),
            },
            semMarcas(full).itens, // a marca de origem dos itens é só da tela
            undefined,
            { existia: classificar(di.numero) !== "novo" },
          );
          importados++;
          numerosGravados.add(chaveDfd(di.numero));
        } catch (e) {
          bloqueados.push({ numero: di.numero, motivo: e instanceof Error ? e.message : "falha ao gravar" });
        }
        setProgresso({ feito: i + 1, total: dfds.length, label: `DFD ${di.numero} (${i + 1}/${dfds.length})` });
      }
      // REENVIO: exclui os DFDs gravados que não vieram no PDF (os que o usuário não decidiu manter).
      for (let k = 0; k < aExcluir.length; k++) {
        const r = aExcluir[k];
        setProgresso({ feito: k, total: aExcluir.length, label: `excluindo DFD ${r.numero} (${k + 1}/${aExcluir.length})` });
        try {
          const del = await fetch(`/api/dfd/${r.id}?origem=reenvio`, { method: "DELETE" });
          const dj = (await del.json().catch(() => ({}))) as { ok?: boolean; error?: string };
          if (!del.ok || !dj.ok) throw new Error(dj.error ?? `HTTP ${del.status}`);
          excluidos++;
        } catch (e) {
          bloqueados.push({ numero: r.numero, motivo: `não foi possível excluir (${e instanceof Error ? e.message : "falha"})` });
        }
      }
      setRelatorio({ numero, importados, bloqueados, ...(reenvio ? { iguais, excluidos } : {}) });
      fechar();
      router.refresh();
      onConcluido?.();
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Erro ao protocolar.");
    } finally {
      setImportando(false);
      setProgresso(null);
    }
  }

  // ---- Relatório de erros do protocolo em DESPACHO (copiável): pendências CIRÚRGICAS por DFD + capa.
  const ERRO_EXTRA = new Set(["protocolo.dfdDuplicado", "dfd.orgao", "dfd.orgaoUnidadeDivergente", MSG_SEM_ACESSO.chave]);
  const faltasDoDfd = (idx: number): string[] => {
    const parseErr = errosParse.get(idx);
    if (parseErr) return [`Leitura incompleta da tabela de itens (${parseErr}). Reenviar o DFD com a tabela completa.`];
    const d = parsed.get(idx);
    if (!d) return ["DFD ainda em análise — reabrir para conferir."];
    const resAss = conferirAssinaturaDfd(d, repDe(dfdRepIds[idx]));
    const cirurgicas = faltasCirurgicasDfd(
      { planejamento: d.planejamento, itens: d.itens, secoes: d.secoes, reparticaoId: dfdRepIds[idx], assinaturaMotivo: resAss.status === "erro" ? resAss.motivo : null, tipo: d.tipo, anoPca },
      regras,
      { categoria, conformidade: confDe(idx, d).conf },
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
  const statusTexto = (() => {
    if (erroExistentes) return `${erroExistentes} Feche e abra o PDF de novo.`;
    if (existentesPendentes) return "Conferindo os DFDs já cadastrados…";
    if (catPendentes > 0) return `Conferindo os itens no catálogo — ${catPendentes} DFD(s)…`;
    if (protocolarDesligado) return "Protocolação desabilitada nas Configurações";
    if (!numero.trim()) return "Informe o número do processo para protocolar";
    if (!gateTrava.ok) return gateTrava.motivos.join(" ");
    if (anoPcaBloqueia) return "Defina o PCA do processo para protocolar";
    if (repBloqueia) return "Defina a unidade do processo para protocolar";
    if (!temDfds) return "Sem DFDs — cria só o protocolo.";
    if (semErroBloqueia) return `${dfdsComErro} DFD(s) com erro`;
    if (conc.bloqueia) return "Valor da capa diverge da somatória — substitua para liberar";
    if (dupBloqueia) return 'DFD duplicado — abra o DFD e use "Duplicados" para comparar e escolher qual fica';
    const situacao =
      dfdsComErro > 0 ? `${dfdsComErro} com erro — não serão protocolados` : temAtencao ? `${linhasAtencao.length} em atenção` : "tudo certo";
    const cat = catFalhas > 0 ? ` · catálogo não conferido em ${catFalhas} (rede) — o servidor confere ao gravar` : "";
    return `${totalDfds} DFD(s) · ${semRep} sem unidade · ${situacao}${cat}`;
  })();
  const pctAnalise = analise && analise.total > 0 ? Math.round((analise.feito / analise.total) * 100) : 0;
  const numeroAtual = analise?.atual != null ? (index?.dfds[analise.atual]?.numero ?? "") : "";
  const rotuloAnalise = !analise
    ? ""
    : analise.fase === "texto"
      ? `Analisando DFD ${numeroAtual} (${analise.feito + 1} de ${analise.total})…`
      : `Lendo assinatura por OCR — DFD ${numeroAtual} (${analise.feito + 1} de ${analise.total})…`;
  // Estado do DFD ABERTO no rodapé = a MESMA régua do painel ao lado (mensagens completas, incl. catálogo, ano do
  // PCA e o duplicado pendente); descartado segue "Descartado".
  const estadoAberto =
    abertoIdx < 0 || !dfdAberto
      ? null
      : descartados.has(abertoIdx)
        ? "descartado"
        : estadoDeMensagens(mensagensAberto, { auto: (autoMap.get(abertoIdx)?.length ?? 0) > 0, editado: editados.has(abertoIdx) });

  // Leitura do PDF (índice), falha e resultado: na IMPORTAÇÃO viram AVISOS FLUTUANTES (canto inferior — não
  // deformam a tabela da Mesa); no REENVIO ficam dentro do próprio lançador/modal.
  const progressoLeitura = leitura && (
    <div className="mt-2">
      <Progress value={(leitura.pagina / Math.max(1, leitura.total)) * 100} label={`Página ${num(leitura.pagina)} de ${num(leitura.total)}`} />
    </div>
  );
  const tituloFalha = reenvio ? "Não foi possível reenviar este PDF" : "Não foi possível ler o protocolo";
  const tituloLendo = "Lendo o protocolo e identificando os DFDs…";
  const avisoLeitura = reenvio ? (
    <>
      {erro && status === "error" && (
        <Callout kind="danger" icon={<IconAlert className="h-5 w-5" />} className="mt-4">
          <p className="font-semibold">{tituloFalha}</p>
          <p className="opacity-90">{erro}</p>
        </Callout>
      )}
      {status === "parsing" && (
        <Callout kind="info" icon={<IconSpinner className="h-5 w-5" />} className="mt-4">
          <p className="font-semibold">{tituloLendo}</p>
          {progressoLeitura}
        </Callout>
      )}
    </>
  ) : (
    <>
      {erro && status === "error" && (
        <AvisoFlutuante
          kind="danger"
          titulo={tituloFalha}
          onClose={() => {
            setErro(null);
            setStatus("idle");
          }}
        >
          {erro}
        </AvisoFlutuante>
      )}
      {status === "parsing" && (
        <AvisoFlutuante kind="info" carregando titulo={tituloLendo}>
          {progressoLeitura}
        </AvisoFlutuante>
      )}
    </>
  );
  // Resultado da protocolação/sobrescrita (importados, bloqueados; no reenvio: sem diferença e excluídos).
  const kindResultado = relatorio && relatorio.bloqueados.length > 0 ? "warn" : "ok";
  const tituloResultado = relatorio ? `Protocolo ${relatorio.numero} ${reenvio ? "sobrescrito" : "salvo"}!` : "";
  const corpoResultado = relatorio && (
    <>
      <p>
        {num(relatorio.importados)} DFD{relatorio.importados === 1 ? "" : "s"} {reenvio ? "regravado" : "protocolado"}
        {relatorio.importados === 1 ? "" : "s"}
        {relatorio.iguais != null ? ` · ${num(relatorio.iguais)} sem diferença (mantido${relatorio.iguais === 1 ? "" : "s"})` : ""}
        {relatorio.excluidos != null && relatorio.excluidos > 0 ? ` · ${num(relatorio.excluidos)} excluído(s) (fora do PDF)` : ""}
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
    </>
  );
  const resultado =
    relatorio &&
    (reenvio ? (
      <Callout kind={kindResultado} icon={<IconCheck className="h-5 w-5" />}>
        <p className="font-semibold">{tituloResultado}</p>
        <div className="opacity-90">{corpoResultado}</div>
      </Callout>
    ) : (
      <AvisoFlutuante
        kind={kindResultado}
        titulo={tituloResultado}
        onClose={() => setRelatorio(null)}
        duracao={relatorio.bloqueados.length > 0 ? undefined : 10000}
      >
        {corpoResultado}
      </AvisoFlutuante>
    ));

  // Nada no fluxo da página: o BOTÃO fica no host; lançador, análise e avisos são modais/avisos flutuantes.
  return (
    <>
      {/* IMPORTAÇÃO: leitura/erro/resultado em avisos flutuantes. No REENVIO aparecem no próprio lançador. */}
      {!reenvio && (
        <>
          {avisoLeitura}
          {resultado}
        </>
      )}

      {/* REENVIO: lançador SÓ do PDF (o mesmo protocolo) + leitura/erro dentro dele. */}
      {reenvio && (
        <Modal
          open={launcher}
          onClose={() => status !== "parsing" && setLauncher(false)}
          titulo={`Reenviar o protocolo ${reenvio.protocolo.numero}`}
          size="lg"
          bloqueado={status === "parsing"}
        >
          <Dropzone
            accept=".pdf"
            onFile={(f) => handleFile(f)}
            titulo="Soltar o PDF corrigido do protocolo"
            icon={<IconRefresh className="h-7 w-7" />}
            dica={`Só o MESMO protocolo (nº ${reenvio.protocolo.numero}${reenvio.protocolo.idExterno ? ` · Id ${reenvio.protocolo.idExterno}` : ""}). Você compara, ajusta e só então sobrescreve.`}
          />
          {avisoLeitura}
        </Modal>
      )}
      {/* REENVIO concluído: o resumo (o banner do gravado recarrega por baixo). */}
      {reenvio && (
        <Modal open={!!relatorio} onClose={() => setRelatorio(null)} titulo="Reenvio concluído" size="md">
          {resultado}
        </Modal>
      )}

      {/* Lançador de importação — banner dividido ao meio: soltar/escolher | criar manual */}
      <Modal open={launcher && !reenvio} onClose={() => setLauncher(false)} titulo="Importar protocolo" size="xl">
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
        titulo={reenvio ? `Reenvio — Protocolo ${numero}` : numero ? `Protocolo ${numero}` : "Novo protocolo"}
        cabecalho={<ProtocoloCabecalho numero={numero || "novo"} idExterno={extra.idExterno} assunto={assunto || null} reenvio={!!reenvio} />}
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
                      sobrescrita={sobrescreveAberto}
                    />
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
                          {/* DFD duplicado: COMPARAR com os duplicados (painel da direita) e manter ESTE (descarta os que
                              conflitam com ele) — ou restaurar o descartado. */}
                          {descartados.has(abertoIdx) && (
                            <Button variant="secondary" onClick={() => restaurarDfd(abertoIdx)} disabled={importando}>
                              Restaurar
                            </Button>
                          )}
                          {dupsAberto.length > 0 && (
                            <Button
                              variant="secondary"
                              icon={<IconCompare className="h-4 w-4" />}
                              onClick={() => setPainel((p) => (p?.tipo === "duplicados" ? null : { tipo: "duplicados" }))}
                            >
                              Duplicados ({num(dupsAberto.length)})
                            </Button>
                          )}
                          {dupPendente(abertoIdx) && (
                            <Button onClick={() => manterDfd(abertoIdx)} disabled={importando}>
                              Manter este DFD
                            </Button>
                          )}
                          {/* Conflito com um DFD já cadastrado: manter o EXISTENTE = descartar este do envio. */}
                          {!descartados.has(abertoIdx) && !dupPendente(abertoIdx) && conflitaComExistente(abertoIdx) && (
                            <Button variant="secondary" onClick={() => descartarDfd(abertoIdx)} disabled={importando}>
                              {gravadoDe(index?.dfds[abertoIdx]?.numero) ? "Manter o gravado" : "Manter o existente"}
                            </Button>
                          )}
                          {/* SOBRESCRITA (reenvio ou DFD já cadastrado): as diferenças em relação ao gravado, com a
                              ESCOLHA por dado (manter o gravado × usar o novo) no painel da direita. */}
                          {difAberto != null && (
                            <Button
                              variant="secondary"
                              onClick={() => setPainel((p) => (p?.tipo === "diferencas" ? null : { tipo: "diferencas" }))}
                            >
                              Diferenças ({num(difAberto)})
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
                    onUnificarItens={(k, outros) => editarAberto((d) => unificarItensDfd(d, k, outros))}
                    onPainel={setPainel}
                    categoria={categoria}
                    comparacao={sob?.comparacao ?? (abertoIdx >= 0 ? comparacaoDe(abertoIdx) : null)}
                    herdados={abertoIdx >= 0 ? herdados.get(abertoIdx) : undefined}
                    escolha={sob?.escolha ?? null}
                    duplicados={painelDuplicados}
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
              <BarraSelecaoDfds
                dfds={linhasSel.map((l) => ({ key: l.key, numero: l.numero, planejamento: l.planejamento, valor: l.valor, itens: l.itens }))}
                onRemover={(k) => setSel((s) => new Set([...s].filter((x) => x !== k)))}
                onLimpar={() => setSel(new Set())}
                bloqueada={aplicandoMassa}
              >
                <BarraEdicaoMassa reparticoes={reparticoes} anoPadrao={anoPca} regras={regras} aplicando={aplicandoMassa} onAplicar={aplicarMassa} />
              </BarraSelecaoDfds>
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
                <span className="text-[12px]" style={{ color: bloqueadoPorRegra || !numero.trim() || erroExistentes ? "var(--danger)" : "var(--muted)" }}>
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
                {reenvio ? (
                  <Button onClick={protocolar} loading={importando} disabled={!podeProtocolar} icon={<IconRefresh className="h-[18px] w-[18px]" />}>
                    Sobrescrever protocolo
                  </Button>
                ) : (
                  <Button onClick={protocolar} loading={importando} disabled={!podeProtocolar} icon={<IconUpload className="h-[18px] w-[18px]" />}>
                    Protocolar
                  </Button>
                )}
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
            dfds: totalVivos,
            itens: itensDfds,
            somatorio: somatorioDfds,
            dica: analisando ? "analisando…" : !completo ? `parcial — ${num(lidos)} de ${num(ativos.length)} DFDs lidos` : undefined,
            sobrescritos: rastroMantido.length > 0 ? { qtd: rastroMantido.length, valor: valorRastro } : undefined,
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
          sobrescritos={rastroMantido}
          vazio={
            <Callout kind="info">
              Nenhum DFD detectado. O protocolo será criado vazio — adicione DFDs depois (aba DFDs) ou vincule existentes.
            </Callout>
          }
          topo={
            reenvio ? (
              <ComparacaoProtocolo
                contagem={contagemReenvio}
                capa={capaDiffs}
                removidos={removidos}
                bloqueado={importando}
                onRemovidoChange={(id, excluir) =>
                  setRemovidosManter((s) => {
                    const n = new Set(s);
                    if (excluir) n.delete(id);
                    else n.add(id);
                    return n;
                  })
                }
                onTodosRemovidos={(excluir) => setRemovidosManter(excluir ? new Set() : new Set(removidos.map((r) => r.id)))}
                onRelatorio={() => setRelDiffAberto(true)}
              />
            ) : undefined
          }
        />
      </Modal>

      {/* REENVIO: relatório de DIFERENÇAS (copiável) — capa, DFDs alterados campo a campo, itens e removidos. */}
      {reenvio && (
        <RelatorioErros
          open={relDiffAberto}
          onClose={() => setRelDiffAberto(false)}
          titulo={`Diferenças — reenvio do protocolo ${numero}`}
          linhas={relatorioDiffLinhas}
        />
      )}

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
    </>
  );
}
