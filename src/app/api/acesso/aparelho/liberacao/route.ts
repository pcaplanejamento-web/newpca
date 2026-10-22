import { exigirUsuarioLivre } from "@/lib/api-auth";
import { registrarAuditoria } from "@/lib/auditoria";
import { idsDosAdmins } from "@/lib/email";
import { erro, ok } from "@/lib/http";
import { notificar } from "@/lib/notificacoes";
import { contarTentativa, respostaLimite } from "@/lib/seguranca-acesso";
import { contaDe } from "@/lib/aparelhos";
import { emTrava } from "@/lib/acesso-conta-core";

export const dynamic = "force-dynamic";

/** "Pedir liberação ao ADM": a pessoa em trava de troca avisa os administradores (no sino; até 3 por dia). */
export async function POST() {
  const g = await exigirUsuarioLivre();
  if ("erro" in g) return g.erro;
  const conta = await contaDe(g.u.id);
  if (!emTrava(conta.trocaAte, Date.now())) return erro("A troca de aparelho já está liberada.", 409);
  const espera = await contarTentativa("liberacaoAparelho", String(g.u.id));
  if (espera) return respostaLimite(espera);
  const admins = (await idsDosAdmins()).filter((id) => id !== g.u.id);
  await notificar(
    admins.map((usuarioId) => ({
      usuarioId,
      tipo: "seguranca" as const,
      titulo: `Liberação de troca de aparelho: ${g.u.nome}`,
      texto: `${g.u.nome} (${g.u.email}) pediu para trocar de aparelho antes do prazo. Libere no banner do usuário → Aparelhos.`,
      link: `/painel/usuarios?abrir=${g.u.id}`,
    })),
  );
  await registrarAuditoria({ usuario: g.u, acao: "editar", entidade: "aparelho", entidadeId: g.u.id, resumo: "Pediu ao administrador a liberação da troca de aparelho" });
  return ok({ avisados: admins.length });
}
