"use client";

import { createContext, useContext, useEffect, useMemo, useRef, useState } from "react";
import type { AlvoCenti, ProtocoloAutomacao } from "@/lib/automacao-centi-core";
import { type LinhaDfd, opcoesDoNo, planoDosItens } from "@/lib/automacao-dfds-motor";
import { noSistemaTela } from "@/lib/automacao-tela-protocolo";
import { caminhosDosItens, type Grafo, type Item, type NoFluxo, subgrafoAte, subgrafoSoLeitura } from "@/lib/fluxo-core";
import { dataHoraBR } from "@/lib/format";
import { buscaDoNo, type FontesSistema, opcoesDaBusca } from "@/lib/fluxo-ler-sistema";
import { chaveSelecao, REGISTRO_NOS, selecionados } from "@/lib/fluxo-nos";
import { Badge, type Tone } from "../Badge";
import { BotaoAtualizar } from "../BotaoAtualizar";
import { Button } from "../Button";
import { type Column, DataTable } from "../DataTable";
import { SelectField } from "../Field";
import { IconPastaAberta, IconPlay } from "../icons";
import { SeletorMultiplo } from "../SeletorMultiplo";
import { type AberturaItem, aceitaItensDeFora } from "@/lib/fluxo-tipo-item";
import { AnaliseDfds, type GestaoAutomacao } from "../automacao/ProtocolosAutomacao";
import { TabelaMesaFluxo } from "./TabelaMesaFluxo";

/*
 * As VISÕES do painel de um fluxo que um COMPONENTE traz (além do formulário de entrada): a tabela de seleção, a análise
 * dos DFDs, os protocolos lidos. Cada tipo de nó declara a sua em `VISOES`; o painel junta as do fluxo em abas — o mesmo
 * padrão em qualquer fluxo. O que a tela tem (protocolos, saídas completas, ao vivo) vem do `HostPainel`.
 */

export type HostPainel = {
  protocolos: ProtocoloAutomacao[];
  gestao: GestaoAutomacao;
  /** Quantos documentos o sistema registrou como anexados na Centi, por protocolo. */
  naCenti: Map<number, number>;
  /** Abre o protocolo/DFD/item na pilha de banners da Mesa. */
  abrir: (a: AberturaItem) => void;
  /** A saída COMPLETA de cada nó na última execução (a 1ª porta com itens). */
  saidas: Record<string, Item[]>;
  /** Os itens processados AO VIVO por cada nó (antes de ele terminar). */
  parciais: Record<string, Item[]>;
  /** Os DFDs do "Baixar/anexar DFDs" em andamento ou do último (null = só a prévia). */
  dfds: LinhaDfd[] | null;
  pasta: { nome: string | null; pode: boolean; escolher: () => void };
  /** Abre a análise completa de um protocolo lido (a mesma da importação). */
  abrirAnalise: (it: Item) => void;
  rodando: boolean;
  /** As repartições da Tela Protocolo da Centi (pela API; null = ainda não buscadas). */
  reparticoes: { lista: string[] | null; buscando: boolean; buscar: () => void };
  /** Abre o protocolo indicado na Centi (só leitura) e confere Id + nº; e o TESTE do anexo (sem emitir DFD). */
  conferirAlvo: (alvo: AlvoCenti) => Promise<string>;
  testarAnexo: (alvo: AlvoCenti, tipo: string) => Promise<string>;
  /** Os fluxos salvos (o seletor do "Executar fluxo") e o aberto agora (não pode usar a si mesmo). */
  fluxos: { id: number; nome: string }[];
  fluxoAtual: number | null;
  /** Esquece o progresso de um nó "Executar fluxo" (a próxima execução recomeça do zero). */
  recomecar: (no: string) => Promise<void>;
  /** A prévia de cada seleção: roda o trecho só de leitura antes dela e lista os itens (sem executar o fluxo). */
  previas: Record<string, { carregando: boolean; erro?: string; itens?: Item[] }>;
  /** Executa o fluxo aberto (o grafo da tela) SÓ com estes itens — os selecionados numa tabela de resultado. */
  executarCom: (grafo: Grafo, itens: Item[]) => void;
  /** `incluir` = o próprio nó também roda (a visão de um nó que lê, ex.: Ler do sistema). */
  carregarPrevia: (grafo: Grafo, no: string, incluir?: boolean) => void;
  /** Os órgãos cadastrados (o campo "Órgãos (ID na Centi)" escolhe entre os que têm o ID). */
  orgaos: { sigla: string; nome: string; entidadeCenti: string | null }[];
};
export const HostPainelCtx = createContext<HostPainel | null>(null);
const useHost = () => useContext(HostPainelCtx);

export type PropsVisao = { no: NoFluxo; grafo: Grafo; onGrafo: (g: Grafo) => void };
export type Visao = { titulo: string; Componente: (p: PropsVisao) => React.ReactNode };

/** Os nós ligados à ENTRADA de um nó. */
const anteriores = (g: Grafo, id: string) => g.conexoes.filter((c) => c.para === id).map((c) => g.nos.find((n) => n.id === c.de)).filter((n): n is NoFluxo => !!n);

/** Os itens que um nó produz: os da última execução; sem ela, a PRÉVIA (dados já carregados) ou a seleção marcada. */
export function itensDoNo(g: Grafo, no: NoFluxo, host: HostPainel, prof = 0): Item[] {
  if (host.saidas[no.id]) return host.saidas[no.id];
  if (prof > 6) return [];
  const def = REGISTRO_NOS.get(no.tipo);
  if (def?.previa) return def.previa(no.config, { protocolos: host.protocolos });
  if (no.tipo === "entrada.selecionar") return selecionados(anteriores(g, no.id).flatMap((n) => itensDoNo(g, n, host, prof + 1)), no.config);
  return [];
}

const s = (v: unknown) => (v == null ? "" : String(v));

// ---------------------------------------------------------------- CAMPO: repartições da Centi
/** As repartições da Tela Protocolo da Centi (escolha múltipla com busca) — o valor do campo é "a; b". */
export function CampoReparticoesCenti({ rotulo, valor, onValor, somenteLeitura }: { rotulo: string; valor: string; onValor: (v: string) => void; somenteLeitura?: boolean }) {
  const host = useHost();
  const escolhidas = valor.split(";").map((x) => x.trim()).filter(Boolean);
  const lista = host?.reparticoes.lista ?? null;
  const opcoes = [...new Set([...(lista ?? []), ...escolhidas])].map((v) => ({ valor: v }));
  return (
    <div className="space-y-1">
      <div className="flex items-center gap-2">
        <div className="min-w-0 flex-1">
          <SeletorMultiplo suspenso rotulo={rotulo} textoVazio="Nenhuma" opcoes={opcoes} selecionados={escolhidas} onChange={(v) => onValor(v.join("; "))} disabled={somenteLeitura || !opcoes.length} />
        </div>
        {host && (
          <Button size="sm" variant="secondary" onClick={host.reparticoes.buscar} loading={host.reparticoes.buscando} disabled={somenteLeitura} title="Buscar as repartições na Centi (pela API)">
            {lista ? "Atualizar" : "Buscar"}
          </Button>
        )}
      </div>
    </div>
  );
}

/** As fontes do sistema já lidas (DFDs e itens: UMA vez por tela — as opções do valor procurado). */
const cacheFontes = new Map<string, Promise<Item[]>>();
function fonteDaApi(url: string, campo: "dfds" | "itens"): Promise<Item[]> {
  let p = cacheFontes.get(url);
  if (!p) {
    p = fetch(url)
      .then((r) => r.json() as Promise<Record<string, unknown>>)
      .then((j) => (Array.isArray(j[campo]) ? (j[campo] as Item[]) : Promise.reject(new Error(String(j.error ?? "falhou")))))
      .catch((e: unknown) => {
        cacheFontes.delete(url);
        throw e;
      });
    cacheFontes.set(url, p);
  }
  return p;
}

/**
 * O VALOR FIXO do "Ler do sistema" ESCOLHIDO entre os que existem no sistema para a busca do nó (planejamentos, nºs de
 * DFD, protocolos, produtos…) — escolha múltipla com busca; o valor do campo é "a; b".
 */
export function CampoValoresSistema({ rotulo, valor, onValor, config, somenteLeitura }: { rotulo: string; valor: string; onValor: (v: string) => void; config: Record<string, unknown>; somenteLeitura?: boolean }) {
  const host = useHost();
  const { objeto, busca } = buscaDoNo(config);
  const [fontes, setFontes] = useState<FontesSistema | "erro" | null>(null);
  const protocolos = host?.protocolos;
  useEffect(() => {
    let vivo = true;
    const precisa = busca === "protocolo" || objeto === "protocolos" ? null : objeto;
    Promise.all([
      precisa === "dfds" ? fonteDaApi("/api/admin/automacao/execucao-dfds", "dfds") : Promise.resolve([]),
      precisa === "itens" ? fonteDaApi("/api/admin/automacao/itens-sistema", "itens") : Promise.resolve([]),
    ])
      .then(([dfds, itens]) => vivo && setFontes({ protocolos: (protocolos ?? []) as unknown as Item[], dfds, itens }))
      .catch(() => vivo && setFontes("erro"));
    return () => {
      vivo = false;
    };
  }, [objeto, busca, protocolos]);
  const escolhidos = valor.split(/[;\n]/).map((x) => x.trim()).filter(Boolean);
  const lista = fontes && fontes !== "erro" ? opcoesDaBusca(fontes, objeto, busca) : [];
  const conhecidos = new Set(lista.map((o) => o.valor));
  const opcoes = [...lista, ...escolhidos.filter((e) => !conhecidos.has(e)).map((e) => ({ valor: e, rotulo: `${e} (não encontrado)` }))];
  return (
    <SeletorMultiplo
      suspenso
      rotulo={rotulo}
      textoVazio={fontes === "erro" ? "Não consegui ler" : fontes ? `Escolha (${lista.length})` : "Carregando…"}
      opcoes={opcoes}
      selecionados={escolhidos}
      onChange={(v) => onValor(v.join("; "))}
      disabled={somenteLeitura || !opcoes.length}
    />
  );
}

/** Os ÓRGÃOS na Centi (o valor = os IDs "2; 3"): os cadastrados em Órgãos e Unidades com o ID; um ID digitado antes e
 * sem órgão segue à vista para desmarcar. */
export function CampoOrgaosCenti({ rotulo, valor, onValor, somenteLeitura }: { rotulo: string; valor: string; onValor: (v: string) => void; somenteLeitura?: boolean }) {
  const host = useHost();
  const escolhidos = valor.split(/[;,\s]+/).map((x) => x.trim()).filter(Boolean);
  const cadastrados = (host?.orgaos ?? []).filter((o) => o.entidadeCenti);
  const ids = new Set(cadastrados.map((o) => o.entidadeCenti as string));
  const opcoes = [
    ...cadastrados.map((o) => ({ valor: o.entidadeCenti as string, rotulo: `${o.sigla || o.nome} — ID ${o.entidadeCenti}` })),
    ...escolhidos.filter((e) => !ids.has(e)).map((e) => ({ valor: e, rotulo: `ID ${e} (sem órgão cadastrado)` })),
  ];
  return (
    <SeletorMultiplo
      suspenso
      rotulo={rotulo}
      textoVazio="Todos"
      opcoes={opcoes}
      selecionados={escolhidos}
      onChange={(v) => onValor(v.join("; "))}
      disabled={somenteLeitura || !opcoes.length}
    />
  );
}

/** Um fluxo salvo (o "Executar fluxo") — sem o próprio fluxo aberto. */
export function CampoFluxo({ rotulo, valor, onValor, varios, somenteLeitura }: { rotulo: string; valor: string; onValor: (v: string) => void; varios?: boolean; somenteLeitura?: boolean }) {
  const host = useHost();
  const lista = (host?.fluxos ?? []).filter((f) => f.id !== host?.fluxoAtual);
  if (varios) {
    const escolhidos = valor.split(/[;,\s]+/).filter(Boolean);
    return (
      <SeletorMultiplo
        suspenso
        rotulo={rotulo}
        textoVazio="Nenhum"
        opcoes={lista.map((f) => ({ valor: String(f.id), rotulo: f.nome }))}
        selecionados={escolhidos}
        onChange={(v) => onValor(v.slice(0, 6).join("; "))}
        disabled={somenteLeitura || !lista.length}
      />
    );
  }
  return (
    <SelectField aria-label={rotulo} value={valor} disabled={somenteLeitura} onChange={(e) => onValor(e.target.value)}>
      <option value="">Escolha um fluxo salvo…</option>
      {lista.map((f) => (
        <option key={f.id} value={String(f.id)}>
          {f.nome}
        </option>
      ))}
      {valor && !lista.some((f) => String(f.id) === valor) && <option value={valor}>Fluxo {valor} (não encontrado)</option>}
    </SelectField>
  );
}

/** "Recomeçar do zero" de um "Executar fluxo" com retomada. */
export function RecomecarSubfluxo({ no, somenteLeitura }: { no: string; somenteLeitura?: boolean }) {
  const host = useHost();
  const [estado, setEstado] = useState<"" | "limpando" | "feito">("");
  if (!host) return null;
  return (
    <div className="flex items-center gap-2 text-xs text-muted">
      <span className="min-w-0 flex-1">Interrompido, ele continua do item em que parou.</span>
      <Button
        size="xs"
        variant="ghost"
        disabled={somenteLeitura || host.rodando}
        loading={estado === "limpando"}
        onClick={async () => {
          setEstado("limpando");
          await host.recomecar(no).catch(() => undefined);
          setEstado("feito");
        }}
      >
        {estado === "feito" ? "Recomeça do zero" : "Recomeçar do zero"}
      </Button>
    </div>
  );
}

// ---------------------------------------------------------------- SELEÇÃO
function VistaSelecao({ no, grafo, onGrafo }: PropsVisao) {
  const host = useHost();
  const origem = anteriores(grafo, no.id)[0];
  const itens = useMemo(() => (host && origem ? itensDoNo(grafo, origem, host) : []), [host, grafo, origem]);
  const { previa, podePrevia, recarregar } = usePreviaDoNo(grafo, no.id, false, !!origem, itens.length > 0);
  const { marcados, definir } = useMarcadosDoNo(no, grafo, onGrafo);
  // Os protocolos ganham o "Na Centi" (quantos documentos já foram anexados); as demais colunas são as da Mesa.
  const naCenti = useMemo<Column<Item>[]>(
    () =>
      itens.some((it) => Array.isArray(it.dfds))
        ? [
            {
              key: "naCenti",
              header: "Na Centi",
              nowrap: true,
              value: (p) => (host?.naCenti.get(Number(p.id)) ? `${host.naCenti.get(Number(p.id))} anexado(s)` : "—"),
              render: (p) => {
                const n = host?.naCenti.get(Number(p.id)) ?? 0;
                return n ? (
                  <Badge tone="emerald" dot>
                    {n} anexado(s)
                  </Badge>
                ) : (
                  <span className="text-faint">—</span>
                );
              },
            },
          ]
        : [],
    [host, itens],
  );
  const genericas = useMemo(() => colunasGenericas(itens), [itens]);
  if (!host) return null;
  return (
    <TabelaMesaFluxo
      itens={itens}
      chave={(it) => chaveSelecao(it, no.config.chave)}
      genericas={genericas}
      extras={naCenti}
      gestao={host.gestao}
      onAbrir={host.abrir}
      selected={marcados}
      onSelected={definir}
      vazio={
        !origem
          ? "Ligue um componente à entrada desta seleção."
          : previa?.carregando
            ? "Carregando itens…"
            : previa?.erro
              ? `Não consegui carregar os itens: ${previa.erro}`
              : podePrevia
                ? "Nenhum item encontrado."
                : "Execute o fluxo para listar os itens; depois marque e execute de novo."
      }
      acoesRodape={podePrevia ? <BotaoAtualizar ativo={!!previa?.carregando} rotulo="Recarregar itens" onClick={recarregar} disabled={host.rodando} /> : undefined}
      resumo={(ls) => `${ls.length} item(ns) · ${marcados.size} marcado(s)`}
    />
  );
}

/**
 * PRÉVIA (padrão de toda visão que lista itens antes de executar): sem itens, roda sozinho o trecho SÓ DE LEITURA até o
 * nó — uma vez por grafo. `incluir` = o próprio nó também roda (a visão de um nó que lê); sem ele, só os anteriores.
 */
function usePreviaDoNo(grafo: Grafo, noId: string, incluir: boolean, ligado: boolean, temItens: boolean) {
  const host = useHost();
  const previa = host?.previas[noId];
  const sub = useMemo(() => subgrafoAte(grafo, noId, incluir), [grafo, noId, incluir]);
  const podePrevia = ligado && subgrafoSoLeitura(sub, REGISTRO_NOS);
  const chaveGrafo = JSON.stringify(sub);
  const pedida = useRef("");
  const carregar = host?.carregarPrevia;
  const rodando = host?.rodando;
  useEffect(() => {
    if (!carregar || !podePrevia || temItens || rodando || pedida.current === chaveGrafo) return;
    pedida.current = chaveGrafo;
    carregar(grafo, noId, incluir);
  }, [carregar, podePrevia, temItens, rodando, chaveGrafo, grafo, noId, incluir]);
  return { previa, podePrevia, recarregar: () => carregar?.(grafo, noId, incluir) };
}

/** As linhas MARCADAS de uma visão que ENTREGA itens — gravadas no nó (`marcados`): só elas passam pela automação. */
function useMarcadosDoNo(no: NoFluxo, grafo: Grafo, onGrafo: (g: Grafo) => void) {
  const marcados = useMemo(() => new Set((Array.isArray(no.config.marcados) ? no.config.marcados : []).map(String)), [no.config.marcados]);
  const definir = (sel: Set<string | number>) =>
    onGrafo({ ...grafo, nos: grafo.nos.map((n) => (n.id === no.id ? { ...n, config: { ...n.config, marcados: sel.size ? [...sel].map(String) : undefined } } : n)) });
  return { marcados, definir };
}

/**
 * A seleção numa tabela de RESULTADO: marque e "Executar com os selecionados" — o fluxo roda de novo SÓ com eles (o Início
 * os entrega, como os da Mesa). Só aparece quando o fluxo recebe esses itens (`aceitaItensDeFora`); a seleção zera quando
 * os itens mudam (nova execução).
 */
export function useExecutarSelecionados(grafo: Grafo, itens: Item[], chave: (it: Item) => string | number) {
  const host = useHost();
  const [sel, setSel] = useState<Set<string | number>>(new Set());
  // biome-ignore lint/correctness/useExhaustiveDependencies: os itens novos (outra execução) zeram a seleção
  useEffect(() => setSel((v) => (v.size ? new Set() : v)), [itens]);
  const aceita = useMemo(() => aceitaItensDeFora(grafo, itens, (t) => REGISTRO_NOS.get(t)?.categoria), [grafo, itens]);
  if (!host || !aceita) return null;
  const escolhidos = itens.filter((it) => sel.has(chave(it)));
  return {
    selected: sel,
    onSelected: host.rodando ? undefined : setSel,
    acao: (
      <Button size="sm" disabled={!escolhidos.length || host.rodando} onClick={() => host.executarCom(grafo, escolhidos)} title="Executa o fluxo de novo só com as linhas marcadas">
        <IconPlay className="h-4 w-4" aria-hidden="true" />
        Executar com {escolhidos.length ? `${escolhidos.length} ` : "os "}selecionado{escolhidos.length === 1 ? "" : "s"}
      </Button>
    ),
  };
}

// ---------------------------------------------------------------- DO SISTEMA
/** O que o "Ler do sistema" lê (DFDs, protocolos ou itens) — já ao abrir o fluxo, sem executar e sem a extensão. */
function VistaDoSistema({ no, grafo, onGrafo }: PropsVisao) {
  const host = useHost();
  // A prévia lê TUDO de uma vez (no "Um por vez" ela entregaria só o primeiro, sem quem devolva pela Volta) e SEM as
  // marcações — a tabela mostra tudo o que o nó lê; as marcadas decidem o que passa.
  const grafoLista = useMemo(
    () => ({ ...grafo, nos: grafo.nos.map((n) => (n.id === no.id ? { ...n, config: { ...n.config, entrega: "lista", marcados: undefined } } : n)) }),
    [grafo, no.id],
  );
  const itens = host?.previas[no.id]?.itens ?? [];
  const { previa, podePrevia, recarregar } = usePreviaDoNo(grafoLista, no.id, true, true, !!host?.previas[no.id]?.itens);
  const { marcados, definir } = useMarcadosDoNo(no, grafo, onGrafo);
  const genericas = useMemo(() => colunasGenericas(itens), [itens]);
  if (!host) return null;
  return (
    <TabelaMesaFluxo
      itens={itens}
      chave={(it) => chaveSelecao(it, "id")}
      genericas={genericas}
      gestao={host.gestao}
      onAbrir={host.abrir}
      selected={marcados}
      onSelected={host.rodando ? undefined : definir}
      vazio={
        previa?.carregando
          ? "Carregando do sistema…"
          : previa?.erro
            ? `Não consegui ler do sistema: ${previa.erro}`
            : podePrevia
              ? "Nada encontrado no sistema com essa busca."
              : "Execute o fluxo para ler do sistema."
      }
      acoesRodape={podePrevia ? <BotaoAtualizar ativo={!!previa?.carregando} rotulo="Recarregar do sistema" onClick={recarregar} disabled={host.rodando} /> : undefined}
      resumo={(ls) => `${ls.length} item(ns) · ${marcados.size ? `${marcados.size} marcado(s) — só eles passam` : "nenhum marcado — todos passam"}`}
    />
  );
}

/** As colunas dos itens que NÃO são da Mesa (repartições, linhas da CM002…): os campos do 1º nível, como vêm. */
function colunasGenericas(itens: Item[]): Column<Item>[] {
  return caminhosDosItens(itens.slice(0, 50), 14)
    .filter((c) => !c.includes("."))
    .map((c) => ({ key: c, header: c, nowrap: true, value: (it: Item) => s(it[c]), render: (it: Item) => <span className="block max-w-[18rem] truncate">{s(it[c]) || "—"}</span> }));
}

// ---------------------------------------------------------------- DFDs (Baixar/anexar)
function VistaDfds({ no, grafo }: PropsVisao) {
  const host = useHost();
  const { saida, alvo, erroAlvo } = opcoesDoNo(no.config);
  const [checagem, setChecagem] = useState<{ carregando?: "conferir" | "testar"; texto?: string } | null>(null);
  const checar = async (tipo: "conferir" | "testar") => {
    if (!host || !alvo) return setChecagem({ texto: erroAlvo ?? "Informe o protocolo." });
    setChecagem({ carregando: tipo });
    setChecagem({ texto: tipo === "conferir" ? await host.conferirAlvo(alvo) : await host.testarAnexo(alvo, saida.tipoDocumento) });
  };
  const previa = useMemo(() => {
    if (!host) return [];
    const itens = anteriores(grafo, no.id).flatMap((n) => itensDoNo(grafo, n, host));
    return planoDosItens(itens, saida, host.protocolos).previa;
  }, [host, grafo, no.id, saida]);
  if (!host) return null;
  const destino = saida.destino === "pasta" ? null : saida.destino === "proprio" ? "protocolo de cada DFD" : alvo ? `Protocolo ${alvo.numero}${alvo.ano ? `/${alvo.ano}` : ""}` : "protocolo da Centi";
  return (
    <div className="flex h-full min-h-0 flex-col gap-2">
      {saida.destino === "pasta" && saida.escolherPasta && host.pasta.pode && (
        <Button size="sm" variant="secondary" onClick={host.pasta.escolher} disabled={host.rodando} className="self-start">
          <IconPastaAberta className="h-4 w-4" />
          <span className="max-w-60 truncate">{host.pasta.nome ? `Pasta: ${host.pasta.nome}` : "Escolher a pasta"}</span>
        </Button>
      )}
      {saida.destino === "protocolo" && (
        <div className="flex flex-wrap items-center gap-2">
          <Button size="sm" variant="secondary" onClick={() => void checar("conferir")} loading={checagem?.carregando === "conferir"} disabled={host.rodando}>
            Conferir na Centi
          </Button>
          <Button size="sm" variant="secondary" onClick={() => void checar("testar")} loading={checagem?.carregando === "testar"} disabled={host.rodando} title="Anexa um PDF de teste (sem emitir DFD) — exclua-o depois na Centi">
            Testar anexo
          </Button>
          {checagem?.texto && <span className="min-w-0 flex-1 text-xs text-muted">{checagem.texto}</span>}
        </div>
      )}
      <AnaliseDfds linhas={host.dfds ?? previa} rodando={host.rodando} destino={destino} />
    </div>
  );
}

// ---------------------------------------------------------------- PROTOCOLOS LIDOS (Ler protocolo)
const DOC: Record<string, { rotulo: string; tom: Tone }> = {
  ok: { rotulo: "Lido", tom: "emerald" },
  atencao: { rotulo: "Atenção", tom: "amber" },
  falha: { rotulo: "Falhou", tom: "red" },
};
function VistaLidos({ no, grafo }: PropsVisao) {
  const host = useHost();
  const itens = host ? (host.saidas[no.id] ?? host.parciais[no.id] ?? []) : [];
  const casar = useMemo(() => noSistemaTela(host?.protocolos ?? []), [host?.protocolos]);
  const colunas = useMemo<Column<Item>[]>(() => {
    const noSistema = (it: Item) => !!casar({ protocolo: s(it.protocolo).split("/")[0], ano: s(it.ano), id: s(it.id) });
    return [
      { key: "protocolo", header: "Protocolo", nowrap: true, value: (it) => s(it.protocolo), render: (it) => <span className="font-semibold">{s(it.protocolo)}</span> },
      { key: "ano", header: "Ano", nowrap: true, value: (it) => s(it.ano), render: (it) => s(it.ano) || "—" },
      { key: "id", header: "Id", nowrap: true, value: (it) => s(it.id), render: (it) => s(it.id) || "—" },
      { key: "departamento", header: "Departamento", value: (it) => s(it.departamento), render: (it) => s(it.departamento) || "—" },
      { key: "interessado", header: "Interessado", value: (it) => s(it.interessado), render: (it) => s(it.interessado) || "—" },
      { key: "assunto", header: "Assunto", value: (it) => s(it.assunto), render: (it) => s(it.assunto) || "—" },
      { key: "dfds", header: "DFDs", nowrap: true, value: (it) => s(it.totalDfds), render: (it) => s(it.totalDfds) || "—" },
      {
        key: "sistema",
        header: "No sistema",
        nowrap: true,
        value: (it) => (noSistema(it) ? "No sistema" : "Novo"),
        render: (it) => (noSistema(it) ? <Badge tone="emerald" dot>No sistema</Badge> : <Badge tone="slate">Novo</Badge>),
      },
      {
        key: "documento",
        header: "Documento",
        nowrap: true,
        value: (it) => DOC[s(it.leitura)]?.rotulo ?? "—",
        render: (it) => {
          const d = DOC[s(it.leitura)];
          return d ? (
            <span className="inline-flex items-center gap-1.5" title={s(it.leituraTexto)}>
              <Badge tone={d.tom} dot>
                {d.rotulo}
              </Badge>
              <span className="max-w-[18rem] truncate text-xs text-muted">{s(it.leituraTexto)}</span>
            </span>
          ) : (
            "—"
          );
        },
      },
    ];
  }, [casar]);
  const chaveLido = (it: Item) => `${s(it.protocolo)}/${s(it.ano)}`;
  const exec = useExecutarSelecionados(grafo, itens, chaveLido);
  return (
    <DataTable
      columns={colunas}
      rows={itens}
      getKey={chaveLido}
      selectable={!!exec?.onSelected}
      selected={exec?.selected}
      onSelected={exec?.onSelected}
      acoesRodape={exec?.acao}
      onRowClick={host && !host.rodando ? (it) => host.abrirAnalise(it) : undefined}
      density="compact"
      scrollInterno
      exportar={{ nome: "Protocolos lidos" }}
      vazio="Nenhum protocolo lido ainda — execute o fluxo."
      resumo={(ls) => `${ls.length} protocolo(s) · ${ls.filter((x) => x.leitura === "falha").length} com falha · toque numa linha para a análise completa`}
    />
  );
}


const celula = (v: unknown) => (v && typeof v === "object" ? JSON.stringify(v) : s(v));

/** A TABELA salva (nó "Salvar em tabela" / "Ler tabela salva"): as linhas gravadas, todas as colunas, filtráveis e exportáveis. */
function VistaTabela({ no, grafo, onGrafo }: PropsVisao) {
  const host = useHost();
  const nome = s(no.config.nome).trim();
  const execucao = host?.saidas[no.id];
  const [tabela, setTabela] = useState<{ linhas: Item[]; colunas: string[]; atualizadoEm: string | null } | null | "erro">(null);
  // Relê do servidor ao trocar de nome e a cada execução que gravou (as linhas salvas são a fonte).
  // biome-ignore lint/correctness/useExhaustiveDependencies: a execução só dispara a releitura
  useEffect(() => {
    if (!nome) return setTabela(null);
    let vivo = true;
    fetch(`/api/admin/automacao/tabelas?nome=${encodeURIComponent(nome)}`)
      .then((r) => r.json() as Promise<{ ok?: boolean; tabela?: { linhas: Item[]; colunas: string[]; atualizadoEm: string | null } }>)
      .then((j) => vivo && setTabela(j.ok && j.tabela ? j.tabela : null))
      .catch(() => vivo && setTabela("erro"));
    return () => {
      vivo = false;
    };
  }, [nome, execucao]);
  const linhas = tabela && tabela !== "erro" ? tabela.linhas : [];
  const colunas = useMemo<Column<Item>[]>(
    () =>
      (tabela && tabela !== "erro" ? tabela.colunas : caminhosDosItens(linhas.slice(0, 50), 30)).map((c) => ({
        key: c,
        header: c,
        nowrap: true,
        value: (it: Item) => celula(it[c]),
        render: (it: Item) => <span className="block max-w-[16rem] truncate">{celula(it[c])}</span>,
      })),
    [tabela, linhas],
  );
  // "Ler tabela salva" ENTREGA as linhas: as marcadas (pela posição) são as que passam. "Salvar em tabela" é RESULTADO:
  // as marcadas podem rodar o fluxo de novo.
  const entrega = no.tipo === "entrada.tabela";
  const chaveLinha = (it: Item) => String(linhas.indexOf(it));
  const { marcados, definir } = useMarcadosDoNo(no, grafo, onGrafo);
  const exec = useExecutarSelecionados(grafo, entrega ? [] : linhas, chaveLinha);
  if (!nome) return <p className="text-sm text-muted">Informe o nome da tabela no componente.</p>;
  if (!host) return null;
  return (
    <TabelaMesaFluxo
      itens={linhas}
      chave={chaveLinha}
      genericas={colunas}
      gestao={host.gestao}
      onAbrir={host.abrir}
      selected={entrega ? marcados : exec?.selected}
      onSelected={entrega ? (host.rodando ? undefined : definir) : exec?.onSelected}
      acoesRodape={entrega ? undefined : exec?.acao}
      exportar={{ nome }}
      vazio={tabela === "erro" ? "Não consegui ler a tabela — tente de novo." : tabela ? "A tabela está vazia." : "Tabela ainda não gravada — execute o fluxo."}
      resumo={(ls) =>
        `${ls.length} linha(s) · “${nome}”${tabela && tabela !== "erro" && tabela.atualizadoEm ? ` · gravada em ${dataHoraBR(tabela.atualizadoEm)}` : ""}${entrega ? ` · ${marcados.size ? `${marcados.size} marcada(s) — só elas passam` : "nenhuma marcada — as linhas do recorte passam"}` : ""}`
      }
    />
  );
}

/** As visões que cada tipo de componente traz ao painel do fluxo. */
export const VISOES: Record<string, Visao> = {
  "sistema.ler": { titulo: "Do sistema", Componente: VistaDoSistema },
  "entrada.selecionar": { titulo: "Seleção", Componente: VistaSelecao },
  "saida.dfdsCenti": { titulo: "DFDs", Componente: VistaDfds },
  "leitura.protocolo": { titulo: "Protocolos lidos", Componente: VistaLidos },
  "saida.tabela": { titulo: "Tabela", Componente: VistaTabela },
  "entrada.tabela": { titulo: "Tabela", Componente: VistaTabela },
};

/** O ESTADO de um item processado (a análise ao vivo): o rótulo, o tom e o detalhe — por tipo de componente. */
export function estadoDoItem(tipo: string, it: Item): { rotulo: string; tom: Tone; texto: string } | null {
  if (tipo === "leitura.dfdCenti") {
    const c = it.centi && typeof it.centi === "object" ? (it.centi as Item) : null;
    if (c) return { rotulo: "Encontrado", tom: "emerald", texto: s(c.situacao) };
    return it.centiFalha ? { rotulo: "Não conferido", tom: "amber", texto: s(it.centiErro) } : { rotulo: "Não encontrado", tom: "red", texto: s(it.centiErro) };
  }
  if (tipo === "leitura.protocolo") {
    const d = DOC[s(it.leitura)];
    return d ? { rotulo: d.rotulo, tom: d.tom, texto: s(it.leituraTexto) } : null;
  }
  if (tipo === "saida.substituirDfd") {
    if (s(it.erro)) return { rotulo: "Falhou", tom: "red", texto: s(it.erro) };
    if (it.substituido === true) return { rotulo: "Substituído", tom: "emerald", texto: `${s(it.itensGravados) || "0"} item(ns) gravado(s) com os dados da Centi` };
    return null;
  }
  if (tipo === "fluxo.executar") {
    const sub = it.subfluxo && typeof it.subfluxo === "object" ? (it.subfluxo as Item) : null;
    if (sub?.estado === "falhou") return { rotulo: "Falhou", tom: "red", texto: s(sub.erro) };
    if (it.naoMarcar === true) return { rotulo: "Não conferido", tom: "amber", texto: s(it.mensagem) };
    if (s(it.mensagem)) return { rotulo: "Divergente", tom: "red", texto: s(it.mensagem) };
    return { rotulo: "Convergente", tom: "emerald", texto: "" };
  }
  return null;
}

/** O nome curto de um item (protocolo, DFD/planejamento ou o id). */
export function rotuloItem(it: Item): string {
  if (it.protocolo && it.ano && !it.planejamento) return `Protocolo ${s(it.protocolo).split("/")[0]}/${s(it.ano)}`;
  if (it.numero || it.planejamento) return `DFD ${s(it.numero) || "—"} · Planej. ${s(it.planejamento) || "—"}`;
  return s(it.id ?? it.nome ?? it.reparticao) || "—";
}
