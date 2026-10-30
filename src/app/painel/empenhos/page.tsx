import { EmpenhosView } from "@/components/EmpenhosView";
import { EmpenhosTabela } from "@/components/EmpenhosTabela";
import { PermissaoExportar } from "@/components/ExportarTabelas";
import { acessoPagina } from "@/lib/acesso-pagina";
import { getDb } from "@/lib/db";
import { carregarEdicoes } from "@/lib/edicoes-tabela";
import { linkImportacoes } from "@/lib/empenho-cards-core";
import { listarCards } from "@/lib/empenho-cards";
import { anosEmpenhos, escopoDosEmpenhos } from "@/lib/empenhos-tela";
import { anoEscolhido, chaveEscopoEmpenhos } from "@/lib/empenhos-tela-core";
import { consultaVersoesExecucao, versaoDaTelaExecucao } from "@/lib/execucao-sql";

export const dynamic = "force-dynamic";

// EMPENHOS (tela do módulo): só os DADOS — a TABELA ÚNICA de todos os cards (o mesmo empenho uma vez). As importações (os
// cards) ficam em Configurações → Importações. Tudo no escopo da pessoa (a unidade do cabeçalho): trocar a unidade remonta
// a tabela (a `key`).
export default async function EmpenhosPage({ searchParams }: { searchParams: Promise<{ ano?: string }> }) {
  const r = await acessoPagina("empenhos");
  if (r.bloqueio) return r.bloqueio;
  const [sp, escopo] = await Promise.all([searchParams, escopoDosEmpenhos()]);
  const cards = await listarCards(escopo, "empenhos");
  const [anos, edicoes, versao] = await Promise.all([anosEmpenhos(null, escopo), carregarEdicoes(r.acesso.u.id, "empenhos:"), consultaVersoesExecucao(getDb()).then((v) => versaoDaTelaExecucao(v, "empenhos"))]);
  return (
    <EmpenhosView tipo="empenhos" importacoes={r.acesso.u.admin ? linkImportacoes("empenhos") : undefined}>
      <PermissaoExportar permitido={r.pode.exportar}>
        <EmpenhosTabela
          key={chaveEscopoEmpenhos(escopo)}
         
          nome="Empenhos - todos os cards"
          cards={Object.fromEntries(cards.map((c) => [c.id, c.nome]))}
          escopo={escopo}
          anos={anos}
          anoInicial={anoEscolhido(anos, sp.ano)}
          edicoes={edicoes}
          podePublicar={r.pode.configurar}
          versao={`${versao}|${chaveEscopoEmpenhos(escopo)}`}
        />
      </PermissaoExportar>
    </EmpenhosView>
  );
}
