"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { type BaseExec, montarBase, type MetaExec, type PacoteExec } from "@/lib/execucao-dash-core";
import { DashboardExecucao } from "./DashboardExecucao";
import { DashboardExecucaoEsqueleto } from "./DashboardExecucaoEsqueleto";
import { ErroCarga } from "./ErroCarga";
import { EsqueletoTitulo } from "./EsqueletoTela";

/**
 * A TELA DA EXECUÇÃO (contêiner): pede o pacote (`GET /api/execucao?anos=`) e o indexa UMA vez (`montarBase`); tudo o
 * mais é calculado no navegador pelo núcleo (`execucao-dash-core.ts`). Trocar os anos pede de novo (o resto não); uma
 * `versao` nova (importação concluída — o `SincronizarDados` recarrega a tela) também. Enquanto um pedido corre, a tela
 * segue com os números anteriores (esmaecidos); a 1ª carga mostra o esqueleto.
 */
export function ExecucaoView({ versao, hoje, podeExportar }: { versao: string; hoje: string; podeExportar: boolean }) {
  const [anos, setAnos] = useState<number[] | null>(null);
  const [base, setBase] = useState<BaseExec | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [carregando, setCarregando] = useState(true);
  const pedido = useRef(0);
  // Os anos que o SERVIDOR escolheu (o 1º pedido vai sem anos): fixá-los na tela não pede de novo.
  const escolhidosPeloServidor = useRef<string | null>(null);
  const anosChave = anos?.join(",") ?? "";

  const carregar = useCallback(async (lista: string) => {
    const n = ++pedido.current;
    setCarregando(true);
    setErro(null);
    try {
      const r = await fetch(`/api/execucao${lista ? `?anos=${lista}` : ""}`, { cache: "no-store" });
      const texto = await r.text();
      if (n !== pedido.current) return;
      let j: { ok?: boolean; error?: string; pacote?: PacoteExec; meta?: MetaExec[] };
      try {
        j = JSON.parse(texto) as typeof j;
      } catch {
        // A resposta não é JSON (o servidor caiu no meio): a mensagem da tela, com o status.
        throw new Error(`Não foi possível carregar os dados da execução (erro ${r.status}). Tente de novo.`);
      }
      if (!r.ok || !j.ok || !j.pacote) throw new Error(j.error || "Não foi possível carregar os dados da execução.");
      const b = montarBase({ ...j.pacote, meta: j.meta ?? [] });
      setBase(b);
      // O servidor escolhe o ano quando nenhum foi pedido (o mais recente): a tela passa a mostrar o escolhido.
      if (!lista) {
        escolhidosPeloServidor.current = b.anos.join(",");
        setAnos(b.anos);
      }
    } catch (e) {
      if (n === pedido.current) setErro(e instanceof Error ? e.message : "Não foi possível carregar os dados da execução.");
    } finally {
      if (n === pedido.current) setCarregando(false);
    }
  }, []);

  // biome-ignore lint/correctness/useExhaustiveDependencies: a versão do servidor também pede de novo (importação nova).
  useEffect(() => {
    // Os anos só passaram a mostrar os que o servidor escolheu (os dados já chegaram): nada a pedir.
    if (anosChave && anosChave === escolhidosPeloServidor.current) {
      escolhidosPeloServidor.current = null;
      return;
    }
    escolhidosPeloServidor.current = null;
    void carregar(anosChave);
  }, [anosChave, versao, carregar]);

  const trocarAnos = useMemo(
    () => (l: number[]) => {
      // Sempre ao menos um ano (nenhum = o mais recente dos carregados).
      if (!l.length) return;
      setAnos([...l].sort((a, b) => b - a));
    },
    [],
  );

  if (!base) {
    return (
      <div className="space-y-[var(--gap-block)]">
        <EsqueletoTitulo />
        {erro ? <ErroCarga msg={erro} onTentar={() => void carregar(anosChave)} /> : <DashboardExecucaoEsqueleto />}
      </div>
    );
  }
  return (
    <DashboardExecucao
      base={base}
      anos={anos ?? base.anos}
      onAnos={trocarAnos}
      carregando={carregando}
      erro={erro}
      onTentar={() => void carregar(anosChave)}
      hoje={hoje}
      podeExportar={podeExportar}
    />
  );
}
