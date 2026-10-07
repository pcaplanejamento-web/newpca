import { AcessoRestrito } from "@/components/AcessoRestrito";
import { AutomacaoViva, CHAVE_AUTOMACAO } from "@/components/AutomacaoViva";
import { ManterVivo } from "@/components/SegundoPlano";
import { getUsuarioAtual } from "@/lib/auth";
import { dadosDaAutomacao } from "@/lib/automacao-dados";

export const dynamic = "force-dynamic";

export default async function AutomacaoPage() {
  const atual = await getUsuarioAtual();
  if (!atual?.admin) return <AcessoRestrito mensagem="Somente administradores podem acessar a automação." />;
  // ManterVivo: uma execução em curso SEGUE ao sair desta tela (minimizada no canto inferior direito) — e a mesma
  // automação, já rodando em segundo plano pela Mesa, aparece aqui com o estado inteiro.
  return (
    <ManterVivo chave={CHAVE_AUTOMACAO}>
      <AutomacaoViva dados={await dadosDaAutomacao(atual)} />
    </ManterVivo>
  );
}
