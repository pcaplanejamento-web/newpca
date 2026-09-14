import { exigirEditor } from "@/lib/api-auth";
import { startProtocoloSchema } from "@/lib/dfd-validation";
import { getReparticaoContexto } from "@/lib/grupos";
import { erro, ok, parseCorpo } from "@/lib/http";
import { iniciarProtocolo } from "@/lib/protocolo";

export const dynamic = "force-dynamic";

/**
 * `start-protocolo`: cria só o protocolo (capa) e devolve `protocoloId`. Os DFDs
 * são enviados DEPOIS, em streaming, DFD a DFD (`POST /api/dfd` com o `protocoloId`)
 * — para escalar a milhares de DFDs sem estourar CPU/memória/subrequests do Worker.
 */
export async function POST(req: Request) {
  const a = await exigirEditor();
  if ("erro" in a) return a.erro;

  const p = await parseCorpo(startProtocoloSchema, req);
  if ("resp" in p) return p.resp;
  const { protocolo } = p.data;

  // Regra: não protocola sem o PCA definido (o ano é herdado pelos DFDs).
  if (protocolo.anoPca == null) return erro("Defina o PCA do protocolo antes de protocolar.", 422);

  if (protocolo.reparticaoId != null) {
    const { lista } = await getReparticaoContexto(a.u);
    if (!lista.some((r) => r.id === protocolo.reparticaoId)) {
      return erro("Repartição do protocolo inválida ou sem acesso.", 403);
    }
  }

  const r = await iniciarProtocolo(protocolo, a.u.id);
  return ok({ protocoloId: r.id, numero: r.numero });
}
