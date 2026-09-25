import { exigirUsuario } from "@/lib/api-auth";
import { ok, parseCorpo } from "@/lib/http";
import { excluirPreferenciaTabela, salvarPreferenciaTabela } from "@/lib/preferencias-tabela";
import { excluirPreferenciaSchema, salvarPreferenciaSchema } from "@/lib/preferencias-validation";

export const dynamic = "force-dynamic";

/** Salva os AJUSTES de uma tabela do PRÓPRIO usuário (larguras, colunas fixadas/ocultas, ordem). */
export async function PUT(req: Request) {
  const a = await exigirUsuario();
  if ("erro" in a) return a.erro;
  const p = await parseCorpo(salvarPreferenciaSchema, req);
  if ("resp" in p) return p.resp;
  await salvarPreferenciaTabela(a.u.id, p.data.chave, p.data.valor);
  return ok();
}

/** Volta a tabela ao PADRÃO (apaga os ajustes salvos daquela chave). */
export async function DELETE(req: Request) {
  const a = await exigirUsuario();
  if ("erro" in a) return a.erro;
  const p = await parseCorpo(excluirPreferenciaSchema, req);
  if ("resp" in p) return p.resp;
  await excluirPreferenciaTabela(a.u.id, p.data.chave);
  return ok();
}
