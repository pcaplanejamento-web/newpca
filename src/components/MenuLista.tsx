"use client";

import { type ReactNode, useEffect, useState } from "react";
import { num } from "@/lib/format";
import { chamarPadronizacao as chamar } from "@/lib/padronizacao-cliente";
import { type ListaTarefas, ORDENACOES_LISTA, type OrdenacaoLista, ROTULO_ORDENACAO, type TarefaResumo } from "@/lib/tarefas-core";
import { Button } from "./Button";
import { buscarDestinos, type DestinoCopia } from "./CopiarMoverTarefa";
import { Dropdown } from "./Dropdown";
import { SelectField, TextField } from "./Field";
import { Callout } from "./Callout";
import { Segmented } from "./Segmented";
import { IconArquivar, IconArrowRight, IconCopy, IconMais, IconPlus, IconSort, IconTrash } from "./icons";
import { Modal } from "./Modal";
import { Progress } from "./Progress";
import { Skeleton } from "./Skeleton";
import { toast } from "./Toast";

/** Copiar a lista (deste ou de outro quadro) ou MOVÊ-LA para outro quadro. */
export type ModoLista = "copiar" | "mover";

/**
 * O MENU "…" de uma LISTA do quadro (como o do Trello): adicionar tarefa · ordenar por (prazo, criação, título,
 * prioridade) · mover todos os cartões para outra lista · arquivar todos os cartões · e, para editores, copiar a lista,
 * movê-la para outro quadro, arquivá-la e EXCLUÍ-LA. As ações ficam com o host (o quadro).
 */
export function MenuLista({
  lista,
  outras,
  qtd,
  podeEditar,
  disabled = false,
  onNova,
  onOrdenar,
  onMoverCartoes,
  onArquivarCartoes,
  onCopiarMover,
  onArquivarLista,
  onExcluirLista,
}: {
  lista: ListaTarefas;
  /** As OUTRAS listas ativas do quadro (destino de "mover todos os cartões"). */
  outras: ListaTarefas[];
  /** Quantos cartões ativos a lista tem. */
  qtd: number;
  podeEditar: boolean;
  disabled?: boolean;
  onNova: () => void;
  onOrdenar: (por: OrdenacaoLista) => void;
  onMoverCartoes: (listaId: number) => void;
  onArquivarCartoes: () => void;
  onCopiarMover: (modo: ModoLista) => void;
  onArquivarLista: () => void;
  /** Abre a exclusão da lista (`ExcluirLista`). */
  onExcluirLista?: () => void;
}) {
  const [secao, setSecao] = useState<null | "ordenar" | "mover">(null);
  return (
    <Dropdown
      align="end"
      width={270}
      ariaLabel={`Ações da lista ${lista.nome}`}
      triggerClassName="h-11 w-11 shrink-0 justify-center text-muted lg:h-8 lg:w-8"
      trigger={<IconMais className="h-4 w-4" />}
    >
      {(fechar) => {
        const item = (rotulo: string, icone: ReactNode, fn: () => void, off = false) => (
          <button
            key={rotulo}
            type="button"
            disabled={off || disabled}
            onClick={() => {
              fechar();
              setSecao(null);
              fn();
            }}
            className="flex min-h-11 w-full items-center gap-2 rounded-control px-2 text-left text-[13px] text-text hover:bg-surface-2 disabled:opacity-40 lg:min-h-9"
          >
            {icone}
            <span className="truncate">{rotulo}</span>
          </button>
        );
        const grupo = (k: "ordenar" | "mover", rotulo: string, icone: ReactNode, off = false) => (
          <button
            type="button"
            aria-expanded={secao === k}
            disabled={off || disabled}
            onClick={() => setSecao((s) => (s === k ? null : k))}
            className="flex min-h-11 w-full items-center gap-2 rounded-control px-2 text-left text-[13px] text-text hover:bg-surface-2 disabled:opacity-40 lg:min-h-9"
          >
            {icone}
            <span className="flex-1 truncate">{rotulo}</span>
            <span aria-hidden className="text-faint">
              {secao === k ? "−" : "+"}
            </span>
          </button>
        );
        return (
          <div className="space-y-0.5">
            <p className="truncate px-2 pt-1 pb-0.5 text-[12px] font-semibold text-muted">{lista.nome}</p>
            {item("Adicionar tarefa", <IconPlus className="h-4 w-4 text-muted" />, onNova)}
            {grupo("ordenar", "Ordenar por…", <IconSort className="h-4 w-4 text-muted" />, qtd < 2)}
            {secao === "ordenar" && <div className="pl-4">{ORDENACOES_LISTA.map((o) => item(ROTULO_ORDENACAO[o], null, () => onOrdenar(o)))}</div>}
            {grupo("mover", "Mover todos os cartões para…", <IconArrowRight className="h-4 w-4 text-muted" />, qtd === 0 || outras.length === 0)}
            {secao === "mover" && <div className="pl-4">{outras.map((l) => item(l.nome, null, () => onMoverCartoes(l.id)))}</div>}
            {item(`Arquivar todos os cartões${qtd ? ` (${num(qtd)})` : ""}`, <IconArquivar className="h-4 w-4 text-muted" />, onArquivarCartoes, qtd === 0)}
            {podeEditar && (
              <>
                <div className="my-1 border-t border-border" />
                {item("Copiar lista…", <IconCopy className="h-4 w-4 text-muted" />, () => onCopiarMover("copiar"))}
                {item("Mover lista para outro quadro…", <IconArrowRight className="h-4 w-4 text-muted" />, () => onCopiarMover("mover"))}
                {item("Arquivar lista", <IconArquivar className="h-4 w-4 text-muted" />, onArquivarLista)}
                {onExcluirLista && item("Excluir lista…", <IconTrash className="h-4 w-4" style={{ color: "var(--danger)" }} />, onExcluirLista)}
              </>
            )}
          </div>
        );
      }}
    </Dropdown>
  );
}

/**
 * COPIAR uma lista (neste ou em outro quadro — a cópia fica logo depois da original, com os cartões ativos copiados na
 * ordem, templates como templates) ou MOVÊ-LA para outro quadro (a lista nasce lá e TODOS os cartões vão — com ticket
 * novo, checklists, comentários e eventos; a original, vazia, sai). Cartão a cartão pelas MESMAS rotas de copiar/mover
 * tarefa (etiquetas pelo nome, só as pessoas do grupo do destino), com o andamento; o que falhar fica na lista original.
 */
export function CopiarMoverLista({
  aberto,
  quadroId,
  onFechar,
  onFeito,
}: {
  aberto: { modo: ModoLista; lista: ListaTarefas; cartoes: TarefaResumo[] } | null;
  quadroId: number;
  onFechar: () => void;
  onFeito: () => void;
}) {
  const [destinos, setDestinos] = useState<DestinoCopia[] | null>(null);
  const [destino, setDestino] = useState(0);
  const [nome, setNome] = useState("");
  const [andamento, setAndamento] = useState<{ feito: number; total: number } | null>(null);
  const modo = aberto?.modo;

  // biome-ignore lint/correctness/useExhaustiveDependencies: reinicia só quando OUTRA lista/modo abre.
  useEffect(() => {
    if (!aberto) return;
    setNome(aberto.modo === "copiar" ? `${aberto.lista.nome} (cópia)`.slice(0, 60) : aberto.lista.nome);
    setAndamento(null);
    let vivo = true;
    buscarDestinos()
      .then((qs) => {
        if (!vivo) return;
        setDestinos(qs);
        setDestino((aberto.modo === "mover" ? qs.find((q) => q.id !== quadroId) : qs.find((q) => q.id === quadroId))?.id ?? 0);
      })
      .catch((e) => vivo && toast.error((e as Error).message));
    return () => {
      vivo = false;
    };
  }, [aberto?.modo, aberto?.lista.id]);

  if (!aberto || !modo) return null;
  const enviando = andamento != null;
  const opcoes = (destinos ?? []).filter((q) => modo !== "mover" || q.id !== quadroId);
  // Copiar leva os cartões ATIVOS; mover leva TODOS (a lista original precisa ficar vazia para sair).
  const cartoes = [...(modo === "copiar" ? aberto.cartoes.filter((t) => !t.arquivada) : aberto.cartoes)].sort((a, b) => a.ordem - b.ordem || a.id - b.id);
  const pode = !enviando && opcoes.some((q) => q.id === destino) && nome.trim().length > 0;

  const fechar = () => {
    if (enviando) return;
    setDestinos(null);
    onFechar();
  };

  const enviar = async () => {
    if (!pode) return;
    const l = aberto.lista;
    setAndamento({ feito: 0, total: cartoes.length });
    let falhas = 0;
    try {
      const { id: nova } = await chamar<{ id: number }>(`/api/tarefas/quadros/${destino}/listas`, "POST", {
        nome: nome.trim(),
        limiteWip: l.limiteWip,
        concluida: l.concluida,
        ...(modo === "copiar" && destino === quadroId ? { aposId: l.id } : {}),
      });
      for (const [i, t] of cartoes.entries()) {
        try {
          if (modo === "copiar") await chamar(`/api/tarefas/${t.id}/copiar`, "POST", { quadroId: destino, listaId: nova, template: t.template });
          else await chamar(`/api/tarefas/${t.id}/mover-quadro`, "POST", { quadroId: destino, listaId: nova });
        } catch {
          falhas++;
        }
        setAndamento({ feito: i + 1, total: cartoes.length });
      }
      if (modo === "mover" && falhas === 0) await chamar(`/api/tarefas/listas/${l.id}`, "DELETE");
      const q = opcoes.find((x) => x.id === destino)?.nome ?? "";
      if (falhas) toast.warning(`${num(cartoes.length - falhas)} de ${num(cartoes.length)} cartão(ões) ${modo === "copiar" ? "copiados" : "movidos"}; ${num(falhas)} falharam${modo === "mover" ? " e ficaram na lista original" : ""}.`, 8000);
      else toast.success(modo === "copiar" ? `Lista copiada${destino !== quadroId ? ` para “${q}”` : ""} — ${num(cartoes.length)} cartão(ões).` : `Lista movida para “${q}” — ${num(cartoes.length)} cartão(ões).`);
      setDestinos(null);
      setAndamento(null);
      onFeito();
    } catch (e) {
      toast.error((e as Error).message);
      setAndamento(null);
      onFeito();
    }
  };

  return (
    <Modal
      open
      onClose={fechar}
      size="md"
      bloqueado={enviando}
      titulo={modo === "copiar" ? `Copiar a lista “${aberto.lista.nome}”` : `Mover a lista “${aberto.lista.nome}”`}
      rodape={
        <div className="flex justify-end gap-2">
          <Button variant="ghost" disabled={enviando} onClick={fechar}>
            Cancelar
          </Button>
          <Button loading={enviando} disabled={!pode} onClick={enviar}>
            {modo === "copiar" ? "Copiar lista" : "Mover lista"}
          </Button>
        </div>
      }
    >
      {!destinos ? (
        <div className="space-y-3">
          <Skeleton className="h-11 w-full" />
          <Skeleton className="h-11 w-full" />
        </div>
      ) : !opcoes.length ? (
        <p className="text-sm text-muted">Nenhum outro quadro ativo que você veja.</p>
      ) : (
        <div className="space-y-4">
          {modo === "copiar" && <TextField label="Nome da nova lista" value={nome} maxLength={60} disabled={enviando} onChange={(e) => setNome(e.target.value)} />}
          <SelectField label="Quadro" value={destino} disabled={enviando} onChange={(e) => setDestino(Number(e.target.value))}>
            {opcoes.map((q) => (
              <option key={q.id} value={q.id}>
                {q.nome} — {q.grupoNome}
                {q.id === quadroId ? " (este)" : ""}
              </option>
            ))}
          </SelectField>
          <p className="text-[12.5px] text-muted">
            {modo === "copiar"
              ? `Copia ${num(cartoes.length)} cartão(ões) ativo(s), na ordem, com checklists, etiquetas, pessoas e datas.`
              : `Leva os ${num(cartoes.length)} cartão(ões) (inclusive os arquivados) com checklists, comentários e eventos; cada um ganha o ticket do quadro de destino.`}
            {destino !== quadroId ? " Em outro quadro, as etiquetas casam pelo nome (as que faltam são criadas) e ficam só as pessoas do grupo dele." : ""}
          </p>
          {andamento && <Progress value={andamento.total ? (andamento.feito / andamento.total) * 100 : 100} label={`${andamento.feito} de ${andamento.total} cartões`} />}
        </div>
      )}
    </Modal>
  );
}

/**
 * EXCLUIR uma lista (editores) — qualquer uma, como no Trello. Com cartões, escolhe-se na hora: MOVÊ-LOS (todos, inclusive
 * os arquivados) para outra lista e excluir, ou EXCLUIR TUDO junto (checklists, comentários e eventos dos cartões saem
 * também). A contagem vem do servidor (os arquivados não estão no quadro).
 */
export function ExcluirLista({
  lista,
  outras,
  onFechar,
  onFeito,
}: {
  lista: ListaTarefas | null;
  /** As OUTRAS listas ativas do quadro (destino dos cartões). */
  outras: ListaTarefas[];
  onFechar: () => void;
  onFeito: (atualizar: boolean) => void;
}) {
  const [n, setN] = useState<number | null>(null);
  const [modo, setModo] = useState<"mover" | "excluir">("mover");
  const [destino, setDestino] = useState("");
  const [gravando, setGravando] = useState(false);
  const id = lista?.id;
  useEffect(() => {
    setN(null);
    setGravando(false);
    if (id == null) return;
    let vivo = true;
    chamar<{ cartoes: number }>(`/api/tarefas/listas/${id}`)
      .then((r) => vivo && setN(r.cartoes))
      .catch((e) => vivo && toast.error((e as Error).message));
    return () => {
      vivo = false;
    };
  }, [id]);
  // Ao abrir (ou mudar as listas): "mover" para a 1ª outra, quando existe.
  const primeira = outras[0]?.id ?? null;
  useEffect(() => {
    if (id == null) return;
    setModo(primeira != null ? "mover" : "excluir");
    setDestino(primeira != null ? String(primeira) : "");
  }, [id, primeira]);
  if (!lista) return null;
  const mover = !!n && modo === "mover";
  const excluir = async () => {
    if (gravando || (mover && !destino)) return;
    setGravando(true);
    try {
      const r = await chamar<{ atualizar: boolean }>(`/api/tarefas/listas/${lista.id}${mover ? `?moverPara=${destino}` : ""}`, "DELETE");
      toast.success(mover ? `Lista excluída — ${num(n ?? 0)} cartão(ões) movido(s).` : "Lista excluída.");
      onFeito(r.atualizar);
    } catch (e) {
      toast.error((e as Error).message);
      setGravando(false);
    }
  };
  return (
    <Modal
      open
      onClose={() => !gravando && onFechar()}
      titulo={`Excluir a lista "${lista.nome}"`}
      size="md"
      bloqueado={gravando}
      rodape={
        <div className="flex flex-wrap justify-end gap-2">
          <Button variant="ghost" disabled={gravando} onClick={onFechar}>
            Cancelar
          </Button>
          <Button variant="danger" loading={gravando} disabled={n == null || (mover && !destino)} icon={<IconTrash className="h-4 w-4" />} onClick={excluir}>
            Excluir lista
          </Button>
        </div>
      }
    >
      {n == null ? (
        <Skeleton className="h-16 w-full" />
      ) : n === 0 ? (
        <p className="text-[13.5px] text-text">A lista está vazia — ela sai do quadro.</p>
      ) : (
        <div className="space-y-3">
          <p className="text-[13.5px] text-text">
            A lista tem <strong>{num(n)} cartão(ões)</strong> (contando os arquivados). O que fazer com eles?
          </p>
          <Segmented
            ariaLabel="Os cartões da lista"
            value={modo}
            disabled={gravando}
            onChange={setModo}
            options={[
              ...(outras.length ? [{ value: "mover" as const, label: "Mover para outra lista" }] : []),
              { value: "excluir" as const, label: "Excluir tudo junto" },
            ]}
          />
          {mover ? (
            <SelectField label="Mover os cartões para" value={destino} disabled={gravando} onChange={(e) => setDestino(e.target.value)}>
              {outras.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.nome}
                </option>
              ))}
            </SelectField>
          ) : (
            <Callout kind="danger">Os {num(n)} cartão(ões) serão excluídos definitivamente — com checklists, comentários e eventos.</Callout>
          )}
        </div>
      )}
    </Modal>
  );
}
