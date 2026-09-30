"use client";

import { ABA_KEYS } from "@/lib/abas";
import {
  ACOES_PAPEL,
  type AcaoPapel,
  alternarCelula,
  alternarColuna,
  alternarLinha,
  aplicavel,
  CATALOGO_PAPEIS,
  type Capacidades,
  DESCRICAO_ACAO,
  type EstadoGrupo,
  estadoColuna,
  estadoLinha,
  ROTULO_ACAO,
  rotuloTela,
  type Tela,
} from "@/lib/papeis-core";
import { Checkbox } from "./Field";
import { Switch } from "./Switch";

const tem = (caps: Capacidades, tela: Tela, acao: AcaoPapel) => (caps[tela] ?? []).includes(acao);

/**
 * MATRIZ de capacidades de um papel — Telas × Ações (Visualizar · Manipular · Importar · Exportar · Excluir · Configurar).
 * Controlada (`valor` + `onChange`); as implicações vêm do núcleo puro: marcar qualquer ação liga o Visualizar, desmarcar
 * o Visualizar FECHA a tela (tira tudo), marcar a linha liga tudo o que se aplica à tela, marcar a coluna liga a ação em
 * todas as telas em que ela se aplica. A célula que não se aplica mostra "—" (anunciada "Não se aplica"). Cada célula traz
 * na dica o que a ação cobre naquela tela. `original` = o gravado: as células que MUDARAM ficam destacadas. No desktop, a
 * tabela; no celular, um cartão por tela com as chaves (`Switch`). Sem `onChange` = só leitura ("Ver acesso").
 */
export function MatrizCapacidades({
  valor,
  onChange,
  original,
  telas = ABA_KEYS,
}: {
  valor: Capacidades;
  onChange?: (c: Capacidades) => void;
  original?: Capacidades;
  /** As telas mostradas (padrão: todas, na ordem da navegação). */
  telas?: readonly Tela[];
}) {
  const leitura = !onChange;
  const mudou = (tela: Tela, acao: AcaoPapel) => !!original && tem(original, tela, acao) !== tem(valor, tela, acao);
  const grupo = (e: EstadoGrupo) => ({ checked: e === "todas", indeterminado: e === "algumas" });

  return (
    <>
      {/* Desktop: a tabela Telas × Ações. */}
      <div className="hidden overflow-x-auto rounded-card border border-border md:block">
        <table className="w-full border-collapse text-[13.5px]">
          <caption className="sr-only">Capacidades do papel: telas nas linhas, ações nas colunas</caption>
          <thead>
            <tr className="border-b border-border bg-surface-2">
              <th scope="col" className="px-3 py-2 text-left font-semibold text-text-2">
                Tela
              </th>
              {ACOES_PAPEL.map((a) => (
                <th key={a} scope="col" className="px-2 py-2 text-center font-semibold text-text-2" title={DESCRICAO_ACAO[a]}>
                  <div className="flex flex-col items-center gap-1">
                    <span>{ROTULO_ACAO[a]}</span>
                    {!leitura && (
                      <Checkbox
                        alvo
                        aria-label={`${ROTULO_ACAO[a]} em todas as telas`}
                        {...grupo(estadoColuna(valor, a))}
                        onChange={(e) => onChange?.(alternarColuna(valor, a, e.target.checked))}
                      />
                    )}
                  </div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {telas.map((t) => (
              <tr key={t} className="border-b border-border last:border-b-0">
                <th scope="row" className="px-3 py-1.5 text-left font-medium text-text">
                  <div className="flex items-center gap-2">
                    {!leitura && (
                      <Checkbox
                        alvo
                        aria-label={`Tudo ${CATALOGO_PAPEIS[t].na}`}
                        {...grupo(estadoLinha(valor, t))}
                        onChange={(e) => onChange?.(alternarLinha(valor, t, e.target.checked))}
                      />
                    )}
                    <span>{rotuloTela(t)}</span>
                  </div>
                </th>
                {ACOES_PAPEL.map((a) => {
                  const nome = `${rotuloTela(t)}: ${ROTULO_ACAO[a]}`;
                  if (!aplicavel(t, a))
                    return (
                      <td key={a} className="px-2 py-1.5 text-center text-faint">
                        <span role="img" aria-label={`${nome} — não se aplica`} title="Não se aplica nesta tela">
                          —
                        </span>
                      </td>
                    );
                  const marcada = tem(valor, t, a);
                  return (
                    <td
                      key={a}
                      className={`px-2 py-1 text-center ${mudou(t, a) ? "bg-accent/10" : ""}`}
                      title={`${CATALOGO_PAPEIS[t].acoes[a]}${mudou(t, a) ? " (alterado)" : ""}`}
                    >
                      {leitura ? (
                        <span role="img" aria-label={`${nome}: ${marcada ? "sim" : "não"}`} className={marcada ? "font-semibold text-[color:var(--ok)]" : "text-faint"}>
                          {marcada ? "✓" : "·"}
                        </span>
                      ) : (
                        <Checkbox alvo aria-label={nome} checked={marcada} onChange={(e) => onChange?.(alternarCelula(valor, t, a, e.target.checked))} />
                      )}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Celular: um cartão por tela com as chaves. */}
      <div className="space-y-[var(--gap-block)] md:hidden">
        {telas.map((t) => (
          <section key={t} className="rounded-card border border-border bg-surface p-[var(--pad-card)]" aria-label={rotuloTela(t)}>
            <div className="flex items-center justify-between gap-2">
              <h4 className="text-[14px] font-bold text-text">{rotuloTela(t)}</h4>
              {!leitura && (
                <Checkbox
                  alvo
                  aria-label={`Tudo ${CATALOGO_PAPEIS[t].na}`}
                  {...grupo(estadoLinha(valor, t))}
                  onChange={(e) => onChange?.(alternarLinha(valor, t, e.target.checked))}
                />
              )}
            </div>
            <ul className="mt-1 divide-y divide-border">
              {ACOES_PAPEL.filter((a) => aplicavel(t, a)).map((a) => {
                const marcada = tem(valor, t, a);
                return (
                  <li key={a} className={`flex items-center justify-between gap-3 ${mudou(t, a) ? "bg-accent/10" : ""}`}>
                    <div className="min-w-0 py-1.5">
                      <p className="text-[13.5px] font-medium text-text">{ROTULO_ACAO[a]}</p>
                      <p className="text-[12.5px] text-muted">{CATALOGO_PAPEIS[t].acoes[a]}</p>
                    </div>
                    {leitura ? (
                      <span className={`shrink-0 text-[13px] ${marcada ? "font-semibold text-[color:var(--ok)]" : "text-faint"}`}>{marcada ? "Sim" : "Não"}</span>
                    ) : (
                      <Switch checked={marcada} onChange={(v) => onChange?.(alternarCelula(valor, t, a, v))} label={<span className="sr-only">{`${rotuloTela(t)}: ${ROTULO_ACAO[a]}`}</span>} />
                    )}
                  </li>
                );
              })}
            </ul>
          </section>
        ))}
      </div>
    </>
  );
}
