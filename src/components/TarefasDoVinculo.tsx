"use client";

import { useCallback, useEffect, useState } from "react";
import { chamarPadronizacao as chamar } from "@/lib/padronizacao-cliente";
import type { ContextoQuadro, ContextoTarefa } from "@/lib/tarefas-dados";
import { COR_ESTADO_PRAZO, estadoPrazo, ROTULO_ESTADO_PRAZO, ROTULO_VINCULO, rotuloData, rotuloTicket, type TipoVinculo } from "@/lib/tarefas-core";
import { dataIsoBrasilia } from "@/lib/format";
import { Badge } from "./Badge";
import { BotaoAcao } from "./BotaoAcao";
import { Button } from "./Button";
import { CirculoConcluir } from "./CirculoConcluir";
import { SelectField } from "./Field";
import { IconKanban, IconPlus } from "./icons";
import { Modal } from "./Modal";
import { Segmented } from "./Segmented";
import { TarefaDetalhe } from "./TarefaDetalhe";
import { toast } from "./Toast";

type TarefaLigada = {
  id: number;
  ticket: number;
  titulo: string;
  prazo: string | null;
  concluidaEm: string | null;
  arquivada: boolean;
  quadroId: number;
  quadroNome: string;
  quadroCor: string;
  listaNome: string;
};
type QuadroOpcao = { id: number; nome: string; cor: string; grupoNome: string };
/** Uma lista ATRIBUÍDA sugerida (ao responsável do protocolo ou à pessoa). */
type ListaOpcao = { id: number; nome: string; quadroId: number; motivo: "responsavel" | "sua" };
type Dados = { tarefas: TarefaLigada[]; quadros: QuadroOpcao[]; listas?: ListaOpcao[]; rotulo?: string | null; sigla?: string | null; usuarioId?: number };

/** O banner da tarefa aberto AQUI (sem sair da Mesa): nova (no quadro/lista) ou uma ligada. */
type Aberta = { tipo: "nova"; ctx: ContextoQuadro; listaId: number } | { tipo: "editar"; ctx: ContextoTarefa };

/**
 * TAREFAS de um protocolo/DFD/item (no cabeçalho dos banners da Mesa) — tudo SEM SAIR DA MESA: o botão "Tarefas" (ícone +
 * "abertas/total") lista as tarefas LIGADAS (Abertas | Todas; concluir/reabrir no círculo; tocar abre a tarefa completa
 * aqui, por cima — nada leva à tela de Tarefas), as LISTAS ATRIBUÍDAS ao responsável do protocolo e à pessoa e "Criar tarefa" num
 * quadro do grupo ativo — o banner COMPLETO da tarefa (título sugerido, lista, pessoas, datas, etiquetas, checklists,
 * campos…) abre aqui, já vinculado. Sem tarefas nem quadros, o botão não aparece.
 */
export function TarefasDoVinculo({
  tipo,
  id,
  disabled = false,
  dica,
}: {
  tipo: TipoVinculo;
  id: number;
  /** Travado (o banner grava ou sobrescreve): o botão fica À VISTA, sem abrir. */
  disabled?: boolean;
  dica?: string;
}) {
  const [dados, setDados] = useState<Dados | null>(null);
  const [aberto, setAberto] = useState(false);
  const [quadro, setQuadro] = useState("");
  const [ver, setVer] = useState<"abertas" | "todas">("abertas");
  const [tarefa, setTarefa] = useState<Aberta | null>(null);
  const [carregando, setCarregando] = useState<string | null>(null);

  const recarregar = useCallback(
    (manterQuadro = false) =>
      chamar<Dados>(`/api/tarefas/do-vinculo?tipo=${tipo}&id=${id}`)
        .then((j) => {
          setDados(j);
          if (!manterQuadro) setQuadro(String(j.listas?.[0]?.quadroId ?? j.quadros[0]?.id ?? ""));
        })
        .catch(() => setDados((d) => d ?? { tarefas: [], quadros: [] })),
    [tipo, id],
  );
  useEffect(() => {
    setDados(null);
    void recarregar();
  }, [recarregar]);

  if (!dados || (!dados.tarefas.length && !dados.quadros.length)) return null;
  const hoje = dataIsoBrasilia(new Date().toISOString());
  const abertas = dados.tarefas.filter((t) => !t.arquivada && !t.concluidaEm);
  const lista = ver === "abertas" ? abertas : dados.tarefas;
  // A tarefa leva a SIGLA da unidade do protocolo/DFD/item no título sugerido ("SEMED · Protocolo 123/2026: ").
  const alvo = `${dados.sigla ? `${dados.sigla} · ` : ""}${ROTULO_VINCULO[tipo]} ${dados.rotulo ?? `#${id}`}`;

  /** Abre a tarefa NOVA aqui: o contexto do quadro (listas, pessoas…) + a lista pedida, senão a atribuída, senão a 1ª. */
  const criar = async (quadroId: number, listaId?: number) => {
    setCarregando(`q${quadroId}`);
    try {
      const { contexto } = await chamar<{ contexto: ContextoQuadro }>(`/api/tarefas/quadros/${quadroId}`);
      const ativas = contexto.listas.filter((l) => !l.arquivada);
      const sugerida = dados.listas?.find((l) => l.quadroId === quadroId)?.id;
      const destino = ativas.find((l) => l.id === listaId) ?? ativas.find((l) => l.id === sugerida) ?? ativas[0];
      if (!destino) return toast.error("O quadro não tem listas ativas.");
      if (!contexto.pode.manipular) return toast.error("Seu papel não cria tarefas neste quadro.");
      setTarefa({ tipo: "nova", ctx: contexto, listaId: destino.id });
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setCarregando(null);
    }
  };
  const abrir = async (tarefaId: number) => {
    setCarregando(`t${tarefaId}`);
    try {
      const { contexto } = await chamar<{ contexto: ContextoTarefa }>(`/api/tarefas/${tarefaId}?contexto=1`);
      setTarefa({ tipo: "editar", ctx: contexto });
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setCarregando(null);
    }
  };
  /** Conclui/reabre NO LUGAR (o mesmo PATCH do cartão — automações e recorrência valem). */
  const alternar = async (t: TarefaLigada) => {
    const concluida = !t.concluidaEm;
    setDados((d) => d && { ...d, tarefas: d.tarefas.map((x) => (x.id === t.id ? { ...x, concluidaEm: concluida ? new Date().toISOString() : null } : x)) });
    try {
      await chamar(`/api/tarefas/${t.id}`, "PATCH", { concluida });
      toast.success(concluida ? "Tarefa concluída." : "Tarefa reaberta.");
    } catch (e) {
      toast.error((e as Error).message);
    }
    void recarregar(true);
  };

  const ctx = tarefa?.ctx;
  return (
    <>
      <BotaoAcao
        rotulo="Tarefas"
        icon={<IconKanban className="h-4 w-4" />}
        contagem={dados.tarefas.length ? `${abertas.length}/${dados.tarefas.length}` : null}
        onClick={() => {
          setAberto(true);
          void recarregar(true);
        }}
        disabled={disabled}
        dica={disabled ? dica : undefined}
      />
      <Modal open={aberto && !disabled} onClose={() => setAberto(false)} titulo={`Tarefas do ${ROTULO_VINCULO[tipo]}`} size="md">
        <div className="space-y-4">
          {dados.tarefas.length > 0 && (
            <Segmented
              ariaLabel="Quais tarefas"
              value={ver}
              onChange={setVer}
              options={[
                { value: "abertas", label: `Abertas (${abertas.length})` },
                { value: "todas", label: `Todas (${dados.tarefas.length})` },
              ]}
            />
          )}
          {lista.length === 0 ? (
            <p className="text-[13px] text-muted">
              {dados.tarefas.length ? "Nenhuma tarefa aberta — veja Todas." : `Nenhuma tarefa ligada a este ${ROTULO_VINCULO[tipo]} ainda.`}
            </p>
          ) : (
            <ul className="divide-y divide-border rounded-card border border-border">
              {lista.map((t) => {
                const e = estadoPrazo(t.prazo, hoje, t.concluidaEm != null);
                return (
                  <li key={t.id} className={`flex min-h-11 items-center gap-1 pr-1 pl-2 ${t.arquivada ? "opacity-60" : ""}`}>
                    <CirculoConcluir concluida={t.concluidaEm != null} onAlternar={() => alternar(t)} rotulo={`${rotuloTicket(t.ticket)} ${t.titulo}`} tamanho="sm" disabled={t.arquivada} />
                    <button
                      type="button"
                      onClick={() => abrir(t.id)}
                      disabled={carregando != null}
                      title="Abrir a tarefa aqui"
                      className="flex min-h-11 min-w-0 flex-1 items-center gap-2 rounded-control px-1 py-2 text-left text-[13px] hover:bg-surface-2"
                    >
                      <span aria-hidden className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: t.quadroCor }} />
                      <span className="shrink-0 font-mono text-[11.5px] text-faint">{rotuloTicket(t.ticket)}</span>
                      <span className={`min-w-0 flex-1 truncate text-text ${t.concluidaEm ? "line-through decoration-faint" : ""}`}>{t.titulo}</span>
                      <span className="hidden shrink-0 text-[11.5px] text-muted sm:inline">
                        {t.quadroNome} · {t.listaNome}
                      </span>
                      {t.arquivada ? (
                        <Badge>Arquivada</Badge>
                      ) : t.prazo ? (
                        <span className="shrink-0 text-[11.5px] font-semibold tabular-nums" style={{ color: COR_ESTADO_PRAZO[e] }} title={ROTULO_ESTADO_PRAZO[e]}>
                          {rotuloData(t.prazo, hoje)}
                        </span>
                      ) : null}
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
          {!!dados.listas?.length && (
            <div className="space-y-1.5 border-t border-border pt-3">
              <p className="text-[12px] font-semibold text-muted">Criar numa lista atribuída</p>
              <ul className="divide-y divide-border rounded-card border border-border">
                {dados.listas.map((l) => {
                  const q = dados.quadros.find((x) => x.id === l.quadroId);
                  return (
                    <li key={l.id}>
                      <button
                        type="button"
                        disabled={carregando != null}
                        onClick={() => criar(l.quadroId, l.id)}
                        className="flex min-h-11 w-full items-center gap-2 px-3 py-2 text-left text-[13px] hover:bg-surface-2"
                        title={`Criar a tarefa na lista "${l.nome}"`}
                      >
                        <span aria-hidden className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: q?.cor }} />
                        <span className="min-w-0 flex-1 truncate text-text">
                          {q?.nome} › <strong className="font-semibold">{l.nome}</strong>
                        </span>
                        <Badge tone={l.motivo === "responsavel" ? "blue" : undefined}>{l.motivo === "responsavel" ? "Do responsável" : "Sua"}</Badge>
                        <IconPlus className="h-4 w-4 shrink-0 text-muted" />
                      </button>
                    </li>
                  );
                })}
              </ul>
            </div>
          )}
          {dados.quadros.length > 0 && (
            <div className="flex flex-wrap items-end gap-2 border-t border-border pt-3">
              <div className="min-w-[12rem] flex-1">
                <SelectField
                  label={`Criar tarefa no quadro${new Set(dados.quadros.map((q) => q.grupoNome)).size === 1 ? ` — grupo ${dados.quadros[0].grupoNome}` : ""}`}
                  value={quadro}
                  onChange={(e) => setQuadro(e.target.value)}
                >
                  {dados.quadros.map((q) => (
                    <option key={q.id} value={q.id} data-detalhe={`Grupo: ${q.grupoNome}`}>
                      {q.nome}
                    </option>
                  ))}
                </SelectField>
              </div>
              <Button variant="accent" icon={<IconPlus className="h-4 w-4" />} disabled={!quadro} loading={carregando === `q${quadro}`} onClick={() => criar(Number(quadro))}>
                Criar tarefa
              </Button>
            </div>
          )}
        </div>
      </Modal>
      {ctx && (
        <TarefaDetalhe
          aberto={tarefa.tipo === "nova" ? { tipo: "nova", listaId: tarefa.listaId, titulo: `${alvo}: `, vinculo: { tipo, id, rotulo: dados.rotulo ?? null, sigla: dados.sigla ?? null } } : { tipo: "editar", id: tarefa.ctx.tarefa.id }}
          quadroId={ctx.quadro.id}
          tarefas={tarefa.tipo === "editar" ? [tarefa.ctx.tarefa] : []}
          listas={ctx.listas.filter((l) => !l.arquivada)}
          etiquetas={ctx.etiquetas}
          equipes={ctx.equipes}
          campos={ctx.campos}
          formatoTitulo={ctx.quadro.formatoTitulo}
          pessoas={ctx.pessoas.filter((p) => ctx.membros.includes(p.id))}
          todas={ctx.pessoas}
          hoje={hoje}
          usuarioId={dados.usuarioId ?? 0}
          podeExcluir={ctx.pode.excluir}
          somenteLeitura={!ctx.pode.manipular}
          onFechar={() => setTarefa(null)}
          onCriada={(novaId) => void abrir(novaId)}
          onSalvo={() => {
            void recarregar(true);
            if (tarefa.tipo === "editar")
              void chamar<{ tarefa: ContextoTarefa["tarefa"] }>(`/api/tarefas/${tarefa.ctx.tarefa.id}?contexto=tarefa`)
                .then((j) => setTarefa((a) => (a?.tipo === "editar" && a.ctx.tarefa.id === j.tarefa.id ? { ...a, ctx: { ...a.ctx, tarefa: j.tarefa } } : a)))
                .catch(() => {});
          }}
        />
      )}
    </>
  );
}

