"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { type ComponentType, type SVGProps, useEffect, useMemo, useState } from "react";
import { predicadoBusca } from "@/lib/tabela-filtros";
import { Dropdown } from "./Dropdown";
import { SearchField } from "./Field";
import { IconAlternarNivel, IconCheck, IconChevronRight, IconClock, IconFilter, IconSearch } from "./icons";
import { Modal } from "./Modal";
import { useTrilhaTela } from "./trilha-store";

type Icone = ComponentType<SVGProps<SVGSVGElement>>;
export type ItemTrilha = { href: string; label: string; Icon: Icone };
export type SecaoTrilha = { chave: string; titulo: string; itens: ItemTrilha[] };
export type PcaTrilha = { id: number; nome: string; ano: number };

/** As abas de cada ESPAÇO (a mesma ordem das abas da tela) — o nível "aba ⌃⌄" da trilha. */
const ABAS_ESPACO: { re: RegExp; padrao: string; abas: { valor: string; rotulo: string }[] }[] = [
  {
    re: /^\/painel\/pca\/\d+$/,
    padrao: "dashboard",
    abas: [
      { valor: "dashboard", rotulo: "Dashboard" },
      { valor: "orcamento", rotulo: "Orçamento" },
      { valor: "mesa", rotulo: "Mesa" },
      { valor: "configuracao", rotulo: "Configuração" },
    ],
  },
  {
    re: /^\/painel\/orcamento\/\d+$/,
    padrao: "lancamentos",
    abas: [
      { valor: "lancamentos", rotulo: "Lançamentos" },
      { valor: "comparativo", rotulo: "Comparativo" },
      { valor: "vinculos", rotulo: "Vínculos" },
      { valor: "visoes", rotulo: "Visões" },
    ],
  },
  {
    re: /^\/painel\/tarefas\/\d+$/,
    padrao: "quadro",
    abas: [
      { valor: "quadro", rotulo: "Quadro" },
      { valor: "lista", rotulo: "Lista" },
      { valor: "calendario", rotulo: "Calendário" },
      { valor: "dashboard", rotulo: "Dashboard" },
      { valor: "configuracao", rotulo: "Configuração" },
    ],
  },
];

/** Telas cujo conteúdo o PCA do cabeçalho FILTRA (o selo "Filtrado"). */
const FILTRADAS = /^\/painel\/(mesa|pca|orcamento)\/?$/;

const RECENTES = "trilha:recentes";
const MAX_RECENTES = 5;

function lerRecentes(): string[] {
  try {
    const v = JSON.parse(localStorage.getItem(RECENTES) ?? "[]");
    return Array.isArray(v) ? v.filter((x) => typeof x === "string").slice(0, 20) : [];
  } catch {
    return [];
  }
}

function lembrar(chave: string) {
  try {
    localStorage.setItem(RECENTES, JSON.stringify([chave, ...lerRecentes().filter((x) => x !== chave)].slice(0, 20)));
  } catch {
    /* sem armazenamento: só não lembra */
  }
}

type Opcao = { chave: string; rotulo: string; detalhe?: string; icone?: Icone; marcado?: boolean; ir: () => void };

const classeOpcao = (marcado: boolean, foco: boolean) =>
  `flex min-h-11 w-full items-center gap-2 rounded-control px-2.5 py-2 text-left text-[13px] lg:min-h-0 ${
    marcado ? "bg-accent-soft font-semibold text-accent" : foco ? "bg-surface-2 text-text" : "text-text-2 hover:bg-surface-2"
  }`;

/**
 * A lista de um nível: os RECENTES no topo (os já visitados, deste navegador), busca acima de 8 opções (sem acento/caixa)
 * e o teclado ↑/↓/Enter. A mesma lista na paleta do Ctrl+K.
 */
function ListaNivel({ opcoes, fechar, sempreBusca = false }: { opcoes: Opcao[]; fechar: () => void; sempreBusca?: boolean }) {
  const [busca, setBusca] = useState("");
  const [foco, setFoco] = useState(0);
  const [recentes] = useState(lerRecentes);
  const comBusca = sempreBusca || opcoes.length > 8;
  const lista = useMemo(() => {
    const casa = predicadoBusca(busca);
    if (casa) return opcoes.filter((o) => casa([o.rotulo, o.detalhe]));
    const pos = new Map(recentes.map((r, i) => [r, i]));
    const rec = opcoes.filter((o) => pos.has(o.chave) && !o.marcado).sort((a, b) => (pos.get(a.chave) ?? 0) - (pos.get(b.chave) ?? 0)).slice(0, MAX_RECENTES);
    return rec.length && opcoes.length > 6 ? [...rec.map((o) => ({ ...o, recente: true })), ...opcoes.filter((o) => !rec.includes(o))] : opcoes;
  }, [busca, opcoes, recentes]);
  const escolher = (o: Opcao) => {
    lembrar(o.chave);
    fechar();
    o.ir();
  };
  const teclado = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setFoco((f) => Math.min(lista.length - 1, f + 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setFoco((f) => Math.max(0, f - 1));
    } else if (e.key === "Enter" && lista[foco]) {
      e.preventDefault();
      escolher(lista[foco]);
    }
  };
  return (
    <div className="p-1" role="none" onKeyDown={teclado}>
      {comBusca && (
        <div className="p-1 pb-2">
          <SearchField
            compacto
            autoFocus
            value={busca}
            onChange={(e) => {
              setBusca(e.target.value);
              setFoco(0);
            }}
            onClear={() => setBusca("")}
            aria-label="Pesquisar"
          />
        </div>
      )}
      <div className="max-h-[min(60vh,380px)] overflow-y-auto">
        {lista.length === 0 && <p className="px-2.5 py-3 text-[13px] text-muted">Nada encontrado</p>}
        {lista.map((o, i) => {
          const Ic = "recente" in o ? IconClock : o.icone;
          return (
            <button key={`${o.chave}${"recente" in o ? ":r" : ""}`} type="button" onClick={() => escolher(o)} onMouseEnter={() => setFoco(i)} className={classeOpcao(!!o.marcado, i === foco)}>
              {Ic && <Ic className="h-4 w-4 shrink-0 opacity-70" />}
              <span className="min-w-0 truncate">{o.rotulo}</span>
              {o.detalhe && <span className="shrink-0 font-mono text-[10.5px] text-faint">{o.detalhe}</span>}
              {o.marcado && <IconCheck className="ml-auto h-4 w-4 shrink-0" />}
            </button>
          );
        })}
      </div>
    </div>
  );
}

const NIVEL = "gap-1.5 rounded-control px-2 h-11 lg:h-[var(--h-control-sm)] text-[13px] hover:bg-surface-2";

function Sep({ className = "" }: { className?: string }) {
  return <IconChevronRight aria-hidden className={`h-3.5 w-3.5 shrink-0 text-faint ${className}`} />;
}

/** Um nível com ⌃⌄ que abre a lista. */
function Nivel({ rotulo, aria, icone: Ic, forte, opcoes, className = "", largura = 260 }: { rotulo: string; aria: string; icone?: Icone; forte?: boolean; opcoes: Opcao[]; className?: string; largura?: number }) {
  return (
    <Dropdown
      align="start"
      className={`min-w-0 ${className}`}
      ariaLabel={aria}
      title={rotulo}
      triggerClassName={`${NIVEL} min-w-0 ${forte ? "font-semibold text-text" : "text-text-2"}`}
      width={largura}
      trigger={
        <>
          {Ic && <Ic className="h-4 w-4 shrink-0 text-muted" />}
          <span className="min-w-0 truncate">{rotulo}</span>
          <IconAlternarNivel className="h-3.5 w-3.5 shrink-0 opacity-60" />
        </>
      }
    >
      {(fechar) => <ListaNivel opcoes={opcoes} fechar={fechar} />}
    </Dropdown>
  );
}

/**
 * TRILHA do cabeçalho (o padrão do Cloudflare): Seção ⌃⌄ › Tela ⌃⌄ › Espaço/PCA ⌃⌄ › Aba ⌃⌄ › os banners abertos.
 * No celular fica só a Tela ⌃⌄. Com muitos níveis, os do MEIO saem primeiro (o último fica sempre inteiro). Ctrl+K (ou
 * ⌘K) abre a PALETA: todas as telas e os PCAs, com busca e os recentes.
 */
export function TrilhaCabecalho({
  secoes,
  pcas,
  pcaFiltroId,
}: {
  secoes: SecaoTrilha[];
  pcas: PcaTrilha[];
  pcaFiltroId: number | null;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const sp = useSearchParams();
  const tela = useTrilhaTela();
  const [paleta, setPaleta] = useState(false);

  useEffect(() => {
    const k = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setPaleta((v) => !v);
      }
    };
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, []);

  let secao: SecaoTrilha | undefined;
  let item: ItemTrilha | undefined;
  for (const s of secoes)
    for (const i of s.itens)
      if ((pathname === i.href || pathname.startsWith(`${i.href}/`)) && (!item || i.href.length > item.href.length)) {
        secao = s;
        item = i;
      }

  const opcoesTela = (s: SecaoTrilha): Opcao[] =>
    s.itens.map((x) => ({ chave: `t:${x.href}`, rotulo: x.label, icone: x.Icon, marcado: x.href === item?.href, ir: () => router.push(x.href) }));
  const opcoesPca: Opcao[] = pcas.map((p) => ({
    chave: `p:${p.id}`,
    rotulo: p.nome,
    detalhe: String(p.ano),
    marcado: pathname.startsWith(`/painel/pca/${p.id}`),
    ir: () => router.push(`/painel/pca/${p.id}`),
  }));
  const todas: Opcao[] = [...secoes.flatMap(opcoesTela), ...opcoesPca.map((o) => ({ ...o, rotulo: `PCA · ${o.rotulo}` }))];

  const paletaModal = (
    <Modal open={paleta} onClose={() => setPaleta(false)} titulo="Ir para…" size="md">
      {paleta && <ListaNivel opcoes={todas} fechar={() => setPaleta(false)} sempreBusca />}
    </Modal>
  );
  if (!secao || !item) return paletaModal;

  const pcaId = /^\/painel\/pca\/(\d+)/.exec(pathname)?.[1];
  const pca = pcaId ? pcas.find((p) => p.id === Number(pcaId)) : undefined;
  const espaco = ABAS_ESPACO.find((e) => e.re.test(pathname));
  const abaAtual = espaco ? (espaco.abas.find((a) => a.valor === sp.get("aba")) ?? espaco.abas.find((a) => a.valor === espaco.padrao)) : undefined;
  const detalhe = !pca && espaco ? tela.detalhe : null;
  const filtro = FILTRADAS.test(pathname) ? pcas.find((p) => p.id === pcaFiltroId) : undefined;
  const fundo = tela.abertos.length > 0 || !!abaAtual;
  const secaoAtual = secao;

  return (
    <>
      <nav aria-label="Onde você está" className="hidden min-w-0 items-center gap-0.5 sm:flex">
        {/* Seção ⌃⌄ — some primeiro quando a trilha é longa. */}
        <Nivel
          className={`hidden ${fundo ? "2xl:flex" : "lg:flex"}`}
          rotulo={secao.titulo}
          aria={`Seção: ${secao.titulo} — trocar de seção`}
          largura={240}
          opcoes={secoes.map((s) => ({
            chave: `s:${s.chave}`,
            rotulo: s.titulo,
            marcado: s.chave === secaoAtual.chave,
            ir: () => router.push(s.itens[0].href),
          }))}
        />
        <Sep className={`hidden ${fundo ? "2xl:block" : "lg:block"}`} />
        <Nivel forte rotulo={item.label} icone={item.Icon} aria={`Tela: ${item.label} — trocar de tela`} opcoes={opcoesTela(secao)} className="shrink-0" />
        {pca && (
          <>
            <Sep className="hidden lg:block" />
            <Nivel className="hidden max-w-[16rem] lg:flex" rotulo={`${pca.ano} · ${pca.nome}`} aria={`PCA: ${pca.nome} — trocar de PCA`} opcoes={opcoesPca} />
          </>
        )}
        {detalhe && (
          <>
            <Sep className="hidden lg:block" />
            <span className="hidden max-w-[14rem] truncate px-2 text-[13px] text-text-2 lg:inline" title={detalhe}>
              {detalhe}
            </span>
          </>
        )}
        {espaco && abaAtual && (
          <>
            <Sep className="hidden lg:block" />
            <Nivel
              className="hidden lg:flex"
              rotulo={abaAtual.rotulo}
              aria={`Aba: ${abaAtual.rotulo} — trocar de aba`}
              largura={220}
              opcoes={espaco.abas.map((a) => ({
                chave: `a:${a.valor}`,
                rotulo: a.rotulo,
                marcado: a.valor === abaAtual.valor,
                ir: () => {
                  const p = new URLSearchParams(sp.toString());
                  p.set("aba", a.valor);
                  router.push(`${pathname}?${p.toString()}`, { scroll: false });
                },
              }))}
            />
          </>
        )}
        {tela.abertos.map((a, i) => (
          <span key={a.chave} className={`hidden min-w-0 items-center gap-0.5 ${i < tela.abertos.length - 1 ? "xl:flex" : "lg:flex"}`}>
            <Sep />
            <span className={`min-w-0 truncate px-2 text-[13px] ${i === tela.abertos.length - 1 ? "font-medium text-text" : "text-text-2"}`} title={a.rotulo}>
              {a.rotulo}
            </span>
          </span>
        ))}
        {filtro && (
          <span className="ml-1 hidden shrink-0 items-center gap-1 rounded-chip bg-accent-soft px-2 py-0.5 text-[11.5px] font-medium text-accent lg:inline-flex" title={`Esta tela mostra só o PCA ${filtro.nome} — troque no seletor de PCA`}>
            <IconFilter className="h-3 w-3" aria-hidden="true" />
            PCA {filtro.ano}
          </span>
        )}
        <button
          type="button"
          onClick={() => setPaleta(true)}
          title="Ir para… (Ctrl+K)"
          aria-label="Ir para outra tela (Ctrl+K)"
          className="ml-1 hidden h-[var(--h-control-sm)] shrink-0 items-center gap-1 rounded-control px-2 text-[12px] text-faint hover:bg-surface-2 hover:text-text-2 lg:inline-flex"
        >
          <IconSearch className="h-3.5 w-3.5" aria-hidden="true" />
          <kbd className="font-sans">Ctrl K</kbd>
        </button>
      </nav>
      {paletaModal}
    </>
  );
}
