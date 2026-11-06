import { componenteLibera, podeTela } from "@/lib/acesso";
import { exigirSessao } from "@/lib/api-auth";
import { erro, ok } from "@/lib/http";
import { contextoBanners } from "@/lib/mesa-dados";

export const dynamic = "force-dynamic";

/**
 * O CONTEXTO dos banners da Mesa (unidades com os responsáveis, regras do ADM, órgãos, PCAs e o que o papel permite) — o
 * que a PESQUISA DO SISTEMA usa para abrir o protocolo, o DFD e o item NA TELA em que a pessoa está (`AbrirNoLugar`).
 * Os próprios banners leem cada registro pelas rotas de sempre (escopo e papel conferidos lá).
 */
export async function GET() {
  const a = await exigirSessao();
  if ("erro" in a) return a.erro;
  const acao = "visualizar" as const;
  const veSistema = podeTela(a.acesso, "dfd")[acao];
  const vePca = podeTela(a.acesso, "pca")[acao] && componenteLibera(a.acesso, "pca.mesa");
  if (!veSistema && !vePca) return erro("Sem acesso às Mesas.", 403);
  const c = await contextoBanners(a.u, veSistema ? "dfd" : "pca");
  const r = ok({ pode: c.pode, reparticoes: c.reparticoes, regras: c.regras, orgaos: c.orgaos, pcas: c.pcas });
  r.headers.set("Cache-Control", "private, no-store");
  return r;
}
