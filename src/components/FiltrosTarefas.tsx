"use client";

import { nomeExibicao, type Pessoa, rotuloOpcaoPessoa } from "@/lib/pessoa";
import {
  COR_PRIORIDADE,
  type EtiquetaTarefa,
  FILTRO_TAREFAS_PADRAO,
  type FiltroPrazo,
  type FiltroTarefas,
  filtroTarefasAtivo,
  type Prioridade,
  PRIORIDADES,
  ROTULO_PRIORIDADE,
} from "@/lib/tarefas-core";
import { Avatar } from "./Avatar";
import { Button } from "./Button";
import { SearchField } from "./Field";
import { IconBandeira, IconClock, IconClose, IconEtiqueta, IconUser, IconUserX } from "./icons";
import { SeletorFiltro } from "./SeletorFiltro";

const ROTULO_FILTRO_PRAZO: Record<FiltroPrazo, string> = {
  todos: "Todos os prazos",
  atrasadas: "Atrasadas",
  hoje: "Vencem hoje",
  semana: "Próximos 7 dias",
  sem: "Sem prazo",
};

/**
 * FILTROS das tarefas (na linha das abas do quadro — os MESMOS nas abas Quadro e Lista): Responsável (a FOTO da pessoa
 * escolhida), Prazo, Prioridade (a bandeira na cor), Etiqueta (na cor) e a busca por título ou nº do ticket (vários com
 * ":"). Os filtros de ícone seguem o `SeletorFiltro` da Mesa; o que está ATIVO aparece por extenso nos chips removíveis
 * (`ChipsFiltrosTarefas`, abaixo da barra — no toque não há dica ao passar o mouse).
 */
export function FiltrosTarefas({
  filtro,
  onChange,
  pessoas,
  etiquetas,
  usuarioId,
  semBusca = false,
}: {
  filtro: FiltroTarefas;
  onChange: (f: FiltroTarefas) => void;
  pessoas: Pessoa[];
  etiquetas: EtiquetaTarefa[];
  usuarioId: number;
  /** Sem o campo de busca (quem usa já tem a sua — o Calendário). */
  semBusca?: boolean;
}) {
  const pessoa = typeof filtro.responsavel === "number" ? pessoas.find((p) => p.id === filtro.responsavel) : undefined;
  const eu = pessoas.find((p) => p.id === usuarioId);
  const etiqueta = etiquetas.find((e) => e.id === filtro.etiqueta);
  const set = (p: Partial<FiltroTarefas>) => onChange({ ...filtro, ...p });
  return (
    <>
      {!semBusca && (
      <div className="min-w-[10rem] flex-1 sm:max-w-[16rem]">
        <SearchField
          compacto
          value={filtro.busca}
          placeholder="Buscar título ou #ticket"
          aria-label="Buscar tarefas por título ou nº do ticket"
          onChange={(e) => set({ busca: e.target.value })}
          onClear={() => set({ busca: "" })}
        />
      </div>
      )}
      <SeletorFiltro
        icone={
          pessoa || (filtro.responsavel === "eu" && eu) ? (
            <Avatar nome={(pessoa ?? eu)?.nome ?? "?"} foto={(pessoa ?? eu)?.foto} size="xs" />
          ) : filtro.responsavel === "sem" ? (
            <IconUserX className="h-4 w-4" />
          ) : (
            <IconUser className="h-4 w-4" />
          )
        }
        rotulo="Responsável"
        valor={String(filtro.responsavel)}
        ativo={filtro.responsavel !== "todos"}
        onChange={(v) => set({ responsavel: v === "todos" || v === "eu" || v === "sem" ? v : Number(v) })}
        opcoes={[
          { valor: "todos", rotulo: "Todos" },
          { valor: "eu", rotulo: `As minhas${eu ? ` (${nomeExibicao(eu)})` : ""}` },
          { valor: "sem", rotulo: "Sem responsável" },
          ...pessoas.filter((p) => p.id !== usuarioId).map((p) => ({ valor: String(p.id), rotulo: rotuloOpcaoPessoa(p, usuarioId) })),
        ]}
      />
      <SeletorFiltro
        icone={<IconClock className="h-4 w-4" />}
        rotulo="Prazo"
        valor={filtro.prazo}
        ativo={filtro.prazo !== "todos"}
        onChange={(v) => set({ prazo: v as FiltroPrazo })}
        opcoes={(Object.keys(ROTULO_FILTRO_PRAZO) as FiltroPrazo[]).map((k) => ({ valor: k, rotulo: ROTULO_FILTRO_PRAZO[k] }))}
      />
      <SeletorFiltro
        icone={<IconBandeira className="h-4 w-4" style={filtro.prioridade !== "todas" ? { color: COR_PRIORIDADE[filtro.prioridade] } : undefined} />}
        rotulo="Prioridade"
        valor={filtro.prioridade}
        ativo={filtro.prioridade !== "todas"}
        onChange={(v) => set({ prioridade: v as Prioridade | "todas" })}
        opcoes={[{ valor: "todas", rotulo: "Todas as prioridades" }, ...PRIORIDADES.map((p) => ({ valor: p, rotulo: ROTULO_PRIORIDADE[p] }))]}
      />
      {etiquetas.length > 0 && (
        <SeletorFiltro
          icone={<IconEtiqueta className="h-4 w-4" style={etiqueta ? { color: etiqueta.cor } : undefined} />}
          rotulo="Etiqueta"
          valor={filtro.etiqueta == null ? "todas" : String(filtro.etiqueta)}
          ativo={filtro.etiqueta != null}
          onChange={(v) => set({ etiqueta: v === "todas" ? null : Number(v) })}
          opcoes={[{ valor: "todas", rotulo: "Todas as etiquetas" }, ...etiquetas.map((e) => ({ valor: String(e.id), rotulo: e.nome }))]}
        />
      )}
    </>
  );
}

/**
 * Os filtros ATIVOS por extenso, em chips removíveis (tocar tira aquele filtro) + "Limpar filtros" — a leitura do que o
 * quadro está mostrando, também no toque. Nada ativo = nada renderizado.
 */
export function ChipsFiltrosTarefas({
  filtro,
  onChange,
  pessoas,
  etiquetas,
  usuarioId,
}: {
  filtro: FiltroTarefas;
  onChange: (f: FiltroTarefas) => void;
  pessoas: Pessoa[];
  etiquetas: EtiquetaTarefa[];
  usuarioId: number;
}) {
  if (!filtroTarefasAtivo(filtro)) return null;
  const nome = (id: number) => {
    const p = pessoas.find((x) => x.id === id);
    return p ? nomeExibicao(p) : `Pessoa #${id}`;
  };
  const chips: { chave: string; rotulo: string; limpar: Partial<FiltroTarefas> }[] = [];
  if (filtro.busca.trim()) chips.push({ chave: "busca", rotulo: `Busca: ${filtro.busca.trim()}`, limpar: { busca: "" } });
  if (filtro.responsavel !== "todos")
    chips.push({
      chave: "resp",
      rotulo:
        filtro.responsavel === "eu"
          ? `Responsável: eu (${nome(usuarioId)})`
          : filtro.responsavel === "sem"
            ? "Sem responsável"
            : `Responsável: ${nome(filtro.responsavel)}`,
      limpar: { responsavel: "todos" },
    });
  if (filtro.prazo !== "todos") chips.push({ chave: "prazo", rotulo: `Prazo: ${ROTULO_FILTRO_PRAZO[filtro.prazo]}`, limpar: { prazo: "todos" } });
  if (filtro.prioridade !== "todas") chips.push({ chave: "prio", rotulo: `Prioridade: ${ROTULO_PRIORIDADE[filtro.prioridade]}`, limpar: { prioridade: "todas" } });
  if (filtro.etiqueta != null)
    chips.push({ chave: "etq", rotulo: `Etiqueta: ${etiquetas.find((e) => e.id === filtro.etiqueta)?.nome ?? "—"}`, limpar: { etiqueta: null } });
  return (
    <section className="flex flex-wrap items-center gap-1.5" aria-label="Filtros ativos">
      {chips.map((c) => (
        <button
          key={c.chave}
          type="button"
          onClick={() => onChange({ ...filtro, ...c.limpar })}
          aria-label={`Remover o filtro ${c.rotulo}`}
          className="inline-flex h-11 max-w-full items-center gap-1.5 rounded-full bg-accent-soft px-3 text-[12.5px] font-semibold text-accent transition-colors hover:brightness-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40 lg:h-[var(--h-control-sm)]"
        >
          <span className="truncate">{c.rotulo}</span>
          <IconClose className="h-3.5 w-3.5 shrink-0" />
        </button>
      ))}
      <Button variant="ghost" size="sm" onClick={() => onChange(FILTRO_TAREFAS_PADRAO)}>
        Limpar filtros
      </Button>
    </section>
  );
}
