"use client";

import {
  coerceDetalhes,
  DESCRICAO_OPERACAO_EDICAO,
  type DetalhesPapel,
  OPERACOES_EDICAO,
  type OperacaoEdicao,
  ROTULO_OPERACAO_EDICAO,
  rotuloTelaDetalhe,
  TELAS_EDICOES,
  type TelaEdicoes,
} from "@/lib/papeis-detalhes-core";
import { Checkbox } from "./Field";

/**
 * As EDIÇÕES SALVAS das tabelas por tela (Mesa, Mesa do PCA, Orçamento — o Comparativo —, Tarefas — a Lista): uma matriz
 * Telas × Personalizar · Publicar · Moderar. Os detalhes só RETIRAM: publicar e moderar exigem também Configurar na tela;
 * sem personalizar, nem publica nem modera (a caixa fica travada). Controlada; sem `onChange` = só leitura; `original` =
 * o gravado (as células que mudaram ficam marcadas).
 */
export function MatrizEdicoes({ valor, original, onChange }: { valor: DetalhesPapel; original?: DetalhesPapel; onChange?: (d: DetalhesPapel) => void }) {
  const v = coerceDetalhes(valor);
  const o = original ? coerceDetalhes(original) : v;
  const mudar = (t: TelaEdicoes, op: OperacaoEdicao, ligado: boolean) =>
    onChange?.(coerceDetalhes({ ...v, edicoes: { ...v.edicoes, [t]: { ...v.edicoes[t], [op]: ligado } } }));
  return (
    <div className="space-y-2">
      <table className="w-full border-collapse text-[13px]">
        <thead>
          <tr className="border-b border-border text-[12px] text-muted">
            <th scope="col" className="py-2 pr-2 text-left font-medium">
              Tela
            </th>
            {OPERACOES_EDICAO.map((op) => (
              <th key={op} scope="col" className="px-1 py-2 text-center font-medium" title={DESCRICAO_OPERACAO_EDICAO[op]}>
                {ROTULO_OPERACAO_EDICAO[op]}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {TELAS_EDICOES.map((t) => (
            <tr key={t}>
              <th scope="row" className="py-1 pr-2 text-left font-medium text-text">
                {rotuloTelaDetalhe(t)}
              </th>
              {OPERACOES_EDICAO.map((op) => {
                const ligado = v.edicoes[t][op];
                const alterado = ligado !== o.edicoes[t][op];
                const travado = op !== "personalizar" && !v.edicoes[t].personalizar;
                return (
                  <td key={op} className={`px-1 text-center ${alterado ? "bg-accent/10" : ""}`}>
                    <Checkbox
                      alvo
                      aria-label={`${rotuloTelaDetalhe(t)}: ${ROTULO_OPERACAO_EDICAO[op]}${alterado ? " (alterado)" : ""}`}
                      title={travado ? "Sem personalizar, não publica nem modera." : DESCRICAO_OPERACAO_EDICAO[op]}
                      checked={ligado}
                      disabled={!onChange || travado}
                      onChange={(e) => mudar(t, op, e.target.checked)}
                    />
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
      <ul className="space-y-0.5 text-[12px] leading-snug text-muted">
        {OPERACOES_EDICAO.map((op) => (
          <li key={op}>
            <span className="font-medium text-text-2">{ROTULO_OPERACAO_EDICAO[op]}:</span> {DESCRICAO_OPERACAO_EDICAO[op]}
          </li>
        ))}
      </ul>
    </div>
  );
}
