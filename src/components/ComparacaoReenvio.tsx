"use client";

import type { ReactNode } from "react";
import type { ComparacaoDfd, DiffCampo, DiffItemDfd } from "@/lib/comparar-protocolo";
import { brl, num } from "@/lib/format";
import { Badge, type Tone } from "./Badge";
import { Button } from "./Button";
import { Callout } from "./Callout";
import { IconAlert, IconCheck, IconClipboard, IconSpinner } from "./icons";
import { Segmented } from "./Segmented";
import { StatMini } from "./StatMini";

/**
 * COMPARAÇÃO do REENVIO de um protocolo (PDF corrigido × protocolo gravado) — componentes do
 * design-system: `DiffLinha` (um campo: gravado → novo), `ComparacaoDfdView` (as diferenças de UM DFD:
 * cabeçalho, seções, assinaturas e itens novo/removido/alterado) e `ComparacaoProtocolo` (o bloco do
 * topo: contagens, diferenças da capa, gravados que não vieram no PDF com Excluir/Manter e o relatório).
 */

const tinta = (cor: string) => ({ background: `color-mix(in srgb, ${cor} 9%, var(--surface))`, borderColor: `color-mix(in srgb, ${cor} 28%, var(--border))` });

/** Uma diferença de campo: o valor GRAVADO e o NOVO lado a lado (empilhados no celular). */
export function DiffLinha({ d }: { d: DiffCampo }) {
  return (
    <div className="rounded-control border border-border p-2.5">
      <p className="text-[11px] font-semibold uppercase tracking-wide text-faint">{d.rotulo}</p>
      <div className="mt-1.5 grid gap-1.5 sm:grid-cols-2">
        <div className="rounded-[8px] border px-2 py-1.5" style={tinta("var(--danger)")}>
          <p className="text-[10px] font-semibold uppercase tracking-wide" style={{ color: "var(--danger)" }}>
            Gravado
          </p>
          <p className="whitespace-pre-wrap break-words text-[12.5px] text-text-2">{d.antes}</p>
        </div>
        <div className="rounded-[8px] border px-2 py-1.5" style={tinta("var(--ok)")}>
          <p className="text-[10px] font-semibold uppercase tracking-wide" style={{ color: "var(--ok)" }}>
            Novo
          </p>
          <p className="whitespace-pre-wrap break-words text-[12.5px] text-text">{d.depois}</p>
        </div>
      </div>
    </div>
  );
}

const TOM_ITEM: Record<DiffItemDfd["tipo"], Tone> = { novo: "emerald", removido: "red", alterado: "amber" };
const ROTULO_ITEM: Record<DiffItemDfd["tipo"], string> = { novo: "Novo", removido: "Removido", alterado: "Alterado" };

function Bloco({ titulo, qtd, children }: { titulo: string; qtd: number; children: ReactNode }) {
  return (
    <section>
      <h4 className="mb-2 text-[12px] font-bold uppercase tracking-wide text-muted">
        {titulo} <span className="text-faint">({num(qtd)})</span>
      </h4>
      <div className="space-y-2">{children}</div>
    </section>
  );
}

/** As DIFERENÇAS de UM DFD em relação ao gravado (painel da direita "Diferenças" no reenvio) + o que foi
 * HERDADO do gravado (o PDF não trazia — transparência). */
export function ComparacaoDfdView({ comparacao, herdados = [] }: { comparacao: ComparacaoDfd | null; herdados?: string[] }) {
  const nota =
    herdados.length > 0 ? (
      <Callout kind="info" icon={<IconCheck className="h-5 w-5" />} className="mb-4">
        Herdado do gravado (o PDF não trazia): {herdados.join(", ")}.
      </Callout>
    ) : null;
  return (
    <>
      {nota}
      <Diferencas comparacao={comparacao} />
    </>
  );
}

function Diferencas({ comparacao }: { comparacao: ComparacaoDfd | null }) {
  if (!comparacao)
    return (
      <Callout kind="info" icon={<IconSpinner className="h-5 w-5" />}>
        Lendo o DFD para comparar…
      </Callout>
    );
  if (comparacao.situacao === "novo")
    return (
      <Callout kind="info" icon={<IconAlert className="h-5 w-5" />}>
        DFD NOVO — não existe no protocolo gravado; será incluído ao sobrescrever.
      </Callout>
    );
  if (comparacao.situacao === "igual")
    return (
      <Callout kind="ok" icon={<IconCheck className="h-5 w-5" />}>
        Sem diferenças em relação ao gravado — ao sobrescrever, fica como está.
      </Callout>
    );
  const c = comparacao;
  return (
    <div className="space-y-5">
      <p className="text-[12.5px] text-muted">
        {num(c.total)} diferença(s) em relação ao DFD gravado. Ao sobrescrever, vale o <strong className="text-text">Novo</strong>{" "}
        (com as suas edições).
      </p>
      {c.campos.length > 0 && (
        <Bloco titulo="Cabeçalho" qtd={c.campos.length}>
          {c.campos.map((d) => (
            <DiffLinha key={d.campo} d={d} />
          ))}
        </Bloco>
      )}
      {c.secoes.length > 0 && (
        <Bloco titulo="Seções" qtd={c.secoes.length}>
          {c.secoes.map((d) => (
            <DiffLinha key={d.campo} d={d} />
          ))}
        </Bloco>
      )}
      {c.assinaturas && (
        <Bloco titulo="Assinaturas" qtd={1}>
          <DiffLinha d={c.assinaturas} />
        </Bloco>
      )}
      {c.itens.length > 0 && (
        <Bloco titulo="Itens" qtd={c.itens.length}>
          {c.itens.map((it, k) => (
            <div key={`${it.tipo}:${it.item}:${it.codigo}:${k}`} className="rounded-control border border-border p-2.5">
              <div className="flex flex-wrap items-center gap-2">
                <Badge tone={TOM_ITEM[it.tipo]}>{ROTULO_ITEM[it.tipo]}</Badge>
                <span className="text-[12.5px] font-semibold text-text">Item {it.item ?? "—"}</span>
                {it.codigo && <span className="font-mono text-[12px] text-muted">{it.codigo}</span>}
              </div>
              {it.descricao && <p className="mt-1 line-clamp-2 text-[12px] text-text-2">{it.descricao}</p>}
              {it.campos.length > 0 && (
                <div className="mt-2 space-y-1.5">
                  {it.campos.map((d) => (
                    <DiffLinha key={d.campo} d={d} />
                  ))}
                </div>
              )}
            </div>
          ))}
        </Bloco>
      )}
    </div>
  );
}

/** DFD gravado que NÃO veio no PDF — o usuário decide: excluir (padrão da sobrescrita) ou manter. */
export type RemovidoReenvio = { id: number; numero: string; planejamento: string | null; valorTotal: number | null; excluir: boolean };

/**
 * Bloco do TOPO do banner no REENVIO: contagens (novos / alterados / sem diferença / fora do PDF), as
 * diferenças da CAPA, os DFDs gravados que não vieram no PDF (Excluir/Manter, um a um ou todos) e o
 * "Relatório de diferenças" (copiável).
 */
export function ComparacaoProtocolo({
  contagem,
  capa,
  removidos,
  onRemovidoChange,
  onTodosRemovidos,
  onRelatorio,
  bloqueado = false,
}: {
  contagem: { novos: number; alterados: number; iguais: number; analisando: number };
  capa: DiffCampo[];
  removidos: RemovidoReenvio[];
  onRemovidoChange: (id: number, excluir: boolean) => void;
  onTodosRemovidos: (excluir: boolean) => void;
  onRelatorio: () => void;
  bloqueado?: boolean;
}) {
  const excluir = removidos.filter((r) => r.excluir).length;
  return (
    <section className="rounded-card border p-4" style={tinta("var(--info)")}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="flex items-center gap-2 text-sm font-bold text-text">
          <IconClipboard className="h-4 w-4" style={{ color: "var(--info)" }} /> Reenvio — comparação com o protocolo gravado
        </h3>
        <Button variant="secondary" onClick={onRelatorio}>
          Relatório de diferenças
        </Button>
      </div>
      <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
        <StatMini label="Novos" value={num(contagem.novos)} />
        <StatMini label="Alterados" value={num(contagem.alterados)} tone={contagem.alterados > 0 ? "warn" : "default"} />
        <StatMini label="Sem diferença" value={num(contagem.iguais)} hint={contagem.analisando > 0 ? `${num(contagem.analisando)} em análise` : undefined} />
        <StatMini label="Fora do PDF" value={num(removidos.length)} tone={excluir > 0 ? "danger" : "default"} />
      </div>
      <p className="mt-3 text-[12px] text-muted">
        Só é regravado o que mudou (os DFDs "sem diferença" ficam como estão). Abra um DFD e use "Diferenças" para ver campo a campo;
        edite o que precisar antes de sobrescrever.
      </p>

      <div className="mt-3">
        <h4 className="mb-2 text-[12px] font-bold uppercase tracking-wide text-muted">Capa</h4>
        {capa.length === 0 ? (
          <p className="text-[12.5px] text-muted">Sem diferenças na capa.</p>
        ) : (
          <div className="space-y-2">
            {capa.map((d) => (
              <DiffLinha key={d.campo} d={d} />
            ))}
          </div>
        )}
      </div>

      {removidos.length > 0 && (
        <div className="mt-4">
          <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
            <h4 className="text-[12px] font-bold uppercase tracking-wide text-muted">DFDs gravados que não vieram no PDF ({num(removidos.length)})</h4>
            <div className="flex gap-2">
              <Button variant="ghost" onClick={() => onTodosRemovidos(true)} disabled={bloqueado}>
                Excluir todos
              </Button>
              <Button variant="ghost" onClick={() => onTodosRemovidos(false)} disabled={bloqueado}>
                Manter todos
              </Button>
            </div>
          </div>
          <ul className="space-y-2">
            {removidos.map((r) => (
              <li key={r.id} className="flex flex-wrap items-center justify-between gap-2 rounded-control border border-border bg-surface px-3 py-2">
                <span className="text-[13px] text-text">
                  <span className="font-mono font-semibold">DFD {r.numero}</span>
                  {r.planejamento ? <span className="text-muted"> · Planej. {r.planejamento}</span> : null}
                  <span className="text-muted"> · {brl(r.valorTotal ?? 0)}</span>
                </span>
                <Segmented<"excluir" | "manter">
                  value={r.excluir ? "excluir" : "manter"}
                  disabled={bloqueado}
                  options={[
                    { value: "excluir", label: "Excluir" },
                    { value: "manter", label: "Manter" },
                  ]}
                  onChange={(v) => onRemovidoChange(r.id, v === "excluir")}
                />
              </li>
            ))}
          </ul>
          {excluir > 0 && (
            <p className="mt-2 text-[12px]" style={{ color: "var(--danger)" }}>
              {num(excluir)} DFD(s) gravado(s) serão EXCLUÍDOS ao sobrescrever (com os itens).
            </p>
          )}
        </div>
      )}
    </section>
  );
}
