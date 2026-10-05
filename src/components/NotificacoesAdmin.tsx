"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { CATALOGO_AVISOS, type Canais, type ConfigResolvida, GRUPOS_AVISO, type ItemCatalogoAviso, itemAviso, LIMITES_RETENCAO, type Retencao, resolverNotificacoes } from "@/lib/notificacoes-config-core";
import { chamarPadronizacao as chamar } from "@/lib/padronizacao-cliente";
import { Ajuda } from "./Ajuda";
import { Badge } from "./Badge";
import { Button } from "./Button";
import { useConfirmacao } from "./Confirmacao";
import { ErroCarga } from "./ErroCarga";
import { type Column, DataTable } from "./DataTable";
import { TextArea, TextField } from "./Field";
import { IconBell, IconLimpar, IconMail, IconMegafone, IconRefresh, IconSave, IconUndo, IconUserX } from "./icons";
import { visualAviso } from "./notificacoesVisual";
import { Segmented } from "./Segmented";
import { SeletorMultiplo } from "./SeletorMultiplo";
import { SkeletonLinhas } from "./Skeleton";
import { Switch } from "./Switch";
import { toast } from "./Toast";

/** Um aviso do catálogo: o rótulo + a descrição e as três chaves (o desligado no sino trava o resto). */
function LinhaAviso({ item, canais, onChange }: { item: ItemCatalogoAviso; canais: Canais; onChange: (c: Canais) => void }) {
  const padrao = item.padrao;
  const mudou = canais.sino !== padrao.sino || canais.email !== padrao.email || canais.desligavel !== padrao.desligavel;
  const semAviso = !item.soEmail && !canais.sino;
  return (
    <div className={`grid grid-cols-1 items-center gap-x-4 gap-y-1 border-b border-border px-[var(--pad-card)] py-1 last:border-b-0 sm:grid-cols-[minmax(0,1fr)_repeat(3,5rem)] ${mudou ? "bg-accent-soft/40" : ""}`}>
      <div className="min-w-0 py-1">
        <p className="flex items-center gap-2 text-sm font-semibold text-text">
          {item.rotulo}
          {item.soEmail && (
            <Badge tone="slate">
              Só e-mail
            </Badge>
          )}
        </p>
        <p className="line-clamp-1 text-[12px] leading-snug text-muted" title={item.descricao}>
          {item.descricao}
        </p>
      </div>
      <div className="flex items-center gap-2 sm:justify-center">
        <span className="w-28 text-[12px] text-muted sm:hidden">Sino</span>
        {item.soEmail ? (
          <span className="text-[12px] text-faint">—</span>
        ) : (
          <Switch checked={canais.sino} onChange={(sino) => onChange({ ...canais, sino })} label={<span className="sr-only">{`Sino: ${item.rotulo}`}</span>} />
        )}
      </div>
      <div className="flex items-center gap-2 sm:justify-center">
        <span className="w-28 text-[12px] text-muted sm:hidden">E-mail</span>
        <Switch checked={canais.email && !semAviso} disabled={semAviso} onChange={(email) => onChange({ ...canais, email })} label={<span className="sr-only">{`E-mail: ${item.rotulo}`}</span>} />
      </div>
      <div className="flex items-center gap-2 sm:justify-center">
        <span className="w-28 text-[12px] text-muted sm:hidden">Pode desligar</span>
        <Switch
          checked={canais.desligavel}
          disabled={semAviso || !canais.email}
          onChange={(desligavel) => onChange({ ...canais, desligavel })}
          label={<span className="sr-only">{`A pessoa pode desligar o e-mail: ${item.rotulo}`}</span>}
        />
      </div>
    </div>
  );
}

/**
 * CONFIGURAÇÕES → NOTIFICAÇÕES (ADM): o controle CENTRAL dos avisos do sistema — por aviso, se ele existe no SINO, se
 * também sai por E-MAIL e se a pessoa pode desligar o e-mail no Perfil. O padrão manda por e-mail só o fundamental
 * (tarefa atribuída/atrasada, convite, protocolo designado, cadastro e acesso liberado). Só componentes do DS.
 */
function AvisosAdmin() {
  const [salvo, setSalvo] = useState<ConfigResolvida | null>(null);
  const [rascunho, setRascunho] = useState<ConfigResolvida | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);
  const { confirmar, confirmacao } = useConfirmacao();

  const carregar = useCallback(async () => {
    try {
      const j = await chamar<{ avisos: ConfigResolvida }>("/api/admin/notificacoes");
      setSalvo(j.avisos);
      setRascunho(j.avisos);
      setErro(null);
    } catch (e) {
      setErro((e as Error).message);
    }
  }, []);
  useEffect(() => {
    void carregar();
  }, [carregar]);

  const alterado = useMemo(() => !!salvo && !!rascunho && JSON.stringify(salvo) !== JSON.stringify(rascunho), [salvo, rascunho]);
  const porEmail = rascunho ? CATALOGO_AVISOS.filter((i) => rascunho[i.chave].email && (i.soEmail || rascunho[i.chave].sino)).length : 0;

  const gravar = async (metodo: "PATCH" | "DELETE") => {
    if (!rascunho) return;
    setSalvando(true);
    try {
      const j = await chamar<{ avisos: ConfigResolvida }>("/api/admin/notificacoes", metodo, metodo === "PATCH" ? { avisos: rascunho } : undefined);
      setSalvo(j.avisos);
      setRascunho(j.avisos);
      toast.success(metodo === "PATCH" ? "Notificações salvas — valem para os próximos avisos." : "Notificações restauradas ao padrão.");
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setSalvando(false);
    }
  };
  const restaurar = async () => {
    if (await confirmar({ titulo: "Voltar ao padrão?", texto: "O e-mail volta a sair só nos avisos fundamentais.", confirmar: "Restaurar" })) void gravar("DELETE");
  };

  if (erro && !rascunho) return <ErroCarga msg={erro} onTentar={carregar} />;
  if (!rascunho) return <SkeletonLinhas linhas={6} />;
  return (
    <div className="space-y-[var(--gap-block)]">
      {confirmacao}
      <div className="flex flex-wrap items-center gap-2">
        <p className="flex items-center gap-1.5 text-sm text-muted">
          <IconMail className="h-4 w-4" /> {porEmail} aviso{porEmail === 1 ? "" : "s"} por e-mail
        </p>
        <Ajuda titulo="Notificações">
          <p>
            <strong>Sino</strong>: o aviso aparece no sino (em tempo real). Desligado, o aviso deixa de existir.
          </p>
          <p>
            <strong>E-mail</strong>: o aviso também é enviado por e-mail (com o Resend ativo em Integrações). Use o mínimo — só o
            que pede ação.
          </p>
          <p>
            <strong>Pode desligar</strong>: a pessoa pode deixar de receber esse e-mail no Perfil. Desligado, o e-mail é
            obrigatório.
          </p>
        </Ajuda>
        <div className="ml-auto flex gap-2">
          <Button variant="icon" size="sm" icon={<IconUndo className="h-4 w-4" />} onClick={restaurar} disabled={salvando} aria-label="Voltar ao padrão" title="Voltar ao padrão" />
          <Button size="sm" icon={<IconSave className="h-4 w-4" />} loading={salvando} disabled={!alterado} onClick={() => gravar("PATCH")}>
            Salvar
          </Button>
        </div>
      </div>
      {GRUPOS_AVISO.map((grupo) => (
        <section key={grupo} className="overflow-hidden rounded-card border border-border bg-surface shadow-ring">
          <header className="hidden items-center gap-x-4 border-b border-border bg-surface-2 px-[var(--pad-card)] py-1.5 text-[12px] font-semibold text-muted sm:grid sm:grid-cols-[minmax(0,1fr)_repeat(3,5rem)]">
            <span className="text-text">{grupo}</span>
            <span className="flex justify-center" title="Aparece no sino">
              <IconBell className="h-4 w-4" />
              <span className="sr-only">Sino</span>
            </span>
            <span className="flex justify-center" title="Também por e-mail">
              <IconMail className="h-4 w-4" />
              <span className="sr-only">E-mail</span>
            </span>
            <span className="flex justify-center" title="A pessoa pode desligar o e-mail">
              <IconUserX className="h-4 w-4" />
              <span className="sr-only">Pode desligar</span>
            </span>
          </header>
          <p className="border-b border-border bg-surface-2 px-[var(--pad-card)] py-2 text-sm font-semibold text-text sm:hidden">{grupo}</p>
          {CATALOGO_AVISOS.filter((i) => i.grupo === grupo).map((item) => (
            <LinhaAviso
              key={item.chave}
              item={item}
              canais={rascunho[item.chave]}
              onChange={(c) => setRascunho((r) => (r ? resolverNotificacoes({ ...r, [item.chave]: c }) : r))}
            />
          ))}
        </section>
      ))}
    </div>
  );
}

/** LIMPEZA: quanto tempo os avisos ficam e se o sistema os limpa sozinho (o cron a cada 5 min) + "Limpar agora". */
function LimpezaAdmin() {
  const [r, setR] = useState<Retencao | null>(null);
  const [salvo, setSalvo] = useState<Retencao | null>(null);
  const [ocupado, setOcupado] = useState<"salvar" | "limpar" | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const { confirmar, confirmacao } = useConfirmacao();
  const carregar = useCallback(() => {
    chamar<{ retencao: Retencao }>("/api/admin/notificacoes/retencao")
      .then((j) => {
        setR(j.retencao);
        setSalvo(j.retencao);
        setErro(null);
      })
      .catch((e) => setErro((e as Error).message));
  }, []);
  useEffect(carregar, [carregar]);
  if (erro && !r) return <ErroCarga msg={erro} onTentar={carregar} />;
  if (!r) return <SkeletonLinhas linhas={3} />;
  const num = (k: "lidasDias" | "naoLidasDias" | "teto", v: string) => setR({ ...r, [k]: Number.parseInt(v, 10) || 0 });
  const [dmin, dmax] = LIMITES_RETENCAO.dias;
  const [tmin, tmax] = LIMITES_RETENCAO.teto;
  const valido = r.lidasDias >= dmin && r.lidasDias <= dmax && r.naoLidasDias >= dmin && r.naoLidasDias <= dmax && r.teto >= tmin && r.teto <= tmax;
  const salvar = async () => {
    setOcupado("salvar");
    try {
      const j = await chamar<{ retencao: Retencao }>("/api/admin/notificacoes/retencao", "PUT", r);
      setR(j.retencao);
      setSalvo(j.retencao);
      toast.success("Limpeza salva.");
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setOcupado(null);
    }
  };
  const limparAgora = async () => {
    if (!(await confirmar({ titulo: "Limpar agora?", texto: "Remove do banco os avisos fora dos prazos e do limite por pessoa.", confirmar: "Limpar", perigo: true }))) return;
    setOcupado("limpar");
    try {
      const j = await chamar<{ removidas: number }>("/api/admin/notificacoes/limpar", "POST");
      toast.success(j.removidas ? `${j.removidas} aviso(s) removido(s).` : "Nada a limpar.");
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setOcupado(null);
    }
  };
  return (
    <div className="space-y-[var(--gap-block)] rounded-card border border-border bg-surface p-[var(--pad-card)] shadow-ring">
      {confirmacao}
      <Switch checked={r.auto} onChange={(auto) => setR({ ...r, auto })} label="Limpar automaticamente" />
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <TextField label="Lidas ficam (dias)" type="number" inputMode="numeric" min={dmin} max={dmax} value={r.lidasDias} onChange={(e) => num("lidasDias", e.target.value)} />
        <TextField label="Não lidas ficam (dias)" type="number" inputMode="numeric" min={dmin} max={dmax} value={r.naoLidasDias} onChange={(e) => num("naoLidasDias", e.target.value)} />
        <TextField label="Máximo por pessoa" type="number" inputMode="numeric" min={tmin} max={tmax} value={r.teto} onChange={(e) => num("teto", e.target.value)} />
      </div>
      <div className="flex items-center gap-2">
        <Button variant="secondary" size="sm" icon={<IconLimpar className="h-4 w-4" />} loading={ocupado === "limpar"} disabled={!!ocupado} onClick={limparAgora}>
          Limpar agora
        </Button>
        <Button className="ml-auto" size="sm" icon={<IconSave className="h-4 w-4" />} loading={ocupado === "salvar"} disabled={!!ocupado || !valido || JSON.stringify(r) === JSON.stringify(salvo)} onClick={salvar}>
          Salvar
        </Button>
      </div>
    </div>
  );
}

type GrupoLista = { id: number; nome: string };

/** COMUNICADO: um aviso do ADM no sino de todos (ou só dos grupos escolhidos). */
function ComunicadoAdmin() {
  const [titulo, setTitulo] = useState("");
  const [texto, setTexto] = useState("");
  const [link, setLink] = useState("");
  const [grupos, setGrupos] = useState<GrupoLista[] | null>(null);
  const [escolhidos, setEscolhidos] = useState<string[]>([]);
  const [enviando, setEnviando] = useState(false);
  const { confirmar, confirmacao } = useConfirmacao();
  useEffect(() => {
    chamar<{ grupos: GrupoLista[] }>("/api/admin/grupos")
      .then((j) => setGrupos(j.grupos.map((g) => ({ id: g.id, nome: g.nome }))))
      .catch(() => setGrupos([]));
  }, []);
  const linkOk = !link.trim() || (link.trim().startsWith("/") && !link.trim().startsWith("//"));
  const enviar = async () => {
    const ids = (grupos ?? []).filter((g) => escolhidos.includes(g.nome)).map((g) => g.id);
    if (!(await confirmar({ titulo: "Enviar o comunicado?", texto: ids.length ? `Às pessoas de ${ids.length} grupo(s).` : "A todas as pessoas ativas.", confirmar: "Enviar" }))) return;
    setEnviando(true);
    try {
      const j = await chamar<{ enviados: number }>("/api/admin/notificacoes/comunicado", "POST", { titulo, texto, link: link.trim(), grupos: ids });
      toast.success(`Comunicado enviado a ${j.enviados} pessoa(s).`);
      setTitulo("");
      setTexto("");
      setLink("");
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setEnviando(false);
    }
  };
  return (
    <div className="space-y-3 rounded-card border border-border bg-surface p-[var(--pad-card)] shadow-ring">
      {confirmacao}
      <TextField label="Título" value={titulo} maxLength={120} onChange={(e) => setTitulo(e.target.value)} />
      <TextArea label="Texto" rows={3} value={texto} maxLength={500} onChange={(e) => setTexto(e.target.value)} />
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <TextField label="Link (opcional)" placeholder="/painel/mesa" value={link} error={linkOk ? undefined : "Uma página do sistema (começa com /)."} onChange={(e) => setLink(e.target.value)} />
        <div>
          <SeletorMultiplo suspenso rotulo="Grupos" textoVazio="Todos" opcoes={(grupos ?? []).map((g) => ({ valor: g.nome }))} selecionados={escolhidos} onChange={setEscolhidos} disabled={!grupos} />
        </div>
      </div>
      <div className="flex justify-end">
        <Button size="sm" icon={<IconMegafone className="h-4 w-4" />} loading={enviando} disabled={titulo.trim().length < 3 || !linkOk} onClick={enviar}>
          Enviar
        </Button>
      </div>
    </div>
  );
}

type LinhaAlcance = { tipo: string; total: number; lidas: number; horasLeitura: number | null; emails: number; naFila: number; pessoas: number };

const horas = (h: number | null) => (h == null ? "—" : h < 1 ? `${Math.max(1, Math.round(h * 60))} min` : h < 48 ? `${h.toFixed(1).replace(".", ",")} h` : `${Math.round(h / 24)} dias`);

/** ALCANCE: por tipo, quantos avisos, lidos (%), o tempo até a leitura, os e-mails e a fila — o que é ruído. */
function AlcanceAdmin() {
  const [dias, setDias] = useState("30");
  const [dados, setDados] = useState<{ aoVivo: boolean; tipos: LinhaAlcance[] } | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const carregar = useCallback(() => {
    setDados(null);
    chamar<{ aoVivo: boolean; tipos: LinhaAlcance[] }>(`/api/admin/notificacoes/alcance?dias=${dias}`)
      .then((j) => {
        setDados(j);
        setErro(null);
      })
      .catch((e) => setErro((e as Error).message));
  }, [dias]);
  useEffect(carregar, [carregar]);
  const n = (v: number) => v.toLocaleString("pt-BR");
  const coluna = (key: string, header: string, de: (l: LinhaAlcance) => number, mostrar = n, total = true): Column<LinhaAlcance> => ({
    key,
    header,
    render: (l) => mostrar(de(l)),
    value: (l) => String(de(l)),
    filter: "range",
    numero: de,
    formatarFaixa: mostrar,
    nowrap: true,
    ...(total ? {} : { total: false as const }),
  });
  const cols: Column<LinhaAlcance>[] = [
    {
      key: "tipo",
      header: "Aviso",
      align: "left",
      value: (l) => itemAviso(l.tipo)?.rotulo ?? l.tipo,
      render: (l) => {
        const { Icone, cor } = visualAviso(l.tipo);
        return (
          <span className="inline-flex items-center gap-1.5">
            <span style={{ color: cor }}>
              <Icone className="h-3.5 w-3.5" />
            </span>
            {itemAviso(l.tipo)?.rotulo ?? l.tipo}
          </span>
        );
      },
      nowrap: true,
    },
    coluna("total", "Avisos", (l) => l.total),
    coluna("pessoas", "Pessoas", (l) => l.pessoas, n, false),
    coluna("lidas", "Lidos", (l) => (l.total ? Math.round((l.lidas / l.total) * 100) : 0), (v) => `${v}%`, false),
    { key: "horas", header: "Até ler", render: (l) => horas(l.horasLeitura), value: (l) => horas(l.horasLeitura), filter: "none", nowrap: true, total: false },
    coluna("emails", "E-mails", (l) => l.emails),
    coluna("fila", "Na fila", (l) => l.naFila),
  ];

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <Segmented<string>
          value={dias}
          onChange={setDias}
          ariaLabel="Período"
          options={[
            { value: "7", label: "7 dias" },
            { value: "30", label: "30 dias" },
            { value: "90", label: "90 dias" },
          ]}
        />
        {dados && (
          <Badge tone={dados.aoVivo ? "emerald" : "amber"} dot>
            {dados.aoVivo ? "Tempo real ativo" : "Tempo real indisponível"}
          </Badge>
        )}
        <Button className="ml-auto" variant="icon" size="sm" icon={<IconRefresh className="h-4 w-4" />} onClick={carregar} aria-label="Recarregar" title="Recarregar" />
      </div>
      {erro && <ErroCarga msg={erro} onTentar={carregar} />}
      {!dados && !erro && <SkeletonLinhas linhas={5} />}
      {dados && <DataTable rows={dados.tipos} columns={cols} getKey={(l) => l.tipo} pageSize={20} density="compact" vazio="Nenhum aviso no período." exportar={{ nome: "Alcance das notificações" }} />}
    </div>
  );
}

/**
 * CONFIGURAÇÕES → NOTIFICAÇÕES (ADM): **Avisos** (por aviso: sino, e-mail, se a pessoa pode desligar) · **Limpeza** (quanto
 * tempo ficam; a limpeza automática; limpar agora) · **Comunicado** (aviso a todos ou a grupos) · **Alcance** (o relatório
 * por tipo). Compacto, só componentes do DS.
 */
export function NotificacoesAdmin() {
  const [aba, setAba] = useState<"avisos" | "limpeza" | "comunicado" | "alcance">("avisos");
  return (
    <div className="space-y-[var(--gap-block)]">
      <Segmented<"avisos" | "limpeza" | "comunicado" | "alcance">
        value={aba}
        onChange={setAba}
        ariaLabel="Notificações"
        options={[
          { value: "avisos", label: "Avisos" },
          { value: "limpeza", label: "Limpeza" },
          { value: "comunicado", label: "Comunicado", curto: "Comunic." },
          { value: "alcance", label: "Alcance" },
        ]}
      />
      <div key={aba} className="animate-cat-morph">
        {aba === "avisos" && <AvisosAdmin />}
        {aba === "limpeza" && <LimpezaAdmin />}
        {aba === "comunicado" && <ComunicadoAdmin />}
        {aba === "alcance" && <AlcanceAdmin />}
      </div>
    </div>
  );
}
