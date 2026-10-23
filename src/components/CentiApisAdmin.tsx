"use client";

import { type ReactNode, useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  type ApiCenti,
  DIVISOES,
  type DivisaoApi,
  type EdicaoApi,
  edicaoDaApi,
  estadoApi,
  FREQUENCIAS,
  importavel,
  motivoApiInvalida,
  OPCOES_ANOS,
  type OrgaoDoCadastro,
  orgaosSemCodigo,
  previaPedido,
  type ResultadoTeste,
  rotuloFrequencia,
  type UnidadeDoCadastro,
} from "@/lib/centi-apis-core";
import {
  anoInteiro,
  anosDaApi,
  diaBR,
  diasDoPeriodo,
  LEITOR_EMPENHOS,
  type LoteCenti,
  type PassoLote,
  type Periodo,
  periodoEmCurso,
  periodosAPedir,
  periodosLidos,
  ROTULO_ESTADO_LOTE,
  ROTULO_ESTADO_PASSO,
  rotuloPeriodo,
  type TipoErro,
  usaPeriodo,
} from "@/lib/empenhos-core";
import { brl, dataHoraBR, dataIsoBrasilia, formatBytes } from "@/lib/format";
import { Ajuda } from "./Ajuda";
import { Badge } from "./Badge";
import { BotaoCopiar } from "./BotaoCopiar";
import { Button } from "./Button";
import { Callout } from "./Callout";
import { useConfirmacao } from "./Confirmacao";
import { type Column, DataTable } from "./DataTable";
import { ErroCarga } from "./ErroCarga";
import { CampoLista, SelectField, TextArea, TextField } from "./Field";
import { CelulaTexto } from "./CelulaLista";
import { IconChevronDown, IconDownload, IconPlay, IconTrash } from "./icons";
import { Modal } from "./Modal";
import { Progress } from "./Progress";
import { SecaoBanner, ValorCampo } from "./SecaoBanner";
import { SeletorMultiplo } from "./SeletorMultiplo";
import { SkeletonLinhas } from "./Skeleton";
import { StatMini } from "./StatMini";
import { Switch } from "./Switch";
import { UnidadesCenti } from "./UnidadesCenti";
import { toast } from "./Toast";

/**
 * Integrações → "APIs da Centi": o CADASTRO das APIs públicas do portal de transparência (empenhos, liquidações,
 * pagamentos, contratos, receita). Tocar numa linha abre o editor (edição direta, com o "(?)" em cada campo): o que ler
 * (os órgãos e as unidades DO CADASTRO), quando atualizar, o endereço e os parâmetros (avançado) e o TESTE — um pedido
 * de verdade com a edição em curso, sem salvar nada. Ligar só vale com a importação pronta (`motivoApiInvalida`, a mesma
 * régua do servidor).
 */

type Dados = { apis: ApiCenti[]; orgaos: OrgaoDoCadastro[]; unidades: UnidadeDoCadastro[] };

const anoAtual = () => Number(dataIsoBrasilia(new Date().toISOString()).slice(0, 4));

/** O "(?)" de um campo. */
function A({ titulo, children }: { titulo: string; children: ReactNode }) {
  return (
    <Ajuda titulo={titulo} compacta>
      {children}
    </Ajuda>
  );
}

const rotuloDivisao = (a: ApiCenti) => `${DIVISOES.find((d) => d.valor === a.divisao)?.rotulo ?? a.divisao}${a.paginado ? " · paginada" : ""}`;

const COLUNAS: Column<ApiCenti>[] = [
  {
    key: "nome",
    header: "API",
    align: "left",
    minWidth: 180,
    value: (a) => a.nome,
    render: (a) => (
      <span className="flex min-w-0 flex-col">
        <span className="font-semibold text-text">{a.nome}</span>
        <span className="truncate font-mono text-[11.5px] text-faint">{a.endpoint}</span>
      </span>
    ),
  },
  {
    key: "estado",
    header: "Estado",
    nowrap: true,
    value: (a) => estadoApi(a).rotulo,
    render: (a) => {
      const e = estadoApi(a);
      return (
        <Badge tone={e.tom} dot>
          {e.rotulo}
        </Badge>
      );
    },
  },
  { key: "divisao", header: "Leitura", nowrap: true, value: rotuloDivisao, render: (a) => <span className="text-text-2">{rotuloDivisao(a)}</span> },
  {
    key: "frequencia",
    header: "Atualização",
    nowrap: true,
    value: (a) => rotuloFrequencia(a.frequenciaMin, a.diasUteis, a.horaInicio, a.horaFim),
    render: (a) => <span className="text-muted">{rotuloFrequencia(a.frequenciaMin, a.diasUteis, a.horaInicio, a.horaFim)}</span>,
  },
  {
    key: "ultima",
    header: "Última leitura",
    nowrap: true,
    value: (a) => dataHoraBR(a.ultimaExecucao),
    render: (a) => <span className="tabular-nums text-faint">{dataHoraBR(a.ultimaExecucao)}</span>,
  },
];

export function CentiApisAdmin() {
  const [dados, setDados] = useState<Dados | null>(null);
  const [erroCarga, setErroCarga] = useState<string | null>(null);
  const [aberta, setAberta] = useState<ApiCenti | null>(null);

  const carregar = useCallback(async () => {
    setErroCarga(null);
    try {
      const r = await fetch("/api/admin/centi-apis");
      const j = (await r.json()) as { ok?: boolean; error?: string } & Partial<Dados>;
      if (!r.ok || !j.ok) throw new Error(j.error ?? "Erro ao carregar as APIs.");
      setDados({ apis: j.apis ?? [], orgaos: j.orgaos ?? [], unidades: j.unidades ?? [] });
    } catch (e) {
      setErroCarga(e instanceof Error ? e.message : "Erro ao carregar as APIs.");
    }
  }, []);
  useEffect(() => {
    void carregar();
  }, [carregar]);

  return (
    <>
      {erroCarga && <ErroCarga kind={dados ? "warn" : "danger"} msg={erroCarga} onTentar={carregar} />}
      {dados === null ? (
        !erroCarga && (
          <div className="rounded-card border border-border p-[var(--pad-card)]">
            <SkeletonLinhas linhas={5} />
          </div>
        )
      ) : (
        <DataTable
          columns={COLUNAS}
          rows={dados.apis}
          getKey={(a) => a.id}
          density="compact"
          onRowClick={setAberta}
          activeKey={aberta?.id}
          minWidth={720}
          exportar={{ nome: "APIs da Centi" }}
          acoesRodape={
            <Ajuda titulo="APIs da Centi" botao="sm">
              <p>
                O cadastro das APIs <strong>públicas</strong> do portal de transparência da Centi — a execução da despesa
                (empenhos, liquidações e pagamentos), os contratos e a receita. Toque numa linha para editar e testar.
              </p>
              <p>
                Por enquanto nada é importado: cada API fica “Em preparação” até a importação dela chegar — começando pelos
                empenhos. O botão <strong>Testar</strong> faz um pedido de verdade e mostra o que a Centi devolve, sem gravar
                nada.
              </p>
            </Ajuda>
          }
          resumo={(l) => `${l.length} API${l.length === 1 ? "" : "s"}`}
        />
      )}
      {aberta && dados && (
        <EditorApi
          key={aberta.id}
          api={aberta}
          orgaos={dados.orgaos}
          unidades={dados.unidades}
          onFechar={() => setAberta(null)}
          onSalva={(a) => {
            setDados((d) => (d ? { ...d, apis: d.apis.map((x) => (x.id === a.id ? a : x)) } : d));
            setAberta(a);
          }}
        />
      )}
    </>
  );
}

function EditorApi({
  api,
  orgaos,
  unidades,
  onFechar,
  onSalva,
}: {
  api: ApiCenti;
  orgaos: OrgaoDoCadastro[];
  unidades: UnidadeDoCadastro[];
  onFechar: () => void;
  onSalva: (a: ApiCenti) => void;
}) {
  const [v, setV] = useState<EdicaoApi>(() => edicaoDaApi(api));
  const [salvando, setSalvando] = useState(false);
  const [avancado, setAvancado] = useState(false);
  const [ano, setAno] = useState(anoAtual);
  const [pedido, setPedido] = useState(0);
  const [testando, setTestando] = useState(false);
  const [teste, setTeste] = useState<ResultadoTeste | null>(null);
  const [importando, setImportando] = useState(false);
  /** Muda quando uma leitura termina — a tabela das unidades da Centi recarrega. */
  const [lido, setLido] = useState(0);
  const { confirmar, confirmacao } = useConfirmacao();
  const muda = <K extends keyof EdicaoApi>(k: K, valor: EdicaoApi[K]) => {
    setV((x) => ({ ...x, [k]: valor }));
    setTeste(null);
  };

  const motivo = motivoApiInvalida(v, api.implementada, orgaos);
  const alterado = JSON.stringify(v) !== JSON.stringify(edicaoDaApi(api));
  const previa = useMemo(() => previaPedido(v, ano, orgaos, pedido), [v, ano, orgaos, pedido]);
  const pedidos = previa.pedidos;
  const semCodigo = orgaosSemCodigo(v.orgaos, orgaos);
  const porCodigo = useMemo(() => new Map(orgaos.map((o) => [o.codigoCenti, o])), [orgaos]);
  const nomeOrgao = useMemo(() => new Map(orgaos.map((o) => [o.id, `${o.sigla} — ${o.nome}`])), [orgaos]);
  const pedidoAtual = Math.min(pedido, Math.max(0, pedidos.length - 1));

  async function fechar() {
    if (salvando) return;
    if (alterado && !(await confirmar({ titulo: "Descartar as alterações?", texto: "Os dados alterados não foram salvos.", confirmar: "Descartar", perigo: true }))) return;
    onFechar();
  }

  async function salvar() {
    if (motivo) {
      toast.error(motivo);
      return;
    }
    setSalvando(true);
    try {
      const r = await fetch(`/api/admin/centi-apis/${api.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(v),
      });
      const j = (await r.json().catch(() => ({}))) as { ok?: boolean; error?: string; api?: ApiCenti };
      if (!r.ok || !j.ok || !j.api) throw new Error(j.error ?? "Erro ao salvar a API.");
      toast.success(`API "${j.api.nome}" salva.`);
      onSalva(j.api);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro ao salvar a API.");
    } finally {
      setSalvando(false);
    }
  }

  async function testar() {
    setTestando(true);
    setTeste(null);
    try {
      const r = await fetch("/api/admin/centi-apis/testar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ edicao: { ...v, ativa: false }, ano, pedido: pedidoAtual }),
      });
      const j = (await r.json().catch(() => ({}))) as { ok?: boolean; error?: string; resultado?: ResultadoTeste };
      if (!r.ok || !j.ok || !j.resultado) throw new Error(j.error ?? "Não foi possível testar.");
      setTeste(j.resultado);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Não foi possível testar.");
    } finally {
      setTestando(false);
    }
  }

  const opcoesOrgaos = orgaos.map((o) => ({
    valor: String(o.id),
    rotulo: o.sigla,
    detalhe: `${o.nome} · ${o.codigoCenti != null ? `ID na Centi ${o.codigoCenti}` : "sem o ID da Centi — não entra nos pedidos"}`,
  }));
  const opcoesUnidades = unidades
    .filter((u) => !v.orgaos.length || (u.orgaoId != null && v.orgaos.includes(u.orgaoId)))
    .map((u) => ({ valor: String(u.id), rotulo: u.codigo, detalhe: u.nome, grupo: (u.orgaoId != null && nomeOrgao.get(u.orgaoId)) || "Sem órgão" }));
  const comPeriodoTeste = usaPeriodo(v.parametros);
  const rotuloPedido = (p: Record<string, number>) =>
    p.orgao != null ? `${porCodigo.get(p.orgao)?.sigla ?? "Órgão"} (ID ${p.orgao})` : p.fonte != null ? `Fonte ${p.fonte}` : comPeriodoTeste ? "1ª semana do ano (01/01 a 07/01)" : "O ano inteiro";
  const colunasAmostra: Column<Record<string, string>>[] = (teste?.campos ?? []).slice(0, 12).map((c) => ({
    key: c,
    header: c,
    nowrap: true,
    value: (r) => r[c] ?? "",
    render: (r) => <span className="text-[12.5px]">{r[c] || "—"}</span>,
  }));

  return (
    <Modal
      open
      onClose={() => void fechar()}
      bloqueado={salvando || importando}
      size="xl"
      titulo={`API da Centi — ${api.nome}`}
      acoesCabecalho={
        <Badge tone={estadoApi(api).tom} dot>
          {estadoApi(api).rotulo}
        </Badge>
      }
      rodape={
        <div className="flex w-full flex-wrap items-center justify-end gap-2">
          {motivo && <span className="mr-auto min-w-0 text-[12.5px] text-[color:var(--danger)]">{motivo}</span>}
          <Button size="sm" variant="secondary" onClick={() => void fechar()} disabled={salvando}>
            Cancelar
          </Button>
          <Button size="sm" onClick={salvar} loading={salvando} disabled={!alterado || !!motivo}>
            Salvar
          </Button>
        </div>
      }
    >
      <div className="space-y-[var(--gap-block)]">

        <SecaoBanner titulo="O que ler">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <TextField
              denso
              label="Nome"
              value={v.nome}
              onChange={(e) => muda("nome", e.target.value)}
              maxLength={60}
              rotuloExtra={<A titulo="Nome">Como a API aparece nas telas do sistema.</A>}
            />
            <SelectField
              denso
              label="Como o ano é pedido"
              value={v.divisao}
              onChange={(e) => muda("divisao", e.target.value as DivisaoApi)}
              rotuloExtra={
                <A titulo="Como o ano é pedido">
                  <p>
                    <strong>Ano inteiro</strong>: um pedido só para o ano (ex.: empenhos).
                  </p>
                  <p>
                    <strong>Um pedido por órgão</strong>: um para cada órgão escolhido abaixo, pelo ID dele na Centi (ex.:
                    liquidações e pagamentos).
                  </p>
                  <p>
                    <strong>Um pedido por fonte</strong>: um para cada fonte de recurso (ex.: contratos).
                  </p>
                </A>
              }
            >
              {DIVISOES.map((d) => (
                <option key={d.valor} value={d.valor}>
                  {d.rotulo}
                </option>
              ))}
            </SelectField>
          </div>
          <TextArea
            label="Descrição"
            rows={2}
            value={v.descricao}
            onChange={(e) => muda("descricao", e.target.value)}
            maxLength={400}
            rotuloExtra={<A titulo="Descrição">O que esta API traz — aparece para quem consultar o cadastro.</A>}
          />
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <SeletorMultiplo
              rotulo="Órgãos"
              opcoes={opcoesOrgaos}
              selecionados={v.orgaos.map(String)}
              onChange={(l) => {
                const ids = l.map(Number);
                setV((x) => ({ ...x, orgaos: ids, unidades: ids.length ? x.unidades.filter((u) => ids.includes(unidades.find((y) => y.id === u)?.orgaoId ?? -1)) : x.unidades }));
                setTeste(null);
              }}
              textoVazio="Todos"
              campo={{
                denso: true,
                extra: (
                  <A titulo="Órgãos">
                    <p>Os órgãos do cadastro do sistema (Órgãos e Unidades). Nenhum escolhido = todos.</p>
                    <p>
                      Nas APIs pedidas por órgão, cada órgão vira um pedido com o <strong>ID da entidade na Centi</strong> cadastrado
                      nele — o órgão sem esse ID não entra. Nas demais, a API sempre traz tudo; a escolha vai filtrar as telas da
                      execução (próximos passos).
                    </p>
                  </A>
                ),
              }}
            />
            <SeletorMultiplo
              rotulo="Unidades"
              opcoes={opcoesUnidades}
              selecionados={v.unidades.map(String)}
              onChange={(l) => muda("unidades", l.map(Number))}
              textoVazio="Todas"
              campo={{
                denso: true,
                extra: (
                  <A titulo="Unidades">
                    As unidades do cadastro (dos órgãos escolhidos). Nenhuma escolhida = todas. A API sempre traz o órgão inteiro; a
                    escolha vai filtrar as telas da execução (próximos passos).
                  </A>
                ),
              }}
            />
          </div>
          {semCodigo.length > 0 && (
            <Callout kind="warn">
              Sem o ID da entidade na Centi (não entram nos pedidos): {semCodigo.map((o) => o.sigla).join(", ")}. Cadastre o ID em
              Órgãos e Unidades.
            </Callout>
          )}
          {v.divisao === "fonte" && (
            <CampoLista
              label={`Fontes — ${v.lista.length}`}
              valores={v.lista.map(String)}
              onChange={(l) => muda("lista", [...new Set(l.map((x) => Number(x.trim())).filter((n) => Number.isInteger(n) && n > 0))])}
              placeholder="Número da fonte e Enter (vários separados por ;)"
              rotuloExtra={<A titulo="Fontes">Os códigos das fontes de recurso — um pedido por fonte.</A>}
            />
          )}
          <div className="flex items-center gap-1">
            <Switch checked={v.paginado} onChange={(x) => muda("paginado", x)} label="A API devolve páginas" />
            <A titulo="Páginas">Ligado: a API devolve os registros em páginas e o sistema pede a próxima até acabar.</A>
          </div>
        </SecaoBanner>

        <SecaoBanner titulo="Quando atualizar">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <SelectField
              denso
              label="Frequência"
              value={String(v.frequenciaMin)}
              onChange={(e) => muda("frequenciaMin", Number(e.target.value))}
              rotuloExtra={<A titulo="Frequência">De quanto em quanto tempo a API é lida, dentro do horário.</A>}
            >
              {FREQUENCIAS.map((f) => (
                <option key={f.valor} value={f.valor}>
                  {f.rotulo}
                </option>
              ))}
            </SelectField>
            <TextField
              denso
              label="Das"
              type="time"
              value={v.horaInicio}
              onChange={(e) => muda("horaInicio", e.target.value)}
              rotuloExtra={<A titulo="Horário">A leitura só acontece entre esses horários (Brasília).</A>}
            />
            <TextField
              denso
              label="Até"
              type="time"
              value={v.horaFim}
              onChange={(e) => muda("horaFim", e.target.value)}
              rotuloExtra={<A titulo="Horário">A leitura só acontece entre esses horários (Brasília).</A>}
            />
            <SelectField
              denso
              label="Anos mantidos"
              value={String(v.anos)}
              onChange={(e) => muda("anos", Number(e.target.value))}
              rotuloExtra={<A titulo="Anos mantidos">Quais anos são lidos e mantidos atualizados.</A>}
            >
              {OPCOES_ANOS.map((o) => (
                <option key={o.valor} value={o.valor}>
                  {o.rotulo}
                </option>
              ))}
            </SelectField>
          </div>
          <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
            <div className="flex items-center gap-1">
              <Switch checked={v.diasUteis} onChange={(x) => muda("diasUteis", x)} label="Só em dias úteis" />
              <A titulo="Dias úteis">Ligado: não lê aos sábados, domingos e feriados.</A>
            </div>
            <div className="flex items-center gap-1">
              <Switch
                checked={v.ativa}
                onChange={(x) => muda("ativa", x)}
                disabled={!api.implementada}
                label="Ligada"
                dica={api.implementada ? "Liga a atualização automática desta API (desligada por padrão)." : "Disponível quando a importação desta API existir."}
              />
              <A titulo="Ligada">
                Liga a atualização automática: no horário e na frequência acima, o sistema importa sozinho os anos mantidos (um por vez, em
                rodízio), poucas páginas a cada 5 minutos, com a MESMA conferência da importação manual. Uma queda suspeita nunca passa
                sozinha — a importação fecha como parcial e você confirma numa importação manual. Só fica disponível quando a importação
                desta API existir.
              </A>
            </div>
          </div>
        </SecaoBanner>

        <SecaoBanner
          titulo="Endereço e parâmetros"
          acao={
            <Button
              size="sm"
              variant="ghost"
              aria-expanded={avancado}
              onClick={() => setAvancado((a) => !a)}
              icon={<IconChevronDown className={`h-4 w-4 transition-transform ${avancado ? "rotate-180" : ""}`} />}
            >
              {avancado ? "Ocultar" : "Mostrar"}
            </Button>
          }
        >
          {avancado ? (
            <>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-[2fr_1.4fr_0.6fr_1fr]">
                <TextField
                  denso
                  label="URL base"
                  value={v.urlBase}
                  onChange={(e) => muda("urlBase", e.target.value)}
                  autoComplete="off"
                  rotuloExtra={<A titulo="URL base">O endereço do portal da Centi. Só HTTPS do domínio centi.com.br.</A>}
                />
                <TextField
                  denso
                  label="Endpoint"
                  value={v.endpoint}
                  onChange={(e) => muda("endpoint", e.target.value)}
                  autoComplete="off"
                  rotuloExtra={<A titulo="Endpoint">O nome da API no portal (ex.: getempenhos).</A>}
                />
                <TextField
                  denso
                  label="UF"
                  value={v.uf}
                  onChange={(e) => muda("uf", e.target.value)}
                  maxLength={4}
                  autoComplete="off"
                  rotuloExtra={<A titulo="UF">A sigla do estado no endereço (go).</A>}
                />
                <TextField
                  denso
                  label="Município"
                  value={v.tenant}
                  onChange={(e) => muda("tenant", e.target.value)}
                  autoComplete="off"
                  rotuloExtra={<A titulo="Município">O município no endereço (rioverde).</A>}
                />
              </div>
              <TextArea
                label="Parâmetros do pedido (JSON)"
                rows={3}
                mono
                value={v.parametros}
                onChange={(e) => muda("parametros", e.target.value)}
                rotuloExtra={
                  <A titulo="Parâmetros">
                    <p>O que vai no corpo do pedido, em JSON. Os marcadores são trocados a cada pedido:</p>
                    <p>
                      <code>{"{ano}"}</code> o ano · <code>{"{inicio}"}</code> e <code>{"{fim}"}</code> o período (dd/mm/aaaa) ·{" "}
                      <code>{"{orgao}"}</code> o ID do órgão na Centi · <code>{"{fonte}"}</code> a fonte · <code>{"{pagina}"}</code> a página.
                    </p>
                    <p>Com o período, a importação lê o ano semana a semana — e divide o período que vier grande demais.</p>
                    <p>A página é acrescentada sozinha nas APIs que devolvem páginas.</p>
                  </A>
                }
              />
            </>
          ) : (
            <p className="break-all font-mono text-[12px] text-muted">POST {previa.url}</p>
          )}
        </SecaoBanner>

        <SecaoBanner
          titulo="Testar"
          acao={
            <span className="flex items-center gap-1">
              <Button size="sm" variant="secondary" onClick={testar} loading={testando} disabled={!!previa.erro} icon={<IconPlay className="h-4 w-4" />}>
                Testar agora
              </Button>
              <A titulo="Testar">
                Faz <strong>um</strong> pedido de verdade à Centi com o que está na tela (mesmo sem salvar) e mostra o que voltou:
                quantos registros, o total que a API informa, os campos e uma amostra. Nada é gravado.
              </A>
            </span>
          }
        >
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-[minmax(0,10rem)_minmax(0,1fr)]">
            <SelectField
              denso
              label="Ano"
              value={String(ano)}
              onChange={(e) => {
                setAno(Number(e.target.value));
                setTeste(null);
              }}
            >
              {[anoAtual(), anoAtual() - 1, anoAtual() - 2].map((y) => (
                <option key={y} value={y}>
                  {y}
                </option>
              ))}
            </SelectField>
            <SelectField
              denso
              label="Pedido"
              value={String(pedidoAtual)}
              onChange={(e) => {
                setPedido(Number(e.target.value));
                setTeste(null);
              }}
              disabled={pedidos.length <= 1}
            >
              {pedidos.map((p, i) => (
                <option key={rotuloPedido(p)} value={i}>
                  {rotuloPedido(p)}
                </option>
              ))}
            </SelectField>
          </div>
          {previa.erro ? (
            <p className="text-[12.5px] text-[color:var(--danger)]">{previa.erro}</p>
          ) : (
            <pre className="whitespace-pre-wrap break-all rounded-control bg-surface-2 p-3 font-mono text-[12px] text-muted">
              {`POST ${previa.url}\n${JSON.stringify(previa.corpo, null, 2)}`}
            </pre>
          )}
          {teste && (
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-[var(--gap-block)] sm:grid-cols-4">
                <StatMini label="Resposta" value={teste.status || "Sem resposta"} tone={teste.ok ? "ok" : "danger"} />
                <StatMini label="Tempo" value={`${(teste.ms / 1000).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} s`} />
                <StatMini label="Registros" value={teste.itens.toLocaleString("pt-BR")} />
                <StatMini label="Total na API" value={teste.total != null ? teste.total.toLocaleString("pt-BR") : "—"} />
              </div>
              {teste.mensagem && <Callout kind={teste.ok ? "warn" : "danger"}>{teste.mensagem}</Callout>}
              {teste.amostra.length > 0 && (
                <DataTable
                  columns={colunasAmostra}
                  rows={teste.amostra.map((r, i) => ({ ...r, "#": String(i + 1) }))}
                  getKey={(r) => r["#"]}
                  density="compact"
                  exportar={{ nome: `Teste ${v.nome}` }}
                  resumo={() => `Amostra: ${teste.amostra.length} de ${teste.itens} · ${teste.campos.length} campos${teste.campos.length > 12 ? " (12 à vista)" : ""}`}
                />
              )}
            </div>
          )}
        </SecaoBanner>
        {importavel(api.chave) && <ImportacaoManual api={api} alterado={alterado} onOcupado={setImportando} onLido={() => setLido((n) => n + 1)} />}
        {importavel(api.chave) && <UnidadesCenti orgaos={orgaos} unidades={unidades} versao={lido} />}
      </div>
      {confirmacao}
    </Modal>
  );
}

type RespostaPasso = {
  lote: LoteCenti;
  passo: PassoLote;
  continuar?: boolean;
  erro?: { tipo: TipoErro; mensagem: string };
  dividir?: [Periodo, Periodo] | null;
};

/** Chama a rota da importação manual; devolve o JSON ou lança com a mensagem do servidor. */
/** O SISTEMA respondeu e recusou (4xx) — não adianta repetir (ex.: outra aba conduz o lote). */
class RecusaImportacao extends Error {}

async function pedirImportacao<T>(apiId: number, corpo: Record<string, unknown>): Promise<T> {
  const r = await fetch(`/api/admin/centi-apis/${apiId}/importar`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(corpo),
  });
  const j = (await r.json().catch(() => ({}))) as { ok?: boolean; error?: string } & T;
  if (r.status >= 400 && r.status < 500) throw new RecusaImportacao(j.error ?? `Recusado (${r.status}).`);
  if (!r.ok || !j.ok) throw new Error(j.error ?? `Falha (${r.status}).`);
  return j;
}

/** EXCLUI DO BANCO, vários de uma vez: importações inteiras (`{lotes}`) ou passos de uma importação (`{lote, passos}`). */
async function excluirTentativas(apiId: number, corpo: { lotes: number[] } | { lote: number; passos: number[] }): Promise<number> {
  const r = await fetch(`/api/admin/centi-apis/${apiId}/importar`, { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify(corpo) });
  const j = (await r.json().catch(() => ({}))) as { ok?: boolean; error?: string; excluidos?: number };
  if (!r.ok || !j.ok) throw new Error(j.error ?? `Falha (${r.status}).`);
  return j.excluidos ?? 0;
}

async function lerPassos(apiId: number, loteId: number): Promise<PassoLote[]> {
  const r = await fetch(`/api/admin/centi-apis/${apiId}/importar?lote=${loteId}`);
  const j = (await r.json().catch(() => ({}))) as { ok?: boolean; error?: string; passos?: PassoLote[] };
  if (!r.ok || !j.ok) throw new Error(j.error ?? `Falha (${r.status}).`);
  return j.passos ?? [];
}

const ESPERA_TENTATIVAS = [2000, 4000, 8000];
const esperar = (ms: number) => new Promise((ok) => setTimeout(ok, ms));
const num = (n: number | null | undefined) => (n == null ? "—" : n.toLocaleString("pt-BR"));
/** Os empenhos que a importação concluída trouxe IGUAIS (não regravados). */
const semMudanca = (l: LoteCenti) => Math.max(0, l.unicos - (l.fora ?? 0) - (l.inseridos ?? 0) - (l.atualizados ?? 0));
const tempo = (ms: number | null) => (ms == null ? "—" : `${(ms / 1000).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} s`);

/** Quanto do ano já foi lido (pelos períodos concluídos) — o andamento real, mesmo com meses divididos. */
function fracaoDoAno(ano: number, passos: PassoLote[]): number {
  const dias = periodosLidos(passos).reduce((s, p) => s + diasDoPeriodo(p), 0);
  return Math.min(1, dias / diasDoPeriodo(anoInteiro(ano)));
}

/** O que acontece agora (a linha acima da barra). */
type Agora = { periodo: Periodo; pagina: number; tentativa: number; espera?: number };

/**
 * A IMPORTAÇÃO MANUAL (passo 3): lê o ano SEMANA A SEMANA (o período grande demais é dividido ao meio), página a página, com o
 * cadastro SALVO; cada pedido vira um PASSO à vista na hora — lido ou com o erro em detalhe — e os empenhos só são
 * gravados quando todo o ano foi lido e a contagem confere com o total que a Centi informa. Interromper, fechar a
 * página ou uma falha deixam a tabela final como estava.
 */
function ImportacaoManual({ api, alterado, onOcupado, onLido }: { api: ApiCenti; alterado: boolean; onOcupado: (b: boolean) => void; onLido: () => void }) {
  const anos = anosDaApi(anoAtual(), api.anos);
  const [ano, setAno] = useState(anos[0]);
  const [lotes, setLotes] = useState<LoteCenti[] | null>(null);
  const [emAndamento, setEmAndamento] = useState<LoteCenti | null>(null);
  const [atual, setAtual] = useState<LoteCenti | null>(null);
  const [passos, setPassos] = useState<PassoLote[]>([]);
  const [agora, setAgora] = useState<Agora | null>(null);
  const [rodando, setRodando] = useState(false);
  const [historico, setHistorico] = useState<LoteCenti | null>(null);
  const [selLotes, setSelLotes] = useState<Set<number>>(new Set());
  const [desatualizados, setDesatualizados] = useState<{ ano: number; n: number }[]>([]);
  const parar = useRef(false);
  /** O token DESTA aba — o servidor deixa uma aba por vez conduzir o lote. */
  const condutor = useRef("");
  const local = useRef(-1);
  const { confirmar, confirmacao } = useConfirmacao();
  const comPeriodo = usaPeriodo(api.parametros);

  const carregar = useCallback(async () => {
    try {
      const r = await fetch(`/api/admin/centi-apis/${api.id}/importar`);
      const j = (await r.json()) as { ok?: boolean; lotes?: LoteCenti[]; emAndamento?: LoteCenti | null; desatualizados?: { ano: number; n: number }[] };
      if (j.ok) {
        setLotes(j.lotes ?? []);
        setEmAndamento(j.emAndamento ?? null);
        setDesatualizados(j.desatualizados ?? []);
      }
    } catch {
      setLotes((l) => l ?? []);
    }
  }, [api.id]);
  useEffect(() => {
    void carregar();
  }, [carregar]);

  useEffect(() => {
    onOcupado(rodando);
    if (!rodando) return;
    const aviso = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", aviso);
    return () => window.removeEventListener("beforeunload", aviso);
  }, [rodando, onOcupado]);

  const anotar = (p: PassoLote) => setPassos((l) => [...l, p]);

  /** Um passo (o pedido de uma página), repetindo a falha de rede com espera. Devolve o resultado ou lança o erro final. */
  async function passo(lote: LoteCenti, periodo: Periodo, pagina: number): Promise<RespostaPasso> {
    for (let t = 0; ; t++) {
      if (parar.current) throw new Error("Interrompida.");
      setAgora({ periodo, pagina, tentativa: t + 1 });
      let r: RespostaPasso;
      try {
        r = await pedirImportacao<RespostaPasso>(api.id, { acao: "pagina", lote: lote.id, condutor: condutor.current, inicio: periodo.inicio, fim: periodo.fim, pagina });
      } catch (e) {
        if (e instanceof RecusaImportacao) throw e;
        // Sem resposta do SISTEMA (rede, sessão) — o passo não chegou ao servidor: fica registrado só na tela.
        const mensagem = `Sem resposta do sistema: ${e instanceof Error ? e.message : "falha de rede"}`;
        anotar({ ...passoVazio(local.current--, periodo, pagina), estado: "erro", mensagem });
        if (t >= ESPERA_TENTATIVAS.length) throw new Error(mensagem);
        setAgora({ periodo, pagina, tentativa: t + 1, espera: ESPERA_TENTATIVAS[t] });
        await esperar(ESPERA_TENTATIVAS[t]);
        continue;
      }
      anotar(r.passo);
      setAtual(r.lote);
      if (!r.erro || r.dividir) return r;
      if (r.erro.tipo !== "rede" || t >= ESPERA_TENTATIVAS.length) throw new Error(r.erro.mensagem);
      setAgora({ periodo, pagina, tentativa: t + 1, espera: ESPERA_TENTATIVAS[t] });
      await esperar(ESPERA_TENTATIVAS[t]);
    }
  }

  async function importar(retomar: LoteCenti | null, modo: "dados" | "unidades" = "dados") {
    parar.current = false;
    condutor.current = crypto.randomUUID();
    setRodando(true);
    setPassos([]);
    let lote = retomar;
    let onde = "";
    try {
      if (!lote) lote = (await pedirImportacao<{ lote: LoteCenti }>(api.id, { acao: "iniciar", ano, condutor: condutor.current, modo })).lote;
      setAtual(lote);
      const anteriores = retomar ? await lerPassos(api.id, retomar.id) : [];
      setPassos(anteriores);
      // A FILA: o período começado (na próxima página) e o que falta do ano, semana a semana.
      const emCurso = periodoEmCurso(anteriores);
      const fila: { periodo: Periodo; pagina: number }[] = emCurso ? [emCurso] : [];
      for (const p of periodosAPedir(lote.ano, [...periodosLidos(anteriores), ...(emCurso ? [emCurso.periodo] : [])], comPeriodo)) fila.push({ periodo: p, pagina: 1 });
      for (let item = fila.shift(); item; item = fila.shift()) {
        if (parar.current) break;
        onde = `${rotuloPeriodo(item.periodo)}, página ${item.pagina}`;
        const r = await passo(lote, item.periodo, item.pagina);
        lote = r.lote;
        if (r.dividir) fila.unshift(...r.dividir.map((periodo) => ({ periodo, pagina: 1 })));
        else if (r.continuar) fila.unshift({ periodo: item.periodo, pagina: item.pagina + 1 });
      }
      setAgora(null);
      if (parar.current) {
        await pedirImportacao(api.id, { acao: "cancelar", lote: lote.id, condutor: condutor.current, motivo: "Interrompida pelo administrador." });
        toast.info("Importação interrompida — nada foi gravado nos empenhos.");
        return;
      }
      let conclusao = await pedirImportacao<{ lote: LoteCenti; queda?: string }>(api.id, { acao: "concluir", lote: lote.id, condutor: condutor.current });
      if (conclusao.queda) {
        // A QUEDA em relação à última importação concluída: só grava com a confirmação de quem importa.
        const seguir = await confirmar({ titulo: "Os números caíram — gravar mesmo assim?", texto: `${conclusao.queda} Confira a Centi antes: se for um erro de leitura, cancele (nada é gravado).`, confirmar: "Gravar", cancelar: "Cancelar importação", perigo: true });
        if (!seguir) {
          await pedirImportacao(api.id, { acao: "cancelar", lote: lote.id, condutor: condutor.current, motivo: `Cancelada: ${conclusao.queda}`.slice(0, 300) });
          toast.info("Importação cancelada — os empenhos ficam como estavam.");
          return;
        }
        conclusao = await pedirImportacao<{ lote: LoteCenti; queda?: string }>(api.id, { acao: "concluir", lote: lote.id, condutor: condutor.current, aceitarQueda: true });
      }
      const fim = conclusao.lote;
      setAtual(fim);
      if (fim.estado === "unidades") {
        toast.success(fim.mensagem ?? "Unidades da Centi lidas — vincule-as em “Unidades da Centi”.");
      } else if (fim.estado === "promovido") {
        toast.success(`Empenhos ${fim.ano} importados e conferidos (${brl(fim.soma)} empenhados): ${num(fim.inseridos)} novos, ${num(fim.atualizados)} atualizados, ${num(semMudanca(fim))} sem mudança, ${num(fim.removidos)} marcados como removidos${fim.fora ? `, ${num(fim.fora)} de unidade sem vínculo descartados` : ""}.`);
      } else {
        toast.error(`Importação parcial — nada foi gravado. ${fim.mensagem ?? ""}`);
      }
    } catch (e) {
      setAgora(null);
      const msg = e instanceof Error ? e.message : "Falha na importação.";
      if (e instanceof RecusaImportacao) {
        // Recusado pelo sistema (ex.: outra aba conduz o lote) — o lote é de quem o conduz: não cancela.
        toast.error(msg);
      } else if (lote && parar.current) {
        await pedirImportacao(api.id, { acao: "cancelar", lote: lote.id, condutor: condutor.current, motivo: "Interrompida pelo administrador." }).catch(() => {});
        toast.info("Importação interrompida — nada foi gravado nos empenhos.");
      } else if (lote) {
        await pedirImportacao(api.id, { acao: "cancelar", lote: lote.id, condutor: condutor.current, falhou: true, motivo: `${onde ? `${onde}: ` : ""}${msg}`.slice(0, 300) }).catch(() => {});
        toast.error(`A importação falhou${onde ? ` em ${onde}` : ""}: ${msg} Nada foi gravado nos empenhos — veja os passos.`);
      } else {
        toast.error(msg);
      }
    } finally {
      setRodando(false);
      void carregar();
      onLido();
    }
  }

  async function interromper() {
    if (await confirmar({ titulo: "Interromper a importação?", texto: "O que já foi lido é descartado; os empenhos ficam como estavam.", confirmar: "Interromper", perigo: true })) {
      parar.current = true;
    }
  }

  async function cancelarParada(l: LoteCenti) {
    await pedirImportacao(api.id, { acao: "cancelar", lote: l.id, motivo: "Cancelada pelo administrador." }).catch((e) => toast.error(e instanceof Error ? e.message : "Falha."));
    void carregar();
  }

  /** Exclui do banco as importações escolhidas (a que está lendo agora fica de fora). */
  async function excluirLotes(ls: LoteCenti[]): Promise<boolean> {
    const alvo = ls.filter((l) => !(rodando && atual?.id === l.id));
    if (!alvo.length) return false;
    const uma = alvo.length === 1 ? alvo[0] : null;
    const ok = await confirmar({
      titulo: uma ? `Excluir a importação de ${uma.ano}?` : `Excluir ${alvo.length} importações?`,
      texto: `${uma ? `A tentativa de ${dataHoraBR(uma.iniciadoEm)} sai` : "As tentativas saem"} do banco com os passos e o que foi lido.${alvo.some((l) => l.estado === "promovido") ? " Os empenhos gravados pelas importações concluídas continuam." : ""}`,
      confirmar: "Excluir",
      perigo: true,
    });
    if (!ok) return false;
    try {
      const n = await excluirTentativas(api.id, { lotes: alvo.map((l) => l.id) });
      toast.success(`${num(n)} importaç${n === 1 ? "ão excluída" : "ões excluídas"} do banco.`);
      const ids = new Set(alvo.map((l) => l.id));
      if (atual && ids.has(atual.id)) {
        setAtual(null);
        setPassos([]);
      }
      if (historico && ids.has(historico.id)) setHistorico(null);
      setSelLotes(new Set());
      void carregar();
      return true;
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Falha ao excluir.");
      return false;
    }
  }

  /** Exclui passos de uma importação (os locais, que não chegaram ao servidor, saem só da tela). */
  async function excluirPassos(l: LoteCenti, ps: PassoLote[]): Promise<boolean> {
    const lidos = ps.filter((p) => p.estado === "ok").length;
    const ok = await confirmar({
      titulo: ps.length === 1 ? "Excluir este passo?" : `Excluir ${ps.length} passos?`,
      texto: `${ps.length === 1 ? `${rotuloPeriodo(ps[0])} · página ${ps[0].pagina} sai` : "Os passos saem"} do banco.${lidos && l.estado === "lendo" ? " Os períodos lidos voltam a faltar e são lidos de novo ao continuar." : ""}`,
      confirmar: "Excluir",
      perigo: true,
    });
    if (!ok) return false;
    try {
      const ids = ps.filter((p) => p.id > 0).map((p) => p.id);
      if (ids.length) await excluirTentativas(api.id, { lote: l.id, passos: ids });
      const fora = new Set(ps.map((p) => p.id));
      if (atual?.id === l.id) setPassos((lista) => lista.filter((x) => !fora.has(x.id)));
      toast.success(`${num(ps.length)} passo${ps.length === 1 ? " excluído" : "s excluídos"}.`);
      void carregar();
      return true;
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Falha ao excluir.");
      return false;
    }
  }

  const erros = passos.filter((p) => p.estado === "erro").length;
  const colunas: Column<LoteCenti>[] = [
    { key: "quando", header: "Quando", nowrap: true, value: (l) => dataHoraBR(l.iniciadoEm), render: (l) => <span className="tabular-nums">{dataHoraBR(l.iniciadoEm)}</span> },
    { key: "ano", header: "Ano", nowrap: true, total: false, value: (l) => String(l.ano), render: (l) => <span className="tabular-nums">{l.ano}</span> },
    {
      key: "estado",
      header: "Situação",
      nowrap: true,
      value: (l) => ROTULO_ESTADO_LOTE[l.estado]?.rotulo ?? l.estado,
      render: (l) => (
        <Badge tone={ROTULO_ESTADO_LOTE[l.estado]?.tom ?? "slate"} dot>
          {ROTULO_ESTADO_LOTE[l.estado]?.rotulo ?? l.estado}
        </Badge>
      ),
    },
    {
      key: "conferencia",
      header: "Conferência",
      nowrap: true,
      value: (l) => `${l.unicos + l.recusados} de ${l.totalInformado ?? "?"}`,
      render: (l) => (
        <span className="tabular-nums">
          {num(l.unicos + l.recusados)} de {l.totalInformado != null ? num(l.totalInformado) : "?"}
        </span>
      ),
    },
    {
      key: "resultado",
      header: "Resultado",
      align: "left",
      minWidth: 220,
      value: (l) => l.mensagem ?? "",
      render: (l) =>
        l.estado === "promovido" ? (
          <span className="text-text-2">
            {num(l.inseridos)} novos · {num(l.atualizados)} atualizados · {num(semMudanca(l))} sem mudança · {num(l.removidos)} removidos
            {l.fora ? ` · ${num(l.fora)} sem vínculo (não gravados)` : ""}
          </span>
        ) : (
          <CelulaTexto texto={l.mensagem ?? (l.estado === "lendo" ? "Em andamento" : "—")} />
        ),
    },
    { key: "soma", header: "Soma empenhada", nowrap: true, align: "right", filter: "range", numero: (l) => l.soma, render: (l) => <span className="tabular-nums">{l.soma != null ? brl(l.soma) : "—"}</span> },
    { key: "leitor", header: "Leitor", nowrap: true, total: false, value: (l) => String(l.leitor), render: (l) => (l.leitor < LEITOR_EMPENHOS ? <Badge tone="amber">v{l.leitor} (anterior)</Badge> : <span className="tabular-nums text-muted">v{l.leitor}</span>) },
    { key: "quem", header: "Por", nowrap: true, value: (l) => l.iniciadoPor, render: (l) => <span className="text-muted">{l.iniciadoPor}</span> },
  ];

  return (
    <SecaoBanner
      titulo="Importar"
      acao={
        <span className="flex items-center gap-1">
          {rodando ? (
            <Button size="sm" variant="danger" onClick={() => void interromper()}>
              Interromper
            </Button>
          ) : (
            <>
              <Button size="sm" variant="secondary" onClick={() => void importar(null, "unidades")} disabled={alterado || !!emAndamento}>
                Puxar unidades {ano}
              </Button>
              <Button size="sm" onClick={() => void importar(null)} disabled={alterado || !!emAndamento} icon={<IconDownload className="h-4 w-4" />}>
                Importar {ano}
              </Button>
            </>
          )}
          <A titulo="Importar">
            <p>
              Lê o ano <strong>semana a semana</strong> (o período que vier grande demais é dividido ao meio), página a página, com o
              cadastro salvo, e guarda tudo num lote separado. Cada pedido aparece na hora em <strong>Passos</strong> — toque num
              para ver o detalhe (o pedido enviado, a resposta, o tempo, o erro).
            </p>
            <p>
              Os empenhos só são gravados quando o ano inteiro foi lido e a contagem <strong>confere</strong> com o total que a
              Centi informa em cada período. Faltou registro, a Centi falhou ou você interrompeu: o lote fica parcial e os
              empenhos continuam como estavam. O que sumir da Centi é marcado como <strong>removido</strong> (nada é apagado).
            </p>
            <p>
              A conclusão também confere os <strong>valores</strong>: nenhum negativo ou acima de R$ 1 bilhão, e a soma empenhada
              e o número de empenhos não podem cair muito em relação à última importação concluída do ano (você confirma antes
              de gravar). Reimportar regrava só o que <strong>mudou</strong> — o resumo diz quantos vieram iguais.
            </p>
            <p>
              Uma <strong>aba por vez</strong> conduz a importação. Cada importação guarda a versão do leitor; quando o sistema
              melhora a leitura, ele avisa os anos lidos pela versão anterior para você importar de novo.
            </p>
            <p>
              Só os empenhos de unidade da Centi <strong>vinculada</strong> ao cadastro (em “Unidades da Centi”) são gravados — os
              outros são lidos e conferidos, mas descartados. <strong>Puxar unidades</strong> lê o ano só para registrar as
              unidades, sem gravar nenhum empenho.
            </p>
            <p>Toque numa importação do histórico para ver os passos dela.</p>
            <p>
              Marque as importações do histórico (ou os passos) e use <strong>Excluir selecionadas</strong> para tirá-las do
              banco; os empenhos que uma importação concluída gravou continuam. O passo lido que sai volta a faltar e é lido de
              novo ao continuar.
            </p>
          </A>
        </span>
      }
    >
      {alterado && <Callout kind="warn">Salve as alterações antes de importar — a importação usa o cadastro salvo.</Callout>}
      {!comPeriodo && (
        <Callout kind="warn">
          Os parâmetros não usam <code>{"{inicio}"}</code> e <code>{"{fim}"}</code>: o ano só pode ser lido inteiro, e a Centi
          pode recusar por ser grande demais.
        </Callout>
      )}
      {desatualizados.length > 0 && !rodando && (
        <Callout kind="warn">
          {desatualizados.map((d) => `${d.ano} (${num(d.n)} empenhos)`).join(", ")}: lido{desatualizados.length === 1 ? "" : "s"} por uma versão anterior do
          leitor. Importe de novo para atualizar — nada é apagado; o que mudou é regravado.
        </Callout>
      )}
      {emAndamento && !rodando && emAndamento.conduzido && (
        <Callout kind="info">
          A importação de {emAndamento.ano} está em andamento em outra aba ({num(emAndamento.unicos)} registros lidos). Acompanhe por lá — se aquela aba
          foi fechada, ela fica livre para continuar aqui em até 2 minutos.
        </Callout>
      )}
      {emAndamento && !rodando && !emAndamento.conduzido && (
        <Callout kind="warn">
          <span className="flex flex-wrap items-center justify-between gap-2">
            Há uma importação de {emAndamento.ano} parada ({num(emAndamento.unicos)} registros lidos).
            <span className="flex gap-2">
              <Button size="sm" variant="secondary" onClick={() => setHistorico(emAndamento)}>
                Ver passos
              </Button>
              <Button size="sm" variant="secondary" onClick={() => void cancelarParada(emAndamento)}>
                Cancelar
              </Button>
              <Button size="sm" onClick={() => void importar(emAndamento)} disabled={alterado}>
                Continuar
              </Button>
            </span>
          </span>
        </Callout>
      )}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-[minmax(0,10rem)]">
        <SelectField denso label="Ano" value={String(ano)} onChange={(e) => setAno(Number(e.target.value))} disabled={rodando}>
          {anos.map((y) => (
            <option key={y} value={y}>
              {y}
            </option>
          ))}
        </SelectField>
      </div>
      {(rodando || passos.length > 0) && atual && (
        <div className="space-y-3">
          {rodando && (
            <Progress
              value={fracaoDoAno(atual.ano, passos) * 100}
              label={
                agora
                  ? `${rotuloPeriodo(agora.periodo)} · página ${agora.pagina}${agora.tentativa > 1 ? ` · tentativa ${agora.tentativa}` : ""}${agora.espera ? ` · nova tentativa em ${agora.espera / 1000} s` : ""}`
                  : "Conferindo…"
              }
            />
          )}
          <div className="grid grid-cols-2 gap-[var(--gap-block)] sm:grid-cols-3 xl:grid-cols-5">
            <StatMini label="Registros distintos" value={num(atual.unicos)} hint={`${num(atual.recebidos)} recebidos`} />
            <StatMini label="Total informado" value={num(atual.totalInformado)} hint="Soma dos períodos lidos" />
            <StatMini label="Ano lido" value={`${Math.floor(fracaoDoAno(atual.ano, passos) * 100)}%`} hint={`${num(atual.paginas)} páginas`} />
            <StatMini label="Soma empenhada" value={atual.soma != null ? brl(atual.soma) : "—"} hint="Dos registros distintos" />
            <StatMini label="Erros" value={num(erros)} tone={erros ? "danger" : "default"} hint={atual.recusados ? `${num(atual.recusados)} recusados` : undefined} />
          </div>
          <PassosDoLote passos={passos} nome={`Passos ${api.nome} ${atual.ano}`} onExcluir={rodando ? undefined : (ps) => excluirPassos(atual, ps)} />
        </div>
      )}
      {lotes && lotes.length > 0 && (
        <DataTable
          columns={colunas}
          rows={lotes}
          getKey={(l) => l.id}
          density="compact"
          onRowClick={(l) => setHistorico(l)}
          exportar={{ nome: `Importações ${api.nome}` }}
          selectable
          selected={selLotes}
          onSelected={(s) => setSelLotes(s as Set<number>)}
          acoesRodape={
            selLotes.size > 0 ? (
              <Button size="sm" variant="danger" icon={<IconTrash className="h-4 w-4" />} onClick={() => void excluirLotes(lotes.filter((l) => selLotes.has(l.id)))}>
                Excluir selecionadas ({num(selLotes.size)})
              </Button>
            ) : undefined
          }
          resumo={(l) => `${l.length} importaç${l.length === 1 ? "ão" : "ões"}`}
        />
      )}
      {historico && (
        <PassosDoHistorico
          api={api}
          lote={historico}
          onClose={() => setHistorico(null)}
          onExcluir={rodando && atual?.id === historico.id ? undefined : () => void excluirLotes([historico])}
          onExcluirPasso={rodando && atual?.id === historico.id ? undefined : (ps) => excluirPassos(historico, ps)}
        />
      )}
      {confirmacao}
    </SecaoBanner>
  );
}

function passoVazio(id: number, periodo: Periodo, pagina: number): PassoLote {
  return {
    id,
    inicio: periodo.inicio,
    fim: periodo.fim,
    pagina,
    estado: "erro",
    fimPeriodo: false,
    status: null,
    bytes: null,
    ms: null,
    recebidos: 0,
    novos: 0,
    recusados: 0,
    repetidos: 0,
    total: null,
    soma: null,
    mensagem: null,
    corpo: null,
    em: new Date().toISOString(),
  };
}

/** Os PASSOS de um lote (o mais recente primeiro), com o detalhe de cada um ao tocar — ao vivo e no histórico. */
function PassosDoLote({
  passos,
  nome,
  onExcluir,
  selecao,
}: {
  passos: PassoLote[];
  nome: string;
  onExcluir?: (ps: PassoLote[]) => Promise<boolean>;
  /** A seleção controlada de fora (a ação de excluir fica com quem controla — ex.: o rodapé do banner). */
  selecao?: { sel: Set<number>; onSel: (s: Set<number>) => void };
}) {
  const [aberto, setAberto] = useState<PassoLote | null>(null);
  const [selLocal, setSelLocal] = useState<Set<number>>(new Set());
  const sel = selecao?.sel ?? selLocal;
  const setSel = selecao?.onSel ?? setSelLocal;
  const [excluindo, setExcluindo] = useState(false);
  const linhas = useMemo(() => [...passos].reverse(), [passos]);
  const colunas: Column<PassoLote>[] = [
    { key: "em", header: "Hora", nowrap: true, value: (p) => dataHoraBR(p.em), render: (p) => <span className="tabular-nums">{dataHoraBR(p.em).slice(11)}</span> },
    { key: "periodo", header: "Período", nowrap: true, value: (p) => rotuloPeriodo(p), render: (p) => rotuloPeriodo(p) },
    { key: "pagina", header: "Página", nowrap: true, total: false, value: (p) => String(p.pagina), render: (p) => <span className="tabular-nums">{p.pagina}</span> },
    {
      key: "estado",
      header: "Situação",
      nowrap: true,
      value: (p) => ROTULO_ESTADO_PASSO[p.estado].rotulo,
      render: (p) => (
        <Badge tone={ROTULO_ESTADO_PASSO[p.estado].tom} dot>
          {ROTULO_ESTADO_PASSO[p.estado].rotulo}
        </Badge>
      ),
    },
    { key: "recebidos", header: "Registros", nowrap: true, value: (p) => String(p.recebidos), render: (p) => <span className="tabular-nums">{num(p.recebidos)}</span> },
    { key: "novos", header: "Novos", nowrap: true, value: (p) => String(p.novos), render: (p) => <span className="tabular-nums">{num(p.novos)}</span> },
    { key: "total", header: "Total do período", nowrap: true, total: false, value: (p) => num(p.total), render: (p) => <span className="tabular-nums">{num(p.total)}</span> },
    { key: "soma", header: "Soma empenhada", nowrap: true, align: "right", filter: "range", numero: (p) => p.soma, render: (p) => <span className="tabular-nums">{p.soma != null ? brl(p.soma) : "—"}</span> },
    { key: "bytes", header: "Tamanho", nowrap: true, total: false, value: (p) => (p.bytes ? formatBytes(p.bytes) : "—"), render: (p) => <span className="tabular-nums">{p.bytes ? formatBytes(p.bytes) : "—"}</span> },
    { key: "ms", header: "Tempo", nowrap: true, total: false, value: (p) => tempo(p.ms), render: (p) => <span className="tabular-nums">{tempo(p.ms)}</span> },
    {
      key: "mensagem",
      header: "Detalhe",
      align: "left",
      minWidth: 220,
      value: (p) => p.mensagem ?? "",
      render: (p) => (p.mensagem ? <CelulaTexto texto={p.mensagem} /> : <span className="text-muted">{p.fimPeriodo ? "Fim do período" : "—"}</span>),
    },
  ];
  return (
    <>
      <DataTable
        columns={colunas}
        rows={linhas}
        getKey={(p) => p.id}
        density="compact"
        onRowClick={setAberto}
        exportar={{ nome }}
        selectable={!!onExcluir || !!selecao}
        selected={sel}
        onSelected={(s) => setSel(s as Set<number>)}
        acoesRodape={
          onExcluir && !selecao && sel.size > 0 ? (
            <Button
              className="animate-fade-in-up"
              size="sm"
              variant="danger"
              loading={excluindo}
              icon={<IconTrash className="h-4 w-4" />}
              onClick={async () => {
                setExcluindo(true);
                if (await onExcluir(passos.filter((p) => sel.has(p.id)))) setSel(new Set());
                setExcluindo(false);
              }}
            >
              Excluir selecionados ({num(sel.size)})
            </Button>
          ) : undefined
        }
        vazio="Nenhum pedido feito ainda."
        resumo={(l) => `${l.length} passo${l.length === 1 ? "" : "s"} · ${l.filter((p) => p.estado === "erro").length} com erro`}
      />
      {aberto && (
        <DetalhePasso
          passo={aberto}
          onClose={() => setAberto(null)}
          onExcluir={
            onExcluir
              ? async () => {
                  if (await onExcluir([aberto])) setAberto(null);
                }
              : undefined
          }
        />
      )}
    </>
  );
}

/** O DETALHE de um passo: o resultado ou o erro inteiro, os números e o pedido enviado à Centi. */
function DetalhePasso({ passo: p, onClose, onExcluir }: { passo: PassoLote; onClose: () => void; onExcluir?: () => Promise<void> }) {
  const [excluindo, setExcluindo] = useState(false);
  const campos: [string, ReactNode][] = [
    ["Período", `${diaBR(p.inicio)} a ${diaBR(p.fim)}`],
    ["Página", p.pagina],
    ["Quando", dataHoraBR(p.em)],
    ["Resposta (HTTP)", p.status ?? "—"],
    ["Tamanho", p.bytes ? formatBytes(p.bytes) : "—"],
    ["Tempo", tempo(p.ms)],
    ["Registros recebidos", num(p.recebidos)],
    ["Novos no lote", num(p.novos)],
    ["Recusados (sem número)", num(p.recusados)],
    ["Repetidos no pedido", num(p.repetidos)],
    ["Total do período (Centi)", num(p.total)],
    ["Fim do período", p.estado === "ok" ? (p.fimPeriodo ? "Sim" : "Não — há mais páginas") : "—"],
  ];
  return (
    <Modal
      open
      onClose={onClose}
      size="lg"
      titulo={`${rotuloPeriodo(p)} · página ${p.pagina}`}
      rodape={
        onExcluir ? (
          <div className="flex justify-end">
            <Button
              size="sm"
              variant="danger"
              loading={excluindo}
              icon={<IconTrash className="h-4 w-4" />}
              onClick={async () => {
                setExcluindo(true);
                await onExcluir();
                setExcluindo(false);
              }}
            >
              Excluir passo
            </Button>
          </div>
        ) : undefined
      }
    >
      <div className="space-y-[var(--gap-block)]">
        <SecaoBanner
          titulo="Resultado"
          acao={
            <Badge tone={ROTULO_ESTADO_PASSO[p.estado].tom} dot>
              {ROTULO_ESTADO_PASSO[p.estado].rotulo}
            </Badge>
          }
        >
          {p.mensagem && <Callout kind={p.estado === "erro" ? "danger" : "warn"}>{p.mensagem}</Callout>}
          <dl className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            {campos.map(([rotulo, valor]) => (
              <div key={rotulo}>
                <dt className="text-[12px] text-muted">{rotulo}</dt>
                <ValorCampo>
                  <span className="tabular-nums">{valor}</span>
                </ValorCampo>
              </div>
            ))}
          </dl>
        </SecaoBanner>
        <SecaoBanner titulo="Pedido enviado à Centi" acao={p.corpo ? <BotaoCopiar texto={p.corpo} rotulo="Copiar" /> : undefined}>
          {p.corpo ? (
            <pre className="whitespace-pre-wrap break-all rounded-control bg-surface-2 p-3 font-mono text-[12px] text-muted">{JSON.stringify(JSON.parse(p.corpo), null, 2)}</pre>
          ) : (
            <p className="text-[12.5px] text-muted">O pedido não chegou ao servidor do sistema (falha de rede ou de sessão).</p>
          )}
        </SecaoBanner>
      </div>
    </Modal>
  );
}

/** Os passos de uma importação do HISTÓRICO (carregados ao abrir). */
function PassosDoHistorico({
  api,
  lote,
  onClose,
  onExcluir,
  onExcluirPasso,
}: {
  api: ApiCenti;
  lote: LoteCenti;
  onClose: () => void;
  onExcluir?: () => void;
  onExcluirPasso?: (ps: PassoLote[]) => Promise<boolean>;
}) {
  const [passos, setPassos] = useState<PassoLote[] | null>(null);
  const [falha, setFalha] = useState<string | null>(null);
  const [sel, setSel] = useState<Set<number>>(new Set());
  const [excluindo, setExcluindo] = useState(false);
  // Todos marcados = a importação inteira sai; senão, só os passos marcados.
  const todos = !!passos?.length && passos.every((p) => sel.has(p.id));
  async function excluirMarcados() {
    if (!passos) return;
    if (todos) return onExcluir?.();
    if (!onExcluirPasso) return;
    setExcluindo(true);
    const ps = passos.filter((p) => sel.has(p.id));
    if (await onExcluirPasso(ps)) {
      const fora = new Set(ps.map((p) => p.id));
      setPassos((l) => (l ? l.filter((x) => !fora.has(x.id)) : l));
      setSel(new Set());
    }
    setExcluindo(false);
  }
  const carregar = useCallback(() => {
    setFalha(null);
    lerPassos(api.id, lote.id)
      .then(setPassos)
      .catch((e) => setFalha(e instanceof Error ? e.message : "Falha ao carregar."));
  }, [api.id, lote.id]);
  useEffect(carregar, [carregar]);
  const est = ROTULO_ESTADO_LOTE[lote.estado];
  return (
    <Modal
      open
      onClose={onClose}
      size="xl"
      titulo={`Importação de ${lote.ano} — ${dataHoraBR(lote.iniciadoEm)}`}
      rodape={
        sel.size > 0 && (todos ? onExcluir : onExcluirPasso) ? (
          <div className="flex animate-fade-in-up items-center justify-end gap-3">
            <span className="text-[12.5px] text-muted">
              {todos ? "Todos os passos marcados — a importação inteira sai do banco." : `${num(sel.size)} de ${num(passos?.length ?? 0)} passos marcados.`}
            </span>
            <Button size="sm" variant="danger" loading={excluindo} icon={<IconTrash className="h-4 w-4" />} onClick={() => void excluirMarcados()}>
              {todos ? "Excluir importação" : `Excluir selecionados (${num(sel.size)})`}
            </Button>
          </div>
        ) : undefined
      }
    >
      <div className="space-y-[var(--gap-block)]">
        <div className="grid grid-cols-2 gap-[var(--gap-block)] sm:grid-cols-3 xl:grid-cols-5">
          <StatMini label="Situação" value={est?.rotulo ?? lote.estado} />
          <StatMini label="Conferência" value={`${num(lote.unicos + lote.recusados)} de ${lote.totalInformado != null ? num(lote.totalInformado) : "?"}`} />
          <StatMini label="Páginas lidas" value={num(lote.paginas)} />
          <StatMini label="Soma empenhada" value={lote.soma != null ? brl(lote.soma) : "—"} hint={`Leitor v${lote.leitor}`} />
          <StatMini label="Erros" value={passos ? num(passos.filter((p) => p.estado === "erro").length) : "…"} />
        </div>
        {lote.mensagem && <Callout kind={lote.estado === "falhou" ? "danger" : "warn"}>{lote.mensagem}</Callout>}
        {falha ? (
          <ErroCarga msg={falha} onTentar={carregar} />
        ) : passos ? (
          <PassosDoLote
            passos={passos}
            nome={`Passos ${api.nome} ${lote.ano}`}
            selecao={onExcluirPasso || onExcluir ? { sel, onSel: setSel } : undefined}
            onExcluir={
              onExcluirPasso
                ? async (ps) => {
                    const ok = await onExcluirPasso(ps);
                    const fora = new Set(ps.map((p) => p.id));
                    if (ok) setPassos((l) => (l ? l.filter((x) => !fora.has(x.id)) : l));
                    return ok;
                  }
                : undefined
            }
          />
        ) : (
          <SkeletonLinhas />
        )}
      </div>
    </Modal>
  );
}
