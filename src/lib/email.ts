import { and, eq } from "drizzle-orm";
import { papeis, usuarios } from "@/db/schema";
import { getAparencia } from "./aparencia";
import { papelDoUsuarioSql } from "./auth";
import { getDb } from "./db";
import { type ContextoEmail, type ConteudoEmail, emailDaNotificacao, enderecoDosAvisos, lerPrefsEmail, NOME_SISTEMA_PADRAO, querEmail } from "./email-core";
import { comandoConfirmarEmails, comandoDevolverEmails, comandoReservarEmails, consultaPendentesEmail } from "./email-sql";
import { getConfigNotificacoes } from "./notificacoes-config";
import type { ChaveAviso } from "./notificacoes-config-core";
import type { EmailResend } from "./resend-api";
import { MAX_LOTE_RESEND } from "./resend-api";
import { resendDaConfig } from "./resend-config";
import { depoisDaResposta } from "./segundo-plano";
import { TIPOS_NOTIFICACAO, type TipoNotificacao } from "./tarefas-core";

/**
 * O ENVIO dos e-mails do sistema pelo Resend (server-only) — BEST-EFFORT: nada aqui lança nem atrasa a ação que o
 * disparou (roda depois da resposta). Sem a integração ativa, não faz nada.
 */

/** O nome do sistema (identidade do ADM) para o cabeçalho dos e-mails. */
async function nomeSistema(): Promise<string> {
  try {
    return (await getAparencia()).identidade?.nome?.trim() || NOME_SISTEMA_PADRAO;
  } catch {
    return NOME_SISTEMA_PADRAO;
  }
}

/** O contexto dos modelos (endereço + nome do sistema). */
export async function contextoEmail(urlSistema: string): Promise<ContextoEmail> {
  return { urlSistema, nomeSistema: await nomeSistema() };
}

const emParticoes = <T>(xs: T[], n: number) => Array.from({ length: Math.ceil(xs.length / n) }, (_, i) => xs.slice(i * n, i * n + n));

/**
 * Envia os e-mails PENDENTES das notificações do sino: os que o ADM manda por e-mail E a pessoa (ativa) não desligou;
 * os demais são marcados como tratados sem enviar. Reserva antes de enviar (duas passadas nunca repetem um e-mail) e só
 * marca como ENVIADO com o envio confirmado; falha = volta a pendente com uma tentativa a mais (desiste após 3); a
 * reserva que não terminou (o Worker caiu) vence em 10 min e volta à fila. Nunca lança.
 */
export async function enviarEmailsPendentes(limite = 50): Promise<{ enviados: number; pulados: number; falhas: number }> {
  const res = { enviados: 0, pulados: 0, falhas: 0 };
  try {
    const cfg = await resendDaConfig();
    if ("erro" in cfg) return res;
    const db = getDb();
    const pendentes = await consultaPendentesEmail(db, Math.min(limite, 200));
    if (!pendentes.length) return res;
    const reservados = new Set<number>();
    for (const ids of emParticoes(
      pendentes.map((p) => p.id),
      90,
    ))
      for (const r of await comandoReservarEmails(db, ids)) reservados.add(r.id);
    const meus = pendentes.filter((p) => reservados.has(p.id));
    const [ctx, avisos] = await Promise.all([contextoEmail(cfg.urlSistema), getConfigNotificacoes()]);
    const envio: { id: number; email: EmailResend }[] = [];
    const pulados: number[] = [];
    for (const p of meus) {
      let prefs = lerPrefsEmail(null);
      try {
        prefs = lerPrefsEmail(p.prefs ? JSON.parse(p.prefs) : null);
      } catch {
        /* preferência corrompida = padrão */
      }
      if (p.status !== "ativo" || !p.email || !querEmail(avisos, prefs, p.tipo as ChaveAviso)) {
        res.pulados++;
        pulados.push(p.id);
        continue;
      }
      const tipo = (TIPOS_NOTIFICACAO as readonly string[]).includes(p.tipo) ? (p.tipo as TipoNotificacao) : "automacao";
      const c = emailDaNotificacao({ tipo, titulo: p.titulo, texto: p.texto, link: p.link, atorNome: p.atorNome }, ctx);
      envio.push({ id: p.id, email: paraResend(cfg.remetente, [enderecoDosAvisos(prefs, p.email, p.googleEmail)], c) });
    }
    for (const ids of emParticoes(pulados, 90)) await comandoConfirmarEmails(db, ids);
    for (const lote of emParticoes(envio, MAX_LOTE_RESEND)) {
      try {
        await cfg.cliente.enviarLote(lote.map((l) => l.email));
        res.enviados += lote.length;
        for (const ids of emParticoes(
          lote.map((l) => l.id),
          90,
        ))
          await comandoConfirmarEmails(db, ids);
      } catch (e) {
        console.error("[email] lote falhou:", (e as Error).message);
        res.falhas += lote.length;
        for (const ids of emParticoes(
          lote.map((l) => l.id),
          90,
        ))
          await comandoDevolverEmails(db, ids);
      }
    }
  } catch (e) {
    console.error("[email] envio dos pendentes falhou:", (e as Error).message);
  }
  return res;
}

/** Dispara o envio dos pendentes DEPOIS da resposta (chamado ao gravar notificações). */
export function enviarPendentesDepois() {
  depoisDaResposta(enviarEmailsPendentes(50), "email");
}

/** O e-mail no formato do Resend. */
function paraResend(remetente: string, para: string[], c: ConteudoEmail): EmailResend {
  return { from: remetente, to: para, subject: c.assunto, html: c.html, text: c.texto };
}

/** Envia UM e-mail já montado (a cada destinatário, separado — ninguém vê o endereço do outro). Nunca lança. */
export async function enviarEmailDireto(para: string[], montar: (ctx: ContextoEmail) => ConteudoEmail): Promise<boolean> {
  const destinos = [...new Set(para.map((e) => e.trim().toLowerCase()).filter(Boolean))];
  if (!destinos.length) return false;
  try {
    const cfg = await resendDaConfig();
    if ("erro" in cfg) return false;
    const c = montar(await contextoEmail(cfg.urlSistema));
    for (const lote of emParticoes(destinos, MAX_LOTE_RESEND)) await cfg.cliente.enviarLote(lote.map((e) => paraResend(cfg.remetente, [e], c)));
    return true;
  } catch (e) {
    console.error("[email] envio direto falhou:", (e as Error).message);
    return false;
  }
}

/** Os ADMs ativos (o aviso de cadastro pendente) — pelo PAPEL Administrador. */
export async function idsDosAdmins(): Promise<number[]> {
  const linhas = await getDb()
    .select({ id: usuarios.id })
    .from(usuarios)
    .innerJoin(papeis, eq(papeis.id, papelDoUsuarioSql))
    .where(and(eq(papeis.chave, "admin"), eq(usuarios.status, "ativo")));
  return linhas.map((l) => l.id);
}
