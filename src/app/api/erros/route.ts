import { exigirUsuario } from "@/lib/api-auth";
import { falhaTelaSchema } from "@/lib/erro-tela-validation";
import { ok, parseCorpo } from "@/lib/http";

export const dynamic = "force-dynamic";

/**
 * FALHA NA TELA (diagnóstico): a fronteira de erro do navegador (`error.tsx` → `useFalhaNaTela`) informa o que
 * aconteceu — o registro vai aos LOGS do Worker (observability), com o usuário (id), o papel e se é admin LIDOS DA
 * SESSÃO. Sem nome/e-mail e SEM auditoria (a auditoria mudaria a versão dos dados e recarregaria as telas de todos).
 */
export async function POST(req: Request) {
  const g = await exigirUsuario();
  if ("erro" in g) return g.erro;
  const corpo = await parseCorpo(falhaTelaSchema, req);
  if ("resp" in corpo) return corpo.resp;
  console.error(
    "[falha-na-tela]",
    JSON.stringify({
      usuarioId: g.u.id,
      papel: g.u.papel.nome,
      admin: g.u.admin,
      ...corpo.data,
      navegador: (req.headers.get("user-agent") ?? "").slice(0, 200),
    }),
  );
  return ok();
}
