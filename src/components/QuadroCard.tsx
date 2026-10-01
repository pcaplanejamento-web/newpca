"use client";

import Link from "next/link";
import { type ReactNode, useState } from "react";
import { cssGradiente, estiloFundo, lerAjusteFundo, lerGradiente } from "@/lib/imagem-fundo-core";
import { num } from "@/lib/format";
import type { QuadroCard as QuadroCardDados } from "@/lib/tarefas";
import { Badge } from "./Badge";
import { ColorField } from "./ColorField";
import { EstrelaFavorito } from "./FavoritosQuadros";
import { Checkbox, SelectField, TextArea, TextField } from "./Field";
import { MESES } from "@/lib/normalize";
import { IconCheck, IconLock, IconPlus } from "./icons";

/**
 * A CAPA 16:9 de um quadro (dentro do card, como no Trello): a imagem de fundo (com o enquadramento), o degradê, ou — sem
 * nenhum — a superfície do sistema com a cor do quadro num traço. `children` = o que vai por cima (selos).
 */
export function CapaQuadro({ quadro: q, children }: { quadro: Pick<QuadroCardDados, "cor" | "fundoUrl" | "fundoAjuste" | "fundoGradiente">; children?: ReactNode }) {
  const [falhou, setFalhou] = useState(false);
  const g = lerGradiente(q.fundoGradiente);
  const imagem = q.fundoUrl && !falhou ? q.fundoUrl : null;
  return (
    <div className="relative aspect-video w-full overflow-hidden rounded-lg bg-surface-2" style={!imagem && g ? { background: cssGradiente(g) } : undefined}>
      {imagem && (
        // biome-ignore lint/performance/noImgElement: imagem externa por link (não passa pelo otimizador).
        <img alt="" src={imagem} loading="lazy" referrerPolicy="no-referrer" onError={() => setFalhou(true)} className="h-full w-full object-cover transition-transform duration-[var(--motion-duration)] group-hover:scale-[1.03]" style={estiloFundo(lerAjusteFundo(q.fundoAjuste))} />
      )}
      {!imagem && !g && <span aria-hidden className="absolute inset-x-0 bottom-0 h-1.5" style={{ background: q.cor }} />}
      {children}
    </div>
  );
}

/** Um número do rodapé do card (rótulo + valor; `cor` = a do valor — ex.: atrasadas em vermelho). */
export type MetricaCartao = { rotulo: string; valor: string; cor?: string };

/**
 * O CARD de um ESPAÇO (o desenho do card de quadro de Tarefas, compartilhado com o Catálogo): a CAPA 16:9 dentro do card,
 * o SOBRETÍTULO (grupo, tipo…) + um selo opcional, o NOME em até 2 linhas e até 3 MÉTRICAS no rodapé. `href` = link;
 * senão `onClick` = botão. `canto` = o que fica sobre a capa, FORA do link (a estrela, o menu "…"). `atual` = contorno accent;
 * `esmaecido` = arquivado.
 */
export function CartaoEspaco({
  capa,
  sobretitulo,
  selo,
  nome,
  metricas,
  href,
  onClick,
  ariaLabel,
  atual = false,
  esmaecido = false,
  canto,
}: {
  capa: ReactNode;
  sobretitulo: string;
  selo?: ReactNode;
  nome: string;
  metricas: MetricaCartao[];
  href?: string;
  onClick?: () => void;
  ariaLabel: string;
  atual?: boolean;
  esmaecido?: boolean;
  canto?: ReactNode;
}) {
  const classe = `group flex h-full w-full flex-col overflow-hidden rounded-card border bg-surface p-2 text-left shadow-ring transition-colors duration-[var(--motion-duration)] hover:border-accent/50 focus:outline-none focus-visible:ring-4 focus-visible:ring-accent/25 ${
    atual ? "border-accent ring-2 ring-accent" : "border-border"
  } ${esmaecido ? "opacity-60" : ""}`;
  const corpo = (
    <>
      {capa}
      <div className="flex flex-1 flex-col px-1.5 pt-2 pb-1">
        <div className="flex items-center gap-2">
          <span className="min-w-0 flex-1 truncate text-[11px] font-semibold uppercase tracking-wide text-faint" title={sobretitulo}>
            {sobretitulo}
          </span>
          {selo}
        </div>
        <h3 className="mt-0.5 line-clamp-2 min-h-[2.5em] text-[14px] font-semibold leading-snug text-text group-hover:text-accent" title={nome}>
          {nome}
        </h3>
        <dl className="mt-auto grid grid-cols-3 gap-x-2 border-t border-border pt-2 text-[11px]">
          {metricas.map((m) => (
            <div key={m.rotulo} className="min-w-0">
              <dt className="truncate text-muted">{m.rotulo}</dt>
              <dd className="truncate text-[15px] font-bold tabular-nums" style={{ color: m.cor ?? "var(--text)" }} title={m.valor}>
                {m.valor}
              </dd>
            </div>
          ))}
        </dl>
      </div>
    </>
  );
  return (
    <div className="relative h-full">
      {href ? (
        <Link href={href} onClick={onClick} aria-current={atual ? "page" : undefined} aria-label={ariaLabel} className={classe}>
          {corpo}
        </Link>
      ) : (
        <button type="button" onClick={onClick} aria-label={ariaLabel} className={classe}>
          {corpo}
        </button>
      )}
      {canto}
    </div>
  );
}

/**
 * Card de um QUADRO de tarefas (tela `/painel/tarefas`) — o `CartaoEspaco` com a CAPA do quadro (imagem, degradê ou a
 * superfície com a cor), o grupo, o nome e as contagens (abertas · atrasadas em vermelho · concluídas). Privado = cadeado
 * na capa; `atual` = o aberto agora (o "Mudar de quadros" usa o MESMO card); arquivado = esmaecido com o selo. Clicar abre
 * o quadro. A ESTRELA (fora do link, sobre a capa) marca o FAVORITO.
 */
export function QuadroCard({
  quadro: q,
  href,
  favorito,
  onFavorito,
  atual = false,
  onAbrir,
}: {
  quadro: QuadroCardDados;
  href: string;
  favorito?: boolean;
  onFavorito?: () => void;
  /** O quadro ABERTO agora (o "Mudar de quadros"): contorno accent + ✓ na capa. */
  atual?: boolean;
  /** Ao abrir (antes de navegar — ex.: fechar o painel que o mostra). */
  onAbrir?: () => void;
}) {
  return (
    <CartaoEspaco
      href={href}
      onClick={onAbrir}
      atual={atual}
      esmaecido={q.arquivado}
      ariaLabel={`Abrir o quadro ${q.nome}${q.privado ? " (privado)" : ""}${atual ? " — o atual" : ""}`}
      capa={
        <CapaQuadro quadro={q}>
          {q.privado && (
            <span className="absolute top-1.5 left-1.5 inline-flex items-center gap-1 rounded-full bg-[var(--scrim)] px-2 py-0.5 text-[11px] font-semibold text-white" title="Quadro privado — só você o vê">
              <IconLock className="h-3 w-3" /> Privado
            </span>
          )}
          {atual && (
            <span className="absolute bottom-1.5 left-1.5 inline-flex items-center gap-1 rounded-full bg-accent px-2 py-0.5 text-[11px] font-semibold text-white">
              <IconCheck className="h-3 w-3" /> Atual
            </span>
          )}
        </CapaQuadro>
      }
      sobretitulo={q.grupoNome}
      selo={q.arquivado ? <Badge>Arquivado</Badge> : undefined}
      nome={q.nome}
      metricas={[
        { rotulo: "Abertas", valor: num(q.abertas) },
        { rotulo: "Atrasadas", valor: num(q.atrasadas), cor: q.atrasadas ? "var(--danger)" : "var(--text-2)" },
        { rotulo: "Concluídas", valor: num(q.concluidas), cor: "var(--text-2)" },
      ]}
      canto={
        onFavorito && <EstrelaFavorito ativo={!!favorito} nome={q.nome} onAlternar={onFavorito} className="absolute top-3 right-3 bg-surface/90 shadow-ring backdrop-blur-sm hover:bg-surface lg:top-3.5 lg:right-3.5" />
      }
    />
  );
}

/** Card "+" (a mesma altura dos cards na grade) — cria um quadro novo. */
export function QuadroNovoCard({ onClick, rotulo = "Novo quadro" }: { onClick: () => void; rotulo?: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="group flex h-full min-h-[14rem] w-full flex-col items-center justify-center gap-2 rounded-card border-2 border-dashed border-border-2 bg-surface text-muted transition-colors hover:border-accent/50 hover:text-accent focus:outline-none focus-visible:ring-4 focus-visible:ring-accent/20"
    >
      <span className="grid h-10 w-10 place-items-center rounded-control bg-surface-2 text-accent transition-colors group-hover:bg-accent group-hover:text-white">
        <IconPlus className="h-5 w-5" />
      </span>
      <span className="text-sm font-semibold">{rotulo}</span>
    </button>
  );
}

export type CamposQuadroValor = { nome: string; cor: string; descricao: string };

/**
 * Os CAMPOS de um quadro (nome · cor · descrição) — os mesmos ao criar (card "+") e na aba Configuração (`semNome`: lá o nome
 * é editado no próprio cabeçalho do quadro).
 */
export function CamposQuadro({
  valor,
  onChange,
  disabled = false,
  semNome = false,
}: {
  valor: CamposQuadroValor;
  onChange: (v: CamposQuadroValor) => void;
  disabled?: boolean;
  semNome?: boolean;
}) {
  return (
    <div className="space-y-4">
      {!semNome && <TextField label="Nome" value={valor.nome} maxLength={80} disabled={disabled} onChange={(e) => onChange({ ...valor, nome: e.target.value })} />}
      <TextArea
        label="Descrição"
        rows={3}
        value={valor.descricao}
        maxLength={500}
        disabled={disabled}
        placeholder="Para que serve este quadro (opcional)"
        onChange={(e) => onChange({ ...valor, descricao: e.target.value })}
      />
      {!disabled && <ColorField label="Cor do quadro" value={valor.cor} onChange={(cor) => onChange({ ...valor, cor })} />}
    </div>
  );
}

/** O PERÍODO de um quadro mensal (as listas dos dias): mês · ano · só dias úteis. */
export type PeriodoQuadro = { ano: number; mes: number; diasUteis: boolean };

/** Os CAMPOS do período — os mesmos no "Novo quadro" e no "Listas do mês" do menu do quadro. */
export function CamposPeriodo({ valor, onChange, disabled = false }: { valor: PeriodoQuadro; onChange: (v: PeriodoQuadro) => void; disabled?: boolean }) {
  return (
    <div className="grid grid-cols-2 gap-3">
      <SelectField label="Mês" value={valor.mes} disabled={disabled} onChange={(e) => onChange({ ...valor, mes: Number(e.target.value) })}>
        {MESES.map((m, i) => (
          <option key={m} value={i + 1}>
            {m.charAt(0) + m.slice(1).toLowerCase()}
          </option>
        ))}
      </SelectField>
      <TextField
        label="Ano"
        type="number"
        min={2000}
        max={2100}
        value={valor.ano}
        disabled={disabled}
        onChange={(e) => {
          const ano = Number(e.target.value);
          if (Number.isInteger(ano) && ano >= 2000 && ano <= 2100) onChange({ ...valor, ano });
        }}
      />
      <div className="col-span-2 flex min-h-11 items-center lg:min-h-9">
        <Checkbox label="Só dias úteis (sem fins de semana, feriados e pontos facultativos)" checked={valor.diasUteis} disabled={disabled} onChange={(e) => onChange({ ...valor, diasUteis: e.target.checked })} />
      </div>
    </div>
  );
}
