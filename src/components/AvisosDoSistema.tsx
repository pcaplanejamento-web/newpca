"use client";

import { useSyncExternalStore } from "react";
import { assinarAvisosSistema, avisosSistema, avisosSistemaNoServidor } from "@/lib/avisos-sistema-store";
import { AvisoFlutuante } from "./AvisoFlutuante";
import { Button } from "./Button";

/**
 * AVISOS DO SISTEMA (no `AppShell`): a versão nova publicada com a página aberta ("Recarregar" traz o código novo) e a
 * sessão que terminou ("Entrar de novo"). Ficam até a pessoa agir — nada se perde sem ela saber.
 */
export function AvisosDoSistema() {
  const e = useSyncExternalStore(assinarAvisosSistema, avisosSistema, avisosSistemaNoServidor);
  if (e.sessaoTerminou)
    return (
      <AvisoFlutuante
        kind="warn"
        titulo="Sua sessão no sistema terminou"
        acoes={
          <Button size="sm" variant="primary" onClick={() => window.location.assign("/login")}>
            Entrar de novo
          </Button>
        }
      >
        Os dados desta tela não podem ser lidos nem gravados até você entrar de novo.
      </AvisoFlutuante>
    );
  if (e.versaoNova)
    return (
      <AvisoFlutuante
        kind="info"
        titulo={`Versão nova do sistema (${e.versaoNova})`}
        acoes={
          <Button size="sm" variant="primary" onClick={() => window.location.reload()}>
            Recarregar
          </Button>
        }
      >
        Esta página é de uma versão anterior. Recarregue para usar a nova — salve antes o que estiver editando.
      </AvisoFlutuante>
    );
  return null;
}
