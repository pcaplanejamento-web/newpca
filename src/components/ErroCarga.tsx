import type { Feedback } from "@/lib/semantic";
import { Button } from "./Button";
import { Callout } from "./Callout";
import { IconRefresh } from "./icons";

/**
 * Falha ao CARREGAR dados de uma tela: o aviso com a mensagem + "Tentar de novo". `danger` (padrão) quando não há nada a
 * mostrar; `warn` quando a tela segue com os dados anteriores (a lista pode estar desatualizada).
 */
export function ErroCarga({ msg, onTentar, kind = "danger" }: { msg: string; onTentar: () => void; kind?: Feedback }) {
  return (
    <Callout kind={kind}>
      <span className="flex flex-wrap items-center justify-between gap-2">
        {msg}
        <Button size="sm" variant="secondary" icon={<IconRefresh className="h-4 w-4" />} onClick={onTentar}>
          Tentar de novo
        </Button>
      </span>
    </Callout>
  );
}
