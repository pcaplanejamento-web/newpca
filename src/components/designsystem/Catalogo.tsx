"use client";

import { type ReactNode, useEffect, useState } from "react";
import { AcessoRestrito } from "@/components/AcessoRestrito";
import { Avatar } from "@/components/Avatar";
import { Badge } from "@/components/Badge";
import { Button } from "@/components/Button";
import { Callout } from "@/components/Callout";
import { ChartCard } from "@/components/ChartCard";
import { ClassificacaoChart } from "@/components/charts/ClassificacaoChart";
import { MensalChart } from "@/components/charts/MensalChart";
import { MetricasChart } from "@/components/charts/MetricasChart";
import { TopItensChart } from "@/components/charts/TopItensChart";
import { UnidadeChart } from "@/components/charts/UnidadeChart";
import { ColorField } from "@/components/ColorField";
import { type Column, DataTable } from "@/components/DataTable";
import { DfdCabecalho, DfdView, type DfdVisualItem } from "@/components/DfdView";
import { PcaCompilacaoView } from "@/components/PcaCompilacaoView";
import { PcaPicker } from "@/components/PcaPicker";
import { ProtocoloCabecalho, ProtocoloView } from "@/components/ProtocoloView";
import { EmConstrucao } from "@/components/EmConstrucao";
import { Checkbox, PasswordField, SearchField, TextArea, TextField } from "@/components/Field";
import { FilterChip } from "@/components/FilterChip";
import { Progress } from "@/components/Progress";
import { Skeleton, SkeletonLinhas } from "@/components/Skeleton";
import { ThemeToggle } from "@/components/ThemeToggle";
import * as Icons from "@/components/icons";
import {
  IconAlert,
  IconArrowRight,
  IconBox,
  IconCheck,
  IconClipboard,
  IconClock,
  IconFile,
  IconLayers,
  IconLock,
  IconMail,
  IconPlus,
  IconTrash,
  IconUpload,
  IconWallet,
} from "@/components/icons";
import { CampoNumero, CampoTexto, useCadeados } from "@/components/CampoCadeado";
import { KpiStat } from "@/components/KpiStat";
import { LinkCard } from "@/components/LinkCard";
import { LinkExterno } from "@/components/LinkExterno";
import { ItemDetalhe } from "@/components/ItemDetalhe";
import { CatalogoItemDetalhe } from "@/components/CatalogoItemDetalhe";
import { Historico } from "@/components/Historico";
import { OrcamentoItemDetalhe } from "@/components/OrcamentoItemDetalhe";
import type { LinhaAuditoria } from "@/lib/auditoria";
import type { ConferenciaItem } from "@/lib/catalogo-conferencia";
import { TipoDfdPicker } from "@/components/TipoDfdPicker";
import { BotaoVerMensagens, MensagensDfd } from "@/components/MensagensDfd";
import { Dropzone } from "@/components/Dropzone";
import { ResponsaveisEditor } from "@/components/ResponsaveisEditor";
import type { Responsaveis } from "@/lib/reparticao-responsaveis";
import { Modal } from "@/components/Modal";
import { MultiSelectHeader } from "@/components/MultiSelectHeader";
import { Pager } from "@/components/Pager";
import { PeriodoPicker } from "@/components/PeriodoPicker";
import { PlanilhaDfds } from "@/components/PlanilhaDfds";
import { RelatorioErros } from "@/components/RelatorioErros";
import { Segmented } from "@/components/Segmented";
import { StatCard } from "@/components/StatCard";
import { StatMini } from "@/components/StatMini";
import { NaturezaTag, SituacaoDot } from "@/components/StatusTag";
import { Tabs } from "@/components/Tabs";
import { toast } from "@/components/Toast";
import { TokenEditor } from "./TokenEditor";

// Biblioteca de componentes (fonte única, spec §39.25) — rota pública
// `/design-system`. Mostra TODO componente do sistema (botões, ícones, status,
// KPIs, tabelas, filtros, cor, abas, toasts…), por token, claro/escuro, touch e
// responsivo. `?view=frame` renderiza só a vitrine (usado no preview mobile).

// Conferência de catálogo de exemplo p/ o ItemDetalhe (divergente: descrição + unidade
// diferentes; referência com tipos). Chave = código normalizado do item.
const DEMO_ITEM_CONFORMIDADE = new Map<string, ConferenciaItem>([
  [
    "5241937264",
    {
      faltas: ["divergenteCatalogo"],
      divergDescricao: true,
      divergUnidade: true,
      sugestao: {
        codigo: "5241937264",
        codigoRaw: "5241937264",
        descricao: "GUINDASTE HIDRÁULICO AUTOPROPELIDO — GRANDE PORTE, LANÇA DE 50 METROS",
        unidade: "DIÁRIA",
        tipos: ["DFD-S", "DFD-R"],
        catalogoNome: "Serviços de Locação",
        score: 1,
      },
    },
  ],
]);

function Secao({ titulo, children }: { titulo: string; children: ReactNode }) {
  return (
    <section className="mt-8">
      <h2 className="mb-3 text-[13px] font-semibold uppercase tracking-[0.06em] text-faint">
        {titulo}
      </h2>
      <div className="rounded-card border border-border bg-surface p-4 shadow-ring sm:p-5">{children}</div>
    </section>
  );
}

/** Demo do painel de item EDITÁVEL (importação/gravado destravado). */
function ItemDetalheEditDemo() {
  const [item, setItem] = useState<DfdVisualItem>({
    item: 2,
    codigo: "5241937264",
    descricao: "GUINDASTE HIDRÁULICO AUTOPROPELIDO (MODELO 2 – GRANDE PORTE), LANÇA 50 M",
    unidade: "DIAS",
    quantidade: 20,
    valorUnitario: 8000,
    valorTotal: 160000,
  });
  // Com conferência de catálogo: Código fica BLOQUEADO (igual ao catálogo); Descrição/Unidade
  // divergentes ficam destraváveis; Quantidade/Valores sempre livres.
  return (
    <ItemDetalhe
      item={item}
      editavel
      tipo="DFD-S"
      conformidade={DEMO_ITEM_CONFORMIDADE}
      onChange={(patch) => setItem((it) => ({ ...it, ...patch }))}
    />
  );
}

/** Demo dos primitivos de CAMPO COM CADEADO (por campo) — reusados na capa e no DFD. */
function CampoCadeadoDemo() {
  const [interessado, setInteressado] = useState("COORDENAÇÃO DE PLANEJAMENTO DAS CONTRATAÇÕES");
  const [valor, setValor] = useState<number | null>(50);
  const { abertos, alternar } = useCadeados<"interessado" | "valor">();
  const props = (k: "interessado" | "valor") => ({
    editavel: true,
    aberto: abertos.has(k),
    bloqueado: false,
    onLock: () => alternar(k),
  });
  return (
    <dl className="grid max-w-md gap-x-6 gap-y-3 sm:grid-cols-2">
      {/* Identificador: sem cadeado (só-leitura permanente) */}
      <CampoTexto
        label="Id (identificador — travado)"
        valor="2312764"
        mono
        editavel={false}
        aberto={false}
        bloqueado
        onLock={() => {}}
        onChange={() => {}}
      />
      <CampoNumero label="Valor (capa)" valor={valor} moeda {...props("valor")} onChange={setValor} />
      <CampoTexto label="Interessado (destravável)" valor={interessado} span {...props("interessado")} onChange={setInteressado} />
    </dl>
  );
}

// Trilha de auditoria de exemplo p/ o Historico (edição com diff, importação, login).
const DEMO_HISTORICO: LinhaAuditoria[] = [
  {
    id: 3,
    usuarioId: 1,
    usuarioNome: "Ana Souza",
    usuarioEmail: "ana@rioverde.go.gov.br",
    acao: "editar",
    entidade: "dfd_item",
    entidadeId: 87,
    resumo: "Item 2: descrição e unidade alteradas",
    antes: JSON.stringify({ Descrição: "GUINDASTE HIDRAULICO", Unidade: "UN" }),
    depois: JSON.stringify({ Descrição: "GUINDASTE HIDRÁULICO AUTOPROPELIDO", Unidade: "DIAS" }),
    criadoEm: "2026-09-17 11:24:03",
  },
  {
    id: 2,
    usuarioId: 1,
    usuarioNome: "Ana Souza",
    usuarioEmail: "ana@rioverde.go.gov.br",
    acao: "importar",
    entidade: "dfd",
    entidadeId: 87,
    resumo: "DFD 000123/2026 importado (12 itens)",
    antes: null,
    depois: null,
    criadoEm: "2026-09-17 11:20:41",
  },
  {
    id: 1,
    usuarioId: 4,
    usuarioNome: "Carlos Lima",
    usuarioEmail: "carlos@rioverde.go.gov.br",
    acao: "login",
    entidade: "sessao",
    entidadeId: null,
    resumo: "Entrou na plataforma",
    antes: null,
    depois: null,
    criadoEm: "2026-09-17 08:03:12",
  },
];

/** Demo do seletor de tipos de DFD (conjunto, controlado). */
function TipoDfdPickerDemo() {
  const [tipos, setTipos] = useState<string[]>(["DFD-R"]);
  return <TipoDfdPicker value={tipos} onChange={setTipos} />;
}

/** Demo do seletor de PCA (controlado) — pré-selecionado pela detecção "PCA 2026". */
function PcaPickerDemo() {
  const [ano, setAno] = useState<number | null>(2026);
  return (
    <PcaPicker
      pcas={[
        { id: 1, nome: "PCA 2026", ano: 2026 },
        { id: 2, nome: "PCA 2027", ano: 2027 },
      ]}
      value={ano}
      detectado={2026}
      onChange={setAno}
    />
  );
}

function Swatch({ nome, token }: { nome: string; token: string }) {
  return (
    <div className="min-w-0">
      <div className="h-12 rounded-control border border-border-2" style={{ background: `var(${token})` }} />
      <div className="mt-1 truncate text-[11px] text-muted" title={token}>
        {nome}
      </div>
    </div>
  );
}

const NEUTROS: [string, string][] = [
  ["bg", "--bg"], ["surface", "--surface"], ["surface-2", "--surface-2"], ["text", "--text"],
  ["text-2", "--text-2"], ["muted", "--muted"], ["faint", "--faint"], ["border", "--border"],
  ["border-2", "--border-2"], ["accent", "--accent"], ["accent-soft", "--accent-soft"],
];
const SEMANTICAS: [string, string][] = [
  ["exclusão", "--nat-exclusao"], ["inclusão 26", "--nat-inclusao-2026"], ["inclusão 27", "--nat-inclusao-2027"],
  ["correção", "--nat-correcao"], ["comunicação", "--nat-comunicacao"], ["em análise", "--sit-em-analise"],
  ["finalizado", "--sit-finalizado"], ["devolvido", "--sit-devolvido"], ["cancelado", "--sit-cancelado"],
];
const NATUREZAS = ["EXCLUSÃO", "INCLUSÃO 2026", "INCLUSÃO 2027", "CORREÇÃO", "COMUNICAÇÃO INTERNA"];
const SITUACOES = [
  { v: "em_analise", l: "Em análise" }, { v: "em_andamento", l: "Em andamento" },
  { v: "finalizado", l: "Finalizado" }, { v: "devolvido", l: "Devolvido" }, { v: "cancelado", l: "Cancelado" },
];
const ORGAOS = [
  "Secretaria Municipal de Saúde", "Secretaria Municipal de Educação", "Secretaria de Infraestrutura",
  "Procuradoria-Geral do Município", "Gabinete do Prefeito", "Secretaria de Meio Ambiente",
  "Secretaria de Assistência Social",
];
const ICONES = (
  Object.entries(Icons) as [string, (p: { className?: string }) => ReactNode][]
).filter(([k]) => k.startsWith("Icon"));

type Proto = {
  id: number;
  data: string;
  orgao: string;
  sigla: string;
  natureza: string;
  responsavel: string;
  situacao: string;
};
const SIT_LABEL: Record<string, string> = {
  em_analise: "Em análise",
  em_andamento: "Em andamento",
  finalizado: "Finalizado",
  devolvido: "Devolvido",
  cancelado: "Cancelado",
};
const PROTOS: Proto[] = [
  { id: 118223, data: "02/09/2026", orgao: "Secretaria Municipal de Saúde", sigla: "SMS", natureza: "INCLUSÃO 2027", responsavel: "Naty", situacao: "em_analise" },
  { id: 115282, data: "28/08/2026", orgao: "Secretaria Municipal de Educação", sigla: "SME", natureza: "EXCLUSÃO", responsavel: "Cris", situacao: "finalizado" },
  { id: 117904, data: "30/08/2026", orgao: "Secretaria de Infraestrutura", sigla: "SEINFRA", natureza: "CORREÇÃO", responsavel: "Thamires", situacao: "em_analise" },
  { id: 116540, data: "25/08/2026", orgao: "Diretoria de Logística e Transporte", sigla: "DLT", natureza: "INCLUSÃO 2026", responsavel: "Naty", situacao: "devolvido" },
  { id: 118990, data: "04/09/2026", orgao: "Secretaria Municipal da Fazenda", sigla: "SEFAZ", natureza: "COMUNICAÇÃO INTERNA", responsavel: "", situacao: "em_analise" },
  { id: 113220, data: "12/08/2026", orgao: "Gabinete do Prefeito", sigla: "GAB", natureza: "EXCLUSÃO", responsavel: "Naty", situacao: "cancelado" },
];
const COLUNAS: Column<Proto>[] = [
  {
    key: "data",
    header: "Data",
    minWidth: 110,
    filter: "date",
    value: (r) => r.data.split("/").reverse().join("-"),
    render: (r) => <span className="font-mono text-[12px] text-muted">{r.data}</span>,
  },
  {
    key: "id",
    header: "Protocolo",
    minWidth: 100,
    value: (r) => String(r.id),
    render: (r) => <span className="font-mono font-semibold text-text">{r.id}</span>,
  },
  {
    key: "orgao",
    header: "Órgão",
    minWidth: 220,
    filterOptions: ORGAOS,
    value: (r) => r.orgao,
    render: (r) => (
      <div className="min-w-0">
        <div className="truncate font-medium text-text">{r.orgao}</div>
        <div className="text-[11px] text-faint">{r.sigla}</div>
      </div>
    ),
  },
  {
    key: "natureza",
    header: "Natureza",
    minWidth: 172,
    value: (r) => r.natureza,
    render: (r) => <NaturezaTag natureza={r.natureza} />,
  },
  {
    key: "responsavel",
    header: "Responsável",
    minWidth: 150,
    value: (r) => r.responsavel || "—",
    render: (r) =>
      r.responsavel ? (
        <div className="flex items-center gap-2">
          <Avatar nome={r.responsavel} size="sm" />
          <span className="text-text-2">{r.responsavel}</span>
        </div>
      ) : (
        <span className="text-faint">—</span>
      ),
  },
  {
    key: "situacao",
    header: "Situação",
    minWidth: 130,
    value: (r) => SIT_LABEL[r.situacao] ?? "—",
    render: (r) => <SituacaoDot situacao={r.situacao} label={SIT_LABEL[r.situacao] ?? "—"} />,
  },
];

const G_CLASS = [
  { label: "Serviço", total: 24_200_000, count: 225 },
  { label: "Obras e Instalações", total: 24_100_000, count: 130 },
  { label: "Prestação de Serviço", total: 18_600_000, count: 173 },
  { label: "Material de Expediente", total: 16_100_000, count: 150 },
  { label: "Material Elétrico", total: 7_100_000, count: 66 },
  { label: "Consumo", total: 6_300_000, count: 59 },
];
const G_MES = [
  { ano: 2027, mes: 1, total: 92_000_000, count: 210 },
  { ano: 2027, mes: 3, total: 4_000_000, count: 40 },
  { ano: 2027, mes: 4, total: 8_000_000, count: 55 },
  { ano: 2027, mes: 6, total: 6_500_000, count: 48 },
  { ano: 2027, mes: 7, total: 11_800_000, count: 62 },
];
const G_TOP = [
  { nome: "Energia elétrica", valor: 11_800_000, quantidade: 12, unidadeMedida: "MWh", codigo: "0001" },
  { nome: "Auxiliar de serviços gerais", valor: 8_400_000, quantidade: 40, unidadeMedida: "posto", codigo: "0002" },
  { nome: "Fornecimento e instalação de equipamentos", valor: 6_100_000, quantidade: 8, unidadeMedida: "un", codigo: "0003" },
  { nome: "Reforma da rodoviária", valor: 4_900_000, quantidade: 1, unidadeMedida: "obra", codigo: "0004" },
  { nome: "Reforma de ecoponto", valor: 4_200_000, quantidade: 1, unidadeMedida: "obra", codigo: "0005" },
];
const G_UNID = [
  { label: "Unidade", total: 60_000_000, count: 520 },
  { label: "Mês", total: 12_000_000, count: 120 },
  { label: "Kg", total: 5_000_000, count: 70 },
  { label: "Metro", total: 3_000_000, count: 44 },
  { label: "Serviço", total: 2_400_000, count: 30 },
];

// Dados de exemplo p/ as vitrines de DFD/PCA (o upload em si — que carrega o
// SheetJS — fica fora do catálogo, como o UploadForm, para não pesar esta rota).
const DFD_ITENS_DEMO = [
  { id: 1, item: 1, codigo: "5241937263", descricao: "GUINDASTE HIDRÁULICO AUTOPROPELIDO (MODELO 1 – MÉDIO PORTE), LANÇA 28,80 M", unidade: "DIAS", quantidade: 56, valorUnitario: 3256.12, valorTotal: 182342.72 },
  { id: 2, item: 2, codigo: "5241937264", descricao: "GUINDASTE HIDRÁULICO AUTOPROPELIDO (MODELO 2 – GRANDE PORTE), LANÇA 50 M", unidade: "DIAS", quantidade: 20, valorUnitario: 8000, valorTotal: 160000 },
];

const DFD_DEMO = {
  id: 1,
  numero: "1586",
  planejamento: "1639",
  tipo: "DFD-S — Solução / com ETP",
  objeto: "AQUISIÇÃO DE SERVIÇO",
  orgaoEntidade: "PREFEITURA MUNICIPAL DE RIO VERDE",
  setorRequisitante: "SMIR - SECRETARIA MUNICIPAL DE INFRAESTRUTURA RURAL",
  responsavel: "CLAUDIO LUIZ DE SOUSA",
  matricula: "1043055",
  email: "claudioluiz99685320@gmail.com",
  telefone: "(64) 99968-5320",
  anoPca: 2026,
  numeroContrato: null,
  numeroAta: null,
  numeroLicitacao: null,
  valorEstimado: 342342.72,
  valorTotal: 342342.72,
  totalItens: 2,
  atualizadoEm: null,
  reparticaoId: 1,
  reparticaoCodigo: "SMIR",
  reparticaoNome: "Secretaria Municipal de Infraestrutura Rural",
  secoes: [
    { numero: 2, titulo: "IDENTIFICAÇÃO DA DEMANDA", texto: "DISPENSA DE LICITAÇÃO PARA CONTRATAÇÃO DE ITENS FRACASSADOS, PROCESSO Nº 92654/2025." },
    { numero: 3, titulo: "JUSTIFICATIVA DA NECESSIDADE DA AQUISIÇÃO", texto: "A malha viária rural depende de içamento de peças pré-moldadas; o Município não dispõe de guindaste próprio." },
    { numero: 4, titulo: "QUANTIDADE DE MATERIAL/SERVIÇOS A SER CONTRATADA", texto: "O quantitativo foi definido com base no levantamento das necessidades das unidades, considerando a reposição de itens obsoletos e as demandas operacionais." },
    { numero: 7, titulo: "FUNDAMENTAÇÃO LEGAL", texto: "LEI 14.133/2021." },
  ],
  assinaturas: {
    lista: [
      {
        nome: "ISAAC PIRES CABRAL",
        eCpf: "***.390.771-**",
        usuario: "isaac.pires",
        local: "BR",
        data: "31/08/2026 16:20:00",
        ip: "",
        codigo: "PBfGdg58teX",
        url: "https://servicos.rioverde.go.gov.br/servicos/autenticacaorelatorios",
        fonte: "certificado" as const,
      },
      {
        // Formato C — Dropsigner (Lacuna): card em TONS DE AZUL + rótulo + link de validação.
        nome: "ANDERSON FERREIRA DE MORAIS",
        eCpf: "***.997.391-**",
        usuario: "",
        local: "",
        data: "02/09/2026 09:58:56 -03:00",
        ip: "",
        codigo: "T3B43-D54KH-QU7SZ-DYF7H",
        url: "https://www.dropsigner.com/validate/T3B43-D54KH-QU7SZ-DYF7H",
        fonte: "dropsigner" as const,
      },
      {
        // Formato D — Adobe (PAdES): card VERMELHO-E-BRANCO + chip "Adobe" sólido, sem código público
        // e sem link a validador gov (só lemos a aparência; valida-se o PDF assinado original). CPF
        // mascarado do CN.
        nome: "RHAFAEL PEREIRA BARROS",
        eCpf: "***.516.261-**",
        usuario: "",
        local: "",
        data: "01/09/2026 14:58:52 -03:00",
        ip: "",
        codigo: "",
        url: "",
        fonte: "adobe" as const,
      },
    ],
    solicitante: {
      tipo: "padrao" as const,
      nome: "ISAAC PIRES CABRAL",
      matricula: "1043055",
      funcao: "Secretário",
      nomeacao: {
        tipo: "portaria" as const,
        numero: "123/2026",
        link: "https://servicos.rioverde.go.gov.br/servicos/autenticacaorelatorios",
      },
      assinaturaCodigo: "PBfGdg58teX",
      assinaturaData: "31/08/2026 16:20:00",
    },
  },
  itens: DFD_ITENS_DEMO,
};

const PCA_DEMO = {
  id: 1,
  nome: "PCA 2026",
  ano: 2026,
  observacao: null,
  totalDfds: 2,
  totalItens: 3,
  valorEstimado: 512342.72,
  criadoEm: null,
  grupos: [
    {
      reparticaoId: 1,
      reparticaoCodigo: "SMIR",
      reparticaoNome: "Secretaria Municipal de Infraestrutura Rural",
      dfds: [
        { id: 1, numero: "1586", objeto: "AQUISIÇÃO DE SERVIÇO", setorRequisitante: "SMIR", valorEstimado: 342342.72, totalItens: 2, itens: DFD_ITENS_DEMO },
      ],
    },
    {
      reparticaoId: 2,
      reparticaoCodigo: "SMS",
      reparticaoNome: "Secretaria Municipal de Saúde",
      dfds: [
        {
          id: 2,
          numero: "1720",
          objeto: "AQUISIÇÃO DE MATERIAL",
          setorRequisitante: "SMS",
          valorEstimado: 170000,
          totalItens: 1,
          itens: [{ id: 3, item: 1, codigo: "9910011", descricao: "SERINGA DESCARTÁVEL 5ML", unidade: "CENTO", quantidade: 300, valorUnitario: 566.67, valorTotal: 170000 }],
        },
      ],
    },
  ],
};

// Protocolo (processo) com vários DFDs — visão read-only (o upload, que carrega
// o pdf.js, fica fora do catálogo, como o DfdUploadForm).
const PROTO_DEMO = {
  numero: "144756/2026",
  idExterno: "2273524",
  anoPca: 2027,
  data: "09/09/2026 16:41:38",
  interessado: "1008171 - FUNDO MUNICIPAL DOS DIREITOS DO IDOSO",
  documento: "29.788.950/0001-04",
  assunto: "INCLUSÃO - PCA",
  observacao: "PCA 2027",
  localReparticao: "COMPRAS FMAS",
  valorCapa: 32705,
  reparticaoCodigo: "SMIR",
  reparticaoNome: "Secretaria Municipal de Infraestrutura Rural",
  criadoEm: null,
  totalDfds: 2,
  totalItens: 3,
  valorTotal: 512342.72,
  dfds: [
    { id: 1, numero: "1586", planejamento: "1639", tipo: "DFD-S — Solução / com ETP", setorRequisitante: "SMIR - SECRETARIA MUNICIPAL DE INFRAESTRUTURA RURAL", reparticaoCodigo: "SMIR", totalItens: 2, valorTotal: 342342.72, valorEstimado: 342342.72 },
    { id: 2, numero: "1720", planejamento: "1802", tipo: "DFD-R — Renovação / Ata vigente", setorRequisitante: "SMS - SECRETARIA MUNICIPAL DE SAÚDE", reparticaoCodigo: "SMS", totalItens: 1, valorTotal: 170000, valorEstimado: 170000, numeroAta: "045/2025" },
  ],
};

export function Catalogo() {
  const [aba, setAba] = useState("todos");
  const [cor, setCor] = useState("#4f46e5");
  const [orgaos, setOrgaos] = useState<string[]>([]);
  const [sortOrgao, setSortOrgao] = useState<"asc" | "desc" | null>(null);
  const [framed, setFramed] = useState(false);
  const [device, setDevice] = useState("desktop");
  const [tsel, setTsel] = useState<Set<string | number>>(new Set());
  const [tclick, setTclick] = useState<string | number | null>(null);
  const [busca, setBusca] = useState("");
  const [check, setCheck] = useState(true);
  const [modalAberto, setModalAberto] = useState(false);
  const [relatorioAberto, setRelatorioAberto] = useState(false);
  const [incluirAtencaoDemo, setIncluirAtencaoDemo] = useState(true);
  const [mdAberto, setMdAberto] = useState(false);
  const [mdLateral, setMdLateral] = useState(false);
  const [dzFile, setDzFile] = useState<string | null>(null);
  const [respDemo, setRespDemo] = useState<Responsaveis>({
    padroes: [
      {
        nome: "Ana Souza",
        matricula: "12345",
        funcao: "Secretária",
        nomeacao: { tipo: "portaria", numero: "10/2025", link: "https://exemplo.gov.br/portaria-10" },
      },
    ],
    temporarios: [
      {
        nome: "Carlos Lima",
        matricula: "67890",
        funcao: "Diretor",
        nomeacao: { tipo: "decreto", numero: "5/2026", link: "" },
        inicio: "2026-01-01",
        fim: "2026-12-31",
      },
    ],
  });
  const [pag, setPag] = useState(2);
  useEffect(() => {
    setFramed(new URLSearchParams(window.location.search).get("view") === "frame");
  }, []);

  const vitrine = (
    <>
      <Secao titulo="Cores — neutros">
        <div className="grid grid-cols-3 gap-3 sm:grid-cols-6 lg:grid-cols-11">
          {NEUTROS.map(([n, t]) => (
            <Swatch key={t} nome={n} token={t} />
          ))}
        </div>
      </Secao>

      <Secao titulo="Cores — semânticas">
        <div className="grid grid-cols-3 gap-3 sm:grid-cols-5 lg:grid-cols-9">
          {SEMANTICAS.map(([n, t]) => (
            <Swatch key={t} nome={n} token={t} />
          ))}
        </div>
      </Secao>

      <Secao titulo="Tipografia (Geist)">
        <div className="space-y-2">
          <p className="text-[27px] font-bold tracking-[-0.02em]">Título da página · 27/700</p>
          <p className="text-[14px] font-semibold">Nome do produto · 14/600</p>
          <p className="text-[13px] text-text-2">Corpo / célula · 13/400 — texto secundário</p>
          <p className="font-mono text-[13.5px]">Mono · 2026/118223 · 11/09/2026 · ⌘K</p>
        </div>
      </Secao>

      <Secao titulo="Ícones (biblioteca)">
        <div className="grid grid-cols-4 gap-2 sm:grid-cols-8 lg:grid-cols-13">
          {ICONES.map(([nome, Icon]) => (
            <div
              key={nome}
              title={nome}
              className="flex flex-col items-center gap-1 rounded-control border border-border bg-surface-2 p-2"
            >
              <Icon className="h-5 w-5 text-text-2" />
              <span className="w-full truncate text-center text-[9px] text-faint">{nome.replace("Icon", "")}</span>
            </div>
          ))}
        </div>
      </Secao>

      <Secao titulo="Botões">
        <div className="flex flex-wrap items-center gap-3">
          <Button icon={<IconPlus className="h-[18px] w-[18px]" />}>Novo Protocolo</Button>
          <Button variant="accent" icon={<IconArrowRight className="h-4 w-4" />}>Entrar</Button>
          <Button variant="danger" icon={<IconTrash className="h-4 w-4" />}>Excluir</Button>
          <Button variant="secondary">Secundário</Button>
          <Button variant="icon" aria-label="Exportar">
            <IconUpload className="h-[18px] w-[18px]" />
          </Button>
          <Button variant="ghost">Ghost</Button>
          <Button loading>Carregando</Button>
          <Button disabled>Desativado</Button>
        </div>
      </Secao>

      <Secao titulo="Campos de formulário (ícone + foco accent)">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <TextField
            label="Email ou usuário"
            icon={<IconMail className="h-5 w-5" />}
            placeholder="voce@empresa.com"
            defaultValue=""
          />
          <PasswordField defaultValue="segredo123" />
        </div>
        <div className="mt-4 max-w-md">
          <SearchField value={busca} onChange={(e) => setBusca(e.target.value)} onClear={() => setBusca("")} placeholder="Pesquisar protocolos…" />
        </div>
        <div className="mt-4 max-w-md">
          <TextArea label="Descrição (multi-linha)" placeholder="Digite uma descrição…" rows={3} />
        </div>
        <div className="mt-4">
          <Checkbox label="Manter-me conectado" checked={check} onChange={(e) => setCheck(e.target.checked)} />
        </div>
      </Secao>

      <Secao titulo="Status — Natureza (keyline) e Situação (dot)">
        <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
          {NATUREZAS.map((n) => (
            <NaturezaTag key={n} natureza={n} />
          ))}
        </div>
        <div className="mt-4 flex flex-wrap items-center gap-x-6 gap-y-3 border-t border-border pt-4">
          {SITUACOES.map((s) => (
            <SituacaoDot key={s.v} situacao={s.v} label={s.l} />
          ))}
        </div>
      </Secao>

      <Secao titulo="KPIs">
        <div className="grid grid-cols-1 gap-[var(--gap-block)] sm:grid-cols-2 lg:grid-cols-4">
          <KpiStat label="Total de protocolos" value="122" delta={{ dir: "up", value: "8" }} spark={[30, 45, 40, 55, 60, 80, 95]} hint="esta semana" />
          <KpiStat label="Em análise" value="41" cor="var(--sit-em-analise)" delta={{ dir: "up", value: "5" }} spark={[20, 30, 25, 35, 45, 60, 70]} hint="aguardando" />
          <KpiStat label="Finalizados" value="63" cor="var(--sit-finalizado)" delta={{ dir: "up", value: "11" }} spark={[35, 40, 50, 55, 65, 75, 90]} hint="no mês" />
          <KpiStat label="Devolvidos" value="12" cor="var(--sit-devolvido)" delta={{ dir: "down", value: "2" }} spark={[60, 50, 45, 40, 30, 25, 20]} hint="vs. mês anterior" />
        </div>
      </Secao>

      <Secao titulo="StatCard (tile de estatística)">
        <div className="grid grid-cols-1 gap-[var(--gap-block)] sm:grid-cols-2 lg:grid-cols-4">
          <StatCard label="Total" value="122" tone="blue" icon={<IconClipboard className="h-5 w-5" />} hint="protocolos" />
          <StatCard label="Finalizados" value="63" tone="emerald" icon={<IconWallet className="h-5 w-5" />} hint="no mês" />
          <StatCard label="Em análise" value="41" tone="amber" icon={<IconClock className="h-5 w-5" />} active />
          <StatCard label="Devolvidos" value="12" tone="orange" icon={<IconBox className="h-5 w-5" />} hint="vs. anterior" />
        </div>
      </Secao>

      <Secao titulo="StatMini (mini banner de cabeçalho — DFD/Protocolo)">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <StatMini label="Total de itens" value="692" />
          <StatMini label="Valor total" value="R$ 1.284.902,10" hint="Estimado (nota): R$ 1.280.000,00" />
          <StatMini label="Total de DFDs" value="104" tone="accent" />
          <StatMini label="Somatória dos DFDs" value="R$ 32.705,00" tone="warn" hint="capa diverge" />
        </div>
      </Secao>

      <Secao titulo="RelatorioErros (banner de erros copiável — DFD/Protocolo)">
        <Button
          variant="secondary"
          onClick={() => setRelatorioAberto(true)}
          icon={<IconAlert className="h-4 w-4" style={{ color: "var(--danger)" }} />}
        >
          Relatório de erro
        </Button>
        <RelatorioErros
          open={relatorioAberto}
          onClose={() => setRelatorioAberto(false)}
          titulo="Relatório do protocolo 97608/2026"
          toggle={{
            label: "Incluir 1 DFD-R sem referência (atenção) no relatório",
            checked: incluirAtencaoDemo,
            onChange: setIncluirAtencaoDemo,
          }}
          linhas={[
            "DESPACHO DE DEVOLUÇÃO PARA CORREÇÃO",
            "",
            "Processo nº 97608/2026 (Id 2273524)",
            "Interessado: FUNDO MUNICIPAL DE SAÚDE DE RIO VERDE",
            "Assunto: INCLUSÃO - PCA",
            "",
            "Analisado o presente processo, constataram-se as pendências abaixo. Devolve-se para correção antes da protocolização:",
            "",
            '1. CAPA DO PROCESSO: Valor da capa ausente/zerado — informar o valor da capa (usar "Substituir pela somatória": R$ 269.705.678,89).',
            "2. DFD 531 (DFD-R):",
            "   - Informar o VALOR UNITÁRIO dos itens 3, 5, 8 (Seção 4).",
            "   - Preencher a Fundamentação legal (Seção 7).",
            ...(incluirAtencaoDemo
              ? [
                  "3. DFD 712 (DFD-R):",
                  "   - DFD de renovação (DFD-R) sem referência de contrato, ata (registro de preços) ou licitação — informar ao menos uma.",
                ]
              : []),
            "",
            "Sanadas as pendências, reencaminhe-se o processo para nova análise e protocolização.",
          ]}
        />
      </Secao>

      <Secao titulo="Gráficos (Recharts, eixos por token)">
        <div className="grid grid-cols-1 gap-[var(--gap-block)] lg:grid-cols-2">
          <ChartCard title="Classificação dos Itens" subtitle="Distribuição do valor por categoria">
            <ClassificacaoChart data={G_CLASS} />
          </ChartCard>
          <ChartCard title="Cronograma Mensal" subtitle="Valor planejado por mês desejado">
            <MensalChart data={G_MES} />
          </ChartCard>
          <ChartCard title="Top Itens por Valor" subtitle="Maiores contratações planejadas">
            <TopItensChart data={G_TOP} />
          </ChartCard>
          <ChartCard title="Unidades de Medida" subtitle="Itens por unidade de medida">
            <UnidadeChart data={G_UNID} />
          </ChartCard>
        </div>
      </Secao>

      <Secao titulo="Avatares">
        <div className="flex flex-wrap items-center gap-3">
          {["Jhone Prado", "Maria Silva", "Naty Costa", "Cris Souza", "Thamires Lima"].map((n) => (
            <div key={n} className="flex items-center gap-2">
              <Avatar nome={n} size="lg" />
              <span className="text-[13px] text-text-2">{n}</span>
            </div>
          ))}
        </div>
      </Secao>

      <Secao titulo="Abas (swipe no mobile, sublinhado animado)">
        <Tabs
          tabs={[
            { key: "orc", label: "Orçamentário", icon: <IconBox className="h-4 w-4" />, content: <p className="text-[13px] text-text-2">Conteúdo do orçamentário. No celular, arraste para o lado para trocar de aba.</p> },
            { key: "frotas", label: "Frotas", icon: <IconLayers className="h-4 w-4" />, content: <p className="text-[13px] text-text-2">Conteúdo de frotas.</p> },
            { key: "docs", label: "Documentos", icon: <IconFile className="h-4 w-4" />, content: <p className="text-[13px] text-text-2">Conteúdo de documentos.</p> },
          ]}
        />
      </Secao>

      <Secao titulo="Abas de filtro (segmented) & chips">
        <div className="flex flex-wrap items-center gap-3">
          <Segmented
            value={aba}
            onChange={setAba}
            options={[
              { value: "todos", label: "Todos" },
              { value: "analise", label: "Em análise" },
              { value: "meus", label: "Meus" },
              { value: "sem", label: "Sem responsável" },
            ]}
          />
          <FilterChip label="Natureza" />
          <FilterChip label="Órgão" active />
        </div>
      </Secao>

      <Secao titulo="Filtro de cabeçalho & Período">
        <div className="flex flex-wrap items-center gap-6">
          <div className="rounded-control border border-border bg-surface-2 px-2">
            <MultiSelectHeader label="Órgão" options={ORGAOS} value={orgaos} onApply={setOrgaos} onSort={setSortOrgao} sortDir={sortOrgao} />
          </div>
          <PeriodoPicker anos={[2027, 2026, 2025]} value={{ preset: "todo" }} />
        </div>
        <p className="mt-2 text-[12px] text-faint">
          {orgaos.length > 0 && orgaos.length < ORGAOS.length ? `${orgaos.length} órgão(s) filtrado(s)` : "Sem filtro"}
          {sortOrgao ? ` · ordem ${sortOrgao === "asc" ? "crescente" : "decrescente"}` : ""}
        </p>
      </Secao>

      <Secao titulo="Seletor de cor (conta-gotas + salvos)">
        <div className="flex flex-wrap items-center gap-4">
          <ColorField value={cor} onChange={setCor} label="Cor primária" />
          <div className="flex items-center gap-2 text-[13px] text-text-2">
            <span className="h-6 w-6 rounded-md border border-border-2" style={{ background: cor }} />
            <span className="font-mono">{cor}</span>
          </div>
        </div>
      </Secao>

      <Secao titulo="Banners flutuantes (Toast)">
        <div className="flex flex-wrap gap-3">
          <Button variant="secondary" onClick={() => toast.success("Configuração salva com sucesso.")}>Sucesso</Button>
          <Button variant="secondary" onClick={() => toast.info("Isto é um aviso informativo.")}>Info</Button>
          <Button variant="secondary" onClick={() => toast.warning("Atenção: revise os dados.")}>Alerta</Button>
          <Button variant="secondary" onClick={() => toast.error("Falha ao salvar. Tente novamente.")}>Erro</Button>
        </div>
      </Secao>

      <Secao titulo="Callout (feedback) & estados">
        <div className="space-y-2">
          <Callout kind="ok" icon={<IconCheck className="h-4 w-4" />}>Operação concluída com sucesso.</Callout>
          <Callout kind="warn" icon={<IconAlert className="h-4 w-4" />}>Atenção: revise os dados antes de continuar.</Callout>
          <Callout kind="danger" icon={<IconAlert className="h-4 w-4" />}>Falha ao salvar. Tente novamente.</Callout>
          <Callout kind="info">Dica: use os filtros do cabeçalho para refinar a lista.</Callout>
        </div>
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <div className="rounded-card border border-border bg-surface p-4">
            <span className="mb-2 block text-[11px] font-semibold uppercase tracking-wide text-muted">Skeleton</span>
            <Skeleton className="h-8 w-full rounded-control" />
            <div className="mt-3">
              <SkeletonLinhas linhas={3} />
            </div>
          </div>
          <div className="flex items-center justify-center gap-3 rounded-card border border-border bg-surface p-4">
            <span className="text-[13px] text-text-2">Alternador de tema</span>
            <ThemeToggle />
          </div>
        </div>
        <div className="mt-4">
          <span className="mb-2 block text-[11px] font-semibold uppercase tracking-wide text-muted">
            Progresso de importação
          </span>
          <Progress value={62} label="Enviando 1.240 itens em lotes... 62%" />
        </div>
      </Secao>

      <Secao titulo="Cards de navegação (LinkCard)">
        <div className="grid gap-4 sm:grid-cols-2">
          <LinkCard href="#" titulo="Tabelas dinâmicas" descricao="Listas com colunas personalizáveis." icon={<IconLayers className="h-6 w-6" />} />
          <LinkCard href="#" titulo="Relatórios" descricao="Exportações e visões consolidadas." icon={<IconClipboard className="h-6 w-6" />} />
        </div>
      </Secao>

      <Secao titulo="Configurações do ADM — atalhos de administração">
        <p className="mb-3 text-sm text-muted">
          Grade de atalhos da tela <code>/painel/configuracoes</code> (aba &quot;Mais&quot;) — leva às
          telas admin já existentes. Só componentes do design-system (LinkCard + ícones).
        </p>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <LinkCard href="#" titulo="Aparência" descricao="Cores, layout, densidade e ícones." icon={<Icons.IconPalette className="h-5 w-5" />} />
          <LinkCard href="#" titulo="Unidades" descricao="Unidades, órgão e responsáveis por DFDs." icon={<Icons.IconBuilding className="h-5 w-5" />} />
          <LinkCard href="#" titulo="Grupos" descricao="Grupos de acesso e suas unidades." icon={<Icons.IconUsers className="h-5 w-5" />} />
          <LinkCard href="#" titulo="Permissões" descricao="Abas visíveis por grupo." icon={<Icons.IconShield className="h-5 w-5" />} />
          <LinkCard href="#" titulo="Usuários" descricao="Contas, papéis e status de acesso." icon={<Icons.IconUser className="h-5 w-5" />} />
        </div>
      </Secao>

      <Secao titulo="Avaliação do ADM — níveis (Badge)">
        <p className="mb-3 text-sm text-muted">
          Vocabulário da tela <code>/painel/configuracoes</code> (aba &quot;Avaliação&quot;): cada dado de
          Protocolo/DFD/Item recebe um nível. Cor por token (Badge).
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <Badge tone="red">Fundamental</Badge>
          <Badge tone="amber">Intermediário</Badge>
          <Badge tone="blue">Automático</Badge>
          <Badge tone="slate">Ignorar</Badge>
        </div>
        <p className="mt-3 text-[12px] text-muted">
          Fundamental bloqueia; intermediário só avisa (atenção); automático corrige sozinho; ignorar não avalia.
        </p>
      </Secao>

      <Secao titulo="Integrações do ADM (Cloudflare)">
        <p className="mb-3 text-sm text-muted">
          A aba <code>/painel/integracoes</code> conecta serviços externos. Status por card (Badge) e o gráfico de
          monitoramento (MetricasChart). Segredos são write-only (cifrados no servidor).
        </p>
        <div className="mb-4 flex flex-wrap items-center gap-2">
          <Badge tone="emerald" dot>
            Configurado
          </Badge>
          <Badge tone="emerald" dot>
            Ativado
          </Badge>
          <Badge tone="amber" dot>
            Incompleto
          </Badge>
          <Badge tone="slate" dot>
            Desativado
          </Badge>
          <Badge tone="slate">Em breve</Badge>
        </div>
        <ChartCard title="Requisições por dia" subtitle="Monitoramento do Worker (exemplo)">
          <MetricasChart
            data={[
              { data: "2026-09-11", requests: 1200, errors: 3 },
              { data: "2026-09-12", requests: 1580, errors: 0 },
              { data: "2026-09-13", requests: 990, errors: 12 },
              { data: "2026-09-14", requests: 1740, errors: 1 },
              { data: "2026-09-15", requests: 2010, errors: 4 },
            ]}
          />
        </ChartCard>
      </Secao>

      <Secao titulo="Referência do sistema (aba read-only)">
        <p className="mb-3 text-sm text-muted">
          A aba <code>/painel/configuracoes</code> → &quot;Referência&quot; lista TODAS as lógicas do sistema
          (somente leitura): busca (SearchField) + filtro por domínio (FilterChip) + cards de regra com a
          origem e um &quot;valor vigente&quot; (Badge) quando derivado do código.
        </p>
        <SearchField value="" onChange={() => {}} placeholder="Buscar uma regra ou comportamento…" aria-label="demo" />
        <div className="mt-2 flex flex-wrap gap-1.5">
          <FilterChip label="Todos" active />
          <FilterChip label="Avaliação" />
          <FilterChip label="Assinatura" />
          <FilterChip label="Técnico" />
        </div>
        <div className="mt-3 max-w-md rounded-card border border-border bg-surface p-4 shadow-ring">
          <div className="flex items-center gap-2">
            <span className="font-semibold text-text">Não protocola com DFD defeituoso</span>
          </div>
          <p className="mt-1 text-[13px] text-text-2">
            O botão &quot;Protocolar&quot; fica desabilitado enquanto algum DFD estiver com erro.
          </p>
          <p className="mt-2 font-mono text-[11px] text-faint">ProtocoloUploadForm</p>
        </div>
      </Secao>

      <Secao titulo="Link externo (LinkExterno)">
        <p className="mb-3 text-sm text-muted">
          Âncora externa (abre em nova aba, <code>rel=&quot;noopener noreferrer&quot;</code>) — único link externo do app.
          Ex.: verificar a autenticidade de uma assinatura digital no site da Prefeitura.
        </p>
        <LinkExterno
          href="https://servicos.rioverde.go.gov.br/servicos/autenticacaorelatorios"
          icon={<Icons.IconShield className="h-4 w-4" />}
        >
          Verificar autenticidade
        </LinkExterno>
      </Secao>

      <Secao titulo="Acesso restrito & Em construção">
        <div className="grid gap-4 lg:grid-cols-2">
          <AcessoRestrito mensagem="Somente administradores podem acessar esta área." />
          <EmConstrucao
            titulo="Auditoria"
            descricao="Este módulo está em desenvolvimento."
            icon={<IconClock className="h-5 w-5" />}
            fase="Fase 5"
            itens={["Registro de alterações", "Filtro por usuário", "Exportação"]}
          />
        </div>
      </Secao>

      <Secao titulo="Sombra suave (contorno suave)">
        <div className="flex flex-wrap gap-4">
          <div className="rounded-card bg-surface p-5 shadow-soft">
            <p className="text-[13px] font-semibold text-text">Card com --shadow-soft</p>
            <p className="mt-1 text-[12px] text-muted">Elevação suave para popovers e cards flutuantes.</p>
          </div>
          <div className="rounded-card border border-border bg-surface p-5 shadow-ring">
            <p className="text-[13px] font-semibold text-text">Card com --ring</p>
            <p className="mt-1 text-[12px] text-muted">Elevação padrão dos cards (spec §2).</p>
          </div>
        </div>
      </Secao>

      <Secao titulo="Modal (bottom-sheet no mobile) & Paginação">
        <div className="flex flex-wrap items-center gap-4">
          <Button variant="secondary" onClick={() => setModalAberto(true)}>
            Abrir modal
          </Button>
          <Button
            variant="secondary"
            onClick={() => {
              setMdLateral(false);
              setMdAberto(true);
            }}
          >
            Abrir modal com painel lateral
          </Button>
          <Pager page={pag} pages={8} onChange={setPag} />
        </div>
        <Modal open={modalAberto} onClose={() => setModalAberto(false)} titulo="Exemplo de modal">
          <p className="text-[13px] text-text-2">
            No mobile vira bottom-sheet; no desktop, painel central. Fecha no Esc, no fundo e no X.
          </p>
          <div className="mt-4 flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setModalAberto(false)}>
              Cancelar
            </Button>
            <Button onClick={() => setModalAberto(false)}>Confirmar</Button>
          </div>
        </Modal>

        {/* Mestre-detalhe: um 2º banner aparece AO LADO (desktop) / cobre a tela (mobile). */}
        <Modal
          open={mdAberto}
          onClose={() => setMdAberto(false)}
          titulo="Banner principal"
          size="lg"
          lateral={{
            aberto: mdLateral,
            titulo: "Banner lateral",
            onClose: () => setMdLateral(false),
            acoesCabecalho: (
              <Button variant="icon" aria-label="Cadeado (demo)" title="Cadeado do lateral">
                <IconLock className="h-5 w-5" />
              </Button>
            ),
            rodape: (
              <div className="flex justify-end">
                <Button variant="secondary" onClick={() => setMdLateral(false)}>
                  Fechar
                </Button>
              </div>
            ),
            children: (
              <p className="text-[13px] text-text-2">
                Este é o 2º banner, ao lado do principal — não dentro. No desktop os dois ficam lado a lado (o
                principal desliza para a esquerda); no mobile, um por vez.
              </p>
            ),
          }}
        >
          <p className="text-[13px] text-text-2">
            Clique no botão para abrir o banner lateral ao lado deste.
          </p>
          <div className="mt-4">
            <Button onClick={() => setMdLateral((v) => !v)}>
              {mdLateral ? "Fechar lateral" : "Abrir lateral"}
            </Button>
          </div>
        </Modal>
      </Secao>

      <Secao titulo="Dropzone (importação: soltar ou clicar para escolher)">
        <div className="grid gap-4 sm:grid-cols-2">
          <Dropzone
            accept=".pdf"
            onFile={(f) => setDzFile(f.name)}
            titulo="Soltar o arquivo (.pdf)"
            dica="Solte o arquivo ou clique para escolher no sistema."
          />
          <div className="flex items-center rounded-card border border-border bg-surface-2 p-4 text-[13px] text-muted">
            {dzFile ? `Último arquivo escolhido: ${dzFile}` : "Nenhum arquivo escolhido ainda."}
          </div>
        </div>
      </Secao>

      <Secao titulo="Responsáveis (N padrões + N temporários; nomeação portaria/decreto/lei + link, matrícula/função)">
        <div className="max-w-lg">
          <ResponsaveisEditor valor={respDemo} onChange={setRespDemo} />
        </div>
      </Secao>

      <Secao titulo="Tabela (seleção + filtro no cabeçalho + clique na linha)">
        <DataTable
          columns={COLUNAS}
          rows={PROTOS}
          getKey={(r) => r.id}
          selectable
          selected={tsel}
          onSelected={setTsel}
          onRowClick={(r) => setTclick(r.id)}
          pageSize={4}
          footer={
            tclick != null
              ? `Linha aberta: ${tclick} (clique na linha; controles internos não disparam)`
              : tsel.size > 0
                ? `${tsel.size} selecionada(s)`
                : "Clique numa linha para abrir"
          }
        />
      </Secao>

      <Secao titulo="PlanilhaDfds (tabela ÚNICA de DFDs — banners + aba DFDs)">
        <PlanilhaDfds
          linhas={[
            { key: 1, numero: "531", planejamento: "600", sigla: "FMS", auto: true, tipo: "DFD-R", itens: 692, valor: 269705678.89, estado: "regular", situacao: "Novo" },
            { key: 2, numero: "389", planejamento: "410", sigla: "FMS", tipo: "DFD-S", itens: 281, valor: 1284902.1, estado: "regular", situacao: "Substitui" },
            { key: 4, numero: "712", planejamento: "798", sigla: "FMS", tipo: "DFD-R", itens: 44, valor: 812340.5, estado: "atencao", situacao: "Novo" },
            { key: 3, numero: "1024", planejamento: "1066", sigla: "FMS", tipo: "DFD-R", itens: 0, valor: 0, estado: "erro", estadoMotivo: "Leitura incompleta da tabela", situacao: "Novo" },
          ]}
        />
      </Secao>

      <Secao titulo="PcaPicker (definição do PCA do processo — obrigatório)">
        <div className="max-w-md">
          <PcaPickerDemo />
        </div>
      </Secao>

      <Secao titulo="MensagensDfd (painel lateral de erro/atenção/acerto — clique navega no DFD)">
        {/* BotaoVerMensagens — vai no rodapé fixo do banner do DFD, à esquerda do Fechar. */}
        <div className="mb-4 flex justify-end border-b border-border pb-4">
          <BotaoVerMensagens
            mensagens={[
              { chave: "a", status: "erro", texto: "", ancora: "" },
              { chave: "b", status: "erro", texto: "", ancora: "" },
              { chave: "c", status: "atencao", texto: "", ancora: "" },
              { chave: "d", status: "acerto", texto: "", ancora: "" },
              { chave: "e", status: "acerto", texto: "", ancora: "" },
            ]}
            onToggle={() => toast("Abrir/ocultar o painel de mensagens")}
          />
        </div>
        <div className="max-w-md">
          <MensagensDfd
            numero="1586"
            tipo="DFD-R — Renovação"
            mensagens={[
              { chave: "dfd.reparticao", status: "erro", texto: "Repartição/Setor requisitante não vinculado.", ancora: "reparticao" },
              { chave: "item.valorUnitario", status: "erro", texto: "Falta valor unitário em 3 de 12 itens (Seção 4).", ancora: "itens" },
              { chave: "dfd.referenciaRenovacao", status: "atencao", texto: "DFD de renovação (DFD-R) sem referência de contrato, ata ou licitação.", ancora: "referenciaRenovacao" },
              { chave: "dfd.previsao", status: "acerto", texto: "Previsão de entrega/execução (Seção 5) preenchida.", ancora: "previsao" },
              { chave: "dfd.assinatura", status: "acerto", texto: "Assinatura digital conferida.", ancora: "assinatura" },
            ]}
            onIrPara={(m) => toast(`Rolar até: ${m.ancora}`)}
          />
        </div>
      </Secao>

      <Secao titulo="ItemDetalhe (painel lateral do item — abre ao clicar numa linha da Seção 4; com conferência de catálogo)">
        <div className="max-w-md">
          <ItemDetalhe
            item={{
              item: 2,
              codigo: "5241937264",
              descricao: "GUINDASTE HIDRÁULICO AUTOPROPELIDO (MODELO 2 – GRANDE PORTE), LANÇA 50 M",
              unidade: "DIAS",
              quantidade: 20,
              valorUnitario: 8000,
              valorTotal: 160000,
            }}
            tipo="DFD-S"
            conformidade={DEMO_ITEM_CONFORMIDADE}
          />
        </div>
      </Secao>

      <Secao titulo="ItemDetalhe EDITÁVEL (importação, ou gravado com o cadeado aberto) — campos do item viram inputs">
        <div className="max-w-md">
          <ItemDetalheEditDemo />
        </div>
      </Secao>

      <Secao titulo="CampoCadeado (campo com cadeado POR CAMPO — reusado na capa e no cabeçalho do DFD)">
        <CampoCadeadoDemo />
      </Secao>

      <Secao titulo="TipoDfdPicker (conjunto de tipos de DFD — usado no catálogo: envio, massa e item)">
        <div className="max-w-md">
          <TipoDfdPickerDemo />
        </div>
      </Secao>

      <Secao titulo="CatalogoItemDetalhe (painel lateral do item do catálogo — tipos editáveis)">
        <div className="max-w-md">
          <CatalogoItemDetalhe
            item={{
              id: 1,
              catalogoId: 1,
              codigo: "5241948381",
              codigoRaw: "5241948381",
              descricao: "Hospedagem em apartamento individual, com ar condicionado, frigobar, TV, café da manhã.",
              unidade: "UNIDADE",
              sequencial: 1,
              tipos: ["DFD-R", "DFD-E"],
              catalogosExtra: [],
            }}
            podeEditar
          />
        </div>
      </Secao>

      <Secao titulo="OrcamentoItemDetalhe (painel lateral do lançamento do orçamento — só leitura)">
        <div className="max-w-md">
          <OrcamentoItemDetalhe
            item={{
              id: 1,
              orcamentoId: 1,
              orgao: "FUNDO MUNICIPAL DE EDUCAÇÃO DE RIO VERDE",
              unidade: "2 - SECRETARIA MUNICIPAL DE EDUCAÇÃO",
              nomeElemento: "OUTROS SERVIÇOS DE TERCEIROS - PESSOA JURÍDICA",
              codigoElemento: "3.3.90.39.00",
              valorEmendaImpositiva: 0,
              valorInicial: 5000000,
              valorSuplementacao: 0,
              valorEmpenho: 0,
              saldo: 5000000,
              valorAnulacao: 0,
              sequencial: 1,
            }}
          />
        </div>
      </Secao>

      <Secao titulo="Histórico (trilha de auditoria — quem alterou, o que mudou de→para, quando; diff expansível)">
        <div className="max-w-md">
          <Historico entradas={DEMO_HISTORICO} />
        </div>
      </Secao>

      <Secao titulo="DFD — visualização do documento importado">
        {/* Cabeçalho FIXO (`DfdCabecalho`) — no app vai no topo do banner; solto, acima. */}
        <div className="mb-4 border-b border-border pb-3">
          <DfdCabecalho numero={DFD_DEMO.numero} tipo={DFD_DEMO.tipo} planejamento={DFD_DEMO.planejamento} />
        </div>
        <DfdView dfd={DFD_DEMO} />
      </Secao>

      <Secao titulo="Protocolo — processo com vários DFDs (visão)">
        <div className="mb-4 border-b border-border pb-3">
          <ProtocoloCabecalho numero={PROTO_DEMO.numero} idExterno={PROTO_DEMO.idExterno} assunto={PROTO_DEMO.assunto} />
        </div>
        <ProtocoloView protocolo={PROTO_DEMO} />
      </Secao>

      <Secao titulo="PCA — compilação dos DFDs por unidade">
        <PcaCompilacaoView pca={PCA_DEMO} />
      </Secao>
    </>
  );

  // Modo "frame": só a vitrine (usado dentro do iframe de preview mobile).
  if (framed) {
    return (
      <div className="min-h-dvh bg-bg text-text">
        <div className="mx-auto max-w-6xl px-4 py-6 sm:px-6">{vitrine}</div>
      </div>
    );
  }

  const larguraDevice = device === "mobile" ? 390 : 768;

  return (
    <div className="min-h-dvh bg-bg text-text">
      <div className="mx-auto max-w-6xl px-4 py-[var(--pad-canvas)] sm:px-6">
        <header className="mb-6">
          <h1 className="text-[27px] font-bold tracking-[-0.02em] text-text">Design System</h1>
          <p className="mt-1 text-[13.5px] text-muted">
            Plataforma PCA · biblioteca única de componentes (tokens, claro/escuro, toque, responsivo)
          </p>
        </header>

        <TokenEditor />

        <div className="mt-4 flex items-center justify-between gap-3">
          <span className="text-[12px] text-faint">Pré-visualização</span>
          <Segmented
            value={device}
            onChange={setDevice}
            options={[
              { value: "desktop", label: "Desktop" },
              { value: "tablet", label: "Tablet" },
              { value: "mobile", label: "Mobile" },
            ]}
          />
        </div>

        {device === "desktop" ? (
          vitrine
        ) : (
          <div className="mt-4 flex justify-center">
            <div className="max-w-full rounded-[28px] border-4 border-border-2 bg-bg p-2 shadow-soft">
              <iframe
                title="Pré-visualização responsiva"
                src="/design-system?view=frame"
                className="block rounded-[18px] border border-border bg-bg"
                style={{ width: larguraDevice, height: 760, maxWidth: "100%" }}
              />
            </div>
          </div>
        )}

        <footer className="mt-10 border-t border-border pt-4 text-[12px] text-faint">
          Plataforma PCA — Design System · tokens em globals.css · spec Claude Design
        </footer>
      </div>
    </div>
  );
}
