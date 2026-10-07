"use client";

import type { ReactNode } from "react";
import { type AjudaFluxo, ajudaVazia, MAX_AJUDA } from "@/lib/fluxo-core";
import { Ajuda, TopicoAjuda } from "../Ajuda";
import { Button } from "../Button";
import { TextArea, TextField } from "../Field";
import { IconFluxo, IconInfo, IconPlay } from "../icons";
import { Modal } from "../Modal";

const TOPICOS: { chave: keyof AjudaFluxo; titulo: string; icone: ReactNode; dica: string }[] = [
  { chave: "funciona", titulo: "Como funciona", icone: <IconFluxo className="size-4" />, dica: "O que a automação faz e de onde vêm os dados." },
  { chave: "executa", titulo: "Como executa", icone: <IconPlay className="size-4" />, dica: "O que é preciso para rodar e como ela roda (manual, agendada…)." },
  { chave: "resultado", titulo: "Resultado", icone: <IconInfo className="size-4" />, dica: "A informação que resulta: o que é gravado, apontado ou entregue." },
];

/** O (?) de UMA automação: como funciona, como executa e o resultado (cadastrados nas configurações dela). */
export function AjudaDoFluxo({ titulo, ajuda }: { titulo: string; ajuda: AjudaFluxo }) {
  return (
    <Ajuda botao="sm" titulo={titulo} rotulo="Sobre a automação">
      {ajudaVazia(ajuda) ? (
        <p className="text-muted">Sem explicação ainda — cadastre em Configurações da automação.</p>
      ) : (
        <div className="space-y-3">
          {TOPICOS.filter((t) => ajuda[t.chave]).map((t) => (
            <TopicoAjuda key={t.chave} icone={t.icone} titulo={t.titulo}>
              <span className="whitespace-pre-line">{ajuda[t.chave]}</span>
            </TopicoAjuda>
          ))}
        </div>
      )}
    </Ajuda>
  );
}

/**
 * CONFIGURAÇÕES DA AUTOMAÇÃO — nome, descrição, a frequência (`children`) e a AJUDA (?). Controlado: cada mudança vale
 * no editor na hora; o "Salvar" do editor grava.
 */
export function ConfigFluxo({
  open,
  onClose,
  nome,
  descricao,
  ajuda,
  onNome,
  onDescricao,
  onAjuda,
  children,
}: {
  open: boolean;
  onClose: () => void;
  nome: string;
  descricao: string;
  ajuda: AjudaFluxo;
  onNome: (v: string) => void;
  onDescricao: (v: string) => void;
  onAjuda: (a: AjudaFluxo) => void;
  /** Os controles da frequência/agendamento. */
  children?: ReactNode;
}) {
  return (
    <Modal open={open} onClose={onClose} titulo="Configurações da automação" rodape={<Button size="sm" onClick={onClose}>Concluir</Button>}>
      <div className="space-y-[var(--gap-block)]">
        <TextField label="Nome" value={nome} maxLength={80} onChange={(e) => onNome(e.target.value)} />
        <TextField label="Descrição (o cartão)" value={descricao} maxLength={400} onChange={(e) => onDescricao(e.target.value)} />
        {children && <div className="flex flex-wrap items-center gap-2">{children}</div>}
        <p className="text-sm font-semibold text-text">Ajuda (?)</p>
        {TOPICOS.map((t) => (
          <TextArea key={t.chave} label={t.titulo} hint={t.dica} rows={3} maxLength={MAX_AJUDA} value={ajuda[t.chave]} onChange={(e) => onAjuda({ ...ajuda, [t.chave]: e.target.value })} />
        ))}
      </div>
    </Modal>
  );
}
