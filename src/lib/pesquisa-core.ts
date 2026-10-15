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
