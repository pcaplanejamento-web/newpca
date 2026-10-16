import { exigirAdmin } from "@/lib/api-auth";
import { registrarAuditoria } from "@/lib/auditoria";
import { ok, parseCorpo } from "@/lib/http";
import { getModulosFresco, gravarModulos } from "@/lib/modulos";
import { rotuloAba } from "@/lib/modulos-core";
import { modulosSchema } from "@/lib/modulos-validation";

export const dynamic = "force-dynamic";

// Configurações → Módulos (ADM): os módulos e as telas de cada um (blob `configuracoes` id=1, chave `modulos` — as chaves
// irmãs ficam). Os grupos liberam módulos: mudar um módulo muda o acesso de todos os grupos que o usam.

export async function GET() {
  const g = await exigirAdmin();
  if ("erro" in g) return g.erro;
  return ok({ modulos: await getModulosFresco() });
}

const texto = (l: { nome: string; telas: Parameters<typeof rotuloAba>[0][] }[]) => l.map((m) => `${m.nome} (${m.telas.map(rotuloAba).join(", ") || "sem telas"})`).join("; ");

export async function PATCH(req: Request) {
  const g = await exigirAdmin();
  if ("erro" in g) return g.erro;
  const p = await parseCorpo(modulosSchema, req);
  if ("resp" in p) return p.resp;
  const antes = await getModulosFresco();
  const modulos = await gravarModulos(p.data.modulos, g.u.id);
  const [a, d] = [texto(antes), texto(modulos)];
  await registrarAuditoria({ usuario: g.u, acao: "editar", entidade: "configuracao", entidadeId: 1, resumo: `Módulos (ADM): ${a === d ? "sem mudança" : `${a} → ${d}`}`, antes: { modulos: antes }, depois: { modulos } });
  return ok({ modulos });
}
