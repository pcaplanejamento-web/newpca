"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { AcaoSelecao } from "./Selecao";
import type { AcaoCenti, UnidadeCenti } from "@/lib/centi-unidades-core";
import { anoInteiro, diasDoPeriodo, type LoteCenti, type PassoLote, periodosLidos, usaPeriodo } from "@/lib/empenhos-core";
import { dataIsoBrasilia } from "@/lib/format";
import { lerAnoNaCenti, pedirImportacao } from "@/lib/leitura-centi-cliente";
import { toast } from "./Toast";

/**
 * As UNIDADES ORÇAMENTÁRIAS da Centi (e as AÇÕES de cada uma — `listaAcoes`) para os dropdowns de Órgãos e Unidades (o vínculo é escolhido no banner do órgão e
 * da unidade). Carrega só quando o banner abre (`ativo`) e, com "Buscar na Centi" (a ação no rodapé da lista), lê o ano
 * atual pela API de empenhos SÓ para registrar as unidades — nenhum empenho é gravado (o lote em modo `unidades`).
 */
export function useUnidadesCenti(ativo: boolean) {
  const [lista, setLista] = useState<UnidadeCenti[] | null>(null);
  const [listaAcoes, setListaAcoes] = useState<AcaoCenti[]>([]);
  const [api, setApi] = useState<{ id: number; parametros: string } | null>(null);
  const [busca, setBusca] = useState<number | null>(null);
  const parar = useRef(false);

  const carregar = useCallback(async () => {
    try {
      const r = await fetch("/api/admin/centi-unidades");
      const j = (await r.json()) as { ok?: boolean; error?: string; unidades?: UnidadeCenti[]; acoes?: AcaoCenti[]; api?: { id: number; parametros: string } | null };
      if (!r.ok || !j.ok) throw new Error(j.error ?? "Erro ao carregar as unidades da Centi.");
      setLista(j.unidades ?? []);
      setListaAcoes(j.acoes ?? []);
      setApi(j.api ?? null);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro ao carregar as unidades da Centi.");
      setLista((l) => l ?? []);
    }
  }, []);
  useEffect(() => {
    if (ativo && lista === null) void carregar();
  }, [ativo, lista, carregar]);
  useEffect(
    () => () => {
      parar.current = true;
    },
    [],
  );

  const ano = Number(dataIsoBrasilia(new Date().toISOString()).slice(0, 4));

  async function buscar() {
    if (!api || busca != null) return;
    parar.current = false;
    const condutor = crypto.randomUUID();
    const passos: PassoLote[] = [];
    const total = diasDoPeriodo(anoInteiro(ano));
    setBusca(0);
    let lote: LoteCenti | null = null;
    try {
      lote = (await pedirImportacao<{ lote: LoteCenti }>(api.id, { acao: "iniciar", ano, condutor, modo: "unidades" })).lote;
      let local = -1;
      lote = await lerAnoNaCenti({
        apiId: api.id,
        lote,
        anteriores: [],
        condutor,
        comPeriodo: usaPeriodo(api.parametros),
        parar: () => parar.current,
        onPasso: (p) => {
          passos.push(p);
          setBusca(Math.min(99, Math.floor((periodosLidos(passos).reduce((s, x) => s + diasDoPeriodo(x), 0) / total) * 100)));
        },
        onLote: () => {},
        onAgora: () => {},
        idLocal: () => local--,
        onde: () => {},
      });
      if (parar.current) {
        await pedirImportacao(api.id, { acao: "cancelar", lote: lote.id, condutor, motivo: "Busca das unidades interrompida." }).catch(() => {});
        return;
      }
      const fim = (await pedirImportacao<{ lote: LoteCenti }>(api.id, { acao: "concluir", lote: lote.id, condutor })).lote;
      toast.success(fim.mensagem ?? "Unidades orçamentárias da Centi atualizadas.");
      await carregar();
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Falha ao buscar na Centi.";
      if (lote) await pedirImportacao(api.id, { acao: "cancelar", lote: lote.id, condutor, falhou: true, motivo: `Busca das unidades: ${msg}`.slice(0, 300) }).catch(() => {});
      toast.error(`Não foi possível buscar na Centi: ${msg}`);
    } finally {
      setBusca(null);
    }
  }

  /** A ação no rodapé da lista do dropdown (o andamento no próprio rótulo). */
  const acoes: AcaoSelecao[] = api
    ? [{ rotulo: busca == null ? `Buscar na Centi (${ano})` : `Buscando na Centi… ${busca}%`, disabled: busca != null, onClick: () => void buscar() }]
    : [];

  return { lista, listaAcoes, acoes, buscando: busca != null, recarregar: carregar };
}

/**
 * A caixa do `Selecao` nas células "Empenhos (Centi)" de Órgãos e Unidades: discreta (sem borda, realce ao passar), na
 * altura da linha compacta, o texto INTEIRO (a coluna cresce — nada é abreviado); sem vínculo, em âmbar.
 */
export function classeCelulaCenti(semVinculo: boolean): string {
  return `min-h-11 w-max max-w-none rounded-control px-2 text-[12px] font-medium whitespace-nowrap transition-colors hover:bg-surface-2 lg:min-h-[calc(var(--h-control-sm)-6px)] ${semVinculo ? "text-warn" : "text-text-2"}`;
}
