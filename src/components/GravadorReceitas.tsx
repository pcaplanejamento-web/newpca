"use client";

import { type Column, DataTable } from "./DataTable";
import { BotaoCopiar } from "./BotaoCopiar";
import { Modal } from "./Modal";

// O GRAVADOR de receitas da Automação: os pedidos que a tela da Centi fez enquanto o ADM gravava — só a ESTRUTURA (método,
// caminho, parâmetros e os nomes/tipos dos campos), nunca valores. Copiar = o texto para montar a receita nova.
export type PassoGravado = {
  metodo: string;
  caminho: string;
  entidade: string | null;
  parametros: string[];
  corpo: unknown;
  em?: string;
};

const resumoCorpo = (c: unknown) => {
  if (c == null) return "—";
  if (typeof c === "string") return c;
  const t = JSON.stringify(c);
  return t.length > 160 ? `${t.slice(0, 160)}…` : t;
};

const COLUNAS: Column<PassoGravado & { n: number }>[] = [
  { key: "n", header: "#", nowrap: true, value: (p) => String(p.n), render: (p) => <span className="tabular-nums">{p.n}</span> },
  { key: "metodo", header: "Método", nowrap: true, value: (p) => p.metodo, render: (p) => <span className="font-mono text-xs">{p.metodo}</span> },
  {
    key: "caminho",
    header: "Caminho",
    align: "left",
    value: (p) => p.caminho,
    render: (p) => (
      <span className="font-mono text-xs">
        {p.caminho}
        {p.entidade ? <span className="text-muted"> · entity {p.entidade}</span> : null}
      </span>
    ),
  },
  { key: "parametros", header: "Parâmetros", align: "left", value: (p) => p.parametros.join(", "), render: (p) => <span className="text-xs">{p.parametros.join(", ") || "—"}</span> },
  { key: "corpo", header: "Corpo (estrutura)", align: "left", value: (p) => resumoCorpo(p.corpo), render: (p) => <span className="font-mono text-xs break-all">{resumoCorpo(p.corpo)}</span> },
];

export function GravadorReceitas({ passos, onFechar }: { passos: PassoGravado[]; onFechar: () => void }) {
  const linhas = passos.map((p, i) => ({ ...p, n: i + 1 }));
  const texto = JSON.stringify(passos.map(({ em: _em, ...p }) => p), null, 2);
  return (
    <Modal
      open
      onClose={onFechar}
      titulo={`Gravação da Centi — ${passos.length} pedido(s)`}
      size="full"
      rodape={<BotaoCopiar texto={texto} rotulo="Copiar a gravação" titulo="A estrutura dos pedidos (sem valores), para montar a receita nova" disabled={!passos.length} />}
    >
      <p className="mb-3 text-sm text-muted">
        Só a forma de cada pedido que a tela da Centi fez enquanto gravava — nenhum valor, token ou dado pessoal.
      </p>
      <DataTable columns={COLUNAS} rows={linhas} getKey={(p) => String(p.n)} density="compact" vazio="Nada gravado — ligue o gravador e faça a ação na Centi." />
    </Modal>
  );
}
