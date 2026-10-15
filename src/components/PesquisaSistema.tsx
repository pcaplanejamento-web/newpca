"use client";

import { useRouter } from "next/navigation";
import { type ComponentType, type SVGProps, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { predicadoBusca } from "@/lib/tabela-filtros";
import { hrefVinculo, linkTarefa, ROTULO_VINCULO, type TipoVinculo } from "@/lib/tarefas-core";
import { IconArrowRight, IconBox, IconClipboard, IconClock, IconKanban, IconLayers, IconSearch, IconSpinner, IconWallet } from "./icons";

type Icone = ComponentType<SVGProps<SVGSVGElement>>;
export type TelaPesquisa = { href: string; label: string; secao: string; Icon: Icone };
export type PcaPesquisa = { id: number; nome: string; ano: number };

/** Um resultado: o que aparece, onde fica (a seção, à direita do travessão) e para onde leva. */
type Resultado = { chave: string; rotulo: string; detalhe?: string; href: string; tipo: string };

const RECENTES = "pesquisa:recentes";
const MAX_RECENTES = 6;

const ICONE_TIPO: Record<string, Icone> = {
  tela: IconLayers,
  protocolo: IconClipboard,
  dfd: IconClipboard,
  item: IconClipboard,
  pca: IconBox,
  orcamento: IconWallet,
  tarefa: IconKanban,
};

/** As DICAS — o prefixo restringe a pesquisa a um tipo (como o "ask:" do Cloudflare). */
const DICAS: { prefixo: string; tipo: TipoVinculo | "tela"; texto: string }[] = [
  { prefixo: "protocolo:", tipo: "protocolo", texto: "Pesquisar protocolos (nº, Id, assunto)" },
  { prefixo: "dfd:", tipo: "dfd", texto: "Pesquisar DFDs (nº, planejamento, objeto)" },
  { prefixo: "item:", tipo: "item", texto: "Pesquisar itens dos DFDs (descrição, código)" },
  { prefixo: "tarefa:", tipo: "tarefa", texto: "Pesquisar tarefas (título, nº do ticket)" },
  { prefixo: "pca:", tipo: "pca", texto: "Pesquisar PCAs" },
  { prefixo: "orcamento:", tipo: "orcamento", texto: "Pesquisar orçamentos" },
  { prefixo: "tela:", tipo: "tela", texto: "Pesquisar telas do sistema" },
];

/** Sem prefixo, o servidor é consultado nestes tipos. */
const PADRAO: TipoVinculo[] = ["protocolo", "dfd", "tarefa"];

function lerRecentes(): Resultado[] {
  try {
    const v = JSON.parse(localStorage.getItem(RECENTES) ?? "[]");
    return Array.isArray(v) ? v.filter((r) => r && typeof r.href === "string" && typeof r.rotulo === "string").slice(0, MAX_RECENTES) : [];
  } catch {
    return [];
  }
}

function lembrar(r: Resultado) {
  try {
    localStorage.setItem(RECENTES, JSON.stringify([r, ...lerRecentes().filter((x) => x.chave !== r.chave)].slice(0, MAX_RECENTES)));
  } catch {
    /* sem armazenamento: só não lembra */
  }
}

/** Lê "dfd: 1234" → o tipo e o termo. */
function lerConsulta(texto: string): { tipo: TipoVinculo | "tela" | null; termo: string } {
  const t = texto.trimStart();
  const d = DICAS.find((x) => t.toLowerCase().startsWith(x.prefixo));
  return d ? { tipo: d.tipo, termo: t.slice(d.prefixo.length).trim() } : { tipo: null, termo: t.trim() };
}

const EVENTO_ABRIR = "pesquisa-sistema:abrir";

/** O campo "Pesquisa rápida… Ctrl K" do menu lateral — abre o banner. Recolhido, fica só a lupa. */
export function GatilhoPesquisa() {
  const [mac, setMac] = useState(false);
  useEffect(() => setMac(/Mac|iPhone|iPad/.test(navigator.platform)), []);
  return (
    <button
      type="button"
      onClick={() => window.dispatchEvent(new Event(EVENTO_ABRIR))}
      aria-label="Pesquisa rápida no sistema"
      title={`Pesquisa rápida (${mac ? "⌘K" : "Ctrl+K"})`}
      className="flex h-11 w-full min-w-0 items-center gap-2.5 overflow-hidden rounded-control border border-border bg-surface px-[13px] text-[13px] text-faint transition-colors hover:border-border-2 hover:text-text-2 lg:h-[var(--h-control-sm)]"
    >
      <IconSearch className="h-4 w-4 shrink-0" aria-hidden="true" />
      <span className="menu-esconde min-w-0 flex-1 truncate text-left">Pesquisa rápida…</span>
      <kbd className="menu-esconde shrink-0 font-sans text-[11.5px]">{mac ? "⌘K" : "Ctrl K"}</kbd>
    </button>
  );
}

/**
 * PESQUISA DO SISTEMA (o padrão do Cloudflare): Ctrl+K/⌘K ou o campo do menu abrem o BANNER — sem texto, os RECENTES e as
 * DICAS de pesquisa; com texto, as telas e PCAs (aqui mesmo) + protocolos, DFDs e tarefas no servidor (a busca dos vínculos,
 * no escopo e no papel da pessoa). Um prefixo ("dfd:", "item:"…) restringe a um tipo. ↑/↓ navegam, Enter abre, Esc fecha.
 */
export function PesquisaSistema({ telas, pcas }: { telas: TelaPesquisa[]; pcas: PcaPesquisa[] }) {
  const router = useRouter();
  const [aberto, setAberto] = useState(false);
  const [texto, setTexto] = useState("");
  const [foco, setFoco] = useState(0);
  const [recentes, setRecentes] = useState<Resultado[]>([]);
  const [remotos, setRemotos] = useState<Resultado[]>([]);
  const [carregando, setCarregando] = useState(false);
  const campo = useRef<HTMLInputElement>(null);
  const lista = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const abrir = () => setAberto(true);
    const k = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setAberto((v) => !v);
      }
    };
    window.addEventListener(EVENTO_ABRIR, abrir);
    window.addEventListener("keydown", k);
    return () => {
      window.removeEventListener(EVENTO_ABRIR, abrir);
      window.removeEventListener("keydown", k);
    };
  }, []);

  useEffect(() => {
    if (!aberto) return;
    setRecentes(lerRecentes());
    setTexto("");
    setFoco(0);
    setRemotos([]);
    requestAnimationFrame(() => campo.current?.focus());
    const antes = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = antes;
    };
  }, [aberto]);

  const { tipo, termo } = lerConsulta(texto);

  // Servidor: espera 250 ms depois da última tecla; a resposta antiga não sobrescreve a nova.
  useEffect(() => {
    if (!aberto) return;
    const tipos = tipo === "tela" ? [] : tipo ? [tipo] : termo.length >= 2 ? PADRAO : [];
    if (!tipos.length || (!tipo && termo.length < 2)) {
      setRemotos([]);
      setCarregando(false);
      return;
    }
    let vivo = true;
    setCarregando(true);
    const t = setTimeout(async () => {
      const partes = await Promise.all(
        tipos.map(async (tp) => {
          try {
            const r = await fetch(`/api/tarefas/vinculos?tipo=${tp}&q=${encodeURIComponent(termo)}`);
            const j = (await r.json()) as { ok?: boolean; opcoes?: { id: number; rotulo: string; detalhe: string }[] };
            return (j.opcoes ?? []).slice(0, tipo ? 30 : 6).map<Resultado>((o) => ({
              chave: `${tp}:${o.id}`,
              rotulo: o.rotulo,
              detalhe: o.detalhe ? `${ROTULO_VINCULO[tp]} · ${o.detalhe}` : ROTULO_VINCULO[tp],
              href: tp === "tarefa" ? linkTarefa(o.id) : hrefVinculo({ tipo: tp, id: o.id }),
              tipo: tp,
            }));
          } catch {
            return [];
          }
        }),
      );
      if (vivo) {
        setRemotos(partes.flat());
        setCarregando(false);
      }
    }, 250);
    return () => {
      vivo = false;
      clearTimeout(t);
    };
  }, [aberto, tipo, termo]);

  const locais = useMemo<Resultado[]>(() => {
    if (tipo && tipo !== "tela" && tipo !== "pca") return [];
    const casa = predicadoBusca(termo);
    if (!casa) return [];
    const ts = tipo === "pca" ? [] : telas.filter((t) => casa([t.label, t.secao])).map<Resultado>((t) => ({ chave: `tela:${t.href}`, rotulo: t.label, detalhe: t.secao, href: t.href, tipo: "tela" }));
    const ps =
      tipo === "tela"
        ? []
        : pcas.filter((p) => casa([p.nome, String(p.ano)])).map<Resultado>((p) => ({ chave: `pca:${p.id}`, rotulo: p.nome, detalhe: `PCA ${p.ano}`, href: `/painel/pca/${p.id}`, tipo: "pca" }));
    return [...ts, ...ps];
  }, [tipo, termo, telas, pcas]);

  const semTexto = !texto.trim();
  const dicasVisiveis = semTexto ? DICAS : texto.includes(":") ? [] : DICAS.filter((d) => d.prefixo.startsWith(texto.trim().toLowerCase()));
  // Os remotos que repetem um local (pca) saem.
  const resultados = semTexto ? recentes : [...locais, ...remotos.filter((r) => !locais.some((l) => l.chave === r.chave))];
  const itens: ({ k: "r"; r: Resultado } | { k: "d"; d: (typeof DICAS)[number] })[] = [
    ...resultados.map((r) => ({ k: "r" as const, r })),
    ...dicasVisiveis.map((d) => ({ k: "d" as const, d })),
  ];
  const focoValido = Math.min(foco, Math.max(0, itens.length - 1));

  useEffect(() => {
    lista.current?.querySelector(`[data-indice="${focoValido}"]`)?.scrollIntoView({ block: "nearest" });
  }, [focoValido]);

  function escolher(i: number) {
    const it = itens[i];
    if (!it) return;
    if (it.k === "d") {
      setTexto(it.d.prefixo + " ");
      setFoco(0);
      campo.current?.focus();
      return;
    }
    lembrar(it.r);
    setAberto(false);
    router.push(it.r.href);
  }

  function teclado(e: React.KeyboardEvent) {
    if (e.key === "Escape") {
      e.preventDefault();
      setAberto(false);
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      setFoco((f) => Math.min(itens.length - 1, f + 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setFoco((f) => Math.max(0, f - 1));
    } else if (e.key === "Enter") {
      e.preventDefault();
      escolher(focoValido);
    }
  }

  if (!aberto || typeof document === "undefined") return null;

  const linha = (i: number, icone: Icone, principal: string, secundario: string | undefined, mono = false) => {
    const Ic = icone;
    const ativo = i === focoValido;
    return (
      <button
        key={i}
        type="button"
        data-indice={i}
        onMouseMove={() => setFoco(i)}
        onClick={() => escolher(i)}
        className={`flex min-h-11 w-full items-center gap-3 rounded-control px-3 py-2 text-left ${ativo ? "bg-surface-2" : ""}`}
      >
        <Ic className="h-4 w-4 shrink-0 text-muted" aria-hidden="true" />
        <span className={`min-w-0 truncate text-[14px] text-text ${mono ? "font-mono" : ""}`}>{principal}</span>
        {secundario && (
          <span className="min-w-0 truncate text-[13px] text-muted">
            <span aria-hidden="true" className="mr-2 text-faint">
              —
            </span>
            {secundario}
          </span>
        )}
        {ativo && <IconArrowRight className="ml-auto h-4 w-4 shrink-0 text-muted" aria-hidden="true" />}
      </button>
    );
  };

  const titulo = (t: string) => <p className="px-3 pt-3 pb-1.5 text-[12px] font-semibold text-muted">{t}</p>;

  return createPortal(
    <div className="fixed inset-0 z-[80] flex items-start justify-center px-[var(--pad-canvas)] pt-[8vh] print:hidden">
      <div aria-hidden="true" className="absolute inset-0 bg-[var(--scrim)]" onClick={() => setAberto(false)} />
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Pesquisa no sistema"
        onKeyDown={teclado}
        className="relative flex max-h-[80vh] w-full max-w-2xl animate-fade-in-up flex-col overflow-hidden rounded-card border border-border bg-surface shadow-flutuante"
      >
        <div className="flex items-center gap-3 border-b border-border px-4">
          {carregando ? <IconSpinner className="h-5 w-5 shrink-0 text-muted" /> : <IconSearch className="h-5 w-5 shrink-0 text-muted" aria-hidden="true" />}
          <input
            ref={campo}
            value={texto}
            onChange={(e) => {
              setTexto(e.target.value);
              setFoco(0);
            }}
            placeholder="Pesquise telas, protocolos, DFDs, tarefas e PCAs…"
            aria-label="Pesquisar no sistema"
            className="h-14 min-w-0 flex-1 bg-transparent text-[15px] text-text outline-none placeholder:text-faint"
          />
          <button type="button" onClick={() => setAberto(false)} className="shrink-0 rounded-chip border border-border px-1.5 py-0.5 text-[12px] text-muted hover:bg-surface-2">
            Esc
          </button>
        </div>
        <div ref={lista} className="min-h-0 flex-1 overflow-y-auto p-2">
          {semTexto && recentes.length > 0 && titulo("Recentes")}
          {!semTexto && resultados.length > 0 && titulo(tipo ? `Resultados — ${DICAS.find((d) => d.tipo === tipo)?.texto.replace("Pesquisar ", "")}` : "Resultados")}
          {resultados.map((r, i) => linha(i, semTexto ? IconClock : (ICONE_TIPO[r.tipo] ?? IconLayers), r.rotulo, r.detalhe))}
          {!semTexto && !carregando && resultados.length === 0 && dicasVisiveis.length === 0 && (
            <p className="px-3 py-6 text-center text-[13px] text-muted">{termo.length < 2 && !tipo ? "Digite ao menos 2 letras." : "Nada encontrado."}</p>
          )}
          {dicasVisiveis.length > 0 && titulo("Dicas de pesquisa")}
          {dicasVisiveis.map((d, j) => linha(resultados.length + j, ICONE_TIPO[d.tipo] ?? IconLayers, d.prefixo, d.texto, true))}
        </div>
        <div className="hidden items-center gap-4 border-t border-border bg-surface-2 px-4 py-2.5 text-[12.5px] text-muted sm:flex">
          <span className="flex items-center gap-1.5">
            <kbd className="rounded-chip border border-border bg-surface px-1.5 font-sans">↑</kbd>
            <kbd className="rounded-chip border border-border bg-surface px-1.5 font-sans">↓</kbd>
            para navegar
          </span>
          <span className="flex items-center gap-1.5">
            <kbd className="rounded-chip border border-border bg-surface px-1.5 font-sans">↵</kbd>
            para selecionar
          </span>
        </div>
      </div>
    </div>,
    document.body,
  );
}
