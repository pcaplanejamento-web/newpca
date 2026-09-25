import Link from "next/link";
import { num } from "@/lib/format";
import type { QuadroCard as QuadroCardDados } from "@/lib/tarefas";
import { Badge } from "./Badge";
import { ColorField } from "./ColorField";
import { TextArea, TextField } from "./Field";
import { IconPlus } from "./icons";

/**
 * Card 4:5 de um QUADRO de tarefas (tela `/painel/tarefas`) — a faixa na COR do quadro, o grupo, o nome e as contagens
 * (abertas em destaque; atrasadas em vermelho; concluídas). Arquivado = esmaecido com o selo. Clicar abre o quadro.
 */
export function QuadroCard({ quadro: q, href }: { quadro: QuadroCardDados; href: string }) {
  return (
    <Link
      href={href}
      aria-label={`Abrir o quadro ${q.nome}`}
      className={`group relative flex aspect-[4/5] w-full flex-col overflow-hidden rounded-card border border-border bg-surface p-3 pt-4 text-left shadow-ring transition-colors duration-[var(--motion-duration)] hover:border-accent/50 focus:outline-none focus-visible:ring-4 focus-visible:ring-accent/25 sm:p-4 sm:pt-5 ${
        q.arquivado ? "opacity-60" : ""
      }`}
    >
      <span aria-hidden className="absolute inset-x-0 top-0 h-1.5" style={{ background: q.cor }} />
      <div className="flex items-start justify-between gap-2">
        <span className="min-w-0 truncate text-[11px] font-semibold uppercase tracking-wide text-faint" title={q.grupoNome}>
          {q.grupoNome}
        </span>
        {q.arquivado && <Badge>Arquivado</Badge>}
      </div>
      <h3 className="mt-1 line-clamp-3 text-sm font-semibold leading-snug text-text group-hover:text-accent" title={q.nome}>
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
