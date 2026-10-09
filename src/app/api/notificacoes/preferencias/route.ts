import { sql } from "drizzle-orm";
import { tarefaQuadros, tarefas } from "@/db/schema";
import { exigirUsuario } from "@/lib/api-auth";
import { getDb } from "@/lib/db";
import { CHAVE_PREF_EMAIL } from "@/lib/email-core";
import { ok, parseCorpo } from "@/lib/http";
import { getIntegracoes } from "@/lib/integracoes";
import { resendConfigurado } from "@/lib/integracoes-core";
import { preferenciasDe } from "@/lib/notificacoes";
import { getConfigNotificacoes } from "@/lib/notificacoes-config";
import { CHAVE_PREF_PESSOA, lerPrefsEmail, lerPrefsPessoa } from "@/lib/notificacoes-config-core";
import { preferenciasNotificacoesSchema } from "@/lib/notificacoes-validation";
import { salvarPreferenciaTabela } from "@/lib/preferencias-tabela";

export const dynamic = "force-dynamic";

/**
 * As PREFERÊNCIAS de notificação da própria pessoa: e-mail (modo imediato/resumo, horário, silêncio, os desligados,
 * destino) e sino (tipos desligados, tarefas e quadros silenciados, som e alerta do sistema) + o que o ADM liberou.
 */
export async function GET() {
  const a = await exigirUsuario();
  if ("erro" in a) return a.erro;
  const [prefs, config, integ] = await Promise.all([preferenciasDe([a.u.id]), getConfigNotificacoes(), getIntegracoes()]);
  const p = prefs.get(a.u.id);
  const pessoa = p?.pessoa ?? lerPrefsPessoa(null);
  // Os NOMES do que está silenciado (a tela mostra "#12 Relatório" e o quadro pelo nome).
  const db = getDb();
  const [ts, qs] = await Promise.all([
    pessoa.tarefas.length
      ? db.select({ id: tarefas.id, ticket: tarefas.ticket, titulo: tarefas.titulo }).from(tarefas).where(sql`${tarefas.id} IN (SELECT value FROM json_each(${JSON.stringify(pessoa.tarefas)}))`)
      : [],
    pessoa.quadros.length ? db.select({ id: tarefaQuadros.id, nome: tarefaQuadros.nome }).from(tarefaQuadros).where(sql`${tarefaQuadros.id} IN (SELECT value FROM json_each(${JSON.stringify(pessoa.quadros)}))`) : [],
  ]);
  const nomes = {
    tarefas: Object.fromEntries(ts.map((t) => [t.id, `#${t.ticket} ${t.titulo}`])),
    quadros: Object.fromEntries(qs.map((q) => [q.id, q.nome])),
  };
  return ok({ email: p?.email ?? lerPrefsEmail(null), pessoa, nomes, config, emailAtivo: resendConfigurado(integ) });
}

/** Grava as preferências (qualquer JSON → normalizado; o que não veio fica como está). */
export async function PUT(req: Request) {
  const a = await exigirUsuario();
  if ("erro" in a) return a.erro;
  const p = await parseCorpo(preferenciasNotificacoesSchema, req);
  if ("resp" in p) return p.resp;
  const email = p.data.email ? lerPrefsEmail(p.data.email) : null;
  const pessoa = p.data.pessoa ? lerPrefsPessoa(p.data.pessoa) : null;
  if (email) await salvarPreferenciaTabela(a.u.id, CHAVE_PREF_EMAIL, email);
  if (pessoa) await salvarPreferenciaTabela(a.u.id, CHAVE_PREF_PESSOA, pessoa);
  return ok({ email, pessoa });
}
