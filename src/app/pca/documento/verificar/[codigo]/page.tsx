import { headers } from "next/headers";
import { Callout } from "@/components/Callout";
import { IconTermo } from "@/components/icons";
import { MarcaLink } from "@/components/MarcaSistema";
import { FormCodigoTermo } from "@/components/VerificarArquivoTermo";
import { getAparencia } from "@/lib/aparencia";
import { brl, dataHoraBR, num } from "@/lib/format";
import { dadosDoDocumento, emissaoPorCodigo, seloConfere } from "@/lib/pca-documento";
import { getPcaEspaco } from "@/lib/pca-espaco";
import { contarTentativa } from "@/lib/seguranca-acesso";
import { codigoNormal } from "@/lib/termo-uso-core";

export const dynamic = "force-dynamic";

/**
 * VERIFICAÇÃO PÚBLICA do DOCUMENTO OFICIAL do PCA pelo código: o registro da emissão (PCA, quando, itens, DFDs e valor), se
 * o selo confere (o registro não foi alterado) e se os dados publicados do PCA mudaram depois da emissão. Limite por IP.
 */
export default async function VerificarDocumentoPcaPage({ params }: { params: Promise<{ codigo: string }> }) {
  const h = await headers();
  const ip = h.get("cf-connecting-ip") ?? h.get("x-real-ip") ?? "local";
  const espera = await contarTentativa("verificarDocumentoPcaIp", ip);
  // O Next já entrega o parâmetro decodificado; uma sequência "%" malformada vale como código inexistente.
  let bruto = (await params).codigo;
  try {
    bruto = decodeURIComponent(bruto);
  } catch {
    /* já decodificado */
  }
  const codigo = codigoNormal(bruto);
  const [aparencia, e] = await Promise.all([getAparencia(), !espera && codigo ? emissaoPorCodigo(codigo) : null]);
  const [integro, pca] = e ? await Promise.all([seloConfere(e), getPcaEspaco(e.pcaId)]) : [false, null];
  // Os dados de HOJE do PCA (memorizados por versão) — mudaram depois da emissão?
  const publicado = pca?.status === "publicado";
  const atual = pca && publicado ? await dadosDoDocumento(pca).catch(() => null) : null;
  const mudou = !!atual && !!e && atual.dadosHash !== e.dadosHash;
  return (
    <main className="flex min-h-dvh items-start justify-center bg-bg px-[var(--pad-canvas)] py-10">
      <div className="w-full max-w-[640px] space-y-6">
        <div className="flex">
          <MarcaLink href="/" dica="Abrir a página pública" identidade={aparencia.identidade} tamanho="lg" />
        </div>
        <section className="space-y-4 rounded-card bg-surface p-[var(--pad-card)] shadow-ring">
          <h1 className="flex items-center gap-2 text-[18px] font-semibold text-text">
            <IconTermo className="h-5 w-5 text-accent" />
            Verificação do documento do PCA
          </h1>
          {espera ? (
            <Callout kind="warn">Muitas consultas seguidas. Tente de novo em alguns minutos.</Callout>
          ) : e && integro ? (
            <>
              <Callout kind="ok">Emissão autêntica: este código foi emitido por este sistema com os números abaixo.</Callout>
              <p className="text-[13px] text-text-2">
                A verificação confirma a EMISSÃO — data, totais e a impressão digital dos dados publicados naquele momento. Confira se o documento em mãos
                traz o mesmo código, a mesma data, o mesmo número de itens e o mesmo valor total; em caso de dúvida, emita o documento de novo na página
                pública do PCA.
              </p>
              {mudou && <Callout kind="info">Os dados publicados do PCA foram atualizados depois desta emissão — emita o documento de novo para a versão atual.</Callout>}
              <dl className="grid grid-cols-1 gap-x-4 gap-y-1.5 text-[14px] sm:grid-cols-[auto_1fr]">
                <dt className="text-muted">PCA</dt>
                <dd className="text-text">
                  {publicado && pca ? `${pca.nome}${pca.ano ? ` (${pca.ano})` : ""}` : "PCA não publicado no momento"}
                </dd>
                <dt className="text-muted">Emitido em</dt>
                <dd className="text-text">{dataHoraBR(e.emitidoEm)} (Brasília)</dd>
                <dt className="text-muted">Itens</dt>
                <dd className="tabular-nums text-text">{num(e.itens)}</dd>
                <dt className="text-muted">DFDs</dt>
                <dd className="tabular-nums text-text">{num(e.dfds)}</dd>
                <dt className="text-muted">Valor total</dt>
                <dd className="tabular-nums text-text">{brl(e.valor)}</dd>
                <dt className="text-muted">Código</dt>
                <dd className="break-all font-mono text-text">{e.codigo}</dd>
                <dt className="text-muted">Impressão dos dados</dt>
                <dd className="break-all font-mono text-[12px] text-text-2">{e.dadosHash}</dd>
                <dt className="text-muted">Selo</dt>
                <dd className="break-all font-mono text-[12px] text-text-2">{e.selo}</dd>
              </dl>
            </>
          ) : e ? (
            <Callout kind="danger">O registro desta emissão não confere com o selo — o documento não deve ser aceito.</Callout>
          ) : (
            <>
              <Callout kind="warn">Nenhum documento com este código. Confira o código impresso no rodapé das páginas.</Callout>
              <FormCodigoTermo base="/pca/documento/verificar" dica="Como está no documento" />
            </>
          )}
        </section>
      </div>
    </main>
  );
}
