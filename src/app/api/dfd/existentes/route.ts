import { exigirUsuario } from "@/lib/api-auth";
import { dfdsPorNumeros } from "@/lib/dfd";
import { existentesDfdSchema } from "@/lib/dfd-validation";
import { getReparticaoContexto } from "@/lib/grupos";
import { ok, parseCorpo } from "@/lib/http";

export const dynamic = "force-dynamic";

/**
 * DFDs JÁ CADASTRADOS com estes números — a importação (avulsa ou do protocolo) sabe, antes de gravar, quem
 * vai SOBRESCREVER quem, em QUALQUER unidade (a lista da Mesa é filtrada pela unidade do cabeçalho). O DFD de
 * unidade SEM ACESSO volta só como `acessivel: false` (nada dele vaza) — o servidor recusa a sobrescrita
 * (anti-sequestro) e a tela avisa antes.
 */
export async function POST(req: Request) {
  const a = await exigirUsuario();
  if ("erro" in a) return a.erro;
  const p = await parseCorpo(existentesDfdSchema, req);
  if ("resp" in p) return p.resp;
  const { lista } = await getReparticaoContexto(a.u);
  const existentes = (await dfdsPorNumeros(p.data.numeros)).map((d) =>
    d.reparticaoId == null || lista.some((r) => r.id === d.reparticaoId) ? { ...d, acessivel: true } : { numero: d.numero, acessivel: false },
  );
  return ok({ existentes });
}
