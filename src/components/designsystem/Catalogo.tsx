"use client";

import { CamposProtecao } from "@/components/ProtecaoDadosAdmin";
import { MarcaDagua } from "@/components/ProtecaoDados";
import { type ConfigProtecao, PROTECAO_PADRAO } from "@/lib/protecao-core";
import Link from "next/link";
import { type ReactNode, useEffect, useState } from "react";
import { AcessoDaPessoa } from "@/components/AcessoDaPessoa";
import { AcessoRestrito } from "@/components/AcessoRestrito";
import { CartaoAuth, ErroAuth } from "@/components/CartaoAuth";
import { CampoCodigo, EtapaCodigo } from "@/components/CodigoEmail";
import { VerificacaoRobo } from "@/components/VerificacaoRobo";
import { CampoMatricula } from "@/components/CampoMatricula";
import { BotaoWhatsapp, CampoTelefone } from "@/components/Telefone";
import { type UsuarioAdmin, UsuarioDetalhe } from "@/components/UsuarioDetalhe";
import { MarcaSistema } from "@/components/MarcaSistema";
import { OpcoesUnidades } from "@/components/OpcoesUnidades";
import { OrcamentoPca } from "@/components/OrcamentoPca";
import { PcaCapa, PcaCard, PcaNovoCard } from "@/components/PcaCard";
import { RecorteImagem } from "@/components/RecorteImagem";
import { SeletorBusca } from "@/components/SeletorBusca";
import { SeletorMultiplo } from "@/components/SeletorMultiplo";
import { type CampoFiltroDash, FiltrosDashboard } from "@/components/FiltrosDashboard";
import { EditorVisaoOrcamento, type LinhaVisaoOrcamento } from "@/components/EditorVisaoOrcamento";
import { SeletorVisaoPca } from "@/components/VisaoOrcamentoPca";
import { AjudaVisoes } from "@/components/AjudaVisoes";
import { EscopoVinculo, type ValorEscopo } from "@/components/EditorVinculoOrcamento";
import { DicaFlutuante } from "@/components/DicaFlutuante";
import { ResumoSemVinculo, type UnidadeDaLinha, VinculosDaUnidade } from "@/components/VinculosDaUnidade";
import { vinculosDaLinha } from "@/lib/vinculos-unidade";
import { unidadesDoOrcamento } from "@/lib/orcamento-vinculo";
import type { VisaoOrcamento } from "@/lib/orcamento-visao";
import { TabelaCruzada } from "@/components/TabelaCruzada";
import { LAYOUT_PADRAO, type ModoCruzamento, type OrdemCruzamento } from "@/lib/orcamento-cruzamento";
import { Ajuda, TopicoAjuda } from "@/components/Ajuda";
import { useConfirmacao } from "@/components/Confirmacao";
import { SalvarEdicao, SeletorEdicoes } from "@/components/EdicoesTabela";
import { Avatar } from "@/components/Avatar";
import { Badge, type Tone } from "@/components/Badge";
import { Button } from "@/components/Button";
import { Callout } from "@/components/Callout";
import { avisoIncorporado } from "@/lib/pca-numeracao-core";
import { ChartCard } from "@/components/ChartCard";
import { ClassificacaoChart } from "@/components/charts/ClassificacaoChart";
import { ExploradorGrafico } from "@/components/ExploradorGrafico";
import { MensalChart } from "@/components/charts/MensalChart";
import { DefinicaoPrevisaoChart, PeriodicidadeChart } from "@/components/charts/PrevisaoChart";
import { PrioridadeChart } from "@/components/charts/PrioridadeChart";
import type { ModoCronograma } from "@/lib/origem-dash";
import { UnidadeRequisitanteChart } from "@/components/charts/UnidadeRequisitanteChart";
import { TopItensChart } from "@/components/charts/TopItensChart";
import { UnidadeChart } from "@/components/charts/UnidadeChart";
import { BarraSegmentada, BarrasH, Colunas } from "@/components/charts/Barras";
import { DashboardMesa } from "@/components/DashboardMesa";
import { DashboardMesaEsqueleto } from "@/components/DashboardMesaEsqueleto";
import type { DfdPainel, EstadoPainel, ProtocoloPainel } from "@/lib/mesa-dashboard";
import { type Atividade, diaDoProtocolo, FILTRO_METRICAS_PADRAO, type FiltroMetricas } from "@/lib/mesa-metricas";
import { PERIODO_TODO, type Periodo } from "@/lib/periodo";
import { BarraMetricas } from "@/components/BarraMetricas";
import { ColorField } from "@/components/ColorField";
import { type Column, DataTable } from "@/components/DataTable";
import { DfdCabecalho, DfdView, type DfdVisualItem, ItemCabecalho } from "@/components/DfdView";
import { PcaCompilacaoView } from "@/components/PcaCompilacaoView";
import { PcaPicker } from "@/components/PcaPicker";
import { type CapaValores, ProtocoloCabecalho, ProtocoloView } from "@/components/ProtocoloView";
import { BarraEdicaoMassa, BarraEdicaoMassaItens, BarraEdicaoMassaProtocolos } from "@/components/BarraEdicaoMassa";
import { TabelaMesaFluxo } from "@/components/fluxos/TabelaMesaFluxo";
import { BarraSelecao, BarraSelecaoDfds, type RegistroSelecao, ResumoSelecao } from "@/components/BarraSelecao";
import { AvisoFlutuante } from "@/components/AvisoFlutuante";
import { PessoaTag } from "@/components/PessoaTag";
import { SeletorCelula } from "@/components/SeletorCelula";
import { SeletorFiltro } from "@/components/SeletorFiltro";
import { SeletorMesa } from "@/components/SeletorMesa";
import { CarregandoLink } from "@/components/CarregandoLink";
import { GatilhoFiltro } from "@/components/GatilhoFiltro";
import { RangeFilterHeader } from "@/components/RangeFilterHeader";
import { DfdPainelDireito, RodapePainelItem } from "@/components/DfdPainelDireito";
import { DfdRodape } from "@/components/DfdRodape";
import { CelulaCatalogo, CelulaClassificacao, CelulaUnidadeCadastrada, EstadoPonto, EstadoProcessando, EstadoResumo } from "@/components/EstadoCelula";
import { AcoesCadastro } from "@/components/AcoesCadastro";
import { ClassificacaoDosItens, EditorClassificacao, type RascunhoClassificacao } from "@/components/ClassificacoesView";
import { ComparacaoUnidades, EditorUnidadeMedida, type RascunhoUnidade } from "@/components/UnidadesMedidaView";
import { ErroCarga } from "@/components/ErroCarga";
import { FalhaNaTela } from "@/components/FalhaNaTela";
import { relatorioDaFalha, textoDetalhes, TIPOS_FALHA, type TipoFalha } from "@/lib/erro-tela-core";
import {
  type ClassificacaoItem,
  classificarDescricoes,
  compararUnidades,
  criarClassificador,
  type DescricaoItem,
  propostaUnidade,
  type UnidadeMedida,
} from "@/lib/padronizacao-core";
import { BotaoAtualizar, useGiro } from "@/components/BotaoAtualizar";
import { BotaoExportar } from "@/components/ExportarTabelas";
import { CelulaLista, CelulaTexto, MaisN } from "@/components/CelulaLista";
import { BotaoDadosCompletos, DadosCompletos } from "@/components/DadosCompletos";
import { CelulaExecucao } from "@/components/CelulaExecucao";
import { CanvasFluxo, type Vista } from "@/components/fluxos/CanvasFluxo";
import { CartaoFluxo } from "@/components/fluxos/CartaoFluxo";
import { AjudaNo } from "@/components/fluxos/AjudaNo";
import { AjudaDoFluxo } from "@/components/fluxos/ConfigFluxo";
import type { Grafo } from "@/lib/fluxo-core";
import { MODELOS_FLUXO } from "@/lib/fluxo-modelos";
import { REGISTRO_NOS } from "@/lib/fluxo-nos";
import { CelulaVariacao, ComposicaoItem, type ItemComposicao, SeloAbc } from "@/components/ComposicaoItem";
import { consolidarItens } from "@/lib/itens-consolidados";
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
import { brl, dataIsoBrasilia, juntarParaCopiar, num, numeroSemAno } from "@/lib/format";
import { CampoLista, Checkbox, PasswordField, SearchField, SelectField, TextArea, TextField } from "@/components/Field";
import { Selecao } from "@/components/Selecao";
import { Dropdown } from "@/components/Dropdown";
import { SetaDropdown } from "@/components/SetaDropdown";
import { selectCls } from "@/components/formStyles";
import { type GrupoOpcao, GruposDaPessoa } from "@/components/GruposDaPessoa";
import { MatrizCapacidades } from "@/components/MatrizCapacidades";
import { ResumoPapel } from "@/components/ResumoPapel";
import { DetalhesPapelEditor } from "@/components/DetalhesPapelEditor";
import { ResumoDetalhesPapel } from "@/components/ResumoDetalhesPapel";
import { CAPACIDADES_MEMBRO, type Capacidades } from "@/lib/papeis-core";
import { coerceDetalhes, type DetalhesPapel, detalhesPadrao } from "@/lib/papeis-detalhes-core";
import { FilterChip } from "@/components/FilterChip";
import { Progress } from "@/components/Progress";
import { Skeleton, SkeletonCartao, SkeletonLinhas } from "@/components/Skeleton";
import { ThemeToggle } from "@/components/ThemeToggle";
import * as Icons from "@/components/icons";
import { IntegracaoGoogle, type ValorGoogle } from "@/components/IntegracaoGoogle";
import { IntegracaoResend, type ValorResend } from "@/components/IntegracaoResend";
import { GravadorReceitas } from "@/components/GravadorReceitas";
import { AprendizTelaProtocolo } from "@/components/AprendizTelaProtocolo";
import { IntegracaoTrello, type ValorTrello } from "@/components/IntegracaoTrello";
import { IndicadorTrello, seloTrello } from "@/components/SincronizacaoTrello";
import {
  IconAlert,
  IconArrowRight,
  IconBox,
  IconCheck,
  IconClipboard,
  IconClock,
  IconDashboard,
  IconFile,
  IconFilter,
  IconLayers,
  IconLock,
  IconMail,
  IconPencil,
  IconPlus,
  IconTrash,
  IconUndo,
  IconUpload,
  IconUsers,
  IconUserX,
  IconWallet,
} from "@/components/icons";
import { CadeadoBotao, CampoCongelado, CampoNumero, CampoSelecao, CampoTexto, useCadeados } from "@/components/CampoCadeado";
import { KpiStat } from "@/components/KpiStat";
import { LinkCard } from "@/components/LinkCard";
import { LinkExterno } from "@/components/LinkExterno";
import { ItemDetalhe } from "@/components/ItemDetalhe";
import { CatalogoCard, CoresPaleta, PastaCatalogoCard } from "@/components/CatalogoCards";
import { CelulaHistoricoCompra, ProdutoHistoricoDetalhe } from "@/components/ProdutoHistorico";
import { historicoDasLinhas, produtosDoHistorico, referenciaDoProduto } from "@/lib/historico-compra-core";
import { CatalogoItemDetalhe } from "@/components/CatalogoItemDetalhe";
import { type EscopoHistorico, Historico, HistoricoDoItem } from "@/components/Historico";
import { BotaoCopiar, CelulaCopiavel } from "@/components/BotaoCopiar";
import { OrcamentoCard, OrcamentoNovoCard } from "@/components/OrcamentoCard";
import { AssinaturaCalendario } from "@/components/AssinaturaCalendario";
import { BarraCalendario } from "@/components/BarraCalendario";
import { MenuAdicionarCartao, MolduraBloco } from "@/components/BlocosTarefa";
import { CampoTextoFormatado, EditorTexto } from "@/components/TextoFormatado";
import { EventoBanner } from "@/components/EventoBanner";
import { GerirAgendasExternas } from "@/components/AgendasExternas";
import { BuscaCalendario } from "@/components/BuscaCalendario";
import { eventosPca, feriadosNoIntervalo, OPCOES_CALENDARIO_PADRAO } from "@/lib/calendario-core";
import { EventosTarefa } from "@/components/EventosTarefa";
import { BarraEdicaoMassaTarefas } from "@/components/BarraEdicaoMassa";
import { ChipsAlternar } from "@/components/TarefaDetalhe";
import { CirculoConcluir } from "@/components/CirculoConcluir";
import { SeletorTemplates } from "@/components/CopiarMoverTarefa";
import { DatasTarefa } from "@/components/DatasTarefa";
import { CalendarioTarefas } from "@/components/CalendarioTarefas";
import { CartaoTarefa } from "@/components/CartaoTarefa";
import { acoesChecklistRascunho, ChecklistTarefa } from "@/components/ChecklistTarefa";
import { AtividadeTarefa } from "@/components/AtividadeTarefa";
import { VinculosTarefa } from "@/components/VinculosTarefa";
import { ImportarTrello } from "@/components/ImportarTrello";
import { AutomacoesQuadro, ModelosQuadro } from "@/components/AutomacoesQuadro";
import { DashboardTarefas } from "@/components/DashboardTarefas";
import { RecorrenciaTarefa } from "@/components/RecorrenciaTarefa";
import { ItemNotificacao } from "@/components/SinoNotificacoes";
import { PresencaGrupo, SeloAoVivo } from "@/components/PresencaGrupo";
import { CanalGrupoDemo } from "@/components/CanalGrupo";
import { FotoBolha } from "@/components/BolhasChat";
import { AtividadePessoa, PresencaNoItem } from "@/components/PresencaNoItem";
import { Balao, ChatAoVivo, Digitando } from "@/components/ChatAoVivo";
import { FiltrosTarefas } from "@/components/FiltrosTarefas";
import { CamposPeriodo, QuadroNovoCard } from "@/components/QuadroCard";
import { EstrelaFavorito } from "@/components/FavoritosQuadros";
import { MenuLista } from "@/components/MenuLista";
import { FundoQuadro } from "@/components/FundoQuadro";
import { SecoesDeQuadros } from "@/components/SecoesQuadros";
import { PastaQuadro } from "@/components/PastasQuadros";
import { SeletorFundo } from "@/components/SeletorFundo";
import { ChipsEscolha } from "@/components/ChipsEscolha";
import type { FundoEscolha } from "@/lib/imagem-fundo-core";
import { ItensArquivados } from "@/components/ItensArquivados";
import { TextoNoLugar } from "@/components/TextoNoLugar";
import { FaixaQuadro, MembrosQuadro, MenuQuadro, MolduraQuadro, PilulaVistas } from "@/components/MolduraQuadro";
import { SeletorEtiquetas } from "@/components/SeletorEtiquetas";
import { CamposDaTarefa, CamposPersonalizadosQuadro, ChipsCamposCartao } from "@/components/CamposTarefa";
import { ColunaTarefas, NovaLista } from "@/components/QuadroKanban";
import { SeletorPessoas } from "@/components/SeletorPessoas";
import { type ExtraPessoa, SeletorPessoa } from "@/components/SeletorPessoa";
import type { Pessoa } from "@/lib/pessoa";
import {
  adicionarBloco,
  type BlocoTarefa,
  blocosDisponiveis,
  eventosDoCalendario,
  excluirPasta,
  FILTRO_TAREFAS_PADRAO,
  moverNaGrade,
  type PastasQuadros,
  moverBloco,
  OCULTOS_VAZIO,
  type Recorrencia,
  removerBloco,
  type TarefaResumo,
  type CampoTarefa,
} from "@/lib/tarefas-core";
import { OrcamentoItemDetalhe } from "@/components/OrcamentoItemDetalhe";
import { OrigemDados } from "@/components/OrigemDados";
import { OrcamentoVinculos } from "@/components/OrcamentoVinculos";
import type { LinhaAuditoria } from "@/lib/auditoria";
import type { ConferenciaItem } from "@/lib/catalogo-conferencia";
import { TipoDfdPicker } from "@/components/TipoDfdPicker";
import { CartaoVersao, VersaoSistema } from "@/components/Novidades";
import { PainelSegundoPlano } from "@/components/SegundoPlano";
import { VERSOES } from "@/lib/versoes";
import { PainelPendencias } from "@/components/PainelPendencias";
import { PreviaDocumento } from "@/components/PreviaDocumento";
import { BotaoAcao } from "@/components/BotaoAcao";
import { IndicadorPendencias } from "@/components/IndicadorPendencias";
import { Dropzone } from "@/components/Dropzone";
import { BannerCadastro } from "@/components/BannerCadastro";
import { CelulaConferencia } from "@/components/PlanilhaResponsaveis";
import { SecaoBanner } from "@/components/SecaoBanner";
import { type AberturaVinculo, CelulaResponsaveis, dadosVazios, EditorVinculo, ListaVinculos } from "@/components/VinculosResponsaveis";
import type { VinculoComPessoa } from "@/lib/responsaveis-planilha-core";
import { duracaoMotionMs, Modal } from "@/components/Modal";
import { MonitoramentoWorker } from "@/components/MonitoramentoWorker";
import { SaudeDados } from "@/components/SaudeDados";
import type { SaudeDados as DadosSaude } from "@/lib/saude-dados-core";
import { MultiSelectHeader } from "@/components/MultiSelectHeader";
import { Pager } from "@/components/Pager";
import { PeriodoPicker } from "@/components/PeriodoPicker";
import { ItemTable } from "@/components/ItemTable";
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
/** Exemplo da SAÚDE DOS DADOS: a integridade toda certa e dois dados a tratar. */
const SAUDE_DEMO: DadosSaude = {
  verificadoEm: "2026-10-06T14:30:00.000Z",
  contagens: { protocolos: 68, dfds: 1289, itens: 19466, numerosPca: 15683 },
  verificacoes: [
    { chave: "dfd-itens", titulo: "DFD × itens", descricao: "O valor e o nº de itens de cada DFD completo são os dos itens gravados.", grupo: "integridade", nivel: "ok", total: 0, unidade: "DFDs", linhas: [], parcial: false },
    { chave: "abas", titulo: "Protocolo × DFDs × itens", descricao: "A soma dos DFDs de cada protocolo é a soma dos itens.", grupo: "integridade", nivel: "ok", total: 0, unidade: "protocolos", linhas: [], parcial: false },
    { chave: "pca", titulo: "Numeração e vínculos do PCA", descricao: "Cada item incorporado tem um nº vivo.", grupo: "integridade", nivel: "ok", total: 0, unidade: "ocorrências", linhas: [], parcial: false },
    { chave: "rastro", titulo: "Rastro e Id do protocolo", descricao: "Nenhum DFD contado em dobro e nenhum Id repetido.", grupo: "integridade", nivel: "ok", total: 0, unidade: "ocorrências", linhas: [], parcial: false },
    { chave: "incompleta", titulo: "Gravação incompleta", descricao: "DFDs com menos itens gravados que os do documento.", grupo: "dados", nivel: "ok", total: 0, unidade: "DFDs", linhas: [], parcial: false },
    {
      chave: "capa",
      titulo: "Capa × somatória",
      descricao: "O valor da capa ausente ou diferente da soma dos DFDs — a mesma régua da Mesa.",
      grupo: "dados",
      nivel: "atencao",
      total: 2,
      unidade: "protocolos",
      linhas: [
        { chave: "capa:1", protocolo: "122516/2026", dfd: null, planejamento: null, problema: "Capa sem valor · somatória R$ 48.900,00", href: "/painel/mesa?abrir=protocolo:1" },
        { chave: "capa:2", protocolo: "125900/2026", dfd: null, planejamento: null, problema: "Capa R$ 1.000,00 × somatória R$ 1.250,00", href: "/painel/mesa?abrir=protocolo:2" },
      ],
      parcial: false,
    },
    {
      chave: "sem-valor",
      titulo: "Itens sem valor unitário",
      descricao: "Itens sem valor unitário (vazio, zero ou negativo) em 2 DFDs: o valor do DFD fica incompleto.",
      grupo: "dados",
      nivel: "atencao",
      total: 3,
      unidade: "itens",
      linhas: [
        { chave: "sem-valor:10", protocolo: "125900/2026", dfd: "1497", planejamento: "1510", problema: "2 itens sem valor unitário (de 12)", href: "/painel/mesa?abrir=protocolo:2" },
        { chave: "sem-valor:11", protocolo: null, dfd: "1097", planejamento: "1120", problema: "1 item sem valor unitário (de 4)", href: "/painel/mesa?abrir=dfd:11" },
      ],
      parcial: false,
    },
    { chave: "sem-planejamento", titulo: "DFD sem nº de planejamento", descricao: "O nº de planejamento identifica o DFD no Centi.", grupo: "dados", nivel: "ok", total: 0, unidade: "DFDs", linhas: [], parcial: false },
  ],
};

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

/** As 4 falhas da fronteira de erro + o estado "recarregando" (o comportamento real vem de `useFalhaNaTela`). */
function FalhaNaTelaDemo() {
  const [tipo, setTipo] = useState<TipoFalha>("conexao");
  const [recuperando, setRecuperando] = useState(false);
  const exemplo: Record<TipoFalha, { name: string; message: string; digest?: string }> = {
    conexao: { name: "Error", message: "Connection closed." },
    versao: { name: "ChunkLoadError", message: "Loading chunk 4821 failed." },
    servidor: { name: "Error", message: "An error occurred in the Server Components render.", digest: "2843960153" },
    tela: { name: "TypeError", message: "Cannot read properties of undefined (reading 'map')" },
  };
  const rel = relatorioDaFalha(exemplo[tipo], { caminho: "/painel/pca/1?aba=mesa", automatica: false, instante: "2026-10-01T12:00:00.000Z" });
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <Segmented
          ariaLabel="Tipo da falha"
          value={tipo}
          onChange={setTipo}
          options={TIPOS_FALHA.map((t) => ({ value: t, label: t }))}
        />
        <Switch checked={recuperando} onChange={setRecuperando} label="Recarregando" />
      </div>
      <div className="rounded-card border border-border">
        <FalhaNaTela
          tipo={tipo}
          digest={exemplo[tipo].digest}
          detalhes={textoDetalhes(rel)}
          recuperando={recuperando}
          onTentar={() => toast.info("Tentar novamente (exemplo)")}
          onRecarregar={() => toast.info("Recarregar a página (exemplo)")}
        />
      </div>
    </div>
  );
}

/** O canvas dos FLUXOS de automação (estilo N8N) com um modelo pronto — arraste nós, ligue saídas a entradas. */
function CanvasFluxoDemo() {
  const [g, setG] = useState<Grafo>(MODELOS_FLUXO[0].grafo);
  const [sel, setSel] = useState<string | null>(null);
  const [v, setV] = useState<Vista>({ x: 20, y: 120, z: 0.55 });
  return (
    <CanvasFluxo
      grafo={g}
      registro={REGISTRO_NOS}
      selecionado={sel}
      onSelecionar={setSel}
      onMudar={setG}
      vista={v}
      onVista={setV}
      altura={420}
      passos={{ inicio1: { no: "inicio1", estado: "ok", itens: 1, vezes: 1, ms: 1 }, cm1: { no: "cm1", estado: "rodando", itens: 0, vezes: 1, ms: 0, aviso: "Entidade 2 (1 de 3)…" } }}
    />
  );
}

function Secao({ titulo, children }: { titulo: string; children: ReactNode }) {
  return (
    <section className="mt-6">
      <h2 className="mb-2 text-[13px] font-semibold uppercase tracking-[0.06em] text-faint">
        {titulo}
      </h2>
      <div className="rounded-card border border-border bg-surface p-[var(--pad-card)] shadow-ring">{children}</div>
    </section>
  );
}

/** Demo da CONFIRMAÇÃO POR CÓDIGO (cadastro, "Esqueci a senha", senha do Perfil) na moldura das telas de acesso. */
function DemoAcesso() {
  const [codigo, setCodigo] = useState("");
  // ErroAuth é flutuante (canto do display): a demo o mostra ao tocar em "Mostrar erro".
  const [erroDemo, setErroDemo] = useState(false);
  const [restante, setRestante] = useState(0);
  return (
    <div className="grid grid-cols-1 items-start gap-[var(--gap-block)] lg:grid-cols-2">
      <CartaoAuth titulo="Confirme o seu e-mail" etapa="Etapa 2 de 2" subtitulo="Digite o código de 6 dígitos que enviamos.">
        <EtapaCodigo
          destino="ana.souza@rioverde.go.gov.br"
          codigo={codigo}
          onCodigo={setCodigo}
          restante={restante}
          reenviando={false}
          onReenviar={() => setRestante(45)}
          onVoltar={() => setCodigo("")}
        />
        {erroDemo && <ErroAuth onFechar={() => setErroDemo(false)}>Código incorreto. Confira os 6 dígitos no seu e-mail.</ErroAuth>}
      </CartaoAuth>
      <div className="space-y-[var(--gap-block)]">
        <MarcaSistema />
        <Button size="sm" variant="secondary" onClick={() => setErroDemo(true)}>
          Mostrar erro (ErroAuth flutuante)
        </Button>
        <SelectField label="Unidade em que trabalha (OpcoesUnidades — por órgão)" defaultValue="" error="Selecione a unidade em que você trabalha.">
          <option value="" disabled>
            Selecione…
          </option>
          <OpcoesUnidades
            unidades={[
              { id: 1, codigo: "SEPLAN", nome: "Secretaria de Planejamento", orgao: "Prefeitura Municipal de Rio Verde" },
              { id: 2, codigo: "SEMED", nome: "Secretaria de Educação", orgao: "Prefeitura Municipal de Rio Verde" },
              { id: 3, codigo: "FMS", nome: "Fundo Municipal de Saúde", orgao: "Fundo Municipal de Saúde" },
            ]}
          />
        </SelectField>
        <CampoCodigo value={codigo} onChange={setCodigo} />
        {/* VerificacaoRobo: o captcha próprio (sem o Turnstile) — marcar resolve o desafio do servidor (prova de trabalho). */}
        <VerificacaoRobo onToken={() => undefined} />
      </div>
    </div>
  );
}

/** PROTEÇÃO DE DADOS: os campos da tela do ADM (sem gravar) e a cortina — no lugar, sem ativar os bloqueios no catálogo. */
function DemoProtecao() {
  const [v, setV] = useState<ConfigProtecao>({ ...PROTECAO_PADRAO, selecao: true, papeis: [3] });
  return (
    <div className="grid grid-cols-1 items-start gap-[var(--gap-block)] lg:grid-cols-2">
      <CamposProtecao valor={v} papeis={[{ id: 1, nome: "Administrador" }, { id: 2, nome: "Gestor" }, { id: 3, nome: "Membro" }]} onChange={setV} />
      <MarcaDagua texto="Maria Clara Souza · matrícula 045210 · 08/10/2026 14:30" inline />
    </div>
  );
}

/** USUÁRIOS: matrícula (6 posições no fundo), telefone (+ WhatsApp e o "(?)"), o botão de conversa e o BANNER do usuário. */
const USUARIO_DEMO: UsuarioAdmin = {
  id: 2,
  nome: "Maria Clara Souza",
  apelido: "Maria",
  email: "maria.souza@rioverde.go.gov.br",
  emailVerificado: true,
  matricula: "045210",
  cargo: "Analista de Planejamento",
  telefone: "64999887766",
  telefoneWhatsapp: true,
  reparticaoId: 1,
  unidade: "Secretaria de Planejamento",
  foto: null,
  papelId: 3,
  grupos: [1],
  status: "ativo",
  dadosValidadosEm: null,
  dadosValidadosPor: null,
  trocarSenha: false,
  criadoEm: "2026-09-01T12:00:00Z",
  atualizadoEm: "2026-09-01T12:00:00Z",
};

function DemoUsuario() {
  const [mat, setMat] = useState("0452");
  const [tel, setTel] = useState("6499988");
  const [aberto, setAberto] = useState(false);
  const [u, setU] = useState(USUARIO_DEMO);
  return (
    <div className="grid grid-cols-1 items-start gap-[var(--gap-block)] sm:grid-cols-2">
      <CampoMatricula label="Matrícula (CampoMatricula)" valor={mat} onValor={setMat} />
      <CampoTelefone valor={tel} onValor={setTel} />
      <div className="flex flex-wrap items-center gap-2">
        <BotaoWhatsapp telefone="64999887766" />
        <Button size="sm" variant="secondary" onClick={() => setAberto(true)}>
          Abrir o banner do usuário (UsuarioDetalhe)
        </Button>
      </div>
      <UsuarioDetalhe
        usuario={u}
        aberto={aberto}
        meuId={1}
        unidades={[{ id: 1, codigo: "SEPLAN", nome: "Secretaria de Planejamento", orgao: "Prefeitura Municipal de Rio Verde" }]}
        cargos={["Analista de Planejamento", "Diretor"]}
        papeis={[{ id: 3, nome: "Membro", descricao: null, chave: "membro", padraoCadastro: true, capacidades: {}, detalhes: detalhesPadrao() }]}
        grupos={[{ id: 1, nome: "Planejamento e Custos", abas: ["dfd", "pca"] }]}
        envioEmail
        ocupado={false}
        onFechar={() => setAberto(false)}
        confirmarDescarte={async () => true}
        onSalvar={async (p) => {
          setU((x) => ({
            ...x,
            ...(p.validar ? { dadosValidadosEm: new Date().toISOString(), dadosValidadosPor: "Admin" } : p.validar === false ? { dadosValidadosEm: null } : {}),
            ...(p.trocarSenha !== undefined ? { trocarSenha: p.trocarSenha } : {}),
            atualizadoEm: new Date().toISOString(),
          }));
          return true;
        }}
        onPapel={() => undefined}
        onStatus={() => undefined}
        onAprovar={() => undefined}
        onRecusar={() => undefined}
        onVerAcesso={() => undefined}
        onExcluir={() => setAberto(false)}
      />
    </div>
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
  const [mesaDemo, setMesaDemo] = useState<number | null>(null);
  return (
    <div className="space-y-6">
      {/* SeletorMesa: o 1º item da barra da Mesa principal (Mesa do sistema | Mesa de um PCA). CarregandoLink: o véu +
          spinner de um Link pendente (o card do PCA com `href` — aqui, um link para esta mesma página). SincronizarDados
          (infraestrutura, sem UI, no AppShell): as telas voltam do cache e só recarregam quando a versão dos dados muda. */}
      <div className="flex flex-wrap items-center gap-3">
        <SeletorMesa pcas={[{ id: 2, nome: "PCA 2027", ano: 2027 }]} atual={mesaDemo} onEscolher={setMesaDemo} />
        <Link href="/design-system" className="relative rounded-card border border-border px-4 py-2 text-sm font-semibold text-text">
          Link com CarregandoLink
          <CarregandoLink />
        </Link>
      </div>
      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <PcaCard pca={{ id: 1, nome: "PCA 2026", ano: 2026, fonte: "lista", status: "publicado", capa: null, total: 1_390_000_000, itens: 1116, partes: 5 }} onClick={() => {}} />
        <PcaCard pca={{ id: 2, nome: "PCA 2027", ano: 2027, fonte: "protocolo", status: "preview", capa, total: 412_800_000, itens: 1632, partes: 5, previa: true }} onClick={() => {}} />
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
      <div className="linha-topico flex flex-wrap items-center gap-2">
        <span className="grid h-11 w-11 place-items-center rounded-control text-muted lg:h-[var(--h-control-sm)] lg:w-[var(--h-control-sm)]">
          <Icons.IconChevronLeft className="h-4 w-4" />
        </span>
        <span className="text-lg font-bold leading-[44px] text-text lg:leading-[var(--h-control-sm)]">PCA 2027 (linha de título)</span>
        <Badge tone="blue" tamanho="linha" className="tabular-nums">
          <Icons.IconCalendar className="h-3.5 w-3.5" aria-hidden="true" />
          2027
        </Badge>
        <Badge tone="amber" dot vivo tamanho="linha">
          Preview
        </Badge>
        <Badge tone="emerald" dot tamanho="linha">
          <IconCheck className="h-3.5 w-3.5" aria-hidden="true" />
          Publicado
        </Badge>
      </div>
      <Callout kind="info">{avisoIncorporado("PCA 2027")}</Callout>
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
      <div className="max-w-sm">
        <SeletorMultiplo
          suspenso
          rotulo="Repartições"
          textoVazio="Nenhuma"
          opcoes={[{ valor: "SEC. DE SAÚDE" }, { valor: "SEC. DE EDUCAÇÃO" }, { valor: "SEC. DE OBRAS" }]}
          selecionados={sel}
          onChange={setSel}
        />
      </div>
      <OrcamentoPca
        dados={{
          pcaId: 1,
          ano: 2027,
          orcamento: { id: 1, nome: "CUBO 2027", ano: 2027 },
          visaoNome: "PCA",
          bruto: 1_610_000_000,
          filtrado: 1_160_000_000,
          unidades: [
            { id: 1, sigla: "AMAE", nome: "Agência de Água", orgaoId: 1, orgaoSigla: "PMRV" },
            { id: 2, sigla: "FMAS", nome: "Fundo de Assistência", orgaoId: 1, orgaoSigla: "PMRV" },
            { id: 3, sigla: "FEMBOM", nome: "Fundo dos Bombeiros", orgaoId: 1, orgaoSigla: "PMRV" },
            // A MESMA sigla em duas unidades: as contratações numa, o orçamento na outra → o alerta aponta o vínculo.
            { id: 4, sigla: "FMMA", nome: "Fundo do Meio Ambiente", orgaoId: 2, orgaoSigla: "FMMA" },
            { id: 5, sigla: "FMMA", nome: "Fundo Mun. do Meio Ambiente", orgaoId: 1, orgaoSigla: "PMRV", oculta: true },
          ],
          orgaos: [
            { id: 1, sigla: "PMRV", nome: "Prefeitura Municipal de Rio Verde" },
            { id: 2, sigla: "FMMA", nome: "Fundo Municipal do Meio Ambiente" },
          ],
          // Fonte LISTA: o planejado vem das planilhas (clique numa linha → Origem dos dados).
          planejado: [
            { unidadeId: 1, itens: 390, valor: 906_738.7, planilha: { id: 1, codigo: "AMAE", nome: "Planilha AMAE" } },
            { unidadeId: 2, itens: 2354, valor: 18_978_323.74, planilha: { id: 2, codigo: "FMAS", nome: "Planilha FMAS" } },
            { unidadeId: 3, itens: 569, valor: 3_701_579.8, planilha: { id: 3, codigo: "FEMBOM", nome: "Planilha FEMBOM" } },
            { unidadeId: 4, itens: 2, valor: 87_200, planilha: { id: 4, codigo: "FMMA", nome: "Planilha FMMA" } },
          ],
          linhas: [
            { id: 1, orgao: "AGÊNCIA DE ÁGUA", unidade: "1 - AMAE", nomeElemento: "MATERIAL DE CONSUMO", codigoElemento: "339030", unidadeId: 1, valor: 1_390_566.98 },
            { id: 2, orgao: "FUNDO DE ASSISTÊNCIA", unidade: "2 - FMAS", nomeElemento: "SERVIÇOS DE TERCEIROS - PJ", codigoElemento: "339039", unidadeId: 2, valor: 14_441_470.23 },
            { id: 3, orgao: "FUNDO DOS BOMBEIROS", unidade: "3 - FEMBOM", nomeElemento: "EQUIPAMENTOS", codigoElemento: "449052", unidadeId: 3, valor: 4_021_478.05 },
            { id: 4, orgao: "GABINETE", unidade: "9 - GAB", nomeElemento: "MATERIAL DE CONSUMO", codigoElemento: "339030", unidadeId: null, valor: 120_000 },
            { id: 5, orgao: "FUNDO DO MEIO AMBIENTE", unidade: "26 - FMMA", nomeElemento: "MATERIAL DE CONSUMO", codigoElemento: "339030", unidadeId: 5, valor: 2_812_500 },
          ],
          // A visão tem um valor que o QDD reenviado não traz → o aviso + "Ajustar a visão" (a engrenagem).
          visaoId: 1,
          ausentes: [{ dimensao: "fonte", rotulo: "Fonte de recurso", valores: ["999 - FONTE EXTINTA"] }],
        }}
        podePublicar
        visoes={VISOES_DEMO}
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
      {/* CONGELADO — consulta pública do PCA: aparência de campo, sem cadeado. */}
      <CampoCongelado label="Nº DFD (consulta)" valor="531" mono />
      <CampoCongelado label="Valor (consulta)" valor="R$ 50,00" forte />
      <CampoCongelado label="Objeto (consulta)" valor="AQUISIÇÃO DE MATERIAL DE EXPEDIENTE" span />
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
        <HistoricoDoItem url="/api/dfd/87/historico" item={{ item: 2, codigo: "5241937264" }} entradas={DEMO_HISTORICO.filter((l) => l.entidade === "dfd")} />
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

// Pessoas (Perfil → apelido + foto): os seletores e as células mostram a FOTO + o APELIDO (o nome completo embaixo, na
// lista do SeletorPessoa).
const PESSOAS_DEMO: Pessoa[] = [
  { id: 1, nome: "Ana Souza", apelido: "Ana", foto: null },
  { id: 4, nome: "Carlos Lima", apelido: "Carlão", foto: null },
  { id: 7, nome: "Thamires Rocha", apelido: null, foto: null },
];
const EXTRAS_FILTRO_DEMO: ExtraPessoa[] = [
  { valor: "todos", rotulo: "Todos", icone: <IconUsers className="h-4 w-4" /> },
  { valor: "sem", rotulo: "Sem responsável", icone: <IconUserX className="h-4 w-4" /> },
];
const EXTRAS_CELULA_DEMO: ExtraPessoa[] = [{ valor: "", rotulo: "Sem responsável", icone: <IconUserX className="h-4 w-4" /> }];
/** A pessoa já designada que hoje está em OUTRO grupo (`atual`): aparece no gatilho, mas não volta a ser escolhida. */
const PESSOA_FORA_DEMO: Pessoa = { id: 12, nome: "Beatriz Nunes", apelido: "Bia", foto: null };
const SITUACOES_DEMO = [
  { id: 1, nome: "Recebido", cor: "#64748b" },
  { id: 2, nome: "Em análise", cor: "#2563eb" },
  { id: 3, nome: "Devolvido", cor: "#dc2626" },
  { id: 4, nome: "Concluído", cor: "#16a34a" },
];

// Dashboard de governança da Mesa — dados de exemplo RELATIVOS a hoje (a série semanal e o tempo na Mesa sempre
// preenchidos); montados só no navegador (as datas dependem do relógio).
const SITUACOES_DASH = SITUACOES_DEMO.map((x, i) => ({ ...x, ordem: i + 1 }));
const PESSOAS_DASH = new Map(PESSOAS_DEMO.map((x) => [x.id, x]));
const ESTADOS_DASH: EstadoPainel[] = ["regular", "regular", "regular", "atencao", "erro", "regular", "atencao", "conferindo"];
const ASSUNTOS_DASH = ["INCLUSÃO NO PCA", "INCLUSÃO NO PCA", "EXCLUSÃO DE DEMANDA", "ALTERAÇÃO NÃO ONEROSA", "COMUNICAÇÃO INTERNA"];
const TIPOS_DASH = ["DFD-S", "DFD-R", "DFD-O", "DFD-S", "DFD-E", null];
function dadosDashDemo(): { protocolos: ProtocoloPainel[]; dfds: DfdPainel[]; atividades: Atividade[]; hoje: string } {
  const agora = Date.now();
  const hoje = dataIsoBrasilia(new Date(agora).toISOString());
  const protocolos = Array.from({ length: 36 }, (_, i): ProtocoloPainel => {
    const estado = ESTADOS_DASH[i % ESTADOS_DASH.length];
    return {
      id: i + 1,
      numero: `${144_000 + i * 37}/2026`,
      assunto: ASSUNTOS_DASH[i % ASSUNTOS_DASH.length],
      anoPca: i % 3 === 0 ? 2026 : 2027,
      criadoEm: new Date(agora - ((i * 37) % 97) * 864e5).toISOString().replace("T", " ").slice(0, 19),
      responsavelId: i % 9 === 0 ? null : PESSOAS_DEMO[i % PESSOAS_DEMO.length].id,
      distribuidorId: PESSOAS_DEMO[(i + 1) % PESSOAS_DEMO.length].id,
      situacaoId: i % 11 === 0 ? null : SITUACOES_DEMO[i % SITUACOES_DEMO.length].id,
      estado,
      dfdsErro: estado === "erro" ? 1 + (i % 3) : 0,
      dfdsAtencao: estado === "atencao" ? 1 : 0,
    };
  });
  const siglas = ["FMS", "SME", "SMA", "SMO", "SEMAS", "SMF", "GAB", "PROC", "SMC"];
  const dfds = Array.from({ length: 90 }, (_, i): DfdPainel => {
    const u = (i * i) % siglas.length;
    return {
      unidadeId: u + 1,
      unidade: siglas[u],
      unidadeNome: null,
      valor: 5_000 + ((i * 104_729) % 350_000),
      itens: 1 + (i % 25),
      protocoloId: (i % protocolos.length) + 1,
      tipo: TIPOS_DASH[i % TIPOS_DASH.length],
    };
  });
  // O histórico de exemplo: uma ação por protocolo (de alguém da equipe) e um reenvio (correção) a cada 7.
  const atividades = protocolos.flatMap((x, i): Atividade[] => {
    const dia = diaDoProtocolo(x.criadoEm) ?? hoje;
    return [
      { protocoloId: x.id, usuarioId: PESSOAS_DEMO[i % PESSOAS_DEMO.length].id, dia, tipo: "acao", n: 1 + (i % 4) },
      ...(i % 7 === 0 ? [{ protocoloId: x.id, usuarioId: x.responsavelId, dia, tipo: "reenvio" as const, n: 1 }] : []),
    ];
  });
  return { protocolos, dfds, atividades, hoje };
}

/** Demo do DASHBOARD de governança da Mesa — o filtro Responsável do topo (o MESMO `SeletorPessoa` da Mesa) é o FOCO
 * das métricas: numa pessoa, só ela (a linha dela na visão da equipe). */
function DashboardMesaDemo() {
  const [dados, setDados] = useState<ReturnType<typeof dadosDashDemo> | null>(null);
  const [resp, setResp] = useState<"todos" | "sem" | number>("todos");
  const [filtro, setFiltro] = useState<FiltroMetricas>(FILTRO_METRICAS_PADRAO);
  useEffect(() => setDados(dadosDashDemo()), []);
  if (!dados) return <DashboardMesaEsqueleto metricas />;
  // As KPIs = a Mesa com o filtro do topo; as métricas = o universo (todos os dados), com o responsável como FOCO.
  const protocolos = resp === "todos" ? dados.protocolos : dados.protocolos.filter((x) => (resp === "sem" ? x.responsavelId == null : x.responsavelId === resp));
  const ids = new Set(protocolos.map((x) => x.id));
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 text-[12px] text-muted">
        Responsável do topo:
        <SeletorPessoa
          variante="filtro"
          rotulo="Responsável"
          ariaLabel="Filtro: Responsável (exemplo)"
          pessoas={PESSOAS_DEMO}
          valor={String(resp)}
          ativo={resp !== "todos"}
          extras={EXTRAS_FILTRO_DEMO}
          onChange={(v) => setResp(v === "todos" || v === "sem" ? v : Number(v))}
        />
      </div>
      <DashboardMesa
        protocolos={protocolos}
        dfds={resp === "todos" ? dados.dfds : dados.dfds.filter((d) => d.protocoloId != null && ids.has(d.protocoloId))}
        universo={dados}
        situacoes={SITUACOES_DASH}
        pessoas={PESSOAS_DASH}
        regras={regrasPadrao()}
        responsavel={resp}
        metricas={{ filtro, onFiltro: setFiltro, hoje: dados.hoje, atividades: dados.atividades, erro: false, onTentar: () => undefined }}
      />
    </div>
  );
}

/** Demo da BARRA DE MÉTRICAS da Mesa: o período (o seletor de período do sistema), o dado e a medida do gráfico. */
function MetricasMesaDemo() {
  const [filtro, setFiltro] = useState<FiltroMetricas>(FILTRO_METRICAS_PADRAO);
  return (
    <BarraMetricas
      filtro={filtro}
      onFiltro={setFiltro}
      anos={[2026, 2025]}
      resumo={<span>Este mês (01/09 a 30/09/2026) · 60 protocolos · 412 DFDs · 3.210 itens · R$ 12,3 mi · 1 correção · 45 ações</span>}
    />
  );
}

const VISOES_DEMO: VisaoOrcamento[] = [
  { id: 1, nome: "PCA", ordem: 0, filtros: { nomeElemento: ["MATERIAL DE CONSUMO", "EQUIPAMENTOS"], fonte: ["999 - FONTE EXTINTA"] }, pcas: ["PCA 2027 (2027)"], proprias: [] },
];
const LINHAS_VISAO_DEMO: LinhaVisaoOrcamento[] = [
  { nomeElemento: "MATERIAL DE CONSUMO", fonte: "100 - RECURSOS ORDINÁRIOS", valorInicial: 1_390_566.98 },
  { nomeElemento: "SERVIÇOS DE TERCEIROS - PJ", fonte: "150 - FUNDEB", valorInicial: 14_441_470.23 },
  { nomeElemento: "EQUIPAMENTOS", fonte: "100 - RECURSOS ORDINÁRIOS", valorInicial: 4_021_478.05 },
];

/** O editor de UMA visão do orçamento (aba Visões e engrenagem do PCA): usos, valores ausentes, prévia do Σ. */
function EditorVisaoDemo() {
  const [aberta, setAberta] = useState<VisaoOrcamento | "nova" | null>(null);
  const [escopo, setEscopo] = useState<ValorEscopo>({ modo: "esta", escolhidas: ["1"] });
  return (
    <div className="flex flex-wrap gap-2">
      <Button size="sm" variant="secondary" onClick={() => setAberta(VISOES_DEMO[0])}>
        Editar a visão “PCA”
      </Button>
      <Button size="sm" variant="secondary" onClick={() => setAberta("nova")}>
        Nova visão
      </Button>
      <EditorVisaoOrcamento aberta={aberta} itens={LINHAS_VISAO_DEMO} podeEditar onFechar={() => setAberta(null)} onSalva={() => setAberta(null)} />
      {/* SeletorVisaoPca — a visão do PCA na barra do PCA × Orçamento (aqui travado: sem permissão não troca). */}
      <div className="w-full sm:w-72">
        <SeletorVisaoPca pcaId={0} visaoId={VISOES_DEMO[0].id} visoes={VISOES_DEMO} podeEscolher={false} />
      </div>
      {/* AjudaVisoes — o (?) único das visões (tela do orçamento e orçamento do PCA). */}
      <AjudaVisoes botao="sm" />
      {/* EscopoVinculo — onde salvar um vínculo (vínculos por visão): esta visão · todas · escolher. */}
      <div className="w-full">
        <EscopoVinculo
          contexto={{ visoes: [{ id: 1, nome: "PCA", proprias: ["2 - SMS"] }, { id: 2, nome: "Investimentos", proprias: [] }], visaoId: 1 }}
          chave="2 - SMS"
          valor={escopo}
          onChange={setEscopo}
          onUsarPadrao={() => undefined}
        />
      </div>
    </div>
  );
}

/** Os vínculos de UMA linha do orçamento do PCA (o lápis da linha): a lista + o editor da aba Vínculos (aqui sem gravar). */
function VinculosDaUnidadeDemo() {
  const [unidade, setUnidade] = useState<UnidadeDaLinha | null>(null);
  const itens = [
    { orgao: "FUNDO DE ASSISTÊNCIA", unidade: "2 - FMAS", acao: "2101 - MANTER O CRAS", valorInicial: 1_200_000 },
    { orgao: "FUNDO DE ASSISTÊNCIA", unidade: "2 - FMAS", acao: "2102 - MANTER O CREAS", valorInicial: 800_000 },
    { orgao: "GABINETE", unidade: "9 - GAB", acao: "2001 - MANTER O GABINETE", valorInicial: 120_000 },
  ];
  const unidades = unidadesDoOrcamento(itens);
  const alvos = { orgaos: [{ id: 1, sigla: "PMRV", nome: "Prefeitura" }], unidades: [{ id: 2, sigla: "FMAS", nome: "Fundo de Assistência", orgaoId: 1 }] };
  const vinculos = [{ id: 1, chave: unidades[0]?.chave ?? "", texto: "2 - FMAS", alvoId: 2, acoes: null, acoesFora: [], visaoId: null }];
  const ok = async () => true;
  return (
    <div className="flex flex-wrap gap-2">
      <Button size="sm" variant="secondary" onClick={() => setUnidade({ id: 2, sigla: "FMAS", nome: "Fundo de Assistência" })}>
        Vínculos de FMAS
      </Button>
      <Button size="sm" variant="secondary" onClick={() => setUnidade({ id: null, sigla: "Sem vínculo", nome: "" })}>
        Linha “Sem vínculo”
      </Button>
      {/* DicaFlutuante + ResumoSemVinculo: o "N sem vínculo" da linha — com o mouse, a lista organizada por unidade. */}
      <DicaFlutuante conteudo={<ResumoSemVinculo titulo="Sem vínculo" lista={vinculosDaLinha(unidades, [], null).semVinculo} />}>
        <Button size="sm" variant="ghost">
          3 sem vínculo (passe o mouse)
        </Button>
      </DicaFlutuante>
      <VinculosDaUnidade
        unidade={unidade}
        unidades={unidades}
        vinculos={vinculos}
        alvos={alvos}
        orcamento="CUBO 2027 (2027)"
        onCriar={ok}
        onEditar={ok}
        onExcluir={ok}
        onFechar={() => setUnidade(null)}
      />
    </div>
  );
}

/** Demo das peças de gráfico em HTML por token (as do Dashboard de governança). */
/** Clique numa fatia → ORIGEM DOS DADOS (o mesmo banner do Orçamento do PCA, dos gráficos do Dashboard e da Mesa). */
function TabelaCruzadaDemo() {
  const [editar, setEditar] = useState(false);
  const [larguras, setLarguras] = useState<Record<string, number>>({});
  const [fixadas, setFixadas] = useState<string[]>(LAYOUT_PADRAO.fixadas);
  const [ordemManual, setOrdemManual] = useState<string[]>([]);
  const [ocultas, setOcultas] = useState<string[]>([]);
  const [ordem, setOrdem] = useState<OrdemCruzamento>({ por: "rotulo", desc: false });
  const [modo, setModo] = useState<ModoCruzamento>("valor");
  const colunas = [
    { chave: "aux", rotulo: "AUXÍLIO FARDAMENTO", total: 495_000 },
    { chave: "dia", rotulo: "DIÁRIAS - PESSOAL CIVIL", total: 4_237_500 },
    { chave: "ind", rotulo: "INDENIZAÇÕES TRABALHISTAS", total: 23_053_000 },
    { chave: "obr", rotulo: "OBRIGAÇÕES PATRONAIS", total: 29_167_000 },
  ];
  const linhas = [
    { chave: "a", rotulo: "1 - AGÊNCIA MUNICIPAL DE MOBILIDADE E TRÂNSITO", extra: "AMMT", valores: [180_000, 20_000, 500_000, 100_000], total: 800_000 },
    { chave: "b", rotulo: "2 - SECRETARIA MUNICIPAL DE EDUCAÇÃO", extra: "SME", valores: [0, 260_000, 3_600_000, 4_800_000], total: 8_660_000 },
    { chave: "c", rotulo: "33 - FUNDO MUNICIPAL DE SAÚDE", extra: "FMS", valores: [315_000, 3_957_500, 18_953_000, 24_267_000], total: 47_492_500 },
  ];
  const tot = linhas.reduce((x, l) => x + l.total, 0);
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <div className="w-56">
          <SelectField compacto label="Linhas" defaultValue="unidade">
            <option value="unidade">Unidade (39)</option>
            <option value="orgao">Órgão (18)</option>
          </SelectField>
        </div>
        <div className="w-72">
          <SelectField compacto label="Colunas" defaultValue="nomeElemento">
            <option value="nomeElemento">Elemento de despesa (35)</option>
            <option value="ficha" disabled>
              Ficha — 1.141 valores — acima de 120 colunas
            </option>
          </SelectField>
        </div>
        <Segmented<ModoCruzamento>
          ariaLabel="Ler as células como"
          value={modo}
          onChange={setModo}
          options={[
            { value: "valor", label: "R$" },
            { value: "pct", label: "%" },
          ]}
        />
        <Checkbox checked={editar} onChange={(e) => setEditar(e.target.checked)} label="Editar a planilha" />
        <Ajuda titulo="Ajuda (?)">
          <TopicoAjuda icone={<Icons.IconGrip className="h-4 w-4" />} titulo="Arrastar">
            Arraste o nome de qualquer coluna; a sombra mostra onde ela vai ficar.
          </TopicoAjuda>
          <TopicoAjuda icone={<Icons.IconFixar className="h-4 w-4" />} titulo="Congelar">
            O alfinete prende a coluna à esquerda.
          </TopicoAjuda>
        </Ajuda>
      </div>
      <div className="h-80 [&>div]:!h-full">
        <TabelaCruzada
          rotuloLinhas="Unidade"
          rotuloExtra="Sigla"
          linhas={linhas}
          colunas={colunas}
          total={tot}
          formatar={brl}
          modo={modo}
          calor
          fixadas={fixadas}
          ordemManual={ordemManual}
          larguras={larguras}
          ocultas={ocultas}
          ordem={ordem}
          onOrdenar={(por) => setOrdem((o) => ({ por, desc: JSON.stringify(o.por) === JSON.stringify(por) ? !o.desc : por !== "rotulo" && por !== "extra" }))}
          onAbrir={editar ? undefined : () => {}}
          edicao={
            editar
              ? {
                  onLargura: (k, px) =>
                    setLarguras((l) => {
                      const { [k]: _, ...resto } = l;
                      return px == null ? resto : { ...resto, [k]: Math.max(56, Math.round(px)) };
                    }),
                  onOcultar: (k) => setOcultas((l) => (l.includes(k) ? l.filter((x) => x !== k) : [...l, k])),
                  onOrdem: (f, l) => {
                    setFixadas(f);
                    setOrdemManual(l);
                  },
                }
              : undefined
          }
          vazio="Nenhum lançamento."
          resumo="3 linhas × 4 colunas"
        />
      </div>
    </div>
  );
}

const GRUPOS_DEMO: GrupoOpcao[] = [
  { id: 1, nome: "Planejamento e Custos", abas: ["dfd", "pca", "orcamento", "tarefas", "calendario"] },
  { id: 2, nome: "Compras", abas: ["dfd", "catalogo"] },
  { id: 3, nome: "Sem permissão", abas: [] },
];

/** Os detalhes de exemplo (o gravado): "só os meus" e só assume para si. */
const DETALHES_DEMO = coerceDetalhes({ mesa: { linhas: "meus", responsavel: { alterar: "si" } } });

function PapeisDemo() {
  const [caps, setCaps] = useState<Capacidades>(CAPACIDADES_MEMBRO);
  const [grupos, setGrupos] = useState<number[]>([1]);
  const [det, setDet] = useState<DetalhesPapel>(DETALHES_DEMO);
  return (
    <div className="space-y-[var(--gap-block)]">
      <p className="text-[12.5px] text-muted">
        MatrizCapacidades editável (as células alteradas em relação ao gravado ficam destacadas; a caixa da linha/coluna fica
        PARCIAL — <code>Checkbox indeterminado</code> — quando só parte está marcada). No celular, um cartão por tela com chaves.
      </p>
      <MatrizCapacidades valor={caps} original={CAPACIDADES_MEMBRO} onChange={setCaps} />
      <div className="grid gap-[var(--gap-block)] md:grid-cols-2">
        <div className="space-y-2">
          <p className="text-[12.5px] font-semibold text-text-2">ResumoPapel (compacto — a célula da lista de papéis)</p>
          <ResumoPapel capacidades={caps} compacto />
          <p className="pt-2 text-[12.5px] font-semibold text-text-2">ResumoPapel (por extenso — o Perfil)</p>
          <ResumoPapel capacidades={caps} />
        </div>
        <div className="space-y-2">
          <p className="text-[12.5px] font-semibold text-text-2">GruposDaPessoa (Usuários → Editar/Aprovar)</p>
          <GruposDaPessoa grupos={GRUPOS_DEMO} selecionados={grupos} onChange={setGrupos} />
          <Checkbox label="Caixa parcial (indeterminado)" indeterminado checked={false} onChange={() => {}} />
        </div>
      </div>
      <p className="text-[12.5px] text-muted">
        DetalhesPapelEditor (a aba &quot;Detalhes&quot; do papel — as restrições DENTRO das telas; as linhas que mudaram em relação ao
        gravado ficam marcadas; sem <code>onChange</code>, só leitura):
      </p>
      <DetalhesPapelEditor valor={det} original={DETALHES_DEMO} onChange={setDet} />
      <div className="grid gap-[var(--gap-block)] md:grid-cols-2">
        <div className="space-y-2">
          <p className="text-[12.5px] font-semibold text-text-2">ResumoDetalhesPapel (compacto — a coluna Detalhes da lista de papéis)</p>
          <ResumoDetalhesPapel detalhes={det} compacto />
          <ResumoDetalhesPapel detalhes={detalhesPadrao()} compacto />
        </div>
        <div className="space-y-2">
          <p className="text-[12.5px] font-semibold text-text-2">ResumoDetalhesPapel (por extenso — o Perfil e o &quot;Ver acesso&quot;)</p>
          <ResumoDetalhesPapel detalhes={det} />
        </div>
      </div>
      <p className="text-[12.5px] font-semibold text-text-2">AcessoDaPessoa (&quot;Ver acesso&quot;: o papel acima nos grupos marcados)</p>
      <AcessoDaPessoa admin={false} papel={{ nome: "Membro (editado)", capacidades: caps, detalhes: det }} grupos={GRUPOS_DEMO.filter((g) => grupos.includes(g.id))} />
    </div>
  );
}

function EdicoesTabelaDemo() {
  const [atual, setAtual] = useState<number | null>(2);
  const [padraoId, setPadraoId] = useState<number | null>(2);
  const [salvar, setSalvar] = useState(false);
  // Publicar/moderar = o papel CONFIGURA a tela da tabela; sem isso, a edição é só da pessoa.
  const [configura, setConfigura] = useState(true);
  const { confirmar, confirmacao } = useConfirmacao();
  const e = (id: number, nome: string, minha: boolean, publico: boolean) => ({ id, chave: "k", nome, publico, minha, autor: "Ana", valor: {} });
  const minhas = [e(1, "Pessoal", true, false), e(2, "Por elemento", true, true)];
  const publicas = [e(3, "Equipe do PCA", false, true)];
  const escolhida = [...minhas, ...publicas].find((x) => x.id === atual) ?? null;
  return (
    <div className="flex flex-wrap items-center gap-3">
      <SeletorEdicoes
        minhas={minhas}
        publicas={publicas}
        atual={escolhida}
        padraoId={padraoId}
        onEscolher={setAtual}
        onPadrao={() => setPadraoId(atual)}
        onExcluir={() => void confirmar({ titulo: "Excluir a edição?", confirmar: "Excluir", perigo: true })}
        onEditar={() => setSalvar(true)}
        podeModerar={configura}
      />
      <Checkbox checked={configura} onChange={(ev) => setConfigura(ev.target.checked)} label="O papel configura a tela (publica e modera)" />
      {salvar && (
        <SalvarEdicao
          aberto
          atual={escolhida}
          ehPadrao={atual === padraoId}
          gravando={false}
          podePublicar={configura}
          onFechar={() => setSalvar(false)}
          onSalvar={() => setSalvar(false)}
        />
      )}
      {confirmacao}
    </div>
  );
}

function CronogramaModosDemo() {
  const [modo, setModo] = useState<ModoCronograma>("mensal");
  // "Distribuído": os genéricos (24 mi no ano) entram com 1/12 em cada mês.
  const base = G_MES.map((p) => (modo === "distribuido" ? { ...p, total: p.total + 2_000_000, count: p.count + 1 } : p));
  const dados =
    modo === "acumulado" ? base.map((p, i) => ({ ...p, total: base.slice(0, i + 1).reduce((s, x) => s + x.total, 0) })) : base;
  return <MensalChart data={dados} modo={modo} onModo={setModo} temGenericos />;
}

function FiltrosDashboardDemo() {
  const [sel, setSel] = useState<Record<string, string[]>>({ classificacao: ["Serviço"] });
  const campos: CampoFiltroDash[] = [
    { dim: "classificacao", rotulo: "Classificação", opcoes: G_CLASS.map((f) => ({ chave: f.label, rotulo: f.label, count: f.count })) },
    {
      dim: "mes",
      rotulo: "Mês",
      opcoes: [
        { chave: "2026-1", rotulo: "jan/26", count: 40 },
        { chave: "2026-2", rotulo: "fev/26", count: 35 },
        { chave: "2026-3", rotulo: "mar/26", count: 12 },
      ],
    },
    {
      dim: "prioridade",
      rotulo: "Prioridade",
      opcoes: [
        { chave: "ALTA", rotulo: "Alta", count: 210 },
        { chave: "MÉDIA", rotulo: "Média", count: 150 },
        { chave: "BAIXA", rotulo: "Baixa", count: 80 },
      ],
    },
  ].map((c) => ({ ...c, selecionados: sel[c.dim] ?? [] }));
  return <FiltrosDashboard campos={campos} onMudar={(dim, chaves) => setSel((s) => ({ ...s, [dim]: chaves }))} />;
}

function GraficosDashboardDemo() {
  const [classe, setClasse] = useState<string[] | undefined>();
  const [mes, setMes] = useState<string | null>(null);
  const [item, setItem] = useState<number | null>(null);
  const [unid, setUnid] = useState<string[] | undefined>();
  const [explorar, setExplorar] = useState(false);
  const corDe = (l: string) => G_CLASS.findIndex((f) => f.label === l);
  const alterna = <T,>(atual: T | null | undefined, novo: T, set: (v: T | undefined) => void) =>
    set(JSON.stringify(atual) === JSON.stringify(novo) ? undefined : novo);
  return (
    <>
      <div className="grid grid-cols-1 gap-[var(--gap-block)] lg:grid-cols-2">
        <ChartCard title="Classificação dos Itens" subtitle="Toque para filtrar — as outras esmaecem" onExpandir={() => setExplorar(true)}>
          <ClassificacaoChart
            data={G_CLASS}
            corDe={corDe}
            ativos={classe}
            onSelecionar={(r) => r.dim === "classificacao" && alterna(classe, r.labels, setClasse)}
          />
        </ChartCard>
        <ChartCard title="Cronograma Mensal" subtitle="Colunas por token — toque para filtrar">
          <MensalChart data={G_MES} ativos={mes ? [mes] : []} onSelecionar={(r) => r.dim === "mes" && setMes((m) => (m === `${r.ano}-${r.mes}` ? null : `${r.ano}-${r.mes}`))} />
        </ChartCard>
        <ChartCard title="Top Itens por Valor" subtitle="Barras horizontais por token">
          <TopItensChart data={G_TOP} ativo={item} onSelecionar={(r) => r.dim === "item" && setItem((i) => (i === r.id ? null : r.id))} />
        </ChartCard>
        <ChartCard title="Unidades de Medida" subtitle="As 10 maiores + Outras; Itens ou Valor">
          <UnidadeChart data={G_UNID} ativos={unid} onSelecionar={(r) => r.dim === "unidadeMedida" && alterna(unid, r.labels, setUnid)} />
        </ChartCard>
        <ChartCard title="Prioridade dos DFDs" subtitle="Cores pela CATEGORIA (semáforo), nunca pela posição">
          <PrioridadeChart
            data={[
              { label: "BAIXA", total: 9_400_000, count: 80 },
              { label: "ALTA", total: 31_000_000, count: 210 },
              { label: "MÉDIA", total: 18_200_000, count: 150 },
              { label: "—", total: 1_100_000, count: 12 },
            ]}
            onSelecionar={() => undefined}
          />
        </ChartCard>
        <ChartCard title="Valor por Unidade requisitante" subtitle="As 10 maiores + Outras N">
          <UnidadeRequisitanteChart
            data={["SME", "SMS", "SEINFRA", "SMA", "SEMAS", "SECULT", "SEMMA", "PGM", "SMF", "SEDUC", "GABINETE", "SMT"].map((l, i) => ({
              label: l,
              total: 20_000_000 / (i + 1),
              count: 40 - i * 3,
            }))}
            onSelecionar={() => undefined}
          />
        </ChartCard>
        <ChartCard title="Cronograma — leituras" subtitle="Por mês · Acumulado · Distribuído">
          <CronogramaModosDemo />
        </ChartCard>
        <ChartCard title="Definição da Previsão" subtitle="DefinicaoPrevisaoChart — mês definido × genérico × sem previsão">
          <DefinicaoPrevisaoChart
            data={[
              { label: "Mês definido", total: 62_000_000, count: 410, pct: 62 },
              { label: "Genérico", total: 31_000_000, count: 95, pct: 31 },
              { label: "Sem previsão", total: 7_000_000, count: 22, pct: 7 },
            ]}
            onSelecionar={() => undefined}
          />
        </ChartCard>
        <ChartCard title="Contratações Periódicas" subtitle="PeriodicidadeChart — os genéricos por periodicidade">
          <PeriodicidadeChart
            data={[
              { label: "Anual", total: 20_000_000, count: 60, pct: 64.5 },
              { label: "Semestral", total: 7_000_000, count: 20, pct: 22.6 },
              { label: "Quadrimestral", total: 4_000_000, count: 15, pct: 12.9 },
            ]}
            onSelecionar={() => undefined}
          />
        </ChartCard>
      </div>
      <ExploradorGrafico
        aberto={explorar}
        onClose={() => setExplorar(false)}
        titulo="Classificação dos Itens"
        serie={G_CLASS.map((f) => ({ chave: f.label, rotulo: f.label, valor: f.total, count: f.count }))}
        medida="valor"
        formatar={brl}
        corDe={corDe}
        ativa={classe?.length === 1 ? classe[0] : null}
        onFiltrar={(c) => alterna(classe, [c], setClasse)}
      />
    </>
  );
}

function OrigemDadosDemo() {
  const [aberta, setAberta] = useState<string | null>(null);
  const [rotulo, setRotulo] = useState("");
  const linhas = G_CLASS.filter((f) => f.label === rotulo);
  return (
    <>
      <ChartCard title="Classificação dos Itens" subtitle="Clique numa fatia ou na legenda para ver a origem">
        <ClassificacaoChart
          data={G_CLASS}
          onSelecionar={(_, r) => {
            setAberta(r);
            setRotulo(r);
          }}
        />
      </ChartCard>
      <OrigemDados
        aberto={aberta != null}
        onClose={() => setAberta(null)}
        titulo="Classificação dos Itens"
        recorte={rotulo}
        resumo={[
          { label: "Valor no gráfico", value: brl(linhas.reduce((s, l) => s + l.total, 0)) },
          { label: "Itens", value: num(linhas.reduce((s, l) => s + l.count, 0)) },
        ]}
        fonte="Os itens do PCA (a mesma lista da Consulta de Itens), agrupados pela mesma chave do gráfico."
        avisos={["Exemplo: no sistema, a tabela abaixo lista os itens do recorte."]}
      >
        <DataTable
          columns={[
            { key: "label", header: "Classificação", align: "left", value: (f: (typeof G_CLASS)[number]) => f.label },
            { key: "count", header: "Itens", nowrap: true, value: (f: (typeof G_CLASS)[number]) => num(f.count) },
            { key: "total", header: "Valor", align: "right", nowrap: true, value: (f: (typeof G_CLASS)[number]) => brl(f.total) },
          ]}
          rows={linhas}
          getKey={(f) => f.label}
        />
      </OrigemDados>
    </>
  );
}

function GraficosGovernancaDemo() {
  const [ativa, setAtiva] = useState<string | number | null>(null);
  const seg = (chave: string, valor: number, cor: string, rotulo: string) => ({ chave, valor, cor, rotulo });
  return (
    <div className="grid grid-cols-1 gap-[var(--gap-block)] lg:grid-cols-3">
      <ChartCard title="BarraSegmentada" subtitle="Medidor de 100% (trilho): segmentos com 2px de respiro">
        <BarraSegmentada
          trilho
          altura={12}
          segmentos={[seg("r", 21, "var(--ok)", "Regular"), seg("a", 9, "var(--warn)", "Atenção"), seg("e", 10, "var(--danger)", "Com erro"), seg("c", 6, "var(--border-2)", "Conferindo…")]}
        />
      </ChartCard>
      <ChartCard title="BarrasH" subtitle="Rótulo | barra | valor — a linha clicável marca a ativa">
        <BarrasH
          ariaLabel="Exemplo de barras horizontais"
          ativa={ativa}
          onEscolher={(k) => setAtiva((a) => (a === k ? null : k))}
          linhas={[
            { chave: 1, rotulo: "Ana", titulo: "Ana: 12 protocolos", segmentos: [seg("r", 8, "var(--ok)", "Regular"), seg("a", 3, "var(--warn)", "Atenção"), seg("e", 1, "var(--danger)", "Com erro")], valor: "12", detalhe: "R$ 4,1 mi" },
            { chave: 2, rotulo: "Carlão", titulo: "Carlão: 7 protocolos", segmentos: [seg("r", 6, "var(--ok)", "Regular"), seg("e", 1, "var(--danger)", "Com erro")], valor: "7", detalhe: "R$ 2,2 mi" },
            { chave: "outros", rotulo: "Outras 3 pessoas", titulo: "Outras 3 pessoas: 4 protocolos", segmentos: [seg("r", 4, "var(--ok)", "Regular")], valor: "4", detalhe: "R$ 800 mil", apagada: true },
          ]}
        />
      </ChartCard>
      <ChartCard title="Colunas" subtitle="Série no tempo / faixas — dica ao passar o mouse, focar ou tocar">
        <Colunas
          ariaLabel="Exemplo de colunas"
          colunas={[3, 5, 2, 8, 6, 9, 4].map((n, i) => ({ chave: String(i), rotulo: `S${i + 1}`, valor: n, dica: { valor: `${n} protocolos`, rotulo: `Semana ${i + 1}` } }))}
        />
      </ChartCard>
    </div>
  );
}

/** Cadastro de exemplo da PADRONIZAÇÃO (Catálogo → Unidades de medida | Classificações). */
const CLASSIFICACOES_DEMO: ClassificacaoItem[] = [
  { id: 1, nome: "SERVIÇO", cor: "#2563eb", palavras: ["Serviço", "Manutenção", "Prestação de serviço"], ordem: 0 },
  { id: 2, nome: "MATERIAL PERMANENTE", cor: "#7c3aed", palavras: ["Cadeira", "Armário", "Ar condicionado"], ordem: 1 },
  { id: 3, nome: "MATERIAL DE CONSUMO", cor: "#059669", palavras: ["Papel", "Caneta", "Material de limpeza"], ordem: 2 },
];
const UNIDADES_DEMO: UnidadeMedida[] = [
  { id: 1, sigla: "UN", nome: "UNIDADE", sinonimos: ["UND", "UNID."], classificacaoId: null, ordem: 0 },
  { id: 2, sigla: "CX", nome: "CAIXA", sinonimos: [], classificacaoId: null, ordem: 1 },
  { id: 3, sigla: "SV", nome: "SERVIÇO", sinonimos: ["MÊS"], classificacaoId: 1, ordem: 2 },
];
const COMPARACAO_DEMO = compararUnidades(
  [
    { texto: "UND", dfd: 42, catalogo: 8 },
    { texto: "Und.", dfd: 5, catalogo: 0 },
    { texto: "CAIXAS", dfd: 12, catalogo: 1 },
    { texto: "UNIDADES", dfd: 3, catalogo: 0 },
    { texto: "PACOTE", dfd: 9, catalogo: 14 },
    { texto: "SV", dfd: 7, catalogo: 0 },
    { texto: "", dfd: 2, catalogo: 0 },
  ],
  UNIDADES_DEMO,
);
const DESCRICOES_DEMO: DescricaoItem[] = [
  { descricao: "SERVIÇO DE MANUTENÇÃO PREVENTIVA EM CADEIRAS DE ESCRITÓRIO", unidade: "SV", dfd: 3, catalogo: 0, valor: 18000 },
  { descricao: "CADEIRA GIRATÓRIA COM BRAÇOS E REGULAGEM DE ALTURA", unidade: "UN", dfd: 12, catalogo: 1, valor: 9600 },
  { descricao: "PAPEL A4 75G/M², RESMA COM 500 FOLHAS", unidade: "RESMA", dfd: 20, catalogo: 1, valor: 5200 },
  { descricao: "LOCAÇÃO DE VEÍCULO COM MOTORISTA", unidade: "MÊS", dfd: 2, catalogo: 0, valor: 96000 },
  { descricao: "PNEU ARO 15", unidade: "UN", dfd: 8, catalogo: 0, valor: 3200 },
];
const CLASSIFICADOR_DEMO = criarClassificador(CLASSIFICACOES_DEMO, UNIDADES_DEMO);
const CLASSIFICADAS_DEMO = classificarDescricoes(DESCRICOES_DEMO, CLASSIFICADOR_DEMO);

/** A PADRONIZAÇÃO: as células da Mesa → Itens, as ações de linha do cadastro, a comparação das unidades, a
 * classificação dos itens e os dois editores (com a prévia ao vivo; `somenteLeitura` = a consulta). */
function PadronizacaoDemo() {
  const [rascUnid, setRascUnid] = useState<RascunhoUnidade | null>(null);
  const [rascClass, setRascClass] = useState<RascunhoClassificacao | null>(null);
  const [consulta, setConsulta] = useState(false);
  const linhas = COMPARACAO_DEMO.linhas;
  const abrirUnid = (r: RascunhoUnidade, leitura = false) => {
    setConsulta(leitura);
    setRascUnid(r);
  };
  const abrirClass = (r: RascunhoClassificacao, leitura = false) => {
    setConsulta(leitura);
    setRascClass(r);
  };
  const unidDemo: RascunhoUnidade = { id: 1, sigla: "UN", nome: "UNIDADE", sinonimos: ["UND", "UNID."], classificacaoId: null };
  const classDemo: RascunhoClassificacao = { id: 1, nome: "SERVIÇO", cor: "#2563eb", palavras: ["Serviço", "Manutenção", "Prestação de serviço"] };
  return (
    <div className="space-y-[var(--gap-block)]">
      <div className="flex flex-wrap items-center gap-x-6 gap-y-3 rounded-card border border-border bg-surface p-[var(--pad-card)]">
        <span className="text-xs text-muted">Unid. cadastrada:</span>
        <CelulaUnidadeCadastrada texto="Und." unidade={UNIDADES_DEMO[0]} />
        <CelulaUnidadeCadastrada texto="PACOTE" unidade={null} />
        <CelulaUnidadeCadastrada texto="" unidade={null} />
        <span className="text-xs text-muted">Classificação:</span>
        <CelulaClassificacao resultado={CLASSIFICADOR_DEMO("Manutenção de ar condicionado", "SV")} />
        <CelulaClassificacao resultado={CLASSIFICADOR_DEMO("Locação de veículo", "MÊS")} />
        <CelulaClassificacao resultado={null} />
        <span className="text-xs text-muted">Ações do cadastro:</span>
        <AcoesCadastro nome="UN" primeira ultima={false} onMover={() => toast.info("Mover")} onEditar={() => toast.info("Editar")} onExcluir={() => toast.info("Excluir")} />
      </div>
      <div className="rounded-card border border-border bg-surface p-[var(--pad-card)]">
        <ComparacaoUnidades
          linhas={linhas}
          unidades={UNIDADES_DEMO}
          podeEditar
          onAdicionar={(itens) => toast.success(`${itens.length} grafia(s) adicionada(s) (exemplo).`)}
          onCadastrar={(l) => abrirUnid({ id: null, ...propostaUnidade(l, linhas), classificacaoId: null })}
        />
      </div>
      <div className="rounded-card border border-border bg-surface p-[var(--pad-card)]">
        <ClassificacaoDosItens linhas={CLASSIFICADAS_DEMO} />
      </div>
      <div className="flex flex-wrap gap-2">
        <Button variant="secondary" onClick={() => abrirUnid(unidDemo)}>
          Editor de unidade de medida
        </Button>
        <Button variant="secondary" onClick={() => abrirClass(classDemo)}>
          Editor de classificação
        </Button>
        <Button variant="ghost" onClick={() => abrirUnid(unidDemo, true)}>
          Unidade (consulta)
        </Button>
        <Button variant="ghost" onClick={() => abrirClass(classDemo, true)}>
          Classificação (consulta)
        </Button>
      </div>
      <ErroCarga msg="Erro ao carregar as classificações." onTentar={() => toast.info("Tentar de novo")} />
      <ErroCarga kind="warn" msg="A lista pode estar desatualizada — Sem conexão com o servidor." onTentar={() => toast.info("Tentar de novo")} />
      {rascUnid && (
        <EditorUnidadeMedida
          inicial={rascUnid}
          unidades={UNIDADES_DEMO}
          classificacoes={CLASSIFICACOES_DEMO}
          linhas={linhas}
          salvando={false}
          somenteLeitura={consulta}
          onFechar={() => setRascUnid(null)}
          onSalvar={(r) => {
            toast.success(`Unidade ${r.sigla} gravada (exemplo).`);
            setRascUnid(null);
          }}
        />
      )}
      {rascClass && (
        <EditorClassificacao
          inicial={rascClass}
          cadastro={{ unidades: UNIDADES_DEMO, classificacoes: CLASSIFICACOES_DEMO }}
          linhas={CLASSIFICADAS_DEMO}
          salvando={false}
          somenteLeitura={consulta}
          onFechar={() => setRascClass(null)}
          onSalvar={(r) => {
            toast.success(`Classificação ${r.nome} gravada (exemplo).`);
            setRascClass(null);
          }}
        />
      )}
    </div>
  );
}

/** Itens de exemplo da visão CONSOLIDADA — o MESMO código em 3 DFDs (preços e unidades diferentes) + outro código. */
const ITENS_CONSOLIDADOS_DEMO: ItemComposicao[] = [
  { id: 1, codigo: "5241947270", descricao: "PAPEL A4 75G/M² — RESMA COM 500 FOLHAS", unidade: "RESMA", quantidade: 120, valorUnitario: 24.9, valorTotal: 2988, dfdNumero: "1201", dfdPlanejamento: "1525", dfdTipo: "DFD-S", protocoloNumero: "97600/2026", sigla: "SME", item: 3 },
  { id: 2, codigo: "524.194.727-0", descricao: "Papel A4 75g/m² — resma com 500 folhas", unidade: "RESMA", quantidade: 80, valorUnitario: 27.5, valorTotal: 2200, dfdNumero: "1243", dfdPlanejamento: "1549", dfdTipo: "DFD-R", protocoloNumero: "97611/2026", sigla: "SMS", item: 7 },
  { id: 3, codigo: "5241947270", descricao: "PAPEL SULFITE A4 BRANCO", unidade: "CX", quantidade: 10, valorUnitario: 139, valorTotal: 1390, dfdNumero: "1300", dfdPlanejamento: "1554", dfdTipo: "DFD-S", protocoloNumero: "97611/2026", sigla: "SMS", item: 12 },
  { id: 4, codigo: "3300110", descricao: "CANETA ESFEROGRÁFICA AZUL", unidade: "UN", quantidade: 500, valorUnitario: 1.2, valorTotal: 600, dfdNumero: "1201", dfdPlanejamento: "1525", dfdTipo: "DFD-S", protocoloNumero: "97600/2026", sigla: "SME", item: 4 },
];

/** BotaoAtualizar (o botão circular PADRÃO de recarregar — o ícone GIRA dentro do anel; com andamento, o anel enche) + os DADOS COMPLETOS da Mesa
 * (BotaoDadosCompletos + o provedor DadosCompletos: CelulaTexto, CelulaLista e EstadoResumo inteiros na célula). */
function AtualizarEDadosCompletosDemo() {
  const [ligado, setLigado] = useState(false);
  const [rever, setRever] = useState<number | null>(null);
  const giro = useGiro();
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-3">
        <BotaoAtualizar
          ativo={giro.girando}
          rotulo="Atualizar e revisar"
          detalhe="Atualizando e revisando os dados…"
          onClick={() => void giro.girar(() => new Promise((r) => setTimeout(r, 1200)))}
        />
        <span className="text-[12px] text-faint">
          BotaoAtualizar indeterminado (+ useGiro) — banners de DFD, item e protocolo e o "Recarregar" das telas de administração.
        </span>
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <BotaoAtualizar
          ativo={rever != null}
          rotulo="Atualizar e reverificar toda a Mesa"
          progresso={rever}
          detalhe={rever == null ? undefined : `Reconferindo ${Math.round(rever * 100)}%…`}
          onClick={() => {
            let p = 0;
            setRever(0);
            const t = setInterval(() => {
              p += 0.1;
              if (p >= 1) {
                clearInterval(t);
                setRever(null);
              } else setRever(p);
            }, 250);
          }}
        />
        <span className="text-[12px] text-faint">BotaoAtualizar com andamento — na barra das Mesas: recarrega e reconfere todos os protocolos, DFDs e itens (o anel enche com o andamento).</span>
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <BotaoAtualizar ativo={false} rotulo="Atualizar e revisar" dica="Sobrescrita do DFD em andamento — conclua ou cancele" onClick={() => {}} disabled />
        <span className="text-[12px] text-faint">
          BotaoAtualizar desabilitado — TRAVAR = DESABILITAR, nunca sumir: gravando ou sobrescrevendo, as ações dos banners ficam à vista com o motivo na dica.
        </span>
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <BotaoExportar nome="a tabela de demonstração" onExportar={() => {}} />
        <span className="text-[12px] text-faint">
          BotaoExportar — no rodapé de TODA tabela (DataTable e tabela cruzada): XLSX e PDF das linhas filtradas, com as colunas à vista.
        </span>
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <BotaoDadosCompletos ligado={ligado} onChange={setLigado} />
        <span className="text-[12px] text-faint">BotaoDadosCompletos — na barra da Mesa: o texto inteiro e todas as listas dentro das células.</span>
      </div>
      <DadosCompletos value={ligado}>
        <div className="grid max-w-xl gap-2 rounded-card border border-border p-3 text-[13px] text-text">
          <CelulaTexto texto="PAINEL DE LED P3 COM TELA DE ALTA DEFINIÇÃO PARA USO OUTDOOR COM ESTRUTURA METÁLICA DE SUSTENTAÇÃO E MÓDULOS COMPATÍVEIS ENTRE SI" />
          <CelulaTexto texto="PAPEL SULFITE A4 BRANCO" outros={["PAPEL A4 75G BRANCO", "PAPEL SULFITE A4 (RESMA)"]} />
          <CelulaLista valores={["97600/2026", "97611/2026", "97650/2026", "97701/2026"]} mono />
          <EstadoResumo
            res={{
              rotulo: "Sem prioridade",
              cor: "var(--danger)",
              extraErros: 1,
              extraAtencoes: 1,
              titulo: "Erro: sem prioridade\nErro: item sem valor\nAtenção: assinatura não conferida",
              rotulos: ["Sem prioridade", "Item sem valor", "Assinatura não conferida"],
            }}
          />
        </div>
      </DadosCompletos>
    </div>
  );
}

function ConsolidadosDemo() {
  const linhas = consolidarItens(ITENS_CONSOLIDADOS_DEMO);
  const [aberta, setAberta] = useState<string | null>(null);
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-4">
        <CelulaLista valores={["97600/2026", "97611/2026", "97650/2026"]} mono />
        <CelulaLista valores={["SME", "SMS"]} mono destaque />
        <CelulaLista valores={[{ texto: "12" }, { texto: "45", riscado: true }]} />
        <CelulaLista valores={[]} />
        <MaisN n={3} />
      </div>
      <div className="flex flex-wrap items-center gap-4">
        <CelulaVariacao cv={0.12} min={10} max={12.5} n={3} />
        <CelulaVariacao cv={0.38} min={8} max={15} n={4} />
        <CelulaVariacao cv={0.74} min={2} max={9} n={5} />
        <CelulaVariacao cv={null} />
        <SeloAbc classe="A" participacao={0.62} />
        <SeloAbc classe="B" participacao={0.1} />
        <SeloAbc classe="C" participacao={0.01} />
        <SeloAbc classe={null} />
      </div>
      <div className="flex flex-wrap items-center gap-4">
        <CelulaExecucao situacao="Executado" />
        <CelulaExecucao situacao="Cancelado" />
        <CelulaExecucao situacao="Em andamento" />
        <CelulaExecucao situacao={null} />
      </div>
      <div className="flex flex-wrap gap-2">
        {linhas.map((l) => (
          <Button key={l.chave} variant="secondary" size="sm" onClick={() => setAberta(l.chave)}>
            Detalhe · {l.codigo} ({l.itens.length} {l.itens.length === 1 ? "item" : "itens"})
          </Button>
        ))}
      </div>
      <ComposicaoItem linha={linhas.find((l) => l.chave === aberta) ?? null} onFechar={() => setAberta(null)} />
      <p className="text-[12px] text-faint">
        Os itens de MESMO código viram uma linha: quantidade somada, valor unitário médio PONDERADO pela quantidade,
        variação dos preços (até 25% homogêneo · até 50% atenção · acima, alerta) e a curva ABC do valor. Unidades
        diferentes no mesmo código ficam em âmbar (a soma mistura unidades) e o detalhe compara POR UNIDADE (a variação e
        o desvio de cada item usam a média da unidade dele).
      </p>
    </div>
  );
}

// Histórico de compra de um produto: contrato 1 (2025, R$ 10,00) e contrato 2 (2026, R$ 8,75 + aditivo R$ 0,80).
const HISTORICO_ITEM_DEMO = historicoDasLinhas(
  [
    { ordem: 0, idContrato: "26011", sequencial: 1, vu: 10, data: "2025-03-01", credor: "VIVEIRO BOA VISTA LTDA" },
    { ordem: 1, idContrato: "25964", sequencial: 1, vu: 8.75, data: "2026-02-02", credor: "GRAMA GPP AGRICOLA LTDA" },
    { ordem: 2, idContrato: "25964", sequencial: 2, vu: 0.8, data: "2026-02-02", credor: "GRAMA GPP AGRICOLA LTDA" },
  ].map((l) => ({
    ordem: l.ordem,
    idContrato: l.idContrato,
    codigo: "524184753",
    sequencial: l.sequencial,
    descricao: "GRAMA ESMERALDA EM PLACAS - M²",
    qtdContratada: 1000,
    valorContratado: 1000 * l.vu,
    valorUnitario: l.vu,
    dataAssinatura: l.data,
    credor: l.credor,
    numeroContrato: l.idContrato,
    modalidade: "PREGÃO ELETRÔNICO",
  })),
);

function HistoricoItemDemo() {
  const produto = produtosDoHistorico(HISTORICO_ITEM_DEMO.itens, HISTORICO_ITEM_DEMO.contratos)[0];
  const ref = referenciaDoProduto(produto);
  const contratoPorId = new Map(HISTORICO_ITEM_DEMO.contratos.map((c) => [c.idContrato, c] as const));
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-4">
        <CelulaHistoricoCompra valor={9.8} referencia={ref} />
        <CelulaHistoricoCompra valor={12.5} referencia={ref} />
        <CelulaHistoricoCompra valor={16} referencia={ref} />
        <CelulaHistoricoCompra valor={4} referencia={ref} />
        <CelulaHistoricoCompra valor={null} referencia={ref} />
        <CelulaHistoricoCompra valor={10} referencia={null} />
      </div>
      <div className="max-w-md">
        <ProdutoHistoricoDetalhe produto={produto} contratoPorId={contratoPorId} />
      </div>
    </div>
  );
}

/** Demo dos filtros de HIERARQUIA (acima das tabelas da Mesa) e do dropdown DENTRO da célula. */
function SeletoresDemo() {
  const [resp, setResp] = useState("todos");
  const [assunto, setAssunto] = useState("todos");
  const [situacao, setSituacao] = useState<number | null>(2);
  const [pessoa, setPessoa] = useState("");
  const [padrao, setPadrao] = useState("4");
  const [fora, setFora] = useState(String(PESSOA_FORA_DEMO.id));
  const [vista, setVista] = useState("protocolos");
  const [modoItens, setModoItens] = useState("normal");
  return (
    <div className="space-y-4">
      {/* A BARRA DA MESA: as visões — o Dashboard (item SÓ-ÍCONE do Segmented) antes de Protocolos · DFDs · Itens — à
          esquerda (em Itens, ao lado, Normal | Consolidada); os filtros à direita. */}
      <div className="flex flex-wrap items-center gap-2">
        <Segmented
          value={vista}
          onChange={setVista}
          ariaLabel="Visões da Mesa"
          options={[
            { value: "dashboard", label: "Dashboard de governança", icone: <IconDashboard className="h-4 w-4" />, soIcone: true },
            { value: "protocolos", label: "Protocolos" },
            { value: "dfds", label: "DFDs" },
            { value: "itens", label: "Itens" },
          ]}
        />
        {vista === "itens" && (
          <Segmented
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
          <SeletorPessoa
            variante="filtro"
            rotulo="Responsável"
            ariaLabel="Filtro: Responsável"
            pessoas={PESSOAS_DEMO}
            usuarioId={1}
            valor={resp}
            ativo={resp !== "todos"}
            extras={EXTRAS_FILTRO_DEMO}
            onChange={setResp}
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
      </div>
      <div className="flex flex-wrap items-center gap-2 rounded-card border border-border p-2">
        <SeletorCelula ariaLabel="Situação do protocolo" valor={situacao} opcoes={SITUACOES_DEMO} onChange={setSituacao} vazio="Sem situação" />
        <SeletorPessoa
          variante="celula"
          rotulo="Responsável"
          ariaLabel="Responsável pelo protocolo"
          pessoas={PESSOAS_DEMO}
          usuarioId={1}
          valor={pessoa}
          extras={EXTRAS_CELULA_DEMO}
          onChange={setPessoa}
        />
        <SeletorPessoa variante="celula" rotulo="Responsável (salvando)" pessoas={PESSOAS_DEMO} valor="4" extras={EXTRAS_CELULA_DEMO} onChange={() => undefined} salvando />
        <SeletorPessoa variante="celula" rotulo="Responsável (sem permissão)" pessoas={PESSOAS_DEMO} valor="7" extras={EXTRAS_CELULA_DEMO} />
        <SeletorPessoa
          variante="celula"
          rotulo="Responsável (hoje fora do grupo)"
          pessoas={PESSOAS_DEMO}
          atual={PESSOA_FORA_DEMO}
          valor={fora}
          extras={EXTRAS_CELULA_DEMO}
          onChange={setFora}
        />
        <SeletorCelula ariaLabel="Situação (sem permissão)" valor={4} opcoes={SITUACOES_DEMO} />
      </div>
      <div className="max-w-sm space-y-1.5">
        <p className="text-[12px] font-medium text-muted">SeletorPessoa — campo de formulário (Perfil → Responsável padrão; edição em massa)</p>
        <SeletorPessoa
          variante="campo"
          rotulo="Responsável padrão ao protocolar"
          pessoas={PESSOAS_DEMO}
          usuarioId={1}
          valor={padrao}
          extras={[{ valor: "", rotulo: "Nenhum (definir na Mesa)", icone: <IconUserX className="h-4 w-4" /> }]}
          onChange={setPadrao}
        />
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
        // EDIÇÃO da tabela (lápis no rodapé): arrastar, congelar, ocultar, ordenar, largura — e salvar (colunas + ordenação +
        // filtros), só para mim ou pública (salvar exige login).
        edicoes={{ chave: "design-system:demo", lista: [], padroes: {}, podePublicar: true }}
      />
    </div>
  );
}

/** Itens de exemplo para a CÉLULA COPIÁVEL (as colunas copiáveis das tabelas do sistema). */
const ITENS_COPIA = [
  { id: 1, protocolo: "144756/2026", idExterno: "8812345", dfd: "1209", planejamento: "1509", codigo: "5241947270", descricao: "CADEIRA GIRATÓRIA COM BRAÇOS, ESTOFADA EM TECIDO, BASE CROMADA E RODÍZIOS" },
  { id: 2, protocolo: "144757/2026", idExterno: null, dfd: "1210", planejamento: null, codigo: "000123", descricao: "PAPEL A4 75 G/M², CAIXA COM 10 RESMAS" },
  { id: 3, protocolo: null, idExterno: null, dfd: "1211", planejamento: "1511", codigo: null, descricao: null },
];

/** Demo da CÉLULA COPIÁVEL: o ícone fica sempre à vista, discreto — mais forte com o mouse na linha. */
function CelulaCopiavelDemo() {
  type L = (typeof ITENS_COPIA)[number];
  const mono = (t: string | null) => <span className="font-mono text-[12px]">{t ?? "—"}</span>;
  const colunas: Column<L>[] = [
    {
      key: "protocolo",
      header: "Nº processo",
      nowrap: true,
      render: (r) => (r.protocolo ? <CelulaCopiavel copiar={numeroSemAno(r.protocolo)} rotulo="nº do protocolo">{mono(r.protocolo)}</CelulaCopiavel> : mono(null)),
    },
    { key: "id", header: "Id protocolo", nowrap: true, render: (r) => <CelulaCopiavel copiar={r.idExterno} rotulo="Id do protocolo">{mono(r.idExterno)}</CelulaCopiavel> },
    { key: "plan", header: "Nº Plan.", nowrap: true, render: (r) => <CelulaCopiavel copiar={r.planejamento} rotulo="nº de planejamento">{mono(r.planejamento)}</CelulaCopiavel> },
    { key: "dfd", header: "Nº DFD", nowrap: true, render: (r) => <CelulaCopiavel copiar={r.dfd} rotulo="nº do DFD">{mono(r.dfd)}</CelulaCopiavel> },
    { key: "codigo", header: "Código", nowrap: true, render: (r) => <CelulaCopiavel copiar={r.codigo} rotulo="código do item">{mono(r.codigo)}</CelulaCopiavel> },
    {
      key: "descricao",
      header: "Descrição",
      minWidth: 240,
      render: (r) => (
        <CelulaCopiavel copiar={r.descricao} rotulo="descrição do item">
          <span className="line-clamp-1" title={r.descricao ?? undefined}>
            {r.descricao ?? "—"}
          </span>
        </CelulaCopiavel>
      ),
    },
  ];
  const planejamentos = ITENS_COPIA.map((r) => r.planejamento ?? "—");
  return (
    <div className="space-y-3">
      <DataTable columns={colunas} rows={ITENS_COPIA} getKey={(r) => r.id} onRowClick={() => toast.info("A linha abriu (o ícone de copiar não abre a linha).")} footer="O ícone fica sempre à vista, discreto (mais forte com o mouse na linha); tocar no valor abre a linha." />
      <p className="text-[12.5px] text-muted">
        Vários valores numa célula (visão Consolidada) saem unidos por ":":{" "}
        <CelulaCopiavel copiar={juntarParaCopiar(planejamentos)} rotulo="nº de planejamento" plural="nºs de planejamento">
          <CelulaLista valores={planejamentos} mono max={3} />
        </CelulaCopiavel>
      </p>
    </div>
  );
}

/** Demo das cores em círculos (controlado). */
function CoresPaletaDemo() {
  const [cor, setCor] = useState<string | null>(null);
  return <CoresPaleta valor={cor} onChange={setCor} />;
}

/** Catálogos de exemplo (os cards do Catálogo: agenda, histórico de compra e a pasta). */
const CATALOGOS_DEMO = [
  { id: 901, nome: "MATERIAL EXPEDIENTE - 2026", descricao: null, tiposPadrao: ["DFD-O"], totalItens: 185, atualizadoEm: "2026-09-17 10:00:00", tipo: "agenda" as const, cor: null, pastaId: 1, contratos: 0, produtos: 0, valor: 0 },
  { id: 902, nome: "Histórico de compra 2026", descricao: null, tiposPadrao: [], totalItens: 1130, atualizadoEm: "2026-10-01 09:00:00", tipo: "historico" as const, cor: null, pastaId: 1, contratos: 153, produtos: 868, valor: 185613601.92 },
  { id: 903, nome: "GÊNEROS ALIMENTÍCIOS – PERECÍVEIS", descricao: null, tiposPadrao: ["DFD-O"], totalItens: 81, atualizadoEm: "2026-09-17 10:00:00", tipo: "agenda" as const, cor: "#9f8fef", pastaId: 1, contratos: 0, produtos: 0, valor: 0 },
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
  { id: 1, nome: "Energia elétrica", valor: 11_800_000, quantidade: 12, unidadeMedida: "MWh", codigo: "0001" },
  { id: 2, nome: "Auxiliar de serviços gerais", valor: 8_400_000, quantidade: 40, unidadeMedida: "posto", codigo: "0002" },
  { id: 3, nome: "Fornecimento e instalação de equipamentos", valor: 6_100_000, quantidade: 8, unidadeMedida: "un", codigo: "0003" },
  { id: 4, nome: "Reforma da rodoviária", valor: 4_900_000, quantidade: 1, unidadeMedida: "obra", codigo: "0004" },
  { id: 5, nome: "Reforma de ecoponto", valor: 4_200_000, quantidade: 1, unidadeMedida: "obra", codigo: "0005" },
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

function TarefasDemo() {
  const pessoas = [
    { id: 1, nome: "Ana Souza", apelido: "Ana", foto: null },
    { id: 2, nome: "Bruno Lima", apelido: null, foto: null },
    { id: 3, nome: "Carla Dias", apelido: "Carla", foto: null },
  ];
  const etiquetas = [
    { id: 1, nome: "Licitação", cor: "#e11d48" },
    { id: 2, nome: "Aguardando", cor: "#0ea5e9" },
  ];
  const mEt = new Map(etiquetas.map((e) => [e.id, e]));
  const mPe = new Map(pessoas.map((p) => [p.id, p]));
  const camposDemo: CampoTarefa[] = [
    { id: 1, nome: "Categoria", tipo: "lista", opcoes: ["1. Demanda", "2. Protocolo"], ordem: 1, noCartao: true },
    { id: 2, nome: "Tipo", tipo: "texto", opcoes: [], ordem: 2, noCartao: true },
    { id: 3, nome: "Nº protocolo", tipo: "numero", opcoes: [], ordem: 3, noCartao: false },
    { id: 4, nome: "Urgente", tipo: "checkbox", opcoes: [], ordem: 4, noCartao: true },
  ];
  const [valoresDemo, setValoresDemo] = useState<Record<number, string>>({ 1: "2. Protocolo", 2: "FALTA", 4: "1" });
  const [trelloDemo, setTrelloDemo] = useState(false);
  const [textoLugar, setTextoLugar] = useState("A FAZER");
  const [vistaDemo, setVistaDemo] = useState<"quadro" | "lista" | "calendario">("quadro");
  const [chipDemo, setChipDemo] = useState("Tudo");
  const [fundoDemo, setFundoDemo] = useState<FundoEscolha>({ tipo: "gradiente", g: { cores: ["#0c66e4", "#09326c"], angulo: 135 } });
  const [arquivadosDemo, setArquivadosDemo] = useState(false);
  const base: TarefaResumo = {
    id: 0, listaId: 1, ticket: 0, titulo: "", prioridade: "media", inicio: null, prazo: null, ordem: 0, concluidaEm: null,
    arquivada: false, template: false, prazoHora: null, lembreteMin: null, pessoas: [], observadores: [], equipes: [], envolvidos: [], etiquetas: [], criadoEm: null, atualizadoEm: null,
    estimativaH: null, vinculos: [], checklist: { feitos: 0, total: 0 }, comentarios: 0, notas: 0, links: 0, eventos: 0, recorrencia: null,
  };
  const cartoes: TarefaResumo[] = [
    { ...base, id: 1, ticket: 128, titulo: "Conferir DFDs do protocolo 144756 antes do envio ao PCA", prioridade: "urgente", prazo: "2026-01-02", etiquetas: [1], pessoas: [1, 2], checklist: { feitos: 2, total: 5 }, comentarios: 3, vinculos: [{ tipo: "protocolo", id: 1, rotulo: "144756/2026" }] },
    { ...base, id: 2, ticket: 129, titulo: "Atualizar o catálogo de materiais de limpeza", prioridade: "alta", prazo: "2099-12-31", etiquetas: [2], pessoas: [3], notas: 1, links: 2 },
    { ...base, id: 3, ticket: 130, titulo: "Revisar a classificação dos itens", concluidaEm: "2026-01-01" },
  ];
  const [sel, setSel] = useState<number[]>([1]);
  const [filtro, setFiltro] = useState(FILTRO_TAREFAS_PADRAO);
  const [rec, setRec] = useState<Recorrencia | null>({ freq: "semanal", intervalo: 1, dias: [1, 3], base: "prazo" });
  const [gerirDemo, setGerirDemo] = useState(false);
  const [buscaDemo, setBuscaDemo] = useState("");
  const eventoDemo = { titulo: "Reunião com a unidade", data: "2026-01-02", dataFim: null, diaInteiro: false, horaInicio: "09:30", horaFim: "10:30", local: "Sala 2", descricao: null, cor: null, lembreteMin: 30, recorrencia: null, linkReuniao: null, ocupado: true, privado: false, criadoPor: null, convidados: [] };
  const pcaDemo = eventosPca(
    [{ pcaId: 1, pcaNome: "PCA 2026", dfdId: 9, numero: "1234", planejamento: "1509", objeto: "Material de limpeza", sigla: "SME", valor: 125000, ano: 2026, mes: 1, anual: false }],
    "2025-12-28",
    "2026-02-07",
  );
  const eventosDemo = [
    ...eventosDoCalendario(cartoes.map((t) => ({ ...t, quadroId: 1 })), [{ id: 1, tarefaId: 1, ...eventoDemo }], "2025-12-28", "2026-02-07"),
    ...pcaDemo,
  ];
  const [ocultosDemo, setOcultosDemo] = useState(OCULTOS_VAZIO);
  const [opcoesDemo, setOpcoesDemo] = useState(OPCOES_CALENDARIO_PADRAO);
  const feriadosDemo = feriadosNoIntervalo([{ id: 1, data: "2026-01-20", nome: "Feriado municipal", tipo: "municipal", anual: false }], "2025-12-28", "2026-02-07");
  const [checkDemo, setCheckDemo] = useState([{ nome: "SERVIDORES COM FALTA", itens: ["3009540 - STELLA PAULINA DA SILVA: 24 DIAS", "3009865 - THIAGO OLIVEIRA: 2 DIAS"] }]);
  const [blocos, setBlocos] = useState<BlocoTarefa[]>([{ id: "b1", tipo: "nota", texto: "" }]);
  const [textoDemo, setTextoDemo] = useState("## Passos\n- Conferir o **DFD**\n- Falar com @Ana");
  // Uma pasta PÚBLICA do grupo e uma PRIVADA (só a dona vê; os quadros dela são privados).
  const [pastasDemo, setPastasDemo] = useState<PastasQuadros>({
    lista: [
      { id: "demo", nome: "PCA 2027", cor: "#579dff", quadros: [2, 3], privado: false, criadoPor: 2, grupoId: 1 },
      { id: "priv", nome: "Minhas rotinas", cor: "#9f8fef", quadros: [1], privado: true, criadoPor: 1, grupoId: 1 },
    ],
    ordem: [],
  });
  const atorDemo = { id: 1, configuraEm: null, manipulaEm: null };
  const quadroDemo = {
    id: 1,
    grupoId: 1,
    grupoNome: "Planejamento",
    nome: "Planejamento do PCA 2027",
    cor: "#6366f1",
    descricao: null,
    arquivado: false,
    formatoTitulo: null,
    fundoUrl: null,
    fundoAjuste: null,
    fundoGradiente: '{"cores":["#6cc3e0","#9f8fef"],"angulo":135}',
    privado: true,
    criadoPor: 1,
    pastaId: null,
    pastaOrdem: 0,
    abertas: 12,
    atrasadas: 3,
    concluidas: 40,
  };
  const quadrosDemo = [
    quadroDemo,
    { ...quadroDemo, id: 2, nome: "Rotinas do setor", privado: false, fundoGradiente: '{"cores":["#4bce97","#1f845a"],"angulo":135}', atrasadas: 0 },
    { ...quadroDemo, id: 3, nome: "Protocolos", privado: false, fundoGradiente: '{"cores":["#f87168","#ae2e24"],"angulo":135}', atrasadas: 1 },
    { ...quadroDemo, id: 4, nome: "Compras", privado: false, criadoPor: 2, fundoGradiente: null, cor: "#e2b203", atrasadas: 0 },
  ];
  const listasDemo = [
    { id: 1, nome: "A fazer", ordem: 1, limiteWip: null, concluida: false, arquivada: false },
    { id: 2, nome: "Em andamento", ordem: 2, limiteWip: 2, concluida: false, arquivada: false },
    { id: 3, nome: "Concluído", ordem: 3, limiteWip: null, concluida: true, arquivada: false },
  ];
  return (
    <div className="space-y-4">
      {/* As SEÇÕES de quadros (Favoritos · Recentes · "Seus quadros" com as PASTAS — abrir no lugar, arrastar para reordenar
          e para dentro/fora; minimizáveis) com o QuadroCard. Aqui o arrasto só muda o estado local (sem gravar). */}
      <SecoesDeQuadros
        quadros={quadrosDemo}
        favoritos={[1]}
        onFavorito={() => {}}
        pastas={pastasDemo}
        onMover={(raiz, chave, d) => setPastasDemo((e) => moverNaGrade(e, raiz, chave, d))}
        onEditarPasta={() => {}}
        onExcluirPasta={(id, raiz) => setPastasDemo((e) => excluirPasta(e, raiz, id))}
        ator={atorDemo}
        novoNaPasta={() => <QuadroNovoCard rotulo="Novo quadro nesta pasta" onClick={() => {}} />}
        extraFinal={<QuadroNovoCard onClick={() => {}} />}
      />
      {/* A PASTA sozinha: fechada (do grupo) · PRIVADA aberta (cadeado + selo) · ALVO de um quadro arrastado (soltar põe dentro). */}
      <div className="grid grid-cols-[repeat(auto-fill,minmax(min(100%,15rem),1fr))] gap-3">
        <PastaQuadro pasta={{ id: "x", nome: "PCA 2027", cor: "#579dff", quadros: [], privado: false, criadoPor: 2, grupoId: 1 }} quadros={quadrosDemo.slice(1)} />
        <PastaQuadro pasta={{ id: "y", nome: "Minhas rotinas", cor: "#9f8fef", quadros: [], privado: true, criadoPor: 1, grupoId: 1 }} quadros={quadrosDemo.slice(0, 1)} aberta />
        <PastaQuadro pasta={{ id: "z", nome: "Vazia", cor: "#f87168", quadros: [], privado: false, criadoPor: 2, grupoId: 1 }} quadros={[]} alvo />
      </div>
      {/* FAVORITO (estrela), o MENU "…" da lista e os campos do QUADRO DO PERÍODO (listas dos dias do mês). */}
      <div className="flex flex-wrap items-center gap-2 text-[13px] text-muted">
        <EstrelaFavorito ativo={false} nome="Quadro" onAlternar={() => {}} />
        <EstrelaFavorito ativo nome="Quadro" onAlternar={() => {}} />
        <MenuLista
          lista={{ id: 1, nome: "05 - OUTUBRO - 2026", ordem: 1, limiteWip: null, concluida: false, arquivada: false }}
          outras={[{ id: 2, nome: "06 - OUTUBRO - 2026", ordem: 2, limiteWip: null, concluida: false, arquivada: false }]}
          qtd={3}
          pode={{ manipular: true, configurar: true, excluir: true }}
          onNova={() => {}}
          onOrdenar={() => {}}
          onMoverCartoes={() => {}}
          onArquivarCartoes={() => {}}
          onCopiarMover={() => {}}
          onArquivarLista={() => {}}
          onExcluirLista={() => {}}
          onLimite={() => {}}
          onConcluidas={() => {}}
        />
        Menu da lista
      </div>
      <div className="max-w-md">
        <CamposPeriodo valor={{ ano: 2026, mes: 10, diasUteis: true }} onChange={() => {}} />
      </div>
      {/* SELETOR DE ETIQUETAS (as marcadas + o "+": busca, marcar, criar/editar para editores). */}
      <SeletorEtiquetas etiquetas={etiquetas} marcados={etiquetas.slice(0, 1).map((e) => e.id)} onChange={() => {}} quadroId={1} podeEditar onMudouEtiquetas={() => {}} />
      <div className="flex flex-wrap items-center gap-2">
        <FiltrosTarefas filtro={filtro} onChange={setFiltro} pessoas={pessoas} etiquetas={etiquetas} campos={camposDemo} usuarioId={1} />
      </div>
      {/* A MOLDURA do quadro (padrão do Trello): faixa translúcida no topo, listas opacas sobre a imagem nítida e a PÍLULA de
          vistas flutuando no rodapé; sem imagem, o degradê da cor do quadro. */}
      <MolduraQuadro
        fundoUrl={null}
        gradiente={{ cores: ["#0c66e4", "#9f8fef"], angulo: 135 }}
        alturaFixa={420}
        faixa={
          <FaixaQuadro
            esquerda={<span className="px-1.5 text-lg font-bold text-text">Planejamento do PCA 2027</span>}
            direita={
              <>
                <MembrosQuadro pessoas={pessoas} filtro={filtro} onFiltro={setFiltro} />
                <FiltrosTarefas filtro={filtro} onChange={setFiltro} pessoas={pessoas} etiquetas={etiquetas} usuarioId={1} buscaNoPainel />
                <MenuQuadro podeEditar onArquivados={() => {}} onConfiguracao={() => {}} onFundo={() => {}} onListasDoMes={() => {}} />
              </>
            }
          />
        }
        pilula={
          <PilulaVistas
            valor={vistaDemo}
            onTrocar={setVistaDemo}
            opcoes={[
              { value: "quadro", label: "Quadro", icone: <Icons.IconKanban className="h-4 w-4" /> },
              { value: "lista", label: "Lista", icone: <Icons.IconList className="h-4 w-4" /> },
              { value: "calendario", label: "Calendário", icone: <Icons.IconCalendar className="h-4 w-4" /> },
            ]}
            extra={
              <Button variant="ghost" size="sm" icon={<Icons.IconTrocar className="h-4 w-4" />}>
                Mudar de quadros
              </Button>
            }
          />
        }
      >
        <div className="flex items-start gap-3 p-3">
          <ColunaTarefas lista={{ id: 7, nome: "A fazer", ordem: 1, limiteWip: null, concluida: false, arquivada: false }} qtd={1} onNova={() => {}}>
            {cartoes.slice(0, 1).map((t) => (
              <CartaoTarefa key={t.id} tarefa={{ ...t, capa: "#579dff" }} etiquetas={mEt} pessoas={mPe} hoje="2026-06-01" onAbrir={() => {}} onConcluir={() => {}} onDuplicar={() => {}} />
            ))}
          </ColunaTarefas>
          <NovaLista onCriar={async () => true} />
        </div>
      </MolduraQuadro>
      {/* CHIPS DE ESCOLHA (os grupos do "Mudar de quadros"; as pesquisas sugeridas do seletor de fundo). */}
      <ChipsEscolha ariaLabel="Grupo" valor={chipDemo} onEscolher={setChipDemo} opcoes={["Tudo", "2024", "2025", "Geral"].map((v) => ({ value: v, label: v }))} />
      {/* O SELETOR DE FUNDO (Novo quadro e Configuração): prévia, fotos com pesquisa, degradês em círculos, "Sem fundo" e o
          degradê próprio. */}
      <div className="max-w-md rounded-card border border-border bg-surface p-3">
        <SeletorFundo valor={fundoDemo} onChange={setFundoDemo} />
      </div>
      {/* TEXTO NO LUGAR (o nome do quadro/da lista: um clique edita, Enter grava, Esc desfaz) e os ITENS ARQUIVADOS. */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="w-64">
          <TextoNoLugar valor={textoLugar} onSalvar={async (n) => {
              setTextoLugar(n);
              return true;
            }} ariaLabel="Nome da lista" className="text-[14px] font-semibold text-text" />
        </div>
        <Button size="sm" variant="secondary" onClick={() => setArquivadosDemo(true)}>
          Arquivados
        </Button>
        <ItensArquivados
          aberto={arquivadosDemo}
          tarefas={cartoes.map((t, i) => ({ ...t, arquivada: i === 0 }))}
          listas={[{ id: 1, nome: "Em andamento", ordem: 1, limiteWip: null, concluida: false, arquivada: false }, { id: 9, nome: "Antiga", ordem: 2, limiteWip: null, concluida: false, arquivada: true }]}
          pode={{ manipular: true, configurar: true, excluir: true }}
          onFechar={() => setArquivadosDemo(false)}
          onAbrir={() => {}}
          onExcluirLista={() => {}}
          onMudou={() => {}}
        />
      </div>
      {/* IMAGEM DE FUNDO por link (Configuração do quadro): prévia + trocar/remover — nada é gravado aqui. */}
      <div className="max-w-xl">
        <FundoQuadro quadroId={0} fundoUrl={null} podeEditar onMudou={() => {}} />
      </div>
      {/* IMPORTAR DO TRELLO (a prévia lê o JSON no navegador; aqui nada é gravado sem um quadro de verdade). */}
      <div>
        <Button size="sm" variant="ghost" onClick={() => setTrelloDemo(true)}>
          Importar do Trello
        </Button>
        <ImportarTrello aberto={trelloDemo} quadroId={0} pessoas={pessoas} onFechar={() => setTrelloDemo(false)} onFeito={() => {}} />
      </div>
      {/* CAMPOS PERSONALIZADOS: o cadastro do quadro (+ formato do título), os editores na tarefa e os selos do cartão. */}
      <div className="grid max-w-3xl gap-4 md:grid-cols-2">
        <CamposPersonalizadosQuadro quadroId={1} formatoTitulo="{Categoria} - {Tipo} - {Nº protocolo}" campos={camposDemo} podeEditar ocupado={false} gravar={async () => true} confirmar={async () => false} />
        <div className="space-y-3">
          <CamposDaTarefa campos={camposDemo} valores={valoresDemo} onChange={(id, v) => setValoresDemo((x) => ({ ...x, [id]: v ?? "" }))} />
          <ChipsCamposCartao campos={camposDemo} valores={valoresDemo} />
        </div>
      </div>
      <div className="flex flex-wrap items-start gap-3">
        <ColunaTarefas
          lista={{ id: 1, nome: "Em andamento", ordem: 1, limiteWip: 2, concluida: false, arquivada: false }}
          qtd={3}
          onNova={() => {}}
          onRenomear={async () => true}
          onPegar={() => {}}
        >
          {cartoes.map((t) => (
            <CartaoTarefa key={t.id} tarefa={t} etiquetas={mEt} pessoas={mPe} hoje="2026-06-01" onAbrir={() => {}} onConcluir={() => {}} onDuplicar={() => {}} />
          ))}
        </ColunaTarefas>
        <NovaLista onCriar={async () => true} />
        <div className="max-w-md">
          <SeletorPessoas pessoas={pessoas} selecionadas={sel} onChange={setSel} usuarioId={1} />
        </div>
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <ChecklistTarefa acoes={acoesChecklistRascunho(checkDemo, setCheckDemo)} hoje="2026-06-01" rascunho />
        <div className="space-y-2">
          {blocos.map((b, i) => (
            <MolduraBloco
              key={b.id}
              id={b.id}
              tipo={b.tipo}
              primeiro={i === 0}
              ultimo={i === blocos.length - 1}
              onMover={(d) => setBlocos((l) => moverBloco(l, b.id, i + d))}
              onRemover={() => setBlocos((l) => removerBloco(l, b.id))}
            >
              <p className="text-[12.5px] text-muted">O conteúdo do bloco (nota, link, checklist…).</p>
            </MolduraBloco>
          ))}
          <MenuAdicionarCartao metadados={["datas", "estimativa"]} blocos={blocosDisponiveis(blocos)} onMetadado={() => {}} onBloco={(t) => setBlocos((l) => adicionarBloco(l, t))} />
          <CampoTextoFormatado valor={textoDemo} onChange={setTextoDemo} rotulo="Descrição" vazio="Adicione uma descrição mais detalhada…" />
          <EditorTexto valor={textoDemo} onChange={setTextoDemo} rotulo="Texto formatado" rows={3} />
        </div>
        <div className="h-72 rounded-card border border-border p-3">
          <AtividadeTarefa
            comentarios={[{ id: 1, usuarioId: 2, usuarioNome: "Bruno", texto: "Feito, @Ana — falta só o **DFD 1209**.", mencoes: [1], criadoEm: "2026-06-01 12:00:00", editadoEm: null }]}
            historico={{ linhas: [], erro: null, onDetalhes: () => {} }}
            pessoas={pessoas}
            usuarioId={1}
            podeModerar={false}
            onEnviar={async () => true}
            onEditar={async () => true}
            onExcluir={() => {}}
          />
        </div>
        <div className="space-y-3">
          <VinculosTarefa
            valor={[
              { tipo: "protocolo", id: 1, rotulo: "144756/2026" },
              { tipo: "tarefa", id: 2, rotulo: "#12 Conferir o PCA", detalhe: "Outubro › 05 - OUTUBRO - 2026", quadroId: 1, prazo: "2026-01-02", concluida: false },
            ]}
            onChange={() => {}}
            hoje="2026-01-01"
          />
          <BarraEdicaoMassaTarefas
            listas={[{ id: 1, nome: "A fazer", ordem: 1, limiteWip: null, concluida: false, arquivada: false }]}
            pessoas={pessoas}
            etiquetas={etiquetas}
            equipes={[{ id: 1, nome: "Compras" }]}
            onAplicar={() => {}}
          />
          {/* Chips de alternância na cor (etiquetas e EQUIPES da tarefa — o detalhe da tarefa). */}
          <ChipsAlternar
            itens={[
              { id: 1, nome: "Compras", cor: "#16a34a" },
              { id: 2, nome: "Jurídico", cor: "#7c3aed" },
            ]}
            marcados={[1]}
            onChange={() => {}}
            rotulo="Equipe"
          />
          {/* O CÍRCULO de concluir (no lugar) e as DATAS da tarefa (prazo com hora + lembrete). */}
          <div className="flex items-center gap-3">
            <CirculoConcluir concluida={false} onAlternar={() => {}} rotulo="Aberta" tamanho="md" />
            <CirculoConcluir concluida onAlternar={() => {}} rotulo="Concluída" tamanho="md" />
          </div>
          <DatasTarefa valor={{ inicio: "", prazo: "2026-03-21", prazoHora: "09:21", lembreteMin: 1440 }} hoje="2026-03-20" onChange={() => {}} />
          {/* CRIAR A PARTIR DE TEMPLATE (o ícone no pé da lista) — o diálogo CopiarMoverTarefa abre pelo menu "…" da tarefa. */}
          <div className="flex items-center gap-2 text-[13px] text-muted">
            <SeletorTemplates
              templates={[{ id: 1, titulo: "2. Protocolo - FALTA - ", etiquetas: [1], checklist: { feitos: 0, total: 3 } }]}
              etiquetas={new Map([[1, { id: 1, nome: "Protocolo", cor: "#2563eb" }]])}
              lista="A fazer"
              onEscolher={() => {}}
            />
            Templates do quadro
          </div>
        </div>
      </div>
      <CalendarioTarefas
        eventos={eventosDemo}
        hoje="2026-01-01"
        contadores={{ atrasadas: 1, hoje: 0, naSemana: 0, semPrazo: 1 }}
        onAbrir={() => {}}
        onCriar={() => {}}
        onMover={() => {}}
        onRedimensionar={() => {}}
        onConcluir={() => {}}
        opcoes={opcoesDemo}
        onOpcoes={setOpcoesDemo}
        configuracoes={<AssinaturaCalendario ativa={false} onExportar={() => {}} nEventos={eventosDemo.length} />}
        semPrazo={[{ id: 9, quadroId: 1, ticket: 131, titulo: "Levantar a demanda de papel" }]}
        rascunho={{ data: "2026-01-08", hora: null, horaFim: null, titulo: "" }}
        feriados={ocultosDemo.feriados ? undefined : feriadosDemo}
        lateral={(nav) => (
          <BarraCalendario
            nav={nav}
            hoje="2026-01-01"
            diasComEvento={new Set(["2026-01-02"])}
            grupos={[{ quadro: { id: 1, nome: "Planejamento", cor: "#6366f1" }, tarefas: [{ id: 1, ticket: 128, titulo: "Conferir DFDs", eventos: 2 }] }]}
            pcas={[{ id: 1, nome: "PCA 2026", eventos: 1 }]}
            porTipo={{ periodo: 2, recorrencia: 0, evento: 1, pca: 1, externo: 1 }}
            externos={[{ id: 1, nome: "Feriados do Estado", cor: "#0ea5e9", eventos: 1 }]}
            onGerirExternos={() => {}}
            feriadosNoPeriodo={feriadosDemo.size}
            ocultos={ocultosDemo}
            onOcultos={setOcultosDemo}
            inicioSemana={opcoesDemo.inicioSegunda ? 1 : 0}
          />
        )}
      />
      <div className="grid gap-4 lg:grid-cols-2">
        <div className="rounded-card border border-border p-3">
          <EventoBanner
            evento={eventosDemo.find((e) => e.tipo === "evento") ?? eventosDemo[0]}
            cor="#6366f1"
            quadroNome="Planejamento"
            hoje="2026-01-01"
            avisoPrazo="cai num sábado"
            pessoas={pessoas}
            participantes={pessoas.map((p) => p.id)}
            onVerTarefa={() => {}}
            onEditar={() => {}}
            onDuplicar={() => {}}
            onExcluir={() => {}}
          />
        </div>
        {pcaDemo[0] && (
          <div className="rounded-card border border-border p-3">
            <EventoBanner evento={pcaDemo[0]} cor="var(--info)" hoje="2026-01-01" onAbrirPca={() => {}} />
          </div>
        )}
        <EventosTarefa eventos={[{ id: 1, ...eventoDemo }]} hoje="2026-01-01" onSalvar={async () => true} onExcluir={() => {}} />
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <div className="space-y-3 rounded-card border border-border p-3">
          <BuscaCalendario valor={buscaDemo} onChange={setBuscaDemo} hoje="2026-01-01" corQuadro={() => "#6366f1"} onEscolher={() => {}} />
          <Button variant="secondary" size="sm" onClick={() => setGerirDemo(true)}>
            Outras agendas (GerirAgendasExternas)
          </Button>
          <GerirAgendasExternas
            aberto={gerirDemo}
            onFechar={() => setGerirDemo(false)}
            agendas={[{ id: 1, nome: "Feriados do Estado", url: "https://exemplo.gov.br/feriados.ics", cor: "#0ea5e9", eventos: [], erro: null }]}
            onMudou={() => {}}
          />
        </div>
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <RecorrenciaTarefa valor={rec} onChange={setRec} prazo="2026-06-03" inicio={null} hoje="2026-06-01" />
        <div className="max-w-sm space-y-1 rounded-card border border-border p-2">
          <ItemNotificacao
            n={{ id: 1, tarefaId: 128, quadroId: 3, tipo: "mencionada", titulo: "Bruno mencionou você", texto: "#128 Conferir DFDs do protocolo · Planejamento", link: null, lida: false, travada: true, criadoEm: "2026-06-01 12:00:00", ator: { id: 2, nome: "Bruno Lima", foto: null } }}
            agora={Date.parse("2026-06-01T12:05:00Z")}
            outros={[{ id: 3, tarefaId: 128, quadroId: 3, tipo: "mencionada", titulo: "Bruno mencionou você", texto: null, link: null, lida: false, travada: false, criadoEm: "2026-06-01 11:00:00", ator: null }]}
            onExpandir={() => {}}
            onLida={() => {}}
            onAdiar={() => {}}
            onSilenciar={() => {}}
            onExcluir={() => {}}
            onAbrir={() => {}}
          />
          <ItemNotificacao
            n={{ id: 2, tarefaId: 129, quadroId: 3, tipo: "atrasada", titulo: "Tarefa atrasada (prazo 30/05)", texto: "#129 Atualizar o catálogo · Planejamento", link: null, lida: true, travada: false, criadoEm: "2026-06-01 09:00:00", ator: null }}
            agora={Date.parse("2026-06-01T12:05:00Z")}
            onLida={() => {}}
            onExcluir={() => {}}
            onAbrir={() => {}}
          />
        </div>
        <AutomacoesQuadro
          quadroId={1}
          automacoes={[{ id: 1, gatilho: "entrar_lista", listaId: 2, acao: { tipo: "atribuir", usuarioId: 1 }, ativa: true }]}
          listas={listasDemo}
          etiquetas={etiquetas}
          pessoas={pessoas}
          podeEditar
          ocupado={false}
          gravar={async () => true}
        />
        <ModelosQuadro
          quadroId={1}
          quadroNome="Planejamento do PCA 2027"
          modelosQuadro={[{ id: 1, nome: "Rotina de compras", criadoPor: 1, detalhe: "A fazer · Em andamento · Concluído" }]}
          usuarioId={1}
          podeEditar
          ocupado={false}
          gravar={async () => true}
        />
      </div>
      <DashboardTarefas tarefas={cartoes} listas={listasDemo} pessoas={pessoas} hoje="2026-01-01" responsavel="todos" onResponsavel={() => {}} onAbrir={() => {}} />
    </div>
  );
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
  const [periodoDemo, setPeriodoDemo] = useState<Periodo>(PERIODO_TODO);
  const [selDemo, setSelDemo] = useState<RegistroSelecao[]>([
    { key: 1, rotulo: "DFD 531" },
    { key: 2, rotulo: "DFD 389" },
    { key: 3, rotulo: "DFD 712" },
  ]);
  const [editorDemo, setEditorDemo] = useState<"dfds" | "protocolos" | "itens">("dfds");
  const [dzFile, setDzFile] = useState<string | null>(null);
  const [vincDemo, setVincDemo] = useState<AberturaVinculo | null>(null);
  const [cadDemo, setCadDemo] = useState(false);
  const [pag, setPag] = useState(2);
  useEffect(() => {
    setFramed(new URLSearchParams(window.location.search).get("view") === "frame");
  }, []);

  const vitrine = (
    <>
      <Secao titulo="Fluxos de automação (CanvasFluxo)">
        <CanvasFluxoDemo />
      </Secao>
      <Secao titulo="Tabela de automação no padrão da Mesa (TabelaMesaFluxo)">
        <TabelaMesaFluxo
          itens={[
            { id: 1, numero: "1209", planejamento: "1509", sigla: "SEMED", tipo: "DFD-S", totalItens: 3, valor: 1250.5, protocolo: "144756/2026" },
            { id: 2, numero: "1210", planejamento: "1510", sigla: "SMS", tipo: "DFD-O", totalItens: 1, valor: 300, protocolo: "144757/2026" },
          ]}
          chave={(it) => Number(it.id)}
          genericas={[]}
          gestao={{ pessoas: [], outras: [], situacoes: [], usuarioId: 0 }}
          scrollInterno={false}
        />
      </Secao>
      <Secao titulo="Cartão de automação (CartaoFluxo)">
        <div className="grid gap-3 [grid-template-columns:repeat(auto-fill,minmax(min(100%,16rem),1fr))]">
          <CartaoFluxo titulo="Conferir DFDs × Centi — um título longo que quebra linha" sobretitulo="A cada 2 h" selo={<Badge tone="emerald">Agendado</Badge>} metricas={[{ rotulo: "Nós", valor: "4" }, { rotulo: "Última", valor: "Concluída", cor: "var(--ok)" }, { rotulo: "Erros", valor: "0" }]} onClick={() => undefined} />
          <CartaoFluxo titulo="Em branco" sobretitulo="Do zero" marcado metricas={[{ rotulo: "Nós", valor: "1" }, { rotulo: "Frequência", valor: "Manual" }, { rotulo: "Usa", valor: "—" }]} onClick={() => undefined} />
        </div>
      </Secao>
      <Secao titulo="Ajuda de uma automação (AjudaDoFluxo · ConfigFluxo)">
        <AjudaDoFluxo titulo="Conferir DFDs × Centi" ajuda={{ funciona: "Busca cada DFD na Centi e compara.", executa: "Manual ou agendada, com a extensão pronta.", resultado: "Convergente ou Divergente na Mesa." }} />
        {REGISTRO_NOS.get("gatilho.inicio") && <AjudaNo def={REGISTRO_NOS.get("gatilho.inicio") as NonNullable<ReturnType<typeof REGISTRO_NOS.get>>} />}
      </Secao>
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

      <Secao titulo="Trabalhos em segundo plano (SegundoPlano · ManterVivo · useTrabalhoSegundoPlano · PainelSegundoPlano)">
        <DemoSegundoPlano />
      </Secao>

      <Secao titulo="Versão do sistema (VersaoSistema — fim do menu) · Novidades (CartaoVersao)">
        <div className="space-y-3">
          <div className="w-64 rounded-card border border-border bg-surface p-2">
            <VersaoSistema />
          </div>
          <CartaoVersao v={VERSOES[0]} atual destaque />
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
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <span className="text-[12px] text-faint">size=&quot;sm&quot; (rodapés de tabela; 44px no celular):</span>
          <Button size="sm" icon={<IconUpload className="h-4 w-4" />}>
            Importar protocolo
          </Button>
          <Button size="sm" variant="secondary">
            Compacto
          </Button>
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <span className="text-[12px] text-faint">size=&quot;xs&quot; (ação DENTRO da linha da tabela compacta; 44px no celular):</span>
          <Button size="xs" variant="ghost" aria-label="Vincular a protocolo" icon={<IconLayers className="h-4 w-4" />} />
          <Button size="xs" variant="ghost" aria-label="Excluir" icon={<IconTrash className="h-4 w-4" />} style={{ color: "var(--danger)" }} />
        </div>
      </Secao>

      <Secao titulo="Atualizar — o botão circular padrão (BotaoAtualizar + useGiro) · Exportar (BotaoExportar) · Dados completos da Mesa (BotaoDadosCompletos + DadosCompletos + CelulaTexto)">
        <AtualizarEDadosCompletosDemo />
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
        <div className="mt-4 max-w-md">
          <SelectField label="Seleção (SelectField — o mesmo visual do campo)" defaultValue="" hint="Ex.: a classificação que a unidade de medida indica.">
            <option value="">Nenhuma</option>
            <option value="1">SERVIÇO</option>
            <option value="2">MATERIAL DE CONSUMO</option>
          </SelectField>
        </div>
        <div className="mt-4 grid max-w-3xl gap-3 sm:grid-cols-2">
          {/* A lista aberta de TODO select do sistema é a da `Selecao`: grupos, desabilitada com a dica, busca acima de 12. */}
          <SelectField
            compacto
            label="Visão"
            defaultValue="1"
            acoes={[
              { rotulo: "Editar esta visão", icone: <IconPencil className="h-4 w-4" />, onClick: () => toast.info("Editar esta visão") },
              { rotulo: "Nova visão", icone: <IconPlus className="h-4 w-4" />, onClick: () => toast.info("Nova visão") },
            ]}
          >
            <option value="" data-detalhe="Todos os lançamentos do orçamento do ano">
              Orçamento inteiro
            </option>
            <optgroup label="Visões salvas">
              <option value="1" data-detalhe="2 Funções · 1 Fonte · usada em 1 PCA">
                PCA 27
              </option>
              <option value="2" data-detalhe="Todos os lançamentos" data-aviso="3 valor(es) da visão fora deste orçamento">
                GERAL - SEM FILTRO
              </option>
              <option value="3" disabled title="Sem lançamentos neste orçamento">
                Visão vazia
              </option>
            </optgroup>
          </SelectField>
          <SelectField label="Situação (com a cor)" defaultValue="a">
            <option value="a" data-cor="var(--info)">Em análise</option>
            <option value="b" data-cor="var(--warn)">Devolvido</option>
            <option value="c" data-cor="var(--ok)">Concluído</option>
          </SelectField>
          <SelectField label="Selecao — com busca (mais de 12 opções)" defaultValue="">
            <option value="">Escolha o mês…</option>
            {["Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho", "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"].map((m) => (
              <option key={m} value={m}>
                {m}
              </option>
            ))}
          </SelectField>
          <Selecao className={selectCls} aria-label="Selecao crua (classe selectCls)" defaultValue="b">
            <option value="a">Incorporar</option>
            <option value="b">Substituir</option>
            <option value="c">Excluir</option>
          </Selecao>
          {/* SetaDropdown: a seta de TODO gatilho de dropdown gira suave e aponta para o lado OPOSTO da lista aberta. */}
          <Dropdown
            ariaLabel="SetaDropdown — exemplo"
            triggerClassName="h-[var(--h-control-sm)] gap-2 border border-border bg-surface px-3 text-[13px]"
            trigger={
              <>
                SetaDropdown (abra e feche)
                <SetaDropdown className="h-4 w-4 text-muted" />
              </>
            }
          >
            <p className="p-2 text-[13px] text-muted">A lista abriu embaixo: a seta aponta para cima — toque nela para fechar.</p>
          </Dropdown>
        </div>
        <div className="mt-4">
          <Checkbox label="Manter-me conectado" checked={check} onChange={(e) => setCheck(e.target.checked)} />
        </div>
        <div className="mt-4 flex flex-wrap items-center gap-6">
          <Switch label="Bloqueia importação/protocolação" checked={sw} onChange={setSw} />
          <Switch label="Desligada (desabilitada)" checked={false} onChange={() => {}} disabled />
        </div>
      </Secao>

      <Secao titulo="Acesso — TelaAcesso (/login: Entrar · Criar conta · Esqueci a senha na MESMA tela + VitrineAcesso imersiva no desktop) · MarcaSistema (logo do ADM) · CartaoAuth (login · cadastro · Esqueci a senha) + confirmação por CÓDIGO de 6 dígitos no e-mail (EtapaCodigo · CampoCodigo; captcha SEMPRE — Turnstile ou a VerificacaoRobo própria —, reenvio cronometrado) + SelectField com erro e OpcoesUnidades">
        <DemoAcesso />
      </Secao>

      <Secao titulo="Proteção de dados — CamposProtecao (Configurações → Proteção de dados: seleção/cópia, impressão/captura, ocultar ao sair da janela, marca d'água, papéis e tela pública) · MarcaDagua (quem vê, sobre toda a tela) · ProtecaoDados (aplica os bloqueios nas telas — não ativado aqui)">
        <DemoProtecao />
      </Secao>

      <Secao titulo="Usuários — CampoMatricula (6 números desenhados no fundo) · CampoTelefone (contato institucional = WhatsApp: máscara + ícone + Ajuda compacta) · BotaoWhatsapp (wa.me, ação de linha) · UsuarioDetalhe (banner do usuário: dados com cadeado, validar dados, exigir nova senha, papel/status/excluir)">
        <DemoUsuario />
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

      <Secao titulo="Gráficos do Dashboard do PCA (paleta --serie-*, filtro cruzado e explorador)">
        <GraficosDashboardDemo />
      </Secao>

      <Secao titulo="FiltrosDashboard (menus suspensos por dimensão — opções conectadas com a contagem)">
        <FiltrosDashboardDemo />
      </Secao>

      <Secao titulo="OrigemDados (clique numa linha/fatia/barra → de onde vêm os dados)">
        <div className="max-w-2xl">
          <OrigemDadosDemo />
        </div>
      </Secao>

      <Secao titulo="TabelaCruzada (comparativo do orçamento — duas colunas LIGADAS: linhas × colunas; ordenar no cabeçalho; TODAS as colunas, inclusive Unidade/Sigla/Total, se editam: arrastar com a sombra do destino, alfinete, olho, largura pela borda) + Ajuda (?) + SelectField compacto (as permitidas; as demais desabilitadas com o motivo)">
        <TabelaCruzadaDemo />
      </Secao>
      <Secao titulo="EditorVisaoOrcamento (uma visão do orçamento: nome + dimensões em listas suspensas + prévia do Σ; avisa os PCAs que a usam e os valores que o orçamento atual não traz, com “Remover ausentes”) + VisaoOrcamentoPca (a engrenagem da aba Orçamento do PCA — no OrcamentoPca acima) + SeletorVisaoPca (a visão na barra do PCA × Orçamento; travado sem permissão) + AjudaVisoes (o (?) das visões) + EscopoVinculo (onde salvar um vínculo: esta visão · todas · escolher)">
        <EditorVisaoDemo />
      </Secao>
      <Secao titulo="VinculosDaUnidade (o lápis da linha do PCA × Orçamento: os vínculos que trazem orçamento à unidade — ou, na linha Sem vínculo, as unidades do orçamento a vincular — editados no mesmo editor da aba Vínculos)">
        <VinculosDaUnidadeDemo />
      </Secao>
      <Secao titulo="Edições salvas de tabela — SeletorEdicoes (lápis · edição em uso · estrela da padrão · excluir; quem configura a tela também exclui a pública de outra pessoa) + SalvarEdicao (só para mim ou pública — publicar exige Configurar) + confirmação em card flutuante (useConfirmacao)">
        <EdicoesTabelaDemo />
      </Secao>
      <Secao titulo="Gráficos de governança (HTML por token) — BarraSegmentada · BarrasH · Colunas">
        <GraficosGovernancaDemo />
      </Secao>

      <Secao titulo="DashboardMesa (Dashboard de governança da Mesa — o ícone à esquerda de Protocolos · DFDs · Itens: KPIs, a barra de métricas, UM gráfico com o Dado e a Medida escolhidos e o desempenho por pessoa; o Responsável do topo é o FOCO — a linha da pessoa na visão da equipe)">
        <DashboardMesaDemo />
      </Secao>

      <Secao titulo="BarraMetricas (a barra do Dashboard da Mesa: Período — o PeriodoPicker — · Dado · Medida · Ajuda; no celular, o período + a ajuda numa linha e Dado | Medida na outra)">
        <MetricasMesaDemo />
      </Secao>

      <Secao titulo="DashboardMesaEsqueleto (enquanto um Dashboard carrega — a MESMA grade: `metricas` = a da Mesa; sem, a de Tarefas)">
        <DashboardMesaEsqueleto metricas />
      </Secao>

      <Secao titulo="Avatares (com `presenca`: o ponto verde = online, âmbar = ausente)">
        <div className="flex flex-wrap items-center gap-3">
          {["Jhone Prado", "Maria Silva", "Naty Costa", "Cris Souza", "Thamires Lima"].map((n) => (
            <div key={n} className="flex items-center gap-2">
              <Avatar nome={n} size="lg" presenca={n === "Maria Silva" ? "online" : n === "Naty Costa" ? "ausente" : undefined} />
              <span className="text-[13px] text-text-2">{n}</span>
            </div>
          ))}
        </div>
      </Secao>

      <Secao titulo="PresencaGrupo + CanalGrupo + SeloAoVivo + PilhaFotos (a pilha de fotos ÚNICA — a do cabeçalho e a dos membros do quadro de Tarefas; quem do grupo está online, AO VIVO no cabeçalho: as fotos com o ponto que PULSA, em leque ao passar o mouse, “+N” que desliza e o brilho em quem acabou de entrar; tocar abre “Online agora” — o seu status, Online · Ausente · Visto recentemente e as ações de cada pessoa. O ponto de presença aparece também nas fotos do sistema — PessoaTag, seletores, membros do quadro. Só existe com Configurações → Presença ligada)">
        <CanalGrupoDemo
          valor={{
            usuarioId: PESSOAS_DEMO[0].id,
            grupoId: 1,
            grupoNome: "Planejamento",
            pessoas: PESSOAS_DEMO,
            whatsapp: { 4: "64999990000" },
            invisivel: false,
            chatGrupo: true,
            chatPrivado: true,
            vendo: new Map([["protocolo:12", [{ id: 4, editando: true }]]]),
            atividade: new Map([[4, { tela: "dfd", rotulo: "Mesa", vendo: ["Protocolo 144756/2026"], editando: true }]]),
            aoVivo: true,
            meuStatus: { status: "disponivel", recado: "", ate: null },
            vistos: new Map(),
            estados: new Map([
              [4, { estado: "online", status: "reuniao", recado: "volto às 15h" }],
              [7, { estado: "ausente", status: "disponivel", recado: "" }],
            ]),
          }}
        >
          <div className="flex flex-wrap items-center gap-6">
            <ChatAoVivo config={{ grupo: true, privado: true }}>
              <PresencaGrupo verMesa />
            </ChatAoVivo>
            <SeloAoVivo aoVivo />
            <SeloAoVivo aoVivo={false} />
            <PessoaTag pessoa={PESSOAS_DEMO[1]} />
          </div>
        </CanalGrupoDemo>
      </Secao>

      <Secao titulo="PresencaNoItem + AtividadePessoa (ONDE cada pessoa está: na linha do protocolo/DFD/cartão, as fotos de quem está com o item aberto — lápis âmbar = editando; e a linha “Mesa › Protocolo … · editando” do painel Online agora)">
        <CanalGrupoDemo
          valor={{
            usuarioId: PESSOAS_DEMO[0].id,
            grupoId: 1,
            grupoNome: "Planejamento",
            pessoas: PESSOAS_DEMO,
            whatsapp: {},
            invisivel: false,
            chatGrupo: false,
            chatPrivado: false,
            vendo: new Map([["protocolo:12", [{ id: 4, editando: true }, { id: 7, editando: false }]]]),
            aoVivo: true,
            meuStatus: { status: "disponivel", recado: "", ate: null },
            vistos: new Map(),
            estados: new Map(),
          }}
        >
          <div className="flex flex-wrap items-center gap-6">
            <span className="inline-flex items-center gap-1.5 font-mono text-[12px]">
              144756/2026 <PresencaNoItem alvo="protocolo:12" />
            </span>
            <AtividadePessoa atividade={{ tela: "dfd", rotulo: "Mesa", vendo: ["Protocolo 144756/2026"], editando: true }} />
            <AtividadePessoa atividade={{ tela: "tarefas", rotulo: "Tarefas · Compras · Quadro", vendo: [], editando: false }} />
          </div>
        </CanalGrupoDemo>
      </Secao>

      <Secao titulo="BolhasChat — FotoBolha (o CHAT estilo Messenger: cada conversa aberta vira uma BOLHA flutuante arrastável — encosta na borda, arrastar ao “×” fecha —; tocar abre a janela da conversa ao lado. A foto da pessoa com o ponto ao vivo, o mosaico da conversa em grupo ou o ícone do grupo ativo)">
        <div className="flex flex-wrap items-center gap-4">
          <FotoBolha b={{ rotulo: "Carlão", fotos: [{ nome: PESSOAS_DEMO[1].nome, foto: PESSOAS_DEMO[1].foto }], presenca: "online" }} />
          <FotoBolha b={{ rotulo: "Compras", fotos: PESSOAS_DEMO.slice(1, 4).map((p) => ({ nome: p.nome, foto: p.foto })) }} />
          <FotoBolha b={{ rotulo: "Grupo · Planejamento", fotos: [], grupoAtivo: true }} />
        </div>
      </Secao>

      <Secao titulo="ChatAoVivo — Balao + Digitando (o CHAT AO VIVO do grupo e privado: nada é salvo — os balões, meus à direita na cor do sistema, com a resposta citada, os cartões dos links do sistema, ✓ enviada / ✓✓ lida e “Tentar de novo”; os três pontos do “digitando…”)">
        <div className="max-w-sm space-y-1 rounded-card border border-border bg-surface p-3">
          <Balao
            m={{ id: "demo000001", conversa: "grupo", de: 4, em: Date.now(), texto: "Bom dia! Conferi o **protocolo** /painel/mesa?abrir=protocolo:12", resp: null, minha: false }}
            autor={PESSOAS_DEMO[1]}
            grupo
            seguida={false}
            leram={0}
            privado={false}
            nomeDe={() => "Carlão"}
            onResponder={() => {}}
            onTentar={() => {}}
          />
          <Balao
            m={{ id: "demo000002", conversa: "grupo", de: 1, em: Date.now(), texto: "Valeu @Carlão, vou ajustar.", resp: { id: "demo000001", de: 4, trecho: "Bom dia! Conferi o protocolo" }, minha: true, envio: "enviada" }}
            autor={PESSOAS_DEMO[0]}
            grupo
            seguida={false}
            leram={2}
            privado={false}
            nomeDe={() => "Carlão"}
            onResponder={() => {}}
            onTentar={() => {}}
          />
          <Balao
            m={{ id: "demo000003", conversa: "p7", de: 1, em: Date.now(), texto: "Está aí?", resp: null, minha: true, envio: "nao-entregue", motivo: "Thamires não está com o sistema aberto — a mensagem não foi entregue (nada é guardado)." }}
            autor={PESSOAS_DEMO[0]}
            grupo={false}
            seguida={false}
            leram={0}
            privado
            nomeDe={() => "Thamires"}
            onResponder={() => {}}
            onTentar={() => {}}
          />
          <Digitando />
        </div>
      </Secao>

      <Secao titulo="PessoaTag (FOTO + APELIDO — colunas Responsável e Distribuição da Mesa; nome completo no title)">
        <div className="flex flex-wrap items-center gap-4">
          {PESSOAS_DEMO.map((p) => (
            <PessoaTag key={p.id} pessoa={p} />
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
        <div className="mt-3">
          <p className="mb-1.5 text-xs text-muted">Com rótulo CURTO nos telefones (`curto` — o inteiro segue como nome acessível):</p>
          <Segmented
            value="unidades"
            onChange={() => {}}
            ariaLabel="Exemplo de rótulos curtos"
            options={[
              { value: "catalogo", label: "Catálogo" },
              { value: "lista", label: "Lista de Itens", curto: "Itens" },
              { value: "unidades", label: "Unidades de medida", curto: "Unid. medida" },
              { value: "classificacoes", label: "Classificações", curto: "Classif." },
            ]}
          />
        </div>
      </Secao>

      <Secao titulo="Filtro de cabeçalho & Período (PeriodoPicker — atalhos, ano, meses, intervalo DE/ATÉ e Limpar: o MESMO corpo do filtro de datas das tabelas, sem a ordenação)">
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
          <PeriodoPicker anos={[2027, 2026, 2025]} value={periodoDemo} onChange={setPeriodoDemo} />
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
            <div className="mt-3">
              <SkeletonCartao linhas={2} />
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

      <Secao titulo="FalhaNaTela (a fronteira de erro: resposta cortada · versão nova · erro no servidor · erro na tela — tenta sozinha uma vez, informa os Logs do Worker)">
        <FalhaNaTelaDemo />
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
          A aba <code>/painel/integracoes</code> conecta serviços externos. Status por card (Badge); o monitoramento
          aparece no Armazenamento (MonitoramentoWorker). Segredos são write-only (cifrados no servidor).
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
        <p className="mb-2 text-[12px] text-muted">
          MonitoramentoWorker — o monitoramento do Worker exibido na tela de Armazenamento (hoje × teto do plano, 7 dias,
          erros, CPU e o gráfico por dia com a origem); desligado = aviso com o link para Integrações.
        </p>
        <MonitoramentoWorker
          hojeUtc="2026-09-15"
          monitoramento={{
            disponivel: true,
            metricas: {
              dias: [
                { data: "2026-09-11", requests: 1200, errors: 3, subrequests: 400 },
                { data: "2026-09-12", requests: 1580, errors: 0, subrequests: 520 },
                { data: "2026-09-13", requests: 990, errors: 12, subrequests: 310 },
                { data: "2026-09-14", requests: 1740, errors: 1, subrequests: 600 },
                { data: "2026-09-15", requests: 2010, errors: 4, subrequests: 700 },
              ],
              totalRequests: 7520,
              totalErrors: 20,
              totalSubrequests: 2530,
              erroPct: 0.3,
              cpuP50: 1800,
              cpuP99: 9400,
            },
          }}
        />
        <div className="mt-3">
          <MonitoramentoWorker hojeUtc="2026-09-15" monitoramento={null} />
        </div>
      </Secao>

      <Secao titulo="SaudeDados — a saúde dos dados no Armazenamento (integridade dos totais e dados a tratar; tocar na linha abre a Mesa)">
        <SaudeDados saude={SAUDE_DEMO} verificando={false} onVerificar={() => toast.info("Verificar")} onAbrir={(href) => toast.info(`Abrir ${href}`)} />
        <div className="mt-3">
          <SaudeDados saude={null} erro="Não foi possível verificar os dados agora. Tente de novo." verificando={false} onVerificar={() => toast.info("Tentar de novo")} />
        </div>
      </Secao>

      <Secao titulo="Referência do sistema (aba read-only)">
        <p className="mb-3 text-sm text-muted">
          A aba <code>/painel/configuracoes</code> → &quot;Referência&quot; lista TODAS as lógicas do sistema
          (somente leitura): busca (SearchField) + filtro por domínio (FilterChip) + cards de regra com a
          origem e um &quot;valor vigente&quot; (Badge) quando derivado do código.
        </p>
        <SearchField value="" onChange={() => {}} placeholder="Buscar uma regra ou comportamento…" aria-label="demo" />
        <div className="mt-2 max-w-sm">
          <SearchField compacto value="" onChange={() => {}} placeholder="Buscar… (vários com :) — compacto, p/ barras de ferramentas" aria-label="demo compacto" />
        </div>
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

      <Secao titulo="Papéis — MatrizCapacidades (Telas × Ações; marcar a linha/coluna; &quot;—&quot; = não se aplica) · ResumoPapel · DetalhesPapelEditor · ResumoDetalhesPapel · GruposDaPessoa · AcessoDaPessoa (&quot;Ver acesso&quot;) · Checkbox parcial">
        <PapeisDemo />
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

      <Secao titulo="Responsáveis por DFDs (planilha única: a pessoa com o cargo e a foto do usuário + os vínculos — padrão e temporários separados, nomeação, período)">
        <div className="grid gap-4 lg:grid-cols-2">
          <div className="space-y-3">
            <div className="flex flex-wrap items-center gap-3">
              <CelulaResponsaveis nomes={["Carlos Lima"]} temporario />
              <CelulaResponsaveis nomes={[]} temporario={false} nota="Pelo órgão (PMRV)" />
              <CelulaConferencia msgs={[]} />
              <CelulaConferencia msgs={[{ status: "erro", chave: "resp.semVigente", texto: "Sem responsável vigente.", rotulo: "Sem responsável" }]} />
            </div>
            <Button size="sm" variant="secondary" onClick={() => setVincDemo({ responsavelId: null, alvo: "u1", dados: dadosVazios("padrao") })}>
              Abrir o editor do vínculo
            </Button>
            <Button size="sm" variant="secondary" onClick={() => setCadDemo(true)}>
              Abrir o banner de cadastro
            </Button>
          </div>
          <ListaVinculos
            vinculos={VINCULOS_DEMO}
            irmaos={() => VINCULOS_DEMO}
            hoje="2026-06-15"
            titulo={(v) => ({ texto: v.nome, detalhe: `Matrícula ${v.matricula}`, avatar: { nome: v.nome, foto: null } })}
            vazio={{ padrao: "Nenhum responsável padrão.", temporario: "Sem períodos temporários." }}
            acoes={{
              padrao: (
                <Button size="sm" variant="secondary" onClick={() => toast.info("Adicionar padrão")}>
                  Adicionar padrão
                </Button>
              ),
            }}
            onEditar={() => toast.info("Editar o vínculo")}
            onRemover={() => toast.info("Remover o vínculo")}
          />
        </div>
        <EditorVinculo
          abertura={vincDemo}
          pessoas={VINCULOS_DEMO.map((v) => ({ id: v.responsavelId, nome: v.nome, matricula: v.matricula, cargo: v.cargo, usuarioId: null, foto: null, exoneradoEm: null }))}
          cargos={["Secretária", "Diretor", "Secretário Adjunto"]}
          alvos={[]}
          alvoFixo={{ rotulo: "SMS — Secretaria Municipal de Saúde · PMRV" }}
          ocupado={false}
          onCriarPessoa={async () => 99}
          onSalvar={async () => true}
          onFechar={() => setVincDemo(null)}
        />
        <BannerCadastro
          aberto={cadDemo}
          novo={false}
          titulo="SMS — Secretaria Municipal de Saúde"
          campos={[
            { chave: "codigo", label: "Sigla", mono: true, obrigatorio: true },
            { chave: "nome", label: "Nome", span: true, obrigatorio: true },
          ]}
          inicial={{ codigo: "SMS", nome: "Secretaria Municipal de Saúde" }}
          ocupado={false}
          onSalvar={async () => true}
          onFechar={() => setCadDemo(false)}
          confirmarDescarte={async () => true}
        >
          <SecaoBanner titulo="Outra seção">
            <p className="text-[13px] text-muted">As demais seções do cadastro (responsáveis, estrutura…).</p>
          </SecaoBanner>
        </BannerCadastro>
      </Secao>

      <Secao titulo="Tabela (seleção + filtro no cabeçalho + clique na linha + Exportar .xlsx — as linhas filtradas e as colunas à vista)">
        <DataTable
          columns={COLUNAS}
          rows={PROTOS}
          getKey={(r) => r.id}
          exportar={{ nome: "Protocolos (demonstração)" }}
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

      <Secao titulo="Tabela — sem linhas (mensagem própria) + ações no RODAPÉ (à esquerda do seletor de linhas/paginação)">
        <DataTable
          columns={COLUNAS}
          rows={[]}
          getKey={(r) => r.id}
          selectable
          vazio="Nenhum protocolo nesta visão. Use “Importar protocolo” no rodapé."
          acoesRodape={
            <Button size="sm" icon={<IconUpload className="h-4 w-4" />}>
              Importar protocolo
            </Button>
          }
          resumo={(l) => `${l.length} protocolos`}
        />
      </Secao>

      <Secao titulo="Tabela — densidade (comfortable · default · compact)">
        <p className="mb-3 text-[13px] text-muted">
          A prop <span className="font-mono text-text-2">density</span> ajusta a altura da linha SÓ daquela tabela. A{" "}
          <span className="font-mono text-text-2">compact</span> é a das tabelas de protocolos, DFDs e itens: TODA linha na
          mesma altura (a dos controles, <span className="font-mono text-text-2">--h-control-sm</span> — segue a densidade do
          ADM) e o cabeçalho baixo; ações na linha com <span className="font-mono text-text-2">Button size=&quot;xs&quot;</span>.
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

      <Secao titulo="PlanilhaDfds (planilha de DFDs — análise: erro/atenção separados; fora do envio — Excluído/Descartado — em cinza, com “Restaurar excluídos”; colunas na largura do conteúdo)">
        <PlanilhaDfds
          acaoDescartados={
            <Button size="sm" variant="secondary" icon={<IconUndo className="h-4 w-4" />} onClick={() => toast("Restaurar os excluídos (demo)")}>
              Restaurar excluídos (1)
            </Button>
          }
          linhas={[
            { key: 1, numero: "531", planejamento: "600", sigla: "FMS", auto: true, tipo: "DFD-R", itens: 692, valor: 269705678.89, estado: "regular", situacao: "Novo", assinaturas: ["dropsigner"], validacao: "auto" },
            { key: 2, numero: "389", planejamento: "410", sigla: "FMS", tipo: "DFD-S", itens: 281, valor: 1284902.1, estado: "regular", situacao: "Substitui", assinaturas: ["centi"], validacao: "equipe" },
            { key: 4, numero: "712", planejamento: "798", sigla: "FMS", tipo: "DFD-R", itens: 44, valor: 812340.5, estado: "atencao", situacao: "Novo" },
            { key: 3, numero: "1024", planejamento: "1066", sigla: "FMS", tipo: "DFD-R", itens: 0, valor: 0, estado: "erro", estadoMotivo: "Leitura incompleta da tabela", situacao: "Novo" },
            // Análise em andamento: spinner + o que o sistema está fazendo (feedback real).
            { key: 5, numero: "1100", planejamento: null, sigla: "FMS", tipo: null, itens: null, valor: null, estado: "pendente", processando: "texto", situacao: "Novo" },
            { key: 6, numero: "1101", planejamento: "1190", sigla: "FMS", tipo: "DFD-S", itens: 12, valor: 4200, estado: "pendente", processando: "ocr", situacao: "Novo" },
            { key: 7, numero: "1102", planejamento: null, sigla: "FMS", tipo: null, itens: null, valor: null, estado: "pendente", processando: "fila", situacao: "Novo" },
            // Fora do envio: EXCLUÍDO do protocolo pelo usuário / DESCARTADO (duplicado ou mantido o já cadastrado).
            { key: 9, numero: "1210", planejamento: "1510", sigla: "SMS", tipo: "DFD-S", itens: 8, valor: 15200, estado: "excluido", situacao: "Novo" },
            { key: 10, numero: "389", planejamento: "410", sigla: "FMS", tipo: "DFD-S", itens: 281, valor: 1284902.1, estado: "descartado", situacao: "Substitui" },
          ]}
        />
      </Secao>

      <Secao titulo="PlanilhaDfds ÚNICA (depois de protocolado — uma tabela só; o filtro de Estado separa; colunas PCA e Prioridade da Mesa)">
        <PlanilhaDfds
          unica
          linhas={[
            { key: 1, numero: "531", planejamento: "600", sigla: "FMS", tipo: "DFD-R", itens: 692, valor: 269705678.89, estado: "regular", protocolo: "144756/2026", assinaturas: ["centi"], validacao: "auto", prioridade: "ALTA", pca: { ano: 2027, nome: "PCA 2027" } },
            { key: 4, numero: "712", planejamento: "798", sigla: "FMS", tipo: "DFD-R", itens: 44, valor: 812340.5, estado: "atencao", protocolo: "144756/2026", resumo: resumoEstado([{ status: "atencao", chave: "dfd.referenciaRenovacao", texto: "DFD-R sem referência." }]), prioridade: "MÉDIA", pca: { ano: 2027, nome: "PCA 2027" } },
            { key: 8, numero: "900", planejamento: "950", sigla: "SMS", tipo: null, itens: 3, valor: 900, estado: "pendente", processando: "conferindo", protocolo: null, prioridade: null, pca: null },
          ]}
        />
      </Secao>

      <Secao titulo="PlanilhaDfds semEstado (Dashboard do PCA — só dados, nenhum erro/atenção apontado)">
        <PlanilhaDfds
          semEstado
          linhas={[
            { key: 1, numero: "531", planejamento: "600", sigla: "FMS", tipo: "DFD-R", itens: 692, valor: 269705678.89, estado: "regular", protocolo: "144756/2026" },
            { key: 2, numero: "712", planejamento: "798", sigla: "SMS", tipo: "DFD-S", itens: 44, valor: 812340.5, estado: "regular", protocolo: "130356/2026" },
          ]}
        />
      </Secao>

      <Secao titulo="ItemTable (Consulta de Itens do Dashboard — todas as colunas filtráveis; com origem, a linha abre o banner do item)">
        <ItemTable
          origem
          showUnidade
          onRowClick={(r) => toast(`Abrir o banner do item ${r.sequencial}`)}
          rows={[
            { id: 1, sequencial: 1, idProduto: "1001", nomeProduto: "CANETA ESFEROGRÁFICA AZUL", unidadeMedida: "UN", quantidade: 200, valorReferencia: 1.5, valorTotal: 300, classificacao: "Solução", dataDesejada: "2027-03-01", codigo: "SMS", municipio: "DFD 531", dfdId: 1, dfdNumero: "531", protocoloNumero: "144756/2026", itemNumero: 1 },
            { id: 2, sequencial: 2, idProduto: "2044", nomeProduto: "PAPEL A4 75G", unidadeMedida: "RESMA", quantidade: 80, valorReferencia: 28, valorTotal: 2240, classificacao: "Solução", dataDesejada: null, codigo: "SMS", municipio: "DFD 531", dfdId: 1, dfdNumero: "531", protocoloNumero: "144756/2026", itemNumero: 2 },
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

      <Secao titulo="Barra da Mesa — Dashboard (só ícone) + visões + filtros de HIERARQUIA à direita (o Responsável = SeletorPessoa: a foto da escolhida; a lista com FOTO + APELIDO, busca e teclado); dropdown DENTRO da célula (Situação — SeletorCelula · Responsável — SeletorPessoa) e o SeletorPessoa como campo de formulário">
        <SeletoresDemo />
      </Secao>

      <Secao titulo="Itens CONSOLIDADOS (Mesa → Itens → Consolidada) — CelulaLista · CelulaVariacao · SeloAbc · ComposicaoItem">
        <ConsolidadosDemo />
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

      <Secao titulo="CelulaCopiavel (ícone de copiar na célula — nº do protocolo SEM o ano, Id, DFD, planejamento, código e descrição do item)">
        <CelulaCopiavelDemo />
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
              acoes={
                <Button variant="secondary" icon={<IconTrash className="h-4 w-4" style={{ color: "var(--danger)" }} />} onClick={() => toast("Excluir do protocolo (demo — análise da importação)")}>
                  Excluir do protocolo
                </Button>
              }
            >
              <BarraEdicaoMassa
                reparticoes={[
                  { id: 1, codigo: "SMIR", nome: "Secretaria Municipal de Infraestrutura Rural" },
                  { id: 2, codigo: "SMS", nome: "Secretaria Municipal de Saúde" },
                ]}
                anoPadrao={2027}
                onAplicar={(a) => toast(`Aplicar: ${a.campo}`)}
                // Sobrescrita (reenvio/importação com DFDs já gravados): o campo "Gravado × novo".
                versao={{ alvos: 2, onAplicar: (lado) => toast(lado === "gravado" ? "Manter os gravados (demo)" : "Usar os novos (demo)") }}
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

      <Secao titulo="BotaoAcao (ação dos rodapés/cabeçalhos dos banners — só o ícone, nome na dica; contagem; principal com texto)">
        <div className="flex flex-wrap items-center gap-3">
          <BotaoAcao rotulo="Histórico" icon={<Icons.IconClock className="h-4 w-4" />} onClick={() => toast("Histórico")} />
          <BotaoAcao rotulo="Comparar os duplicados" icon={<Icons.IconCompare className="h-4 w-4" />} contagem={2} onClick={() => toast("Duplicados")} />
          <BotaoAcao rotulo="Tarefas" icon={<Icons.IconKanban className="h-4 w-4" />} contagem="1/3" onClick={() => toast("Tarefas")} />
          <BotaoAcao rotulo="Mensagens" icon={<Icons.IconLayers className="h-4 w-4" />} pressionado onClick={() => toast("Painel aberto")} />
          <BotaoAcao variant="primary" rotulo="Reenviar protocolo" icon={<Icons.IconUpload className="h-4 w-4" />} onClick={() => toast("Reenviar")} />
          <BotaoAcao texto variant="primary" rotulo="Salvar alterações" icon={<Icons.IconSave className="h-4 w-4" />} onClick={() => toast("Salvar")} />
        </div>
      </Secao>

      <Secao titulo="IndicadorPendencias (o botão ÚNICO de erros/atenção — relatório do protocolo, mensagens do DFD)">
        <div className="flex flex-wrap items-center gap-3">
          <IndicadorPendencias erros={2} atencoes={1} alvo="ver o relatório de erro" onClick={() => toast("Relatório")} />
          <IndicadorPendencias erros={0} atencoes={3} alvo="ver o relatório de atenção" onClick={() => toast("Relatório")} />
          <IndicadorPendencias erros={0} atencoes={0} rotulo="Editado" cor="var(--info)" alvo="ver as mensagens" aberto onClick={() => toast("Mensagens")} />
          <IndicadorPendencias erros={0} atencoes={0} alvo="nada a ver" />
        </div>
      </Secao>

      <Secao titulo="DfdRodape (rodapé do banner do DFD — UMA linha: indicador + ações só ícone + principal)">
        <DfdRodape
          estado="atencao"
          mensagens={[
            { chave: "a", status: "atencao", texto: "", ancora: "" },
            { chave: "b", status: "acerto", texto: "", ancora: "" },
          ]}
          mensagensAbertas={false}
          onToggleMensagens={() => toast("Abrir/ocultar mensagens")}
          acoes={
            <>
              <BotaoAcao rotulo="Ver protocolo" icon={<Icons.IconLayers className="h-4 w-4" />} onClick={() => toast("Ver protocolo")} />
              <BotaoAcao variant="primary" rotulo="Sobrescrever DFD" icon={<Icons.IconUpload className="h-4 w-4" />} onClick={() => toast("Sobrescrever")} />
            </>
          }
          principal={<BotaoAcao texto variant="primary" rotulo="Salvar alterações" icon={<Icons.IconSave className="h-4 w-4" />} onClick={() => toast("Salvar alterações")} />}
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
          {/* Banner SÓ do item (visão Itens da Mesa): + Salvar alterações (o X do cabeçalho fecha). */}
          <div className="mt-3 border-t border-border pt-3">
            <RodapePainelItem
              onVerDfd={() => toast("O DFD entra pela direita")}
              onVerProtocolo={() => toast("O DFD e depois o protocolo entram pela direita")}
              principal={<BotaoAcao texto variant="primary" rotulo="Salvar alterações" icon={<Icons.IconSave className="h-4 w-4" />} onClick={() => toast("Salvar alterações")} />}
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

      <Secao titulo="PainelPendencias (o banner ÚNICO de pendências — Protocolo, DFD e Item: tocar leva ao lugar; copiar em Despacho/WhatsApp/Lista; PDF)">
        <div className="max-w-md">
          <PainelPendencias
            escopo="protocolo"
            pendencias={{
              numero: "144756/2026",
              idExterno: "40123",
              interessado: "SEMED",
              assunto: "INCLUSÃO",
              capa: {
                chave: "protocolo.valorCapa",
                status: "erro",
                texto: "Valor da capa (R$ 10,00) diferente da somatória dos DFDs (R$ 60,00) — corrigir a capa.",
                onde: "Capa do processo",
                contexto: "Valor da capa: R$ 10,00 · Somatória dos DFDs: R$ 60,00",
                alvo: { ancora: "capa" },
              },
              dfds: [
                {
                  chave: 1,
                  numero: "1586",
                  planejamento: "1702",
                  tipo: "DFD-R — Renovação",
                  status: "erro",
                  pendencias: [
                    { chave: "dfd.prioridade", status: "erro", texto: "Prioridade da compra/contratação (Seção 6) fora do padrão — trate no bloco Tratamento ou destrave a seção.", onde: "Prioridade da compra/contratação (Seção 6)", contexto: "URGENTÍSSIMA", alvo: { dfd: 1, ancora: "prioridade" } },
                    { chave: "dfd.referenciaRenovacao", status: "atencao", texto: "DFD de renovação (DFD-R) sem referência de contrato, ARP ou licitação.", onde: "Referências da renovação", alvo: { dfd: 1, ancora: "referenciaRenovacao" } },
                  ],
                  resumoItens: [{ chave: "item.valorUnitario", status: "erro", texto: "Falta valor unitário em 1 de 12 itens (Seção 4).", onde: "Itens (Seção 4)", alvo: { dfd: 1, ancora: "itens" } }],
                  itens: [
                    {
                      idx: 2,
                      item: 3,
                      codigo: "5241937264",
                      descricao: "GUINDASTE HIDRÁULICO AUTOPROPELIDO",
                      unidade: "DIAS",
                      quantidade: 20,
                      valorUnitario: null,
                      status: "erro",
                      problemas: [{ chave: "item.valorUnitario", status: "erro", texto: "Sem valor unitário", onde: "Valor unitário", alvo: { dfd: 1, item: 2, ancora: "valorUnitario" } }],
                    },
                  ],
                },
              ],
            }}
            onIrPara={(a) => toast(`Ir para: ${a.ancora}${a.item != null ? ` (item ${a.item + 1})` : ""}`)}
          />
        </div>
      </Secao>

      <Secao titulo="PreviaDocumento (a prévia em HTML dos blocos de um PDF — o MESMO conteúdo do gerador A4, antes de baixar)">
        <div className="max-w-2xl">
          <PreviaDocumento
            blocos={[
              { tipo: "titulo", texto: "Pendências do protocolo 144756/2026" },
              { tipo: "destaques", itens: [{ rotulo: "Erros", valor: "3", cor: "var(--danger)" }, { rotulo: "Atenções", valor: "1", cor: "var(--warn)" }] },
              { tipo: "secao", texto: "DFD 1586 (Planej. 1702) — DFD-R" },
              {
                tipo: "tabela",
                colunas: [{ titulo: "Onde", peso: 2 }, { titulo: "Pendência", peso: 4 }, { titulo: "Conteúdo atual", peso: 3 }],
                linhas: [{ celulas: ["Prioridade (Seção 6)", "Fora do padrão", "URGENTÍSSIMA"], cores: [null, "var(--danger)", "@muted"] }],
              },
            ]}
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

      <Secao titulo="Catálogo — CatalogoCard (o card de um catálogo no MESMO desenho do quadro de Tarefas — CartaoEspaco: capa no degradê da cor + ícone do tipo; Catálogo da Agenda = itens · sem tipo · unidades; Histórico de compra = itens · contratos · valor; menu “…” com as ações do papel) + PastaCatalogoCard (a PASTA de catálogos — o MESMO PastaCartao das pastas de Tarefas; tocar ENTRA na tela da pasta) + CoresPaleta (a cor em círculos)">
        <div className="grid grid-cols-[repeat(auto-fill,minmax(min(100%,15rem),1fr))] gap-3">
          <PastaCatalogoCard pasta={{ id: 1, nome: "Compras 2026", cor: "#579dff", ordem: 1 }} catalogos={CATALOGOS_DEMO} itensAgenda={266} />
          <CatalogoCard catalogo={CATALOGOS_DEMO[0]} agenda={{ itens: 185, semTipo: 4, unidades: 12 }} onAbrir={() => {}} onEditar={() => {}} onAtualizar={() => {}} onExcluir={() => {}} />
          <CatalogoCard catalogo={CATALOGOS_DEMO[1]} onAbrir={() => {}} onEditar={() => {}} />
        </div>
        <div className="mt-4">
          <CoresPaletaDemo />
        </div>
      </Secao>

      <Secao titulo="Histórico de compra × item do DFD — CelulaHistoricoCompra (a coluna “Histórico” da Mesa → Itens: o desvio do valor do item em relação ao VALOR ATUAL do histórico, na cor da régua da variação; a referência na dica) + ProdutoHistoricoDetalhe (o banner do produto no histórico — o MESMO do Catálogo e da comparação no detalhe do item, ComparacaoHistoricoCompra, que o abre com o valor do item em cima)">
        <HistoricoItemDemo />
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

      <Secao titulo="Padronização (Catálogo → Unidades de medida | Classificações) — comparação das unidades dos itens, classificação automática, editores (edição e consulta), ErroCarga (falha de carga + Tentar de novo) e as células da Mesa → Itens">
        <PadronizacaoDemo />
      </Secao>

      <Secao titulo="OrcamentoCard + OrcamentoNovoCard (card 4:5 do orçamento — só informação: dotação atualizada, % empenhado, saldo, abrangência)">
        <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
          <OrcamentoCard
            href="/painel/orcamento"
            orcamento={{
              id: 1,
              nome: "Orçamento 2026",
              ano: 2026,
              totalItens: 1345,
              valorInicial: 1_953_650_000,
              atualizadoEm: "2026-01-15 10:00:00",
              suplementacao: 120_000_000,
              anulacao: 40_000_000,
              empenho: 610_000_000,
              saldo: 1_423_650_000,
              orgaos: 18,
              unidades: 39,
            }}
          />
          <OrcamentoNovoCard onClick={() => {}} />
        </div>
      </Secao>

      <Secao titulo="Tarefas — QuadroCard (com a ESTRELA de favorito — EstrelaFavorito) + QuadroNovoCard (o card “Novo quadro”, na altura dos cards), SeletorFundo (o fundo do quadro como o do Trello: prévia, fotos 16:9 + pesquisa com sugestões, DEGRADÊS em círculos — predefinidos, próprio e “Sem fundo”), CapaQuadro (a capa 16:9 no card do quadro), MolduraQuadro + FaixaQuadro + PilulaVistas + MenuQuadro + MembrosQuadro (o quadro no padrão do Trello: moldura arredondada com a imagem NÍTIDA e ENQUADRÁVEL — ponto focal + zoom —, cartão com CAPA colorida, listas RECOLHÍVEIS e contagem “N de M” com filtro, faixa translúcida no topo com as fotos/filtro/menu “…”, a pílula de vistas flutuante no rodapé), TextoNoLugar (o NOME do quadro e da lista: um clique edita no lugar), ItensArquivados (os cartões e as listas arquivados — restaurar/excluir), MenuLista (o “…” da lista: ordenar, mover/arquivar todos os cartões, copiar/mover/EXCLUIR a lista) + CopiarMoverLista + ExcluirLista (qualquer lista: mover os cartões para outra ou excluir tudo junto), FundoQuadro (a IMAGEM DE FUNDO do quadro por link — enquadrar arrastando + zoom, avisos de proporção/resolução e fotos sugeridas — imagem ou pin do Pinterest, sem enviar arquivo), CamposPeriodo (as listas dos dias do mês), TrocarQuadro (o “Mudar de quadros” do Trello: busca e as MESMAS seções da tela de Tarefas, com as pastas) + SecoesDeQuadros/SecaoQuadros/GradeQuadros (Favoritos · Recentes · “Seus quadros”, minimizáveis, com o QuadroCard; arrastar em Favoritos/Recentes = ARRASTO NEGADO: o card sacode e avisa) + GradePastas/PastaQuadro (as PASTAS de quadros: o desenho de uma pasta na célula do QuadroCard — aba, folhas com as capas e a frente na cor; entreabre no hover; abre NO LUGAR empurrando os cards; ARRASTAR reordena e põe/tira quadros da pasta — no toque, segurar ~400 ms; Alt+←/→) + EditorConjunto/MenuConjunto (criar/editar/excluir a pasta) + ChipsEscolha (chips de escolha que quebram linha), FiltrosTarefas (busca + o painel FILTRAR: pessoas com a foto, status, prazo — até amanhã/7/30 dias —, prioridade e etiquetas, vários valores; chips removíveis), SeletorEtiquetas + ChipEtiqueta (marcar, buscar, criar e editar etiquetas), CamposPersonalizadosQuadro + CamposDaTarefa + ChipsCamposCartao (os CAMPOS personalizados: cadastro com o formato do TÍTULO AUTOMÁTICO, os editores na tarefa e os selos no cartão), ColunaTarefas (visual do Trello: nome editável, ARRASTAR pelo cabeçalho, WIP em âmbar + Adicionar um cartão) + NovaLista (a coluna “+ Adicionar outra lista” no fim do quadro), CartaoTarefa (visual do Trello — etiquetas cheias, prazo e checklist em selo; com o mouse: contorno, círculo, editar e DUPLICAR; prioridade, prazo no semáforo, fotos; alça de arrasto no toque) SeletorPessoas (várias pessoas, com foto), ChecklistTarefa (otimista, em fila; rascunho na tarefa nova), MenuAdicionarCartao (o “+ Adicionar” do detalhe: metadados e blocos) + MolduraBloco (os BLOCOS do corpo — alça e ↑/↓ reordenam), EditorTexto + TextoFormatado + CampoTextoFormatado (texto formatado: negrito, listas, links, @menção — lido formatado, editado no lugar), AtividadeTarefa (comentários e atividade num fluxo, com “Mostrar detalhes”), VinculosTarefa (vários vínculos: tarefa ↔ tarefa nos dois sentidos, protocolo/DFD/PCA/orçamento), ImportarTrello (o JSON do Trello → prévia, membros casados com as pessoas, importação em lotes retomável — botão “Importar do Trello” abaixo), BarraEdicaoMassaTarefas (com Equipe +/−), ChipsAlternar (etiquetas e EQUIPES da tarefa, na cor), CirculoConcluir (conclui/reabre NO LUGAR), DatasTarefa (início, prazo com HORA e LEMBRETE), CopiarMoverTarefa (copiar · mover para outro quadro · criar template) + SeletorTemplates (criar a partir de template no pé da lista), CalendarioTarefas (por EVENTOS: Dia · Semana com grade de horas e linha do agora · Mês com faixas · Agenda; criar no horário — também pelo teclado; arrastar reagenda; a borda muda a duração; feriados; semana na segunda / sem fim de semana; atalhos D/S/M/A/T) + BarraCalendario (mini-mês, tipos + feriados, conjuntos por tarefa — RECOLHÍVEIS: a seção e cada quadro — e o cronograma do PCA, opções) + AssinaturaCalendario (baixar .ics e o link de assinatura) + EventoBanner (o banner do evento — tarefa ou DFD do PCA; os PARTICIPANTES pela tarefa — responsáveis + equipes; duplicar; prazo em dia não útil) + EventosTarefa/EditorEvento (o bloco Eventos da tarefa: vários dias, lembrete, duplicar), RecorrenciaTarefa, ItemNotificacao (o sino), AutomacoesQuadro, ModelosQuadro e DashboardTarefas (KPIs + 6 quadros com a origem dos dados)">
        <TarefasDemo />
      </Secao>

      <Secao titulo="OrcamentoItemDetalhe (detalhe do lançamento do orçamento — só leitura)">
        <div className="max-w-md">
          <OrcamentoItemDetalhe
            item={{
              id: 1,
              orcamentoId: 1,
              orgao: "FUNDO MUNICIPAL DE EDUCAÇÃO DE RIO VERDE",
              unidade: "2 - SECRETARIA MUNICIPAL DE EDUCAÇÃO",
              nomeElemento: "OUTROS SERVIÇOS DE TERCEIROS - PESSOA JURÍDICA",
              codigoElemento: "3.3.90.39.00",
              funcao: "12 - EDUCACAO",
              programa: "6149 - PROGRAMA EDUCAÇÃO DE QUALIDADE - RUMO AO 1° LUGAR",
              acao: "2176 - MANTER AS ATIVIDADES DO ENSINO FUNDAMENTAL",
              ficha: "0640",
              fonte: "100 - RECURSOS ORDINÁRIOS",
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

      <Secao titulo="OrcamentoVinculos + EditorVinculoOrcamento (vínculos CRIADOS: a unidade do CUBO → uma ou mais unidades cadastradas, cada uma com as suas ações)">
        <OrcamentoVinculos
          podeEditar
          onCriar={async () => true}
          onEditar={async () => true}
          onExcluir={async () => true}
          alvos={{
            orgaos: [{ id: 1, sigla: "PMRV", nome: "Prefeitura Municipal de Rio Verde" }],
            unidades: [
              { id: 15, sigla: "SME", nome: "Secretaria Municipal de Educação", orgaoId: 1 },
              { id: 16, sigla: "SMS", nome: "Secretaria Municipal de Saúde", orgaoId: 1 },
              { id: 17, sigla: "VISA", nome: "Vigilância Sanitária", orgaoId: 1 },
            ],
          }}
          unidades={[
            {
              chave: "2 - SMS",
              texto: "2 - SECRETARIA MUNICIPAL DE SAÚDE",
              contexto: "FUNDO MUNICIPAL DE SAUDE",
              lancamentos: 60,
              valorInicial: 40000000,
              acoes: [
                { chave: "2001 ATENCAO BASICA", texto: "2001 ATENÇÃO BÁSICA", lancamentos: 40, valorInicial: 30000000 },
                { chave: "2002 VIGILANCIA", texto: "2002 VIGILÂNCIA", lancamentos: 20, valorInicial: 10000000 },
              ],
            },
            {
              chave: "2 - SME",
              texto: "2 - SECRETARIA MUNICIPAL DE EDUCAÇÃO",
              contexto: "FUNDO MUNICIPAL DE EDUCACAO DE RIO VERDE",
              lancamentos: 48,
              valorInicial: 25000000,
              acoes: [{ chave: "2010 ENSINO", texto: "2010 ENSINO", lancamentos: 48, valorInicial: 25000000 }],
            },
          ]}
          vinculos={[
            { id: 1, chave: "2 - SMS", texto: "2 - SECRETARIA MUNICIPAL DE SAÚDE", alvoId: 16, acoes: null, acoesFora: [], visaoId: null },
            { id: 2, chave: "2 - SMS", texto: "2 - SECRETARIA MUNICIPAL DE SAÚDE", alvoId: 17, acoes: ["2002 VIGILANCIA"], acoesFora: [], visaoId: null },
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
          {/* Banner de UM ITEM (Mesa e consulta pública): "Item N" + o DFD de origem com tipo e planejamento. */}
          <div className="mt-2">
            <ItemCabecalho item={3} numero={DFD_DEMO.numero} tipo={DFD_DEMO.tipo} planejamento={DFD_DEMO.planejamento} />
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

      <Secao titulo="IntegracaoTrello (Integrações → Trello: chave, token e segredo write-only, testar conexão; com a conta confirmada, MembrosTrello liga as pessoas aos membros)">
        <IntegracaoTrelloDemo />
      </Secao>
      <Secao titulo="IntegracaoResend (Integrações → E-mail/Resend: chave write-only, remetente do domínio verificado, endereço do sistema; testar confere o domínio e envia um e-mail de teste)">
        <IntegracaoResendDemo />
      </Secao>
      <Secao titulo="GravadorReceitas (Automação → Gravador: a ESTRUTURA dos pedidos que a tela da Centi fez — método, caminho, parâmetros e os campos com o tipo, nunca valores; Copiar a gravação)">
        <GravadorReceitasDemo />
      </Secao>
      <Secao titulo="AprendizTelaProtocolo (Automação → Ler a Tela Protocolo: as consultas aprendidas clicando — a aba de cada uma, o mapa das colunas, a prévia e se a emissão do PDF foi aprendida; Salvar grava o modelo para todos)">
        <AprendizTelaProtocoloDemo />
      </Secao>
      <Secao titulo="IntegracaoGoogle (Integrações → Login com Google: Client ID, Client secret write-only e a URI de redirecionamento a cadastrar no Google; e-mail novo vira cadastro pendente)">
        <IntegracaoGoogleDemo />
      </Secao>

      <Secao titulo="Estado da ligação com o Trello (seloTrello — a seção Trello da Configuração do quadro, SincronizacaoTrello, é um contêiner com dados)">
        <div className="flex flex-wrap gap-2">
          {[
            null,
            { estado: "vinculando", boardUrl: null, sincronizadoEm: null, ultimoErro: null, pendentes: 0, erros: 0 },
            { estado: "ativo", boardUrl: null, sincronizadoEm: null, ultimoErro: null, pendentes: 3, erros: 0 },
            { estado: "ativo", boardUrl: null, sincronizadoEm: null, ultimoErro: null, pendentes: 0, erros: 1 },
            { estado: "ativo", boardUrl: null, sincronizadoEm: null, ultimoErro: null, pendentes: 0, erros: 0 },
          ].map((l, i) => {
            const [tom, rotulo] = seloTrello(l);
            return (
              <Badge key={i} tone={tom} dot>
                {rotulo}
              </Badge>
            );
          })}
        </div>
      </Secao>

      <Secao titulo="IndicadorTrello (a faixa do quadro ligado: o ícone + o ponto do estado; tocar leva à seção Trello)">
        <div className="flex flex-wrap gap-2">
          {[
            { estado: "ativo", boardUrl: null, sincronizadoEm: null, ultimoErro: null, pendentes: 0, erros: 0 },
            { estado: "ativo", boardUrl: null, sincronizadoEm: null, ultimoErro: null, pendentes: 2, erros: 0 },
            { estado: "erro", boardUrl: null, sincronizadoEm: null, ultimoErro: "Falhou", pendentes: 0, erros: 1 },
            { estado: "pausado", boardUrl: null, sincronizadoEm: null, ultimoErro: null, pendentes: 0, erros: 0 },
          ].map((l, i) => (
            <IndicadorTrello key={i} ligacao={l} onAbrir={() => toast.info(seloTrello(l)[1])} />
          ))}
        </div>
      </Secao>
    </>
  );

  // Modo "frame": só a vitrine (usado dentro do iframe de preview mobile).
  if (framed) {
    return (
      <div className="min-h-dvh bg-bg text-text">
        <div className="mx-auto max-w-6xl p-[var(--pad-canvas)]">{vitrine}</div>
      </div>
    );
  }

  const larguraDevice = device === "mobile" ? 390 : 768;

  return (
    <div className="min-h-dvh bg-bg text-text">
      <div className="mx-auto max-w-6xl p-[var(--pad-canvas)]">
        <header className="mb-4">
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

/** Demonstração do cartão do login com Google (segredo já definido). */
function IntegracaoGoogleDemo() {
  const [v, setV] = useState<ValorGoogle>({ ativo: true, clientId: "123456789-abc.apps.googleusercontent.com", clientSecret: "" });
  return <IntegracaoGoogle valor={v} onChange={setV} view={{ ativo: true, clientId: v.clientId, clientSecretDefinido: true }} onTestar={() => {}} testando={false} />;
}

/** Demonstração do cartão do Resend (domínio já verificado). */
function GravadorReceitasDemo() {
  const [aberto, setAberto] = useState(false);
  return (
    <>
      <Button size="sm" variant="secondary" onClick={() => setAberto(true)}>
        Ver uma gravação
      </Button>
      {aberto && (
        <GravadorReceitas
          onFechar={() => setAberto(false)}
          passos={[
            { metodo: "POST", caminho: "restauth/load", entidade: "102908", parametros: ["entity", "key"], corpo: null },
            { metodo: "POST", caminho: "restauth/operation", entidade: null, parametros: [], corpo: { ModuleKey: "número", Guid: "texto", Params: [{ Key: "texto", Value: "texto" }] } },
          ]}
        />
      )}
    </>
  );
}

function AprendizTelaProtocoloDemo() {
  const [aberto, setAberto] = useState(false);
  const linha = (id: number, aba: string) => ({ Id: String(id), Processo: `${156800 + id}/2026`, Data: "01/10/2026", DepartamentoOrigem: "SEPLAN", DepartamentoDestino: aba });
  const consulta = (situacao: string, n: number) => ({
    tipo: "consulta" as const,
    metodo: "POST",
    caminho: "restauth/list?entity=102908",
    corpo: { Situacao: situacao, Take: 100, Skip: 0 },
    resposta: { lista: ["Entities"], total: n, linhas: Array.from({ length: n }, (_, i) => linha(i + 1, "PLANEJAMENTO")) },
  });
  return (
    <>
      <Button size="sm" variant="secondary" onClick={() => setAberto(true)}>
        Ver o que foi aprendido
      </Button>
      {aberto && (
        <AprendizTelaProtocolo
          onFechar={() => setAberto(false)}
          onSalvar={() => setAberto(false)}
          pedidos={[
            consulta("ARECEBER", 3),
            consulta("EMANALISE", 2),
            { tipo: "operacao", metodo: "POST", caminho: "restauth/operation", corpo: { ModuleKey: 9001, Guid: "24e3e9d0-0000-4000-8000-000000000001", Params: [{ Key: "IdProtocolo", Value: "2" }] } },
          ]}
        />
      )}
    </>
  );
}

function IntegracaoResendDemo() {
  const [v, setV] = useState<ValorResend>({ ativo: true, apiKey: "", remetente: "Plataforma PCA <avisos@governarv.com.br>", urlSistema: "https://governarv.com.br" });
  return (
    <IntegracaoResend
      valor={v}
      onChange={setV}
      view={{ ativo: true, apiKeyDefinida: true, remetente: v.remetente, urlSistema: v.urlSistema, dominio: "governarv.com.br", verificado: true }}
      onTestar={() => {}}
      testando={false}
    />
  );
}

/** Demonstração do cartão do Trello (sem conta confirmada — as ligações de membros aparecem só no sistema). */
function IntegracaoTrelloDemo() {
  const [v, setV] = useState<ValorTrello>({ ativo: true, apiKey: "", token: "", segredo: "" });
  return (
    <IntegracaoTrello
      valor={v}
      onChange={setV}
      view={{ ativo: true, apiKey: "", tokenDefinido: false, segredoDefinido: false, conta: null }}
      onTestar={() => {}}
      testando={false}
    />
  );
}

/** O painel minimizado no canto inferior direito (ligue para ver; tocar expande). */
function DemoSegundoPlano() {
  const [ligado, setLigado] = useState(false);
  return (
    <div className="space-y-2">
      <Switch checked={ligado} onChange={setLigado} label="Mostrar o painel de exemplo" />
      {ligado && (
        <PainelSegundoPlano
          naTela={new Set()}
          onDispensar={() => setLigado(false)}
          trabalhos={[
            { id: "a", chave: "demo", titulo: "Conferir DFDs × Centi", estado: "rodando", feito: 3, total: 8, texto: "Conferir 1 DFD × Centi: 42 de 300", rota: "/design-system" },
            { id: "b", chave: "demo", titulo: "Execução dos DFDs na CM002", estado: "concluido", feito: 6, total: 6, rota: "/design-system" },
          ]}
        />
      )}
    </div>
  );
}

const VINCULOS_DEMO: VinculoComPessoa[] = [
  { id: 1, responsavelId: 1, nome: "Ana Souza", matricula: "123456", cargo: "Secretária", orgaoId: null, reparticaoId: 1, tipo: "padrao", funcao: "", atoTipo: "portaria", atoNumero: "10/2025", atoLink: "https://exemplo.gov.br/portaria-10", inicio: "2025-01-01", fim: null, ordem: 0 },
  { id: 2, responsavelId: 2, nome: "Carlos Lima", matricula: "678901", cargo: "Diretor", orgaoId: null, reparticaoId: 1, tipo: "temporario", funcao: "Secretário Adjunto", atoTipo: "decreto", atoNumero: "5/2026", atoLink: "", inicio: "2026-06-01", fim: "2026-06-30", ordem: 1 },
];
