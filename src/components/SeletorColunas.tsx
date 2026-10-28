"use client";

import { useMemo, useRef, useState } from "react";
import { soltarColuna } from "@/lib/colunas-layout";
import { predicadoBusca } from "@/lib/tabela-filtros";
import { SombraCartao } from "./ArrastoCartoes";
import { ChipPreso, useArrastoBlocos } from "./BlocosTarefa";
import { Button } from "./Button";
import { Dropdown } from "./Dropdown";
import { SearchField } from "./Field";
import { IconArrowDown, IconArrowUp, IconColunas, IconGrip } from "./icons";
import { Segmented } from "./Segmented";

export type OpcaoColuna = { key: string; header: string; grupo?: string };

/**
 * SELETOR DE COLUNAS (no rodapé da tabela): o botão só-ícone abre um DROPDOWN preso a ele (folha só abaixo de 40rem) com
 * TODAS as colunas da tabela em caixas — cabeçalho com "N de M visíveis", busca acima de 12, grupos com a contagem e
 * "Todos/Nenhum" do grupo, e no pé **Mostrar todas · Padrão** (volta às ocultas do padrão da tabela). Muda NA HORA (sem
 * entrar na edição); a última coluna visível nunca sai. A aba **Ordem** lista as visíveis na ordem da tabela: arrastar pela
 * alça (mouse, caneta e toque — `useArrastoBlocos` + `ChipPreso`; a SOMBRA do item — `SombraCartao` — ocupa o lugar de destino) ou ↑/↓ reordenam (soltar entre as congeladas a congela, como no
 * cabeçalho — `soltarColuna`). A escolha vale até trocar de visão e entra na visão ao salvar.
 */
export function SeletorColunas({
  colunas,
  ocultas,
  padrao,
  onMudar,
  fixadas,
  livres,
  onOrdem,
}: {
  colunas: readonly OpcaoColuna[];
  ocultas: readonly string[];
  /** As colunas ocultas no padrão da tabela (o botão "Padrão"). */
  padrao: readonly string[];
  onMudar: (ocultas: string[]) => void;
  /** A ordem exibida (todas as colunas): congeladas e livres. */
  fixadas: readonly string[];
  livres: readonly string[];
  onOrdem: (fixadas: string[], livres: string[]) => void;
}) {
  const [busca, setBusca] = useState("");
  const [aba, setAba] = useState<"mostrar" | "ordem">("mostrar");
  const [aberto, setAberto] = useState(false);
  const [folha, setFolha] = useState(false);
  const oc = useMemo(() => new Set(ocultas), [ocultas]);
  const visiveis = colunas.filter((c) => !oc.has(c.key)).length;
  const grupos = useMemo(() => {
    const passa = predicadoBusca(busca);
    const m = new Map<string, OpcaoColuna[]>();
    for (const c of colunas) if (!passa || passa([c.header])) m.set(c.grupo ?? "", [...(m.get(c.grupo ?? "") ?? []), c]);
    return [...m];
  }, [colunas, busca]);
  const alternar = (k: string) => {
    if (oc.has(k)) onMudar(ocultas.filter((x) => x !== k));
    else if (visiveis > 1) onMudar([...ocultas, k]);
  };
  /** Mostra ou oculta o grupo inteiro — ocultar nunca deixa a tabela sem coluna. */
  const alternarGrupo = (cs: readonly OpcaoColuna[]) => {
    const chaves = new Set(cs.map((c) => c.key));
    if (cs.some((c) => oc.has(c.key))) return onMudar(ocultas.filter((k) => !chaves.has(k)));
    const novas = new Set([...ocultas, ...chaves]);
    if (novas.size >= colunas.length) novas.delete(cs[0].key);
    onMudar([...novas]);
  };
  const conhecidas = new Set(colunas.map((c) => c.key));
  const porChave = new Map(colunas.map((c) => [c.key, c]));
  const congeladas = new Set(fixadas);
  /** As visíveis na ordem da tabela. */
  const naOrdem = [...fixadas, ...livres].filter((k) => porChave.has(k) && !oc.has(k));
  /** Leva a coluna à posição `indice` entre as VISÍVEIS (sem ela) — as ocultas ficam onde estavam. */
  const mover = (chave: string, indice: number) => {
    const vis = naOrdem.filter((k) => k !== chave);
    const todas = [...fixadas, ...livres].filter((k) => k !== chave);
    const destino = indice < vis.length ? todas.indexOf(vis[indice]) : vis.length ? todas.indexOf(vis[vis.length - 1]) + 1 : 0;
    const r = soltarColuna([...fixadas], [...livres], chave, destino);
    onOrdem(r.fixadas, r.livres);
  };
  const lista = useRef<HTMLDivElement>(null);
  /** A altura da linha pega — a SOMBRA no destino tem a mesma. */
  const [alturaLinha, setAlturaLinha] = useState(32);
  const { arrasto, fantasma, iniciar } = useArrastoBlocos(lista, (c, i) => mover(c.id, i));
  const contagem = `${visiveis} de ${colunas.length} visíveis`;
  return (
    <Dropdown
      papel="dialog"
      ariaLabel={`Colunas visíveis (${contagem})`}
      title={`Colunas (${contagem})`}
      width={320}
      folha={folha}
      aberto={aberto}
      onAberto={(v) => {
        if (v) setFolha(!window.matchMedia("(min-width: 40rem)").matches);
        setAberto(v);
      }}
      align="end"
      triggerClassName="inline-flex h-[44px] w-[44px] items-center justify-center rounded-control border border-border bg-surface text-text hover:bg-surface-2 lg:h-[var(--h-control-sm)] lg:w-[var(--h-control-sm)]"
      trigger={<IconColunas className="h-4 w-4" aria-hidden="true" />}
    >
      <div>
        <div className="sticky -top-2 z-10 -mx-2 -mt-2 border-b border-border bg-surface px-2 pt-2">
        <div className="flex items-baseline justify-between gap-2 px-3 py-2">
          <span className="text-[13.5px] font-bold text-text">Colunas</span>
          <span className="text-[12px] tabular-nums text-muted">{contagem}</span>
        </div>
        <div className="pb-2">
            <Segmented
              className="w-full [&>button]:flex-1"
              ariaLabel="Seletor de colunas"
              value={aba}
              onChange={setAba}
              options={[
                { value: "mostrar", label: "Mostrar", dica: "Escolher as colunas visíveis" },
                { value: "ordem", label: "Ordem", dica: "Arrastar para mudar a ordem das colunas" },
              ]}
            />
          </div>
        {aba === "mostrar" && colunas.length > 12 && (
          <div className="pb-2">
            <SearchField compacto value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Procurar coluna" aria-label="Procurar coluna" />
          </div>
        )}
        </div>
        {aba === "ordem" && (
          <div ref={lista} className="py-1">
            {naOrdem.map((k, i) => {
              const c = porChave.get(k) as OpcaoColuna;
              const nome = c.header || c.key;
              const outros = naOrdem.filter((x) => x !== arrasto?.carga.id);
              return (
                <div key={k}>
                  {arrasto && arrasto.indice === outros.indexOf(k) && <SombraCartao altura={alturaLinha} />}
                  <div data-bloco={k} className={`${arrasto?.carga.id === k ? "hidden" : "flex"} min-h-[44px] items-center gap-1 pr-1 text-[13.5px] lg:min-h-[32px]`}>
                    <button
                      type="button"
                      aria-label={`Arrastar ${nome}`}
                      title="Arrastar para mudar a ordem"
                      onPointerDown={(e) => {
                        const linha = e.currentTarget.closest<HTMLElement>("[data-bloco]");
                        if (linha) setAlturaLinha(linha.offsetHeight);
                        iniciar(e, { id: k }, nome);
                      }}
                      className="flex h-11 w-9 shrink-0 cursor-grab touch-none items-center justify-center rounded-control text-muted hover:bg-surface-2 lg:h-8 lg:w-7"
                    >
                      <IconGrip className="h-4 w-4" />
                    </button>
                    <span className="min-w-0 flex-1 break-words py-1 text-text">{nome}</span>
                    {congeladas.has(k) && <span className="shrink-0 text-[11px] text-muted">congelada</span>}
                    <Button size="xs" variant="icon" aria-label={`Subir ${nome}`} disabled={i === 0} onClick={() => mover(k, i - 1)}>
                      <IconArrowUp className="h-3.5 w-3.5" />
                    </Button>
                    <Button size="xs" variant="icon" aria-label={`Descer ${nome}`} disabled={i === naOrdem.length - 1} onClick={() => mover(k, i + 1)}>
                      <IconArrowDown className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
              );
            })}
            {arrasto && arrasto.indice === naOrdem.length - 1 && <SombraCartao altura={alturaLinha} />}
            {arrasto && <ChipPreso rotulo={arrasto.rotulo} x={arrasto.x} y={arrasto.y} fantasma={fantasma} />}
          </div>
        )}
        {aba === "mostrar" && (
        <div className="py-1">
          {grupos.map(([g, cs]) => {
            const vis = cs.filter((c) => !oc.has(c.key)).length;
            return (
              <fieldset key={g || "-"} className="py-1">
                <legend className="sr-only">{g || "Colunas"}</legend>
                {(g || grupos.length > 1) && (
                  <div className="flex items-center justify-between gap-2 px-3 pt-1">
                    <span className="min-w-0 truncate text-[11.5px] font-bold uppercase tracking-wide text-muted">
                      {g || "Colunas"} <span className="font-normal tabular-nums">· {vis}/{cs.length}</span>
                    </span>
                    <button
                      type="button"
                      onClick={() => alternarGrupo(cs)}
                      className="min-h-[44px] shrink-0 rounded-control px-2 text-[12px] font-medium text-accent hover:bg-surface-2 lg:min-h-[28px]"
                    >
                      {vis < cs.length ? "Todos" : "Nenhum"}
                    </button>
                  </div>
                )}
                {cs.map((c) => {
                  const marcada = !oc.has(c.key);
                  const ultima = marcada && visiveis === 1;
                  return (
                    <label
                      key={c.key}
                      className={`flex min-h-[44px] items-center gap-2.5 px-3 text-[13.5px] lg:min-h-[32px] ${ultima ? "opacity-60" : "cursor-pointer hover:bg-surface-2"}`}
                      title={ultima ? "A tabela precisa de ao menos uma coluna" : undefined}
                    >
                      <input type="checkbox" className="caixa-marcar" checked={marcada} disabled={ultima} onChange={() => alternar(c.key)} />
                      <span className="min-w-0 break-words py-1 text-text">{c.header || c.key}</span>
                    </label>
                  );
                })}
              </fieldset>
            );
          })}
          {grupos.length === 0 && <p className="px-3 py-4 text-[13px] text-muted">Nenhuma coluna com esse nome.</p>}
        </div>
        )}
        <div className="sticky -bottom-2 z-10 -mx-2 -mb-2 flex justify-end gap-1 border-t border-border bg-surface p-2">
          <Button size="sm" variant="ghost" onClick={() => onMudar(ocultas.filter((k) => !conhecidas.has(k)))}>
            Mostrar todas
          </Button>
          <Button size="sm" variant="ghost" onClick={() => onMudar(padrao.filter((k) => conhecidas.has(k)))}>
            Padrão
          </Button>
        </div>
      </div>
    </Dropdown>
  );
}
