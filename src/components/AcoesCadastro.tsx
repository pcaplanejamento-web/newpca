"use client";

import { Button } from "./Button";
import { IconArrowDown, IconArrowUp, IconPencil, IconTrash } from "./icons";

/**
 * Ações de uma linha de CADASTRO ordenável — ↑/↓ (a ordem da lista), editar e excluir —, as MESMAS nos cadastros do
 * Catálogo (unidades de medida, classificações). Botões de linha (`size="xs"`: cabem na linha no desktop, 44px no
 * celular); `nome` compõe os nomes acessíveis ("Editar UN").
 */
export function AcoesCadastro({
  nome,
  primeira,
  ultima,
  disabled = false,
  onMover,
  onEditar,
  onExcluir,
}: {
  nome: string;
  primeira: boolean;
  ultima: boolean;
  disabled?: boolean;
  onMover: (direcao: -1 | 1) => void;
  onEditar: () => void;
  onExcluir: () => void;
}) {
  return (
    <div className="flex justify-end gap-1">
      <Button variant="ghost" size="xs" onClick={() => onMover(-1)} disabled={disabled || primeira} aria-label={`Mover ${nome} para cima`} icon={<IconArrowUp className="h-4 w-4" />} />
      <Button variant="ghost" size="xs" onClick={() => onMover(1)} disabled={disabled || ultima} aria-label={`Mover ${nome} para baixo`} icon={<IconArrowDown className="h-4 w-4" />} />
      <Button variant="ghost" size="xs" onClick={onEditar} disabled={disabled} aria-label={`Editar ${nome}`} icon={<IconPencil className="h-4 w-4" />} />
      <Button
        variant="ghost"
        size="xs"
        onClick={onExcluir}
        disabled={disabled}
        aria-label={`Excluir ${nome}`}
        style={{ color: "var(--danger)" }}
        icon={<IconTrash className="h-4 w-4" />}
      />
    </div>
  );
}
