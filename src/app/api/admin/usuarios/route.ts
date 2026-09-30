import { desc, eq, sql } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { reparticoes, usuarios } from "@/db/schema";
import { exigirAdmin } from "@/lib/api-auth";
import { ok } from "@/lib/http";
import { urlFoto } from "@/lib/pessoa";
import { listarCargos } from "@/lib/cargos";
import { listarUnidadesTrabalho } from "@/lib/reparticoes";
import { getIntegracoes } from "@/lib/integracoes";
import { resendConfigurado } from "@/lib/integracoes-core";

export const dynamic = "force-dynamic";

export async function GET() {
  const guard = await exigirAdmin();
  if ("erro" in guard) return guard.erro;

  const [lista, unidades, cargosLista, integ] = await Promise.all([
    getDb()
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
        atualizadoEm: usuarios.atualizadoEm,
        reparticaoId: usuarios.reparticaoId,
        unidade: reparticoes.nome,
        // A foto vai como URL (rota com cache), não o data-URL — a lista não pesa com muitos usuários.
        temFoto: sql<number>`(${usuarios.foto} IS NOT NULL AND ${usuarios.foto} <> '')`,
        versao: usuarios.atualizadoEm,
        role: usuarios.role,
        status: usuarios.status,
        criadoEm: usuarios.criadoEm,
      })
      .from(usuarios)
      .leftJoin(reparticoes, eq(reparticoes.id, usuarios.reparticaoId))
      .orderBy(desc(usuarios.criadoEm)),
    listarUnidadesTrabalho(),
    listarCargos(),
    getIntegracoes(),
  ]);

  return ok({
    usuarios: lista.map(({ temFoto, versao, emailVerificado, ...u }) => ({ ...u, emailVerificado: !!emailVerificado, foto: urlFoto(u.id, !!temFoto, versao) })),
    unidades,
    cargos: cargosLista,
    meuId: guard.u.id,
    // "Exigir nova senha" depende do envio do código por e-mail (Resend).
    envioEmail: resendConfigurado(integ),
  });
}
