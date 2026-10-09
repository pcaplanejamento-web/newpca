"use client";

import { createContext, type ReactNode, useContext, useEffect, useMemo, useRef, useState } from "react";
import { dataVersao, linkInterno, mudancasVisiveis, ROTULO_MUDANCA, type TipoMudanca, type Versao, VERSAO_ATUAL, VERSOES } from "@/lib/versoes";
import { Badge, type Tone } from "./Badge";
import { Button } from "./Button";
import { IconChevronDown, IconChevronRight, IconNovidades } from "./icons";
import { JanelaFlutuante } from "./JanelaFlutuante";

/** O acesso de quem vê as Novidades: as telas que os grupos abrem e se é ADM. Sem provedor = tudo (catálogo). */
const AcessoCtx = createContext<{ telas: readonly string[]; admin: boolean } | null>(null);

export function AcessoNovidades({ telas, admin, children }: { telas: readonly string[]; admin: boolean; children: ReactNode }) {
  const valor = useMemo(() => ({ telas, admin }), [telas, admin]);
  return <AcessoCtx.Provider value={valor}>{children}</AcessoCtx.Provider>;
}

/** As versões só com as mudanças das telas que a pessoa abre (as que ficam vazias somem; a atual sempre aparece). */
function useVersoesVisiveis(): readonly Versao[] {
  const a = useContext(AcessoCtx);
  return useMemo(() => {
    if (!a || a.admin) return VERSOES;
    const telas = new Set(a.telas);
    return VERSOES.map((v) => mudancasVisiveis(v, telas, false)).filter((v) => v.mudancas.length > 0 || v.versao === VERSAO_ATUAL);
  }, [a]);
}

const TOM_MUDANCA: Record<TipoMudanca, Tone> = { novo: "blue", melhoria: "emerald", correcao: "amber" };

/**
 * UMA versão: número, título, data e cada mudança com a área, o tipo e o botão que leva ATÉ ONDE mudou. `onAlternar` =
 * recolhível pelo cabeçalho (`aberto`); `onIr` = chamado ao ir até a mudança (quem usa fecha o banner).
 */
export function CartaoVersao({
  v,
  atual = false,
  destaque = false,
  aberto = true,
  onAlternar,
  onIr,
}: {
  v: Versao;
  atual?: boolean;
  destaque?: boolean;
  aberto?: boolean;
  onAlternar?: () => void;
  onIr?: () => void;
}) {
  const cabecalho = (
    <>
      <span className="rounded-control bg-accent-soft px-2 py-0.5 font-mono text-[13px] font-semibold text-accent">v{v.versao}</span>
      <span id={`versao-${v.versao}-titulo`} className="min-w-0 flex-1 truncate text-left text-[14px] font-semibold text-text">
        {v.titulo}
      </span>
      {atual && <Badge tone="emerald">Atual</Badge>}
      <time dateTime={v.data} className="shrink-0 text-[12px] text-muted">
        {dataVersao(v.data)}
      </time>
    </>
  );
  return (
    <article
      id={`versao-${v.versao}`}
      aria-labelledby={`versao-${v.versao}-titulo`}
      className={`scroll-mt-2 rounded-card border bg-surface p-[var(--pad-card)] transition-[border-color,box-shadow] duration-[var(--motion-duration)] ${
        destaque ? "border-accent ring-2 ring-accent/25" : "border-border"
      }`}
    >
      {onAlternar ? (
        <button
          type="button"
          onClick={onAlternar}
          aria-expanded={aberto}
          title={aberto ? "Recolher" : "Ver o que mudou"}
          className="-m-1 flex w-[calc(100%+0.5rem)] min-h-11 items-center gap-2 rounded-control p-1 hover:bg-surface-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40 lg:min-h-0"
        >
          {cabecalho}
          <IconChevronDown className={`h-4 w-4 shrink-0 text-muted transition-transform duration-[var(--motion-duration)] ${aberto ? "rotate-180" : ""}`} />
        </button>
      ) : (
        <header className="flex items-center gap-2">{cabecalho}</header>
      )}
      {aberto && v.mudancas.length === 0 && <p className="mt-2 text-[13px] text-muted">Sem mudanças nas telas do seu grupo.</p>}
      {aberto && v.mudancas.length > 0 && (
        <ul className="mt-2 animate-fade-in-up divide-y divide-border">
          {v.mudancas.map((m) => (
            <li key={`${m.area}:${m.texto}`} className="flex items-center gap-2.5 py-2">
              <Badge tone={TOM_MUDANCA[m.tipo]}>{ROTULO_MUDANCA[m.tipo]}</Badge>
              <p className="min-w-0 flex-1 text-[13px] leading-snug text-text-2">
                <span className="font-medium text-text">{m.area}:</span> {m.texto}
              </p>
              {m.link && linkInterno(m.link) && (
                <Button
                  href={m.link}
                  size="sm"
                  variant="secondary"
                  aria-label={`Ver onde mudou — ${m.area}`}
                  title={`Ir até onde mudou (${m.area})`}
                  onClick={onIr}
                  icon={<IconChevronRight className="h-4 w-4" />}
                />
              )}
            </li>
          ))}
        </ul>
      )}
    </article>
  );
}

/**
 * As NOVIDADES num BANNER FLUTUANTE (a `JanelaFlutuante`: ao lado da âncora no desktop, sem fechar o sino; folha no
 * celular): todas as versões, a escolhida aberta e destacada (as outras recolhidas), cada mudança com "ir até onde mudou".
 */
export function NovidadesFlutuantes({
  versao,
  ancora,
  onFechar,
  onIr,
}: {
  /** A versão aberta (null = fechado). */
  versao: string | null;
  ancora: { x: number; y: number; w: number; h: number } | null;
  onFechar: () => void;
  /** Ir até uma mudança (quem usa fecha o que mais estiver aberto — o sino). */
  onIr?: () => void;
}) {
  const [abertas, setAbertas] = useState<Set<string>>(new Set());
  const versoes = useVersoesVisiveis();
  const corpo = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!versao) return;
    marcarVista();
    setAbertas(new Set([versao]));
    // A escolhida à vista (o banner já trocou de versão sem fechar).
    requestAnimationFrame(() => corpo.current?.querySelector(`#versao-${CSS.escape(versao)}`)?.scrollIntoView({ block: "nearest" }));
  }, [versao]);
  return (
    <JanelaFlutuante aberta={versao != null} ancora={ancora} titulo={`Novidades — versão atual ${VERSAO_ATUAL}`} onFechar={onFechar} largura={500}>
      <div ref={corpo} className="space-y-2">
        {/* No celular o título está na folha. */}
        <p className="hidden items-center gap-1.5 text-[15px] font-semibold text-text lg:flex">
          <IconNovidades className="h-4 w-4 text-accent" /> Novidades
          <span className="ml-auto font-mono text-[12px] font-normal text-muted">atual v{VERSAO_ATUAL}</span>
        </p>
        {versoes.map((v) => (
          <CartaoVersao
            key={v.versao}
            v={v}
            atual={v.versao === VERSAO_ATUAL}
            destaque={v.versao === versao}
            aberto={abertas.has(v.versao)}
            onAlternar={() => setAbertas((s) => (s.has(v.versao) ? new Set([...s].filter((x) => x !== v.versao)) : new Set([...s, v.versao])))}
            onIr={() => {
              onFechar();
              onIr?.();
            }}
          />
        ))}
      </div>
    </JanelaFlutuante>
  );
}

/** A versão já vista NESTE aparelho (conveniência: o ponto de "novo" no menu some depois de abrir as Novidades). */
const CHAVE_VISTA = "sistema:versao-vista";
const lerVista = () => {
  try {
    return localStorage.getItem(CHAVE_VISTA);
  } catch {
    return null;
  }
};
const marcarVista = () => {
  try {
    localStorage.setItem(CHAVE_VISTA, VERSAO_ATUAL);
  } catch {
    /* sem armazenamento: o ponto só não some */
  }
  window.dispatchEvent(new Event(CHAVE_VISTA));
};

/** O NÚMERO DA VERSÃO no fim do menu lateral: abre as Novidades no banner flutuante; o ponto marca a versão ainda não
 * vista neste aparelho. */
export function VersaoSistema({ onNavigate }: { onNavigate?: () => void }) {
  const [nova, setNova] = useState(false);
  const [ancora, setAncora] = useState<{ x: number; y: number; w: number; h: number } | null>(null);
  useEffect(() => {
    const ler = () => setNova(lerVista() !== VERSAO_ATUAL);
    ler();
    window.addEventListener(CHAVE_VISTA, ler);
    return () => window.removeEventListener(CHAVE_VISTA, ler);
  }, []);
  return (
    <>
      <button
        type="button"
        onClick={(e) => {
          const r = e.currentTarget.getBoundingClientRect();
          setAncora({ x: r.x, y: r.y, w: r.width, h: r.height });
        }}
        aria-haspopup="dialog"
        title={nova ? `Versão ${VERSAO_ATUAL} — veja o que mudou` : `Versão ${VERSAO_ATUAL} — novidades`}
        className="flex min-h-11 w-full items-center justify-center gap-1.5 rounded-control px-2 text-[12px] text-faint transition-colors hover:bg-surface-2 hover:text-text-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40 lg:min-h-8"
      >
        <IconNovidades className={`h-3.5 w-3.5 ${nova ? "text-accent" : ""}`} />
        <span className="font-mono">v{VERSAO_ATUAL}</span>
        {nova && (
          <>
            <span className="h-1.5 w-1.5 rounded-full bg-accent" aria-hidden="true" />
            <span className="sr-only">(novidades não vistas)</span>
          </>
        )}
      </button>
      <NovidadesFlutuantes versao={ancora ? VERSAO_ATUAL : null} ancora={ancora} onFechar={() => setAncora(null)} onIr={onNavigate} />
    </>
  );
}
