import { desc, eq, sql } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { reparticoes, usuarioGrupos, usuarios } from "@/db/schema";
import { todosOsGruposComAbas } from "@/lib/acesso";
import { exigirAdmin } from "@/lib/api-auth";
import { papelDoUsuarioSql } from "@/lib/auth";
import { ok } from "@/lib/http";
import { urlFoto } from "@/lib/pessoa";
import { listarCargos } from "@/lib/cargos";
import { opcoesPapel } from "@/lib/papeis";
import { listarUnidadesTrabalho } from "@/lib/reparticoes";
import { getIntegracoes } from "@/lib/integracoes";
import { resendConfigurado } from "@/lib/integracoes-core";

export const dynamic = "force-dynamic";

export async function GET() {
  const guard = await exigirAdmin();
  if ("erro" in guard) return guard.erro;

  const db = getDb();
  const [lista, vinculos, unidades, cargosLista, papeis, grupos, integ] = await Promise.all([
    db
      .select({
        id: usuarios.id,
        nome: usuarios.nome,
        apelido: usuarios.apelido,
        email: usuarios.email,
        emailVerificado: sql<number>`(${usuarios.emailVerificadoEm} IS NOT NULL)`,
        matricula: usuarios.matricula,
        cargo: usuarios.cargo,
        telefone: usuarios.telefone,
        telefoneWhatsapp: usuarios.telefoneWhatsapp,
        dadosValidadosEm: usuarios.dadosValidadosEm,
        dadosValidadosPor: usuarios.dadosValidadosPor,
        trocarSenha: usuarios.trocarSenha,
        arquivadoEm: usuarios.arquivadoEm,
        arquivadoPor: usuarios.arquivadoPor,
        atualizadoEm: usuarios.atualizadoEm,
        reparticaoId: usuarios.reparticaoId,
        unidade: reparticoes.nome,
        // A foto vai como URL (rota com cache), não o data-URL — a lista não pesa com muitos usuários.
        temFoto: sql<number>`(${usuarios.foto} IS NOT NULL AND ${usuarios.foto} <> '')`,
        versao: usuarios.atualizadoEm,
        // O papel EFETIVO — a MESMA regra da sessão (sem `papel_id`, o do sistema pela chave antiga): a tela nunca diz
        // "Sem papel" de quem a sessão trata como Membro.
        papelId: sql<number | null>`${papelDoUsuarioSql}`,
        status: usuarios.status,
        criadoEm: usuarios.criadoEm,
      })
      .from(usuarios)
      .leftJoin(reparticoes, eq(reparticoes.id, usuarios.reparticaoId))
      .orderBy(desc(usuarios.criadoEm)),
    db.select({ usuarioId: usuarioGrupos.usuarioId, grupoId: usuarioGrupos.grupoId }).from(usuarioGrupos),
    listarUnidadesTrabalho(),
    listarCargos(),
    opcoesPapel(),
    todosOsGruposComAbas(),
    getIntegracoes(),
  ]);

  // Os grupos de cada pessoa (ids, na ordem do nome do grupo — a lista de grupos já vem ordenada).
  const ordem = new Map(grupos.map((g, i) => [g.id, i]));
  const gruposDe = new Map<number, number[]>();
  for (const v of vinculos) gruposDe.set(v.usuarioId, [...(gruposDe.get(v.usuarioId) ?? []), v.grupoId]);
  for (const ids of gruposDe.values()) ids.sort((a, b) => (ordem.get(a) ?? 0) - (ordem.get(b) ?? 0));

  return ok({
    usuarios: lista.map(({ temFoto, versao, emailVerificado, ...u }) => ({
      ...u,
      emailVerificado: !!emailVerificado,
      foto: urlFoto(u.id, !!temFoto, versao),
      grupos: gruposDe.get(u.id) ?? [],
    })),
    unidades,
    cargos: cargosLista,
    papeis,
    grupos: grupos.map(({ id, nome, abas }) => ({ id, nome, abas })),
    meuId: guard.u.id,
    // "Exigir nova senha" depende do envio do código por e-mail (Resend).
    envioEmail: resendConfigurado(integ),
  });
}
