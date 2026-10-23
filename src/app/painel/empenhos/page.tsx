import { EmpenhosView } from "@/components/EmpenhosView";
import { PermissaoExportar } from "@/components/ExportarTabelas";
import { acessoPagina } from "@/lib/acesso-pagina";
import { carregarEdicoes } from "@/lib/edicoes-tabela";
import { anosEmpenhos, escopoDosEmpenhos } from "@/lib/empenhos-tela";
import { anoEscolhido, chaveEscopoEmpenhos } from "@/lib/empenhos-tela-core";

export const dynamic = "force-dynamic";

// EMPENHOS: tela do módulo (o grupo libera a tela, o papel diz o que a pessoa faz nela). Só leitura — a importação fica
// em Integrações (ADM). Só os empenhos VINCULADOS à unidade do cabeçalho (ou às unidades da pessoa): trocar a unidade
// remonta a tela (a `key`), sem os anos guardados do escopo anterior.
export default async function EmpenhosPage({ searchParams }: { searchParams: Promise<{ ano?: string }> }) {
  const r = await acessoPagina("empenhos");
  if (r.bloqueio) return r.bloqueio;
  const escopo = await escopoDosEmpenhos();
  const [{ ano }, anos, edicoes] = await Promise.all([
    searchParams,
    anosEmpenhos(escopo),
    carregarEdicoes(r.acesso.u.id, "empenhos:"),
  ]);
  return (
    <PermissaoExportar permitido={r.pode.exportar}>
      <EmpenhosView
        key={chaveEscopoEmpenhos(escopo)}
        escopo={escopo}
        anos={anos}
        anoInicial={anoEscolhido(anos, ano)}
        edicoes={edicoes}
        podePublicar={r.pode.configurar}
        importar={r.acesso.u.admin}
      />
    </PermissaoExportar>
  );
}
