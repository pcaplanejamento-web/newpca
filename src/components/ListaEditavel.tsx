"use client";

import { Button } from "./Button";
import { TextField } from "./Field";
import { IconPlus, IconTrash } from "./icons";

/**
 * Lista editável de textos (controlada) — cada valor é um `TextField` com botão de
 * remover, mais um botão "Adicionar" no fim. Reusa só componentes do DS. Usada, por
 * ex., para cadastrar VÁRIOS responsáveis por DFDs numa repartição.
 */
export function ListaEditavel({
  valores,
  onChange,
  placeholder,
  addLabel = "Adicionar",
  itemAria = "Item",
  disabled = false,
}: {
  valores: string[];
  onChange: (v: string[]) => void;
  placeholder?: string;
  addLabel?: string;
  /** Rótulo acessível base de cada item (ex.: "Responsável"). */
  itemAria?: string;
  disabled?: boolean;
}) {
  const editar = (i: number, v: string) => onChange(valores.map((x, j) => (j === i ? v : x)));
  const remover = (i: number) => onChange(valores.filter((_, j) => j !== i));
  const adicionar = () => onChange([...valores, ""]);

  return (
    <div className="space-y-2">
      {valores.map((v, i) => (
        // Lista controlada (o valor vem sempre das props) — índice como key é seguro aqui.
        <div key={i} className="flex items-center gap-2">
          <div className="min-w-0 flex-1">
            <TextField
              value={v}
              onChange={(e) => editar(i, e.target.value)}
              placeholder={placeholder}
              aria-label={`${itemAria} ${i + 1}`}
              disabled={disabled}
            />
          </div>
          <Button
            variant="ghost"
            aria-label={`Remover ${itemAria.toLowerCase()} ${i + 1}`}
            onClick={() => remover(i)}
            disabled={disabled}
            icon={<IconTrash className="h-4 w-4" />}
            style={{ color: "var(--danger)" }}
          />
        </div>
      ))}
      <Button variant="secondary" onClick={adicionar} disabled={disabled} icon={<IconPlus className="h-[18px] w-[18px]" />}>
        {addLabel}
      </Button>
    </div>
  );
}
