"use client";

import { useEffect, useRef, useState } from "react";
import { chamarPadronizacao as chamar } from "@/lib/padronizacao-cliente";
import { nomeExibicao, type Pessoa } from "@/lib/pessoa";
import type { ChecklistNomeado, ItemChecklist } from "@/lib/tarefas";
import { COR_ESTADO_PRAZO, estadoPrazo, progressoChecklist, rotuloData } from "@/lib/tarefas-core";
import { Avatar } from "./Avatar";
import { Button } from "./Button";
import { BarraSegmentada } from "./charts/Barras";
import { Dropdown } from "./Dropdown";
import { Checkbox } from "./Field";
import { IconArrowDown, IconArrowUp, IconCheck, IconChecklist, IconClock, IconMais, IconPencil, IconPlus, IconTrash } from "./icons";
import { toast } from "./Toast";
import { Selecao } from "./Selecao";

/** O que o item aceita mudar além de texto/marca: o PRAZO e o RESPONSÁVEL próprios. */
export type PatchItem = { prazo?: string | null; responsavelId?: number | null };

/** As ações dos checklists — as mesmas no rascunho (tarefa nova) e na tarefa gravada. */
export type AcoesChecklist = {
  checklists: ChecklistNomeado[];
  itens: ItemChecklist[];
  alternar: (id: number) => void;
  adicionar: (texto: string, checklistId: number) => void;
  renomear: (id: number, texto: string) => void;
  remover: (id: number) => void;
  /** Move o item uma posição DENTRO do checklist dele (−1 = para cima). */
  mover: (id: number, direcao: -1 | 1) => void;
  editarItem: (id: number, patch: PatchItem) => void;
  criarChecklist: (nome: string) => void;
  renomearChecklist: (id: number, nome: string) => void;
  removerChecklist: (id: number) => void;
};

/** O conteúdo gravado: os checklists e os itens (de todos). */
export type ChecklistsGravados = { checklists: ChecklistNomeado[]; itens: ItemChecklist[] };

/** Os itens com o item `id` uma posição acima/abaixo DENTRO do checklist dele. */
function comMovido(itens: ItemChecklist[], id: number, d: -1 | 1): ItemChecklist[] {
  const it = itens.find((x) => x.id === id);
  if (!it) return itens;
  const doMesmo = itens.filter((x) => x.checklistId === it.checklistId);
  const i = doMesmo.findIndex((x) => x.id === id);
  const outro = doMesmo[i + d];
  if (!outro) return itens;
  return itens.map((x) => (x.id === id ? outro : x.id === outro.id ? it : x));
}

/**
 * Os checklists de uma tarefa GRAVADA: OTIMISTA (a tela muda na hora) e SERIALIZADO (cada gravação espera a anterior —
 * dois toques rápidos nunca se atropelam). Item e checklist novos ganham um id provisório (negativo) até o servidor
 * devolver o real; as ações sobre eles esperam na fila e usam o id real. Falhou ⇒ o aviso e tudo relido do servidor. Ao
 * esvaziar a fila, `onGravou` (o quadro recarrega a contagem do cartão). `inicial` novo (outra leitura) vale quando nada
 * está na fila.
 */
export function useChecklistServidor(base: string | null, inicial: ChecklistsGravados | null, onGravou: () => void): AcoesChecklist | null {
  const [estado, setEstado] = useState<ChecklistsGravados | null>(inicial);
  const atual = useRef<ChecklistsGravados>(inicial ?? { checklists: [], itens: [] });
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
    atual.current = inicial ?? { checklists: [], itens: [] };
    setEstado(inicial);
  }, [base, inicial]);

  const aplicar = (fn: (e: ChecklistsGravados) => ChecklistsGravados) => {
    atual.current = fn(atual.current);
    setEstado(atual.current);
  };
  const itens = (fn: (l: ItemChecklist[]) => ItemChecklist[]) => aplicar((e) => ({ ...e, itens: fn(e.itens) }));
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
            const j = await chamar<{ checklists: ChecklistNomeado[]; checklist: ItemChecklist[] }>(base);
            if (g === geracao.current && !pendentes.current) aplicar(() => ({ checklists: j.checklists, itens: j.checklist }));
          } catch {
            // Sem rede: fica o que a tela mostra; a próxima abertura relê.
          }
        }
        onGravou();
      });
  };
  /** Troca o id provisório pelo real em tudo o que a tela mostra. */
  const trocarId = (temp: number, id: number, doChecklist: boolean) =>
    aplicar((e) =>
      doChecklist
        ? { checklists: e.checklists.map((c) => (c.id === temp ? { ...c, id } : c)), itens: e.itens.map((i) => (i.checklistId === temp ? { ...i, checklistId: id } : i)) }
        : { ...e, itens: e.itens.map((i) => (i.id === temp ? { ...i, id } : i)) },
    );

  if (!base || !estado) return null;
  return {
    ...estado,
    alternar: (id) => {
      const feito = !atual.current.itens.find((x) => x.id === id)?.feito;
      itens((l) => l.map((x) => (x.id === id ? { ...x, feito } : x)));
      enfileirar(async () => {
        const r = real(id);
        if (r) await chamar(`${base}/checklist/${r}`, "PATCH", { feito });
      });
    },
    adicionar: (texto, checklistId) => {
      const temp = --provisorio.current;
      const doChecklist = atual.current.itens.filter((x) => x.checklistId === checklistId);
      itens((l) => [...l, { id: temp, checklistId, texto, feito: false, ordem: (doChecklist.at(-1)?.ordem ?? 0) + 1, prazo: null, responsavelId: null }]);
      enfileirar(async () => {
        const j = await chamar<{ id: number }>(`${base}/checklist`, "POST", { texto, checklistId: real(checklistId) ?? undefined });
        reais.current.set(temp, j.id);
        const agora = atual.current.itens.find((x) => x.id === temp);
        trocarId(temp, j.id, false);
        // Marcado ou com prazo/responsável antes de o servidor responder: grava também.
        if (agora?.feito || agora?.prazo || agora?.responsavelId)
          await chamar(`${base}/checklist/${j.id}`, "PATCH", { ...(agora.feito ? { feito: true } : {}), ...(agora.prazo ? { prazo: agora.prazo } : {}), ...(agora.responsavelId ? { responsavelId: agora.responsavelId } : {}) });
      });
    },
    renomear: (id, texto) => {
      itens((l) => l.map((x) => (x.id === id ? { ...x, texto } : x)));
      enfileirar(async () => {
        const r = real(id);
        if (r) await chamar(`${base}/checklist/${r}`, "PATCH", { texto });
      });
    },
    remover: (id) => {
      itens((l) => l.filter((x) => x.id !== id));
      enfileirar(async () => {
        const r = real(id);
        if (r) await chamar(`${base}/checklist/${r}`, "DELETE");
      });
    },
    mover: (id, d) => {
      itens((l) => comMovido(l, id, d));
      enfileirar(async () => {
        // Os vizinhos de AGORA dentro do checklist (a fila pode ter mudado a lista desde o toque).
        const it = atual.current.itens.find((x) => x.id === id);
        const l = atual.current.itens.filter((x) => x.checklistId === it?.checklistId);
        const i = l.findIndex((x) => x.id === id);
        const r = real(id);
        if (i < 0 || !r) return;
        await chamar(`${base}/checklist/${r}`, "PATCH", { anteriorId: l[i - 1] ? real(l[i - 1].id) : null, proximoId: l[i + 1] ? real(l[i + 1].id) : null });
      });
    },
    editarItem: (id, patch) => {
      itens((l) => l.map((x) => (x.id === id ? { ...x, ...patch } : x)));
      enfileirar(async () => {
        const r = real(id);
        if (r) await chamar(`${base}/checklist/${r}`, "PATCH", patch);
      });
    },
    criarChecklist: (nome) => {
      const temp = --provisorio.current;
      aplicar((e) => ({ ...e, checklists: [...e.checklists, { id: temp, nome, ordem: (e.checklists.at(-1)?.ordem ?? 0) + 1 }] }));
      enfileirar(async () => {
        const j = await chamar<{ id: number }>(`${base}/checklists`, "POST", { nome });
        reais.current.set(temp, j.id);
        trocarId(temp, j.id, true);
      });
    },
    renomearChecklist: (id, nome) => {
      aplicar((e) => ({ ...e, checklists: e.checklists.map((c) => (c.id === id ? { ...c, nome } : c)) }));
      enfileirar(async () => {
        const r = real(id);
        if (r) await chamar(`/api/tarefas/checklists/${r}`, "PATCH", { nome });
      });
    },
    removerChecklist: (id) => {
      aplicar((e) => ({ checklists: e.checklists.filter((c) => c.id !== id), itens: e.itens.filter((i) => i.checklistId !== id) }));
      enfileirar(async () => {
        const r = real(id);
        if (r) await chamar(`/api/tarefas/checklists/${r}`, "DELETE");
      });
    },
  };
}

/** Um checklist do RASCUNHO (tarefa nova): o nome e os textos — gravados junto com a tarefa ao criar. */
export type ChecklistRascunho = { nome: string; itens: string[] };

/** As ações do RASCUNHO. Ids sintéticos estáveis enquanto a lista não muda: checklist = posição + 1; item = checklist × 1000 + posição + 1. */
export function acoesChecklistRascunho(valor: ChecklistRascunho[], onChange: (v: ChecklistRascunho[]) => void): AcoesChecklist {
  const checklists = valor.map((c, k) => ({ id: k + 1, nome: c.nome, ordem: k + 1 }));
  const itens: ItemChecklist[] = valor.flatMap((c, k) => c.itens.map((texto, i) => ({ id: (k + 1) * 1000 + i + 1, checklistId: k + 1, texto, feito: false, ordem: i + 1, prazo: null, responsavelId: null })));
  const pos = (id: number) => ({ k: Math.floor(id / 1000) - 1, i: (id % 1000) - 1 });
  const comItens = (k: number, fn: (l: string[]) => string[]) => onChange(valor.map((c, x) => (x === k ? { ...c, itens: fn(c.itens) } : c)));
  return {
    checklists,
    itens,
    alternar: () => {},
    adicionar: (texto, checklistId) => comItens(checklistId - 1, (l) => [...l, texto]),
    renomear: (id, texto) => {
      const { k, i } = pos(id);
      comItens(k, (l) => l.map((t, x) => (x === i ? texto : t)));
    },
    remover: (id) => {
      const { k, i } = pos(id);
      comItens(k, (l) => l.filter((_, x) => x !== i));
    },
    mover: (id, d) => {
      const { k, i } = pos(id);
      comItens(k, (l) => {
        const j = i + d;
        if (j < 0 || j >= l.length) return l;
        const n = [...l];
        [n[i], n[j]] = [n[j], n[i]];
        return n;
      });
    },
    editarItem: () => {},
    criarChecklist: (nome) => onChange([...valor, { nome, itens: [] }]),
    renomearChecklist: (id, nome) => onChange(valor.map((c, x) => (x === id - 1 ? { ...c, nome } : c))),
    removerChecklist: (id) => onChange(valor.filter((_, x) => x !== id - 1)),
  };
}

/** Os checklists com os itens MARCADOS escondidos (preferência do aparelho). */
const CHAVE_OCULTOS = "tarefas:checklists-ocultos";
function useOcultarMarcados() {
  const [ocultos, setOcultos] = useState<Set<number>>(() => new Set());
  useEffect(() => {
    try {
      const v = JSON.parse(localStorage.getItem(CHAVE_OCULTOS) ?? "[]");
      if (Array.isArray(v)) setOcultos(new Set(v.filter((x): x is number => typeof x === "number").slice(-500)));
    } catch {
      /* sem armazenamento: tudo à vista */
    }
  }, []);
  const alternar = (id: number) =>
    setOcultos((o) => {
      const n = new Set(o);
      if (!n.delete(id)) n.add(id);
      try {
        localStorage.setItem(CHAVE_OCULTOS, JSON.stringify([...n]));
      } catch {
        /* vale só nesta visita */
      }
      return n;
    });
  return { oculto: (id: number) => ocultos.has(id), alternar };
}

/**
 * Os CHECKLISTS de uma tarefa (o padrão do Trello): cada um com NOME (lápis), barra de progresso em %, "Ocultar itens
 * marcados" (lembrado no aparelho) e Excluir (confirma); cada item com a marca — tocar na caixa OU no texto —, renomear
 * pelo lápis (Enter grava, Esc cancela — UMA gravação só), ↑/↓ (a partir de `sm`), o PRAZO e o RESPONSÁVEL próprios
 * (menu "…" — também "Converter em tarefa" e Excluir) e "Adicionar item" no pé. No fim, "Adicionar checklist".
 * `rascunho` = tarefa nova (itens sem marca, prazo nem responsável). `disabled` = só leitura.
 */
export function ChecklistTarefa({
  acoes,
  pessoas = [],
  hoje,
  rascunho = false,
  disabled = false,
  onRemover,
  onRemoverChecklist,
  onConverter,
}: {
  acoes: AcoesChecklist;
  /** As pessoas do grupo (responsável do item). */
  pessoas?: Pessoa[];
  hoje: string;
  rascunho?: boolean;
  disabled?: boolean;
  /** Confirmação antes de remover um item; sem ela, remove direto. */
  onRemover?: (item: ItemChecklist) => Promise<boolean>;
  /** Confirmação antes de excluir um checklist com itens. */
  onRemoverChecklist?: (c: ChecklistNomeado, itens: number) => Promise<boolean>;
  /** Converte o item numa TAREFA (só na tarefa gravada). */
  onConverter?: (item: ItemChecklist) => void;
}) {
  const [novoChecklist, setNovoChecklist] = useState<string | null>(null);
  const ocultar = useOcultarMarcados();
  const criar = () => {
    const n = novoChecklist?.trim();
    if (n) acoes.criarChecklist(n);
    setNovoChecklist(null);
  };
  return (
    <div className="space-y-5">
      {acoes.checklists.map((c) => (
        <UmChecklist
          key={c.id}
          checklist={c}
          acoes={acoes}
          pessoas={pessoas}
          hoje={hoje}
          rascunho={rascunho}
          disabled={disabled}
          ocultarMarcados={!rascunho && ocultar.oculto(c.id)}
          onOcultar={() => ocultar.alternar(c.id)}
          onRemover={onRemover}
          onRemoverChecklist={onRemoverChecklist}
          onConverter={onConverter}
        />
      ))}
      {disabled && !acoes.checklists.length && <p className="text-[12.5px] text-muted">Sem checklist.</p>}
      {!disabled &&
        (novoChecklist == null ? (
          <Button size="sm" variant="secondary" icon={<IconPlus className="h-4 w-4" />} onClick={() => setNovoChecklist(acoes.checklists.length ? "" : "Checklist")}>
            Adicionar checklist
          </Button>
        ) : (
          <div className="flex flex-wrap items-center gap-2">
            <input
              // biome-ignore lint/a11y/noAutofocus: o campo abre pelo botão — o foco vai para ele.
              autoFocus
              value={novoChecklist}
              maxLength={80}
              aria-label="Nome do checklist"
              placeholder="Nome do checklist (ex.: SERVIDORES COM FALTA)"
              onChange={(e) => setNovoChecklist(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  criar();
                } else if (e.key === "Escape") {
                  e.stopPropagation();
                  setNovoChecklist(null);
                }
              }}
              className="h-11 min-w-0 flex-1 rounded-control border border-accent bg-surface px-3 text-[13px] text-text outline-none ring-4 ring-accent/20 lg:h-[var(--h-control-sm)]"
            />
            <Button size="sm" disabled={!novoChecklist.trim()} onClick={criar}>
              Adicionar
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setNovoChecklist(null)}>
              Cancelar
            </Button>
          </div>
        ))}
    </div>
  );
}

/** UM checklist nomeado (cabeçalho + barra + itens + "Adicionar item"). */
function UmChecklist({
  checklist: c,
  acoes,
  pessoas,
  hoje,
  rascunho,
  disabled,
  ocultarMarcados,
  onOcultar,
  onRemover,
  onRemoverChecklist,
  onConverter,
}: {
  checklist: ChecklistNomeado;
  acoes: AcoesChecklist;
  pessoas: Pessoa[];
  hoje: string;
  rascunho: boolean;
  disabled: boolean;
  ocultarMarcados: boolean;
  onOcultar: () => void;
  onRemover?: (item: ItemChecklist) => Promise<boolean>;
  onRemoverChecklist?: (c: ChecklistNomeado, itens: number) => Promise<boolean>;
  onConverter?: (item: ItemChecklist) => void;
}) {
  const todos = acoes.itens.filter((i) => i.checklistId === c.id);
  const itens = ocultarMarcados ? todos.filter((i) => !i.feito) : todos;
  const [novo, setNovo] = useState("");
  const [editando, setEditando] = useState<{ id: number; texto: string } | null>(null);
  const [nome, setNome] = useState<string | null>(null);
  // O Enter/Esc já resolveram a edição — o blur que vem em seguida (o campo some) não grava de novo.
  const resolvido = useRef(false);
  const { feitos, total } = progressoChecklist(todos);
  const pct = total ? Math.round((feitos / total) * 100) : 0;
  const porId = new Map(pessoas.map((p) => [p.id, p]));

  const adicionar = () => {
    const t = novo.trim();
    if (!t) return;
    acoes.adicionar(t, c.id);
    setNovo("");
  };
  const fecharEdicao = (gravar: boolean) => {
    if (!editando || resolvido.current) return;
    resolvido.current = true;
    const item = todos.find((i) => i.id === editando.id);
    const t = editando.texto.trim();
    if (gravar && item && t && t !== item.texto) acoes.renomear(item.id, t);
    setEditando(null);
  };
  const fecharNome = (gravar: boolean) => {
    if (nome == null || resolvido.current) return;
    resolvido.current = true;
    const n = nome.trim();
    if (gravar && n && n !== c.nome) acoes.renomearChecklist(c.id, n);
    setNome(null);
  };
  const remover = async (i: ItemChecklist) => {
    if (!onRemover || (await onRemover(i))) acoes.remover(i.id);
  };
  const excluir = async () => {
    if (!todos.length || !onRemoverChecklist || (await onRemoverChecklist(c, todos.length))) acoes.removerChecklist(c.id);
  };

  return (
    <section className="space-y-2" aria-label={`Checklist ${c.nome}`}>
      <div className="flex min-h-11 items-center gap-2 lg:min-h-[var(--h-control-sm)]">
        <IconChecklist className="h-4 w-4 shrink-0 text-muted" />
        {nome != null ? (
          <input
            // biome-ignore lint/a11y/noAutofocus: o campo abre pelo lápis — o foco vai para ele.
            autoFocus
            value={nome}
            maxLength={80}
            aria-label="Nome do checklist"
            onChange={(e) => setNome(e.target.value)}
            onBlur={() => fecharNome(true)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                fecharNome(true);
              } else if (e.key === "Escape") {
                e.stopPropagation();
                fecharNome(false);
              }
            }}
            className="h-11 min-w-0 flex-1 rounded-control border border-accent bg-surface px-2 text-[13.5px] font-bold text-text outline-none ring-4 ring-accent/20 lg:h-9"
          />
        ) : (
          <h4 className="min-w-0 flex-1 truncate text-[13.5px] font-bold text-text" title={c.nome}>
            {c.nome}
          </h4>
        )}
        {!disabled && nome == null && (
          <div className="flex shrink-0 flex-wrap justify-end gap-1">
            <Button
              variant="ghost"
              size="xs"
              aria-label={`Renomear o checklist ${c.nome}`}
              icon={<IconPencil className="h-4 w-4" />}
              onClick={() => {
                resolvido.current = false;
                setNome(c.nome);
              }}
            />
            {!rascunho && feitos > 0 && (
              <Button variant="secondary" size="xs" onClick={onOcultar}>
                {ocultarMarcados ? `Mostrar marcados (${feitos})` : "Ocultar itens marcados"}
              </Button>
            )}
            <Button variant="secondary" size="xs" onClick={excluir}>
              Excluir
            </Button>
          </div>
        )}
      </div>
      {total > 0 && !rascunho && (
        <div className="flex items-center gap-2">
          <span className="w-10 shrink-0 text-[12px] font-semibold tabular-nums text-text-2">{pct}%</span>
          <div className="flex-1">
            <BarraSegmentada trilho altura={6} max={total} segmentos={[{ chave: "feitos", rotulo: "Feitos", valor: feitos, cor: "var(--ok)" }]} />
          </div>
        </div>
      )}
      <ul className="divide-y divide-border rounded-card border border-border">
        {itens.map((i, idx) => {
          const resp = i.responsavelId != null ? porId.get(i.responsavelId) : undefined;
          const estadoItem = estadoPrazo(i.prazo, hoje, i.feito);
          return (
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
              {i.prazo && (
                <span
                  className="inline-flex shrink-0 items-center gap-1 rounded-full px-1.5 py-px text-[11px] font-semibold tabular-nums"
                  style={{ color: COR_ESTADO_PRAZO[estadoItem], background: `color-mix(in srgb, ${COR_ESTADO_PRAZO[estadoItem]} 12%, var(--surface))` }}
                  title={`Prazo do item: ${rotuloData(i.prazo, "")}`}
                >
                  <IconClock className="h-3 w-3" />
                  {rotuloData(i.prazo, hoje)}
                </span>
              )}
              {resp && (
                <span className="shrink-0" title={`Responsável: ${nomeExibicao(resp)}`}>
                  <Avatar nome={resp.nome} foto={resp.foto} size="xs" />
                </span>
              )}
              {!disabled && editando?.id !== i.id && (
                <div className="flex shrink-0 gap-0.5">
                  <Button
                    variant="ghost"
                    size="xs"
                    aria-label={`Renomear ${i.texto}`}
                    icon={<IconPencil className="h-4 w-4" />}
                    onClick={() => {
                      resolvido.current = false;
                      setEditando({ id: i.id, texto: i.texto });
                    }}
                  />
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
                  {rascunho ? (
                    <Button variant="ghost" size="xs" aria-label={`Remover ${i.texto}`} style={{ color: "var(--danger)" }} icon={<IconTrash className="h-4 w-4" />} onClick={() => remover(i)} />
                  ) : (
                    <MenuItem item={i} pessoas={pessoas} onEditar={(p) => acoes.editarItem(i.id, p)} onRemover={() => remover(i)} onConverter={onConverter && i.id > 0 ? () => onConverter(i) : undefined} />
                  )}
                </div>
              )}
            </li>
          );
        })}
        {!disabled && (
          <li className="flex min-h-11 items-center gap-2 px-2 py-1">
            <IconPlus className="h-4 w-4 shrink-0 text-faint" />
            <input
              value={novo}
              maxLength={300}
              aria-label={`Novo item em ${c.nome}`}
              placeholder="Adicionar um item"
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
      {ocultarMarcados && feitos > 0 && <p className="text-[12px] text-muted">{feitos} item(ns) marcado(s) oculto(s).</p>}
    </section>
  );
}

/** O menu "…" do item: prazo, responsável, converter em tarefa e excluir. */
function MenuItem({
  item: i,
  pessoas,
  onEditar,
  onRemover,
  onConverter,
}: {
  item: ItemChecklist;
  pessoas: Pessoa[];
  onEditar: (p: PatchItem) => void;
  onRemover: () => void;
  onConverter?: () => void;
}) {
  return (
    <Dropdown align="end" ariaLabel={`Ações do item ${i.texto}`} triggerClassName="h-11 w-11 justify-center text-faint lg:h-[calc(var(--h-control-sm)-6px)] lg:w-[calc(var(--h-control-sm)-6px)]" trigger={<IconMais className="h-4 w-4" />} width={280}>
      {(fechar) => (
        <div className="space-y-3 p-1">
          <label className="block text-[12px] font-semibold text-text-2">
            Prazo do item
            <input
              type="date"
              value={i.prazo ?? ""}
              onChange={(e) => onEditar({ prazo: e.target.value || null })}
              className="mt-1 h-11 w-full rounded-control border border-border-2 bg-surface px-2 text-[13px] text-text lg:h-9"
            />
          </label>
          <label className="block text-[12px] font-semibold text-text-2">
            Responsável
            <Selecao
              value={i.responsavelId ?? ""}
              onChange={(e) => onEditar({ responsavelId: e.target.value ? Number(e.target.value) : null })}
              className="mt-1 h-11 w-full rounded-control border border-border-2 bg-surface px-2 text-[13px] text-text lg:h-9"
            >
              <option value="">Ninguém</option>
              {pessoas.map((p) => (
                <option key={p.id} value={p.id}>
                  {nomeExibicao(p)}
                </option>
              ))}
            </Selecao>
          </label>
          <div className="space-y-0.5 border-t border-border pt-2">
            {onConverter && (
              <button
                type="button"
                onClick={() => {
                  fechar();
                  onConverter();
                }}
                className="flex min-h-11 w-full items-center gap-2 rounded-control px-2 text-left text-[13px] text-text hover:bg-surface-2"
              >
                <IconArrowUp className="h-4 w-4 rotate-45 text-muted" />
                Converter em tarefa
              </button>
            )}
            <button
              type="button"
              onClick={() => {
                fechar();
                onRemover();
              }}
              className="flex min-h-11 w-full items-center gap-2 rounded-control px-2 text-left text-[13px] text-[var(--danger)] hover:bg-surface-2"
            >
              <IconTrash className="h-4 w-4" />
              Excluir
            </button>
          </div>
        </div>
      )}
    </Dropdown>
  );
}
