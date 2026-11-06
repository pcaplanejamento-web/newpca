"use client";

import { apagarDadosLocais } from "@/lib/dados-cliente";
import { EVENTO_ALTERNAR_MENU } from "@/lib/menu-lateral";
import { useTheme } from "next-themes";
import { useRouter } from "next/navigation";
import { type ComponentType, type SVGProps, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { casaLocal, infoDosCampos, type LinhaIndice, linhasDaExecucao, pedeIndiceExecucao, pontuar, TIPOS_PADRAO, TIPOS_PESQUISA, textoDoResultado, tituloPesquisa, type TipoExecucaoPesquisa, type TipoPesquisa, type TuplaExecucao } from "@/lib/pesquisa-core";
import { alternarFavorito, type FavoritoPesquisa, lerFavoritos, MAX_FAVORITOS, moverFavorito } from "@/lib/pesquisa-favoritos-core";
import { predicadoBusca } from "@/lib/tabela-filtros";
import { hrefVinculo, linkTarefa, ROTULO_VINCULO, type TipoVinculo } from "@/lib/tarefas-core";
import {
  IconBox,
  IconBuilding,
  IconCalendar,
  IconDatabase,
  IconDocumentos,
  IconEmpenho,
  IconLiquidacao,
  IconPagamento,
  IconClipboard,
  IconClose,
  IconEstrela,
  IconFile,
  IconFilter,
  IconKanban,
  IconPasta,
  IconLayers,
  IconRobo,
  IconSettings,
  IconShield,
  IconUser,
  IconUsers,
  IconWallet, IconVeiculo } from "./icons";
import { AbrirNoLugar, type AlvoNoLugar, alvoNoLugar } from "./AbrirNoLugar";
import { BannerPesquisa, type DicaPesquisa, EVENTO_ABRIR_PESQUISA, type GrupoPesquisa, lerConsulta, numeroExato, type ResultadoPesquisaTela } from "./BannerPesquisa";
import { useComponente } from "./ComponentesPapel";
import { toast } from "./Toast";
import { gravarTemaPessoal, lerTemaPessoal } from "./TemaPessoal";

type Icone = ComponentType<SVGProps<SVGSVGElement>>;
export type TelaPesquisa = { href: string; label: string; secao: string; Icon: Icone };
export type PcaPesquisa = { id: number; nome: string; ano: number };

type Resultado = ResultadoPesquisaTela;
type Grupo = GrupoPesquisa;

const RECENTES = "pesquisa:recentes";
/** A 1ª fase da pesquisa sem prefixo (os tipos mais usados). */

type OpcaoServidor = { id: number; rotulo: string; detalhe: string; href?: string; ids?: string[]; selo?: string; info?: [string, string][] };
type GrupoServidor = { tipo: string; total: number; opcoes: OpcaoServidor[] };
type EspacoIndice = { tipo: "orcamento" | "quadro" | "pca"; id: number; nome: string; abas: [string, string][] };
type Indice = { versao: string; completa: string; conferido: number; grupos: Map<string, LinhaIndice[]>; espacos: EspacoIndice[] };

// O ÍNDICE LOCAL (protocolos e DFDs que a pessoa vê) e as respostas do servidor por termo — só na MEMÓRIA da aba (somem
// ao fechá-la; nada vai ao disco). O índice só é pedido de novo quando a VERSÃO dos dados muda (conferida ao abrir a
// pesquisa, no máximo a cada 60 s); a resposta guardada vale 5 min e também cai quando a versão muda.
let indiceMem: Indice | null = null;
let carregandoIndice: Promise<Indice | null> | null = null;
const respostas = new Map<string, { em: number; versao: string; grupos: GrupoServidor[] }>();
const VALIDADE_RESPOSTA = 5 * 60_000;

async function garantirIndice(): Promise<Indice | null> {
  if (indiceMem && Date.now() - indiceMem.conferido < 60_000) return indiceMem;
  carregandoIndice ??= (async () => {
    try {
      let completa = "";
      if (indiceMem) {
        const v = (await (await fetch("/api/dados/versao", { cache: "no-store" })).json()) as { dados?: string; versao?: string };
        completa = v.versao ?? "";
        if (v.dados === indiceMem.versao) {
          // Os dados da Mesa são os mesmos; se mudou algo FORA deles (um quadro de Tarefas novo, renomeado), só os
          // ESPAÇOS são pedidos de novo — o índice de protocolos e DFDs fica.
          if (completa && completa !== indiceMem.completa) {
            const r = await fetch("/api/pesquisa/indice?so=espacos", { cache: "no-store" });
            const j = (await r.json()) as { ok?: boolean; espacos?: EspacoIndice[] };
            if (r.ok && j.ok) indiceMem = { ...indiceMem, espacos: j.espacos ?? [], completa };
          }
          indiceMem = { ...indiceMem, conferido: Date.now() };
          return indiceMem;
        }
      }
      const r = await fetch("/api/pesquisa/indice", { cache: "no-store" });
      const j = (await r.json()) as { ok?: boolean; versao?: string; completa?: string; grupos?: { tipo: string; completo: boolean; linhas: LinhaIndice[] }[]; espacos?: EspacoIndice[] };
      if (!r.ok || !j.ok || !j.versao) return indiceMem;
      respostas.clear();
      indiceMem = { versao: j.versao, completa: j.completa ?? completa, conferido: Date.now(), grupos: new Map((j.grupos ?? []).filter((g) => g.completo).map((g) => [g.tipo, g.linhas])), espacos: j.espacos ?? [] };
      return indiceMem;
    } catch {
      return indiceMem;
    } finally {
      carregandoIndice = null;
    }
  })();
  return carregandoIndice;
}

type IndiceExecucao = { em: number; validade: number; grupos: Map<string, LinhaIndice[]> };
// O ÍNDICE DE TEXTO da execução (empenhos, liquidações e pagamentos): pedido só quando a pessoa procura TEXTO sem prefixo
// (`pedeIndiceExecucao`) e guardado na memória da aba pela validade que o servidor diz (horas — a cota de leituras do D1).
let indiceExecMem: IndiceExecucao | null = null;
let carregandoExec: Promise<IndiceExecucao | null> | null = null;

async function garantirIndiceExecucao(): Promise<IndiceExecucao | null> {
  if (indiceExecMem && Date.now() - indiceExecMem.em < indiceExecMem.validade) return indiceExecMem;
  carregandoExec ??= (async () => {
    try {
      const r = await fetch("/api/pesquisa/indice-execucao", { cache: "no-store" });
      const j = (await r.json()) as { ok?: boolean; validade?: number; grupos?: { tipo: TipoExecucaoPesquisa; completo: boolean; tuplas: TuplaExecucao[] }[] };
      if (!r.ok || !j.ok) return indiceExecMem;
      indiceExecMem = { em: Date.now(), validade: j.validade ?? 3_600_000, grupos: new Map((j.grupos ?? []).map((g) => [g.tipo, linhasDaExecucao(g.tipo, g.tuplas)])) };
      return indiceExecMem;
    } catch {
      return indiceExecMem;
    } finally {
      carregandoExec = null;
    }
  })();
  return carregandoExec;
}

const MAX_RECENTES = 6;
/** Quantos tipos vão num pedido ao servidor (os demais em pedidos paralelos). */
const TIPOS_POR_PEDIDO = 6;

const ICONE_TIPO: Record<string, Icone> = {
  tela: IconLayers,
  aba: IconLayers,
  acao: IconSettings,
  protocolo: IconClipboard,
  dfd: IconClipboard,
  item: IconClipboard,
  pca: IconBox,
  orcamento: IconWallet,
  tarefa: IconKanban,
  pasta: IconPasta,
  veiculo: IconVeiculo,
  evento: IconCalendar,
  lancamento: IconWallet,
  catalogo: IconDatabase,
  historico: IconDatabase,
  documento: IconDocumentos,
  declaracao: IconFile,
  visao: IconFilter,
  padronizacao: IconDatabase,
  responsavel: IconUser,
  importacao: IconEmpenho,
  empenho: IconEmpenho,
  liquidacao: IconLiquidacao,
  pagamento: IconPagamento,
  usuario: IconUser,
  orgao: IconBuilding,
  unidade: IconBuilding,
  grupo: IconUsers,
  cadastro: IconShield,
  fluxo: IconRobo,
};

/** As DICAS — o prefixo (ou o atalho) restringe a pesquisa a um tipo; Tab completa. */
const DICAS: (DicaPesquisa & { tipo: TipoPesquisa | "pca" | "tela" | "aba" })[] = [
  ...TIPOS_PESQUISA.map((t) => ({ prefixo: t.prefixo, curto: t.curto, tipo: t.tipo, texto: t.texto })),
  { prefixo: "pca:", curto: "pc:", tipo: "pca", texto: "PCAs" },
  { prefixo: "tela:", curto: "te:", tipo: "tela", texto: "Telas do sistema" },
  { prefixo: "aba:", curto: "a:", tipo: "aba", texto: "Abas de cada tela" },
];

/**
 * As ABAS de cada tela (pesquisáveis: "aba: segurança", "orçamento comparativo"…). `href` da tela → as abas (o
 * parâmetro e o valor da URL). As do espaço de cada PCA saem dos PCAs (`abasDosPcas`).
 */
const ABAS_TELAS: Record<string, { param: string; abas: [string, string][] }> = {
  "/painel/mesa": { param: "vista", abas: [["dashboard", "Dashboard"], ["protocolos", "Protocolos"], ["dfds", "DFDs"], ["itens", "Itens"]] },
  "/painel/configuracoes": {
    param: "aba",
    abas: [
      ["identidade", "Identidade"], ["modulos", "Módulos"], ["papeis", "Papéis"], ["protecao", "Proteção de dados"], ["seguranca", "Segurança"], ["termo", "Termo de uso"], ["verificar-termo", "Verificar comprovante"],
      ["escopo", "Filtro da unidade"], ["publico", "Tela pública"], ["cargos", "Cargos e funções"], ["acesso", "Tela de acesso"], ["tabelas", "Tabelas"], ["pcas", "PCAs"], ["situacoes", "Situações"],
      ["feriados", "Feriados"], ["importacoes", "Importações"], ["presenca", "Presença e chat"], ["notificacoes", "Notificações"], ["avaliacao", "Avaliação"],
      ["referencia", "Referência"], ["mais", "Mais"],
    ],
  },
  "/painel/usuarios": { param: "vista", abas: [["ativos", "Usuários ativos"], ["arquivados", "Usuários arquivados"]] },
  "/painel/orgaos": { param: "aba", abas: [["orgaos", "Órgãos"], ["responsaveis", "Responsáveis"]] },
  "/painel/catalogo": { param: "vista", abas: [["catalogo", "Catálogos"], ["lista", "Lista de Itens"], ["unidades", "Medidas"], ["classificacoes", "Classificações"]] },
  "/painel/verificacao": { param: "tipo", abas: [["protocolo", "Verificar protocolo"], ["dfd", "Verificar DFD"]] },
  "/painel/calendario": { param: "vista", abas: [["dia", "Dia"], ["ndias", "4 dias"], ["semana", "Semana"], ["mes", "Mês"], ["ano", "Ano"], ["agenda", "Programação"]] },
};
/** O componente do papel que libera cada aba de tela (sem ele, a aba nem aparece na pesquisa — a tela também a esconde). */
const COMPONENTE_ABA: Record<string, string> = {
  "/painel/mesa?dashboard": "dfd.dashboard",
  "/painel/mesa?protocolos": "dfd.protocolos",
  "/painel/mesa?dfds": "dfd.dfds",
  "/painel/mesa?itens": "dfd.itens",
  "/painel/catalogo?catalogo": "catalogo.catalogos",
  "/painel/catalogo?lista": "catalogo.lista",
  "/painel/catalogo?unidades": "catalogo.unidades",
  "/painel/catalogo?classificacoes": "catalogo.classificacoes",
  "/painel/verificacao?protocolo": "verificacao.protocolo",
  "/painel/verificacao?dfd": "verificacao.dfd",
};
/**
 * As PALAVRAS de cada tela/aba (o que se ajusta nelas): "turnstile" acha Integrações; "senha" acha Segurança. A chave é o
 * `href` da tela ou "href?valor" da aba.
 */
const PALAVRAS: Record<string, string> = {
  "/painel/configuracoes?termo": "termo de uso aceite assinatura lgpd encarregado aparelhos limite troca teste implantação cláusulas",
  "/painel/integracoes": "turnstile captcha google login resend email e-mail trello cloudflare monitoramento métricas",
  "/painel/armazenamento": "banco dados tamanho saúde sessões expurgar online worker",
  "/painel/auditoria": "histórico alterações registro log quem mudou",
  "/painel/automacao": "centi extensão fluxos robô baixar dfds cm002",
  "/painel/empenhos": "despesa execução centi empenhado liquidado pago fornecedor fonte elemento",
  "/painel/liquidacoes": "despesa execução centi liquidação liquidado pago saldo credor nota empenho",
  "/painel/execucao": "dashboard painel execução despesa empenhado liquidado pago a pagar evolução acumulada métricas diárias demonstrativo",
  "/painel/pagamentos": "despesa execução centi pagamento pago ordem de pagamento retenção anulação credor empenho",
  "/painel/usuarios": "pessoas aprovar cadastro matrícula whatsapp arquivados",
  "/painel/usuarios?arquivados": "arquivado arquivada restaurar excluir definitivamente desligado exonerado",
  "/painel/orgaos": "unidades subunidades subunidade centro de custo responsáveis assinatura interessado",
  "/painel/grupos": "permissões telas módulos pcas chat acesso de cada tela todas as unidades unidade de cadastro várias unidades fonte dos dados orçamentos do grupo pcas do grupo escopo mesa do pca",
  "/painel/configuracoes?identidade": "nome logo favicon subtítulo",
  "/painel/configuracoes?verificar-termo": "comprovante aceite código autenticidade arquivo pdf conferir",
  "/painel/configuracoes?modulos": "menu telas seções",
  "/painel/configuracoes?papeis": "permissão ações visualizar manipular importar exportar excluir configurar detalhes componentes abas ocultar esconder dashboard orçamento documentos importação mesa do pca restrições só os meus responsável",
  "/painel/configuracoes?protecao": "cópia impressão captura marca d'água",
  "/painel/configuracoes?seguranca": "inatividade sessão login suspeito senha",
  "/painel/configuracoes?acesso": "login vitrine textos manchete",
  "/painel/configuracoes?escopo": "filtro da unidade cabeçalho unidade ativa obedecer pca orçamento catálogo tarefas",
  "/painel/configuracoes?publico": "consulta pública site abas publicadas menu",
  "/painel/configuracoes?tabelas": "linhas por página",
  "/painel/configuracoes?importacoes": "centi importação importar cards empenhos liquidações pagamentos vínculos integração api atualização automática conferência",
  "/painel/configuracoes?situacoes": "situação protocolo cores",
  "/painel/configuracoes?feriados": "calendário ponto facultativo",
  "/painel/configuracoes?presenca": "online chat invisível ausente",
  "/painel/configuracoes?notificacoes": "avisos sino e-mail limpeza comunicado alcance",
  "/painel/configuracoes?avaliacao": "importância bloqueia avisa automático regras protocolação assuntos tipos",
};

const ABAS_PERFIL: [string, string][] = [
  ["conta", "Conta"], ["seguranca", "Segurança"], ["acessos", "Histórico de acesso"], ["aparencia", "Aparência"],
  ["notificacoes", "Notificações"], ["trabalho", "Trabalho"], ["acesso", "Meu acesso"],
];
/**
 * As SUB-ABAS de Configurações (dentro de uma aba): as Importações por tipo, as de Notificações e as de Avaliação — o
 * link já abre a sub-aba (`tipo`/`sub`). Só o ADM abre Configurações.
 */
const SUBABAS_CONFIG: { aba: string; rotuloAba: string; param: string; abas: [string, string][]; palavras?: string }[] = [
  { aba: "importacoes", rotuloAba: "Importações", param: "tipo", abas: [["empenhos", "Importações de empenhos"], ["liquidacoes", "Importações de liquidações"], ["pagamentos", "Importações de pagamentos"]], palavras: "centi cards vínculos atualização automática" },
  { aba: "notificacoes", rotuloAba: "Notificações", param: "sub", abas: [["avisos", "Avisos"], ["limpeza", "Limpeza dos avisos"], ["comunicado", "Comunicado"], ["alcance", "Alcance dos avisos"]], palavras: "sino e-mail" },
  { aba: "avaliacao", rotuloAba: "Avaliação", param: "sub", abas: [["importancias", "Importâncias"], ["protocolo", "Avaliação do protocolo"], ["dfd", "Avaliação do DFD"], ["item", "Avaliação do item"], ["protocolacao", "Protocolação"]], palavras: "regras bloqueia avisa" },
];

function lerRecentes(): Resultado[] {
  try {
    const v = JSON.parse(localStorage.getItem(RECENTES) ?? "[]");
    return Array.isArray(v) ? v.filter((r) => r && typeof r.href === "string" && typeof r.rotulo === "string").slice(0, MAX_RECENTES) : [];
  } catch {
    return [];
  }
}

function gravarRecentes(lista: Resultado[]) {
  try {
    localStorage.setItem(RECENTES, JSON.stringify(lista.slice(0, MAX_RECENTES).map(({ acao: _, ...r }) => r)));
  } catch {
    /* sem armazenamento: só não lembra */
  }
}

/**
 * PESQUISA DO SISTEMA (o padrão do Cloudflare): Ctrl+K/⌘K ou o campo do menu abrem o BANNER.
 * - Sem texto: Recentes (com × e "Limpar"), Ações rápidas e as Dicas de prefixo.
 * - Com texto: grupos — Ações · Telas · Abas (de cada tela e de cada PCA) · PCAs (o do cabeçalho primeiro) e, do servidor
 *   num pedido só (`GET /api/pesquisa`, no escopo e no papel da pessoa), Protocolos · DFDs · Tarefas · Orçamentos — cada um
 *   com "Ver todos (N)", o número EXATO primeiro e o trecho que casou em destaque. Prefixo ("dfd:" ou "d:", Tab completa)
 *   restringe a um tipo.
 * - ↑/↓, Enter, Esc; prévia do item em foco à direita (desktop); tela cheia no celular; combobox acessível.
 */
export function PesquisaSistema({ telas, pcas, pcaFiltroId = null, usuarioId }: { telas: TelaPesquisa[]; pcas: PcaPesquisa[]; pcaFiltroId?: number | null; usuarioId: number }) {
  const router = useRouter();
  const { resolvedTheme, setTheme } = useTheme();
  const [aberto, setAberto] = useState(false);
  // O registro achado aberto AQUI, por cima da tela atual (protocolo, DFD, item, tarefa, documento).
  const [noLugar, setNoLugar] = useState<AlvoNoLugar | null>(null);
  const fecharNoLugar = useCallback(() => setNoLugar(null), []);
  const [texto, setTexto] = useState("");
  const [recentes, setRecentes] = useState<Resultado[]>([]);
  const [remotos, setRemotos] = useState<Grupo[]>([]);
  const [carregando, setCarregando] = useState(false);
  const [falhou, setFalhou] = useState(false);
  const [tentativa, setTentativa] = useState(0);
  // FAVORITOS (na conta da pessoa): a lista à vista + a última confirmada pelo servidor (para voltar se falhar).
  const [favoritos, setFavoritos] = useState<FavoritoPesquisa[]>([]);
  const gravados = useRef<FavoritoPesquisa[]>([]);
  const filaFav = useRef<Promise<void>>(Promise.resolve());
  const [largo, setLargo] = useState(false);

  useEffect(() => {
    const abrir = () => setAberto(true);
    const k = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setAberto((v) => !v);
      }
    };
    window.addEventListener(EVENTO_ABRIR_PESQUISA, abrir);
    window.addEventListener("keydown", k);
    return () => {
      window.removeEventListener(EVENTO_ABRIR_PESQUISA, abrir);
      window.removeEventListener("keydown", k);
    };
  }, []);

  useEffect(() => {
    if (!aberto) return;
    setRecentes(lerRecentes());
    void (async () => {
      try {
        const r = await fetch("/api/pesquisa/favoritos");
        const j = (await r.json()) as { ok?: boolean; itens?: unknown };
        if (r.ok && j.ok) {
          const l = lerFavoritos(j.itens);
          gravados.current = l;
          setFavoritos(l);
        }
      } catch {
        /* sem rede: segue com os já carregados */
      }
    })();
    setTexto("");
    setRemotos([]);
  }, [aberto]);

  const { tipo, termo } = lerConsulta(texto, DICAS) as { tipo: (typeof DICAS)[number]["tipo"] | null; termo: string };
  // Sem prefixo, o servidor escolhe (todos os tipos que a pessoa pode ver); com prefixo, só aquele.
  const tiposServidor: TipoPesquisa[] | null = tipo === "tela" || tipo === "aba" || tipo === "pca" ? [] : tipo ? [tipo] : null;

  // O índice local: pedido ao abrir a pesquisa (só de novo quando a versão dos dados muda).
  const [indiceLocal, setIndiceLocal] = useState<Indice | null>(indiceMem);
  // As abas/visões que o PAPEL esconde (Detalhes → Componentes) também não aparecem na pesquisa.
  const libera = useComponente();
  useEffect(() => {
    if (!aberto) return;
    let vivo = true;
    void garantirIndice().then((i) => vivo && setIndiceLocal(i));
    return () => {
      vivo = false;
    };
  }, [aberto]);

  // A EXECUÇÃO por texto: sem prefixo, o termo com letras pede o índice de texto (uma vez a cada poucas horas por aba).
  const [indiceExec, setIndiceExec] = useState<IndiceExecucao | null>(indiceExecMem);
  const querExec = aberto && !tipo && pedeIndiceExecucao(termo);
  useEffect(() => {
    if (!querExec) return;
    let vivo = true;
    void garantirIndiceExecucao().then((i) => vivo && setIndiceExec(i));
    return () => {
      vivo = false;
    };
  }, [querExec]);

  // Protocolos e DFDs no ÍNDICE LOCAL (na hora, sem pedido); o resto num pedido ÚNICO ao servidor, 400 ms depois da
  // última tecla, com a resposta do mesmo termo guardada e o pedido antigo CANCELADO quando o termo muda.
  // biome-ignore lint/correctness/useExhaustiveDependencies: `tiposServidor` sai de `tipo`; `tentativa` refaz após falha.
  useEffect(() => {
    if (!aberto || termo.length < 2 || tiposServidor?.length === 0) {
      setRemotos([]);
      setCarregando(false);
      setFalhou(false);
      return;
    }
    const pedidos = tiposServidor ?? TIPOS_PADRAO;
    const locais = pedidos.filter((t) => indiceLocal?.grupos.has(t));
    const doServidor = pedidos.filter((t) => !locais.includes(t));
    const limite = tipo ? 30 : 5;
    const converter = (g: GrupoServidor): Grupo => ({
      tipo: g.tipo,
      titulo: tituloPesquisa(g.tipo),
      total: g.total,
      itens: g.opcoes
        .map<Resultado>((o) => ({
          chave: `${g.tipo}:${o.id}`,
          rotulo: o.rotulo,
          detalhe: o.detalhe || undefined,
          href: o.href ?? (g.tipo === "tarefa" ? linkTarefa(o.id) : hrefVinculo({ tipo: g.tipo as TipoVinculo, id: o.id })),
          tipo: g.tipo,
          ...(o.ids?.length ? { ids: o.ids } : {}),
          ...(o.selo ? { selo: o.selo } : {}),
          ...(o.info?.length ? { info: o.info } : {}),
        }))
        .sort((a, b) => Number(numeroExato([b.rotulo, ...(b.ids ?? [])].join(" "), termo)) - Number(numeroExato([a.rotulo, ...(a.ids ?? [])].join(" "), termo))),
    });
    const casa = casaLocal(termo);
    const gruposLocais: GrupoServidor[] = locais.map((t) => {
      const achados = (indiceLocal?.grupos.get(t) ?? []).filter(casa);
      const opcoes = achados
        .map((o, i) => ({ o, i, p: pontuar(textoDoResultado(o), termo) }))
        .sort((x, y) => y.p - x.p || x.i - y.i)
        .slice(0, limite)
        .map(({ o }) => ({ id: o.id, rotulo: o.rotulo, detalhe: o.detalhe, href: o.href, ids: o.ids, selo: o.selo, info: infoDosCampos(t, o.campos) }));
      return { tipo: t, total: achados.length, opcoes };
    });
    // Empenhos, liquidações e pagamentos pelo TEXTO no índice local; o servidor segue achando o nº exato (todos os anos) —
    // os dois juntos, sem repetir.
    const gruposExec: GrupoServidor[] =
      !tipo && indiceExec && pedeIndiceExecucao(termo)
        ? doServidor.flatMap((t) => {
            const linhas = indiceExec.grupos.get(t);
            if (!linhas) return [];
            const achados = linhas.filter(casa);
            const opcoes = achados
              .map((o, i) => ({ o, i, p: pontuar(`${o.rotulo} ${o.detalhe}`, termo) }))
              .sort((x, y) => y.p - x.p || x.i - y.i)
              .slice(0, limite)
              .map(({ o }) => ({ id: o.id, rotulo: o.rotulo, detalhe: o.detalhe, href: o.href }));
            return [{ tipo: t, total: achados.length, opcoes }];
          })
        : [];
    const comExec = (srv: GrupoServidor[]) => {
      const out = srv.map((g) => {
        const l = gruposExec.find((x) => x.tipo === g.tipo);
        if (!l) return g;
        const ids = new Set(g.opcoes.map((o) => o.id));
        const extra = l.opcoes.filter((o) => !ids.has(o.id));
        return { ...g, total: Math.max(g.total, l.total), opcoes: [...g.opcoes, ...extra].slice(0, limite) };
      });
      return [...out, ...gruposExec.filter((l) => !srv.some((g) => g.tipo === l.tipo))];
    };
    const juntar = (srvBruto: GrupoServidor[]) => {
      const srv = comExec(srvBruto);
      return [...gruposLocais, ...srv]
        .filter((g) => g.total > 0)
        .sort((x, y) => pedidos.indexOf(x.tipo as TipoPesquisa) - pedidos.indexOf(y.tipo as TipoPesquisa))
        .map(converter);
    };
    setFalhou(false);
    const chave = `${doServidor.join(",")}|${limite}|${termo.toLowerCase()}`;
    const guardada = respostas.get(chave);
    if (!doServidor.length || (guardada && Date.now() - guardada.em < VALIDADE_RESPOSTA && guardada.versao === (indiceLocal?.versao ?? ""))) {
      setRemotos(juntar(guardada?.grupos ?? []));
      setCarregando(false);
      return;
    }
    setRemotos(juntar([]));
    setCarregando(true);
    const ctl = new AbortController();
    const t = setTimeout(async () => {
      try {
        // Em PARTES de até `TIPOS_POR_PEDIDO` tipos, ao mesmo tempo: cada pedido tem o próprio limite de consultas do
        // Worker (50) — todos os tipos num pedido só passariam dele. Com o prefixo, `prefixo=1` (procura também no texto).
        const partes: TipoPesquisa[][] = [];
        for (let i = 0; i < doServidor.length; i += TIPOS_POR_PEDIDO) partes.push(doServidor.slice(i, i + TIPOS_POR_PEDIDO));
        const respostasPartes = await Promise.all(
          partes.map(async (p) => {
            const r = await fetch(`/api/pesquisa?q=${encodeURIComponent(termo)}&tipos=${p.join(",")}&limite=${limite}${tipo ? "&prefixo=1" : ""}`, { signal: ctl.signal });
            const j = (await r.json()) as { ok?: boolean; grupos?: GrupoServidor[] };
            if (!r.ok || !j.ok) throw new Error();
            return j.grupos ?? [];
          }),
        );
        const grupos = respostasPartes.flat();
        if (respostas.size >= 60) respostas.delete(respostas.keys().next().value as string);
        respostas.set(chave, { em: Date.now(), versao: indiceLocal?.versao ?? "", grupos });
        setRemotos(juntar(grupos));
      } catch {
        if (!ctl.signal.aborted) setFalhou(true);
      } finally {
        if (!ctl.signal.aborted) setCarregando(false);
      }
    }, 400);
    return () => {
      ctl.abort();
      clearTimeout(t);
    };
  }, [aberto, tipo, termo, tentativa, indiceLocal, indiceExec]);

  const fechar = useCallback(() => setAberto(false), []);

  const acoes = useMemo<Resultado[]>(
    () => [
      {
        chave: "acao:tema",
        rotulo: resolvedTheme === "dark" ? "Usar o tema claro" : "Usar o tema escuro",
        detalhe: "Aparência",
        tipo: "acao",
        acao: () => {
          const escuro = resolvedTheme === "dark";
          gravarTemaPessoal({ ...lerTemaPessoal(), modo: escuro ? "claro" : "escuro" });
          setTheme(escuro ? "light" : "dark");
        },
      },
      { chave: "acao:menu", rotulo: "Recolher ou expandir o menu", detalhe: "Menu lateral", tipo: "acao", acao: () => window.dispatchEvent(new Event(EVENTO_ALTERNAR_MENU)) },
      { chave: "acao:perfil", rotulo: "Meu perfil", detalhe: "Conta", tipo: "acao", href: "/painel/perfil" },
      {
        chave: "acao:sair",
        rotulo: "Sair do sistema",
        detalhe: "Conta",
        tipo: "acao",
        acao: async () => {
          try {
            await fetch("/api/auth/logout", { method: "POST" });
          } catch {
            /* segue para o login */
          }
          await apagarDadosLocais();
          router.push("/login");
          router.refresh();
        },
      },
    ],
    [resolvedTheme, setTheme, router],
  );

  /** As abas de TODAS as telas que a pessoa abre + as de cada PCA. */
  const abas = useMemo<Resultado[]>(() => {
    const porTela = telas.flatMap((t) => {
      const def = ABAS_TELAS[t.href];
      return def
        ? def.abas.filter(([v]) => {
            const comp = COMPONENTE_ABA[`${t.href}?${v}`];
            return !comp || libera(comp);
          }).map<Resultado>(([v, r]) => ({
            chave: `aba:${t.href}:${v}`,
            rotulo: r,
            caminho: [t.secao, t.label].filter(Boolean),
            href: `${t.href}?${def.param}=${v}`,
            tipo: "aba",
            palavras: PALAVRAS[`${t.href}?${v}`],
          }))
        : [];
    });
    const perfil = ABAS_PERFIL.map<Resultado>(([v, r]) => ({ chave: `aba:perfil:${v}`, rotulo: r, caminho: ["Conta", "Perfil"], href: `/painel/perfil?aba=${v}`, tipo: "aba" }));
    const subConfig = telas.some((t) => t.href === "/painel/configuracoes")
      ? SUBABAS_CONFIG.flatMap((g) =>
          g.abas.map<Resultado>(([v, r]) => ({ chave: `aba:config:${g.aba}:${v}`, rotulo: r, caminho: ["Configurações", g.rotuloAba], href: `/painel/configuracoes?aba=${g.aba}&${g.param}=${v}`, tipo: "aba", palavras: g.palavras })),
        )
      : [];
    // Os ESPAÇOS do índice (orçamentos e quadros de Tarefas): as abas que a pessoa abre em cada um.
    const dosEspacos = (indiceLocal?.espacos ?? []).flatMap((e) =>
      e.abas.map<Resultado>(([v, r]) =>
        e.tipo === "pca"
          ? { chave: `aba:pca:${e.id}:${v}`, rotulo: r, caminho: ["PCA", e.nome], href: `/painel/pca/${e.id}?aba=${v}`, tipo: "aba" }
          : e.tipo === "orcamento"
            ? { chave: `aba:orc:${e.id}:${v}`, rotulo: r, caminho: ["Orçamento", e.nome], href: `/painel/orcamento/${e.id}?aba=${v}`, tipo: "aba" }
            : { chave: `aba:quadro:${e.id}:${v}`, rotulo: r, caminho: ["Tarefas", e.nome], href: `/painel/tarefas/${e.id}?aba=${v}`, tipo: "aba" },
      ),
    );
    return [...porTela, ...subConfig, ...perfil, ...dosEspacos];
  }, [telas, indiceLocal, libera]);

  const grupos = useMemo<Grupo[]>(() => {
    const casa = predicadoBusca(termo);
    if (!texto.trim()) {
      const g: Grupo[] = [];
      if (!largo && favoritos.length) g.push({ tipo: "favoritos", titulo: "Favoritos", itens: favoritos });
      if (recentes.length) g.push({ tipo: "recentes", titulo: "Recentes", itens: recentes });
      g.push({ tipo: "acao", titulo: "Ações rápidas", itens: acoes });
      return g;
    }
    if (!casa) return [];
    const quer = (t: string) => !tipo || tipo === t;
    const locais: Grupo[] = [
      { tipo: "acao", titulo: "Ações", itens: quer("acao") && !tipo ? acoes.filter((a) => casa([a.rotulo, a.detalhe])) : [] },
      {
        tipo: "tela",
        titulo: "Telas",
        itens: quer("tela") ? telas.filter((t) => casa([t.label, t.secao, PALAVRAS[t.href] ?? ""])).map((t) => ({ chave: `tela:${t.href}`, rotulo: t.label, caminho: t.secao ? [t.secao] : undefined, href: t.href, tipo: "tela" })) : [],
      },
      { tipo: "aba", titulo: "Abas", itens: quer("aba") ? abas.filter((a) => casa([a.rotulo, ...(a.caminho ?? []), `${(a.caminho ?? []).join(" ")} ${a.rotulo}`, a.palavras ?? ""])).slice(0, tipo ? 60 : 8) : [] },
      {
        tipo: "pca",
        titulo: "PCAs",
        itens: quer("pca")
          ? pcas
              .filter((p) => casa([p.nome, String(p.ano)]))
              .sort((a, b) => Number(b.id === pcaFiltroId) - Number(a.id === pcaFiltroId))
              .map((p) => ({ chave: `pca:${p.id}`, rotulo: p.nome, caminho: ["PCA", String(p.ano)], detalhe: p.id === pcaFiltroId ? "selecionado no topo" : undefined, href: `/painel/pca/${p.id}`, tipo: "pca" }))
          : [],
      },
    ];
    // Enquanto o servidor responde, cada grupo dele mostra o esqueleto.
    // Na 2ª fase, os grupos que já chegaram ficam e um esqueleto só diz que segue procurando nas outras telas.
    const doServidor: Grupo[] = !carregando
      ? remotos
      : remotos.length
        ? [...remotos, { tipo: "mais", titulo: "Procurando nas outras telas…", itens: [], carregando: true }]
        : (tiposServidor ?? TIPOS_PADRAO).filter((t) => !indiceLocal?.grupos.has(t)).map((t) => ({ tipo: t, titulo: tituloPesquisa(t), itens: [], carregando: true }));
    return [...locais, ...doServidor].filter((g) => g.itens.length || g.carregando);
  }, [texto, termo, tipo, largo, favoritos, recentes, acoes, telas, abas, pcas, pcaFiltroId, remotos, carregando, tiposServidor, indiceLocal]);

  // Os filtros que TÊM algo para o termo (a pesquisa em "Tudo" terminou): só eles aparecem, com a contagem. Enquanto a
  // pesquisa corre (ou num filtro já escolhido), vale a última contagem do MESMO termo — os chips não piscam.
  const [relevantes, setRelevantes] = useState<{ termo: string; contas: Map<string, number> } | null>(null);
  useEffect(() => {
    if (termo.length < 2) return setRelevantes(null);
    if (tipo || carregando || falhou) return;
    const contas = new Map<string, number>();
    for (const g of grupos) {
      const chave = g.tipo === "aba" ? "tela" : g.tipo;
      contas.set(chave, (contas.get(chave) ?? 0) + (g.total ?? g.itens.length));
    }
    setRelevantes({ termo, contas });
  }, [grupos, termo, tipo, carregando, falhou]);

  const semTexto = !texto.trim();
  const baixo = texto.trim().toLowerCase();
  // Os FILTROS RÁPIDOS: só das telas que a pessoa abre (a rota confere de novo); tocar restringe a pesquisa ao tipo.
  const abre = (h: string) => telas.some((t) => t.href === h);
  const todosFiltros: { value: string; label: string }[] = [
    ...(abre("/painel/mesa") || abre("/painel/pca") ? [{ value: "protocolo", label: "Protocolos" }, { value: "dfd", label: "DFDs" }, { value: "item", label: "Itens" }] : []),
    ...(abre("/painel/tarefas") || abre("/painel/calendario") ? [{ value: "tarefa", label: "Tarefas" }] : []),
    ...(abre("/painel/tarefas") ? [{ value: "pasta", label: "Pastas" }] : []),
    ...(abre("/painel/veiculos") || abre("/painel/frotas") ? [{ value: "veiculo", label: "Veículos" }] : []),
    ...(abre("/painel/calendario") ? [{ value: "evento", label: "Calendário" }] : []),
    ...(abre("/painel/orcamento")
      ? [{ value: "orcamento", label: "Orçamentos" }, ...(libera("orcamento.lancamentos") ? [{ value: "lancamento", label: "Lançamentos" }] : []), ...(libera("orcamento.visoes") ? [{ value: "visao", label: "Visões" }] : [])]
      : []),
    ...(abre("/painel/catalogo")
      ? [
          ...(libera("catalogo.catalogos") ? [{ value: "catalogo", label: "Catálogo" }] : []),
          ...(libera("catalogo.historico") ? [{ value: "historico", label: "Histórico" }] : []),
          ...(libera("catalogo.unidades") || libera("catalogo.classificacoes") ? [{ value: "padronizacao", label: "Medidas" }] : []),
        ]
      : []),
    ...(abre("/painel/empenhos") ? [{ value: "empenho", label: "Empenhos" }] : []),
    ...(abre("/painel/liquidacoes") ? [{ value: "liquidacao", label: "Liquidações" }] : []),
    ...(abre("/painel/pagamentos") ? [{ value: "pagamento", label: "Pagamentos" }] : []),
    ...(abre("/painel/usuarios")
      ? ["usuario", "orgao", "unidade", "responsavel", "importacao", "grupo", "cadastro", "fluxo"].map((v) => ({ value: v, label: tituloPesquisa(v) }))
      : []),
    ...(abre("/painel/documentos") ? [{ value: "documento", label: "Documentos" }] : []),
    ...(abre("/painel/pca") ? [{ value: "pca", label: "PCAs" }, ...(libera("pca.declaracoes") ? [{ value: "declaracao", label: "Declarações" }] : [])] : []),
    { value: "tela", label: "Telas" },
  ];
  // As DICAS só dos tipos que a pessoa pode pesquisar (os mesmos dos filtros) + as abas.
  const tiposAcessiveis = new Set<string>([...todosFiltros.map((f) => f.value), "aba"]);
  const dicasAcesso = DICAS.filter((d) => tiposAcessiveis.has(d.tipo));
  const dicas = semTexto ? dicasAcesso : texto.includes(":") ? [] : dicasAcesso.filter((d) => d.prefixo.startsWith(baixo) || d.curto.startsWith(baixo));
  // Desktop (lg): os favoritos ficam no painel da direita; abaixo dele, como um grupo da lista.
  useEffect(() => {
    const m = window.matchMedia("(min-width: 64rem)");
    const ver = () => setLargo(m.matches);
    ver();
    m.addEventListener("change", ver);
    return () => m.removeEventListener("change", ver);
  }, []);

  /** Grava a lista (otimista, uma gravação por vez; a que falha volta à última confirmada). */
  function salvarFavoritos(nova: FavoritoPesquisa[]) {
    setFavoritos(nova);
    filaFav.current = filaFav.current.then(async () => {
      try {
        const r = await fetch("/api/pesquisa/favoritos", { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify({ itens: nova }) });
        const j = (await r.json()) as { ok?: boolean; itens?: unknown };
        if (!r.ok || !j.ok) throw new Error();
        gravados.current = lerFavoritos(j.itens);
      } catch {
        setFavoritos(gravados.current);
        toast.error("Não foi possível salvar os favoritos. Tente de novo.");
      }
    });
  }

  const ehFavorito = (chave: string) => favoritos.some((f) => f.chave === chave);

  function alternar(r: Resultado) {
    if (!r.href) return;
    const { lista, cheio } = alternarFavorito(favoritos, { chave: r.chave, rotulo: r.rotulo, caminho: r.caminho, detalhe: r.detalhe, href: r.href, tipo: r.tipo });
    if (cheio) {
      toast.error(`Até ${MAX_FAVORITOS} favoritos — tire um para incluir outro.`);
      return;
    }
    salvarFavoritos(lista);
  }

  /** Abre o resultado: protocolo, DFD, item, tarefa e documento no componente padrão AQUI (sem sair da tela); o resto
   *  (telas, abas, cadastros…) na tela dele. A chave é "tipo:id" — também nos recentes e favoritos. */
  function ir(r: { chave: string; tipo: string; rotulo: string; href?: string }) {
    const i = r.chave.indexOf(":");
    const alvo = i > 0 ? alvoNoLugar(r.chave.slice(0, i), Number(r.chave.slice(i + 1)), r.rotulo) : null;
    if (alvo) setNoLugar(alvo);
    else if (r.href) router.push(r.href);
  }

  function abrirFavorito(f: FavoritoPesquisa) {
    gravarRecentes([f, ...lerRecentes().filter((x) => x.chave !== f.chave)]);
    setAberto(false);
    ir(f);
  }

  function escolher(r: Resultado) {
    if (r.tipo !== "acao" || r.href) gravarRecentes([r, ...lerRecentes().filter((x) => x.chave !== r.chave)]);
    setAberto(false);
    if (r.acao) r.acao();
    else ir(r);
  }

  function esquecer(chave: string) {
    const novos = recentes.filter((r) => r.chave !== chave);
    setRecentes(novos);
    gravarRecentes(novos);
  }

  const lugar = <AbrirNoLugar alvo={noLugar} usuarioId={usuarioId} onFechar={fecharNoLugar} onTrocar={setNoLugar} />;
  if (!aberto) return lugar;
  // Sem pesquisa: todos os filtros da pessoa. Com pesquisa: só os que têm resultado (e o escolhido), com a contagem.
  const contas = relevantes?.termo === termo ? relevantes.contas : null;
  const filtros =
    termo.length >= 2 && !tipo && !contas && !falhou
      ? null
      : [{ value: "", label: "Tudo" }, ...(contas ? todosFiltros.filter((f) => contas.has(f.value) || f.value === tipo).map((f) => ({ ...f, conta: contas.get(f.value) })) : todosFiltros)];

  return (
    <>
    {lugar}
    <BannerPesquisa
      rotulo="Pesquisa no sistema"
      placeholder="Pesquise em todo o sistema — telas, Mesa, orçamento, catálogo, tarefas…"
      texto={texto}
      onTexto={setTexto}
      onFechar={fechar}
      dicas={DICAS}
      dicasVisiveis={dicas}
      grupos={grupos}
      filtros={filtros}
      carregando={carregando}
      previaCarregando={carregando && !remotos.length}
      falhou={falhou}
      onTentar={() => setTentativa((n) => n + 1)}
      icones={ICONE_TIPO}
      rotuloTipo={(r) => (r.tipo === "acao" ? "Ação" : r.tipo === "aba" ? "Aba" : r.tipo === "tela" ? "Tela" : (ROTULO_VINCULO[r.tipo as TipoVinculo] ?? tituloPesquisa(r.tipo)))}
      onEscolher={escolher}
      onEsquecer={esquecer}
      onLimparRecentes={() => {
        setRecentes([]);
        gravarRecentes([]);
      }}
      favorito={{ pode: (r) => !!r.href && !r.acao, eh: ehFavorito, alternar }}
      lateralExtra={
        <div className="flex min-h-0 flex-1 flex-col border-t border-border">
          <p className="flex shrink-0 items-center gap-1.5 px-4 pt-3 pb-1.5 text-[12px] font-semibold text-muted">
            <IconEstrela className="h-3.5 w-3.5" aria-hidden="true" />
            Favoritos
            <span className="ml-auto font-normal text-faint">
              {favoritos.length}/{MAX_FAVORITOS}
            </span>
          </p>
          <ul className="min-h-0 flex-1 overflow-y-auto px-2 pb-2">
            {favoritos.length === 0 && <li className="px-2 py-3 text-[12.5px] leading-snug text-faint">Toque na estrela de um resultado para guardá-lo aqui. Vale em todos os seus aparelhos.</li>}
            {favoritos.map((f, i) => {
              const Ic = ICONE_TIPO[f.tipo] ?? IconLayers;
              return (
                <li key={f.chave} className="group/fav relative">
                  <button
                    type="button"
                    onClick={() => abrirFavorito(f)}
                    title={[...(f.caminho ?? []), f.rotulo].join(" › ")}
                    className="flex min-h-9 w-full items-center gap-2 rounded-control px-2 py-1.5 pr-24 text-left hover:bg-surface"
                  >
                    <Ic className="h-3.5 w-3.5 shrink-0 text-muted" aria-hidden="true" />
                    <span className="min-w-0 flex-1 truncate text-[13px] text-text">{f.rotulo}</span>
                  </button>
                  <span className="absolute top-1/2 right-1 flex -translate-y-1/2 items-center opacity-0 transition-opacity group-hover/fav:opacity-100 focus-within:opacity-100">
                    <button type="button" disabled={i === 0} onClick={() => salvarFavoritos(moverFavorito(favoritos, f.chave, -1))} aria-label={`Subir ${f.rotulo}`} title="Subir" className="grid h-7 w-7 place-items-center rounded-control text-faint hover:bg-surface hover:text-text disabled:opacity-30">
                      ↑
                    </button>
                    <button type="button" disabled={i === favoritos.length - 1} onClick={() => salvarFavoritos(moverFavorito(favoritos, f.chave, 1))} aria-label={`Descer ${f.rotulo}`} title="Descer" className="grid h-7 w-7 place-items-center rounded-control text-faint hover:bg-surface hover:text-text disabled:opacity-30">
                      ↓
                    </button>
                    <button type="button" onClick={() => salvarFavoritos(favoritos.filter((x) => x.chave !== f.chave))} aria-label={`Tirar ${f.rotulo} dos favoritos`} title="Tirar dos favoritos" className="grid h-7 w-7 place-items-center rounded-control text-faint hover:bg-surface hover:text-text">
                      <IconClose className="h-3.5 w-3.5" />
                    </button>
                  </span>
                </li>
              );
            })}
          </ul>
        </div>
      }
    />
    </>
  );
}
