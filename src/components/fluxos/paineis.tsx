"use client";

import { createContext, useContext, useEffect, useMemo, useState } from "react";
import type { AlvoCenti, ProtocoloAutomacao } from "@/lib/automacao-centi-core";
import { type LinhaDfd, opcoesDoNo, planoDosItens } from "@/lib/automacao-dfds-motor";
import { noSistemaTela } from "@/lib/automacao-tela-protocolo";
import { caminhosDosItens, type Grafo, type Item, type NoFluxo } from "@/lib/fluxo-core";
import { dataHoraBR } from "@/lib/format";
import { chaveSelecao, REGISTRO_NOS, selecionados } from "@/lib/fluxo-nos";
import { Badge, type Tone } from "../Badge";
import { Button } from "../Button";
import { type Column, DataTable } from "../DataTable";
import { SelectField } from "../Field";
import { IconPastaAberta } from "../icons";
import { SeletorMultiplo } from "../SeletorMultiplo";
import { AnaliseDfds, COLUNAS_PROTOCOLOS, type GestaoAutomacao, useColunasGestao } from "../automacao/ProtocolosAutomacao";

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
  abrirProtocolo: (id: number) => void;
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
    <SelectField label={rotulo} value={valor} disabled={somenteLeitura} onChange={(e) => onValor(e.target.value)}>
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
  const marcados = useMemo(() => new Set((Array.isArray(no.config.marcados) ? no.config.marcados : []).map(String)), [no.config.marcados]);
  const ehProtocolo = origem?.tipo === "sistema.protocolos" && no.config.dfds !== true && itens.some((it) => Array.isArray(it.dfds));
  const gestao = useColunasGestao(host?.gestao ?? { pessoas: [], outras: [], situacoes: [], usuarioId: 0 });
  const colunas = useMemo<Column<Item>[]>(() => {
    if (ehProtocolo) {
      const naCenti: Column<ProtocoloAutomacao> = {
        key: "naCenti",
        header: "Na Centi",
        nowrap: true,
        value: (p) => (host?.naCenti.get(p.id) ? `${host.naCenti.get(p.id)} anexado(s)` : "—"),
        render: (p) => {
          const n = host?.naCenti.get(p.id) ?? 0;
          return n ? (
            <Badge tone="emerald" dot>
              {n} anexado(s)
            </Badge>
          ) : (
            <span className="text-faint">—</span>
          );
        },
      };
      return [...gestao, ...COLUNAS_PROTOCOLOS, naCenti] as unknown as Column<Item>[];
    }
    return caminhosDosItens(itens.slice(0, 50), 14)
      .filter((c) => !c.includes("."))
      .map((c) => ({ key: c, header: c, nowrap: true, value: (it: Item) => s(it[c]), render: (it: Item) => <span className="block max-w-[18rem] truncate">{s(it[c]) || "—"}</span> }));
  }, [ehProtocolo, gestao, host, itens]);
  const definir = (sel: Set<string | number>) =>
    onGrafo({ ...grafo, nos: grafo.nos.map((n) => (n.id === no.id ? { ...n, config: { ...n.config, marcados: [...sel].map(String) } } : n)) });
  return (
    <DataTable
      columns={colunas}
      rows={itens}
      getKey={(it) => chaveSelecao(it, no.config.chave)}
      selectable
      selected={marcados}
      onSelected={definir}
      onRowClick={ehProtocolo && host ? (it) => host.abrirProtocolo(Number(it.id)) : undefined}
      density="compact"
      scrollInterno
      vazio={origem ? "Execute o fluxo para listar os itens; depois marque e execute de novo." : "Ligue um componente à entrada desta seleção."}
      resumo={(ls) => `${ls.length} item(ns) · ${marcados.size} marcado(s)`}
    />
  );
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
function VistaLidos({ no }: PropsVisao) {
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
  return (
    <DataTable
      columns={colunas}
      rows={itens}
      getKey={(it) => `${s(it.protocolo)}/${s(it.ano)}`}
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
function VistaTabela({ no }: PropsVisao) {
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
  if (!nome) return <p className="text-sm text-muted">Informe o nome da tabela no componente.</p>;
  return (
    <DataTable
      columns={colunas}
      rows={linhas}
      getKey={(it) => linhas.indexOf(it)}
      density="compact"
      scrollInterno
      exportar={{ nome }}
      vazio={tabela === "erro" ? "Não consegui ler a tabela — tente de novo." : tabela ? "A tabela está vazia." : "Tabela ainda não gravada — execute o fluxo."}
      resumo={(ls) => `${ls.length} linha(s) · “${nome}”${tabela && tabela !== "erro" && tabela.atualizadoEm ? ` · gravada em ${dataHoraBR(tabela.atualizadoEm)}` : ""}`}
    />
  );
}

/** As visões que cada tipo de componente traz ao painel do fluxo. */
export const VISOES: Record<string, Visao> = {
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
