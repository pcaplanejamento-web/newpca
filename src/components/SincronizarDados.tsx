"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef } from "react";

/** Intervalo mínimo entre duas consultas da versão (ms). */
const INTERVALO_MS = 10_000;

/**
 * SINCRONIZAR DADOS (infraestrutura, sem UI) — montado UMA vez no `AppShell`. As telas já vistas voltam na hora do cache
 * do navegador (`staleTimes` do `next.config`); este componente só manda recarregar quando HÁ DADO NOVO: ao voltar para a
 * janela e a cada navegação (no máximo a cada 10 s) consulta a versão dos dados (`GET /api/dados/versao`) e, se ela mudou,
 * `router.refresh()` (que também limpa o cache das outras telas). A versão chega do layout a cada refresh — a gravação
 * feita aqui (que já dá refresh) não recarrega de novo. Erro de rede = nada acontece.
 */
export function SincronizarDados({ versao }: { versao: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const busca = useSearchParams().toString();
  const conhecida = useRef(versao);
  const ultimaConsulta = useRef(Date.now());
  const consultando = useRef(false);

  // A versão do servidor (1ª carga e cada refresh) é a conhecida.
  useEffect(() => {
    conhecida.current = versao;
    ultimaConsulta.current = Date.now();
  }, [versao]);

  // biome-ignore lint/correctness/useExhaustiveDependencies: confere a cada NAVEGAÇÃO (pathname/busca mudaram).
  useEffect(() => {
    const conferir = async () => {
      if (consultando.current || document.visibilityState !== "visible") return;
      if (Date.now() - ultimaConsulta.current < INTERVALO_MS) return;
      consultando.current = true;
      ultimaConsulta.current = Date.now();
      try {
        const r = await fetch("/api/dados/versao", { cache: "no-store" });
        const j = (await r.json().catch(() => null)) as { ok?: boolean; versao?: string } | null;
        if (j?.ok && j.versao && j.versao !== conhecida.current) {
          conhecida.current = j.versao;
          router.refresh();
        }
      } catch {
        // sem rede: segue com o que está na tela
      } finally {
        consultando.current = false;
      }
    };
    void conferir(); // cada navegação (pathname/busca mudaram)
    const aoVoltar = () => void conferir();
    document.addEventListener("visibilitychange", aoVoltar);
    window.addEventListener("focus", aoVoltar);
    return () => {
      document.removeEventListener("visibilitychange", aoVoltar);
      window.removeEventListener("focus", aoVoltar);
    };
  }, [pathname, busca, router]);

  return null;
}
