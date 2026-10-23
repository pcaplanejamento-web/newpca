import { EmpenhosView } from "@/components/EmpenhosView";
import { PermissaoExportar } from "@/components/ExportarTabelas";
import { acessoPagina } from "@/lib/acesso-pagina";
import { carregarEdicoes } from "@/lib/edicoes-tabela";
import { anosEmpenhos, gestoresSemCadastro, orgaosDosEmpenhos } from "@/lib/empenhos-tela";
import { anoEscolhido, chaveOrgaosEmpenhos } from "@/lib/empenhos-tela-core";

export const dynamic = "force-dynamic";

// EMPENHOS: tela do módulo (o grupo libera a tela, o papel diz o que a pessoa faz nela). Só leitura — a importação fica
// em Integrações (ADM). Só os órgãos gestores da unidade do cabeçalho (ou das unidades da pessoa): trocar a unidade
// remonta a tela (a `key`), sem os anos guardados do escopo anterior.
export default async function EmpenhosPage({ searchParams }: { searchParams: Promise<{ ano?: string }> }) {
  const r = await acessoPagina("empenhos");
  if (r.bloqueio) return r.bloqueio;
  const escopo = await orgaosDosEmpenhos();
  const [{ ano }, anos, edicoes, semCadastro] = await Promise.all([
    searchParams,
    anosEmpenhos(escopo),
    carregarEdicoes(r.acesso.u.id, "empenhos:"),
    r.acesso.u.admin ? gestoresSemCadastro() : Promise.resolve([]),
  ]);
  return (
    <PermissaoExportar permitido={r.pode.exportar}>
      <EmpenhosView
        key={chaveOrgaosEmpenhos(escopo)}
        orgaos={escopo}
        semCadastro={semCadastro}
        anos={anos}
        anoInicial={anoEscolhido(anos, ano)}
        edicoes={edicoes}
        podePublicar={r.pode.configurar}
        importar={r.acesso.u.admin}
      />
    </PermissaoExportar>
  );
}
