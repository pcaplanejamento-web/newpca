"use client";

import { useCallback, useEffect, useState } from "react";
import { DURACOES_AGENDAMENTO, MAX_PAGINAS_AGENDAMENTO, type PaginaAgendamento, slugDe, slugValido } from "@/lib/agendamento-core";
import { chamarPadronizacao as chamar } from "@/lib/padronizacao-cliente";
import { BotaoCopiar } from "./BotaoCopiar";
import { Button } from "./Button";
import { Callout } from "./Callout";
import { useConfirmacao } from "./Confirmacao";
import { SelectField, TextArea, TextField } from "./Field";
import { IconPencil, IconPlus, IconTrash } from "./icons";
import { LinkExterno } from "./LinkExterno";
import { Modal } from "./Modal";
import { type OpcaoBusca, SeletorBusca } from "./SeletorBusca";
import { Switch } from "./Switch";
import { toast } from "./Toast";

type Pagina = PaginaAgendamento & { tarefaTitulo: string };
type Rascunho = Omit<PaginaAgendamento, "id" | "usuarioId" | "tarefaId"> & { tarefaId: string };
const SEMANA = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];
const NOVO: Rascunho = { tarefaId: "", slug: "", titulo: "", descricao: null, duracaoMin: 30, dias: [1, 2, 3, 4, 5], horaInicio: "08:00", horaFim: "17:00", antecedenciaH: 2, janelaDias: 30, ativa: true };

/** Por que o rascunho ainda não pode ser salvo (`null` = pode). */
function problema(r: Rascunho): string | null {
  if (!r.titulo.trim()) return "Dê um título à página.";
  if (!slugValido(r.slug)) return "Endereço: 3 a 40 letras minúsculas, números ou hífen.";
  if (!r.tarefaId) return "Escolha a tarefa onde os agendamentos entram.";
  if (!r.dias.length) return "Escolha ao menos um dia da semana.";
  if (!(r.horaFim > r.horaInicio)) return "O fim precisa ser depois do início.";
  return null;
}

/**
 * PÁGINAS DE AGENDAMENTO (as Configurações do calendário): o link público `/agendar/<endereço>` onde qualquer pessoa marca
 * um horário livre seu — os dias e o horário de atendimento, a duração, a antecedência mínima e até quantos dias à frente.
 * Cada agendamento vira um EVENTO na tarefa escolhida (e avisa você no sino). Ligar/desligar sem apagar.
 */
export function PaginasAgendamento({ tarefas, demo }: { tarefas: OpcaoBusca[]; /** Catálogo: as páginas prontas (sem buscar no servidor). */ demo?: Pagina[] }) {
  const [paginas, setPaginas] = useState<Pagina[] | null>(demo ?? null);
  const [edicao, setEdicao] = useState<{ id: number | null; r: Rascunho } | null>(null);
  const [salvando, setSalvando] = useState(false);
  const { confirmar, confirmacao } = useConfirmacao();
  const carregar = useCallback(async () => {
    try {
      setPaginas((await chamar<{ paginas: Pagina[] }>("/api/calendario/agendamento")).paginas);
    } catch (e) {
      toast.error((e as Error).message);
      setPaginas([]);
    }
  }, []);
  useEffect(() => {
    if (!demo) void carregar();
  }, [carregar, demo]);

  const salvar = async () => {
    if (!edicao) return;
    const { tarefaId, ...resto } = edicao.r;
    const corpo = { ...resto, tarefaId: Number(tarefaId), descricao: resto.descricao?.trim() || null };
    setSalvando(true);
    try {
      if (edicao.id) await chamar(`/api/calendario/agendamento/${edicao.id}`, "PATCH", corpo);
      else await chamar("/api/calendario/agendamento", "POST", corpo);
      toast.success("Página de agendamento salva.");
      setEdicao(null);
      void carregar();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setSalvando(false);
    }
  };
  const alternar = async (p: Pagina, ativa: boolean) => {
    setPaginas((l) => l?.map((x) => (x.id === p.id ? { ...x, ativa } : x)) ?? l);
    try {
      await chamar(`/api/calendario/agendamento/${p.id}`, "PATCH", { ativa });
    } catch (e) {
      toast.error((e as Error).message);
      void carregar();
    }
  };
  const excluir = async (p: Pagina) => {
    if (!(await confirmar({ titulo: `Excluir a página "${p.titulo}"?`, texto: "O link deixa de funcionar. Os horários já marcados continuam na tarefa.", confirmar: "Excluir", perigo: true }))) return;
    try {
      await chamar(`/api/calendario/agendamento/${p.id}`, "DELETE");
      void carregar();
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  const origem = typeof window === "undefined" ? "" : window.location.origin;
  const r = edicao?.r;
  const set = (patch: Partial<Rascunho>) => edicao && setEdicao({ ...edicao, r: { ...edicao.r, ...patch } });
  const erro = r ? problema(r) : null;
  return (
    <section className="space-y-2 rounded-card border border-border bg-surface p-2" aria-label="Páginas de agendamento">
      <div className="flex items-center justify-between gap-2 px-1">
        <p className="text-[12px] font-semibold text-text-2">Páginas de agendamento</p>
        {tarefas.length > 0 && (paginas?.length ?? 0) < MAX_PAGINAS_AGENDAMENTO && (
          <Button variant="ghost" size="sm" icon={<IconPlus className="h-4 w-4" />} onClick={() => setEdicao({ id: null, r: NOVO })}>
            Nova
          </Button>
        )}
      </div>
      {paginas === null ? (
        <p className="px-1 text-[12px] text-muted">Carregando…</p>
      ) : paginas.length === 0 ? (
        <p className="px-1 text-[12px] text-muted">Publique um link onde as pessoas marcam um horário livre seu — o agendamento vira um evento numa tarefa.</p>
      ) : (
        <ul className="space-y-1.5">
          {paginas.map((p) => {
            const link = `${origem}/agendar/${p.slug}`;
            return (
              <li key={p.id} className="space-y-1.5 rounded-control bg-surface-2 p-2">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="truncate text-[12.5px] font-semibold text-text">{p.titulo}</p>
                    <p className="truncate text-[11px] text-muted">
                      {p.duracaoMin} min · {p.dias.map((d) => SEMANA[d]).join(", ")} · {p.horaInicio}–{p.horaFim} · {p.tarefaTitulo}
                    </p>
                  </div>
                  <Switch checked={p.ativa} onChange={(v) => alternar(p, v)} label="" />
                </div>
                <p className="break-all font-mono text-[10.5px] text-text-2">{link}</p>
                <div className="flex flex-wrap items-center gap-1.5">
                  <BotaoCopiar texto={link} rotulo="Copiar link" />
                  <LinkExterno href={link}>Abrir</LinkExterno>
                  <Button variant="ghost" size="sm" aria-label={`Editar ${p.titulo}`} icon={<IconPencil className="h-4 w-4" />} onClick={() => setEdicao({ id: p.id, r: { ...p, tarefaId: String(p.tarefaId) } })} />
                  <Button variant="ghost" size="sm" aria-label={`Excluir ${p.titulo}`} icon={<IconTrash className="h-4 w-4" style={{ color: "var(--danger)" }} />} onClick={() => excluir(p)} />
                </div>
              </li>
            );
          })}
        </ul>
      )}
      <Modal
        open={!!edicao}
        onClose={() => !salvando && setEdicao(null)}
        titulo={edicao?.id ? "Editar página de agendamento" : "Nova página de agendamento"}
        size="md"
        bloqueado={salvando}
        rodape={
          <div className="flex items-center justify-end gap-2">
            <Button variant="ghost" onClick={() => setEdicao(null)} disabled={salvando}>
              Cancelar
            </Button>
            <Button onClick={salvar} loading={salvando} disabled={!!erro} title={erro ?? undefined}>
              Salvar
            </Button>
          </div>
        }
      >
        {r && (
          <div className="space-y-3">
            <TextField
              label="Título"
              value={r.titulo}
              maxLength={80}
              placeholder="Ex.: Atendimento do PCA"
              onChange={(e) => set({ titulo: e.target.value, ...(edicao?.id || (r.slug && r.slug !== slugDe(r.titulo)) ? {} : { slug: slugDe(e.target.value) }) })}
            />
            <TextField label="Endereço" hint={`${origem}/agendar/${r.slug || "…"}`} value={r.slug} maxLength={40} onChange={(e) => set({ slug: e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, "") })} />
            <div>
              <p className="mb-1.5 text-[13.5px] font-bold text-text">Tarefa (onde os agendamentos entram)</p>
              <SeletorBusca opcoes={tarefas} valor={r.tarefaId} onChange={(v) => set({ tarefaId: v })} ariaLabel="Tarefa da página" placeholder="Buscar tarefa por título ou #ticket" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <SelectField label="Duração" value={String(r.duracaoMin)} onChange={(e) => set({ duracaoMin: Number(e.target.value) })}>
                {DURACOES_AGENDAMENTO.map((d) => (
                  <option key={d} value={d}>
                    {d} min
                  </option>
                ))}
              </SelectField>
              <TextField label="Antecedência mínima (h)" type="number" min={0} max={168} value={String(r.antecedenciaH)} onChange={(e) => set({ antecedenciaH: Math.max(0, Math.min(168, Number(e.target.value) || 0)) })} />
              <TextField label="Das" type="time" value={r.horaInicio} onChange={(e) => set({ horaInicio: e.target.value })} />
              <TextField label="Às" type="time" value={r.horaFim} onChange={(e) => set({ horaFim: e.target.value })} />
            </div>
            <fieldset className="border-0 p-0">
              <legend className="mb-1.5 text-[13.5px] font-bold text-text">Dias de atendimento</legend>
              <div className="flex flex-wrap gap-1">
                {SEMANA.map((d, i) => {
                  const on = r.dias.includes(i);
                  return (
                    <button
                      key={d}
                      type="button"
                      aria-pressed={on}
                      onClick={() => set({ dias: on ? r.dias.filter((x) => x !== i) : [...r.dias, i].sort() })}
                      className={`min-h-11 min-w-11 rounded-control px-2 text-[12.5px] font-semibold lg:min-h-9 ${on ? "bg-accent text-white" : "bg-surface-2 text-text-2 hover:bg-border"}`}
                    >
                      {d}
                    </button>
                  );
                })}
              </div>
            </fieldset>
            <TextField label="Até quantos dias à frente" type="number" min={1} max={90} value={String(r.janelaDias)} onChange={(e) => set({ janelaDias: Math.max(1, Math.min(90, Number(e.target.value) || 1)) })} />
            <TextArea label="Descrição (opcional)" rows={2} maxLength={1000} value={r.descricao ?? ""} onChange={(e) => set({ descricao: e.target.value })} />
            {erro && <Callout kind="info">{erro}</Callout>}
          </div>
        )}
      </Modal>
      {confirmacao}
    </section>
  );
}
