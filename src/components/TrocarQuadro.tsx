"use client";

import { type ReactNode, useEffect, useMemo, useState } from "react";
import { predicadoBusca } from "@/lib/tabela-filtros";
import { favoritosPrimeiro } from "@/lib/tarefas-core";
import { ChipsEscolha } from "./ChipsEscolha";
import { SearchField } from "./Field";
import { IconChevronRight, IconClock, IconEstrela } from "./icons";
import { Modal } from "./Modal";
import { QuadroCard } from "./QuadroCard";
import type { QuadroCard as QuadroCardDados } from "@/lib/tarefas";
import { chamarPadronizacao as chamar } from "@/lib/padronizacao-cliente";
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
 * aparelho) e cada GRUPO recolhível — tudo com o MESMO `QuadroCard` da tela de Tarefas (capa 16:9, grupo, nome inteiro
 * em até 2 linhas, contagens e a estrela). Escolher leva ao quadro na MESMA aba; o atual fica marcado. Os quadros (de
 * todos os grupos da pessoa) vêm só ao abrir — `GET /api/tarefas/quadros`.
 */
export function TrocarQuadro({
  quadro,
  aba,
  favoritos,
  onFavorito,
  gatilho,
  triggerClassName = "",
}: {
  quadro: { id: number; nome: string };
  aba: string;
  favoritos: number[];
  /** Marca/desmarca o favorito (a estrela dos cards do painel). */
  onFavorito?: (id: number) => void;
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
        {aberto && <PainelQuadros atual={quadro.id} aba={aba} favoritos={favoritos} onFavorito={onFavorito} onEscolhido={() => setAberto(false)} />}
      </Modal>
    </>
  );
}

/** A grade de quadros do painel — o MESMO `QuadroCard` da tela de Tarefas (capa 16:9, grupo, nome e contagens). */
function Grade({ quadros, atual, favoritos, onFavorito, onAbrir, aba }: { quadros: QuadroCardDados[]; atual: number; favoritos: number[]; onFavorito?: (id: number) => void; onAbrir: () => void; aba: string }) {
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
      {quadros.map((q) => (
        <QuadroCard
          key={q.id}
          quadro={q}
          href={`/painel/tarefas/${q.id}?aba=${aba}`}
          atual={q.id === atual}
          favorito={favoritos.includes(q.id)}
          onFavorito={onFavorito && (() => onFavorito(q.id))}
          onAbrir={onAbrir}
        />
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

function PainelQuadros({
  atual,
  aba,
  favoritos,
  onFavorito,
  onEscolhido,
}: {
  atual: number;
  aba: string;
  favoritos: number[];
  onFavorito?: (id: number) => void;
  onEscolhido: () => void;
}) {
  const [quadros, setQuadros] = useState<QuadroCardDados[] | null>(null);
  const [busca, setBusca] = useState("");
  const [grupo, setGrupo] = useState("__tudo");
  const [abertos, setAbertos] = useState<Set<string>>(new Set());
  const [recentes] = useState(lerRecentes);
  useEffect(() => {
    let vivo = true;
    chamar<{ quadros: QuadroCardDados[] }>("/api/tarefas/quadros")
      .then((j) => vivo && setQuadros(j.quadros))
      .catch((e) => vivo && toast.error((e as Error).message));
    return () => {
      vivo = false;
    };
  }, []);
  const grupos = useMemo(() => [...new Set((quadros ?? []).map((q) => q.grupoNome))].sort((a, b) => a.localeCompare(b, "pt-BR")), [quadros]);

  if (!quadros)
    return (
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4" aria-busy="true">
        {Array.from({ length: 8 }, (_, i) => (
          <Skeleton key={i} className="h-56 w-full" />
        ))}
      </div>
    );

  const casa = predicadoBusca(busca);
  const doGrupo = grupo === "__tudo" ? quadros : quadros.filter((q) => q.grupoNome === grupo);
  const porId = new Map(quadros.map((q) => [q.id, q]));
  const favs = favoritosPrimeiro(doGrupo, favoritos).filter((q) => favoritos.includes(q.id));
  const recs = recentes.map((id) => porId.get(id)).filter((q): q is QuadroCardDados => !!q && doGrupo.includes(q));
  const grade = { atual, favoritos, onFavorito, onAbrir: onEscolhido, aba };
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
          return achados.length ? <Grade quadros={achados} {...grade} /> : <p className="py-8 text-center text-[13px] text-muted">Nenhum quadro com “{busca}”.</p>;
        })()
      ) : (
        <>
          {favs.length > 0 && (
            <section>
              <Titulo icone={<IconEstrela className="h-4 w-4" style={{ color: "var(--warn)" }} fill="currentColor" />}>Favoritos</Titulo>
              <Grade quadros={favs} {...grade} />
            </section>
          )}
          {recs.length > 0 && (
            <section>
              <Titulo icone={<IconClock className="h-4 w-4" />}>Recentes</Titulo>
              <Grade quadros={recs} {...grade} />
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
                {aberto && <Grade quadros={lista} {...grade} />}
              </section>
            );
          })}
        </>
      )}
    </div>
  );
}
