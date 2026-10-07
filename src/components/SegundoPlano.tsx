"use client";

import { usePathname, useRouter } from "next/navigation";
import { createContext, type ReactNode, useCallback, useContext, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Button } from "./Button";
import { IconAlert, IconAmpliar, IconChevronDown, IconCirculoCheck, IconClose, IconParar, IconSpinner } from "./icons";
import { Progress } from "./Progress";

/**
 * TRABALHOS EM SEGUNDO PLANO — o padrão para QUALQUER automação longa:
 * - `ManterVivo` (na página): o conteúdo é renderizado pelo provedor e só PASSA pela página — sair dela com um trabalho
 *   em curso não desmonta nada (o nó do DOM vai para um estacionamento escondido; voltar o devolve, com o estado inteiro).
 * - `useTrabalhoSegundoPlano` (no componente que executa): informa o andamento; o `PainelSegundoPlano` mostra, fora da
 *   página dona, uma pílula MINIMIZADA no canto inferior direito (tocar expande: abrir os detalhes / parar).
 * - A altura do painel vai em `--reserva-flutuante` (as bolhas do chat e os avisos flutuantes ficam acima dele).
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
  /** A página dona (onde os detalhes ficam). */
  rota: string;
  onAbrir?: () => void;
  onParar?: () => void;
};

type Ctx = {
  montar: (chave: string, conteudo: ReactNode) => void;
  anexar: (chave: string, slot: HTMLElement) => void;
  soltar: (chave: string) => void;
  informar: (t: Trabalho) => void;
  retirar: (id: string) => void;
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
  const ocupado = useCallback((chave: string) => Object.values(trabalhosRef.current).some((t) => t.chave === chave && ATIVO(t.estado)), []);

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
  const assinatura = t ? `${t.id}|${t.titulo}|${t.estado}|${t.feito}|${t.total}|${t.texto ?? ""}` : "";
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

/** O painel MINIMIZADO no canto inferior direito (só os trabalhos de fora da página aberta). */
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
  useEffect(() => setMontado(true), []);
  const trabalhos = todos.filter((t) => !(naTela.has(t.chave) && caminho === t.rota.split("?")[0]));
  const caixa = useRef<HTMLDivElement>(null);

  // A altura ocupada vai em --reserva-flutuante (as bolhas do chat e os avisos ficam acima); o "resize" re-mede as bolhas.
  const visivel = trabalhos.length > 0;
  useLayoutEffect(() => {
    const raiz = document.documentElement;
    const medir = () => {
      const h = visivel && caixa.current ? caixa.current.offsetHeight + 8 : 0;
      if (raiz.style.getPropertyValue("--reserva-flutuante") === `${h}px`) return;
      raiz.style.setProperty("--reserva-flutuante", `${h}px`);
      window.dispatchEvent(new Event("resize"));
    };
    medir();
    const ro = caixa.current ? new ResizeObserver(medir) : null;
    if (caixa.current) ro?.observe(caixa.current);
    return () => {
      ro?.disconnect();
      raiz.style.removeProperty("--reserva-flutuante");
    };
  }, [visivel]);
  useEffect(() => {
    if (!visivel) setAberto(false);
  }, [visivel]);
  // Voltou à página dona de um trabalho que terminou fora dela: o desfecho foi visto — sai do painel.
  useEffect(() => {
    for (const t of todos) if (!ATIVO(t.estado) && naTela.has(t.chave) && caminho === t.rota.split("?")[0]) onDispensar(t.id);
  }, [todos, naTela, caminho, onDispensar]);

  if (!montado || !visivel) return null;
  const principal = trabalhos.find((t) => t.estado === "rodando") ?? trabalhos[0];
  const pct = (t: Trabalho) => (t.total > 0 ? (t.feito / t.total) * 100 : 0);
  const abrir = (t: Trabalho) => {
    setAberto(false);
    router.push(t.rota);
    t.onAbrir?.();
    if (!ATIVO(t.estado)) onDispensar(t.id);
  };

  return createPortal(
    <div
      ref={caixa}
      className="fixed right-3 bottom-[calc(4rem+env(safe-area-inset-bottom)+var(--reserva-rodape,0px)+0.5rem)] z-[58] w-[min(20rem,calc(100vw-1.5rem))] lg:right-4 lg:bottom-[calc(var(--reserva-rodape,0px)+1rem)]"
    >
      {aberto ? (
        <section aria-label="Trabalhos em segundo plano" className="animate-fade-in-up rounded-card bg-surface shadow-flutuante ring-1 ring-border">
          <header className="flex items-center gap-2 border-b border-border px-3 py-2">
            <span className="min-w-0 flex-1 truncate text-sm font-semibold">Em segundo plano</span>
            <Button size="xs" variant="icon" aria-label="Minimizar" title="Minimizar" onClick={() => setAberto(false)} icon={<IconChevronDown className="size-4" />} />
          </header>
          <ul className="max-h-[50dvh] divide-y divide-border overflow-y-auto">
            {trabalhos.map((t) => (
              <li key={t.id} className="space-y-2 px-3 py-2.5">
                <div className="flex items-center gap-2">
                  {ICONE[t.estado]}
                  <span className="min-w-0 flex-1 truncate text-sm font-medium" title={t.titulo}>
                    {t.titulo}
                  </span>
                  <span className="shrink-0 text-xs text-muted tabular-nums">{t.total > 0 ? `${t.feito}/${t.total}` : ROTULO[t.estado]}</span>
                </div>
                {ATIVO(t.estado) && t.total > 0 && <Progress value={pct(t)} label={undefined} />}
                {t.texto && <p className="line-clamp-2 text-xs text-muted" title={t.texto}>{t.texto}</p>}
                <div className="flex justify-end gap-1.5">
                  {t.estado === "rodando" && t.onParar && (
                    <Button size="xs" variant="ghost" icon={<IconParar className="size-3.5" />} onClick={() => t.onParar?.()}>
                      Parar
                    </Button>
                  )}
                  {!ATIVO(t.estado) && (
                    <Button size="xs" variant="ghost" icon={<IconClose className="size-3.5" />} onClick={() => onDispensar(t.id)}>
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
      ) : (
        <button
          type="button"
          onClick={() => setAberto(true)}
          aria-label={`${trabalhos.length} trabalho(s) em segundo plano — ${principal.titulo}: ${ROTULO[principal.estado]}. Expandir`}
          title="Expandir"
          className="animate-fade-in-up ml-auto flex min-h-11 w-full items-center gap-2 overflow-hidden rounded-full bg-surface px-3 shadow-flutuante ring-1 ring-border relative"
        >
          {ICONE[principal.estado]}
          <span className="min-w-0 flex-1 truncate text-left text-sm font-medium">{principal.titulo}</span>
          <span className="shrink-0 text-xs text-muted tabular-nums">
            {principal.total > 0 && ATIVO(principal.estado) ? `${principal.feito}/${principal.total}` : ROTULO[principal.estado]}
            {trabalhos.length > 1 ? ` · +${trabalhos.length - 1}` : ""}
          </span>
          {ATIVO(principal.estado) && principal.total > 0 && (
            <span aria-hidden className="absolute inset-x-0 bottom-0 h-0.5 bg-track">
              <span className="block h-full bg-accent transition-[width] duration-300" style={{ width: `${pct(principal)}%` }} />
            </span>
          )}
        </button>
      )}
    </div>,
    document.body,
  );
}
