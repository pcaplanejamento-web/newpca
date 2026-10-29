"use client";

import { useCallback, useEffect, useState } from "react";
import { dataBR, dataHoraBR, formatBytes, num } from "@/lib/format";
import { type ConfigFrotaView, OPCOES_DIAS_RECENTES, OPCOES_FREQUENCIA_FROTA } from "@/lib/frota-config-core";
import { importarFrota, TIPO_FROTA } from "@/lib/importar-frota-cliente";
import { codigoLegivel, type ProdutoContrato, ROTULO_PRODUTO } from "@/lib/volus-core";
import { Ajuda } from "../Ajuda";
import { Badge } from "../Badge";
import { BannerCadastro } from "../BannerCadastro";
import { Button } from "../Button";
import { Callout } from "../Callout";
import { useConfirmacao } from "../Confirmacao";
import { DataTable } from "../DataTable";
import { ErroCarga } from "../ErroCarga";
import { PasswordField, SelectField, TextField } from "../Field";
import { IconKey, IconPencil, IconPlay, IconPlus, IconRefresh } from "../icons";
import { Modal } from "../Modal";
import { SecaoBanner } from "../SecaoBanner";
import { AndamentoImportacao } from "../AndamentoImportacao";
import { useImportacoesLocais } from "../ImportacoesAoVivo";
import { SeletorCelula } from "../SeletorCelula";
import { SeletorMultiplo } from "../SeletorMultiplo";
import { SkeletonCartao } from "../Skeleton";
import { Switch } from "../Switch";
import { toast } from "../Toast";
import { CelulaTexto } from "../CelulaLista";

type Contrato = { codigo: string; nome: string; sigla: string; produto: ProdutoContrato; orgaoId: number | null; ativo: boolean };
type UnidadeVolus = { chave: string; nome: string; contrato: string; reparticaoId: number | null; registros: number };
type Cursor = { contrato: string; tipo: string; falhas: number; ultimoErro: string | null };
type Leitura = {
  id: number;
  contrato: string;
  tipo: string;
  inicio: string;
  fim: string;
  origem: string;
  estado: string;
  registros: number;
  novos: number;
  alterados: number;
  removidos: number;
  bytes: number;
  erro: string | null;
  por: string | null;
  em: string;
};
type Dados = {
  config: ConfigFrotaView;
  temChaveMestra: boolean;
  contratos: Contrato[];
  unidades: UnidadeVolus[];
  cursores: Cursor[];
  leituras: Leitura[];
  orgaos: { id: number; nome: string; sigla: string | null }[];
  reparticoes: { id: number; codigo: string; nome: string }[];
};
type Empresa = { id: string; nome?: string; cadastrado: boolean; produto: ProdutoContrato | null };

const ROTULO_TIPO: Record<string, string> = { abastecimento: "Combustível", manutencao: "Manutenção" };
const rotuloFreq = (m: number) => (m === 1440 ? "1 vez por dia" : m % 60 ? `A cada ${m} min` : `A cada ${m / 60} h`);
const hora = (h: number) => `${String(h).padStart(2, "0")}:00`;

async function pedir<T>(url: string, init?: RequestInit): Promise<T> {
  const r = await fetch(url, { cache: "no-store", ...init, headers: init?.body ? { "content-type": "application/json" } : undefined });
  const j = (await r.json().catch(() => ({}))) as T & { ok?: boolean; error?: string };
  if (!r.ok || !j.ok) throw Object.assign(new Error(j.error || `Falha (erro ${r.status}).`), { status: r.status });
  return j;
}

/**
 * FROTAS (VÓLUS) em Configurações → Importações — só o ADM, no MESMO formato da atualização automática das importações: o
 * resumo com "Editar" (credencial, atualização automática e limites dos alertas num banner), testar a conexão, importar
 * um ano, os contratos (o órgão de cada um), as unidades da Vólus ligadas às do cadastro e o histórico das leituras.
 */
export function FrotaAdmin() {
  const [d, setD] = useState<Dados | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const carregar = useCallback(async () => {
    try {
      setD(await pedir<Dados>("/api/admin/frota"));
      setErro(null);
    } catch (e) {
      setErro((e as Error).message);
    }
  }, []);
  useEffect(() => {
    void carregar();
  }, [carregar]);
  if (!d) return erro ? <ErroCarga msg={erro} onTentar={carregar} /> : <SkeletonCartao />;
  return (
    <div className="space-y-[var(--gap-block)]">
      {erro && <ErroCarga msg={erro} kind="warn" onTentar={carregar} />}
      <Integracao d={d} onSalvo={carregar} />
      <Importar d={d} onMudou={carregar} />
      <Contratos d={d} onSalvo={carregar} />
      <Unidades d={d} onSalvo={carregar} />
      <Historico leituras={d.leituras} contratos={d.contratos} onRecarregar={carregar} />
    </div>
  );
}

type Edicao = Omit<ConfigFrotaView, "segredoDefinido" | "testadoEm" | "empresasNoTeste"> & { clientSecret: string };
const edicaoDe = (c: ConfigFrotaView): Edicao => ({
  clientId: c.clientId,
  clientSecret: "",
  ativa: c.ativa,
  frequenciaMin: c.frequenciaMin,
  diasUteis: c.diasUteis,
  horaInicio: c.horaInicio,
  horaFim: c.horaFim,
  diasRecentes: c.diasRecentes,
  alertas: c.alertas,
});

/** As opções de um número (as da lista + a gravada, se for outra). */
const opcoes = (vals: number[], atual: number, rotulo: (n: number) => string) =>
  [...new Set([...vals, atual])]
    .sort((a, b) => a - b)
    .map((n) => (
      <option key={n} value={n}>
        {rotulo(n)}
      </option>
    ));

function Integracao({ d, onSalvo }: { d: Dados; onSalvo: () => void }) {
  const c = d.config;
  const [v, setV] = useState<Edicao | null>(null);
  const [salvando, setSalvando] = useState(false);
  const [testando, setTestando] = useState(false);
  const [empresas, setEmpresas] = useState<Empresa[] | null>(null);
  const muda = <K extends keyof Edicao>(k: K, x: Edicao[K]) => setV((o) => (o ? { ...o, [k]: x } : o));
  const alerta = (k: keyof Edicao["alertas"], x: number) => setV((o) => (o ? { ...o, alertas: { ...o.alertas, [k]: x } } : o));
  const motivo = v?.ativa && !c.segredoDefinido && !v.clientSecret ? "Informe o Client Secret antes de ligar a atualização automática." : null;
  const emErro = d.cursores.filter((k) => k.falhas > 0);

  async function salvar() {
    if (!v) return;
    setSalvando(true);
    try {
      await pedir("/api/admin/frota", { method: "PATCH", body: JSON.stringify(v) });
      toast.success("Configuração da Vólus salva.");
      setV(null);
      onSalvo();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setSalvando(false);
    }
  }
  async function testar() {
    setTestando(true);
    try {
      const j = await pedir<{ empresas: Empresa[] }>("/api/admin/frota/testar", { method: "POST" });
      setEmpresas(j.empresas);
      toast.success(`Conexão com a Vólus funcionando: ${j.empresas.length} contrato(s).`);
      onSalvo();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setTestando(false);
    }
  }

  return (
    <>
      <SecaoBanner
        titulo="Integração com a Vólus"
        acao={
          <span className="flex items-center gap-1.5">
            <Button size="sm" variant="secondary" icon={<IconRefresh className="h-4 w-4" />} loading={testando} disabled={!c.segredoDefinido} onClick={() => void testar()}>
              Testar conexão
            </Button>
            <Button size="sm" variant="secondary" icon={<IconPencil className="h-4 w-4" />} onClick={() => setV(edicaoDe(c))}>
              Editar
            </Button>
          </span>
        }
      >
        <p className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-[13px] text-text-2">
          <Badge tone={c.segredoDefinido ? "emerald" : "amber"} dot>
            {c.segredoDefinido ? "Credencial configurada" : "Sem credencial"}
          </Badge>
          <Badge tone={c.ativa ? "emerald" : "slate"} dot vivo={c.ativa}>
            {c.ativa ? "Automática ligada" : "Automática desligada"}
          </Badge>
          <span>
            {rotuloFreq(c.frequenciaMin)} · {hora(c.horaInicio)} às {hora(c.horaFim)}
            {c.diasUteis ? " · dias úteis" : ""} · relê {c.diasRecentes} dias
          </span>
          <span className="text-muted">{c.testadoEm ? `Testada em ${dataHoraBR(c.testadoEm)} · ${num(c.empresasNoTeste)} contrato(s)` : "Ainda não testada"}</span>
        </p>
        {!d.temChaveMestra && <Callout kind="warn">Defina a chave mestra (INTEGRACOES_CHAVE) no Cloudflare antes de salvar o segredo.</Callout>}
        {emErro.length > 0 && (
          <Callout kind="warn">
            {emErro.length} período(s) falharam na última tentativa automática:{" "}
            {emErro
              .slice(0, 3)
              .map((k) => `${codigoLegivel(k.contrato)} (${ROTULO_TIPO[k.tipo] ?? k.tipo}) — ${k.ultimoErro ?? "erro"}`)
              .join(" · ")}
          </Callout>
        )}
        {empresas && (
          <DataTable
            density="compact"
            rows={empresas}
            getKey={(e) => e.id}
            exportar={false}
            columns={[
              { key: "id", header: "Contrato", value: (e) => codigoLegivel(e.id), render: (e) => codigoLegivel(e.id), nowrap: true },
              { key: "nome", header: "Nome na Vólus", value: (e) => e.nome ?? "—", render: (e) => e.nome ?? "—", align: "left" },
              {
                key: "produto",
                header: "Produto provável",
                value: (e) => (e.produto ? ROTULO_PRODUTO[e.produto] : "—"),
                render: (e) => (e.produto ? ROTULO_PRODUTO[e.produto] : "—"),
                nowrap: true,
              },
              {
                key: "cad",
                header: "No cadastro",
                value: (e) => (e.cadastrado ? "Sim" : "Não"),
                render: (e) => (e.cadastrado ? <Badge tone="emerald">Cadastrado</Badge> : <Badge tone="amber">Falta</Badge>),
                nowrap: true,
              },
            ]}
          />
        )}
      </SecaoBanner>
      <Modal
        open={!!v}
        onClose={() => !salvando && setV(null)}
        bloqueado={salvando}
        size="lg"
        titulo="Integração com a Vólus"
        rodape={
          <div className="flex w-full items-center justify-between gap-2">
            <span className="text-[12px] text-danger">{motivo}</span>
            <span className="flex gap-2">
              <Button size="sm" variant="secondary" onClick={() => setV(null)} disabled={salvando}>
                Cancelar
              </Button>
              <Button size="sm" onClick={() => void salvar()} loading={salvando} disabled={!!motivo}>
                Salvar
              </Button>
            </span>
          </div>
        }
      >
        {v && (
          <div className="space-y-[var(--gap-block)]">
            <SecaoBanner titulo="Credencial">
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <TextField
                  denso
                  label="Client ID"
                  icon={<IconKey className="h-5 w-5" />}
                  value={v.clientId}
                  onChange={(e) => muda("clientId", e.target.value)}
                  autoComplete="off"
                  rotuloExtra={
                    <Ajuda titulo="Client ID" compacta>
                      O identificador de parceiro que a Vólus fornece.
                    </Ajuda>
                  }
                />
                <PasswordField
                  denso
                  label="Client Secret"
                  value={v.clientSecret}
                  onChange={(e) => muda("clientSecret", e.target.value)}
                  placeholder={c.segredoDefinido ? "Definido — vazio mantém" : "Não definido"}
                  autoComplete="new-password"
                  rotuloExtra={
                    <Ajuda titulo="Client Secret" compacta>
                      Guardado CIFRADO e nunca reexibido. Preencha só para trocar.
                    </Ajuda>
                  }
                />
              </div>
            </SecaoBanner>
            <SecaoBanner titulo="Atualização automática">
              <div className="flex flex-wrap items-center gap-1">
                <Switch checked={v.ativa} onChange={(x) => muda("ativa", x)} label="Ligada" dica="Lê a Vólus sozinha, em segundo plano." />
                <Ajuda titulo="Atualização automática" compacta>
                  <p>
                    Ligada, cada execução lê UM período de um contrato (o mais atrasado), relendo os últimos dias escolhidos — a Vólus corrige e
                    fatura transações depois. Grava só o que mudou; o que some da Vólus em duas leituras seguidas sai.
                  </p>
                  <p>Falha passageira espera e tenta de novo; credencial recusada espera 6 h.</p>
                </Ajuda>
              </div>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <SelectField
                  denso
                  label="Frequência"
                  value={String(v.frequenciaMin)}
                  onChange={(e) => muda("frequenciaMin", Number(e.target.value))}
                  rotuloExtra={
                    <Ajuda titulo="Frequência" compacta>
                      De quanto em quanto tempo cada contrato é relido, dentro do horário.
                    </Ajuda>
                  }
                >
                  {opcoes(OPCOES_FREQUENCIA_FROTA, v.frequenciaMin, rotuloFreq)}
                </SelectField>
                <SelectField
                  denso
                  label="Reler os últimos"
                  value={String(v.diasRecentes)}
                  onChange={(e) => muda("diasRecentes", Number(e.target.value))}
                  rotuloExtra={
                    <Ajuda titulo="Reler os últimos" compacta>
                      Quantos dias para trás cada ciclo confere de novo.
                    </Ajuda>
                  }
                >
                  {opcoes(OPCOES_DIAS_RECENTES, v.diasRecentes, (n) => `${n} dias`)}
                </SelectField>
                <SelectField
                  denso
                  label="Das"
                  value={String(v.horaInicio)}
                  onChange={(e) => {
                    const ini = Number(e.target.value);
                    setV((o) => (o ? { ...o, horaInicio: ini, horaFim: Math.max(o.horaFim, ini + 1) } : o));
                  }}
                  rotuloExtra={
                    <Ajuda titulo="Horário" compacta>
                      A leitura só acontece entre esses horários (Brasília).
                    </Ajuda>
                  }
                >
                  {opcoes([...Array(24).keys()], v.horaInicio, hora)}
                </SelectField>
                <SelectField
                  denso
                  label="Até"
                  value={String(v.horaFim)}
                  onChange={(e) => muda("horaFim", Number(e.target.value))}
                  rotuloExtra={
                    <Ajuda titulo="Horário" compacta>
                      A leitura só acontece entre esses horários (Brasília).
                    </Ajuda>
                  }
                >
                  {opcoes(
                    [...Array(24).keys()].map((h) => h + 1).filter((h) => h > v.horaInicio),
                    v.horaFim,
                    hora,
                  )}
                </SelectField>
              </div>
              <div className="flex items-center gap-1">
                <Switch checked={v.diasUteis} onChange={(x) => muda("diasUteis", x)} label="Só em dias úteis" />
                <Ajuda titulo="Dias úteis" compacta>
                  Ligado: não lê aos sábados e domingos.
                </Ajuda>
              </div>
            </SecaoBanner>
            <SecaoBanner titulo="Limites dos alertas">
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                <SelectField
                  denso
                  label="Consumo fora do padrão"
                  value={String(v.alertas.consumoPct)}
                  onChange={(e) => alerta("consumoPct", Number(e.target.value))}
                  rotuloExtra={
                    <Ajuda titulo="Consumo" compacta>
                      O km/l que se afasta da mediana do PRÓPRIO veículo além deste percentual.
                    </Ajuda>
                  }
                >
                  {opcoes([20, 30, 40, 50, 75, 100], v.alertas.consumoPct, (n) => `±${n}%`)}
                </SelectField>
                <SelectField
                  denso
                  label="Preço do litro"
                  value={String(v.alertas.precoPct)}
                  onChange={(e) => alerta("precoPct", Number(e.target.value))}
                  rotuloExtra={
                    <Ajuda titulo="Preço do litro" compacta>
                      O preço que se afasta da mediana do MESMO combustível no mês além deste percentual.
                    </Ajuda>
                  }
                >
                  {opcoes([10, 15, 20, 30, 50], v.alertas.precoPct, (n) => `±${n}%`)}
                </SelectField>
                <SelectField
                  denso
                  label="Abastecimentos próximos"
                  value={String(v.alertas.horasEntre)}
                  onChange={(e) => alerta("horasEntre", Number(e.target.value))}
                  rotuloExtra={
                    <Ajuda titulo="Abastecimentos próximos" compacta>
                      Dois abastecimentos do mesmo veículo com menos que estas horas entre eles.
                    </Ajuda>
                  }
                >
                  {opcoes([0, 1, 2, 3, 6, 12, 24], v.alertas.horasEntre, (n) => (n ? `Menos de ${n} h` : "Não avisar"))}
                </SelectField>
                <SelectField
                  denso
                  label="Litros acima do tanque"
                  value={String(v.alertas.tanquePct)}
                  onChange={(e) => alerta("tanquePct", Number(e.target.value))}
                  rotuloExtra={
                    <Ajuda titulo="Tanque" compacta>
                      Litros acima da capacidade cadastrada do tanque mais esta folga.
                    </Ajuda>
                  }
                >
                  {opcoes([0, 5, 10, 20, 30], v.alertas.tanquePct, (n) => `Folga de ${n}%`)}
                </SelectField>
                <SelectField
                  denso
                  label="Km entre abastecimentos"
                  value={String(v.alertas.kmMaximo)}
                  onChange={(e) => alerta("kmMaximo", Number(e.target.value))}
                  rotuloExtra={
                    <Ajuda titulo="Km" compacta>
                      Km rodado entre dois abastecimentos acima deste valor (hodômetro digitado errado).
                    </Ajuda>
                  }
                >
                  {opcoes([500, 1000, 1500, 2000, 3000, 5000], v.alertas.kmMaximo, (n) => `Acima de ${num(n)} km`)}
                </SelectField>
              </div>
            </SecaoBanner>
          </div>
        )}
      </Modal>
    </>
  );
}

function Importar({ d, onMudou }: { d: Dados; onMudou: () => void }) {
  const anoAtual = new Date().getFullYear();
  const ativos = d.contratos.filter((c) => c.ativo);
  const [ano, setAno] = useState(anoAtual);
  const [escolhidos, setEscolhidos] = useState<string[]>([]);
  const { confirmar, confirmacao } = useConfirmacao();
  const alvo = escolhidos.length ? ativos.filter((c) => escolhidos.includes(c.codigo)) : ativos;
  // A importação da frota desta aba (a em curso, ou a última) — a MESMA do painel do canto: sair da tela não a interrompe.
  const imp = useImportacoesLocais().filter((i) => i.tipo === TIPO_FROTA).at(-1) ?? null;
  const rodando = imp?.estado === "rodando";

  async function rodar() {
    if (rodando) return;
    if (!(await confirmar({ titulo: `Importar ${ano}?`, texto: `${alvo.length} contrato(s), mês a mês. Grava só o que mudou — repetir não duplica. O andamento segue no canto inferior direito se sair da tela.`, confirmar: "Importar" }))) return;
    const r = await importarFrota({ ano, contratos: alvo }).fim;
    if (r.falhas.length) toast.warning(`Importação de ${ano} com ${r.falhas.length} falha(s) — veja o histórico.`);
    else toast.success(`Importação de ${ano} ${r.interrompido ? "interrompida" : "concluída"}: ${num(r.novos)} novos, ${num(r.alterados)} alterados.`);
    onMudou();
  }

  return (
    <SecaoBanner
      titulo="Importar um ano"
      acao={
        <Ajuda titulo="Importar da Vólus" botao="sm">
          Lê o ano escolhido mês a mês (cada contrato e cada produto); um mês grande demais é dividido sozinho. Grava só o que mudou — repetir
          não duplica. Pode sair da tela: o andamento segue no canto.
        </Ajuda>
      }
    >
      {ativos.length === 0 ? (
        <p className="text-sm text-muted">Nenhum contrato ativo — cadastre os contratos abaixo.</p>
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-2">
            <SelectField compacto label="Ano" value={String(ano)} onChange={(e) => setAno(Number(e.target.value))} disabled={rodando}>
              {[...Array(anoAtual - 2019).keys()].map((i) => (
                <option key={i} value={anoAtual - i}>
                  {anoAtual - i}
                </option>
              ))}
            </SelectField>
            <div className="min-w-56 flex-1">
              <SeletorMultiplo
                suspenso
                rotulo="Contratos"
                textoVazio="Todos os ativos"
                opcoes={ativos.map((c) => ({ valor: c.codigo, rotulo: c.sigla || codigoLegivel(c.codigo), detalhe: `${c.nome} · ${ROTULO_PRODUTO[c.produto]}` }))}
                selecionados={escolhidos}
                onChange={setEscolhidos}
              />
            </div>
            {rodando ? (
              <Button size="sm" variant="secondary" onClick={() => imp?.parar()}>
                Parar
              </Button>
            ) : (
              <Button size="sm" icon={<IconPlay className="h-4 w-4" />} onClick={() => void rodar()} disabled={!d.config.segredoDefinido}>
                Importar
              </Button>
            )}
          </div>
          {imp && <AndamentoImportacao imp={imp} />}
        </>
      )}
      {confirmacao}
    </SecaoBanner>
  );
}

/** Os CONTRATOS da Vólus: a tabela + o `BannerCadastro` do sistema (o código, a sigla, o nome, o produto, o órgão, ativo). */
function Contratos({ d, onSalvo }: { d: Dados; onSalvo: () => void }) {
  const [aberto, setAberto] = useState<Contrato | "novo" | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const { confirmar, confirmacao } = useConfirmacao();
  const orgao = (id: number | null) => d.orgaos.find((o) => o.id === id);
  const nomeOrgao = (id: number | null) => orgao(id)?.sigla || orgao(id)?.nome || "—";
  const atual = aberto === "novo" ? null : aberto;
  const inicial: Record<string, string> = atual
    ? { codigo: atual.codigo, sigla: atual.sigla, nome: atual.nome, produto: atual.produto, orgaoId: atual.orgaoId == null ? "" : String(atual.orgaoId), ativo: atual.ativo ? "1" : "0" }
    : { codigo: "", sigla: "", nome: "", produto: "combustivel", orgaoId: "", ativo: "1" };

  async function salvar(patch: Record<string, string>) {
    const f = { ...inicial, ...patch };
    const codigo = f.codigo.replace(/\D/g, "");
    if (codigo.length !== 12) {
      toast.error("O código do contrato tem 12 dígitos.");
      return false;
    }
    if (aberto === "novo" && d.contratos.some((c) => c.codigo === codigo)) {
      toast.error("Contrato já cadastrado.");
      return false;
    }
    const c: Contrato = { codigo, sigla: f.sigla.trim(), nome: f.nome.trim(), produto: f.produto as ProdutoContrato, orgaoId: f.orgaoId ? Number(f.orgaoId) : null, ativo: f.ativo === "1" };
    setOcupado(true);
    try {
      await pedir("/api/admin/frota/contratos", { method: "PUT", body: JSON.stringify({ contratos: [...d.contratos.filter((x) => x.codigo !== codigo), c] }) });
      toast.success("Contrato salvo.");
      setAberto(null);
      onSalvo();
      return true;
    } catch (e) {
      toast.error((e as Error).message);
      return false;
    } finally {
      setOcupado(false);
    }
  }

  return (
    <SecaoBanner
      titulo={`Contratos (${d.contratos.length})`}
      acao={
        <Button size="sm" variant="secondary" icon={<IconPlus className="h-4 w-4" />} onClick={() => setAberto("novo")}>
          Novo contrato
        </Button>
      }
    >
      <DataTable
        density="compact"
        rows={d.contratos}
        getKey={(c) => c.codigo}
        onRowClick={setAberto}
        exportar={{ nome: "Contratos da Vólus" }}
        columns={[
          { key: "codigo", header: "Contrato", value: (c) => codigoLegivel(c.codigo), render: (c) => codigoLegivel(c.codigo), nowrap: true },
          { key: "sigla", header: "Sigla", value: (c) => c.sigla || "—", render: (c) => c.sigla || "—", nowrap: true },
          { key: "nome", header: "Nome", value: (c) => c.nome || "—", render: (c) => <CelulaTexto texto={c.nome || "—"} />, align: "left", minWidth: 180 },
          { key: "produto", header: "Produto", value: (c) => ROTULO_PRODUTO[c.produto], render: (c) => ROTULO_PRODUTO[c.produto], nowrap: true },
          { key: "orgao", header: "Órgão", value: (c) => nomeOrgao(c.orgaoId), render: (c) => nomeOrgao(c.orgaoId), nowrap: true },
          {
            key: "ativo",
            header: "Situação",
            value: (c) => (c.ativo ? "Ativo" : "Inativo"),
            render: (c) => (
              <Badge tone={c.ativo ? "emerald" : "slate"} dot>
                {c.ativo ? "Ativo" : "Inativo"}
              </Badge>
            ),
            nowrap: true,
          },
        ]}
      />
      <BannerCadastro
        aberto={aberto != null}
        novo={aberto === "novo"}
        titulo={atual ? `Contrato ${codigoLegivel(atual.codigo)}` : "Novo contrato"}
        ocupado={ocupado}
        inicial={inicial}
        confirmarDescarte={() => confirmar({ titulo: "Descartar as alterações?", confirmar: "Descartar", cancelar: "Continuar editando" })}
        onFechar={() => setAberto(null)}
        onSalvar={salvar}
        campos={[
          ...(aberto === "novo"
            ? [
                {
                  chave: "codigo",
                  label: "Código do contrato",
                  mono: true,
                  max: 12,
                  obrigatorio: true,
                  inputMode: "numeric" as const,
                  filtro: (x: string) => x.replace(/\D/g, ""),
                  dica: "12 dígitos (ex.: 000617000123).",
                },
              ]
            : []),
          { chave: "sigla", label: "Sigla", max: 20 },
          { chave: "nome", label: "Nome", max: 200, span: true },
          { chave: "produto", label: "Produto", opcoes: Object.entries(ROTULO_PRODUTO).map(([valor, rotulo]) => ({ valor, rotulo })) },
          {
            chave: "orgaoId",
            label: "Órgão",
            opcoes: [{ valor: "", rotulo: "Sem órgão" }, ...d.orgaos.map((o) => ({ valor: String(o.id), rotulo: o.sigla ? `${o.sigla} — ${o.nome}` : o.nome }))],
          },
          {
            chave: "ativo",
            label: "Situação",
            opcoes: [
              { valor: "1", rotulo: "Ativo (lido pela importação)" },
              { valor: "0", rotulo: "Inativo" },
            ],
          },
        ]}
      />
      {confirmacao}
    </SecaoBanner>
  );
}

/** As UNIDADES da Vólus ligadas às do cadastro: o `SeletorCelula` na própria linha grava na hora. */
function Unidades({ d, onSalvo }: { d: Dados; onSalvo: () => void }) {
  const [salvando, setSalvando] = useState<string | null>(null);
  const sem = d.unidades.filter((u) => u.reparticaoId == null).length;
  const opcoesUnidade = d.reparticoes.map((r) => ({ id: r.id, nome: `${r.codigo} — ${r.nome}` }));
  const nome = (id: number | null) => opcoesUnidade.find((o) => o.id === id)?.nome ?? "Sem unidade";
  async function ligar(chave: string, reparticaoId: number | null) {
    setSalvando(chave);
    try {
      await pedir("/api/admin/frota/unidades", { method: "PUT", body: JSON.stringify({ unidades: [{ chave, reparticaoId }] }) });
      onSalvo();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setSalvando(null);
    }
  }
  return (
    <SecaoBanner
      titulo={`Unidades da Vólus (${d.unidades.length})`}
      acao={
        <Ajuda titulo="Unidades da Vólus" botao="sm">
          Cada transação traz a unidade (centro de custo) da Vólus. Ligue cada uma à unidade do cadastro: é o que decide quem vê cada registro (a
          unidade do cabeçalho). Sem ligação, o registro fica no órgão do contrato.
        </Ajuda>
      }
    >
      {sem > 0 && <Callout kind="warn">{sem} unidade(s) da Vólus sem a unidade do cadastro.</Callout>}
      <DataTable
        density="compact"
        rows={d.unidades}
        getKey={(u) => u.chave}
        exportar={{ nome: "Unidades da Vólus" }}
        linhasSalvas="frota-unidades"
        columns={[
          { key: "nome", header: "Unidade na Vólus", value: (u) => u.nome, render: (u) => <CelulaTexto texto={u.nome} />, align: "left", minWidth: 200 },
          { key: "contrato", header: "Contrato", value: (u) => codigoLegivel(u.contrato), render: (u) => codigoLegivel(u.contrato), nowrap: true },
          { key: "registros", header: "Registros", filter: "range", numero: (u) => u.registros, render: (u) => num(u.registros), formatarFaixa: num },
          {
            key: "rep",
            header: "Unidade do cadastro",
            value: (u) => nome(u.reparticaoId),
            render: (u) => (
              <SeletorCelula
                valor={u.reparticaoId}
                opcoes={opcoesUnidade}
                vazio="Sem unidade"
                salvando={salvando === u.chave}
                ariaLabel={`Unidade do cadastro de ${u.nome}`}
                onChange={(id) => void ligar(u.chave, id)}
              />
            ),
            nowrap: true,
          },
        ]}
      />
    </SecaoBanner>
  );
}

function Historico({ leituras, contratos, onRecarregar }: { leituras: Leitura[]; contratos: Contrato[]; onRecarregar: () => void }) {
  const sigla = (c: string) => contratos.find((x) => x.codigo === c)?.sigla || codigoLegivel(c);
  const contagem = (k: "registros" | "novos" | "alterados" | "removidos", header: string) => ({
    key: k,
    header,
    filter: "range" as const,
    numero: (l: Leitura) => l[k],
    render: (l: Leitura) => num(l[k]),
    formatarFaixa: num,
  });
  const origem = (l: Leitura) => (l.origem === "auto" ? "Automática" : "Manual");
  return (
    <SecaoBanner
      titulo="Histórico das leituras"
      acao={
        <Button size="sm" variant="secondary" icon={<IconRefresh className="h-4 w-4" />} onClick={onRecarregar}>
          Recarregar
        </Button>
      }
    >
      <DataTable
        density="compact"
        rows={leituras}
        getKey={(l) => l.id}
        exportar={{ nome: "Leituras da Vólus" }}
        linhasSalvas="frota-leituras"
        ocultasPadrao={["bytes", "por"]}
        columns={[
          { key: "em", header: "Quando", filter: "date", value: (l) => l.em, render: (l) => dataHoraBR(l.em), nowrap: true },
          { key: "contrato", header: "Contrato", value: (l) => sigla(l.contrato), render: (l) => sigla(l.contrato), nowrap: true },
          { key: "tipo", header: "Tipo", value: (l) => ROTULO_TIPO[l.tipo] ?? l.tipo, render: (l) => ROTULO_TIPO[l.tipo] ?? l.tipo, nowrap: true },
          { key: "periodo", header: "Período", value: (l) => l.inicio, render: (l) => `${dataBR(l.inicio)} a ${dataBR(l.fim)}`, nowrap: true },
          { key: "origem", header: "Origem", value: origem, render: origem, nowrap: true },
          {
            key: "estado",
            header: "Resultado",
            value: (l) => (l.estado === "ok" ? "Ok" : "Erro"),
            render: (l) =>
              l.estado === "ok" ? (
                <Badge tone="emerald">Ok</Badge>
              ) : (
                <Badge tone="red" title={l.erro ?? undefined}>
                  Erro
                </Badge>
              ),
            nowrap: true,
          },
          contagem("registros", "Registros"),
          contagem("novos", "Novos"),
          contagem("alterados", "Alterados"),
          contagem("removidos", "Removidos"),
          { key: "bytes", header: "Tamanho", value: (l) => formatBytes(l.bytes), render: (l) => formatBytes(l.bytes), nowrap: true, total: false },
          { key: "erro", header: "Erro", value: (l) => l.erro ?? "", render: (l) => <CelulaTexto texto={l.erro ?? ""} />, align: "left", minWidth: 160 },
          { key: "por", header: "Por", value: (l) => l.por ?? "—", render: (l) => l.por ?? "—", nowrap: true },
        ]}
      />
    </SecaoBanner>
  );
}
