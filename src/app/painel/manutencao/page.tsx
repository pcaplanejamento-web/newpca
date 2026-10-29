import { PermissaoExportar } from "@/components/ExportarTabelas";
import { FrotaView } from "@/components/frota/FrotaView";
import { acessoPagina } from "@/lib/acesso-pagina";
import { chaveEscopoEmpenhos } from "@/lib/empenhos-tela-core";
import { dadosDaPaginaFrota } from "@/lib/frota";
import { LINK_CONFIG_FROTA } from "@/lib/frota-core";

export const dynamic = "force-dynamic";

// FROTAS — a tela "manutencao" (os dados da Vólus no escopo da pessoa — a unidade do cabeçalho; trocar a unidade remonta).
export default async function Pagina() {
  const r = await acessoPagina("manutencao");
  if (r.bloqueio) return r.bloqueio;
  const d = await dadosDaPaginaFrota();
  return (
    <PermissaoExportar permitido={r.pode.exportar}>
      <FrotaView
        key={chaveEscopoEmpenhos(d.escopo)}
        modo="manutencao"
        anos={d.anos}
        anoInicial={d.anos[0] ?? null}
        versao={d.versao}
        contratos={d.contratos}
        alertas={d.alertas}
        importacao={{ meta: d.meta, admin: r.acesso.u.admin, ativos: r.acesso.u.admin ? d.ativos : [] }}
        configurar={r.acesso.u.admin ? LINK_CONFIG_FROTA : undefined}
      />
    </PermissaoExportar>
  );
}
