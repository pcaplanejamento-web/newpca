import { and, eq } from "drizzle-orm";
import { cookies } from "next/headers";
import { preferenciasTabela } from "@/db/schema";
import { getDb } from "./db";
import { idsDosAdmins } from "./email";
import { notificar } from "./notificacoes";
import { sha256Hex, toHex } from "./password";
import { salvarPreferenciaTabela } from "./preferencias-tabela";
import { getConfigSeguranca } from "./seguranca";
import { avaliarAparelho, lerAparelhos, resumoNavegador } from "./seguranca-core";

// ALERTAS DE LOGIN SUSPEITO (Configurações → Segurança): aparelho novo e conta bloqueada por senhas erradas. BEST-EFFORT —
// nunca derrubam o login. O aparelho = um cookie httpOnly aleatório (o banco guarda só o HASH, na preferência da pessoa).

const COOKIE_APARELHO = "pca_aparelho";
export const CHAVE_APARELHOS = "seguranca:aparelhos";

type Pessoa = { id: number; nome: string; email: string };

/** Depois de um login bem-sucedido (senha ou Google): aparelho novo → aviso aos ADMs e à própria pessoa. */
export async function aposEntrar(req: Request, u: Pessoa, canal: "senha" | "Google"): Promise<void> {
  try {
    const cfg = await getConfigSeguranca();
    const jar = await cookies();
    let id = jar.get(COOKIE_APARELHO)?.value ?? "";
    if (!/^[0-9a-f]{32}$/.test(id)) id = toHex(crypto.getRandomValues(new Uint8Array(16)));
    jar.set(COOKIE_APARELHO, id, { httpOnly: true, secure: true, sameSite: "lax", path: "/", maxAge: 2 * 365 * 86_400 });
    const hash = (await sha256Hex(`${u.id}:${id}`)).slice(0, 32);
    const [linha] = await getDb()
      .select({ valor: preferenciasTabela.valor })
      .from(preferenciasTabela)
      .where(and(eq(preferenciasTabela.usuarioId, u.id), eq(preferenciasTabela.chave, CHAVE_APARELHOS)))
      .limit(1);
    let atual: unknown = null;
    try {
      atual = linha ? JSON.parse(linha.valor) : null;
    } catch {
      atual = null;
    }
    const { novo, lista } = avaliarAparelho(lerAparelhos(atual), hash);
    await salvarPreferenciaTabela(u.id, CHAVE_APARELHOS, { ids: lista });
    if (!novo || !cfg.alertaAparelho) return;
    const quando = new Date().toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" });
    const onde = `${resumoNavegador(req.headers.get("user-agent"))} · IP ${req.headers.get("cf-connecting-ip") ?? "desconhecido"}`;
    const admins = (await idsDosAdmins()).filter((id) => id !== u.id);
    await notificar([
      ...admins.map((usuarioId) => ({
        usuarioId,
        tipo: "seguranca" as const,
        titulo: `Login de um aparelho novo: ${u.nome}`,
        texto: `${u.nome} (${u.email}) entrou pelo ${canal} em ${quando} — ${onde}.`,
        link: "/painel/usuarios",
      })),
      {
        usuarioId: u.id,
        tipo: "seguranca" as const,
        titulo: "Novo acesso à sua conta",
        texto: `Entrada pelo ${canal} em ${quando} — ${onde}. Se não foi você, troque a senha no Perfil e avise o administrador.`,
        link: "/painel/perfil",
      },
    ]);
  } catch (e) {
    console.error("[seguranca] alerta de aparelho falhou:", (e as Error).message);
  }
}

/** A conta acabou de ser BLOQUEADA por senhas erradas → aviso aos ADMs (um por bloqueio — a chave leva a janela). */
export async function alertarBloqueio(req: Request, u: Pessoa): Promise<void> {
  try {
    if (!(await getConfigSeguranca()).alertaFalhas) return;
    const janela = Math.floor(Date.now() / (15 * 60_000));
    const ip = req.headers.get("cf-connecting-ip") ?? "desconhecido";
    await notificar(
      (await idsDosAdmins()).map((usuarioId) => ({
        usuarioId,
        tipo: "seguranca" as const,
        titulo: `Conta bloqueada por senhas erradas: ${u.nome}`,
        texto: `Muitas senhas erradas para ${u.email} (último IP ${ip}). O login dessa conta ficou bloqueado por 15 minutos.`,
        link: "/painel/usuarios",
        chave: `bloqueio:${u.id}:${janela}`,
      })),
    );
  } catch (e) {
    console.error("[seguranca] alerta de bloqueio falhou:", (e as Error).message);
  }
}
