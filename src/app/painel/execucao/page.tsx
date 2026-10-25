import { AcessoRestrito } from "@/components/AcessoRestrito";
import { ExecucaoView } from "@/components/ExecucaoView";
import { PermissaoExportar } from "@/components/ExportarTabelas";
import { acessoPagina } from "@/lib/acesso-pagina";
import { getDb } from "@/lib/db";
import { fontesDoAcesso } from "@/lib/execucao-dados";
import { consultaVersaoExecucao } from "@/lib/execucao-sql";
import { dataIsoBrasilia } from "@/lib/format";

export const dynamic = "force-dynamic";

// EXECUÇÃO: o dashboard de empenhos, liquidações e pagamentos (ligados pelo número do empenho). Os dados vêm no navegador
// (`GET /api/execucao`, o pacote montado pelo banco); a VERSÃO vai daqui — uma importação nova (o `SincronizarDados`
// recarrega a tela) muda a versão e a tela pede os números de novo. Cada etapa só com a tela dela.
export default async function ExecucaoPage() {
  const r = await acessoPagina("execucao");
  if (r.bloqueio) return r.bloqueio;
  const f = fontesDoAcesso(r.acesso);
  if (!f.empenhos) return <AcessoRestrito mensagem="O dashboard da execução precisa do acesso à tela Empenhos. Peça ao administrador." />;
  const versao = await consultaVersaoExecucao(getDb());
  return (
    <PermissaoExportar permitido={r.pode.exportar}>
      <ExecucaoView versao={versao} hoje={dataIsoBrasilia(new Date().toISOString())} podeExportar={r.pode.exportar} />
    </PermissaoExportar>
  );
}
