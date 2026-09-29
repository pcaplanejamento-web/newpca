/**
 * Núcleo PURO dos e-mails do sistema (sem getDb/env → testável): os MODELOS (assunto + HTML + texto puro) e as
 * PREFERÊNCIAS de cada pessoa. Todo texto que vem de dados (títulos, nomes) é ESCAPADO no HTML; os links são sempre
 * ABSOLUTOS a partir do endereço do sistema (o cron não tem requisição de onde tirar a origem).
 */

import { TIPOS_NOTIFICACAO, type TipoNotificacao } from "./tarefas-core.ts";

export const NOME_SISTEMA_PADRAO = "Plataforma PCA — Rio Verde";

export type ContextoEmail = { urlSistema: string; nomeSistema: string };
export type ConteudoEmail = { assunto: string; html: string; texto: string };

/** Escapa o texto para o HTML do e-mail. */
export function escaparHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

/** O link ABSOLUTO no sistema: caminho interno ("/painel/…") vira base + caminho; qualquer outra coisa, a página inicial. */
export function urlAbsoluta(base: string, link: string | null | undefined): string {
  const b = base.replace(/\/+$/, "");
  return link?.startsWith("/") && !link.startsWith("//") ? `${b}${link}` : `${b}/painel`;
}

/** Linha única, sem quebras nem espaços repetidos, com teto (assunto de e-mail). */
function umaLinha(s: string, max = 150): string {
  const t = s.replace(/\s+/g, " ").trim();
  return t.length > max ? `${t.slice(0, max - 1)}…` : t;
}

/**
 * O LAYOUT único dos e-mails: cabeçalho com o nome do sistema, título, parágrafos, botão e rodapé — tabelas + estilos
 * inline (o que os clientes de e-mail aceitam), em cores neutras.
 */
export function layoutEmail(
  ctx: ContextoEmail,
  m: { assunto: string; titulo: string; paragrafos: string[]; botao?: { rotulo: string; url: string }; rodape?: string },
): ConteudoEmail {
  const nome = escaparHtml(ctx.nomeSistema || NOME_SISTEMA_PADRAO);
  const paras = m.paragrafos
    .filter((p) => p.trim())
    .map((p) => `<p style="margin:0 0 12px;font-size:15px;line-height:1.55;color:#374151">${escaparHtml(p)}</p>`)
    .join("");
  const botao = m.botao
    ? `<p style="margin:20px 0 4px"><a href="${escaparHtml(m.botao.url)}" style="display:inline-block;background:#111827;color:#ffffff;text-decoration:none;font-weight:600;font-size:14px;padding:11px 18px;border-radius:8px">${escaparHtml(m.botao.rotulo)}</a></p>`
    : "";
  const rodape = escaparHtml(m.rodape ?? "Você recebeu este e-mail porque participa da plataforma. Ajuste os avisos por e-mail no seu Perfil.");
  const html = `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escaparHtml(m.assunto)}</title></head><body style="margin:0;padding:0;background:#f3f4f6;font-family:Inter,Roboto,Arial,Helvetica,sans-serif"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f3f4f6;padding:24px 12px"><tr><td align="center"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border:1px solid #e5e7eb;border-radius:12px"><tr><td style="padding:18px 24px;border-bottom:1px solid #e5e7eb;font-size:13px;font-weight:600;color:#6b7280">${nome}</td></tr><tr><td style="padding:24px"><h1 style="margin:0 0 16px;font-size:19px;line-height:1.35;color:#111827">${escaparHtml(m.titulo)}</h1>${paras}${botao}</td></tr><tr><td style="padding:14px 24px;border-top:1px solid #e5e7eb;font-size:12px;line-height:1.5;color:#9ca3af">${rodape}</td></tr></table></td></tr></table></body></html>`;
  const texto = [
    ctx.nomeSistema || NOME_SISTEMA_PADRAO,
    "",
    m.titulo,
    "",
    ...m.paragrafos.filter((p) => p.trim()),
    ...(m.botao ? ["", `${m.botao.rotulo}: ${m.botao.url}`] : []),
    "",
    "—",
    m.rodape ?? "Você recebeu este e-mail porque participa da plataforma. Ajuste os avisos por e-mail no seu Perfil.",
  ].join("\n");
  return { assunto: umaLinha(m.assunto), html, texto };
}

/** O assunto/rótulo curto de cada tipo de aviso. */
export const ROTULO_TIPO_EMAIL: Record<TipoNotificacao, string> = {
  atribuida: "Tarefa atribuída a você",
  mencionada: "Você foi mencionado",
  comentario: "Novo comentário",
  vence_amanha: "Prazo vence amanhã",
  atrasada: "Tarefa atrasada",
  automacao: "Aviso de automação",
  lembrete: "Lembrete",
  convite: "Convite para evento",
  resposta: "Resposta a convite",
};

/** O e-mail de UMA notificação do sino (o mesmo título/texto/link que a pessoa vê no sistema). */
export function emailDaNotificacao(
  n: { tipo: TipoNotificacao; titulo: string; texto?: string | null; link?: string | null; atorNome?: string | null },
  ctx: ContextoEmail,
): ConteudoEmail {
  const url = urlAbsoluta(ctx.urlSistema, n.link);
  return layoutEmail(ctx, {
    assunto: n.titulo || ROTULO_TIPO_EMAIL[n.tipo],
    titulo: n.titulo || ROTULO_TIPO_EMAIL[n.tipo],
    paragrafos: [n.texto ?? "", n.atorNome ? `Por ${n.atorNome}.` : ""],
    botao: { rotulo: "Abrir no sistema", url },
  });
}

/** Aos ADMs: um cadastro novo aguarda aprovação. */
export function emailCadastroPendente(p: { nome: string; email: string }, ctx: ContextoEmail): ConteudoEmail {
  return layoutEmail(ctx, {
    assunto: `Novo cadastro aguardando aprovação: ${p.nome}`,
    titulo: "Novo cadastro aguardando aprovação",
    paragrafos: [`${p.nome} (${p.email}) pediu acesso à plataforma.`, "Revise o cadastro e libere o acesso em Administração → Usuários."],
    botao: { rotulo: "Abrir Usuários", url: urlAbsoluta(ctx.urlSistema, "/painel/usuarios") },
    rodape: "Você recebeu este e-mail porque é administrador da plataforma.",
  });
}

/** À pessoa: o acesso foi liberado. */
export function emailAcessoLiberado(p: { nome: string }, ctx: ContextoEmail): ConteudoEmail {
  return layoutEmail(ctx, {
    assunto: "Seu acesso à plataforma foi liberado",
    titulo: `Olá, ${p.nome}! Seu acesso foi liberado.`,
    paragrafos: ["O administrador aprovou o seu cadastro. Você já pode entrar com o seu e-mail e senha."],
    botao: { rotulo: "Entrar", url: urlAbsoluta(ctx.urlSistema, "/login") },
    rodape: "Você recebeu este e-mail porque se cadastrou na plataforma.",
  });
}

/** O e-mail de TESTE da tela Integrações. */
export function emailTeste(ctx: ContextoEmail): ConteudoEmail {
  return layoutEmail(ctx, {
    assunto: "Teste de envio — e-mails da plataforma",
    titulo: "O envio de e-mails está funcionando",
    paragrafos: ["Este é um e-mail de teste enviado pela tela Administração → Integrações.", "Os avisos do sistema passarão a chegar por e-mail."],
    botao: { rotulo: "Abrir a plataforma", url: urlAbsoluta(ctx.urlSistema, "/painel") },
    rodape: "Você recebeu este e-mail porque testou a integração com o Resend.",
  });
}

// ─── PREFERÊNCIAS de cada pessoa (`preferencias_tabela`, chave `email:notificacoes`) ───────────────────────────────

export const CHAVE_PREF_EMAIL = "email:notificacoes";
export const TIPOS_EMAIL = TIPOS_NOTIFICACAO;
/** Ligados por padrão: o que pede ação da pessoa. Comentário, automação e resposta ficam só no sino. */
export const TIPOS_EMAIL_PADRAO: readonly TipoNotificacao[] = ["atribuida", "mencionada", "convite", "vence_amanha", "atrasada", "lembrete"];
export type PrefsEmail = { ligado: boolean; tipos: TipoNotificacao[] };
export const PREFS_EMAIL_PADRAO: PrefsEmail = { ligado: true, tipos: [...TIPOS_EMAIL_PADRAO] };

/** Lê a preferência gravada (qualquer JSON → válido; sem nada = o padrão). */
export function lerPrefsEmail(valor: unknown): PrefsEmail {
  if (!valor || typeof valor !== "object") return { ...PREFS_EMAIL_PADRAO, tipos: [...PREFS_EMAIL_PADRAO.tipos] };
  const v = valor as { ligado?: unknown; tipos?: unknown };
  const tipos = Array.isArray(v.tipos)
    ? TIPOS_EMAIL.filter((t) => (v.tipos as unknown[]).includes(t))
    : [...TIPOS_EMAIL_PADRAO];
  return { ligado: typeof v.ligado === "boolean" ? v.ligado : true, tipos };
}

/** A pessoa quer receber ESTE tipo por e-mail? */
export function querEmail(prefs: PrefsEmail, tipo: string): boolean {
  return prefs.ligado && (prefs.tipos as readonly string[]).includes(tipo);
}
