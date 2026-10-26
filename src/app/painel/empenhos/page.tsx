import { type AbaModuloEmpenhos, EmpenhosView } from "@/components/EmpenhosView";
import { EmpenhosTabela } from "@/components/EmpenhosTabela";
import { PermissaoExportar } from "@/components/ExportarTabelas";
import { acessoPagina } from "@/lib/acesso-pagina";
import { getDb } from "@/lib/db";
import { carregarEdicoes } from "@/lib/edicoes-tabela";
import { listarCards } from "@/lib/empenho-cards";
import { anosEmpenhos, escopoDosEmpenhos } from "@/lib/empenhos-tela";
import { anoEscolhido, chaveEscopoEmpenhos } from "@/lib/empenhos-tela-core";
import { consultaVersaoExecucao } from "@/lib/execucao-sql";

export const dynamic = "force-dynamic";

// EMPENHOS (tela do módulo): abre em DADOS — a TABELA ÚNICA de todos os cards (o mesmo empenho uma vez) — e troca para
// IMPORTAÇÕES = a lista de cards (cada um uma importação da Centi com a própria configuração). O servidor monta só a aba
// ativa (`?aba=`). Tudo no escopo da pessoa (a unidade do cabeçalho): trocar a unidade remonta a tabela (a `key`).
export default async function EmpenhosPage({ searchParams }: { searchParams: Promise<{ aba?: string; ano?: string }> }) {
  const r = await acessoPagina("empenhos");
  if (r.bloqueio) return r.bloqueio;
  const [sp, escopo] = await Promise.all([searchParams, escopoDosEmpenhos()]);
  const aba: AbaModuloEmpenhos = sp.aba === "importacoes" ? "importacoes" : "dados";
  const cards = await listarCards(escopo, "empenhos");
  if (aba === "importacoes") return <EmpenhosView tipo="empenhos" cards={cards} podeCriar={r.pode.configurar} aba={aba} />;
  const [anos, edicoes, versao] = await Promise.all([anosEmpenhos(null, escopo), carregarEdicoes(r.acesso.u.id, "empenhos:"), consultaVersaoExecucao(getDb())]);
  return (
    <EmpenhosView tipo="empenhos" cards={cards} podeCriar={r.pode.configurar} aba={aba}>
      <PermissaoExportar permitido={r.pode.exportar}>
        <EmpenhosTabela
          key={chaveEscopoEmpenhos(escopo)}
          cardId={null}
          nome="Empenhos - todos os cards"
          cards={Object.fromEntries(cards.map((c) => [c.id, c.nome]))}
          escopo={escopo}
          anos={anos}
          anoInicial={anoEscolhido(anos, sp.ano)}
          edicoes={edicoes}
          podePublicar={r.pode.configurar}
          versao={versao}
        />
      </PermissaoExportar>
    </EmpenhosView>
  );
}
