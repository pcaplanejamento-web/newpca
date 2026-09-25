"use client";

import {
  type CSSProperties,
  type KeyboardEvent,
  type MouseEvent,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";
import {
  basePercentual,
  COL_EXTRA,
  COL_ROTULO,
  COL_TOTAL,
  LARGURA_MAX,
  LARGURA_MIN,
  type ModoCruzamento,
  type OrdemCruzamento,
  ordemDasColunas,
  percentual,
  soltarColuna,
} from "@/lib/orcamento-cruzamento";
import { LINHAS_TABELA } from "@/lib/theme";
import { AlturaNoHtml, useAlturaAteOFim } from "./AlturaCheia";
import { useLinhasTabela } from "./ConfigTabelas";
import { IconArrowDown, IconArrowUp, IconEyeOff, IconFixar, IconGrip } from "./icons";
import { Pager } from "./Pager";

export type EixoTabelaCruzada = { chave: string; rotulo: string; total: number };
export type LinhaTabelaCruzada = EixoTabelaCruzada & { valores: number[]; extra?: string };

const fmtPct = (v: number | null) => (v == null ? "–" : `${v.toLocaleString("pt-BR", { maximumFractionDigits: 1, minimumFractionDigits: 1 })}%`);
const zerado = (v: number) => Math.abs(v) < 0.005;

/** Larguras PADRÃO por tipo de coluna (tokens locais, px) — o usuário ajusta cada coluna pela borda do cabeçalho. */
const LARGURAS =
  "[--cz-rot:152px] [--cz-ext:88px] [--cz-tot:120px] [--cz-col:120px] lg:[--cz-rot:280px] lg:[--cz-ext:112px] lg:[--cz-tot:144px] lg:[--cz-col:136px]";
const larguraVar = (w: string): CSSProperties => ({ width: w, minWidth: w, maxWidth: w });
/** Toda célula: altura dos controles e o texto CENTRADO na altura. */
const CEL = "h-11 border-b border-border/60 px-3 align-middle lg:h-[var(--h-control-sm)]";
const DIVISA = "shadow-[inset_-1px_0_0_var(--border)]";

/** Uma coluna da tabela — as ESTRUTURAIS (rótulo das linhas, extra, total) e as de VALORES são tratadas igual. */
type Coluna = { chave: string; tipo: "rotulo" | "extra" | "total" | "valor"; rotulo: string; total: number; j: number };
const VAR_LARGURA: Record<Coluna["tipo"], string> = { rotulo: "--cz-rot", extra: "--cz-ext", total: "--cz-tot", valor: "--cz-col" };
const ORDEM_DE: Record<Exclude<Coluna["tipo"], "valor">, OrdemCruzamento["por"]> = { rotulo: "rotulo", extra: "extra", total: "total" };
const porDe = (c: Coluna): OrdemCruzamento["por"] => (c.tipo === "valor" ? { coluna: c.chave } : ORDEM_DE[c.tipo]);

/** Alça de LARGURA na borda direita do cabeçalho (modo de edição): arrastar (mouse ou toque), ←/→ no teclado, duplo clique
 * = padrão. */
function AlcaLargura({ rotulo, largura: definida, onLargura }: { rotulo: string; largura?: number; onLargura: (px: number | null) => void }) {
  const [ativa, setAtiva] = useState(false);
  const alca = useRef<HTMLSpanElement>(null);
  const [atual, setAtual] = useState(0); // a largura exibida (px) — o valor do separador para leitores de tela
  const largura = (el: HTMLElement) => (el.parentElement as HTMLElement).getBoundingClientRect().width;
  // biome-ignore lint/correctness/useExhaustiveDependencies: re-mede quando a largura DEFINIDA muda.
  useLayoutEffect(() => {
    if (alca.current) setAtual(Math.round(largura(alca.current)));
  }, [definida]);
  const iniciar = (e: ReactPointerEvent<HTMLSpanElement>) => {
    const el = e.currentTarget;
    const x0 = e.clientX;
    const w0 = largura(el);
    e.preventDefault();
    e.stopPropagation();
    el.setPointerCapture(e.pointerId);
    setAtiva(true);
    let quadro = 0;
    const mover = (ev: PointerEvent) => {
      cancelAnimationFrame(quadro);
      quadro = requestAnimationFrame(() => onLargura(w0 + ev.clientX - x0));
    };
    const fim = () => {
      cancelAnimationFrame(quadro);
      setAtiva(false);
      el.removeEventListener("pointermove", mover);
      el.removeEventListener("pointerup", fim);
      el.removeEventListener("pointercancel", fim);
    };
    el.addEventListener("pointermove", mover);
    el.addEventListener("pointerup", fim);
    el.addEventListener("pointercancel", fim);
  };
  return (
    // biome-ignore lint/a11y/useSemanticElements: separador INTERATIVO (arrastável/teclado) — o <hr> não recebe foco nem eventos.
    <span
      ref={alca}
      role="separator"
      aria-orientation="vertical"
      aria-valuenow={atual}
      aria-valuemin={LARGURA_MIN}
      aria-valuemax={LARGURA_MAX}
      aria-label={`Largura de ${rotulo} (setas ajustam, duplo clique volta ao padrão)`}
      tabIndex={0}
      onPointerDown={iniciar}
      onClick={(e) => e.stopPropagation()}
      onDoubleClick={() => onLargura(null)}
      onKeyDown={(e) => {
        if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
        e.preventDefault();
        onLargura(largura(e.currentTarget) + (e.key === "ArrowRight" ? 16 : -16));
      }}
      className="group/alca absolute inset-y-0 -right-2 z-10 w-4 cursor-col-resize touch-none focus-visible:outline-none"
    >
      <span
        className={`absolute inset-y-1.5 left-1/2 w-0.5 -translate-x-1/2 rounded-full transition-colors ${
          ativa ? "bg-accent" : "bg-border-2 group-hover/alca:bg-accent/60 group-focus-visible/alca:bg-accent"
        }`}
      />
    </span>
  );
}

/** O que o modo de EDIÇÃO faz. `chave` = a da coluna ou `COL_*`. */
export type EdicaoTabelaCruzada = {
  onLargura: (chave: string, px: number | null) => void;
  onOcultar: (chave: string) => void;
  /** Nova ORDEM das colunas (arrastar, congelar/descongelar): as congeladas e as livres, na ordem. */
  onOrdem: (fixadas: string[], livres: string[]) => void;
};

/** Ação DIRETA no cabeçalho da coluna (congelar/ocultar) — 44px no toque, discreta no desktop, accent quando ligada. */
function AcaoColuna({ rotulo, ligada, icone, onClick, disabled = false }: { rotulo: string; ligada: boolean; icone: ReactNode; onClick: () => void; disabled?: boolean }) {
  return (
    <button
      type="button"
      aria-pressed={ligada}
      aria-label={rotulo}
      title={rotulo}
      disabled={disabled}
      onClick={onClick}
      className={`grid h-11 w-11 shrink-0 place-items-center rounded-[6px] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40 disabled:opacity-30 lg:h-7 lg:w-7 ${
        ligada ? "bg-accent/10 text-accent" : "text-faint hover:bg-surface hover:text-text-2"
      }`}
    >
      {icone}
    </button>
  );
}

type Arrasto = { chave: string; x: number; y: number; dx: number; dy: number; largura: number; destino: number };

/**
 * TABELA CRUZADA (horizontal, estilo planilha) — linhas × colunas de valores, com a coluna TOTAL e a linha TOTAL (fixa no
 * rodapé). Visual limpo: cabeçalho sem caixa-alta, zeros como "–", só divisórias horizontais, todo texto CENTRADO na
 * altura. TODAS as colunas — o rótulo das linhas, a extra (ex.: Sigla), o Total e as de valores — são IGUAIS: tocar no
 * nome ORDENA as linhas; congeladas ficam à esquerda (as que não cabem na largura visível deixam de congelar — nunca
 * somem). Com **`edicao`**, a PRÓPRIA planilha vira o editor, direto na coluna: ARRASTAR o nome move (mouse ou toque; a
 * coluna vai "presa" ao cursor, o LUGAR onde vai ficar aparece sombreado já na posição nova, a tabela rola sozinha nas
 * bordas; soltar entre as congeladas CONGELA; Alt+←/→ no teclado), o alfinete congela, o olho oculta (a oculta fica
 * esmaecida para voltar) e a borda ajusta a largura. Valor ou % da linha/coluna/total; mapa de calor opcional; tocar numa
 * célula chama `onAbrir` (a origem do número). No desktop ocupa a altura até o fim do display (o corpo rola por dentro);
 * linhas por página = Configurações → Tabelas.
 */
export function TabelaCruzada({
  rotuloLinhas,
  rotuloExtra,
  linhas,
  colunas,
  total,
  formatar,
  modo = "valor",
  calor = false,
  fixadas,
  ordemManual = [],
  larguras,
  ocultas = [],
  ordem,
  onOrdenar,
  onAbrir,
  ativa = null,
  edicao,
  vazio,
  resumo,
}: {
  rotuloLinhas: string;
  /** Coluna extra (ex.: a sigla no sistema) — só quando informada. */
  rotuloExtra?: string;
  /** Já ORDENADAS e filtradas (a tabela só pagina). `valores` alinhados a `colunas`. */
  linhas: LinhaTabelaCruzada[];
  /** As colunas de VALORES na ordem padrão. */
  colunas: EixoTabelaCruzada[];
  total: number;
  formatar: (v: number) => string;
  modo?: ModoCruzamento;
  calor?: boolean;
  /** Chaves CONGELADAS (na ordem) — de qualquer coluna, inclusive `COL_*`. */
  fixadas: string[];
  /** Ordem das colunas LIVRES montada arrastando. */
  ordemManual?: string[];
  /** Largura (px) por coluna; ausente = a padrão do tipo. */
  larguras: Record<string, number>;
  /** Colunas OCULTAS — na edição aparecem esmaecidas. */
  ocultas?: string[];
  ordem: OrdemCruzamento;
  /** Ordena as linhas (alterna a cada toque). */
  onOrdenar: (por: OrdemCruzamento["por"]) => void;
  /** Origem do número: linha e/ou coluna (`null` = todas). */
  onAbrir?: (linha: string | null, coluna: string | null) => void;
  ativa?: { linha: string | null; coluna: string | null } | null;
  /** Modo de EDIÇÃO da planilha (ausente = só consulta). */
  edicao?: EdicaoTabelaCruzada;
  vazio: ReactNode;
  resumo?: ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const rolagem = useRef<HTMLDivElement>(null);
  const altura = useAlturaAteOFim(ref, true);
  const linhasAdm = useLinhasTabela();
  const [limite, setLimite] = useState<number>(linhasAdm);
  const [page, setPage] = useState(1);
  const [arrasto, setArrasto] = useState<Arrasto | null>(null);
  const arrastou = useRef(false);
  const editando = edicao != null;
  const fora = useMemo(() => new Set(ocultas), [ocultas]);

  // TODAS as colunas por chave, na ordem PADRÃO (rótulo, extra, total, valores).
  const porChave = useMemo(() => {
    const m = new Map<string, Coluna>();
    m.set(COL_ROTULO, { chave: COL_ROTULO, tipo: "rotulo", rotulo: rotuloLinhas, total, j: -1 });
    if (rotuloExtra != null) m.set(COL_EXTRA, { chave: COL_EXTRA, tipo: "extra", rotulo: rotuloExtra, total: 0, j: -1 });
    m.set(COL_TOTAL, { chave: COL_TOTAL, tipo: "total", rotulo: "Total", total, j: -1 });
    colunas.forEach((c, j) => {
      m.set(c.chave, { chave: c.chave, tipo: "valor", rotulo: c.rotulo, total: c.total, j });
    });
    return m;
  }, [rotuloLinhas, rotuloExtra, colunas, total]);

  // A ORDEM exibida (congeladas + livres) — durante o arrasto, JÁ com a coluna no lugar onde vai ficar (a prévia).
  const ordemAtual = useMemo(() => {
    const visivel = (k: string) => editando || k === COL_ROTULO || !fora.has(k);
    const o = ordemDasColunas([...porChave.keys()], fixadas, ordemManual);
    return { fixadas: o.fixadas.filter(visivel), livres: o.livres.filter(visivel) };
  }, [porChave, fixadas, ordemManual, fora, editando]);
  const vista = arrasto ? soltarColuna(ordemAtual.fixadas, ordemAtual.livres, arrasto.chave, arrasto.destino) : ordemAtual;
  const exibidas = [...vista.fixadas, ...vista.livres].map((k) => porChave.get(k) as Coluna);
  const nCongeladas = vista.fixadas.length;
  const w = (c: Coluna) => (larguras[c.chave] ? `${larguras[c.chave]}px` : `var(${VAR_LARGURA[c.tipo]})`);

  // Quantas congeladas CABEM na largura visível (as demais seguem na frente, mas rolam) — no celular, em geral só o nome.
  const [nFix, setNFix] = useState(nCongeladas);
  const chaveFix = vista.fixadas.join("|");
  // biome-ignore lint/correctness/useExhaustiveDependencies: mede pelas congeladas (chaveFix) e larguras.
  useLayoutEffect(() => {
    const el = rolagem.current;
    const raiz = ref.current;
    if (!el || !raiz) return;
    const calc = () => {
      const cs = getComputedStyle(raiz);
      let x = 0;
      let n = 0;
      for (const k of vista.fixadas) {
        const c = porChave.get(k) as Coluna;
        x += larguras[k] ?? (Number.parseFloat(cs.getPropertyValue(VAR_LARGURA[c.tipo])) || 0);
        if (n > 0 && x > el.clientWidth * 0.6) break; // as congeladas usam no máximo ~60% da largura visível
        n++;
      }
      setNFix(n);
    };
    calc();
    const ro = new ResizeObserver(calc);
    ro.observe(el);
    return () => ro.disconnect();
  }, [chaveFix, larguras, porChave]);
  const esquerda = (p: number): CSSProperties => {
    const antes = exibidas.slice(0, p).map(w);
    return { left: antes.length ? `calc(${antes.join(" + ")})` : 0 };
  };

  const maxAbs = useMemo(() => (calor ? Math.max(0, ...linhas.flatMap((l) => l.valores.map(Math.abs))) : 0), [calor, linhas]);
  const pages = Math.max(1, Math.ceil(linhas.length / limite));
  const pg = Math.min(page, pages);
  const visiveis = linhas.slice((pg - 1) * limite, pg * limite);

  const texto = (v: number, bases: { linha: number; coluna: number }) => {
    if (zerado(v)) return "–";
    const base = basePercentual(modo, { ...bases, geral: total });
    return base == null ? formatar(v) : fmtPct(percentual(v, base));
  };
  const fundo = (v: number): CSSProperties | undefined =>
    calor && maxAbs > 0 && !zerado(v)
      ? { background: `color-mix(in srgb, var(${v < 0 ? "--danger" : "--accent"}) ${Math.round(4 + (Math.abs(v) / maxAbs) * 22)}%, transparent)` }
      : undefined;
  const ehAtiva = (l: string | null, c: string | null) => ativa != null && ativa.linha === l && ativa.coluna === c;
  const anelAtivo = "outline outline-2 -outline-offset-2 outline-[var(--accent)]";

  const seta = (por: OrdemCruzamento["por"]) => {
    const igual = typeof por === "object" ? typeof ordem.por === "object" && ordem.por.coluna === por.coluna : ordem.por === por;
    if (!igual) return null;
    const Seta = ordem.desc ? IconArrowDown : IconArrowUp;
    return <Seta className="h-3 w-3 shrink-0 text-accent" aria-hidden />;
  };
  const ariaSort = (por: OrdemCruzamento["por"]) => (seta(por) ? (ordem.desc ? "descending" : "ascending") : undefined);

  // Um clique numa célula (delegado — milhares de células sem um manipulador cada).
  const alvoCelula = (e: MouseEvent | KeyboardEvent) => {
    const td = (e.target as HTMLElement).closest<HTMLElement>("[data-l],[data-c]");
    if (!td || !onAbrir) return;
    onAbrir(td.dataset.l || null, td.dataset.c || null);
  };
  const teclado = (e: KeyboardEvent) => {
    if (e.key !== "Enter" && e.key !== " ") return;
    e.preventDefault();
    alvoCelula(e);
  };

  // ARRASTAR (edição): o nome da coluna é a alça — mouse ou toque (pointer capture). A coluna segue o cursor no MESMO ponto
  // em que foi pega; o destino = antes da 1ª coluna (sem a arrastada) cujo meio fica à direita do cursor; a tabela rola
  // sozinha perto das bordas. Um toque SEM arrastar ordena.
  const iniciarArrasto = (e: ReactPointerEvent<HTMLButtonElement>, chave: string) => {
    if (!edicao || e.button > 0) return;
    const el = e.currentTarget;
    const th = el.closest("th");
    const rolo = rolagem.current;
    if (!th || !rolo) return;
    el.setPointerCapture(e.pointerId);
    const caixa = th.getBoundingClientRect();
    const pega = { dx: e.clientX - caixa.left, dy: e.clientY - caixa.top, largura: caixa.width };
    const x0 = e.clientX;
    const y0 = e.clientY;
    let ativo = false;
    let ultimo = { x: x0, y: y0 };
    let destino = 0;
    let vel = 0;
    let quadro = 0;
    arrastou.current = false;
    const calcular = () => {
      const lista = [...(ref.current?.querySelectorAll<HTMLElement>("thead th[data-col]") ?? [])].filter((c) => c.dataset.col !== chave);
      const i = lista.findIndex((c) => {
        const r = c.getBoundingClientRect();
        return ultimo.x < r.left + r.width / 2;
      });
      destino = i < 0 ? lista.length : i;
      setArrasto({ chave, x: ultimo.x, y: ultimo.y, ...pega, destino });
    };
    const rolar = () => {
      if (vel) {
        rolo.scrollLeft += vel;
        calcular();
      }
      quadro = requestAnimationFrame(rolar);
    };
    const corpo = document.body.style;
    const mover = (ev: PointerEvent) => {
      ultimo = { x: ev.clientX, y: ev.clientY };
      if (!ativo) {
        if (Math.hypot(ev.clientX - x0, ev.clientY - y0) < 6) return;
        ativo = true;
        arrastou.current = true;
        corpo.cursor = "grabbing";
        corpo.userSelect = "none";
        quadro = requestAnimationFrame(rolar);
      }
      const r = rolo.getBoundingClientRect();
      vel = ev.clientX < r.left + 56 ? -14 : ev.clientX > r.right - 56 ? 14 : 0;
      calcular();
    };
    const fim = (ev: PointerEvent) => {
      cancelAnimationFrame(quadro);
      el.removeEventListener("pointermove", mover);
      el.removeEventListener("pointerup", fim);
      el.removeEventListener("pointercancel", fim);
      corpo.cursor = "";
      corpo.userSelect = "";
      setArrasto(null);
      if (ativo && ev.type === "pointerup") {
        const r = soltarColuna(ordemAtual.fixadas, ordemAtual.livres, chave, destino);
        edicao.onOrdem(r.fixadas, r.livres);
      }
    };
    el.addEventListener("pointermove", mover);
    el.addEventListener("pointerup", fim);
    el.addEventListener("pointercancel", fim);
  };
  const congelar = (k: string) => {
    if (!edicao) return;
    const { fixadas: f, livres: l } = ordemAtual;
    if (f.includes(k)) edicao.onOrdem(f.filter((x) => x !== k), [k, ...l]);
    else edicao.onOrdem([...f, k], l.filter((x) => x !== k));
  };

  const cab = `sticky top-0 border-b border-border px-3 py-2 align-middle text-[12px] font-medium leading-snug text-muted ${editando ? "bg-surface-2" : "bg-surface"}`;
  const botaoCab = "flex w-full items-center gap-1 rounded-[6px] hover:text-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40";
  const direita = (c: Coluna) => c.tipo === "valor" || c.tipo === "total";

  /** O cabeçalho de uma coluna: tocar ORDENA; na edição, as ações diretas (congelar/ocultar), o nome ARRASTÁVEL e a borda de
   * largura. `p` = posição na ordem exibida. */
  const cabecalho = (c: Coluna, p: number, congelada: boolean) => {
    const dir = direita(c);
    const por = porDe(c);
    const nome = (
      <button
        type="button"
        className={`${botaoCab} ${dir ? "justify-end" : ""} ${edicao ? "cursor-grab touch-none select-none" : ""}`}
        title={edicao ? `${c.rotulo} — arraste para mover (Alt+←/→)` : c.rotulo}
        onPointerDown={edicao ? (e) => iniciarArrasto(e, c.chave) : undefined}
        onClick={() => {
          if (arrastou.current) {
            arrastou.current = false;
            return;
          }
          onOrdenar(por);
        }}
        onKeyDown={
          edicao
            ? (e) => {
                if (!e.altKey || (e.key !== "ArrowLeft" && e.key !== "ArrowRight")) return;
                e.preventDefault();
                const r = soltarColuna(ordemAtual.fixadas, ordemAtual.livres, c.chave, e.key === "ArrowLeft" ? Math.max(0, p - 1) : p + 1);
                edicao.onOrdem(r.fixadas, r.livres);
              }
            : undefined
        }
      >
        {edicao && <IconGrip className="h-3.5 w-3.5 shrink-0 text-faint" aria-hidden />}
        {dir && seta(por)}
        <span className={dir ? "line-clamp-2 break-words text-right" : "truncate"}>{c.rotulo}</span>
        {!dir && seta(por)}
      </button>
    );
    if (!edicao) return nome;
    const oculta = fora.has(c.chave);
    return (
      <>
        <div className={`mb-1 flex items-center gap-0.5 ${dir ? "justify-end" : ""}`}>
          <AcaoColuna
            rotulo={congelada ? `Descongelar ${c.rotulo}` : `Congelar ${c.rotulo}`}
            ligada={congelada}
            icone={<IconFixar className="h-3.5 w-3.5" />}
            onClick={() => congelar(c.chave)}
          />
          <AcaoColuna
            rotulo={c.tipo === "rotulo" ? "A coluna das linhas não se oculta" : oculta ? `Mostrar ${c.rotulo}` : `Ocultar ${c.rotulo}`}
            ligada={oculta}
            icone={<IconEyeOff className="h-3.5 w-3.5" />}
            onClick={() => edicao.onOcultar(c.chave)}
            disabled={c.tipo === "rotulo"}
          />
        </div>
        {nome}
        <AlcaLargura rotulo={c.rotulo} largura={larguras[c.chave]} onLargura={(px) => edicao.onLargura(c.chave, px)} />
      </>
    );
  };

  /** Classes/estilo comuns de uma célula da coluna na posição p (congelada, divisa, a SOMBRA do destino no arrasto). */
  const posicao = (c: Coluna, p: number) => {
    const fixa = p < nFix;
    const sombra = arrasto?.chave === c.chave;
    return {
      fixa,
      classe: `${fixa ? "sticky" : ""} ${fixa && p === nFix - 1 ? DIVISA : ""} ${sombra ? "!bg-accent/10 !text-transparent [&_*]:!text-transparent" : ""}`,
      estilo: { ...larguraVar(w(c)), ...(fixa ? esquerda(p) : {}) },
      esmaecida: fora.has(c.chave) ? "opacity-40" : "",
    };
  };

  /** A célula de uma linha do corpo, por tipo de coluna. */
  const celula = (c: Coluna, p: number, l: LinhaTabelaCruzada) => {
    const { fixa, classe, estilo, esmaecida } = posicao(c, p);
    const base = `${CEL} ${classe} ${fixa ? "z-10 bg-surface" : ""} group-hover/linha:bg-surface-2`;
    if (c.tipo === "rotulo")
      return (
        <th
          key={c.chave}
          scope="row"
          data-l={l.chave}
          tabIndex={onAbrir ? 0 : undefined}
          className={`${base} bg-surface text-left font-normal text-text ${onAbrir ? "cursor-pointer" : ""} ${ehAtiva(l.chave, null) ? anelAtivo : ""}`}
          style={estilo}
          title={l.rotulo}
        >
          <span className="block truncate">{l.rotulo}</span>
        </th>
      );
    if (c.tipo === "extra")
      return (
        <td key={c.chave} className={`${base} text-left text-text-2`} style={estilo} title={l.extra}>
          <span className={`block truncate ${esmaecida}`}>{l.extra || <span className="text-faint">–</span>}</span>
        </td>
      );
    const v = c.tipo === "total" ? l.total : l.valores[c.j];
    const zero = zerado(v);
    const dataC = c.tipo === "valor" ? c.chave : undefined;
    return (
      <td
        key={c.chave}
        data-l={l.chave}
        data-c={dataC}
        tabIndex={onAbrir && !zero ? 0 : undefined}
        className={`${base} whitespace-nowrap text-right tabular-nums ${c.tipo === "total" ? "font-semibold text-text" : zero ? "text-faint" : "text-text-2"} ${
          onAbrir && !zero ? "cursor-pointer hover:text-accent" : ""
        } ${ehAtiva(l.chave, dataC ?? null) ? anelAtivo : ""}`}
        style={{ ...estilo, ...(c.tipo === "valor" && !fixa ? fundo(v) : {}) }}
      >
        <span className={esmaecida}>{texto(v, { linha: l.total, coluna: c.tipo === "total" ? total : c.total })}</span>
      </td>
    );
  };

  /** A célula da linha TOTAL (rodapé fixo), por tipo de coluna. */
  const celulaTotal = (c: Coluna, p: number) => {
    const { fixa, classe, estilo, esmaecida } = posicao(c, p);
    const base = `${CEL} ${classe} sticky bottom-0 border-t border-border bg-surface-2 ${fixa ? "z-30" : "z-20"}`;
    if (c.tipo === "extra") return <td key={c.chave} className={base} style={estilo} />;
    const geral = c.tipo !== "valor"; // o rótulo e o Total do rodapé = o total geral
    return (
      <td
        key={c.chave}
        data-l={geral ? "" : undefined}
        data-c={geral ? "" : c.chave}
        tabIndex={onAbrir ? 0 : undefined}
        className={`${base} whitespace-nowrap tabular-nums ${c.tipo === "rotulo" ? "text-left" : "text-right"} ${onAbrir ? "cursor-pointer hover:text-accent" : ""} ${
          ehAtiva(null, geral ? null : c.chave) ? anelAtivo : ""
        }`}
        style={estilo}
      >
        <span className={esmaecida}>{c.tipo === "rotulo" ? "Total" : texto(c.total, { linha: total, coluna: c.tipo === "total" ? total : c.total })}</span>
      </td>
    );
  };

  const presa = arrasto ? (porChave.get(arrasto.chave) as Coluna) : null;

  return (
    <div
      ref={ref}
      className={`${LARGURAS} flex flex-col overflow-clip rounded-card border bg-surface ${editando ? "border-accent/50" : "border-border"}`}
      style={{
        ...(altura != null ? { height: altura } : {}),
        ...Object.fromEntries(
          [...porChave.values()].filter((c) => c.tipo !== "valor" && larguras[c.chave]).map((c) => [VAR_LARGURA[c.tipo], `${larguras[c.chave]}px`]),
        ),
      }}
      suppressHydrationWarning
    >
      {linhas.length === 0 || colunas.length === 0 ? (
        <p className="grid flex-1 place-items-center px-4 py-12 text-center text-[13px] text-faint">{vazio}</p>
      ) : (
        <div ref={rolagem} className="max-h-[75dvh] min-h-0 flex-1 overflow-auto overscroll-contain lg:max-h-none">
          <table className="w-max border-separate border-spacing-0 text-[13px]">
            <thead>
              <tr>
                {exibidas.map((c, p) => {
                  const { fixa, classe, estilo } = posicao(c, p);
                  return (
                    <th
                      key={c.chave}
                      scope="col"
                      data-col={c.chave}
                      aria-sort={ariaSort(porDe(c))}
                      className={`${cab} ${classe} ${fixa ? "z-30" : "z-20"} ${direita(c) ? "text-right" : "text-left"}`}
                      style={estilo}
                    >
                      {cabecalho(c, p, p < nCongeladas)}
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody onClick={alvoCelula} onKeyDown={teclado}>
              {visiveis.map((l) => (
                <tr key={l.chave} className="group/linha">
                  {exibidas.map((c, p) => celula(c, p, l))}
                </tr>
              ))}
            </tbody>
            <tfoot onClick={alvoCelula} onKeyDown={teclado}>
              <tr className="font-semibold text-text">{exibidas.map((c, p) => celulaTotal(c, p))}</tr>
            </tfoot>
          </table>
        </div>
      )}

      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1.5 border-t border-border px-3 py-1.5 text-[12.5px] text-muted">
        <span>{resumo}</span>
        <div className="flex flex-wrap items-center gap-2">
          <label className="flex items-center gap-1.5">
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
          {pages > 1 && <Pager page={pg} pages={pages} onChange={setPage} />}
        </div>
      </div>
      <AlturaNoHtml />
      {/* A coluna PRESA ao cursor (no mesmo ponto em que foi pega): o nome + os primeiros valores. */}
      {arrasto &&
        presa &&
        createPortal(
          <div
            aria-hidden
            className="pointer-events-none fixed z-[300] -rotate-1 overflow-hidden rounded-control border border-accent/60 bg-surface text-[13px] shadow-soft"
            style={{ left: arrasto.x - arrasto.dx, top: arrasto.y - arrasto.dy, width: arrasto.largura }}
          >
            <div className="flex items-center gap-1 border-b border-border bg-surface-2 px-3 py-2 text-[12px] font-medium text-text">
              <IconGrip className="h-3.5 w-3.5 shrink-0 text-accent" />
              <span className="truncate">{presa.rotulo}</span>
            </div>
            {visiveis.slice(0, 6).map((l) => (
              <div key={l.chave} className={`truncate border-b border-border/60 px-3 py-1.5 tabular-nums text-text-2 ${direita(presa) ? "text-right" : ""}`}>
                {presa.tipo === "rotulo"
                  ? l.rotulo
                  : presa.tipo === "extra"
                    ? l.extra || "–"
                    : texto(presa.tipo === "total" ? l.total : l.valores[presa.j], { linha: l.total, coluna: presa.total })}
              </div>
            ))}
          </div>,
          document.body,
        )}
    </div>
  );
}
