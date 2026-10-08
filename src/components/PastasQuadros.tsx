"use client";

import Link from "next/link";
import { type KeyboardEvent, type ReactNode, type PointerEvent as ReactPointerEvent, type RefObject, useEffect, useLayoutEffect, useRef, useState } from "react";
import { textoSobre } from "@/lib/color";
import { num } from "@/lib/format";
import type { QuadroCard as QuadroCardDados } from "@/lib/tarefas";
import { type ConjuntoQuadros, type DestinoGrade, type ItemGrade, itensDaGrade, type PastasQuadros } from "@/lib/tarefas-core";
import { CartaoPreso } from "./ArrastoCartoes";
import { IconClose, IconLock, IconNenhum, IconPasta, IconPastaAberta } from "./icons";
import { duracaoMotionMs } from "./Modal";
import { CapaQuadro, QuadroCard } from "./QuadroCard";
import { segurar } from "./segurar";
import { toast } from "./Toast";

/** A grade das pastas/quadros: colunas de no mínimo 15rem (a MESMA da `GradeQuadros` — o card nunca muda de forma). */
const GRADE = "grid grid-cols-[repeat(auto-fill,minmax(min(100%,15rem),1fr))] gap-3";

/** Os ângulos das FOLHAS em leque (a de trás primeiro). */
const LEQUE = [-2.5, 2, 0];

/**
 * O DESENHO de uma PASTA (compartilhado por Tarefas e Catálogo), na MESMA célula/altura do card de espaço: a ABA no topo
 * com o ícone, as COSTAS no tom da cor, as FOLHAS saindo (as `folhas` — capas de até 3 itens dela, em leque; vazia =
 * folhas lisas) e a FRENTE na cor, com o `rotulo` ("Pasta · N quadros"), o nome e os `chips`. Com o mouse/foco a pasta
 * ENTREABRE (a frente inclina e as folhas sobem); aberta, abre mais com o contorno accent; `alvo` = um item arrastado
 * sobre ela (abre de vez + "Soltar na pasta"; `recusa` = o que não pode entrar, em vermelho); `recebeu` = o pulso de quando
 * um item entra. `href` = um LINK (o Catálogo entra na tela da pasta); senão, botão de abrir/fechar no lugar
 * (`onAlternar`, Tarefas). `menu` = as ações, fora do botão. A PRIVADA leva o cadeado na aba e o selo "Privada".
 */
export function PastaCartao({
  nome,
  cor,
  privado = false,
  rotulo,
  folhas,
  chips,
  ariaLabel,
  href,
  aberta = false,
  alvo = false,
  recusa = false,
  recebeu = false,
  onAlternar,
  menu,
}: {
  nome: string;
  cor: string;
  privado?: boolean;
  rotulo: string;
  /** As capas (até 3 usadas) das folhas em leque — `key` única em cada. */
  folhas: ReactNode[];
  chips?: ReactNode;
  ariaLabel: string;
  href?: string;
  aberta?: boolean;
  alvo?: boolean;
  /** O item arrastado sobre ela NÃO pode entrar (o aviso vermelho no lugar do "Soltar na pasta"). */
  recusa?: boolean;
  recebeu?: boolean;
  onAlternar?: () => void;
  menu?: ReactNode;
}) {
  const Icone = aberta || alvo ? IconPastaAberta : IconPasta;
  const tinta = textoSobre(cor);
  const capas = folhas.slice(0, 3);
  // Quanto a pasta abre: fechada (entreabre no hover/foco), aberta, alvo de um arrasto.
  const frente = alvo ? "[transform:rotateX(-26deg)]" : aberta ? "[transform:rotateX(-18deg)]" : "group-hover:[transform:rotateX(-10deg)] group-focus-visible:[transform:rotateX(-10deg)]";
  const sobe = alvo || aberta ? "-translate-y-3" : "group-hover:-translate-y-2 group-focus-visible:-translate-y-2";
  const destaque = alvo || aberta;
  const mov = "transition-transform duration-[var(--motion-duration)] ease-[var(--motion-ease)]";
  const classe = "group flex h-full min-h-[14rem] w-full flex-col rounded-card text-left [perspective:900px] focus:outline-none focus-visible:ring-4 focus-visible:ring-accent/30";
  const corpo = (
    <>
      {/* A ABA. */}
      <span
        aria-hidden
        className={`flex h-6 w-[42%] min-w-24 items-center gap-1.5 rounded-t-lg px-2.5 text-white ${destaque ? "ring-2 ring-accent ring-offset-0" : ""}`}
        style={{ background: `color-mix(in srgb, ${cor} 78%, #000)` }}
      >
        <Icone className="h-3.5 w-3.5 shrink-0" />
        {privado && <IconLock className="h-3 w-3 shrink-0" />}
      </span>
      {/* O corpo em CAMADAS (sem corte): as COSTAS atrás, as FOLHAS por cima — ultrapassando o contorno de cima das
          costas, o efeito 3D — e a FRENTE na frente. */}
      <span className="relative flex-1">
        <span
          aria-hidden
          className={`absolute inset-0 rounded-card rounded-tl-none shadow-ring ${destaque ? "ring-2 ring-accent" : ""}`}
          style={{ background: `color-mix(in srgb, ${cor} 55%, var(--surface))` }}
        />
        <span aria-hidden className={`absolute inset-x-[14%] top-3 z-10 h-[58%] ${mov} ${sobe}`}>
          {(capas.length ? capas : [null, null]).map((c, i, l) => (
            <span
              key={i}
              className="absolute inset-x-0 top-0 overflow-hidden rounded-md bg-surface p-0.5 shadow-soft"
              style={{ rotate: `${LEQUE[i + (3 - l.length)]}deg`, top: `${i * 6}px` }}
            >
              {c ?? <span className="block aspect-video w-full rounded-[5px] bg-surface-2" />}
            </span>
          ))}
        </span>
        {(alvo || recusa) && (
          <span className="absolute top-3 right-12 left-2 z-30 text-center text-[12px] font-semibold" style={{ color: recusa ? "var(--danger)" : "var(--accent)" }}>
            <span className="inline-flex items-center gap-1 rounded-full bg-surface px-2 py-0.5 shadow-soft">
              {recusa && <IconNenhum className="h-3.5 w-3.5" />}
              {recusa ? "Não pode entrar" : "Soltar na pasta"}
            </span>
          </span>
        )}
        {/* A FRENTE (na cor), com a etiqueta. */}
        <span
          className={`absolute inset-x-0 bottom-0 z-20 flex h-[58%] origin-bottom flex-col rounded-card px-3 pt-2.5 pb-2 shadow-[0_-6px_14px_-8px_rgba(0,0,0,0.35)] ${mov} ${frente}`}
          style={{ background: `linear-gradient(180deg, color-mix(in srgb, ${cor} 82%, #fff), ${cor})`, color: tinta }}
        >
          <span className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide">
            <span className="opacity-80">{rotulo}</span>
            {privado && (
              <span className="inline-flex items-center gap-1 rounded-full bg-black/20 px-1.5 py-px normal-case tracking-normal">
                <IconLock className="h-3 w-3" /> Privada
              </span>
            )}
          </span>
          <span className="mt-0.5 line-clamp-2 text-[15px] font-bold leading-snug" title={nome}>
            {nome}
          </span>
          {chips && <span className="mt-auto flex flex-wrap items-center gap-1.5 text-[11.5px] font-semibold">{chips}</span>}
        </span>
      </span>
    </>
  );
  return (
    <div className={`relative h-full ${recebeu ? "animate-pasta-recebe" : ""}`}>
      {href ? (
        <Link href={href} aria-label={ariaLabel} className={classe}>
          {corpo}
        </Link>
      ) : (
        <button type="button" onClick={onAlternar} aria-expanded={aberta} aria-label={ariaLabel} className={classe}>
          {corpo}
        </button>
      )}
      {menu && <div className="absolute top-8 right-2 rounded-control bg-surface/90 shadow-ring backdrop-blur-sm">{menu}</div>}
    </div>
  );
}

/** Um chip da frente da pasta (o fundo escuro translúcido; `alerta` = o claro com o texto vermelho). */
export function ChipPasta({ children, alerta = false }: { children: ReactNode; alerta?: boolean }) {
  return alerta ? (
    <span className="rounded-full bg-surface/90 px-2 py-0.5 tabular-nums" style={{ color: "var(--danger)" }}>
      {children}
    </span>
  ) : (
    <span className="rounded-full bg-black/15 px-2 py-0.5 tabular-nums">{children}</span>
  );
}

/**
 * Uma PASTA de quadros — o `PastaCartao` com as capas dos quadros dela e as contagens (abertas; atrasadas em vermelho, só
 * quando há). Tocar ABRE/FECHA a pasta no lugar. `menu` = as ações (editar/excluir), fora do botão.
 */
export function PastaQuadro({
  pasta,
  quadros,
  aberta = false,
  alvo = false,
  recusa = false,
  recebeu = false,
  onAlternar,
  menu,
}: {
  pasta: ConjuntoQuadros;
  quadros: Pick<QuadroCardDados, "id" | "cor" | "fundoUrl" | "fundoAjuste" | "fundoGradiente" | "abertas" | "atrasadas" | "arquivado">[];
  aberta?: boolean;
  alvo?: boolean;
  /** O item arrastado sobre ela NÃO pode entrar (o aviso vermelho no lugar do "Soltar na pasta"). */
  recusa?: boolean;
  recebeu?: boolean;
  onAlternar?: () => void;
  menu?: ReactNode;
}) {
  const abertas = quadros.reduce((s, q) => s + (q.arquivado ? 0 : q.abertas), 0);
  const atrasadas = quadros.reduce((s, q) => s + (q.arquivado ? 0 : q.atrasadas), 0);
  return (
    <PastaCartao
      nome={pasta.nome}
      cor={pasta.cor}
      privado={pasta.privado}
      rotulo={`Pasta · ${num(quadros.length)} ${quadros.length === 1 ? "quadro" : "quadros"}`}
      folhas={quadros.slice(0, 3).map((q) => (
        <CapaQuadro key={q.id} quadro={q} />
      ))}
      chips={
        <>
          <ChipPasta>{num(abertas)} abertas</ChipPasta>
          {atrasadas > 0 && (
            <ChipPasta alerta>
              {num(atrasadas)} {atrasadas === 1 ? "atrasada" : "atrasadas"}
            </ChipPasta>
          )}
        </>
      }
      ariaLabel={`${aberta ? "Fechar" : "Abrir"} a pasta ${pasta.privado ? "privada " : ""}${pasta.nome} (${quadros.length} ${quadros.length === 1 ? "quadro" : "quadros"})`}
      aberta={aberta}
      alvo={alvo}
      recusa={recusa}
      recebeu={recebeu}
      onAlternar={onAlternar}
      menu={menu}
    />
  );
}

/** Para onde o item arrastado vai: uma área (`null` = a raiz; senão, a pasta aberta) + o vizinho VISÍVEL — ou DENTRO de uma pasta. */
/** `fora` = o ponteiro está FORA da grade: numa ZONA de soltura (`[data-zona-arrasto]` — lixeira, painel) ou em lugar
 * nenhum ("fora") — sem sombra na grade. */
type DestinoArrasto = { area: string | null; antesDe: string | null; depoisDe: string | null; dentro: string | null; fora?: string | null };
export type ArrastoGrade = {
  chave: string;
  x: number;
  y: number;
  dx: number;
  dy: number;
  largura: number;
  altura: number;
  destino: DestinoArrasto;
  pousando?: boolean;
  entrando?: boolean;
};

const LIMIAR = 6;
const TOQUE_MS = 400;
const BORDA = 64;
const VEL = 14;
const chaveDestino = (d: DestinoArrasto) => `${d.area}|${d.antesDe}|${d.depoisDe}|${d.dentro}|${d.fora ?? ""}`;

/** O contêiner que ROLA acima do elemento (o corpo de um modal), ou `null` = a página. */
function rolagemDe(el: HTMLElement): HTMLElement | null {
  for (let p = el.parentElement; p; p = p.parentElement) {
    const o = getComputedStyle(p).overflowY;
    if ((o === "auto" || o === "scroll") && p.scrollHeight > p.clientHeight + 1) return p;
  }
  return null;
}

/**
 * ARRASTAR os cards de uma GRADE (pastas e quadros) — o MESMO padrão do arrasto dos cartões do quadro (`ArrastoCartoes`):
 * ouvintes na JANELA, começa depois de 6px (no TOQUE, depois de SEGURAR ~400 ms — mexer antes rola a tela), `segurar()`,
 * o card PRESO anda no DOM (`translate3d`) e só o DESTINO re-renderiza, a tela rola sozinha perto das bordas e, ao
 * soltar, o card POUSA no lugar sombreado (ou ENCOLHE para dentro da pasta) antes de a ordem mudar. O clique logo depois
 * do arrasto é engolido. O DOM: `[data-grade-area]` (a raiz = "", a pasta aberta = o id) › `[data-grade-item]`;
 * `[data-pasta-id]` = o card da pasta; `[data-painel-pasta]` = o painel da pasta aberta.
 */
/** O retângulo de LAYOUT do elemento: sem a translação do `transform` (o FLIP que desliza os cartões) — medir durante a
 * animação fazia o destino mudar a cada quadro (o cartão tremia). */
function rectDeLayout(el: Element) {
  const r = el.getBoundingClientRect();
  const t = getComputedStyle(el).transform;
  if (!t || t === "none") return r;
  const m = new DOMMatrixReadOnly(t);
  return { left: r.left - m.e, right: r.right - m.e, top: r.top - m.f, bottom: r.bottom - m.f, width: r.width, height: r.height };
}
const dentroDe = (p: { x: number; y: number }, r: { left: number; right: number; top: number; bottom: number }) =>
  p.x >= r.left && p.x <= r.right && p.y >= r.top && p.y <= r.bottom;

export function useArrastoGrade({
  raiz,
  onSoltar,
  aceitaDentro,
  zonas,
}: {
  raiz: RefObject<HTMLElement | null>;
  /** ZONAS fora da grade: `limite` = fora dele o ponteiro não está na grade (sem sombra); os elementos
   * `[data-zona-arrasto="<nome>"]` sob o ponteiro viram o destino `fora`; `aceita` = soltar ali vale (o card ENCOLHE
   * para dentro da zona); senão o card VOLTA ao lugar de origem. */
  zonas?: { limite?: RefObject<HTMLElement | null>; aceita: (chave: string, zona: string) => boolean };
  onSoltar?: (chave: string, destino: DestinoArrasto) => void;
  /** A pasta ACEITA o item? Sobre a que recusa, soltar não pousa dentro (quem chama nega o arrasto). */
  aceitaDentro?: (chave: string, pastaId: string) => boolean;
}) {
  const [arrasto, setArrasto] = useState<ArrastoGrade | null>(null);
  const fantasma = useRef<HTMLDivElement>(null);
  const encerrar = useRef<(() => void) | null>(null);
  const arrastou = useRef(false);
  useEffect(() => () => encerrar.current?.(), []);

  const iniciar = (e: ReactPointerEvent<HTMLElement>, chave: string) => {
    if (!onSoltar || !e.isPrimary || e.button > 0 || arrasto?.pousando) return;
    const item = e.currentTarget;
    const grade = raiz.current;
    if (!grade) return;
    encerrar.current?.();
    arrastou.current = false;
    const toque = e.pointerType === "touch";
    const ehPasta = chave.startsWith("p:");
    const caixa = item.getBoundingClientRect();
    const pega = { dx: e.clientX - caixa.left, dy: e.clientY - caixa.top, largura: caixa.width, altura: caixa.height };
    const ponteiro = e.pointerId;
    const x0 = e.clientX;
    const y0 = e.clientY;
    const rolo = rolagemDe(grade);
    let ativo = false;
    let ultimo = { x: x0, y: y0 };
    let destino: DestinoArrasto = { area: null, antesDe: null, depoisDe: null, dentro: null };
    let inicial = "";
    let velY = 0;
    let raf = 0;
    let espera = 0;
    let soltarCursor: (() => void) | null = null;
    const soltarSelecao = toque ? () => {} : segurar("");

    const calcular = () => {
      // FORA da grade: a zona sob o ponteiro (lixeira, painel) ou lugar nenhum — sem sombra.
      if (zonas) {
        let fora: string | null = null;
        for (const z of document.querySelectorAll<HTMLElement>("[data-zona-arrasto]")) if (dentroDe(ultimo, z.getBoundingClientRect())) fora = z.dataset.zonaArrasto ?? null;
        const lim = zonas.limite?.current;
        if (!fora && lim && !dentroDe(ultimo, lim.getBoundingClientRect())) fora = "fora";
        if (fora) {
          const novo: DestinoArrasto = { area: null, antesDe: null, depoisDe: null, dentro: null, fora };
          if (chaveDestino(novo) === chaveDestino(destino) && inicial) return;
          if (fora !== destino.fora && zonas.aceita(chave, fora)) navigator.vibrate?.(10);
          destino = novo;
          if (!inicial) inicial = chaveDestino(novo);
          return setArrasto({ chave, x: ultimo.x, y: ultimo.y, ...pega, destino });
        }
      }
      // A ÁREA: o painel da pasta aberta sob o ponteiro (só quadros entram nela), senão a raiz.
      let area: string | null = null;
      if (!ehPasta)
        for (const p of grade.querySelectorAll<HTMLElement>("[data-painel-pasta]")) {
          const r = rectDeLayout(p);
          if (r.height > 8 && dentroDe(ultimo, r)) area = p.dataset.painelPasta ?? null;
        }
      const el = area == null ? grade : grade.querySelector<HTMLElement>(`[data-grade-area="${CSS.escape(area)}"]`);
      if (!el) return;
      const itens = [...el.querySelectorAll<HTMLElement>(":scope > [data-grade-item]")].filter((i) => i.dataset.gradeItem !== chave);
      let novo: DestinoArrasto = { area, antesDe: null, depoisDe: null, dentro: null };
      // DENTRO de uma pasta: o quadro sobre o MEIO do card da pasta. A SOMBRA fica onde estava (a grade não se mexe —
      // senão a pasta fugiria de baixo do dedo).
      if (!ehPasta && area == null) {
        for (const i of itens) {
          const id = i.dataset.pastaId;
          if (!id) continue;
          const r = rectDeLayout(i);
          const mx = r.width * 0.2;
          const my = r.height * 0.15;
          if (ultimo.x > r.left + mx && ultimo.x < r.right - mx && ultimo.y > r.top + my && ultimo.y < r.bottom - my) novo = { ...destino, dentro: id };
        }
      }
      // O ponteiro já está sobre a SOMBRA (o lugar escolhido): nada muda — sem isso a sombra empurrava o cartão-alvo, o
      // destino voltava, a sombra saía, o cartão voltava… (o vai-e-vem).
      const sombra = inicial && !novo.dentro && novo.area === destino.area ? el.querySelector<HTMLElement>(":scope > [data-sombra-grade]") : null;
      if (sombra && dentroDe(ultimo, rectDeLayout(sombra))) return;
      if (!novo.dentro) {
        // A POSIÇÃO: antes do 1º item que está depois do ponteiro na ordem de leitura; senão, depois do último.
        const antes = itens.find((i) => {
          const r = rectDeLayout(i);
          return ultimo.y < r.top || (ultimo.y <= r.bottom && ultimo.x < r.left + r.width / 2);
        });
        novo = antes ? { ...novo, antesDe: antes.dataset.gradeItem ?? null } : { ...novo, depoisDe: itens.at(-1)?.dataset.gradeItem ?? null };
      }
      if (chaveDestino(novo) === chaveDestino(destino) && inicial) return;
      destino = novo;
      if (!inicial) inicial = chaveDestino(novo);
      setArrasto({ chave, x: ultimo.x, y: ultimo.y, ...pega, destino });
    };
    const moverFantasma = () => {
      if (fantasma.current) fantasma.current.style.transform = `translate3d(${ultimo.x - pega.dx}px, ${ultimo.y - pega.dy}px, 0)`;
    };
    const rolar = () => {
      if (velY) {
        if (rolo) rolo.scrollTop += velY;
        else window.scrollBy(0, velY);
        calcular();
      }
      raf = requestAnimationFrame(rolar);
    };
    const ativar = () => {
      ativo = true;
      arrastou.current = true;
      soltarCursor = segurar("grabbing");
      if (toque) navigator.vibrate?.(12);
      calcular();
      raf = requestAnimationFrame(rolar);
    };
    // No TOQUE: segurar parado ativa; mexer antes disso é rolagem (o arrasto não começa).
    if (toque) espera = window.setTimeout(ativar, TOQUE_MS);
    const mover = (ev: PointerEvent) => {
      if (ev.pointerId !== ponteiro) return;
      ultimo = { x: ev.clientX, y: ev.clientY };
      if (!ativo) {
        const d = Math.hypot(ev.clientX - x0, ev.clientY - y0);
        if (toque) {
          if (d > 8) limpar();
          return;
        }
        if (d < LIMIAR) return;
        ativar();
      }
      if (ev.cancelable) ev.preventDefault();
      moverFantasma();
      calcular();
      // Sobre uma ZONA (lixeira, painel) a lista não rola sozinha.
      const r = rolo ? rolo.getBoundingClientRect() : { top: 0, bottom: window.innerHeight };
      velY = destino.fora && destino.fora !== "fora" ? 0 : ev.clientY < r.top + BORDA ? -VEL : ev.clientY > r.bottom - BORDA ? VEL : 0;
    };
    // O toque ATIVO não pode rolar a tela (e o menu do "segurar" do navegador não abre).
    const travarToque = (ev: TouchEvent) => {
      if (ativo && ev.cancelable) ev.preventDefault();
    };
    const semMenu = (ev: Event) => ev.preventDefault();
    const limpar = () => {
      window.clearTimeout(espera);
      cancelAnimationFrame(raf);
      window.removeEventListener("pointermove", mover);
      window.removeEventListener("pointerup", fim);
      window.removeEventListener("pointercancel", fim);
      window.removeEventListener("touchmove", travarToque);
      window.removeEventListener("contextmenu", semMenu);
      soltarCursor?.();
      soltarSelecao();
      encerrar.current = null;
    };
    const fim = (ev: PointerEvent) => {
      if (ev.pointerId !== ponteiro) return;
      limpar();
      if (ativo) window.setTimeout(() => (arrastou.current = false), 0);
      if (!ativo || ev.type !== "pointerup") return setArrasto(null);
      const final = destino;
      const ms0 = duracaoMotionMs();
      // FORA da grade: na zona que aceita, o card ENCOLHE para dentro dela; senão VOLTA ao lugar de origem.
      if (final.fora) {
        const z = zonas?.aceita(chave, final.fora) ? document.querySelector<HTMLElement>(`[data-zona-arrasto="${CSS.escape(final.fora)}"]`) : null;
        if (z) {
          const r = z.getBoundingClientRect();
          const aplicar = () => {
            setArrasto(null);
            onSoltar(chave, final);
          };
          if (ms0 <= 0) return aplicar();
          setArrasto({ chave, x: r.left + r.width / 2 - pega.largura / 2 + pega.dx, y: r.top + r.height / 2 - pega.altura / 2 + pega.dy, ...pega, destino: final, pousando: true, entrando: true });
          return void window.setTimeout(aplicar, ms0);
        }
        if (ms0 <= 0) return setArrasto(null);
        setArrasto({ chave, x: caixa.left + pega.dx, y: caixa.top + pega.dy, ...pega, destino: final, pousando: true });
        return void window.setTimeout(() => setArrasto(null), ms0);
      }
      // Soltou onde estava: nada muda.
      if (!final.dentro && chaveDestino(final) === inicial) return setArrasto(null);
      // A pasta RECUSA o item: nada de pousar dentro dela (quem chama nega o arrasto).
      if (final.dentro && aceitaDentro && !aceitaDentro(chave, final.dentro)) {
        setArrasto(null);
        return onSoltar(chave, final);
      }
      const aplicar = () => {
        setArrasto(null);
        onSoltar(chave, final);
      };
      const ms = duracaoMotionMs();
      const lugar = final.dentro
        ? grade.querySelector<HTMLElement>(`[data-pasta-id="${CSS.escape(final.dentro)}"]`)?.getBoundingClientRect()
        : grade.querySelector<HTMLElement>("[data-sombra-grade]")?.getBoundingClientRect();
      if (!lugar || ms <= 0) return aplicar();
      // POUSA: voa até a sombra — ou ENCOLHE até o meio da pasta.
      const x = final.dentro ? lugar.left + lugar.width / 2 - pega.largura / 2 + pega.dx : lugar.left + pega.dx;
      const y = final.dentro ? lugar.top + lugar.height / 2 - pega.altura / 2 + pega.dy : lugar.top + pega.dy;
      setArrasto({ chave, x, y, ...pega, destino: final, pousando: true, entrando: !!final.dentro });
      window.setTimeout(aplicar, ms);
    };
    encerrar.current = limpar;
    window.addEventListener("pointermove", mover, { passive: false });
    window.addEventListener("pointerup", fim);
    window.addEventListener("pointercancel", fim);
    window.addEventListener("touchmove", travarToque, { passive: false });
    window.addEventListener("contextmenu", semMenu);
  };

  /** O último gesto foi um ARRASTO (o clique que vem depois não abre nada). */
  const foiArrasto = () => {
    const f = arrastou.current;
    arrastou.current = false;
    return f;
  };
  return { arrasto, fantasma, iniciar, foiArrasto };
}

/** O LUGAR onde o card vai cair: só o ESPAÇO vazio, no tamanho da célula (sem contorno nem fundo). */
export function SombraGrade({ altura, marcada = false }: { altura: number; /** Desenha o lugar (tracejado accent) — ex.: os fluxos da Automação. */ marcada?: boolean }) {
  return (
    <div
      data-sombra-grade
      aria-hidden
      className={marcada ? "rounded-card border-2 border-dashed border-accent/50 bg-accent/5 transition-colors duration-[var(--motion-duration)]" : undefined}
      style={{ minHeight: altura }}
    />
  );
}

/** A pasta ABERTA por último neste aparelho (conveniência — `localStorage`, com try/catch). */
const CHAVE_ABERTA = "tarefas:pasta-aberta";

/**
 * O PAINEL de uma pasta aberta: ocupa a linha inteira da grade logo abaixo da linha da pasta e ABRE/FECHA animando a
 * altura (`grid-template-rows` 0fr ↔ 1fr) — os cards de baixo deslizam junto; os de dentro entram em sequência.
 */
function PainelPasta({ pasta, aberto, onFechado, onFechar, children }: { pasta: ConjuntoQuadros; aberto: boolean; onFechado: () => void; onFechar: () => void; children: ReactNode }) {
  const [visivel, setVisivel] = useState(false);
  const fechado = useRef(onFechado);
  fechado.current = onFechado;
  useEffect(() => {
    // Monta FECHADO e abre no quadro seguinte (a transição roda); fechar sem movimento (reduzido) desmonta na hora.
    const r = requestAnimationFrame(() => setVisivel(aberto));
    if (!aberto && duracaoMotionMs() <= 0) fechado.current();
    return () => cancelAnimationFrame(r);
  }, [aberto]);
  return (
    <div
      data-painel-pasta={pasta.id}
      className="col-span-full grid transition-[grid-template-rows,opacity] duration-[var(--motion-duration)] ease-[var(--motion-ease)]"
      style={{ gridTemplateRows: visivel ? "1fr" : "0fr", opacity: visivel ? 1 : 0 }}
      onTransitionEnd={(e) => e.target === e.currentTarget && e.propertyName === "grid-template-rows" && !aberto && onFechado()}
    >
      <div className="min-h-0 overflow-hidden">
        <section aria-label={`Pasta ${pasta.nome}`}>
          {/* A ABA da pasta, colada ao topo do painel; o fechar à direita. */}
          <div className="flex items-end justify-between gap-2">
            <span
              className="inline-flex h-9 min-w-0 max-w-[70%] items-center gap-2 rounded-t-lg px-3 text-white"
              style={{ background: `color-mix(in srgb, ${pasta.cor} 78%, #000)` }}
            >
              <IconPastaAberta className="h-4 w-4 shrink-0" />
              <span className="truncate text-[14px] font-semibold">{pasta.nome}</span>
              {pasta.privado && <IconLock aria-label="Privada" className="h-3.5 w-3.5 shrink-0" />}
            </span>
            <button
              type="button"
              onClick={onFechar}
              aria-label={`Fechar a pasta ${pasta.nome}`}
              className="mb-1 grid h-11 w-11 shrink-0 place-items-center rounded-control text-muted hover:bg-surface-2 hover:text-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40 lg:h-8 lg:w-8"
            >
              <IconClose className="h-4 w-4" />
            </button>
          </div>
          <div
            className="rounded-card rounded-tl-none border p-[var(--pad-card)]"
            style={{ background: `color-mix(in srgb, ${pasta.cor} 14%, var(--surface-2))`, borderColor: `color-mix(in srgb, ${pasta.cor} 40%, var(--border))` }}
          >
            {children}
          </div>
        </section>
      </div>
    </div>
  );
}

/**
 * A GRADE de quadros com PASTAS — a MESMA na tela de Tarefas e no "Mudar de quadros": as pastas e os quadros soltos na
 * ORDEM da pessoa (`itensDaGrade`). Tocar numa pasta a ABRE no lugar (o painel entra abaixo da linha dela, empurrando os
 * cards); ARRASTAR (`useArrastoGrade`) reordena, põe um quadro numa pasta (soltar sobre ela, ou dentro da aberta) e o tira
 * dela; Alt+←/→ reordenam pelo teclado. `onMover` ausente = só leitura. `extra` = o último item (o card "Novo quadro").
 * `podeMover` = a REGRA das pastas (pública × privada): a pasta que recusa o quadro não vira alvo e soltar onde não pode
 * dá o ARRASTO NEGADO (o card sacode e o motivo aparece). `extraPasta` = o último item DENTRO da pasta aberta.
 */
export function GradePastas({
  quadros,
  estado,
  ocultarVazias = false,
  favoritos,
  onFavorito,
  atual,
  aba,
  onAbrir,
  extra,
  onMover,
  menuPasta,
  podeMover,
  extraPasta,
}: {
  quadros: QuadroCardDados[];
  estado: PastasQuadros;
  /** Com filtro/busca: sem as pastas que ficaram vazias. */
  ocultarVazias?: boolean;
  favoritos: number[];
  onFavorito?: (id: number) => void;
  atual?: number;
  aba?: string;
  onAbrir?: () => void;
  extra?: ReactNode;
  /** `raiz` = as chaves da raiz como estão na tela (a base de `moverNaGrade`). */
  onMover?: (raiz: string[], chave: string, destino: DestinoGrade) => void;
  menuPasta?: (c: ConjuntoQuadros) => ReactNode;
  /** Por que o item NÃO pode ir para o destino (`null` = pode). */
  podeMover?: (chave: string, destino: DestinoGrade) => string | null;
  extraPasta?: (c: ConjuntoQuadros) => ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const itens = itensDaGrade(quadros, estado, ocultarVazias);
  const raizChaves = itens.map((i) => i.chave);
  const [aberta, setAberta] = useState<string | null>(null);
  const [fechando, setFechando] = useState<string | null>(null);
  const [recebeu, setRecebeu] = useState<string | null>(null);
  const [colunas, setColunas] = useState(1);
  useEffect(() => {
    try {
      setAberta(localStorage.getItem(CHAVE_ABERTA));
    } catch {
      // sem armazenamento: começa fechada
    }
  }, []);
  const abrir = (id: string | null) => {
    setAberta((a) => {
      if (a && a !== id) setFechando(a);
      return id;
    });
    try {
      if (id) localStorage.setItem(CHAVE_ABERTA, id);
      else localStorage.removeItem(CHAVE_ABERTA);
    } catch {
      // sem armazenamento
    }
  };
  const alternar = (id: string) => abrir(aberta === id ? null : id);
  // A ENTRADA em sequência dos cards vale só logo depois de ABRIR (mover o painel no DOM reiniciaria a animação).
  const [entrando, setEntrando] = useState<string | null>(null);
  useEffect(() => {
    if (!aberta) return;
    setEntrando(aberta);
    const t = window.setTimeout(() => setEntrando(null), duracaoMotionMs() + 700);
    return () => window.clearTimeout(t);
  }, [aberta]);
  // Quantas COLUNAS a grade tem agora (o painel da pasta entra no fim da linha dela).
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const medir = () => setColunas(Math.max(1, getComputedStyle(el).gridTemplateColumns.split(" ").filter(Boolean).length));
    medir();
    const ro = new ResizeObserver(medir);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // O ARRASTO NEGADO: o card que não pode ir para onde foi solto sacode e o motivo aparece.
  const [negado, setNegado] = useState<string | null>(null);
  const negar = (chave: string, motivo: string) => {
    setNegado(null);
    requestAnimationFrame(() => setNegado(chave));
    window.setTimeout(() => setNegado((n) => (n === chave ? null : n)), 900);
    toast.error(motivo);
  };
  const { arrasto, fantasma, iniciar, foiArrasto } = useArrastoGrade({
    raiz: ref,
    aceitaDentro: podeMover && ((chave, id) => podeMover(chave, { pasta: id }) == null),
    onSoltar:
      onMover &&
      ((chave, d) => {
        const destino: DestinoGrade = d.dentro ? { pasta: d.dentro } : { pasta: d.area, antesDe: d.antesDe, depoisDe: d.depoisDe };
        const motivo = podeMover?.(chave, destino);
        if (motivo) return negar(chave, motivo);
        if (d.dentro) {
          onMover(raizChaves, chave, { pasta: d.dentro });
          setRecebeu(d.dentro);
          window.setTimeout(() => setRecebeu(null), Math.max(duracaoMotionMs(), 1) + 50);
        } else onMover(raizChaves, chave, { pasta: d.area, antesDe: d.antesDe, depoisDe: d.depoisDe });
      }),
  });

  // Alt+←/→: troca de lugar com o vizinho da MESMA área.
  const teclado = (e: KeyboardEvent<HTMLElement>, chave: string, area: string | null, lista: string[]) => {
    if (!onMover || !e.altKey || (e.key !== "ArrowLeft" && e.key !== "ArrowRight")) return;
    const i = lista.indexOf(chave);
    const j = e.key === "ArrowLeft" ? i - 1 : i + 1;
    if (i < 0 || j < 0 || j >= lista.length) return;
    e.preventDefault();
    const destino: DestinoGrade = e.key === "ArrowLeft" ? { pasta: area, antesDe: lista[j] } : { pasta: area, depoisDe: lista[j] };
    const motivo = podeMover?.(chave, destino);
    if (motivo) return negar(chave, motivo);
    onMover(raizChaves, chave, destino);
  };

  const cardQuadro = (q: QuadroCardDados) => (
    <QuadroCard
      quadro={q}
      href={`/painel/tarefas/${q.id}${aba ? `?aba=${aba}` : ""}`}
      atual={q.id === atual}
      favorito={favoritos.includes(q.id)}
      onFavorito={onFavorito && (() => onFavorito(q.id))}
      onAbrir={onAbrir}
    />
  );
  const cardPasta = (it: Extract<ItemGrade<QuadroCardDados>, { tipo: "pasta" }>) => (
    <PastaQuadro
      pasta={it.pasta}
      quadros={it.quadros}
      aberta={aberta === it.pasta.id}
      alvo={arrasto?.destino.dentro === it.pasta.id && !arrasto.pousando && !podeMover?.(arrasto.chave, { pasta: it.pasta.id })}
      recusa={arrasto?.destino.dentro === it.pasta.id && !arrasto.pousando && !!podeMover?.(arrasto.chave, { pasta: it.pasta.id })}
      recebeu={recebeu === it.pasta.id}
      onAlternar={() => alternar(it.pasta.id)}
      menu={menuPasta?.(it.pasta)}
    />
  );
  // Um item arrastável (o wrapper leva o gesto, o clique pós-arrasto é engolido e o toque longo não abre o menu do navegador).
  const envolver = (chave: string, area: string | null, lista: string[], conteudo: ReactNode, extraAttrs: { pastaId?: string; indice?: number } = {}) => (
    <div
      key={chave}
      role="none"
      data-grade-item={chave}
      data-pasta-id={extraAttrs.pastaId}
      className={`${arrasto?.chave === chave ? "hidden" : ""} ${onMover ? "touch-manipulation select-none [-webkit-touch-callout:none]" : ""} ${negado === chave ? "animate-negar-arrasto" : extraAttrs.indice != null ? "animate-fade-in-up" : ""}`}
      style={extraAttrs.indice != null ? { animationDelay: `${Math.min(extraAttrs.indice, 12) * 30}ms` } : undefined}
      onPointerDown={onMover ? (e) => iniciar(e, chave) : undefined}
      onClickCapture={(e) => {
        if (foiArrasto()) {
          e.preventDefault();
          e.stopPropagation();
        }
      }}
      onKeyDown={(e) => teclado(e, chave, area, lista)}
    >
      {conteudo}
    </div>
  );
  const sombra = (area: string | null) => (arrasto && arrasto.destino.area === area ? <SombraGrade key="__sombra" altura={arrasto.altura} /> : null);
  // Monta uma área com a SOMBRA no destino. O card arrastado sai do fluxo mas SEGUE no DOM (oculto, no fim da mesma área):
  // no toque, o dedo continua preso ao elemento em que começou — tirá-lo do documento soltaria o arrasto.
  const comSombra = (area: string | null, nos: { chave: string; no: ReactNode }[]) => {
    const vis = nos.filter((n) => n.chave !== arrasto?.chave);
    const oculto = nos.find((n) => n.chave === arrasto?.chave)?.no ?? null;
    const s = sombra(area);
    if (!s || !arrasto) return { nos: vis.map((n) => n.no), oculto };
    const d = arrasto.destino;
    const i = d.antesDe ? vis.findIndex((n) => n.chave === d.antesDe) : d.depoisDe ? vis.findIndex((n) => n.chave === d.depoisDe) + 1 : vis.length;
    const k = i < 0 ? vis.length : i;
    return { nos: [...vis.slice(0, k).map((n) => n.no), s, ...vis.slice(k).map((n) => n.no)], oculto };
  };

  const painel = (it: Extract<ItemGrade<QuadroCardDados>, { tipo: "pasta" }>, abertoAgora: boolean) => {
    const internas = it.quadros.map((q) => `q:${q.id}`);
    return (
      <PainelPasta
        key={`painel:${it.pasta.id}`}
        pasta={it.pasta}
        aberto={abertoAgora}
        onFechar={() => abrir(null)}
        onFechado={() => setFechando((f) => (f === it.pasta.id ? null : f))}
      >
        <div data-grade-area={it.pasta.id} className={GRADE}>
          {(() => {
            const a = comSombra(
              it.pasta.id,
              it.quadros.map((q, i) => ({ chave: `q:${q.id}`, no: envolver(`q:${q.id}`, it.pasta.id, internas, cardQuadro(q), entrando === it.pasta.id ? { indice: i } : {}) })),
            );
            return [...a.nos, a.oculto];
          })()}
          {extraPasta && !arrasto && <div key="__extra-pasta">{extraPasta(it.pasta)}</div>}
          {!it.quadros.length && !sombra(it.pasta.id) && !extraPasta && (
            <p className="col-span-full px-1 py-6 text-center text-[13px] text-muted">{onMover ? "Pasta vazia — arraste quadros para cá." : "Pasta vazia."}</p>
          )}
        </div>
      </PainelPasta>
    );
  };

  // A raiz: cada item + a sombra; o PAINEL da pasta aberta (e o da que está fechando) entra no fim da LINHA dela.
  const { nos: nosRaiz, oculto } = comSombra(
    null,
    itens.map((it) => ({
      chave: it.chave,
      no: envolver(it.chave, null, raizChaves, it.tipo === "pasta" ? cardPasta(it) : cardQuadro(it.quadro), it.tipo === "pasta" ? { pastaId: it.pasta.id } : {}),
    })),
  );
  const total = nosRaiz.length + (extra ? 1 : 0);
  const inserir: { pos: number; no: ReactNode }[] = [];
  for (const id of [fechando, aberta]) {
    if (!id) continue;
    const it = itens.find((x): x is Extract<ItemGrade<QuadroCardDados>, { tipo: "pasta" }> => x.tipo === "pasta" && x.pasta.id === id);
    if (!it) continue;
    const idx = nosRaiz.findIndex((n) => (n as { key?: string } | null)?.key === it.chave);
    if (idx < 0) continue;
    inserir.push({ pos: Math.min(total, Math.ceil((idx + 1) / colunas) * colunas), no: painel(it, id === aberta) });
  }
  const nos: ReactNode[] = [...nosRaiz, ...(extra ? [<div key="__extra">{extra}</div>] : [])];
  for (const p of inserir.sort((a, b) => b.pos - a.pos)) nos.splice(p.pos, 0, p.no);
  nos.push(oculto);

  const presa = arrasto ? itens.find((i) => i.chave === arrasto.chave) ?? itens.flatMap((i) => (i.tipo === "pasta" ? i.quadros.map((q) => ({ tipo: "quadro" as const, chave: `q:${q.id}`, quadro: q })) : [])).find((i) => i.chave === arrasto.chave) : null;

  return (
    <>
      <div ref={ref} data-grade-area="" className={GRADE}>
        {nos}
      </div>
      {arrasto && presa && (
        <CartaoPreso arrasto={arrasto} fantasma={fantasma}>
          {presa.tipo === "pasta" ? cardPasta(presa) : cardQuadro(presa.quadro)}
        </CartaoPreso>
      )}
    </>
  );
}
