"use client";

import { useEffect, useId, useMemo, useState } from "react";
import {
  AJUDA_INSERIR,
  AJUDA_ORIGEM,
  AJUDA_TIPO_CAMPO,
  type CampoNo,
  caminhosDosItens,
  campoDoValor,
  campoVisivel,
  type DefNo,
  type Item,
  lerTentar,
  MAX_TENTATIVAS,
  type NoFluxo,
  nomeVariavel,
  type PassoExec,
  resumoDoNo,
  sugerirVariavel,
  type TentarNo,
} from "@/lib/fluxo-core";
import { corCategoria } from "@/lib/fluxo-nos";
import { Ajuda } from "../Ajuda";
import { Button } from "../Button";
import { Callout } from "../Callout";
import { type Column, DataTable } from "../DataTable";
import { Checkbox, SelectField, TextArea, TextField } from "../Field";
import { IconLock, IconTrash } from "../icons";
import { Segmented } from "../Segmented";
import { AjudaNo } from "./AjudaNo";
import { IconeNo } from "./IconeNo";
import { CampoFluxo, CampoOrgaosCenti, CampoReparticoesCenti, RecomecarSubfluxo } from "./paineis";

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
  origem,
  variaveis = [],
  lerCampos,
  onMudar,
  onExcluir,
  somenteLeitura,
}: {
  no: NoFluxo;
  def: DefNo | undefined;
  passo?: PassoExec;
  /** Os campos vistos nas saídas dos nós ligados antes deste (as escolhas dos campos de dado). */
  caminhos: string[];
  /** O nome do nó anterior (a origem dos valores travados). */
  origem?: string;
  /** As variáveis do fluxo (o "Guardar o resultado" e o nó "Variável" escolhem entre elas). */
  variaveis?: string[];
  /** Lê os campos do nó anterior sem executar o fluxo (a prévia só de leitura); ausente = não dá (trecho com gravação). */
  lerCampos?: { ler: () => void; lendo: boolean; erro?: string };
  onMudar: (n: NoFluxo) => void;
  onExcluir: () => void;
  somenteLeitura?: boolean;
}) {
  const [aba, setAba] = useState<"config" | "saida">("config");
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
          {origem && !caminhos.length && lerCampos && !somenteLeitura && def.campos.some((c) => c.tipo === "caminho" || c.aceitaCampo) && (
            <Callout kind={lerCampos.erro ? "warn" : "info"}>
              <div>
                <p>{lerCampos.erro ?? `Leia os campos de “${origem}” para escolhê-los nas listas (nada é gravado).`}</p>
                <Button size="sm" variant="secondary" className="mt-2" loading={lerCampos.lendo} onClick={lerCampos.ler}>
                  Ler os campos
                </Button>
              </div>
            </Callout>
          )}
          {def.campos
            .filter((c) => campoVisivel(c, no.config, def.campos))
            .map((c) => (
              <CampoDoNo
                key={c.chave}
                campo={c}
                valor={no.config[c.chave] ?? c.padrao}
                onValor={(v) => definir(c.chave, v)}
                caminhos={caminhos}
                origem={origem}
                variaveis={variaveis}
                config={no.config}
                somenteLeitura={somenteLeitura}
              />
            ))}
          {no.tipo === "fluxo.executar" && no.config.retomar !== false && (no.config.modo ?? "porItem") === "porItem" && <RecomecarSubfluxo no={no.id} somenteLeitura={somenteLeitura} />}
          {def.categoria !== "gatilho" && <ComportamentoNo key={no.id} no={no} rotulo={def.rotulo} variaveis={variaveis} onMudar={onMudar} somenteLeitura={somenteLeitura} />}
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
/** As esperas oferecidas entre as tentativas (s). */
const ESPERAS = [5, 10, 30, 60, 120, 300];
const rotuloEspera = (x: number) => (x < 60 ? `${x} segundos` : `${x / 60} minuto${x === 60 ? "" : "s"}`);

/** Os campos do COMPORTAMENTO comum a todo nó — os MESMOS `CampoDoNo` (seleção + "(?)" didático). */
const CAMPOS_COMPORTAMENTO: Record<"vezes" | "espera" | "guardar" | "desativado", CampoNo> = {
  vezes: {
    chave: "vezes",
    rotulo: "Repetir se falhar",
    tipo: "selecao",
    ajuda: "Se o nó der erro (ex.: a Centi não respondeu), ele roda de novo antes de parar o fluxo.",
    opcoes: Array.from({ length: MAX_TENTATIVAS + 1 }, (_, i) => ({ valor: String(i), rotulo: i === 0 ? "Não repetir" : `Repetir ${i} vez${i === 1 ? "" : "es"}` })),
  },
  espera: {
    chave: "espera",
    rotulo: "Esperar antes de repetir",
    tipo: "selecao",
    ajuda: "Quanto tempo esperar entre uma tentativa e a próxima (dá tempo de o sistema de fora voltar).",
    opcoes: ESPERAS.map((x) => ({ valor: String(x), rotulo: rotuloEspera(x) })),
  },
  guardar: {
    chave: "guardar",
    rotulo: "Guardar o resultado na variável",
    tipo: "nomeLista",
    fonte: "variaveis",
    ajuda:
      "Guarda como este nó terminou (executado, itens, vezes, valor) numa variável do fluxo. Outro nó lê com {{nome.executado}} — ex.: para encerrar um laço quando a leitura terminar.",
  },
  desativado: {
    chave: "desativado",
    rotulo: "Desativar este nó",
    tipo: "booleano",
    ajuda: "O nó não executa: os itens que chegam passam direto para o próximo. Útil para testar o fluxo sem uma etapa.",
  },
};

/**
 * O COMPORTAMENTO comum a todo nó: REPETIR quando falha (vezes + espera), GUARDAR o resultado numa variável (lida pelo
 * nó "Variável" — {{nome.executado}}) e DESATIVAR — tudo por escolha, com o "(?)".
 */
function ComportamentoNo({
  no,
  rotulo,
  variaveis,
  onMudar,
  somenteLeitura,
}: {
  no: NoFluxo;
  rotulo: string;
  variaveis: string[];
  onMudar: (n: NoFluxo) => void;
  somenteLeitura?: boolean;
}) {
  const id = useId();
  const vezes = no.tentar?.vezes ?? 0;
  const espera = no.tentar?.esperaS ?? 10;
  const tentar = (t: Partial<TentarNo>) => onMudar({ ...no, tentar: lerTentar({ vezes, esperaS: espera, ...t }) });
  const outras = variaveis.filter((v) => v !== no.guardar);
  const espe = ESPERAS.includes(espera) ? CAMPOS_COMPORTAMENTO.espera : { ...CAMPOS_COMPORTAMENTO.espera, opcoes: [{ valor: String(espera), rotulo: rotuloEspera(espera) }, ...(CAMPOS_COMPORTAMENTO.espera.opcoes ?? [])] };
  return (
    <fieldset className="space-y-3 rounded-lg border border-border p-3">
      <legend className="px-1 text-xs font-semibold text-muted">Comportamento</legend>
      <CampoDoNo campo={CAMPOS_COMPORTAMENTO.vezes} valor={String(vezes)} onValor={(v) => tentar({ vezes: Number(v) })} somenteLeitura={somenteLeitura} />
      {vezes > 0 && <CampoDoNo campo={espe} valor={String(espera)} onValor={(v) => tentar({ esperaS: Number(v) })} somenteLeitura={somenteLeitura} />}
      <div>
        <RotuloCampo campo={CAMPOS_COMPORTAMENTO.guardar} htmlFor={id} />
        <CampoNomeLista
          id={id}
          campo={CAMPOS_COMPORTAMENTO.guardar}
          valor={no.guardar ?? ""}
          variaveis={outras}
          vazio="Não guardar"
          sugestao={sugerirVariavel(rotulo, variaveis)}
          somenteLeitura={somenteLeitura}
          onValor={(v) => {
            const n = nomeVariavel(v);
            if (n || !v) onMudar({ ...no, guardar: n || undefined });
          }}
        />
      </div>
      <CampoDoNo campo={CAMPOS_COMPORTAMENTO.desativado} valor={!!no.desativado} onValor={(v) => onMudar({ ...no, desativado: v === true || undefined })} somenteLeitura={somenteLeitura} />
    </fieldset>
  );
}

/** O "(?)" DIDÁTICO de todo campo: PARA QUE SERVE (a `ajuda` do campo) · COMO PREENCHER (pelo tipo/origem) · as OPÇÕES
 * (seleção) · se é obrigatório. */
function AjudaCampo({ campo: c }: { campo: CampoNo }) {
  const como = c.aceitaCampo === true ? AJUDA_ORIGEM : c.aceitaCampo === "inserir" ? AJUDA_INSERIR : AJUDA_TIPO_CAMPO[c.tipo];
  const opcoes = c.tipo === "selecao" ? (c.opcoes ?? []) : [];
  return (
    <Ajuda compacta titulo={c.rotulo}>
      <div className="space-y-2">
        {c.ajuda && (
          <p>
            <strong>Para que serve:</strong> {c.ajuda}
          </p>
        )}
        <p>
          <strong>Como preencher:</strong> {como}
        </p>
        {opcoes.length > 0 && opcoes.length <= 10 && (
          <div>
            <strong>Opções:</strong>
            <ul className="mt-1 list-disc space-y-0.5 pl-5">
              {opcoes.map((o) => (
                <li key={o.valor}>{o.rotulo}</li>
              ))}
            </ul>
          </div>
        )}
        {c.obrigatorio && <p className="text-muted">Campo obrigatório (*).</p>}
      </div>
    </Ajuda>
  );
}

/** O RÓTULO de todo campo de nó: o nome + o "(?)" didático. */
function RotuloCampo({ campo: c, htmlFor }: { campo: CampoNo; htmlFor?: string }) {
  return (
    <div className="mb-2 flex items-center gap-1">
      <label htmlFor={htmlFor} className="text-[13.5px] font-bold text-text">
        {c.rotulo}
        {c.obrigatorio ? " *" : ""}
      </label>
      <AjudaCampo campo={c} />
    </div>
  );
}

const OUTRO = "__outro";

/**
 * UM campo do nó — o MESMO no diagrama e nos Dados de entrada do painel: tudo por ESCOLHA quando dá. Campo de dado
 * (`caminho`) = os campos que o nó anterior entrega; valor que pode vir do nó anterior (`aceitaCampo`) = "Valor fixo"
 * ou um desses campos, que fica TRAVADO com a origem à vista; órgãos e repartições = listas; todo campo com o (?).
 */
export function CampoDoNo({
  campo: c,
  valor,
  onValor,
  caminhos = [],
  origem,
  variaveis = [],
  config,
  somenteLeitura,
}: {
  campo: CampoNo;
  valor: unknown;
  onValor: (v: unknown) => void;
  /** Os campos que os nós ANTERIORES entregam (vistos na última execução ou na prévia). */
  caminhos?: string[];
  /** O nome do nó anterior (de onde vem o valor travado). */
  origem?: string;
  /** As variáveis do fluxo (a lista do `nomeLista` de variáveis). */
  variaveis?: string[];
  /** A configuração do nó (ex.: a tabela da Mesa escolhida filtra as colunas). */
  config?: Record<string, unknown>;
  somenteLeitura?: boolean;
}) {
  const id = useId();
  const s = valor == null ? "" : String(valor);
  if (c.tipo === "booleano")
    return (
      <div className="flex items-center gap-1">
        <Checkbox label={c.rotulo} checked={valor === true} disabled={somenteLeitura} onChange={(e) => onValor(e.target.checked)} />
        <AjudaCampo campo={c} />
      </div>
    );
  return (
    <div>
      <RotuloCampo campo={c} htmlFor={id} />
      {c.tipo === "nomeLista" ? (
        <CampoNomeLista id={id} campo={c} valor={s} onValor={onValor} variaveis={variaveis} config={config} somenteLeitura={somenteLeitura} />
      ) : (
        <ControleCampo id={id} campo={c} s={s} onValor={onValor} caminhos={caminhos} origem={origem} somenteLeitura={somenteLeitura} />
      )}
    </div>
  );
}

function ControleCampo({
  id,
  campo: c,
  s,
  onValor,
  caminhos,
  origem,
  somenteLeitura,
}: {
  id: string;
  campo: CampoNo;
  s: string;
  onValor: (v: unknown) => void;
  caminhos: string[];
  origem?: string;
  somenteLeitura?: boolean;
}) {
  switch (c.tipo) {
    case "selecao":
      return (
        <SelectField id={id} value={s} disabled={somenteLeitura} onChange={(e) => onValor(e.target.value)}>
          {/* Um valor gravado antes e fora das opções (ex.: um limite antigo) segue à vista. */}
          {s && !(c.opcoes ?? []).some((o) => o.valor === s) && <option value={s}>{s}</option>}
          {(c.opcoes ?? []).map((o) => (
            <option key={o.valor} value={o.valor}>
              {o.rotulo}
            </option>
          ))}
        </SelectField>
      );
    case "textoLongo":
      return <TextArea id={id} value={s} rows={4} disabled={somenteLeitura} maxLength={4000} onChange={(e) => onValor(e.target.value)} />;
    case "numero":
      return (
        <TextField
          id={id}
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
      return <CampoFluxo rotulo={c.rotulo} valor={s} varios={c.tipo === "fluxos"} onValor={onValor} somenteLeitura={somenteLeitura} />;
    case "reparticoesCenti":
      return <CampoReparticoesCenti rotulo={c.rotulo} valor={s} onValor={onValor} somenteLeitura={somenteLeitura} />;
    case "orgaosCenti":
      return <CampoOrgaosCenti rotulo={c.rotulo} valor={s} onValor={onValor} somenteLeitura={somenteLeitura} />;
    case "caminho":
      return <CampoCaminho id={id} valor={s} caminhos={caminhos} onValor={onValor} somenteLeitura={somenteLeitura} />;
    default:
      if (c.aceitaCampo === true) return <CampoComOrigem id={id} valor={s} caminhos={caminhos} origem={origem} onValor={onValor} somenteLeitura={somenteLeitura} />;
      if (c.aceitaCampo === "inserir")
        return (
          <div className="space-y-2">
            <TextField id={id} value={s} disabled={somenteLeitura} maxLength={1000} onChange={(e) => onValor(e.target.value)} />
            {caminhos.length > 0 && !somenteLeitura && (
              <SelectField compacto label="Inserir campo" value="" onChange={(e) => e.target.value && onValor(`${s}{{${e.target.value}}}`)}>
                <option value="">Escolha…</option>
                {caminhos.map((x) => (
                  <option key={x} value={x}>
                    {x}
                  </option>
                ))}
              </SelectField>
            )}
          </div>
        );
      return <TextField id={id} value={s} disabled={somenteLeitura} maxLength={1000} onChange={(e) => onValor(e.target.value)} />;
  }
}

/** Os nomes já existentes de cada fonte (tabelas salvas e colunas da Mesa: lidos UMA vez por tela). */
const cacheNomes = new Map<string, Promise<{ nome: string; entidade?: string }[]>>();
function nomesDaApi(fonte: "tabelas" | "colunasMesa") {
  let p = cacheNomes.get(fonte);
  if (!p) {
    p = fetch(fonte === "tabelas" ? "/api/admin/automacao/tabelas" : "/api/admin/automacao/colunas")
      .then((r) => r.json() as Promise<{ tabelas?: { nome: string }[]; colunas?: { nome: string; entidade: string }[] }>)
      .then((j) => j.tabelas ?? j.colunas ?? [])
      .catch(() => {
        cacheNomes.delete(fonte);
        return [];
      });
    cacheNomes.set(fonte, p);
  }
  return p;
}

/**
 * Um NOME que pode já existir (tabela salva, coluna da Mesa, variável): ESCOLHIDO da lista ou "Novo nome…" (digitar).
 * `vazio` = o rótulo da opção sem nome (ex.: "Não guardar"); `sugestao` = um nome novo já pronto para escolher.
 */
export function CampoNomeLista({
  id,
  campo: c,
  valor,
  onValor,
  variaveis,
  config,
  vazio,
  sugestao,
  somenteLeitura,
}: {
  id: string;
  campo: CampoNo;
  valor: string;
  onValor: (v: unknown) => void;
  variaveis: string[];
  config?: Record<string, unknown>;
  vazio?: string;
  sugestao?: string;
  somenteLeitura?: boolean;
}) {
  const [api, setApi] = useState<{ nome: string; entidade?: string }[]>([]);
  const [digitar, setDigitar] = useState(false);
  const fonte = c.fonte;
  useEffect(() => {
    if (fonte === "tabelas" || fonte === "colunasMesa") void nomesDaApi(fonte).then(setApi);
  }, [fonte]);
  const entidade = typeof config?.entidade === "string" ? config.entidade : "dfd";
  const nomes = fonte === "variaveis" ? variaveis : api.filter((x) => fonte !== "colunasMesa" || x.entidade === entidade).map((x) => x.nome);
  const lista = [...new Set([...(valor ? [valor] : []), ...nomes, ...(sugestao ? [sugestao] : [])])];
  if (digitar || (!lista.length && !vazio))
    return (
      <div className="space-y-1">
        <TextField id={id} value={valor} placeholder="Digite o nome" disabled={somenteLeitura} maxLength={60} onChange={(e) => onValor(e.target.value)} />
        {lista.length > 0 && (
          <Button size="xs" variant="ghost" onClick={() => setDigitar(false)}>
            Escolher da lista
          </Button>
        )}
      </div>
    );
  return (
    <SelectField id={id} value={valor} disabled={somenteLeitura} onChange={(e) => (e.target.value === OUTRO ? setDigitar(true) : onValor(e.target.value))}>
      <option value="">{vazio ?? "Escolha…"}</option>
      {lista.map((x) => (
        <option key={x} value={x}>
          {x === sugestao && !nomes.includes(x) ? `Nova: ${x}` : x}
        </option>
      ))}
      <option value={OUTRO}>Novo nome (digitar)…</option>
    </SelectField>
  );
}

/** Um CAMPO DO ITEM: escolhido entre os que o nó anterior entrega; "Outro" (ou sem campos conhecidos) = digitar. */
function CampoCaminho({ id, valor, caminhos, onValor, somenteLeitura }: { id: string; valor: string; caminhos: string[]; onValor: (v: unknown) => void; somenteLeitura?: boolean }) {
  const [digitar, setDigitar] = useState(false);
  if (!caminhos.length || digitar)
    return (
      <div className="space-y-1">
        <TextField id={id} value={valor} placeholder="Nome do campo" disabled={somenteLeitura} maxLength={200} onChange={(e) => onValor(e.target.value)} />
        {caminhos.length > 0 && (
          <Button size="xs" variant="ghost" onClick={() => setDigitar(false)}>
            Escolher da lista
          </Button>
        )}
      </div>
    );
  const opcoes = valor && !caminhos.includes(valor) ? [valor, ...caminhos] : caminhos;
  return (
    <SelectField id={id} value={valor} disabled={somenteLeitura} onChange={(e) => (e.target.value === OUTRO ? setDigitar(true) : onValor(e.target.value))}>
      <option value="">Escolha um campo…</option>
      {opcoes.map((x) => (
        <option key={x} value={x}>
          {x}
        </option>
      ))}
      <option value={OUTRO}>Outro (digitar)…</option>
    </SelectField>
  );
}

/**
 * Um VALOR que pode vir do nó anterior: a ORIGEM é escolhida (valor fixo ou um campo do item que chega). Vindo do nó
 * anterior, o valor fica TRAVADO com a origem à vista (o cadeado) — trocar é pela própria origem.
 */
function CampoComOrigem({
  id,
  valor,
  caminhos,
  origem,
  onValor,
  somenteLeitura,
}: {
  id: string;
  valor: string;
  caminhos: string[];
  origem?: string;
  onValor: (v: unknown) => void;
  somenteLeitura?: boolean;
}) {
  const campo = campoDoValor(valor);
  const opcoes = campo && !caminhos.includes(campo) ? [campo, ...caminhos] : caminhos;
  return (
    <div className="space-y-2">
      <SelectField
        id={id}
        aria-label="Origem do valor"
        value={campo ?? ""}
        disabled={somenteLeitura}
        onChange={(e) => onValor(e.target.value ? `{{${e.target.value}}}` : "")}
      >
        <option value="">Valor fixo (digitar)</option>
        {opcoes.map((x) => (
          <option key={x} value={x}>
            Do nó anterior: {x}
          </option>
        ))}
      </SelectField>
      {campo ? (
        <div className="flex min-h-11 items-center gap-2 rounded-control border border-border bg-surface-2 px-3 py-2 text-sm text-text" title="Vem do nó anterior — troque pela origem acima">
          <IconLock className="size-4 shrink-0 text-muted" aria-hidden />
          <span className="min-w-0">
            Vem {origem ? <>de <strong>{origem}</strong></> : "do nó anterior"}: <code className="font-mono text-[13px]">{campo}</code>
          </span>
        </div>
      ) : (
        <TextField aria-label="Valor fixo" value={valor} placeholder="Digite o valor" disabled={somenteLeitura} maxLength={1000} onChange={(e) => onValor(e.target.value)} />
      )}
    </div>
  );
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
