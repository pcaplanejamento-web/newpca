"use client";

import { useAnoDoCard } from "./anoDoCard";
import { useRouter } from "next/navigation";
import { type ReactNode, useEffect, useMemo, useRef, useState } from "react";
import {
  coberturaDoGrupo,
  type GrupoVinculo,
  gruposDosVinculos,
  type ItemCatalogo,
  motivoVinculosInvalidos,
  rotuloAcaoCenti,
  semVinculo,
  type VinculoCard,
  vinculosDosGrupos,
} from "@/lib/empenho-cards-core";
import type { OrgaoVinculo, UnidadeVinculo } from "@/lib/empenho-cards";
import { anoInteiro, diasDoPeriodo, periodoDoAno, type LoteCenti, rotuloPeriodo } from "@/lib/empenhos-core";
import { num } from "@/lib/format";
import { type Agora, lerAnoNaCenti, pedirImportacao, RecusaImportacao } from "@/lib/leitura-centi-cliente";
import { FerramentasAba } from "./AbasEspaco";
import { Ajuda } from "./Ajuda";
import { Button } from "./Button";
import { Callout } from "./Callout";
import { useConfirmacao } from "./Confirmacao";
import { type Column, DataTable } from "./DataTable";
import { SelectField } from "./Field";
import { IconDownload, IconPlus, IconSpinner, IconTrash } from "./icons";
import { Modal } from "./Modal";
import { Progress } from "./Progress";
import { Segmented } from "./Segmented";
import { Selecao } from "./Selecao";
import { Badge } from "./Badge";
import { SeletorMultiplo } from "./SeletorMultiplo";
import { toast } from "./Toast";

type Cadastro = { orgaos: OrgaoVinculo[]; unidades: UnidadeVinculo[] };
type Vista = "vinculos" | "sem";
/** O que o editor tem aberto: um grupo existente (a chave) ou um NOVO (com o que veio pré-escolhido). */
type Aberto = { chave: string | null; inicial: Rascunho };
type Rascunho = { orgaoGestor: string; unidade: string | null; acoes: string[]; destino: string };

/** O destino no cadastro na escolha: "o:<órgão>" (o órgão inteiro) ou "u:<unidade>". */
const destinoDe = (g: Pick<GrupoVinculo, "orgaoId" | "reparticaoId">) => (g.reparticaoId != null ? `u:${g.reparticaoId}` : `o:${g.orgaoId}`);
const TODAS = "__todas__";
/** A caixa da escolha DENTRO da célula (o texto inteiro, sem abreviar — a coluna cresce com ele). */
const CELULA =
  "min-h-11 w-max max-w-none rounded-control px-2 text-[12px] font-medium whitespace-nowrap text-text-2 transition-colors hover:bg-surface-2 lg:min-h-[calc(var(--h-control-sm)-6px)]";
const ordenar = (l: Iterable<string>) => [...l].sort((a, b) => a.localeCompare(b, "pt-BR", { numeric: true }));
/** O que a célula põe à vista sem edição: o texto INTEIRO numa linha. */
const Inteiro = ({ texto, apagado }: { texto: string; apagado?: boolean }) => <span className={`whitespace-nowrap ${apagado ? "text-muted" : "text-text-2"}`}>{texto}</span>;
/** O invólucro de um controle na célula: o toque nele não abre a linha. */
const NaCelula = ({ children, gravando }: { children: ReactNode; gravando: boolean }) => (
  <span role="none" className="inline-flex items-center gap-1" onClick={(e) => e.stopPropagation()} onKeyDown={(e) => e.stopPropagation()}>
    {children}
    {gravando && <IconSpinner className="h-3.5 w-3.5 shrink-0 text-accent" />}
  </span>
);

/**
 * A aba VÍNCULOS de um card — o que o card IMPORTA e para ONDE vai: cada vínculo escolhe um órgão gestor da Centi, a
 * unidade orçamentária (ou todas) e as ações (ou todas) e o órgão ou a unidade do cadastro a que pertencem. Só o que um
 * vínculo cobre é gravado; o mais específico vale (a ação › a unidade orçamentária › o órgão gestor inteiro). As escolhas
 * vêm do CATÁLOGO da Centi ("Buscar na Centi" lê um ano e atualiza o catálogo, sem gravar empenhos). `Segmented` Vínculos |
 * Na Centi sem vínculo (o que o card deixa de fora — tocar já abre o vínculo com ele). Gravar = a lista inteira, conferida
 * pela regra única (`motivoVinculosInvalidos`); o empenho que fica sem vínculo SAI do banco.
 */
export function EmpenhoCardVinculos({
  cardId,
  anos,
  vinculos,
  catalogo,
  cadastro,
  podeEditar,
  podeBuscar,
  configurado,
}: {
  cardId: number;
  /** Os anos do card (o "Buscar na Centi" lê o ano escolhido — o mesmo das outras abas, `useAnoDoCard`). */
  anos: number[];
  vinculos: VinculoCard[];
  catalogo: ItemCatalogo[];
  cadastro: Cadastro;
  podeEditar: boolean;
  /** Importar no card: "Buscar na Centi" (atualiza o catálogo). */
  podeBuscar: boolean;
  /** A Configuração do card já foi confirmada (sem ela, nada é lido da Centi). */
  configurado: boolean;
}) {
  const router = useRouter();
  const [vista, setVista] = useState<Vista>("vinculos");
  const [aberto, setAberto] = useState<Aberto | null>(null);
  const [gravando, setGravando] = useState(false);
  const [buscando, setBuscando] = useState(false);
  const [agora, setAgora] = useState<Agora | null>(null);
  const [anoBusca, setAnoBusca] = useAnoDoCard(cardId, anos);
  const local = useRef(-1);
  const { confirmar, confirmacao } = useConfirmacao();
  /** A linha que está gravando (o spinner na célula). */
  const [gravandoLinha, setGravandoLinha] = useState<string | null>(null);

  const grupos = useMemo(() => gruposDosVinculos(vinculos), [vinculos]);
  const fora = useMemo(() => semVinculo(catalogo, vinculos), [catalogo, vinculos]);
  const orgaoPorId = useMemo(() => new Map(cadastro.orgaos.map((o) => [o.id, o])), [cadastro.orgaos]);
  const unidadePorId = useMemo(() => new Map(cadastro.unidades.map((u) => [u.id, u])), [cadastro.unidades]);
  const cobertura = useMemo(() => new Map(grupos.map((g) => [g.chave, coberturaDoGrupo(g, catalogo, vinculos)])), [grupos, catalogo, vinculos]);
  const regra = useMemo(
    () => ({ orgaos: new Set(cadastro.orgaos.map((o) => o.id)), unidades: new Map(cadastro.unidades.map((u) => [u.id, u.orgaoId])) }),
    [cadastro],
  );

  const rotuloDestino = (g: Pick<GrupoVinculo, "orgaoId" | "reparticaoId">) => {
    if (g.reparticaoId != null) {
      const u = unidadePorId.get(g.reparticaoId);
      return u ? `${u.codigo} — ${u.nome}` : `Unidade #${g.reparticaoId}`;
    }
    const o = orgaoPorId.get(g.orgaoId);
    return o ? `${o.sigla} — ${o.nome} (o órgão)` : `Órgão #${g.orgaoId}`;
  };

  /** Grava a lista INTEIRA de vínculos (a regra confere antes; o servidor confere de novo). */
  async function gravar(novos: VinculoCard[], ok: string): Promise<boolean> {
    const motivo = motivoVinculosInvalidos(novos, regra);
    if (motivo) {
      toast.error(motivo);
      return false;
    }
    setGravando(true);
    try {
      const r = await fetch(`/api/empenhos/cards/${cardId}/vinculos`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ vinculos: novos }) });
      const j = (await r.json().catch(() => ({}))) as { ok?: boolean; error?: string };
      if (!r.ok || !j.ok) throw new Error(j.error ?? "Não foi possível gravar os vínculos.");
      toast.success(ok);
      router.refresh();
      return true;
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Não foi possível gravar os vínculos.");
      return false;
    } finally {
      setGravando(false);
    }
  }

  /** Os vínculos com o grupo aberto trocado pelo rascunho (ou sem ele, ao excluir). */
  function comGrupo(chave: string | null, r: Rascunho | null): VinculoCard[] {
    const outros = grupos.filter((g) => g.chave !== chave);
    if (!r) return vinculosDosGrupos(outros);
    const [tipo, id] = r.destino.split(":");
    const reparticaoId = tipo === "u" ? Number(id) : null;
    const orgaoId = tipo === "u" ? (unidadePorId.get(Number(id))?.orgaoId ?? 0) : Number(id);
    const g: GrupoVinculo = { chave: "", orgaoGestor: r.orgaoGestor, unidade: r.unidade, acoes: r.unidade == null || !r.acoes.length ? null : r.acoes, orgaoId, reparticaoId };
    return vinculosDosGrupos([...outros, g]);
  }

  /** EDIÇÃO NA CÉLULA: troca um campo do vínculo da linha e grava a lista inteira (a mesma régua do editor). */
  async function mudarNaCelula(g: GrupoVinculo, patch: Partial<Rascunho>, ok: string) {
    const r: Rascunho = { orgaoGestor: g.orgaoGestor, unidade: g.unidade, acoes: g.acoes ?? [], destino: destinoDe(g), ...patch };
    setGravandoLinha(g.chave);
    try {
      await gravar(comGrupo(g.chave, r), ok);
    } finally {
      setGravandoLinha(null);
    }
  }
  /** As escolhas das células, tiradas do CATÁLOGO (+ o valor atual, que nunca some da lista). */
  const gestoresCatalogo = useMemo(() => ordenar(new Set(catalogo.map((c) => c.orgaoGestor))), [catalogo]);
  const unidadesDoGestor = (gestor: string, atual: string | null) => {
    const s = new Set(catalogo.filter((c) => c.orgaoGestor === gestor).map((c) => c.unidade));
    if (atual != null) s.add(atual);
    return ordenar(s);
  };
  const unidadesPorOrgao = useMemo(() => {
    const m = new Map<number, UnidadeVinculo[]>();
    for (const u of cadastro.unidades) if (u.orgaoId != null) m.set(u.orgaoId, [...(m.get(u.orgaoId) ?? []), u]);
    return m;
  }, [cadastro.unidades]);
  const opcoesDestino = (
    <>
      {cadastro.orgaos.map((o) => (
        <optgroup key={o.id} label={`${o.sigla} — ${o.nome}`}>
          <option value={`o:${o.id}`}>{`${o.sigla} — ${o.nome} (o órgão)`}</option>
          {(unidadesPorOrgao.get(o.id) ?? []).map((u) => (
            <option key={u.id} value={`u:${u.id}`}>
              {`${u.codigo} — ${u.nome}`}
            </option>
          ))}
        </optgroup>
      ))}
    </>
  );

  async function excluir(chave: string) {
    if (!(await confirmar({ titulo: "Excluir este vínculo?", texto: "Os empenhos que só este vínculo cobria saem do banco (importar de novo, com outro vínculo, os traz de volta).", confirmar: "Excluir", perigo: true }))) return;
    if (await gravar(comGrupo(chave, null), "Vínculo excluído.")) setAberto(null);
  }

  /** "Buscar na Centi": lê o ano em modo catálogo (nada é gravado nos empenhos) e atualiza as escolhas. */
  async function buscar() {
    setBuscando(true);
    const condutor = crypto.randomUUID();
    let lote: LoteCenti | null = null;
    try {
      lote = (await pedirImportacao<{ lote: LoteCenti }>(cardId, { acao: "iniciar", ano: anoBusca, condutor, modo: "unidades" })).lote;
      lote = await lerAnoNaCenti({
        cardId,
        lote,
        anteriores: [],
        condutor,
        comPeriodo: true,
        parar: () => false,
        onPasso: () => {},
        onLote: () => {},
        onAgora: setAgora,
        idLocal: () => local.current--,
        onde: () => {},
      });
      const fim = await pedirImportacao<{ lote: LoteCenti }>(cardId, { acao: "concluir", lote: lote.id, condutor });
      toast.success(fim.lote.mensagem ?? "Catálogo da Centi atualizado.");
      router.refresh();
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Falha ao buscar na Centi.";
      if (lote && !(e instanceof RecusaImportacao)) await pedirImportacao(cardId, { acao: "cancelar", lote: lote.id, condutor, falhou: true, motivo: msg.slice(0, 300) }).catch(() => {});
      toast.error(msg);
    } finally {
      setAgora(null);
      setBuscando(false);
    }
  }

  const ocupado = (g: GrupoVinculo) => gravando || gravandoLinha === g.chave;
  const textoUnidade = (u: string | null) => (u == null ? "Todas" : u || "(sem unidade orçamentária)");
  // EDIÇÃO DIRETO NA CÉLULA (quem configura): cada coluna é a escolha do sistema com o texto INTEIRO — o órgão gestor, a
  // unidade orçamentária (ou todas) e o destino no cadastro; as ações (selo) se editam no banner. Grava na hora, pela
  // MESMA régua do editor; tocar fora dos controles abre o vínculo.
  const colunasVinculos: Column<GrupoVinculo>[] = [
    {
      key: "gestor",
      header: "Órgão gestor (Centi)",
      align: "left",
      nowrap: true,
      value: (g) => g.orgaoGestor,
      render: (g) =>
        podeEditar ? (
          <NaCelula gravando={gravandoLinha === g.chave}>
            <Selecao
              className={CELULA}
              value={g.orgaoGestor}
              titulo="Órgão gestor (Centi)"
              aria-label={`Órgão gestor do vínculo ${g.orgaoGestor}`}
              disabled={ocupado(g)}
              onChange={(e) => void mudarNaCelula(g, { orgaoGestor: e.target.value, unidade: null, acoes: [] }, "Órgão gestor do vínculo atualizado.")}
            >
              {ordenar(new Set([...gestoresCatalogo, g.orgaoGestor])).map((x) => (
                <option key={x} value={x}>
                  {x}
                </option>
              ))}
            </Selecao>
          </NaCelula>
        ) : (
          <Inteiro texto={g.orgaoGestor} />
        ),
    },
    {
      key: "unidade",
      header: "Unidade orçamentária",
      align: "left",
      nowrap: true,
      value: (g) => textoUnidade(g.unidade),
      render: (g) =>
        podeEditar ? (
          <NaCelula gravando={gravandoLinha === g.chave}>
            <Selecao
              className={`${CELULA} ${g.unidade == null ? "text-muted" : ""}`}
              value={g.unidade == null ? TODAS : g.unidade}
              titulo="Unidade orçamentária"
              aria-label={`Unidade orçamentária do vínculo ${g.orgaoGestor}`}
              disabled={ocupado(g)}
              onChange={(e) => void mudarNaCelula(g, { unidade: e.target.value === TODAS ? null : e.target.value, acoes: [] }, "Unidade orçamentária do vínculo atualizada.")}
            >
              <option value={TODAS}>Todas</option>
              {unidadesDoGestor(g.orgaoGestor, g.unidade).map((u) => (
                <option key={u} value={u}>
                  {textoUnidade(u)}
                </option>
              ))}
            </Selecao>
          </NaCelula>
        ) : (
          <Inteiro texto={textoUnidade(g.unidade)} apagado={g.unidade == null} />
        ),
    },
    {
      key: "acoes",
      header: "Ações",
      align: "left",
      nowrap: true,
      value: (g) => (g.acoes ? g.acoes.map(rotuloAcaoCenti).join("; ") : "Todas"),
      valores: (g) => (g.acoes ? g.acoes.map(rotuloAcaoCenti) : ["Todas"]),
      render: (g) => (
        <span title={g.acoes ? g.acoes.map(rotuloAcaoCenti).join("\n") : "Todas as ações da unidade orçamentária"}>
          <Badge tone={g.acoes ? "violet" : "blue"}>{g.acoes ? `${g.acoes.length} ${g.acoes.length === 1 ? "ação" : "ações"}` : "Todas"}</Badge>
        </span>
      ),
    },
    {
      key: "destino",
      header: "Vai para (cadastro)",
      align: "left",
      nowrap: true,
      value: rotuloDestino,
      render: (g) =>
        podeEditar ? (
          <NaCelula gravando={gravandoLinha === g.chave}>
            <Selecao
              className={CELULA}
              value={destinoDe(g)}
              texto={rotuloDestino(g)}
              titulo="Vai para (cadastro)"
              aria-label={`Destino do vínculo ${g.orgaoGestor}`}
              disabled={ocupado(g)}
              onChange={(e) => void mudarNaCelula(g, { destino: e.target.value }, "Destino do vínculo atualizado.")}
            >
              {opcoesDestino}
            </Selecao>
          </NaCelula>
        ) : (
          <Inteiro texto={rotuloDestino(g)} />
        ),
    },
    {
      key: "registros",
      header: "Registros na Centi",
      nowrap: true,
      filter: "range",
      formatarFaixa: num,
      numero: (g) => cobertura.get(g.chave)?.registros ?? 0,
      render: (g) => <span className="tabular-nums">{num(cobertura.get(g.chave)?.registros ?? 0)}</span>,
    },
  ];
  const colunasFora: Column<ItemCatalogo>[] = [
    { key: "gestor", header: "Órgão gestor", align: "left", nowrap: true, value: (c) => c.orgaoGestor, render: (c) => <Inteiro texto={c.orgaoGestor} /> },
    { key: "unidade", header: "Unidade orçamentária", align: "left", nowrap: true, value: (c) => textoUnidade(c.unidade), render: (c) => <Inteiro texto={textoUnidade(c.unidade)} /> },
    { key: "acao", header: "Ação", align: "left", nowrap: true, value: (c) => rotuloAcaoCenti(c.acao), render: (c) => <Inteiro texto={rotuloAcaoCenti(c.acao)} /> },
    { key: "registros", header: "Registros", nowrap: true, filter: "range", formatarFaixa: num, numero: (c) => c.registros, render: (c) => <span className="tabular-nums">{num(c.registros)}</span> },
    { key: "ano", header: "Último ano", nowrap: true, total: false, value: (c) => String(c.ultimoAno ?? "—"), render: (c) => <span className="tabular-nums text-muted">{c.ultimoAno ?? "—"}</span> },
  ];

  return (
    <>
      <FerramentasAba>
        <Segmented<Vista>
          value={vista}
          onChange={setVista}
          ariaLabel="Vínculos do card"
          options={[
            { value: "vinculos", label: `Vínculos (${num(grupos.length)})`, curto: `Vínculos (${num(grupos.length)})`, dica: "O que o card importa e para onde vai" },
            { value: "sem", label: `Na Centi sem vínculo (${num(fora.length)})`, curto: `Sem vínculo (${num(fora.length)})`, dica: "O que a Centi traz e o card deixa de fora" },
          ]}
        />
        {podeBuscar && (
          <>
            {anos.length > 1 && (
              <SelectField compacto label="Ano" value={String(anoBusca)} onChange={(e) => setAnoBusca(Number(e.target.value))} disabled={buscando}>
                {anos.map((a) => (
                  <option key={a} value={a}>
                    {a}
                  </option>
                ))}
              </SelectField>
            )}
            <Button size="sm" variant="secondary" onClick={buscar} loading={buscando} disabled={!anos.length || !configurado} icon={<IconDownload className="h-4 w-4" />} title={configurado ? "Lê o ano na Centi e atualiza as escolhas (nada é gravado nos empenhos)" : "Confirme a Configuração do card antes de ler a Centi"} aria-label="Buscar na Centi">
              Buscar<span className="hidden sm:inline">&nbsp;na Centi</span>
            </Button>
          </>
        )}
        {podeEditar && (
          <Button size="sm" onClick={() => setAberto({ chave: null, inicial: { orgaoGestor: "", unidade: null, acoes: [], destino: "" } })} icon={<IconPlus className="h-4 w-4" />} aria-label="Novo vínculo">
            Novo<span className="hidden sm:inline">&nbsp;vínculo</span>
          </Button>
        )}
        <Ajuda titulo="Vínculos do card" botao="sm">
          <p>
            Cada vínculo diz o que o card importa — um <strong>órgão gestor</strong> da Centi, a <strong>unidade orçamentária</strong> (ou todas) e as{" "}
            <strong>ações</strong> (ou todas) — e para onde vai: o órgão inteiro ou uma unidade do cadastro.
          </p>
          <p>Só o que um vínculo cobre é gravado. O mais específico vale: uma ação vinculada vale mais que a unidade orçamentária, que vale mais que o órgão gestor inteiro.</p>
          <p>As escolhas vêm do catálogo da Centi. “Buscar na Centi” lê um ano e atualiza o catálogo — nenhum empenho é gravado. “Na Centi sem vínculo” mostra o que o card deixa de fora; toque numa linha para vinculá-la.</p>
          <p>Mudar ou excluir um vínculo vale na hora: os empenhos que ficam sem vínculo saem do banco e os demais mudam de lugar.</p>
        </Ajuda>
      </FerramentasAba>

      {agora && (
        <Progress value={((diasDoPeriodo({ inicio: anoInteiro(anoBusca).inicio, fim: agora.periodo.inicio }) - 1) / diasDoPeriodo(periodoDoAno(anoBusca))) * 100} label={`Buscando na Centi — ${rotuloPeriodo(agora.periodo)} · página ${agora.pagina}${agora.tentativa > 1 ? ` · tentativa ${agora.tentativa}` : ""}`} />
      )}
      {!catalogo.length && (
        <Callout kind="info">O catálogo da Centi está vazio — use “Buscar na Centi” para ler os órgãos gestores, as unidades orçamentárias e as ações que a Centi traz.</Callout>
      )}

      {vista === "vinculos" ? (
        <DataTable
          visao="vinculos"
          columns={colunasVinculos}
          rows={grupos}
          getKey={(g) => g.chave}
          density="compact"
          scrollInterno
          onRowClick={(g) => setAberto({ chave: g.chave, inicial: { orgaoGestor: g.orgaoGestor, unidade: g.unidade, acoes: g.acoes ?? [], destino: destinoDe(g) } })}
          activeKey={aberto?.chave ?? null}
          exportar={{ nome: "Vínculos do card" }}
          vazio={podeEditar ? "Nenhum vínculo — o card não importa nada ainda. Use “Novo vínculo” ou toque numa linha de “Na Centi sem vínculo”." : "Nenhum vínculo."}
          resumo={(l) => `${num(l.length)} ${l.length === 1 ? "vínculo" : "vínculos"}`}
        />
      ) : (
        <DataTable
          visao="sem"
          columns={colunasFora}
          rows={fora}
          getKey={(c) => `${c.orgaoGestor}\u0000${c.unidade}\u0000${c.acao}`}
          density="compact"
          scrollInterno
          onRowClick={podeEditar ? (c) => setAberto({ chave: null, inicial: { orgaoGestor: c.orgaoGestor, unidade: c.unidade, acoes: [], destino: "" } }) : undefined}
          exportar={{ nome: "Na Centi sem vínculo" }}
          vazio={catalogo.length ? "Tudo o que a Centi traz está vinculado neste card." : "O catálogo está vazio."}
          resumo={(l) => `${num(l.length)} sem vínculo · ${num(l.reduce((s, c) => s + c.registros, 0))} registros`}
        />
      )}

      {aberto && (
        <EditorVinculo
          key={aberto.chave ?? "novo"}
          aberto={aberto}
          catalogo={catalogo}
          cadastro={cadastro}
          podeEditar={podeEditar}
          gravando={gravando}
          motivo={(r) => motivoVinculosInvalidos(comGrupo(aberto.chave, r), regra)}
          onFechar={() => setAberto(null)}
          onSalvar={async (r) => {
            if (await gravar(comGrupo(aberto.chave, r), aberto.chave ? "Vínculo atualizado." : "Vínculo criado.")) setAberto(null);
          }}
          onExcluir={aberto.chave ? () => void excluir(aberto.chave as string) : undefined}
        />
      )}
      {confirmacao}
    </>
  );
}

/** O EDITOR de um vínculo (num `Modal`): o órgão gestor, a unidade orçamentária, as ações e o destino no cadastro. */
function EditorVinculo({
  aberto,
  catalogo,
  cadastro,
  podeEditar,
  gravando,
  motivo,
  onFechar,
  onSalvar,
  onExcluir,
}: {
  aberto: Aberto;
  catalogo: ItemCatalogo[];
  cadastro: Cadastro;
  podeEditar: boolean;
  gravando: boolean;
  motivo: (r: Rascunho) => string | null;
  onFechar: () => void;
  onSalvar: (r: Rascunho) => void;
  onExcluir?: () => void;
}) {
  const [r, setR] = useState<Rascunho>(aberto.inicial);
  const gestores = useMemo(() => {
    const s = new Set(catalogo.map((c) => c.orgaoGestor));
    if (r.orgaoGestor) s.add(r.orgaoGestor);
    return [...s].sort((a, b) => a.localeCompare(b, "pt-BR", { numeric: true }));
  }, [catalogo, r.orgaoGestor]);
  const unidades = useMemo(() => {
    const s = new Set(catalogo.filter((c) => c.orgaoGestor === r.orgaoGestor).map((c) => c.unidade));
    if (r.unidade != null) s.add(r.unidade);
    return [...s].sort((a, b) => a.localeCompare(b, "pt-BR", { numeric: true }));
  }, [catalogo, r.orgaoGestor, r.unidade]);
  const acoes = useMemo(() => {
    if (r.unidade == null) return [];
    const m = new Map<string, number>();
    for (const c of catalogo) if (c.orgaoGestor === r.orgaoGestor && c.unidade === r.unidade) m.set(c.acao, c.registros);
    for (const a of r.acoes) if (!m.has(a)) m.set(a, 0);
    return [...m].sort((a, b) => a[0].localeCompare(b[0], "pt-BR", { numeric: true })).map(([valor, contagem]) => ({ valor, rotulo: rotuloAcaoCenti(valor), contagem }));
  }, [catalogo, r.orgaoGestor, r.unidade, r.acoes]);
  const unidadesPorOrgao = useMemo(() => {
    const m = new Map<number, UnidadeVinculo[]>();
    for (const u of cadastro.unidades) if (u.orgaoId != null) m.set(u.orgaoId, [...(m.get(u.orgaoId) ?? []), u]);
    return m;
  }, [cadastro.unidades]);
  const erro = r.orgaoGestor && r.destino ? motivo(r) : null;
  const completo = !!r.orgaoGestor && !!r.destino;
  const alterado = JSON.stringify(r) !== JSON.stringify(aberto.inicial);

  return (
    <Modal
      open
      onClose={onFechar}
      bloqueado={gravando}
      size="lg"
      titulo={aberto.chave ? "Vínculo" : "Novo vínculo"}
      rodape={
        podeEditar ? (
          <div className="flex w-full flex-wrap items-center justify-end gap-2">
            {erro && <span className="mr-auto min-w-0 text-[12.5px] text-[color:var(--danger)]">{erro}</span>}
            {onExcluir && (
              <Button size="sm" variant="icon" aria-label="Excluir o vínculo" title="Excluir o vínculo" onClick={onExcluir} disabled={gravando} icon={<IconTrash className="h-4 w-4" style={{ color: "var(--danger)" }} />} />
            )}
            <Button size="sm" variant="secondary" onClick={onFechar} disabled={gravando}>
              Cancelar
            </Button>
            <Button size="sm" onClick={() => onSalvar(r)} loading={gravando} disabled={!completo || !!erro || (!!aberto.chave && !alterado)}>
              Salvar
            </Button>
          </div>
        ) : undefined
      }
    >
      <div className="space-y-3">
        <SelectField
          denso
          label="Órgão gestor (Centi)"
          value={r.orgaoGestor}
          disabled={!podeEditar}
          onChange={(e) => setR({ ...r, orgaoGestor: e.target.value, unidade: null, acoes: [] })}
          rotuloExtra={
            <Ajuda titulo="Órgão gestor" compacta>
              O órgão gestor como a Centi o traz. Sem escolher a unidade orçamentária, o vínculo cobre o órgão gestor inteiro.
            </Ajuda>
          }
        >
          <option value="">Escolha…</option>
          {gestores.map((g) => (
            <option key={g} value={g}>
              {g}
            </option>
          ))}
        </SelectField>
        <SelectField
          denso
          label="Unidade orçamentária"
          value={r.unidade == null ? TODAS : r.unidade}
          disabled={!podeEditar || !r.orgaoGestor}
          onChange={(e) => setR({ ...r, unidade: e.target.value === TODAS ? null : e.target.value, acoes: [] })}
          rotuloExtra={
            <Ajuda titulo="Unidade orçamentária" compacta>
              “Todas” = o órgão gestor inteiro. Escolhida uma, o vínculo cobre só ela (e pode ser dividido por ações).
            </Ajuda>
          }
        >
          <option value={TODAS}>Todas</option>
          {unidades.map((u) => (
            <option key={u} value={u}>
              {u || "(sem unidade orçamentária)"}
            </option>
          ))}
        </SelectField>
        <SeletorMultiplo
          rotulo="Ações"
          opcoes={acoes}
          selecionados={r.acoes}
          onChange={(l) => setR({ ...r, acoes: l })}
          disabled={!podeEditar || r.unidade == null}
          textoVazio="Todas"
          campo={{
            denso: true,
            extra: (
              <Ajuda titulo="Ações" compacta>
                Nenhuma marcada = todas as ações da unidade orçamentária. Marcadas = só elas (as outras podem ir a outro vínculo). As ações só
                aparecem depois de escolher a unidade orçamentária.
              </Ajuda>
            ),
          }}
        />
        <SelectField
          denso
          label="Vai para (cadastro)"
          value={r.destino}
          disabled={!podeEditar}
          onChange={(e) => setR({ ...r, destino: e.target.value })}
          rotuloExtra={
            <Ajuda titulo="Destino" compacta>
              O órgão inteiro ou uma unidade dele no cadastro de Órgãos e Unidades. Os empenhos ficam visíveis para quem acessa essa unidade (o
              vinculado ao órgão, para as unidades do órgão).
            </Ajuda>
          }
        >
          <option value="">Escolha…</option>
          {cadastro.orgaos.map((o) => (
            <optgroup key={o.id} label={`${o.sigla} — ${o.nome}`}>
              <option value={`o:${o.id}`}>{`${o.sigla} — o órgão inteiro`}</option>
              {(unidadesPorOrgao.get(o.id) ?? []).map((u) => (
                <option key={u.id} value={`u:${u.id}`}>
                  {`${u.codigo} — ${u.nome}`}
                </option>
              ))}
            </optgroup>
          ))}
        </SelectField>
      </div>
    </Modal>
  );
}
