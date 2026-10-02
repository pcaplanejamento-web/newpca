"use client";

import { useMemo, useState } from "react";
import {
  COLUNAS_TELA,
  type ColunaTela,
  type ConsultaTela,
  consultasDeProtocolos,
  type ModeloTela,
  modeloDoAprendiz,
  type PedidoAprendido,
  ROTULO_COLUNA,
} from "@/lib/automacao-tela-protocolo";
import { Badge } from "./Badge";
import { Button } from "./Button";
import { Callout } from "./Callout";
import { Checkbox, SelectField, TextField } from "./Field";
import { Modal } from "./Modal";

/**
 * O que a extensão APRENDEU na Tela Protocolo (o ADM clicou em Pesquisar e nas abas): as CONSULTAS de protocolos achadas
 * (o nome de cada aba e se entra), o MAPA das colunas (sugerido pelos nomes dos campos — ajustável), a prévia das
 * primeiras linhas e se a EMISSÃO do PDF foi aprendida. Salvar grava o modelo para todos os ADMs.
 */
export function AprendizTelaProtocolo({
  pedidos,
  salvando = false,
  onSalvar,
  onFechar,
}: {
  pedidos: PedidoAprendido[];
  salvando?: boolean;
  onSalvar: (m: ModeloTela) => void;
  onFechar: () => void;
}) {
  const base = useMemo(() => modeloDoAprendiz(pedidos, new Date()), [pedidos]);
  const consultas = useMemo(() => consultasDeProtocolos(pedidos), [pedidos]);
  const [rotulos, setRotulos] = useState<string[]>(() => base.modelo?.consultas.map((c) => c.rotulo) ?? []);
  const [fora, setFora] = useState<Set<number>>(new Set());
  const [colunas, setColunas] = useState<Partial<Record<ColunaTela, string>>>(() => base.modelo?.colunas ?? {});
  const ignorados = pedidos.length - consultas.length - pedidos.filter((p) => p.tipo !== "consulta").length;
  const previa = consultas.flatMap((c) => c.resposta.linhas).slice(0, 5);
  const escolhidas: ConsultaTela[] = (base.modelo?.consultas ?? [])
    .map((c, i) => ({ ...c, rotulo: rotulos[i]?.trim() || c.rotulo }))
    .filter((_, i) => !fora.has(i));
  const semChave = !colunas.id && !colunas.processo;
  const pronto = !!base.modelo && escolhidas.length > 0 && !semChave;

  return (
    <Modal
      open
      onClose={onFechar}
      titulo="Tela Protocolo aprendida"
      size="xl"
      bloqueado={salvando}
      rodape={
        <div className="flex flex-wrap items-center justify-end gap-2">
          <Button variant="secondary" onClick={onFechar} disabled={salvando}>
            Cancelar
          </Button>
          <Button
            onClick={() => base.modelo && onSalvar({ ...base.modelo, consultas: escolhidas, colunas })}
            disabled={!pronto}
            loading={salvando}
          >
            Salvar o modelo
          </Button>
        </div>
      }
    >
      {!base.modelo ? (
        <Callout kind="warn">
          <strong>Nenhuma lista de protocolos foi vista.</strong> Na aba da automação, escolha os departamentos, clique em Pesquisar e abra as abas (A Receber, Em Análise, Analisado,
          Em Trânsito) — depois toque em Parar de novo.
        </Callout>
      ) : (
        <div className="space-y-[var(--gap-block)]">
          <section className="space-y-2">
            <h3 className="text-sm font-bold text-text">Consultas ({consultas.length})</h3>
            {consultas.map((c, i) => (
              <div key={`${c.caminho}-${i}`} className="grid items-end gap-2 sm:grid-cols-[auto_minmax(0,14rem)_minmax(0,1fr)]">
                <Checkbox
                  label="Ler"
                  checked={!fora.has(i)}
                  onChange={(e) =>
                    setFora((s) => {
                      const n = new Set(s);
                      if (e.target.checked) n.delete(i);
                      else n.add(i);
                      return n;
                    })
                  }
                />
                <TextField label="Aba" value={rotulos[i] ?? ""} maxLength={40} onChange={(e) => setRotulos((r) => r.map((x, j) => (j === i ? e.target.value : x)))} />
                <p className="min-w-0 truncate pb-3 text-xs text-muted" title={c.caminho}>
                  {c.metodo} {c.caminho.split("?")[0]} · {c.resposta.total} linha(s) vistas
                </p>
              </div>
            ))}
            {ignorados > 0 && <p className="text-xs text-muted">{ignorados} outra(s) consulta(s) da tela ficaram de fora (não trazem protocolos).</p>}
          </section>

          <section className="space-y-2">
            <h3 className="text-sm font-bold text-text">Colunas</h3>
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
              {COLUNAS_TELA.map((col) => (
                <SelectField
                  key={col}
                  label={ROTULO_COLUNA[col]}
                  value={colunas[col] ?? ""}
                  onChange={(e) => setColunas((c) => ({ ...c, [col]: e.target.value || undefined }))}
                >
                  <option value="">—</option>
                  {base.campos.map((k) => (
                    <option key={k} value={k}>
                      {k}
                    </option>
                  ))}
                </SelectField>
              ))}
            </div>
            {semChave && <p className="text-xs text-[var(--danger)]">Escolha ao menos o ID ou o Processo.</p>}
          </section>

          {previa.length > 0 && (
            <section className="space-y-2">
              <h3 className="text-sm font-bold text-text">Prévia</h3>
              <div className="overflow-x-auto rounded-card border border-border">
                <table className="w-full text-left text-xs">
                  <thead className="bg-surface-2 text-muted">
                    <tr>
                      {COLUNAS_TELA.filter((c) => colunas[c]).map((c) => (
                        <th key={c} className="whitespace-nowrap px-2 py-1.5 font-semibold">
                          {ROTULO_COLUNA[c]}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {previa.map((l, i) => (
                      <tr key={i} className="border-t border-border">
                        {COLUNAS_TELA.filter((c) => colunas[c]).map((c) => (
                          <td key={c} className="max-w-[16rem] truncate px-2 py-1.5 text-text">
                            {l[colunas[c] as string] ?? ""}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          )}

          <section className="flex flex-wrap items-center gap-2">
            <h3 className="text-sm font-bold text-text">Emissão do PDF</h3>
            {base.modelo.emissao ? (
              <Badge tone="emerald" dot>
                Aprendida — o parâmetro {base.modelo.emissao.param} leva o campo {base.modelo.emissao.campo}
              </Badge>
            ) : (
              <Badge tone="amber" dot>
                Não aprendida — para os PDFs, ensine de novo emitindo o PDF de UM protocolo da lista
              </Badge>
            )}
          </section>
        </div>
      )}
    </Modal>
  );
}
