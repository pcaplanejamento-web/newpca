import { exigirUsuario } from "@/lib/api-auth";
import { criarEdicaoTabela } from "@/lib/edicoes-tabela";
import { ok, parseCorpo } from "@/lib/http";
import { criarEdicaoSchema } from "@/lib/preferencias-validation";

export const dynamic = "force-dynamic";

/** Cria uma EDIÇÃO SALVA de tabela (só para o usuário ou pública). */
export async function POST(req: Request) {
  const a = await exigirUsuario();
  if ("erro" in a) return a.erro;
  const p = await parseCorpo(criarEdicaoSchema, req);
  if ("resp" in p) return p.resp;
  const id = await criarEdicaoTabela(a.u.id, p.data);
  return ok({ id });
}
