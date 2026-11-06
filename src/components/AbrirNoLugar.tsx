"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { dataIsoBrasilia } from "@/lib/format";
import { chamarPadronizacao as chamar } from "@/lib/padronizacao-cliente";
import type { ContextoTarefa } from "@/lib/tarefas-dados";
import { itemDoVinculo } from "@/lib/tarefas-core";
import { type AberturaMesa, BannersMesa } from "./BannersMesa";
import { VisualizadorPdf } from "./DocumentosView";
import type { PcaOpcao } from "./PcaPicker";
import { TarefaDetalhe } from "./TarefaDetalhe";
import { toast } from "./Toast";

/** O registro que a pesquisa abre NA TELA em que a pessoa está (o componente padrão dele, sem navegar). */
export type AlvoNoLugar = { tipo: "mesa"; abrir: AberturaMesa } | { tipo: "tarefa"; id: number } | { tipo: "documento"; id: number; nome: string };

/** O resultado da pesquisa (tipo + id) → o que abre no lugar; `null` = o tipo abre na tela dele (navega). */
export function alvoNoLugar(tipo: string, id: number, rotulo: string): AlvoNoLugar | null {
  if (!Number.isInteger(id) || id <= 0) return null;
  if (tipo === "protocolo" || tipo === "dfd") return { tipo: "mesa", abrir: { tipo, id } };
  if (tipo === "item") {
    const { dfdId, item } = itemDoVinculo(id);
    return dfdId > 0 ? { tipo: "mesa", abrir: { tipo: "item", dfdId, itemId: id, item: { item, codigo: null } } } : null;
  }
  if (tipo === "tarefa") return { tipo: "tarefa", id };
  if (tipo === "documento") return { tipo: "documento", id, nome: rotulo };
  return null;
}

type ContextoMesa = Pick<Parameters<typeof BannersMesa>[0], "pode" | "reparticoes" | "regras" | "orgaos"> & { pcas: PcaOpcao[] };

// O contexto dos banners da Mesa fica na MEMÓRIA da aba (5 min) — pedido só na 1ª abertura.
const VALIDADE = 5 * 60_000;
let contextoMem: { em: number; ctx: ContextoMesa } | null = null;
async function contextoMesa(): Promise<ContextoMesa> {
  if (contextoMem && Date.now() - contextoMem.em < VALIDADE) return contextoMem.ctx;
  const ctx = await chamar<ContextoMesa>("/api/pesquisa/banners");
  contextoMem = { em: Date.now(), ctx };
  return ctx;
}

/**
 * Abre o registro achado na PESQUISA DO SISTEMA por cima da tela atual, no COMPONENTE PADRÃO dele: o protocolo, o DFD e o
 * item na pilha de banners da Mesa (`BannersMesa` — edição e permissões de sempre), a tarefa no `TarefaDetalhe` e o
 * documento no `VisualizadorPdf`. Os dados vêm das rotas de cada registro (escopo e papel conferidos lá).
 */
export function AbrirNoLugar({
  alvo,
  usuarioId,
  onFechar,
  onTrocar,
}: {
  alvo: AlvoNoLugar | null;
  usuarioId: number;
  onFechar: () => void;
  /** A pilha pede OUTRA abertura (ex.: o protocolo atual de um DFD sobrescrito). */
  onTrocar: (a: AlvoNoLugar) => void;
}) {
  const router = useRouter();
  const [mesa, setMesa] = useState<ContextoMesa | null>(contextoMem?.ctx ?? null);
  const [tarefa, setTarefa] = useState<ContextoTarefa | null>(null);

  useEffect(() => {
    if (!alvo) return;
    let vivo = true;
    const falhou = (e: unknown) => {
      if (!vivo) return;
      toast.error((e as Error).message || "Não foi possível abrir.");
      onFechar();
    };
    if (alvo.tipo === "mesa") contextoMesa().then((c) => vivo && setMesa(c), falhou);
    if (alvo.tipo === "tarefa") {
      setTarefa(null);
      chamar<{ contexto: ContextoTarefa }>(`/api/tarefas/${alvo.id}?contexto=1`).then((j) => vivo && setTarefa(j.contexto), falhou);
    }
    return () => {
      vivo = false;
    };
  }, [alvo, onFechar]);

  if (!alvo) return null;
  if (alvo.tipo === "documento")
    return <VisualizadorPdf doc={{ id: alvo.id, nome: alvo.nome, nomeArquivo: `${alvo.nome}.pdf` }} onFechar={onFechar} />;
  if (alvo.tipo === "mesa")
    return mesa ? (
      <BannersMesa
        abrir={alvo.abrir}
        onFechar={onFechar}
        onAbrir={(a) => onTrocar({ tipo: "mesa", abrir: a })}
        pode={mesa.pode}
        reparticoes={mesa.reparticoes}
        reparticaoAtivaId={null}
        regras={mesa.regras}
        orgaos={mesa.orgaos}
        pcas={mesa.pcas}
        onAlterado={() => router.refresh()}
      />
    ) : null;
  if (!tarefa || tarefa.tarefa.id !== alvo.id) return null;
  return (
    <TarefaDetalhe
      aberto={{ tipo: "editar", id: tarefa.tarefa.id }}
      quadroId={tarefa.quadro.id}
      tarefas={[tarefa.tarefa]}
      listas={tarefa.listas.filter((l) => !l.arquivada)}
      etiquetas={tarefa.etiquetas}
      equipes={tarefa.equipes}
      campos={tarefa.campos}
      formatoTitulo={tarefa.quadro.formatoTitulo}
      pessoas={tarefa.pessoas.filter((p) => tarefa.membros.includes(p.id))}
      todas={tarefa.pessoas}
      hoje={dataIsoBrasilia(new Date().toISOString())}
      usuarioId={usuarioId}
      podeExcluir={tarefa.pode.excluir}
      somenteLeitura={!tarefa.pode.manipular}
      onFechar={onFechar}
      onSalvo={() => {
        router.refresh();
        void chamar<{ tarefa: ContextoTarefa["tarefa"] }>(`/api/tarefas/${tarefa.tarefa.id}?contexto=tarefa`)
          .then((j) => setTarefa((t) => (t && t.tarefa.id === j.tarefa.id ? { ...t, tarefa: j.tarefa } : t)))
          .catch(() => {});
      }}
    />
  );
}
