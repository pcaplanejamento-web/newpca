"use client";

import { useMemo, useState } from "react";
import { combinarBusca, opcoesDaBusca } from "@/lib/tabela-filtros";
import { Dropdown } from "./Dropdown";
import { GatilhoFiltro } from "./GatilhoFiltro";
import { IconArrowDown, IconArrowUp } from "./icons";

// Filtro de cabeçalho de tabela (spec do usuário): ordenar (crescente/decrescente)
// + busca + "Selecionar todos" + checkboxes + Aplicar/Cancelar/Remover. "Remover" (ou nada/tudo
// marcado) = sem filtro. Na tabela as OPÇÕES já vêm facetadas pelos demais filtros (conectados).
// BUSCA como no Excel: vários valores de uma vez com ":" (ou espaço/";"/", " entre números — "168 170"; `opcoesDaBusca`);
// os resultados começam TODOS marcados. A busca SOMA ao que já estava escolhido (`combinarBusca`): procurar 168, marcar,
// "Adicionar" (ou procurar direto com o filtro já aplicado) e procurar 170 — o Aplicar leva os dois. "Substituir" ignora
// o que já estava escolhido (só os resultados marcados).
type Dir = "asc" | "desc" | null;
/** Quantas opções a lista DESENHA de uma vez (ex.: o Seq. com 20 mil itens) — marcar todos e Aplicar valem para todas as encontradas. */
const MAX_OPCOES_VISIVEIS = 300;

export function MultiSelectHeader({
  label,
  options,
  value,
  onApply,
  onSort,
  sortDir = null,
  align = "start",
  marcado,
  detalhe,
  noTopo,
}: {
  label: string;
  options: string[];
  value: string[];
  onApply: (sel: string[]) => void;
  onSort?: (dir: "asc" | "desc") => void;
  sortDir?: Dir;
  align?: "start" | "end";
  /** Coluna filtrada (tópico marcado). Padrão: há seleção que não cobre todas as opções. */
  marcado?: boolean;
  /** A 2ª linha de cada opção (ex.: o NOME da sigla da unidade) — a busca acha pelos dois. */
  detalhe?: (opcao: string) => string | undefined;
  /** Opções FIXAS no topo da lista (na ordem dada), separadas das demais por um divisor — ex.: "Não definida" · "Em branco". */
  noTopo?: string[];
}) {
  const filtrado = marcado ?? (value.length > 0 && !options.every((o) => value.includes(o)));

  return (
    <Dropdown
      align={align}
      ariaLabel={`Filtrar ${label}`}
      triggerClassName="w-full gap-1.5 px-1 py-2 min-h-11 desktop:min-h-0"
      panelClassName="p-0"
      width={detalhe ? 340 : 280}
      trigger={<GatilhoFiltro label={label} sortDir={sortDir} marcado={filtrado} />}
    >
      {(close) => (
        <Painel
          label={label}
          options={options}
          value={value}
          detalhe={detalhe}
          noTopo={noTopo}
          onApply={(s) => {
            onApply(s);
            close();
          }}
          onCancel={close}
          onSort={onSort ? (d) => { onSort(d); close(); } : undefined}
        />
      )}
    </Dropdown>
  );
}

function Painel({
  options,
  value,
  detalhe,
  noTopo,
  onApply,
  onCancel,
  onSort,
}: {
  label: string;
  options: string[];
  value: string[];
  detalhe?: (opcao: string) => string | undefined;
  noTopo?: string[];
  onApply: (sel: string[]) => void;
  onCancel: () => void;
  onSort?: (dir: "asc" | "desc") => void;
}) {
  // Abre com a seleção atual (restrita ao que a faceta oferece) ou, sem filtro, com tudo marcado.
  const [sel, setSel] = useState<Set<string>>(() => {
    if (!value.length) return new Set(options);
    const ofertadas = new Set(options);
    return new Set(value.filter((v) => ofertadas.has(v)));
  });
  const [q, setQ] = useState("");
  // As duas linhas de cada opção, calculadas UMA vez por lista (sigla + nome).
  const partes = useMemo(() => new Map(options.map((o) => [o, partesOpcao(o, detalhe)] as const)), [options, detalhe]);
  const visiveis = useMemo(() => {
    const achados = opcoesDaBusca(options, q);
    if (!detalhe || !q.trim()) return achados;
    // Também pelo nome (a 2ª linha): "saúde" acha a sigla FMS.
    const segundas = options.map((o) => partes.get(o)?.[1] ?? "");
    const peloNome = new Set(opcoesDaBusca(segundas.filter(Boolean), q));
    const ja = new Set(achados);
    return options.filter((o, i) => ja.has(o) || (segundas[i] !== "" && peloNome.has(segundas[i])));
  }, [q, options, detalhe, partes]);
  // As fixas no topo (na ordem dada) e as demais, na ordem de sempre — a seleção e o Aplicar valem para as duas.
  const [topo, resto] = useMemo(() => {
    if (!noTopo?.length) return [[] as string[], visiveis.slice(0, MAX_OPCOES_VISIVEIS)];
    const ha = new Set(visiveis);
    const fixas = new Set(noTopo);
    const t = noTopo.filter((o) => ha.has(o));
    return [t, visiveis.filter((o) => !fixas.has(o)).slice(0, Math.max(0, MAX_OPCOES_VISIVEIS - t.length))];
  }, [visiveis, noTopo]);
  const ocultas = visiveis.length - topo.length - resto.length;
  const buscando = q.trim() !== "";
  // Seleção DA BUSCA, guardada com o termo: mudou a busca ⇒ os novos resultados começam todos marcados.
  const [selBusca, setSelBusca] = useState<{ q: string; set: Set<string> } | null>(null);
  const marcadas = useMemo(
    () => (!buscando ? sel : selBusca && selBusca.q === q ? selBusca.set : new Set(visiveis)),
    [buscando, sel, selBusca, q, visiveis],
  );
  const todosMarcados = visiveis.length > 0 && visiveis.every((o) => marcadas.has(o));
  // O que já estava escolhido (fora da busca): sem filtro (tudo marcado) não há o que somar.
  const [substituir, setSubstituir] = useState(false);
  const base = useMemo(() => (substituir || sel.size >= options.length ? [] : [...sel]), [substituir, sel, options.length]);
  const aplicaveis = buscando ? combinarBusca(base, visiveis, marcadas) : null;
  const podeAplicar = aplicaveis == null || aplicaveis.length > 0;

  function alternar(o: string) {
    const n = new Set(marcadas);
    if (n.has(o)) n.delete(o);
    else n.add(o);
    if (buscando) setSelBusca({ q, set: n });
    else setSel(n);
  }
  function alternarTodos() {
    const n = new Set(marcadas);
    if (todosMarcados) for (const o of visiveis) n.delete(o);
    else for (const o of visiveis) n.add(o);
    if (buscando) setSelBusca({ q, set: n });
    else setSel(n);
  }
  function aplicar() {
    if (podeAplicar) onApply(aplicaveis ?? [...sel]);
  }
  /** Leva os marcados da busca para a seleção e limpa a busca (o painel segue aberto para procurar outro valor). */
  function adicionar() {
    if (!aplicaveis?.length) return;
    setSel(new Set(aplicaveis));
    setSelBusca(null);
    setSubstituir(false);
    setQ("");
  }

  const opcao = (o: string) => (
    <label
      key={o}
      className="flex min-h-11 cursor-pointer items-center gap-2.5 px-3 py-1.5 text-[13px] text-text-2 hover:bg-surface-2 active:bg-surface-2 desktop:min-h-0 desktop:items-start desktop:[&>input]:mt-0.5"
    >
      <input
        type="checkbox"
        checked={marcadas.has(o)}
        onChange={() => alternar(o)}
        className="caixa-marcar"
      />
      {(() => {
        const [principal, segunda] = partes.get(o) ?? [o, undefined];
        return segunda ? (
          <span className="flex min-w-0 flex-col">
            <span className="break-words">{principal}</span>
            <span className="break-words text-[11px] leading-snug text-faint">{segunda}</span>
          </span>
        ) : (
          <span className="min-w-0 break-words">{o}</span>
        );
      })()}
    </label>
  );

  const btn = "min-h-11 flex-1 rounded-control border border-border-2 px-2 py-1.5 text-[12px] font-semibold active:bg-surface-2 desktop:min-h-0";

  return (
    <div className="flex max-h-[min(70dvh,420px)] w-full flex-col">
      {onSort && (
        <div className="flex gap-2 p-2">
          <button type="button" onClick={() => onSort("asc")} className={`${btn} inline-flex items-center justify-center gap-1 text-text-2 hover:bg-surface-2`}>
            <IconArrowUp className="h-3.5 w-3.5" /> Crescente
          </button>
          <button type="button" onClick={() => onSort("desc")} className={`${btn} inline-flex items-center justify-center gap-1 text-text-2 hover:bg-surface-2`}>
            <IconArrowDown className="h-3.5 w-3.5" /> Decrescente
          </button>
        </div>
      )}
      <div className="flex gap-2 px-2 pb-1 pt-1">
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              aplicar();
            }
          }}
          aria-label="Buscar valores (vários com : ou espaço)"
          placeholder="Filtrar (vários: 168 170)"
          className="h-11 min-w-0 flex-1 rounded-control border border-border-2 bg-surface px-2.5 desktop:h-[var(--h-control-sm)] text-[13px] text-text outline-none focus-visible:ring-2 focus-visible:ring-accent/40"
        />
        {buscando && (
          <button
            type="button"
            onClick={adicionar}
            disabled={!aplicaveis?.length}
            title="Somar os marcados à seleção e procurar outro valor"
            className="h-11 shrink-0 rounded-control border border-border-2 px-2.5 text-[12px] font-semibold text-text-2 hover:bg-surface-2 disabled:opacity-50 desktop:h-[var(--h-control-sm)]"
          >
            Adicionar
          </button>
        )}
      </div>
      {buscando && (base.length > 0 || substituir) && (
        <div className="flex items-center gap-2 px-3 pb-1 text-[11.5px] text-muted">
          <span className="min-w-0 flex-1 truncate" title={base.join(", ")}>
            {substituir ? "Substituindo a seleção pelos resultados" : `Somando a ${base.length} já escolhido${base.length === 1 ? "" : "s"}: ${base.slice(0, 4).join(", ")}${base.length > 4 ? "…" : ""}`}
          </span>
          <button type="button" onClick={() => setSubstituir((v) => !v)} className="shrink-0 font-semibold text-accent hover:underline">
            {substituir ? "Somar" : "Substituir"}
          </button>
        </div>
      )}
      <label className="flex min-h-11 cursor-pointer items-center gap-2.5 border-b border-border px-3 py-2 text-[13px] font-semibold text-text desktop:min-h-0">
        <input
          type="checkbox"
          checked={todosMarcados}
          onChange={alternarTodos}
          className="caixa-marcar"
        />
        {buscando ? `Selecionar os ${visiveis.length} encontrados` : "Selecionar todos"}
      </label>
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain py-1">
        {topo.map(opcao)}
        {topo.length > 0 && resto.length > 0 && <hr className="my-1 border-border" />}
        {resto.map(opcao)}
        {ocultas > 0 && (
          <div className="px-3 py-2 text-center text-[11px] text-faint">
            Mostrando {topo.length + resto.length} de {visiveis.length} — refine a busca
          </div>
        )}
        {visiveis.length === 0 && (
          <div className="px-3 py-4 text-center text-[12px] text-faint">Nada encontrado</div>
        )}
      </div>
      <div className="flex gap-2 border-t border-border p-2">
        <button
          type="button"
          onClick={aplicar}
          disabled={!podeAplicar}
          className="min-h-11 flex-1 rounded-control bg-accent px-2 py-1.5 text-[12px] font-semibold text-white hover:opacity-90 active:opacity-80 disabled:opacity-50 desktop:min-h-0"
        >
          Aplicar
        </button>
        <button type="button" onClick={onCancel} className={`${btn} text-text-2 hover:bg-surface-2`}>
          Cancelar
        </button>
        <button
          type="button"
          onClick={() => onApply([])}
          className="min-h-11 rounded-control px-2 py-1.5 text-[12px] font-semibold text-[color:var(--sit-cancelado)] hover:bg-surface-2 active:bg-surface-2 desktop:min-h-0"
        >
          Remover
        </button>
      </div>
    </div>
  );
}

/** A opção em duas linhas: com `detalhe`, o valor + o nome; o valor já "SIGLA — Nome" também se divide (o mesmo desenho). */
function partesOpcao(o: string, detalhe?: (opcao: string) => string | undefined): [string, string | undefined] {
  const d = detalhe?.(o);
  if (d) return [o, d];
  if (!detalhe) return [o, undefined];
  const i = o.indexOf(" — ");
  return i > 0 ? [o.slice(0, i), o.slice(i + 3)] : [o, undefined];
}
