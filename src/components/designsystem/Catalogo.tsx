"use client";

import { type ReactNode, useEffect, useState } from "react";
import { AcessoRestrito } from "@/components/AcessoRestrito";
import { Avatar } from "@/components/Avatar";
import { Button } from "@/components/Button";
import { Callout } from "@/components/Callout";
import { ChartCard } from "@/components/ChartCard";
import { ClassificacaoChart } from "@/components/charts/ClassificacaoChart";
import { MensalChart } from "@/components/charts/MensalChart";
import { TopItensChart } from "@/components/charts/TopItensChart";
import { UnidadeChart } from "@/components/charts/UnidadeChart";
import { ColorField } from "@/components/ColorField";
import { type Column, DataTable } from "@/components/DataTable";
import { DfdView } from "@/components/DfdView";
import { PcaCompilacaoView } from "@/components/PcaCompilacaoView";
import { EmConstrucao } from "@/components/EmConstrucao";
import { Checkbox, PasswordField, SearchField, TextField } from "@/components/Field";
import { FilterChip } from "@/components/FilterChip";
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
  IconMail,
  IconPencil,
  IconPlus,
  IconTrash,
  IconUpload,
  IconWallet,
} from "@/components/icons";
import { KpiStat } from "@/components/KpiStat";
import { LinkCard } from "@/components/LinkCard";
import { Modal } from "@/components/Modal";
import { MultiSelectHeader } from "@/components/MultiSelectHeader";
import { Pager } from "@/components/Pager";
import { PeriodoPicker } from "@/components/PeriodoPicker";
import { ReorderTable } from "@/components/ReorderTable";
import { Segmented } from "@/components/Segmented";
import { StatCard } from "@/components/StatCard";
import { NaturezaTag, SituacaoDot } from "@/components/StatusTag";
import { Tabs } from "@/components/Tabs";
import { toast } from "@/components/Toast";
import { TokenEditor } from "./TokenEditor";

// Biblioteca de componentes (fonte única, spec §39.25) — rota pública
// `/design-system`. Mostra TODO componente do sistema (botões, ícones, status,
// KPIs, tabelas, filtros, cor, abas, toasts…), por token, claro/escuro, touch e
// responsivo. `?view=frame` renderiza só a vitrine (usado no preview mobile).

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
    { numero: 7, titulo: "FUNDAMENTAÇÃO LEGAL", texto: "LEI 14.133/2021." },
  ],
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

export function Catalogo() {
  const [aba, setAba] = useState("todos");
  const [cor, setCor] = useState("#4f46e5");
  const [orgaos, setOrgaos] = useState<string[]>([]);
  const [sortOrgao, setSortOrgao] = useState<"asc" | "desc" | null>(null);
  const [framed, setFramed] = useState(false);
  const [device, setDevice] = useState("desktop");
  const [tsel, setTsel] = useState<Set<string | number>>(new Set());
  const [busca, setBusca] = useState("");
  const [check, setCheck] = useState(true);
  const [modalAberto, setModalAberto] = useState(false);
  const [pag, setPag] = useState(2);
  const [repsOrdem, setRepsOrdem] = useState([
    { id: 1, codigo: "AMAE", nome: "Agência Municipal de Regulação de Água e Esgoto" },
    { id: 2, codigo: "AMMT", nome: "Agência Municipal de Mobilidade e Trânsito" },
    { id: 3, codigo: "CGM", nome: "Controladoria Geral do Município" },
    { id: 4, codigo: "FMS", nome: "Fundo Municipal da Saúde" },
    { id: 5, codigo: "GP", nome: "Gabinete do Prefeito" },
  ]);

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
      </Secao>

      <Secao titulo="Cards de navegação (LinkCard)">
        <div className="grid gap-4 sm:grid-cols-2">
          <LinkCard href="#" titulo="Tabelas dinâmicas" descricao="Listas com colunas personalizáveis." icon={<IconLayers className="h-6 w-6" />} />
          <LinkCard href="#" titulo="Relatórios" descricao="Exportações e visões consolidadas." icon={<IconClipboard className="h-6 w-6" />} />
        </div>
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
      </Secao>

      <Secao titulo="Tabela reordenável (arraste as linhas)">
        <ReorderTable
          items={repsOrdem}
          getId={(r) => r.id}
          minWidth={520}
          dica="Arraste as linhas para reordenar (mouse ou toque)."
          preview={(r) => (
            <>
              <span className="mr-1.5 font-mono text-[11px] font-semibold text-accent">{r.codigo}</span>
              {r.nome}
            </>
          )}
          onReorder={(ids) =>
            setRepsOrdem((prev) => {
              const byId = new Map(prev.map((x) => [x.id, x]));
              return ids.map((id) => byId.get(id as number)).filter((x): x is (typeof prev)[number] => !!x);
            })
          }
          columns={[
            { header: "#", minWidth: 40, render: (_r, i) => <span className="tabular-nums text-faint">{i + 1}</span> },
            {
              header: "Código",
              minWidth: 90,
              render: (r) => (
                <span className="rounded-chip bg-accent-soft px-2 py-0.5 font-mono text-[11px] font-semibold text-accent">
                  {r.codigo}
                </span>
              ),
            },
            { header: "Nome", minWidth: 240, render: (r) => <span className="font-medium text-text">{r.nome}</span> },
          ]}
          acoes={() => <Button variant="ghost" aria-label="Editar" icon={<IconPencil className="h-4 w-4" />} />}
        />
      </Secao>

      <Secao titulo="Tabela (seleção de linhas + filtro no cabeçalho)">
        <DataTable
          columns={COLUNAS}
          rows={PROTOS}
          getKey={(r) => r.id}
          selectable
          selected={tsel}
          onSelected={setTsel}
          pageSize={4}
          footer={tsel.size > 0 ? `${tsel.size} selecionada(s)` : undefined}
        />
      </Secao>

      <Secao titulo="DFD — visualização do documento importado">
        <DfdView dfd={DFD_DEMO} />
      </Secao>

      <Secao titulo="PCA — compilação dos DFDs por repartição">
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
