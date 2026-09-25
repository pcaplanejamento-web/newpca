"use client";

import { useEffect, useRef, useState } from "react";
import { chamarPadronizacao as chamar } from "@/lib/padronizacao-cliente";
import type { Pessoa } from "@/lib/pessoa";
import {
  COR_ESTADO_PRAZO,
  COR_PRIORIDADE,
  type EtiquetaTarefa,
  estadoPrazo,
  type ListaTarefas,
  type Prioridade,
  PRIORIDADES,
  ROTULO_ESTADO_PRAZO,
  ROTULO_PRIORIDADE,
  rotuloTicket,
  type TarefaResumo,
} from "@/lib/tarefas-core";
import { Badge } from "./Badge";
import { Button } from "./Button";
import { useConfirmacao } from "./Confirmacao";
import { SelectField, TextArea, TextField } from "./Field";
import { IconArquivar, IconBandeira, IconCheck, IconDesarquivar, IconTrash } from "./icons";
import { Modal } from "./Modal";
import { Segmented } from "./Segmented";
import { SeletorPessoas } from "./SeletorPessoas";
import { toast } from "./Toast";

/** Qual detalhe está aberto: uma tarefa NOVA (na lista dada) ou uma existente. */
export type AberturaTarefa = { tipo: "nova"; listaId: number } | { tipo: "editar"; id: number };

type Rascunho = {
  titulo: string;
  listaId: number;
  prioridade: Prioridade;
  inicio: string;
  prazo: string;
  pessoas: number[];
  etiquetas: number[];
  descricao: string;
};

const iguais = (a: number[], b: number[]) => a.length === b.length && a.every((x) => b.includes(x));

/**
 * DETALHE de uma tarefa (criar e editar) num banner: título, lista, prioridade, responsáveis (as pessoas do grupo), início
 * e PRAZO (com o semáforo), etiquetas e a descrição. Salvar manda SÓ o que mudou. Arquivar/restaurar (qualquer pessoa do
 * grupo) e excluir (editores). Fechar com alterações pede confirmação.
 */
export function TarefaDetalhe({
  aberto,
  quadroId,
  tarefas,
  listas,
  etiquetas,
  pessoas,
  todas,
  hoje,
  usuarioId,
  podeExcluir,
  onFechar,
  onSalvo,
}: {
  aberto: AberturaTarefa | null;
  quadroId: number;
  tarefas: TarefaResumo[];
  /** As listas ATIVAS (destinos possíveis). */
  listas: ListaTarefas[];
  etiquetas: EtiquetaTarefa[];
  /** As pessoas do GRUPO (podem ser escolhidas). */
  pessoas: Pessoa[];
  /** Todas as conhecidas (as designadas fora do grupo seguem visíveis). */
  todas: Pessoa[];
  hoje: string;
  usuarioId: number;
  podeExcluir: boolean;
  onFechar: () => void;
  onSalvo: () => void;
}) {
  const existente = aberto?.tipo === "editar" ? tarefas.find((t) => t.id === aberto.id) : undefined;
  const [inicial, setInicial] = useState<Rascunho | null>(null);
  const [r, setR] = useState<Rascunho | null>(null);
  const [carregandoDesc, setCarregandoDesc] = useState(false);
  const [salvando, setSalvando] = useState<null | "salvar" | "arquivar" | "excluir">(null);
  const { confirmar, confirmacao } = useConfirmacao();
  const pedido = useRef(0);

  // Abre: monta o rascunho (a descrição de uma existente chega pela rota — o quadro traz só o resumo).
  // biome-ignore lint/correctness/useExhaustiveDependencies: reinicia só quando OUTRO detalhe abre.
  useEffect(() => {
    const n = ++pedido.current;
    if (!aberto) {
      setR(null);
      setInicial(null);
      return;
    }
    const base: Rascunho = existente
      ? {
          titulo: existente.titulo,
          listaId: existente.listaId,
          prioridade: existente.prioridade,
          inicio: existente.inicio ?? "",
          prazo: existente.prazo ?? "",
          pessoas: existente.pessoas,
          etiquetas: existente.etiquetas,
          descricao: "",
        }
      : {
          titulo: "",
          listaId: aberto.tipo === "nova" ? aberto.listaId : (listas[0]?.id ?? 0),
          prioridade: "media",
          inicio: "",
          prazo: "",
          pessoas: [],
          etiquetas: [],
          descricao: "",
        };
    setR(base);
    setInicial(base);
    if (aberto.tipo !== "editar") return;
    setCarregandoDesc(true);
    chamar<{ tarefa: { descricao: string | null } }>(`/api/tarefas/${aberto.id}`)
      .then((j) => {
        if (n !== pedido.current) return;
        const descricao = j.tarefa.descricao ?? "";
        setR((x) => (x ? { ...x, descricao } : x));
        setInicial((x) => (x ? { ...x, descricao } : x));
      })
      .catch((e: Error) => n === pedido.current && toast.error(e.message))
      .finally(() => n === pedido.current && setCarregandoDesc(false));
  }, [aberto?.tipo, aberto?.tipo === "editar" ? aberto.id : aberto?.listaId]);

  if (!aberto || !r || !inicial) return <>{confirmacao}</>;
  const nova = aberto.tipo === "nova";
  const sujo = JSON.stringify(r) !== JSON.stringify(inicial);
  const datasOk = !r.inicio || !r.prazo || r.inicio <= r.prazo;
  const pode = r.titulo.trim().length > 0 && datasOk && !salvando && !carregandoDesc;
  const concluida = existente?.concluidaEm != null;
  const estado = estadoPrazo(r.prazo || null, hoje, concluida);
  const fora = todas.filter((p) => !pessoas.some((x) => x.id === p.id));
  const set = <K extends keyof Rascunho>(k: K, v: Rascunho[K]) => setR((x) => (x ? { ...x, [k]: v } : x));

  const fechar = async () => {
    if (salvando) return;
    if (sujo && !(await confirmar({ titulo: "Descartar as alterações?", texto: "O que foi mudado nesta tarefa não será salvo.", confirmar: "Descartar", perigo: true })))
      return;
    onFechar();
  };

  const salvar = async () => {
    if (!pode) return;
    setSalvando("salvar");
    try {
      if (nova) {
        await chamar("/api/tarefas", "POST", {
          quadroId,
          listaId: r.listaId,
          titulo: r.titulo.trim(),
          descricao: r.descricao.trim() || null,
          prioridade: r.prioridade,
          inicio: r.inicio || null,
          prazo: r.prazo || null,
          pessoas: r.pessoas,
          etiquetas: r.etiquetas,
        });
        toast.success("Tarefa criada.");
      } else if (existente) {
        const d: Record<string, unknown> = {};
        if (r.titulo.trim() !== inicial.titulo) d.titulo = r.titulo.trim();
        if (r.listaId !== inicial.listaId) d.listaId = r.listaId;
        if (r.prioridade !== inicial.prioridade) d.prioridade = r.prioridade;
        if (r.inicio !== inicial.inicio) d.inicio = r.inicio || null;
        if (r.prazo !== inicial.prazo) d.prazo = r.prazo || null;
        if (!iguais(r.pessoas, inicial.pessoas)) d.pessoas = r.pessoas;
        if (!iguais(r.etiquetas, inicial.etiquetas)) d.etiquetas = r.etiquetas;
        if (r.descricao !== inicial.descricao) d.descricao = r.descricao.trim() || null;
        if (Object.keys(d).length) await chamar(`/api/tarefas/${existente.id}`, "PATCH", d);
        toast.success("Tarefa salva.");
      }
      onSalvo();
      onFechar();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setSalvando(null);
    }
  };

  const arquivar = async () => {
    if (!existente) return;
    setSalvando("arquivar");
    try {
      await chamar(`/api/tarefas/${existente.id}`, "PATCH", { arquivada: !existente.arquivada });
      toast.success(existente.arquivada ? "Tarefa restaurada." : "Tarefa arquivada — restaure pela aba Lista (Arquivadas).");
      onSalvo();
      onFechar();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setSalvando(null);
    }
  };

  const excluir = async () => {
    if (!existente) return;
    const ok = await confirmar({
      titulo: `Excluir a tarefa ${rotuloTicket(existente.ticket)}?`,
      texto: "Esta ação não pode ser desfeita — no dia a dia, prefira arquivar.",
      confirmar: "Excluir",
      perigo: true,
    });
    if (!ok) return;
    setSalvando("excluir");
    try {
      await chamar(`/api/tarefas/${existente.id}`, "DELETE");
      toast.success("Tarefa excluída.");
      onSalvo();
      onFechar();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setSalvando(null);
    }
  };

  const listaAtual = listas.find((l) => l.id === r.listaId);
  return (
    <>
      <Modal
        open
        onClose={fechar}
        titulo={nova ? "Nova tarefa" : `Tarefa ${existente ? rotuloTicket(existente.ticket) : ""}`}
        size="lg"
        bloqueado={salvando != null}
        cabecalho={
          <div className="flex min-w-0 flex-wrap items-center gap-2">
            {existente ? (
              <Badge tone="blue">{rotuloTicket(existente.ticket)}</Badge>
            ) : (
              <Badge>Nova</Badge>
            )}
            <h2 className="min-w-0 truncate text-base font-semibold text-text">{nova ? "Nova tarefa" : existente?.titulo}</h2>
            {existente?.arquivada && <Badge>Arquivada</Badge>}
            {concluida && (
              <Badge tone="emerald">
                <IconCheck className="h-3 w-3" />
                Concluída
              </Badge>
            )}
          </div>
        }
        rodape={
          <div className="flex flex-wrap items-center gap-2">
            {existente && (
              <Button
                variant="ghost"
                size="sm"
                loading={salvando === "arquivar"}
                disabled={salvando != null}
                icon={existente.arquivada ? <IconDesarquivar className="h-4 w-4" /> : <IconArquivar className="h-4 w-4" />}
                onClick={arquivar}
              >
                {existente.arquivada ? "Restaurar" : "Arquivar"}
              </Button>
            )}
            {existente && podeExcluir && (
              <Button
                variant="ghost"
                size="sm"
                loading={salvando === "excluir"}
                disabled={salvando != null}
                aria-label="Excluir tarefa"
                title="Excluir tarefa"
                icon={<IconTrash className="h-4 w-4" style={{ color: "var(--danger)" }} />}
                onClick={excluir}
              />
            )}
            <div className="ml-auto flex gap-2">
              <Button variant="ghost" disabled={salvando != null} onClick={fechar}>
                {sujo ? "Cancelar" : "Fechar"}
              </Button>
              <Button loading={salvando === "salvar"} disabled={!pode || (!nova && !sujo)} onClick={salvar}>
                {nova ? "Criar tarefa" : "Salvar"}
              </Button>
            </div>
          </div>
        }
      >
        <div className="space-y-4">
          <TextField
            label="Título"
            value={r.titulo}
            maxLength={200}
            placeholder="O que precisa ser feito"
            autoFocus={nova}
            onChange={(e) => set("titulo", e.target.value)}
          />
          <div className="grid gap-4 sm:grid-cols-2">
            <SelectField label="Lista" value={String(r.listaId)} onChange={(e) => set("listaId", Number(e.target.value))}>
              {listas.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.nome}
                  {l.concluida ? " (concluídas)" : ""}
                </option>
              ))}
              {!listaAtual && <option value={r.listaId}>Lista arquivada</option>}
            </SelectField>
            <div>
              <p className="mb-2 text-[13.5px] font-bold text-text">Prioridade</p>
              <Segmented<Prioridade>
                ariaLabel="Prioridade"
                value={r.prioridade}
                onChange={(v) => set("prioridade", v)}
                options={PRIORIDADES.map((p) => ({
                  value: p,
                  label: ROTULO_PRIORIDADE[p],
                  icone: <IconBandeira className="h-3.5 w-3.5" style={{ color: COR_PRIORIDADE[p] }} />,
                }))}
              />
            </div>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <TextField label="Início" type="date" value={r.inicio} onChange={(e) => set("inicio", e.target.value)} />
            <TextField
              label="Prazo"
              type="date"
              value={r.prazo}
              onChange={(e) => set("prazo", e.target.value)}
              error={datasOk ? undefined : "O início não pode ser depois do prazo."}
              hint={
                r.prazo ? (
                  <span className="font-semibold" style={{ color: COR_ESTADO_PRAZO[estado] }}>
                    {ROTULO_ESTADO_PRAZO[estado]}
                  </span>
                ) : undefined
              }
            />
          </div>
          <div>
            <p className="mb-2 text-[13.5px] font-bold text-text">Responsáveis</p>
            <SeletorPessoas pessoas={pessoas} fora={fora} selecionadas={r.pessoas} usuarioId={usuarioId} onChange={(v) => set("pessoas", v)} />
          </div>
          {etiquetas.length > 0 && (
            <div>
              <p className="mb-2 text-[13.5px] font-bold text-text">Etiquetas</p>
              <div className="flex flex-wrap gap-1.5">
                {etiquetas.map((e) => {
                  const ativa = r.etiquetas.includes(e.id);
                  return (
                    <button
                      key={e.id}
                      type="button"
                      aria-pressed={ativa}
                      onClick={() => set("etiquetas", ativa ? r.etiquetas.filter((x) => x !== e.id) : [...r.etiquetas, e.id])}
                      className="inline-flex h-11 items-center gap-1.5 rounded-full px-3 text-[12.5px] font-semibold transition-[box-shadow,opacity] duration-[var(--motion-duration)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40 lg:h-[var(--h-control-sm)]"
                      style={{
                        color: e.cor,
                        background: `color-mix(in srgb, ${e.cor} ${ativa ? 18 : 6}%, var(--surface))`,
                        boxShadow: `inset 0 0 0 ${ativa ? 2 : 1}px color-mix(in srgb, ${e.cor} ${ativa ? 70 : 25}%, transparent)`,
                      }}
                    >
                      {ativa && <IconCheck className="h-3.5 w-3.5" />}
                      {e.nome}
                    </button>
                  );
                })}
              </div>
            </div>
          )}
          <TextArea
            label="Descrição"
            rows={6}
            value={r.descricao}
            maxLength={10_000}
            disabled={carregandoDesc}
            placeholder={carregandoDesc ? "Carregando…" : "Detalhes, passos, contexto (opcional)"}
            onChange={(e) => set("descricao", e.target.value)}
          />
        </div>
      </Modal>
      {confirmacao}
    </>
  );
}
