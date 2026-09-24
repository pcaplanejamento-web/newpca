"use client";

import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import { type ReactNode, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { classificarAssunto, comportamentoNo, corImportancia, nivelDe, type RegrasAvaliacao, regrasPadrao } from "@/lib/avaliacao-core";
import { avaliarProtocolo } from "@/lib/conferencia-dfd";
import type { DfdResumo, ItemDfdRow, PcaResumo } from "@/lib/dfd";
import {
  type AcaoMassa,
  ESTADO_ITEM_ROTULO,
  ESTADO_PROTOCOLO_ROTULO,
  type EstadoDfd,
  type EstadoProtocolo,
  estadoItem,
  estadoItemCor,
  estadoProtocoloCor,
  mensagensItem,
  repetidosPorDfd,
  type ResumoEstado,
  resumoEstado,
  rotuloVeredictoCatalogo,
  veredictoLinhaCatalogo,
} from "@/lib/dfd-tratamento";
import { brl, dataHoraBR, dataIsoBrasilia, dicaLista, juntarParaCopiar, num, numeroSemAno, pct } from "@/lib/format";
import { consolidarItens, distintos, estadoConsolidado, type ItemConsolidado } from "@/lib/itens-consolidados";
import type { DfdPainel, EstadoPainel, ProtocoloPainel } from "@/lib/mesa-dashboard";
import { FILTRO_MESA_TODOS, type FiltroMesa, filtroMesaAtivo, opcoesAssuntoMesa, passaFiltroMesa } from "@/lib/mesa-filtros";
import { normalizarCodigo } from "@/lib/parse-catalogo-comum";
import {
  chaveUnidade,
  criarClassificador,
  NAO_CADASTRADA,
  NAO_CLASSIFICADO,
  type Padronizacao,
  type ResultadoClassificacao,
  resolverUnidades,
  type UnidadeMedida,
} from "@/lib/padronizacao-core";
import { planejamentoDfd, tipoCurtoDfd } from "@/lib/parse-dfd-comum";
import { aplicarFiltros, type ColunaDados } from "@/lib/tabela-filtros";
import { estaTravado, motivoNaoExcluirDfd, motivoNaoExcluirProtocolo } from "@/lib/pca-core";
import type { AcaoMassaProtocolo } from "@/lib/dfd-validation";
import { type AcaoMassaItem, descreverAcaoItem, fatiarItensPorDfd, resumirFalhas, resumirFalhasItens } from "@/lib/massa-itens";
import type { ProtocoloResumo } from "@/lib/protocolo";
import type { Responsaveis } from "@/lib/reparticao-responsaveis";
import type { SituacaoCadastrada } from "@/lib/situacoes";
import { nomeExibicao, type Pessoa, rotuloOpcaoPessoa } from "@/lib/pessoa";
import { BarraEdicaoMassa, BarraEdicaoMassaItens, BarraEdicaoMassaProtocolos } from "./BarraEdicaoMassa";
import { Avatar } from "./Avatar";
import { AvisoFlutuante } from "./AvisoFlutuante";
import { type AberturaMesa, BannersMesa } from "./BannersMesa";
import { BarraSelecao, BarraSelecaoDfds, ResumoSelecao } from "./BarraSelecao";
import { CelulaCopiavel } from "./BotaoCopiar";
import { Button } from "./Button";
import { CelulaLista, MaisN } from "./CelulaLista";
import { CelulaVariacao, ComposicaoItem, SeloAbc } from "./ComposicaoItem";
import { type Column, DataTable } from "./DataTable";
import { DfdUploadForm } from "./DfdUploadForm";
import { EnviarAoPca } from "./EnviarAoPca";
import { tokenPx } from "./espacamento";
import { DashboardMesaEsqueleto } from "./DashboardMesaEsqueleto";
import { CelulaCatalogo, CelulaClassificacao, CelulaUnidadeCadastrada, EstadoPonto, EstadoProcessando, EstadoResumo } from "./EstadoCelula";
import { labelCls } from "./formStyles";
import { IconAlert, IconDashboard, IconFilter, IconLayers, IconTrash, IconUpload, IconUser, IconUserX } from "./icons";
import { Modal } from "./Modal";
import { PessoaTag } from "./PessoaTag";
import { CelulaPca, CelulaPrioridade, colunaPlanejamento, colunaTipoDfd, type LinhaDfd, type PcaDaLinha, PlanilhaDfds } from "./PlanilhaDfds";
import { Progress } from "./Progress";
import { ProtocoloUploadForm } from "./ProtocoloUploadForm";
import { Segmented } from "./Segmented";
import { type OpcaoBusca, SeletorBusca } from "./SeletorBusca";
import { SeletorCelula } from "./SeletorCelula";
import { SeletorFiltro } from "./SeletorFiltro";
import { toast } from "./Toast";

/** O Dashboard de governança só é baixado quando o ícone dele é aberto (fora do carregamento da Mesa); até lá, o
 * esqueleto da MESMA grade. */
const DashboardMesa = dynamic(() => import("./DashboardMesa").then((m) => m.DashboardMesa), {
  ssr: false,
  loading: DashboardMesaEsqueleto,
});

type Rep = {
  id: number;
  codigo: string;
  nome: string;
  numeroInteressado?: string | null;
  setorRequisitante?: string | null;
  orgaoId?: number | null;
  orgaoProprio?: boolean | null;
  oculto?: boolean | null;
  responsaveis: Responsaveis;
};
type Orgao = { id: number; sigla: string; nome: string; orgaoEntidade: string | null; assinaturaUnica?: boolean | null };
/** Conferência de UMA linha de DFD (vinda de `/api/dfd/conferencia` — a MESMA da análise). */
type ConfLinha = { id: number; estado: EstadoDfd; resumo: ResumoEstado | null; validacao: "auto" | "equipe" | null };
/** Estado AGREGADO de um protocolo (vindo de `/api/protocolo/conferencia`): capa + problemas dos DFDs/itens. */
type ConfProto = { id: number; estado: EstadoProtocolo; resumo: ResumoEstado | null };
/** Campos de GESTÃO editados na célula (valem na hora, até a lista recarregar do servidor). */
type Gestao = { responsavelId?: number | null; situacaoId?: number | null };

/** Visão da tela Mesa: o MESMO espaço mostra o Dashboard de governança, Protocolos, DFDs ou a lista plana de Itens. */
type Vista = "dashboard" | "protocolos" | "dfds" | "itens";
/** Visão dos ITENS: Normal (um por linha) | Consolidada (um por CÓDIGO — quantidades somadas, valor médio ponderado). */
type ModoItens = "normal" | "consolidada";
/** DFDs conferidos por requisição (fatias — a lista abre leve e o Estado chega em seguida). */
const FATIA_CONFERENCIA = 150;
/** DFDs/protocolos por requisição da edição em massa (cabe folgado no limite de consultas por invocação do D1). */
const FATIA_MASSA = 20;
/** Itens por requisição da edição em massa: ≤ 100 itens de ≤ 5 DFDs (cada DFD grava num lote atômico). */
const FATIA_ITENS = 100;
const FATIA_ITENS_DFDS = 5;
type Sel = Set<string | number>;

/**
 * A Mesa DENTRO do PCA (aba Mesa do espaço do PCA): sem os lançadores de importação, com uma
 * ferramenta à direita das visões (ex.: Todos | Enviados | Incorporados), colunas extras nas tabelas de
 * protocolos/itens e as ações da seleção (protocolos: Incorporar / Devolver; itens: Retirar do PCA). As listas
 * já chegam restritas aos protocolos ENVIADOS ao PCA; os itens vêm do escopo do PCA (`?pca=`).
 */
export type ModoPcaMesa = {
  pcaId: number;
  ferramenta?: ReactNode;
  colunasProtocolo?: Column<ProtocoloResumo>[];
  /** As ÚNICAS ações da seleção de protocolos no PCA (sem o editor de massa). */
  acoesProtocolos?: (selecionados: ProtocoloResumo[], limpar: () => void) => ReactNode;
  rodapeProtocolos?: (linhas: ProtocoloResumo[]) => string;
  /** Colunas extras da visão Itens (ex.: o sequencial do item no PCA). */
  colunasItens?: Column<ItemDfdRow>[];
  /** Ações da seleção de itens (ex.: "Retirar do PCA"); o editor de massa só aparece com itens NÃO incorporados. */
  acoesItens?: (selecionados: ItemDfdRow[], limpar: () => void) => ReactNode;
};
/** Linha consolidada ainda sem as informações calculadas (nunca acontece com a lista montada — só por segurança). */
const SEM_INFO = {
  estado: { rotulo: "", cor: "var(--ok)", extraErros: 0, extraAtencoes: 0, titulo: "", rotulos: [] } as ResumoEstado,
  rotulosEstado: [] as string[],
  protocolos: [] as string[],
  pcas: [] as string[],
  dfds: [] as string[],
  siglas: [] as string[],
  prioridades: [] as string[],
  planejamentos: [] as string[],
  tipos: [] as string[],
  classificacoes: [] as string[],
  unidadesCad: [] as string[],
  seqsPca: [] as { texto: string; riscado: boolean }[],
  catalogoPior: null as ItemDfdRow | null,
  catalogoRotulo: "—",
};
/** O PCA (ano) de um DFD na Mesa: o do protocolo de origem; sem ele, o do próprio DFD (o item segue o DFD). */
const anoPcaDoDfd = (d: DfdResumo | undefined) => (d ? (d.protocoloAnoPca ?? d.anoPca) : null);
/** Mantém na seleção só as chaves que ainda existem (após recarregar as listas). */
const podar = (sel: Sel, validas: Set<number>): Sel => {
  const n = new Set([...sel].filter((k) => validas.has(Number(k))));
  return n.size === sel.size ? sel : n;
};
/** Chave da conferência de um DFD: muda quando o DFD é gravado (atualizadoEm), troca de unidade ou a
 * categoria do protocolo muda — só esses são reconferidos depois de um `router.refresh()`. */
const chaveConf = (d: DfdResumo) => `${d.id}|${d.atualizadoEm ?? ""}|${d.reparticaoId ?? ""}|${d.protocoloAssunto ?? ""}`;
/** Chave da conferência AGREGADA de um protocolo: SÓ o que muda o estado — a capa (valor e assunto),
 * QUALQUER DFD dele gravado e o rastro dos sobrescritos. Trocar responsável/situação não reconfere nada. */
const chaveProto = (p: ProtocoloResumo) =>
  `${p.id}|${p.dfdsAtualizadoEm ?? ""}|${p.totalDfds}|${p.valorTotal}|${p.sobrescritos}|${p.valorSobrescritos}|${p.valorCapa ?? ""}|${p.assunto ?? ""}`;
/** Protocolos por requisição da conferência agregada (e ~DFDs por fatia: `FATIA_CONFERENCIA`). */
const FATIA_PROTOCOLOS = 50;
/** Estado do protocolo cuja conferência dos DFDs falhou (neutro — nunca um "Regular" falso). */
const NAO_CONFERIDO = "Não conferido";
/** O valor de GESTÃO do protocolo `id` (o editado na célula, se houver; senão o do servidor). */
function valorGestao<K extends keyof Gestao>(g: Map<number, Gestao>, id: number | null, k: K, base: number | null): number | null {
  const v = id != null ? g.get(id)?.[k] : undefined;
  return v !== undefined ? v : base;
}

export function DfdsView({
  podeEditar,
  dfds,
  protocolos,
  reparticoes,
  reparticaoAtivaId,
  pcas = [],
  regras = regrasPadrao(),
  orgaos = [],
  pessoas = [],
  outrasPessoas = [],
  situacoes = [],
  usuarioId = null,
  filtroInicial = FILTRO_MESA_TODOS,
  pcaFiltro = null,
  modoPca,
}: {
  podeEditar: boolean;
  dfds: DfdResumo[];
  protocolos: ProtocoloResumo[];
  reparticoes: Rep[];
  reparticaoAtivaId: number | null;
  pcas?: PcaResumo[];
  regras?: RegrasAvaliacao;
  orgaos?: Orgao[];
  /** PESSOAS DO GRUPO ativo — as únicas designáveis como Responsável (célula, massa e o filtro do topo). */
  pessoas?: Pessoa[];
  /** Quem aparece nas colunas Responsável/Distribuição e NÃO é do grupo (outro grupo, inativo) — só exibição. */
  outrasPessoas?: Pessoa[];
  /** O usuário logado ("(eu)" nas opções). */
  usuarioId?: number | null;
  /** Situações cadastradas pelo ADM (Configurações → Situações) — as ÚNICAS da coluna Situação. */
  situacoes?: SituacaoCadastrada[];
  /** Filtro com que a Mesa ABRE (a preferência do Perfil: só os do usuário, geral ou sem responsável). */
  filtroInicial?: FiltroMesa;
  /** O PCA do CABEÇALHO que filtra a Mesa principal (as listas já chegam filtradas — e os itens, lazy, vêm pelo MESMO
   * ano; `null` = todos os PCAs). */
  pcaFiltro?: { nome: string; ano: number } | null;
  /** Mesa dentro do PCA (sem importação; ações de incorporar/devolver e retirar item). */
  modoPca?: ModoPcaMesa;
}) {
  const router = useRouter();
  const [erro, setErro] = useState<string | null>(null);
  // Banners do GRAVADO — os MESMOS componentes da análise (protocolo / DFD solto).
  const [aberto, setAberto] = useState<AberturaMesa | null>(null);
  const [vincAlvo, setVincAlvo] = useState<{ id: number; numero: string; protocoloId: number | null } | null>(null);
  const [vincSel, setVincSel] = useState<number | null>(null);
  const [salvandoVinc, setSalvandoVinc] = useState(false);
  // Opções do vínculo (seleção com BUSCA — com muitos protocolos o <select> era inviável): nº + Id · assunto ·
  // interessado · unidade, o protocolo ATUAL do DFD marcado.
  const opcoesVinculo = useMemo<OpcaoBusca[]>(
    () => [
      { valor: "", rotulo: "— Nenhum (desvincular) —", detalhe: vincAlvo?.protocoloId == null ? "atual" : "tira o DFD do protocolo" },
      ...protocolos.map((p) => ({
        valor: String(p.id),
        rotulo: p.numero,
        detalhe: [p.id === vincAlvo?.protocoloId ? "atual" : null, p.idExterno ? `Id ${p.idExterno}` : null, p.assunto, p.interessado, p.reparticaoCodigo]
          .filter(Boolean)
          .join(" · "),
      })),
    ],
    [protocolos, vincAlvo?.protocoloId],
  );
  // Seleção + edição EM MASSA nas três visões (a barra fica FIXA no rodapé do display; grava no banco).
  const [selDfds, setSelDfds] = useState<Sel>(new Set());
  const [selProtos, setSelProtos] = useState<Sel>(new Set());
  const [selItens, setSelItens] = useState<Sel>(new Set());
  const [aplicandoMassa, setAplicandoMassa] = useState<{ feito: number; total: number; rotulo: string } | null>(null);
  // IMPORTAÇÃO: cada clique no botão do rodapé da tabela abre o lançador do SEU formulário (os dois ficam montados
  // FORA da tabela — um contador para cada, senão um clique abriria os dois).
  const [abrirProto, setAbrirProto] = useState(0);
  const [abrirDfd, setAbrirDfd] = useState(0);
  // Altura da barra de seleção fixa — as tabelas (scroll interno) reservam esse espaço (+ o espaço entre os blocos
  // da tela, o token `--gap-block` das classes).
  const [alturaBarra, setAlturaBarra] = useState(0);
  const reserva = alturaBarra > 0 ? alturaBarra + tokenPx("--gap-block", 12) : 0;

  // FILTROS DE HIERARQUIA (acima das três visões): responsável e assunto do PROTOCOLO — o DFD e o item
  // seguem o do protocolo de origem; as colunas correspondentes da tabela de protocolos ficam travadas.
  const [filtro, setFiltro] = useState<FiltroMesa>(filtroInicial);
  // GESTÃO na célula (responsável/situação): vale na hora; a lista recarregada do servidor a substitui.
  const [gestao, setGestao] = useState<Map<number, Gestao>>(new Map());
  const [salvandoGestao, setSalvandoGestao] = useState<Set<string>>(new Set());
  const salvandoRef = useRef(salvandoGestao);
  salvandoRef.current = salvandoGestao;
  // A lista recarregada do servidor substitui o otimista — EXCETO o que ainda está gravando (outra célula
  // salva em paralelo): esse vale até a resposta dele.
  // biome-ignore lint/correctness/useExhaustiveDependencies: reage só à lista recarregada do servidor.
  useEffect(() => {
    setGestao((m) => {
      if (m.size === 0) return m;
      const n = new Map<number, Gestao>();
      for (const [id, g] of m) {
        const pendente: Gestao = {};
        for (const campo of Object.keys(g) as (keyof Gestao)[]) if (salvandoRef.current.has(`${id}:${campo}`)) pendente[campo] = g[campo];
        if (Object.keys(pendente).length > 0) n.set(id, pendente);
      }
      return n;
    });
  }, [protocolos]);
  const situacaoDe = (p: ProtocoloResumo) => valorGestao(gestao, p.id, "situacaoId", p.situacaoId);
  const protocolosF = useMemo(
    () => protocolos.filter((p) => passaFiltroMesa({ responsavelId: valorGestao(gestao, p.id, "responsavelId", p.responsavelId), assunto: p.assunto }, filtro)),
    [protocolos, filtro, gestao],
  );
  const dfdsF = useMemo(
    () =>
      filtroMesaAtivo(filtro)
        ? dfds.filter((d) =>
            passaFiltroMesa({ responsavelId: valorGestao(gestao, d.protocoloId, "responsavelId", d.protocoloResponsavelId), assunto: d.protocoloAssunto }, filtro),
          )
        : dfds,
    [dfds, filtro, gestao],
  );
  // Listas recarregadas OU filtradas: some da seleção o que não está mais à vista (a edição em massa
  // nunca atinge uma linha escondida pelo filtro).
  useEffect(() => setSelDfds((s) => podar(s, new Set(dfdsF.map((d) => d.id)))), [dfdsF]);
  useEffect(() => setSelProtos((s) => podar(s, new Set(protocolosF.map((p) => p.id)))), [protocolosF]);

  // Visão ativa (Protocolos/DFDs/Itens) — um Segmented alterna o MESMO espaço com morph.
  const [vista, setVista] = useState<Vista>("protocolos");
  const [modoItens, setModoItens] = useState<ModoItens>("normal");
  // Itens (lista plana): carregada SOB DEMANDA na 1ª vez que a visão Itens abre (não pesa o load
  // inicial). `null` = ainda não buscado; recarrega quando os DFDs mudam (após import/edição).
  const [itens, setItens] = useState<ItemDfdRow[] | null>(null);
  const [carregandoItens, setCarregandoItens] = useState(false);
  // Catálogo → Unidades de medida | Classificações: o cadastro vem JUNTO com os itens (só com a visão Itens aberta) — a
  // unidade CADASTRADA de cada item e a classificação AUTOMÁTICA (as colunas só existem com o cadastro feito).
  const [padronizacao, setPadronizacao] = useState<Padronizacao | null>(null);
  // biome-ignore lint/correctness/useExhaustiveDependencies: reset intencional ao trocar a referência de `dfds`.
  useEffect(() => {
    setItens(null);
    setSelItens(new Set()); // os ids dos itens podem mudar ao regravar um DFD
  }, [dfds]);
  const pcaDaMesa = modoPca?.pcaId;
  // Mesa principal: o MESMO PCA do cabeçalho com que a página veio (explícito — o cookie pode ter mudado noutra aba).
  const anoFiltro = pcaFiltro?.ano;
  useEffect(() => {
    if (vista !== "itens" || itens !== null) return;
    const ac = new AbortController();
    setCarregandoItens(true);
    fetch(pcaDaMesa ? `/api/dfd/itens?pca=${pcaDaMesa}` : `/api/dfd/itens${anoFiltro ? `?ano=${anoFiltro}` : ""}`, { signal: ac.signal })
      .then((r) => r.json() as Promise<{ ok?: boolean; itens?: ItemDfdRow[]; padronizacao?: Padronizacao | null }>)
      .then((j) => {
        if (ac.signal.aborted) return;
        setItens(j.ok ? (j.itens ?? []) : []);
        if (j.ok) setPadronizacao(j.padronizacao ?? null);
      })
      .catch(() => {
        if (!ac.signal.aborted) setItens([]);
      })
      .finally(() => {
        if (!ac.signal.aborted) setCarregandoItens(false);
      });
    return () => ac.abort();
  }, [vista, itens, pcaDaMesa, anoFiltro]);
  // Itens seguem o filtro de hierarquia pelo DFD de origem (que segue o do protocolo).
  // No PCA os itens seguem os DFDs VISÍVEIS (o escopo Todos/Enviados/Incorporados filtra os DFDs).
  const emPca = !!modoPca;
  const itensF = useMemo(() => {
    if (!itens || (!filtroMesaAtivo(filtro) && !emPca)) return itens;
    const vis = new Set(dfdsF.map((d) => d.id));
    return itens.filter((it) => vis.has(it.dfdId));
  }, [itens, dfdsF, filtro, emPca]);
  useEffect(() => {
    if (itensF) setSelItens((s) => podar(s, new Set(itensF.map((it) => it.id))));
  }, [itensF]);

  // CONFERÊNCIA da lista de DFDs (a MESMA da análise, calculada no servidor sobre o DFD completo) —
  // lazy: só com a visão DFDs aberta, em fatias; cada linha mostra "Conferindo…" até chegar. Os
  // resultados ficam em cache pela chave do DFD (`chaveConf`): depois de um `router.refresh()` só os
  // DFDs que MUDARAM são reconferidos. Regras/órgãos/unidades novos (contexto) zeram o cache.
  const ctxConf = useMemo(
    () => JSON.stringify([regras, orgaos, reparticoes.map((r) => [r.id, r.orgaoId ?? null, r.responsaveis])]),
    [regras, orgaos, reparticoes],
  );
  const confRef = useRef<{ ctx: string; m: Map<string, ConfLinha> }>({ ctx: "", m: new Map() });
  const [, setConfVersao] = useState(0);
  // Falha de rede/servidor na conferência: as linhas pendentes param de girar (ficam "Pendente").
  const [confFalhou, setConfFalhou] = useState(false);
  useEffect(() => {
    if (vista !== "dfds") return;
    setConfFalhou(false);
    if (confRef.current.ctx !== ctxConf) confRef.current = { ctx: ctxConf, m: new Map() };
    const alvo = confRef.current;
    const faltam = dfds.filter((d) => !alvo.m.has(chaveConf(d)));
    if (faltam.length === 0) return;
    const chavePorId = new Map(faltam.map((d) => [d.id, chaveConf(d)]));
    const ac = new AbortController();
    void (async () => {
      for (let i = 0; i < faltam.length && !ac.signal.aborted; i += FATIA_CONFERENCIA) {
        try {
          const r = await fetch("/api/dfd/conferencia", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ ids: faltam.slice(i, i + FATIA_CONFERENCIA).map((d) => d.id) }),
            signal: ac.signal,
          });
          const j = (await r.json().catch(() => ({}))) as { ok?: boolean; linhas?: ConfLinha[] };
          if (ac.signal.aborted) break;
          if (!r.ok || !j.ok) {
            setConfFalhou(true);
            break;
          }
          for (const l of j.linhas ?? []) {
            const k = chavePorId.get(l.id);
            if (k) alvo.m.set(k, l);
          }
          setConfVersao((v) => v + 1);
        } catch {
          if (!ac.signal.aborted) setConfFalhou(true); // rede — reconfere na próxima abertura da visão
          break;
        }
      }
    })();
    return () => ac.abort();
  }, [vista, dfds, ctxConf]);
  const confDe = (d: DfdResumo): ConfLinha | undefined =>
    confRef.current.ctx === ctxConf ? confRef.current.m.get(chaveConf(d)) : undefined;

  // ESTADO AGREGADO dos PROTOCOLOS (capa + TODOS os problemas dos DFDs/itens de cada um) — calculado no
  // servidor com a MESMA conferência por linha; lazy (só com a visão Protocolos ou o Dashboard, que mostra a
  // SAÚDE com este mesmo cache), em fatias limitadas
  // também pelo nº de DFDs, com cache pela chave do protocolo (`chaveProto`: capa ou qualquer DFD
  // gravado ⇒ reconfere só ele). Até chegar, a célula gira ("Conferindo…"); a fatia que FALHA marca os seus
  // protocolos como "Não conferido" (nunca um "Regular" falso) e as demais seguem — nova tentativa quando a
  // lista recarrega ou a visão reabre.
  const confProtoRef = useRef<{ ctx: string; m: Map<string, ConfProto>; falhos: Set<string> }>({ ctx: "", m: new Map(), falhos: new Set() });
  const [confProtoVersao, setConfProtoVersao] = useState(0);
  // Alternar entre Protocolos e Dashboard NÃO reinicia as requisições em curso (o mesmo cache serve aos dois).
  const precisaConfProto = vista === "protocolos" || vista === "dashboard";
  useEffect(() => {
    if (!precisaConfProto) return;
    if (confProtoRef.current.ctx !== ctxConf) confProtoRef.current = { ctx: ctxConf, m: new Map(), falhos: new Set() };
    const alvo = confProtoRef.current;
    // Nova tentativa dos que falharam: voltam a "Conferindo…" já (não ficam "Não conferido" até a 1ª resposta).
    if (alvo.falhos.size > 0) {
      alvo.falhos.clear();
      setConfProtoVersao((v) => v + 1);
    }
    const faltam = protocolos.filter((p) => !alvo.m.has(chaveProto(p)));
    if (faltam.length === 0) return;
    const fatias: ProtocoloResumo[][] = [];
    let atual: ProtocoloResumo[] = [];
    let dfdsNaFatia = 0;
    for (const p of faltam) {
      if (atual.length > 0 && (atual.length >= FATIA_PROTOCOLOS || dfdsNaFatia + p.totalDfds > FATIA_CONFERENCIA)) {
        fatias.push(atual);
        atual = [];
        dfdsNaFatia = 0;
      }
      atual.push(p);
      dfdsNaFatia += p.totalDfds;
    }
    if (atual.length > 0) fatias.push(atual);
    const chavePorId = new Map(faltam.map((p) => [p.id, chaveProto(p)]));
    const ac = new AbortController();
    void (async () => {
      for (const fatia of fatias) {
        if (ac.signal.aborted) break;
        try {
          const r = await fetch("/api/protocolo/conferencia", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ ids: fatia.map((p) => p.id) }),
            signal: ac.signal,
          });
          const j = (await r.json().catch(() => ({}))) as { ok?: boolean; linhas?: ConfProto[] };
          if (ac.signal.aborted) break;
          if (!r.ok || !j.ok) throw new Error("conferência indisponível");
          for (const l of j.linhas ?? []) {
            const k = chavePorId.get(l.id);
            if (k) alvo.m.set(k, l);
          }
        } catch {
          if (ac.signal.aborted) break;
        }
        // O que ficou SEM resultado nesta fatia (falha, ou protocolo que sumiu) não gira para sempre.
        for (const p of fatia) if (!alvo.m.has(chaveProto(p))) alvo.falhos.add(chaveProto(p));
        setConfProtoVersao((v) => v + 1);
      }
    })();
    return () => ac.abort();
  }, [precisaConfProto, protocolos, ctxConf]);
  /** Estado do protocolo: o agregado do servidor. Até chegar, "Conferindo…"; se a conferência falhou, só o
   * que a CAPA já prova (problema real) — sem problema na capa é "Não conferido", nunca "Regular". */
  const estadoDoProtocolo = (p: ProtocoloResumo): { conf: ConfProto; pendente: boolean; naoConferido: boolean } => {
    const atual = confProtoRef.current.ctx === ctxConf ? confProtoRef.current : null;
    const k = chaveProto(p);
    const c = atual?.m.get(k);
    if (c) return { conf: c, pendente: false, naoConferido: false };
    const base = avaliarProtocolo(
      {
        valorCapa: p.valorCapa,
        valorTotal: p.valorTotal,
        totalDfds: p.totalDfds,
        categoria: classificarAssunto(p.assunto),
        sobrescritos: p.sobrescritos,
        valorSobrescritos: p.valorSobrescritos,
      },
      null,
      regras,
    );
    const conf = { id: p.id, estado: base.estado, resumo: base.resumo ?? null };
    if (p.totalDfds === 0) return { conf, pendente: false, naoConferido: false }; // sem DFDs: a capa diz tudo
    const falhou = !!atual?.falhos.has(k);
    return { conf, pendente: !falhou, naoConferido: falhou && base.estado === "regular" };
  };

  /** GESTÃO na célula: responsável/situação gravados na hora (PATCH, origem "celula" no histórico). */
  async function alterarGestao(p: ProtocoloResumo, campo: keyof Gestao, valor: number | null) {
    const k = `${p.id}:${campo}`;
    setSalvandoGestao((s) => new Set(s).add(k));
    setGestao((m) => new Map(m).set(p.id, { ...m.get(p.id), [campo]: valor }));
    try {
      const res = await fetch(`/api/protocolo/${p.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ [campo]: valor, origem: "celula" }),
      });
      const j = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
      if (!res.ok || !j.ok) throw new Error(j.error ?? `falha ao salvar (HTTP ${res.status})`);
      router.refresh();
    } catch (e) {
      // Desfaz o valor otimista (volta ao do servidor) e avisa.
      setGestao((m) => {
        const n = new Map(m);
        const g = { ...n.get(p.id) };
        delete g[campo];
        n.set(p.id, g);
        return n;
      });
      setErro(`Protocolo ${p.numero}: ${e instanceof TypeError ? "sem conexão com o servidor" : e instanceof Error ? e.message : "falha ao salvar"}.`);
    } finally {
      setSalvandoGestao((s) => {
        const n = new Set(s);
        n.delete(k);
        return n;
      });
    }
  }

  // DIRETÓRIO de pessoas (foto + apelido): as do GRUPO (designáveis) + as que só aparecem nas colunas.
  const dirPessoas = useMemo(() => new Map([...outrasPessoas, ...pessoas].map((p) => [p.id, p])), [pessoas, outrasPessoas]);
  /** A pessoa de um id (do diretório; na falta, o nome gravado — sem foto). */
  const pessoaDe = (id: number | null | undefined, nomeGravado?: string | null): Pessoa | null =>
    id == null ? null : (dirPessoas.get(id) ?? { id, nome: nomeGravado || `#${id}`, apelido: null, foto: null });
  /** Opções do Responsável (célula): só as pessoas DO GRUPO — foto + apelido na célula, "apelido — nome" na lista. */
  const opcoesPessoas = useMemo(() => pessoas.map((p) => ({ id: p.id, nome: rotuloOpcaoPessoa(p, usuarioId), pessoa: p })), [pessoas, usuarioId]);

  const atualizarListas = () => router.refresh();

  async function excluirDfd(id: number, numero: string) {
    if (!confirm(`Excluir o DFD ${numero}? Os itens dele também são excluídos.`)) return;
    setErro(null);
    const res = await fetch(`/api/dfd/${id}`, { method: "DELETE" });
    const j = (await res.json()) as { ok?: boolean; error?: string };
    if (!res.ok || !j.ok) {
      setErro(j.error ?? "Não foi possível excluir o DFD.");
      return;
    }
    router.refresh();
  }

  async function excluirProtocolo(id: number, numero: string, totalDfds: number) {
    const aviso =
      totalDfds > 0
        ? `Excluir o protocolo ${numero}? Os ${totalDfds} DFD(s) vinculados e seus itens também serão excluídos.`
        : `Excluir o protocolo ${numero}?`;
    if (!confirm(aviso)) return;
    setErro(null);
    const res = await fetch(`/api/protocolo/${id}`, { method: "DELETE" });
    const j = (await res.json()) as { ok?: boolean; error?: string };
    if (!res.ok || !j.ok) {
      setErro(j.error ?? "Não foi possível excluir o protocolo.");
      return;
    }
    router.refresh();
  }

  function abrirVincular(d: DfdResumo) {
    setErro(null);
    setVincAlvo({ id: d.id, numero: d.numero, protocoloId: d.protocoloId });
    setVincSel(d.protocoloId);
  }

  async function salvarVincular() {
    if (!vincAlvo) return;
    setSalvandoVinc(true);
    setErro(null);
    try {
      const res = await fetch(`/api/dfd/${vincAlvo.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ protocoloId: vincSel }),
      });
      // Resposta sem JSON (falha do servidor) não vira mensagem crua: vale a do servidor quando há (ex.: 423 da trava).
      const j = (await res.json().catch(() => null)) as { ok?: boolean; error?: string } | null;
      if (!res.ok || !j?.ok) throw new Error(j?.error ?? `Não foi possível vincular (erro ${res.status}).`);
      setVincAlvo(null);
      router.refresh();
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Não foi possível vincular.");
    } finally {
      setSalvandoVinc(false);
    }
  }

  /**
   * Executa uma edição EM MASSA no servidor em FATIAS (progresso real; a falha de uma fatia não perde as
   * demais), depois recarrega as listas. Devolve quantos mudaram + as falhas cruas (cada rota tem a sua).
   */
  async function emFatias(url: string, fatias: number[][], acao: unknown, rotulo: string) {
    const total = fatias.reduce((t, f) => t + f.length, 0);
    let feito = 0;
    let alterados = 0;
    const falhas: unknown[] = [];
    const erros: string[] = [];
    try {
      for (const fatia of fatias) {
        setAplicandoMassa({ feito, total, rotulo });
        try {
          const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ids: fatia, acao }) });
          const j = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string; alterados?: number; falhas?: unknown[] };
          if (!res.ok || !j.ok) erros.push(`${fatia.length} registro(s): ${j.error ?? `falha (HTTP ${res.status})`}`);
          else {
            alterados += j.alterados ?? 0;
            falhas.push(...(j.falhas ?? []));
          }
        } catch {
          erros.push(`${fatia.length} registro(s): sem conexão com o servidor`);
        }
        feito += fatia.length;
      }
    } finally {
      setAplicandoMassa(null);
      router.refresh(); // reflete o que foi gravado (mesmo com falhas parciais)
    }
    return { alterados, falhas, erros };
  }
  const fatiar = (ids: number[], n: number) => Array.from({ length: Math.ceil(ids.length / n) }, (_, k) => ids.slice(k * n, (k + 1) * n));

  /** DFDs: a MESMA barra da análise; grava no banco (com confirmação). */
  async function aplicarMassa(acao: AcaoMassa) {
    const ids = [...selDfds].map(Number);
    if (ids.length === 0) return;
    if (!confirm(`Aplicar a alteração em ${ids.length} DFD(s)? Ela é gravada diretamente no banco.`)) return;
    setErro(null);
    const r = await emFatias("/api/dfd/massa", fatiar(ids, FATIA_MASSA), acao, "DFD(s)");
    setSelDfds(new Set());
    if (r.alterados > 0) toast.success(`${num(r.alterados)} DFD(s) alterado(s).`);
    const falhas = [
      ...r.erros,
      ...resumirFalhas((r.falhas as { numero: string; motivo: string }[]).map((f) => ({ ref: `DFD ${f.numero}`, motivo: f.motivo })), ["DFD", "DFDs"]),
    ];
    if (falhas.length > 0) setErro(`Não alterados: ${falhas.join(" · ")}`);
  }

  /** Protocolos: unidade, assunto ou valor da capa = somatória (conciliação em lote). */
  async function aplicarMassaProtocolos(acao: AcaoMassaProtocolo) {
    const ids = [...selProtos].map(Number);
    if (ids.length === 0) return;
    const nomeSit = (id: number | null) => (id == null ? null : (situacoes.find((x) => x.id === id)?.nome ?? `#${id}`));
    const nomePes = (id: number | null) => nomeExibicao(pessoaDe(id));
    const oQue =
      acao.campo === "assunto"
        ? `o assunto "${acao.valor}"`
        : acao.campo === "responsavel"
          ? acao.responsavelId == null
            ? "SEM responsável"
            : `o responsável ${nomePes(acao.responsavelId)}`
          : acao.campo === "situacao"
            ? acao.situacaoId == null
              ? "SEM situação"
              : `a situação "${nomeSit(acao.situacaoId)}"`
            : "a unidade";
    const pergunta =
      acao.campo === "valorCapa"
        ? `Substituir o valor da capa pela somatória dos DFDs em ${ids.length} protocolo(s)?`
        : `Aplicar ${oQue} em ${ids.length} protocolo(s)?`;
    if (!confirm(`${pergunta} Gravado diretamente no banco.`)) return;
    setErro(null);
    const r = await emFatias("/api/protocolo/massa", fatiar(ids, FATIA_MASSA), acao, "protocolo(s)");
    setSelProtos(new Set());
    if (r.alterados > 0) toast.success(`${num(r.alterados)} protocolo(s) alterado(s).`);
    else if (r.erros.length === 0 && r.falhas.length === 0) toast.success("Nada a alterar — os selecionados já estavam assim.");
    const falhas = [
      ...r.erros,
      ...resumirFalhas((r.falhas as { numero: string; motivo: string }[]).map((f) => ({ ref: `Protocolo ${f.numero}`, motivo: f.motivo })), ["protocolo", "protocolos"]),
    ];
    if (falhas.length > 0) setErro(`Não alterados: ${falhas.join(" · ")}`);
  }

  /** Itens: padronizar/unidade/quantidade/valor unitário/remover — agrupados por DFD (lote atômico por DFD). */
  async function aplicarMassaItens(acao: AcaoMassaItem) {
    const lista = itens ?? [];
    const alvo = lista.filter((it) => selItens.has(it.id));
    if (alvo.length === 0) return;
    const rotulo = descreverAcaoItem(acao);
    if (!confirm(`${acao.campo === "remover" ? "Remover" : "Aplicar"} em ${alvo.length} item(ns) (${rotulo})? Gravado diretamente no banco.`)) return;
    setErro(null);
    // Remover TODOS os itens de um DFD não é permitido: recusa aqui (mesmo se a seleção for dividida).
    const recusas: { dfd: string; item: number | null; motivo: string }[] = [];
    let ids = alvo.map((it) => it.id);
    if (acao.campo === "remover") {
      const porDfd = new Map<number, number>();
      for (const it of alvo) porDfd.set(it.dfdId, (porDfd.get(it.dfdId) ?? 0) + 1);
      const cheios = new Set([...porDfd].filter(([id, n]) => n >= (dfdPorId.get(id)?.totalItens ?? Number.POSITIVE_INFINITY)).map(([id]) => id));
      for (const it of alvo) if (cheios.has(it.dfdId)) recusas.push({ dfd: it.dfdNumero, item: it.item, motivo: "o DFD ficaria sem itens" });
      ids = alvo.filter((it) => !cheios.has(it.dfdId)).map((it) => it.id);
    }
    const dfdDe = new Map(lista.map((it) => [it.id, it.dfdId]));
    const r = ids.length > 0 ? await emFatias("/api/dfd/itens/massa", fatiarItensPorDfd(ids, dfdDe, FATIA_ITENS_DFDS, FATIA_ITENS), acao, "item(ns)") : { alterados: 0, falhas: [], erros: [] };
    setSelItens(new Set());
    if (r.alterados > 0) toast.success(`${num(r.alterados)} item(ns) ${rotulo}.`);
    else if (r.erros.length === 0 && r.falhas.length === 0 && recusas.length === 0) toast.success("Nada a alterar — os selecionados já estavam assim.");
    const falhas = [...r.erros, ...resumirFalhasItens([...recusas, ...(r.falhas as typeof recusas)])];
    if (falhas.length > 0) setErro(`Não alterados: ${falhas.join(" · ")}`);
  }

  // ---- Planilha ÚNICA de DFDs (a MESMA dos banners) para a aba DFDs — conferência real por linha. ----
  const dfdPorId = useMemo(() => new Map(dfds.map((d) => [d.id, d])), [dfds]);
  // PCA (ano) das linhas — coluna "PCA" dos protocolos, DFDs e itens (o nome do PCA cadastrado na dica). Só na Mesa
  // PRINCIPAL: a do PCA é de um PCA só. O DFD segue o PCA do protocolo de origem; o item, o do DFD.
  const nomePcaPorAno = useMemo(() => {
    const m = new Map<number, string>();
    for (const p of pcas) if (p.ano != null && !m.has(p.ano)) m.set(p.ano, p.nome);
    return m;
  }, [pcas]);
  const pcaDe = (ano: number | null | undefined): PcaDaLinha | null => (ano != null ? { ano, nome: nomePcaPorAno.get(ano) ?? `PCA ${ano}` } : null);
  const linhasDfdTab: LinhaDfd[] = dfdsF.map((d): LinhaDfd => {
    const c = confDe(d);
    return {
      key: d.id,
      numero: d.numero,
      planejamento: d.planejamento,
      sigla: d.reparticaoCodigo ?? "—",
      tipo: tipoCurtoDfd(d.tipo),
      itens: d.totalItens,
      valor: d.valorTotal ?? 0,
      estado: c?.estado ?? "pendente",
      resumo: c?.resumo ?? undefined,
      validacao: c?.validacao ?? null,
      processando: c || confFalhou ? null : "conferindo",
      assinaturas: d.assinaturaGrupos,
      protocolo: d.protocoloNumero,
      prioridade: d.prioridade,
      ...(modoPca ? {} : { pca: pcaDe(anoPcaDoDfd(d)) }),
    };
  });
  const acoesDfd = (l: LinhaDfd) => {
    const d = dfdPorId.get(l.key);
    const noPca = d ? { pcaId: d.protocoloPcaId, pcaIncorporadoEm: d.protocoloPcaIncorporadoEm } : null;
    // DFD de protocolo INCORPORADO a um PCA: travado (sem vincular/excluir — o servidor recusa também).
    if (!podeEditar || !d || !noPca || estaTravado(noPca)) return null;
    return (
      <div className="flex justify-end gap-1">
        <Button variant="ghost" size="xs" aria-label="Vincular a protocolo" onClick={() => abrirVincular(d)} icon={<IconLayers className="h-4 w-4" />} />
        {/* DFD de protocolo em um PCA (enviado) não é excluído — o servidor recusa também. */}
        {motivoNaoExcluirDfd(noPca) == null && (
          <Button
            variant="ghost"
            size="xs"
            aria-label="Excluir DFD"
            onClick={() => excluirDfd(d.id, d.numero)}
            icon={<IconTrash className="h-4 w-4" />}
            style={{ color: "var(--danger)" }}
          />
        )}
      </div>
    );
  };

  // Pessoas do filtro de responsável: as do grupo + quem ainda é responsável por algum protocolo (outro
  // grupo, inativa) — o filtro acha os protocolos delas também.
  const opcoesResponsavel: Pessoa[] = [...pessoas];
  for (const p of protocolos) {
    const pe = p.responsavelId != null && !opcoesResponsavel.some((x) => x.id === p.responsavelId) ? pessoaDe(p.responsavelId, p.responsavelNome) : null;
    if (pe) opcoesResponsavel.push(pe);
  }
  // O valor ATIVO de um filtro de hierarquia sempre aparece nas opções — mesmo que nenhum protocolo o tenha
  // mais (ex.: a massa trocou o assunto de todos): o seletor nunca mostra "Todos" com um filtro aplicado.
  const pessoasVistas = useRef(new Map<number, Pessoa>());
  for (const x of opcoesResponsavel) pessoasVistas.current.set(x.id, x);
  const respFiltrado = typeof filtro.responsavel === "number" ? filtro.responsavel : null;
  if (respFiltrado != null && !opcoesResponsavel.some((x) => x.id === respFiltrado)) {
    const pe = pessoasVistas.current.get(respFiltrado) ?? pessoaDe(respFiltrado);
    if (pe) opcoesResponsavel.push(pe);
  }
  const opcoesAssunto = opcoesAssuntoMesa(protocolos);
  if (filtro.assunto != null && !opcoesAssunto.includes(filtro.assunto)) opcoesAssunto.push(filtro.assunto);

  // ---- Colunas da tabela de Protocolos ----
  // ESTADO = o protocolo ACUMULA a capa + TODOS os problemas dos DFDs/itens (filtro: todos os problemas).
  // GESTÃO: Situação (só as do ADM) e Responsável = dropdown na própria célula; Distribuição = quem protocolou.
  const situacaoPorId = new Map(situacoes.map((x) => [x.id, x]));
  /** O responsável EXIBIDO (o editado na célula, se houver; senão o do servidor). */
  const responsavelDe = (r: ProtocoloResumo) => {
    const id = valorGestao(gestao, r.id, "responsavelId", r.responsavelId);
    return pessoaDe(id, id === r.responsavelId ? r.responsavelNome : null);
  };
  // DASHBOARD de governança: as MESMAS listas filtradas da Mesa, com a GESTÃO otimista (responsável/situação) e o
  // estado agregado da conferência (o cache da coluna Estado) — só montado com o Dashboard aberto.
  // biome-ignore lint/correctness/useExhaustiveDependencies: estadoDoProtocolo/responsavelDe/situacaoDe leem o cache (confProtoVersao/ctxConf), a gestão e o diretório listados.
  const dash = useMemo(() => {
    if (vista !== "dashboard") return null;
    const pessoasDash = new Map<number, Pessoa>();
    const protocolosDash = protocolosF.map((p): ProtocoloPainel => {
      const resp = responsavelDe(p);
      if (resp) pessoasDash.set(resp.id, resp);
      const { conf, pendente, naoConferido } = estadoDoProtocolo(p);
      const estado: EstadoPainel = pendente ? "conferindo" : naoConferido ? "naoConferido" : conf.estado;
      return {
        id: p.id,
        numero: p.numero,
        assunto: p.assunto,
        sigla: p.reparticaoCodigo,
        criadoEm: p.criadoEm,
        valor: p.valorTotal,
        responsavelId: resp?.id ?? null,
        situacaoId: situacaoDe(p),
        estado,
      };
    });
    const dfdsDash = dfdsF.map(
      (d): DfdPainel => ({
        id: d.id,
        numero: d.numero,
        planejamento: d.planejamento,
        unidadeId: d.reparticaoId,
        unidade: d.reparticaoCodigo,
        unidadeNome: d.reparticaoNome,
        valor: d.valorTotal,
        itens: d.totalItens,
      }),
    );
    return { protocolos: protocolosDash, dfds: dfdsDash, pessoas: pessoasDash };
  }, [vista, protocolosF, dfdsF, gestao, dirPessoas, confProtoVersao, ctxConf, regras]);

  const travaResp = filtro.responsavel !== "todos" ? "Filtrado pelo seletor de responsável acima da tabela" : undefined;
  const travaAssunto = filtro.assunto != null ? "Filtrado pelo seletor de assunto acima da tabela" : undefined;
  const colsProto: Column<ProtocoloResumo>[] = [
    {
      key: "estado",
      header: "Estado",
      nowrap: true,
      value: (r) => {
        const { conf, pendente, naoConferido } = estadoDoProtocolo(r);
        if (pendente || naoConferido) return pendente ? "Conferindo…" : NAO_CONFERIDO;
        return conf.resumo?.rotulo || ESTADO_PROTOCOLO_ROTULO[conf.estado];
      },
      // Filtro: TODOS os problemas do protocolo (capa + os de todos os DFDs/itens).
      valores: (r) => {
        const { conf, pendente, naoConferido } = estadoDoProtocolo(r);
        if (pendente || naoConferido) return [pendente ? "Conferindo…" : NAO_CONFERIDO];
        return conf.resumo?.rotulos.length ? conf.resumo.rotulos : [ESTADO_PROTOCOLO_ROTULO[conf.estado]];
      },
      render: (r) => {
        const { conf, pendente, naoConferido } = estadoDoProtocolo(r);
        if (pendente) return <EstadoProcessando rotulo="Conferindo…" />;
        if (naoConferido)
          return (
            <EstadoPonto
              cor="var(--muted)"
              rotulo={NAO_CONFERIDO}
              title="Não foi possível conferir os DFDs deste protocolo agora — recarregue a página para tentar de novo."
            />
          );
        if (conf.resumo?.rotulo) return <EstadoResumo res={conf.resumo} />;
        return <EstadoPonto cor={estadoProtocoloCor(conf.estado, regras)} rotulo={ESTADO_PROTOCOLO_ROTULO[conf.estado]} />;
      },
    },
    {
      key: "situacao",
      header: "Situação",
      nowrap: true,
      value: (r) => {
        const id = situacaoDe(r);
        return id == null ? "Sem situação" : (situacaoPorId.get(id)?.nome ?? "Sem situação");
      },
      render: (r) => (
        <SeletorCelula
          valor={situacaoDe(r)}
          opcoes={situacoes}
          onChange={podeEditar && situacoes.length > 0 ? (v) => alterarGestao(r, "situacaoId", v) : undefined}
          vazio="Sem situação"
          salvando={salvandoGestao.has(`${r.id}:situacaoId`)}
          ariaLabel={`Situação do protocolo ${r.numero}`}
        />
      ),
    },
    {
      key: "responsavel",
      header: "Responsável",
      nowrap: true,
      travado: travaResp,
      // Filtro/ordem pelo "apelido — nome" (duas pessoas com o mesmo apelido não viram uma só opção).
      value: (r) => {
        const p = responsavelDe(r);
        return p ? rotuloOpcaoPessoa(p) : "Sem responsável";
      },
      // FOTO + APELIDO na célula; a troca é só entre as pessoas DO GRUPO (o atual de fora aparece, sem re-escolha).
      render: (r) => {
        const p = responsavelDe(r);
        return (
          <SeletorCelula
            valor={p?.id ?? null}
            opcoes={opcoesPessoas}
            atual={p ? { id: p.id, nome: rotuloOpcaoPessoa(p, usuarioId), pessoa: p } : null}
            onChange={podeEditar ? (v) => alterarGestao(r, "responsavelId", v) : undefined}
            vazio="Sem responsável"
            salvando={salvandoGestao.has(`${r.id}:responsavelId`)}
            ariaLabel={`Responsável pelo protocolo ${r.numero}`}
          />
        );
      },
    },
    {
      key: "distribuicao",
      header: "Distribuição",
      nowrap: true,
      // Quem protocolou — FOTO + APELIDO.
      value: (r) => {
        const p = pessoaDe(r.distribuidorId, r.distribuidorNome);
        return p ? rotuloOpcaoPessoa(p) : "—";
      },
      render: (r) => <PessoaTag pessoa={pessoaDe(r.distribuidorId, r.distribuidorNome)} />,
    },
    {
      key: "data",
      header: "Data",
      filter: "date",
      nowrap: true,
      // Data da PROTOCOLAÇÃO (quando entrou no sistema), no fuso de Brasília.
      value: (r) => dataIsoBrasilia(r.criadoEm),
      render: (r) => <span className="text-[12px] tabular-nums text-muted">{dataHoraBR(r.criadoEm)}</span>,
    },
    {
      key: "numero",
      header: "Nº processo",
      nowrap: true,
      value: (r) => r.numero,
      // Copia o nº SEM o ano ("144756/2026" → "144756").
      render: (r) => (
        <CelulaCopiavel copiar={numeroSemAno(r.numero)} rotulo="nº do protocolo">
          <span className="font-mono text-[12px]">{r.numero}</span>
        </CelulaCopiavel>
      ),
    },
    {
      key: "idExterno",
      header: "Id protocolo",
      nowrap: true,
      value: (r) => r.idExterno ?? "—",
      render: (r) => (
        <CelulaCopiavel copiar={r.idExterno} rotulo="Id do protocolo">
          <span className="font-mono text-[12px]">{r.idExterno ?? "—"}</span>
        </CelulaCopiavel>
      ),
    },
    {
      key: "assunto",
      header: "Assunto",
      minWidth: 180,
      travado: travaAssunto,
      value: (r) => r.assunto ?? "—",
      render: (r) => <span className="line-clamp-1">{r.assunto ?? "—"}</span>,
    },
    {
      key: "reparticao",
      header: "Unidade",
      nowrap: true,
      value: (r) => r.reparticaoCodigo ?? "—",
      render: (r) =>
        r.reparticaoCodigo ? (
          <span className="font-mono text-[12px] font-semibold text-accent">{r.reparticaoCodigo}</span>
        ) : (
          <span className="text-faint">—</span>
        ),
    },
    ...(modoPca
      ? []
      : [
          {
            key: "pca",
            header: "PCA",
            align: "center" as const,
            nowrap: true,
            value: (r: ProtocoloResumo) => (r.anoPca != null ? String(r.anoPca) : "—"),
            render: (r: ProtocoloResumo) => <CelulaPca pca={pcaDe(r.anoPca)} />,
          },
        ]),
    {
      key: "dfds",
      header: "DFDs",
      align: "center",
      filter: "none",
      nowrap: true,
      // Os DFDs do processo + o RASTRO dos sobrescritos por outro protocolo ("+N", esmaecido).
      render: (r) => (
        <span className="tabular-nums">
          {num(r.totalDfds)}
          {r.sobrescritos > 0 && (
            <span className="ml-1 text-[11px] text-faint" title={`${num(r.sobrescritos)} DFD(s) sobrescrito(s) por outro protocolo`}>
              +{num(r.sobrescritos)}
            </span>
          )}
        </span>
      ),
    },
    { key: "itens", header: "Itens", align: "center", filter: "none", nowrap: true, render: (r) => num(r.totalItens) },
    { key: "valor", header: "Valor", align: "right", filter: "range", numero: (r) => r.valorTotal, nowrap: true, render: (r) => brl(r.valorTotal) },
    // Excluir: só na Mesa principal — protocolo em um PCA (enviado ou incorporado) NÃO é excluído (o enviado volta pela
    // "Devolver à Mesa"); o servidor recusa também.
    ...(modoPca
      ? []
      : [
          {
            key: "acoes",
            header: "",
            filter: "none" as const,
            nowrap: true,
            render: (r: ProtocoloResumo) =>
              podeEditar && motivoNaoExcluirProtocolo(r) == null ? (
                <div className="flex justify-end gap-1">
                  <Button
                    variant="ghost"
                    size="xs"
                    aria-label="Excluir protocolo"
                    onClick={() => excluirProtocolo(r.id, r.numero, r.totalDfds)}
                    icon={<IconTrash className="h-4 w-4" />}
                    style={{ color: "var(--danger)" }}
                  />
                </div>
              ) : null,
          },
        ]),
  ];

  // Itens REPETIDOS no DFD de origem (mesmo código, descrição e unidade) — a MESMA marca "Item duplicado" (atenção) da
  // tabela de itens do DFD; o filtro da coluna Estado junta todos os repetidos para conferir.
  const repetidosItens = useMemo(() => (itens ? repetidosPorDfd(itens) : null), [itens]);
  const repDoItem = useCallback(
    (r: ItemDfdRow) => {
      const rep = repetidosItens?.get(r.id);
      if (!rep) return null;
      // A MESMA régua do banner do DFD: tipo do DFD + a categoria do protocolo de origem (exceções do ADM).
      const ctx = { dfdTipo: tipoCurtoDfd(r.dfdTipo), categoria: classificarAssunto(r.protocoloAssunto) };
      if (comportamentoNo(regras, "item.duplicado", ctx) === "ignora") return null;
      return { ...rep, cor: corImportancia(regras, nivelDe(regras, "item.duplicado", ctx)) };
    },
    [repetidosItens, regras],
  );

  // PADRONIZAÇÃO (Catálogo → Unidades de medida | Classificações): a unidade CADASTRADA que a unidade do item representa e
  // a classificação AUTOMÁTICA pela descrição — cada uma só existe com o seu cadastro feito (sem ele, nada muda). A
  // unidade é memorizada pela GRAFIA (poucas distintas entre milhares de itens) e a classificação por item (colunas,
  // filtros e a Consolidada leem a mesma lista).
  const unidadeDoItem = useMemo(() => {
    if (!padronizacao?.unidades.length) return null;
    const resolver = resolverUnidades(padronizacao.unidades);
    const memo = new Map<string, { unidade: UnidadeMedida | null; rotulo: string }>();
    return (texto: string | null) => {
      const t = texto ?? "";
      let v = memo.get(t);
      if (!v) {
        const unidade = resolver(t);
        v = { unidade, rotulo: chaveUnidade(t) ? (unidade?.sigla ?? NAO_CADASTRADA) : "—" };
        memo.set(t, v);
      }
      return v;
    };
  }, [padronizacao]);
  const classeDoItem = useMemo(() => {
    if (!padronizacao?.classificacoes.length) return null;
    const classificar = criarClassificador(padronizacao.classificacoes, padronizacao.unidades);
    const memo = new WeakMap<ItemDfdRow, ResultadoClassificacao | null>();
    return (r: ItemDfdRow) => {
      let v = memo.get(r);
      if (v === undefined) {
        v = classificar(r.descricao, r.unidade);
        memo.set(r, v);
      }
      return v;
    };
  }, [padronizacao]);

  // ATRIBUTOS de um item (valor p/ ordenar e filtrar; `valores` = vários — os problemas do Estado): a MESMA régua nas
  // colunas da visão Normal e nos filtros da Consolidada, que filtram os ITENS antes de agrupar — o total da Consolidada
  // bate com o da Normal com os mesmos filtros.
  type Atributo = { valor: (r: ItemDfdRow) => string; valores?: (r: ItemDfdRow) => string[] };
  const atributoItem = useMemo(() => {
    const estado = (r: ItemDfdRow) => resumoEstado(mensagensItem(r, repDoItem(r)));
    return {
      estado: {
        valor: (r) => estado(r).rotulo || ESTADO_ITEM_ROTULO[estadoItem(r)],
        // Filtro: TODAS as faltas do item (inclusive as ocultas no "+N").
        valores: (r) => {
          const res = estado(r);
          return res.rotulos.length ? res.rotulos : [ESTADO_ITEM_ROTULO[estadoItem(r)]];
        },
      },
      protocolo: { valor: (r) => r.protocoloNumero ?? "—" },
      pca: { valor: (r) => String(anoPcaDoDfd(dfdPorId.get(r.dfdId)) ?? "—") },
      dfd: { valor: (r) => r.dfdNumero },
      // O MESMO valor das colunas `colunaPlanejamento`/`colunaTipoDfd` (vazio/fora do padrão = "—").
      planejamento: { valor: (r) => planejamentoDfd(r.dfdPlanejamento) ?? "—" },
      sigla: { valor: (r) => r.sigla ?? "—" },
      tipo: { valor: (r) => tipoCurtoDfd(r.dfdTipo) ?? "—" },
      prioridade: { valor: (r) => dfdPorId.get(r.dfdId)?.prioridade ?? "—" },
      catalogo: { valor: (r) => rotuloVeredictoCatalogo(veredictoLinhaCatalogo(r.catalogo, regras, tipoCurtoDfd(r.dfdTipo))) || "—" },
      descricao: { valor: (r) => r.descricao ?? "" },
      unidade: { valor: (r) => r.unidade ?? "" },
      // Só com o cadastro (senão as colunas nem existem): a sigla da unidade cadastrada e a classificação automática.
      unidCad: { valor: (r) => unidadeDoItem?.(r.unidade).rotulo ?? "—" },
      classificacao: { valor: (r) => classeDoItem?.(r)?.classificacao.nome ?? NAO_CLASSIFICADO },
      // Só na Consolidada: o código NORMALIZADO (o da linha) e o nº do item no PCA (a coluna da Mesa do PCA).
      codigo: { valor: (r) => normalizarCodigo(r.codigo) || "Sem código" },
      pcaSeq: { valor: (r) => (r.pcaSequencial == null ? "" : String(r.pcaSequencial)) },
    } satisfies Record<string, Atributo>;
  }, [repDoItem, dfdPorId, regras, unidadeDoItem, classeDoItem]);

  // Visão CONSOLIDADA (um por CÓDIGO): calculada só com ela aberta, sobre os itens JÁ filtrados pela hierarquia.
  const consolidada = vista === "itens" && modoItens === "consolidada";
  // Filtros de ATRIBUTO da Consolidada (Estado, Código, Catálogo, Descrição, Unidade, Nº Plan., Nº DFD, Protocolo, Sigla,
  // Tipo, PCA, Prioridade, Seq. PCA) — no nível do ITEM, ANTES de consolidar: a linha soma só os itens que passam e as opções de cada
  // filtro vêm dos itens que passam nos DEMAIS (conectados). Os numéricos (Qtd. total, médio, variação, total, itens) ficam
  // na tabela e valem para a linha. Zeram ao sair da visão.
  const [filtrosItem, setFiltrosItem] = useState<Record<string, string[]>>({});
  useEffect(() => {
    if (!consolidada) setFiltrosItem({});
  }, [consolidada]);
  const filtroItens = useMemo(() => {
    if (!consolidada) return null;
    const lista = itensF ?? [];
    const chaves: (keyof typeof atributoItem)[] = [
      ...(emPca ? (["pcaSeq"] as const) : []),
      "estado",
      "codigo",
      "catalogo",
      ...(classeDoItem ? (["classificacao"] as const) : []),
      "descricao",
      "unidade",
      ...(unidadeDoItem ? (["unidCad"] as const) : []),
      "planejamento",
      "dfd",
      "protocolo",
      "sigla",
      "tipo",
      ...(emPca ? [] : (["pca"] as const)),
      "prioridade",
    ];
    const cols = chaves.map((k): ColunaDados => {
      const a: Atributo = atributoItem[k];
      return { tipo: "values", vals: lista.map((r) => (a.valores ? a.valores(r) : [a.valor(r)])) };
    });
    const res = aplicarFiltros(
      lista.length,
      cols,
      chaves.map((k) => filtrosItem[k]),
    );
    return {
      itens: res.passam.length === lista.length ? lista : res.passam.map((i) => lista[i]),
      opcoes: new Map<string, string[]>(chaves.map((k, j) => [k, res.opcoes[j] ?? []])),
    };
  }, [consolidada, itensF, atributoItem, filtrosItem, emPca, classeDoItem, unidadeDoItem]);
  const consolidados = useMemo(() => (filtroItens ? consolidarItens(filtroItens.itens) : null), [filtroItens]);
  /** O filtro de ATRIBUTO da coluna `k` da Consolidada (controlado aqui — `Column.filtroExterno`). */
  const filtroExterno = (k: string) => ({
    opcoes: filtroItens?.opcoes.get(k) ?? [],
    valor: filtrosItem[k] ?? [],
    onChange: (v: string[] | null) =>
      setFiltrosItem((f) => {
        const n = { ...f };
        if (v?.length) n[k] = v;
        else delete n[k];
        return n;
      }),
  });
  // Tudo o que as células de cada linha consolidada mostram — calculado UMA vez por lista (não por célula nem por
  // renderização): o ESTADO (os problemas dos itens de origem agrupados), as listas "todos juntos" e o veredito do
  // catálogo MAIS grave entre os itens (o tipo do DFD de origem conta).
  const infoConsolidados = useMemo(() => {
    const peso = { erro: 3, atencao: 2, conforme: 1 } as const;
    return new Map(
      (consolidados ?? []).map((l) => {
        const e = estadoConsolidado(l.itens.map((it) => mensagensItem(it, repDoItem(it))));
        let pior: { it: ItemDfdRow; peso: number; rotulo: string } | null = null;
        for (const it of l.itens) {
          const v = veredictoLinhaCatalogo(it.catalogo, regras, tipoCurtoDfd(it.dfdTipo));
          if (v && (!pior || peso[v.nivel] > pior.peso)) pior = { it, peso: peso[v.nivel], rotulo: rotuloVeredictoCatalogo(v) };
        }
        return [
          l.chave,
          {
            estado: resumoEstado(e.mensagens),
            rotulosEstado: e.rotulos,
            // Os MESMOS valores das opções dos filtros (`atributoItem`): "—" = algum item sem o dado (ex.: o DFD sem
            // planejamento, que é erro, aparece na célula — não some atrás dos que têm).
            protocolos: distintos(l.itens, atributoItem.protocolo.valor),
            pcas: distintos(l.itens, atributoItem.pca.valor),
            dfds: distintos(l.itens, atributoItem.dfd.valor),
            planejamentos: distintos(l.itens, atributoItem.planejamento.valor),
            siglas: distintos(l.itens, atributoItem.sigla.valor),
            tipos: distintos(l.itens, atributoItem.tipo.valor),
            prioridades: distintos(l.itens, atributoItem.prioridade.valor),
            classificacoes: classeDoItem ? distintos(l.itens, atributoItem.classificacao.valor) : [],
            unidadesCad: unidadeDoItem ? distintos(l.itens, atributoItem.unidCad.valor) : [],
            seqsPca: l.itens
              .filter((it) => it.pcaSequencial != null)
              .sort((a, b) => (a.pcaSequencial ?? 0) - (b.pcaSequencial ?? 0))
              .map((it) => ({ texto: String(it.pcaSequencial), riscado: !it.pcaAtivo })),
            catalogoPior: pior?.it ?? null,
            catalogoRotulo: pior?.rotulo || "—",
          },
        ] as const;
      }),
    );
  }, [consolidados, repDoItem, regras, atributoItem, classeDoItem, unidadeDoItem]);
  // Detalhe (COMPOSIÇÃO) da linha consolidada aberta. Recarregando os itens (depois de gravar no banner do item), segue a
  // MESMA linha (pelo código) com os dados novos; enquanto ela não reaparece, mostra a última — nada pisca.
  const [composicao, setComposicao] = useState<string | null>(null);
  const achadaComposicao = useMemo(
    () => (composicao ? (consolidados?.find((l) => l.chave === composicao) ?? null) : null),
    [composicao, consolidados],
  );
  const ultimaComposicao = useRef<ItemConsolidado<ItemDfdRow> | null>(null);
  if (!composicao) ultimaComposicao.current = null;
  else if (achadaComposicao) ultimaComposicao.current = achadaComposicao;
  const linhaComposicao = composicao ? (achadaComposicao ?? ultimaComposicao.current) : null;
  // Fora da visão consolidada — ou a linha sumiu da lista recarregada (o código mudou; a linha SEM código é o próprio
  // item, que regravado ganha outro id) —, o detalhe fecha. Nunca POR BAIXO de um banner aberto por cima dele: só ao
  // voltar à Mesa (os modais fecham na ordem natural, de cima para baixo).
  useEffect(() => {
    if (composicao && !aberto && (!consolidada || (itensF !== null && !achadaComposicao))) setComposicao(null);
  }, [composicao, aberto, consolidada, itensF, achadaComposicao]);

  // Colunas da visão "Itens" (lista PLANA de todos os itens dos DFDs em escopo) — com o ESTADO do item
  // (mesma célula da tabela de itens do banner). Clicar abre o DFD de origem já no item.
  const colsItens: Column<ItemDfdRow>[] = [
    {
      key: "estado",
      header: "Estado",
      nowrap: true,
      value: atributoItem.estado.valor,
      valores: atributoItem.estado.valores,
      render: (r) => {
        const res = resumoEstado(mensagensItem(r, repDoItem(r)));
        if (res.rotulo) return <EstadoResumo res={res} />;
        const e = estadoItem(r);
        return <EstadoPonto cor={estadoItemCor(e)} rotulo={ESTADO_ITEM_ROTULO[e]} />;
      },
    },
    {
      key: "protocolo",
      header: "Protocolo",
      nowrap: true,
      value: atributoItem.protocolo.valor,
      render: (r) =>
        r.protocoloNumero ? (
          <CelulaCopiavel copiar={numeroSemAno(r.protocoloNumero)} rotulo="nº do protocolo">
            <span className="font-mono text-[12px]">{r.protocoloNumero}</span>
          </CelulaCopiavel>
        ) : (
          <span className="text-faint">—</span>
        ),
    },
    ...(modoPca
      ? []
      : [
          {
            key: "pca",
            header: "PCA",
            align: "center" as const,
            nowrap: true,
            value: atributoItem.pca.valor,
            render: (r: ItemDfdRow) => <CelulaPca pca={pcaDe(anoPcaDoDfd(dfdPorId.get(r.dfdId)))} />,
          },
        ]),
    colunaPlanejamento((r: ItemDfdRow) => r.dfdPlanejamento),
    {
      key: "dfd",
      header: "Nº DFD",
      nowrap: true,
      value: atributoItem.dfd.valor,
      render: (r) => (
        <CelulaCopiavel copiar={r.dfdNumero} rotulo="nº do DFD">
          <span className="font-mono text-[12px]">{r.dfdNumero}</span>
        </CelulaCopiavel>
      ),
    },
    {
      key: "sigla",
      header: "Sigla",
      nowrap: true,
      value: atributoItem.sigla.valor,
      render: (r) => (r.sigla ? <span className="font-mono text-[12px] font-semibold text-accent">{r.sigla}</span> : <span className="text-faint">—</span>),
    },
    colunaTipoDfd((r: ItemDfdRow) => r.dfdTipo),
    {
      key: "prioridade",
      header: "Prioridade",
      align: "center",
      nowrap: true,
      value: atributoItem.prioridade.valor,
      render: (r) => <CelulaPrioridade prioridade={dfdPorId.get(r.dfdId)?.prioridade} />,
    },
    { key: "item", header: "Item", align: "center", nowrap: true, value: (r) => String(r.item ?? ""), render: (r) => r.item ?? "—" },
    {
      key: "codigo",
      header: "Código",
      nowrap: true,
      value: (r) => r.codigo ?? "",
      render: (r) => (
        <CelulaCopiavel copiar={r.codigo} rotulo="código do item">
          <span className="font-mono text-[12px]">{r.codigo ?? "—"}</span>
        </CelulaCopiavel>
      ),
    },
    // Conformidade com o CATÁLOGO (veredito do servidor, na cor do nível do ADM; o tipo do DFD de origem conta).
    {
      key: "catalogo",
      header: "Catálogo",
      nowrap: true,
      value: atributoItem.catalogo.valor,
      render: (r) => <CelulaCatalogo conf={r.catalogo} regras={regras} dfdTipo={tipoCurtoDfd(r.dfdTipo)} />,
    },
    // Classificação AUTOMÁTICA (Catálogo → Classificações): pela palavra-chave da descrição ou pela unidade — o motivo na dica.
    ...(classeDoItem
      ? [
          {
            key: "classificacao",
            header: "Classificação",
            nowrap: true,
            value: atributoItem.classificacao.valor,
            render: (r: ItemDfdRow) => <CelulaClassificacao resultado={classeDoItem(r)} />,
          },
        ]
      : []),
    {
      key: "descricao",
      header: "Descrição",
      minWidth: 260,
      value: atributoItem.descricao.valor,
      // Uma linha só (a linha da tabela tem altura fixa); o texto inteiro na dica e no banner do item.
      render: (r) => (
        <CelulaCopiavel copiar={r.descricao} rotulo="descrição do item">
          <span className="line-clamp-1" title={r.descricao ?? undefined}>
            {r.descricao ?? "—"}
          </span>
        </CelulaCopiavel>
      ),
    },
    { key: "unidade", header: "Unidade", nowrap: true, value: atributoItem.unidade.valor, render: (r) => r.unidade ?? "—" },
    // A unidade do item COMPARADA com o cadastro (Catálogo → Unidades de medida): a sigla cadastrada ou "Não cadastrada".
    ...(unidadeDoItem
      ? [
          {
            key: "unidCad",
            header: "Unid. cadastrada",
            nowrap: true,
            value: atributoItem.unidCad.valor,
            render: (r: ItemDfdRow) => <CelulaUnidadeCadastrada texto={r.unidade} unidade={unidadeDoItem(r.unidade).unidade} />,
          },
        ]
      : []),
    { key: "qtd", header: "Qtd.", align: "center", nowrap: true, value: (r) => String(r.quantidade ?? ""), render: (r) => (r.quantidade != null ? num(r.quantidade) : "—") },
    { key: "vunit", header: "Vlr. unit.", align: "right", filter: "range", nowrap: true, numero: (r) => r.valorUnitario, render: (r) => (r.valorUnitario != null ? brl(r.valorUnitario) : "—") },
    { key: "vtotal", header: "Vlr. total", align: "right", filter: "range", nowrap: true, numero: (r) => r.valorTotal, render: (r) => (r.valorTotal != null ? brl(r.valorTotal) : "—") },
  ];

  // Colunas da visão CONSOLIDADA — as MESMAS da visão normal, com os dados dos itens do código JUNTOS na célula (listas
  // com "+N"; até 30 na dica e TODOS no detalhe) e os números agregados: quantidade somada, valor unitário MÉDIO ponderado
  // (+ a variação dos preços) e o total — mais a curva ABC do valor. Os filtros das colunas de ATRIBUTO filtram os ITENS
  // antes de agrupar (`filtroExterno`); os numéricos filtram as linhas.
  type Cons = ItemConsolidado<ItemDfdRow>;
  const infoDe = (l: Cons) => infoConsolidados.get(l.chave) ?? SEM_INFO;
  const MISTAS = "Unidades diferentes — a quantidade e a média misturam unidades; compare por unidade no detalhe.";
  // Ordem da visão consolidada: o PRODUTO e os números primeiro (código, descrição, quantidade, médio, total, ABC); as
  // listas de origem (DFDs, protocolos, unidades…) depois.
  const colsConsolidados: Column<Cons>[] = [
    ...(modoPca
      ? [
          {
            key: "pcaSeq",
            header: "Seq. PCA",
            nowrap: true,
            value: (l: Cons) => infoDe(l).seqsPca[0]?.texto ?? "",
            filtroExterno: filtroExterno("pcaSeq"),
            render: (l: Cons) => <CelulaLista valores={infoDe(l).seqsPca} />,
          },
        ]
      : []),
    {
      key: "estado",
      header: "Estado",
      nowrap: true,
      value: (l) => infoDe(l).estado.rotulo || ESTADO_ITEM_ROTULO.regular,
      filtroExterno: filtroExterno("estado"),
      render: (l) => {
        const e = infoDe(l).estado;
        return e.rotulo ? <EstadoResumo res={e} /> : <EstadoPonto cor={estadoItemCor("regular")} rotulo={ESTADO_ITEM_ROTULO.regular} />;
      },
    },
    {
      key: "codigo",
      header: "Código",
      nowrap: true,
      value: (l) => l.codigo ?? "Sem código",
      filtroExterno: filtroExterno("codigo"),
      render: (l) =>
        l.codigo ? (
          <CelulaCopiavel copiar={l.codigo} rotulo="código do item">
            <span className="font-mono text-[12px]">{l.codigo}</span>
          </CelulaCopiavel>
        ) : (
          <span className="text-faint">Sem código</span>
        ),
    },
    {
      key: "catalogo",
      header: "Catálogo",
      nowrap: true,
      value: (l) => infoDe(l).catalogoRotulo,
      filtroExterno: filtroExterno("catalogo"),
      render: (l) => {
        const pior = infoDe(l).catalogoPior;
        return <CelulaCatalogo conf={pior?.catalogo} regras={regras} dfdTipo={tipoCurtoDfd(pior?.dfdTipo ?? null)} />;
      },
    },
    ...(classeDoItem
      ? [
          {
            key: "classificacao",
            header: "Classificação",
            nowrap: true,
            value: (l: Cons) => infoDe(l).classificacoes.join(" · ") || "—",
            filtroExterno: filtroExterno("classificacao"),
            render: (l: Cons) => <CelulaLista valores={infoDe(l).classificacoes} />,
          },
        ]
      : []),
    {
      key: "descricao",
      header: "Descrição",
      minWidth: 260,
      value: (l) => l.descricoes[0]?.texto ?? "",
      filtroExterno: filtroExterno("descricao"),
      // A mais frequente numa linha só; "+N" = descrições diferentes (na dica e, numeradas, no detalhe).
      render: (l) => (
        <CelulaCopiavel copiar={l.descricoes[0]?.texto} rotulo="descrição do item">
          <span className="flex min-w-0 items-center justify-center gap-1" title={dicaLista(l.descricoes, (d) => `${d.n}× ${d.texto}`) || undefined}>
            <span className="line-clamp-1 min-w-0">{l.descricoes[0]?.texto ?? "—"}</span>
            {l.descricoes.length > 1 && <MaisN n={l.descricoes.length - 1} />}
          </span>
        </CelulaCopiavel>
      ),
    },
    // Unidades diferentes no mesmo código = a quantidade soma unidades distintas → âmbar (atenção).
    {
      key: "unidade",
      header: "Unidade",
      nowrap: true,
      value: (l) => l.unidades.map((u) => u.texto).join(" · "),
      filtroExterno: filtroExterno("unidade"),
      render: (l) =>
        l.unidadesMistas ? (
          <span
            className="inline-flex items-center gap-1 whitespace-nowrap font-medium"
            style={{ color: "var(--warn)" }}
            title={`${MISTAS}\n${dicaLista(l.unidades, (u) => `${u.texto} (${u.n} ${u.n === 1 ? "item" : "itens"})`)}`}
          >
            <IconAlert className="h-3.5 w-3.5 shrink-0" />
            {l.unidades.map((u) => u.texto).join(" · ")}
          </span>
        ) : (
          (l.unidades[0]?.texto ?? "—")
        ),
    },
    ...(unidadeDoItem
      ? [
          {
            key: "unidCad",
            header: "Unid. cadastrada",
            nowrap: true,
            value: (l: Cons) => infoDe(l).unidadesCad.join(" · ") || "—",
            filtroExterno: filtroExterno("unidCad"),
            render: (l: Cons) => <CelulaLista valores={infoDe(l).unidadesCad} />,
          },
        ]
      : []),
    {
      key: "qtd",
      header: "Qtd. total",
      align: "center",
      filter: "range",
      formatarFaixa: num,
      nowrap: true,
      numero: (l) => l.quantidade,
      render: (l) => (l.quantidade != null ? num(l.quantidade) : "—"),
    },
    {
      key: "vmedio",
      header: "Vlr. unit. médio",
      align: "right",
      filter: "range",
      nowrap: true,
      numero: (l) => l.valorMedio,
      render: (l) =>
        l.valorMedio == null ? (
          "—"
        ) : l.unidadesMistas ? (
          <span className="inline-flex items-center gap-1 whitespace-nowrap font-medium" style={{ color: "var(--warn)" }} title={MISTAS}>
            <IconAlert className="h-3.5 w-3.5 shrink-0" />
            {brl(l.valorMedio)}
          </span>
        ) : (
          <span title="Média ponderada pela quantidade (Σ qtd × valor ÷ Σ qtd)">{brl(l.valorMedio)}</span>
        ),
    },
    {
      key: "variacao",
      header: "Variação",
      align: "center",
      filter: "range",
      formatarFaixa: (n) => pct(n, 100),
      nowrap: true,
      numero: (l) => (l.variacao == null ? null : Math.round(l.variacao * 1000) / 10),
      render: (l) =>
        l.unidadesMistas ? (
          <CelulaVariacao cv={l.variacao} nota="Unidades diferentes: a maior variação dentro de uma mesma unidade." />
        ) : (
          <CelulaVariacao cv={l.variacao} min={l.valorMin} max={l.valorMax} n={l.itens.length - l.semValor} />
        ),
    },
    { key: "vtotal", header: "Vlr. total", align: "right", filter: "range", nowrap: true, numero: (l) => l.valorTotal, render: (l) => brl(l.valorTotal) },
    {
      key: "abc",
      header: "ABC",
      align: "center",
      nowrap: true,
      value: (l) => l.abc ?? "—",
      render: (l) => <SeloAbc classe={l.abc} participacao={l.participacao} />,
    },
    // Quantos itens o código junta (a lista DFD · item na dica — até 30 — e inteira no detalhe).
    {
      key: "itens",
      header: "Itens",
      align: "center",
      nowrap: true,
      filter: "range",
      formatarFaixa: num,
      numero: (l) => l.itens.length,
      render: (l) => (
        <span className="tabular-nums" title={dicaLista(l.itens, (it) => `DFD ${it.dfdNumero} · item ${it.item ?? "—"}`)}>
          {num(l.itens.length)}
        </span>
      ),
    },
    {
      key: "planejamento",
      header: "Nº Plan.",
      nowrap: true,
      value: (l) => infoDe(l).planejamentos.join(" · ") || "—",
      filtroExterno: filtroExterno("planejamento"),
      render: (l) => (
        <CelulaCopiavel copiar={juntarParaCopiar(infoDe(l).planejamentos)} rotulo="nº de planejamento" plural="nºs de planejamento">
          <CelulaLista valores={infoDe(l).planejamentos} mono />
        </CelulaCopiavel>
      ),
    },
    {
      key: "dfd",
      header: "Nº DFD",
      nowrap: true,
      value: (l) => infoDe(l).dfds.join(" · "),
      filtroExterno: filtroExterno("dfd"),
      render: (l) => (
        <CelulaCopiavel copiar={juntarParaCopiar(infoDe(l).dfds)} rotulo="nº do DFD" plural="nºs dos DFDs">
          <CelulaLista valores={infoDe(l).dfds} mono />
        </CelulaCopiavel>
      ),
    },
    {
      key: "protocolo",
      header: "Protocolo",
      nowrap: true,
      value: (l) => infoDe(l).protocolos.join(" · ") || "—",
      filtroExterno: filtroExterno("protocolo"),
      // Os nºs SEM o ano, unidos por ":".
      render: (l) => (
        <CelulaCopiavel copiar={juntarParaCopiar(infoDe(l).protocolos.map(numeroSemAno))} rotulo="nº do protocolo" plural="nºs dos protocolos">
          <CelulaLista valores={infoDe(l).protocolos} mono />
        </CelulaCopiavel>
      ),
    },
    {
      key: "sigla",
      header: "Sigla",
      nowrap: true,
      value: (l) => infoDe(l).siglas.join(" · ") || "—",
      filtroExterno: filtroExterno("sigla"),
      render: (l) => <CelulaLista valores={infoDe(l).siglas} mono destaque />,
    },
    // Os tipos são 4 (S/R/O/E): todos à vista, sem "+N".
    {
      key: "tipo",
      header: "Tipo",
      nowrap: true,
      value: (l) => infoDe(l).tipos.join(" · ") || "—",
      filtroExterno: filtroExterno("tipo"),
      render: (l) => <CelulaLista valores={infoDe(l).tipos} max={4} />,
    },
    ...(modoPca
      ? []
      : [
          {
            key: "pca",
            header: "PCA",
            align: "center" as const,
            nowrap: true,
            value: (l: Cons) => infoDe(l).pcas.join(" · ") || "—",
            filtroExterno: filtroExterno("pca"),
            render: (l: Cons) => (
              <CelulaLista valores={infoDe(l).pcas} dica={dicaLista(infoDe(l).pcas, (a) => (a === "—" ? "Sem PCA" : (pcaDe(Number(a))?.nome ?? a)))} />
            ),
          },
        ]),
    {
      key: "prioridade",
      header: "Prioridade",
      align: "center",
      nowrap: true,
      value: (l) => infoDe(l).prioridades.join(" · ") || "—",
      filtroExterno: filtroExterno("prioridade"),
      render: (l) => <CelulaLista valores={infoDe(l).prioridades} max={3} />,
    },
  ];
  // O detalhe mostra TUDO o que a linha resume: as colunas da visão Normal de cada ocorrência (Seq. PCA e Estado antes;
  // Catálogo, PCA e Prioridade depois).
  const colunaNormal = (k: string) => [...(modoPca?.colunasItens ?? []), ...colsItens].find((c) => c.key === k);
  const colunasComposicao = (ks: string[]) => ks.map(colunaNormal).filter((c): c is Column<ItemDfdRow> => !!c);

  // Corpo de cada visão: a TABELA sempre (sem linhas, ela diz por quê). A MESMA altura de linha nas três visões (densidade
  // compacta — a dos controles). A IMPORTAÇÃO (Mesa principal, editores) fica no RODAPÉ da tabela, à
  // esquerda do seletor de linhas; os formulários ficam montados FORA dela, em qualquer visão (recarregar a lista,
  // trocar de visão ou abrir o Dashboard nunca perde uma importação em curso).
  const filtrado = filtroMesaAtivo(filtro);
  const semResultado = "Nada com o responsável/assunto escolhido acima — ajuste ou limpe o filtro.";
  const podeImportar = podeEditar && !modoPca;
  const importa = podeImportar && (vista === "protocolos" || vista === "dfds");
  const oQueImporta = vista === "protocolos" ? "protocolo" : "DFD";
  const rotuloImportar = `Importar ${oQueImporta}`;
  // No celular o rótulo encolhe para "Importar" (o rodapé gruda na tela — cabe numa linha); o nome acessível é o inteiro.
  const botaoImportar = importa ? (
    <Button
      size="sm"
      aria-label={rotuloImportar}
      onClick={() => (vista === "protocolos" ? setAbrirProto : setAbrirDfd)((n) => n + 1)}
      icon={<IconUpload className="h-4 w-4" />}
    >
      Importar<span className="hidden sm:inline"> {oQueImporta}</span>
    </Button>
  ) : null;
  const semDados = (oQue: string, dica = importa) =>
    `Nenhum ${oQue} ${pcaFiltro ? `do ${pcaFiltro.nome} (o PCA do cabeçalho)` : "nesta visão"}.${dica ? " Use “Importar” no rodapé da tabela." : ""}`;
  const tabelaProtocolos = (
    <DataTable
      columns={modoPca?.colunasProtocolo ? [...colsProto, ...modoPca.colunasProtocolo] : colsProto}
      rows={protocolosF}
      getKey={(r) => r.id}
      selectable={podeEditar}
      selected={selProtos}
      onSelected={setSelProtos}
      onRowClick={(r) => setAberto({ tipo: "protocolo", id: r.id })}
      activeKey={aberto?.tipo === "protocolo" ? aberto.id : null}
      scrollInterno
      reservaInferior={reserva}
      minWidth={modoPca ? 1380 : 1450}
      density="compact"
      acoesRodape={botaoImportar}
      vazio={filtrado && protocolos.length > 0 ? semResultado : semDados("protocolo")}
      resumo={(linhas) =>
        modoPca?.rodapeProtocolos
          ? modoPca.rodapeProtocolos(linhas)
          : `${linhas.length} protocolo${linhas.length === 1 ? "" : "s"} · ${num(linhas.reduce((s, p) => s + p.totalDfds, 0))} DFDs · ${brl(
              linhas.reduce((s, p) => s + p.valorTotal, 0),
            )}`
      }
    />
  );
  const tabelaDfds = (
    <PlanilhaDfds
      linhas={linhasDfdTab}
      unica
      scrollInterno
      reservaInferior={reserva}
      selecionavel={podeEditar}
      selected={selDfds}
      onSelected={setSelDfds}
      onRowClick={(id) => setAberto({ tipo: "dfd", id })}
      ativa={aberto?.tipo === "dfd" ? aberto.id : null}
      acoes={acoesDfd}
      regras={regras}
      acoesRodape={botaoImportar}
      vazio={filtrado && dfds.length > 0 ? semResultado : semDados("DFD")}
    />
  );
  // As colunas da padronização (só com o cadastro) alargam as tabelas de itens.
  const larguraPadronizacao = (classeDoItem ? 150 : 0) + (unidadeDoItem ? 130 : 0);
  const tabelaItens = (
    <DataTable
      columns={modoPca?.colunasItens ? [...modoPca.colunasItens, ...colsItens] : colsItens}
      rows={itensF ?? []}
      getKey={(r) => r.id}
      selectable={podeEditar}
      selected={selItens}
      onSelected={setSelItens}
      onRowClick={(r) => setAberto({ tipo: "item", dfdId: r.dfdId, itemId: r.id, item: { item: r.item, codigo: r.codigo } })}
      activeKey={aberto?.tipo === "item" ? aberto.itemId : null}
      scrollInterno
      reservaInferior={reserva}
      minWidth={(modoPca ? 1280 : 1460) + larguraPadronizacao}
      density="compact"
      vazio={carregandoItens || itensF === null ? "Carregando itens…" : filtrado && (itens?.length ?? 0) > 0 ? semResultado : semDados("item", false)}
      resumo={(linhas) => `${num(linhas.length)} ${linhas.length === 1 ? "item" : "itens"} · ${brl(linhas.reduce((s, i) => s + (i.valorTotal ?? 0), 0))}`}
    />
  );
  // Visão CONSOLIDADA: uma linha por código (na ordem do valor — a curva ABC), SÓ leitura (a edição é item a item);
  // tocar numa linha abre o detalhe da composição. O rodapé soma os itens das linhas à vista — sem filtro de número, o MESMO
  // total da visão Normal com os mesmos filtros de dado.
  const tabelaConsolidada = (
    <DataTable
      columns={colsConsolidados}
      rows={consolidados ?? []}
      getKey={(l) => l.chave}
      onRowClick={(l) => setComposicao(l.chave)}
      activeKey={composicao}
      scrollInterno
      reservaInferior={reserva}
      minWidth={(modoPca ? 1640 : 1720) + larguraPadronizacao}
      density="compact"
      vazio={
        carregandoItens || itensF === null
          ? "Carregando itens…"
          : Object.keys(filtrosItem).length > 0
            ? "Nenhum item com os filtros das colunas — ajuste-os ou use “Limpar filtros”."
            : filtrado && (itens?.length ?? 0) > 0
              ? semResultado
              : semDados("item", false)
      }
      resumo={(linhas) => {
        const semCodigo = linhas.filter((l) => l.codigo == null).length;
        const nItens = linhas.reduce((s, l) => s + l.itens.length, 0);
        const codigos = linhas.length - semCodigo;
        return `${num(codigos)} ${codigos === 1 ? "código" : "códigos"}${semCodigo ? ` · ${num(semCodigo)} sem código` : ""} · ${num(nItens)} ${
          nItens === 1 ? "item" : "itens"
        } · ${brl(linhas.reduce((s, l) => s + l.valorTotal, 0))}`;
      }}
    />
  );

  // Barra de SELEÇÃO FIXA no rodapé do display (visão atual): registro das seleções (chips removíveis) +
  // somatório R$ + o editor de massa da visão. Só para editores.
  const progressoMassa = aplicandoMassa && (
    <div className="mb-2">
      <Progress
        value={(aplicandoMassa.feito / Math.max(1, aplicandoMassa.total)) * 100}
        label={`Aplicando em ${num(aplicandoMassa.total)} ${aplicandoMassa.rotulo}… ${num(aplicandoMassa.feito)} de ${num(aplicandoMassa.total)}`}
      />
    </div>
  );
  const tirar = (set: (f: (s: Sel) => Sel) => void) => (k: string | number) => set((s) => new Set([...s].filter((x) => x !== k)));
  let barraSelecao: ReactNode = null;
  if (podeEditar && vista === "dfds" && (selDfds.size > 0 || aplicandoMassa)) {
    const sel = dfdsF.filter((d) => selDfds.has(d.id));
    barraSelecao = (
      <BarraSelecaoDfds
        fixa
        onAltura={setAlturaBarra}
        bloqueada={!!aplicandoMassa}
        dfds={sel.map((d) => ({ key: d.id, numero: d.numero, planejamento: d.planejamento, valor: d.valorTotal, itens: d.totalItens }))}
        onRemover={tirar(setSelDfds)}
        onLimpar={() => setSelDfds(new Set())}
      >
        {progressoMassa}
        <BarraEdicaoMassa reparticoes={reparticoes} regras={regras} aplicando={!!aplicandoMassa} onAplicar={aplicarMassa} />
      </BarraSelecaoDfds>
    );
  } else if (podeEditar && vista === "protocolos" && (selProtos.size > 0 || aplicandoMassa)) {
    const sel = protocolosF.filter((p) => selProtos.has(p.id));
    barraSelecao = (
      <BarraSelecao
        fixa
        onAltura={setAlturaBarra}
        bloqueada={!!aplicandoMassa}
        registros={sel.map((p) => ({ key: p.id, rotulo: `Protocolo ${p.numero}` }))}
        onRemover={tirar(setSelProtos)}
        onLimpar={() => setSelProtos(new Set())}
        acoes={
          modoPca ? (
            modoPca.acoesProtocolos?.(sel, () => setSelProtos(new Set()))
          ) : (
            <EnviarAoPca selecionados={sel} pcas={pcas} onConcluido={() => setSelProtos(new Set())} />
          )
        }
        resumo={
          <ResumoSelecao
            qtd={sel.length}
            singular="protocolo"
            plural="protocolos"
            soma={sel.reduce((t, p) => t + p.valorTotal, 0)}
            extra={`${num(sel.reduce((t, p) => t + p.totalDfds, 0))} DFDs`}
          />
        }
      >
        {/* Na Mesa do PCA a seleção de protocolos só incorpora/devolve (sem edição em massa). */}
        {!modoPca && (
          <>
            {progressoMassa}
            <BarraEdicaoMassaProtocolos
              reparticoes={reparticoes}
              pessoas={opcoesPessoas}
              situacoes={situacoes}
              regras={regras}
              aplicando={!!aplicandoMassa}
              onAplicar={aplicarMassaProtocolos}
            />
          </>
        )}
      </BarraSelecao>
    );
  } else if (podeEditar && vista === "itens" && !consolidada && (selItens.size > 0 || aplicandoMassa)) {
    const sel = (itensF ?? []).filter((it) => selItens.has(it.id));
    barraSelecao = (
      <BarraSelecao
        fixa
        onAltura={setAlturaBarra}
        bloqueada={!!aplicandoMassa}
        registros={sel.map((it) => ({ key: it.id, rotulo: `DFD ${it.dfdNumero} · item ${it.item ?? "—"}` }))}
        onRemover={tirar(setSelItens)}
        onLimpar={() => setSelItens(new Set())}
        resumo={<ResumoSelecao qtd={sel.length} singular="item" plural="itens" soma={sel.reduce((t, it) => t + (it.valorTotal ?? 0), 0)} />}
        acoes={modoPca?.acoesItens?.(sel, () => setSelItens(new Set()))}
      >
        {/* Item INCORPORADO (com nº no PCA) é somente leitura — o editor de massa só vale para os não incorporados. */}
        {sel.every((it) => it.pcaSequencial == null) && (
          <>
            {progressoMassa}
            <BarraEdicaoMassaItens aplicando={!!aplicandoMassa} onAplicar={aplicarMassaItens} />
          </>
        )}
      </BarraSelecao>
    );
  }

  return (
    <div className="space-y-[var(--gap-block)]">
      {/* Falha de uma ação da Mesa (excluir, edição em massa…) — AVISO FLUTUANTE: não empurra as tabelas. */}
      {erro && (
        <AvisoFlutuante kind="danger" titulo="Não foi possível concluir" onClose={() => setErro(null)}>
          {erro}
        </AvisoFlutuante>
      )}

      {/* BARRA DA MESA (uma linha): à esquerda, as visões — o DASHBOARD (só o ícone, antes de Protocolos · DFDs · Itens;
          fora da Mesa do PCA) — + a ferramenta do PCA; à direita, os FILTROS DE HIERARQUIA — responsável e assunto do
          protocolo, que valem para todas as visões (e o Dashboard) e travam as colunas correspondentes da tabela de
          protocolos. */}
      <div className="flex flex-wrap items-center gap-2">
        <Segmented<Vista>
          value={vista}
          onChange={setVista}
          ariaLabel="Visões da Mesa"
          options={[
            ...(modoPca ? [] : [{ value: "dashboard" as const, label: "Dashboard de governança", icone: <IconDashboard className="h-4 w-4" />, soIcone: true }]),
            { value: "protocolos", label: "Protocolos" },
            { value: "dfds", label: "DFDs" },
            { value: "itens", label: "Itens" },
          ]}
        />
        {modoPca?.ferramenta}
        {/* Só na visão Itens: Normal (um por linha) | Consolidada (um por código). */}
        {vista === "itens" && (
          <Segmented<ModoItens>
            value={modoItens}
            onChange={setModoItens}
            ariaLabel="Visão dos itens"
            options={[
              { value: "normal", label: "Normal" },
              { value: "consolidada", label: "Consolidada" },
            ]}
          />
        )}
        <div className="ml-auto flex items-center gap-2">
          <SeletorFiltro
            icone={
              typeof filtro.responsavel === "number" ? (
                <Avatar nome={pessoaDe(filtro.responsavel)?.nome ?? "?"} foto={pessoaDe(filtro.responsavel)?.foto} size="xs" />
              ) : filtro.responsavel === "sem" ? (
                <IconUserX className="h-4 w-4" />
              ) : (
                <IconUser className="h-4 w-4" />
              )
            }
            rotulo="Responsável"
            valor={String(filtro.responsavel)}
            ativo={filtro.responsavel !== "todos"}
            onChange={(v) => setFiltro((f) => ({ ...f, responsavel: v === "todos" || v === "sem" ? v : Number(v) }))}
            opcoes={[
              { valor: "todos", rotulo: "Todos" },
              { valor: "sem", rotulo: "Sem responsável" },
              ...opcoesResponsavel.map((x) => ({ valor: String(x.id), rotulo: rotuloOpcaoPessoa(x, usuarioId) })),
            ]}
          />
          <SeletorFiltro
            icone={<IconFilter className="h-4 w-4" />}
            rotulo="Assunto"
            valor={filtro.assunto == null ? "__todos" : filtro.assunto}
            ativo={filtro.assunto != null}
            onChange={(v) => setFiltro((f) => ({ ...f, assunto: v === "__todos" ? null : v }))}
            opcoes={[
              { valor: "__todos", rotulo: "Todos" },
              ...opcoesAssunto.map((a) => ({ valor: a, rotulo: a || "Sem assunto" })),
            ]}
          />
          {filtrado && (
            <Button variant="ghost" size="sm" onClick={() => setFiltro(FILTRO_MESA_TODOS)}>
              Limpar filtros
            </Button>
          )}
        </div>
      </div>

      {/* MESMO espaço para as visões — a `key` remonta e replaya o morph (fade+escala); Normal ↔ Consolidada também. */}
      <div key={vista === "itens" ? `itens-${modoItens}` : vista} className="animate-cat-morph">
        {vista === "dashboard" && dash ? (
          <DashboardMesa
            protocolos={dash.protocolos}
            dfds={dash.dfds}
            pessoas={dash.pessoas}
            situacoes={situacoes}
            regras={regras}
            responsavel={filtro.responsavel}
            onResponsavel={(responsavel) => setFiltro((f) => ({ ...f, responsavel }))}
            onAbrir={setAberto}
          />
        ) : vista === "protocolos" ? (
          tabelaProtocolos
        ) : vista === "dfds" ? (
          tabelaDfds
        ) : consolidada ? (
          tabelaConsolidada
        ) : (
          tabelaItens
        )}
      </div>

      {/* Formulários de IMPORTAÇÃO (Mesa principal, editores): os botões ficam no rodapé das tabelas; aqui, fora delas e
          em QUALQUER visão, só lançador, análise e avisos (modais/avisos flutuantes — nada no fluxo da página). */}
      {podeImportar && (
        <>
          <ProtocoloUploadForm
            iniciar={abrirProto}
            reparticoes={reparticoes}
            reparticaoAtivaId={reparticaoAtivaId}
            pcas={pcas}
            regras={regras}
            orgaos={orgaos}
          />
          <DfdUploadForm iniciar={abrirDfd} reparticoes={reparticoes} reparticaoAtivaId={reparticaoAtivaId} pcas={pcas} regras={regras} orgaos={orgaos} />
        </>
      )}

      {barraSelecao}

      {/* Detalhe da linha CONSOLIDADA (composição do código); tocar numa ocorrência abre o item na pilha, por cima. */}
      <ComposicaoItem
        linha={linhaComposicao}
        onFechar={() => setComposicao(null)}
        onAbrirItem={(it) => setAberto({ tipo: "item", dfdId: it.dfdId, itemId: it.id, item: { item: it.item, codigo: it.codigo } })}
        colunasAntes={colunasComposicao(["pcaSeq", "estado"])}
        colunasDepois={colunasComposicao(["catalogo", "classificacao", "unidCad", "pca", "prioridade"])}
      />

      {/* PILHA DE BANNERS do GRAVADO — os MESMOS componentes/conferência da análise, em ORDEM FIXA
          Protocolo | DFD | Item: cada "Ver …" surge no seu lugar, qualquer que seja o banner de entrada. */}
      <BannersMesa
        abrir={aberto}
        onFechar={() => setAberto(null)}
        podeEditar={podeEditar}
        reparticoes={reparticoes}
        reparticaoAtivaId={reparticaoAtivaId}
        regras={regras}
        orgaos={orgaos}
        onAlterado={atualizarListas}
        pcas={pcas}
        onAbrir={setAberto}
      />

      {/* Vincular DFD a um protocolo (rule 4) */}
      <Modal
        open={!!vincAlvo}
        onClose={() => setVincAlvo(null)}
        titulo={vincAlvo ? `Vincular DFD ${vincAlvo.numero}` : ""}
        size="md"
        rodape={
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setVincAlvo(null)} disabled={salvandoVinc}>
              Cancelar
            </Button>
            <Button onClick={salvarVincular} loading={salvandoVinc}>
              Salvar
            </Button>
          </div>
        }
      >
        <div className="space-y-3">
          <span className={labelCls}>Protocolo</span>
          <SeletorBusca
            ariaLabel="Protocolo de destino"
            placeholder="Pesquisar nº, Id, assunto, interessado ou unidade…"
            opcoes={opcoesVinculo}
            valor={vincSel == null ? "" : String(vincSel)}
            onChange={(v) => setVincSel(v ? Number(v) : null)}
            disabled={salvandoVinc}
          />
          <p className="text-xs text-faint">
            {protocolos.length === 0
              ? "Nenhum protocolo cadastrado ainda — crie um na aba Protocolos."
              : 'Vincule este DFD a um protocolo, ou escolha "Nenhum" para desvincular.'}
          </p>
        </div>
      </Modal>
    </div>
  );
}
