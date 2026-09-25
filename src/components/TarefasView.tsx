"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { num } from "@/lib/format";
import { chamarPadronizacao as chamar } from "@/lib/padronizacao-cliente";
import type { QuadroCard as QuadroCardDados } from "@/lib/tarefas";
import { AbasEspaco } from "./AbasEspaco";
import { AvisoFlutuante } from "./AvisoFlutuante";
import { Button } from "./Button";
import { CalendarioQuadros, type DadosCalendarioQuadros } from "./CalendarioQuadros";
import { SelectField } from "./Field";
import { IconInbox } from "./icons";
import { Modal } from "./Modal";
import { CamposQuadro, type CamposQuadroValor, QuadroCard, QuadroNovoCard } from "./QuadroCard";

const NOVO: CamposQuadroValor = { nome: "", cor: "#6366f1", descricao: "" };

/** Um MODELO de quadro que o "Novo quadro" pode usar (as listas, para a prévia). */
export type ModeloQuadroOpcao = { id: number; nome: string; listas: string[] };

export type AbaTarefas = "quadros" | "calendario";

/**
 * Módulo TAREFAS — duas abas (`AbasEspaco`; o servidor monta só a ativa): **Quadros** = os quadros do grupo ativo (cards
 * 4:5) + o card "+" (editor) que cria um quadro (em branco ou de um MODELO) no grupo ativo e o ABRE; **Calendário** = as
 * tarefas de TODOS os quadros do grupo num calendário só (`CalendarioQuadros`). 100% design-system.
 */
export function TarefasView({
  aba,
  quadros,
  podeCriar,
  modelos = [],
  calendario,
  usuarioId,
}: {
  aba: AbaTarefas;
  quadros: QuadroCardDados[];
  podeCriar: boolean;
  modelos?: ModeloQuadroOpcao[];
  /** Os dados da aba Calendário (só quando ela é a ativa). */
  calendario?: DadosCalendarioQuadros;
  usuarioId: number;
}) {
  const router = useRouter();
  const [novo, setNovo] = useState<CamposQuadroValor | null>(null);
  const [modeloId, setModeloId] = useState("");
  const modelo = modelos.find((m) => String(m.id) === modeloId);
  const [salvando, setSalvando] = useState(false);
  const [falha, setFalha] = useState<string | null>(null);
  const abertas = quadros.reduce((s, q) => s + (q.arquivado ? 0 : q.abertas), 0);
  const atrasadas = quadros.reduce((s, q) => s + (q.arquivado ? 0 : q.atrasadas), 0);

  async function criar() {
    if (!novo?.nome.trim()) return;
    setSalvando(true);
    setFalha(null);
    try {
      const j = await chamar<{ id: number }>("/api/tarefas/quadros", "POST", {
        nome: novo.nome.trim(),
        cor: novo.cor,
        descricao: novo.descricao.trim() || null,
        modeloId: modelo?.id ?? null,
      });
      setNovo(null);
      router.push(`/painel/tarefas/${j.id}`);
    } catch (e) {
      setFalha((e as Error).message);
      setSalvando(false);
    }
  }

  return (
    <div className="space-y-[var(--gap-block)]">
      <div>
        <h1 className="text-xl font-bold text-text">Tarefas</h1>
        <p className="text-sm text-muted">
          {quadros.length} {quadros.length === 1 ? "quadro" : "quadros"} · {num(abertas)} {abertas === 1 ? "tarefa aberta" : "tarefas abertas"}
          {atrasadas > 0 && <span style={{ color: "var(--danger)" }}> · {num(atrasadas)} atrasada{atrasadas === 1 ? "" : "s"}</span>} · do grupo ativo do cabeçalho
        </p>
      </div>

      <AbasEspaco<AbaTarefas>
        aba={aba}
        opcoes={[
          { value: "quadros", label: "Quadros" },
          { value: "calendario", label: "Calendário" },
        ]}
      >
      {aba === "calendario" && calendario ? (
        <CalendarioQuadros dados={calendario} usuarioId={usuarioId} />
      ) : quadros.length === 0 && !podeCriar ? (
        <div className="flex flex-col items-center gap-3 rounded-card border border-dashed border-border-2 bg-surface px-6 py-16 text-center">
          <IconInbox className="h-10 w-10 text-faint" />
          <p className="text-sm text-muted">Nenhum quadro de tarefas neste grupo.</p>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6">
          {quadros.map((q) => (
            <QuadroCard key={q.id} quadro={q} href={`/painel/tarefas/${q.id}`} />
          ))}
          {podeCriar && <QuadroNovoCard onClick={() => setNovo(NOVO)} />}
        </div>
      )}
      </AbasEspaco>

      <Modal
        open={novo != null}
        onClose={() => !salvando && setNovo(null)}
        titulo="Novo quadro"
        bloqueado={salvando}
        rodape={
          <div className="flex justify-end gap-2">
            <Button variant="ghost" disabled={salvando} onClick={() => setNovo(null)}>
              Cancelar
            </Button>
            <Button loading={salvando} disabled={!novo?.nome.trim()} onClick={criar}>
              Criar quadro
            </Button>
          </div>
        }
      >
        {modelos.length > 0 && (
          <div className="mb-4">
            <SelectField label="Começar de" value={modeloId} disabled={salvando} onChange={(e) => setModeloId(e.target.value)}>
              <option value="">Quadro em branco</option>
              {modelos.map((m) => (
                <option key={m.id} value={m.id}>
                  Modelo: {m.nome}
                </option>
              ))}
            </SelectField>
          </div>
        )}
        {novo && <CamposQuadro valor={novo} onChange={setNovo} />}
        <p className="mt-3 text-[12px] text-muted">
          Nasce com as listas {(modelo?.listas ?? ["A fazer", "Em andamento", "Concluído"]).join(" · ")}
          {modelo ? " e as etiquetas do modelo" : ""} — mude na Configuração do quadro.
        </p>
      </Modal>
      {falha && (
        <AvisoFlutuante kind="danger" titulo="Atenção" onClose={() => setFalha(null)}>
          {falha}
        </AvisoFlutuante>
      )}
    </div>
  );
}
