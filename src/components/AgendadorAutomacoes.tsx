"use client";

import { useEffect } from "react";
import { AutomacaoViva, CHAVE_AUTOMACAO } from "./AutomacaoViva";
import { useRodarFora } from "./SegundoPlano";

type Agenda = { ok?: boolean; proxima?: string | null; devidos?: { id: number; proximaEm: string }[] };

/** Entre duas consultas da agenda: no máximo 10 min; com uma automação devida (esperando a extensão), 2 min. */
const MAX_ESPERA_MS = 10 * 60_000;
const ESPERA_DEVIDA_MS = 2 * 60_000;
/** Quanto tempo a Automação escondida fica viva até começar o trabalho (buscar os dados + a extensão responder). */
const PRAZO_MONTAGEM_MS = 180_000;
/** Quanto a sonda espera a extensão se anunciar (sem ela, nada roda — não vale montar a Automação). */
const ESPERA_SONDA_MS = 3_000;

/** A extensão está neste navegador? Pergunta à ponte da página (o mesmo "ola" → "pronto" da tela da Automação). */
function extensaoPresente(): Promise<boolean> {
  return new Promise((fim) => {
    const ouvir = (e: MessageEvent) => {
      if (e.source !== window || e.data?.fonte !== "pca-extensao" || e.data.tipo !== "pronto") return;
      acabar(true);
    };
    const t = window.setTimeout(() => acabar(false), ESPERA_SONDA_MS);
    function acabar(v: boolean) {
      window.clearTimeout(t);
      window.removeEventListener("message", ouvir);
      fim(v);
    }
    window.addEventListener("message", ouvir);
    window.postMessage({ fonte: "pca-automacao", tipo: "ola" }, window.location.origin);
  });
}

/**
 * O VIGIA dos AGENDAMENTOS das automações (só ADM, no layout do painel, sem UI): consulta a agenda (a próxima hora e os
 * fluxos devidos) e, chegada a hora, MONTA a tela da Automação ESCONDIDA (o mesmo caminho do disparo pela Mesa) — o
 * agendador dela reserva no servidor e roda, com o andamento no painel do canto. Assim o agendamento roda em QUALQUER tela
 * do sistema. UMA aba vigia por navegador (`navigator.locks` — fechada, outra assume).
 */
export function AgendadorAutomacoes() {
  const rodarFora = useRodarFora();
  useEffect(() => {
    if (!rodarFora) return;
    const ac = new AbortController();
    let timer = 0;
    let ultimo = "";
    let ultimoEm = 0;
    const agendar = (ms: number) => {
      window.clearTimeout(timer);
      timer = window.setTimeout(() => void verificar(), Math.max(30_000, Math.min(MAX_ESPERA_MS, ms)));
    };
    const verificar = async () => {
      if (ac.signal.aborted) return;
      try {
        const j = (await (await fetch("/api/admin/automacao/fluxos/agenda", { cache: "no-store", signal: ac.signal })).json()) as Agenda;
        if (!j.ok) return agendar(MAX_ESPERA_MS);
        const devidos = j.devidos ?? [];
        if (devidos.length) {
          // Uma montagem por conjunto de devidos (de novo só depois de 10 min — a extensão pode ter ficado pronta).
          const chave = devidos.map((d) => `${d.id}:${d.proximaEm}`).join(",");
          if (chave !== ultimo || Date.now() - ultimoEm > MAX_ESPERA_MS) {
            // Sem a extensão (celular, outro PC) nada pode rodar: não monta a Automação inteira à toa.
            if (!(await extensaoPresente())) return agendar(MAX_ESPERA_MS);
            if (ac.signal.aborted) return;
            ultimo = chave;
            ultimoEm = Date.now();
            rodarFora(CHAVE_AUTOMACAO, <AutomacaoViva />, PRAZO_MONTAGEM_MS);
          }
          return agendar(ESPERA_DEVIDA_MS);
        }
        agendar(j.proxima ? Date.parse(j.proxima) - Date.now() + 2_000 : MAX_ESPERA_MS);
      } catch {
        if (!ac.signal.aborted) agendar(MAX_ESPERA_MS);
      }
    };
    const aoVoltar = () => {
      if (document.visibilityState === "visible") void verificar();
    };
    const comecar = () => {
      document.addEventListener("visibilitychange", aoVoltar);
      void verificar();
    };
    const locks = (navigator as Navigator & { locks?: LockManager }).locks;
    if (locks)
      locks
        .request("automacao-vigia", { signal: ac.signal }, () => {
          comecar();
          return new Promise<void>((fim) => ac.signal.addEventListener("abort", () => fim()));
        })
        .catch(() => null);
    else comecar();
    return () => {
      ac.abort();
      window.clearTimeout(timer);
      document.removeEventListener("visibilitychange", aoVoltar);
    };
  }, [rodarFora]);
  return null;
}
