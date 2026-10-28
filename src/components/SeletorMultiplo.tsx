"use client";

import { Fragment, type ReactNode, useId, useMemo, useState } from "react";
import { mesmaLista } from "@/lib/filtros-visao-core";
import { num } from "@/lib/format";
import { opcoesDaBusca } from "@/lib/tabela-filtros";
import { Dropdown } from "./Dropdown";
import { Checkbox, classeCaixaCampo, Rotulo, SearchField } from "./Field";
import { IconBandeira, IconCheck, IconChevronDown, IconRestaurar } from "./icons";
import { SetaDropdown } from "./SetaDropdown";

/** `rotulo` = o texto mostrado (padrão: o próprio valor — ex.: o nome de um fluxo cujo valor é o id); `detalhe` = a 2ª
 * linha; `grupo` = o cabeçalho da lista (as opções de mesmo grupo vêm juntas — ex.: as unidades de cada órgão). */
export type OpcaoMultipla = { valor: string; rotulo?: string; contagem?: number; detalhe?: string; grupo?: string };

/** Máximo de opções renderizadas de uma vez (a busca restringe o resto) — leve com milhares. */
const MAX_VISIVEIS = 300;

/**
 * Linha RECOLHÍVEL de seleção MÚLTIPLA (padrão das "Visões salvas" do orçamento), na ALTURA PADRÃO dos controles
 * (`--h-control-sm` no desktop, 44px no toque): rótulo à esquerda e,
 * à direita, "Todos" ou o SELO com quantos estão marcados (accent). Aberta: busca (vários de uma vez com ":" — `opcoesDaBusca`;
 * Enter marca os encontrados) + marcar/limpar os filtrados + a lista de valores com a contagem. Nenhum marcado =
 * `textoVazio` ("Todos" = sem filtro). `suspenso` = a lista abre num painel FLUTUANTE (`Dropdown`) — nada é empurrado
 * (ex.: as repartições da Tela Protocolo na Automação). `inicial` = o ESTADO INICIAL do filtro (o do ADM ou a visão
 * aplicada): não é filtro — o gatilho só marca o que DIFERE dele e o painel o mostra à parte (`BlocoInicial`).
 */
export function SeletorMultiplo({
  rotulo,
  opcoes,
  selecionados,
  onChange,
  disabled = false,
  suspenso = false,
  textoVazio = "Todos",
  campo,
  completo = false,
  inicial,
  rotuloInicial = "Estado inicial",
}: {
  rotulo: string;
  opcoes: OpcaoMultipla[];
  selecionados: string[];
  onChange: (valores: string[]) => void;
  disabled?: boolean;
  suspenso?: boolean;
  textoVazio?: string;
  /** CAMPO de formulário: o rótulo EM CIMA e a caixa do `TextField`/`SelectField` (mesma altura — `denso`), mostrando os
   * escolhidos; abre o MESMO painel do `suspenso`. `extra` = ao lado do rótulo (ex.: a `Ajuda compacta`). */
  campo?: { denso?: boolean; extra?: ReactNode };
  /** No `suspenso`: o gatilho mostra os ESCOLHIDOS por inteiro (sem o rótulo, sem abreviar — ex.: numa célula de tabela). */
  completo?: boolean;
  /** Os valores do ESTADO INICIAL (vazio = "Todos"): igual a ele, o gatilho fica neutro — não é filtro. */
  inicial?: readonly string[];
  rotuloInicial?: string;
}) {
  const [aberto, setAberto] = useState(false);
  const fid = useId();
  const n = selecionados.length;
  // Marcado = FILTRADO: o que difere do estado inicial (sem ele, qualquer seleção).
  const marcado = inicial ? !mesmaLista(selecionados, inicial) : n > 0;
  const nomeDe = (v: string) => opcoes.find((o) => o.valor === v)?.rotulo ?? v;
  const resumoNeutro = n <= 2 ? selecionados.map(nomeDe).join(", ") : `${selecionados.slice(0, 2).map(nomeDe).join(", ")} +${num(n - 2)}`;
  const gatilho = (seta: ReactNode) =>
    completo ? (
      <>
        <span className={`whitespace-nowrap text-left text-[12px] font-medium ${n > 0 ? "text-text-2" : "text-muted"}`}>
          {n > 0 ? opcoes.filter((o) => selecionados.includes(o.valor)).map((o) => o.rotulo ?? o.valor).join("; ") || `${num(n)} selecionado${n === 1 ? "" : "s"}` : textoVazio}
        </span>
        {seta}
      </>
    ) : (
    <>
      <span className="min-w-0 flex-1 truncate text-left text-[13px] font-semibold text-text">{rotulo}</span>
      {marcado && n > 0 ? (
        // A contagem num SELO (o rótulo fica inteiro mesmo em colunas estreitas); por extenso para o leitor de tela.
        <span className="grid h-5 min-w-5 shrink-0 place-items-center rounded-full bg-accent px-1.5 text-[11px] font-bold leading-none text-white tabular-nums" title={`${num(n)} selecionado${n === 1 ? "" : "s"}`}>
          {num(n)}
          <span className="sr-only"> selecionado{n === 1 ? "" : "s"}</span>
        </span>
      ) : marcado ? (
        // Todos, escolhido de propósito contra um estado inicial com valores: é filtro.
        <span className="shrink-0 text-[12px] font-semibold text-accent">{textoVazio}</span>
      ) : (
        // O estado inicial: neutro (não é filtro).
        <span className="min-w-0 max-w-[55%] shrink truncate text-[12px] text-muted" title={n ? `${rotuloInicial}: ${selecionados.map(nomeDe).join(", ")}` : undefined}>
          {n ? resumoNeutro : textoVazio}
        </span>
      )}
      {seta}
    </>
    );
  const corpo = (
    <CorpoSelecao
      rotulo={rotulo}
      opcoes={opcoes}
      selecionados={selecionados}
      onChange={onChange}
      disabled={disabled}
      textoVazio={textoVazio}
      inicial={inicial}
      rotuloInicial={rotuloInicial}
    />
  );

  if (campo) {
    const nomes = opcoes.filter((o) => selecionados.includes(o.valor)).map((o) => o.rotulo ?? o.valor);
    const resumo = n === 0 ? textoVazio : n <= 2 ? nomes.join(", ") : `${nomes.slice(0, 2).join(", ")} +${num(n - 2)}`;
    return (
      <div className="min-w-0">
        <Rotulo label={rotulo} fid={fid} denso={campo.denso} errId={`${fid}-erro`} extra={campo.extra} />
        <Dropdown
          papel="dialog"
          ariaLabel={rotulo}
          title={`${rotulo}: ${n === 0 ? textoVazio : nomes.join(", ")}`}
          bloqueado={disabled}
          width={420}
          className="block w-full min-w-0"
          triggerClassName="w-full"
          id={fid}
          trigger={
            <span className={`${classeCaixaCampo(campo.denso)} w-full ${disabled ? "opacity-60" : ""}`}>
              <span className={`min-w-0 flex-1 truncate text-left text-[15px] ${n > 0 ? "text-text" : "text-muted"}`}>{resumo}</span>
              <SetaDropdown className="h-4 w-4 shrink-0 text-muted" />
            </span>
          }
        >
          {corpo}
        </Dropdown>
      </div>
    );
  }

  if (suspenso)
    return (
      <Dropdown
        papel="dialog"
        ariaLabel={rotulo}
        title={`${rotulo}: escolher (busca, marcar todos, limpar)`}
        bloqueado={disabled}
        width={420}
        className={completo ? "inline-block" : "block w-full min-w-0"}
        triggerClassName={completo ? "w-max" : "w-full"}
        trigger={
          <span
            className={
              completo
                ? `flex min-h-11 w-max items-center gap-2 rounded-control px-2 transition-colors hover:bg-surface-2 lg:min-h-[calc(var(--h-control-sm)-6px)] ${disabled ? "opacity-60" : ""}`
                : `flex h-11 w-full items-center gap-2 rounded-control border border-border bg-surface px-3 lg:h-[var(--h-control-sm)] ${disabled ? "opacity-60" : ""}`
            }
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
  inicial,
  rotuloInicial,
}: {
  rotulo: string;
  opcoes: OpcaoMultipla[];
  selecionados: string[];
  onChange: (valores: string[]) => void;
  disabled: boolean;
  textoVazio: string;
  inicial?: readonly string[];
  rotuloInicial: string;
}) {
  const [busca, setBusca] = useState("");
  const sel = useMemo(() => new Set(selecionados), [selecionados]);
  const doInicial = useMemo(() => new Set<string>(inicial ?? []), [inicial]);
  const filtradas = useMemo(() => {
    // A busca acha pelo texto E pelo detalhe (ex.: a sigla ou o nome da unidade).
    const casam = new Set(opcoesDaBusca(opcoes.map((o) => o.rotulo ?? o.valor), busca));
    const temDetalhe = opcoes.some((o) => o.detalhe);
    const pelosDetalhes = temDetalhe && busca.trim() ? new Set(opcoesDaBusca(opcoes.map((o) => o.detalhe ?? ""), busca)) : null;
    const passa = (o: OpcaoMultipla) => casam.has(o.rotulo ?? o.valor) || (!!o.detalhe && !!pelosDetalhes?.has(o.detalhe));
    const l = casam.size === opcoes.length ? opcoes : opcoes.filter(passa);
    // Os valores do ESTADO INICIAL no topo (sem grupos — a ordem dos grupos manda): à vista ao abrir.
    return doInicial.size && !l.some((o) => o.grupo) ? [...l.filter((o) => doInicial.has(o.valor)), ...l.filter((o) => !doInicial.has(o.valor))] : l;
  }, [opcoes, busca, doInicial]);
  const marcarFiltradas = () => onChange([...new Set([...selecionados, ...filtradas.map((o) => o.valor)])]);
  // Selecionados que sumiram das opções (facetas) continuam valendo — listados no topo.
  const orfaos = selecionados.filter((v) => !opcoes.some((o) => o.valor === v));
  const n = selecionados.length;
  const alternar = (v: string) => onChange(sel.has(v) ? selecionados.filter((x) => x !== v) : [...selecionados, v]);

  return (
    <div className="space-y-2">
      {inicial && (
        <BlocoInicial
          rotulo={rotuloInicial}
          textoVazio={textoVazio}
          valores={inicial.map((v) => {
            const o = opcoes.find((x) => x.valor === v);
            return { chave: v, rotulo: o?.rotulo ?? v, detalhe: o?.detalhe };
          })}
          emUso={mesmaLista(selecionados, inicial)}
          onVoltar={() => onChange([...inicial])}
          disabled={disabled}
        />
      )}
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
              <span className="flex shrink-0 items-center gap-1.5">
                {doInicial.has(o.valor) && (
                  <span className="rounded-chip border border-border px-1 text-[10px] font-medium leading-4 text-faint" title={rotuloInicial}>
                    inicial
                  </span>
                )}
                {o.contagem != null && <span className="text-xs tabular-nums text-faint">{num(o.contagem)}</span>}
              </span>
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

/**
 * O ESTADO INICIAL de um filtro, DISCRETO no topo do painel (o do ADM ou o da visão aplicada): UMA linha separada por um
 * traço — bandeira, o nome, os valores (ou "Todos" em destaque; o resto rola de lado) e "Em uso" ou voltar a ele. O MESMO
 * no `SeletorMultiplo` e no `PeriodoPicker`.
 */
export function BlocoInicial({
  rotulo,
  valores,
  textoVazio = "Todos",
  emUso,
  onVoltar,
  disabled = false,
}: {
  rotulo: string;
  valores: { chave: string; rotulo: string; detalhe?: string }[];
  textoVazio?: string;
  emUso: boolean;
  onVoltar: () => void;
  disabled?: boolean;
}) {
  const texto = valores.length ? valores.map((v) => v.rotulo).join(", ") : textoVazio;
  return (
    <div className="flex min-h-8 items-center gap-2 border-b border-border pb-2 text-[12px]" title={`${rotulo}: ${texto}`}>
      <IconBandeira className="h-3.5 w-3.5 shrink-0 text-faint" aria-hidden="true" />
      <span className="shrink-0 text-faint">{rotulo}</span>
      {/* Os valores numa linha só: o que não cabe rola de lado (sem barra — a dica traz tudo). */}
      <div className="barra-rolavel min-w-0 flex-1 overflow-x-auto whitespace-nowrap">
        {valores.length === 0 ? (
          <span className="font-semibold uppercase tracking-wide text-text-2">{textoVazio}</span>
        ) : (
          valores.map((v, i) => (
            <span key={v.chave} className="font-medium text-text-2" title={v.detalhe ? `${v.rotulo} — ${v.detalhe}` : v.rotulo}>
              {i > 0 && <span className="text-faint">, </span>}
              {v.rotulo}
            </span>
          ))
        )}
      </div>
      {emUso ? (
        <span className="flex shrink-0 items-center text-[var(--ok)]" title="Em uso">
          <IconCheck className="h-3.5 w-3.5" aria-hidden="true" />
          <span className="sr-only">Em uso</span>
        </span>
      ) : (
        <button
          type="button"
          disabled={disabled}
          onClick={onVoltar}
          title={`Voltar ao ${rotulo.toLowerCase()}`}
          aria-label={`Voltar ao ${rotulo.toLowerCase()}`}
          className="grid h-11 w-11 shrink-0 place-items-center rounded-control text-accent hover:bg-surface-2 disabled:opacity-50 lg:h-6 lg:w-6"
        >
          <IconRestaurar className="h-3.5 w-3.5" aria-hidden="true" />
        </button>
      )}
    </div>
  );
}
