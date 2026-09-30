import { redirect } from "next/navigation";
import type { ReactElement } from "react";
import { AcessoRestrito } from "@/components/AcessoRestrito";
import { rotaInicial } from "./abas";
import { type Acesso, getAcesso, podeTela } from "./acesso";
import { mensagemTelaFechada, type PodeTela, type Tela } from "./papeis-core";

/**
 * O PORTÃO das páginas de módulo: sem sessão → `/login`; a tela fechada (o grupo não libera ou o papel não visualiza) →
 * `bloqueio` (o card "Acesso restrito" com o caminho de volta à porta de entrada). Antes as páginas confiavam no layout
 * (que a navegação no cliente não reexecuta) e a permissão só escondia o menu — pela URL qualquer um abria.
 * `grupoId` = o grupo do RECURSO (o quadro de tarefas de outro grupo da pessoa).
 */
export async function acessoPagina(
  tela: Tela,
  grupoId?: number | null,
): Promise<{ acesso: Acesso; pode: PodeTela; bloqueio?: undefined } | { bloqueio: ReactElement }> {
  const acesso = await getAcesso();
  if (!acesso) redirect("/login");
  const pode = podeTela(acesso, tela, grupoId);
  if (pode.visualizar) return { acesso, pode };
  const destino = rotaInicial(new Set(acesso.telas));
  return {
    bloqueio: (
      <AcessoRestrito
        mensagem={mensagemTelaFechada(tela)}
        voltar={{ href: destino, rotulo: destino === "/painel/perfil" ? "Ver o meu perfil" : "Ir para a minha tela inicial" }}
      />
    ),
  };
}
