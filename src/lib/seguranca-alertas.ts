import { and, eq } from "drizzle-orm";
import { comandosRegistrarAcesso, comandosRegistrarEvento, consultaAcessos, consultaEventos, type NovoEvento } from "./acessos-sql";
import { cookies } from "next/headers";
import { acessos, preferenciasTabela, usuarios } from "@/db/schema";
import { getDb } from "./db";
import { idsDosAdmins } from "./email";
import { notificar } from "./notificacoes";
import { sha256Hex, toHex } from "./password";
import { salvarPreferenciaTabela } from "./preferencias-tabela";
import { getConfigSeguranca } from "./seguranca";
import { type AcessoRegistro, type EventoRegistro, sessaoCurta } from "./acessos-core";
import { avaliarAparelho, lerAparelhos, resumoNavegador } from "./seguranca-core";
import { getAcessoConta } from "./acesso-conta";
import { termoVigente } from "./termo-uso";
import { comandoPendenciaJa } from "./termos-sql";

/** O TESTE do Termo de Uso com "repetir a cada login": a pendência da versão vigente volta já (a sessão nova também pede o
 * nome do aparelho de novo — `getUsuarioAtual` não a liga sozinha nesse modo). Best-effort. */
async function repetirTesteAoEntrar(usuarioId: number): Promise<void> {
  try {
    const cfg = await getAcessoConta({ fresco: true });
    if (!cfg.repetirAoEntrar || cfg.modo !== "teste" || !cfg.testadores.includes(usuarioId)) return;
    const t = await termoVigente();
    if (t) await comandoPendenciaJa(getDb(), usuarioId, t.id, new Date().toISOString()).run();
  } catch (e) {
    console.error("[termo] repetir ao entrar:", (e as Error).message);
  }
}

// ALERTAS DE LOGIN SUSPEITO (Configurações → Segurança): aparelho novo e conta bloqueada por senhas erradas. BEST-EFFORT —
// nunca derrubam o login. O aparelho = um cookie httpOnly aleatório (o banco guarda só o HASH, na preferência da pessoa).

const COOKIE_APARELHO = "pca_aparelho";
export const CHAVE_APARELHOS = "seguranca:aparelhos";

type Pessoa = { id: number; nome: string; email: string };

/** Depois de um login bem-sucedido (senha ou Google): aparelho novo → aviso aos ADMs e à própria pessoa. */
export async function aposEntrar(req: Request, u: Pessoa, canal: "senha" | "Google", token: string): Promise<void> {
  await repetirTesteAoEntrar(u.id);
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
    const avaliado = avaliarAparelho(lerAparelhos(atual), hash);
    const { lista } = avaliado;
    let { novo } = avaliado;
    await salvarPreferenciaTabela(u.id, CHAVE_APARELHOS, { ids: lista });
    // O HISTÓRICO DE ACESSO (Perfil e o banner do usuário): sempre, com ou sem alerta.
    const navegador = resumoNavegador(req.headers.get("user-agent"));
    const ip = req.headers.get("cf-connecting-ip");
    const db = getDb();
    // O cookie pode se perder (limpeza do navegador, outro endereço do site, aba anônima): o MESMO navegador no MESMO IP
    // já visto no histórico não é aparelho novo — evita o alerta repetido de quem usa sempre os mesmos aparelhos.
    if (novo && ip) {
      const [visto] = await db
        .select({ id: acessos.id })
        .from(acessos)
        .where(and(eq(acessos.usuarioId, u.id), eq(acessos.navegador, navegador), eq(acessos.ip, ip)))
        .limit(1);
      if (visto) novo = false;
    }
    await db.batch(comandosRegistrarAcesso(db, { usuarioId: u.id, em: new Date().toISOString(), canal: canal === "Google" ? "google" : "senha", navegador, ip, aparelho: hash.slice(0, 6), novo, sessao: sessaoCurta(await sha256Hex(token)) }));
    if (!novo || !cfg.alertaAparelho) return;
    const quando = new Date().toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" });
    const onde = `${navegador} · IP ${ip ?? "desconhecido"}`;
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

/** O histórico de acesso de uma pessoa + o último acesso (o Perfil e o banner do usuário). */
export async function historicoDeAcesso(
  usuarioId: number,
): Promise<{ ultimoAcesso: string | null; acessos: AcessoRegistro[]; eventos: EventoRegistro[] }> {
  const db = getDb();
  const [lista, eventos, [u]] = await Promise.all([
    consultaAcessos(db, usuarioId),
    consultaEventos(db, usuarioId).catch(() => []),
    db.select({ ultimo: usuarios.ultimoAcessoEm }).from(usuarios).where(eq(usuarios.id, usuarioId)).limit(1),
  ]);
  return { ultimoAcesso: u?.ultimo ?? null, acessos: lista, eventos };
}

/** Grava uma CÓPIA/CAPTURA de tela da pessoa (best-effort — nunca derruba o pedido). */
export async function registrarEventoProtecao(e: NovoEvento): Promise<void> {
  const db = getDb();
  await db.batch(comandosRegistrarEvento(db, e)).catch((err) => console.error("[protecao] evento não gravado:", (err as Error).message));
}

/** O cookie de um aparelho apareceu em OUTRO navegador (cópia do cookie?) → aviso aos ADMs; o aparelho é pedido de novo. */
export async function alertarAparelhoCopiado(req: Request, u: Pessoa, aparelho: string): Promise<void> {
  try {
    const nav = resumoNavegador(req.headers.get("user-agent"));
    const ip = req.headers.get("cf-connecting-ip") ?? "desconhecido";
    await notificar(
      (await idsDosAdmins()).map((usuarioId) => ({
        usuarioId,
        tipo: "seguranca" as const,
        titulo: `Aparelho usado em outro navegador: ${u.nome}`,
        texto: `A identificação do aparelho "${aparelho}" chegou de ${nav} (IP ${ip}). O sistema pediu um aparelho novo — confira se a conta não foi copiada.`,
        link: "/painel/usuarios",
        chave: `aparelho-copiado:${u.id}:${Math.floor(Date.now() / 3_600_000)}`,
      })),
    );
  } catch (e) {
    console.error("[seguranca] alerta de aparelho copiado falhou:", (e as Error).message);
  }
}
