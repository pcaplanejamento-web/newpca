import { eq } from "drizzle-orm";
import { usuarios } from "@/db/schema";
import { getDb } from "@/lib/db";
import { descadastroValido } from "@/lib/descadastro-core";
import { chaveMestra } from "@/lib/email";
import { CHAVE_PREF_EMAIL, escaparHtml } from "@/lib/email-core";
import { preferenciasDe } from "@/lib/notificacoes";
import { getConfigNotificacoes } from "@/lib/notificacoes-config";
import { type ChaveAviso, itemAviso } from "@/lib/notificacoes-config-core";
import { salvarPreferenciaTabela } from "@/lib/preferencias-tabela";

export const dynamic = "force-dynamic";

/**
 * DESCADASTRO por e-mail — SEM LOGIN (o link do próprio e-mail, assinado com a chave mestra): o GET mostra a página com o
 * botão de confirmar (o leitor de links do e-mail não descadastra ninguém sozinho); o POST — o botão ou o "um clique" do
 * cliente de e-mail (`List-Unsubscribe-Post`) — desliga o e-mail daquele aviso (`t=todos` = todos os desligáveis).
 */
async function conferir(req: Request): Promise<{ u: number; t: string; rotulo: string } | { erro: string }> {
  const q = new URL(req.url).searchParams;
  const u = Number(q.get("u"));
  const t = q.get("t") ?? "";
  const s = q.get("s") ?? "";
  const chave = chaveMestra();
  if (!chave || !Number.isInteger(u) || u <= 0 || !(await descadastroValido(chave, u, t, s))) return { erro: "Este link não é válido." };
  if (t === "todos") return { u, t, rotulo: "todos os avisos por e-mail que você pode desligar" };
  const item = itemAviso(t);
  if (!item) return { erro: "Este link não é válido." };
  if (!(await getConfigNotificacoes())[item.chave].desligavel) return { erro: `O aviso "${item.rotulo}" é obrigatório e não pode ser desligado.` };
  return { u, t, rotulo: `o aviso "${item.rotulo}"` };
}

const pagina = (titulo: string, corpo: string, status = 200) =>
  new Response(
    `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>${escaparHtml(titulo)}</title></head><body style="margin:0;background:#f3f4f6;font-family:Inter,Roboto,Arial,sans-serif"><main style="max-width:440px;margin:48px auto;background:#fff;border:1px solid #e5e7eb;border-radius:12px;padding:24px"><h1 style="margin:0 0 12px;font-size:18px;color:#111827">${escaparHtml(titulo)}</h1>${corpo}</main></body></html>`,
    { status, headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store", "X-Robots-Tag": "noindex" } },
  );
const p = (t: string) => `<p style="margin:0 0 12px;font-size:14px;line-height:1.5;color:#374151">${escaparHtml(t)}</p>`;

export async function GET(req: Request) {
  const r = await conferir(req);
  if ("erro" in r) return pagina("Não foi possível", p(r.erro), 400);
  return pagina(
    "Parar de receber por e-mail",
    `${p(`Confirme para deixar de receber ${r.rotulo}. Os avisos continuam no sino do sistema.`)}<form method="post"><button type="submit" style="background:#111827;color:#fff;border:0;border-radius:8px;padding:11px 18px;font-weight:600;font-size:14px;cursor:pointer">Confirmar</button></form>`,
  );
}

export async function POST(req: Request) {
  const r = await conferir(req);
  if ("erro" in r) return pagina("Não foi possível", p(r.erro), 400);
  const [quem] = await getDb().select({ id: usuarios.id }).from(usuarios).where(eq(usuarios.id, r.u)).limit(1);
  if (!quem) return pagina("Não foi possível", p("Este link não é válido."), 400);
  const atual = (await preferenciasDe([r.u])).get(r.u)?.email;
  if (!atual) return pagina("Não foi possível", p("Tente de novo mais tarde."), 503);
  const nova = r.t === "todos" ? { ...atual, ligado: false } : { ...atual, desligados: [...new Set([...atual.desligados, r.t as ChaveAviso])] };
  await salvarPreferenciaTabela(r.u, CHAVE_PREF_EMAIL, nova);
  return pagina("Pronto", `${p(`Você não vai mais receber ${r.rotulo}.`)}${p("Para voltar a receber, ajuste no Perfil → Notificações.")}`);
}
