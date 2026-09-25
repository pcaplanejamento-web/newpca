"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState, useTransition } from "react";
import { dataBR } from "@/lib/format";
import { chamarPadronizacao as chamar } from "@/lib/padronizacao-cliente";
import type { Pessoa } from "@/lib/pessoa";
import {
  type EtiquetaTarefa,
  FILTRO_TAREFAS_PADRAO,
  type FiltroTarefas,
  filtrarTarefas,
  reagendar,
  rotuloTicket,
  type TarefaCalendario,
  textoMes,
} from "@/lib/tarefas-core";
import { FerramentasAba } from "./AbasEspaco";
import { Button } from "./Button";
import { CalendarioTarefas } from "./CalendarioTarefas";
import { SelectField } from "./Field";
import { ChipsFiltrosTarefas, FiltrosTarefas } from "./FiltrosTarefas";
import { IconKanban } from "./icons";
import { Modal } from "./Modal";
import { SeletorFiltro } from "./SeletorFiltro";
import { toast } from "./Toast";

/** O que a tela Calendário de todos os quadros recebe do servidor (`carregarCalendario`). */
export type DadosCalendarioQuadros = {
  tarefas: (TarefaCalendario & { quadroId: number })[];
  contadores: { atrasadas: number; hoje: number; naSemana: number; semPrazo: number };
  mes: { ano: number; mes: number };
  hoje: string;
  etiquetas: (EtiquetaTarefa & { quadroId: number })[];
  pessoas: Pessoa[];
  quadros: { id: number; nome: string; cor: string }[];
};

/**
 * CALENDÁRIO de TODOS os quadros do grupo (`/painel/calendario`, item do menu): o MESMO `CalendarioTarefas` do quadro, com
 * as tarefas de cada quadro na COR dele (legenda), os filtros do quadro (`FiltrosTarefas`) + o filtro de QUADRO. O mês vem
 * do servidor (`?mes=`). Tocar numa tarefa abre-a no quadro dela; "+" num dia escolhe o quadro (se houver mais de um) e
 * abre lá a tarefa nova com aquele prazo; arrastar para outro dia REAGENDA (otimista).
 */
export function CalendarioQuadros({ dados, usuarioId }: { dados: DadosCalendarioQuadros; usuarioId: number }) {
  const router = useRouter();
  const [carregando, iniciar] = useTransition();
  const [filtro, setFiltro] = useState<FiltroTarefas>(FILTRO_TAREFAS_PADRAO);
  const [quadro, setQuadro] = useState<number | null>(null);
  const [tarefas, setTarefas] = useState(dados.tarefas);
  useEffect(() => setTarefas(dados.tarefas), [dados.tarefas]);
  const [nova, setNova] = useState<{ dia: string; quadroId: number } | null>(null);

  const porId = useMemo(() => new Map(dados.quadros.map((q) => [q.id, q])), [dados.quadros]);
  const variosQuadros = dados.quadros.length > 1;
  const etiquetas = useMemo(
    () => dados.etiquetas.map((e) => (variosQuadros ? { ...e, nome: `${e.nome} · ${porId.get(e.quadroId)?.nome ?? ""}` } : e)),
    [dados.etiquetas, porId, variosQuadros],
  );
  const visiveis = useMemo(
    () => filtrarTarefas(tarefas, filtro, { usuarioId, hoje: dados.hoje }).filter((t) => quadro == null || t.quadroId === quadro),
    [tarefas, filtro, usuarioId, dados.hoje, quadro],
  );
  const q = quadro != null ? porId.get(quadro) : undefined;

  const irMes = (m: { ano: number; mes: number }) => iniciar(() => router.push(`/painel/calendario?mes=${textoMes(m.ano, m.mes)}`, { scroll: false }));
  const abrirNova = (dia: string, quadroId: number) => router.push(`/painel/tarefas/${quadroId}?aba=calendario&prazo=${dia}`);
  const reagendarTarefa = async (t: TarefaCalendario & { quadroId: number }, dia: string) => {
    const antes = tarefas;
    const novo = reagendar(t, dia);
    setTarefas(antes.map((x) => (x.id === t.id ? { ...x, ...novo } : x)));
    try {
      await chamar(`/api/tarefas/${t.id}`, "PATCH", novo);
      toast.success(`${rotuloTicket(t.ticket)} reagendada para ${dataBR(dia)}.`);
      router.refresh();
    } catch (e) {
      setTarefas(antes);
      toast.error((e as Error).message);
    }
  };

  if (!dados.quadros.length)
    return <p className="rounded-card border border-dashed border-border-2 bg-surface px-6 py-12 text-center text-sm text-muted">Nenhum quadro ativo neste grupo.</p>;

  return (
    <div className={`space-y-[var(--gap-block)] transition-opacity ${carregando ? "opacity-60" : ""}`} aria-busy={carregando}>
      <FerramentasAba>
        <FiltrosTarefas filtro={filtro} onChange={setFiltro} pessoas={dados.pessoas} etiquetas={etiquetas} usuarioId={usuarioId} />
        {variosQuadros && (
          <SeletorFiltro
            icone={q ? <span aria-hidden className="h-3.5 w-3.5 rounded-full" style={{ background: q.cor }} /> : <IconKanban className="h-4 w-4" />}
            rotulo="Quadro"
            valor={quadro == null ? "todos" : String(quadro)}
            ativo={quadro != null}
            onChange={(v) => setQuadro(v === "todos" ? null : Number(v))}
            opcoes={[{ valor: "todos", rotulo: "Todos os quadros" }, ...dados.quadros.map((x) => ({ valor: String(x.id), rotulo: x.nome }))]}
          />
        )}
      </FerramentasAba>
      <ChipsFiltrosTarefas filtro={filtro} onChange={setFiltro} pessoas={dados.pessoas} etiquetas={etiquetas} usuarioId={usuarioId} />
      <CalendarioTarefas
        tarefas={visiveis}
        hoje={dados.hoje}
        mes={dados.mes}
        onMes={irMes}
        contadores={dados.contadores}
        corDe={(t) => porId.get(t.quadroId)?.cor}
        onAbrir={(t) => router.push(`/painel/tarefas/${t.quadroId}?aba=calendario&tarefa=${t.id}`)}
        onNova={(dia) => (variosQuadros && quadro == null ? setNova({ dia, quadroId: dados.quadros[0].id }) : abrirNova(dia, quadro ?? dados.quadros[0].id))}
        onReagendar={reagendarTarefa}
        legenda={
          variosQuadros &&
          dados.quadros.map((x) => (
            <li key={x.id} className="inline-flex items-center gap-1">
              <span aria-hidden className="h-2.5 w-2.5 rounded-[3px]" style={{ background: x.cor }} />
              {x.nome}
            </li>
          ))
        }
      />
      <Modal
        open={nova != null}
        onClose={() => setNova(null)}
        titulo={nova ? `Nova tarefa — prazo ${dataBR(nova.dia)}` : "Nova tarefa"}
        size="md"
        rodape={
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setNova(null)}>
              Cancelar
            </Button>
            <Button
              disabled={!nova}
              onClick={() => {
                if (nova) abrirNova(nova.dia, nova.quadroId);
                setNova(null);
              }}
            >
              Continuar no quadro
            </Button>
          </div>
        }
      >
        {nova && (
          <SelectField label="Em qual quadro?" value={String(nova.quadroId)} onChange={(e) => setNova({ ...nova, quadroId: Number(e.target.value) })}>
            {dados.quadros.map((x) => (
              <option key={x.id} value={x.id}>
                {x.nome}
              </option>
            ))}
          </SelectField>
        )}
      </Modal>
    </div>
  );
}
