import Link from "next/link";
import { lerAjusteFundo, urlFundoCss } from "@/lib/imagem-fundo-core";
import { num } from "@/lib/format";
import type { QuadroCard as QuadroCardDados } from "@/lib/tarefas";
import { Badge } from "./Badge";
import { ColorField } from "./ColorField";
import { EstrelaFavorito } from "./FavoritosQuadros";
import { Checkbox, SelectField, TextArea, TextField } from "./Field";
import { MESES } from "@/lib/normalize";
import { IconPlus } from "./icons";

/**
 * Card 4:5 de um QUADRO de tarefas (tela `/painel/tarefas`) — a faixa na COR do quadro, o grupo, o nome e as contagens
 * (abertas em destaque; atrasadas em vermelho; concluídas). Arquivado = esmaecido com o selo. Clicar abre o quadro. A
 * ESTRELA (fora do link, por cima do canto) marca o quadro como FAVORITO.
 */
export function QuadroCard({ quadro: q, href, favorito, onFavorito }: { quadro: QuadroCardDados; href: string; favorito?: boolean; onFavorito?: () => void }) {
  return (
    <div className="relative">
    <Link
      href={href}
      aria-label={`Abrir o quadro ${q.nome}`}
      className={`group relative flex aspect-[4/5] w-full flex-col overflow-hidden rounded-card border border-border bg-surface p-3 text-left shadow-ring transition-colors duration-[var(--motion-duration)] hover:border-accent/50 focus:outline-none focus-visible:ring-4 focus-visible:ring-accent/25 sm:p-4 ${q.fundoUrl ? "pt-12 sm:pt-14" : "pt-4 sm:pt-5"} ${
        q.arquivado ? "opacity-60" : ""
      }`}
    >
      {/* A FAIXA na cor do quadro — com imagem de fundo, a imagem (a cor por baixo, se ela não carregar). */}
      <span
        aria-hidden
        className={`absolute inset-x-0 top-0 ${q.fundoUrl ? "h-9 border-b-4 sm:h-10" : "h-1.5"}`}
        style={
          q.fundoUrl
            ? (() => {
                const a = lerAjusteFundo(q.fundoAjuste);
                return { background: `${urlFundoCss(q.fundoUrl)} ${a.x}% ${a.y}% / cover no-repeat, ${q.cor}`, borderColor: q.cor };
              })()
            : { background: q.cor }
        }
      />
      <div className="flex items-start justify-between gap-2">
        <span className="min-w-0 truncate text-[11px] font-semibold uppercase tracking-wide text-faint" title={q.grupoNome}>
          {q.grupoNome}
        </span>
        {q.arquivado && <Badge>Arquivado</Badge>}
        {onFavorito && <span aria-hidden className="h-8 w-8 shrink-0" />}
      </div>
      <h3 className={`mt-1 line-clamp-3 text-sm ${onFavorito ? "pr-6 lg:pr-0" : ""} font-semibold leading-snug text-text group-hover:text-accent`} title={q.nome}>
        {q.nome}
      </h3>
      <div className="mt-auto">
        <p className="text-[11px] text-muted">Abertas</p>
        <p className="text-2xl font-bold tabular-nums tracking-tight text-text">{num(q.abertas)}</p>
        <dl className="mt-2 grid grid-cols-2 gap-x-2 border-t border-border pt-2 text-[11px]">
          <div className="min-w-0">
            <dt className="text-muted">Atrasadas</dt>
            <dd className="font-semibold tabular-nums" style={{ color: q.atrasadas ? "var(--danger)" : "var(--text-2)" }}>
              {num(q.atrasadas)}
            </dd>
          </div>
          <div className="min-w-0 text-right">
            <dt className="text-muted">Concluídas</dt>
            <dd className="font-semibold tabular-nums text-text-2">{num(q.concluidas)}</dd>
          </div>
        </dl>
      </div>
    </Link>
    {onFavorito && <EstrelaFavorito ativo={!!favorito} nome={q.nome} onAlternar={onFavorito} className="absolute top-1.5 right-1.5 lg:top-3 lg:right-2" />}
    </div>
  );
}

/** Card "+" no MESMO formato 4:5 — cria um quadro novo. */
export function QuadroNovoCard({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="group flex aspect-[4/5] w-full flex-col items-center justify-center gap-2 rounded-card border-2 border-dashed border-border-2 bg-surface text-muted transition-colors hover:border-accent/50 hover:text-accent focus:outline-none focus-visible:ring-4 focus-visible:ring-accent/20"
    >
      <span className="grid h-10 w-10 place-items-center rounded-control bg-surface-2 text-accent transition-colors group-hover:bg-accent group-hover:text-white">
        <IconPlus className="h-5 w-5" />
      </span>
      <span className="text-sm font-semibold">Novo quadro</span>
    </button>
  );
}

export type CamposQuadroValor = { nome: string; cor: string; descricao: string };

/** Os CAMPOS de um quadro (nome · cor · descrição) — os mesmos ao criar (card "+") e na aba Configuração. */
export function CamposQuadro({
  valor,
  onChange,
  disabled = false,
}: {
  valor: CamposQuadroValor;
  onChange: (v: CamposQuadroValor) => void;
  disabled?: boolean;
}) {
  return (
    <div className="space-y-4">
      <TextField label="Nome" value={valor.nome} maxLength={80} disabled={disabled} onChange={(e) => onChange({ ...valor, nome: e.target.value })} />
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

/** Os CAMPOS do período — os mesmos no "Novo quadro" e no "Listas do mês" da Configuração. */
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
