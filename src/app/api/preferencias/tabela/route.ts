import { exigirUsuario } from "@/lib/api-auth";
import { ok, parseCorpo } from "@/lib/http";
import { excluirPreferenciaTabela, salvarPreferenciaTabela } from "@/lib/preferencias-tabela";
import { excluirPreferenciaSchema, salvarPreferenciaSchema } from "@/lib/preferencias-validation";

export const dynamic = "force-dynamic";

/** Salva uma preferência de tabela do PRÓPRIO usuário (ex.: a EDIÇÃO PADRÃO — `padrao:<chave>` → `{ id }`). */
export async function PUT(req: Request) {
  const a = await exigirUsuario();
  if ("erro" in a) return a.erro;
  const p = await parseCorpo(salvarPreferenciaSchema, req);
  if ("resp" in p) return p.resp;
  await salvarPreferenciaTabela(a.u.id, p.data.chave, p.data.valor);
  return ok();
}

/** Apaga a preferência (ex.: a tabela volta a abrir no padrão do sistema). */
export async function DELETE(req: Request) {
  const a = await exigirUsuario();
  if ("erro" in a) return a.erro;
  const p = await parseCorpo(excluirPreferenciaSchema, req);
  if ("resp" in p) return p.resp;
  await excluirPreferenciaTabela(a.u.id, p.data.chave);
  return ok();
}
