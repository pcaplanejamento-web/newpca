"use client";

import { useTheme } from "next-themes";
import { useRouter } from "next/navigation";
import { type ComponentType, type ReactNode, type SVGProps, useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { predicadoBusca } from "@/lib/tabela-filtros";
import { hrefVinculo, linkTarefa, ROTULO_VINCULO, type TipoVinculo } from "@/lib/tarefas-core";
import {
  IconArrowRight,
  IconBox,
  IconClipboard,
  IconClock,
  IconClose,
  IconKanban,
  IconLayers,
  IconSearch,
  IconSettings,
  IconWallet,
} from "./icons";
import { gravarTemaPessoal, lerTemaPessoal } from "./TemaPessoal";

type Icone = ComponentType<SVGProps<SVGSVGElement>>;
export type TelaPesquisa = { href: string; label: string; secao: string; Icon: Icone };
export type PcaPesquisa = { id: number; nome: string; ano: number };

/** Um resultado: o rótulo, o contexto (à direita do travessão), para onde leva — ou a AÇÃO que executa. */
type Resultado = { chave: string; rotulo: string; caminho?: string[]; detalhe?: string; href?: string; tipo: string; acao?: () => void };
type Grupo = { tipo: string; titulo: string; itens: Resultado[]; total?: number; carregando?: boolean; erro?: boolean };

const RECENTES = "pesquisa:recentes";
const MAX_RECENTES = 6;
/** Fora do banner: abrir o banner e alternar o menu lateral (a AÇÃO "Recolher o menu"). */
export const EVENTO_ABRIR_PESQUISA = "pesquisa-sistema:abrir";
export const EVENTO_ALTERNAR_MENU = "menu-lateral:alternar";

const ICONE_TIPO: Record<string, Icone> = {
  tela: IconLayers,
  aba: IconLayers,
  acao: IconSettings,
  protocolo: IconClipboard,
  dfd: IconClipboard,
  item: IconClipboard,
  pca: IconBox,
  orcamento: IconWallet,
  tarefa: IconKanban,
};

/** As DICAS — o prefixo (ou o atalho) restringe a pesquisa a um tipo; Tab completa. */
const DICAS: { prefixo: string; curto: string; tipo: TipoVinculo | "tela" | "aba"; texto: string }[] = [
  { prefixo: "protocolo:", curto: "p:", tipo: "protocolo", texto: "Protocolos (nº, Id, assunto)" },
  { prefixo: "dfd:", curto: "d:", tipo: "dfd", texto: "DFDs (nº, planejamento, objeto)" },
  { prefixo: "item:", curto: "i:", tipo: "item", texto: "Itens dos DFDs (descrição, código)" },
  { prefixo: "tarefa:", curto: "t:", tipo: "tarefa", texto: "Tarefas (título, nº do ticket)" },
  { prefixo: "pca:", curto: "pc:", tipo: "pca", texto: "PCAs" },
  { prefixo: "orcamento:", curto: "o:", tipo: "orcamento", texto: "Orçamentos" },
  { prefixo: "tela:", curto: "te:", tipo: "tela", texto: "Telas do sistema" },
  { prefixo: "aba:", curto: "a:", tipo: "aba", texto: "Abas de cada tela" },
];

/**
 * As ABAS de cada tela (pesquisáveis: "aba: segurança", "orçamento comparativo"…). `href` da tela → as abas (o
 * parâmetro e o valor da URL). As do espaço de cada PCA saem dos PCAs (`abasDosPcas`).
 */
const ABAS_TELAS: Record<string, { param: string; abas: [string, string][] }> = {
  "/painel/mesa": { param: "vista", abas: [["dashboard", "Dashboard"], ["protocolos", "Protocolos"], ["dfds", "DFDs"], ["itens", "Itens"]] },
  "/painel/configuracoes": {
    param: "aba",
    abas: [
      ["identidade", "Identidade"], ["modulos", "Módulos"], ["papeis", "Papéis"], ["protecao", "Proteção de dados"], ["seguranca", "Segurança"],
      ["cargos", "Cargos e funções"], ["acesso", "Tela de acesso"], ["tabelas", "Tabelas"], ["pcas", "PCAs"], ["situacoes", "Situações"],
      ["feriados", "Feriados"], ["presenca", "Presença e chat"], ["notificacoes", "Notificações"], ["avaliacao", "Avaliação"],
      ["referencia", "Referência"], ["mais", "Mais"],
    ],
  },
  "/painel/orgaos": { param: "aba", abas: [["orgaos", "Órgãos"], ["responsaveis", "Responsáveis"]] },
};
const ABAS_PERFIL: [string, string][] = [
  ["conta", "Conta"], ["seguranca", "Segurança"], ["acessos", "Histórico de acesso"], ["aparencia", "Aparência"],
  ["notificacoes", "Notificações"], ["trabalho", "Trabalho"], ["acesso", "Meu acesso"],
];
const ABAS_PCA: [string, string][] = [["dashboard", "Dashboard"], ["orcamento", "Orçamento"], ["mesa", "Mesa"], ["configuracao", "Configuração"]];

function lerRecentes(): Resultado[] {
  try {
    const v = JSON.parse(localStorage.getItem(RECENTES) ?? "[]");
    return Array.isArray(v) ? v.filter((r) => r && typeof r.href === "string" && typeof r.rotulo === "string").slice(0, MAX_RECENTES) : [];
  } catch {
    return [];
  }
}

function gravarRecentes(lista: Resultado[]) {
  try {
    localStorage.setItem(RECENTES, JSON.stringify(lista.slice(0, MAX_RECENTES).map(({ acao: _, ...r }) => r)));
  } catch {
    /* sem armazenamento: só não lembra */
  }
}

/** Lê "dfd: 1234" ou "d: 1234" → o tipo e o termo. */
function lerConsulta(texto: string): { tipo: (typeof DICAS)[number]["tipo"] | null; termo: string } {
  const t = texto.trimStart();
  const baixo = t.toLowerCase();
  const d = DICAS.find((x) => baixo.startsWith(x.prefixo)) ?? DICAS.find((x) => baixo.startsWith(x.curto));
  if (!d) return { tipo: null, termo: t.trim() };
  const tam = baixo.startsWith(d.prefixo) ? d.prefixo.length : d.curto.length;
  return { tipo: d.tipo, termo: t.slice(tam).trim() };
}

/** O número digitado bate com um número INTEIRO do rótulo ("144756" acha o protocolo 144756/2026 antes do 1447560). */
function numeroExato(rotulo: string, termo: string): boolean {
  const n = termo.replace(/^#/, "");
  return /^\d+$/.test(n) && new RegExp(`(^|\\D)${n}(\\D|$)`).test(rotulo);
}

/** O trecho que casou, em destaque (sem acento/caixa). */
function Destaque({ texto, termo }: { texto: string; termo: string }): ReactNode {
  const t = termo.trim();
  if (!t) return texto;
  const tira = (s: string) => s.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();
  const i = tira(texto).indexOf(tira(t));
  if (i < 0) return texto;
  return (
    <>
      {texto.slice(0, i)}
      <mark className="bg-transparent font-semibold text-accent">{texto.slice(i, i + t.length)}</mark>
      {texto.slice(i + t.length)}
    </>
  );
}

/** O campo "Pesquisa rápida… Ctrl K" do menu lateral (fixo abaixo da logo) — abre o banner. Recolhido, só a lupa. */
export function GatilhoPesquisa() {
  const [mac, setMac] = useState(false);
  useEffect(() => setMac(/Mac|iPhone|iPad/.test(navigator.platform)), []);
  return (
    <button
      type="button"
      onClick={() => window.dispatchEvent(new Event(EVENTO_ABRIR_PESQUISA))}
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
 * PESQUISA DO SISTEMA (o padrão do Cloudflare): Ctrl+K/⌘K ou o campo do menu abrem o BANNER.
 * - Sem texto: Recentes (com × e "Limpar"), Ações rápidas e as Dicas de prefixo.
 * - Com texto: grupos — Ações · Telas · Abas (de cada tela e de cada PCA) · PCAs (o do cabeçalho primeiro) e, do servidor
 *   num pedido só (`GET /api/pesquisa`, no escopo e no papel da pessoa), Protocolos · DFDs · Tarefas · Orçamentos — cada um
 *   com "Ver todos (N)", o número EXATO primeiro e o trecho que casou em destaque. Prefixo ("dfd:" ou "d:", Tab completa)
 *   restringe a um tipo.
 * - ↑/↓, Enter, Esc; prévia do item em foco à direita (desktop); tela cheia no celular; combobox acessível.
 */
export function PesquisaSistema({ telas, pcas, pcaFiltroId = null }: { telas: TelaPesquisa[]; pcas: PcaPesquisa[]; pcaFiltroId?: number | null }) {
  const router = useRouter();
  const { resolvedTheme, setTheme } = useTheme();
  const idLista = useId();
  const [aberto, setAberto] = useState(false);
  const [texto, setTexto] = useState("");
  const [foco, setFoco] = useState(0);
  const [recentes, setRecentes] = useState<Resultado[]>([]);
  const [remotos, setRemotos] = useState<Grupo[]>([]);
  const [carregando, setCarregando] = useState(false);
  const [falhou, setFalhou] = useState(false);
  const [tentativa, setTentativa] = useState(0);
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
    window.addEventListener(EVENTO_ABRIR_PESQUISA, abrir);
    window.addEventListener("keydown", k);
    return () => {
      window.removeEventListener(EVENTO_ABRIR_PESQUISA, abrir);
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
  const tiposServidor: TipoVinculo[] =
    tipo === "tela" || tipo === "aba" || tipo === "pca" ? [] : tipo ? [tipo] : ["protocolo", "dfd", "tarefa", "orcamento"];

  // Servidor: um pedido 250 ms depois da última tecla; a resposta antiga não sobrescreve a nova.
  // biome-ignore lint/correctness/useExhaustiveDependencies: `tiposServidor` sai de `tipo`; `tentativa` refaz após falha.
  useEffect(() => {
    if (!aberto || termo.length < 2 || !tiposServidor.length) {
      setRemotos([]);
      setCarregando(false);
      setFalhou(false);
      return;
    }
    let vivo = true;
    setCarregando(true);
    setFalhou(false);
    const t = setTimeout(async () => {
      try {
        const r = await fetch(`/api/pesquisa?q=${encodeURIComponent(termo)}&tipos=${tiposServidor.join(",")}&limite=${tipo ? 30 : 5}`);
        const j = (await r.json()) as { ok?: boolean; grupos?: { tipo: TipoVinculo; total: number; opcoes: { id: number; rotulo: string; detalhe: string }[] }[] };
        if (!r.ok || !j.ok) throw new Error();
        if (!vivo) return;
        setRemotos(
          (j.grupos ?? []).map((g) => ({
            tipo: g.tipo,
            titulo: `${ROTULO_VINCULO[g.tipo]}s`,
            total: g.total,
            itens: g.opcoes
              .map<Resultado>((o) => ({
                chave: `${g.tipo}:${o.id}`,
                rotulo: o.rotulo,
                detalhe: o.detalhe || undefined,
                href: g.tipo === "tarefa" ? linkTarefa(o.id) : hrefVinculo({ tipo: g.tipo, id: o.id }),
                tipo: g.tipo,
              }))
              .sort((a, b) => Number(numeroExato(b.rotulo, termo)) - Number(numeroExato(a.rotulo, termo))),
          })),
        );
      } catch {
        if (vivo) setFalhou(true);
      } finally {
        if (vivo) setCarregando(false);
      }
    }, 250);
    return () => {
      vivo = false;
      clearTimeout(t);
    };
  }, [aberto, tipo, termo, tentativa]);

  const fechar = useCallback(() => setAberto(false), []);

  const acoes = useMemo<Resultado[]>(
    () => [
      {
        chave: "acao:tema",
        rotulo: resolvedTheme === "dark" ? "Usar o tema claro" : "Usar o tema escuro",
        detalhe: "Aparência",
        tipo: "acao",
        acao: () => {
          const escuro = resolvedTheme === "dark";
          gravarTemaPessoal({ ...lerTemaPessoal(), modo: escuro ? "claro" : "escuro" });
          setTheme(escuro ? "light" : "dark");
        },
      },
      { chave: "acao:menu", rotulo: "Recolher ou expandir o menu", detalhe: "Menu lateral", tipo: "acao", acao: () => window.dispatchEvent(new Event(EVENTO_ALTERNAR_MENU)) },
      { chave: "acao:perfil", rotulo: "Meu perfil", detalhe: "Conta", tipo: "acao", href: "/painel/perfil" },
      {
        chave: "acao:sair",
        rotulo: "Sair do sistema",
        detalhe: "Conta",
        tipo: "acao",
        acao: async () => {
          try {
            await fetch("/api/auth/logout", { method: "POST" });
          } catch {
            /* segue para o login */
          }
          router.push("/login");
          router.refresh();
        },
      },
    ],
    [resolvedTheme, setTheme, router],
  );

  /** As abas de TODAS as telas que a pessoa abre + as de cada PCA. */
  const abas = useMemo<Resultado[]>(() => {
    const porTela = telas.flatMap((t) => {
      const def = ABAS_TELAS[t.href];
      return def ? def.abas.map<Resultado>(([v, r]) => ({ chave: `aba:${t.href}:${v}`, rotulo: r, caminho: [t.secao, t.label].filter(Boolean), href: `${t.href}?${def.param}=${v}`, tipo: "aba" })) : [];
    });
    const perfil = ABAS_PERFIL.map<Resultado>(([v, r]) => ({ chave: `aba:perfil:${v}`, rotulo: r, caminho: ["Conta", "Perfil"], href: `/painel/perfil?aba=${v}`, tipo: "aba" }));
    const dosPcas = telas.some((t) => t.href === "/painel/pca")
      ? pcas.flatMap((p) => ABAS_PCA.map<Resultado>(([v, r]) => ({ chave: `aba:pca:${p.id}:${v}`, rotulo: r, caminho: ["PCA", `${p.ano} · ${p.nome}`], href: `/painel/pca/${p.id}?aba=${v}`, tipo: "aba" })))
      : [];
    return [...porTela, ...perfil, ...dosPcas];
  }, [telas, pcas]);

  const grupos = useMemo<Grupo[]>(() => {
    const casa = predicadoBusca(termo);
    if (!texto.trim()) {
      const g: Grupo[] = [];
      if (recentes.length) g.push({ tipo: "recentes", titulo: "Recentes", itens: recentes });
      g.push({ tipo: "acao", titulo: "Ações rápidas", itens: acoes });
      return g;
    }
    if (!casa) return [];
    const quer = (t: string) => !tipo || tipo === t;
    const locais: Grupo[] = [
      { tipo: "acao", titulo: "Ações", itens: quer("acao") && !tipo ? acoes.filter((a) => casa([a.rotulo, a.detalhe])) : [] },
      {
        tipo: "tela",
        titulo: "Telas",
        itens: quer("tela") ? telas.filter((t) => casa([t.label, t.secao])).map((t) => ({ chave: `tela:${t.href}`, rotulo: t.label, caminho: t.secao ? [t.secao] : undefined, href: t.href, tipo: "tela" })) : [],
      },
      { tipo: "aba", titulo: "Abas", itens: quer("aba") ? abas.filter((a) => casa([a.rotulo, ...(a.caminho ?? []), `${(a.caminho ?? []).join(" ")} ${a.rotulo}`])).slice(0, tipo ? 60 : 8) : [] },
      {
        tipo: "pca",
        titulo: "PCAs",
        itens: quer("pca")
          ? pcas
              .filter((p) => casa([p.nome, String(p.ano)]))
              .sort((a, b) => Number(b.id === pcaFiltroId) - Number(a.id === pcaFiltroId))
              .map((p) => ({ chave: `pca:${p.id}`, rotulo: p.nome, caminho: ["PCA", String(p.ano)], detalhe: p.id === pcaFiltroId ? "selecionado no topo" : undefined, href: `/painel/pca/${p.id}`, tipo: "pca" }))
          : [],
      },
    ];
    // Enquanto o servidor responde, cada grupo dele mostra o esqueleto.
    const doServidor: Grupo[] = carregando
      ? tiposServidor.map((t) => ({ tipo: t, titulo: `${ROTULO_VINCULO[t]}s`, itens: [], carregando: true }))
      : remotos;
    return [...locais, ...doServidor].filter((g) => g.itens.length || g.carregando);
  }, [texto, termo, tipo, recentes, acoes, telas, abas, pcas, pcaFiltroId, remotos, carregando, tiposServidor]);

  const semTexto = !texto.trim();
  const baixo = texto.trim().toLowerCase();
  const dicas = semTexto ? DICAS : texto.includes(":") ? [] : DICAS.filter((d) => d.prefixo.startsWith(baixo) || d.curto.startsWith(baixo));
  const itens: { r: Resultado; grupo: string }[] = [
    ...grupos.flatMap((g) => g.itens.map((r) => ({ r, grupo: g.tipo }))),
    ...dicas.map((d) => ({ r: { chave: `dica:${d.prefixo}`, rotulo: d.prefixo, detalhe: `${d.texto} · atalho ${d.curto}`, tipo: d.tipo }, grupo: "dica" })),
  ];
  const focoValido = Math.min(foco, Math.max(0, itens.length - 1));
  const emFoco = itens[focoValido];

  useEffect(() => {
    lista.current?.querySelector(`[data-indice="${focoValido}"]`)?.scrollIntoView({ block: "nearest" });
  }, [focoValido]);

  function escolher(i: number) {
    const it = itens[i];
    if (!it) return;
    const r = it.r;
    if (it.grupo === "dica") {
      setTexto(`${r.rotulo} `);
      setFoco(0);
      campo.current?.focus();
      return;
    }
    if (r.tipo !== "acao" || r.href) {
      const novos = [r, ...lerRecentes().filter((x) => x.chave !== r.chave)];
      gravarRecentes(novos);
    }
    setAberto(false);
    if (r.acao) r.acao();
    else if (r.href) router.push(r.href);
  }

  function esquecer(chave: string) {
    const novos = recentes.filter((r) => r.chave !== chave);
    setRecentes(novos);
    gravarRecentes(novos);
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
    } else if (e.key === "Tab" && dicas.length && !texto.includes(":")) {
      // Tab completa o prefixo sugerido.
      e.preventDefault();
      setTexto(`${dicas[0].prefixo} `);
      setFoco(0);
    }
  }

  if (!aberto || typeof document === "undefined") return null;

  let indice = -1;
  const linha = (r: Resultado, grupo: string) => {
    indice += 1;
    const i = indice;
    const Ic = grupo === "recentes" ? IconClock : grupo === "dica" ? (ICONE_TIPO[r.tipo] ?? IconSearch) : (ICONE_TIPO[r.tipo] ?? IconLayers);
    const ativo = i === focoValido;
    return (
      // biome-ignore lint/a11y/useFocusableInteractive: combobox — o foco fica no campo e a opção ativa vem por aria-activedescendant.
      <div key={`${grupo}:${r.chave}`} id={`${idLista}-${i}`} role="option" aria-selected={ativo} className="group/linha relative">
        <button
          type="button"
          tabIndex={-1}
          data-indice={i}
          onMouseMove={() => setFoco(i)}
          onClick={() => escolher(i)}
          className={`flex min-h-11 w-full items-center gap-3 rounded-control px-3 py-2 text-left ${ativo ? "bg-surface-2" : ""} ${grupo === "recentes" ? "pr-10" : ""}`}
        >
          <Ic className="h-4 w-4 shrink-0 text-muted" aria-hidden="true" />
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
          {r.detalhe && (
            <span className="min-w-0 truncate text-[13px] text-muted">
              <span aria-hidden="true" className="mr-2 text-faint">
                —
              </span>
              {r.detalhe}
            </span>
          )}
          {ativo && grupo !== "recentes" && <IconArrowRight className="ml-auto h-4 w-4 shrink-0 text-muted" aria-hidden="true" />}
        </button>
        {grupo === "recentes" && (
          <button
            type="button"
            tabIndex={-1}
            onClick={() => esquecer(r.chave)}
            aria-label={`Tirar ${r.rotulo} dos recentes`}
            title="Tirar dos recentes"
            className="absolute top-1/2 right-1.5 grid h-8 w-8 -translate-y-1/2 place-items-center rounded-control text-faint hover:bg-surface hover:text-text"
          >
            <IconClose className="h-3.5 w-3.5" />
          </button>
        )}
      </div>
    );
  };

  const cabecalhoGrupo = (g: Grupo) => (
    <div className="flex items-center gap-2 px-3 pt-3 pb-1.5">
      <p className="text-[12px] font-semibold text-muted">{g.titulo}</p>
      {g.tipo === "recentes" && (
        <button
          type="button"
          tabIndex={-1}
          onClick={() => {
            setRecentes([]);
            gravarRecentes([]);
          }}
          className="ml-auto text-[12px] text-faint hover:text-text-2"
        >
          Limpar
        </button>
      )}
      {!tipo && g.total != null && g.total > g.itens.length && (
        <button
          type="button"
          tabIndex={-1}
          onClick={() => {
            const d = DICAS.find((x) => x.tipo === g.tipo);
            if (d) setTexto(`${d.prefixo} ${termo}`);
            setFoco(0);
            campo.current?.focus();
          }}
          className="ml-auto text-[12px] font-medium text-accent hover:underline"
        >
          Ver todos ({g.total >= 50 ? "50+" : g.total})
        </button>
      )}
    </div>
  );

  const vazio = !semTexto && !carregando && !falhou && grupos.length === 0 && dicas.length === 0;
  const EmFocoIcone = emFoco ? (ICONE_TIPO[emFoco.r.tipo] ?? IconLayers) : IconSearch;

  return createPortal(
    <div className="fixed inset-0 z-[80] flex items-stretch justify-center sm:items-start sm:px-[var(--pad-canvas)] sm:pt-[8vh] print:hidden">
      <div aria-hidden="true" className="absolute inset-0 bg-[var(--scrim)]" onClick={fechar} />
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Pesquisa no sistema"
        onKeyDown={teclado}
        className="relative flex h-dvh w-full animate-fade-in-up flex-col overflow-hidden bg-surface shadow-flutuante sm:h-auto sm:max-h-[80vh] sm:max-w-3xl sm:rounded-card sm:border sm:border-border"
      >
        <div className="flex items-center gap-3 border-b border-border px-4 pt-[env(safe-area-inset-top)]">
          <IconSearch className="h-5 w-5 shrink-0 text-muted" aria-hidden="true" />
          <input
            ref={campo}
            value={texto}
            onChange={(e) => {
              setTexto(e.target.value);
              setFoco(0);
            }}
            role="combobox"
            aria-expanded="true"
            aria-controls={idLista}
            aria-activedescendant={itens.length ? `${idLista}-${focoValido}` : undefined}
            aria-autocomplete="list"
            placeholder="Pesquise telas, abas, protocolos, DFDs, tarefas e PCAs…"
            aria-label="Pesquisar no sistema"
            className="h-14 min-w-0 flex-1 bg-transparent text-[16px] text-text outline-none placeholder:text-faint sm:text-[15px]"
          />
          <button type="button" onClick={fechar} className="shrink-0 rounded-chip border border-border px-1.5 py-0.5 text-[12px] text-muted hover:bg-surface-2">
            Esc
          </button>
        </div>
        <div className="flex min-h-0 flex-1">
          <div ref={lista} id={idLista} role="listbox" aria-label="Resultados" className="min-h-0 min-w-0 flex-1 overflow-y-auto p-2">
            {falhou && (
              <div className="m-2 flex items-center gap-3 rounded-control bg-[color-mix(in_srgb,var(--danger)_10%,transparent)] px-3 py-2 text-[13px] text-text-2" role="alert">
                Não foi possível pesquisar no servidor.
                <button type="button" onClick={() => setTentativa((n) => n + 1)} className="ml-auto font-medium text-accent hover:underline">
                  Tentar de novo
                </button>
              </div>
            )}
            {grupos.map((g) => (
              // biome-ignore lint/a11y/useSemanticElements: grupo de opções de um listbox (fieldset não cabe aqui).
              <div key={g.tipo} role="group" aria-label={g.titulo}>
                {cabecalhoGrupo(g)}
                {g.carregando
                  ? [0, 1].map((k) => <div key={k} className="mx-3 my-2 h-7 animate-pulse rounded-control bg-surface-2" />)
                  : g.itens.map((r) => linha(r, g.tipo))}
              </div>
            ))}
            {vazio && <p className="px-3 py-6 text-center text-[13px] text-muted">{termo.length < 2 ? "Digite ao menos 2 letras." : "Nada encontrado."}</p>}
            {dicas.length > 0 && (
              // biome-ignore lint/a11y/useSemanticElements: grupo de opções de um listbox (fieldset não cabe aqui).
              <div role="group" aria-label="Dicas de pesquisa">
                <p className="px-3 pt-3 pb-1.5 text-[12px] font-semibold text-muted">Dicas de pesquisa</p>
                {dicas.map((d) => linha({ chave: `dica:${d.prefixo}`, rotulo: d.prefixo, detalhe: `${d.texto} · atalho ${d.curto}`, tipo: d.tipo }, "dica"))}
              </div>
            )}
          </div>
          {/* Prévia do item em foco (desktop). */}
          {emFoco && emFoco.grupo !== "dica" && (
            <aside className="hidden w-64 shrink-0 flex-col gap-3 border-l border-border bg-surface-2/50 p-4 lg:flex" aria-hidden="true">
              <span className="grid h-10 w-10 place-items-center rounded-control bg-surface text-muted shadow-ring">
                <EmFocoIcone className="h-5 w-5" />
              </span>
              <p className="text-[11.5px] font-semibold tracking-wide text-faint uppercase">
                {emFoco.r.tipo === "acao" ? "Ação" : emFoco.r.tipo === "aba" ? "Aba" : emFoco.r.tipo === "tela" ? "Tela" : (ROTULO_VINCULO[emFoco.r.tipo as TipoVinculo] ?? "Item")}
              </p>
              <p className="text-[15px] leading-snug font-semibold break-words text-text">{[...(emFoco.r.caminho ?? []), emFoco.r.rotulo].join(" › ")}</p>
              {emFoco.r.detalhe && <p className="text-[13px] leading-snug break-words text-muted">{emFoco.r.detalhe}</p>}
              <p className="mt-auto flex items-center gap-1.5 text-[12px] text-faint">
                <kbd className="rounded-chip border border-border bg-surface px-1.5 font-sans">↵</kbd>
                {emFoco.r.acao ? "executar" : "abrir"}
              </p>
            </aside>
          )}
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

