"use client";

import { Fragment, type ReactNode, useMemo, useState } from "react";
import { num } from "@/lib/format";
import { opcoesDaBusca } from "@/lib/tabela-filtros";
import { Dropdown } from "./Dropdown";
import { Checkbox, SearchField } from "./Field";
import { IconChevronDown } from "./icons";
import { SetaDropdown } from "./SetaDropdown";

/** `rotulo` = o texto mostrado (padrão: o próprio valor — ex.: o nome de um fluxo cujo valor é o id); `detalhe` = a 2ª
 * linha; `grupo` = o cabeçalho da lista (as opções de mesmo grupo vêm juntas — ex.: as unidades de cada órgão). */
export type OpcaoMultipla = { valor: string; rotulo?: string; contagem?: number; detalhe?: string; grupo?: string };

/** Máximo de opções renderizadas de uma vez (a busca restringe o resto) — leve com milhares. */
const MAX_VISIVEIS = 300;

/**
 * Linha RECOLHÍVEL de seleção MÚLTIPLA (padrão das "Visões salvas" do orçamento), na ALTURA PADRÃO dos controles
 * (`--h-control-sm` no desktop, 44px no toque): rótulo à esquerda e,
 * à direita, "Todos" ou "N selecionados" (accent). Aberta: busca (vários de uma vez com ":" — `opcoesDaBusca`;
 * Enter marca os encontrados) + marcar/limpar os filtrados + a lista de valores com a contagem. Nenhum marcado =
 * `textoVazio` ("Todos" = sem filtro). `suspenso` = a lista abre num painel FLUTUANTE (`Dropdown`) — nada é empurrado
 * (ex.: as repartições da Tela Protocolo na Automação).
 */
export function SeletorMultiplo({
  rotulo,
  opcoes,
  selecionados,
  onChange,
  disabled = false,
  suspenso = false,
  textoVazio = "Todos",
}: {
  rotulo: string;
  opcoes: OpcaoMultipla[];
  selecionados: string[];
  onChange: (valores: string[]) => void;
  disabled?: boolean;
  suspenso?: boolean;
  textoVazio?: string;
}) {
  const [aberto, setAberto] = useState(false);
  const n = selecionados.length;
  const gatilho = (seta: ReactNode) => (
    <>
      <span className="min-w-0 flex-1 truncate text-left text-[13px] font-semibold text-text">{rotulo}</span>
      <span className={`shrink-0 text-[12px] ${n > 0 ? "font-semibold text-accent" : "text-muted"}`}>{n > 0 ? `${num(n)} selecionado${n === 1 ? "" : "s"}` : textoVazio}</span>
      {seta}
    </>
  );
  const corpo = <CorpoSelecao rotulo={rotulo} opcoes={opcoes} selecionados={selecionados} onChange={onChange} disabled={disabled} textoVazio={textoVazio} />;

  if (suspenso)
    return (
      <Dropdown
        papel="dialog"
        ariaLabel={rotulo}
        title={`${rotulo}: escolher (busca, marcar todos, limpar)`}
        bloqueado={disabled}
        width={420}
        className="block w-full min-w-0"
        triggerClassName="w-full"
        trigger={
          <span
            className={`flex h-11 w-full items-center gap-2 rounded-control border border-border bg-surface px-3 lg:h-[var(--h-control-sm)] ${disabled ? "opacity-60" : ""}`}
          >
            {gatilho(<SetaDropdown className="h-4 w-4 shrink-0 text-muted" />)}
          </span>
        }
      >
        {corpo}
      </Dropdown>
    );

  return (
    <div className="rounded-control border border-border bg-surface">
      <button
        type="button"
        disabled={disabled}
        aria-expanded={aberto}
        onClick={() => setAberto((a) => !a)}
        className="flex h-11 w-full items-center gap-2 px-3 text-left disabled:opacity-60 lg:h-[var(--h-control-sm)]"
      >
        {gatilho(<IconChevronDown className={`h-4 w-4 text-muted transition-transform ${aberto ? "rotate-180" : ""}`} />)}
      </button>
      {aberto && <div className="border-t border-border p-2">{corpo}</div>}
    </div>
  );
}

/** O conteúdo aberto: busca + marcar/limpar + a lista (rola por dentro). O MESMO na linha recolhível e no painel. */
function CorpoSelecao({
  rotulo,
  opcoes,
  selecionados,
  onChange,
  disabled,
  textoVazio,
}: {
  rotulo: string;
  opcoes: OpcaoMultipla[];
  selecionados: string[];
  onChange: (valores: string[]) => void;
  disabled: boolean;
  textoVazio: string;
}) {
  const [busca, setBusca] = useState("");
  const sel = useMemo(() => new Set(selecionados), [selecionados]);
  const filtradas = useMemo(() => {
    const casam = new Set(opcoesDaBusca(opcoes.map((o) => o.rotulo ?? o.valor), busca));
    return casam.size === opcoes.length ? opcoes : opcoes.filter((o) => casam.has(o.rotulo ?? o.valor));
  }, [opcoes, busca]);
  const marcarFiltradas = () => onChange([...new Set([...selecionados, ...filtradas.map((o) => o.valor)])]);
  // Selecionados que sumiram das opções (facetas) continuam valendo — listados no topo.
  const orfaos = selecionados.filter((v) => !opcoes.some((o) => o.valor === v));
  const n = selecionados.length;
  const alternar = (v: string) => onChange(sel.has(v) ? selecionados.filter((x) => x !== v) : [...selecionados, v]);

  return (
    <div className="space-y-2">
      <SearchField
        compacto
        value={busca}
        onChange={(e) => setBusca(e.target.value)}
        onClear={() => setBusca("")}
        onKeyDown={(e) => {
          if (e.key === "Enter" && busca.trim() && !disabled) {
            e.preventDefault();
            marcarFiltradas();
          }
        }}
        aria-label={`Buscar ${rotulo.toLowerCase()} (use : para vários)`}
        placeholder={`Buscar ${rotulo.toLowerCase()} (use : para vários)…`}
      />
      <div className="flex flex-wrap gap-x-3 px-1 text-xs">
        <button
          type="button"
          className="font-semibold text-accent hover:underline disabled:opacity-50"
          disabled={disabled}
          onClick={marcarFiltradas}
        >
          Marcar {busca ? "os filtrados" : "todos"} ({num(filtradas.length)})
        </button>
        {n > 0 && (
          <button type="button" className="font-semibold text-muted hover:underline" disabled={disabled} onClick={() => onChange([])}>
            Limpar ({textoVazio})
          </button>
        )}
      </div>
      {/* `relative`: as caixas de marcar (`input.sr-only`) ficam DENTRO da lista que rola — marcar não rola outra coisa. */}
      <ul className="relative max-h-60 overflow-y-auto overscroll-contain px-1">
        {orfaos.map((v) => (
          <li key={`o:${v}`} className="flex min-h-11 items-center justify-between gap-2 text-sm lg:min-h-7">
            <Checkbox checked onChange={() => alternar(v)} label={<span className="text-muted">{v}</span>} disabled={disabled} />
            <span className="text-xs text-faint">fora do filtro</span>
          </li>
        ))}
        {filtradas.slice(0, MAX_VISIVEIS).map((o, i, l) => (
          <Fragment key={o.valor}>
            {o.grupo && o.grupo !== l[i - 1]?.grupo && (
              <li className={`truncate pb-0.5 pt-2 text-[11px] font-semibold uppercase tracking-wide text-faint ${i > 0 ? "mt-1 border-t border-border" : ""}`} title={o.grupo}>
                {o.grupo}
              </li>
            )}
            <li className="flex min-h-11 items-center justify-between gap-2 text-sm lg:min-h-7">
              <Checkbox
                checked={sel.has(o.valor)}
                onChange={() => alternar(o.valor)}
                label={
                  o.detalhe ? (
                    <span className="flex min-w-0 flex-col py-0.5">
                      <span>{o.rotulo ?? o.valor}</span>
                      <span className="text-[11px] text-faint">{o.detalhe}</span>
                    </span>
                  ) : (
                    (o.rotulo ?? o.valor)
                  )
                }
                disabled={disabled}
              />
              {o.contagem != null && <span className="shrink-0 text-xs tabular-nums text-faint">{num(o.contagem)}</span>}
            </li>
          </Fragment>
        ))}
        {filtradas.length > MAX_VISIVEIS && (
          <li className="py-1 text-xs text-faint">+{num(filtradas.length - MAX_VISIVEIS)} — refine a busca para ver os demais.</li>
        )}
        {filtradas.length === 0 && orfaos.length === 0 && <li className="py-1 text-xs text-faint">Nenhum valor.</li>}
      </ul>
    </div>
  );
}
