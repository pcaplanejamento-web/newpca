"use client";

import { useTheme } from "next-themes";
import { useCallback, useEffect, useState } from "react";
import {
  CHAVE_TEMA,
  EVENTO_TEMA,
  HORARIO_DIA,
  lerPrefsTema,
  minutosAteTroca,
  PREFS_PADRAO,
  type PrefsTema,
  temaDoModo,
} from "@/lib/tema-pessoal-core";

const agoraMin = () => {
  const d = new Date();
  return d.getHours() * 60 + d.getMinutes();
};

/** As preferências guardadas neste navegador (sem acesso = o padrão). */
export function lerTemaPessoal(): PrefsTema {
  try {
    return lerPrefsTema(JSON.parse(localStorage.getItem(CHAVE_TEMA) ?? "null"));
  } catch {
    return PREFS_PADRAO;
  }
}

/** Grava e avisa a tela (o `TemaPessoal` aplica). */
export function gravarTemaPessoal(p: PrefsTema) {
  try {
    localStorage.setItem(CHAVE_TEMA, JSON.stringify(p));
  } catch {
    /* sem armazenamento: vale só nesta visita */
  }
  window.dispatchEvent(new CustomEvent<PrefsTema>(EVENTO_TEMA, { detail: p }));
}

/** O tom no <html> (carvão = sem atributo — o escuro do sistema/ADM). */
function aplicarTom(p: PrefsTema) {
  const html = document.documentElement;
  if (p.tom === "carvao") html.removeAttribute("data-escuro");
  else html.setAttribute("data-escuro", p.tom);
}

/** Mantém o tema da pessoa: aplica ao mudar as preferências (nesta aba ou em outra) e troca sozinho nos modos por horário. */
export function TemaPessoal() {
  const { setTheme } = useTheme();
  const [prefs, setPrefs] = useState<PrefsTema | null>(null);

  useEffect(() => {
    setPrefs(lerTemaPessoal());
    const aoMudar = (e: Event) => setPrefs((e as CustomEvent<PrefsTema>).detail);
    const aoArmazenar = (e: StorageEvent) => {
      if (e.key === CHAVE_TEMA) setPrefs(lerTemaPessoal());
    };
    window.addEventListener(EVENTO_TEMA, aoMudar);
    window.addEventListener("storage", aoArmazenar);
    return () => {
      window.removeEventListener(EVENTO_TEMA, aoMudar);
      window.removeEventListener("storage", aoArmazenar);
    };
  }, []);

  useEffect(() => {
    if (!prefs) return;
    aplicarTom(prefs);
    const aplicar = () => setTheme(temaDoModo(prefs, agoraMin()));
    aplicar();
    const faltam = minutosAteTroca(prefs, agoraMin());
    if (faltam == null) return;
    // Acorda no minuto da troca e confere ao voltar à aba (o relógio do navegador para em segundo plano).
    const segundos = 60 - new Date().getSeconds();
    const t = window.setTimeout(() => setPrefs({ ...prefs }), ((faltam - 1) * 60 + segundos) * 1000);
    const aoVoltar = () => {
      if (document.visibilityState === "visible") aplicar();
    };
    document.addEventListener("visibilitychange", aoVoltar);
    return () => {
      window.clearTimeout(t);
      document.removeEventListener("visibilitychange", aoVoltar);
    };
  }, [prefs, setTheme]);

  return null;
}

/** As preferências para uma tela que as edita (lidas depois da montagem). */
export function useTemaPessoal() {
  const [prefs, setPrefs] = useState<PrefsTema | null>(null);
  useEffect(() => {
    setPrefs(lerTemaPessoal());
    const aoMudar = (e: Event) => setPrefs((e as CustomEvent<PrefsTema>).detail);
    window.addEventListener(EVENTO_TEMA, aoMudar);
    return () => window.removeEventListener(EVENTO_TEMA, aoMudar);
  }, []);
  const mudar = useCallback((patch: Partial<PrefsTema>) => {
    gravarTemaPessoal({ ...lerTemaPessoal(), ...patch });
  }, []);
  return { prefs, mudar, horarioDia: HORARIO_DIA };
}
