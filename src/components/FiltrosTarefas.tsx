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
import { IconBandeira, IconClock, IconEtiqueta, IconUser, IconUserX } from "./icons";
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
 * ":"). "Limpar" quando algum está ativo. Os filtros de ícone seguem o `SeletorFiltro` da Mesa.
 */
export function FiltrosTarefas({
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
  const pessoa = typeof filtro.responsavel === "number" ? pessoas.find((p) => p.id === filtro.responsavel) : undefined;
  const eu = pessoas.find((p) => p.id === usuarioId);
  const etiqueta = etiquetas.find((e) => e.id === filtro.etiqueta);
  const set = (p: Partial<FiltroTarefas>) => onChange({ ...filtro, ...p });
  return (
    <>
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
      {filtroTarefasAtivo(filtro) && (
        <Button variant="ghost" size="sm" onClick={() => onChange(FILTRO_TAREFAS_PADRAO)}>
          Limpar
        </Button>
      )}
    </>
  );
}
