"use client";

import { type ReactNode, useRef } from "react";
import { AJUSTE_FUNDO_PADRAO, type AjusteFundo, cssGradiente, estiloFundo, type Gradiente } from "@/lib/imagem-fundo-core";
import { nomeExibicao, type Pessoa } from "@/lib/pessoa";
import { alternarValor, type FiltroTarefas } from "@/lib/tarefas-core";
import { AvatarPessoa } from "./PessoaTag";
import { useAlturaTela } from "./AlturaCheia";
import { Dropdown } from "./Dropdown";
import { useImagemCarrega } from "./FundoQuadro";
import { IconArquivar, IconAutomacao, IconCalendar, IconImage, IconLink, IconMais, IconSettings } from "./icons";
import { toast } from "./Toast";

/** O espaço (px) que a PÍLULA de vistas ocupa no rodapé da moldura — o conteúdo termina acima dela. */
export const RESERVA_PILULA = 68;

/**
 * A MOLDURA do quadro (como no Trello): UM card grande de cantos arredondados, do topo até o fim do display, com a IMAGEM
 * DE FUNDO NÍTIDA (sem véu — só depois de carregar) ou o DEGRADÊ escolhido; sem nenhum, o padrão do sistema (a
 * superfície cinza, sem nada). Por cima, só ILHAS OPACAS:
 * a `faixa` do topo, o conteúdo (as listas, ou um painel opaco nas outras vistas — rola por dentro) e a `pilula` de
 * vistas flutuando no rodapé. A página não rola.
 */
export function MolduraQuadro({
  fundoUrl,
  ajuste = AJUSTE_FUNDO_PADRAO,
  gradiente = null,
  faixa,
  pilula,
  alturaFixa,
  children,
}: {
  fundoUrl: string | null;
  /** O ENQUADRAMENTO da imagem (ponto focal + zoom — `lerAjusteFundo`). */
  ajuste?: AjusteFundo;
  /** O DEGRADÊ de fundo (quando não há imagem). */
  gradiente?: Gradiente | null;
  faixa: ReactNode;
  pilula: ReactNode;
  /** Altura fixa (px) em vez de ir até o fim do display (a demonstração no catálogo). */
  alturaFixa?: number;
  children: ReactNode;
}) {
  const raiz = useRef<HTMLDivElement>(null);
  const medida = useAlturaTela(raiz, 420);
  const altura = alturaFixa ?? medida;
  const carregou = useImagemCarrega(fundoUrl);
  const comImagem = !!fundoUrl && carregou === true;
  // O degradê escolhido; sem imagem nem degradê, o PADRÃO DO SISTEMA (o cinza de superfície, sem nada).
  const fundo = !fundoUrl && gradiente ? { background: cssGradiente(gradiente) } : { background: "var(--surface-2)" };
  const comFundo = comImagem || (!fundoUrl && !!gradiente);
  return (
    <div
      ref={raiz}
      data-com-imagem={comFundo || undefined}
      style={{ ...fundo, ...(altura ? { height: altura } : {}) }}
      className="group/moldura relative isolate flex min-h-[420px] flex-col overflow-hidden rounded-2xl shadow-ring"
    >
      {comImagem && (
        // A imagem NÍTIDA (cover + ponto focal + zoom); o degradê fica por baixo.
        // biome-ignore lint/performance/noImgElement: imagem externa por link (não passa pelo otimizador).
        <img aria-hidden alt="" src={fundoUrl} referrerPolicy="no-referrer" className="pointer-events-none absolute inset-0 -z-10 h-full w-full select-none object-cover" style={estiloFundo(ajuste)} />
      )}
      {faixa}
      <div className="relative min-h-0 flex-1 overflow-y-auto">{children}</div>
      <div className="pointer-events-none absolute inset-x-0 bottom-3 z-20 flex justify-center px-3">
        <div className="pointer-events-auto max-w-full">{pilula}</div>
      </div>
    </div>
  );
}

/**
 * Um PAINEL OPACO dentro da moldura (Lista, Calendário) — a foto aparece em volta. `vazado` = sem o fundo (Dashboard e
 * Configuração: os quadros/seções delas já são ilhas opacas — sem painel dentro de painel).
 */
export function PainelMoldura({ vazado = false, children }: { vazado?: boolean; children: ReactNode }) {
  return (
    <div className={vazado ? "m-3" : "m-3 rounded-xl bg-surface p-3 shadow-soft"} style={{ marginBottom: RESERVA_PILULA }}>
      {children}
    </div>
  );
}

/**
 * A FAIXA DO TOPO da moldura (translúcida, com desfoque, como a do Trello): à esquerda o título (e o que o host puser), à
 * direita só ÍCONES (membros, filtro, ferramentas da vista, menu "…"); `abaixo` = os filtros ativos, só quando há.
 */
export function FaixaQuadro({ esquerda, direita, abaixo }: { esquerda: ReactNode; direita: ReactNode; abaixo?: ReactNode }) {
  return (
    <div className="relative z-10 shrink-0 border-b border-[color-mix(in_srgb,var(--text)_10%,transparent)] bg-[color-mix(in_srgb,var(--surface)_76%,transparent)] backdrop-blur-md">
      <div className="flex min-h-14 flex-wrap items-center gap-x-2 gap-y-1 px-2 py-1.5 sm:px-3">
        <div className="flex min-w-0 flex-1 items-center gap-1">{esquerda}</div>
        <div className="flex shrink-0 flex-wrap items-center justify-end gap-1">{direita}</div>
      </div>
      {abaixo}
    </div>
  );
}

export type VistaPilula<T extends string> = { value: T; label: string; icone: ReactNode };

/**
 * A PÍLULA DE VISTAS (a barra flutuante do rodapé do Trello): opaca, centralizada; o ativo em accent com o traço embaixo.
 * No celular, só os ícones (o rótulo é o nome acessível). `extra` = depois de um divisor (ex.: "Mudar de quadros").
 */
export function PilulaVistas<T extends string>({ opcoes, valor, onTrocar, extra }: { opcoes: VistaPilula<T>[]; valor: T; onTrocar: (v: T) => void; extra?: ReactNode }) {
  return (
    <nav aria-label="Vistas do quadro" className="flex max-w-full items-center gap-0.5 overflow-x-auto rounded-xl bg-surface p-1 shadow-soft ring-1 ring-border">
      {opcoes.map((o) => {
        const ativo = o.value === valor;
        return (
          <button
            key={o.value}
            type="button"
            aria-current={ativo ? "page" : undefined}
            aria-label={o.label}
            title={o.label}
            onClick={() => onTrocar(o.value)}
            className={`relative flex h-11 shrink-0 items-center gap-1.5 rounded-lg px-3 text-[13.5px] font-medium transition-colors lg:h-10 ${
              ativo ? "bg-accent-soft text-accent" : "text-text-2 hover:bg-surface-2"
            }`}
          >
            {o.icone}
            <span className="max-md:hidden">{o.label}</span>
            {ativo && <span aria-hidden className="absolute inset-x-3 bottom-1 h-0.5 rounded-full bg-accent" />}
          </button>
        );
      })}
      {extra && (
        <>
          <span aria-hidden className="mx-1 h-6 w-px shrink-0 bg-border" />
          {extra}
        </>
      )}
    </nav>
  );
}

/** O MENU "…" do quadro (como o do Trello): itens arquivados, fundo do quadro, listas do mês, automações, configurações, copiar o link. */
export function MenuQuadro({
  onArquivados,
  onConfiguracao,
  onFundo,
  onListasDoMes,
  podeEditar,
}: {
  onArquivados: () => void;
  onConfiguracao: (secao?: "automacoes" | "trello") => void;
  /** Abre o fundo do quadro (`FundoQuadro` num modal). */
  onFundo: () => void;
  /** Abre as listas dos dias do mês (`ListasDoMes`). */
  onListasDoMes: () => void;
  podeEditar: boolean;
}) {
  return (
    <Dropdown
      align="end"
      width={260}
      ariaLabel="Menu do quadro"
      triggerClassName="h-11 w-11 justify-center rounded-control text-text-2 hover:bg-[color-mix(in_srgb,var(--text)_8%,transparent)] lg:h-9 lg:w-9"
      trigger={<IconMais className="h-4 w-4" />}
    >
      {(fechar) => {
        const item = (rotulo: string, icone: ReactNode, fn: () => void) => (
          <button
            key={rotulo}
            type="button"
            onClick={() => {
              fechar();
              fn();
            }}
            className="flex min-h-11 w-full items-center gap-2 rounded-control px-2 text-left text-[13px] text-text hover:bg-surface-2 lg:min-h-9"
          >
            {icone}
            <span className="truncate">{rotulo}</span>
          </button>
        );
        return (
          <div className="space-y-0.5">
            <p className="px-2 pt-1 pb-0.5 text-[12px] font-semibold text-muted">Menu do quadro</p>
            {item("Itens arquivados", <IconArquivar className="h-4 w-4 text-muted" />, onArquivados)}
            {podeEditar && item("Fundo do quadro", <IconImage className="h-4 w-4 text-muted" />, onFundo)}
            {podeEditar && item("Listas do mês", <IconCalendar className="h-4 w-4 text-muted" />, onListasDoMes)}
            {podeEditar && item("Automações", <IconAutomacao className="h-4 w-4 text-muted" />, () => onConfiguracao("automacoes"))}
            {item("Configurações", <IconSettings className="h-4 w-4 text-muted" />, () => onConfiguracao())}
            {item("Copiar link do quadro", <IconLink className="h-4 w-4 text-muted" />, () =>
              navigator.clipboard?.writeText(window.location.href.split("?")[0]).then(
                () => toast.success("Link do quadro copiado."),
                () => toast.error("Não foi possível copiar o link."),
              ),
            )}
          </div>
        );
      }}
    </Dropdown>
  );
}

/** Até quantas fotos de membros aparecem na faixa (as demais viram "+N"). */
const MAX_MEMBROS = 5;

/**
 * Os MEMBROS do quadro na faixa (as fotos, como no Trello): tocar numa pessoa FILTRA o quadro pelas tarefas dela (e tocar
 * de novo tira) — a pessoa filtrada fica com o anel accent; "+N" lista os demais na dica.
 */
export function MembrosQuadro({ pessoas, filtro, onFiltro }: { pessoas: Pessoa[]; filtro: FiltroTarefas; onFiltro: (f: FiltroTarefas) => void }) {
  if (!pessoas.length) return null;
  const vis = pessoas.slice(0, MAX_MEMBROS);
  const resto = pessoas.slice(MAX_MEMBROS);
  return (
    <div className="flex items-center -space-x-1.5 px-1 max-sm:hidden">
      {vis.map((p) => {
        const ativo = filtro.responsaveis.includes(p.id);
        return (
          <button
            key={p.id}
            type="button"
            aria-pressed={ativo}
            title={`${nomeExibicao(p)} — ${ativo ? "tirar o filtro" : "ver só as tarefas dessa pessoa"}`}
            aria-label={`Filtrar pelas tarefas de ${nomeExibicao(p)}`}
            onClick={() => onFiltro({ ...filtro, responsaveis: alternarValor(filtro.responsaveis, p.id) })}
            className={`relative rounded-full transition-transform hover:z-10 hover:-translate-y-0.5 focus-visible:z-10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent ${
              ativo ? "z-10 ring-2 ring-accent" : "ring-2 ring-surface"
            }`}
          >
            <AvatarPessoa pessoa={p} size="md" />
          </button>
        );
      })}
      {resto.length > 0 && (
        <span
          className="grid h-8 min-w-8 place-items-center rounded-full bg-surface-2 px-1.5 text-[11px] font-semibold text-text-2 ring-2 ring-surface"
          title={resto.map((p) => nomeExibicao(p)).join(", ")}
        >
          +{resto.length}
        </span>
      )}
    </div>
  );
}
