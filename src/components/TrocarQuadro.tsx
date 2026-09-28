"use client";

import { useRouter } from "next/navigation";
import { type ReactNode, useEffect, useMemo, useState } from "react";
import { predicadoBusca } from "@/lib/tabela-filtros";
import { favoritosPrimeiro } from "@/lib/tarefas-core";
import { ChipsEscolha } from "./ChipsEscolha";
import { buscarDestinos, type DestinoCopia } from "./CopiarMoverTarefa";
import { SearchField } from "./Field";
import { IconCheck, IconChevronRight, IconClock, IconEstrela, IconLock } from "./icons";
import { Modal } from "./Modal";
import { CapaQuadro } from "./QuadroCard";
import { Skeleton } from "./Skeleton";
import { toast } from "./Toast";

/** Os quadros abertos por ÚLTIMO neste aparelho (conveniência — `localStorage`, com try/catch). */
const CHAVE_RECENTES = "tarefas:quadros-recentes";
const MAX_RECENTES = 8;

/** Registra o quadro aberto (o 1º dos recentes). Chamado pelo espaço do quadro. */
export function registrarQuadroRecente(id: number) {
  try {
    const v = JSON.parse(localStorage.getItem(CHAVE_RECENTES) ?? "[]");
    const lista = Array.isArray(v) ? v.filter((x): x is number => typeof x === "number" && x !== id) : [];
    localStorage.setItem(CHAVE_RECENTES, JSON.stringify([id, ...lista].slice(0, MAX_RECENTES)));
  } catch {
    // sem armazenamento: sem recentes
  }
}

function lerRecentes(): number[] {
  try {
    const v = JSON.parse(localStorage.getItem(CHAVE_RECENTES) ?? "[]");
    return Array.isArray(v) ? v.filter((x): x is number => typeof x === "number") : [];
  } catch {
    return [];
  }
}

/**
 * MUDAR DE QUADROS (como o do Trello): o gatilho (o "Mudar de quadros" da pílula de vistas) abre o painel com a BUSCA
 * dos quadros, os CHIPS por grupo (Tudo · grupo…), as seções **Favoritos** e **Recentes** (os abertos por último NESTE
 * aparelho) e cada GRUPO recolhível — tudo em MINIATURAS com a capa 16:9 do quadro (`CapaQuadro`: imagem, degradê ou a
 * superfície). Escolher leva ao quadro na MESMA aba; o atual fica marcado. Os quadros vêm só ao abrir.
 */
export function TrocarQuadro({
  quadro,
  aba,
  favoritos,
  gatilho,
  triggerClassName = "",
}: {
  quadro: { id: number; nome: string };
  aba: string;
  favoritos: number[];
  gatilho: ReactNode;
  triggerClassName?: string;
}) {
  const [aberto, setAberto] = useState(false);
  return (
    <>
      <button type="button" aria-haspopup="dialog" aria-label={`Mudar de quadros — atual: ${quadro.nome}`} onClick={() => setAberto(true)} className={`inline-flex items-center ${triggerClassName}`}>
        {gatilho}
      </button>
      <Modal open={aberto} onClose={() => setAberto(false)} titulo="Mudar de quadros" size="lg">
        {aberto && <PainelQuadros atual={quadro.id} aba={aba} favoritos={favoritos} onEscolhido={() => setAberto(false)} />}
      </Modal>
    </>
  );
}

/** A MINIATURA de um quadro: a capa 16:9 + o nome (cadeado no privado; o atual marcado). */
function MiniaturaQuadro({ q, atual, onAbrir }: { q: DestinoCopia; atual: boolean; onAbrir: () => void }) {
  return (
    <button
      type="button"
      onClick={onAbrir}
      aria-current={atual ? "page" : undefined}
      aria-label={`Abrir o quadro ${q.nome}${q.privado ? " (privado)" : ""}${atual ? " — o atual" : ""}`}
      className={`group flex flex-col overflow-hidden rounded-lg bg-surface text-left shadow-[var(--sombra-cartao)] transition-shadow hover:ring-2 hover:ring-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent ${
        atual ? "ring-2 ring-accent" : ""
      }`}
    >
      <CapaQuadro quadro={q} semRaio>
        {q.privado && (
          <span className="absolute top-1.5 left-1.5 grid h-6 w-6 place-items-center rounded-full bg-[var(--scrim)] text-white" title="Privado">
            <IconLock className="h-3 w-3" />
          </span>
        )}
        {atual && (
          <span className="absolute top-1.5 right-1.5 grid h-6 w-6 place-items-center rounded-full bg-accent text-white" title="O quadro atual">
            <IconCheck className="h-3.5 w-3.5" />
          </span>
        )}
      </CapaQuadro>
      <span className="line-clamp-2 min-h-[3.25em] px-2.5 py-2 text-[13.5px] leading-snug text-text" title={q.nome}>
        {q.nome}
      </span>
    </button>
  );
}

function Grade({ quadros, atual, onAbrir }: { quadros: DestinoCopia[]; atual: number; onAbrir: (id: number) => void }) {
  return (
    <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-4">
      {quadros.map((q) => (
        <MiniaturaQuadro key={q.id} q={q} atual={q.id === atual} onAbrir={() => onAbrir(q.id)} />
      ))}
    </div>
  );
}

function Titulo({ icone, children }: { icone: ReactNode; children: ReactNode }) {
  return (
    <h3 className="mb-2 flex items-center gap-2 text-[14px] font-semibold text-text-2">
      {icone}
      {children}
    </h3>
  );
}

function PainelQuadros({ atual, aba, favoritos, onEscolhido }: { atual: number; aba: string; favoritos: number[]; onEscolhido: () => void }) {
  const router = useRouter();
  const [quadros, setQuadros] = useState<DestinoCopia[] | null>(null);
  const [busca, setBusca] = useState("");
  const [grupo, setGrupo] = useState("__tudo");
  const [abertos, setAbertos] = useState<Set<string>>(new Set());
  const [recentes] = useState(lerRecentes);
  useEffect(() => {
    let vivo = true;
    buscarDestinos()
      .then((q) => vivo && setQuadros(q))
      .catch((e) => vivo && toast.error((e as Error).message));
    return () => {
      vivo = false;
    };
  }, []);
  const grupos = useMemo(() => [...new Set((quadros ?? []).map((q) => q.grupoNome))].sort((a, b) => a.localeCompare(b, "pt-BR")), [quadros]);
  const abrir = (id: number) => {
    onEscolhido();
    if (id !== atual) router.push(`/painel/tarefas/${id}?aba=${aba}`);
  };

  if (!quadros)
    return (
      <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-4" aria-busy="true">
        {Array.from({ length: 8 }, (_, i) => (
          <Skeleton key={i} className="aspect-[4/3] w-full" />
        ))}
      </div>
    );

  const casa = predicadoBusca(busca);
  const doGrupo = grupo === "__tudo" ? quadros : quadros.filter((q) => q.grupoNome === grupo);
  const porId = new Map(quadros.map((q) => [q.id, q]));
  const favs = favoritosPrimeiro(doGrupo, favoritos).filter((q) => favoritos.includes(q.id));
  const recs = recentes.map((id) => porId.get(id)).filter((q): q is DestinoCopia => !!q && doGrupo.includes(q));
  const alternar = (g: string) =>
    setAbertos((a) => {
      const n = new Set(a);
      if (n.has(g)) n.delete(g);
      else n.add(g);
      return n;
    });

  return (
    <div className="space-y-4">
      <SearchField
        compacto
        autoFocus
        placeholder="Pesquisar seus quadros"
        value={busca}
        onChange={(e) => setBusca(e.target.value)}
        onClear={() => setBusca("")}
        aria-label="Pesquisar seus quadros"
      />
      {grupos.length > 1 && (
        <ChipsEscolha ariaLabel="Grupo" valor={grupo} onEscolher={setGrupo} opcoes={[{ value: "__tudo", label: "Tudo" }, ...grupos.map((g) => ({ value: g, label: g }))]} />
      )}
      {casa ? (
        (() => {
          const achados = doGrupo.filter((q) => casa([q.nome, q.grupoNome]));
          return achados.length ? <Grade quadros={achados} atual={atual} onAbrir={abrir} /> : <p className="py-8 text-center text-[13px] text-muted">Nenhum quadro com “{busca}”.</p>;
        })()
      ) : (
        <>
          {favs.length > 0 && (
            <section>
              <Titulo icone={<IconEstrela className="h-4 w-4" style={{ color: "var(--warn)" }} fill="currentColor" />}>Favoritos</Titulo>
              <Grade quadros={favs} atual={atual} onAbrir={abrir} />
            </section>
          )}
          {recs.length > 0 && (
            <section>
              <Titulo icone={<IconClock className="h-4 w-4" />}>Recentes</Titulo>
              <Grade quadros={recs} atual={atual} onAbrir={abrir} />
            </section>
          )}
          {(grupo === "__tudo" ? grupos : [grupo]).map((g) => {
            const lista = doGrupo.filter((q) => q.grupoNome === g);
            // Um grupo só (ou o escolhido nos chips) já vem aberto; os demais, recolhidos (como no Trello).
            const aberto = grupo !== "__tudo" || grupos.length === 1 || abertos.has(g);
            return (
              <section key={g}>
                <button
                  type="button"
                  aria-expanded={aberto}
                  onClick={() => alternar(g)}
                  className="mb-2 flex min-h-11 w-full items-center gap-2 rounded-control px-1 text-left text-[14px] font-semibold text-text-2 hover:bg-surface-2 lg:min-h-9"
                >
                  <IconChevronRight className={`h-4 w-4 transition-transform duration-[var(--motion-duration)] ${aberto ? "rotate-90" : ""}`} />
                  <span className="min-w-0 flex-1 truncate">{g}</span>
                  <span className="text-[12px] font-normal text-muted tabular-nums">{lista.length}</span>
                </button>
                {aberto && <Grade quadros={lista} atual={atual} onAbrir={abrir} />}
              </section>
            );
          })}
        </>
      )}
    </div>
  );
}
