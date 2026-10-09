"use client";

import { type ReactNode, useMemo, useState } from "react";
import { alternarOculta, comLargura, comOrdem, ordemDasColunas } from "@/lib/colunas-layout";
import { exportarCruzamentoXlsx } from "@/lib/exportar-orcamento";
import { nomeArquivoPdf } from "@/lib/exportar-pdf-core";
import { brl, dataIsoBrasilia, num } from "@/lib/format";
import type { EdicaoTabela } from "@/lib/edicoes-tabela-core";
import type { OrcamentoItemRow } from "@/lib/orcamento";
import {
  COL_EXTRA,
  COL_ROTULO,
  COL_TOTAL,
  type Cruzamento,
  colunasNaOrdem,
  chaveLayoutComparativo,
  coerceLayout,
  colunaPermitida,
  cruzar,
  LAYOUT_PADRAO,
  type LayoutCruzamento,
  lancamentosDoRecorte,
  layoutIgual,
  MEDIDAS_ORCAMENTO,
  type MedidaOrcamento,
  type ModoCruzamento,
  matrizCruzamento,
  medidaOrcamento,
  type OrdemCruzamento,
  ordenarLinhas,
  percentual,
  permissoesColunas,
  permissoesLinhas,
  semVazios,
} from "@/lib/orcamento-cruzamento";
import { type AlvosVinculo, alvosDaUnidade, comVinculos, type DimensoesCadastro, mapaVinculos, type VinculoOrcamento, vinculosDaVisao } from "@/lib/orcamento-vinculo";
import { aplicarVisao, atributosVisao, DIMENSOES_ORCAMENTO, type DimensaoOrcamento, type VisaoOrcamento, valorDimensao } from "@/lib/orcamento-visao";
import { predicadoBusca } from "@/lib/tabela-filtros";
import { FerramentasAba } from "./AbasEspaco";
import { Ajuda, TopicoAjuda } from "./Ajuda";
import { Button } from "./Button";
import { type Column, DataTable } from "./DataTable";
import { useQuemExporta } from "./ConfigTabelas";
import { useEditorEdicoes } from "./EdicoesTabela";
import { BotaoExportar, type FormatoExportacao, usePodeExportar } from "./ExportarTabelas";
import { Checkbox, SearchField, SelectField } from "./Field";
import { IconDownload, IconPencil, IconSave, IconTrocar } from "./icons";
import { OrigemDados } from "./OrigemDados";
import { Segmented } from "./Segmented";
import { TabelaCruzada } from "./TabelaCruzada";
import { toast } from "./Toast";

const rotuloDim = (d: DimensaoOrcamento) => DIMENSOES_ORCAMENTO.find((x) => x.key === d)?.rotulo ?? d;

const MODOS: { value: ModoCruzamento; label: string }[] = [
  { value: "valor", label: "R$" },
  { value: "pct", label: "%" },
];
/**
 * Aba COMPARATIVO da tela do orçamento — a TABELA CRUZADA (horizontal, como a planilha da Prefeitura): o usuário LIGA
 * duas colunas do CUBO (uma nas LINHAS, outra nas COLUNAS — ex.: Unidade × Elemento de despesa) e compara os valores da
 * MEDIDA escolhida. Ao escolher as linhas, o seletor das colunas APONTA as permitidas (as demais aparecem desabilitadas
 * com o motivo — `permissoesColunas`). Tocar num cabeçalho ordena as linhas só na VISTA. **"Editar"** transforma a PRÓPRIA
 * planilha no editor do layout, DIRETO na coluna — TODAS, inclusive o nome das linhas, a Sigla e o Total: arrastar o nome
 * move (com a sombra do destino; soltar entre as congeladas congela), o alfinete congela, o olho oculta, a borda ajusta a
 * largura. No RODAPÉ da tabela ficam o LÁPIS (liga a edição), as EDIÇÕES SALVAS do par de colunas (as minhas e as
 * públicas — `useEdicoesTabela`/`SeletorEdicoes`), a estrela da minha PADRÃO e, editando, mapa de calor, ocultar zerados,
 * congelar/descongelar/mostrar todas, Padrão, Cancelar e **Salvar** (`SalvarEdicao`: nome, só para mim ou pública,
 * atualizar ou nova, usar como padrão). Confirmações e avisos em card flutuante; a explicação de tudo na AJUDA (?).
 */
export function OrcamentoComparativo({
  titulo,
  itens,
  visoes,
  vinculos,
  alvos,
  edicoes,
  padroes,
  visaoInicial = null,
  inicio,
  fim,
  onMudarEdicoes,
  podeExportar = true,
  podePublicar = false,
}: {
  titulo: string;
  /** Os lançamentos com a Unidade/Órgão do CADASTRO (`comVinculos`). */
  itens: (OrcamentoItemRow & DimensoesCadastro)[];
  visoes: VisaoOrcamento[];
  vinculos: VinculoOrcamento[];
  alvos: AlvosVinculo;
  /** As edições salvas que o usuário vê (as dele e as públicas) de todos os pares de colunas. */
  edicoes: EdicaoTabela[];
  /** As preferências de edição PADRÃO do usuário (`padrao:<chave>`). */
  padroes: Record<string, unknown>;
  /** A visão com que abre (ex.: a do PCA) — trocável; inexistente ⇒ todos os lançamentos. */
  visaoInicial?: number | null;
  /** Controles do HOST no início da linha dos seletores (ex.: a troca de visão da aba Orçamento do PCA). */
  inicio?: ReactNode;
  /** Controles do HOST no FIM da linha, à direita (ex.: a engrenagem da visão do orçamento do PCA). */
  fim?: ReactNode;
  /** Quem guarda as edições FORA (a tabela remonta ao trocar de vista e volta com as edições novas). */
  onMudarEdicoes?: (lista: EdicaoTabela[], padroes: Record<string, unknown>) => void;
  /** O papel exporta nesta tela (o XLSX da tabela cruzada). */
  podeExportar?: boolean;
  /** O papel CONFIGURA a tela (Orçamento ou PCA): publica edições do layout para todos e modera as públicas. */
  podePublicar?: boolean;
}) {
  const [dimLinha, setDimLinha] = useState<DimensaoOrcamento>("unidade");
  const [dimColuna, setDimColuna] = useState<DimensaoOrcamento>("nomeElemento");
  const [medida, setMedida] = useState<MedidaOrcamento>("inicial");
  const [visaoId, setVisaoId] = useState<number | null>(visaoInicial);
  // A visão do HOST mudou (ex.: a engrenagem do PCA trocou a visão) — a tabela acompanha.
  const [visaoHost, setVisaoHost] = useState(visaoInicial);
  if (visaoHost !== visaoInicial) {
    setVisaoHost(visaoInicial);
    setVisaoId(visaoInicial);
  }
  const [modo, setModo] = useState<ModoCruzamento>("valor");
  const [busca, setBusca] = useState("");
  const [aberto, setAberto] = useState<{ linha: string | null; coluna: string | null } | null>(null);
  const [ordemVista, setOrdemVista] = useState<OrdemCruzamento | null>(null); // ordenação só da vista (fora da edição)

  const visao = visoes.find((v) => v.id === visaoId) ?? null;
  // Os vínculos que VALEM na visão (os próprios dela; nas demais unidades, o padrão) — a Unidade/Órgão do cadastro e a
  // Sigla seguem a visão. Os itens chegam com o padrão: só refaz quando a visão tem vínculos próprios.
  const efetivos = useMemo(() => vinculosDaVisao(vinculos, visao), [vinculos, visao]);
  const base = useMemo(() => {
    const comVisao = visao?.proprias.length ? comVinculos(itens, efetivos, alvos) : itens;
    return visao ? aplicarVisao(comVisao, visao.filtros) : comVisao;
  }, [itens, visao, efetivos, alvos]);

  // As duas colunas LIGADAS: a das linhas (com dados) e a das colunas (a permitida — senão a 1ª permitida).
  const permLinhas = useMemo(() => permissoesLinhas(base), [base]);
  const linha = permLinhas[dimLinha].permitida ? dimLinha : (DIMENSOES_ORCAMENTO.find((d) => permLinhas[d.key].permitida)?.key ?? dimLinha);
  const permColunas = useMemo(() => permissoesColunas(base, linha), [base, linha]);
  const coluna = colunaPermitida(permColunas, dimColuna);
  const podeTrocar = useMemo(() => coluna != null && permissoesColunas(base, coluna)[linha].permitida, [base, coluna, linha]);

  // O LAYOUT do par ligado: o rascunho enquanto edita; senão o da EDIÇÃO em uso (a padrão do usuário ao abrir) ou o padrão
  // do sistema.
  const chave = coluna ? chaveLayoutComparativo(linha, coluna) : "";
  const editor = useEditorEdicoes<LayoutCruzamento>({
    chave,
    edicoes,
    padroes,
    coerce: coerceLayout,
    igual: layoutIgual,
    padrao: LAYOUT_PADRAO,
    onMudar: onMudarEdicoes,
    podePublicar,
    aoEscolher: () => setOrdemVista(null),
  });
  const { layout, editando, mudar } = editor;
  const ordem = editando ? layout.ordemLinhas : (ordemVista ?? layout.ordemLinhas);

  // O cruzamento (sem zerados, se pedido) — a tabela ordena/oculta as colunas pelo layout.
  const cruzBase = useMemo(() => {
    if (!coluna) return null;
    const c = cruzar(base, linha, coluna, medida);
    return layout.zerados ? semVazios(c) : c;
  }, [base, linha, coluna, medida, layout.zerados]);

  // A sigla do CADASTRO (Vínculos) ao lado da Unidade do CUBO — a chave do vínculo é a MESMA do agrupamento.
  const siglaDe = useMemo(() => {
    if (linha !== "unidade") return null;
    const mapa = mapaVinculos(efetivos);
    const porId = new Map(alvos.unidades.map((a) => [a.id, a.sigla]));
    // Uma unidade do CUBO pode ter VÁRIOS vínculos: as siglas de todos.
    return (k: string) =>
      alvosDaUnidade(mapa, k)
        .map((id) => porId.get(id) ?? "")
        .filter(Boolean)
        .join(" / ");
  }, [linha, efetivos, alvos]);

  const casa = useMemo(() => predicadoBusca(busca), [busca]);
  const linhasDe = (c: Cruzamento) => {
    const ordenadas = ordenarLinhas(c, ordem, siglaDe ?? undefined).map((l) => ({ ...l, extra: siglaDe?.(l.chave) }));
    return casa ? ordenadas.filter((l) => casa([l.rotulo, l.extra ?? ""])) : ordenadas;
  };
  // biome-ignore lint/correctness/useExhaustiveDependencies: linhasDe lê ordem/siglaDe/casa (as dependências listadas).
  const linhas = useMemo(() => (cruzBase ? linhasDe(cruzBase) : []), [cruzBase, ordem, siglaDe, casa]);

  // Trocar uma das colunas ligadas fecha o detalhe e volta à ordem salva (o layout segue o PAR).
  const reiniciarVista = () => {
    setAberto(null);
    setOrdemVista(null);
  };
  const escolherLinha = (d: DimensaoOrcamento) => {
    setDimLinha(d);
    reiniciarVista();
  };
  const escolherColuna = (d: DimensaoOrcamento) => {
    setDimColuna(d);
    reiniciarVista();
  };
  const trocarEixos = () => {
    if (!coluna) return;
    setDimLinha(coluna);
    setDimColuna(linha);
    reiniciarVista();
  };
  // Ordenar: na edição vai ao rascunho (salvo com o layout); fora dela, só a vista. 1º toque: textos crescente, valores
  // do MAIOR para o menor; o 2º inverte.
  const ordenar = (por: OrdemCruzamento["por"]) => {
    const o = ordem;
    const mesma = typeof por === "object" ? typeof o.por === "object" && o.por.coluna === por.coluna : o.por === por;
    const nova = { por, desc: mesma ? !o.desc : por !== "rotulo" && por !== "extra" };
    if (editando) mudar((l) => ({ ...l, ordemLinhas: nova }));
    else setOrdemVista(nova);
  };

  // TODAS as colunas da tabela (as estruturais + as de valores) na ordem PADRÃO e na ordem do LAYOUT; as VISÍVEIS de
  // valores formam o que se exporta e o resumo.
  const padrao = useMemo(
    () => [COL_ROTULO, ...(siglaDe ? [COL_EXTRA] : []), COL_TOTAL, ...(cruzBase?.colunas ?? []).map((c) => c.chave)],
    [siglaDe, cruzBase],
  );
  const cruz = useMemo(() => {
    if (!cruzBase) return null;
    const o = ordemDasColunas(padrao, layout.fixadas, layout.ordemManual);
    return colunasNaOrdem(cruzBase, [...o.fixadas, ...o.livres].filter((k) => !layout.ocultas.includes(k)));
  }, [cruzBase, padrao, layout.fixadas, layout.ordemManual, layout.ocultas]);

  // EDIÇÃO da planilha (direto na coluna): largura, ocultar e a ORDEM (arrastar/congelar). As colunas fora da vista
  // (ex.: zeradas ocultas) mantêm o que tinham.
  const edicao = {
    onLargura: (k: string, px: number | null) => mudar((l) => comLargura(l, k, px)),
    onOcultar: (k: string) => mudar((l) => alternarOculta(l, k)),
    onOrdem: (fixadas: string[], livres: string[]) => mudar((l) => comOrdem(l, padrao, fixadas, livres)),
  };

  function editar() {
    editor.editar(layout);
    setOrdemVista(null);
    setAberto(null);
  }

  const m = medidaOrcamento(medida);
  const comSigla = siglaDe != null && !layout.ocultas.includes(COL_EXTRA);
  // EXPORTAR (rodapé): a matriz À VISTA (linhas da busca, na ordem; colunas visíveis) em .xlsx ou .pdf — no PDF as
  // colunas de valores vão em faixas com o nome da linha, a sigla e o total repetidos.
  const exportarNaTela = usePodeExportar();
  const quemExporta = useQuemExporta();
  const podeBaixar = podeExportar && exportarNaTela;
  const [exportando, setExportando] = useState<FormatoExportacao | null>(null);
  const exportar = async (formato: FormatoExportacao) => {
    if (!cruz || !coluna || exportando) return;
    const extra = comSigla && siglaDe ? { rotulo: "Sigla", de: siglaDe } : undefined;
    const nome = `${titulo} - ${rotuloDim(linha)} x ${rotuloDim(coluna)}`;
    const matriz = matrizCruzamento(cruz, linhasDe(cruz), rotuloDim(linha), extra);
    setExportando(formato);
    try {
      if (formato === "xlsx") exportarCruzamentoXlsx(nome, matriz, extra != null);
      else {
        const { baixarTabelaPdf } = await import("@/lib/exportar-pdf");
        const [cab, ...corpo] = matriz;
        const numeros = extra ? 2 : 1;
        await baixarTabelaPdf(nomeArquivoPdf(nome, dataIsoBrasilia(new Date().toISOString())), {
          titulo: nome,
          subtitulo: `${m.rotulo} (R$) · ${num(linhas.length)} ${linhas.length === 1 ? "linha" : "linhas"} × ${num(nVisiveis)} ${nVisiveis === 1 ? "coluna" : "colunas"}`,
          cabecalho: cab.map(String),
          linhas: corpo.map((l) => l.map((v) => (typeof v === "number" ? brl(v) : v))),
          alinhar: cab.map((_, j) => (j < numeros ? "left" : "right")),
          // A linha TOTAL em destaque (como na tabela); negativos em vermelho.
          destaques: [corpo.length - 1],
          cores: corpo.map((l) => l.map((v) => (typeof v === "number" && v < 0 ? "var(--danger)" : null))),
        }, { fixas: numeros + 1, usuario: quemExporta });
      }
    } catch {
      toast.error("Não foi possível exportar — tente de novo.");
    } finally {
      setExportando(null);
    }
  };

  // ORIGEM do número clicado: os lançamentos do recorte (a MESMA chave do cruzamento — a soma bate).
  const recorte = useMemo(
    () => (aberto && coluna ? lancamentosDoRecorte(base, linha, coluna, aberto.linha, aberto.coluna) : []),
    [aberto, base, linha, coluna],
  );
  const somaRecorte = recorte.reduce((s, l) => s + m.valor(l), 0);
  const pctDoTotal = percentual(somaRecorte, cruz?.total ?? 0);
  const rotuloRecorte = aberto
    ? [
        aberto.linha != null ? cruzBase?.linhas.find((l) => l.chave === aberto.linha)?.rotulo : null,
        aberto.coluna != null ? cruzBase?.colunas.find((c) => c.chave === aberto.coluna)?.rotulo : null,
      ]
        .filter(Boolean)
        .join(" × ") || "Total geral"
    : "";
  const colunasRecorte: Column<OrcamentoItemRow & DimensoesCadastro>[] = [
    ...DIMENSOES_ORCAMENTO.filter((d) => ["unidadeSistema", "orgao", "unidade", "acao", "nomeElemento", "codigoElemento", "ficha", "fonte"].includes(d.key)).map(
      (d): Column<OrcamentoItemRow & DimensoesCadastro> => ({
        key: d.key,
        header: d.rotulo,
        minWidth: d.key === "codigoElemento" || d.key === "ficha" ? undefined : 180,
        nowrap: d.key === "codigoElemento" || d.key === "ficha",
        value: (r) => valorDimensao(r, d.key),
        render: (r) => (
          <span className="block max-w-[260px] truncate text-text-2" title={valorDimensao(r, d.key)}>
            {valorDimensao(r, d.key)}
          </span>
        ),
      }),
    ),
    {
      key: "medida",
      header: m.rotulo,
      align: "right",
      nowrap: true,
      filter: "range",
      numero: (r) => m.valor(r),
      render: (r) => <span className="font-semibold tabular-nums text-text">{brl(m.valor(r))}</span>,
    },
  ];

  const opcaoDim = (d: (typeof DIMENSOES_ORCAMENTO)[number], p: { permitida: boolean; motivo: string | null; valores: number }) => (
    <option key={d.key} value={d.key} disabled={!p.permitida}>
      {p.permitida ? `${d.rotulo} (${num(p.valores)})` : `${d.rotulo} — ${p.motivo}`}
    </option>
  );
  const nVisiveis = cruz?.colunas.length ?? 0;

  return (
    <>
      <FerramentasAba>
        <div className="min-w-0 flex-1 sm:max-w-xs">
          <SearchField
            compacto
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            onClear={() => setBusca("")}
            placeholder={`Buscar ${rotuloDim(linha).toLowerCase()}… (vários com :)`}
            aria-label="Buscar nas linhas"
          />
        </div>
      </FerramentasAba>

      <div className="mb-[var(--gap-block)] flex flex-wrap items-center gap-2">
        {inicio}
        <div className="grid w-full grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-2 sm:flex sm:w-auto">
          <div className="min-w-0 sm:w-52">
            <SelectField compacto label="Linhas" value={linha} disabled={editando} onChange={(e) => escolherLinha(e.target.value as DimensaoOrcamento)}>
              {DIMENSOES_ORCAMENTO.map((d) => opcaoDim(d, permLinhas[d.key]))}
            </SelectField>
          </div>
          <Button
            size="sm"
            variant="icon"
            icon={<IconTrocar className="h-4 w-4" />}
            onClick={trocarEixos}
            disabled={!podeTrocar || editando}
            aria-label="Inverter linhas e colunas"
            title={podeTrocar ? "Inverter linhas e colunas" : "Não dá para inverter: a dimensão das linhas não é permitida nas colunas"}
          />
          <div className="min-w-0 sm:w-60">
            <SelectField compacto label="Colunas" value={coluna ?? ""} disabled={editando} onChange={(e) => escolherColuna(e.target.value as DimensaoOrcamento)}>
              {coluna == null && <option value="">Nenhuma permitida</option>}
              {DIMENSOES_ORCAMENTO.map((d) => opcaoDim(d, permColunas[d.key]))}
            </SelectField>
          </div>
        </div>
        <div className="w-full sm:w-52">
          <SelectField compacto label="Medida" value={medida} onChange={(e) => setMedida(e.target.value as MedidaOrcamento)}>
            {MEDIDAS_ORCAMENTO.map((x) => (
              <option key={x.key} value={x.key}>
                {x.rotulo}
              </option>
            ))}
          </SelectField>
        </div>
        {visoes.length > 0 && (
          <div className="w-full sm:w-52">
            <SelectField
              compacto
              label="Visão"
              value={visaoId ?? ""}
              onChange={(e) => {
                setVisaoId(e.target.value ? Number(e.target.value) : null);
                setAberto(null);
              }}
            >
              <option value="">Orçamento inteiro</option>
              <optgroup label="Visões salvas">
                {visoes.map((v) => (
                  <option key={v.id} value={v.id} {...atributosVisao(v, 0)}>
                    {v.nome}
                  </option>
                ))}
              </optgroup>
            </SelectField>
          </div>
        )}
        <div className="flex items-center gap-2 lg:ml-auto">
          <Segmented<ModoCruzamento> ariaLabel="Ler as células como" value={modo} onChange={setModo} options={MODOS} />
          <Ajuda titulo="Comparativo">
            <TopicoAjuda icone={<IconTrocar className="h-4 w-4" />} titulo="Linhas × Colunas">
              Escolha duas colunas do CUBO para cruzar. As que não combinam aparecem desabilitadas com o motivo; o botão entre elas inverte.
            </TopicoAjuda>
            <TopicoAjuda icone={<IconDownload className="h-4 w-4" />} titulo="Medida, visão e leitura">
              A medida define o valor somado; a visão restringe os lançamentos; R$ ou % (a participação de cada valor na linha). Um toque marca a linha; dois toques (ou
              duplo clique) numa célula mostram os lançamentos que formam o número; tocar no nome de uma coluna ordena as linhas.
            </TopicoAjuda>
            <TopicoAjuda icone={<IconPencil className="h-4 w-4" />} titulo="Editar a planilha">
              O lápis, no rodapé da tabela, liga a edição. Todas as colunas — inclusive o nome das linhas, a Sigla e o Total — se editam no cabeçalho: segure a
              alça à esquerda e arraste (a coluna levanta, a sombra mostra onde vai ficar e ela pousa ao soltar; entre as congeladas, congela); no topo, o
              alfinete congela, o olho oculta e as setas ordenam (crescente/decrescente); a borda ajusta a largura (duplo clique volta ao padrão).
            </TopicoAjuda>
            <TopicoAjuda icone={<IconSave className="h-4 w-4" />} titulo="Edições salvas">
              "Salvar" guarda a edição com um nome, só para você ou pública (todos veem). No rodapé você troca de edição, marca a sua padrão na estrela (a tabela
              abre nela) e exclui as suas. Cada par de colunas tem as suas edições.
            </TopicoAjuda>
          </Ajuda>
          {fim}
        </div>
      </div>

      <TabelaCruzada
        rotuloLinhas={rotuloDim(linha)}
        rotuloExtra={siglaDe ? "Sigla" : undefined}
        linhas={linhas}
        colunas={cruzBase?.colunas ?? []}
        total={cruzBase?.total ?? 0}
        formatar={brl}
        modo={modo}
        calor={layout.calor}
        fixadas={layout.fixadas}
        ordemManual={layout.ordemManual}
        larguras={layout.larguras}
        ocultas={layout.ocultas}
        ordem={ordem}
        onOrdenar={ordenar}
        onAbrir={editando ? undefined : (l, c) => setAberto({ linha: l, coluna: c })}
        ativa={aberto}
        edicao={editando ? edicao : undefined}
        vazio={
          !coluna
            ? "Nenhuma coluna permitida para cruzar com estas linhas."
            : cruzBase && cruzBase.colunas.length > 0 && nVisiveis === 0
              ? "Todas as colunas estão ocultas — use “Editar” para mostrar alguma."
              : busca
                ? "Nenhuma linha para esta busca."
                : "Nenhum lançamento para comparar."
        }
        acoesRodape={
          <>
            {podeBaixar && !editando && (
              <BotaoExportar nome="a tabela comparativa" disabled={!cruz || nVisiveis === 0} carregando={exportando} onExportar={(f) => void exportar(f)} />
            )}
            {editor.rodape({
          onEditar: editar,
          disabled: !cruzBase,
          extras: (
            <div className="flex min-h-11 items-center gap-x-4 lg:min-h-0">
              <Checkbox checked={layout.calor} onChange={(e) => mudar((l) => ({ ...l, calor: e.target.checked }))} label="Mapa de calor" />
              <Checkbox checked={layout.zerados} onChange={(e) => mudar((l) => ({ ...l, zerados: e.target.checked }))} label="Ocultar zerados" />
            </div>
          ),
          onCongelarTodas: () => mudar((l) => ({ ...l, fixadas: padrao.filter((k) => !l.ocultas.includes(k)) })),
          // O nome das linhas segue congelado.
          onDescongelarTodas: () => mudar((l) => ({ ...l, fixadas: [COL_ROTULO] })),
          onMostrarTodas: () => mudar((l) => ({ ...l, ocultas: [] })),
          semOcultas: layout.ocultas.length === 0,
        })}
          </>
        }
        resumo={
          cruz && coluna
            ? `${num(linhas.length)} ${linhas.length === 1 ? "linha" : "linhas"} × ${num(nVisiveis)} ${nVisiveis === 1 ? "coluna" : "colunas"} · ${m.rotulo} ${brl(cruz.total)}`
            : undefined
        }
      />

      <OrigemDados
        aberto={aberto != null}
        onClose={() => setAberto(null)}
        titulo={`Comparativo · ${m.rotulo}`}
        recorte={rotuloRecorte}
        resumo={[
          { label: m.rotulo, value: brl(somaRecorte) },
          { label: "Lançamentos", value: num(recorte.length) },
          { label: "Do total", value: pctDoTotal == null ? "—" : `${pctDoTotal.toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%` },
          { label: "Visão", value: visao?.nome ?? "Orçamento inteiro" },
        ]}
        fonte={`Lançamentos do relatório CUBO importado neste orçamento (${titulo}), agrupados por ${rotuloDim(linha).toLowerCase()}${coluna ? ` e ${rotuloDim(coluna).toLowerCase()}` : ""}. A soma da tabela abaixo é o número clicado.`}
      >
        <DataTable
          columns={colunasRecorte}
          rows={recorte}
          getKey={(r) => r.id}
          pageSize={20}
          density="compact"
          minWidth={1100}
          resumo={(ls) => `${num(ls.length)} ${ls.length === 1 ? "lançamento" : "lançamentos"} · ${brl(ls.reduce((s, r) => s + m.valor(r), 0))}`}
        />
      </OrigemDados>

      {editor.camadas}
    </>
  );
}
