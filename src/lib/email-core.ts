/**
 * Núcleo PURO dos e-mails do sistema (sem getDb/env → testável): os MODELOS (assunto + HTML + texto puro) e as
 * PREFERÊNCIAS de cada pessoa. Todo texto que vem de dados (títulos, nomes) é ESCAPADO no HTML; os links são sempre
 * ABSOLUTOS a partir do endereço do sistema (o cron não tem requisição de onde tirar a origem).
 */

import type { TipoNotificacao } from "./tarefas-core.ts";

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

const RODAPE_PADRAO = "Você recebeu este e-mail porque participa da plataforma. Ajuste os avisos por e-mail no seu Perfil (Perfil → E-mail).";

/**
 * O LAYOUT único dos e-mails: cabeçalho com o nome do sistema, título, parágrafos, botão e rodapé — tabelas + estilos
 * inline (o que os clientes de e-mail aceitam), em cores neutras.
 */
export function layoutEmail(
  ctx: ContextoEmail,
  m: { assunto: string; titulo: string; paragrafos: string[]; destaque?: string; botao?: { rotulo: string; url: string }; rodape?: string; lista?: { titulo: string; texto?: string | null; url: string }[]; descadastro?: string },
): ConteudoEmail {
  const nome = escaparHtml(ctx.nomeSistema || NOME_SISTEMA_PADRAO);
  const paras = m.paragrafos
    .filter((p) => p.trim())
    .map((p) => `<p style="margin:0 0 12px;font-size:15px;line-height:1.55;color:#374151">${escaparHtml(p)}</p>`)
    .join("");
  // O DESTAQUE (ex.: o código de confirmação): grande, espaçado e fácil de copiar.
  const destaque = m.destaque
    ? `<p style="margin:8px 0 16px;font-family:'SFMono-Regular',Consolas,monospace;font-size:30px;font-weight:700;letter-spacing:8px;color:#111827">${escaparHtml(m.destaque)}</p>`
    : "";
  const botao = m.botao
    ? `<p style="margin:20px 0 4px"><a href="${escaparHtml(m.botao.url)}" style="display:inline-block;background:#111827;color:#ffffff;text-decoration:none;font-weight:600;font-size:14px;padding:11px 18px;border-radius:8px">${escaparHtml(m.botao.rotulo)}</a></p>`
    : "";
  const rodape = escaparHtml(m.rodape ?? RODAPE_PADRAO) + (m.descadastro ? ` <a href="${escaparHtml(m.descadastro)}" style="color:#6b7280">Parar de receber este aviso</a>` : "");
  // A LISTA do resumo: um item por aviso (título com o link + o texto).
  const lista = m.lista?.length
    ? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:4px 0 8px">${m.lista
        .map(
          (i) =>
            `<tr><td style="padding:8px 0;border-top:1px solid #f3f4f6"><a href="${escaparHtml(i.url)}" style="font-size:14px;font-weight:600;color:#111827;text-decoration:none">${escaparHtml(i.titulo)}</a>${i.texto ? `<div style="font-size:13px;color:#6b7280;margin-top:2px">${escaparHtml(i.texto)}</div>` : ""}</td></tr>`,
        )
        .join("")}</table>`
    : "";
  const html = `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escaparHtml(m.assunto)}</title></head><body style="margin:0;padding:0;background:#f3f4f6;font-family:Inter,Roboto,Arial,Helvetica,sans-serif"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f3f4f6;padding:24px 12px"><tr><td align="center"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border:1px solid #e5e7eb;border-radius:12px"><tr><td style="padding:18px 24px;border-bottom:1px solid #e5e7eb;font-size:13px;font-weight:600;color:#6b7280">${nome}</td></tr><tr><td style="padding:24px"><h1 style="margin:0 0 16px;font-size:19px;line-height:1.35;color:#111827">${escaparHtml(m.titulo)}</h1>${paras}${lista}${destaque}${botao}</td></tr><tr><td style="padding:14px 24px;border-top:1px solid #e5e7eb;font-size:12px;line-height:1.5;color:#9ca3af">${rodape}</td></tr></table></td></tr></table></body></html>`;
  const texto = [
    ctx.nomeSistema || NOME_SISTEMA_PADRAO,
    "",
    m.titulo,
    "",
    ...m.paragrafos.filter((p) => p.trim()),
    ...(m.lista?.length ? ["", ...m.lista.map((i) => `• ${i.titulo}${i.texto ? ` — ${i.texto}` : ""}\n  ${i.url}`)] : []),
    ...(m.destaque ? ["", m.destaque] : []),
    ...(m.botao ? ["", `${m.botao.rotulo}: ${m.botao.url}`] : []),
    "",
    "—",
    m.rodape ?? RODAPE_PADRAO,
    ...(m.descadastro ? [`Parar de receber este aviso: ${m.descadastro}`] : []),
  ].join("\n");
  return { assunto: umaLinha(m.assunto), html, texto };
}

/** O assunto/rótulo curto de cada tipo de aviso. */
export const ROTULO_TIPO_EMAIL: Record<TipoNotificacao, string> = {
  atribuida: "Tarefa atribuída a você",
  mencionada: "Você foi mencionado",
  comentario: "Novo comentário",
  vence_hoje: "Prazo vence hoje",
  vence_amanha: "Prazo vence amanhã",
  atrasada: "Tarefa atrasada",
  automacao: "Aviso de automação",
  lembrete: "Lembrete",
  convite: "Convite para evento",
  resposta: "Resposta a convite",
  evento: "Evento alterado",
  protocolo: "Protocolo designado a você",
  pca: "Protocolo no PCA",
  cadastro: "Cadastro aguardando aprovação",
  situacao: "Protocolo atualizado",
  concluida: "Tarefa concluída",
  centi: "Automação Centi",
  comunicado: "Comunicado",
  versao: "Nova versão do sistema",
};

/** O e-mail de UMA notificação do sino (o mesmo título/texto/link que a pessoa vê no sistema). */
export function emailDaNotificacao(
  n: { tipo: TipoNotificacao; titulo: string; texto?: string | null; link?: string | null; atorNome?: string | null },
  ctx: ContextoEmail,
  descadastro?: string | null,
): ConteudoEmail {
  const url = urlAbsoluta(ctx.urlSistema, n.link);
  return layoutEmail(ctx, {
    assunto: n.titulo || ROTULO_TIPO_EMAIL[n.tipo],
    titulo: n.titulo || ROTULO_TIPO_EMAIL[n.tipo],
    paragrafos: [n.texto ?? "", n.atorNome ? `Por ${n.atorNome}.` : ""],
    botao: { rotulo: "Abrir no sistema", url },
    descadastro: descadastro ? urlAbsoluta(ctx.urlSistema, descadastro) : undefined,
  });
}

/** O RESUMO: vários avisos num e-mail só (o resumo diário ou os que juntaram no silêncio), o mais novo primeiro. */
export function emailResumo(
  itens: { tipo: TipoNotificacao; titulo: string; texto?: string | null; link?: string | null }[],
  ctx: ContextoEmail,
  descadastro?: string | null,
): ConteudoEmail {
  const n = itens.length;
  return layoutEmail(ctx, {
    assunto: `${n} aviso${n === 1 ? "" : "s"} na plataforma`,
    titulo: `Você tem ${n} aviso${n === 1 ? "" : "s"}`,
    paragrafos: [],
    lista: itens.slice(0, 50).map((i) => ({ titulo: i.titulo || ROTULO_TIPO_EMAIL[i.tipo], texto: i.texto, url: urlAbsoluta(ctx.urlSistema, i.link) })),
    botao: { rotulo: "Abrir as notificações", url: urlAbsoluta(ctx.urlSistema, "/painel") },
    rodape: "Resumo dos seus avisos. Ajuste o horário ou volte ao e-mail imediato no seu Perfil (Perfil → Notificações).",
    descadastro: descadastro ? urlAbsoluta(ctx.urlSistema, descadastro) : undefined,
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

/** O CÓDIGO de confirmação (cadastro ou senha) — 6 dígitos, com a validade. */
export function emailCodigo(p: { codigo: string; finalidade: "cadastro" | "senha"; validadeMin: number }, ctx: ContextoEmail): ConteudoEmail {
  const cad = p.finalidade === "cadastro";
  return layoutEmail(ctx, {
    assunto: `${p.codigo} é o seu código de confirmação`,
    titulo: cad ? "Confirme o seu e-mail institucional" : "Confirme a sua nova senha",
    paragrafos: [cad ? "Use o código abaixo para confirmar o e-mail e concluir o cadastro na plataforma." : "Use o código abaixo para confirmar a nova senha da sua conta."],
    destaque: p.codigo,
    rodape: `O código vale por ${p.validadeMin} minutos. Se não foi você quem pediu, ignore este e-mail — nada será alterado.`,
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
// O que sai por e-mail é decidido pelo ADM (`notificacoes-config-core.ts`); a pessoa só desliga o que ele deixou.

export const CHAVE_PREF_EMAIL = "email:notificacoes";
export { DESTINOS_EMAIL, type DestinoEmail, enderecoDosAvisos, lerPrefsEmail, PREFS_EMAIL_PADRAO, type PrefsEmail, querEmail } from "./notificacoes-config-core.ts";
