"use client";

import { useState } from "react";
import type { CatalogoItemRow } from "@/lib/catalogo";
import { Badge } from "./Badge";
import { Button } from "./Button";
import { IconSave } from "./icons";
import { TipoDfdPicker } from "./TipoDfdPicker";

/**
 * Corpo de um `Modal.lateral`: detalhe de UM item do catálogo — todas as infos +
 * os tipos de DFD (editáveis por editor). Mestre-detalhe, no MESMO lugar do painel do
 * catálogo (mesmo padrão do `ItemDetalhe` do DFD). O pai passa `key={item.id}` para o
 * estado reiniciar ao trocar de item. Só componentes/tokens do design-system.
 */
export function CatalogoItemDetalhe({
  item,
  podeEditar,
  salvando = false,
  onSalvarTipos,
}: {
  item: CatalogoItemRow;
  podeEditar: boolean;
  salvando?: boolean;
  onSalvarTipos?: (tipos: string[]) => void;
}) {
  const [tipos, setTipos] = useState<string[]>(item.tipos);
  const mudou = tipos.length !== item.tipos.length || tipos.some((t) => !item.tipos.includes(t));

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="font-mono text-base font-bold text-text">{item.codigoRaw ?? item.codigo}</span>
        {item.sequencial != null && <span className="text-xs text-muted">Item {item.sequencial}</span>}
      </div>

      <dl className="grid gap-x-6 gap-y-3.5 sm:grid-cols-2">
        <Campo label="Código (normalizado)" valor={item.codigo} mono />
        <Campo label="Unidade de medida" valor={item.unidade ?? "—"} />
        <Campo label="Descrição" valor={item.descricao} span />
      </dl>

      <div>
        <p className="mb-2 text-xs text-muted">Tipos de DFD</p>
        {podeEditar ? (
          <div className="space-y-3">
            <TipoDfdPicker value={tipos} onChange={setTipos} disabled={salvando} />
            {mudou && (
              <Button icon={<IconSave className="h-4 w-4" />} loading={salvando} onClick={() => onSalvarTipos?.(tipos)}>
                Salvar tipos
              </Button>
            )}
          </div>
        ) : item.tipos.length > 0 ? (
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
