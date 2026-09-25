"use client";

import { useState } from "react";
import type { ItemChecklist } from "@/lib/tarefas";
import { progressoChecklist } from "@/lib/tarefas-core";
import { Button } from "./Button";
import { BarraSegmentada } from "./charts/Barras";
import { Checkbox } from "./Field";
import { IconArrowDown, IconArrowUp, IconCheck, IconPencil, IconPlus, IconTrash } from "./icons";

/**
 * CHECKLIST de uma tarefa: a barra de progresso (feitos/total), um `Checkbox` por item — tocar na caixa OU no texto
 * marca/desmarca (o que se espera no toque) —, renomear pelo lápis, ↑/↓ (a partir de `sm`; no celular a linha fica para o
 * texto) e remover; "Adicionar item" no pé (Enter acrescenta e segue no campo). Só apresenta — quem usa
 * grava (cada ação é imediata). `disabled` = só leitura.
 */
export function ChecklistTarefa({
  itens,
  onAlternar,
  onAdicionar,
  onRenomear,
  onRemover,
  onMover,
  disabled = false,
}: {
  itens: ItemChecklist[];
  onAlternar: (item: ItemChecklist) => void;
  onAdicionar: (texto: string) => Promise<boolean>;
  onRenomear: (item: ItemChecklist, texto: string) => void;
  onRemover: (item: ItemChecklist) => void;
  /** Move o item uma posição (−1 = para cima). */
  onMover: (item: ItemChecklist, direcao: -1 | 1) => void;
  disabled?: boolean;
}) {
  const [novo, setNovo] = useState("");
  const [salvando, setSalvando] = useState(false);
  const [editando, setEditando] = useState<{ id: number; texto: string } | null>(null);
  const { feitos, total } = progressoChecklist(itens);

  const adicionar = async () => {
    const t = novo.trim();
    if (!t || salvando) return;
    setSalvando(true);
    if (await onAdicionar(t)) setNovo("");
    setSalvando(false);
  };
  const confirmarEdicao = () => {
    if (!editando) return;
    const item = itens.find((i) => i.id === editando.id);
    const t = editando.texto.trim();
    if (item && t && t !== item.texto) onRenomear(item, t);
    setEditando(null);
  };

  return (
    <div className="space-y-2">
      {total > 0 && (
        <div className="flex items-center gap-2">
          <span className="w-12 shrink-0 text-[12px] font-semibold tabular-nums text-text-2">
            {feitos}/{total}
          </span>
          <div className="flex-1">
            <BarraSegmentada trilho altura={6} max={total} segmentos={[{ chave: "feitos", rotulo: "Feitos", valor: feitos, cor: "var(--ok)" }]} />
          </div>
        </div>
      )}
      <ul className="divide-y divide-border rounded-card border border-border">
        {itens.map((i, idx) => (
          <li key={i.id} className="flex min-h-11 items-center gap-2 px-2 py-1">
            <Checkbox alvo checked={i.feito} disabled={disabled} onChange={() => onAlternar(i)} label="" aria-label={`Concluir: ${i.texto}`} />
            {editando?.id === i.id ? (
              <input
                // biome-ignore lint/a11y/noAutofocus: o campo abre pelo toque no texto — o foco vai para ele.
                autoFocus
                value={editando.texto}
                maxLength={300}
                aria-label="Texto do item"
                onChange={(e) => setEditando({ id: i.id, texto: e.target.value })}
                onBlur={confirmarEdicao}
                onKeyDown={(e) => {
                  if (e.key === "Enter") confirmarEdicao();
                  else if (e.key === "Escape") {
                    e.stopPropagation();
                    setEditando(null);
                  }
                }}
                className="h-11 min-w-0 flex-1 rounded-control border border-accent lg:h-9 bg-surface px-2 text-[13px] text-text outline-none ring-4 ring-accent/20"
              />
            ) : (
              <button
                type="button"
                disabled={disabled}
                onClick={() => onAlternar(i)}
                aria-pressed={i.feito}
                className={`min-h-11 min-w-0 flex-1 truncate text-left lg:min-h-[var(--h-control-sm)] text-[13px] disabled:cursor-default ${i.feito ? "text-muted line-through decoration-faint" : "text-text"}`}
                title={i.texto}
              >
                {i.texto}
              </button>
            )}
            {!disabled && (
              <div className="flex shrink-0 gap-0.5">
                <Button variant="ghost" size="xs" aria-label={`Renomear ${i.texto}`} icon={<IconPencil className="h-4 w-4" />} onClick={() => setEditando({ id: i.id, texto: i.texto })} />
                <Button variant="ghost" size="xs" className="max-sm:hidden" disabled={idx === 0} aria-label={`Mover ${i.texto} para cima`} icon={<IconArrowUp className="h-4 w-4" />} onClick={() => onMover(i, -1)} />
                <Button
                  variant="ghost"
                  size="xs"
                  className="max-sm:hidden"
                  disabled={idx === itens.length - 1}
                  aria-label={`Mover ${i.texto} para baixo`}
                  icon={<IconArrowDown className="h-4 w-4" />}
                  onClick={() => onMover(i, 1)}
                />
                <Button variant="ghost" size="xs" aria-label={`Remover ${i.texto}`} style={{ color: "var(--danger)" }} icon={<IconTrash className="h-4 w-4" />} onClick={() => onRemover(i)} />
              </div>
            )}
          </li>
        ))}
        {!disabled && (
          <li className="flex min-h-11 items-center gap-2 px-2 py-1">
            <IconPlus className="h-4 w-4 shrink-0 text-faint" />
            <input
              value={novo}
              maxLength={300}
              disabled={salvando}
              aria-label="Novo item do checklist"
              placeholder="Adicionar item"
              onChange={(e) => setNovo(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && adicionar()}
              className="h-11 min-w-0 flex-1 bg-transparent lg:h-9 text-[13px] text-text outline-none placeholder:text-faint"
            />
            {novo.trim() && <Button size="xs" variant="ghost" loading={salvando} aria-label="Adicionar item" icon={<IconCheck className="h-4 w-4" />} onClick={adicionar} />}
          </li>
        )}
      </ul>
      {disabled && !itens.length && <p className="text-[12.5px] text-muted">Sem checklist.</p>}
    </div>
  );
}
