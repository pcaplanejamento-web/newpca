"use client";

import { usePathname, useRouter } from "next/navigation";
import { createContext, type ReactNode, useCallback, useContext, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { textoDuracao, textoPct } from "@/lib/fluxo-progresso";
import { Button } from "./Button";
import { type AmostraArrasto, lerPosicaoBolha, type PosicaoBolha, pousarBolha, projetarArremesso, topoDaPosicao, velocidadeArrasto } from "@/lib/chat-core";
import { publicarFaixaFlutuante } from "@/lib/flutuantes-store";
import { LIXEIRA, LixeiraFlutuante, semMovimento } from "./LixeiraFlutuante";
import { definirVarRaiz, tokenPx } from "./espacamento";
import { IconAlert, IconAmpliar, IconChevronDown, IconCirculoCheck, IconClose, IconGrip, IconLimpar, IconParar, IconSpinner } from "./icons";
import { duracaoMotionMs } from "./Modal";
import { segurar } from "./segurar";
import { Progress } from "./Progress";

/**
 * TRABALHOS EM SEGUNDO PLANO — o padrão para QUALQUER automação longa:
 * - `ManterVivo` (na página): o conteúdo é renderizado pelo provedor e só PASSA pela página — sair dela com um trabalho
 *   em curso não desmonta nada (o nó do DOM vai para um estacionamento escondido; voltar o devolve, com o estado inteiro).
 * - `useTrabalhoSegundoPlano` (no componente que executa): informa o andamento; o `PainelSegundoPlano` mostra, fora da
 *   página dona, uma pílula MINIMIZADA no canto inferior direito (tocar expande: abrir os detalhes / parar).
 * - O painel é manuseado como as BOLHAS do chat (arrastar, arremessar, encostar na borda, lixeira, Alt + setas); a faixa
 *   que ocupa vai ao armazém dos flutuantes (as bolhas desviam) e, no canto inferior direito, em `--reserva-flutuante` (os
 *   avisos flutuantes ficam acima).
 */
export type EstadoTrabalho = "rodando" | "fila" | "concluido" | "falhou" | "cancelado";
export type Trabalho = {
  id: string;
  /** A chave do `ManterVivo` que executa (mantido montado enquanto rodando ou na fila). */
  chave: string;
  titulo: string;
  estado: EstadoTrabalho;
  feito: number;
  total: number;
  /** O que está acontecendo agora (ou o desfecho). */
  texto?: string;
  /** O ANDAMENTO REAL 0..1 (o mesmo cálculo das etapas da tela dona) — mostrado em %; sem ele, feito/total. */
  fracao?: number;
  /** O tempo que falta (ms), pelo ritmo recente; `null` = ainda calculando. */
  restanteMs?: number | null;
  /** A página dona (onde os detalhes ficam). */
  rota: string;
  /** O andamento item a item (ex.: cada DFD) — visto ao expandir. */
  itens?: { rotulo: string; estado: "ok" | "falhou" | "rodando" | "fila"; detalhe?: string }[];
  onAbrir?: () => void;
  onParar?: () => void;
  /** Dispensado no painel (quem informou esquece o desfecho). */
  onDispensar?: () => void;
  /** O DETALHE COMPLETO ao expandir o painel (no lugar do texto e da lista de itens) — ex.: o andamento de uma importação. */
  corpo?: () => ReactNode;
  /** Não aparece no painel (só mantém a página dona viva — ex.: o ADM desligou o andamento das importações). */
  oculto?: boolean;
  /** Uma PERGUNTA a responder no próprio painel (ex.: a queda de uma importação sem tela que pergunte): o painel abre
   * sozinho e mostra os dois botões; a resposta segue o trabalho. */
  pergunta?: { texto: string; sim: string; nao: string; responder: (sim: boolean) => void };
  /** Pedido de ABRIR o painel neste trabalho (o instante do pedido — um novo valor abre de novo). */
  abrirEm?: number;
};

type Ctx = {
  montar: (chave: string, conteudo: ReactNode) => void;
  anexar: (chave: string, slot: HTMLElement) => void;
  soltar: (chave: string) => void;
  informar: (t: Trabalho) => void;
  retirar: (id: string) => void;
  /** Monta o conteúdo SEM a página dona (escondido) e o mantém vivo por `prazoMs` — o tempo de ele começar o trabalho
   * (depois, o trabalho em curso o mantém). Ex.: a Mesa roda uma automação sem abrir a tela da Automação. */
  rodarFora: (chave: string, conteudo: ReactNode, prazoMs?: number) => void;
};
/** As AÇÕES (estáveis — o `ManterVivo` não reanexa a cada mudança) e, à parte, as chaves À VISTA. */
const SegundoPlanoCtx = createContext<Ctx | null>(null);
const NaTelaCtx = createContext<Set<string> | null>(null);
/** A chave do `ManterVivo` em que o componente está. */
const ChaveCtx = createContext<string | null>(null);

const ATIVO = (e: EstadoTrabalho) => e === "rodando" || e === "fila";

export function SegundoPlano({ children }: { children: ReactNode }) {
  const [conteudos, setConteudos] = useState<Record<string, ReactNode>>({});
  const [trabalhos, setTrabalhos] = useState<Record<string, Trabalho>>({});
  const [naTela, setNaTela] = useState<Set<string>>(new Set());
  const hosts = useRef(new Map<string, HTMLDivElement>());
  const estacionamento = useRef<HTMLDivElement>(null);
  const trabalhosRef = useRef(trabalhos);
  trabalhosRef.current = trabalhos;

  const host = useCallback((chave: string) => {
    let h = hosts.current.get(chave);
    if (!h) {
      h = document.createElement("div");
      h.className = "contents";
      hosts.current.set(chave, h);
      estacionamento.current?.appendChild(h);
    }
    return h;
  }, []);
  const desmontar = useCallback((chave: string) => {
    setConteudos(({ [chave]: _, ...resto }) => resto);
    hosts.current.get(chave)?.remove();
    hosts.current.delete(chave);
  }, []);
  // As montagens fora da página que ainda não começaram o trabalho: chave → até quando ficam vivas.
  const reservas = useRef(new Map<string, number>());
  const [, setTique] = useState(0);
  const ocupado = useCallback(
    (chave: string) => (reservas.current.get(chave) ?? 0) > Date.now() || Object.values(trabalhosRef.current).some((t) => t.chave === chave && ATIVO(t.estado)),
    [],
  );

  const ctx = useMemo<Ctx>(
    () => ({
      montar: (chave, conteudo) => {
        host(chave);
        setConteudos((c) => ({ ...c, [chave]: conteudo }));
      },
      anexar: (chave, slot) => {
        slot.appendChild(host(chave));
        setNaTela((s) => new Set(s).add(chave));
      },
      soltar: (chave) => {
        setNaTela((s) => {
          const n = new Set(s);
          n.delete(chave);
          return n;
        });
        if (ocupado(chave)) estacionamento.current?.appendChild(host(chave));
        else desmontar(chave);
      },
      informar: (t) => setTrabalhos((m) => ({ ...m, [t.id]: t })),
      retirar: (id) => setTrabalhos(({ [id]: _, ...resto }) => resto),
      rodarFora: (chave, conteudo, prazoMs = 120_000) => {
        reservas.current.set(chave, Date.now() + prazoMs);
        host(chave);
        // Já montado (a página ou um trabalho anterior): fica o que está — o estado não se perde.
        setConteudos((c) => (chave in c ? c : { ...c, [chave]: conteudo }));
        // Vencida a reserva sem trabalho em curso, o efeito de limpeza desmonta (um render no fim do prazo).
        window.setTimeout(() => setTique((n) => n + 1), prazoMs + 50);
      },
    }),
    [host, desmontar, ocupado],
  );

  // Terminou fora da página dona: o conteúdo é desmontado (o desfecho segue no painel até ser dispensado).
  useEffect(() => {
    for (const chave of Object.keys(conteudos)) if (!naTela.has(chave) && !ocupado(chave)) desmontar(chave);
  });

  return (
    <SegundoPlanoCtx.Provider value={ctx}>
      <NaTelaCtx.Provider value={naTela}>
      {children}
      <div ref={estacionamento} hidden />
      {Object.entries(conteudos).map(([chave, c]) => {
        const h = hosts.current.get(chave);
        return h ? createPortal(<ChaveCtx.Provider value={chave}>{c}</ChaveCtx.Provider>, h, chave) : null;
      })}
      <PainelSegundoPlano trabalhos={Object.values(trabalhos)} naTela={naTela} onDispensar={ctx.retirar} />
      </NaTelaCtx.Provider>
    </SegundoPlanoCtx.Provider>
  );
}

/** Na página: o conteúdo passa por aqui, mas vive no provedor (sem ele, renderiza normal). */
export function ManterVivo({ chave, children }: { chave: string; children: ReactNode }) {
  const ctx = useContext(SegundoPlanoCtx);
  const slot = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    ctx?.montar(chave, children);
  }, [ctx, chave, children]);
  useLayoutEffect(() => {
    if (!ctx || !slot.current) return;
    ctx.anexar(chave, slot.current);
    return () => ctx.soltar(chave);
  }, [ctx, chave]);
  if (!ctx) return <>{children}</>;
  return <div ref={slot} className="contents" />;
}

/** Informa/retira trabalhos de FORA de um `ManterVivo` (ex.: o acompanhamento das importações no layout); sem o provedor, null. */
export function usePainelSegundoPlano(): Pick<Ctx, "informar" | "retirar"> | null {
  const c = useContext(SegundoPlanoCtx);
  return useMemo(() => (c ? { informar: c.informar, retirar: c.retirar } : null), [c]);
}

/** Monta um conteúdo em segundo plano sem a página dona (ver `Ctx.rodarFora`); sem o provedor, null. */
export function useRodarFora(): Ctx["rodarFora"] | null {
  return useContext(SegundoPlanoCtx)?.rodarFora ?? null;
}

/** O componente está À VISTA (a página dona aberta)? Fora dela, nada de abrir diálogos sozinho. */
export function useNaTela(): boolean {
  const naTela = useContext(NaTelaCtx);
  const chave = useContext(ChaveCtx);
  return !naTela || !chave || naTela.has(chave);
}

/** Informa um trabalho (null = nenhum). O último desfecho fica no painel até ser dispensado. */
export function useTrabalhoSegundoPlano(t: Omit<Trabalho, "chave"> | null) {
  const ctx = useContext(SegundoPlanoCtx);
  const chave = useContext(ChaveCtx) ?? "";
  const ultimo = useRef<string | null>(null);
  const assinatura = t ? `${t.id}|${t.titulo}|${t.estado}|${t.feito}|${t.total}|${t.texto ?? ""}|${t.fracao == null ? "" : Math.floor(t.fracao * 100)}|${t.restanteMs == null ? "" : Math.round(t.restanteMs / 30000)}` : "";
  const ref = useRef(t);
  ref.current = t;
  // O desfecho visto NA página não vai ao painel quando a pessoa sai dela.
  const naTela = useNaTela();
  const vistoNaTela = useRef(false);
  vistoNaTela.current = !!t && !ATIVO(t.estado) && naTela;
  useEffect(
    () => () => {
      if (vistoNaTela.current && ultimo.current) ctx?.retirar(ultimo.current);
    },
    [ctx],
  );
  // biome-ignore lint/correctness/useExhaustiveDependencies: só quando o conteúdo informado muda (a assinatura)
  useEffect(() => {
    const x = ref.current;
    if (!ctx) return;
    if (!x) {
      if (ultimo.current) ctx.retirar(ultimo.current);
      ultimo.current = null;
      return;
    }
    if (ultimo.current && ultimo.current !== x.id) ctx.retirar(ultimo.current);
    ultimo.current = x.id;
    ctx.informar({
      ...x,
      chave,
      onAbrir: () => ref.current?.onAbrir?.(),
      onParar: ref.current?.onParar ? () => ref.current?.onParar?.() : undefined,
    });
  }, [ctx, chave, assinatura]);
}

const ICONE: Record<EstadoTrabalho, ReactNode> = {
  rodando: <IconSpinner className="size-4 text-accent" />,
  fila: <IconSpinner className="size-4 text-muted" />,
  concluido: <IconCirculoCheck className="size-4 text-[var(--ok)]" />,
  falhou: <IconAlert className="size-4 text-[var(--danger)]" />,
  cancelado: <IconAlert className="size-4 text-[var(--warn)]" />,
};
const ROTULO: Record<EstadoTrabalho, string> = { rodando: "Executando", fila: "Na fila", concluido: "Concluído", falhou: "Falhou", cancelado: "Interrompido" };

/** Onde o painel fica (o lado, a altura e quando foi mexido) — neste aparelho. */
const CHAVE_POSICAO = "segundo-plano:posicao";
const POSICAO_PADRAO: PosicaoBolha = { lado: "dir", y: 1, t: 0 };
const MARGEM = 12;
const LIMIAR = 6;
/** Alt + ↑/↓ move o painel este tanto (px). */
const PASSO_TECLADO = 56;

function lerPosicaoGuardada(): PosicaoBolha {
  try {
    const v = localStorage.getItem(CHAVE_POSICAO);
    return (v && lerPosicaoBolha(JSON.parse(v))) || POSICAO_PADRAO;
  } catch {
    return POSICAO_PADRAO;
  }
}

/** As medidas da tela para o painel: a área livre das bolhas (o cabeçalho em cima; embaixo, a navegação do celular e a
 * barra fixa de seleção). */
function medirTela() {
  const largura = document.documentElement.clientWidth || window.innerWidth;
  const altura = window.innerHeight;
  const desktop = largura >= 1024;
  return { largura, altura, desktop, topo: 64, base: (desktop ? 16 : 84) + tokenPx("--reserva-rodape", 0) };
}

/** A página aberta é a dona do trabalho (o caminho e, quando a rota leva a busca — `?aba=` —, os mesmos parâmetros)? */
function naRotaDona(rota: string, caminho: string): boolean {
  const [path, busca] = rota.split("?");
  if (caminho !== path) return false;
  if (!busca || typeof window === "undefined") return true;
  const atual = new URLSearchParams(window.location.search);
  return [...new URLSearchParams(busca)].every(([k, v]) => atual.get(k) === v);
}

/**
 * O painel FLUTUANTE dos trabalhos em segundo plano — manuseado como as BOLHAS do chat (o mesmo núcleo, `chat-core.ts`):
 * ARRASTAR (mouse ou dedo, depois de 6px) leva a qualquer altura e, ao soltar, ARREMESSA e ENCOSTA na borda mais perto
 * (o pouso com mola); na LIXEIRA (centro embaixo) dispensa os que terminaram (com trabalho em curso, não aceita); Alt +
 * setas movem pelo teclado; a posição fica neste aparelho. A faixa que ocupa vai ao armazém dos flutuantes — as bolhas
 * pousam fora dela.
 */
export function PainelSegundoPlano({
  trabalhos: todos,
  naTela,
  onDispensar,
}: {
  trabalhos: Trabalho[];
  naTela: Set<string>;
  onDispensar: (id: string) => void;
}) {
  const router = useRouter();
  const caminho = usePathname();
  const [aberto, setAberto] = useState(false);
  const [montado, setMontado] = useState(false);
  const [pos, setPos] = useState<PosicaoBolha>(POSICAO_PADRAO);
  const [tela, setTela] = useState<ReturnType<typeof medirTela> | null>(null);
  const [caixaTam, setCaixaTam] = useState({ w: 0, h: 0 });
  /** O arrasto em curso: o deslocamento desde onde estava e se está sobre a lixeira. */
  const [arrasto, setArrasto] = useState<{ dx: number; dy: number; naLixeira: boolean; ativo: boolean } | null>(null);
  /** O POUSO (FLIP): parte de onde foi solto (`voo`) e desliza até o lugar novo. */
  const [voo, setVoo] = useState<{ dx: number; dy: number; fase: "ini" | "voo" } | null>(null);
  const engolirClique = useRef(false);
  /** O banner FECHANDO (a animação de saída antes de desmontar). */
  const [fechando, setFechando] = useState(false);
  const secao = useRef<HTMLElement>(null);
  const [secH, setSecH] = useState(0);
  const tFechar = useRef(0);
  const fechar = useCallback(() => {
    if (semMovimento()) return setAberto(false);
    setFechando(true);
    window.clearTimeout(tFechar.current);
    tFechar.current = window.setTimeout(() => {
      setAberto(false);
      setFechando(false);
    }, duracaoMotionMs() * 1.4);
  }, []);
  /** Tocar na pílula: abre o banner por cima; de novo, fecha. */
  const alternar = () => {
    if (engolirClique.current) return;
    if (aberto && !fechando) fechar();
    else {
      window.clearTimeout(tFechar.current);
      setFechando(false);
      setAberto(true);
    }
  };
  useEffect(() => {
    setMontado(true);
    setPos(lerPosicaoGuardada());
    const medir = () => setTela(medirTela());
    medir();
    window.addEventListener("resize", medir);
    return () => window.removeEventListener("resize", medir);
  }, []);
  // Ativo = sempre acompanhado (minimizado), também na página dona; concluído na página dona sai (o desfecho está à vista).
  const trabalhos = todos.filter((t) => !t.oculto && (ATIVO(t.estado) || !(naTela.has(t.chave) && naRotaDona(t.rota, caminho))));
  const caixa = useRef<HTMLDivElement>(null);
  const visivel = trabalhos.length > 0;

  // O tamanho da caixa (recolhida, expandida, a lista crescendo) — a posição e a faixa dependem dele.
  useLayoutEffect(() => {
    const el = caixa.current;
    if (!visivel || !el) return;
    const medir = () => setCaixaTam((a) => (a.w === el.offsetWidth && a.h === el.offsetHeight ? a : { w: el.offsetWidth, h: el.offsetHeight }));
    medir();
    const ro = new ResizeObserver(medir);
    ro.observe(el);
    return () => ro.disconnect();
  }, [visivel, montado]);

  // A altura do banner aberto (fica por cima da pílula — ou por baixo, quando não cabe em cima).
  useLayoutEffect(() => {
    const el = secao.current;
    if (!aberto || !el) return setSecH(0);
    const medir = () => setSecH(el.offsetHeight);
    medir();
    const ro = new ResizeObserver(medir);
    ro.observe(el);
    return () => ro.disconnect();
  }, [aberto]);

  // Onde o painel está: encostado no lado, na altura guardada (fração da faixa livre — resiste a trocar o tamanho da tela).
  const geo = tela ? { ...tela, tam: caixaTam.h } : null;
  const lugar = geo ? { left: pos.lado === "esq" ? MARGEM : Math.max(MARGEM, geo.largura - MARGEM - caixaTam.w), top: topoDaPosicao(pos, geo) } : null;
  const lixeira = tela ? { x: tela.largura / 2, y: tela.altura - tela.base - LIXEIRA.base - LIXEIRA.tam / 2 } : null;
  const emCurso = trabalhos.some((t) => ATIVO(t.estado));
  // O banner abre POR CIMA da pílula; sem espaço em cima (a pílula no alto da tela), por baixo — onde houver mais lugar.
  const espaco = lugar && tela ? { acima: lugar.top - tela.topo - 8, abaixo: tela.altura - tela.base - (lugar.top + caixaTam.h) - 8 } : { acima: 0, abaixo: 0 };
  const acima = espaco.acima >= Math.min(secH || 240, 240) || espaco.acima >= espaco.abaixo;
  const comBanner = aberto && secH > 0;

  // A faixa ocupada vai ao armazém dos flutuantes (as bolhas desviam); os avisos flutuantes ficam acima só quando o painel
  // está no canto deles (à direita, embaixo).
  useLayoutEffect(() => {
    if (!visivel || !lugar || !tela || !caixaTam.h) {
      publicarFaixaFlutuante(null);
      definirVarRaiz("--reserva-flutuante", "0px");
      return;
    }
    // A faixa inteira: a pílula e, aberto, o banner (em cima ou embaixo dela).
    const extra = comBanner ? secH + 8 : 0;
    const largura = comBanner ? Math.max(caixaTam.w, secao.current?.offsetWidth ?? 0) : caixaTam.w;
    publicarFaixaFlutuante({ lado: pos.lado, top: comBanner && acima ? lugar.top - extra : lugar.top, altura: caixaTam.h + extra, ambos: largura > tela.largura / 2 - 2 * MARGEM });
    definirVarRaiz("--reserva-flutuante", pos.lado === "dir" && pos.y > 0.97 ? `${caixaTam.h + (acima ? extra : 0) + 8}px` : "0px");
  });
  useEffect(
    () => () => {
      publicarFaixaFlutuante(null);
      document.documentElement.style.removeProperty("--reserva-flutuante");
    },
    [],
  );
  useEffect(() => {
    if (!visivel) setAberto(false);
  }, [visivel]);
  // Uma PERGUNTA NOVA abre o painel (a resposta não pode ficar escondida na pílula) — uma vez por pergunta: minimizar vale.
  const perguntas = trabalhos
    .filter((t) => t.pergunta)
    .map((t) => t.id)
    .join("|");
  // O pedido de abrir (ex.: o relógio da Execução consultando a última importação).
  const pedidoAbrir = Math.max(0, ...trabalhos.map((t) => t.abrirEm ?? 0));
  useEffect(() => {
    if (perguntas || pedidoAbrir) setAberto(true);
  }, [perguntas, pedidoAbrir]);
  // Voltou à página dona de um trabalho que terminou fora dela: o desfecho foi visto — sai do painel.
  useEffect(() => {
    for (const t of todos)
      if (!ATIVO(t.estado) && naTela.has(t.chave) && naRotaDona(t.rota, caminho)) {
        t.onDispensar?.();
        onDispensar(t.id);
      }
  }, [todos, naTela, caminho, onDispensar]);

  const guardar = useCallback((p: PosicaoBolha) => {
    setPos(p);
    try {
      localStorage.setItem(CHAVE_POSICAO, JSON.stringify(p));
    } catch {
      // Sem o aparelho (janela anônima): vale nesta visita.
    }
  }, []);
  const dispensarTerminados = useCallback(() => {
    for (const t of trabalhos)
      if (!ATIVO(t.estado)) {
        t.onDispensar?.();
        onDispensar(t.id);
      }
  }, [trabalhos, onDispensar]);

  /** POUSA em `nova` vindo de onde está à vista agora (FLIP) — sem "reduzir movimento". */
  const pousar = useCallback(
    (nova: PosicaoBolha, de: { left: number; top: number }) => {
      if (!geo) return;
      const destino = { left: nova.lado === "esq" ? MARGEM : Math.max(MARGEM, geo.largura - MARGEM - caixaTam.w), top: topoDaPosicao(nova, geo) };
      guardar(nova);
      if (semMovimento()) return;
      setVoo({ dx: de.left - destino.left, dy: de.top - destino.top, fase: "ini" });
      requestAnimationFrame(() => requestAnimationFrame(() => setVoo((v) => (v ? { ...v, fase: "voo" } : v))));
      window.setTimeout(() => setVoo(null), duracaoMotionMs() * 2.4 + 120);
    },
    [geo, caixaTam.w, guardar],
  );

  const pegar = useCallback(
    (e: React.PointerEvent) => {
      if (!geo || !lugar || !lixeira || e.button > 0) return;
      // Os botões do cabeçalho (minimizar, dispensar) não arrastam.
      if ((e.target as HTMLElement).closest("button") && !(e.target as HTMLElement).closest("[data-alca-painel]")) return;
      if (e.pointerType === "mouse") e.preventDefault();
      const x0 = e.clientX;
      const y0 = e.clientY;
      const amostras: AmostraArrasto[] = [{ x: x0, y: y0, t: performance.now() }];
      let ativo = false;
      let soltarSeguro: (() => void) | null = null;
      let ultimo = { dx: 0, dy: 0, naLixeira: false };
      let quadro = 0;
      const mover = (ev: PointerEvent) => {
        const dx = ev.clientX - x0;
        const dy = ev.clientY - y0;
        if (!ativo) {
          if (Math.hypot(dx, dy) < LIMIAR) return;
          ativo = true;
          soltarSeguro = segurar("grabbing");
        }
        ev.preventDefault();
        amostras.push({ x: ev.clientX, y: ev.clientY, t: performance.now() });
        if (amostras.length > 12) amostras.shift();
        const naLixeira = Math.hypot(ev.clientX - lixeira.x, ev.clientY - lixeira.y) < LIXEIRA.ima;
        if (naLixeira && !ultimo.naLixeira) navigator.vibrate?.(10);
        ultimo = { dx, dy, naLixeira };
        if (!quadro) quadro = requestAnimationFrame(() => {
          quadro = 0;
          setArrasto({ ...ultimo, ativo: true });
        });
      };
      const fim = (cancelado: boolean) => {
        window.removeEventListener("pointermove", mover);
        window.removeEventListener("pointerup", soltar);
        window.removeEventListener("pointercancel", cancelar);
        if (quadro) cancelAnimationFrame(quadro);
        soltarSeguro?.();
        if (!ativo) return;
        engolirClique.current = true;
        window.setTimeout(() => {
          engolirClique.current = false;
        }, 0);
        const solto = { left: lugar.left + ultimo.dx, top: lugar.top + ultimo.dy };
        setArrasto(null);
        if (cancelado) return pousar(pos, solto);
        if (ultimo.naLixeira && !emCurso) {
          dispensarTerminados();
          return;
        }
        // O ARREMESSO: a velocidade no fim leva o painel adiante; encosta na borda mais perto daquele ponto.
        const alvo = projetarArremesso(solto.left + caixaTam.w / 2, solto.top, velocidadeArrasto(amostras));
        pousar(pousarBolha(alvo.x, alvo.y, geo, Date.now()), solto);
      };
      const soltar = () => fim(false);
      const cancelar = () => fim(true);
      window.addEventListener("pointermove", mover, { passive: false });
      window.addEventListener("pointerup", soltar);
      window.addEventListener("pointercancel", cancelar);
    },
    [geo, lugar, lixeira, pos, caixaTam.w, emCurso, pousar, dispensarTerminados],
  );
  /** Alt + ↑/↓ sobe/desce; Alt + ←/→ troca de lado. */
  const tecla = (e: React.KeyboardEvent) => {
    if (!e.altKey || !geo || !lugar) return;
    const passo = { ArrowUp: -PASSO_TECLADO, ArrowDown: PASSO_TECLADO } as Record<string, number>;
    if (e.key in passo) {
      e.preventDefault();
      pousar(pousarBolha(pos.lado === "esq" ? 0 : geo.largura, lugar.top + passo[e.key], geo, Date.now()), lugar);
    } else if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
      e.preventDefault();
      pousar({ ...pos, lado: e.key === "ArrowLeft" ? "esq" : "dir", t: Date.now() }, lugar);
    }
  };

  if (!montado || !visivel) return null;
  const principal = trabalhos.find((t) => t.estado === "rodando") ?? trabalhos[0];
  const pct = (t: Trabalho) => (t.fracao != null ? t.fracao * 100 : t.total > 0 ? (t.feito / t.total) * 100 : 0);
  // "37% · ≈ 4 min" com o andamento real; senão "3/15".
  const andamento = (t: Trabalho) =>
    t.fracao != null ? `${textoPct(t.fracao)}${t.restanteMs != null ? ` · ${textoDuracao(t.restanteMs)}` : ""}` : `${t.feito}/${t.total}`;
  const temAndamento = (t: Trabalho) => t.fracao != null || t.total > 0;
  const abrir = (t: Trabalho) => {
    setAberto(false);
    router.push(t.rota);
    t.onAbrir?.();
    if (!ATIVO(t.estado)) {
      t.onDispensar?.();
      onDispensar(t.id);
    }
  };
  const terminados = trabalhos.filter((t) => !ATIVO(t.estado)).length;
  // Ainda sem a medida (o 1º quadro): no canto padrão, invisível — sem pular de lugar.
  // Aberto, a pílula ENCOLHE numa bolha (o banner cresce por cima dela); fechando, volta a ser pílula — o inverso, juntos.
  const bolha = aberto && !fechando;
  const progresso = ATIVO(principal.estado) && temAndamento(principal);
  // Presa à BORDA do lado (direita = `right`): a largura que anima não move a borda — nada treme durante a animação.
  const estilo: React.CSSProperties = lugar
    ? {
        ...(pos.lado === "esq" ? { left: lugar.left } : { right: MARGEM }),
        top: lugar.top,
        transform: arrasto ? `translate3d(${arrasto.dx}px, ${arrasto.dy}px, 0) scale(${arrasto.naLixeira ? 0.86 : 1.02})` : voo ? `translate3d(${voo.fase === "ini" ? voo.dx : 0}px, ${voo.fase === "ini" ? voo.dy : 0}px, 0)` : undefined,
        // Parado, vale a transição da classe (a largura pílula ↔ bolha).
        transition: arrasto ? "transform 70ms linear" : voo?.fase === "voo" ? "transform calc(var(--motion-duration) * 2.4) cubic-bezier(0.34, 1.3, 0.64, 1)" : undefined,
      }
    : { right: MARGEM, bottom: 96, visibility: "hidden" };
  const dicaArrasto = "Arraste para mudar de lugar (Alt + setas no teclado); até a lixeira para dispensar os concluídos.";

  return createPortal(
    <>
    <div
      ref={caixa}
      style={estilo}
      className={`painel-pilula fixed ${arrasto ? "z-[61]" : "z-[58]"} ${bolha ? "w-11" : "w-[min(20rem,calc(100vw-1.5rem))]"}`}
    >
      {aberto && (
        <section
          ref={secao}
          id="painel-segundo-plano"
          aria-label="Trabalhos em segundo plano"
          style={{ maxHeight: Math.max(160, acima ? espaco.acima : espaco.abaixo), transformOrigin: `${pos.lado === "esq" ? "left" : "right"} ${acima ? "bottom" : "top"}` }}
          className={`absolute flex min-h-0 flex-col rounded-card bg-surface ring-1 ring-border ${acima ? "bottom-full mb-2" : "top-full mt-2"} ${pos.lado === "esq" ? "left-0" : "right-0"} ${trabalhos.some((t) => t.corpo) ? "w-[min(38rem,calc(100vw-1.5rem))]" : "w-[min(26rem,calc(100vw-1.5rem))]"} ${fechando ? "animate-painel-sai" : "animate-janela-cresce"} ${arrasto ? "shadow-erguida" : "shadow-flutuante"}`}
        >
          {/* O cabeçalho é a ALÇA: arrastar leva o painel (os botões dele não arrastam). */}
          <header className="flex items-center gap-1 border-b border-border px-1.5 py-1">
            <button
              type="button"
              data-alca-painel
              onPointerDown={pegar}
              onKeyDown={tecla}
              aria-label="Em segundo plano — mover o painel (Alt + setas)"
              title={dicaArrasto}
              className={`flex min-h-9 min-w-0 flex-1 touch-none select-none items-center gap-2 rounded-control px-1.5 text-left pointer-coarse:min-h-11 ${arrasto ? "cursor-grabbing" : "cursor-grab"}`}
            >
              <IconGrip aria-hidden className="size-4 shrink-0 text-faint" />
              <span className="min-w-0 flex-1 truncate text-sm font-semibold">Em segundo plano</span>
            </button>
            {terminados > 0 && (
              <Button size="xs" variant="icon" aria-label={`Dispensar os concluídos (${terminados})`} title={`Dispensar os concluídos (${terminados})`} onClick={dispensarTerminados} icon={<IconLimpar className="size-4" />} />
            )}
            <Button size="xs" variant="icon" aria-label="Minimizar" title="Minimizar (Alt + setas movem o painel)" onClick={fechar} icon={<IconChevronDown className="size-4" />} />
          </header>
          <ul className="min-h-0 flex-1 divide-y divide-border overflow-y-auto">
            {trabalhos.map((t) => (
              <li key={t.id} className="space-y-2 px-3 py-2.5">
                <div className="flex items-center gap-2">
                  {ICONE[t.estado]}
                  <span className="min-w-0 flex-1 truncate text-sm font-medium" title={t.titulo}>
                    {t.titulo}
                  </span>
                  <span className="shrink-0 text-xs text-muted tabular-nums">{temAndamento(t) && ATIVO(t.estado) ? andamento(t) : t.total > 0 ? `${t.feito}/${t.total}` : ROTULO[t.estado]}</span>
                </div>
                {!t.corpo && ATIVO(t.estado) && temAndamento(t) && <Progress value={pct(t)} label={undefined} />}
                {t.corpo && t.corpo()}
                {!t.corpo && t.texto && <p className="line-clamp-4 text-xs text-muted" title={t.texto}>{t.texto}</p>}
                {!t.corpo && !!t.itens?.length && (
                  <ul aria-label="Andamento item a item" className="max-h-56 space-y-1 overflow-y-auto rounded-md bg-surface-2 p-1.5 text-xs">
                    {t.itens.map((x, i) => (
                      <li key={i} title={x.detalhe ? `${x.rotulo} — ${x.detalhe}` : x.rotulo}>
                        <span className="flex items-center gap-1.5">
                          {ICONE[x.estado === "ok" ? "concluido" : x.estado === "falhou" ? "falhou" : x.estado === "rodando" ? "rodando" : "fila"]}
                          <span className="min-w-0 flex-1 truncate font-medium tabular-nums text-text-2">{x.rotulo}</span>
                        </span>
                        {x.detalhe && <span className={`block pl-[22px] tabular-nums ${x.estado === "falhou" ? "text-danger" : "text-muted"}`}>{x.detalhe}</span>}
                      </li>
                    ))}
                  </ul>
                )}
                {t.pergunta && (
                  <div role="alert" className="space-y-2 rounded-md border border-[var(--warn)] bg-[color-mix(in_srgb,var(--warn)_8%,var(--surface))] p-2 text-xs">
                    <p className="text-text-2">{t.pergunta.texto}</p>
                    <div className="flex flex-wrap justify-end gap-1.5">
                      <Button size="xs" variant="ghost" onClick={() => t.pergunta?.responder(false)}>
                        {t.pergunta.nao}
                      </Button>
                      <Button size="xs" variant="danger" onClick={() => t.pergunta?.responder(true)}>
                        {t.pergunta.sim}
                      </Button>
                    </div>
                  </div>
                )}
                <div className="flex justify-end gap-1.5">
                  {t.estado === "rodando" && t.onParar && (
                    <Button size="xs" variant="ghost" icon={<IconParar className="size-3.5" />} onClick={() => t.onParar?.()}>
                      Parar
                    </Button>
                  )}
                  {!ATIVO(t.estado) && (
                    <Button
                      size="xs"
                      variant="ghost"
                      icon={<IconClose className="size-3.5" />}
                      onClick={() => {
                        t.onDispensar?.();
                        onDispensar(t.id);
                      }}
                    >
                      Dispensar
                    </Button>
                  )}
                  <Button size="xs" icon={<IconAmpliar className="size-3.5" />} onClick={() => abrir(t)}>
                    Detalhes
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}
        <button
          type="button"
          data-alca-painel
          onPointerDown={pegar}
          onKeyDown={tecla}
          onClick={alternar}
          aria-expanded={aberto && !fechando}
          aria-controls="painel-segundo-plano"
          aria-label={`${trabalhos.length} trabalho(s) em segundo plano — ${principal.titulo}: ${ROTULO[principal.estado]}. ${aberto && !fechando ? "Fechar" : "Abrir"} o painel. Alt + setas movem o painel.`}
          title={`${aberto && !fechando ? "Fechar" : "Abrir"} — ${dicaArrasto}`}
          className={`animate-fade-in-up relative flex min-h-11 w-full touch-none select-none items-center gap-2 overflow-hidden rounded-full bg-surface px-3.5 ring-1 ring-border ${arrasto ? "cursor-grabbing shadow-erguida" : "shadow-flutuante"}`}
        >
          {ICONE[principal.estado]}
          {/* O texto some na bolha (só o ícone fica, no centro) e volta na pílula. */}
          <span className={`painel-pilula-texto min-w-0 flex-1 truncate text-left text-sm font-medium ${bolha ? "opacity-0" : ""}`}>{principal.titulo}</span>
          <span className={`painel-pilula-texto shrink-0 text-xs text-muted tabular-nums ${bolha ? "opacity-0" : ""}`}>
            {progresso ? andamento(principal) : ROTULO[principal.estado]}
            {trabalhos.length > 1 ? ` · +${trabalhos.length - 1}` : ""}
          </span>
          {progresso && (
            <span aria-hidden className={`painel-pilula-texto absolute inset-x-0 bottom-0 h-0.5 bg-track ${bolha ? "opacity-0" : ""}`}>
              <span className="block h-full bg-accent transition-[width] duration-300" style={{ width: `${pct(principal)}%` }} />
            </span>
          )}
          {/* Na bolha, o andamento vira um ANEL em volta do ícone. */}
          {progresso && (
            <span
              aria-hidden
              className={`painel-pilula-texto painel-anel pointer-events-none absolute inset-0 rounded-full ${bolha ? "" : "opacity-0"}`}
              style={{ "--pct": `${pct(principal)}%` } as React.CSSProperties}
            />
          )}
        </button>
    </div>
    {arrasto && lixeira && <LixeiraFlutuante x={lixeira.x} y={lixeira.y} aberta ativa={arrasto.naLixeira} bloqueada={emCurso} />}
    {arrasto && (
      <p aria-live="polite" className="sr-only">
        {arrasto.naLixeira ? (emCurso ? "Há trabalho em andamento — o painel não sai" : "Solte para dispensar os concluídos") : "Solte para encostar na borda mais perto"}
      </p>
    )}
    </>,
    document.body,
  );
}
