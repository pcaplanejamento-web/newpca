"use client";

import { type ReactNode, useEffect, useState } from "react";
import { AcessoRestrito } from "@/components/AcessoRestrito";
import { OrcamentoPca } from "@/components/OrcamentoPca";
import { PcaCapa, PcaCard, PcaNovoCard } from "@/components/PcaCard";
import { RecorteImagem } from "@/components/RecorteImagem";
import { SeletorBusca } from "@/components/SeletorBusca";
import { SeletorMultiplo } from "@/components/SeletorMultiplo";
import { Avatar } from "@/components/Avatar";
import { Badge, type Tone } from "@/components/Badge";
import { Button } from "@/components/Button";
import { Callout } from "@/components/Callout";
import { mensagemTravaPca } from "@/lib/pca-core";
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
import { type CapaValores, ProtocoloCabecalho, ProtocoloView } from "@/components/ProtocoloView";
import { BarraEdicaoMassa, BarraEdicaoMassaItens, BarraEdicaoMassaProtocolos } from "@/components/BarraEdicaoMassa";
import { BarraSelecao, BarraSelecaoDfds, type RegistroSelecao, ResumoSelecao } from "@/components/BarraSelecao";
import { AvisoFlutuante } from "@/components/AvisoFlutuante";
import { PessoaTag } from "@/components/PessoaTag";
import { SeletorCelula } from "@/components/SeletorCelula";
import { SeletorFiltro } from "@/components/SeletorFiltro";
import { GatilhoFiltro } from "@/components/GatilhoFiltro";
import { RangeFilterHeader } from "@/components/RangeFilterHeader";
import { DfdPainelDireito, RodapePainelItem } from "@/components/DfdPainelDireito";
import { DfdRodape } from "@/components/DfdRodape";
import { CelulaCatalogo, EstadoPonto, EstadoProcessando, EstadoResumo } from "@/components/EstadoCelula";
import { regrasPadrao } from "@/lib/avaliacao-core";
import type { PcaDetalhe } from "@/lib/dfd";
import { conciliacaoCapa, indiceAposRemover, mapaItensDuplicados, outrosDoGrupo, removerItemDfd, resumoEstado, unificarItensDfd } from "@/lib/dfd-tratamento";
import { ComparacaoDuplicados } from "@/components/ComparacaoDuplicados";
import { ComparacaoDfdView, ComparacaoProtocolo, DiffLinha, type RemovidoReenvio } from "@/components/ComparacaoReenvio";
import { useSobrescrita } from "@/components/useSobrescrita";
import type { DfdParseado } from "@/lib/parse-dfd-comum";
import type { DfdSobrescrito } from "@/lib/protocolo";
import { marcarItensNovos } from "@/lib/sobrescrita-dfd";
import { compararDfd, compararDuplicados, type DfdComparavel } from "@/lib/comparar-protocolo";
import { brl } from "@/lib/format";
import { CampoLista, Checkbox, PasswordField, SearchField, TextArea, TextField } from "@/components/Field";
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
  IconFilter,
  IconLayers,
  IconLock,
  IconMail,
  IconPlus,
  IconTrash,
  IconUpload,
  IconUser,
  IconWallet,
} from "@/components/icons";
import { CadeadoBotao, CampoNumero, CampoSelecao, CampoTexto, useCadeados } from "@/components/CampoCadeado";
import { KpiStat } from "@/components/KpiStat";
import { LinkCard } from "@/components/LinkCard";
import { LinkExterno } from "@/components/LinkExterno";
import { ItemDetalhe } from "@/components/ItemDetalhe";
import { CatalogoItemDetalhe } from "@/components/CatalogoItemDetalhe";
import { type EscopoHistorico, Historico, HistoricoDoItem } from "@/components/Historico";
import { BotaoCopiar } from "@/components/BotaoCopiar";
import { OrcamentoItemDetalhe } from "@/components/OrcamentoItemDetalhe";
import { OrcamentoVinculos } from "@/components/OrcamentoVinculos";
import type { LinhaAuditoria } from "@/lib/auditoria";
import type { ConferenciaItem } from "@/lib/catalogo-conferencia";
import { TipoDfdPicker } from "@/components/TipoDfdPicker";
import { BotaoVerMensagens, MensagensDfd } from "@/components/MensagensDfd";
import { Dropzone } from "@/components/Dropzone";
import { ResponsaveisEditor } from "@/components/ResponsaveisEditor";
import type { Responsaveis } from "@/lib/reparticao-responsaveis";
import { duracaoMotionMs, Modal } from "@/components/Modal";
import { MultiSelectHeader } from "@/components/MultiSelectHeader";
import { Pager } from "@/components/Pager";
import { PeriodoPicker } from "@/components/PeriodoPicker";
import { PlanilhaDfds, TabelaSobrescritos } from "@/components/PlanilhaDfds";
import { RelatorioErros } from "@/components/RelatorioErros";
import { Segmented } from "@/components/Segmented";
import { Switch } from "@/components/Switch";
import { StatCard } from "@/components/StatCard";
import { StatMini } from "@/components/StatMini";
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
// PCA como ESPAÇO — card 4:5 (capa padrão com o ano / com imagem), estados da Mesa do PCA (Enviado /
// Incorporado) + a TRAVA do incorporado, seletor múltiplo (visões do orçamento) e o comparativo
// Orçamento × Contratações. ("Enviar ao PCA" = `EnviarAoPca`, na barra de seleção de protocolos da Mesa.)
function PcaEspacoDemo() {
  const [sel, setSel] = useState<string[]>(["MATERIAL DE CONSUMO"]);
  const [protoDemo, setProtoDemo] = useState("11");
  const [arquivo, setArquivo] = useState<File | null>(null);
  const [capa, setCapa] = useState<string | null>(null);
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <PcaCard pca={{ id: 1, nome: "PCA 2026", ano: 2026, fonte: "lista", status: "publicado", capa: null, total: 1_390_000_000, itens: 1116, partes: 5 }} onClick={() => {}} />
        <PcaCard pca={{ id: 2, nome: "PCA 2027", ano: 2027, fonte: "protocolo", status: "preview", capa, total: 412_800_000, itens: 1632, partes: 5 }} onClick={() => {}} />
        <PcaNovoCard onClick={() => {}} />
        <div>
          <PcaCapa capa={capa} ano={2027} />
          <label className="mt-2 block text-center text-xs font-semibold text-accent">
            <input type="file" accept="image/*" className="hidden" onChange={(e) => setArquivo(e.target.files?.[0] ?? null)} />
            Testar o recorte 4:5
          </label>
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <Badge tone="amber" dot>
          Enviado
        </Badge>
        <Badge tone="slate" dot>
          Enviado (não incorporável)
        </Badge>
        <Badge tone="blue" dot>
          Incorporado · Substituir
        </Badge>
      </div>
      <Callout kind="warn" icon={<IconLock className="h-5 w-5" />}>
        {mensagemTravaPca("PCA 2027")}
      </Callout>
      <RecorteImagem
        arquivo={arquivo}
        onCancelar={() => setArquivo(null)}
        onConfirmar={(u) => {
          setCapa(u);
          setArquivo(null);
        }}
      />
      <div className="max-w-xl">
        <SeletorBusca
          ariaLabel="Protocolo de destino"
          placeholder="Pesquisar nº, Id, assunto, interessado ou unidade…"
          opcoes={[
            { valor: "", rotulo: "— Nenhum (desvincular) —", detalhe: "tira o DFD do protocolo" },
            { valor: "11", rotulo: "12345/2026", detalhe: "atual · Id 98765 · INCLUSÃO · SECRETARIA DE SAÚDE · SMS" },
            { valor: "12", rotulo: "12399/2026", detalhe: "Id 98801 · ALTERAÇÃO · SECRETARIA DE EDUCAÇÃO · SME" },
            { valor: "13", rotulo: "12411/2026", detalhe: "Id 98830 · EXCLUSÃO · FUNDO MUNICIPAL DE ASSISTÊNCIA · FMAS" },
          ]}
          valor={protoDemo}
          onChange={setProtoDemo}
        />
      </div>
      <div className="max-w-xl">
        <SeletorMultiplo
          rotulo="Elemento de despesa"
          opcoes={[
            { valor: "MATERIAL DE CONSUMO", contagem: 312 },
            { valor: "OUTROS SERVIÇOS DE TERCEIROS - PJ", contagem: 188 },
            { valor: "OBRAS E INSTALAÇÕES", contagem: 41 },
            { valor: "VENCIMENTOS E VANTAGENS FIXAS", contagem: 96 },
          ]}
          selecionados={sel}
          onChange={setSel}
        />
      </div>
      <OrcamentoPca
        dados={{
          ano: 2027,
          orcamento: { id: 1, nome: "CUBO 2027", ano: 2027 },
          visaoNome: "PCA",
          bruto: 1_610_000_000,
          filtrado: 1_160_000_000,
          unidades: [
            { id: 1, sigla: "AMAE", nome: "Agência de Água" },
            { id: 2, sigla: "FMAS", nome: "Fundo de Assistência" },
            { id: 3, sigla: "FEMBOM", nome: "Fundo dos Bombeiros" },
          ],
          planejado: [
            { unidadeId: 1, itens: 390, valor: 906_738.7 },
            { unidadeId: 2, itens: 2354, valor: 18_978_323.74 },
            { unidadeId: 3, itens: 569, valor: 3_701_579.8 },
          ],
          linhas: [
            { unidadeId: 1, valor: 1_390_566.98 },
            { unidadeId: 2, valor: 14_441_470.23 },
            { unidadeId: 3, valor: 4_021_478.05 },
          ],
        }}
      />
    </div>
  );
}

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

/** Item REPETIDO (mesmo código, descrição e unidade): os iguais lado a lado, "Ver item", remover e UNIFICAR. */
function ItemRepetidoDemo() {
  const inicial = {
    valorTotal: 460,
    itens: [
      { item: 7, codigo: "524194727", descricao: "LOCAÇÃO DE GUINDASTE — DIÁRIA", unidade: "DIAS", quantidade: 10, valorUnitario: 30, valorTotal: 300 },
      { item: 8, codigo: "524194730", descricao: "LOCAÇÃO DE CAMINHÃO MUNCK — DIÁRIA", unidade: "DIAS", quantidade: 2, valorUnitario: 50, valorTotal: 100 },
      { item: 114, codigo: "524194727", descricao: "LOCAÇÃO DE GUINDASTE — DIÁRIA", unidade: "DIAS", quantidade: 2, valorUnitario: 30, valorTotal: 60 },
    ] as DfdVisualItem[],
  };
  const [dfd, setDfd] = useState(inicial);
  const [idx, setIdx] = useState(0);
  const mapa = mapaItensDuplicados(dfd.itens);
  const it = dfd.itens[idx];
  if (!it)
    return (
      <Button
        variant="secondary"
        onClick={() => {
          setDfd(inicial);
          setIdx(0);
        }}
      >
        Recomeçar a demo
      </Button>
    );
  const repetidos = outrosDoGrupo(mapa.get(idx) ?? [], idx).map((j) => ({ idx: j, item: dfd.itens[j] }));
  return (
    <ItemDetalhe
      key={idx}
      item={it}
      editavel
      tipo="DFD-S"
      onChange={() => undefined}
      repetidos={repetidos}
      onVerItem={setIdx}
      onRemover={() => {
        setDfd((d) => removerItemDfd(d, idx));
        setIdx(-1);
      }}
      onUnificar={() => {
        const outros = repetidos.map((r) => r.idx);
        setDfd((d) => unificarItensDfd(d, idx, outros));
        setIdx(indiceAposRemover(idx, outros));
      }}
    />
  );
}

/** DFDs DUPLICADOS no processo: o aberto × o duplicado, campo a campo, e a escolha de qual fica. */
function DuplicadosDemo() {
  const outro: DfdComparavel = {
    ...REENVIO_GRAVADO,
    valorTotal: 169,
    itens: [...REENVIO_GRAVADO.itens.slice(0, 1), { item: 2, codigo: "300", descricao: "CLIPS Nº 2", unidade: "CX", quantidade: 13, valorUnitario: 9, valorTotal: 117 }],
  };
  const [fica, setFica] = useState<number | null | undefined>(undefined); // undefined = sem escolha
  return (
    <ComparacaoDuplicados
      atual={{ rotulo: "DFD 531 · Planej. 600", local: "págs. 3–7 do PDF", itens: 2, valor: 150, descartado: fica !== undefined && fica !== null }}
      outros={[
        {
          key: 1,
          rotulo: "DFD 531 · Planej. 600",
          local: "págs. 12–16 do PDF",
          itens: 2,
          valor: 169,
          motivo: "mesmo nº de DFD e de planejamento",
          pendente: fica === undefined,
          descartado: fica === null,
          comparacao: compararDuplicados(REENVIO_GRAVADO, outro),
        },
      ]}
      pendente={fica === undefined}
      onManter={setFica}
      onAbrir={() => toast("Abre o outro DFD ao lado")}
    />
  );
}

/** Demo dos primitivos de CAMPO COM CADEADO (por campo) — reusados na capa e no DFD. */
function CampoCadeadoDemo() {
  const [interessado, setInteressado] = useState("COORDENAÇÃO DE PLANEJAMENTO DAS CONTRATAÇÕES");
  const [valor, setValor] = useState<number | null>(50);
  const [assunto, setAssunto] = useState("INCLUSÃO - PCA");
  const { abertos, alternar } = useCadeados<"interessado" | "valor" | "assunto">();
  const props = (k: "interessado" | "valor" | "assunto") => ({
    editavel: true,
    aberto: abertos.has(k),
    bloqueado: false,
    onLock: () => alternar(k),
  });
  const [cadeadoSolto, setCadeadoSolto] = useState(false);
  return (
    <dl className="grid max-w-md gap-x-6 gap-y-3 sm:grid-cols-2">
      {/* CadeadoBotao solto — o mesmo cadeado dos campos, das seções do DFD e dos itens. */}
      <div className="flex items-center gap-2 sm:col-span-2">
        <CadeadoBotao rotulo="exemplo" aberto={cadeadoSolto} onClick={() => setCadeadoSolto((v) => !v)} />
        <span className="text-xs text-muted">CadeadoBotao — {cadeadoSolto ? "aberto (editando)" : "fechado (só-leitura)"}</span>
      </div>
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
      <CampoSelecao
        label="Assunto (seleção)"
        valor={assunto}
        opcoes={["INCLUSÃO - PCA", "INCLUSÃO", "EXCLUSÃO", "ALTERAÇÃO NÃO ONEROSA"]}
        span
        {...props("assunto")}
        onChange={setAssunto}
      />
    </dl>
  );
}

// Trilha de auditoria de exemplo p/ o Historico — o protocolo 144756/2026 (id 10) e o DFD 531 (id 87):
// protocolação, reenvio, "Salvar alterações" no banner (capa + 2 DFDs = UM evento), situação pela tabela.
const linhaDemo = (l: Partial<LinhaAuditoria> & Pick<LinhaAuditoria, "id" | "acao" | "entidade" | "criadoEm">): LinhaAuditoria => ({
  usuarioId: 1,
  usuarioNome: "Ana Souza",
  usuarioEmail: "ana@rioverde.go.gov.br",
  entidadeId: 10,
  resumo: null,
  antes: null,
  depois: null,
  origem: null,
  detalhe: null,
  protocoloId: 10,
  protocoloNumero: "144756/2026",
  ...l,
});
const ALVO_531 = { numero: "531", planejamento: "640" };
const DEMO_HISTORICO: LinhaAuditoria[] = [
  linhaDemo({
    id: 9,
    usuarioId: 4,
    usuarioNome: "Carlos Lima",
    acao: "editar",
    entidade: "protocolo",
    origem: "celula",
    resumo: "Protocolo 144756/2026: Situação",
    detalhe: JSON.stringify({ campos: [{ campo: "situacaoId", rotulo: "Situação", antes: "—", depois: "Em análise" }] }),
    criadoEm: "2026-09-22 19:40:10",
  }),
  linhaDemo({
    id: 8,
    acao: "editar",
    entidade: "protocolo",
    origem: "banner",
    resumo: "Protocolo 144756/2026: Assunto, Valor da capa",
    detalhe: JSON.stringify({
      campos: [
        { campo: "assunto", rotulo: "Assunto", antes: "INCLUSÃO - PCA", depois: "INCLUSÃO - PCA 2027" },
        { campo: "valorCapa", rotulo: "Valor da capa", antes: "R$ 0,00", depois: "R$ 1.237.037,01" },
      ],
    }),
    criadoEm: "2026-09-22 18:02:31",
  }),
  linhaDemo({
    id: 7,
    acao: "editar",
    entidade: "dfd",
    entidadeId: 87,
    origem: "banner",
    resumo: "DFD 531: prioridade, 1 item",
    detalhe: JSON.stringify({
      alvo: ALVO_531,
      secoes: [{ campo: "sec:prioridade", rotulo: "6 - GRAU DE PRIORIDADE", antes: "MEDIA", depois: "ALTA" }],
      itens: [
        {
          tipo: "alterado",
          item: 2,
          codigo: "5241937264",
          descricao: "GUINDASTE HIDRÁULICO AUTOPROPELIDO (MODELO 2 – GRANDE PORTE), LANÇA 50 M",
          campos: [
            { campo: "quantidade", rotulo: "Quantidade", antes: "20", depois: "35" },
            { campo: "valorTotal", rotulo: "Valor total", antes: "R$ 160.000,00", depois: "R$ 280.000,00" },
          ],
        },
      ],
    }),
    criadoEm: "2026-09-22 18:02:29",
  }),
  linhaDemo({
    id: 6,
    acao: "editar",
    entidade: "dfd",
    entidadeId: 88,
    origem: "banner",
    resumo: "DFD 389: unidade",
    detalhe: JSON.stringify({ alvo: { numero: "389", planejamento: "498" }, campos: [{ campo: "reparticao", rotulo: "Unidade", antes: "SMS", depois: "SMIR" }] }),
    criadoEm: "2026-09-22 18:02:28",
  }),
  linhaDemo({
    id: 5,
    acao: "importar",
    entidade: "dfd",
    entidadeId: 87,
    origem: "reenvio",
    resumo: "DFD 531 sobrescrito (reenvio do protocolo) — 2 diferença(s)",
    detalhe: JSON.stringify({
      alvo: ALVO_531,
      secoes: [
        {
          campo: "sec:justificativa",
          rotulo: "3 - JUSTIFICATIVA DA NECESSIDADE",
          antes: "Locação de guindaste para as obras de drenagem da região norte do município, conforme cronograma da SMIR.",
          depois:
            "Locação de guindaste para as obras de drenagem da região norte do município, conforme cronograma da SMIR, incluídas as frentes de trabalho do distrito de Ouroana e a manutenção das galerias pluviais existentes.",
        },
      ],
      itens: [{ tipo: "novo", item: 4, codigo: "5241937266", descricao: "CAMINHÃO MUNCK 12 T COM OPERADOR", campos: [] }],
    }),
    criadoEm: "2026-09-20 13:15:00",
  }),
  linhaDemo({
    id: 4,
    acao: "importar",
    entidade: "protocolo",
    origem: "reenvio",
    resumo: "Protocolo 144756/2026 REENVIADO (sobrescrito): 1 alterado",
    detalhe: JSON.stringify({ campos: [{ campo: "observacao", rotulo: "Observação", antes: "PCA 2027", depois: "PCA DO ANO DE 2027 — inclusão de itens" }] }),
    criadoEm: "2026-09-20 13:14:58",
  }),
  linhaDemo({
    id: 3,
    acao: "importar",
    entidade: "dfd",
    entidadeId: 87,
    origem: "protocolacao",
    resumo: "DFD 531 importado — 3 itens",
    depois: JSON.stringify({ numero: "531" }),
    detalhe: JSON.stringify({ alvo: ALVO_531 }),
    criadoEm: "2026-09-17 14:20:41",
  }),
  linhaDemo({
    id: 2,
    acao: "protocolar",
    entidade: "protocolo",
    origem: "protocolacao",
    resumo: "Protocolo 144756/2026 protocolado",
    criadoEm: "2026-09-17 14:20:39",
  }),
  linhaDemo({
    id: 1,
    usuarioId: 4,
    usuarioNome: "Carlos Lima",
    acao: "login",
    entidade: "sessao",
    entidadeId: null,
    protocoloId: null,
    protocoloNumero: null,
    resumo: "Entrou na plataforma",
    criadoEm: "2026-09-17 11:03:12",
  }),
];

/** Demo do Histórico nos 4 escopos (o MESMO componente no protocolo, no DFD, no item e na tela ADM). */
function HistoricoDemo() {
  const [escopo, setEscopo] = useState<EscopoHistorico>("protocolo");
  const entradas =
    escopo === "global"
      ? DEMO_HISTORICO
      : escopo === "protocolo"
        ? DEMO_HISTORICO.filter((l) => l.protocoloId === 10)
        : DEMO_HISTORICO.filter((l) => l.entidade === "dfd" && l.entidadeId === 87);
  return (
    <div className="space-y-3">
      <Segmented<EscopoHistorico>
        value={escopo}
        onChange={setEscopo}
        options={[
          { value: "protocolo", label: "Protocolo" },
          { value: "dfd", label: "DFD" },
          { value: "item", label: "Item" },
          { value: "global", label: "ADM (global)" },
        ]}
      />
      <div className="max-w-2xl">
        <Historico key={escopo} entradas={entradas} escopo={escopo} protocoloId={10} item={{ item: 2, codigo: "5241937264" }} />
      </div>
      <div className="max-w-md">
        <span className="mb-2 block text-[11px] font-semibold uppercase tracking-wide text-muted">
          HistoricoDoItem — a seção recolhível no detalhe do item (DFD gravado)
        </span>
        <HistoricoDoItem dfdId={87} item={{ item: 2, codigo: "5241937264" }} entradas={DEMO_HISTORICO.filter((l) => l.entidade === "dfd")} />
      </div>
    </div>
  );
}

/** Demo do aviso flutuante — PEQUENO, no canto inferior do display (não desloca nada ao redor). */
function AvisoFlutuanteDemo() {
  const [aviso, setAviso] = useState<"danger" | "warn" | "ok" | "carregando" | null>(null);
  const fechar = () => setAviso(null);
  return (
    <>
      <div className="flex flex-wrap gap-3">
        <Button variant="secondary" onClick={() => setAviso("danger")}>
          Erro de importação
        </Button>
        <Button variant="secondary" onClick={() => setAviso("warn")}>
          Atenção
        </Button>
        <Button variant="secondary" onClick={() => setAviso("ok")}>
          Resultado
        </Button>
        <Button variant="secondary" onClick={() => setAviso("carregando")}>
          Em andamento
        </Button>
      </div>
      {aviso === "danger" && (
        <AvisoFlutuante kind="danger" titulo="Não foi possível importar" onClose={fechar}>
          Isto é um PROTOCOLO (vários DFDs) — importe pela aba Protocolos.
        </AvisoFlutuante>
      )}
      {aviso === "warn" && (
        <AvisoFlutuante kind="warn" titulo="DFD importado com atenção" onClose={fechar} duracao={8000}>
          A unidade escolhida é diferente da unidade ativa.
        </AvisoFlutuante>
      )}
      {aviso === "ok" && (
        <AvisoFlutuante kind="ok" titulo="DFD 531 importado" onClose={fechar} duracao={8000}>
          3 itens · R$ 412.345,67
        </AvisoFlutuante>
      )}
      {aviso === "carregando" && (
        <AvisoFlutuante kind="info" titulo="Lendo o PDF…" carregando onClose={fechar}>
          Página 3 de 18
        </AvisoFlutuante>
      )}
    </>
  );
}

// Pessoas (Perfil → apelido + foto): a lista nativa mostra "apelido — nome"; a célula, a FOTO + o APELIDO.
const PESSOAS_DEMO = [
  { id: 1, nome: "Ana — Ana Souza", pessoa: { id: 1, nome: "Ana Souza", apelido: "Ana", foto: null } },
  { id: 4, nome: "Carlão — Carlos Lima", pessoa: { id: 4, nome: "Carlos Lima", apelido: "Carlão", foto: null } },
  { id: 7, nome: "Thamires Rocha", pessoa: { id: 7, nome: "Thamires Rocha", apelido: null, foto: null } },
];
const SITUACOES_DEMO = [
  { id: 1, nome: "Recebido", cor: "#64748b" },
  { id: 2, nome: "Em análise", cor: "#2563eb" },
  { id: 3, nome: "Devolvido", cor: "#dc2626" },
  { id: 4, nome: "Concluído", cor: "#16a34a" },
];

/** Demo dos filtros de HIERARQUIA (acima das tabelas da Mesa) e do dropdown DENTRO da célula. */
function SeletoresDemo() {
  const [resp, setResp] = useState("todos");
  const [assunto, setAssunto] = useState("todos");
  const [situacao, setSituacao] = useState<number | null>(2);
  const [pessoa, setPessoa] = useState<number | null>(null);
  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
        <SeletorFiltro
          icone={<IconUser className="h-4 w-4" />}
          rotulo="Responsável"
          valor={resp}
          onChange={setResp}
          ativo={resp !== "todos"}
          opcoes={[{ valor: "todos", rotulo: "Todos" }, { valor: "sem", rotulo: "Sem responsável" }, ...PESSOAS_DEMO.map((p) => ({ valor: String(p.id), rotulo: p.nome }))]}
        />
        <SeletorFiltro
          icone={<IconFilter className="h-4 w-4" />}
          rotulo="Assunto"
          valor={assunto}
          onChange={setAssunto}
          ativo={assunto !== "todos"}
          opcoes={[
            { valor: "todos", rotulo: "Todos" },
            { valor: "INCLUSÃO - PCA 2027", rotulo: "INCLUSÃO - PCA 2027" },
            { valor: "EXCLUSÃO - PCA 2027", rotulo: "EXCLUSÃO - PCA 2027" },
            { valor: "", rotulo: "Sem assunto" },
          ]}
        />
      </div>
      <div className="flex flex-wrap items-center gap-2 rounded-card border border-border p-2">
        <SeletorCelula ariaLabel="Situação do protocolo" valor={situacao} opcoes={SITUACOES_DEMO} onChange={setSituacao} vazio="Sem situação" />
        <SeletorCelula ariaLabel="Responsável pelo protocolo" valor={pessoa} opcoes={PESSOAS_DEMO} onChange={setPessoa} vazio="Sem responsável" />
        <SeletorCelula ariaLabel="Responsável (salvando)" valor={4} opcoes={PESSOAS_DEMO} onChange={() => undefined} salvando />
        <SeletorCelula ariaLabel="Situação (sem permissão)" valor={4} opcoes={SITUACOES_DEMO} />
      </div>
      <p className="text-[12px] text-faint">
        As situações são cadastradas pelo ADM em Configurações → Situações (nome + cor + ordem); o responsável padrão
        de quem protocola é escolhido no Perfil.
      </p>
    </div>
  );
}

/** Demo do campo de LISTA (chips) — várias referências da renovação (contratos/ARPs/licitações). */
function CampoListaDemo() {
  const [refs, setRefs] = useState<string[]>(["045/2025", "112/2025"]);
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <CampoLista label="Nº do contrato" valores={refs} onChange={setRefs} placeholder="Digite e tecle Enter" />
      <CampoLista label="Nº da ARP (só leitura)" valores={["007/2025"]} onChange={() => undefined} disabled />
    </div>
  );
}

/** Demo: "selecionar todos" marca TODAS as linhas filtradas (não só a página) + coluna TRAVADA pelo
 * filtro de hierarquia (o seletor acima manda na coluna). */
function TabelaHierarquiaDemo() {
  const [assunto, setAssunto] = useState("todos");
  const [sel, setSel] = useState<Set<string | number>>(new Set());
  const linhas = assunto === "todos" ? PROTOS : PROTOS.filter((p) => p.assunto === assunto);
  const colunas = COLUNAS.map((c) =>
    c.key === "assunto" && assunto !== "todos" ? { ...c, travado: `Travada pelo filtro "Assunto: ${assunto}" (acima da tabela)` } : c,
  );
  return (
    <div className="space-y-3">
      <SeletorFiltro
        icone={<IconFilter className="h-4 w-4" />}
        rotulo="Assunto"
        valor={assunto}
        onChange={(v) => {
          setAssunto(v);
          setSel(new Set());
        }}
        ativo={assunto !== "todos"}
        opcoes={[{ valor: "todos", rotulo: "Todos" }, ...[...new Set(PROTOS.map((p) => p.assunto))].map((n) => ({ valor: n, rotulo: n }))]}
      />
      <DataTable
        columns={colunas}
        rows={linhas}
        getKey={(r) => r.id}
        selectable
        selected={sel}
        onSelected={setSel}
        pageSize={3}
        footer={`${sel.size} de ${linhas.length} selecionada(s) — o "selecionar todos" marca todas as filtradas, não só a página`}
      />
    </div>
  );
}

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

/** Reenvio do protocolo: DFD gravado × o do PDF corrigido (diferenças reais via `compararDfd`, puro). */
const REENVIO_GRAVADO: DfdComparavel = {
  numero: "531",
  planejamento: "600",
  tipo: "DFD-S — Solução",
  objeto: "Aquisição de material de expediente",
  orgaoEntidade: "Prefeitura Municipal de Rio Verde",
  setorRequisitante: "SMS",
  responsavel: "ANA SOUZA",
  matricula: "1",
  email: null,
  telefone: null,
  numeroContrato: null,
  numeroAta: null,
  numeroLicitacao: null,
  anoPca: 2027,
  reparticaoId: 2,
  valorTotal: 150,
  secoes: [
    { titulo: "3 - JUSTIFICATIVA", texto: "Atender a demanda das unidades de saúde." },
    { titulo: "6 - PRIORIDADE", texto: "BAIXA" },
  ],
  assinaturas: [{ nome: "ANA SOUZA", data: "10/03/2026" }],
  itens: [
    { item: 1, codigo: "100", descricao: "CANETA ESFEROGRÁFICA AZUL", unidade: "UN", quantidade: 10, valorUnitario: 5, valorTotal: 50 },
    { item: 2, codigo: "200", descricao: "PAPEL A4", unidade: "RESMA", quantidade: 5, valorUnitario: 20, valorTotal: 100 },
  ],
};
const REENVIO_COMPARACAO = compararDfd(REENVIO_GRAVADO, {
  ...REENVIO_GRAVADO,
  valorTotal: 219,
  secoes: [
    { titulo: "3 - JUSTIFICATIVA", texto: "Atender a demanda das unidades de saúde." },
    { titulo: "6 - PRIORIDADE", texto: "ALTA" },
  ],
  itens: [
    { item: 1, codigo: "100", descricao: "CANETA ESFEROGRÁFICA AZUL", unidade: "UN", quantidade: 12, valorUnitario: 5, valorTotal: 60 },
    { item: 2, codigo: "200", descricao: "PAPEL A4", unidade: "RESMA", quantidade: 5, valorUnitario: 20, valorTotal: 100 },
    { item: 3, codigo: "300", descricao: "CLIPS Nº 2", unidade: "CX", quantidade: 1, valorUnitario: 9, valorTotal: 9 },
  ],
});

function ReenvioDemo() {
  const [removidos, setRemovidos] = useState<RemovidoReenvio[]>([
    { id: 1, numero: "702", planejamento: "811", valorTotal: 12_450.9, excluir: true },
    { id: 2, numero: "705", planejamento: null, valorTotal: 380, excluir: false },
  ]);
  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <ComparacaoProtocolo
        contagem={{ novos: 1, alterados: 2, iguais: 12, analisando: 0 }}
        capa={[{ campo: "assunto", rotulo: "Assunto", antes: "INCLUSÃO - PCA 2027", depois: "ALTERAÇÃO NÃO ONEROSA - PCA 2027" }]}
        removidos={removidos}
        onRemovidoChange={(id, excluir) => setRemovidos((l) => l.map((r) => (r.id === id ? { ...r, excluir } : r)))}
        onTodosRemovidos={(excluir) => setRemovidos((l) => l.map((r) => ({ ...r, excluir })))}
        onRelatorio={() => toast("Relatório de diferenças (copiável)")}
      />
      <div className="space-y-4">
        {/* Painel "Diferenças" do DFD aberto (ao lado, no banner do reenvio). */}
        <ComparacaoDfdView comparacao={REENVIO_COMPARACAO} herdados={["Tipo", "Validação da assinatura (equipe)"]} />
        {/* Um campo isolado: gravado × novo. */}
        <DiffLinha d={{ campo: "observacao", rotulo: "Observação", antes: "PCA 2027", depois: "PCA 2027 — inclusão complementar" }} />
      </div>
    </div>
  );
}

// SOBRESCRITA de um DFD por um arquivo novo (mesmo nº) — a ESCOLHA POR DADO: o gravado × o novo.
const SOB_GRAVADO: DfdParseado = {
  numero: "1525",
  planejamento: "640",
  tipo: "DFD-S · Solução",
  objeto: "AQUISIÇÃO DE MATERIAL DE EXPEDIENTE",
  orgaoEntidade: "PREFEITURA MUNICIPAL DE RIO VERDE",
  setorRequisitante: "SECRETARIA MUNICIPAL DE ADMINISTRAÇÃO",
  siglaSetor: "SMA",
  responsavel: "ANA SOUZA",
  matricula: null,
  email: null,
  telefone: null,
  anoPca: 2027,
  numeroContrato: null,
  numeroAta: null,
  numeroLicitacao: null,
  valorTotal: 150,
  nomeArquivo: "dfd-1525.pdf",
  secoes: [
    { numero: 3, titulo: "3 - JUSTIFICATIVA", texto: "Atender a demanda das unidades administrativas." },
    { numero: 6, titulo: "6 - PRIORIDADE", texto: "MÉDIA" },
  ],
  assinaturas: [{ nome: "ANA SOUZA", eCpf: "", usuario: "", local: "", data: "10/03/2026 10:00:00", ip: "", codigo: "", url: "", fonte: "certificado" }],
  itens: [
    { item: 1, codigo: "100", descricao: "CANETA ESFEROGRÁFICA AZUL", unidade: "UN", quantidade: 10, valorUnitario: 5, valorTotal: 50 },
    { item: 2, codigo: "200", descricao: "PAPEL A4", unidade: "RESMA", quantidade: 5, valorUnitario: 20, valorTotal: 100 },
  ],
};
const SOB_NOVO: DfdParseado = marcarItensNovos({
  ...SOB_GRAVADO,
  objeto: "AQUISIÇÃO DE MATERIAL DE EXPEDIENTE E ESCRITÓRIO",
  valorTotal: 169,
  secoes: [
    { numero: 3, titulo: "3 - JUSTIFICATIVA", texto: "Atender a demanda das unidades administrativas e das escolas." },
    { numero: 6, titulo: "6 - PRIORIDADE", texto: "ALTA" },
  ],
  itens: [
    { item: 1, codigo: "100", descricao: "CANETA ESFEROGRÁFICA AZUL", unidade: "UN", quantidade: 12, valorUnitario: 5, valorTotal: 60 },
    { item: 2, codigo: "200", descricao: "PAPEL A4", unidade: "RESMA", quantidade: 5, valorUnitario: 20, valorTotal: 100 },
    { item: 3, codigo: "300", descricao: "CLIPS Nº 2", unidade: "CX", quantidade: 1, valorUnitario: 9, valorTotal: 9 },
  ],
});

/** Demo da SOBRESCRITA com escolha por dado (o MESMO hook dos banners: `useSobrescrita`). */
function SobrescritaDemo() {
  const [trabalho, setTrabalho] = useState<DfdParseado>(SOB_NOVO);
  const sob = useSobrescrita({ gravado: SOB_GRAVADO, novo: SOB_NOVO, trabalho, onTrabalho: (fn) => setTrabalho(fn) });
  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <ComparacaoDfdView comparacao={sob?.comparacao ?? null} escolha={sob?.escolha ?? null} />
      <div className="space-y-3">
        <StatMini label="Resultado — valor total (Σ itens)" value={brl(trabalho.valorTotal ?? 0)} hint={`${trabalho.itens.length} itens`} />
        {sob && (
          <Callout kind="info" icon={<IconCheck className="h-5 w-5" />}>
            {sob.resumo.novos} dado(s) do arquivo novo · {sob.resumo.mantidos.length} mantido(s) do gravado ·{" "}
            {sob.resumo.editados.length} editado(s). O histórico registra o que foi mantido.
          </Callout>
        )}
      </div>
    </div>
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
  ["violeta", "--nat-comunicacao"], ["âmbar", "--sit-em-analise"], ["verde", "--sit-finalizado"],
  ["laranja", "--sit-devolvido"], ["vermelho", "--sit-cancelado"],
];
const ORGAOS = [
  "Secretaria Municipal de Saúde", "Secretaria Municipal de Educação", "Secretaria de Infraestrutura",
  "Procuradoria-Geral do Município", "Gabinete do Prefeito", "Secretaria de Meio Ambiente",
  "Secretaria de Assistência Social",
];
const ICONES = (
  Object.entries(Icons) as [string, (p: { className?: string }) => ReactNode][]
).filter(([k]) => k.startsWith("Icon"));

// Protocolos de exemplo (como na Mesa): assunto da capa + situação cadastrada pelo ADM (`SITUACOES_DEMO`).
type Proto = {
  id: number;
  data: string;
  orgao: string;
  sigla: string;
  assunto: string;
  responsavel: string;
  situacaoId: number | null;
  valor: number;
};
/** Tom do assunto pela categoria (INCLUSÃO / EXCLUSÃO / ALTERAÇÃO) — só para a demo. */
function tomAssunto(assunto: string): Tone {
  if (assunto.startsWith("EXCLUSÃO")) return "red";
  if (assunto.startsWith("ALTERAÇÃO")) return "blue";
  return "emerald";
}
const PROTOS: Proto[] = [
  { id: 118223, data: "02/09/2026", orgao: "Secretaria Municipal de Saúde", sigla: "SMS", assunto: "INCLUSÃO - PCA 2027", responsavel: "Naty", situacaoId: 2, valor: 1250000 },
  { id: 115282, data: "28/08/2026", orgao: "Secretaria Municipal de Educação", sigla: "SME", assunto: "EXCLUSÃO - PCA 2027", responsavel: "Cris", situacaoId: 4, valor: 84300.5 },
  { id: 117904, data: "30/08/2026", orgao: "Secretaria de Infraestrutura", sigla: "SEINFRA", assunto: "ALTERAÇÃO NÃO ONEROSA - PCA 2027", responsavel: "Thamires", situacaoId: 2, valor: 3200000 },
  { id: 116540, data: "25/08/2026", orgao: "Diretoria de Logística e Transporte", sigla: "DLT", assunto: "INCLUSÃO - PCA 2027", responsavel: "Naty", situacaoId: 3, valor: 15900 },
  { id: 118990, data: "04/09/2026", orgao: "Secretaria Municipal da Fazenda", sigla: "SEFAZ", assunto: "INCLUSÃO - PCA 2027", responsavel: "", situacaoId: null, valor: 452000 },
  { id: 113220, data: "12/08/2026", orgao: "Gabinete do Prefeito", sigla: "GAB", assunto: "EXCLUSÃO - PCA 2027", responsavel: "Naty", situacaoId: 1, valor: 7800 },
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
    key: "assunto",
    header: "Assunto",
    minWidth: 172,
    value: (r) => r.assunto,
    render: (r) => <Badge tone={tomAssunto(r.assunto)}>{r.assunto}</Badge>,
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
    value: (r) => SITUACOES_DEMO.find((s) => s.id === r.situacaoId)?.nome ?? "Sem situação",
    render: (r) => <SeletorCelula ariaLabel="Situação" valor={r.situacaoId} opcoes={SITUACOES_DEMO} vazio="Sem situação" />,
  },
  // Coluna R$: filtro de FAIXA (barra de arrasto + "Valor cheio"), conectado aos demais filtros.
  { key: "valor", header: "Valor", align: "right", nowrap: true, filter: "range", numero: (r) => r.valor, render: (r) => brl(r.valor) },
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
      {
        // Formato E — Foxit/ICP-Brasil ACHATADO, lido por OCR do carimbo: card ÂMBAR + chip "Foxit",
        // sem código/link público (confere-se no PDF assinado original). CPF mascarado do CN.
        nome: "BRUNO BOTELHO SALEH",
        eCpf: "***.832.056-**",
        usuario: "",
        local: "",
        data: "06/07/2026 14:08:20 -03:00",
        ip: "",
        codigo: "",
        url: "",
        fonte: "foxit" as const,
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

const PCA_DEMO: PcaDetalhe = {
  id: 1,
  nome: "PCA 2026",
  ano: 2026,
  ativo: true,
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
        { id: 1, numero: "1586", objeto: "AQUISIÇÃO DE SERVIÇO", setorRequisitante: "SMIR", valorTotal: 342342.72, totalItens: 2, itens: DFD_ITENS_DEMO },
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
          valorTotal: 170000,
          totalItens: 1,
          itens: [{ id: 3, item: 1, codigo: "9910011", descricao: "SERINGA DESCARTÁVEL 5ML", unidade: "CENTO", quantidade: 300, valorUnitario: 566.67, valorTotal: 170000 }],
        },
      ],
    },
  ],
};

// Protocolo (processo) com vários DFDs — CORPO ÚNICO (`ProtocoloView`) da análise e do gravado. O
// upload (que carrega o pdf.js) e os banners com dados (gravado) ficam fora do catálogo.
const PROTO_CAPA_DEMO: CapaValores = {
  numero: "144756/2026",
  idExterno: "2273524",
  data: "09/09/2026 16:41:38",
  documento: "29.788.950/0001-04",
  interessado: "1008171 - FUNDO MUNICIPAL DOS DIREITOS DO IDOSO",
  assunto: "INCLUSÃO - PCA",
  observacao: "PCA 2027",
  valorCapa: 32705,
  localReparticao: "COMPRAS FMAS",
};
const PROTO_LINHAS_DEMO = [
  { key: 1, numero: "1586", planejamento: "1639", sigla: "SMIR", tipo: "DFD-S", itens: 2, valor: 342342.72, estado: "regular" as const, assinaturas: ["centi" as const], validacao: "auto" as const },
  {
    key: 2,
    numero: "1720",
    planejamento: "1802",
    sigla: "SMS",
    tipo: "DFD-R",
    itens: 1,
    valor: 170000,
    estado: "atencao" as const,
    resumo: resumoEstado([{ status: "atencao", chave: "dfd.assinaturaValidar", texto: "Assinatura Dropsigner reconhecida só pelo código — confira e valide." }]),
    assinaturas: ["dropsigner" as const],
  },
];

// RASTRO: DFDs deste processo SOBRESCRITOS por outro protocolo (cinza, com o protocolo ATUAL de cada um).
const PROTO_SOBRESCRITOS_DEMO: DfdSobrescrito[] = [
  {
    numero: "1601",
    planejamento: "1655",
    tipo: "DFD-S · Solução",
    sigla: "SMIR",
    totalItens: 4,
    valorTotal: 18250,
    sobrescritoEm: "2026-09-15 13:22:10",
    dfdId: 91,
    protocoloAtualId: 12,
    protocoloAtualNumero: "150321/2026",
    acessivel: true,
  },
  {
    numero: "1610",
    planejamento: null,
    tipo: "DFD-R · Renovação",
    sigla: "SMS",
    totalItens: 1,
    valorTotal: 2300,
    sobrescritoEm: "2026-09-16 09:05:44",
    dfdId: null,
    protocoloAtualId: null,
    protocoloAtualNumero: null,
  },
];

/** Demo do CORPO do protocolo: conciliação da capa com "Substituir pela somatória" + seleção + o RASTRO cinza. */
function ProtocoloViewDemo() {
  const [capa, setCapa] = useState<CapaValores>(PROTO_CAPA_DEMO);
  const [sel, setSel] = useState<Set<string | number>>(new Set());
  const valorRastro = PROTO_SOBRESCRITOS_DEMO.reduce((a, s) => a + (s.valorTotal ?? 0), 0);
  const somatorio = PROTO_LINHAS_DEMO.reduce((a, l) => a + l.valor, 0) + valorRastro;
  const conc = conciliacaoCapa({ valorCapa: capa.valorCapa, somatorio, totalDfds: PROTO_LINHAS_DEMO.length + PROTO_SOBRESCRITOS_DEMO.length });
  return (
    <ProtocoloView
      capa={capa}
      modoCapa="cadeado"
      assuntos={["INCLUSÃO - PCA", "EXCLUSÃO", "ALTERAÇÃO NÃO ONEROSA"]}
      onCapaChange={(c, v) => setCapa((x) => ({ ...x, [c]: v }) as CapaValores)}
      onValorCapaChange={(v) => setCapa((x) => ({ ...x, valorCapa: v }))}
      unidade={{ id: 1, opcoes: [{ id: 1, codigo: "SMIR", nome: "Secretaria Municipal de Infraestrutura Rural" }] }}
      pca={<TextField label="PCA (ano)" value="2027" disabled readOnly />}
      totais={{ dfds: PROTO_LINHAS_DEMO.length, itens: 3, somatorio, sobrescritos: { qtd: PROTO_SOBRESCRITOS_DEMO.length, valor: valorRastro } }}
      conciliacao={conc}
      onSubstituir={() => setCapa((x) => ({ ...x, valorCapa: conc.somatorio }))}
      linhas={PROTO_LINHAS_DEMO}
      unica
      selecionavel
      selected={sel}
      onSelected={setSel}
      onVerDfd={(k) => toast(`Abrir o DFD ${k} ao lado`)}
      nota={<p className="text-[11px] text-faint">Protocolado em 09/09/2026.</p>}
      sobrescritos={PROTO_SOBRESCRITOS_DEMO}
      onVerProtocolo={(id) => toast(`Abrir o protocolo atual (#${id}) na pilha`)}
    />
  );
}

/** Demo do DfdView com as SEÇÕES editáveis por cadeado (obrigatória ausente = "não preenchida"). */
function DfdViewSecoesDemo() {
  const [secoes, setSecoes] = useState(DFD_DEMO.secoes.filter((x) => x.numero !== 3));
  return <DfdView dfd={{ ...DFD_DEMO, secoes }} onSecoesChange={setSecoes} unica />;
}

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
  const [sw, setSw] = useState(true);
  const [modalAberto, setModalAberto] = useState(false);
  const [relatorioAberto, setRelatorioAberto] = useState(false);
  const [incluirAtencaoDemo, setIncluirAtencaoDemo] = useState(true);
  const [mdAberto, setMdAberto] = useState(false);
  const [mdLateral, setMdLateral] = useState(false);
  const [pilhaDemo, setPilhaDemo] = useState<number>(0); // 0 fechado · 1 item · 2 DFD | item · 3 protocolo | DFD | item
  const [faixaDemo, setFaixaDemo] = useState<{ min?: number; max?: number } | null>(null);
  const [selDemo, setSelDemo] = useState<RegistroSelecao[]>([
    { key: 1, rotulo: "DFD 531" },
    { key: 2, rotulo: "DFD 389" },
    { key: 3, rotulo: "DFD 712" },
  ]);
  const [editorDemo, setEditorDemo] = useState<"dfds" | "protocolos" | "itens">("dfds");
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
        <div className="grid grid-cols-3 gap-3 sm:grid-cols-5">
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
        <div className="mt-4 flex flex-wrap items-center gap-6">
          <Switch label="Bloqueia importação/protocolação" checked={sw} onChange={setSw} />
          <Switch label="Desligada (desabilitada)" checked={false} onChange={() => {}} disabled />
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
          <StatMini label="Valor total" value="R$ 1.284.902,10" />
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
                  "   - DFD de renovação (DFD-R) sem referência de contrato, ARP ou licitação — informar ao menos uma.",
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

      <Secao titulo="PessoaTag (FOTO + APELIDO — colunas Responsável e Distribuição da Mesa; nome completo no title)">
        <div className="flex flex-wrap items-center gap-4">
          {PESSOAS_DEMO.map((p) => (
            <PessoaTag key={p.id} pessoa={p.pessoa} />
          ))}
          <PessoaTag pessoa={null} vazio="Sem responsável" />
        </div>
        <p className="mt-2 text-[12px] text-faint">
          O apelido é cadastrado no Perfil (sem apelido, vale o nome); sem foto, as iniciais na cor da pessoa. A foto vem
          da rota <span className="font-mono">/api/usuarios/[id]/foto</span> com cache (a versão muda ao salvar o perfil).
        </p>
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
          <FilterChip label="Assunto" />
          <FilterChip label="Órgão" active />
        </div>
      </Secao>

      <Secao titulo="Filtro de cabeçalho & Período">
        <div className="flex flex-wrap items-center gap-6">
          <div className="rounded-control border border-border bg-surface-2 px-2">
            <MultiSelectHeader label="Órgão" options={ORGAOS} value={orgaos} onApply={setOrgaos} onSort={setSortOrgao} sortDir={sortOrgao} />
          </div>
          {/* Filtro de FAIXA (colunas R$): barra de arrasto do menor ao maior valor, crescente/decrescente e
              "Valor cheio" (a faixa inteira) — arrastar desmarca; marcar limpa a barra. */}
          <div className="w-48 rounded-control border border-border bg-surface-2 px-2">
            <RangeFilterHeader
              label="Valor total"
              dominio={[0, 1500, 15900, 84300.5, 452000, 1250000, 3200000]}
              value={faixaDemo ?? undefined}
              marcado={!!faixaDemo}
              onApply={setFaixaDemo}
              onSort={(d) => toast(`Ordenar: ${d === "asc" ? "crescente" : "decrescente"}`)}
            />
          </div>
          <PeriodoPicker anos={[2027, 2026, 2025]} value={{ preset: "todo" }} />
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-4">
          {/* Gatilho comum dos 3 filtros: coluna FILTRADA = tópico MARCADO (accent + funil). */}
          <div className="w-40">
            <GatilhoFiltro label="Sigla" />
          </div>
          <div className="w-40">
            <GatilhoFiltro label="Estado" sortDir="asc" marcado />
          </div>
          <span className="text-[12px] text-faint">
            {faixaDemo ? `Faixa: ${faixaDemo.min != null ? brl(faixaDemo.min) : "…"} a ${faixaDemo.max != null ? brl(faixaDemo.max) : "…"}` : "Valor cheio (sem faixa)"}
          </span>
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

      <Secao titulo="Avisos flutuantes (AvisoFlutuante + Toast) — pequenos, no canto inferior, sem deformar a tela">
        <AvisoFlutuanteDemo />
        <p className="my-3 text-[12px] text-faint">
          O MESMO componente é usado pelo toast (abaixo), pelos erros/resultados de importação e pelas falhas das ações
          — sobe acima da navegação inferior do celular e da barra de seleção fixa.
        </p>
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

      <Secao titulo="Acesso restrito">
        <AcessoRestrito mensagem="Somente administradores podem acessar esta área." />
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
          <Button variant="secondary" onClick={() => setPilhaDemo(1)}>
            Abrir pilha de banners (Protocolo | DFD | Item)
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

        {/* Pilha de banners em ORDEM FIXA — Protocolo | DFD | Item —, qualquer que seja o banner de entrada: a
            partir do ITEM, "Ver DFD"/"Ver protocolo" surgem à ESQUERDA dele (`esquerda`), cada um no seu lugar. */}
        <Modal
          open={pilhaDemo > 0}
          onClose={() => setPilhaDemo(0)}
          titulo="Item 3 — DFD 531"
          larguraPrincipal={34}
          rodape={
            <div className="flex flex-wrap gap-2">
              <Button variant="secondary" onClick={() => setPilhaDemo((n) => Math.max(n, 2))} disabled={pilhaDemo >= 2}>
                <Icons.IconFile className="h-4 w-4" /> Ver DFD
              </Button>
              <Button
                variant="secondary"
                onClick={() => {
                  if (pilhaDemo >= 2) return setPilhaDemo(3);
                  setPilhaDemo(2); // o DFD entra primeiro; o protocolo, em seguida (à esquerda dele)
                  window.setTimeout(() => setPilhaDemo((n) => (n === 2 ? 3 : n)), duracaoMotionMs());
                }}
                disabled={pilhaDemo >= 3}
              >
                <Icons.IconLayers className="h-4 w-4" /> Ver protocolo
              </Button>
            </div>
          }
          esquerda={[
            {
              id: "protocolo",
              aberto: pilhaDemo >= 3,
              largura: 50,
              titulo: "Protocolo 144756/2026",
              onClose: () => setPilhaDemo(2),
              children: <p className="text-[13px] text-text-2">O protocolo surge à ESQUERDA do DFD — sempre Protocolo | DFD | Item.</p>,
            },
            {
              id: "dfd",
              aberto: pilhaDemo >= 2,
              largura: 52,
              titulo: "DFD 531",
              onClose: () => setPilhaDemo(1),
              children: <p className="text-[13px] text-text-2">O DFD surgiu à esquerda do item (a coluna dele) — a ordem não muda.</p>,
            },
          ]}
        >
          <p className="text-[13px] text-text-2">
            Banner do ITEM (linha da visão Itens) — a coluna da direita. "Ver DFD" / "Ver protocolo" surgem à esquerda; no
            celular, um banner por vez (o último aberto); X/Esc fecham o último aberto.
          </p>
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

      <Secao titulo="Tabela — densidade por visão (comfortable · default · compact)">
        <p className="mb-3 text-[13px] text-muted">
          A prop <span className="font-mono text-text-2">density</span> ajusta a altura da linha SÓ daquela tabela
          (via <span className="font-mono text-text-2">--cell-py</span> local), para diferenciar visões que dividem o
          mesmo espaço — ex.: na tela DFD, Protocolos (alta) · DFDs (média) · Itens (fina).
        </p>
        <div className="space-y-4">
          {(["comfortable", "default", "compact"] as const).map((d) => (
            <div key={d}>
              <div className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-faint">{d}</div>
              <DataTable
                columns={COLUNAS}
                rows={PROTOS.slice(0, 2)}
                getKey={(r) => r.id}
                density={d === "default" ? undefined : d}
              />
            </div>
          ))}
        </div>
      </Secao>

      <Secao titulo="PlanilhaDfds (planilha de DFDs — análise: erro/atenção separados; colunas na largura do conteúdo)">
        <PlanilhaDfds
          linhas={[
            { key: 1, numero: "531", planejamento: "600", sigla: "FMS", auto: true, tipo: "DFD-R", itens: 692, valor: 269705678.89, estado: "regular", situacao: "Novo", assinaturas: ["dropsigner"], validacao: "auto" },
            { key: 2, numero: "389", planejamento: "410", sigla: "FMS", tipo: "DFD-S", itens: 281, valor: 1284902.1, estado: "regular", situacao: "Substitui", assinaturas: ["centi"], validacao: "equipe" },
            { key: 4, numero: "712", planejamento: "798", sigla: "FMS", tipo: "DFD-R", itens: 44, valor: 812340.5, estado: "atencao", situacao: "Novo" },
            { key: 3, numero: "1024", planejamento: "1066", sigla: "FMS", tipo: "DFD-R", itens: 0, valor: 0, estado: "erro", estadoMotivo: "Leitura incompleta da tabela", situacao: "Novo" },
            // Análise em andamento: spinner + o que o sistema está fazendo (feedback real).
            { key: 5, numero: "1100", planejamento: null, sigla: "FMS", tipo: null, itens: null, valor: null, estado: "pendente", processando: "texto", situacao: "Novo" },
            { key: 6, numero: "1101", planejamento: "1190", sigla: "FMS", tipo: "DFD-S", itens: 12, valor: 4200, estado: "pendente", processando: "ocr", situacao: "Novo" },
            { key: 7, numero: "1102", planejamento: null, sigla: "FMS", tipo: null, itens: null, valor: null, estado: "pendente", processando: "fila", situacao: "Novo" },
          ]}
        />
      </Secao>

      <Secao titulo="PlanilhaDfds ÚNICA (depois de protocolado — uma tabela só; o filtro de Estado separa)">
        <PlanilhaDfds
          unica
          linhas={[
            { key: 1, numero: "531", planejamento: "600", sigla: "FMS", tipo: "DFD-R", itens: 692, valor: 269705678.89, estado: "regular", protocolo: "144756/2026", assinaturas: ["centi"], validacao: "auto" },
            { key: 4, numero: "712", planejamento: "798", sigla: "FMS", tipo: "DFD-R", itens: 44, valor: 812340.5, estado: "atencao", protocolo: "144756/2026", resumo: resumoEstado([{ status: "atencao", chave: "dfd.referenciaRenovacao", texto: "DFD-R sem referência." }]) },
            { key: 8, numero: "900", planejamento: "950", sigla: "SMS", tipo: null, itens: 3, valor: 900, estado: "pendente", processando: "conferindo", protocolo: null },
          ]}
        />
      </Secao>

      <Secao titulo="TabelaSobrescritos (RASTRO cinza — DFDs do processo sobrescritos por outro protocolo; leva ao protocolo ATUAL)">
        <TabelaSobrescritos sobrescritos={PROTO_SOBRESCRITOS_DEMO} onVerProtocolo={(id) => toast(`Abrir o protocolo atual (#${id})`)} />
        <p className="mt-2 text-[12px] text-faint">
          O retrato é da versão que ESTE processo tinha (valor da época — entra na conciliação da capa). "Sobrescrito pelo"
          é sempre o protocolo onde o DFD está AGORA (o último da cadeia A → B → C).
        </p>
      </Secao>

      <Secao titulo="EstadoCelula (célula Estado — resumo do problema + contadores; ou ponto + rótulo)">
        <div className="flex flex-wrap items-center gap-4">
          <EstadoResumo
            res={resumoEstado([
              { status: "erro", chave: "dfd.tipo", texto: "Tipo do DFD não identificado." },
              { status: "erro", chave: "dfd.justificativa", texto: "Justificativa não preenchida." },
              { status: "atencao", chave: "dfd.referenciaRenovacao", texto: "DFD-R sem referência." },
            ])}
          />
          <EstadoPonto cor="var(--ok)" rotulo="Regular" />
          <EstadoPonto cor="var(--danger)" rotulo="Leitura incompleta" title="Item sem número no PDF" />
          <EstadoProcessando rotulo="Conferindo…" />
          <EstadoProcessando rotulo="Na fila" fila />
        </div>
        <p className="mt-3 text-xs text-muted">CelulaCatalogo — a coluna "Catálogo" dos itens (nível do ADM; detalhe no tooltip):</p>
        <div className="mt-1 flex flex-wrap items-center gap-4">
          <CelulaCatalogo conf={{ faltas: [], divergDescricao: false, divergUnidade: false }} regras={regrasPadrao()} dfdTipo="DFD-S" />
          <CelulaCatalogo conf={{ faltas: ["divergenteCatalogo"], divergDescricao: true, divergUnidade: false }} regras={regrasPadrao()} dfdTipo="DFD-S" />
          <CelulaCatalogo conf={{ faltas: ["naoCatalogado"], divergDescricao: false, divergUnidade: false }} regras={regrasPadrao()} dfdTipo="DFD-S" />
          <CelulaCatalogo conf={null} regras={regrasPadrao()} dfdTipo="DFD-S" />
        </div>
      </Secao>

      <Secao titulo="Seletores — filtro de HIERARQUIA (acima das tabelas) e dropdown DENTRO da célula (Situação · Responsável)">
        <SeletoresDemo />
      </Secao>

      <Secao titulo="Tabela — selecionar TODAS as linhas filtradas + coluna travada pelo filtro de hierarquia">
        <TabelaHierarquiaDemo />
      </Secao>

      <Secao titulo="BotaoCopiar (copia um texto pronto — ex.: os planejamentos selecionados)">
        <div className="flex flex-wrap items-center gap-3">
          <BotaoCopiar texto="1525:1549:1554" rotulo="Copiar planejamentos" titulo="Copia: 1525:1549:1554" />
          <BotaoCopiar texto="" rotulo="Copiar planejamentos" titulo="Os DFDs selecionados não têm nº de planejamento" />
        </div>
      </Secao>

      <Secao titulo="CampoLista (lista em chips — várias referências da renovação por DFD)">
        <CampoListaDemo />
      </Secao>

      <Secao titulo="BarraSelecao + editores de massa (registro das seleções, somatório R$ e edição — DFDs · Protocolos · Itens)">
        <div className="mb-3">
          <Segmented<"dfds" | "protocolos" | "itens">
            value={editorDemo}
            onChange={setEditorDemo}
            options={[
              { value: "dfds", label: "DFDs" },
              { value: "protocolos", label: "Protocolos" },
              { value: "itens", label: "Itens" },
            ]}
          />
        </div>
        {selDemo.length === 0 ? (
          <Button
            variant="secondary"
            onClick={() =>
              setSelDemo([
                { key: 1, rotulo: "DFD 531" },
                { key: 2, rotulo: "DFD 389" },
                { key: 3, rotulo: "DFD 712" },
              ])
            }
          >
            Refazer a seleção (demo)
          </Button>
        ) : (
          editorDemo === "dfds" ? (
            // Planilha de DFDs: chips + Σ + "Copiar planejamentos" ("1525:1549:1554").
            <BarraSelecaoDfds
              dfds={selDemo.map((r, i) => ({
                key: r.key,
                numero: r.rotulo.replace(/^DFD /, ""),
                planejamento: ["1525", "1549", "1554"][i % 3],
                valor: 412_345.67,
                itens: 37,
              }))}
              onRemover={(k) => setSelDemo((l) => l.filter((r) => r.key !== k))}
              onLimpar={() => setSelDemo([])}
            >
              <BarraEdicaoMassa
                reparticoes={[
                  { id: 1, codigo: "SMIR", nome: "Secretaria Municipal de Infraestrutura Rural" },
                  { id: 2, codigo: "SMS", nome: "Secretaria Municipal de Saúde" },
                ]}
                anoPadrao={2027}
                onAplicar={(a) => toast(`Aplicar: ${a.campo}`)}
              />
            </BarraSelecaoDfds>
          ) : (
            <BarraSelecao
              registros={selDemo}
              onRemover={(k) => setSelDemo((l) => l.filter((r) => r.key !== k))}
              onLimpar={() => setSelDemo([])}
              resumo={<ResumoSelecao qtd={selDemo.length} singular="DFD" plural="DFDs" soma={selDemo.length * 412_345.67} extra={`${selDemo.length * 37} itens`} />}
            >
              {editorDemo === "protocolos" ? (
                <BarraEdicaoMassaProtocolos
                  reparticoes={[{ id: 2, codigo: "SMS", nome: "Secretaria Municipal de Saúde" }]}
                  pessoas={PESSOAS_DEMO}
                  situacoes={SITUACOES_DEMO}
                  onAplicar={(a) => toast(`Aplicar nos protocolos: ${a.campo}`)}
                />
              ) : (
                <BarraEdicaoMassaItens onAplicar={(a) => toast(`Aplicar nos itens: ${a.campo}`)} />
              )}
            </BarraSelecao>
          )
        )}
        <p className="mt-2 text-[12px] text-faint">
          Na Mesa a barra é <span className="font-mono">fixa</span> no rodapé do display (acima da navegação inferior no
          celular, com recolher) e a tabela reserva a altura dela; nos banners fica no rodapé fixo.
        </p>
      </Secao>

      <Secao titulo="DfdRodape (rodapé fixo do banner do DFD — estado + mensagens + ações)">
        <DfdRodape
          estado="atencao"
          mensagens={[
            { chave: "a", status: "atencao", texto: "", ancora: "" },
            { chave: "b", status: "acerto", texto: "", ancora: "" },
          ]}
          mensagensAbertas={false}
          onToggleMensagens={() => toast("Abrir/ocultar mensagens")}
          onFechar={() => toast("Fechar")}
          acoes={
            <Button variant="secondary" onClick={() => toast("Histórico")}>
              <Icons.IconClock className="h-4 w-4" /> Histórico
            </Button>
          }
          principal={<Button onClick={() => toast("Salvar alterações")}>Salvar alterações</Button>}
        />
      </Secao>

      <Secao titulo="DfdPainelDireito (painel da direita do DFD — mensagens / item / histórico)">
        <div className="max-w-md">
          <DfdPainelDireito
            painel={{ tipo: "mensagens" }}
            dfd={null}
            numero="1586"
            mensagens={[
              { chave: "dfd.justificativa", status: "erro", texto: "Justificativa da necessidade (Seção 3) não preenchida.", ancora: "justificativa" },
              { chave: "dfd.assinatura", status: "acerto", texto: "Assinatura validada automaticamente (auto).", ancora: "assinatura" },
            ]}
            onIrPara={(m) => toast(`Rolar até: ${m.ancora}`)}
          />
          {/* Rodapé do painel quando mostra um ITEM (voltar ao DFD / subir ao protocolo). */}
          <div className="mt-4 border-t border-border pt-3">
            <RodapePainelItem onVerDfd={() => toast("Voltar ao DFD")} onVerProtocolo={() => toast("Ver protocolo")} />
          </div>
          {/* Banner SÓ do item (visão Itens da Mesa): + Fechar e Salvar alterações. */}
          <div className="mt-3 border-t border-border pt-3">
            <RodapePainelItem
              onVerDfd={() => toast("O DFD entra pela direita")}
              onVerProtocolo={() => toast("O DFD e depois o protocolo entram pela direita")}
              onFechar={() => toast("Fechar")}
              principal={<Button onClick={() => toast("Salvar alterações")}>Salvar alterações</Button>}
            />
          </div>
        </div>
      </Secao>

      <Secao titulo="Sobrescrita do DFD — ESCOLHA POR DADO (Manter gravado | Usar novo; o DFD ao lado mostra o resultado)">
        <SobrescritaDemo />
        <p className="mt-3 text-[12px] text-faint">
          Botão "Sobrescrever DFD" no banner do DFD gravado (e o "Importar DFD" de um nº já cadastrado): o arquivo novo é
          comparado com o gravado e cada diferença — campo, seção, assinaturas, item — tem a escolha. O DFD continua no
          protocolo dele; o histórico registra a sobrescrita e o que foi mantido.
        </p>
      </Secao>

      <Secao titulo="ComparacaoReenvio (reenviar o MESMO protocolo — comparação gravado × PDF novo, antes de sobrescrever)">
        <ReenvioDemo />
        <p className="mt-3 text-[12px] text-faint">
          No banner do protocolo gravado, "Reenviar protocolo" aceita só o MESMO nº e Id. O bloco de comparação vai no topo
          do banner (<span className="font-mono">ProtocoloView.topo</span>); cada DFD tem o painel "Diferenças" ao lado; só
          o que mudou é regravado ao sobrescrever.
        </p>
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
              { chave: "dfd.referenciaRenovacao", status: "atencao", texto: "DFD de renovação (DFD-R) sem referência de contrato, ARP ou licitação.", ancora: "referenciaRenovacao" },
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

      <Secao titulo="ItemDetalhe — item REPETIDO (mesmo código, descrição e unidade): os iguais lado a lado, Ver item, remover ou UNIFICAR (não bloqueia)">
        <div className="max-w-md">
          <ItemRepetidoDemo />
        </div>
      </Secao>

      <Secao titulo="ComparacaoDuplicados (DFDs duplicados no protocolo — o aberto × cada duplicado, campo a campo, e Manter este)">
        <div className="max-w-xl">
          <DuplicadosDemo />
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
            vinculo={{ orgao: "PMRV — Prefeitura Municipal de Rio Verde", unidade: "SME — Secretaria Municipal de Educação" }}
          />
        </div>
      </Secao>

      <Secao titulo="OrcamentoVinculos (Órgão/Unidade do CUBO → órgão/unidade cadastrado; sugestão automática)">
        <OrcamentoVinculos
          podeEditar
          onVincular={() => {}}
          alvos={{
            orgaos: [{ id: 1, sigla: "PMRV", nome: "Prefeitura Municipal de Rio Verde" }],
            unidades: [
              { id: 15, sigla: "SME", nome: "Secretaria Municipal de Educação", orgaoId: 1 },
              { id: 16, sigla: "SMS", nome: "Secretaria Municipal de Saúde", orgaoId: 1 },
            ],
          }}
          linhas={[
            { tipo: "orgao", chave: "PREFEITURA", texto: "PREFEITURA MUNICIPAL DE RIO VERDE", contexto: "", lancamentos: 120, valorInicial: 98000000, alvoId: 1, sugestaoId: null },
            { tipo: "unidade", chave: "2 - SME", texto: "2 - SECRETARIA MUNICIPAL DE EDUCAÇÃO", contexto: "FUNDO MUNICIPAL DE EDUCACAO DE RIO VERDE", lancamentos: 48, valorInicial: 25000000, alvoId: null, sugestaoId: 15 },
            { tipo: "unidade", chave: "26 - FMACL", texto: "26 - FMACL", contexto: "FD. MUN. DE ASS. SOCIAL", lancamentos: 9, valorInicial: 1200000, alvoId: null, sugestaoId: null },
          ]}
        />
      </Secao>

      <Secao titulo="Histórico (quem, quando, por qual canal e protocolo, o que mudou antes → depois — protocolo · DFD · item · ADM)">
        <HistoricoDemo />
      </Secao>

      <Secao titulo="DFD — visualização do documento importado">
        {/* Cabeçalho FIXO (`DfdCabecalho`) — no app vai no topo do banner; solto, acima. */}
        <div className="mb-4 border-b border-border pb-3">
          <DfdCabecalho numero={DFD_DEMO.numero} tipo={DFD_DEMO.tipo} planejamento={DFD_DEMO.planejamento} />
          {/* Sobrescrita por um arquivo novo (escolha por dado) — o selo no cabeçalho do banner. */}
          <div className="mt-2">
            <DfdCabecalho numero={DFD_DEMO.numero} tipo={DFD_DEMO.tipo} planejamento={DFD_DEMO.planejamento} sobrescrita />
          </div>
        </div>
        <DfdView dfd={DFD_DEMO} />
      </Secao>

      <Secao titulo="DFD — seções editáveis com cadeado (todas; obrigatória ausente aparece como “não preenchida”)">
        <DfdViewSecoesDemo />
      </Secao>

      <Secao titulo="Protocolo — corpo único do banner (análise = gravado): capa, conciliação, planilha">
        <div className="mb-4 space-y-2 border-b border-border pb-3">
          <ProtocoloCabecalho numero={PROTO_CAPA_DEMO.numero} idExterno={PROTO_CAPA_DEMO.idExterno} assunto={PROTO_CAPA_DEMO.assunto} />
          {/* Banner do REENVIO (PDF corrigido × gravado). */}
          <ProtocoloCabecalho numero={PROTO_CAPA_DEMO.numero} idExterno={PROTO_CAPA_DEMO.idExterno} assunto={PROTO_CAPA_DEMO.assunto} reenvio />
        </div>
        <ProtocoloViewDemo />
      </Secao>

      <Secao titulo="PCA — espaço: card 4:5 (capa/recorte), seletor múltiplo (visões do orçamento) e comparativo Orçamento × Contratações">
        <PcaEspacoDemo />
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
