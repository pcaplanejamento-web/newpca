"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { type ConfigAcessoConta, LIMITE_MAX, LIMITE_MIN, type ModoImplantacao, OPCOES_FECHAR_ACEITE, OPCOES_TROCA_DIAS } from "@/lib/acesso-conta-core";
import { baixarDocumentoPdf } from "@/lib/documento-pdf";
import { blocosDoTexto, dataHoraBR, MAX_TEXTO_ADM } from "@/lib/termo-uso-core";
import { TextoTermo } from "./AceiteTermo";
import { Ajuda, TopicoAjuda } from "./Ajuda";
import { Badge } from "./Badge";
import { Button } from "./Button";
import { Callout } from "./Callout";
import { useConfirmacao } from "./Confirmacao";
import { type Column, DataTable } from "./DataTable";
import { ErroCarga } from "./ErroCarga";
import { SelectField, TextField } from "./Field";
import { IconAparelho, IconDownload, IconEye, IconSave, IconTermo } from "./icons";
import { Modal } from "./Modal";
import { Segmented } from "./Segmented";
import { SeletorMultiplo } from "./SeletorMultiplo";
import { SkeletonLinhas } from "./Skeleton";
import { Switch } from "./Switch";
import { EditorRico } from "./EditorRico";
import { toast } from "./Toast";

type Versao = { id: number; versao: number; titulo: string; estado: string; publicadoEm: string | null; publicadoPor: string | null; hash: string | null; aceites: number; aceitesTeste: number; pendentes: number };
type Dados = { config: ConfigAcessoConta; rascunho: { id: number | null; versao: number; titulo: string; textoAdm: string }; versoes: Versao[]; vigenteId: number | null; desatualizado: boolean };
type Pessoa = { id: number; nome: string; email: string; status: string };
type Ref = { id: number; nome: string };
type Publico = "todos" | "papeis" | "grupos" | "pessoas";

async function chamar<T>(url: string, metodo = "GET", corpo?: unknown): Promise<T & { ok: true }> {
  const r = await fetch(url, { method: metodo, headers: corpo ? { "Content-Type": "application/json" } : undefined, body: corpo ? JSON.stringify(corpo) : undefined, cache: "no-store" });
  const j = (await r.json().catch(() => ({}))) as T & { ok?: boolean; error?: string };
  if (!r.ok || !j.ok) throw Object.assign(new Error(j.error ?? "Falha na operação."), { corpo: j, status: r.status });
  return j as T & { ok: true };
}

const MODOS: { value: ModoImplantacao; label: string; dica: string }[] = [
  { value: "desligado", label: "Desligado", dica: "Nenhuma regra nova vale — dá para escrever e conferir o termo" },
  { value: "teste", label: "Teste", dica: "Termo e aparelhos valem só para os testadores escolhidos" },
  { value: "ativo", label: "Ativo", dica: "Termo e aparelhos valem para toda a plataforma" },
];

/** Os CAMPOS da implantação e dos aparelhos (controlados) — a tela do ADM e o catálogo. */
export function CamposAcessoConta({ valor, onChange, pessoas, papeis }: { valor: ConfigAcessoConta; onChange: (v: ConfigAcessoConta) => void; pessoas: Pessoa[]; papeis: Ref[] }) {
  const set = (p: Partial<ConfigAcessoConta>) => onChange({ ...valor, ...p });
  const limites = Array.from({ length: LIMITE_MAX - LIMITE_MIN + 1 }, (_, i) => LIMITE_MIN + i);
  return (
    <div className="space-y-[var(--gap-block)]">
      <section className="space-y-3">
        <p className="text-[13px] font-semibold text-text-2">Implantação</p>
        <Segmented ariaLabel="Implantação" value={valor.modo} options={MODOS} onChange={(modo) => set({ modo })} />
        {valor.modo !== "desligado" && (
          <div className="space-y-3">
            <SeletorMultiplo
              rotulo={valor.modo === "ativo" ? "Testadores (ensaio de versões novas)" : "Testadores"}
              suspenso
              textoVazio="Ninguém"
              opcoes={pessoas.filter((p) => p.status === "ativo").map((p) => ({ valor: String(p.id), rotulo: p.nome, detalhe: p.email }))}
              selecionados={valor.testadores.map(String)}
              onChange={(v) => set({ testadores: v.map(Number) })}
            />
            {valor.modo === "teste" && (
            <Switch
              checked={valor.repetirAoEntrar}
              onChange={(repetirAoEntrar) => set({ repetirAoEntrar })}
              label="Repetir a cada login"
              dica="Cada login do testador começa do zero: aceita o termo e nomeia o aparelho de novo (sem prazo de troca)"
            />
            )}
          </div>
        )}
      </section>
      <section className="space-y-3">
        <p className="text-[13px] font-semibold text-text-2">Aparelhos por conta</p>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          <SelectField compacto label="Limite padrão" value={String(valor.limite)} onChange={(e) => set({ limite: Number(e.target.value) })}>
            {limites.map((n) => (
              <option key={n} value={n}>
                {n} aparelho{n === 1 ? "" : "s"}
              </option>
            ))}
          </SelectField>
          <SelectField compacto label="Sem nova troca por" value={String(valor.trocaDias)} onChange={(e) => set({ trocaDias: Number(e.target.value) })}>
            {OPCOES_TROCA_DIAS.map((d) => (
              <option key={d} value={d}>
                {d === 0 ? "Sem prazo" : `${d} dia${d === 1 ? "" : "s"}`}
              </option>
            ))}
          </SelectField>
          <SelectField compacto label="Aceite fecha em" title="O banner “Termo de Uso aceito” fecha sozinho depois desse tempo" value={String(valor.fecharAceiteS)} onChange={(e) => set({ fecharAceiteS: Number(e.target.value) })}>
            {OPCOES_FECHAR_ACEITE.map((s) => (
              <option key={s} value={s}>
                {s === 0 ? "Não fecha sozinho" : `${s} segundos`}
              </option>
            ))}
          </SelectField>
        </div>
        <Switch checked={valor.isentarAdm} onChange={(isentarAdm) => set({ isentarAdm })} label="Administrador fora do limite" dica="O Administrador não tem limite de aparelhos (no teste, o ADM testador segue as regras)" />
        {papeis.length > 0 && (
          <div className="space-y-2">
            <p className="text-[13px] font-semibold text-text-2">Limite por papel</p>
            <p className="text-[12px] text-muted">Vale mais que o padrão; o limite de cada pessoa (no banner do usuário) vale mais que todos.</p>
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {papeis.map((p) => {
                const atual = valor.porPapel[String(p.id)];
                return (
                  <SelectField
                    compacto
                    key={p.id}
                    label={p.nome}
                    value={atual ? String(atual) : ""}
                    onChange={(e) => {
                      const porPapel = { ...valor.porPapel };
                      if (e.target.value) porPapel[String(p.id)] = Number(e.target.value);
                      else delete porPapel[String(p.id)];
                      set({ porPapel });
                    }}
                  >
                    <option value="">Padrão ({valor.limite})</option>
                    {limites.map((n) => (
                      <option key={n} value={n}>
                        {n} aparelho{n === 1 ? "" : "s"}
                      </option>
                    ))}
                  </SelectField>
                );
              })}
            </div>
          </div>
        )}
      </section>
      <section className="space-y-3">
        <p className="text-[13px] font-semibold text-text-2">Encarregado pelos dados pessoais (LGPD)</p>
        <div className="grid gap-3 sm:grid-cols-3">
          <TextField label="Nome" value={valor.encarregado.nome} maxLength={120} onChange={(e) => set({ encarregado: { ...valor.encarregado, nome: e.target.value } })} />
          <TextField label="E-mail" value={valor.encarregado.email} maxLength={160} onChange={(e) => set({ encarregado: { ...valor.encarregado, email: e.target.value } })} />
          <TextField label="Telefone" value={valor.encarregado.telefone} maxLength={40} onChange={(e) => set({ encarregado: { ...valor.encarregado, telefone: e.target.value } })} />
        </div>
      </section>
    </div>
  );
}

/** Baixa o TEXTO INTEGRAL de uma versão em PDF (a "impressão" do ADM — o bloqueio de impressão não afeta). */
async function baixarTermo(titulo: string, versao: number, texto: string) {
  await baixarDocumentoPdf(`termo-de-uso-v${versao}.pdf`, { titulo: `${titulo} — versão ${versao}`, blocos: blocosDoTexto(texto) });
}

const COLUNAS: Column<Versao>[] = [
  { key: "v", header: "Versão", render: (v) => `v${v.versao}`, value: (v) => String(v.versao), nowrap: true },
  { key: "e", header: "Estado", render: (v) => <Badge tone={v.estado === "publicado" ? "emerald" : "amber"}>{v.estado === "publicado" ? "Publicada" : "Rascunho"}</Badge>, value: (v) => v.estado, nowrap: true },
  { key: "t", header: "Título", render: (v) => v.titulo, value: (v) => v.titulo, align: "left" },
  { key: "p", header: "Publicada em", render: (v) => (v.publicadoEm ? dataHoraBR(v.publicadoEm) : "—"), value: (v) => v.publicadoEm ?? "", nowrap: true },
  { key: "por", header: "Por", render: (v) => v.publicadoPor ?? "—", value: (v) => v.publicadoPor ?? "" },
  { key: "a", header: "Aceites", render: (v) => `${v.aceites}${v.aceitesTeste ? ` (+${v.aceitesTeste} teste)` : ""}`, numero: (v) => v.aceites, nowrap: true },
  { key: "pe", header: "Pendentes", render: (v) => v.pendentes, numero: (v) => v.pendentes, nowrap: true },
];

type Situacao = {
  termo: { id: number; versao: number; titulo: string; texto: string | null; hash: string | null };
  aceites: { id: number; usuarioId: number | null; nome: string; matricula: string; unidade: string; em: string; metodo: string; ip: string; aparelho: string; teste: boolean; codigo: string }[];
  pendentes: { usuarioId: number; nome: string; matricula: string | null; prazo: string }[];
};

/** Configurações → TERMO DE USO (ADM): a implantação (Desligado · Teste · Ativo), os aparelhos por conta, o texto com as
 * cláusulas automáticas, a publicação com o público e a carência, e as versões com quem aceitou. */
export function TermoUsoAdmin() {
  const [d, setD] = useState<Dados | null>(null);
  const [cfg, setCfg] = useState<ConfigAcessoConta | null>(null);
  const [titulo, setTitulo] = useState("");
  const [texto, setTexto] = useState("");
  const [pessoas, setPessoas] = useState<Pessoa[]>([]);
  const [papeis, setPapeis] = useState<Ref[]>([]);
  const [grupos, setGrupos] = useState<Ref[]>([]);
  const [erro, setErro] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState<string | null>(null);
  const [previa, setPrevia] = useState<string | null>(null);
  const [publicar, setPublicar] = useState<{ termoId: number | null } | null>(null);
  const [publico, setPublico] = useState<Publico>("todos");
  const [ids, setIds] = useState<string[]>([]);
  const [versaoAberta, setVersaoAberta] = useState<Situacao | null>(null);
  const { confirmar, confirmacao } = useConfirmacao();

  const carregar = useCallback(() => {
    chamar<Dados>("/api/admin/termo")
      .then((j) => {
        setD(j);
        setCfg(j.config);
        setTitulo(j.rascunho.titulo);
        setTexto(j.rascunho.textoAdm);
        setErro(null);
      })
      .catch((e) => setErro((e as Error).message));
  }, []);
  useEffect(() => {
    carregar();
    chamar<{ usuarios: Pessoa[]; papeis: Ref[]; grupos: Ref[] }>("/api/admin/usuarios")
      .then((j) => {
        setPessoas(j.usuarios);
        setPapeis(j.papeis.map((p) => ({ id: p.id, nome: p.nome })));
        setGrupos(j.grupos.map((g) => ({ id: g.id, nome: g.nome })));
      })
      .catch(() => {});
  }, [carregar]);

  const cfgMudou = useMemo(() => !!d && !!cfg && JSON.stringify(d.config) !== JSON.stringify(cfg), [d, cfg]);
  const textoMudou = !!d && (titulo !== d.rascunho.titulo || texto !== d.rascunho.textoAdm || !d.rascunho.id);

  if (erro && !d) return <ErroCarga msg={erro} onTentar={carregar} />;
  if (!d || !cfg) return <SkeletonLinhas linhas={6} />;

  async function salvarConfig(confirmarAtivo = false) {
    if (!cfg) return;
    setOcupado("config");
    try {
      await chamar("/api/admin/termo", "POST", { acao: "config", config: cfg, confirmarAtivo });
      toast.success("Configuração salva — vale em até 1 minuto.");
      carregar();
    } catch (e) {
      const c = (e as { corpo?: { precisaConfirmar?: boolean; afetados?: number } }).corpo;
      if (c?.precisaConfirmar) {
        const sim = await confirmar({
          titulo: "Liberar para toda a plataforma?",
          texto: `${c.afetados ?? 0} pessoa(s) ativa(s) passam a ter de aceitar o termo vigente e nomear os aparelhos. Os aceites e aparelhos do teste são apagados.`,
          confirmar: "Liberar",
          perigo: true,
        });
        if (sim) return salvarConfig(true);
      } else toast.error((e as Error).message);
    } finally {
      setOcupado(null);
    }
  }

  async function salvarTexto() {
    setOcupado("texto");
    try {
      await chamar("/api/admin/termo", "POST", { acao: "salvar", titulo, textoAdm: texto });
      toast.success("Rascunho salvo.");
      carregar();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setOcupado(null);
    }
  }

  async function verPrevia() {
    setOcupado("previa");
    try {
      const j = await chamar<{ texto: string }>("/api/admin/termo", "POST", { acao: "previa", titulo: titulo || "Termo de Uso", textoAdm: texto });
      setPrevia(j.texto);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setOcupado(null);
    }
  }

  async function confirmarPublicacao() {
    if (!publicar) return;
    const alvo = publico === "todos" ? { tipo: "todos" } : { tipo: publico, ids: ids.map(Number) };
    if (publico !== "todos" && !ids.length) return toast.error("Escolha quem precisa aceitar.");
    setOcupado("publicar");
    try {
      if (publicar.termoId) {
        await chamar("/api/admin/termo", "POST", { acao: "exigir", termoId: publicar.termoId, publico: alvo });
        toast.success("Aceite exigido.");
      } else {
        if (textoMudou) await chamar("/api/admin/termo", "POST", { acao: "salvar", titulo, textoAdm: texto });
        const j = await chamar<{ versao: number }>("/api/admin/termo", "POST", { acao: "publicar", publico: alvo });
        toast.success(`Versão ${j.versao} publicada.`);
      }
      setPublicar(null);
      carregar();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setOcupado(null);
    }
  }

  async function abrirVersao(v: Versao) {
    try {
      setVersaoAberta(await chamar<Situacao>(`/api/admin/termo/${v.id}`));
    } catch (e) {
      toast.error((e as Error).message);
    }
  }

  const opcoesPublico = publico === "papeis" ? papeis : publico === "grupos" ? grupos : pessoas.filter((p) => p.status === "ativo");

  return (
    <div className="space-y-[var(--gap-block)]">
      {confirmacao}
      <div className="space-y-[var(--gap-block)] rounded-card border border-border bg-surface p-[var(--pad-card)] shadow-ring">
        <div className="flex items-center gap-2">
          <p className="flex-1 text-[15px] font-semibold text-text">Termo de Uso e aparelhos</p>
          <Ajuda titulo="Termo de Uso e aparelhos">
            <TopicoAjuda icone={<IconTermo className="h-4 w-4" />} titulo="Implantação">
              Desligado: nada muda para ninguém — escreva e confira o termo. Teste: o termo e os aparelhos valem só para os testadores
              (o cadastro de pessoas novas não exige o termo; os aceites ficam marcados como TESTE). Ativo: vale para toda a
              plataforma — os aceites e aparelhos do teste são apagados e todos aceitam a versão oficial.
            </TopicoAjuda>
            <TopicoAjuda icone={<IconAparelho className="h-4 w-4" />} titulo="Aparelhos">
              Cada pessoa dá um nome ao aparelho no primeiro acesso por ele. Com o limite atingido, só entra um aparelho novo
              retirando outro; depois da troca, um novo aparelho só entra após o prazo — o administrador pode liberar antes.
            </TopicoAjuda>
            <TopicoAjuda titulo="Cláusulas automáticas">
              Aparelhos, sessão, registros, proteção de dados, presença e chat, e-mails, LGPD e o aceite eletrônico são escritos
              pelo sistema a partir das configurações do momento da publicação. Mudou uma configuração, publique uma versão nova.
            </TopicoAjuda>
          </Ajuda>
        </div>
        <CamposAcessoConta valor={cfg} onChange={setCfg} pessoas={pessoas} papeis={papeis} />
        <div className="flex justify-end">
          <Button size="sm" icon={<IconSave className="h-4 w-4" />} loading={ocupado === "config"} disabled={!cfgMudou || !!ocupado} onClick={() => salvarConfig()}>
            Salvar
          </Button>
        </div>
      </div>

      <div className="space-y-[var(--gap-block)] rounded-card border border-border bg-surface p-[var(--pad-card)] shadow-ring">
        <div className="flex flex-wrap items-center gap-2">
          <p className="flex-1 text-[15px] font-semibold text-text">Texto — versão {d.rascunho.versao}</p>
          {d.rascunho.id ? <Badge tone="amber">Rascunho salvo</Badge> : <Badge tone="slate">Modelo (não salvo)</Badge>}
        </div>
        {d.desatualizado && (
          <Callout kind="warn">As configurações mudaram depois da última publicação — as cláusulas automáticas da versão vigente estão desatualizadas. Publique uma versão nova.</Callout>
        )}
        <TextField label="Título" value={titulo} maxLength={120} onChange={(e) => setTitulo(e.target.value)} />
        <EditorRico rotulo="Texto do termo" valor={texto} onChange={setTexto} maxLength={MAX_TEXTO_ADM} />
        <p className="text-[12px] text-muted">As cláusulas automáticas (aparelhos, sessão, registros, LGPD…) entram no fim, na publicação. Veja na prévia.</p>
        <div className="flex flex-wrap justify-end gap-2">
          <Button size="sm" variant="secondary" icon={<IconEye className="h-4 w-4" />} loading={ocupado === "previa"} disabled={!!ocupado} onClick={verPrevia}>
            Prévia completa
          </Button>
          <Button size="sm" variant="secondary" icon={<IconSave className="h-4 w-4" />} loading={ocupado === "texto"} disabled={!textoMudou || !!ocupado || titulo.trim().length < 3 || !texto.trim()} onClick={salvarTexto}>
            Salvar rascunho
          </Button>
          <Button size="sm" icon={<IconTermo className="h-4 w-4" />} disabled={!!ocupado || titulo.trim().length < 3 || !texto.trim()} onClick={() => setPublicar({ termoId: null })}>
            Publicar versão {d.rascunho.versao}
          </Button>
        </div>
      </div>

      <div className="rounded-card border border-border bg-surface p-[var(--pad-card)] shadow-ring">
        <p className="mb-3 text-[15px] font-semibold text-text">Versões</p>
        <DataTable columns={COLUNAS} rows={d.versoes} getKey={(v) => v.id} density="compact" pageSize={10} onRowClick={abrirVersao} exportar={{ nome: "Versões do Termo de Uso" }} vazio="Nenhuma versão ainda — escreva o texto e publique." />
      </div>

      <Modal open={previa != null} onClose={() => setPrevia(null)} titulo="Prévia do Termo de Uso" size="xl">
        {previa && <TextoTermo texto={previa} />}
      </Modal>

      <Modal
        open={publicar != null}
        onClose={() => setPublicar(null)}
        titulo={publicar?.termoId ? "Exigir o aceite de novo" : `Publicar a versão ${d.rascunho.versao}`}
        size="lg"
        rodape={
          <div className="flex justify-end">
            <Button size="sm" loading={ocupado === "publicar"} onClick={confirmarPublicacao} icon={<IconTermo className="h-4 w-4" />}>
              {publicar?.termoId ? "Exigir" : "Publicar"}
            </Button>
          </div>
        }
      >
        <div className="space-y-4">
          {cfg.modo === "desligado" && <Callout kind="info">A implantação está desligada: a versão fica publicada, mas ninguém precisa aceitá-la até o Teste ou o Ativo.</Callout>}
          {cfg.modo === "teste" && <Callout kind="info">Modo de teste: só os testadores escolhidos recebem a pendência.</Callout>}
          {cfg.modo === "ativo" && cfg.testadores.length > 0 && (
            <div className="flex flex-wrap items-center gap-2 text-[12px] text-muted">
              <span className="flex-1">Ensaio: exija primeiro só dos testadores; depois, use "Exigir de novo" para Todos.</span>
              <Button
                size="sm"
                onClick={() => {
                  setPublico("pessoas");
                  setIds(cfg.testadores.map(String));
                }}
              >
                Só os testadores
              </Button>
            </div>
          )}
          <Segmented
            ariaLabel="Quem precisa aceitar"
            value={publico}
            onChange={(v) => {
              setPublico(v);
              setIds([]);
            }}
            options={[
              { value: "todos", label: "Todos" },
              { value: "papeis", label: "Papéis" },
              { value: "grupos", label: "Grupos" },
              { value: "pessoas", label: "Pessoas" },
            ]}
          />
          {publico !== "todos" && (
            <SeletorMultiplo
              rotulo={publico === "papeis" ? "Papéis" : publico === "grupos" ? "Grupos" : "Pessoas"}
              suspenso
              textoVazio="Nenhum"
              opcoes={opcoesPublico.map((o) => ({ valor: String(o.id), rotulo: o.nome }))}
              selecionados={ids}
              onChange={setIds}
            />
          )}
          <p className="text-[12px] text-muted">
            O aceite é obrigatório: no próximo acesso, o sistema só abre depois que a pessoa aceitar — o Administrador também. Quem já aceitou esta versão não
            precisa aceitar de novo.
          </p>
        </div>
      </Modal>

      <Modal
        open={versaoAberta != null}
        onClose={() => setVersaoAberta(null)}
        titulo={versaoAberta ? `${versaoAberta.termo.titulo} — versão ${versaoAberta.termo.versao}` : ""}
        size="full"
        acoesCabecalho={
          versaoAberta?.termo.texto ? (
            <Button size="sm" variant="secondary" icon={<IconDownload className="h-4 w-4" />} onClick={() => versaoAberta.termo.texto && baixarTermo(versaoAberta.termo.titulo, versaoAberta.termo.versao, versaoAberta.termo.texto).catch((e) => toast.error((e as Error).message))}>
              PDF
            </Button>
          ) : null
        }
      >
        {versaoAberta && (
          <div className="space-y-[var(--gap-block)]">
            {versaoAberta.termo.texto ? (
              <div className="max-h-[40vh] overflow-y-auto rounded-card border border-border p-[var(--pad-card)]">
                <TextoTermo texto={versaoAberta.termo.texto} />
              </div>
            ) : (
              <Callout kind="info">Rascunho — ainda sem texto final.</Callout>
            )}
            {versaoAberta.termo.hash && <p className="break-all font-mono text-[12px] text-muted">SHA-256: {versaoAberta.termo.hash}</p>}
            <div className="flex justify-end">
              <Button
                size="sm"
                variant="secondary"
                icon={<IconTermo className="h-4 w-4" />}
                onClick={() => {
                  setPublicar({ termoId: versaoAberta.termo.id });
                  setVersaoAberta(null);
                }}
              >
                Exigir o aceite de novo
              </Button>
            </div>
            <DataTable
              columns={[
                { key: "n", header: "Pessoa", render: (a) => a.nome, value: (a) => a.nome, align: "left" },
                { key: "m", header: "Matrícula", render: (a) => a.matricula || "—", value: (a) => a.matricula, nowrap: true },
                { key: "u", header: "Unidade", render: (a) => a.unidade || "—", value: (a) => a.unidade },
                { key: "e", header: "Aceito em", render: (a) => dataHoraBR(a.em), value: (a) => a.em, filter: "date", nowrap: true },
                { key: "me", header: "Confirmação", render: (a) => a.metodo, value: (a) => a.metodo, nowrap: true },
                { key: "ap", header: "Aparelho", render: (a) => a.aparelho || "—", value: (a) => a.aparelho },
                { key: "ip", header: "IP", render: (a) => a.ip || "—", value: (a) => a.ip, nowrap: true },
                { key: "t", header: "Tipo", render: (a) => (a.teste ? <Badge tone="amber">Teste</Badge> : <Badge tone="emerald">Oficial</Badge>), value: (a) => (a.teste ? "Teste" : "Oficial"), nowrap: true },
                { key: "c", header: "Código", render: (a) => <span className="font-mono text-[12px]">{a.codigo}</span>, value: (a) => a.codigo, nowrap: true },
              ]}
              rows={versaoAberta.aceites}
              getKey={(a) => a.id}
              density="compact"
              pageSize={10}
              exportar={{ nome: `Aceites do Termo v${versaoAberta.termo.versao}` }}
              vazio="Ninguém aceitou esta versão ainda."
            />
            <DataTable
              columns={[
                { key: "n", header: "Pendente", render: (p) => p.nome, value: (p) => p.nome, align: "left" },
                { key: "m", header: "Matrícula", render: (p) => p.matricula || "—", value: (p) => p.matricula ?? "", nowrap: true },
                { key: "p", header: "Exigido em", render: (p) => dataHoraBR(p.prazo), value: (p) => p.prazo, filter: "date", nowrap: true },
              ]}
              rows={versaoAberta.pendentes}
              getKey={(p) => p.usuarioId}
              density="compact"
              pageSize={10}
              exportar={{ nome: `Pendentes do Termo v${versaoAberta.termo.versao}` }}
              vazio="Ninguém deve esta versão."
            />
          </div>
        )}
      </Modal>
    </div>
  );
}

