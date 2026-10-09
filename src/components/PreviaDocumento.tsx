"use client";

import type { BlocoDoc } from "@/lib/documento-pdf-core";

/** Cor de um bloco do documento na TELA: CSS (`#hex`, `var(--token)`) como está; os papéis da paleta (`@muted`…) pelos tokens. */
function cor(c: string | null | undefined): string | undefined {
  if (!c) return undefined;
  if (!c.startsWith("@")) return c;
  return c === "@muted" ? "var(--muted)" : c === "@titulo" ? "var(--accent)" : "var(--text)";
}

/**
 * PRÉVIA de um DOCUMENTO em PDF — os MESMOS blocos (`BlocoDoc`) que o gerador A4 (`documento-pdf`) desenha, aqui em HTML
 * leve como uma folha: título, seções, parágrafos, listas, destaques, notas e tabelas com as cores de cada célula. Serve
 * para conferir o conteúdo antes de baixar (rápido, no celular também — sem gerar o PDF). Só tokens do design system.
 */
export function PreviaDocumento({ blocos }: { blocos: BlocoDoc[] }) {
  return (
    <div className="space-y-3 rounded-card border border-border bg-surface p-4 text-[12.5px] leading-snug text-text shadow-ring sm:p-6">
      {blocos.map((b, i) => {
        const k = `${b.tipo}-${i}`;
        switch (b.tipo) {
          case "titulo":
            return (
              <h3 key={k} className="border-b border-border pb-2 text-[16px] font-bold">
                {b.texto}
              </h3>
            );
          case "secao":
            return (
              <h4 key={k} className="pt-2 text-[14px] font-bold text-accent">
                {b.texto}
              </h4>
            );
          case "subsecao":
            return (
              <div key={k} className="flex flex-wrap items-baseline justify-between gap-2 text-[12.5px] font-semibold">
                <span>{b.texto}</span>
                {b.detalhe && <span style={{ color: cor(b.corDetalhe) ?? "var(--muted)" }}>{b.detalhe}</span>}
              </div>
            );
          case "paragrafo":
            return (
              <p key={k} className={b.cor === "muted" ? "text-muted" : ""}>
                {b.texto}
              </p>
            );
          case "lista":
            return (
              <ul key={k} className="list-disc space-y-0.5 pl-5">
                {b.itens.map((t, j) => (
                  <li key={j}>{t}</li>
                ))}
              </ul>
            );
          case "destaques":
            return (
              <div key={k} className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                {b.itens.map((d) => (
                  <div key={d.rotulo} className="rounded-control border border-border bg-surface-2 px-3 py-2">
                    <div className="text-[11px] text-muted">{d.rotulo}</div>
                    <div className="text-[15px] font-bold tabular-nums" style={{ color: cor(d.cor) }}>
                      {d.valor}
                    </div>
                    {d.detalhe && <div className="text-[11px] text-muted">{d.detalhe}</div>}
                  </div>
                ))}
              </div>
            );
          case "nota":
            return (
              <p key={k} className="rounded-control border-l-4 bg-surface-2 px-3 py-2 font-semibold" style={{ borderColor: cor(b.cor), color: cor(b.cor) }}>
                {b.texto}
              </p>
            );
          case "tabela":
            return (
              <div key={k} className="overflow-x-auto rounded-control border border-border">
                {b.linhas.length === 0 ? (
                  <p className="p-3 text-muted">{b.vazio ?? "Sem linhas."}</p>
                ) : (
                  <table className="w-full min-w-[32rem] border-collapse text-[11.5px]">
                    <thead className="bg-accent-soft text-accent">
                      <tr>
                        {b.colunas.map((c) => (
                          <th key={c.titulo} className={`px-2 py-1.5 font-semibold ${c.alinhar === "right" ? "text-right" : "text-left"}`}>
                            {c.titulo}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {b.linhas.map((l, j) => (
                        <tr key={j} className={`border-t border-border align-top ${j % 2 ? "bg-surface-2" : ""} ${l.destaque ? "font-bold" : ""}`}>
                          {l.celulas.map((t, x) => (
                            <td
                              key={x}
                              className={`break-words px-2 py-1.5 ${b.colunas[x]?.alinhar === "right" ? "text-right tabular-nums" : ""} ${l.negritos?.[x] ? "font-semibold" : ""}`}
                              style={{ color: cor(l.cores?.[x]) }}
                            >
                              {t}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            );
          default:
            return null;
        }
      })}
    </div>
  );
}
