"use client";

import { useState } from "react";
import type { CatalogoItemRow } from "@/lib/catalogo";
import { Badge } from "./Badge";
import { Button } from "./Button";
import { Callout } from "./Callout";
import { TextArea, TextField } from "./Field";
import { IconAlert, IconClose, IconLayers, IconPlus, IconSave, IconTrash } from "./icons";
import { TipoDfdPicker } from "./TipoDfdPicker";

/**
 * Corpo de um `Modal.lateral`/`Modal`: detalhe de UM item do catálogo. Três modos, um só
 * componente (reuso): **consultar** (não-editor), **editar** (editor — descrição/unidade/
 * tipos; o CÓDIGO é imutável, troca-se excluindo e criando) e **criar** (`modo="criar"` —
 * código editável + demais campos). O EDITOR também pode **excluir** o item. O pai passa
 * `key` p/ o estado reiniciar ao trocar de item/modo. Só componentes/tokens do design-system.
 */
export function CatalogoItemDetalhe({
  item,
  modo = "editar",
  podeEditar,
  salvando = false,
  erro,
  catalogos,
  onSalvar,
  onCriar,
  onExcluir,
  onRemoverCatalogo,
}: {
  item?: CatalogoItemRow;
  modo?: "editar" | "criar";
  podeEditar: boolean;
  salvando?: boolean;
  /** Erro do envio (ex.: código já existe) — exibido no formulário. */
  erro?: string | null;
  /** Catálogos em que o item está (origem + compartilhados) — o mesmo item em vários. */
  catalogos?: { id: number; nome: string; origem: boolean }[];
  onSalvar?: (campos: { descricao: string; unidade: string | null; tipos: string[] }) => void;
  onCriar?: (campos: { codigo: string; descricao: string; unidade: string | null; tipos: string[] }) => void;
  onExcluir?: () => void;
  /** Remove o item de UM catálogo (desfaz o compartilhamento). */
  onRemoverCatalogo?: (catalogoId: number) => void;
}) {
  const criar = modo === "criar";
  const [codigo, setCodigo] = useState(item?.codigo ?? "");
  const [descricao, setDescricao] = useState(item?.descricao ?? "");
  const [unidade, setUnidade] = useState(item?.unidade ?? "");
  const [tipos, setTipos] = useState<string[]>(item?.tipos ?? []);
  const mudou =
    !item ||
    descricao !== item.descricao ||
    (unidade.trim() || null) !== (item.unidade ?? null) ||
    tipos.length !== item.tipos.length ||
    tipos.some((t) => !item.tipos.includes(t));

  // ---- Modo CRIAR ----
  if (criar) {
    return (
      <div className="space-y-[var(--gap-block)]">
        <TextField
          label="Código"
          value={codigo}
          onChange={(e) => setCodigo(e.target.value)}
          disabled={salvando}
          placeholder="Ex.: 5241948381"
          hint="Só os dígitos são gravados. É a chave única global — não pode repetir em nenhum catálogo."
        />
        <TextField label="Unidade de medida" value={unidade} onChange={(e) => setUnidade(e.target.value)} disabled={salvando} placeholder="UNIDADE, KG, CAIXA…" />
        <TextArea label="Descrição" value={descricao} onChange={(e) => setDescricao(e.target.value)} disabled={salvando} rows={5} />
        <div>
          <p className="mb-2 text-[13.5px] font-bold text-text">Tipos de DFD</p>
          <TipoDfdPicker value={tipos} onChange={setTipos} disabled={salvando} />
        </div>
        {erro && (
          <Callout kind="danger" icon={<IconAlert className="h-4 w-4" />}>
            {erro}
          </Callout>
        )}
        <Button
          icon={<IconPlus className="h-4 w-4" />}
          loading={salvando}
          disabled={codigo.replace(/\D/g, "").length === 0 || descricao.trim().length === 0}
          onClick={() => onCriar?.({ codigo, descricao: descricao.trim(), unidade: unidade.trim() || null, tipos })}
        >
          Adicionar item
        </Button>
      </div>
    );
  }

  // ---- Modos EDITAR / CONSULTAR (precisa de um item) ----
  if (!item) return <div />;

  return (
    <div className="space-y-[var(--gap-block)]">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="rounded-chip bg-surface-2 px-2.5 py-1 font-mono text-[13px] font-bold text-text">
          {item.codigoRaw ?? item.codigo}
        </span>
        {item.sequencial != null && <span className="text-xs text-muted">Item {item.sequencial}</span>}
      </div>

      {/* Catálogos em que o item está (o MESMO item pode estar compartilhado em vários). */}
      {catalogos && catalogos.length > 0 && (
        <section className="rounded-card border border-border-2 bg-surface-2 p-3">
          <p className="mb-2 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-faint">
            <IconLayers className="h-3.5 w-3.5" />
            {catalogos.length > 1 ? `Compartilhado em ${catalogos.length} catálogos` : "Catálogo"}
          </p>
          <div className="flex flex-wrap gap-1.5">
            {catalogos.map((c) => (
              <span key={c.id} className="inline-flex items-center gap-1 rounded-chip border border-border bg-surface px-2 py-1 text-[12px] text-text">
                {c.nome}
                {c.origem && <span className="text-[10px] text-faint">(origem)</span>}
                {podeEditar && onRemoverCatalogo && catalogos.length > 1 && (
                  <button
                    type="button"
                    aria-label={`Remover do catálogo ${c.nome}`}
                    title="Remover deste catálogo"
                    className="ml-0.5 grid h-4 w-4 place-items-center rounded-full text-muted transition-colors hover:text-[var(--danger)] disabled:opacity-50"
                    disabled={salvando}
                    onClick={() => onRemoverCatalogo(c.id)}
                  >
                    <IconClose className="h-3 w-3" />
                  </button>
                )}
              </span>
            ))}
          </div>
        </section>
      )}

      {podeEditar ? (
        <>
          <p className="text-[11px] text-faint">O código é a chave global do item e não é editável aqui — para trocá-lo, exclua e crie de novo.</p>
          <TextField label="Unidade de medida" value={unidade} onChange={(e) => setUnidade(e.target.value)} disabled={salvando} placeholder="UNIDADE, KG, CAIXA…" />
          <TextArea label="Descrição" value={descricao} onChange={(e) => setDescricao(e.target.value)} disabled={salvando} rows={5} />
          <div>
            <p className="mb-2 text-[13.5px] font-bold text-text">Tipos de DFD</p>
            <TipoDfdPicker value={tipos} onChange={setTipos} disabled={salvando} />
          </div>
          {erro && (
            <Callout kind="danger" icon={<IconAlert className="h-4 w-4" />}>
              {erro}
            </Callout>
          )}
          <div className="flex flex-wrap items-center gap-2">
            <Button
              icon={<IconSave className="h-4 w-4" />}
              loading={salvando}
              disabled={!mudou || descricao.trim().length === 0}
              onClick={() => onSalvar?.({ descricao: descricao.trim(), unidade: unidade.trim() || null, tipos })}
            >
              Salvar alterações
            </Button>
            {onExcluir && (
              <Button variant="ghost" icon={<IconTrash className="h-4 w-4" style={{ color: "var(--danger)" }} />} disabled={salvando} onClick={onExcluir}>
                Excluir item
              </Button>
            )}
          </div>
        </>
      ) : (
        <>
          <dl className="grid gap-x-6 gap-y-3.5 sm:grid-cols-2">
            <Campo label="Unidade de medida" valor={item.unidade ?? "—"} />
            <Campo label="Código (normalizado)" valor={item.codigo} mono />
            <Campo label="Descrição" valor={item.descricao} span />
          </dl>
          <div>
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-faint">Tipos de DFD</p>
            {item.tipos.length > 0 ? (
              <div className="flex flex-wrap gap-1.5">
                {item.tipos.map((t) => (
                  <Badge key={t} tone="blue">
                    {t}
                  </Badge>
                ))}
              </div>
            ) : (
              <span className="text-sm text-faint">Nenhum tipo definido.</span>
            )}
          </div>
        </>
      )}
    </div>
  );
}

function Campo({ label, valor, span, mono }: { label: string; valor: string; span?: boolean; mono?: boolean }) {
  return (
    <div className={span ? "sm:col-span-2" : ""}>
      <dt className="text-xs text-muted">{label}</dt>
      <dd className={`mt-0.5 break-words font-semibold leading-snug text-text ${mono ? "font-mono text-[13px]" : ""}`}>
        {valor}
      </dd>
    </div>
  );
}
