"use client";

import { useEffect, useState } from "react";
import { chamarPadronizacao as chamar } from "@/lib/padronizacao-cliente";
import {
  type CampoTarefa,
  camposDoFormato,
  MAX_CAMPOS,
  MAX_VALOR_CAMPO,
  montarTitulo,
  ROTULO_TIPO_CAMPO,
  rotuloValorCampo,
  TIPOS_CAMPO,
  type TipoCampo,
} from "@/lib/tarefas-core";
import { AcoesCadastro } from "./AcoesCadastro";
import { Badge } from "./Badge";
import { Button } from "./Button";
import { CampoLista, Checkbox, SelectField, TextField } from "./Field";
import { IconPlus } from "./icons";
import { Modal } from "./Modal";
import { Switch } from "./Switch";

/** Quem grava: a mesma trava/aviso/recarga da Configuração do quadro. */
type Gravar = (chave: string, fn: () => Promise<unknown>, sucesso: string) => Promise<boolean>;
type RascunhoCampo = { id: number | null; nome: string; tipo: TipoCampo; opcoes: string[]; noCartao: boolean };

/** A PRÉVIA do formato: cada campo vira ‹Nome› (os que não existem no quadro somem, como no título de verdade). */
export function previaFormato(formato: string, campos: Pick<CampoTarefa, "id" | "nome">[]): string {
  const exemplo = campos.map((c) => ({ id: c.id, nome: c.nome, tipo: "texto" as const }));
  return montarTitulo(formato, exemplo, Object.fromEntries(campos.map((c) => [c.id, `‹${c.nome}›`])));
}

/**
 * CAMPOS PERSONALIZADOS do quadro (na Configuração): a lista na ordem (↑/↓ · editar · excluir), com o tipo e o selo "No
 * cartão"; o editor (nome · tipo · opções da lista · mostrar no cartão) e o FORMATO DO TÍTULO automático — `{Campo}` entre
 * separadores, com os atalhos para inserir cada campo e a prévia. Editores gravam; os demais consultam.
 */
export function CamposPersonalizadosQuadro({
  quadroId,
  formatoTitulo,
  campos,
  podeEditar,
  ocupado,
  gravar,
  confirmar,
}: {
  quadroId: number;
  formatoTitulo: string | null;
  campos: CampoTarefa[];
  podeEditar: boolean;
  ocupado: boolean;
  gravar: Gravar;
  confirmar: (o: { titulo: string; texto?: string; confirmar?: string; perigo?: boolean }) => Promise<boolean>;
}) {
  const [campo, setCampo] = useState<RascunhoCampo | null>(null);
  const [formato, setFormato] = useState(formatoTitulo ?? "");
  const [ordem, setOrdem] = useState<number[] | null>(null);
  // A ordem otimista vale até os campos do servidor chegarem.
  // biome-ignore lint/correctness/useExhaustiveDependencies: zera quando os campos do SERVIDOR mudam.
  useEffect(() => setOrdem(null), [campos]);
  const lista = ordem ? ordem.map((id) => campos.find((c) => c.id === id)).filter((c): c is CampoTarefa => !!c) : campos;
  const citados = camposDoFormato(formato);
  const faltam = citados.filter((n) => !campos.some((c) => c.nome.toLocaleLowerCase("pt-BR") === n.toLocaleLowerCase("pt-BR")));
  const opcoesOk = campo?.tipo !== "lista" || campo.opcoes.length > 0;

  const mover = async (i: number, d: -1 | 1) => {
    const ids = lista.map((c) => c.id);
    const j = i + d;
    if (j < 0 || j >= ids.length) return;
    [ids[i], ids[j]] = [ids[j], ids[i]];
    setOrdem(ids);
    const ok = await gravar("campos-ordem", () => chamar(`/api/tarefas/quadros/${quadroId}/campos`, "PATCH", { ids }), "Ordem dos campos salva.");
    if (!ok) setOrdem(null);
  };

  const salvar = async () => {
    if (!campo) return;
    const corpo = { nome: campo.nome.trim(), tipo: campo.tipo, opcoes: campo.tipo === "lista" ? campo.opcoes : [], noCartao: campo.noCartao };
    const antes = campo.id == null ? null : campos.find((c) => c.id === campo.id);
    if (antes && antes.tipo !== campo.tipo && !(await confirmar({ titulo: "Trocar o tipo do campo?", texto: "Os valores já preenchidos nas tarefas serão apagados.", confirmar: "Trocar", perigo: true })))
      return;
    const ok = await gravar(
      "campo",
      () => (campo.id == null ? chamar(`/api/tarefas/quadros/${quadroId}/campos`, "POST", corpo) : chamar(`/api/tarefas/campos/${campo.id}`, "PATCH", corpo)),
      campo.id == null ? "Campo criado." : "Campo salvo.",
    );
    if (ok) setCampo(null);
  };

  const excluir = async (c: CampoTarefa) => {
    if (!(await confirmar({ titulo: `Excluir o campo "${c.nome}"?`, texto: "O valor dele sai de todas as tarefas do quadro.", confirmar: "Excluir", perigo: true }))) return;
    await gravar(`campo-${c.id}`, () => chamar(`/api/tarefas/campos/${c.id}`, "DELETE"), "Campo excluído.");
  };

  const salvarFormato = () =>
    gravar("formato", () => chamar(`/api/tarefas/quadros/${quadroId}`, "PATCH", { formatoTitulo: formato.trim() || null }), formato.trim() ? "Formato do título salvo." : "Título automático desligado.");

  return (
    <div className="space-y-4">
      {lista.length === 0 ? (
        <p className="text-[12.5px] text-muted">Nenhum campo — crie campos como Categoria, Tipo, Nº do protocolo ou Unidade para preencher em cada tarefa.</p>
      ) : (
        <ul className="divide-y divide-border">
          {lista.map((c, i) => (
            <li key={c.id} className="flex min-h-11 items-center gap-2 py-1.5">
              <span className="flex min-w-0 flex-1 flex-wrap items-center gap-1.5">
                <span className="min-w-0 max-w-full truncate text-[13px] font-medium text-text">{c.nome}</span>
                <Badge>{ROTULO_TIPO_CAMPO[c.tipo]}</Badge>
                {c.noCartao && <Badge tone="blue">No cartão</Badge>}
              </span>
              {podeEditar && (
                <AcoesCadastro
                  nome={c.nome}
                  primeira={i === 0}
                  ultima={i === lista.length - 1}
                  disabled={ocupado}
                  onMover={(d) => mover(i, d)}
                  onEditar={() => setCampo({ id: c.id, nome: c.nome, tipo: c.tipo, opcoes: [...c.opcoes], noCartao: c.noCartao })}
                  onExcluir={() => excluir(c)}
                />
              )}
            </li>
          ))}
        </ul>
      )}
      {podeEditar && (
        <Button
          size="sm"
          variant="secondary"
          icon={<IconPlus className="h-4 w-4" />}
          disabled={ocupado || campos.length >= MAX_CAMPOS}
          onClick={() => setCampo({ id: null, nome: "", tipo: "texto", opcoes: [], noCartao: false })}
        >
          Novo campo
        </Button>
      )}

      <div className="space-y-2 border-t border-border pt-3">
        <p className="text-[13px] font-semibold text-text">Título automático</p>
        <TextField
          label="Formato do título"
          value={formato}
          maxLength={200}
          disabled={!podeEditar || ocupado}
          placeholder="Ex.: {Categoria} - {Tipo} - {Nº protocolo}"
          hint="Os campos entre chaves são trocados pelos valores da tarefa; um campo vazio some junto do separador. Vazio = desligado."
          onChange={(e) => setFormato(e.target.value)}
        />
        {podeEditar && campos.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {campos.map((c) => (
              <Button key={c.id} size="xs" variant="ghost" disabled={ocupado} onClick={() => setFormato((f) => `${f}${f.trim() && !/[\s\-–—|/·,:;]$/.test(f) ? " - " : ""}{${c.nome}}`)}>
                + {c.nome}
              </Button>
            ))}
          </div>
        )}
        {formato.trim() && (
          <p className="rounded-control bg-surface-2 px-3 py-2 text-[12.5px] text-text-2">
            <span className="text-muted">Prévia: </span>
            {previaFormato(formato, campos) || <span className="text-muted">(vazio)</span>}
          </p>
        )}
        {faltam.length > 0 && <p className="text-[12px] text-[var(--warn)]">Sem campo com esse nome: {faltam.join(", ")}.</p>}
        {podeEditar && (
          <div className="flex justify-end">
            <Button size="sm" loading={ocupado} disabled={ocupado || formato.trim() === (formatoTitulo ?? "")} onClick={salvarFormato}>
              Salvar formato
            </Button>
          </div>
        )}
      </div>

      <Modal
        open={campo != null}
        onClose={() => !ocupado && setCampo(null)}
        titulo={campo?.id == null ? "Novo campo" : "Editar campo"}
        bloqueado={ocupado}
        rodape={
          <div className="flex justify-end gap-2">
            <Button variant="ghost" disabled={ocupado} onClick={() => setCampo(null)}>
              Cancelar
            </Button>
            <Button loading={ocupado} disabled={!campo?.nome.trim() || /[{}]/.test(campo?.nome ?? "") || !opcoesOk || ocupado} onClick={salvar}>
              Salvar
            </Button>
          </div>
        }
      >
        {campo && (
          <div className="space-y-4">
            <TextField
              label="Nome"
              value={campo.nome}
              maxLength={40}
              error={/[{}]/.test(campo.nome) ? "O nome não pode ter chaves { }." : undefined}
              onChange={(e) => setCampo({ ...campo, nome: e.target.value })}
            />
            <SelectField label="Tipo" value={campo.tipo} onChange={(e) => setCampo({ ...campo, tipo: e.target.value as TipoCampo })}>
              {TIPOS_CAMPO.map((t) => (
                <option key={t} value={t}>
                  {ROTULO_TIPO_CAMPO[t]}
                </option>
              ))}
            </SelectField>
            {campo.tipo === "lista" && (
              <div className="space-y-1">
                <CampoLista label="Opções" valores={campo.opcoes} placeholder="Digite e tecle Enter" onChange={(opcoes) => setCampo({ ...campo, opcoes: opcoes.slice(0, 50) })} />
                {!opcoesOk && <p className="text-[12px] text-muted">Informe ao menos uma opção.</p>}
              </div>
            )}
            <Switch checked={campo.noCartao} onChange={(v) => setCampo({ ...campo, noCartao: v })} label="Mostrar no cartão" />
          </div>
        )}
      </Modal>
    </div>
  );
}

/** O EDITOR do valor de UM campo, pelo tipo (texto · número · data · lista · caixa). */
export function EditorValorCampo({ campo, valor, onChange, disabled = false }: { campo: CampoTarefa; valor: string; onChange: (v: string | null) => void; disabled?: boolean }) {
  const vazio = (v: string) => onChange(v.trim() ? v : null);
  if (campo.tipo === "checkbox") return <Checkbox label={campo.nome} checked={valor === "1"} disabled={disabled} onChange={(e) => onChange(e.target.checked ? "1" : null)} />;
  if (campo.tipo === "lista")
    return (
      <SelectField label={campo.nome} compacto value={valor} disabled={disabled} onChange={(e) => vazio(e.target.value)}>
        <option value="">—</option>
        {campo.opcoes.map((o) => (
          <option key={o} value={o}>
            {o}
          </option>
        ))}
        {valor && !campo.opcoes.includes(valor) && <option value={valor}>{valor}</option>}
      </SelectField>
    );
  return (
    <TextField
      label={campo.nome}
      value={valor}
      disabled={disabled}
      maxLength={MAX_VALOR_CAMPO}
      type={campo.tipo === "data" ? "date" : "text"}
      inputMode={campo.tipo === "numero" ? "decimal" : undefined}
      onChange={(e) => vazio(e.target.value)}
    />
  );
}

/** Os CAMPOS da tarefa no detalhe (grade de editores); controlado — o rascunho é do host. */
export function CamposDaTarefa({
  campos,
  valores,
  onChange,
  disabled = false,
}: {
  campos: CampoTarefa[];
  valores: Record<number, string>;
  onChange: (campoId: number, valor: string | null) => void;
  disabled?: boolean;
}) {
  if (!campos.length) return null;
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
      {campos.map((c) => (
        <EditorValorCampo key={c.id} campo={c} valor={valores[c.id] ?? ""} disabled={disabled} onChange={(v) => onChange(c.id, v)} />
      ))}
    </div>
  );
}

/** Os campos marcados "no cartão" que têm valor, em selos compactos ("Tipo: FALTA"; a caixa marcada = o nome). */
export function ChipsCamposCartao({ campos, valores }: { campos: CampoTarefa[]; valores: Record<number, string> | undefined }) {
  const itens = campos.filter((c) => c.noCartao && valores?.[c.id]).map((c) => ({ c, v: rotuloValorCampo(c, valores?.[c.id]) }));
  if (!itens.length) return null;
  return (
    <span className="flex flex-wrap gap-1">
      {itens.map(({ c, v }) => (
        <span key={c.id} className="max-w-full truncate rounded-control bg-surface-2 px-1.5 py-px text-[11.5px] text-text-2" title={`${c.nome}: ${v}`}>
          {c.tipo === "checkbox" ? v : `${c.nome}: ${v}`}
        </span>
      ))}
    </span>
  );
}
