import { exigirEditor } from "@/lib/api-auth";
import { faltasObrigatorias, protocoloImportSchema } from "@/lib/dfd-validation";
import { getReparticaoContexto } from "@/lib/grupos";
import { erro, ok, parseCorpo } from "@/lib/http";
import { importarProtocoloComDfds } from "@/lib/protocolo";

export const dynamic = "force-dynamic";

/**
 * Protocola um processo com seus DFDs. Grava só os DFDs VÁLIDOS — o defeituoso
 * (falha em `faltasObrigatorias`) NUNCA é protocolado (re-validado aqui, além do
 * cliente). `dfds` vazio cria só o protocolo (rule 3).
 */
export async function POST(req: Request) {
  const a = await exigirEditor();
  if ("erro" in a) return a.erro;

  const p = await parseCorpo(protocoloImportSchema, req);
  if ("resp" in p) return p.resp;
  const { protocolo, dfds } = p.data;

  // Repartições acessíveis ao usuário (admin: todas).
  const { lista } = await getReparticaoContexto(a.u);
  const acessivel = (id: number | null | undefined) => id == null || lista.some((r) => r.id === id);
  if (!acessivel(protocolo.reparticaoId)) {
    return erro("Repartição do protocolo inválida ou sem acesso.", 403);
  }

  // DFD com defeito NUNCA é protocolado.
  const validos = dfds.filter((d) => faltasObrigatorias(d).length === 0);
  const bloqueados = dfds.length - validos.length;
  for (const d of validos) {
    if (!acessivel(d.reparticaoId)) {
      return erro(`DFD ${d.numero}: repartição inválida ou sem acesso.`, 403);
    }
  }

  const r = await importarProtocoloComDfds(protocolo, validos, a.u.id);
  return ok({ id: r.id, numero: r.numero, importados: r.importados, bloqueados });
}
