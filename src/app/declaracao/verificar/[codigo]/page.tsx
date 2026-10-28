import { headers } from "next/headers";
import { Callout } from "@/components/Callout";
import { IconTermo } from "@/components/icons";
import { MarcaLink } from "@/components/MarcaSistema";
import { FormCodigoTermo } from "@/components/VerificarArquivoTermo";
import { getAparencia } from "@/lib/aparencia";
import { declaracaoPorCodigo, seloConfereDeclaracao } from "@/lib/declaracoes";
import { remanescente, textoDeclaracao } from "@/lib/declaracoes-core";
import { brl, dataHoraBR, num } from "@/lib/format";
import { contarTentativa } from "@/lib/seguranca-acesso";
import { codigoNormal } from "@/lib/termo-uso-core";

export const dynamic = "force-dynamic";

/**
 * VERIFICAÇÃO PÚBLICA da DECLARAÇÃO do PCA pelo código: válida, cancelada ou alterada (o selo não confere), com o texto e os
 * itens congelados na emissão — a mesma informação do PDF. Limite de consultas por IP.
 */
export default async function VerificarDeclaracaoPage({ params }: { params: Promise<{ codigo: string }> }) {
  const h = await headers();
  const ip = h.get("cf-connecting-ip") ?? h.get("x-real-ip") ?? "local";
  const espera = await contarTentativa("verificarDeclaracaoIp", ip);
  const codigo = codigoNormal(decodeURIComponent((await params).codigo));
  const [aparencia, d] = await Promise.all([getAparencia(), !espera && codigo ? declaracaoPorCodigo(codigo) : null]);
  const integro = d ? await seloConfereDeclaracao(d) : false;
  const c = d?.conteudo;
  return (
    <main className="flex min-h-dvh items-start justify-center bg-bg px-[var(--pad-canvas)] py-10">
      <div className="w-full max-w-[860px] space-y-6">
        <div className="flex">
          <MarcaLink href="/" dica="Abrir a página pública" identidade={aparencia.identidade} tamanho="lg" />
        </div>
        <section className="space-y-4 rounded-card bg-surface p-[var(--pad-card)] shadow-ring">
          <h1 className="flex items-center gap-2 text-[18px] font-semibold text-text">
            <IconTermo className="h-5 w-5 text-accent" />
            Verificação de declaração do PCA
          </h1>
          {espera ? (
            <Callout kind="warn">Muitas consultas seguidas. Tente de novo em alguns minutos.</Callout>
          ) : d && c && integro ? (
            <>
              {d.cancelada ? (
                <Callout kind="danger">
                  Declaração CANCELADA em {dataHoraBR(d.cancelada.em)}
                  {d.cancelada.motivo ? ` — ${d.cancelada.motivo}` : ""}. Não tem validade.
                </Callout>
              ) : !d.exportada ? (
                <Callout kind="warn">Declaração em elaboração: ainda não foi exportada e não tem validade. O conteúdo pode mudar até a exportação.</Callout>
              ) : (
                <Callout kind="ok">Declaração válida: o registro confere com o emitido.</Callout>
              )}
              <dl className="grid grid-cols-1 gap-x-4 gap-y-1.5 text-[14px] sm:grid-cols-[auto_1fr]">
                <dt className="text-muted">Declaração</dt>
                <dd className="text-text">Nº {d.rotulo}</dd>
                <dt className="text-muted">PCA</dt>
                <dd className="text-text">
                  {c.pca.nome}
                  {c.pca.ano ? ` (${c.pca.ano})` : ""}
                </dd>
                <dt className="text-muted">Finalidade</dt>
                <dd className="text-text">{d.finalidadeRotulo}</dd>
                {c.protocoloCenti && (
                  <>
                    <dt className="text-muted">Protocolo na Centi</dt>
                    <dd className="text-text">{c.protocoloCenti}</dd>
                  </>
                )}
                <dt className="text-muted">Emitida em</dt>
                <dd className="text-text">
                  {dataHoraBR(d.emitidoEm)} (Brasília) · {c.emitente.nome}
                </dd>
                <dt className="text-muted">Código</dt>
                <dd className="font-mono text-text">{d.codigo}</dd>
              </dl>
              <p className="text-[14px] leading-relaxed text-text-2">{textoDeclaracao(c)}</p>
              <div className="overflow-x-auto rounded-card border border-border">
                <table className="w-full min-w-[760px] text-[13px]">
                  <thead className="bg-surface-2 text-muted">
                    <tr>
                      <th className="px-3 py-2 text-center font-medium">Item</th>
                      <th className="px-3 py-2 text-center font-medium">DFD</th>
                      <th className="px-3 py-2 text-center font-medium">Planejamento</th>
                      <th className="px-3 py-2 text-left font-medium">Descrição</th>
                      <th className="px-3 py-2 text-right font-medium">No PCA</th>
                      <th className="px-3 py-2 text-right font-medium">Declarada</th>
                      <th className="px-3 py-2 text-right font-medium">Saldo</th>
                      <th className="px-3 py-2 text-right font-medium">Valor unitário</th>
                      <th className="px-3 py-2 text-right font-medium">Valor</th>
                    </tr>
                  </thead>
                  <tbody>
                    {c.linhas.map((l) => (
                      <tr key={l.sequencial} className="border-t border-border">
                        <td className="px-3 py-2 text-center tabular-nums">{l.sequencial}</td>
                        <td className="px-3 py-2 text-center tabular-nums">{l.dfdNumero ?? "—"}</td>
                        <td className="px-3 py-2 text-center tabular-nums">{l.planejamento ?? "—"}</td>
                        <td className="px-3 py-2 text-left">{l.descricao ?? "—"}</td>
                        <td className="px-3 py-2 text-right tabular-nums">{num(l.quantidadePca)}</td>
                        <td className="px-3 py-2 text-right tabular-nums">
                          {num(l.quantidade)}
                          {l.parcial ? " (parcial)" : ""}
                        </td>
                        <td className="px-3 py-2 text-right tabular-nums">{remanescente(l) == null ? "—" : num(remanescente(l))}</td>
                        <td className="px-3 py-2 text-right tabular-nums">{brl(l.valorUnitario)}</td>
                        <td className="px-3 py-2 text-right tabular-nums">{brl(l.valorTotal)}</td>
                      </tr>
                    ))}
                    <tr className="border-t border-border font-semibold">
                      <td className="px-3 py-2" colSpan={8}>
                        Total
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums">{brl(c.valorTotal)}</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </>
          ) : d ? (
            <Callout kind="danger">O registro deste código foi ALTERADO depois da emissão — a declaração não é válida.</Callout>
          ) : (
            <>
              <Callout kind="danger">Código não encontrado. Confira se foi digitado exatamente como está na declaração.</Callout>
              <FormCodigoTermo inicial={codigo ?? ""} base="/declaracao/verificar" dica="Como está na declaração" />
            </>
          )}
        </section>
      </div>
    </main>
  );
}
