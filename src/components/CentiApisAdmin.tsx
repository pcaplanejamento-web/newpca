"use client";

import { type ReactNode, useCallback, useEffect, useMemo, useState } from "react";
import {
  type ApiCenti,
  DIVISOES,
  type DivisaoApi,
  type EdicaoApi,
  edicaoDaApi,
  estadoApi,
  FREQUENCIAS,
  motivoApiInvalida,
  OPCOES_ANOS,
  type OrgaoDoCadastro,
  orgaosSemCodigo,
  previaPedido,
  type ResultadoTeste,
  rotuloFrequencia,
  type UnidadeDoCadastro,
} from "@/lib/centi-apis-core";
import { dataHoraBR, dataIsoBrasilia } from "@/lib/format";
import { Ajuda } from "./Ajuda";
import { Badge } from "./Badge";
import { Button } from "./Button";
import { Callout } from "./Callout";
import { useConfirmacao } from "./Confirmacao";
import { type Column, DataTable } from "./DataTable";
import { ErroCarga } from "./ErroCarga";
import { CampoLista, SelectField, TextArea, TextField } from "./Field";
import { IconChevronDown, IconPlay } from "./icons";
import { Modal } from "./Modal";
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
    rotulo: `${o.sigla} — ${o.nome}`,
    detalhe: o.codigoCenti != null ? `ID na Centi ${o.codigoCenti}` : "Sem o ID da Centi — não entra nos pedidos",
  }));
  const opcoesUnidades = unidades
    .filter((u) => !v.orgaos.length || (u.orgaoId != null && v.orgaos.includes(u.orgaoId)))
    .map((u) => ({ valor: String(u.id), rotulo: `${u.codigo} — ${u.nome}`, grupo: (u.orgaoId != null && nomeOrgao.get(u.orgaoId)) || "Sem órgão" }));
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
      bloqueado={salvando}
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
              label="Nome"
              value={v.nome}
              onChange={(e) => muda("nome", e.target.value)}
              maxLength={60}
              rotuloExtra={<A titulo="Nome">Como a API aparece nas telas do sistema.</A>}
            />
            <SelectField
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
            <div className="flex min-w-0 items-center gap-1">
              <div className="min-w-0 flex-1">
                <SeletorMultiplo
                  rotulo="Órgãos"
                  opcoes={opcoesOrgaos}
                  selecionados={v.orgaos.map(String)}
                  onChange={(l) => {
                    const ids = l.map(Number);
                    setV((x) => ({ ...x, orgaos: ids, unidades: ids.length ? x.unidades.filter((u) => ids.includes(unidades.find((y) => y.id === u)?.orgaoId ?? -1)) : x.unidades }));
                    setTeste(null);
                  }}
                  suspenso
                  textoVazio="Todos"
                />
              </div>
              <A titulo="Órgãos">
                <p>Os órgãos do cadastro do sistema (Órgãos e Unidades). Nenhum escolhido = todos.</p>
                <p>
                  Nas APIs pedidas por órgão, cada órgão vira um pedido com o <strong>ID da entidade na Centi</strong>{" "}
                  cadastrado nele — o órgão sem esse ID não entra. Nas demais, só o que for desses órgãos será guardado.
                </p>
              </A>
            </div>
            <div className="flex min-w-0 items-center gap-1">
              <div className="min-w-0 flex-1">
                <SeletorMultiplo
                  rotulo="Unidades"
                  opcoes={opcoesUnidades}
                  selecionados={v.unidades.map(String)}
                  onChange={(l) => muda("unidades", l.map(Number))}
                  suspenso
                  textoVazio="Todas"
                />
              </div>
              <A titulo="Unidades">
                As unidades do cadastro (dos órgãos escolhidos). Nenhuma escolhida = todas. Só o que for dessas unidades será
                guardado — a API sempre traz o órgão inteiro.
              </A>
            </div>
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
              label="Das"
              type="time"
              value={v.horaInicio}
              onChange={(e) => muda("horaInicio", e.target.value)}
              rotuloExtra={<A titulo="Horário">A leitura só acontece entre esses horários (Brasília).</A>}
            />
            <TextField
              label="Até"
              type="time"
              value={v.horaFim}
              onChange={(e) => muda("horaFim", e.target.value)}
              rotuloExtra={<A titulo="Horário">A leitura só acontece entre esses horários (Brasília).</A>}
            />
            <SelectField
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
                  label="URL base"
                  value={v.urlBase}
                  onChange={(e) => muda("urlBase", e.target.value)}
                  autoComplete="off"
                  rotuloExtra={<A titulo="URL base">O endereço do portal da Centi. Só HTTPS do domínio centi.com.br.</A>}
                />
                <TextField
                  label="Endpoint"
                  value={v.endpoint}
                  onChange={(e) => muda("endpoint", e.target.value)}
                  autoComplete="off"
                  rotuloExtra={<A titulo="Endpoint">O nome da API no portal (ex.: getempenhos).</A>}
                />
                <TextField
                  label="UF"
                  value={v.uf}
                  onChange={(e) => muda("uf", e.target.value)}
                  maxLength={4}
                  autoComplete="off"
                  rotuloExtra={<A titulo="UF">A sigla do estado no endereço (go).</A>}
                />
                <TextField
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
            <A titulo="Testar">
              Faz <strong>um</strong> pedido de verdade à Centi com o que está na tela (mesmo sem salvar) e mostra o que voltou:
              quantos registros, o total que a API informa, os campos e uma amostra. Nada é gravado.
            </A>
          }
        >
          <div className="grid grid-cols-1 items-end gap-3 sm:grid-cols-[minmax(0,10rem)_minmax(0,1fr)_auto]">
            <SelectField label="Ano" value={String(ano)} onChange={(e) => {
                setAno(Number(e.target.value));
                setTeste(null);
              }}>
              {[anoAtual(), anoAtual() - 1, anoAtual() - 2].map((y) => (
                <option key={y} value={y}>
                  {y}
                </option>
              ))}
            </SelectField>
            <SelectField
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
            <Button variant="secondary" onClick={testar} loading={testando} disabled={!!previa.erro} icon={<IconPlay className="h-4 w-4" />}>
              Testar agora
            </Button>
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
      </div>
      {confirmacao}
    </Modal>
  );
}
