"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { type Classificacao, type ContextoFrota, contextoFrota, type Transacao, transacoesDoPacote, type Veiculo } from "@/lib/frota-core";
import type { TipoTransacao } from "@/lib/volus-core";

export type ContratoFrota = { codigo: string; sigla: string; nome: string };
export type UnidadeFrota = { id: number; codigo: string; nome: string };

/** Os VEÍCULOS e as classificações (`GET /api/frota/veiculos`) — as telas juntam pela placa. */
export function useCadastroFrota() {
  const [veiculos, setVeiculos] = useState<Veiculo[] | null>(null);
  const [classificacoes, setClassificacoes] = useState<Classificacao[]>([]);
  const [unidades, setUnidades] = useState<UnidadeFrota[]>([]);
  const [erro, setErro] = useState<string | null>(null);
  const recarregar = useCallback(async () => {
    setErro(null);
    try {
      const r = await fetch("/api/frota/veiculos", { cache: "no-store" });
      const j = (await r.json().catch(() => ({}))) as { ok?: boolean; error?: string; veiculos?: Veiculo[]; classificacoes?: Classificacao[]; unidades?: UnidadeFrota[] };
      if (!r.ok || !j.ok) throw new Error(j.error || "Não foi possível carregar os veículos.");
      setVeiculos(j.veiculos ?? []);
      setClassificacoes(j.classificacoes ?? []);
      setUnidades(j.unidades ?? []);
    } catch (e) {
      setErro((e as Error).message);
      setVeiculos((v) => v ?? []);
    }
  }, []);
  useEffect(() => {
    void recarregar();
  }, [recarregar]);
  return { veiculos, classificacoes, unidades, erro, recarregar, setVeiculos, setClassificacoes };
}

/**
 * As TRANSAÇÕES de um ano (`GET /api/frota/dados`, o pacote compacto) + o cadastro. Trocar o ano pede de novo; uma
 * `versao` nova da página (importação concluída — o `SincronizarDados` recarrega a tela) também.
 */
export function useDadosFrota({ tipo, ano, versao, contratos }: { tipo?: TipoTransacao; ano: number | null; versao: string; contratos: ContratoFrota[] }) {
  const cadastro = useCadastroFrota();
  const [transacoes, setTransacoes] = useState<Transacao[] | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [carregando, setCarregando] = useState(false);
  const pedido = useRef(0);
  const carregar = useCallback(async () => {
    if (ano == null) {
      setTransacoes([]);
      return;
    }
    const n = ++pedido.current;
    setCarregando(true);
    setErro(null);
    try {
      const r = await fetch(`/api/frota/dados?ano=${ano}${tipo ? `&tipo=${tipo}` : ""}`, { cache: "no-store" });
      const j = (await r.json().catch(() => ({}))) as { ok?: boolean; error?: string; pacote?: (string | number | null)[][] };
      if (n !== pedido.current) return;
      if (!r.ok || !j.ok) throw new Error(j.error || `Não foi possível carregar os dados da frota (erro ${r.status}).`);
      setTransacoes(transacoesDoPacote(j.pacote ?? []));
    } catch (e) {
      if (n === pedido.current) setErro((e as Error).message);
    } finally {
      if (n === pedido.current) setCarregando(false);
    }
  }, [ano, tipo]);
  // biome-ignore lint/correctness/useExhaustiveDependencies: a versão nova pede de novo
  useEffect(() => {
    void carregar();
  }, [carregar, versao]);
  const ctx: ContextoFrota = useMemo(() => contextoFrota(cadastro.veiculos ?? [], cadastro.classificacoes, contratos), [cadastro.veiculos, cadastro.classificacoes, contratos]);
  return { transacoes, ctx, erro: erro ?? cadastro.erro, carregando, recarregar: carregar, cadastro };
}

