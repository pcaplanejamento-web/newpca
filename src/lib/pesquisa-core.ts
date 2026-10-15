/**
 * PESQUISA DO SISTEMA — o catálogo ÚNICO dos tipos que o servidor pesquisa (o banner Ctrl+K): o título do grupo, o
 * prefixo/atalho que restringe a pesquisa a ele e o que se pode digitar. Puro (a rota e a tela usam o mesmo).
 */
export const TIPOS_PESQUISA = [
  { tipo: "protocolo", titulo: "Protocolos", prefixo: "protocolo:", curto: "p:", texto: "Protocolos (nº, Id, assunto, interessado)" },
  { tipo: "dfd", titulo: "DFDs", prefixo: "dfd:", curto: "d:", texto: "DFDs (nº, planejamento, objeto, protocolo)" },
  { tipo: "item", titulo: "Itens", prefixo: "item:", curto: "i:", texto: "Itens dos DFDs (código, descrição)" },
  { tipo: "tarefa", titulo: "Tarefas", prefixo: "tarefa:", curto: "t:", texto: "Tarefas (título, nº do ticket)" },
  { tipo: "evento", titulo: "Calendário", prefixo: "evento:", curto: "e:", texto: "Eventos do calendário (título, local, descrição)" },
  { tipo: "orcamento", titulo: "Orçamentos", prefixo: "orcamento:", curto: "o:", texto: "Orçamentos (nome, ano)" },
  { tipo: "lancamento", titulo: "Lançamentos do orçamento", prefixo: "lancamento:", curto: "l:", texto: "Lançamentos (ficha, ação, elemento, unidade, função, programa, fonte)" },
  { tipo: "catalogo", titulo: "Catálogo", prefixo: "catalogo:", curto: "c:", texto: "Itens do catálogo (código, descrição)" },
  { tipo: "historico", titulo: "Histórico de compra", prefixo: "historico:", curto: "h:", texto: "Histórico de compra (código, produto, contrato, processo)" },
  { tipo: "usuario", titulo: "Usuários", prefixo: "usuario:", curto: "u:", texto: "Usuários (nome, apelido, e-mail, matrícula) — administração" },
  { tipo: "orgao", titulo: "Órgãos", prefixo: "orgao:", curto: "og:", texto: "Órgãos (nome, sigla) — administração" },
  { tipo: "unidade", titulo: "Unidades", prefixo: "unidade:", curto: "un:", texto: "Unidades (nome, sigla) — administração" },
  { tipo: "grupo", titulo: "Grupos", prefixo: "grupo:", curto: "g:", texto: "Grupos de acesso — administração" },
  { tipo: "cadastro", titulo: "Cadastros", prefixo: "cadastro:", curto: "ca:", texto: "Papéis, cargos, situações e feriados — administração" },
  { tipo: "fluxo", titulo: "Automações", prefixo: "automacao:", curto: "au:", texto: "Automações (nome, descrição) — administração" },
] as const;

export type TipoPesquisa = (typeof TIPOS_PESQUISA)[number]["tipo"];
const CONHECIDOS = new Set<string>(TIPOS_PESQUISA.map((t) => t.tipo));
export const ehTipoPesquisa = (v: string): v is TipoPesquisa => CONHECIDOS.has(v);
export const tituloPesquisa = (t: string) => TIPOS_PESQUISA.find((x) => x.tipo === t)?.titulo ?? t;

/** Os tipos que a pesquisa SEM prefixo consulta (os de administração só aparecem ao ADM — a rota confere). */
export const TIPOS_PADRAO: TipoPesquisa[] = TIPOS_PESQUISA.map((t) => t.tipo);

/** Um resultado do servidor: o link já é o da tela/aba em que a pessoa pode abri-lo. */
export type ResultadoPesquisa = { id: number; rotulo: string; detalhe: string; href: string };

/**
 * Os padrões do `LIKE` da pesquisa: UM por termo (todos têm de casar — "secretaria saúde 2027"), até 5 termos. Sem
 * acento/caixa: o termo SEM acento (ex.: "manutencao") vira um padrão em que as vogais e o "c" valem qualquer letra
 * ("manut_n__o" acha "MANUTENÇÃO"); o `%`/`_` digitados saem (nunca viram curinga do usuário).
 */
export function padroesLike(q: string): string[] {
  return q
    .toLowerCase()
    .replace(/[%_\\]/g, " ")
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 5)
    .map((t) => `%${/^[\x20-\x7e]+$/.test(t) && t.length >= 4 ? t.replace(/[aeiouc]/g, "_") : t}%`);
}

const semAcento = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

/**
 * A ORDEM dos resultados de um grupo: o número/código EXATO primeiro, depois o que COMEÇA com o termo, depois o que o
 * contém (sem acento/caixa) e, por fim, o que só casou pelo padrão (as letras trocadas). Estável dentro de cada nível.
 */
export function pontuar(texto: string, q: string): number {
  const t = semAcento(texto);
  const termos = semAcento(q).split(/\s+/).filter(Boolean);
  if (!termos.length) return 0;
  const palavras = t.split(/[^a-z0-9]+/).filter(Boolean);
  let p = 0;
  for (const termo of termos) {
    if (palavras.includes(termo)) p += 3;
    else if (palavras.some((w) => w.startsWith(termo))) p += 2;
    else if (t.includes(termo)) p += 1;
  }
  return p;
}

/** O que a pessoa pode pesquisar (a régua das rotas — testada por perfil). `ve` = a tela abre; `libera` = a aba/visão. */
export type PortaoPesquisa = { admin: boolean; ve: (tela: string) => boolean; libera: (componente: string) => boolean };

export function tipoPermitido(p: PortaoPesquisa, tipo: TipoPesquisa): boolean {
  switch (tipo) {
    case "protocolo":
    case "dfd":
    case "item":
      return p.ve("dfd") || (p.ve("pca") && p.libera("pca.mesa"));
    case "tarefa":
      return p.ve("tarefas") || p.ve("calendario");
    case "evento":
      return p.ve("calendario");
    case "orcamento":
      return p.ve("orcamento");
    case "lancamento":
      return p.ve("orcamento") && p.libera("orcamento.lancamentos");
    case "catalogo":
      return p.ve("catalogo") && p.libera("catalogo.catalogos");
    case "historico":
      return p.ve("catalogo") && p.libera("catalogo.historico");
    default:
      return p.admin; // usuário, órgão, unidade, grupo, cadastro, automação
  }
}
