"use client";

import { useId, useMemo, useState } from "react";
import {
  type CampoNo,
  caminhosDosItens,
  campoVisivel,
  type DefNo,
  type Item,
  lerTentar,
  MAX_ESPERA_S,
  MAX_TENTATIVAS,
  type NoFluxo,
  nomeVariavel,
  type PassoExec,
  resumoDoNo,
  type TentarNo,
} from "@/lib/fluxo-core";
import { corCategoria } from "@/lib/fluxo-nos";
import { Button } from "../Button";
import { Callout } from "../Callout";
import { type Column, DataTable } from "../DataTable";
import { Checkbox, SelectField, TextArea, TextField } from "../Field";
import { IconTrash } from "../icons";
import { Segmented } from "../Segmented";
import { Switch } from "../Switch";
import { AjudaNo } from "./AjudaNo";
import { IconeNo } from "./IconeNo";
import { CampoFluxo, CampoReparticoesCenti, RecomecarSubfluxo } from "./paineis";

/**
 * O painel do NÓ marcado: o nome, os campos do tipo (formulário DECLARATIVO do registro — novo tipo de nó não pede tela
 * nova), a seleção de um "dado buscado" (os campos vistos na última execução dos nós de antes) e a SAÍDA da última
 * execução numa tabela.
 */
export function PainelNo({
  no,
  def,
  passo,
  caminhos,
  onMudar,
  onExcluir,
  somenteLeitura,
}: {
  no: NoFluxo;
  def: DefNo | undefined;
  passo?: PassoExec;
  /** Os campos vistos nas saídas dos nós ligados antes deste (o seletor de dado buscado). */
  caminhos: string[];
  onMudar: (n: NoFluxo) => void;
  onExcluir: () => void;
  somenteLeitura?: boolean;
}) {
  const [aba, setAba] = useState<"config" | "saida">("config");
  const listaId = useId();
  if (!def)
    return (
      <Callout kind="danger">
<strong className="block">{"Tipo de nó desconhecido"}</strong>
        {no.tipo} — exclua o nó.
      </Callout>
    );
  const definir = (chave: string, v: unknown) => onMudar({ ...no, config: { ...no.config, [chave]: v } });
  return (
    <div className="flex h-full min-h-0 flex-col gap-3">
      <div className="flex items-center gap-2">
        <span className="flex size-8 shrink-0 items-center justify-center rounded-lg text-white" style={{ background: corCategoria(def.categoria) }}>
          <IconeNo nome={def.icone} className="size-4" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold text-text">{def.rotulo}</p>
          {resumoDoNo(no, def) && <p className="truncate text-xs text-muted">{resumoDoNo(no, def)}</p>}
        </div>
        <AjudaNo def={def} />
        {!somenteLeitura && (
          <Button size="sm" variant="icon" aria-label="Excluir o nó" title="Excluir o nó (Delete)" onClick={onExcluir}>
            <IconTrash className="size-4" />
          </Button>
        )}
      </div>
      <Segmented
        className="shrink-0"
        ariaLabel="Painel do nó"
        value={aba}
        onChange={(v) => setAba(v as "config" | "saida")}
        options={[
          { value: "config", label: "Configurar" },
          { value: "saida", label: `Saída${passo?.itens ? ` (${passo.itens})` : ""}` },
        ]}
      />
      {aba === "config" ? (
        <div className="min-h-0 flex-1 space-y-3 overflow-y-auto pr-1">
          {def.campos
            .filter((c) => campoVisivel(c, no.config, def.campos))
            .map((c) => (
              <CampoDoNo key={c.chave} campo={c} valor={no.config[c.chave] ?? c.padrao} onValor={(v) => definir(c.chave, v)} lista={listaId} somenteLeitura={somenteLeitura} />
            ))}
          {no.tipo === "fluxo.executar" && no.config.retomar !== false && (no.config.modo ?? "porItem") === "porItem" && <RecomecarSubfluxo no={no.id} somenteLeitura={somenteLeitura} />}
          {def.categoria !== "gatilho" && <ComportamentoNo key={no.id} no={no} onMudar={onMudar} somenteLeitura={somenteLeitura} />}
          {!somenteLeitura && <Switch checked={!!no.desativado} onChange={(v) => onMudar({ ...no, desativado: v || undefined })} label="Desativar (repassa os itens sem executar)" />}
          <datalist id={listaId}>
            {caminhos.map((c) => (
              <option key={c} value={c} />
            ))}
          </datalist>
          {passo?.estado === "erro" && (
            <Callout kind="danger">
<strong className="block">{"Erro na última execução"}</strong>
              {passo.erro}
            </Callout>
          )}
        </div>
      ) : (
        <SaidaNo passo={passo} />
      )}
    </div>
  );
}

/**
 * O COMPORTAMENTO comum a todo nó: REPETIR quando falha (vezes + espera) e GUARDAR O ESTADO numa variável (executado,
 * itens, vezes, valor) — lida pelo nó "Variável" ({{nome.executado}}) para terminar laços.
 */
function ComportamentoNo({ no, onMudar, somenteLeitura }: { no: NoFluxo; onMudar: (n: NoFluxo) => void; somenteLeitura?: boolean }) {
  const vezes = no.tentar?.vezes ?? 0;
  const tentar = (t: Partial<TentarNo>) => {
    const novo = lerTentar({ vezes, esperaS: no.tentar?.esperaS ?? 10, ...t });
    onMudar({ ...no, tentar: novo });
  };
  const [nome, setNome] = useState(no.guardar ?? "");
  const invalido = nome.trim() !== "" && !nomeVariavel(nome);
  return (
    <fieldset className="space-y-3 rounded-lg border border-border p-3">
      <legend className="px-1 text-xs font-semibold text-muted">Comportamento</legend>
      <div className="grid grid-cols-2 gap-2">
        <TextField
          label="Repetir se falhar"
          hint={`0 a ${MAX_TENTATIVAS} vezes`}
          inputMode="numeric"
          value={vezes ? String(vezes) : ""}
          placeholder="0"
          disabled={somenteLeitura}
          onChange={(e) => tentar({ vezes: Number(e.target.value.replace(/\D/g, "")) || 0 })}
        />
        <TextField
          label="Esperar (s)"
          hint={`Entre as tentativas (até ${MAX_ESPERA_S})`}
          inputMode="numeric"
          value={vezes ? String(no.tentar?.esperaS ?? 0) : ""}
          disabled={somenteLeitura || !vezes}
          onChange={(e) => tentar({ esperaS: Number(e.target.value.replace(/\D/g, "")) || 0 })}
        />
      </div>
      <TextField
        label="Guardar o estado na variável"
        hint="Ex.: leitura_cm002 → {{leitura_cm002.executado}} no nó Variável (executado, itens, vezes, valor)."
        value={nome}
        error={invalido ? "Só letras, números e _." : undefined}
        disabled={somenteLeitura}
        maxLength={40}
        onChange={(e) => {
          setNome(e.target.value);
          const v = nomeVariavel(e.target.value);
          if (v || !e.target.value.trim()) onMudar({ ...no, guardar: v || undefined });
        }}
      />
    </fieldset>
  );
}

export function CampoDoNo({ campo: c, valor, onValor, lista, somenteLeitura }: { campo: CampoNo; valor: unknown; onValor: (v: unknown) => void; lista: string; somenteLeitura?: boolean }) {
  const s = valor == null ? "" : String(valor);
  const rot = `${c.rotulo}${c.obrigatorio ? " *" : ""}`;
  switch (c.tipo) {
    case "booleano":
      return <Checkbox label={c.rotulo} checked={valor === true} disabled={somenteLeitura} onChange={(e) => onValor(e.target.checked)} />;
    case "selecao":
      return (
        <SelectField label={rot} hint={c.ajuda} value={s} disabled={somenteLeitura} onChange={(e) => onValor(e.target.value)}>
          {(c.opcoes ?? []).map((o) => (
            <option key={o.valor} value={o.valor}>
              {o.rotulo}
            </option>
          ))}
        </SelectField>
      );
    case "textoLongo":
      return <TextArea label={rot} hint={c.ajuda} value={s} rows={4} disabled={somenteLeitura} maxLength={4000} onChange={(e) => onValor(e.target.value)} />;
    case "numero":
      return (
        <TextField
          label={rot}
          hint={c.ajuda}
          inputMode="decimal"
          value={s}
          disabled={somenteLeitura}
          onChange={(e) => {
            // Inteiros e decimais (vírgula ou ponto — ex.: tolerância 0,01); o texto parcial "0," fica até completar.
            const t = e.target.value.replace(/[^\d.,]/g, "");
            const n = Number(t.replace(",", "."));
            onValor(!t ? undefined : /[.,]$/.test(t) || !Number.isFinite(n) ? t : n);
          }}
        />
      );
    case "fluxo":
    case "fluxos":
      return <CampoFluxo rotulo={rot} valor={s} varios={c.tipo === "fluxos"} onValor={onValor} somenteLeitura={somenteLeitura} />;
    case "reparticoesCenti":
      return <CampoReparticoesCenti rotulo={rot} valor={s} onValor={onValor} somenteLeitura={somenteLeitura} />;
    case "caminho":
      return <TextField label={rot} hint={c.ajuda ?? "Escolha um dado buscado ou digite."} list={lista} value={s} disabled={somenteLeitura} maxLength={200} onChange={(e) => onValor(e.target.value)} />;
    default:
      return <TextField label={rot} hint={c.ajuda} value={s} disabled={somenteLeitura} maxLength={1000} onChange={(e) => onValor(e.target.value)} />;
  }
}

/** A saída da última execução (amostra de até 50 itens por porta). */
function SaidaNo({ passo }: { passo?: PassoExec }) {
  const portas = Object.entries(passo?.amostra ?? {}).filter(([k, v]) => v.length && k !== "__apontados" && k !== "__retorno");
  const [porta, setPorta] = useState<string | null>(null);
  const atual = portas.find(([k]) => k === porta) ?? portas[0];
  const itens = atual?.[1] ?? [];
  const colunas = useMemo<Column<Item>[]>(
    () =>
      caminhosDosItens(itens, 30).map((c) => ({
        key: c,
        header: c,
        nowrap: true,
        value: (it) => valorTexto(it, c),
        render: (it) => <span className="block max-w-[16rem] truncate">{valorTexto(it, c)}</span>,
      })),
    [itens],
  );
  if (!passo || passo.estado === "fila") return <p className="text-sm text-muted">Execute o fluxo para ver a saída deste nó.</p>;
  if (passo.estado === "erro") return <Callout kind="danger">
<strong className="block">{"Erro"}</strong>{passo.erro}</Callout>;
  if (!portas.length) return <p className="text-sm text-muted">{passo.estado === "ignorado" ? "Nada chegou a este nó — foi pulado." : "Nenhum item na saída."}</p>;
  return (
    <div className="flex min-h-0 flex-1 flex-col gap-2">
      {portas.length > 1 && (
        <Segmented ariaLabel="Porta de saída" value={atual[0]} onChange={setPorta} options={portas.map(([k, v]) => ({ value: k, label: `${k} (${v.length})` }))} />
      )}
      <p className="text-xs text-muted">Até 50 itens por saída (amostra da última execução).</p>
      <div className="min-h-0 flex-1 overflow-auto">
        <DataTable columns={colunas} rows={itens} getKey={(r) => itens.indexOf(r)} density="compact" exportar={{ nome: `Saída ${atual[0]}` }} />
      </div>
    </div>
  );
}

function valorTexto(it: Item, c: string): string {
  let v: unknown = it;
  for (const p of c.split(".")) v = v && typeof v === "object" ? (v as Item)[p] : undefined;
  return v == null ? "" : typeof v === "object" ? JSON.stringify(v) : String(v);
}
