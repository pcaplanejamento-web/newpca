"use client";

import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef } from "react";
import { apagarDadosLocais } from "@/lib/dados-cliente";
import { sessaoEncerrada } from "@/lib/dados-cliente-core";
import { type VersoesDados, versaoDaRota } from "@/lib/versao-dados-core";

/** Intervalo mínimo entre duas consultas da versão (ms). */
const INTERVALO_MS = 60_000;

/**
 * SINCRONIZAR DADOS (infraestrutura, sem UI) — montado UMA vez no `AppShell`. As telas já vistas voltam na hora do cache
 * do navegador (`staleTimes` do `next.config`); este componente só manda recarregar quando HÁ DADO NOVO PARA A TELA ABERTA:
 * ao voltar para a janela e a cada 60 s com a aba à vista (NÃO a cada navegação — trocar de tela usa o cache) consulta as
 * versões (`GET /api/dados/versao`) e, se a da ÁREA da rota mudou (`versaoDaRota`: Mesa/PCA/Orçamento/Catálogo/Verificação
 * = sem tarefas e agenda; Tarefas, Calendário e Execução = só as delas; as demais = a completa), `router.refresh()` (que também limpa o cache das outras telas). A mudança
 * de OUTRA área fica guardada e recarrega ao ir a uma tela dela. As versões chegam do layout a cada refresh — a gravação feita aqui (que já dá refresh) não recarrega de novo. Erro de rede =
 * nada acontece.
 */
export function SincronizarDados({ versoes }: { versoes: VersoesDados }) {
  const router = useRouter();
  const pathname = usePathname();
  const conhecida = useRef(versoes);
  const rota = useRef(pathname);
  const ultimaConsulta = useRef(Date.now());
  const consultando = useRef(false);
  // A última versão lida do servidor que a tela ainda NÃO refletiu (a de outra área fica guardada para quando se for a ela).
  const ultima = useRef<VersoesDados | null>(null);
  const recarregar = useRef<(p: string) => void>(() => {});
  recarregar.current = (p) => {
    const nova = ultima.current;
    if (!nova || versaoDaRota(nova, p) === versaoDaRota(conhecida.current, p)) return;
    ultima.current = null;
    router.refresh();
  };

  // As versões do servidor (1ª carga e cada refresh) são as conhecidas.
  useEffect(() => {
    conhecida.current = versoes;
    ultima.current = null;
    ultimaConsulta.current = Date.now();
  }, [versoes]);

  // Ir a uma tela de outra área com dado novo já sabido = recarrega na hora (o cache dela pode estar antigo).
  useEffect(() => {
    rota.current = pathname;
    recarregar.current(pathname);
  }, [pathname]);

  useEffect(() => {
    const conferir = async () => {
      if (consultando.current || document.visibilityState !== "visible") return;
      if (Date.now() - ultimaConsulta.current < INTERVALO_MS) return;
      consultando.current = true;
      ultimaConsulta.current = Date.now();
      try {
        const r = await fetch("/api/dados/versao", { cache: "no-store" });
        // Sessão encerrada (saiu em outro aparelho, inatividade): nada fica guardado neste navegador.
        if (sessaoEncerrada(r.status)) void apagarDadosLocais();
        const j = (await r.json().catch(() => null)) as
          | { ok?: boolean; versao?: string; dados?: string; tarefas?: string; agenda?: string; execucao?: string }
          | null;
        if (j?.ok && j.versao && j.dados) {
          const c = conhecida.current;
          ultima.current = { completa: j.versao, dados: j.dados, tarefas: j.tarefas ?? c.tarefas, agenda: j.agenda ?? c.agenda, execucao: j.execucao ?? c.execucao };
          recarregar.current(rota.current);
        }
      } catch {
        // sem rede: segue com o que está na tela
      } finally {
        consultando.current = false;
      }
    };
    const aoVoltar = () => void conferir();
    const relogio = window.setInterval(aoVoltar, INTERVALO_MS);
    document.addEventListener("visibilitychange", aoVoltar);
    window.addEventListener("focus", aoVoltar);
    return () => {
      document.removeEventListener("visibilitychange", aoVoltar);
      window.removeEventListener("focus", aoVoltar);
      window.clearInterval(relogio);
    };
  }, [router]);

  return null;
}

/** Quantas telas do menu são pré-carregadas em segundo plano (as primeiras do menu). */
const MAX_PRE_CARGA = 6;
/** O intervalo entre duas telas pré-carregadas (ms) — uma por vez, sem disputar com a tela aberta. */
const PASSO_PRE_CARGA_MS = 1500;
/** O mínimo entre duas rodadas de pré-carga (ms) — a rodada recomeça depois de um refresh, que limpa o cache. */
const ENTRE_RODADAS_MS = 30 * 60_000;

/**
 * PRÉ-CARGA DAS TELAS (infraestrutura, sem UI) — montada UMA vez no `AppShell`. Com a tela aberta já pronta e o navegador
 * livre, busca em segundo plano as telas do menu, UMA por vez (`router.prefetch` completo, guardado pelo `staleTimes` de
 * 2 h): ir a qualquer uma delas abre na hora. Cada tela é um pedido próprio ao servidor (o limite do Worker vale por
 * pedido). Recomeça quando as versões mudam (o `router.refresh` limpou o cache), no máximo a cada 30 min (o plano gratuito conta 100 mil pedidos por dia). Não roda com a aba
 * escondida, em "economia de dados" nem em conexão 2G.
 */
export function PreCarregarTelas({ telas, versoes }: { telas: readonly string[]; versoes?: VersoesDados }) {
  const router = useRouter();
  const pathname = usePathname();
  const ultimaRodada = useRef(0);
  const aberta = useRef(pathname);
  aberta.current = pathname;
  const chave = telas.slice(0, MAX_PRE_CARGA).join("|");
  const versao = versoes ? `${versoes.completa}|${versoes.execucao}` : "";

  // biome-ignore lint/correctness/useExhaustiveDependencies: a rodada recomeça quando as versões mudam (o cache foi limpo)
  useEffect(() => {
    if (!chave || Date.now() - ultimaRodada.current < ENTRE_RODADAS_MS) return;
    const conexao = (navigator as Navigator & { connection?: { saveData?: boolean; effectiveType?: string } }).connection;
    if (conexao?.saveData || /2g/.test(conexao?.effectiveType ?? "")) return;
    ultimaRodada.current = Date.now();
    const fila = chave.split("|");
    let parado = false;
    let relogio = 0;
    const proxima = () => {
      if (parado) return;
      const href = fila.shift();
      if (!href) return;
      const ocioso = (window as Window & { requestIdleCallback?: (f: () => void, o?: { timeout: number }) => number }).requestIdleCallback;
      const buscar = () => {
        if (parado) return;
        // A aba escondida espera; a tela aberta não precisa (já está na tela).
        if (document.visibilityState === "visible" && href !== aberta.current) {
          try {
            router.prefetch(href, { kind: "full" as never });
          } catch {
            // pré-carga é só conforto: falhou, a tela carrega ao abrir
          }
        } else if (document.visibilityState !== "visible") fila.unshift(href);
        relogio = window.setTimeout(proxima, PASSO_PRE_CARGA_MS);
      };
      if (ocioso) ocioso(buscar, { timeout: 4000 });
      else buscar();
    };
    relogio = window.setTimeout(proxima, 3000);
    return () => {
      parado = true;
      window.clearTimeout(relogio);
    };
  }, [chave, versao, router]);

  return null;
}
