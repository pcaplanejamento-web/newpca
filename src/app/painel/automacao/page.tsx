import { AcessoRestrito } from "@/components/AcessoRestrito";
import { AutomacaoAdmin } from "@/components/AutomacaoAdmin";
import { getUsuarioAtual } from "@/lib/auth";
import { protocolosParaAutomacao } from "@/lib/automacao";
import { getGrupoAtivoId } from "@/lib/grupos";
import { contextoBanners } from "@/lib/mesa-dados";
import { listarSituacoes } from "@/lib/situacoes";
import { listarPessoasDoGrupo, pessoasPorIds } from "@/lib/usuarios";

export const dynamic = "force-dynamic";

export default async function AutomacaoPage() {
  const atual = await getUsuarioAtual();
  if (!atual?.admin) return <AcessoRestrito mensagem="Somente administradores podem acessar a automação." />;
  const [protocolos, ctx, situacoes, grupoId] = await Promise.all([protocolosParaAutomacao(), contextoBanners(atual), listarSituacoes(), getGrupoAtivoId(atual)]);
  // Responsável = as pessoas do GRUPO ativo (as designáveis, como na Mesa) + as já gravadas de fora dele (só exibidas).
  const pessoas = await listarPessoasDoGrupo(grupoId);
  const doGrupo = new Set(pessoas.map((p) => p.id));
  const outras = await pessoasPorIds(protocolos.map((p) => p.responsavelId).filter((id) => id != null && !doGrupo.has(id)));
  // Os banners da Mesa (o protocolo aberto pela linha) com o MESMO contexto da Mesa.
  return (
    <AutomacaoAdmin
      protocolos={protocolos}
      gestao={{ pessoas, outras, situacoes: situacoes.map((s) => ({ id: s.id, nome: s.nome, cor: s.cor })), usuarioId: atual.id }}
      banners={{ pode: ctx.pode, reparticoes: ctx.reparticoes, regras: ctx.regras, orgaos: ctx.orgaos, pcas: ctx.pcas }}
    />
  );
}
