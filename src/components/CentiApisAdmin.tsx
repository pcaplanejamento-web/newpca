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
import { anosDaApi, continuarLendo, type LoteCenti, ROTULO_ESTADO_LOTE } from "@/lib/empenhos-core";
import { dataHoraBR, dataIsoBrasilia } from "@/lib/format";
import { Ajuda } from "./Ajuda";
import { Badge } from "./Badge";
import { Button } from "./Button";
import { Callout } from "./Callout";
import { useConfirmacao } from "./Confirmacao";
import { type Column, DataTable } from "./DataTable";
import { ErroCarga } from "./ErroCarga";
import { CampoLista, SelectField, TextArea, TextField } from "./Field";
import { CelulaTexto } from "./CelulaLista";
import { IconChevronDown, IconDownload, IconPlay } from "./icons";
import { Modal } from "./Modal";
import { Progress } from "./Progress";
import { SecaoBanner } from "./SecaoBanner";
import { SeletorMultiplo } from "./SeletorMultiplo";
import { SkeletonLinhas } from "./Skeleton";
import { StatMini } from "./StatMini";
import { Switch } from "./Switch";
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
  const rotuloPedido = (p: Record<string, number>) =>
    p.orgao != null ? `${porCodigo.get(p.orgao)?.sigla ?? "Órgão"} (ID ${p.orgao})` : p.fonte != null ? `Fonte ${p.fonte}` : "O ano inteiro";
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
                dica={api.implementada ? "Liga a atualização automática desta API." : "Disponível quando a importação desta API existir."}
              />
              <A titulo="Ligada">Liga a atualização automática. Só fica disponível quando a importação desta API existir.</A>
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
                      <code>{"{ano}"}</code> o ano · <code>{"{orgao}"}</code> o ID do órgão na Centi · <code>{"{fonte}"}</code> a fonte ·{" "}
                      <code>{"{pagina}"}</code> a página.
                    </p>
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
        {importavel(api.chave) && <ImportacaoManual api={api} alterado={alterado} onOcupado={setImportando} />}
      </div>
      {confirmacao}
    </Modal>
  );
}

type RespostaPagina = { lote: LoteCenti; pagina: { recebidos: number; novos: number } };

/** Chama a rota da importação manual; devolve o JSON ou lança com a mensagem do servidor. */
async function pedirImportacao<T>(apiId: number, corpo: Record<string, unknown>): Promise<T> {
  const r = await fetch(`/api/admin/centi-apis/${apiId}/importar`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(corpo),
  });
  const j = (await r.json().catch(() => ({}))) as { ok?: boolean; error?: string } & T;
  if (!r.ok || !j.ok) throw new Error(j.error ?? `Falha (${r.status}).`);
  return j;
}

const ESPERA_TENTATIVAS = [2000, 4000, 8000];

/**
 * A IMPORTAÇÃO MANUAL (passo 3): lê a API página a página com o cadastro SALVO, guarda num lote separado e só grava nos
 * empenhos quando a contagem confere com o total que a Centi informa. Interromper, fechar a página ou uma falha deixam a
 * tabela final como estava.
 */
function ImportacaoManual({ api, alterado, onOcupado }: { api: ApiCenti; alterado: boolean; onOcupado: (b: boolean) => void }) {
  const anos = anosDaApi(anoAtual(), api.anos);
  const [ano, setAno] = useState(anos[0]);
  const [lotes, setLotes] = useState<LoteCenti[] | null>(null);
  const [emAndamento, setEmAndamento] = useState<LoteCenti | null>(null);
  const [atual, setAtual] = useState<LoteCenti | null>(null);
  const [rodando, setRodando] = useState(false);
  const parar = useRef(false);
  const { confirmar, confirmacao } = useConfirmacao();

  const carregar = useCallback(async () => {
    try {
      const r = await fetch(`/api/admin/centi-apis/${api.id}/importar`);
      const j = (await r.json()) as { ok?: boolean; lotes?: LoteCenti[]; emAndamento?: LoteCenti | null };
      if (j.ok) {
        setLotes(j.lotes ?? []);
        setEmAndamento(j.emAndamento ?? null);
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

  async function pagina(lote: number, n: number): Promise<RespostaPagina> {
    let ultimo: unknown;
    for (let t = 0; t <= ESPERA_TENTATIVAS.length; t++) {
      if (parar.current) throw new Error("Interrompida.");
      try {
        return await pedirImportacao<RespostaPagina>(api.id, { acao: "pagina", lote, pagina: n });
      } catch (e) {
        ultimo = e;
        if (t < ESPERA_TENTATIVAS.length) await new Promise((ok) => setTimeout(ok, ESPERA_TENTATIVAS[t]));
      }
    }
    throw ultimo instanceof Error ? ultimo : new Error("Falha ao ler a página.");
  }

  async function importar(retomar: LoteCenti | null) {
    parar.current = false;
    setRodando(true);
    let lote = retomar;
    try {
      if (!lote) lote = (await pedirImportacao<{ lote: LoteCenti }>(api.id, { acao: "iniciar", ano })).lote;
      setAtual(lote);
      let n = lote.paginas + 1;
      for (;;) {
        if (parar.current) {
          await pedirImportacao(api.id, { acao: "cancelar", lote: lote.id, motivo: "Interrompida pelo administrador." });
          toast.info("Importação interrompida — nada foi gravado nos empenhos.");
          return;
        }
        let r: RespostaPagina;
        try {
          r = await pagina(lote.id, n);
        } catch (e) {
          const msg = e instanceof Error ? e.message : "Falha ao ler a página.";
          if (parar.current) continue;
          await pedirImportacao(api.id, { acao: "cancelar", lote: lote.id, falhou: true, motivo: `Página ${n}: ${msg}`.slice(0, 300) }).catch(() => {});
          toast.error(`A importação falhou na página ${n}: ${msg} Nada foi gravado nos empenhos.`);
          return;
        }
        lote = r.lote;
        setAtual(lote);
        if (!continuarLendo(lote, r.pagina)) break;
        n++;
      }
      const fim = (await pedirImportacao<{ lote: LoteCenti }>(api.id, { acao: "concluir", lote: lote.id })).lote;
      setAtual(fim);
      if (fim.estado === "promovido") {
        toast.success(`Empenhos ${fim.ano} importados e conferidos: ${fim.inseridos} novos, ${fim.atualizados} atualizados, ${fim.removidos} marcados como removidos.`);
      } else {
        toast.error(`Importação parcial — nada foi gravado. ${fim.mensagem ?? ""}`);
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Falha na importação.");
    } finally {
      setRodando(false);
      void carregar();
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

  const progresso = atual?.totalInformado ? Math.min(100, ((atual.unicos + atual.recusados) / atual.totalInformado) * 100) : 0;
  const colunas: Column<LoteCenti>[] = [
    { key: "quando", header: "Quando", nowrap: true, value: (l) => dataHoraBR(l.iniciadoEm), render: (l) => <span className="tabular-nums">{dataHoraBR(l.iniciadoEm)}</span> },
    { key: "ano", header: "Ano", nowrap: true, value: (l) => String(l.ano), render: (l) => <span className="tabular-nums">{l.ano}</span> },
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
          {(l.unicos + l.recusados).toLocaleString("pt-BR")} de {l.totalInformado != null ? l.totalInformado.toLocaleString("pt-BR") : "?"}
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
            {l.inseridos} novos · {l.atualizados} atualizados · {l.removidos} removidos
          </span>
        ) : (
          <CelulaTexto texto={l.mensagem ?? (l.estado === "lendo" ? "Em andamento" : "—")} />
        ),
    },
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
            <Button size="sm" onClick={() => void importar(null)} disabled={alterado || !!emAndamento} icon={<IconDownload className="h-4 w-4" />}>
              Importar {ano}
            </Button>
          )}
          <A titulo="Importar">
            <p>
              Lê a API <strong>página a página</strong> com o cadastro salvo e guarda tudo num lote separado. Os empenhos só são
              gravados quando a contagem <strong>confere</strong> com o total que a própria Centi informa.
            </p>
            <p>
              Faltou registro, a Centi falhou ou você interrompeu: o lote fica parcial e os empenhos continuam como estavam. O que
              sumir da Centi é marcado como <strong>removido</strong> (nada é apagado).
            </p>
          </A>
        </span>
      }
    >
      {alterado && <Callout kind="warn">Salve as alterações antes de importar — a importação usa o cadastro salvo.</Callout>}
      {emAndamento && !rodando && (
        <Callout kind="warn">
          <span className="flex flex-wrap items-center justify-between gap-2">
            Há uma importação de {emAndamento.ano} parada na página {emAndamento.paginas}.
            <span className="flex gap-2">
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
      {rodando && atual && (
        <Progress
          value={progresso}
          continuo={!atual.totalInformado}
          label={`Página ${atual.paginas} · ${(atual.unicos + atual.recusados).toLocaleString("pt-BR")}${atual.totalInformado ? ` de ${atual.totalInformado.toLocaleString("pt-BR")}` : ""} registros`}
        />
      )}
      {lotes && lotes.length > 0 && (
        <DataTable columns={colunas} rows={lotes} getKey={(l) => l.id} density="compact" exportar={{ nome: `Importações ${api.nome}` }} resumo={(l) => `${l.length} importaç${l.length === 1 ? "ão" : "ões"}`} />
      )}
      {confirmacao}
    </SecaoBanner>
  );
}
