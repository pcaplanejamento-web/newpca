"use client";

import { useEffect, useRef, useState } from "react";
import { chamarPadronizacao as chamar } from "@/lib/padronizacao-cliente";
import type { ItemChecklist } from "@/lib/tarefas";
import { progressoChecklist } from "@/lib/tarefas-core";
import { Button } from "./Button";
import { BarraSegmentada } from "./charts/Barras";
import { Checkbox } from "./Field";
import { IconArrowDown, IconArrowUp, IconCheck, IconPencil, IconPlus, IconTrash } from "./icons";
import { toast } from "./Toast";

/** As ações de um checklist — as mesmas no rascunho (tarefa nova) e na tarefa gravada. */
export type AcoesChecklist = {
  itens: ItemChecklist[];
  alternar: (id: number) => void;
  adicionar: (texto: string) => void;
  renomear: (id: number, texto: string) => void;
  remover: (id: number) => void;
  /** Move o item uma posição (−1 = para cima). */
  mover: (id: number, direcao: -1 | 1) => void;
};

/** A lista com o item `id` uma posição acima/abaixo. */
function comMovido(itens: ItemChecklist[], id: number, d: -1 | 1): ItemChecklist[] {
  const i = itens.findIndex((x) => x.id === id);
  const j = i + d;
  if (i < 0 || j < 0 || j >= itens.length) return itens;
  const nova = [...itens];
  [nova[i], nova[j]] = [nova[j], nova[i]];
  return nova;
}

/**
 * O checklist de uma tarefa GRAVADA: OTIMISTA (a tela muda na hora) e SERIALIZADO (cada gravação espera a anterior —
 * dois toques rápidos nunca se atropelam). Um item novo ganha um id provisório (negativo) até o servidor devolver o real;
 * as ações sobre ele esperam na fila e usam o id real. Falhou ⇒ o aviso e o checklist relido do servidor. Ao esvaziar a
 * fila, `onGravou` (o quadro recarrega a contagem do cartão). `inicial` novo (outra leitura) vale quando nada está na fila.
 */
export function useChecklistServidor(base: string | null, inicial: ItemChecklist[] | null, onGravou: () => void): AcoesChecklist | null {
  const [itens, setItens] = useState<ItemChecklist[] | null>(inicial);
  const atual = useRef<ItemChecklist[]>(inicial ?? []);
  const fila = useRef<Promise<void>>(Promise.resolve());
  const pendentes = useRef(0);
  const falhou = useRef(false);
  const reais = useRef(new Map<number, number>());
  const provisorio = useRef(0);

  const geracao = useRef(0);
  const baseAtual = useRef(base);

  // Outra tarefa (outra `base`): começa do zero — a fila da anterior segue gravando, sem mexer nesta.
  // `inicial` novo da MESMA tarefa (outra leitura) só vale com a fila vazia (senão desfaria o que a tela já mostra).
  useEffect(() => {
    if (baseAtual.current !== base) {
      baseAtual.current = base;
      geracao.current++;
      pendentes.current = 0;
      falhou.current = false;
      reais.current.clear();
    } else if (pendentes.current) return;
    atual.current = inicial ?? [];
    setItens(inicial);
  }, [base, inicial]);

  const aplicar = (fn: (l: ItemChecklist[]) => ItemChecklist[]) => {
    atual.current = fn(atual.current);
    setItens(atual.current);
  };
  const real = (id: number) => (id > 0 ? id : (reais.current.get(id) ?? null));

  const enfileirar = (req: () => Promise<void>) => {
    if (!base) return;
    const g = geracao.current;
    pendentes.current++;
    fila.current = fila.current
      .then(req)
      .catch((e) => {
        falhou.current = true;
        toast.error((e as Error).message);
      })
      .finally(async () => {
        // Outra tarefa abriu no meio: o que era desta já foi gravado; nada a sincronizar.
        if (g !== geracao.current || --pendentes.current) return;
        if (falhou.current) {
          falhou.current = false;
          try {
            const j = await chamar<{ checklist: ItemChecklist[] }>(base);
            if (g === geracao.current && !pendentes.current) aplicar(() => j.checklist);
          } catch {
            // Sem rede: fica o que a tela mostra; a próxima abertura relê.
          }
        }
        onGravou();
      });
  };

  if (!base || !itens) return null;
  return {
    itens,
    alternar: (id) => {
      const feito = !atual.current.find((x) => x.id === id)?.feito;
      aplicar((l) => l.map((x) => (x.id === id ? { ...x, feito } : x)));
      enfileirar(async () => {
        const r = real(id);
        if (r) await chamar(`${base}/checklist/${r}`, "PATCH", { feito });
      });
    },
    adicionar: (texto) => {
      const temp = --provisorio.current;
      aplicar((l) => [...l, { id: temp, texto, feito: false, ordem: (l.at(-1)?.ordem ?? 0) + 1 }]);
      enfileirar(async () => {
        const j = await chamar<{ id: number }>(`${base}/checklist`, "POST", { texto });
        reais.current.set(temp, j.id);
        const feito = atual.current.find((x) => x.id === temp)?.feito;
        aplicar((l) => l.map((x) => (x.id === temp ? { ...x, id: j.id } : x)));
        // Marcado antes de o servidor responder: grava a marca também.
        if (feito) await chamar(`${base}/checklist/${j.id}`, "PATCH", { feito: true });
      });
    },
    renomear: (id, texto) => {
      aplicar((l) => l.map((x) => (x.id === id ? { ...x, texto } : x)));
      enfileirar(async () => {
        const r = real(id);
        if (r) await chamar(`${base}/checklist/${r}`, "PATCH", { texto });
      });
    },
    remover: (id) => {
      aplicar((l) => l.filter((x) => x.id !== id));
      enfileirar(async () => {
        const r = real(id);
        if (r) await chamar(`${base}/checklist/${r}`, "DELETE");
      });
    },
    mover: (id, d) => {
      aplicar((l) => comMovido(l, id, d));
      enfileirar(async () => {
        // Os vizinhos de AGORA (a fila pode ter mudado a lista desde o toque).
        const l = atual.current;
        const i = l.findIndex((x) => x.id === id);
        const r = real(id);
        if (i < 0 || !r) return;
        await chamar(`${base}/checklist/${r}`, "PATCH", { anteriorId: l[i - 1] ? real(l[i - 1].id) : null, proximoId: l[i + 1] ? real(l[i + 1].id) : null });
      });
    },
  };
}

/** O checklist do RASCUNHO (tarefa nova): só textos, gravados junto com a tarefa ao criar. */
export function acoesChecklistRascunho(textos: string[], onChange: (v: string[]) => void): AcoesChecklist {
  // No rascunho o id é a posição + 1 (estável enquanto a lista não muda).
  const itens = textos.map((texto, i) => ({ id: i + 1, texto, feito: false, ordem: i + 1 }));
  const idx = (id: number) => id - 1;
  return {
    itens,
    alternar: () => {},
    adicionar: (texto) => onChange([...textos, texto]),
    renomear: (id, texto) => onChange(textos.map((t, i) => (i === idx(id) ? texto : t))),
    remover: (id) => onChange(textos.filter((_, i) => i !== idx(id))),
    mover: (id, d) => onChange(comMovido(itens, id, d).map((x) => x.texto)),
  };
}

/**
 * CHECKLIST de uma tarefa: a barra de progresso (feitos/total), um `Checkbox` por item — tocar na caixa OU no texto
 * marca/desmarca (o que se espera no toque) —, renomear pelo lápis (Enter grava, Esc cancela — UMA gravação só), ↑/↓ (a
 * partir de `sm`) e remover; "Adicionar item" no pé (Enter acrescenta e segue no campo). `rascunho` = tarefa nova (sem
 * marcar — os itens nascem desmarcados). `disabled` = só leitura. As ações vêm de `useChecklistServidor` ou
 * `acoesChecklistRascunho`.
 */
export function ChecklistTarefa({
  acoes,
  rascunho = false,
  disabled = false,
  onRemover,
}: {
  acoes: AcoesChecklist;
  rascunho?: boolean;
  disabled?: boolean;
  /** Confirmação antes de remover (ex.: o aviso do sistema); sem ela, remove direto. */
  onRemover?: (item: ItemChecklist) => Promise<boolean>;
}) {
  const { itens } = acoes;
  const [novo, setNovo] = useState("");
  const [editando, setEditando] = useState<{ id: number; texto: string } | null>(null);
  // O Enter/Esc já resolveram a edição — o blur que vem em seguida (o campo some) não grava de novo.
  const resolvido = useRef(false);
  const { feitos, total } = progressoChecklist(itens);

  const adicionar = () => {
    const t = novo.trim();
    if (!t) return;
    acoes.adicionar(t);
    setNovo("");
  };
  const abrirEdicao = (i: ItemChecklist) => {
    resolvido.current = false;
    setEditando({ id: i.id, texto: i.texto });
  };
  const fecharEdicao = (gravar: boolean) => {
    if (!editando || resolvido.current) return;
    resolvido.current = true;
    const item = itens.find((i) => i.id === editando.id);
    const t = editando.texto.trim();
    if (gravar && item && t && t !== item.texto) acoes.renomear(item.id, t);
    setEditando(null);
  };
  const remover = async (i: ItemChecklist) => {
    if (!onRemover || (await onRemover(i))) acoes.remover(i.id);
  };

  return (
    <div className="space-y-2">
      {total > 0 && !rascunho && (
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
            {rascunho ? (
              <span className="grid h-11 w-6 shrink-0 place-items-center text-[12px] tabular-nums text-faint lg:h-9">{idx + 1}.</span>
            ) : (
              <Checkbox alvo checked={i.feito} disabled={disabled} onChange={() => acoes.alternar(i.id)} label="" aria-label={`Concluir: ${i.texto}`} />
            )}
            {editando?.id === i.id ? (
              <input
                // biome-ignore lint/a11y/noAutofocus: o campo abre pelo lápis — o foco vai para ele.
                autoFocus
                value={editando.texto}
                maxLength={300}
                aria-label="Texto do item"
                onChange={(e) => setEditando({ id: i.id, texto: e.target.value })}
                onBlur={() => fecharEdicao(true)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    fecharEdicao(true);
                  } else if (e.key === "Escape") {
                    e.stopPropagation();
                    fecharEdicao(false);
                  }
                }}
                className="h-11 min-w-0 flex-1 rounded-control border border-accent bg-surface px-2 text-[13px] text-text outline-none ring-4 ring-accent/20 lg:h-9"
              />
            ) : rascunho || disabled ? (
              <span className={`min-w-0 flex-1 truncate text-[13px] ${i.feito ? "text-muted line-through decoration-faint" : "text-text"}`} title={i.texto}>
                {i.texto}
              </span>
            ) : (
              <button
                type="button"
                onClick={() => acoes.alternar(i.id)}
                aria-pressed={i.feito}
                className={`min-h-11 min-w-0 flex-1 truncate text-left text-[13px] lg:min-h-[var(--h-control-sm)] ${i.feito ? "text-muted line-through decoration-faint" : "text-text"}`}
                title={i.texto}
              >
                {i.texto}
              </button>
            )}
            {!disabled && editando?.id !== i.id && (
              <div className="flex shrink-0 gap-0.5">
                <Button variant="ghost" size="xs" aria-label={`Renomear ${i.texto}`} icon={<IconPencil className="h-4 w-4" />} onClick={() => abrirEdicao(i)} />
                <Button
                  variant="ghost"
                  size="xs"
                  className="max-sm:hidden"
                  disabled={idx === 0}
                  aria-label={`Mover ${i.texto} para cima`}
                  icon={<IconArrowUp className="h-4 w-4" />}
                  onClick={() => acoes.mover(i.id, -1)}
                />
                <Button
                  variant="ghost"
                  size="xs"
                  className="max-sm:hidden"
                  disabled={idx === itens.length - 1}
                  aria-label={`Mover ${i.texto} para baixo`}
                  icon={<IconArrowDown className="h-4 w-4" />}
                  onClick={() => acoes.mover(i.id, 1)}
                />
                <Button variant="ghost" size="xs" aria-label={`Remover ${i.texto}`} style={{ color: "var(--danger)" }} icon={<IconTrash className="h-4 w-4" />} onClick={() => remover(i)} />
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
              aria-label="Novo item do checklist"
              placeholder="Adicionar item"
              onChange={(e) => setNovo(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  adicionar();
                }
              }}
              className="h-11 min-w-0 flex-1 bg-transparent text-[13px] text-text outline-none placeholder:text-faint lg:h-9"
            />
            {novo.trim() && <Button size="xs" variant="ghost" aria-label="Adicionar item" icon={<IconCheck className="h-4 w-4" />} onClick={adicionar} />}
          </li>
        )}
      </ul>
      {disabled && !itens.length && <p className="text-[12.5px] text-muted">Sem checklist.</p>}
    </div>
  );
}
