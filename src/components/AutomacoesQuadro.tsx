"use client";

import { useState } from "react";
import { chamarPadronizacao as chamar } from "@/lib/padronizacao-cliente";
import { nomeExibicao, type Pessoa } from "@/lib/pessoa";
import {
  type AcaoAutomacao,
  type Automacao,
  type EtiquetaTarefa,
  type ListaTarefas,
  MAX_AUTOMACOES,
  PRIORIDADES,
  type Prioridade,
  ROTULO_ACAO,
  ROTULO_PRIORIDADE,
  TIPOS_ACAO,
  type TipoAcao,
} from "@/lib/tarefas-core";
import { Badge } from "./Badge";
import { Button } from "./Button";
import { SelectField, TextField } from "./Field";
import { IconAutomacao, IconModelo, IconPlus, IconRepetir, IconTrash } from "./icons";
import { Switch } from "./Switch";

/** Quem grava: a mesma trava/aviso/recarga da Configuração do quadro. */
type Gravar = (chave: string, fn: () => Promise<unknown>, sucesso: string) => Promise<boolean>;

/** A regra em FRASE ("Quando entrar em Em andamento, atribuir a Ana"). */
export function fraseAutomacao(a: Pick<Automacao, "gatilho" | "listaId" | "acao">, ctx: { listas: ListaTarefas[]; etiquetas: EtiquetaTarefa[]; pessoas: Pessoa[] }): string {
  const lista = (id: number | null) => ctx.listas.find((l) => l.id === id)?.nome ?? "(lista excluída)";
  const quando = a.gatilho === "entrar_lista" ? `Quando entrar em “${lista(a.listaId)}”` : "Quando for concluída";
  const x = a.acao;
  const alvo =
    x.tipo === "mover_lista"
      ? `“${lista(x.listaId)}”`
      : x.tipo === "atribuir"
        ? (() => {
            const p = ctx.pessoas.find((y) => y.id === x.usuarioId);
            return p ? nomeExibicao(p) : "(pessoa fora do grupo)";
          })()
        : x.tipo === "etiquetar"
          ? `“${ctx.etiquetas.find((e) => e.id === x.etiquetaId)?.nome ?? "(etiqueta excluída)"}”`
          : x.tipo === "prioridade"
            ? ROTULO_PRIORIDADE[x.prioridade]
            : "";
  return `${quando}, ${ROTULO_ACAO[x.tipo]}${alvo ? ` ${alvo}` : ""}`;
}

/**
 * AUTOMAÇÕES do quadro (na Configuração): as regras em frase — "Quando entrar na lista X / for concluída, fazer Y" (mover,
 * atribuir, etiquetar, prioridade, notificar) — com liga/desliga e excluir; editores criam (até 20). A regra da RECORRÊNCIA
 * é nativa e aparece fixa. Uma ação de automação não dispara outra (sem laço).
 */
export function AutomacoesQuadro({
  quadroId,
  automacoes,
  listas,
  etiquetas,
  pessoas,
  podeEditar,
  ocupado,
  gravar,
}: {
  quadroId: number;
  automacoes: Automacao[];
  /** As listas ATIVAS. */
  listas: ListaTarefas[];
  etiquetas: EtiquetaTarefa[];
  /** As pessoas do grupo (atribuir). */
  pessoas: Pessoa[];
  podeEditar: boolean;
  ocupado: boolean;
  gravar: Gravar;
}) {
  const [quando, setQuando] = useState(listas[0] ? `lista:${listas[0].id}` : "concluir");
  const [tipo, setTipo] = useState<TipoAcao>("atribuir");
  const [alvo, setAlvo] = useState("");
  const ctx = { listas, etiquetas, pessoas };
  const opcoesAlvo: { value: string; label: string }[] =
    tipo === "mover_lista"
      ? listas.map((l) => ({ value: String(l.id), label: l.nome }))
      : tipo === "atribuir"
        ? pessoas.map((p) => ({ value: String(p.id), label: nomeExibicao(p) }))
        : tipo === "etiquetar"
          ? etiquetas.map((e) => ({ value: String(e.id), label: e.nome }))
          : tipo === "prioridade"
            ? PRIORIDADES.map((p) => ({ value: p, label: ROTULO_PRIORIDADE[p] }))
            : [];
  const alvoAtual = opcoesAlvo.some((o) => o.value === alvo) ? alvo : (opcoesAlvo[0]?.value ?? "");
  const acao: AcaoAutomacao | null =
    tipo === "notificar"
      ? { tipo }
      : !alvoAtual
        ? null
        : tipo === "mover_lista"
          ? { tipo, listaId: Number(alvoAtual) }
          : tipo === "atribuir"
            ? { tipo, usuarioId: Number(alvoAtual) }
            : tipo === "etiquetar"
              ? { tipo, etiquetaId: Number(alvoAtual) }
              : { tipo: "prioridade", prioridade: alvoAtual as Prioridade };
  const gatilho = quando === "concluir" ? ("concluir" as const) : ("entrar_lista" as const);
  const listaId = quando.startsWith("lista:") ? Number(quando.slice(6)) : null;
  const mesmaLista = acao?.tipo === "mover_lista" && gatilho === "entrar_lista" && acao.listaId === listaId;
  const cheio = automacoes.length >= MAX_AUTOMACOES;

  const adicionar = () =>
    acao && gravar("automacao", () => chamar(`/api/tarefas/quadros/${quadroId}/automacoes`, "POST", { gatilho, listaId, acao }), "Automação criada.");

  return (
    <div className="space-y-3">
      <ul className="divide-y divide-border">
        <li className="flex min-h-11 items-center gap-2 py-1.5 text-[13px] text-text-2">
          <IconRepetir className="h-4 w-4 shrink-0 text-accent" />
          <span className="min-w-0 flex-1">Quando uma tarefa RECORRENTE for concluída, criar a próxima ocorrência</span>
          <Badge>Nativa</Badge>
        </li>
        {automacoes.map((a) => (
          <li key={a.id} className={`flex min-h-11 items-center gap-2 py-1.5 ${a.ativa ? "" : "opacity-60"}`}>
            <IconAutomacao className="h-4 w-4 shrink-0 text-accent" />
            <span className="min-w-0 flex-1 text-[13px] text-text">{fraseAutomacao(a, ctx)}</span>
            {podeEditar ? (
              <>
                <Switch
                  checked={a.ativa}
                  disabled={ocupado}
                  onChange={(ativa) => gravar(`auto-${a.id}`, () => chamar(`/api/tarefas/automacoes/${a.id}`, "PATCH", { ativa }), ativa ? "Automação ligada." : "Automação desligada.")}
                />
                <Button
                  variant="ghost"
                  size="xs"
                  disabled={ocupado}
                  aria-label="Excluir automação"
                  style={{ color: "var(--danger)" }}
                  icon={<IconTrash className="h-4 w-4" />}
                  onClick={() => gravar(`auto-${a.id}`, () => chamar(`/api/tarefas/automacoes/${a.id}`, "DELETE"), "Automação excluída.")}
                />
              </>
            ) : (
              !a.ativa && <Badge>Desligada</Badge>
            )}
          </li>
        ))}
      </ul>
      {podeEditar && (
        <div className="space-y-2 border-t border-border pt-3">
          <div className="grid gap-2 sm:grid-cols-3">
            <SelectField label="Quando" value={quando} disabled={ocupado || cheio} onChange={(e) => setQuando(e.target.value)}>
              {listas.map((l) => (
                <option key={l.id} value={`lista:${l.id}`}>
                  Entrar em “{l.nome}”
                </option>
              ))}
              <option value="concluir">For concluída</option>
            </SelectField>
            <SelectField label="Fazer" value={tipo} disabled={ocupado || cheio} onChange={(e) => setTipo(e.target.value as TipoAcao)}>
              {TIPOS_ACAO.map((t) => (
                <option key={t} value={t}>
                  {ROTULO_ACAO[t][0].toUpperCase() + ROTULO_ACAO[t].slice(1)}
                </option>
              ))}
            </SelectField>
            {tipo !== "notificar" && (
              <SelectField label="Com" value={alvoAtual} disabled={ocupado || cheio || !opcoesAlvo.length} onChange={(e) => setAlvo(e.target.value)}>
                {!opcoesAlvo.length && <option value="">Nada para escolher</option>}
                {opcoesAlvo.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </SelectField>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <p className="min-w-0 flex-1 text-[12.5px] text-muted">
              {cheio ? `Limite de ${MAX_AUTOMACOES} automações por quadro.` : mesmaLista ? "A regra moveria a tarefa para a mesma lista." : acao ? fraseAutomacao({ gatilho, listaId, acao }, ctx) : "Escolha o alvo."}
            </p>
            <Button size="sm" variant="secondary" disabled={ocupado || cheio || !acao || mesmaLista} icon={<IconPlus className="h-4 w-4" />} onClick={adicionar}>
              Adicionar automação
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

type ModeloLinha = { id: number; nome: string; criadoPor: number | null; detalhe: string };

/**
 * MODELOS na Configuração do quadro: "Salvar este quadro como modelo" (editores — listas + etiquetas, para o grupo do quadro;
 * o "Novo quadro" parte dele) e as listas dos modelos de QUADRO do grupo e de TAREFA deste quadro (excluir: quem salvou ou
 * um editor). Modelos de tarefa nascem pelo botão "Salvar como modelo" do detalhe da tarefa.
 */
export function ModelosQuadro({
  quadroId,
  quadroNome,
  modelosQuadro,
  modelosTarefa,
  usuarioId,
  podeEditar,
  ocupado,
  gravar,
}: {
  quadroId: number;
  quadroNome: string;
  modelosQuadro: ModeloLinha[];
  modelosTarefa: ModeloLinha[];
  usuarioId: number;
  podeEditar: boolean;
  ocupado: boolean;
  gravar: Gravar;
}) {
  const [nome, setNome] = useState(quadroNome);
  const lista = (titulo: string, ms: ModeloLinha[], vazio: string) => (
    <div>
      <p className="mb-1 text-[12px] font-semibold text-muted">{titulo}</p>
      {ms.length === 0 ? (
        <p className="text-[12.5px] text-muted">{vazio}</p>
      ) : (
        <ul className="divide-y divide-border">
          {ms.map((m) => (
            <li key={m.id} className="flex min-h-11 items-center gap-2 py-1.5">
              <IconModelo className="h-4 w-4 shrink-0 text-faint" />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[13px] font-medium text-text">{m.nome}</span>
                {m.detalhe && <span className="block truncate text-[11.5px] text-muted">{m.detalhe}</span>}
              </span>
              {(podeEditar || m.criadoPor === usuarioId) && (
                <Button
                  variant="ghost"
                  size="xs"
                  disabled={ocupado}
                  aria-label={`Excluir o modelo ${m.nome}`}
                  style={{ color: "var(--danger)" }}
                  icon={<IconTrash className="h-4 w-4" />}
                  onClick={() => gravar(`modelo-${m.id}`, () => chamar(`/api/tarefas/modelos/${m.id}`, "DELETE"), "Modelo excluído.")}
                />
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
  return (
    <div className="space-y-4">
      {podeEditar && (
        <div className="flex flex-wrap items-end gap-2">
          <div className="min-w-[12rem] flex-1">
            <TextField label="Salvar este quadro como modelo" value={nome} maxLength={80} disabled={ocupado} onChange={(e) => setNome(e.target.value)} />
          </div>
          <Button
            size="sm"
            variant="secondary"
            disabled={ocupado || !nome.trim()}
            icon={<IconModelo className="h-4 w-4" />}
            onClick={() => gravar("modelo", () => chamar("/api/tarefas/modelos", "POST", { tipo: "quadro", nome: nome.trim(), quadroId }), "Modelo de quadro salvo — use no “Novo quadro”.")}
          >
            Salvar modelo
          </Button>
        </div>
      )}
      {lista("Modelos de quadro do grupo", modelosQuadro, "Nenhum — salve este quadro como modelo para reaproveitar as listas e etiquetas.")}
      {lista("Modelos de tarefa deste quadro", modelosTarefa, "Nenhum — abra uma tarefa e toque em “Salvar como modelo”.")}
    </div>
  );
}
