import { exigirUsuario } from "@/lib/api-auth";
import { atualizarSenha } from "@/lib/auth";
import { trocarSenhaSchema } from "@/lib/auth-validation";
import { erro, ok, parseCorpo } from "@/lib/http";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const a = await exigirUsuario();
  if ("erro" in a) return a.erro;

  const corpo = await parseCorpo(trocarSenhaSchema, req);
  if ("resp" in corpo) return corpo.resp;

  const sucesso = await atualizarSenha(
    a.u.id,
    corpo.data.senhaAtual,
    corpo.data.novaSenha,
  );
  if (!sucesso) return erro("Senha atual incorreta.");
  return ok();
}
