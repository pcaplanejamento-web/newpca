"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  CONFIG_CENTI_PADRAO,
  type ConfigCenti,
  lerConfigCenti,
  maiorVersao,
  type ProtocoloAutomacao,
  ajusteDaOperacao,
  VERSAO_EXTENSAO_CENTI,
  versaoAtende, } from "@/lib/automacao-centi-core";
import { dataHoraBR, } from "@/lib/format";
import { Ajuda } from "./Ajuda";
import { Badge } from "./Badge";
import { type AberturaMesa, BannersMesa } from "./BannersMesa";
import { Button } from "./Button";
import { useConfirmacao } from "./Confirmacao";
import { Dropdown } from "./Dropdown";
import { TextField } from "./Field";
import { cellCls } from "./formStyles";
import { BotaoAtualizar, useGiro } from "./BotaoAtualizar";
import { IconDownload, IconKey, IconRobo, IconSettings, } from "./icons";
import { Switch } from "./Switch";
import { toast } from "./Toast";
import { GravadorReceitas, type PassoGravado } from "./GravadorReceitas";
import { HistoricoExecucoes } from "./HistoricoExecucoes";
import { FluxosAutomacao } from "./fluxos/FluxosAutomacao";
import type { GestaoAutomacao } from "./automacao/ProtocolosAutomacao";
import type { ContextoEmissor } from "@/lib/automacao-dfds-motor";
import type { ContextoImportacao } from "@/lib/importar-protocolo-auto";

// Tela AUTOMAÇÃO (só ADM): baixa DFDs da Centi ("Emitir DFD" do CM002 Planejamento) por PROTOCOLO do sistema (uma pasta
// por protocolo, dentro da pasta "PCA <ano>") ou por Id. Quem fala com a Centi é a EXTENSÃO do Chrome (extensao-centi/),
// usando a sessão da Centi já aberta — nenhuma senha fica no sistema. Destino: uma PASTA (Downloads ou a escolhida) ou
// ANEXAR os PDFs a um PROTOCOLO da Centi informado pelo ADM (Id + nº): a única gravação na Centi, montada e travada na
// extensão (abre o protocolo, confere Id + nº, acrescenta UM documento, não repete a mesma descrição).
// Cada DFD é emitido na ENTIDADE da Centi do órgão dele e CONFERIDO (é um PDF, traz o planejamento e o DFD pedidos, a
// gravação bateu o tamanho) antes de contar como salvo.

const CHAVE_CONFIG = "automacao:centi";
const CHAVE_ENTIDADES = "automacao:centi-entidades";

type Resposta = {
  ok: boolean;
  erro?: string;
  logado?: boolean;
  entidade?: string | null;
  /** A operação "Emitir DFD" que a extensão pegou da própria tela da Centi (o Processar). */
  operacao?: unknown;
  /** A aba da Centi está na TELA DE LOGIN (a sessão caiu). */
  tela?: "login";
  /** O login automático da extensão (as credenciais ficam SÓ nela — aqui só a situação). */
  login?: { credenciais: boolean; auto: boolean; pausado: boolean; motivo: string | null } | null;
  /** O lote foi INTERROMPIDO pela extensão (popup ou cartão na aba da automação). */
  interrompido?: boolean;
  /** O andamento do último lote, como a extensão o guardou (sobrevive ao F5 desta tela). */
  atividade?: { estado: string; titulo: string; passo: string; atualizado: number } | null;
  loteId?: string;
};
type Ext = { versao: string; copias: number } | null;
/** O contexto dos BANNERS da Mesa (o protocolo aberto pela linha): o mesmo da Mesa (`contextoBanners`). */
export type ContextoBannersAutomacao = Pick<Parameters<typeof BannersMesa>[0], "pode" | "reparticoes" | "regras" | "orgaos" | "pcas">;
/** O ID da entidade na Centi cadastrado em cada órgão (Órgãos e Unidades). */
type OrgaoCenti = { id: number; entidadeCenti?: string | null };

/** Conversa com a extensão pela ponte da página (window.postMessage). */
function useExtensaoCenti() {
  const [ext, setExt] = useState<Ext>(null);
  const versao = useRef("");
  const copias = useRef(new Map<string, string>());
  const seq = useRef(0);
  const pendentes = useRef(new Map<number, (r: Resposta) => void>());
  // O LOTE em curso (o andamento vai à extensão — selo no ícone, cartão na aba da automação e popup) e a INTERRUPÇÃO
  // pedida pela extensão: os pedidos do lote levam o id e a extensão recusa os que vêm depois de interromper.
  const lote = useRef<string | null>(null);
  const interrompido = useRef(false);
  useEffect(() => {
    const ouvir = (e: MessageEvent) => {
      if (e.source !== window || e.data?.fonte !== "pca-extensao") return;
      if (e.data.tipo === "interrompido") {
        if (lote.current && e.data.loteId === lote.current) interrompido.current = true;
        return;
      }
      if (e.data.tipo === "pronto") {
        // Vale a MAIOR versão anunciada (uma cópia antiga que ficou na aba também se anuncia).
        const v = String(e.data.versao ?? "");
        // Cada CÓPIA instalada se anuncia com o id dela (desde a 1.4.1): duas cópias = aviso (as duas ouviriam os pedidos).
        // Conta só as cópias da MESMA versão (a antiga que sobrou de uma atualização não ouve os pedidos — `v`).
        if (typeof e.data.idExtensao === "string") copias.current.set(e.data.idExtensao, v);
        if (versao.current && maiorVersao(versao.current, v) === versao.current && v !== versao.current) return;
        versao.current = maiorVersao(versao.current || "0", v);
        const atual = versao.current;
        setExt({ versao: atual, copias: [...copias.current.values()].filter((x) => x === atual).length });
        return;
      }
      // Só a resposta da ponte ATUAL (uma cópia antiga da extensão que ficou na aba também ouve).
      if (e.data.v !== versao.current) return;
      const f = pendentes.current.get(e.data.id);
      if (f) {
        pendentes.current.delete(e.data.id);
        f(e.data.resposta ?? { ok: false, erro: "Sem resposta da extensão." });
      }
    };
    window.addEventListener("message", ouvir);
    window.postMessage({ fonte: "pca-automacao", tipo: "ola" }, window.location.origin);
    return () => window.removeEventListener("message", ouvir);
  }, []);
  const pedir = useCallback((acao: string, dados: unknown, ms: number) => {
    const id = ++seq.current;
    return new Promise<Resposta>((ok) => {
      const t = window.setTimeout(() => {
        pendentes.current.delete(id);
        ok({ ok: false, erro: "A extensão não respondeu a tempo." });
      }, ms);
      pendentes.current.set(id, (r) => {
        window.clearTimeout(t);
        ok(r);
      });
      window.postMessage({ fonte: "pca-automacao", v: versao.current, id, acao, dados, lote: lote.current ?? undefined }, window.location.origin);
    });
  }, []);
  return { ext, pedir, lote, interrompido };
}

function lerLocal<T>(chave: string, ler: (v: unknown) => T, padrao: T): T {
  try {
    return ler(JSON.parse(localStorage.getItem(chave) ?? "null"));
  } catch {
    return padrao;
  }
}
function gravarLocal(chave: string, v: unknown) {
  try {
    localStorage.setItem(chave, JSON.stringify(v));
  } catch {}
}
const lerMapa = (v: unknown): Record<string, string> =>
  Object.fromEntries(Object.entries(v && typeof v === "object" ? v : {}).filter(([, x]) => typeof x === "string" && /^[\w.-]{1,40}$/.test(x))) as Record<string, string>;

const URL_EXTENSAO = "/api/admin/automacao/extensao";
const baixarExtensao = () => {
  window.location.href = URL_EXTENSAO;
};

/** A operação Emitir DFD como chave comparável ("ModuleKey|Guid|assinatura"); inválida = null. */
function chaveOp(op: unknown): string | null {
  const a = ajusteDaOperacao({ ...CONFIG_CENTI_PADRAO, moduleKey: 0, guid: "", assinaturaDfd: "" }, op);
  return a ? `${a.moduleKey}|${a.guid}|${a.assinaturaDfd ?? ""}` : null;
}
function Grupo({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <div className="space-y-2 border-b border-border px-1 pb-3 last:border-0 last:pb-0">
      <p className="text-xs font-semibold uppercase tracking-wide text-muted">{titulo}</p>
      {children}
    </div>
  );
}

/**
 * O LOGIN DA CENTI GUARDADO NO SISTEMA (opcional, cifrado): a situação + remover. Guardar é só na extensão ("Guardar
 * também no sistema PCA" no login dela) — a senha nunca passa por esta tela.
 */
function LoginNoSistema({ onConfigurar }: { onConfigurar: () => void }) {
  const [s, setS] = useState<{ tem: boolean; atualizadoEm: string | null; disponivel: boolean } | null>(null);
  const [remover, setRemover] = useState<"pergunta" | "removendo" | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const carregar = useCallback(async () => {
    const r = await fetch("/api/admin/automacao/credencial-centi", { cache: "no-store" }).catch(() => null);
    const j = (await r?.json().catch(() => null)) as { ok?: boolean; tem?: boolean; atualizadoEm?: string | null; disponivel?: boolean } | null;
    setS(j?.ok ? { tem: j.tem === true, atualizadoEm: j.atualizadoEm ?? null, disponivel: j.disponivel !== false } : null);
  }, []);
  useEffect(() => {
    void carregar();
  }, [carregar]);
  async function tirar() {
    setRemover("removendo");
    const r = await fetch("/api/admin/automacao/credencial-centi", { method: "DELETE" }).catch(() => null);
    setRemover(null);
    if (!r?.ok) return setErro("Não consegui remover — tente de novo.");
    setErro(null);
    await carregar();
  }
  return (
    <Grupo titulo="Login da Centi">
      <p className="text-xs text-muted">
        {s === null
          ? "Conferindo…"
          : s.tem
            ? `Guardado no sistema (cifrado)${s.atualizadoEm ? ` em ${dataHoraBR(s.atualizadoEm)}` : ""} — volta sozinho se a extensão for reinstalada.`
            : s.disponivel
              ? "Só na extensão. Para guardar também no sistema (cifrado), marque a opção no login da extensão."
              : "O sistema está sem a chave mestra para cifrar o login — fica só na extensão."}
      </p>
      {erro && <p className="text-xs text-[var(--danger)]">{erro}</p>}
      <div className="flex flex-wrap gap-2">
        <Button size="sm" variant="secondary" onClick={onConfigurar}>
          <IconKey className="h-4 w-4" /> Configurar login
        </Button>
        {s?.tem &&
          (remover === null ? (
            <Button size="sm" variant="secondary" onClick={() => setRemover("pergunta")}>
              Remover do sistema
            </Button>
          ) : (
            <Button size="sm" variant="danger" onClick={() => void tirar()} loading={remover === "removendo"}>
              Confirmar remoção
            </Button>
          ))}
      </div>
    </Grupo>
  );
}

/** Os AJUSTES (o dropdown do botão "Ajustes"): saída, emissão e entidade da Centi por órgão. */
function Ajustes({
  cfg,
  onCfg,
  orgaos,
  mapa,
  fixas,
  onEntidade,
  aberta,
  gravacao,
  onGravacao,
  onHistorico,
  gravando,
  onGravador,
  onConfigurarLogin,
}: {
  /** Abre o login da extensão (o dropdown do ícone). */
  onConfigurarLogin: () => void;
  /** O gravador de receitas na aba da Centi (null = desconhecido). */
  gravando: boolean | null;
  onGravador: (acao: "iniciar" | "parar") => void;
  /** O freio de emergência da plataforma (null = não lido). */
  gravacao: boolean | null;
  onGravacao: (ativa: boolean) => void;
  onHistorico: () => void;
  cfg: ConfigCenti;
  onCfg: (p: Partial<ConfigCenti>) => void;
  orgaos: [string, { nome: string; n: number }][];
  mapa: Record<string, string>;
  /** As entidades CADASTRADAS no órgão (Órgãos e Unidades) — valem sempre; não se tenta nem se edita aqui. */
  fixas: Record<string, string>;
  onEntidade: (orgao: string, entidade: string) => void;
  aberta: string | null;
}) {
  return (
    <div className="space-y-3 p-1">
      <LoginNoSistema onConfigurar={onConfigurarLogin} />
      <Grupo titulo="Gravação na Centi">
        <Switch
          checked={gravacao !== false}
          disabled={gravacao === null}
          onChange={onGravacao}
          label={gravacao === false ? "Pausada (freio de emergência)" : "Ligada"}
        />
        <Button size="sm" variant="secondary" onClick={onHistorico}>
          Histórico das execuções
        </Button>
      </Grupo>
      <Grupo titulo="Gravador de receitas">
        <p className="text-xs text-muted">
          Grava a FORMA dos pedidos que a tela da Centi faz (sem valores) — ligue, faça a ação lá e pare para ver e copiar.
        </p>
        <Button size="sm" variant={gravando ? "danger" : "secondary"} onClick={() => onGravador(gravando ? "parar" : "iniciar")} disabled={gravando === null}>
          {gravando ? "Parar e ver a gravação" : "Gravar uma ação na Centi"}
        </Button>
      </Grupo>
      <Grupo titulo="Emissão do DFD">
        <Switch checked={cfg.valorReferencia} onChange={(v) => onCfg({ valorReferencia: v })} label="Emitir valor de referência" />
        <Switch checked={cfg.emitirData} onChange={(v) => onCfg({ emitirData: v })} label="Emitir data" />
      </Grupo>
      <Grupo titulo="Entidade da Centi por órgão">
        <p className="text-[12px] text-muted">O ID cadastrado no órgão (Órgãos e Unidades) vale sempre; descobrir/tentar só para os órgãos sem ele.</p>
        <Switch checked={cfg.descobrirEntidade} onChange={(v) => onCfg({ descobrirEntidade: v })} label="Descobrir sozinho (órgãos sem ID)" />
        <TextField label="Entidades a tentar" placeholder={aberta ? `vazio = 0 a 28 (aberta: ${aberta})` : "02:03:04"} value={cfg.entidades} onChange={(e) => onCfg({ entidades: e.target.value })} />
        {orgaos.length > 0 && (
          <ul className="max-h-56 divide-y divide-border overflow-y-auto">
            {orgaos.map(([chave, o]) => (
              <li key={chave} className="flex items-center gap-2 py-1 text-sm">
                <span className="min-w-0 flex-1 truncate text-text" title={`${o.nome} · ${o.n} DFD(s)`}>
                  {o.nome}
                </span>
                {fixas[chave] ? (
                  <span className="w-16 shrink-0 text-center font-mono text-[12px] text-muted" title="Cadastrado no órgão">
                    {fixas[chave]}
                  </span>
                ) : (
                <input
                  aria-label={`Entidade da Centi de ${o.nome}`}
                  className={`${cellCls} w-16 shrink-0 text-center`}
                  placeholder="auto"
                  defaultValue={mapa[chave] ?? ""}
                  key={mapa[chave] ?? ""}
                  onBlur={(e) => onEntidade(chave, e.target.value)}
                />
                )}
                {!fixas[chave] && aberta && mapa[chave] !== aberta && (
                  <Button size="xs" variant="ghost" onClick={() => onEntidade(chave, aberta)} title="Usar a entidade aberta na Centi agora">
                    {aberta}
                  </Button>
                )}
              </li>
            ))}
          </ul>
        )}
      </Grupo>
      <Grupo titulo="Avançado">
        <TextField label="Modelo de assinatura do DFD" value={cfg.assinaturaDfd} inputMode="numeric" onChange={(e) => onCfg({ assinaturaDfd: e.target.value })} />
        <TextField label="ModuleKey" value={String(cfg.moduleKey)} inputMode="numeric" onChange={(e) => onCfg({ moduleKey: Number(e.target.value) })} />
        <TextField label="Guid da operação" value={cfg.guid} onChange={(e) => onCfg({ guid: e.target.value })} />
      </Grupo>
    </div>
  );
}

export function AutomacaoAdmin({
  protocolos,
  gestao,
  banners,
}: {
  protocolos: ProtocoloAutomacao[];
  gestao: GestaoAutomacao;
  banners: ContextoBannersAutomacao;
}) {
  const router = useRouter();
  const { ext, pedir, lote: loteRef, interrompido: interrompidoRef } = useExtensaoCenti();
  const [cfg, setCfg] = useState<ConfigCenti>(CONFIG_CENTI_PADRAO);
  const [mapa, setMapa] = useState<Record<string, string>>({});
  const mapaRef = useRef(mapa);
  // Órgão → ID da entidade na Centi CADASTRADO em Órgãos e Unidades (vale mais que o mapa do aparelho).
  const cadastradas = useMemo(
    () => Object.fromEntries((banners.orgaos as OrgaoCenti[]).filter((o) => o.entidadeCenti).map((o) => [`o:${o.id}`, o.entidadeCenti as string])),
    [banners.orgaos],
  );
  const cadastradasRef = useRef(cadastradas);
  cadastradasRef.current = cadastradas;
  const [logado, setLogado] = useState<Resposta | null>(null);
  const [rodando, setRodando] = useState(false);
  const [aberto, setAberto] = useState<AberturaMesa | null>(null);
  const { confirmar, confirmacao } = useConfirmacao();
  useEffect(() => {
    setCfg(lerLocal(CHAVE_CONFIG, lerConfigCenti, CONFIG_CENTI_PADRAO));
    const m = lerLocal(CHAVE_ENTIDADES, lerMapa, {});
    mapaRef.current = m;
    setMapa(m);
  }, []);
  // A configuração mais recente (a emissão roda em laço assíncrono e pode ser ajustada no meio dele).
  const cfgRef = useRef(cfg);
  cfgRef.current = cfg;
  const mudar = (p: Partial<ConfigCenti>) => {
    const n = lerConfigCenti({ ...cfgRef.current, ...p });
    cfgRef.current = n;
    setCfg(n);
    gravarLocal(CHAVE_CONFIG, n);
  };
  // A operação "Emitir DFD" que a extensão pegou da tela da Centi: se a Centi a mudou, o sistema acompanha sozinho.
  // A operação guardada no SERVIDOR (vale para todos os ADMs): a da tela da Centi que for diferente vai para lá.
  const opServidor = useRef<string | null>(null);
  const compartilharOperacao = (op: unknown) => {
    const k = chaveOp(op);
    if (!k || k === opServidor.current) return;
    const [moduleKey, guid, assinatura] = k.split("|");
    opServidor.current = k;
    void fetch("/api/admin/automacao/config", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ operacao: { moduleKey: Number(moduleKey), guid, assinatura } }),
    }).catch(() => {
      opServidor.current = null;
    });
  };
  const aplicarOperacao = (op: unknown, doServidor = false): boolean => {
    if (!doServidor) compartilharOperacao(op);
    const a = ajusteDaOperacao(cfgRef.current, op);
    if (!a) return false;
    mudar(a);
    if (!doServidor) toast.success(`A Centi mudou a operação Emitir DFD — o sistema já se ajustou (ModuleKey ${cfgRef.current.moduleKey}).`, 10_000);
    return true;
  };
  const aplicarRef = useRef(aplicarOperacao);
  aplicarRef.current = aplicarOperacao;
  const definirEntidade = useCallback((orgao: string, entidade: string) => {
    const v = entidade.trim();
    const n = { ...mapaRef.current };
    if (v && /^[\w.-]{1,40}$/.test(v)) n[orgao] = v;
    else delete n[orgao];
    mapaRef.current = n;
    setMapa(n);
    gravarLocal(CHAVE_ENTIDADES, n);
  }, []);
  // O EMISSOR de DFDs dos fluxos: lê a configuração e o mapa VIVOS (refs) — ajustes no meio de um lote valem já.
  const emissor = useMemo<ContextoEmissor>(
    () => ({
      pedir: pedir as unknown as ContextoEmissor["pedir"],
      cfg: () => cfgRef.current,
      aplicarOperacao: (op) => aplicarRef.current(op),
      mapa: () => mapaRef.current,
      cadastradas: () => cadastradasRef.current,
      definirEntidade,
    }),
    [pedir, definirEntidade],
  );

  // `abrir` = a extensão abre a ABA DA AUTOMAÇÃO na Centi se ela não existir (ao abrir esta tela e no Verificar; a
  // conferência a cada 20 s não reabre a aba que o usuário fechou).
  const avisouParada = useRef(false);
  const giroVerificar = useGiro();
  const verificar = useCallback(
    async (abrir = false) => {
      const r = await pedir("estado", abrir ? { abrir: true } : null, abrir ? 45_000 : 8000);
      setLogado(r);
      if (r.ok && r.operacao) aplicarRef.current(r.operacao);
      // O lote parou porque esta tela foi recarregada (F5) no meio: avisa uma vez o último passo.
      const a = r.atividade;
      if (!avisouParada.current && a && a.estado === "parado" && Date.now() - a.atualizado < 30 * 60_000) {
        avisouParada.current = true;
        toast.info(`O último lote (${a.titulo}) parou: ${a.passo}`, 12_000);
      }
    },
    [pedir],
  );
  // LOGIN AUTOMÁTICO: a extensão entra com as credenciais guardadas NELA (o sistema só pede e mostra a situação).
  const [entrando, setEntrando] = useState(false);
  const entrarAgora = useCallback(async () => {
    setEntrando(true);
    const r = await pedir("entrarAgora", null, 60_000);
    setEntrando(false);
    setLogado(r);
    if (r.ok && r.logado) toast.success("Centi logada.");
    else toast.error(r.login?.pausado ? (r.login.motivo ?? "Login automático pausado.") : (r.erro ?? "Não consegui entrar na Centi."));
  }, [pedir]);
  // AO VIVO: a extensão se anuncia sozinha (instalada/atualizada — sem F5); o estado da Centi é conferido ao abrir, ao
  // voltar à janela e a cada 20 s com a tela à vista (fora do meio de um lote — o canal fica com a Centi).
  const rodandoRef = useRef(false);
  rodandoRef.current = rodando;
  // Sair desta tela no meio de um lote o PARA (a extensão não segue sozinha): avisa antes.
  useEffect(() => {
    if (!rodando) return;
    const avisar = (e: BeforeUnloadEvent) => {
      e.preventDefault();
    };
    window.addEventListener("beforeunload", avisar);
    return () => window.removeEventListener("beforeunload", avisar);
  }, [rodando]);
  useEffect(() => {
    if (!ext || !versaoAtende(ext.versao)) return;
    void verificar(true);
    const ver = () => {
      if (document.visibilityState === "visible" && !rodandoRef.current) void verificar();
    };
    const t = window.setInterval(ver, 20_000);
    window.addEventListener("focus", ver);
    return () => {
      window.clearInterval(t);
      window.removeEventListener("focus", ver);
    };
  }, [ext, verificar]);

  // O FREIO de emergência (Configuração da plataforma, no servidor): desligado, nenhuma gravação na Centi passa.
  const [gravacao, setGravacao] = useState<boolean | null>(null);
  const [historico, setHistorico] = useState(false);
  // O GRAVADOR de receitas (na aba da Centi): ligar → o ADM faz a ação lá → parar mostra a estrutura gravada.
  const [gravando, setGravando] = useState(false);
  const [gravados, setGravados] = useState<PassoGravado[] | null>(null);
  const usarGravador = async (acao: "iniciar" | "parar") => {
    const r = (await pedir("gravador", { acao }, 8000)) as Resposta & { gravando?: boolean; passos?: PassoGravado[] };
    if (!r.ok) {
      toast.error(`Gravador: ${r.erro ?? "a extensão não respondeu."}`);
      return;
    }
    setGravando(r.gravando === true);
    if (acao === "iniciar") toast.info("Gravando: faça a ação na tela da Centi e volte para parar.", 10_000);
    else setGravados(r.passos ?? []);
  };
  useEffect(() => {
    fetch("/api/admin/automacao/config")
      .then((r) => r.json())
      .then((j: unknown) => {
        const x = j as { ok?: boolean; config?: { ativa?: boolean; operacao?: unknown } } | null;
        setGravacao(x?.ok ? x.config?.ativa !== false : null);
        // A operação que outro ADM (ou outra aba) já aprendeu da Centi vale aqui também.
        if (x?.ok && x.config?.operacao) {
          opServidor.current = chaveOp(x.config.operacao);
          aplicarRef.current(x.config.operacao, true);
        }
      })
      .catch(() => setGravacao(null));
  }, []);
  const mudarGravacao = async (ativa: boolean) => {
    if (!ativa) {
      const sim = await confirmar({
        titulo: "Pausar a gravação na Centi?",
        texto: "Nenhum anexo será gravado (por ninguém) até ligar de novo. Uma gravação em andamento para no próximo documento.",
        confirmar: "Pausar",
      });
      if (!sim) return;
    }
    try {
      const r = await fetch("/api/admin/automacao/config", { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ ativa }) });
      const j = (await r.json().catch(() => null)) as { ok?: boolean; error?: string; config?: { ativa?: boolean } } | null;
      if (!r.ok || !j?.ok) throw new Error(j?.error ?? "Falha ao gravar.");
      setGravacao(j.config?.ativa !== false);
      toast.success(ativa ? "Gravação na Centi ligada." : "Gravação na Centi PAUSADA.");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Falha ao gravar.");
    }
  };

  // Os órgãos dos DFDs do sistema para o mapa órgão → entidade da Centi.
  const orgaos = useMemo(() => {
    const m = new Map<string, { nome: string; n: number }>();
    for (const p of protocolos)
      for (const d of p.dfds)
        if (d.orgao) {
          const o = m.get(d.orgao) ?? { nome: d.orgaoNome ?? d.orgao.slice(2), n: 0 };
          o.n++;
          m.set(d.orgao, o);
        }
    return [...m.entries()].sort((a, b) => b[1].n - a[1].n);
  }, [protocolos]);

  const atualizada = !!ext && versaoAtende(ext.versao);
  const pronto = atualizada && !!logado?.ok && !!logado.logado;
  const abrirProtocolo = useCallback((id: number) => setAberto({ tipo: "protocolo", id }), []);
  const importacao = useMemo(
    () => ({ reparticoes: banners.reparticoes, regras: banners.regras, orgaos: banners.orgaos, pcas: banners.pcas }) as unknown as ContextoImportacao,
    [banners],
  );
  return (
    <div className="space-y-[var(--gap-block)]">
      <div className="flex flex-wrap items-center gap-2">
        <IconRobo className="h-5 w-5 text-muted" />
        <h1 className="text-lg font-bold text-text">Automação</h1>
        <Ajuda titulo="Automação — fluxos com a Centi">
          <p>
            Cada automação é um <strong>fluxo</strong> montado com componentes (buscar na Centi, dados do sistema, selecionar,
            ler, comparar, baixar/anexar, apontar erros…). Toda conversa com a Centi é por API, pela extensão do Chrome com o
            login já feito — as telas da Centi nunca são operadas.
          </p>
          <p>
            <strong>Painel do fluxo:</strong> os dados de entrada (os campos dos próprios componentes), as etapas ao vivo e as
            abas de cada componente — a seleção dos protocolos, os DFDs baixados/anexados, os protocolos lidos — e a Análise,
            que acompanha cada item processado em tempo real. O diagrama só aparece em “Diagrama”, para montar o fluxo.
          </p>
          <p>
            <strong>Modelos prontos:</strong> Baixar/anexar DFDs (por protocolo ou por nºs de planejamento), Ler a Tela
            Protocolo, Execução dos DFDs na CM002, Conferir DFDs × Centi e Inclusão PCA — “Usar este modelo”.
          </p>
          <p>
            <strong>Baixar/anexar DFDs:</strong> cada DFD é emitido na entidade da Centi do órgão dele e conferido (o PDF tem de
            trazer o planejamento e o DFD pedidos). Destino: pasta (Downloads, a escolhida ou um .zip com as pastas), o
            protocolo da Centi indicado (Id + nº) ou o protocolo de cada DFD — o anexo leva a autorização de uso único do
            sistema e a sua confirmação na janela da extensão; o já anexado não é emitido de novo.
          </p>
          <p>
            <strong>Segurança:</strong> em Ajustes → Gravação na Centi, o <strong>freio</strong> pausa toda gravação na hora (para
            todos); o <strong>Histórico das execuções</strong> mostra cada lote. A extensão trabalha numa aba PRÓPRIA da Centi
            (grupo azul “Automação PCA”); o ícone dela mostra o andamento e permite <strong>Interromper</strong>. Sair desta tela
            no meio de um fluxo o para.
          </p>
          <p>
            <strong>Extensão:</strong> “Extensão” → descompacte (na atualização, na MESMA pasta) → chrome://extensions → Modo do
            desenvolvedor → Carregar sem compactação (ou ↻) → F5 nesta tela. O login fica salvo nela (e, opcional, cifrado no
            sistema — Ajustes → Login da Centi). <strong>Entidade:</strong> cada DFD vai na entidade da Centi do órgão dele (o
            ID cadastrado no órgão; sem ele, o mapa de Ajustes, a aberta e — com “Descobrir sozinho” — as outras).
          </p>
        </Ajuda>
        <div className="ml-auto flex flex-wrap items-center gap-2">
          {gravacao === false && (
            <Badge tone="red" dot>
              Gravação pausada
            </Badge>
          )}
          {ext && ext.copias > 1 && (
            <Badge tone="amber" dot>
              {ext.copias} cópias da extensão — remova a antiga
            </Badge>
          )}
          {!ext ? (
            <Badge tone="amber" dot>
              Sem extensão
            </Badge>
          ) : !atualizada ? (
            <Badge tone="amber" dot>
              Extensão v{ext.versao} desatualizada
            </Badge>
          ) : logado?.ok && logado.logado ? (
            <Badge tone="emerald" dot>
              Centi logada{logado.entidade ? ` · ${logado.entidade}` : ""}
            </Badge>
          ) : logado?.tela === "login" ? (
            <LoginCenti login={logado.login ?? null} entrando={entrando} onEntrar={() => void entrarAgora()} onOpcoes={() => void pedir("abrirOpcoes", null, 8000)} />
          ) : (
            <Badge tone="amber" dot>
              {logado?.erro ?? "Centi sem login"}
            </Badge>
          )}
          <BotaoAtualizar
            ativo={giroVerificar.girando}
            rotulo="Verificar"
            dica="Verificar a extensão e a Centi"
            detalhe="Verificando a extensão e a Centi…"
            onClick={() => void giroVerificar.girar(async () => (ext ? void (await verificar(true)) : window.location.reload()))}
          />
          <Button size="sm" variant={atualizada ? "secondary" : "primary"} onClick={baixarExtensao} title={`Baixar a extensão ${VERSAO_EXTENSAO_CENTI}`}>
            <IconDownload className="h-4 w-4" /> Extensão {VERSAO_EXTENSAO_CENTI}
          </Button>
          <Dropdown
            papel="dialog"
            ariaLabel="Ajustes"
            align="end"
            width={360}
            trigger={
              <span className="inline-flex h-11 items-center gap-2 rounded-control border border-border-2 bg-surface px-3 text-sm font-semibold text-text lg:h-[var(--h-control-sm)]">
                <IconSettings className="h-4 w-4" /> Ajustes
              </span>
            }
          >
            <Ajustes
              cfg={cfg}
              onCfg={mudar}
              orgaos={orgaos}
              mapa={mapa}
              fixas={cadastradas}
              onEntidade={definirEntidade}
              aberta={logado?.entidade ?? null}
              gravacao={gravacao}
              onGravacao={(v) => void mudarGravacao(v)}
              onHistorico={() => setHistorico(true)}
              gravando={pronto ? gravando : null}
              onGravador={(a) => void usarGravador(a)}
              onConfigurarLogin={() => void pedir("abrirOpcoes", null, 8000)}
            />
          </Dropdown>
        </div>
      </div>

      <FluxosAutomacao
        pedir={pedir}
        lote={loteRef}
        interrompido={interrompidoRef}
        pronto={pronto}
        emissor={emissor}
        atual={logado?.entidade ?? null}
        protocolos={protocolos}
        gestao={gestao}
        importacao={importacao}
        onAbrirProtocolo={abrirProtocolo}
        onRodando={setRodando}
      />

      <BannersMesa
        abrir={aberto}
        onFechar={() => setAberto(null)}
        onAbrir={setAberto}
        pode={banners.pode}
        reparticoes={banners.reparticoes}
        reparticaoAtivaId={null}
        regras={banners.regras}
        orgaos={banners.orgaos}
        pcas={banners.pcas}
        onAlterado={() => router.refresh()}
      />
      {historico && <HistoricoExecucoes onFechar={() => setHistorico(false)} />}
      {gravados && <GravadorReceitas passos={gravados} onFechar={() => setGravados(null)} />}
      {confirmacao}
    </div>
  );
}

/** A aba da Centi está na TELA DE LOGIN: a situação do login automático da extensão + Entrar agora / Configurar login. */
function LoginCenti({
  login,
  entrando,
  onEntrar,
  onOpcoes,
}: {
  login: Resposta["login"];
  entrando: boolean;
  onEntrar: () => void;
  onOpcoes: () => void;
}) {
  const pronto = !!login?.credenciais && !login.pausado;
  const detalhe = !login?.credenciais
    ? "Sem login salvo na extensão"
    : login.pausado
      ? (login.motivo ?? "Login automático pausado")
      : login.auto
        ? "entrando sozinha…"
        : "login automático desligado";
  return (
    <span className="inline-flex flex-wrap items-center gap-2">
      <Badge tone={login?.pausado ? "red" : "amber"} dot>
        <span title={detalhe}>{login?.pausado ? "Centi: login pausado" : "Centi na tela de login"}</span>
      </Badge>
      {pronto && (
        <Button size="sm" variant="secondary" onClick={onEntrar} loading={entrando} title="A extensão entra agora com o login guardado nela">
          Entrar agora
        </Button>
      )}
      <Button size="sm" variant="secondary" onClick={onOpcoes} title={detalhe} aria-label={`Configurar login — ${detalhe}`}>
        <IconKey className="h-4 w-4" /> Configurar login
      </Button>
    </span>
  );
}
