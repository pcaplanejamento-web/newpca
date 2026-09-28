"use client";

import { type ReactNode, useState } from "react";
import { nomeExibicao, type Pessoa } from "@/lib/pessoa";
import {
  alternarValor,
  type CampoTarefa,
  COR_PRIORIDADE,
  contarFiltros,
  type EtiquetaTarefa,
  FILTRO_TAREFAS_PADRAO,
  FILTROS_PRAZO,
  type FiltroPessoa,
  type FiltroTarefas,
  filtroTarefasAtivo,
  PRIORIDADES,
  ROTULO_FILTRO_PRAZO,
  ROTULO_PRIORIDADE,
  ROTULO_STATUS_FILTRO,
  type StatusFiltro,
} from "@/lib/tarefas-core";
import { Avatar } from "./Avatar";
import { Button } from "./Button";
import { Dropdown } from "./Dropdown";
import { Checkbox, SearchField } from "./Field";
import { IconBandeira, IconClose, IconFilter, IconUserX } from "./icons";
import { Segmented } from "./Segmented";

/** Quantas pessoas/etiquetas aparecem antes do "Mostrar mais". */
const VISIVEIS = 8;

/**
 * FILTROS das tarefas (na linha das abas do quadro — os MESMOS nas abas Quadro, Lista, Calendário e Dashboard): a busca
 * por título ou nº do ticket (vários com ":") e o botão **Filtrar** (com o número de filtros ligados) que abre o PAINEL
 * — como o do Trello: Pessoas (sem responsável · as minhas · cada pessoa, com a foto), Status (todas · não concluídas ·
 * concluídas), Prazo (atrasadas · hoje · até amanhã · 7 dias · 30 dias · sem prazo), Prioridade e Etiquetas (sem
 * etiqueta · cada uma, na cor). Vários valores numa seção = QUALQUER um; seções diferentes se combinam. O que está ligado
 * aparece por extenso nos chips removíveis (`ChipsFiltrosTarefas`).
 */
export function FiltrosTarefas({
  filtro,
  onChange,
  pessoas,
  etiquetas,
  campos = [],
  usuarioId,
  semBusca = false,
  semResponsavel = false,
  semStatus = false,
  buscaNoPainel = false,
}: {
  filtro: FiltroTarefas;
  onChange: (f: FiltroTarefas) => void;
  pessoas: Pessoa[];
  etiquetas: EtiquetaTarefa[];
  /** Os campos personalizados do quadro (os de LISTA e CAIXA viram seções do painel). */
  campos?: CampoTarefa[];
  usuarioId: number;
  /** Sem o campo de busca (quem usa já tem a sua — o Calendário). */
  semBusca?: boolean;
  /** Sem a seção Pessoas (o Calendário filtra pessoas pelo "Pesquisar pessoas", mais amplo). */
  semResponsavel?: boolean;
  /** Sem a seção Status (o Calendário mostra/esconde as concluídas no menu de vistas). */
  semStatus?: boolean;
  /** A BUSCA dentro do painel e o gatilho SÓ ÍCONE (a faixa do quadro, como no Trello); o contador inclui a busca. */
  buscaNoPainel?: boolean;
}) {
  const set = (p: Partial<FiltroTarefas>) => onChange({ ...filtro, ...p });
  const n = contarFiltros(buscaNoPainel ? filtro : { ...filtro, busca: "" });
  return (
    <>
      {!semBusca && !buscaNoPainel && (
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
      <Dropdown
        align="end"
        width={320}
        ariaLabel={n ? `Filtrar — ${n} filtro(s) ligado(s)` : "Filtrar"}
        triggerClassName={
          buscaNoPainel
            ? `h-11 min-w-11 justify-center gap-1 rounded-control px-2 transition-colors lg:h-9 lg:min-w-9 ${n ? "bg-accent-soft text-accent" : "text-text-2 hover:bg-[color-mix(in_srgb,var(--text)_8%,transparent)]"}`
            : `h-11 gap-1.5 rounded-control border px-3 text-[13px] font-semibold transition-colors lg:h-[var(--h-control-sm)] ${
                n ? "border-accent bg-accent-soft text-accent" : "border-border bg-surface text-text-2 hover:bg-surface-2"
              }`
        }
        trigger={
          <>
            <IconFilter className="h-4 w-4" />
            {!buscaNoPainel && <span className="max-sm:hidden">Filtrar</span>}
            {n > 0 && <span className="rounded-full bg-accent px-1.5 text-[11px] leading-5 text-white tabular-nums">{n}</span>}
          </>
        }
      >
        <PainelFiltro comBusca={buscaNoPainel} filtro={filtro} set={set} onLimpar={() => onChange({ ...FILTRO_TAREFAS_PADRAO, busca: filtro.busca })} pessoas={pessoas} etiquetas={etiquetas} campos={campos} usuarioId={usuarioId} semResponsavel={semResponsavel} semStatus={semStatus} />
      </Dropdown>
    </>
  );
}

function Secao({ titulo, children }: { titulo: string; children: ReactNode }) {
  return (
    <fieldset className="border-t border-border pt-2 first:border-t-0 first:pt-0">
      <legend className="mb-1 text-[12px] font-semibold text-muted">{titulo}</legend>
      {children}
    </fieldset>
  );
}

function Opcao({ marcado, onAlternar, children }: { marcado: boolean; onAlternar: () => void; children: ReactNode }) {
  return (
    <div className="flex min-h-11 items-center lg:min-h-9">
      <Checkbox checked={marcado} onChange={onAlternar} label={<span className="flex min-w-0 items-center gap-2 text-[13px] text-text">{children}</span>} />
    </div>
  );
}

/** O PAINEL "Filtrar" (dentro do popover). */
function PainelFiltro({
  filtro,
  set,
  onLimpar,
  pessoas,
  etiquetas,
  campos,
  usuarioId,
  semResponsavel,
  semStatus,
  comBusca = false,
}: {
  comBusca?: boolean;
  filtro: FiltroTarefas;
  set: (p: Partial<FiltroTarefas>) => void;
  onLimpar: () => void;
  pessoas: Pessoa[];
  etiquetas: EtiquetaTarefa[];
  campos: CampoTarefa[];
  usuarioId: number;
  semResponsavel: boolean;
  semStatus: boolean;
}) {
  const [maisPessoas, setMaisPessoas] = useState(false);
  const [maisEtiquetas, setMaisEtiquetas] = useState(false);
  const eu = pessoas.find((p) => p.id === usuarioId);
  const outras = pessoas.filter((p) => p.id !== usuarioId);
  const pessoasVis = maisPessoas ? outras : outras.slice(0, VISIVEIS);
  const etiquetasVis = maisEtiquetas ? etiquetas : etiquetas.slice(0, VISIVEIS + 4);
  const alt = (v: FiltroPessoa) => set({ responsaveis: alternarValor(filtro.responsaveis, v) });
  return (
    <div className="space-y-2 p-1">
      <div className="flex items-center justify-between gap-2">
        <p className="text-[13px] font-semibold text-text">Filtrar</p>
        {contarFiltros({ ...filtro, busca: "" }) > 0 && (
          <Button variant="ghost" size="sm" onClick={onLimpar}>
            Limpar
          </Button>
        )}
      </div>
      {comBusca && (
        <SearchField
          compacto
          value={filtro.busca}
          placeholder="Buscar título ou #ticket"
          aria-label="Buscar tarefas por título ou nº do ticket"
          onChange={(e) => set({ busca: e.target.value })}
          onClear={() => set({ busca: "" })}
        />
      )}
      {!semResponsavel && (
        <Secao titulo="Pessoas">
          <Opcao marcado={filtro.responsaveis.includes("sem")} onAlternar={() => alt("sem")}>
            <IconUserX className="h-4 w-4 text-muted" />
            Sem responsável
          </Opcao>
          <Opcao marcado={filtro.responsaveis.includes("eu")} onAlternar={() => alt("eu")}>
            {eu && <Avatar nome={eu.nome} foto={eu.foto} size="xs" />}
            As minhas
          </Opcao>
          {pessoasVis.map((p) => (
            <Opcao key={p.id} marcado={filtro.responsaveis.includes(p.id)} onAlternar={() => alt(p.id)}>
              <Avatar nome={p.nome} foto={p.foto} size="xs" />
              <span className="truncate">{nomeExibicao(p)}</span>
            </Opcao>
          ))}
          {outras.length > VISIVEIS && (
            <Button variant="ghost" size="sm" onClick={() => setMaisPessoas((m) => !m)}>
              {maisPessoas ? "Mostrar menos" : `Mostrar mais ${outras.length - VISIVEIS}`}
            </Button>
          )}
        </Secao>
      )}
      {!semStatus && (
        <Secao titulo="Status">
          <Segmented<StatusFiltro>
            ariaLabel="Status das tarefas"
            value={filtro.status}
            onChange={(status) => set({ status })}
            options={(Object.keys(ROTULO_STATUS_FILTRO) as StatusFiltro[]).map((k) => ({ value: k, label: ROTULO_STATUS_FILTRO[k] }))}
          />
        </Secao>
      )}
      <Secao titulo="Prazo">
        {FILTROS_PRAZO.map((p) => (
          <Opcao key={p} marcado={filtro.prazos.includes(p)} onAlternar={() => set({ prazos: alternarValor(filtro.prazos, p) })}>
            {ROTULO_FILTRO_PRAZO[p]}
          </Opcao>
        ))}
      </Secao>
      <Secao titulo="Prioridade">
        {PRIORIDADES.map((p) => (
          <Opcao key={p} marcado={filtro.prioridades.includes(p)} onAlternar={() => set({ prioridades: alternarValor(filtro.prioridades, p) })}>
            <IconBandeira className="h-4 w-4" style={{ color: COR_PRIORIDADE[p] }} />
            {ROTULO_PRIORIDADE[p]}
          </Opcao>
        ))}
      </Secao>
      {etiquetas.length > 0 && (
        <Secao titulo="Etiquetas">
          <Opcao marcado={filtro.etiquetas.includes("sem")} onAlternar={() => set({ etiquetas: alternarValor(filtro.etiquetas, "sem") })}>
            Sem etiqueta
          </Opcao>
          {etiquetasVis.map((e) => (
            <Opcao key={e.id} marcado={filtro.etiquetas.includes(e.id)} onAlternar={() => set({ etiquetas: alternarValor(filtro.etiquetas, e.id) })}>
              <span
                className="min-w-0 truncate rounded-control px-2 py-0.5 text-[12px] font-semibold"
                style={{ color: e.cor, background: `color-mix(in srgb, ${e.cor} 16%, var(--surface))` }}
              >
                {e.nome}
              </span>
            </Opcao>
          ))}
          {etiquetas.length > VISIVEIS + 4 && (
            <Button variant="ghost" size="sm" onClick={() => setMaisEtiquetas((m) => !m)}>
              {maisEtiquetas ? "Mostrar menos" : `Mostrar mais ${etiquetas.length - VISIVEIS - 4}`}
            </Button>
          )}
        </Secao>
      )}
      {camposFiltraveis(campos).map((c) => (
        <Secao key={c.id} titulo={c.nome}>
          {opcoesDoCampo(c).map((o) => (
            <Opcao key={o.valor} marcado={(filtro.campos[c.id] ?? []).includes(o.valor)} onAlternar={() => set({ campos: { ...filtro.campos, [c.id]: alternarValor(filtro.campos[c.id] ?? [], o.valor) } })}>
              <span className="truncate">{o.rotulo}</span>
            </Opcao>
          ))}
        </Secao>
      ))}
    </div>
  );
}

/** Os campos que FILTRAM (lista de opções e caixa de marcar — os de valor livre ficam de fora). */
const camposFiltraveis = (campos: CampoTarefa[]) => campos.filter((c) => c.tipo === "lista" || c.tipo === "checkbox");
/** As opções de filtro de um campo ("" = sem valor / não marcado). */
function opcoesDoCampo(c: CampoTarefa): { valor: string; rotulo: string }[] {
  if (c.tipo === "checkbox")
    return [
      { valor: "1", rotulo: "Marcado" },
      { valor: "", rotulo: "Não marcado" },
    ];
  return [...c.opcoes.map((o) => ({ valor: o, rotulo: o })), { valor: "", rotulo: "Sem valor" }];
}

/**
 * Os filtros ATIVOS por extenso, em chips removíveis (tocar tira aquele valor) + "Limpar filtros" — a leitura do que o
 * quadro está mostrando, também no toque. Nada ativo = nada renderizado.
 */
export function ChipsFiltrosTarefas({
  filtro,
  onChange,
  pessoas,
  etiquetas,
  campos = [],
  usuarioId,
  semBusca = false,
}: {
  filtro: FiltroTarefas;
  onChange: (f: FiltroTarefas) => void;
  pessoas: Pessoa[];
  etiquetas: EtiquetaTarefa[];
  campos?: CampoTarefa[];
  usuarioId: number;
  /** Sem o chip da busca (a busca do host já mostra o texto) — "Limpar filtros" mantém a busca. */
  semBusca?: boolean;
}) {
  if (!filtroTarefasAtivo(semBusca ? { ...filtro, busca: "" } : filtro)) return null;
  const nome = (id: number) => {
    const p = pessoas.find((x) => x.id === id);
    return p ? nomeExibicao(p) : `Pessoa #${id}`;
  };
  const chips: { chave: string; rotulo: string; limpar: Partial<FiltroTarefas> }[] = [];
  if (!semBusca && filtro.busca.trim()) chips.push({ chave: "busca", rotulo: `Busca: ${filtro.busca.trim()}`, limpar: { busca: "" } });
  for (const r of filtro.responsaveis)
    chips.push({
      chave: `resp-${r}`,
      rotulo: r === "eu" ? `Responsável: eu (${nome(usuarioId)})` : r === "sem" ? "Sem responsável" : `Responsável: ${nome(r)}`,
      limpar: { responsaveis: filtro.responsaveis.filter((x) => x !== r) },
    });
  if (filtro.status !== "todas") chips.push({ chave: "status", rotulo: ROTULO_STATUS_FILTRO[filtro.status], limpar: { status: "todas" } });
  for (const p of filtro.prazos) chips.push({ chave: `prazo-${p}`, rotulo: `Prazo: ${ROTULO_FILTRO_PRAZO[p]}`, limpar: { prazos: filtro.prazos.filter((x) => x !== p) } });
  for (const p of filtro.prioridades)
    chips.push({ chave: `prio-${p}`, rotulo: `Prioridade: ${ROTULO_PRIORIDADE[p]}`, limpar: { prioridades: filtro.prioridades.filter((x) => x !== p) } });
  for (const e of filtro.etiquetas)
    chips.push({
      chave: `etq-${e}`,
      rotulo: e === "sem" ? "Sem etiqueta" : `Etiqueta: ${etiquetas.find((x) => x.id === e)?.nome ?? "—"}`,
      limpar: { etiquetas: filtro.etiquetas.filter((x) => x !== e) },
    });
  for (const [id, vals] of Object.entries(filtro.campos)) {
    const c = campos.find((x) => x.id === Number(id));
    for (const v of vals)
      chips.push({
        chave: `campo-${id}-${v}`,
        rotulo: `${c?.nome ?? "Campo"}: ${(c && opcoesDoCampo(c).find((o) => o.valor === v)?.rotulo) || v}`,
        limpar: { campos: { ...filtro.campos, [id]: vals.filter((x) => x !== v) } },
      });
  }
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
      <Button variant="ghost" size="sm" onClick={() => onChange(semBusca ? { ...FILTRO_TAREFAS_PADRAO, busca: filtro.busca } : FILTRO_TAREFAS_PADRAO)}>
        Limpar filtros
      </Button>
    </section>
  );
}
