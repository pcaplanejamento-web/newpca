"use client";

import { type ComponentType, type ReactNode, type SVGProps, useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ChipsEscolha } from "./ChipsEscolha";
import { IconArrowRight, IconClock, IconClose, IconEstrela, IconLayers, IconSearch } from "./icons";

export type IconePesquisa = ComponentType<SVGProps<SVGSVGElement>>;
/** Um resultado: o rótulo, o contexto (à direita do travessão), para onde leva — ou a AÇÃO que executa. */
export type ResultadoPesquisaTela = {
  chave: string;
  rotulo: string;
  caminho?: string[];
  detalhe?: string;
  /** Os campos do resultado (rótulo, valor) — a prévia os mostra em grade; sem eles, o detalhe. */
  info?: [string, string][];
  /** Os IDENTIFICADORES em destaque (Seq., nº do DFD, planejamento, nº do protocolo), antes do rótulo. */
  ids?: string[];
  /** Um selo à direita do rótulo (a SIGLA da unidade) — identifica o resultado de relance. */
  selo?: string;
  href?: string;
  tipo: string;
  acao?: () => void;
  palavras?: string;
};
export type GrupoPesquisa = { tipo: string; titulo: string; itens: ResultadoPesquisaTela[]; total?: number; carregando?: boolean };
/** Uma DICA de prefixo: "dfd:" (ou o atalho "d:") restringe a pesquisa ao tipo. */
export type DicaPesquisa = { prefixo: string; curto: string; tipo: string; texto: string };
export type FiltroPesquisa = { value: string; label: string; conta?: number };

/** Fora do banner: o campo do menu/cabeçalho abre o banner por este evento. */
export const EVENTO_ABRIR_PESQUISA = "pesquisa-sistema:abrir";

/** O prefixo no começo do texto (a dica e quantos caracteres ocupa) — `null` sem prefixo. */
export function prefixoDe(texto: string, dicas: readonly DicaPesquisa[]): { d: DicaPesquisa; tamanho: number } | null {
  const baixo = texto.trimStart().toLowerCase();
  const d = dicas.find((x) => baixo.startsWith(x.prefixo)) ?? dicas.find((x) => baixo.startsWith(x.curto));
  return d ? { d, tamanho: baixo.startsWith(d.prefixo) ? d.prefixo.length : d.curto.length } : null;
}

/** Lê "dfd: 1234" ou "d: 1234" → o tipo e o termo. */
export function lerConsulta(texto: string, dicas: readonly DicaPesquisa[]): { tipo: string | null; termo: string } {
  const p = prefixoDe(texto, dicas);
  const t = texto.trimStart();
  return p ? { tipo: p.d.tipo, termo: t.slice(p.tamanho).trim() } : { tipo: null, termo: t.trim() };
}

/** O número digitado bate com um número INTEIRO do rótulo ("144756" acha o protocolo 144756/2026 antes do 1447560). */
export function numeroExato(rotulo: string, termo: string): boolean {
  const n = termo.replace(/^#/, "");
  return /^\d+$/.test(n) && new RegExp(`(^|\\D)${n}(\\D|$)`).test(rotulo);
}

/** O trecho que casou, em destaque (sem acento/caixa). */
function Destaque({ texto, termo }: { texto: string; termo: string }): ReactNode {
  // TODOS os termos, em todas as ocorrências, sem acento/caixa ("manutencao" marca "MANUTENÇÃO"; "65" marca o Id 2289654).
  const tira = (x: string) => x.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();
  const termos = tira(termo).split(/\s+/).filter((t) => t.length > 0);
  if (!termos.length) return texto;
  const base = tira(texto);
  if (base.length !== texto.length) return texto; // texto com caractere decomposto: sem marcar (nunca marca o lugar errado)
  const marca = new Array<boolean>(texto.length).fill(false);
  for (const t of termos) for (let i = base.indexOf(t); i >= 0; i = base.indexOf(t, i + 1)) marca.fill(true, i, i + t.length);
  const partes: ReactNode[] = [];
  let i = 0;
  while (i < texto.length) {
    let j = i;
    while (j < texto.length && marca[j] === marca[i]) j++;
    partes.push(
      marca[i] ? (
        <mark key={i} className="bg-transparent font-semibold text-accent">
          {texto.slice(i, j)}
        </mark>
      ) : (
        texto.slice(i, j)
      ),
    );
    i = j;
  }
  return <>{partes}</>;
}

/** Um selo do resultado (o termo em destaque quando casa): `id` = o identificador (accent); senão a SIGLA (neutro). */
function SeloPesquisa({ texto, termo, id = false }: { texto: string; termo: string; id?: boolean }) {
  return (
    <span
      className={`shrink-0 rounded-chip border px-1.5 py-px font-mono text-[11.5px] font-semibold tracking-normal whitespace-nowrap normal-case ${
        id ? "border-accent/30 bg-accent-soft text-accent" : "border-border bg-surface-2 text-text-2"
      }`}
    >
      <Destaque texto={texto} termo={termo} />
    </span>
  );
}

/** Os selos de um resultado: os identificadores e a sigla. */
function Selos({ r, termo }: { r: ResultadoPesquisaTela; termo: string }) {
  return (
    <>
      {r.ids?.map((t) => <SeloPesquisa key={t} texto={t} termo={termo} id />)}
      {r.selo && <SeloPesquisa texto={r.selo} termo={termo} />}
    </>
  );
}

/**
 * O campo "Pesquisa rápida… Ctrl K" que abre o banner. No menu lateral (recolhido, só a lupa); no CABEÇALHO
 * (`cabecalho`): no celular só a lupa (44px), a partir de `sm` o campo com o texto.
 */
export function GatilhoPesquisa({ rotulo = "Pesquisa rápida", cabecalho = false }: { rotulo?: string; cabecalho?: boolean }) {
  const [mac, setMac] = useState(false);
  useEffect(() => setMac(/Mac|iPhone|iPad/.test(navigator.platform)), []);
  const atalho = mac ? "⌘K" : "Ctrl K";
  return (
    <button
      type="button"
      onClick={() => window.dispatchEvent(new Event(EVENTO_ABRIR_PESQUISA))}
      aria-label={rotulo}
      title={`${rotulo} (${mac ? "⌘K" : "Ctrl+K"})`}
      className={`flex h-11 min-w-0 items-center gap-2.5 overflow-hidden rounded-control border border-border bg-surface text-[13px] text-faint transition-colors hover:border-border-2 hover:text-text-2 desktop:h-[var(--h-control-sm)] ${
        cabecalho ? "w-11 shrink-0 justify-center sm:w-full sm:max-w-md sm:justify-start sm:px-[13px]" : "w-full px-[13px]"
      }`}
    >
      <IconSearch className="h-4 w-4 shrink-0" aria-hidden="true" />
      <span className={`min-w-0 flex-1 truncate text-left ${cabecalho ? "hidden sm:block" : "menu-esconde"}`}>{rotulo}…</span>
      <kbd className={`shrink-0 font-sans text-[11.5px] ${cabecalho ? "hidden md:block" : "menu-esconde"}`}>{atalho}</kbd>
    </button>
  );
}

/**
 * O BANNER DA PESQUISA (o padrão do Cloudflare) — o MESMO na pesquisa do sistema (`PesquisaSistema`) e na da tela pública
 * (`PesquisaPublica`); quem usa só dá os DADOS. Campo com o PREFIXO em chip sólido (sai inteiro), filtros rápidos com a
 * contagem, resultados em grupos (o termo em destaque, "Ver todos (N)", Recentes com × e Limpar, Dicas), a prévia do item
 * em foco à direita (desktop; `lateralExtra` embaixo dela) e os atalhos no rodapé. ↑/↓, Enter, Esc, Tab completa o
 * prefixo; combobox acessível (o foco fica no campo). Tela cheia no celular.
 */
export function BannerPesquisa({
  rotulo,
  placeholder,
  escopo,
  texto,
  onTexto,
  onFechar,
  dicas,
  dicasVisiveis,
  grupos,
  filtros,
  carregando = false,
  previaCarregando = false,
  falhou = false,
  onTentar,
  icones,
  rotuloTipo,
  onEscolher,
  onEsquecer,
  onLimparRecentes,
  favorito,
  lateralExtra,
}: {
  /** O nome acessível do banner ("Pesquisa no sistema"). */
  rotulo: string;
  placeholder: string;
  /** Onde a pesquisa procura ("PCA 2027") — um chip fixo no início do campo. */
  escopo?: string;
  texto: string;
  onTexto: (v: string) => void;
  onFechar: () => void;
  /** Todas as dicas de prefixo (o chip, os atalhos e "Ver todos"). */
  dicas: readonly DicaPesquisa[];
  /** As dicas listadas agora (sem texto, todas; com o começo de um prefixo, as que casam). */
  dicasVisiveis: readonly DicaPesquisa[];
  grupos: GrupoPesquisa[];
  /** Os filtros rápidos; `null` = o esqueleto (a contagem ainda não chegou). */
  filtros: FiltroPesquisa[] | null;
  carregando?: boolean;
  /** O esqueleto da prévia no lugar do item em foco. */
  previaCarregando?: boolean;
  falhou?: boolean;
  onTentar?: () => void;
  icones: Record<string, IconePesquisa>;
  /** O rótulo do tipo na prévia ("Protocolo", "Aba"…). */
  rotuloTipo: (r: ResultadoPesquisaTela) => string;
  onEscolher: (r: ResultadoPesquisaTela) => void;
  onEsquecer?: (chave: string) => void;
  onLimparRecentes?: () => void;
  /** A estrela de cada resultado (só a pesquisa do sistema — os favoritos são da conta). */
  favorito?: { pode: (r: ResultadoPesquisaTela) => boolean; eh: (chave: string) => boolean; alternar: (r: ResultadoPesquisaTela) => void };
  /** Embaixo da prévia (desktop): os favoritos da pesquisa do sistema. */
  lateralExtra?: ReactNode;
}) {
  const idLista = useId();
  const campo = useRef<HTMLInputElement>(null);
  const lista = useRef<HTMLDivElement>(null);
  const [foco, setFoco] = useState(0);
  const { tipo, termo } = lerConsulta(texto, dicas);
  const prefixo = prefixoDe(texto, dicas);
  const resto = prefixo ? texto.trimStart().slice(prefixo.tamanho).replace(/^\s/, "") : texto;

  // Aberto: o campo ganha o foco e a página não rola por baixo.
  useEffect(() => {
    requestAnimationFrame(() => campo.current?.focus());
    const antes = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = antes;
    };
  }, []);

  const mudar = (v: string) => {
    onTexto(v);
    setFoco(0);
  };

  const itens: { r: ResultadoPesquisaTela; grupo: string }[] = [
    ...grupos.flatMap((g) => g.itens.map((r) => ({ r, grupo: g.tipo }))),
    ...dicasVisiveis.map((d) => ({ r: { chave: `dica:${d.prefixo}`, rotulo: d.prefixo, detalhe: `${d.texto} · atalho ${d.curto}`, tipo: d.tipo }, grupo: "dica" })),
  ];
  const focoValido = Math.min(foco, Math.max(0, itens.length - 1));
  const emFoco = itens[focoValido];

  useEffect(() => {
    lista.current?.querySelector(`[data-indice="${focoValido}"]`)?.scrollIntoView({ block: "nearest" });
  }, [focoValido]);

  const podeFav = (r: ResultadoPesquisaTela, grupo: string) => grupo !== "dica" && !!favorito?.pode(r);

  function escolher(i: number) {
    const it = itens[i];
    if (!it) return;
    if (it.grupo === "dica") {
      mudar(`${it.r.rotulo} `);
      campo.current?.focus();
      return;
    }
    onEscolher(it.r);
  }

  function teclado(e: React.KeyboardEvent) {
    if (e.key === "Escape") {
      e.preventDefault();
      onFechar();
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      setFoco((f) => Math.min(itens.length - 1, f + 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setFoco((f) => Math.max(0, f - 1));
    } else if (e.key === "Enter") {
      e.preventDefault();
      escolher(focoValido);
    } else if (e.key === "Tab" && dicasVisiveis.length && !texto.includes(":")) {
      // Tab completa o prefixo sugerido.
      e.preventDefault();
      mudar(`${dicasVisiveis[0].prefixo} `);
    }
  }

  if (typeof document === "undefined") return null;

  let indice = -1;
  const linha = (r: ResultadoPesquisaTela, grupo: string) => {
    indice += 1;
    const i = indice;
    const Ic = grupo === "recentes" ? IconClock : grupo === "favoritos" ? IconEstrela : grupo === "dica" ? (icones[r.tipo] ?? IconSearch) : (icones[r.tipo] ?? IconLayers);
    const ativo = i === focoValido;
    const fav = podeFav(r, grupo);
    const eh = fav && !!favorito?.eh(r.chave);
    return (
      // biome-ignore lint/a11y/useFocusableInteractive: combobox — o foco fica no campo e a opção ativa vem por aria-activedescendant.
      <div key={`${grupo}:${r.chave}`} id={`${idLista}-${i}`} role="option" aria-selected={ativo} className="group/linha relative">
        <button
          type="button"
          tabIndex={-1}
          data-indice={i}
          onMouseMove={() => setFoco(i)}
          onClick={() => escolher(i)}
          className={`flex min-h-11 w-full items-center gap-3 rounded-control px-3 py-2 text-left ${ativo ? "bg-surface-2" : ""} ${grupo === "recentes" ? (fav ? "pr-20" : "pr-11") : fav ? "pr-11" : ""}`}
        >
          <Ic className="h-4 w-4 shrink-0 text-muted" aria-hidden="true" />
          {/* Duas linhas: o rótulo (com o caminho) em cima e o detalhe embaixo — nada disputa a largura. */}
          <span className="min-w-0 flex-1">
            <span className="flex min-w-0 items-center gap-2">
            <span className={`min-w-0 truncate text-[14px] text-text ${grupo === "dica" ? "font-mono" : ""}`}>
              {r.caminho?.map((c) => (
                <span key={c} className="text-muted">
                  {c}
                  <span aria-hidden="true" className="mx-1.5 text-faint">
                    ›
                  </span>
                </span>
              ))}
              {grupo === "dica" ? r.rotulo : <Destaque texto={r.rotulo} termo={termo} />}
            </span>
            <Selos r={r} termo={termo} />
            </span>
            {r.detalhe && <span className="mt-0.5 block truncate text-[12.5px] text-muted">{grupo === "dica" ? r.detalhe : <Destaque texto={r.detalhe} termo={termo} />}</span>}
          </span>
          {ativo && grupo !== "recentes" && !fav && <IconArrowRight className="h-4 w-4 shrink-0 text-muted" aria-hidden="true" />}
        </button>
        {fav && favorito && (
          <button
            type="button"
            tabIndex={-1}
            onClick={() => favorito.alternar(r)}
            aria-pressed={eh}
            aria-label={eh ? `Tirar ${r.rotulo} dos favoritos` : `Favoritar ${r.rotulo}`}
            title={eh ? "Tirar dos favoritos" : "Favoritar"}
            className={`absolute top-1/2 grid h-8 w-8 -translate-y-1/2 place-items-center rounded-control transition-opacity hover:bg-surface ${grupo === "recentes" ? "right-10" : "right-1.5"} ${
              eh ? "text-[var(--warn)]" : `text-faint hover:text-text pointer-coarse:opacity-100 ${ativo ? "opacity-100" : "opacity-0 group-hover/linha:opacity-100"}`
            }`}
          >
            <IconEstrela className="h-4 w-4" fill={eh ? "currentColor" : "none"} />
          </button>
        )}
        {grupo === "recentes" && onEsquecer && (
          <button
            type="button"
            tabIndex={-1}
            onClick={() => onEsquecer(r.chave)}
            aria-label={`Tirar ${r.rotulo} dos recentes`}
            title="Tirar dos recentes"
            className="absolute top-1/2 right-1 grid h-8 w-8 -translate-y-1/2 pointer-coarse:h-11 pointer-coarse:w-11 place-items-center rounded-control text-faint hover:bg-surface hover:text-text"
          >
            <IconClose className="h-3.5 w-3.5" />
          </button>
        )}
      </div>
    );
  };

  const cabecalhoGrupo = (g: GrupoPesquisa) => (
    <div className="flex items-center gap-2 px-3 pt-3 pb-1.5">
      <p className="text-[12px] font-semibold text-muted">{g.titulo}</p>
      {g.tipo === "recentes" && onLimparRecentes && (
        <button type="button" tabIndex={-1} onClick={onLimparRecentes} className="ml-auto text-[12px] text-faint hover:text-text-2">
          Limpar
        </button>
      )}
      {!tipo && g.total != null && g.total > g.itens.length && (
        <button
          type="button"
          tabIndex={-1}
          onClick={() => {
            const d = dicas.find((x) => x.tipo === g.tipo);
            if (d) mudar(`${d.prefixo} ${termo}`);
            campo.current?.focus();
          }}
          className="ml-auto text-[12px] font-medium text-accent hover:underline"
        >
          Ver todos ({g.total >= 50 ? "50+" : g.total})
        </button>
      )}
    </div>
  );

  const semTexto = !texto.trim();
  const vazio = !semTexto && !carregando && !falhou && grupos.length === 0 && dicasVisiveis.length === 0;
  const EmFocoIcone = emFoco ? (icones[emFoco.r.tipo] ?? IconLayers) : IconSearch;
  const emFocoFav = !!emFoco && podeFav(emFoco.r, emFoco.grupo);
  const emFocoEh = emFocoFav && !!favorito?.eh(emFoco.r.chave);
  const escolherFiltro = (v: string) => {
    const d = dicas.find((x) => x.tipo === v);
    mudar(d && v ? `${d.prefixo} ${termo}` : termo);
    campo.current?.focus();
  };

  return createPortal(
    <div className="fixed inset-0 z-[80] flex items-stretch justify-center sm:items-start sm:px-[var(--pad-canvas)] sm:pt-[8dvh] print:hidden">
      <div aria-hidden="true" className="absolute inset-0 bg-[var(--scrim)]" onClick={onFechar} />
      <div
        role="dialog"
        aria-modal="true"
        aria-label={rotulo}
        onKeyDown={teclado}
        className="relative flex h-dvh w-full animate-fade-in-up flex-col overflow-hidden bg-surface shadow-flutuante sm:h-[min(80dvh,640px)] sm:max-w-3xl sm:rounded-card sm:border sm:border-border"
      >
        <div className="flex items-center gap-3 border-b border-border px-4 pt-[env(safe-area-inset-top)]">
          <IconSearch className="h-5 w-5 shrink-0 text-muted" aria-hidden="true" />
          {escopo && (
            <span title={`A pesquisa procura só no ${escopo}`} className="shrink-0 rounded-control bg-text px-2 py-0.5 text-[13px] font-semibold text-surface">
              {escopo}
            </span>
          )}
          {prefixo && (
            <span className="inline-flex shrink-0 animate-chip-entra items-center gap-1 rounded-control border border-accent bg-accent-soft py-0.5 pr-1 pl-2 text-[13px] font-medium text-accent">
              {filtros?.find((f) => f.value === prefixo.d.tipo)?.label ?? prefixo.d.prefixo.replace(":", "")}
              <button
                type="button"
                aria-label="Pesquisar em tudo"
                title="Pesquisar em tudo"
                onClick={() => {
                  mudar(resto);
                  campo.current?.focus();
                }}
                className="grid h-6 w-6 place-items-center rounded-chip hover:bg-[color-mix(in_srgb,var(--accent)_15%,transparent)] pointer-coarse:h-9 pointer-coarse:w-9"
              >
                <IconClose className="h-3.5 w-3.5" aria-hidden="true" />
              </button>
            </span>
          )}
          <input
            ref={campo}
            value={resto}
            onChange={(e) => {
              const v = e.target.value;
              // Com o prefixo, o campo é só o termo; sem ele, digitar um prefixo ("p:") vira o chip.
              const novo = prefixo ? null : prefixoDe(v, dicas);
              mudar(prefixo ? `${prefixo.d.prefixo} ${v}` : novo ? `${novo.d.prefixo} ${v.trimStart().slice(novo.tamanho).trimStart()}` : v);
            }}
            onKeyDown={(e) => {
              // Apagar no começo do campo tira o prefixo INTEIRO (nunca uma parte dele).
              const el = e.currentTarget;
              if (prefixo && e.key === "Backspace" && el.selectionStart === 0 && el.selectionEnd === 0) {
                e.preventDefault();
                mudar(resto);
              }
            }}
            role="combobox"
            aria-expanded="true"
            aria-controls={idLista}
            aria-activedescendant={itens.length ? `${idLista}-${focoValido}` : undefined}
            aria-autocomplete="list"
            placeholder={prefixo ? "Digite o que procura…" : placeholder}
            aria-label={rotulo}
            className="h-14 min-w-0 flex-1 bg-transparent text-[16px] text-text outline-none placeholder:text-faint sm:text-[15px]"
          />
          <button type="button" onClick={onFechar} className="shrink-0 rounded-chip border border-border px-1.5 py-0.5 text-[12px] text-muted hover:bg-surface-2">
            Esc
          </button>
        </div>
        <div className="border-b border-border px-3 pt-2 pb-0.5">
          {filtros ? (
            <ChipsEscolha rolar ariaLabel="Pesquisar em" opcoes={filtros} valor={tipo ?? ""} onEscolher={escolherFiltro} />
          ) : (
            // A contagem dos filtros ainda não chegou: o esqueleto até saber quais têm resultado.
            <div className="flex gap-1.5 overflow-hidden pb-3" aria-hidden="true">
              {[64, 108, 76, 92, 120].map((w) => (
                <div key={w} style={{ width: w }} className="h-11 shrink-0 animate-pulse rounded-control bg-surface-2 desktop:h-8" />
              ))}
            </div>
          )}
        </div>
        <div className="flex min-h-0 flex-1">
          <div ref={lista} id={idLista} role="listbox" aria-label="Resultados" className="min-h-0 min-w-0 flex-1 overflow-y-auto overscroll-contain p-2">
            {falhou && (
              <div className="m-2 flex items-center gap-3 rounded-control bg-[color-mix(in_srgb,var(--danger)_10%,transparent)] px-3 py-2 text-[13px] text-text-2" role="alert">
                Não foi possível pesquisar no servidor.
                {onTentar && (
                  <button type="button" onClick={onTentar} className="ml-auto font-medium text-accent hover:underline">
                    Tentar de novo
                  </button>
                )}
              </div>
            )}
            {grupos.map((g) => (
              // biome-ignore lint/a11y/useSemanticElements: grupo de opções de um listbox (fieldset não cabe aqui).
              <div key={g.tipo} role="group" aria-label={g.titulo}>
                {cabecalhoGrupo(g)}
                {g.carregando ? [0, 1].map((k) => <div key={k} className="mx-3 my-2 h-7 animate-pulse rounded-control bg-surface-2" />) : g.itens.map((r) => linha(r, g.tipo))}
              </div>
            ))}
            {vazio && <p className="px-3 py-6 text-center text-[13px] text-muted">{termo.length < 2 ? "Digite ao menos 2 letras." : "Nada encontrado."}</p>}
            {dicasVisiveis.length > 0 && (
              // biome-ignore lint/a11y/useSemanticElements: grupo de opções de um listbox (fieldset não cabe aqui).
              <div role="group" aria-label="Dicas de pesquisa">
                <p className="px-3 pt-3 pb-1.5 text-[12px] font-semibold text-muted">Dicas de pesquisa</p>
                {dicasVisiveis.map((d) => linha({ chave: `dica:${d.prefixo}`, rotulo: d.prefixo, detalhe: `${d.texto} · atalho ${d.curto}`, tipo: d.tipo }, "dica"))}
              </div>
            )}
          </div>
          {/* Painel FIXO da direita (desktop): em cima a prévia do item em foco, embaixo o conteúdo extra (favoritos). */}
          <aside className="hidden w-72 shrink-0 flex-col border-l border-border bg-surface-2/50 lg:flex">
            <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto overscroll-contain p-4" aria-live="polite">
              {previaCarregando ? (
                // Pesquisando: o esqueleto da prévia no lugar do item.
                <div className="space-y-3" aria-hidden="true">
                  <div className="h-10 w-10 animate-pulse rounded-control bg-surface-2" />
                  <div className="h-3 w-20 animate-pulse rounded-chip bg-surface-2" />
                  <div className="h-4 w-48 animate-pulse rounded-chip bg-surface-2" />
                  <div className="h-3 w-36 animate-pulse rounded-chip bg-surface-2" />
                </div>
              ) : emFoco && emFoco.grupo !== "dica" ? (
                <>
                  <div className="flex items-start justify-between gap-2">
                    <span className="grid h-10 w-10 place-items-center rounded-control bg-surface text-muted shadow-ring">
                      <EmFocoIcone className="h-5 w-5" aria-hidden="true" />
                    </span>
                    {emFocoFav && favorito && (
                      <button
                        type="button"
                        onClick={() => favorito.alternar(emFoco.r)}
                        aria-pressed={emFocoEh}
                        className={`inline-flex h-8 items-center gap-1.5 rounded-control border border-border bg-surface px-2.5 text-[12.5px] transition-colors hover:border-border-2 ${emFocoEh ? "text-[var(--warn)]" : "text-text-2"}`}
                      >
                        <IconEstrela className="h-3.5 w-3.5" fill={emFocoEh ? "currentColor" : "none"} aria-hidden="true" />
                        {emFocoEh ? "Favorito" : "Favoritar"}
                      </button>
                    )}
                  </div>
                  <p className="flex items-center gap-2 text-[11.5px] font-semibold tracking-wide text-faint uppercase">
                    {rotuloTipo(emFoco.r)}
                    <Selos r={emFoco.r} termo={termo} />
                  </p>
                  <p className="text-[15px] leading-snug font-semibold break-words text-text">
                    <Destaque texto={[...(emFoco.r.caminho ?? []), emFoco.r.rotulo].join(" › ")} termo={termo} />
                  </p>
                  {emFoco.r.info?.length ? (
                    // Os campos em grade (rótulo · valor), o termo em destaque — o que casou salta aos olhos.
                    <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-1.5 text-[13px] leading-snug">
                      {emFoco.r.info.map(([rotulo, valor]) =>
                        rotulo ? (
                          <div key={rotulo} className="contents">
                            <dt className="text-faint">{rotulo}</dt>
                            <dd className="break-words text-text-2">
                              <Destaque texto={valor} termo={termo} />
                            </dd>
                          </div>
                        ) : (
                          <dd key={valor} className="col-span-2 break-words text-muted">
                            <Destaque texto={valor} termo={termo} />
                          </dd>
                        ),
                      )}
                    </dl>
                  ) : (
                    emFoco.r.detalhe && (
                      <p className="text-[13px] leading-snug break-words text-muted">
                        <Destaque texto={emFoco.r.detalhe} termo={termo} />
                      </p>
                    )
                  )}
                  <p className="mt-auto flex items-center gap-1.5 text-[12px] text-faint">
                    <kbd className="rounded-chip border border-border bg-surface px-1.5 font-sans">↵</kbd>
                    {emFoco.r.acao ? "executar" : "abrir"}
                  </p>
                </>
              ) : (
                <p className="m-auto text-center text-[13px] text-faint">Escolha um resultado para ver os detalhes.</p>
              )}
            </div>
            {lateralExtra}
          </aside>
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
          <span className="flex items-center gap-1.5">
            <kbd className="rounded-chip border border-border bg-surface px-1.5 font-sans">Tab</kbd>
            completa o prefixo
          </span>
        </div>
      </div>
    </div>,
    document.body,
  );
}
