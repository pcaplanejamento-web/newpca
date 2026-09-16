"use client";

import { useState } from "react";
import type { CatalogoItemRow } from "@/lib/catalogo";
import { Badge } from "./Badge";
import { Button } from "./Button";
import { TextArea, TextField } from "./Field";
import { IconSave } from "./icons";
import { TipoDfdPicker } from "./TipoDfdPicker";

/**
 * Corpo de um `Modal.lateral`/`Modal`: detalhe de UM item do catálogo. Para o EDITOR,
 * permite editar descrição, unidade e tipos de DFD (o CÓDIGO é a chave global e é
 * imutável aqui — troca-se re-subindo o catálogo). Para consulta, mostra os campos +
 * tipos. O pai passa `key={item.id}` p/ o estado reiniciar ao trocar de item. Só
 * componentes/tokens do design-system (mesmo padrão do `ItemDetalhe` do DFD).
 */
export function CatalogoItemDetalhe({
  item,
  podeEditar,
  salvando = false,
  onSalvar,
}: {
  item: CatalogoItemRow;
  podeEditar: boolean;
  salvando?: boolean;
  onSalvar?: (campos: { descricao: string; unidade: string | null; tipos: string[] }) => void;
}) {
  const [descricao, setDescricao] = useState(item.descricao);
  const [unidade, setUnidade] = useState(item.unidade ?? "");
  const [tipos, setTipos] = useState<string[]>(item.tipos);
  const mudou =
    descricao !== item.descricao ||
    (unidade.trim() || null) !== (item.unidade ?? null) ||
    tipos.length !== item.tipos.length ||
    tipos.some((t) => !item.tipos.includes(t));

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="rounded-chip bg-surface-2 px-2.5 py-1 font-mono text-[13px] font-bold text-text">
          {item.codigoRaw ?? item.codigo}
        </span>
        {item.sequencial != null && <span className="text-xs text-muted">Item {item.sequencial}</span>}
      </div>

      {podeEditar ? (
        <>
          <p className="text-[11px] text-faint">O código é a chave global do item e não é editável aqui.</p>
          <TextField
            label="Unidade de medida"
            value={unidade}
            onChange={(e) => setUnidade(e.target.value)}
            disabled={salvando}
            placeholder="UNIDADE, KG, CAIXA…"
          />
          <TextArea label="Descrição" value={descricao} onChange={(e) => setDescricao(e.target.value)} disabled={salvando} rows={5} />
          <div>
            <p className="mb-2 text-[13.5px] font-bold text-text">Tipos de DFD</p>
            <TipoDfdPicker value={tipos} onChange={setTipos} disabled={salvando} />
          </div>
          <Button
            icon={<IconSave className="h-4 w-4" />}
            loading={salvando}
            disabled={!mudou || descricao.trim().length === 0}
            onClick={() => onSalvar?.({ descricao: descricao.trim(), unidade: unidade.trim() || null, tipos })}
          >
            Salvar alterações
          </Button>
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
