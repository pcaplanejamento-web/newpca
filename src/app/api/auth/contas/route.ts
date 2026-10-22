import { contasDoAparelho, encerrarTodasSessoes, trocarConta } from "@/lib/auth";
import { exigirUsuario } from "@/lib/api-auth";
import { registrarAuditoria } from "@/lib/auditoria";
import { erro, ok, parseCorpo } from "@/lib/http";
import { nomeExibicao } from "@/lib/pessoa";
import { z } from "zod";

export const dynamic = "force-dynamic";

/** As OUTRAS contas guardadas neste navegador — só o que o seletor mostra (nunca o token). */
export async function GET() {
  const g = await exigirUsuario();
  if ("erro" in g) return g.erro;
  const contas = await contasDoAparelho(g.u.id);
  return ok({
    contas: contas.map((c) => ({ id: c.id, nome: nomeExibicao(c), email: c.email, foto: c.foto, papel: c.papel.nome })),
  });
}

const corpo = z.union([z.strictObject({ trocar: z.number().int().positive() }), z.strictObject({ sairTodas: z.literal(true) })]);

/** Troca para uma conta guardada, ou sai de TODAS as contas deste navegador. */
export async function POST(req: Request) {
  const g = await exigirUsuario();
  if ("erro" in g) return g.erro;
  const p = await parseCorpo(corpo, req);
  if ("resp" in p) return p.resp;
  const u = g.u;
  if ("sairTodas" in p.data) {
    await encerrarTodasSessoes();
    await registrarAuditoria({ usuario: { id: u.id, nome: u.nome, email: u.email }, acao: "logout", entidade: "usuario", entidadeId: u.id, resumo: `${u.nome} saiu de todas as contas do navegador` });
    return ok();
  }
  const alvo = await trocarConta(p.data.trocar);
  if (!alvo) return erro("Essa conta não está mais conectada neste navegador — entre de novo.", 404);
  await registrarAuditoria({ usuario: { id: alvo.id, nome: alvo.nome, email: alvo.email }, acao: "login", entidade: "usuario", entidadeId: alvo.id, resumo: `${alvo.nome} entrou trocando de conta (antes: ${u.nome})` });
  return ok();
}
