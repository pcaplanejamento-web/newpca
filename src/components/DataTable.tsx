"use client";

import { type CSSProperties, type ReactNode, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import {
  alternarOculta,
  coerceLayoutTabela,
  comLargura,
  comOrdem,
  LAYOUT_TABELA_PADRAO,
  type LayoutTabela,
  layoutTabelaIgual,
  ordemDasColunas,
} from "@/lib/colunas-layout";
import type { EdicaoTabela } from "@/lib/edicoes-tabela-core";
import { LINHAS_TABELA } from "@/lib/theme";
import {
  aplicarFiltros,
  type ColunaDados,
  type FaixaValor,
  type FiltroValor,
  filtroAtivo,
  type IntervaloData,
  normalizarFaixa,
  normalizarSelecao,
  ordenarIndices,
} from "@/lib/tabela-filtros";
import { DateFilterHeader } from "./DateFilterHeader";
import { CabecalhoEdicao, ColunaPresa, useArrastoColunas } from "./EdicaoColunas";
import { useEditorEdicoes } from "./EdicoesTabela";
import { useLinhasTabela } from "./ConfigTabelas";
import { AlturaNoHtml, FOLGA, reservaAteORodape, topoNoDocumento, useAlturaAteOFim } from "./AlturaCheia";
import { ehDesktop } from "./espacamento";
import { IconFilter, IconLock } from "./icons";
import { MultiSelectHeader } from "./MultiSelectHeader";
import { Pager } from "./Pager";
import { RangeFilterHeader } from "./RangeFilterHeader";

// Tabela do design system (spec §6.6 + pedidos do usuário): seleção de linhas,
// **filtro em TODOS os cabeçalhos** — multi-select por padrão (inclusive colunas com VÁRIOS valores
// por linha), **datas** (intervalo) e **faixa R$** (barra de arrasto) — CONECTADOS entre si (as opções
// de cada coluna vêm das linhas que passam nos demais filtros), coluna filtrada com o tópico MARCADO,
// ordenação e **paginação** — tudo interno. Por token; rola no mobile sem estourar a página.
export type Column<R> = {
  key: string;
  header: string;
  render?: (row: R) => ReactNode;
  /** Alinhamento horizontal da coluna. Padrão = **center** (dados centralizados); use "right"
   * para valores monetários (R$) e "left" só em exceções. */
  align?: "left" | "center" | "right";
  /** "values" (padrão), "date" (intervalo DE/ATÉ), "range" (faixa numérica — colunas R$, com
   * `numero`) ou "none" (sem filtro). */
  filter?: "values" | "date" | "range" | "none";
  /** Opções fixas (ordem) do multi-select; se omitido, derivadas de `value`/`valores`. */
  filterOptions?: string[];
  /** Valor textual da célula: p/ derivar opções, ordenar e filtrar (datas em ISO). */
  value?: (row: R) => string;
  /** VÁRIOS valores da célula para o FILTRO (ex.: Estado = todos os problemas, inclusive os ocultos
   * no "+N"): a linha passa se QUALQUER um estiver marcado. A ordenação segue `value`. */
  valores?: (row: R) => string[];
  /** Valor NUMÉRICO da célula (filtro "range" e ordenação numérica — ex.: valores R$). */
  numero?: (row: R) => number | null | undefined;
  minWidth?: number;
  /** Sem quebra de linha: a coluna ganha a largura do CONTEÚDO (dados curtos — nº, sigla, badges,
   * valores). A tabela cresce e rola no eixo x do próprio container (nunca estoura a página). */
  nowrap?: boolean;
  /** Filtro TRAVADO por um filtro de hierarquia acima da tabela (ex.: o seletor de assunto da Mesa): o
   * cabeçalho mostra o cadeado com o motivo (tooltip) e o filtro da coluna fica desligado. */
  travado?: string;
  /** Filtro (multi-seleção) CONTROLADO DE FORA: as opções, a seleção e a mudança vêm de quem usa a tabela — a coluna não
   * filtra as linhas por dentro (ex.: a visão Consolidada dos itens filtra os ITENS antes de agrupar). Marca o tópico e
   * conta no "Limpar filtros" como os demais. */
  filtroExterno?: { opcoes: string[]; valor: string[]; onChange: (v: string[] | null) => void };
  /** Formato dos números no filtro de FAIXA (padrão = R$) — ex.: quantidades e percentuais. */
  formatarFaixa?: (n: number) => string;
};

type Key = string | number;

/** EDIÇÕES SALVAS de uma tabela (opt-in): a `chave` da tabela, as edições que o usuário vê (as dele e as públicas) e as
 * preferências de edição PADRÃO dele — carregadas no servidor (`carregarEdicoes`). */
export type EdicoesDaTabela = {
  chave: string;
  lista: EdicaoTabela[];
  padroes: Record<string, unknown>;
  /** Quem guarda a lista fora da tabela (a tabela que remonta volta com as edições novas). */
  onMudar?: (lista: EdicaoTabela[], padroes: Record<string, unknown>) => void;
};

type OrdemAtual = { key: string | null; dir: "asc" | "desc" };
const SEM_EDICOES: EdicaoTabela[] = [];
const SEM_PADROES: Record<string, unknown> = {};
const larguraFixa = (px: number): CSSProperties => ({ width: px, minWidth: px, maxWidth: px });
/** O LUGAR onde a coluna arrastada vai ficar: só o fundo accent — TODO o conteúdo (texto, fotos, selos) some. */
const SOMBRA = "!bg-accent/10 !text-transparent [&>*]:invisible";
/** Divisa à direita da última coluna congelada. */
const DIVISA = "shadow-[inset_-1px_0_0_var(--border)]";

export function DataTable<R>({
  columns,
  rows,
  getKey,
  selectable = false,
  selected,
  onSelected,
  pageSize,
  footer,
  resumo,
  minWidth = 720,
  onRowClick,
  activeKey = null,
  fillHeight = false,
  scrollInterno = false,
  density,
  reservaInferior = 0,
  acoesRodape,
  vazio,
  edicoes,
}: {
  columns: Column<R>[];
  rows: R[];
  getKey: (row: R) => Key;
  selectable?: boolean;
  selected?: Set<Key>;
  onSelected?: (s: Set<Key>) => void;
  pageSize?: number;
  footer?: ReactNode;
  /** Resumo (ex.: somatórios) calculado sobre as linhas FILTRADAS/ordenadas. */
  resumo?: (linhas: R[]) => ReactNode;
  minWidth?: number;
  /** Clique na LINHA (abre o item). Ignora cliques em controles (input/select/button/a/label). */
  onRowClick?: (row: R) => void;
  /** Linha ATIVA (cuja detalhe está aberta ao lado) — destacada (mestre-detalhe). */
  activeKey?: Key | null;
  /**
   * Ajusta as linhas por página para PREENCHER a altura disponível até o rodapé do
   * display (sem scroll vertical do navegador no desktop). Mede a distância do topo
   * da tabela ao fim da viewport; recalcula no resize. Fallback = `pageSize` ?? 20.
   */
  fillHeight?: boolean;
  /**
   * Scroll INTERNO: no desktop a tabela OCUPA a altura até o rodapé do display desde o primeiro quadro (o rodapé
   * fica rente ao fim, com poucas ou muitas linhas) e o CORPO rola por dentro (thead fixo, `sticky`), sem scroll
   * vertical do navegador. Um seletor de "linhas por página" (30/50/100/200 — começa na escolha do ADM, Configurações
   * → Tabelas, via `ConfigTabelas`) fica no rodapé — limita as linhas em DOM (performático mesmo com milhares). No
   * mobile rola normal (paginado). Opt-in (não afeta as demais tabelas). Exclui o `fillHeight`.
   */
  scrollInterno?: boolean;
  /**
   * Densidade da linha (LOCAL, sem afetar as outras tabelas): `compact` = a das tabelas de PROTOCOLOS, DFDs e ITENS —
   * TODA linha com a MESMA altura (a dos controles, `--h-control-sm`) e o cabeçalho baixo; `comfortable` = mais alta;
   * `default`/omitido = respeita o token global (`--cell-py`).
   */
  density?: "compact" | "default" | "comfortable";
  /** Altura (px) RESERVADA no fim do display para algo fixo abaixo da tabela (ex.: a barra de
   * seleção da Mesa) — `scrollInterno`/`fillHeight` descontam, então nada fica por baixo dela. */
  reservaInferior?: number;
  /** Ações no RODAPÉ da tabela, à esquerda do seletor de linhas (ex.: "Importar protocolo" da Mesa). */
  acoesRodape?: ReactNode;
  /** Mensagem do corpo quando NÃO há linhas (sem dados) — com linhas escondidas pelos filtros das colunas,
   * vale a mensagem padrão dos filtros. */
  vazio?: ReactNode;
  /**
   * EDIÇÃO DA TABELA + EDIÇÕES SALVAS (opt-in — ex.: as tabelas da Mesa): o LÁPIS no rodapé liga a edição direto no
   * cabeçalho (arrastar a coluna, congelar, ocultar, ordenar, largura — as MESMAS peças do Comparativo, `EdicaoColunas`)
   * e "Salvar" guarda a edição — colunas + a ORDENAÇÃO + os FILTROS das colunas — só para o usuário ou PÚBLICA; o seletor
   * troca de edição e a estrela marca a PADRÃO (a tabela abre nela). Sem ela, a tabela é a de sempre.
   */
  edicoes?: EdicoesDaTabela;
}) {
  // A edição em uso (a padrão do usuário ao abrir) dá o layout das colunas e o ESTADO INICIAL da ordenação e dos filtros;
  // trocar de edição os aplica. Salvar leva a ordenação e os filtros do momento.
  const editor = useEditorEdicoes<LayoutTabela>({
    chave: edicoes?.chave ?? "",
    edicoes: edicoes?.lista ?? SEM_EDICOES,
    padroes: edicoes?.padroes ?? SEM_PADROES,
    onMudar: edicoes?.onMudar,
    coerce: coerceLayoutTabela,
    igual: layoutTabelaIgual,
    padrao: LAYOUT_TABELA_PADRAO,
    paraSalvar: (l: LayoutTabela): LayoutTabela => ({ ...l, ordem: sort.key ? { key: sort.key, dir: sort.dir } : null, filtros: filters }),
    aoEscolher: (l: LayoutTabela) => {
      setFilters(l.filtros);
      setSort(l.ordem ?? { key: null, dir: "asc" });
      setPage(1);
    },
  });
  const [filters, setFilters] = useState<Record<string, FiltroValor>>((): Record<string, FiltroValor> => editor.salvo.filtros);
  const [sort, setSort] = useState<OrdemAtual>((): OrdemAtual => editor.salvo.ordem ?? { key: null, dir: "asc" });
  const [page, setPage] = useState(1);
  // scrollInterno: linhas por página escolhidas NA PRÓPRIA tabela (limita as linhas em DOM); começa na escolha do ADM.
  const linhasAdm = useLinhasTabela();
  const [limite, setLimite] = useState<number>(linhasAdm);

  // fillHeight: mede as linhas que cabem até o fim da viewport (recalcula no resize).
  const wrapRef = useRef<HTMLDivElement>(null);
  // Rodapé (resumo/ações/linhas/pager) — a altura REAL entra na medida (muda com as ações e no celular).
  const rodapeRef = useRef<HTMLDivElement>(null);
  const [autoRows, setAutoRows] = useState<number | null>(null);
  // Medidas ANTES da pintura (`useLayoutEffect`): a tabela já aparece no tamanho certo, sem um quadro "solto" antes.
  useLayoutEffect(() => {
    if (!fillHeight) return;
    const calc = () => {
      const el = wrapRef.current;
      if (!el) return;
      // Só no desktop (o mobile rola normalmente e tem bottom-nav fixa).
      if (!ehDesktop()) {
        setAutoRows(null);
        return;
      }
      // Posição no DOCUMENTO (não na viewport): rolar a página não encolhe a tabela.
      const top = topoNoDocumento(el);
      if (top <= 0) return; // ainda não posicionada — mantém o fallback
      // Mede as alturas REAIS (linha varia com o conteúdo — ex.: botões de ação).
      const altLinha = el.querySelector("tbody tr")?.getBoundingClientRect().height || 48;
      const altCabecalho = el.querySelector("thead")?.getBoundingClientRect().height || 44;
      const altRodape = rodapeRef.current?.getBoundingClientRect().height || 48;
      const corpo = window.innerHeight - top - reservaAteORodape(reservaInferior) - altCabecalho - altRodape;
      const n = Math.floor(corpo / Math.max(altLinha, 30));
      setAutoRows(Math.max(4, Math.min(n, 60)));
    };
    calc();
    window.addEventListener("resize", calc);
    // Recalcula quando o layout acima da tabela muda (callouts, etc.).
    const ro = new ResizeObserver(calc);
    ro.observe(document.body);
    return () => {
      window.removeEventListener("resize", calc);
      ro.disconnect();
    };
  }, [fillHeight, reservaInferior]);

  // scrollInterno: a ALTURA TOTAL da tabela = do topo dela até o fim do display (menos o que fica fixo abaixo) — o
  // cartão ocupa o espaço inteiro e o corpo (flex) rola por dentro; o rodapé fica rente ao fim, com qualquer nº de linhas.
  const altura = useAlturaAteOFim(wrapRef, scrollInterno, reservaInferior);

  // scrollInterno: publica o espaço do RODAPÉ (altura + a folga até o fim do display) em `--rodape-tabela` — os avisos
  // flutuantes do canto inferior sobem acima dele (no celular ele gruda sobre a navegação; no desktop fica rente ao fim
  // do display) e nunca cobrem o "Importar" nem a paginação. Uma tabela assim por tela (a Mesa); sai ao desmontar.
  useEffect(() => {
    const el = rodapeRef.current;
    if (!scrollInterno || !el) return;
    const raiz = document.documentElement.style;
    const medir = () => raiz.setProperty("--rodape-tabela", `${Math.ceil(el.getBoundingClientRect().height) + FOLGA}px`);
    medir();
    const ro = new ResizeObserver(medir);
    ro.observe(el);
    return () => {
      ro.disconnect();
      raiz.removeProperty("--rodape-tabela");
    };
  }, [scrollInterno]);

  // Linhas por página efetivas: scrollInterno (seletor) › fillHeight (medido) › pageSize.
  const tamPagina = scrollInterno ? limite : fillHeight ? (autoRows ?? pageSize ?? 20) : pageSize;

  // Valores de cada coluna extraídos UMA vez por linha (filtro/faceta/ordenação leem daqui).
  const dados = useMemo<ColunaDados[]>(
    () =>
      columns.map((c): ColunaDados => {
        const tipo = c.filter ?? "values";
        if (c.filtroExterno) return { tipo: "none" }; // filtrado FORA da tabela
        if (tipo === "values") {
          const vals = rows.map((r) => (c.valores ? c.valores(r) : c.value ? [c.value(r)] : []));
          return { tipo, vals, ordem: c.filterOptions };
        }
        if (tipo === "date") return { tipo, vals: rows.map((r) => c.value?.(r) ?? "") };
        if (tipo === "range") return { tipo, vals: rows.map((r) => c.numero?.(r) ?? null) };
        return { tipo: "none" };
      }),
    [columns, rows],
  );

  // Filtros CONECTADOS: passa em todos + faceta de cada coluna (opções/faixa/anos) numa passada. Coluna
  // TRAVADA (hierarquia acima da tabela) não filtra.
  const facetas = useMemo(
    () => aplicarFiltros(rows.length, dados, columns.map((c) => (c.travado || c.filtroExterno ? undefined : filters[c.key]))),
    [rows.length, dados, columns, filters],
  );

  // Ordenação pela chave extraída uma vez (numérica p/ `numero`; texto natural senão; vazios no fim).
  const ordenadas = useMemo(() => {
    const col = sort.key ? columns.find((c) => c.key === sort.key) : undefined;
    if (!col || (!col.numero && !col.value)) return facetas.passam.map((i) => rows[i]);
    const chaves = rows.map((r) => (col.numero ? col.numero(r) : col.value?.(r)));
    return ordenarIndices(facetas.passam, chaves, sort.dir).map((i) => rows[i]);
  }, [facetas, sort, columns, rows]);

  const total = ordenadas.length;
  const pages = tamPagina ? Math.max(1, Math.ceil(total / tamPagina)) : 1;
  const pg = Math.min(page, pages);
  const visiveis = tamPagina ? ordenadas.slice((pg - 1) * tamPagina, pg * tamPagina) : ordenadas;

  const sel = selected ?? new Set<Key>();
  // "Selecionar todos" = TODAS as linhas que passam nos filtros (todas as páginas), não só a página.
  const marcadas = selectable ? ordenadas.reduce((n, r) => (sel.has(getKey(r)) ? n + 1 : n), 0) : 0;
  const todos = total > 0 && marcadas === total;
  const parcial = marcadas > 0 && !todos;
  // Colunas com filtro ATIVO (tópico marcado) — e o "Limpar filtros" do rodapé.
  const ativos = columns.filter((c) =>
    c.filtroExterno ? c.filtroExterno.valor.length > 0 : !c.travado && filtroAtivo(c.filter ?? "values", filters[c.key]),
  );

  /** Grava (ou remove, com `null`) o filtro de uma coluna e volta à 1ª página. */
  function aplicarFiltro(key: string, v: FiltroValor | null) {
    setFilters((f) => {
      const n = { ...f };
      if (v == null) delete n[key];
      else n[key] = v;
      return n;
    });
    setPage(1);
  }
  function alternarTodos() {
    const n = new Set(sel);
    if (todos) for (const r of ordenadas) n.delete(getKey(r));
    else for (const r of ordenadas) n.add(getKey(r));
    onSelected?.(n);
  }
  function alternar(k: Key) {
    const n = new Set(sel);
    if (n.has(k)) n.delete(k);
    else n.add(k);
    onSelected?.(n);
  }

  const compacta = density === "compact";
  const cell = "px-[var(--cell-px)] py-[var(--cell-py)] align-middle";
  // Cabeçalho ("tópicos"): baixo na densidade compacta (a mesma régua das linhas).
  const headPy = compacta ? "py-0" : "py-3";
  const head = `px-[var(--cell-px)] ${headPy} text-[10.5px] font-semibold uppercase tracking-[0.05em] text-faint`;
  const sortDe = (k: string) => (sort.key === k ? sort.dir : null);
  // Densidade LOCAL (só desta tabela): sobrepõe o `--cell-py` no container, sem afetar as demais. Na COMPACTA a altura
  // da linha é FIXA (a dos controles, `--h-control-sm` — segue a densidade do ADM) e o respiro vertical mínimo: toda
  // linha de protocolo, DFD e item tem a mesma altura, com ou sem controle na célula.
  const densPy = density === "comfortable" ? "18px" : compacta ? "3px" : undefined;
  const alturaLinha = compacta ? "var(--h-control-sm)" : undefined;
  // Desktop (scrollInterno): o cartão tem a ALTURA do espaço e é uma coluna flex — o corpo ocupa o que sobra e rola.
  // As classes da coluna valem desde o HTML do servidor (só `lg:` — sem altura fixa, o corpo fica no tamanho do conteúdo).
  const cheia = scrollInterno && altura != null;

  // COLUNAS na ordem do layout (congeladas + livres); as OCULTAS saem (na edição ficam esmaecidas, para voltar). Sem
  // edições salvas, a ordem é a das `columns` (layout padrão vazio).
  const editando = editor.editando;
  const lay = editor.layout;
  const chaves = useMemo(() => columns.map((c) => c.key), [columns]);
  const indice = useMemo(() => new Map(columns.map((c, j) => [c.key, j])), [columns]);
  const fora = useMemo(() => new Set(lay.ocultas), [lay.ocultas]);
  const ordemAtual = useMemo(() => {
    const o = ordemDasColunas(chaves, lay.fixadas, lay.ordemManual);
    const vis = (k: string) => editando || !fora.has(k);
    return { fixadas: o.fixadas.filter(vis), livres: o.livres.filter(vis) };
  }, [chaves, lay.fixadas, lay.ordemManual, fora, editando]);
  const rolagemRef = useRef<HTMLDivElement>(null);
  const tabelaRef = useRef<HTMLTableElement>(null);
  const { arrasto, vista, fantasma, iniciar, mover, congelar } = useArrastoColunas({
    raiz: wrapRef,
    rolagem: rolagemRef,
    ordem: ordemAtual,
    onOrdem: editando ? (f, l) => editor.mudar((x) => comOrdem(x, chaves, f, l)) : undefined,
  });
  const exibidas = [...vista.fixadas, ...vista.livres].map((k) => indice.get(k) as number);

  // CONGELADAS: `sticky` à esquerda pela largura REAL das anteriores (medida; a seleção vem antes delas) — as que passam
  // de ~60% da largura visível deixam de congelar (no celular, em geral só a 1ª). Remede quando a tabela muda de tamanho.
  const [fixos, setFixos] = useState<number[]>([]);
  const chaveFix = vista.fixadas.join("|");
  // biome-ignore lint/correctness/useExhaustiveDependencies: mede pelas congeladas (chaveFix), a seleção e as larguras.
  useLayoutEffect(() => {
    const tab = tabelaRef.current;
    const rolo = rolagemRef.current;
    if (!tab || !rolo || !chaveFix) {
      setFixos((f) => (f.length ? [] : f));
      return;
    }
    const calc = () => {
      const ths = tab.querySelectorAll<HTMLElement>("thead th");
      let x = selectable ? (ths[0]?.offsetWidth ?? 0) : 0;
      const lefts: number[] = [];
      for (let p = 0; p < vista.fixadas.length; p++) {
        const w = ths[p + (selectable ? 1 : 0)]?.offsetWidth ?? 0;
        if (p > 0 && x + w > rolo.clientWidth * 0.6) break;
        lefts.push(x);
        x += w;
      }
      setFixos((f) => (f.length === lefts.length && f.every((v, i) => v === lefts[i]) ? f : lefts));
    };
    calc();
    const ro = new ResizeObserver(calc);
    ro.observe(tab);
    ro.observe(rolo);
    return () => ro.disconnect();
  }, [chaveFix, selectable, lay.larguras]);
  const nFix = fixos.length;
  /** Estilo/classe da coluna na posição `p` (congelada, divisa, largura definida, a SOMBRA do destino no arrasto). */
  const posicao = (k: string, p: number) => {
    const fixa = p < nFix;
    const w = lay.larguras[k];
    return {
      fixa,
      classe: `${fixa ? "sticky" : ""} ${fixa && p === nFix - 1 ? DIVISA : ""} ${w ? "overflow-hidden" : ""} ${
        arrasto?.chave === k ? SOMBRA : ""
      }`,
      estilo: { ...(w ? larguraFixa(w) : {}), ...(fixa ? { left: fixos[p] } : {}) } as CSSProperties,
    };
  };
  const selFixa = nFix > 0;
  const ordenarPor = (k: string) => setSort((o) => ({ key: k, dir: o.key === k && o.dir === "asc" ? "desc" : "asc" }));

  return (
    <div
      ref={wrapRef}
      // `overflow-clip` (e não `hidden`) na rolagem interna: recorta os cantos SEM virar contêiner de rolagem — o rodapé
      // pode grudar na tela no celular (abaixo).
      className={`${scrollInterno ? "flex flex-col overflow-clip" : "overflow-hidden"} rounded-card border border-border bg-surface shadow-ring`}
      style={{ ...(densPy ? ({ "--cell-py": densPy } as CSSProperties) : {}), ...(cheia ? { height: altura } : {}) }}
      // A altura do HTML do servidor é posta pelo trecho abaixo ANTES da hidratação (ela não é do React ainda).
      suppressHydrationWarning={scrollInterno}
    >
      <div
        ref={rolagemRef}
        className={`overflow-x-auto ${scrollInterno ? `overflow-y-auto ${visiveis.length > 0 ? "lg:min-h-0 lg:flex-1" : "lg:flex-none"}` : ""}`}
      >
        <table ref={tabelaRef} className="w-full border-collapse text-sm" style={{ minWidth }}>
          <thead className={`border-b border-border bg-surface-2 ${scrollInterno ? "sticky top-0 z-10" : ""}`}>
            <tr>
              {selectable && (
                <th className={`w-10 px-3 ${headPy} ${selFixa ? "sticky left-0 z-20 bg-surface-2" : ""}`}>
                  <input
                    type="checkbox"
                    aria-label={todos ? `Desmarcar todos (${total})` : `Selecionar todos (${total})`}
                    title={todos ? `Desmarcar os ${total} registros filtrados` : `Selecionar os ${total} registros filtrados (todas as páginas)`}
                    checked={todos}
                    ref={(el) => {
                      if (el) el.indeterminate = parcial;
                    }}
                    onChange={alternarTodos}
                    className="h-4 w-4 accent-[var(--accent)]"
                  />
                </th>
              )}
              {exibidas.map((j, p) => {
                const c = columns[j];
                const tipo = c.filter ?? "values";
                const externo = c.filtroExterno;
                const marcado = externo ? externo.valor.length > 0 : !c.travado && filtroAtivo(tipo, filters[c.key]);
                // Texto do cabeçalho: right→direita, left→esquerda, padrão→CENTRO (como as células).
                const alinhaTexto = c.align === "right" ? "text-right" : c.align === "left" ? "text-left" : "text-center";
                // Popover do filtro abre alinhado ao início, exceto colunas à direita.
                const alinha = c.align === "right" ? ("end" as const) : ("start" as const);
                const opcoes = externo ? externo.opcoes : (facetas.opcoes[j] ?? []);
                const pos = posicao(c.key, p);
                const filtro = c.travado ? (
                  <span className="inline-flex items-center gap-1" title={c.travado}>
                    <IconLock className="h-3 w-3 shrink-0" aria-hidden />
                    {c.header}
                  </span>
                ) : externo ? (
                  opcoes.length > 0 || marcado ? (
                    <MultiSelectHeader
                      label={c.header}
                      options={opcoes}
                      value={externo.valor}
                      onApply={(v) => {
                        externo.onChange(normalizarSelecao(v, opcoes));
                        setPage(1);
                      }}
                      onSort={(d) => setSort({ key: c.key, dir: d })}
                      sortDir={sortDe(c.key)}
                      align={alinha}
                      marcado={marcado}
                    />
                  ) : (
                    <span>{c.header}</span>
                  )
                ) : tipo === "date" ? (
                  <DateFilterHeader
                    label={c.header}
                    value={filters[c.key] as IntervaloData | undefined}
                    anos={facetas.anos[j]?.length ? (facetas.anos[j] as number[]) : undefined}
                    onApply={(v) => aplicarFiltro(c.key, v.de || v.ate ? v : null)}
                    onSort={(d) => setSort({ key: c.key, dir: d })}
                    sortDir={sortDe(c.key)}
                    align={alinha}
                  />
                ) : tipo === "range" ? (
                  <RangeFilterHeader
                    label={c.header}
                    dominio={facetas.dominios[j] ?? []}
                    value={filters[c.key] as FaixaValor | undefined}
                    onApply={(f) => aplicarFiltro(c.key, normalizarFaixa(f, facetas.dominios[j] ?? []))}
                    onSort={(d) => setSort({ key: c.key, dir: d })}
                    sortDir={sortDe(c.key)}
                    align={alinha}
                    marcado={marcado}
                    formatar={c.formatarFaixa}
                  />
                ) : tipo === "values" && (opcoes.length > 0 || marcado) ? (
                  <MultiSelectHeader
                    label={c.header}
                    options={opcoes}
                    value={(filters[c.key] as string[] | undefined) ?? []}
                    onApply={(v) => aplicarFiltro(c.key, normalizarSelecao(v, opcoes))}
                    onSort={(d) => setSort({ key: c.key, dir: d })}
                    sortDir={sortDe(c.key)}
                    align={alinha}
                    marcado={marcado}
                  />
                ) : (
                  <span>{c.header}</span>
                );
                return (
                  <th
                    key={c.key}
                    data-col={c.key}
                    className={`${head} ${alinhaTexto} ${c.nowrap ? "whitespace-nowrap" : ""} ${pos.classe} ${pos.fixa ? "z-20 bg-surface-2" : ""} ${
                      // A congelada já é `sticky` (referência da alça/ações); a livre ganha `relative`.
                      editando ? `pr-4 pl-6 align-top ${pos.fixa ? "" : "relative"}` : ""
                    }`}
                    // Coluna FILTRADA: tópico marcado também por um sublinhado accent no cabeçalho.
                    style={{
                      ...(c.minWidth ? { minWidth: c.minWidth } : {}),
                      ...pos.estilo,
                      ...(marcado ? { boxShadow: "inset 0 -2px 0 var(--accent)" } : {}),
                    }}
                    aria-sort={sort.key === c.key ? (sort.dir === "asc" ? "ascending" : "descending") : undefined}
                  >
                    {editando ? (
                      <CabecalhoEdicao
                        rotulo={c.header}
                        congelada={p < vista.fixadas.length}
                        oculta={fora.has(c.key)}
                        ordem={sortDe(c.key)}
                        onArrastar={(e) => iniciar(e, c.key)}
                        onMover={(d) => mover(c.key, p, d)}
                        onCongelar={() => congelar(c.key)}
                        onOcultar={() => editor.mudar((x) => alternarOculta(x, c.key))}
                        onOrdenar={() => ordenarPor(c.key)}
                        largura={lay.larguras[c.key]}
                        onLargura={(px) => editor.mudar((x) => comLargura(x, c.key, px))}
                      >
                        <div className={fora.has(c.key) ? "opacity-40" : ""}>{filtro}</div>
                      </CabecalhoEdicao>
                    ) : (
                      filtro
                    )}
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {visiveis.map((r) => {
              const k = getKey(r);
              const marcada = sel.has(k);
              const ativa = activeKey != null && k === activeKey;
              return (
                <tr
                  key={k}
                  onClick={
                    onRowClick
                      ? (e) => {
                          if ((e.target as HTMLElement).closest("input,select,button,a,label")) return;
                          onRowClick(r);
                        }
                      : undefined
                  }
                  onKeyDown={
                    onRowClick
                      ? (e) => {
                          // Enter num controle DENTRO da célula (dropdown, botão…) é dele — não abre a linha.
                          if (e.key !== "Enter" || (e.target as HTMLElement).closest("input,select,textarea,button,a,label")) return;
                          onRowClick(r);
                        }
                      : undefined
                  }
                  {...(onRowClick ? { role: "button", tabIndex: 0 } : {})}
                  style={{ height: alturaLinha, ...(ativa ? { boxShadow: "inset 3px 0 0 var(--accent)" } : {}) }}
                  // Com colunas congeladas a linha tem fundo OPACO (as células presas herdam — nada aparece por baixo).
                  className={`group/linha border-b border-border transition-colors last:border-0 hover:bg-surface-2 ${
                    onRowClick ? "cursor-pointer" : ""
                  } ${ativa || (marcada && selFixa) ? "bg-accent-soft" : marcada ? "bg-accent-soft/60" : selFixa ? "bg-surface" : ""}`}
                >
                  {selectable && (
                    <td className={`w-10 px-3 ${selFixa ? "sticky left-0 z-10 bg-inherit" : ""}`}>
                      <input
                        type="checkbox"
                        aria-label="Selecionar linha"
                        checked={marcada}
                        onChange={() => alternar(k)}
                        className="h-4 w-4 accent-[var(--accent)]"
                      />
                    </td>
                  )}
                  {exibidas.map((j, p) => {
                    const c = columns[j];
                    const pos = posicao(c.key, p);
                    return (
                      <td
                        key={c.key}
                        className={`${cell} text-[13px] text-text-2 ${c.align === "right" ? "text-right" : c.align === "left" ? "text-left" : "text-center"} ${
                          c.nowrap ? "whitespace-nowrap" : ""
                        } ${pos.classe} ${pos.fixa ? "z-10 bg-inherit" : ""} ${fora.has(c.key) ? "opacity-40" : ""}`}
                        style={pos.estilo}
                      >
                        {c.render?.(r)}
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {/* Sem linhas: a mensagem fica FORA da área que rola na horizontal — centrada no que se vê (no celular a tabela
          é mais larga que a tela e o texto sumia à direita); na tabela de altura cheia, no meio do espaço vazio. */}
      {visiveis.length === 0 && (
        <p className={`px-4 py-12 text-center text-[13px] text-faint ${scrollInterno ? "lg:grid lg:min-h-0 lg:flex-1 lg:place-items-center" : ""}`}>
          {rows.length === 0 && vazio != null ? vazio : "Nenhum registro com os filtros atuais."}
        </p>
      )}

      <div
        ref={rodapeRef}
        className={`flex flex-wrap items-center justify-between gap-x-3 gap-y-1.5 border-t border-border bg-surface-2 px-3 py-1.5 text-[12.5px] text-muted ${
          // Rolagem interna no CELULAR (a página rola): o rodapé — resumo, ações (ex.: "Importar"), linhas e paginação —
          // GRUDA acima da navegação inferior (e da barra de seleção fixa, `--reserva-rodape`) enquanto a tabela está na tela.
          scrollInterno ? "max-lg:sticky max-lg:bottom-[calc(4rem_+_env(safe-area-inset-bottom)_+_var(--reserva-rodape,0px))] max-lg:z-10" : ""
        }`}
      >
        <span>
          {resumo ? resumo(ordenadas) : (footer ?? `${total} registro${total === 1 ? "" : "s"}`)}
        </span>
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1.5 sm:gap-x-3">
          {ativos.length > 0 && (
            <button
              type="button"
              onClick={() => {
                setFilters({});
                for (const c of ativos) c.filtroExterno?.onChange(null);
                setPage(1);
              }}
              title={`Filtros ativos: ${ativos.map((c) => c.header).join(", ")}`}
              className="inline-flex min-h-11 items-center gap-1.5 rounded-chip px-2 text-[12px] font-semibold text-accent hover:bg-accent-soft lg:min-h-8"
            >
              <IconFilter className="h-3.5 w-3.5" /> Limpar filtros ({ativos.length})
            </button>
          )}
          {edicoes &&
            editor.rodape({
              onEditar: () => editor.editar(lay),
              disabled: rows.length === 0,
              onCongelarTodas: () => editor.mudar((x) => ({ ...x, fixadas: chaves.filter((k) => !x.ocultas.includes(k)) })),
              onDescongelarTodas: () => editor.mudar((x) => ({ ...x, fixadas: [] })),
              onMostrarTodas: () => editor.mudar((x) => ({ ...x, ocultas: [] })),
              semOcultas: lay.ocultas.length === 0,
            })}
          {acoesRodape}
          {scrollInterno && (
            <label className="flex items-center gap-1.5 text-[12px] text-muted">
              <span className="hidden sm:inline">Linhas</span>
              <select
                aria-label="Linhas por página"
                value={limite}
                onChange={(e) => {
                  setLimite(Number(e.target.value));
                  setPage(1);
                }}
                className="min-h-11 rounded-[8px] border border-border bg-surface px-2 py-1 text-[12px] text-text-2 focus:border-accent focus:outline-none lg:min-h-0"
              >
                {LINHAS_TABELA.map((n) => (
                  <option key={n} value={n}>
                    {n}
                  </option>
                ))}
              </select>
            </label>
          )}
          {tamPagina && <Pager page={pg} pages={pages} onChange={setPage} />}
        </div>
      </div>
      {scrollInterno && <AlturaNoHtml />}
      {edicoes && editor.camadas}
      {arrasto && (
        <ColunaPresa
          arrasto={arrasto}
          fantasma={fantasma}
          rotulo={columns[indice.get(arrasto.chave) as number]?.header ?? ""}
          direita={columns[indice.get(arrasto.chave) as number]?.align === "right"}
          celulas={visiveis.slice(0, 6).map((r) => columns[indice.get(arrasto.chave) as number]?.render?.(r))}
        />
      )}
    </div>
  );
}
