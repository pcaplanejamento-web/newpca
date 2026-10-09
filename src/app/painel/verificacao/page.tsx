import { PermissaoExportar } from "@/components/ExportarTabelas";
import { VerificacaoView } from "@/components/VerificacaoView";
import { acessoPagina } from "@/lib/acesso-pagina";
import { contextoBanners } from "@/lib/mesa-dados";

export const dynamic = "force-dynamic";

// VERIFICAÇÃO: conferir um protocolo ou DFD sem gravar nada. Segue a permissão da Mesa (as mesmas regras e unidades);
// o relatório em PDF, a ação Exportar na Mesa.
export default async function VerificacaoPage() {
  const r = await acessoPagina("dfd");
  if (r.bloqueio) return r.bloqueio;
  const c = await contextoBanners(r.acesso.u);
  return (
    <PermissaoExportar permitido={c.pode.sistema.exportar}>
      <VerificacaoView reparticoes={c.reparticoes} pcas={c.pcas} regras={c.regras} orgaos={c.orgaos} />
    </PermissaoExportar>
  );
}
