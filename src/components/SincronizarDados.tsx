"use client";

import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef } from "react";
import { type VersoesDados, versaoDaRota } from "@/lib/versao-dados-core";

/** Intervalo mínimo entre duas consultas da versão (ms). */
const INTERVALO_MS = 60_000;

/**
 * SINCRONIZAR DADOS (infraestrutura, sem UI) — montado UMA vez no `AppShell`. As telas já vistas voltam na hora do cache
 * do navegador (`staleTimes` do `next.config`); este componente só manda recarregar quando HÁ DADO NOVO PARA A TELA ABERTA:
 * ao voltar para a janela e a cada 60 s com a aba à vista (NÃO a cada navegação — trocar de tela usa o cache) consulta as
 * versões (`GET /api/dados/versao`) e, se a da ÁREA da rota mudou (`versaoDaRota`: Mesa/PCA/Orçamento/Catálogo/Verificação
 * = sem tarefas e agenda; as demais = a completa), `router.refresh()` (que também limpa o cache das outras telas). A mudança
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
        const j = (await r.json().catch(() => null)) as { ok?: boolean; versao?: string; dados?: string } | null;
        if (j?.ok && j.versao && j.dados) {
          ultima.current = { completa: j.versao, dados: j.dados };
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
