import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { before, describe, it } from "node:test";
import { papelSistema } from "../src/lib/papeis-core.ts";

// Aplica toda a cadeia de migrações (drizzle/*.sql) num SQLite em memória —
// mesmo dialeto do D1 — garantindo que a cadeia evolui sem erro e que o schema
// final tem as tabelas/colunas esperadas. Requer --experimental-sqlite.

const DIR = join(process.cwd(), "drizzle");
const arquivos = readdirSync(DIR).filter((f) => f.endsWith(".sql")).sort();

function aplicarTudo(): DatabaseSync {
  const db = new DatabaseSync(":memory:");
  for (const arq of arquivos) {
    db.exec(readFileSync(join(DIR, arq), "utf8"));
  }
  return db;
}

function nomes(db: DatabaseSync, sql: string): string[] {
  const rows = db.prepare(sql).all() as Array<Record<string, unknown>>;
  return rows.map((r) => String(r.name));
}

describe("migrações D1 (drizzle/*.sql)", () => {
  let db: DatabaseSync;
  before(() => {
    db = aplicarTudo();
  });

  it("há a cadeia completa de arquivos", () => {
    assert.ok(arquivos.length >= 8);
  });

  it("cada número de migração é usado UMA vez (sessões em paralelo não colidem)", () => {
    // O D1 registra a migração pelo NOME inteiro: as duas repetições antigas já aplicadas ficam (renomear as aplicaria de
    // novo). Uma repetição nova falha aqui, antes do deploy — renumere a sua para o próximo número livre.
    const JA_REPETIDOS = new Set(["0028", "0064"]);
    const porNumero = new Map<string, string[]>();
    for (const arq of arquivos) {
      const numero = arq.slice(0, 4);
      assert.match(numero, /^\d{4}$/, `${arq}: o nome deve começar com 4 dígitos`);
      porNumero.set(numero, [...(porNumero.get(numero) ?? []), arq]);
    }
    const repetidos = [...porNumero].filter(([n, lista]) => lista.length > 1 && !JA_REPETIDOS.has(n));
    assert.deepEqual(repetidos, [], `número de migração repetido: ${repetidos.map(([, l]) => l.join(" × ")).join("; ")}`);
  });

  it("cria todas as tabelas do domínio", () => {
    const tabelas = nomes(db, "SELECT name FROM sqlite_master WHERE type='table'");
    for (const t of [
      "unidades",
      "itens",
      "usuarios",
      "sessoes",
      "protocolos",
      "protocolo_opcoes",
      "tabelas",
      "colunas",
      "coluna_opcoes",
      "linhas",
      "configuracoes",
    ]) {
      assert.ok(tabelas.includes(t), `tabela ausente: ${t}`);
    }
  });

  it("0007 adiciona matricula e foto em usuarios", () => {
    const cols = nomes(db, "SELECT name FROM pragma_table_info('usuarios')");
    assert.ok(cols.includes("matricula"));
    assert.ok(cols.includes("foto"));
  });

  it("0009/0010 criam RBAC por grupo e repartições", () => {
    const tabelas = nomes(db, "SELECT name FROM sqlite_master WHERE type='table'");
    for (const t of [
      "permissoes",
      "grupos",
      "usuario_grupos",
      "reparticoes",
      "grupo_reparticoes",
    ]) {
      assert.ok(tabelas.includes(t), `tabela ausente: ${t}`);
    }
    const prot = nomes(db, "SELECT name FROM pragma_table_info('protocolos')");
    assert.ok(prot.includes("grupo_id"));
  });

  it("0011 adiciona reparticao_id em unidades", () => {
    const cols = nomes(db, "SELECT name FROM pragma_table_info('unidades')");
    assert.ok(cols.includes("reparticao_id"));
  });

  it("0012 cria tabelas DFD/PCA", () => {
    const tabelas = nomes(db, "SELECT name FROM sqlite_master WHERE type='table'");
    for (const t of ["dfds", "dfd_itens", "pcas", "pca_dfds"]) {
      assert.ok(tabelas.includes(t), `tabela ausente: ${t}`);
    }
    const idx = nomes(db, "SELECT name FROM sqlite_master WHERE type='index'");
    assert.ok(idx.includes("dfds_numero_uq"), "índice dfds_numero_uq ausente");
  });

  it("0013 adiciona campos completos do DFD", () => {
    const dfd = nomes(db, "SELECT name FROM pragma_table_info('dfds')");
    for (const c of ["matricula", "email", "telefone", "valor_total", "secoes"]) {
      assert.ok(dfd.includes(c), `coluna ausente em dfds: ${c}`);
    }
    const item = nomes(db, "SELECT name FROM pragma_table_info('dfd_itens')");
    for (const c of ["valor_unitario", "valor_total"]) {
      assert.ok(item.includes(c), `coluna ausente em dfd_itens: ${c}`);
    }
  });

  it("0014 semeia as repartições da Prefeitura de Rio Verde", () => {
    const cods = nomes(db, "SELECT codigo AS name FROM reparticoes");
    for (const c of ["GP", "CGM", "AMT", "AMAE", "SME", "SMS", "SETIA"]) {
      assert.ok(cods.includes(c), `repartição ausente: ${c}`);
    }
    // idempotência: nenhum código duplicado após aplicar a cadeia.
    const dup = db
      .prepare("SELECT codigo, COUNT(*) n FROM reparticoes GROUP BY codigo HAVING n > 1")
      .all() as Array<Record<string, unknown>>;
    assert.equal(dup.length, 0, `códigos duplicados: ${dup.map((d) => d.codigo).join(", ")}`);
  });

  it("0015 concede a aba 'dfd' a quem já tinha 'pca'", () => {
    const row = db.prepare("SELECT abas FROM permissoes WHERE id = 1").get() as {
      abas: string;
    };
    assert.ok(String(row.abas).includes("dfd"), `abas sem dfd: ${row.abas}`);
  });

  it("0016 cria dfd_protocolos e vincula dfds.protocolo_id", () => {
    const tabelas = nomes(db, "SELECT name FROM sqlite_master WHERE type='table'");
    assert.ok(tabelas.includes("dfd_protocolos"), "tabela dfd_protocolos ausente");
    const cols = nomes(db, "SELECT name FROM pragma_table_info('dfd_protocolos')");
    for (const c of ["numero", "interessado", "documento", "assunto", "valor_capa", "reparticao_id"]) {
      assert.ok(cols.includes(c), `coluna ausente em dfd_protocolos: ${c}`);
    }
    const dfd = nomes(db, "SELECT name FROM pragma_table_info('dfds')");
    assert.ok(dfd.includes("protocolo_id"), "coluna dfds.protocolo_id ausente");
    const idx = nomes(db, "SELECT name FROM sqlite_master WHERE type='index'");
    assert.ok(idx.includes("protocolos_dfd_numero_uq"), "índice único de numero ausente");
    assert.ok(idx.includes("dfds_protocolo_idx"), "índice dfds_protocolo_idx ausente");
  });

  it("0017 adiciona numero_interessado e responsavel_dfd em reparticoes", () => {
    const cols = nomes(db, "SELECT name FROM pragma_table_info('reparticoes')");
    assert.ok(cols.includes("numero_interessado"), "coluna numero_interessado ausente");
    assert.ok(cols.includes("responsavel_dfd"), "coluna responsavel_dfd ausente");
  });

  it("0018 adiciona assinaturas em dfds", () => {
    const cols = nomes(db, "SELECT name FROM pragma_table_info('dfds')");
    assert.ok(cols.includes("assinaturas"), "coluna assinaturas ausente");
  });

  it("0020 adiciona ativo em pcas", () => {
    const cols = nomes(db, "SELECT name FROM pragma_table_info('pcas')");
    assert.ok(cols.includes("ativo"), "coluna pcas.ativo ausente");
  });

  it("0022 cria orgaos, adiciona orgao_id/setor_requisitante e PRESERVA o legado", () => {
    const tabelas = nomes(db, "SELECT name FROM sqlite_master WHERE type='table'");
    assert.ok(tabelas.includes("orgaos"), "tabela orgaos ausente");
    const cols = nomes(db, "SELECT name FROM pragma_table_info('reparticoes')");
    // Colunas novas + as antigas continuam presentes (nada perdido no ALTER aditivo).
    for (const c of ["orgao_id", "setor_requisitante", "numero_interessado", "responsavel_dfd", "codigo", "nome", "ordem"]) {
      assert.ok(cols.includes(c), `coluna ausente em reparticoes: ${c}`);
    }
    // Órgão padrão semeado.
    const org = db.prepare("SELECT nome FROM orgaos WHERE id = 1").get() as { nome: string } | undefined;
    assert.ok(org?.nome?.includes("Rio Verde"), "órgão padrão (Prefeitura) ausente");
    // Legado ADAPTADO: unidades pré-existentes (não-GERAL) vinculadas ao órgão 1…
    const amae = db.prepare("SELECT orgao_id FROM reparticoes WHERE codigo = 'AMAE'").get() as { orgao_id: number | null } | undefined;
    assert.equal(amae?.orgao_id, 1, "AMAE deveria estar no órgão 1 (Prefeitura)");
    // …e a GERAL virtual permanece SEM órgão (representa todas as unidades).
    const geral = db.prepare("SELECT orgao_id FROM reparticoes WHERE codigo = 'GERAL'").get() as { orgao_id: number | null } | undefined;
    assert.equal(geral?.orgao_id, null, "GERAL não deve ter órgão");
  });

  it("0023 adiciona assinatura_unica e responsavel_dfd em orgaos (padrão = por unidade)", () => {
    const cols = nomes(db, "SELECT name FROM pragma_table_info('orgaos')");
    assert.ok(cols.includes("assinatura_unica"), "coluna assinatura_unica ausente");
    assert.ok(cols.includes("responsavel_dfd"), "coluna responsavel_dfd ausente em orgaos");
    // Default preserva o comportamento atual: cada unidade tem a sua assinatura (0).
    const org = db.prepare("SELECT assinatura_unica FROM orgaos WHERE id = 1").get() as { assinatura_unica: number } | undefined;
    assert.equal(org?.assinatura_unica, 0, "assinatura_unica deveria começar 0 (por unidade)");
  });

  it("0024 cria catalogo/catalogo_itens (código único global + cascade)", () => {
    const tabelas = nomes(db, "SELECT name FROM sqlite_master WHERE type='table'");
    for (const t of ["catalogos", "catalogo_itens"]) {
      assert.ok(tabelas.includes(t), `tabela ausente: ${t}`);
    }
    const idx = nomes(db, "SELECT name FROM sqlite_master WHERE type='index'");
    assert.ok(idx.includes("catalogo_itens_codigo_uq"), "índice único de código ausente");
    // A aba 'catalogo' foi concedida a quem já tinha 'dfd'.
    const perm = db.prepare("SELECT abas FROM permissoes WHERE id = 1").get() as { abas: string };
    assert.ok(String(perm.abas).includes("catalogo"), `abas sem catalogo: ${perm.abas}`);
    // Com FK ligada: unicidade GLOBAL do código + cascade ao excluir o catálogo.
    db.exec("PRAGMA foreign_keys = ON");
    db.exec("INSERT INTO catalogos (id, nome) VALUES (901, 'Cat A'), (902, 'Cat B')");
    db.exec("INSERT INTO catalogo_itens (catalogo_id, codigo, descricao) VALUES (901, '5241924358', 'AGUA MINERAL')");
    assert.throws(
      () => db.exec("INSERT INTO catalogo_itens (catalogo_id, codigo, descricao) VALUES (902, '5241924358', 'AGUA 2')"),
      "o mesmo código em outro catálogo deveria violar a unicidade global",
    );
    db.exec("DELETE FROM catalogos WHERE id = 901");
    const restantes = db.prepare("SELECT COUNT(*) AS n FROM catalogo_itens WHERE catalogo_id = 901").get() as { n: number };
    assert.equal(restantes.n, 0, "excluir o catálogo deveria apagar os itens (cascade)");
  });

  it("0026 cria auditoria (append-only; FK usuario ON DELETE set null preserva o snapshot)", () => {
    const tabelas = nomes(db, "SELECT name FROM sqlite_master WHERE type='table'");
    assert.ok(tabelas.includes("auditoria"), "tabela auditoria ausente");
    const cols = nomes(db, "SELECT name FROM pragma_table_info('auditoria')");
    for (const c of ["usuario_id", "usuario_nome", "usuario_email", "acao", "entidade", "entidade_id", "resumo", "antes", "depois", "criado_em"]) {
      assert.ok(cols.includes(c), `coluna ausente em auditoria: ${c}`);
    }
    const idx = nomes(db, "SELECT name FROM sqlite_master WHERE type='index'");
    assert.ok(idx.includes("auditoria_entidade_idx"), "índice de entidade ausente");
    // FK usuario_id ON DELETE set null: excluir o usuário mantém a linha (snapshot preservado).
    db.exec("PRAGMA foreign_keys = ON");
    db.exec("INSERT INTO usuarios (id, nome, email, senha_hash) VALUES (955, 'Fulano', 'f955@x.com', 'h')");
    db.exec("INSERT INTO auditoria (usuario_id, usuario_nome, acao, entidade) VALUES (955, 'Fulano', 'editar', 'dfd')");
    db.exec("DELETE FROM usuarios WHERE id = 955");
    const row = db.prepare("SELECT usuario_id, usuario_nome FROM auditoria WHERE usuario_nome = 'Fulano'").get() as {
      usuario_id: number | null;
      usuario_nome: string;
    };
    assert.equal(row.usuario_id, null, "usuario_id deveria virar null ao excluir o usuário");
    assert.equal(row.usuario_nome, "Fulano", "o snapshot do nome deve permanecer");
  });

  it("0027 adiciona numero_interessado/oculto (orgaos), oculto (reparticoes), orgao_id (dfds/dfd_protocolos)", () => {
    const org = nomes(db, "SELECT name FROM pragma_table_info('orgaos')");
    for (const c of ["numero_interessado", "oculto"]) assert.ok(org.includes(c), `coluna ausente em orgaos: ${c}`);
    const rep = nomes(db, "SELECT name FROM pragma_table_info('reparticoes')");
    assert.ok(rep.includes("oculto"), "coluna oculto ausente em reparticoes");
    assert.ok(nomes(db, "SELECT name FROM pragma_table_info('dfds')").includes("orgao_id"), "orgao_id ausente em dfds");
    assert.ok(nomes(db, "SELECT name FROM pragma_table_info('dfd_protocolos')").includes("orgao_id"), "orgao_id ausente em dfd_protocolos");
    // Default preserva o legado: órgão/unidade começam VISÍVEIS (oculto=0).
    const o = db.prepare("SELECT oculto FROM orgaos WHERE id = 1").get() as { oculto: number } | undefined;
    assert.equal(o?.oculto, 0, "órgão deve começar visível");
    const u = db.prepare("SELECT oculto FROM reparticoes WHERE codigo = 'AMAE'").get() as { oculto: number } | undefined;
    assert.equal(u?.oculto, 0, "unidade deve começar visível");
  });

  it("0039 acrescenta Função/Programa/Ação/Ficha/Fonte em orcamento_itens (novo padrão do CUBO)", () => {
    const cols = nomes(db, "SELECT name FROM pragma_table_info('orcamento_itens')");
    for (const c of ["funcao", "programa", "acao", "ficha", "fonte"]) assert.ok(cols.includes(c), `coluna ausente em orcamento_itens: ${c}`);
  });

  it("0028 cria orcamento/orcamento_itens (aba orcamento + cascade)", () => {
    const tabelas = nomes(db, "SELECT name FROM sqlite_master WHERE type='table'");
    for (const t of ["orcamentos", "orcamento_itens"]) {
      assert.ok(tabelas.includes(t), `tabela ausente: ${t}`);
    }
    const cols = nomes(db, "SELECT name FROM pragma_table_info('orcamento_itens')");
    for (const c of ["orcamento_id", "orgao", "unidade", "nome_elemento", "codigo_elemento", "valor_inicial", "saldo", "sequencial"]) {
      assert.ok(cols.includes(c), `coluna ausente em orcamento_itens: ${c}`);
    }
    const idx = nomes(db, "SELECT name FROM sqlite_master WHERE type='index'");
    assert.ok(idx.includes("orcamento_itens_orcamento_idx"), "índice de orcamento_id ausente");
    // A aba 'orcamento' foi concedida a quem já via 'catalogo'.
    const perm = db.prepare("SELECT abas FROM permissoes WHERE id = 1").get() as { abas: string };
    assert.ok(String(perm.abas).includes("orcamento"), `abas sem orcamento: ${perm.abas}`);
    // FK cascade: excluir o orçamento apaga os lançamentos.
    db.exec("PRAGMA foreign_keys = ON");
    db.exec("INSERT INTO orcamentos (id, nome, ano) VALUES (971, 'Orç 2026', 2026)");
    db.exec("INSERT INTO orcamento_itens (orcamento_id, orgao, nome_elemento, valor_inicial) VALUES (971, 'FUNDO A', 'OBRAS', 5000000)");
    db.exec("DELETE FROM orcamentos WHERE id = 971");
    const restantes = db.prepare("SELECT COUNT(*) AS n FROM orcamento_itens WHERE orcamento_id = 971").get() as { n: number };
    assert.equal(restantes.n, 0, "excluir o orçamento deveria apagar os lançamentos (cascade)");
  });

  it("0030 cria orcamento_vinculos (excluir o alvo zera o vínculo; a unicidade é a da 0080)", () => {
    const cols = nomes(db, "SELECT name FROM pragma_table_info('orcamento_vinculos')");
    for (const c of ["tipo", "chave", "texto", "orgao_id", "reparticao_id"]) {
      assert.ok(cols.includes(c), `coluna ausente em orcamento_vinculos: ${c}`);
    }
    db.exec("PRAGMA foreign_keys = ON");
    db.exec("INSERT INTO orgaos (id, nome, sigla) VALUES (981, 'Fundo X', 'FX')");
    db.exec("INSERT INTO orcamento_vinculos (tipo, chave, texto, orgao_id) VALUES ('orgao', 'FUNDO X', 'Fundo X', 981)");
    db.exec("DELETE FROM orgaos WHERE id = 981");
    const v = db.prepare("SELECT orgao_id FROM orcamento_vinculos WHERE chave = 'FUNDO X'").get() as { orgao_id: number | null };
    assert.equal(v.orgao_id, null, "excluir o órgão deveria zerar o vínculo (set null)");
  });

  it("0029 adiciona orgao_proprio em reparticoes (default 0 preserva o legado)", () => {
    const cols = nomes(db, "SELECT name FROM pragma_table_info('reparticoes')");
    assert.ok(cols.includes("orgao_proprio"), "coluna orgao_proprio ausente");
    // Nenhuma unidade nasce como "própria do órgão" — todas são filhas comuns.
    const u = db.prepare("SELECT orgao_proprio FROM reparticoes WHERE codigo = 'AMAE'").get() as { orgao_proprio: number } | undefined;
    assert.equal(u?.orgao_proprio, 0, "unidade legada deve começar como filha comum (0)");
  });

  it("0031 cria situações do protocolo, responsável/situação, responsável padrão e o histórico conectado", () => {
    const tabelas = nomes(db, "SELECT name FROM sqlite_master WHERE type='table'");
    assert.ok(tabelas.includes("protocolo_situacoes"), "tabela protocolo_situacoes ausente");
    const prot = nomes(db, "SELECT name FROM pragma_table_info('dfd_protocolos')");
    for (const c of ["responsavel_id", "situacao_id", "criado_por"]) assert.ok(prot.includes(c), `coluna ausente em dfd_protocolos: ${c}`);
    assert.ok(nomes(db, "SELECT name FROM pragma_table_info('usuarios')").includes("responsavel_padrao_id"), "responsavel_padrao_id ausente");
    const aud = nomes(db, "SELECT name FROM pragma_table_info('auditoria')");
    for (const c of ["protocolo_id", "origem", "detalhe"]) assert.ok(aud.includes(c), `coluna ausente em auditoria: ${c}`);
    const idx = nomes(db, "SELECT name FROM sqlite_master WHERE type='index'");
    for (const i of ["auditoria_protocolo_idx", "protocolos_dfd_responsavel_idx", "protocolos_dfd_situacao_idx"]) assert.ok(idx.includes(i), `índice ausente: ${i}`);
    // Excluir a situação LIMPA a do protocolo (FK set null) — o protocolo continua.
    db.exec("PRAGMA foreign_keys = ON");
    db.exec("INSERT INTO protocolo_situacoes (id, nome, cor, ordem) VALUES (981, 'Em análise', '#2563eb', 0)");
    db.exec("INSERT INTO dfd_protocolos (id, numero, situacao_id) VALUES (982, 'P-982/2026', 981)");
    db.exec("DELETE FROM protocolo_situacoes WHERE id = 981");
    const p = db.prepare("SELECT situacao_id FROM dfd_protocolos WHERE id = 982").get() as { situacao_id: number | null } | undefined;
    assert.equal(p?.situacao_id, null, "excluir a situação deveria limpar a do protocolo");
  });

  it("0032 cria o apelido do usuário e as passagens (rastro do DFD sobrescrito) por protocolo", () => {
    assert.ok(nomes(db, "SELECT name FROM pragma_table_info('usuarios')").includes("apelido"), "coluna apelido ausente");
    const cols = nomes(db, "SELECT name FROM pragma_table_info('dfd_passagens')");
    for (const c of ["protocolo_id", "dfd_numero", "planejamento", "tipo", "sigla", "total_itens", "valor_total", "usuario_id", "criado_em"])
      assert.ok(cols.includes(c), `coluna ausente em dfd_passagens: ${c}`);
    const idx = nomes(db, "SELECT name FROM sqlite_master WHERE type='index'");
    for (const i of ["dfd_passagens_uq", "dfd_passagens_numero_idx"]) assert.ok(idx.includes(i), `índice ausente: ${i}`);
    db.exec("PRAGMA foreign_keys = ON");
    db.exec("INSERT INTO dfd_protocolos (id, numero) VALUES (991, 'P-991/2026')");
    db.exec("INSERT INTO dfd_passagens (protocolo_id, dfd_numero, valor_total) VALUES (991, '1525', 100)");
    // Uma passagem por (protocolo, nº do DFD): a segunda do MESMO par é rejeitada (o código faz upsert).
    assert.throws(() => db.exec("INSERT INTO dfd_passagens (protocolo_id, dfd_numero) VALUES (991, '1525')"));
    // Excluir o protocolo apaga o rastro dele (cascade).
    db.exec("DELETE FROM dfd_protocolos WHERE id = 991");
    const n = db.prepare("SELECT COUNT(*) AS n FROM dfd_passagens WHERE protocolo_id = 991").get() as { n: number };
    assert.equal(n.n, 0, "excluir o protocolo deveria apagar as passagens dele");
  });

  it("0033 PCA como espaço: fonte/status/capa, planilha por PCA, ação do DFD, camada da situação e visões", () => {
    const pcas = nomes(db, "SELECT name FROM pragma_table_info('pcas')");
    for (const c of ["fonte", "status", "capa", "publicado_em", "orcamento_visao_id"]) assert.ok(pcas.includes(c), `coluna ausente em pcas: ${c}`);
    assert.ok(nomes(db, "SELECT name FROM pragma_table_info('unidades')").includes("pca_id"));
    const pd = nomes(db, "SELECT name FROM pragma_table_info('pca_dfds')");
    for (const c of ["acao", "substitui_dfd_id", "vinculado_por", "vinculado_em"]) assert.ok(pd.includes(c), `coluna ausente em pca_dfds: ${c}`);
    const sit = nomes(db, "SELECT name FROM pragma_table_info('protocolo_situacoes')");
    for (const c of ["permite_mover_pca", "camada_pca"]) assert.ok(sit.includes(c), `coluna ausente em protocolo_situacoes: ${c}`);
    assert.ok(nomes(db, "SELECT name FROM sqlite_master WHERE type='table'").includes("orcamento_visoes"));
    // O mesmo código de unidade pode existir em PCAs diferentes, mas não duas vezes no mesmo.
    db.exec("INSERT INTO pcas (id, nome, ano) VALUES (991, 'PCA A', 2026), (992, 'PCA B', 2027)");
    db.exec("INSERT INTO unidades (codigo, municipio, pca_id) VALUES ('SEMED', 'RV', 991), ('SEMED', 'RV', 992)");
    assert.throws(() => db.exec("INSERT INTO unidades (codigo, municipio, pca_id) VALUES ('SEMED', 'RV', 991)"));
  });

  it("0033 legado: planilhas viram um PCA 'lista' PUBLICADO e edições com DFDs viram fonte 'protocolo'", () => {
    const d = new DatabaseSync(":memory:");
    const i33 = arquivos.findIndex((f) => f.startsWith("0033"));
    for (const arq of arquivos.slice(0, i33)) d.exec(readFileSync(join(DIR, arq), "utf8"));
    d.exec("INSERT INTO unidades (id, codigo, municipio) VALUES (1, 'SEMED', 'RV'), (2, 'SEMUS', 'RV')");
    d.exec("INSERT INTO itens (unidade_id, nome_produto, ano_desejado) VALUES (1, 'X', 2026)");
    d.exec("INSERT INTO pcas (id, nome, ano) VALUES (10, 'Edição', 2026)");
    d.exec("INSERT INTO dfds (id, numero) VALUES (50, 'DFD-50')");
    d.exec("INSERT INTO pca_dfds (pca_id, dfd_id) VALUES (10, 50)");
    for (const arq of arquivos.slice(i33)) d.exec(readFileSync(join(DIR, arq), "utf8"));
    const ed = d.prepare("SELECT fonte FROM pcas WHERE id = 10").get() as { fonte: string };
    assert.equal(ed.fonte, "protocolo");
    const pub = d.prepare("SELECT id, nome, ano, fonte, status FROM pcas WHERE fonte = 'lista' AND status = 'publicado'").all() as Array<{ id: number; nome: string; ano: number }>;
    assert.equal(pub.length, 1);
    assert.equal(pub[0].ano, 2026);
    assert.equal(pub[0].nome, "PCA 2026");
    const us = d.prepare("SELECT pca_id FROM unidades ORDER BY id").all() as Array<{ pca_id: number }>;
    assert.deepEqual(us.map((u) => u.pca_id), [pub[0].id, pub[0].id]);
  });

  it("0034 Mesa do PCA: protocolo enviado/incorporado; excluir o PCA devolve o protocolo (set null)", () => {
    const cols = nomes(db, "SELECT name FROM pragma_table_info('dfd_protocolos')");
    for (const c of ["pca_id", "pca_enviado_em", "pca_enviado_por", "pca_incorporado_em"]) assert.ok(cols.includes(c), `coluna ausente em dfd_protocolos: ${c}`);
    assert.ok(nomes(db, "SELECT name FROM sqlite_master WHERE type='index'").includes("protocolos_dfd_pca_idx"));
    db.exec("PRAGMA foreign_keys = ON");
    db.exec("INSERT INTO pcas (id, nome, ano, fonte) VALUES (995, 'PCA M', 2027, 'protocolo')");
    db.exec("INSERT INTO dfd_protocolos (id, numero, pca_id, pca_incorporado_em) VALUES (996, 'P-996/2027', 995, CURRENT_TIMESTAMP)");
    db.exec("DELETE FROM pcas WHERE id = 995");
    const p = db.prepare("SELECT pca_id FROM dfd_protocolos WHERE id = 996").get() as { pca_id: number | null };
    assert.equal(p.pca_id, null, "excluir o PCA deveria devolver o protocolo à Mesa principal");
  });

  it("0035 sequencial do item no PCA: pca_itens (único por PCA) + o nº no próprio item", () => {
    assert.ok(nomes(db, "SELECT name FROM sqlite_master WHERE type='table'").includes("pca_itens"));
    const idx = nomes(db, "SELECT name FROM sqlite_master WHERE type='index'");
    for (const i of ["pca_itens_pca_seq_uq", "pca_itens_item_idx"]) assert.ok(idx.includes(i), `índice ausente: ${i}`);
    const cols = nomes(db, "SELECT name FROM pragma_table_info('dfd_itens')");
    for (const c of ["pca_id", "pca_sequencial"]) assert.ok(cols.includes(c), `coluna ausente em dfd_itens: ${c}`);
  });

  it("0036 tudo na Mesa: quem tinha a aba 'protocolos' ganha a Mesa ('dfd'); idempotente, sem mexer nas demais", () => {
    const d = new DatabaseSync(":memory:");
    const i36 = arquivos.findIndex((f) => f.startsWith("0036"));
    assert.ok(i36 > 0, "migração 0036 ausente");
    for (const arq of arquivos.slice(0, i36)) d.exec(readFileSync(join(DIR, arq), "utf8"));
    d.exec(
      `INSERT INTO permissoes (id, nome, abas) VALUES (901, 'Protocolos', '["dashboard","protocolos"]'), (902, 'Protocolos + Mesa', '["protocolos","dfd"]'), (903, 'Só PCA', '["pca"]'), (904, 'Só Dashboard', '["dashboard"]')`,
    );
    const sql = readFileSync(join(DIR, arquivos[i36]), "utf8");
    d.exec(sql);
    d.exec(sql); // idempotente: rodar de novo não duplica a aba
    for (const arq of arquivos.slice(i36 + 1)) d.exec(readFileSync(join(DIR, arq), "utf8"));
    const abas = (id: number) => JSON.parse((d.prepare("SELECT abas FROM permissoes WHERE id = ?").get(id) as { abas: string }).abas);
    // (a 0042 depois concede as Tarefas a quem tem a Mesa; a 0046, o Calendário a quem tem as Tarefas)
    assert.deepEqual(abas(901), ["dashboard", "protocolos", "dfd", "tarefas", "calendario"]);
    assert.deepEqual(abas(902), ["protocolos", "dfd", "tarefas", "calendario"]);
    assert.deepEqual(abas(903), ["pca"]);
    assert.deepEqual(abas(904), ["dashboard"]);
  });

  it("0037 responsável inicial da Mesa: usuarios.mesa_responsavel (NULL = 'eu')", () => {
    assert.ok(nomes(db, "SELECT name FROM pragma_table_info('usuarios')").includes("mesa_responsavel"));
  });

  it("0038 padronização: classificações e unidades de medida (excluir a classificação zera a da unidade)", () => {
    const tabelas = nomes(db, "SELECT name FROM sqlite_master WHERE type='table'");
    for (const t of ["item_classificacoes", "unidades_medida"]) assert.ok(tabelas.includes(t), `tabela ausente: ${t}`);
    const idx = nomes(db, "SELECT name FROM sqlite_master WHERE type='index'");
    for (const i of ["item_classificacoes_ordem_idx", "unidades_medida_ordem_idx"]) assert.ok(idx.includes(i), `índice ausente: ${i}`);
    db.exec("PRAGMA foreign_keys = ON");
    db.exec("INSERT INTO item_classificacoes (id, nome, palavras) VALUES (981, 'SERVIÇO', '[\"MANUTENCAO\"]')");
    db.exec("INSERT INTO unidades_medida (id, sigla, nome, classificacao_id) VALUES (982, 'SV', 'SERVIÇO', 981)");
    const u = db.prepare("SELECT sinonimos, ordem FROM unidades_medida WHERE id = 982").get() as { sinonimos: string; ordem: number };
    assert.equal(u.sinonimos, "[]");
    assert.equal(u.ordem, 0);
    db.exec("DELETE FROM item_classificacoes WHERE id = 981");
    const depois = db.prepare("SELECT classificacao_id FROM unidades_medida WHERE id = 982").get() as { classificacao_id: number | null };
    assert.equal(depois.classificacao_id, null, "excluir a classificação deveria zerar a da unidade (set null)");
  });

  it("0040 preferências de tabela por usuário (única por usuário + chave; some com o usuário)", () => {
    db.exec("PRAGMA foreign_keys = ON");
    db.exec("INSERT INTO usuarios (id, email, nome, senha_hash) VALUES (9401, 'pref@x', 'P', 'h')");
    db.exec("INSERT INTO preferencias_tabela (usuario_id, chave, valor) VALUES (9401, 'orcamento-comparativo:unidade:fonte', '{}')");
    assert.throws(() => db.exec("INSERT INTO preferencias_tabela (usuario_id, chave, valor) VALUES (9401, 'orcamento-comparativo:unidade:fonte', '{}')"));
    db.exec("DELETE FROM usuarios WHERE id = 9401");
    const n = db.prepare("SELECT COUNT(*) AS n FROM preferencias_tabela WHERE usuario_id = 9401").get() as { n: number };
    assert.equal(n.n, 0);
  });

  it("0041 edições salvas de tabela (públicas ou pessoais; somem com o dono)", () => {
    db.exec("PRAGMA foreign_keys = ON");
    db.exec("INSERT INTO usuarios (id, email, nome, senha_hash) VALUES (9411, 'ed@x', 'E', 'h')");
    db.exec("INSERT INTO edicoes_tabela (chave, nome, valor, usuario_id, publico) VALUES ('orcamento-comparativo:a:b', 'Minha', '{}', 9411, 1)");
    const r = db.prepare("SELECT publico FROM edicoes_tabela WHERE usuario_id = 9411").get() as { publico: number };
    assert.equal(r.publico, 1);
    assert.ok(nomes(db, "SELECT name FROM sqlite_master WHERE type='index'").includes("edicoes_tabela_chave_idx"));
    db.exec("DELETE FROM usuarios WHERE id = 9411");
    const n = db.prepare("SELECT COUNT(*) AS n FROM edicoes_tabela WHERE usuario_id = 9411").get() as { n: number };
    assert.equal(n.n, 0);
  });

  it("0042 tarefas (quadros por grupo, listas, cartões com ticket único por quadro) e a aba para quem tem a Mesa", () => {
    const tabelas = nomes(db, "SELECT name FROM sqlite_master WHERE type='table'");
    for (const t of ["tarefa_quadros", "tarefa_listas", "tarefas", "tarefa_pessoas", "tarefa_etiquetas", "tarefa_etiqueta_links"]) assert.ok(tabelas.includes(t), t);
    assert.ok(nomes(db, "SELECT name FROM sqlite_master WHERE type='index'").includes("tarefas_quadro_ticket_uq"));
    const a = aplicarTudo();
    a.exec("INSERT INTO permissoes (id, nome, abas) VALUES (9420, 'Com mesa', '[\"dfd\"]'), (9421, 'Sem mesa', '[\"pca\"]')");
    a.exec(readFileSync(join(DIR, "0042_tarefas.sql"), "utf8").split("--> statement-breakpoint").at(-1) as string);
    const com = a.prepare("SELECT abas FROM permissoes WHERE id = 9420").get() as { abas: string };
    const sem = a.prepare("SELECT abas FROM permissoes WHERE id = 9421").get() as { abas: string };
    assert.deepEqual(JSON.parse(com.abas), ["dfd", "tarefas"]);
    assert.deepEqual(JSON.parse(sem.abas), ["pca"]);
  });

  it("0043 conteúdo das tarefas (checklist, comentários, anexos) + estimativa e vínculo no cartão", () => {
    const tabelas = nomes(db, "SELECT name FROM sqlite_master WHERE type='table'");
    for (const t of ["tarefa_checklist", "tarefa_comentarios", "tarefa_anexos"]) assert.ok(tabelas.includes(t), t);
    const cols = nomes(db, "SELECT name FROM pragma_table_info('tarefas')");
    for (const c of ["estimativa_h", "vinculo_tipo", "vinculo_id"]) assert.ok(cols.includes(c), c);
    assert.ok(nomes(db, "SELECT name FROM sqlite_master WHERE type='index'").includes("tarefas_vinculo_idx"));
  });

  it("0044 recorrência (anterior ÚNICA), notificações (chave única por pessoa), modelos e automações", () => {
    const tabelas = nomes(db, "SELECT name FROM sqlite_master WHERE type='table'");
    for (const t of ["notificacoes", "tarefa_modelos", "tarefa_automacoes"]) assert.ok(tabelas.includes(t), t);
    const cols = nomes(db, "SELECT name FROM pragma_table_info('tarefas')");
    for (const c of ["recorrencia", "recorrencia_anterior_id"]) assert.ok(cols.includes(c), c);
    const idx = nomes(db, "SELECT name FROM sqlite_master WHERE type='index'");
    for (const i of ["tarefas_recorrencia_anterior_uq", "notificacoes_chave_uq"]) assert.ok(idx.includes(i), i);
    const a = aplicarTudo();
    a.exec("INSERT INTO usuarios (id, nome, email, senha_hash) VALUES (9440, 'N', 'n9440@x', 'h')");
    a.exec("INSERT INTO notificacoes (usuario_id, tipo, titulo, chave) VALUES (9440, 'atrasada', 'A', 'k1')");
    assert.throws(() => a.exec("INSERT INTO notificacoes (usuario_id, tipo, titulo, chave) VALUES (9440, 'atrasada', 'A', 'k1')"));
    // Sem chave (as gravadas por evento) repetem à vontade.
    a.exec("INSERT INTO notificacoes (usuario_id, tipo, titulo) VALUES (9440, 'atribuida', 'B'), (9440, 'atribuida', 'B')");
    const n = a.prepare("SELECT COUNT(*) AS n FROM notificacoes WHERE usuario_id = 9440").get() as { n: number };
    assert.equal(n.n, 3);
  });

  it("0045 blocos da tarefa: os LINKS anexados viram blocos Link; arquivos e tarefas sem link ficam NULL", () => {
    const cols = nomes(db, "SELECT name FROM pragma_table_info('tarefas')");
    assert.ok(cols.includes("blocos"));
    const a = new DatabaseSync(":memory:");
    for (const arq of arquivos.filter((f) => f < "0045")) a.exec(readFileSync(join(DIR, arq), "utf8"));
    a.exec("INSERT INTO grupos (id, nome) VALUES (9450, 'G')");
    a.exec("INSERT INTO tarefa_quadros (id, grupo_id, nome) VALUES (9450, 9450, 'Q')");
    a.exec("INSERT INTO tarefa_listas (id, quadro_id, nome) VALUES (9450, 9450, 'L')");
    a.exec("INSERT INTO tarefas (id, quadro_id, lista_id, ticket, titulo) VALUES (1, 9450, 9450, 1, 'com link'), (2, 9450, 9450, 2, 'só arquivo'), (3, 9450, 9450, 3, 'nada')");
    a.exec(
      "INSERT INTO tarefa_anexos (tarefa_id, tipo, nome, url) VALUES (1, 'link', 'Planilha', 'https://ex.com/a'), (1, 'link', 'Edital', 'https://ex.com/b')",
    );
    a.exec("INSERT INTO tarefa_anexos (tarefa_id, tipo, nome, conteudo) VALUES (2, 'arquivo', 'foto.png', 'data:image/png;base64,AAAA')");
    a.exec(readFileSync(join(DIR, arquivos.find((f) => f.startsWith("0045")) ?? ""), "utf8"));
    const linhas = a.prepare("SELECT id, blocos FROM tarefas ORDER BY id").all() as { id: number; blocos: string | null }[];
    const b1 = JSON.parse(linhas[0].blocos ?? "[]") as { tipo: string; url: string; titulo: string; id: string }[];
    assert.equal(b1.length, 2);
    assert.deepEqual(b1.map((b) => [b.tipo, b.url, b.titulo]).sort(), [["link", "https://ex.com/a", "Planilha"], ["link", "https://ex.com/b", "Edital"]].sort());
    assert.equal(new Set(b1.map((b) => b.id)).size, 2);
    assert.equal(linhas[1].blocos, null);
    assert.equal(linhas[2].blocos, null);
  });

  it("0046 calendário: tabela de eventos (cascade com a tarefa) e a aba para quem tem as Tarefas", () => {
    const tabelas = nomes(db, "SELECT name FROM sqlite_master WHERE type='table'");
    assert.ok(tabelas.includes("tarefa_eventos"));
    const a = aplicarTudo();
    a.exec("INSERT INTO permissoes (id, nome, abas) VALUES (9460, 'Com tarefas', '[\"dfd\",\"tarefas\"]'), (9461, 'Sem', '[\"pca\"]')");
    const sql = readFileSync(join(DIR, arquivos.find((f) => f.startsWith("0046")) ?? ""), "utf8").split("--> statement-breakpoint").at(-1) as string;
    a.exec(sql);
    a.exec(sql); // idempotente
    const abas = (id: number) => JSON.parse((a.prepare("SELECT abas FROM permissoes WHERE id = ?").get(id) as { abas: string }).abas);
    assert.deepEqual(abas(9460), ["dfd", "tarefas", "calendario"]);
    assert.deepEqual(abas(9461), ["pca"]);
    a.exec("PRAGMA foreign_keys = ON");
    a.exec("INSERT INTO grupos (id, nome) VALUES (9460, 'G')");
    a.exec("INSERT INTO tarefa_quadros (id, grupo_id, nome) VALUES (9460, 9460, 'Q')");
    a.exec("INSERT INTO tarefa_listas (id, quadro_id, nome) VALUES (9460, 9460, 'L')");
    a.exec("INSERT INTO tarefas (id, quadro_id, lista_id, ticket, titulo) VALUES (9460, 9460, 9460, 1, 'T')");
    a.exec("INSERT INTO tarefa_eventos (tarefa_id, titulo, data) VALUES (9460, 'Reunião', '2026-10-01')");
    a.exec("DELETE FROM tarefas WHERE id = 9460");
    assert.equal((a.prepare("SELECT COUNT(*) AS n FROM tarefa_eventos").get() as { n: number }).n, 0);
  });

  it("0047 calendário profissional: data final e lembrete do evento, feriados e o hash único do link de assinatura", () => {
    assert.ok(nomes(db, "SELECT name FROM pragma_table_info('tarefa_eventos')").includes("data_fim"));
    assert.ok(nomes(db, "SELECT name FROM pragma_table_info('tarefa_eventos')").includes("lembrete_min"));
    const a = aplicarTudo();
    a.exec("PRAGMA foreign_keys = ON");
    a.exec("INSERT INTO feriados (data, nome) VALUES ('2026-08-05', 'Aniversário da cidade')");
    const f = a.prepare("SELECT tipo, anual FROM feriados").get() as { tipo: string; anual: number };
    assert.deepEqual([f.tipo, f.anual], ["municipal", 0]);
    a.exec("INSERT INTO usuarios (id, nome, email, senha_hash) VALUES (9470, 'U', 'u9470@x', 'h'), (9471, 'V', 'v9471@x', 'h')");
    a.exec("INSERT INTO calendario_tokens (usuario_id, token_hash) VALUES (9470, 'abc')");
    assert.throws(() => a.exec("INSERT INTO calendario_tokens (usuario_id, token_hash) VALUES (9471, 'abc')"));
    a.exec("DELETE FROM usuarios WHERE id = 9470");
    assert.equal((a.prepare("SELECT COUNT(*) AS n FROM calendario_tokens").get() as { n: number }).n, 0);
  });

  it("0048 eventos de equipe: repetição, link, livre/ocupado, privado e convidados (cascade com o evento)", () => {
    const cols = nomes(db, "SELECT name FROM pragma_table_info('tarefa_eventos')");
    for (const c of ["recorrencia", "link_reuniao", "ocupado", "privado"]) assert.ok(cols.includes(c), c);
    const a = aplicarTudo();
    a.exec("PRAGMA foreign_keys = ON");
    a.exec("INSERT INTO grupos (id, nome) VALUES (9480, 'G')");
    a.exec("INSERT INTO tarefa_quadros (id, grupo_id, nome) VALUES (9480, 9480, 'Q')");
    a.exec("INSERT INTO tarefa_listas (id, quadro_id, nome) VALUES (9480, 9480, 'L')");
    a.exec("INSERT INTO tarefas (id, quadro_id, lista_id, ticket, titulo) VALUES (9480, 9480, 9480, 1, 'T')");
    a.exec("INSERT INTO usuarios (id, nome, email, senha_hash) VALUES (9480, 'U', 'u9480@x', 'h')");
    a.exec("INSERT INTO tarefa_eventos (id, tarefa_id, titulo, data) VALUES (9480, 9480, 'Reunião', '2026-10-01')");
    const e = a.prepare("SELECT ocupado, privado FROM tarefa_eventos WHERE id = 9480").get() as { ocupado: number; privado: number };
    assert.deepEqual([e.ocupado, e.privado], [1, 0]);
    a.exec("INSERT INTO tarefa_evento_convidados (evento_id, usuario_id) VALUES (9480, 9480)");
    assert.equal((a.prepare("SELECT resposta FROM tarefa_evento_convidados").get() as { resposta: string }).resposta, "pendente");
    assert.throws(() => a.exec("INSERT INTO tarefa_evento_convidados (evento_id, usuario_id) VALUES (9480, 9480)"));
    a.exec("DELETE FROM tarefa_eventos WHERE id = 9480");
    assert.equal((a.prepare("SELECT COUNT(*) AS n FROM tarefa_evento_convidados").get() as { n: number }).n, 0);
  });

  it("0049/0050 agendas externas (cascade com o usuário); a página de agendamento saiu", () => {
    const a = aplicarTudo();
    a.exec("PRAGMA foreign_keys = ON");
    a.exec("INSERT INTO usuarios (id, nome, email, senha_hash) VALUES (9490, 'U', 'u9490@x', 'h')");
    a.exec("INSERT INTO calendario_externos (usuario_id, nome, url) VALUES (9490, 'Feriados', 'https://x.gov.br/a.ics')");
    assert.equal(nomes(a, "SELECT name FROM sqlite_master WHERE type='table'").includes("agenda_paginas"), false);
    a.exec("DELETE FROM usuarios WHERE id = 9490");
    assert.equal((a.prepare("SELECT COUNT(*) AS n FROM calendario_externos").get() as { n: number }).n, 0);
  });

  it("0052 equipes do quadro: membros e vínculos em cascata; tickets 8/9 do calendário PCA ficam sem início", () => {
    const a = new DatabaseSync(":memory:");
    for (const arq of arquivos.filter((f) => f < "0052")) a.exec(readFileSync(join(DIR, arq), "utf8"));
    a.exec("PRAGMA foreign_keys = ON");
    const n = (sql: string) => (a.prepare(sql).get() as { n: number | string | null }).n;
    a.exec("INSERT INTO grupos (id, nome) VALUES (9520, ' Planejamento e Custos ')");
    a.exec("INSERT INTO usuarios (id, nome, email, senha_hash) VALUES (9521, 'U', 'u9521@x', 'h')");
    a.exec("INSERT INTO tarefa_quadros (id, grupo_id, nome, cor) VALUES (9522, 9520, 'Calendário Institucional PCA 2026/2027', '#2563eb')");
    a.exec("INSERT INTO tarefa_listas (id, quadro_id, nome) VALUES (9523, 9522, 'A fazer')");
    for (const t of [7, 8, 9])
      a.exec(`INSERT INTO tarefas (id, quadro_id, lista_id, ticket, titulo, inicio, prazo) VALUES (${9530 + t}, 9522, 9523, ${t}, 'T', '2026-07-01', '2026-12-01')`);
    a.exec(readFileSync(join(DIR, "0052_tarefa_equipes.sql"), "utf8"));
    assert.equal(n("SELECT COUNT(*) AS n FROM tarefas WHERE inicio IS NULL"), 2);
    assert.equal(n("SELECT inicio AS n FROM tarefas WHERE ticket = 7"), "2026-07-01");
    a.exec("INSERT INTO tarefa_equipes (id, quadro_id, nome, cor) VALUES (9540, 9522, 'Equipe', '#16a34a')");
    a.exec("INSERT INTO tarefa_equipe_membros (equipe_id, usuario_id) VALUES (9540, 9521)");
    a.exec("INSERT INTO tarefa_equipes_links (tarefa_id, equipe_id) VALUES (9538, 9540)");
    a.exec("DELETE FROM tarefas WHERE id = 9538");
    assert.equal(n("SELECT COUNT(*) AS n FROM tarefa_equipes_links"), 0);
    a.exec("DELETE FROM tarefa_quadros WHERE id = 9522");
    assert.equal(n("SELECT COUNT(*) AS n FROM tarefa_equipes"), 0);
    assert.equal(n("SELECT COUNT(*) AS n FROM tarefa_equipe_membros"), 0);
  });

  it("0053 prazo com hora e lembrete da tarefa (colunas novas, vazias)", () => {
    const a = aplicarTudo();
    const cols = (a.prepare("PRAGMA table_info(tarefas)").all() as { name: string }[]).map((c) => c.name);
    assert.ok(cols.includes("prazo_hora") && cols.includes("lembrete_min"));
  });

  it("0054 checklists nomeados: os itens antigos entram num 'Checklist' da própria tarefa; excluir o checklist leva os itens", () => {
    const a = new DatabaseSync(":memory:");
    for (const arq of arquivos.filter((f) => f < "0054")) a.exec(readFileSync(join(DIR, arq), "utf8"));
    a.exec("PRAGMA foreign_keys = ON");
    a.exec("INSERT INTO grupos (id, nome) VALUES (9540, 'G')");
    a.exec("INSERT INTO tarefa_quadros (id, grupo_id, nome) VALUES (9541, 9540, 'Q')");
    a.exec("INSERT INTO tarefa_listas (id, quadro_id, nome) VALUES (9542, 9541, 'L')");
    a.exec("INSERT INTO tarefas (id, quadro_id, lista_id, ticket, titulo) VALUES (9543, 9541, 9542, 1, 'A'), (9544, 9541, 9542, 2, 'B')");
    a.exec("INSERT INTO tarefa_checklist (tarefa_id, texto, ordem) VALUES (9543, 'x', 1), (9543, 'y', 2), (9544, 'z', 1)");
    a.exec(readFileSync(join(DIR, "0054_checklists_nomeados.sql"), "utf8"));
    const n = (sql: string) => (a.prepare(sql).get() as { n: number }).n;
    assert.equal(n("SELECT COUNT(*) AS n FROM tarefa_checklists"), 2);
    assert.equal(n("SELECT COUNT(*) AS n FROM tarefa_checklist WHERE checklist_id IS NULL"), 0);
    assert.equal(n("SELECT COUNT(DISTINCT checklist_id) AS n FROM tarefa_checklist WHERE tarefa_id = 9543"), 1);
    a.exec("DELETE FROM tarefa_checklists WHERE tarefa_id = 9543");
    assert.equal(n("SELECT COUNT(*) AS n FROM tarefa_checklist WHERE tarefa_id = 9543"), 0);
  });

  it("0055 modelos de tarefa viram cartões-TEMPLATE na lista TEMPLATES (ticket, etiquetas e checklist); os de quadro ficam", () => {
    const a = new DatabaseSync(":memory:");
    for (const arq of arquivos.filter((f) => f < "0055")) a.exec(readFileSync(join(DIR, arq), "utf8"));
    a.exec("INSERT INTO grupos (id, nome) VALUES (9550, 'G')");
    a.exec("INSERT INTO tarefa_quadros (id, grupo_id, nome, prox_ticket) VALUES (9551, 9550, 'Q', 8)");
    a.exec("INSERT INTO tarefa_listas (id, quadro_id, nome, ordem) VALUES (9552, 9551, 'Dia 1', 1)");
    a.exec("INSERT INTO tarefa_etiquetas (id, quadro_id, nome, cor) VALUES (9553, 9551, 'FALTAS', '#f59e0b')");
    const conteudo = JSON.stringify({ titulo: "2. Protocolo - FALTA - ", descricao: "STATUS:", prioridade: "alta", etiquetas: [9553, 999], checklist: ["SERVIDORES", " "], estimativaH: 2 });
    a.exec(`INSERT INTO tarefa_modelos (id, tipo, quadro_id, nome, conteudo) VALUES (9554, 'tarefa', 9551, 'Falta', '${conteudo}'), (9555, 'tarefa', 9551, 'Vazio', '{}'), (9556, 'quadro', NULL, 'Mensal', '{}')`);
    a.exec(readFileSync(join(DIR, "0055_templates_copia.sql"), "utf8"));
    const n = (sql: string) => (a.prepare(sql).get() as { n: number | string }).n;
    const t = a.prepare("SELECT t.ticket, t.titulo, t.prioridade, t.template, l.nome AS lista, l.ordem AS lordem FROM tarefas t JOIN tarefa_listas l ON l.id = t.lista_id ORDER BY t.ticket").all() as {
      ticket: number;
      titulo: string;
      prioridade: string;
      template: number;
      lista: string;
      lordem: number;
    }[];
    assert.deepEqual(t.map((x) => [x.ticket, x.titulo, x.prioridade, x.template, x.lista]), [[8, "2. Protocolo - FALTA - ", "alta", 1, "TEMPLATES"], [9, "Vazio", "media", 1, "TEMPLATES"]]);
    assert.ok(t[0].lordem < 1);
    assert.equal(n("SELECT prox_ticket AS n FROM tarefa_quadros WHERE id = 9551"), 10);
    assert.equal(n("SELECT COUNT(*) AS n FROM tarefa_etiqueta_links"), 1);
    assert.equal(n("SELECT group_concat(texto) AS n FROM tarefa_checklist"), "SERVIDORES");
    assert.equal(n("SELECT COUNT(*) AS n FROM tarefa_modelos WHERE tipo = 'tarefa'"), 0);
    assert.equal(n("SELECT COUNT(*) AS n FROM tarefa_modelos WHERE tipo = 'quadro'"), 1);
    assert.equal(n("SELECT COUNT(*) AS n FROM sqlite_master WHERE name = '_modelos_para_template'"), 0);
  });

  it("0056 campos personalizados: um valor por tarefa + campo; excluir o campo ou a tarefa leva os valores", () => {
    db.exec("PRAGMA foreign_keys = ON");
    db.exec("INSERT INTO grupos (id, nome) VALUES (9560, 'G')");
    db.exec("INSERT INTO tarefa_quadros (id, grupo_id, nome, formato_titulo) VALUES (9561, 9560, 'Q', '{Tipo} - {Nº}')");
    db.exec("INSERT INTO tarefa_listas (id, quadro_id, nome) VALUES (9562, 9561, 'L')");
    db.exec("INSERT INTO tarefas (id, quadro_id, lista_id, ticket, titulo) VALUES (9563, 9561, 9562, 1, 'A')");
    db.exec("INSERT INTO tarefa_campos (id, quadro_id, nome, tipo, opcoes) VALUES (9564, 9561, 'Tipo', 'lista', '[\"FALTA\"]'), (9565, 9561, 'Nº', 'texto', NULL)");
    db.exec("INSERT INTO tarefa_campo_valores (tarefa_id, campo_id, valor) VALUES (9563, 9564, 'FALTA'), (9563, 9565, '12')");
    assert.throws(() => db.exec("INSERT INTO tarefa_campo_valores (tarefa_id, campo_id, valor) VALUES (9563, 9564, 'x')"));
    const n = (sql: string) => (db.prepare(sql).get() as { n: number }).n;
    assert.equal(n("SELECT titulo_manual AS n FROM tarefas WHERE id = 9563"), 0);
    db.exec("DELETE FROM tarefa_campos WHERE id = 9564");
    assert.equal(n("SELECT COUNT(*) AS n FROM tarefa_campo_valores WHERE tarefa_id = 9563"), 1);
    db.exec("DELETE FROM tarefas WHERE id = 9563");
    assert.equal(n("SELECT COUNT(*) AS n FROM tarefa_campo_valores"), 0);
  });

  it("0057 vínculos múltiplos: o vínculo único antigo é copiado; único por tarefa + tipo + alvo; excluir a tarefa leva os dela", () => {
    const a = new DatabaseSync(":memory:");
    for (const arq of arquivos.filter((f) => f < "0057")) a.exec(readFileSync(join(DIR, arq), "utf8"));
    a.exec("PRAGMA foreign_keys = ON");
    a.exec("INSERT INTO grupos (id, nome) VALUES (9570, 'G')");
    a.exec("INSERT INTO tarefa_quadros (id, grupo_id, nome) VALUES (9571, 9570, 'Q')");
    a.exec("INSERT INTO tarefa_listas (id, quadro_id, nome) VALUES (9572, 9571, 'L')");
    a.exec(
      "INSERT INTO tarefas (id, quadro_id, lista_id, ticket, titulo, vinculo_tipo, vinculo_id) VALUES (9573, 9571, 9572, 1, 'A', 'protocolo', 44), (9574, 9571, 9572, 2, 'B', NULL, NULL), (9575, 9571, 9572, 3, 'C', 'lixo', 1)",
    );
    a.exec(readFileSync(join(DIR, "0057_tarefa_vinculos.sql"), "utf8"));
    const n = (sql: string) => (a.prepare(sql).get() as { n: number }).n;
    assert.deepEqual(a.prepare("SELECT tarefa_id AS t, tipo, alvo_id AS a FROM tarefa_vinculos").all().map((x) => ({ ...(x as object) })), [{ t: 9573, tipo: "protocolo", a: 44 }]);
    a.exec("INSERT INTO tarefa_vinculos (tarefa_id, tipo, alvo_id) VALUES (9573, 'tarefa', 9574)");
    assert.throws(() => a.exec("INSERT INTO tarefa_vinculos (tarefa_id, tipo, alvo_id) VALUES (9573, 'tarefa', 9574)"));
    a.exec("DELETE FROM tarefas WHERE id = 9573");
    assert.equal(n("SELECT COUNT(*) AS n FROM tarefa_vinculos"), 0);
  });

  it("0058 imagem de fundo do quadro: coluna fundo_url (nula = sem fundo)", () => {
    db.exec("INSERT INTO grupos (id, nome) VALUES (9580, 'G')");
    db.exec("INSERT INTO tarefa_quadros (id, grupo_id, nome) VALUES (9581, 9580, 'Q')");
    assert.equal((db.prepare("SELECT fundo_url AS f FROM tarefa_quadros WHERE id = 9581").get() as { f: string | null }).f, null);
    db.exec("UPDATE tarefa_quadros SET fundo_url = 'https://i.pinimg.com/x.jpg' WHERE id = 9581");
    db.exec("DELETE FROM tarefa_quadros WHERE id = 9581");
    db.exec("DELETE FROM grupos WHERE id = 9580");
  });

  it("0059 enquadramento do fundo e capa do cartão: colunas nulas por padrão", () => {
    db.exec("INSERT INTO grupos (id, nome) VALUES (9590, 'G')");
    db.exec("INSERT INTO tarefa_quadros (id, grupo_id, nome, fundo_ajuste) VALUES (9591, 9590, 'Q', '{\"x\":20,\"y\":40,\"zoom\":1.5}')");
    db.exec("INSERT INTO tarefa_listas (id, quadro_id, nome) VALUES (9592, 9591, 'L')");
    db.exec("INSERT INTO tarefas (id, quadro_id, lista_id, ticket, titulo) VALUES (9593, 9591, 9592, 1, 'T')");
    assert.equal((db.prepare("SELECT capa AS c FROM tarefas WHERE id = 9593").get() as { c: string | null }).c, null);
    db.exec("UPDATE tarefas SET capa = '#579dff' WHERE id = 9593");
    db.exec("DELETE FROM tarefa_quadros WHERE id = 9591");
    db.exec("DELETE FROM grupos WHERE id = 9590");
  });

  it("0060 degradê de fundo e quadro privado: privado nasce 0; o degradê é JSON livre", () => {
    db.exec("INSERT INTO grupos (id, nome) VALUES (9595, 'G')");
    db.exec("INSERT INTO tarefa_quadros (id, grupo_id, nome) VALUES (9596, 9595, 'Q')");
    const q = db.prepare("SELECT privado AS p, fundo_gradiente AS g FROM tarefa_quadros WHERE id = 9596").get() as { p: number; g: string | null };
    assert.deepEqual([q.p, q.g], [0, null]);
    db.exec(`UPDATE tarefa_quadros SET privado = 1, fundo_gradiente = '{"cores":["#000000","#ffffff"],"angulo":90}' WHERE id = 9596`);
    db.exec("DELETE FROM tarefa_quadros WHERE id = 9596");
    db.exec("DELETE FROM grupos WHERE id = 9595");
  });

  it("0061 pastas no banco: as antigas viram PÚBLICAS do grupo do 1º quadro público; um quadro em uma pasta; a preferência fica só com a ordem", () => {
    const a = new DatabaseSync(":memory:");
    for (const arq of arquivos.filter((f) => f < "0061")) a.exec(readFileSync(join(DIR, arq), "utf8"));
    a.exec("PRAGMA foreign_keys = ON");
    a.exec("INSERT INTO usuarios (id, nome, email, senha_hash) VALUES (9610, 'Ana', 'a9610@x', 'h'), (9611, 'Bia', 'b9611@x', 'h')");
    a.exec("INSERT INTO grupos (id, nome) VALUES (9612, 'G1'), (9613, 'G2')");
    a.exec(
      "INSERT INTO tarefa_quadros (id, grupo_id, nome, privado, criado_por) VALUES (1, 9612, 'Priv', 1, 9610), (2, 9612, 'A', 0, 9610), (3, 9612, 'B', 0, 9610), (4, 9613, 'Outro grupo', 0, 9610), (5, 9612, 'C', 0, 9610)",
    );
    const ana = JSON.stringify({
      lista: [
        { id: "x", nome: " PCA ", cor: "#ABCDEF", quadros: [1, 3, 4, 2] },
        { id: "y", nome: "Só privado", cor: "red", quadros: [1] },
      ],
      ordem: ["q:5", "p:x"],
    });
    const bia = JSON.stringify({ lista: [{ id: "z", nome: "", cor: "#123456", quadros: [2, 5] }], ordem: [] });
    a.exec(`INSERT INTO preferencias_tabela (usuario_id, chave, valor) VALUES (9610, 'tarefas:conjuntos', '${ana}'), (9611, 'tarefas:conjuntos', '${bia}'), (9611, 'outra', '{"lista":[1]}')`);
    a.exec(readFileSync(join(DIR, "0061_tarefa_pastas.sql"), "utf8"));
    const pastas = a.prepare("SELECT id, grupo_id AS g, nome, cor, privado AS p, criado_por AS dono FROM tarefa_pastas ORDER BY id").all() as {
      id: number;
      g: number;
      nome: string;
      cor: string;
      p: number;
      dono: number;
    }[];
    assert.deepEqual(
      pastas.map((x) => [x.g, x.nome, x.cor, x.p, x.dono]),
      [
        [9612, "PCA", "#abcdef", 0, 9610],
        [9612, "Pasta", "#123456", 0, 9611],
      ],
    );
    const q = (id: number) => a.prepare("SELECT pasta_id AS p, pasta_ordem AS o FROM tarefa_quadros WHERE id = ?").get(id) as { p: number | null; o: number };
    assert.equal(q(1).p, null); // privado fica solto
    assert.equal(q(4).p, null); // outro grupo fica solto
    assert.deepEqual([q(3).p, q(2).p, q(5).p], [pastas[0].id, pastas[0].id, pastas[1].id]); // 2 fica na 1ª pasta
    assert.ok(q(3).o < q(2).o);
    const pref = (u: number) => (a.prepare("SELECT valor AS v FROM preferencias_tabela WHERE usuario_id = ? AND chave = 'tarefas:conjuntos'").get(u) as { v: string }).v;
    assert.deepEqual(JSON.parse(pref(9610)), { ordem: ["q:5", "p:x"] });
    assert.equal((a.prepare("SELECT valor AS v FROM preferencias_tabela WHERE chave = 'outra'").get() as { v: string }).v, '{"lista":[1]}');
    a.exec(`DELETE FROM tarefa_pastas WHERE id = ${pastas[0].id}`);
    assert.equal(q(3).p, null);
  });

  it("0062 Trello: vínculos únicos por (tipo, local) e (tipo, id do Trello); fila junta repetições; excluir o quadro limpa tudo", () => {
    const a = new DatabaseSync(":memory:");
    for (const arq of arquivos) a.exec(readFileSync(join(DIR, arq), "utf8"));
    a.exec("PRAGMA foreign_keys = ON");
    a.exec("INSERT INTO usuarios (id, nome, email, senha_hash) VALUES (9620, 'Ana', 'a9620@x', 'h')");
    a.exec("INSERT INTO grupos (id, nome) VALUES (9621, 'G')");
    a.exec("INSERT INTO tarefa_quadros (id, grupo_id, nome) VALUES (9622, 9621, 'Q')");
    a.exec("INSERT INTO trello_quadros (quadro_id, board_id) VALUES (9622, 'b1')");
    a.exec("INSERT INTO trello_vinculos (quadro_id, tipo, local_id, trello_id) VALUES (9622, 'tarefa', 1, 'c1')");
    assert.throws(() => a.exec("INSERT INTO trello_vinculos (quadro_id, tipo, local_id, trello_id) VALUES (9622, 'tarefa', 1, 'c2')"));
    assert.throws(() => a.exec("INSERT INTO trello_vinculos (quadro_id, tipo, local_id, trello_id) VALUES (9622, 'tarefa', 2, 'c1')"));
    a.exec("INSERT INTO trello_vinculos (quadro_id, tipo, local_id, trello_id) VALUES (9622, 'lista', 1, 'c1')");
    a.exec("INSERT INTO trello_fila (quadro_id, direcao, tipo, alvo) VALUES (9622, 'saida', 'tarefa', '1')");
    a.exec("INSERT INTO trello_fila (quadro_id, direcao, tipo, alvo) VALUES (9622, 'saida', 'tarefa', '1') ON CONFLICT DO NOTHING");
    assert.equal((a.prepare("SELECT COUNT(*) AS n FROM trello_fila").get() as { n: number }).n, 1);
    a.exec("INSERT INTO trello_membros (usuario_id, membro_id) VALUES (9620, 'm1')");
    assert.throws(() => a.exec("INSERT INTO usuarios (id, nome, email, senha_hash) VALUES (9623, 'B', 'b9623@x', 'h'); INSERT INTO trello_membros (usuario_id, membro_id) VALUES (9623, 'm1')"));
    a.exec("DELETE FROM tarefa_quadros WHERE id = 9622");
    for (const t of ["trello_quadros", "trello_vinculos", "trello_fila"]) assert.equal((a.prepare(`SELECT COUNT(*) AS n FROM ${t}`).get() as { n: number }).n, 0, t);
    a.exec("DELETE FROM usuarios WHERE id = 9620");
    assert.equal((a.prepare("SELECT COUNT(*) AS n FROM trello_membros WHERE usuario_id = 9620").get() as { n: number }).n, 0);
  });

  it("0067 cadastro institucional: unidade do usuário (set null) e UM código por e-mail + finalidade", () => {
    const a = new DatabaseSync(":memory:");
    for (const arq of arquivos) a.exec(readFileSync(join(DIR, arq), "utf8"));
    a.exec("PRAGMA foreign_keys = ON");
    a.exec("INSERT INTO reparticoes (id, codigo, nome) VALUES (9670, 'SX', 'Sec X')");
    a.exec("INSERT INTO usuarios (id, nome, email, senha_hash, reparticao_id) VALUES (9671, 'Ana Souza', 'a9671@rioverde.go.gov.br', 'h', 9670)");
    a.exec("DELETE FROM reparticoes WHERE id = 9670");
    assert.equal((a.prepare("SELECT reparticao_id AS r FROM usuarios WHERE id = 9671").get() as { r: number | null }).r, null);
    const ins = "INSERT INTO codigos_email (email, finalidade, codigo_hash, expira_em, enviado_em) VALUES ('a@x', 'cadastro', 'h', 'e', 'e')";
    a.exec(ins);
    assert.throws(() => a.exec(ins));
    a.exec("INSERT INTO codigos_email (email, finalidade, codigo_hash, expira_em, enviado_em) VALUES ('a@x', 'senha', 'h', 'e', 'e')");
    assert.equal((a.prepare("SELECT COUNT(*) AS n FROM codigos_email").get() as { n: number }).n, 2);
    a.exec("UPDATE usuarios SET cargo = 'Analista' WHERE id = 9671"); // 0068
    assert.equal((a.prepare("SELECT cargo AS c FROM usuarios WHERE id = 9671").get() as { c: string }).c, "Analista");
  });

  it("0073 contato do usuário: telefone + WhatsApp, validação dos dados e troca de senha obrigatória (padrões desligados)", () => {
    const a = new DatabaseSync(":memory:");
    for (const arq of arquivos.filter((f) => f < "0073")) a.exec(readFileSync(join(DIR, arq), "utf8"));
    a.exec("INSERT INTO usuarios (id, nome, email, senha_hash) VALUES (9721, 'Ana Souza', 'a9721@x', 'h')");
    for (const arq of arquivos.filter((f) => f >= "0073")) a.exec(readFileSync(join(DIR, arq), "utf8"));
    const r = a.prepare("SELECT telefone AS t, telefone_whatsapp AS w, dados_validados_em AS v, trocar_senha AS s FROM usuarios WHERE id = 9721").get() as Record<string, unknown>;
    assert.deepEqual({ ...r }, { t: null, w: 0, v: null, s: 0 });
  });

  it("0106 telas no grupo: copia as telas da permissão que o grupo usava; sem permissão = nenhuma; PCAs = todos (NULL)", () => {
    const a = new DatabaseSync(":memory:");
    for (const arq of arquivos.filter((f) => f < "0106")) a.exec(readFileSync(join(DIR, arq), "utf8"));
    a.exec(`INSERT INTO permissoes (id, nome, abas) VALUES (9801, 'Consulta', '["dfd","pca"]')`);
    a.exec("INSERT INTO grupos (id, nome, permissao_id) VALUES (9802, 'Com', 9801), (9803, 'Sem', NULL)");
    for (const arq of arquivos.filter((f) => f >= "0106")) a.exec(readFileSync(join(DIR, arq), "utf8"));
    const linhas = a.prepare("SELECT id, abas, pcas FROM grupos WHERE id IN (9802, 9803) ORDER BY id").all() as Record<string, unknown>[];
    assert.deepEqual(
      linhas.map((l) => ({ ...l })),
      [
        { id: 9802, abas: '["dfd","pca"]', pcas: null },
        { id: 9803, abas: "[]", pcas: null },
      ],
    );
  });

  it("0074 detalhes do papel: coluna com padrão '{}' (sem restrições) em todos os papéis + índices de criado_por", () => {
    const a = new DatabaseSync(":memory:");
    for (const arq of arquivos.filter((f) => f < "0074")) a.exec(readFileSync(join(DIR, arq), "utf8"));
    a.exec("INSERT INTO papeis (nome, capacidades) VALUES ('Consulta', '{}')");
    for (const arq of arquivos.filter((f) => f >= "0074")) a.exec(readFileSync(join(DIR, arq), "utf8"));
    const linhas = a.prepare("SELECT detalhes AS d FROM papeis").all() as { d: string }[];
    assert.ok(linhas.length >= 4);
    for (const l of linhas) assert.equal(l.d, "{}");
    const idx = (a.prepare("SELECT name FROM sqlite_master WHERE type = 'index'").all() as { name: string }[]).map((r) => r.name);
    assert.ok(idx.includes("protocolos_dfd_criado_por_idx"));
    assert.ok(idx.includes("dfds_criado_por_idx"));
    a.exec("INSERT INTO papeis (nome, capacidades) VALUES ('Novo', '{}')");
    assert.equal((a.prepare("SELECT detalhes AS d FROM papeis WHERE nome = 'Novo'").get() as { d: string }).d, "{}");
  });

  it("0076 automação: execuções, passos, autorização de uso único e registros sem repetir", () => {
    const a = new DatabaseSync(":memory:");
    for (const arq of arquivos) a.exec(readFileSync(join(DIR, arq), "utf8"));
    a.exec("PRAGMA foreign_keys = ON");
    a.exec("INSERT INTO usuarios (id, nome, email, senha_hash) VALUES (9761, 'A B', 'a9761@x', 'h')");
    a.exec("INSERT INTO automacao_execucoes (id, receita, usuario_id) VALUES (1, 'anexar-dfds', 9761)");
    const e = a.prepare("SELECT estado, ensaio, entrada, total FROM automacao_execucoes WHERE id = 1").get() as Record<string, unknown>;
    assert.deepEqual({ ...e }, { estado: "preparada", ensaio: 0, entrada: "{}", total: 0 });
    a.exec("INSERT INTO automacao_passos (execucao_id, chave, capacidade) VALUES (1, 'p1', 'anexar')");
    assert.throws(() => a.exec("INSERT INTO automacao_passos (execucao_id, chave, capacidade) VALUES (1, 'p1', 'anexar')"), "um passo por chave");
    a.exec("INSERT INTO automacao_autorizacoes (id, execucao_id, passo_chave, capacidade, alvo_hash, usuario_id, expira_em) VALUES ('h', 1, 'p1', 'anexar', 'x', 9761, 10)");
    assert.equal(a.prepare("DELETE FROM automacao_autorizacoes WHERE id = 'h' AND expira_em > 5 RETURNING id").all().length, 1);
    assert.equal(a.prepare("DELETE FROM automacao_autorizacoes WHERE id = 'h' AND expira_em > 5 RETURNING id").all().length, 0, "uso único");
    a.exec("INSERT INTO automacao_registros (capacidade, centi_alvo, descricao, execucao_id) VALUES ('anexar', '2332778', 'PGM - PCA', 1)");
    assert.throws(() => a.exec("INSERT INTO automacao_registros (capacidade, centi_alvo, descricao) VALUES ('anexar', '2332778', 'PGM - PCA')"), "nunca grava duas vezes");
    a.exec("DELETE FROM automacao_execucoes WHERE id = 1");
    assert.equal((a.prepare("SELECT COUNT(*) AS n FROM automacao_passos").get() as { n: number }).n, 0, "os passos caem com a execução");
    assert.equal((a.prepare("SELECT COUNT(*) AS n FROM automacao_registros").get() as { n: number }).n, 1, "o registro da escrita fica");
  });

  it("0075 catálogo: os catálogos atuais viram 'agenda' (sem pasta, cor do tipo); pastas e histórico de compra nascem vazios", () => {
    const a = new DatabaseSync(":memory:");
    for (const arq of arquivos.filter((f) => f < "0075")) a.exec(readFileSync(join(DIR, arq), "utf8"));
    a.exec("INSERT INTO catalogos (id, nome) VALUES (9741, 'Material de expediente')");
    for (const arq of arquivos.filter((f) => f >= "0075")) a.exec(readFileSync(join(DIR, arq), "utf8"));
    a.exec("PRAGMA foreign_keys = ON");
    const r = a.prepare("SELECT tipo AS t, cor AS c, pasta_id AS p FROM catalogos WHERE id = 9741").get() as Record<string, unknown>;
    assert.deepEqual({ ...r }, { t: "agenda", c: null, p: null });
    a.exec("INSERT INTO catalogo_pastas (id, nome) VALUES (1, 'P')");
    a.exec("UPDATE catalogos SET pasta_id = 1 WHERE id = 9741");
    a.exec("INSERT INTO catalogo_contratos (catalogo_id, id_contrato) VALUES (9741, '1')");
    assert.throws(() => a.exec("INSERT INTO catalogo_contratos (catalogo_id, id_contrato) VALUES (9741, '1')"), "um contrato por id no catálogo");
    a.exec("INSERT INTO catalogo_compras (catalogo_id, ordem, id_contrato, codigo, descricao) VALUES (9741, 0, '1', '12', 'X')");
    a.exec("DELETE FROM catalogo_pastas WHERE id = 1");
    assert.equal((a.prepare("SELECT pasta_id AS p FROM catalogos WHERE id = 9741").get() as { p: null }).p, null, "excluir a pasta tira só a pasta");
    a.exec("DELETE FROM catalogos WHERE id = 9741");
    assert.equal((a.prepare("SELECT COUNT(*) AS n FROM catalogo_compras").get() as { n: number }).n, 0, "o histórico cai com o catálogo");
  });

  it("0070 cargos: semeia os cargos já informados (sem repetir, sem caixa) e o nome é único sem caixa", () => {
    const a = new DatabaseSync(":memory:");
    const antes = arquivos.filter((f) => f < "0070");
    for (const arq of antes) a.exec(readFileSync(join(DIR, arq), "utf8"));
    a.exec("INSERT INTO usuarios (id, nome, email, senha_hash, cargo) VALUES (9701, 'A B', 'a9701@x', 'h', ' Analista '), (9702, 'C D', 'c9702@x', 'h', 'ANALISTA'), (9703, 'E F', 'e9703@x', 'h', 'Diretor'), (9704, 'G H', 'g9704@x', 'h', NULL)");
    for (const arq of arquivos.filter((f) => f >= "0070")) a.exec(readFileSync(join(DIR, arq), "utf8"));
    const nomes = (a.prepare("SELECT nome FROM cargos ORDER BY lower(nome)").all() as { nome: string }[]).map((r) => r.nome);
    assert.equal(nomes.length, 2);
    assert.equal(nomes[1], "Diretor");
    assert.throws(() => a.exec("INSERT INTO cargos (nome) VALUES ('diretor')"));
  });

  it("0069 papéis: 3 do sistema (sementes = núcleo), só o Membro é o padrão, cada pessoa com o papel do role", () => {
    const d = new DatabaseSync(":memory:");
    const i69 = arquivos.findIndex((f) => f.startsWith("0069"));
    assert.ok(i69 > 0, "migração 0069 ausente");
    for (const arq of arquivos.slice(0, i69)) d.exec(readFileSync(join(DIR, arq), "utf8"));
    d.exec(`INSERT INTO usuarios (id, email, nome, senha_hash, role) VALUES (9691, 'a@x', 'A', 'h', 'admin'), (9692, 'g@x', 'G', 'h', 'gestor'),
      (9693, 'm@x', 'M', 'h', 'membro'), (9694, 'x@x', 'X', 'h', 'xyz')`);
    for (const arq of arquivos.slice(i69)) d.exec(readFileSync(join(DIR, arq), "utf8"));
    d.exec("PRAGMA foreign_keys = ON");
    const papeis = d.prepare("SELECT id, chave, capacidades, padrao_cadastro AS padrao FROM papeis ORDER BY ordem").all() as {
      id: number;
      chave: string;
      capacidades: string;
      padrao: number;
    }[];
    assert.deepEqual(
      papeis.map((p) => p.chave),
      ["admin", "gestor", "membro"],
    );
    assert.deepEqual(
      papeis.filter((p) => p.padrao).map((p) => p.chave),
      ["membro"],
    );
    // As sementes do SQL = o núcleo (a tela e as guardas leem o mesmo).
    for (const p of papeis) assert.deepEqual(JSON.parse(p.capacidades), papelSistema(p.chave)?.capacidades, p.chave);
    const papelDe = (id: number) => (d.prepare("SELECT papel_id AS p FROM usuarios WHERE id = ?").get(id) as { p: number | null }).p;
    const id = (chave: string) => papeis.find((p) => p.chave === chave)?.id;
    assert.equal(papelDe(9691), id("admin"));
    assert.equal(papelDe(9692), id("gestor"));
    assert.equal(papelDe(9693), id("membro"));
    assert.equal(papelDe(9694), null, "role desconhecido fica sem papel");
    // Nome e chave únicos; excluir um papel deixa a pessoa sem papel (set null).
    assert.throws(() => d.exec("INSERT INTO papeis (nome) VALUES ('Gestor')"));
    assert.throws(() => d.exec("INSERT INTO papeis (nome, chave) VALUES ('Outro', 'membro')"));
    d.exec("INSERT INTO papeis (id, nome) VALUES (9695, 'Consulta')");
    d.exec("UPDATE usuarios SET papel_id = 9695 WHERE id = 9693");
    d.exec("DELETE FROM papeis WHERE id = 9695");
    assert.equal(papelDe(9693), null);
    assert.ok(nomes(d, "SELECT name FROM sqlite_master WHERE type='index'").includes("usuarios_papel_idx"));
  });

  it("0072 ressincroniza o papel pelo role (só papéis do sistema; o criado pelo ADM fica); idempotente", () => {
    const d = new DatabaseSync(":memory:");
    const i72 = arquivos.findIndex((f) => f.startsWith("0072"));
    assert.ok(i72 > 0, "migração 0072 ausente");
    for (const arq of arquivos.slice(0, i72)) d.exec(readFileSync(join(DIR, arq), "utf8"));
    const id = (chave: string) => (d.prepare("SELECT id FROM papeis WHERE chave = ?").get(chave) as { id: number }).id;
    d.exec("INSERT INTO papeis (id, nome) VALUES (9700, 'Consulta')");
    d.exec(`INSERT INTO usuarios (id, email, nome, senha_hash, role, papel_id) VALUES
      (9701, 'a@x', 'A', 'h', 'gestor', ${id("membro")}), (9702, 'b@x', 'B', 'h', 'membro', 9700),
      (9703, 'c@x', 'C', 'h', 'admin', NULL), (9704, 'd@x', 'D', 'h', 'membro', ${id("membro")})`);
    const sql = readFileSync(join(DIR, arquivos[i72]), "utf8");
    d.exec(sql);
    d.exec(sql);
    const papel = (u: number) => (d.prepare("SELECT papel_id AS p FROM usuarios WHERE id = ?").get(u) as { p: number | null }).p;
    assert.equal(papel(9701), id("gestor"), "trocado só no role pelo código antigo");
    assert.equal(papel(9702), 9700, "papel criado pelo ADM não é tocado");
    assert.equal(papel(9703), id("admin"), "sem papel ganha o do role");
    assert.equal(papel(9704), id("membro"));
  });

  it("0077 protocolo incorporado editável: vínculo pelo protocolo, retrato do item no nº e órfãos baixados", () => {
    const d = new DatabaseSync(":memory:");
    const i77 = arquivos.findIndex((f) => f.startsWith("0077"));
    assert.ok(i77 > 0, "migração 0077 ausente");
    for (const arq of arquivos.slice(0, i77)) d.exec(readFileSync(join(DIR, arq), "utf8"));
    d.exec(`INSERT INTO pcas (id, nome, ano, fonte) VALUES (1, 'PCA 2027', 2027, 'protocolo'), (2, 'Edição legada', 2027, 'protocolo');
      INSERT INTO dfd_protocolos (id, numero, pca_id, pca_incorporado_em) VALUES (10, 'P-10', 1, '2027-01-01'), (20, 'P-20', 1, NULL), (30, 'P-30', NULL, NULL);
      INSERT INTO dfds (id, numero, protocolo_id) VALUES (100, 'D100', 10), (200, 'D200', 20), (300, 'D300', 30);
      INSERT INTO dfd_itens (id, dfd_id, item, codigo, descricao, unidade, sequencial) VALUES (1, 100, 1, '111', 'CADEIRA', 'UN', 1);
      INSERT INTO pca_dfds (pca_id, dfd_id, acao) VALUES (1, 100, 'incorporar'), (1, 200, 'incorporar'), (2, 300, 'incorporar');
      INSERT INTO pca_itens (id, pca_id, sequencial, dfd_item_id, dfd_id, protocolo_id) VALUES (1, 1, 1, 1, 100, 10), (2, 1, 2, NULL, 100, 10);`);
    d.exec(readFileSync(join(DIR, arquivos[i77]), "utf8"));
    for (const arq of arquivos.slice(i77 + 1)) d.exec(readFileSync(join(DIR, arq), "utf8"));
    const via = (dfd: number) => (d.prepare("SELECT protocolo_id AS p FROM pca_dfds WHERE dfd_id = ?").get(dfd) as { p: number | null }).p;
    assert.equal(via(100), 10, "incorporado: o vínculo é do protocolo");
    assert.equal(via(200), null, "enviado (não incorporado): fica como vínculo legado");
    assert.equal(via(300), null, "edição legada: sem protocolo");
    assert.deepEqual({ ...(d.prepare("SELECT codigo, descricao, unidade, item, baixado_em AS b FROM pca_itens WHERE id = 1").get() as object) }, {
      codigo: "111",
      descricao: "CADEIRA",
      unidade: "UN",
      item: 1,
      b: null,
    });
    const orfao = d.prepare("SELECT ativo AS a, baixado_em AS b, motivo AS m FROM pca_itens WHERE id = 2").get() as { a: number; b: string | null; m: string };
    assert.equal(orfao.a, 0);
    assert.ok(orfao.b, "o nº sem item é baixado");
    assert.equal(orfao.m, "Item removido do DFD");
    const idx = nomes(d, "SELECT name FROM sqlite_master WHERE type='index'");
    for (const i of ["pca_dfds_protocolo_idx", "pca_itens_dfd_idx"]) assert.ok(idx.includes(i), `índice ausente: ${i}`);
  });

  it("0085/0087 totais do DFD = os itens: completo recalculado (4 casas), parcial intocado, item sem total ganha q × vu", () => {
    const d = new DatabaseSync(":memory:");
    const i85 = arquivos.findIndex((f) => f.startsWith("0085"));
    assert.ok(i85 > 0, "migração 0085 ausente");
    for (const arq of arquivos.slice(0, i85)) d.exec(readFileSync(join(DIR, arq), "utf8"));
    d.exec(`INSERT INTO dfds (id, numero, total_itens, valor_total) VALUES (1, 'D1', 3, 1000), (2, 'D2', 5, 900), (3, 'D3', 1, 10);
      INSERT INTO dfd_itens (dfd_id, sequencial, quantidade, valor_unitario, valor_total) VALUES
        (1, 1, 2, 100, 200), (1, 2, 3, 33.333, NULL), (1, 3, 1, 50.0049, 50.0049),
        (2, 1, 1, 100, 100), (2, 2, 1, 200, 200),
        (3, 1, NULL, NULL, NULL);`);
    d.exec(readFileSync(join(DIR, arquivos[i85]), "utf8"));
    d.exec(readFileSync(join(DIR, arquivos[i85]), "utf8")); // idempotente
    const t = (id: number) => ({ ...(d.prepare("SELECT total_itens AS n, valor_total AS v FROM dfds WHERE id = ?").get(id) as object) });
    assert.equal((d.prepare("SELECT valor_total AS v FROM dfd_itens WHERE dfd_id = 1 AND sequencial = 2").get() as { v: number }).v, 100);
    assert.deepEqual(t(1), { n: 3, v: 350 }, "0085: 200 + 100 (q × vu) + 50,0049 → 350,00 (o TOTAL GERAL 1.000 sai)");
    const i87 = arquivos.findIndex((f) => f.startsWith("0087"));
    assert.ok(i87 > i85, "migração 0087 ausente");
    for (const arq of arquivos.slice(i85 + 1)) d.exec(readFileSync(join(DIR, arq), "utf8"));
    d.exec(readFileSync(join(DIR, arquivos[i87]), "utf8")); // idempotente
    assert.deepEqual(t(1), { n: 3, v: 350.0049 }, "0087: a soma com 4 casas (a fração do centavo não se perde)");
    assert.deepEqual(t(2), { n: 5, v: 900 }, "2 de 5 itens: o parcial fica (a conferência acusa)");
    assert.deepEqual(t(3), { n: 1, v: null }, "sem valor: NULL, nunca estimado");
  });

  it("0099 responsáveis: os JSON (todos os formatos) viram a planilha + vínculos, a pessoa repetida vira UMA, idempotente", () => {
    const d = new DatabaseSync(":memory:");
    const i99 = arquivos.findIndex((f) => f.startsWith("0099"));
    assert.ok(i99 > 0, "migração 0099 ausente");
    for (const arq of arquivos.slice(0, i99)) d.exec(readFileSync(join(DIR, arq), "utf8"));
    const novo = JSON.stringify({
      padroes: [{ nome: " José Ávila ", matricula: "123", funcao: "Secretário", nomeacao: { tipo: "portaria", numero: "10/2025", link: "https://x/p10" } }, { nome: "" }],
      temporarios: [
        { nome: "Bia Lima", matricula: "", funcao: "Diretora", nomeacao: { tipo: "decreto", numero: "5", link: "" }, inicio: "2026-01-01", fim: "2026-03-31" },
        { nome: "Sem Data", inicio: "", fim: "" },
        { nome: "Invertido", inicio: "2026-05-01", fim: "2026-04-01" },
      ],
    });
    d.exec(`INSERT INTO orgaos (id, nome, sigla, assinatura_unica, responsavel_dfd) VALUES
        (800, 'Órgão Único', 'OU', 1, '${JSON.stringify({ padroes: [{ nome: "JOSE AVILA", matricula: "123", funcao: "Prefeito" }], temporarios: [] })}'),
        (801, 'Órgão Por Unidade', 'OP', 0, 'Texto Solto');
      INSERT INTO reparticoes (id, codigo, nome, orgao_id, responsavel_dfd) VALUES
        (810, 'U1', 'Unidade 1', 801, '${novo}'),
        (811, 'U2', 'Unidade 2', 801, '${JSON.stringify({ padrao: "Carlos", temporarios: [{ nome: "Dani", inicio: "2026-02-01", fim: "2026-02-28", ato: "Portaria 9" }] })}'),
        (812, 'U3', 'Unidade 3', 801, '["", "Eva", "Fábio"]'),
        (813, 'U4', 'Unidade 4', 801, NULL);`);
    d.exec(readFileSync(join(DIR, arquivos[i99]), "utf8"));
    d.exec(readFileSync(join(DIR, arquivos[i99]), "utf8")); // idempotente
    const pessoas = d.prepare("SELECT nome, matricula, chave FROM responsaveis ORDER BY chave").all() as { nome: string; matricula: string; chave: string }[];
    assert.deepEqual(
      pessoas.map((p) => `${p.chave}|${p.matricula}`),
      ["BIA LIMA|", "CARLOS|", "DANI|", "EVA|", "JOSE AVILA|123", "TEXTO SOLTO|"],
      "José da unidade e do órgão = UMA pessoa; sem nome, sem data e invertido ficam de fora",
    );
    const v = d
      .prepare(
        `SELECT p.chave AS c, v.orgao_id AS o, v.reparticao_id AS r, v.tipo AS t, v.funcao AS f, v.ato_tipo AS a, v.ato_numero AS n, v.ato_link AS l, v.inicio AS i, v.fim AS fim
         FROM responsaveis_vinculos v JOIN responsaveis p ON p.id = v.responsavel_id ORDER BY v.orgao_id IS NULL, v.orgao_id, v.reparticao_id, v.tipo, p.chave`,
      )
      .all() as Record<string, unknown>[];
    assert.deepEqual(
      v.map((x) => [x.c, x.o, x.r, x.t, x.f, x.a, x.n, x.l, x.i, x.fim]),
      [
        ["JOSE AVILA", 800, null, "padrao", "Prefeito", null, "", "", null, null],
        ["TEXTO SOLTO", 801, null, "padrao", "", null, "", "", null, null],
        ["JOSE AVILA", null, 810, "padrao", "Secretário", "portaria", "10/2025", "https://x/p10", null, null],
        ["BIA LIMA", null, 810, "temporario", "Diretora", "decreto", "5", "", "2026-01-01", "2026-03-31"],
        ["CARLOS", null, 811, "padrao", "", null, "", "", null, null],
        ["DANI", null, 811, "temporario", "", null, "Portaria 9", "", "2026-02-01", "2026-02-28"],
        ["EVA", null, 812, "padrao", "", null, "", "", null, null],
      ],
    );
    d.exec("PRAGMA foreign_keys = ON");
    d.exec("DELETE FROM reparticoes WHERE id = 810");
    assert.equal((d.prepare("SELECT COUNT(*) AS n FROM responsaveis_vinculos WHERE reparticao_id = 810").get() as { n: number }).n, 0, "cascade");
    assert.throws(() => d.exec("INSERT INTO responsaveis_vinculos (responsavel_id, orgao_id, reparticao_id, tipo) VALUES (1, 800, 811, 'padrao')"), /CHECK/);
    assert.throws(() => d.exec("INSERT INTO responsaveis_vinculos (responsavel_id, orgao_id, tipo) VALUES (1, 800, 'temporario')"), /CHECK/);
  });

  it("0100 responsáveis: as funções viram cargos, o cargo é da PESSOA (pelo padrão), o usuário liga pela matrícula única", () => {
    const d = new DatabaseSync(":memory:");
    const i100 = arquivos.findIndex((f) => f.startsWith("0100"));
    assert.ok(i100 > 0, "migração 0100 ausente");
    for (const arq of arquivos.slice(0, i100)) d.exec(readFileSync(join(DIR, arq), "utf8"));
    d.exec(`INSERT INTO orgaos (id, nome, sigla) VALUES (901, 'Órgão', 'OG');
      INSERT INTO reparticoes (id, codigo, nome, orgao_id) VALUES (911, 'U1', 'Unidade 1', 901), (912, 'U2', 'Unidade 2', 901);
      INSERT INTO cargos (nome, ordem) VALUES ('Secretário', 0);
      INSERT INTO usuarios (id, nome, email, senha_hash, matricula) VALUES (951, 'Ana', 'a@x', 'h', '000123'), (952, 'B1', 'b1@x', 'h', '77');
      INSERT INTO responsaveis (id, nome, chave, matricula) VALUES (921, 'Ana', 'ANA', '123'), (922, 'Bia', 'BIA', '77'), (923, 'Caio', 'CAIO', '077');
      INSERT INTO responsaveis_vinculos (responsavel_id, reparticao_id, tipo, funcao) VALUES
        (921, 911, 'padrao', ' secretário '), (921, 912, 'padrao', 'Secretário'), (922, 911, 'padrao', 'Diretora');
      INSERT INTO responsaveis_vinculos (responsavel_id, reparticao_id, tipo, funcao, inicio, fim) VALUES
        (923, 912, 'temporario', 'diretora', '2026-01-01', '2026-01-31');`);
    d.exec(readFileSync(join(DIR, arquivos[i100]), "utf8"));
    const cargos = (d.prepare("SELECT nome FROM cargos ORDER BY ordem").all() as { nome: string }[]).map((c) => c.nome);
    assert.deepEqual(cargos, ["Secretário", "Diretora"], "a função nova vira cargo; a repetida (sem caixa) não");
    const p = d.prepare("SELECT id, cargo, usuario_id AS u FROM responsaveis ORDER BY id").all() as { id: number; cargo: string; u: number | null }[];
    assert.deepEqual(
      p.map((x) => [x.id, x.cargo, x.u]),
      [
        [921, "Secretário", 951],
        [922, "Diretora", null],
        [923, "", null],
      ],
      "cargo pelo padrão (grafia do cadastro; o temporário não dá cargo à pessoa); matrícula de 2 pessoas não liga",
    );
    const v = d.prepare("SELECT tipo, funcao FROM responsaveis_vinculos ORDER BY id").all() as { tipo: string; funcao: string }[];
    assert.deepEqual(
      v.map((x) => `${x.tipo}:${x.funcao}`),
      ["padrao:", "padrao:", "padrao:", "temporario:Diretora"],
    );
    assert.throws(() => d.exec("UPDATE responsaveis SET usuario_id = 951 WHERE id = 922"), /UNIQUE/, "um usuário em UMA pessoa");
  });

  it("0101 responsáveis: a data da exoneração (NULL = em exercício)", () => {
    const d = new DatabaseSync(":memory:");
    for (const arq of arquivos.filter((f) => f <= "0101~")) d.exec(readFileSync(join(DIR, arq), "utf8"));
    const cols = (d.prepare("PRAGMA table_info(responsaveis)").all() as { name: string }[]).map((c) => c.name);
    assert.ok(cols.includes("exonerado_em"));
    d.exec("INSERT INTO responsaveis (id, nome, chave, matricula) VALUES (1, 'Ana', 'ANA', '1')");
    assert.equal((d.prepare("SELECT exonerado_em AS e FROM responsaveis").get() as { e: string | null }).e, null);
  });

  it("0102 vínculos por visão: os gravados viram o PADRÃO; a mesma unidade em visões diferentes; excluir a visão leva os dela", () => {
    const d = new DatabaseSync(":memory:");
    const i102 = arquivos.findIndex((f) => f.startsWith("0102"));
    assert.ok(i102 > 0, "migração 0102 ausente");
    for (const arq of arquivos.slice(0, i102)) d.exec(readFileSync(join(DIR, arq), "utf8"));
    d.exec(`INSERT INTO orgaos (id, nome, sigla) VALUES (900, 'Órgão X', 'OX');
      INSERT INTO reparticoes (id, codigo, nome, orgao_id) VALUES (901, 'SMS', 'Saúde', 900);
      INSERT INTO orcamento_visoes (id, nome) VALUES (7, 'PCA');
      INSERT INTO orcamento_vinculos (id, tipo, chave, texto, reparticao_id) VALUES (1, 'unidade', 'SAUDE', 'Saúde', 901);`);
    d.exec(readFileSync(join(DIR, arquivos[i102]), "utf8"));
    d.exec("PRAGMA foreign_keys = ON");
    assert.equal((d.prepare("SELECT visao_id AS v FROM orcamento_vinculos WHERE id = 1").get() as { v: number | null }).v, null);
    assert.equal((d.prepare("SELECT vinculos_proprios AS p FROM orcamento_visoes WHERE id = 7").get() as { p: string }).p, "[]");
    d.exec("INSERT INTO orcamento_vinculos (tipo, chave, texto, reparticao_id, visao_id) VALUES ('unidade', 'SAUDE', 'Saúde', 901, 7)");
    assert.throws(() => d.exec("INSERT INTO orcamento_vinculos (tipo, chave, texto, reparticao_id) VALUES ('unidade', 'SAUDE', 'Saúde', 901)"), /UNIQUE/);
    assert.throws(() => d.exec("INSERT INTO orcamento_vinculos (tipo, chave, texto, reparticao_id, visao_id) VALUES ('unidade', 'SAUDE', 'Saúde', 901, 7)"), /UNIQUE/);
    d.exec("DELETE FROM orcamento_visoes WHERE id = 7");
    assert.equal((d.prepare("SELECT COUNT(*) AS n FROM orcamento_vinculos").get() as { n: number }).n, 1, "fica só o padrão");
  });

  it("0103 responsáveis no lugar que vale: unidade de órgão único → órgão (o caso do AMMT); dual por unidade → unidade própria", () => {
    const d = new DatabaseSync(":memory:");
    const i103 = arquivos.findIndex((f) => f.startsWith("0103"));
    assert.ok(i103 > 0, "migração 0103 ausente");
    for (const arq of arquivos.slice(0, i103)) d.exec(readFileSync(join(DIR, arq), "utf8"));
    d.exec(`INSERT INTO orgaos (id, nome, sigla, assinatura_unica) VALUES (3, 'Mobilidade', 'AMMT', 1), (4, 'Dual', 'DUAL', 0), (5, 'Único', 'OU', 1);
      INSERT INTO reparticoes (id, codigo, nome, orgao_id, orgao_proprio) VALUES (30, 'AMMT', 'Mobilidade', 3, 1), (40, 'DUAL', 'Dual', 4, 1), (51, 'A', 'A', 5, 0), (52, 'B', 'B', 5, 0);
      INSERT INTO responsaveis (id, nome, chave, matricula) VALUES (1, 'Welker', 'WELKER', '1'), (2, 'Everaldo', 'EVERALDO', '2'), (3, 'Ana', 'ANA', '3'), (4, 'Bia', 'BIA', '4');
      INSERT INTO responsaveis_vinculos (id, responsavel_id, orgao_id, reparticao_id, tipo, funcao, inicio, fim) VALUES
        (1, 1, 3, NULL, 'padrao', '', '2026-02-27', NULL),
        (2, 2, NULL, 30, 'temporario', 'Presidente', '2026-08-20', '2026-09-18'),
        (3, 2, NULL, 30, 'temporario', 'Presidente', '2026-09-19', '2026-09-28'),
        (4, 1, NULL, 30, 'padrao', '', '2026-03-01', NULL),
        (5, 3, 4, NULL, 'padrao', '', '2026-01-01', NULL),
        (6, 4, NULL, 51, 'padrao', '', '2026-01-01', NULL),
        (7, 4, NULL, 52, 'padrao', '', '2026-01-01', NULL);`);
    d.exec(readFileSync(join(DIR, arquivos[i103]), "utf8"));
    const onde = (id: number) => d.prepare("SELECT orgao_id AS o, reparticao_id AS r FROM responsaveis_vinculos WHERE id = ?").get(id) as { o: number | null; r: number | null } | undefined;
    assert.deepEqual({ ...onde(2) }, { o: 3, r: null }, "Everaldo vai ao órgão AMMT");
    assert.deepEqual({ ...onde(3) }, { o: 3, r: null });
    assert.deepEqual({ ...onde(4) }, { o: null, r: 30 }, "cruza com o padrão do Welker no órgão: fica para revisar");
    assert.deepEqual({ ...onde(5) }, { o: null, r: 40 }, "dual por unidade: o do órgão vai à unidade própria");
    assert.deepEqual({ ...onde(6) }, { o: 5, r: null });
    assert.equal(onde(7), undefined, "o repetido em outra unidade do mesmo órgão sai");
    const antes = d.prepare("SELECT id, orgao_id, reparticao_id FROM responsaveis_vinculos ORDER BY id").all();
    d.exec(readFileSync(join(DIR, arquivos[i103]), "utf8"));
    assert.deepEqual(d.prepare("SELECT id, orgao_id, reparticao_id FROM responsaveis_vinculos ORDER BY id").all(), antes, "idempotente");
  });

  it("0078 toda unidade tem órgão: apaga as sem órgão (menos a Geral) e solta os vínculos", () => {
    const d = new DatabaseSync(":memory:");
    const i78 = arquivos.findIndex((f) => f.startsWith("0078"));
    assert.ok(i78 > 0, "migração 0078 ausente");
    for (const arq of arquivos.slice(0, i78)) d.exec(readFileSync(join(DIR, arq), "utf8"));
    d.exec(`INSERT INTO orgaos (id, nome, sigla) VALUES (900, 'Órgão X', 'OX');
      INSERT INTO reparticoes (id, codigo, nome, orgao_id) VALUES (901, 'COM', 'Com órgão', 900), (902, 'SEM', 'Sem órgão', NULL);
      INSERT INTO dfds (id, numero, reparticao_id) VALUES (9001, 'D9001', 902);`);
    d.exec(readFileSync(join(DIR, arquivos[i78]), "utf8"));
    const ids = (d.prepare("SELECT id, codigo FROM reparticoes ORDER BY id").all() as { id: number; codigo: string }[]).map((r) => r.codigo);
    assert.ok(ids.includes("COM"));
    assert.ok(!ids.includes("SEM"), "a unidade sem órgão sai");
    assert.ok(ids.some((c) => c.toUpperCase() === "GERAL"), "a Geral fica");
    assert.equal((d.prepare("SELECT reparticao_id AS r FROM dfds WHERE id = 9001").get() as { r: number | null }).r, null);
  });

  it("0079 vínculos do orçamento: só por unidade (o de órgão sai) + as ações de fora", () => {
    const d = new DatabaseSync(":memory:");
    const i79 = arquivos.findIndex((f) => f.startsWith("0079"));
    assert.ok(i79 > 0, "migração 0079 ausente");
    for (const arq of arquivos.slice(0, i79)) d.exec(readFileSync(join(DIR, arq), "utf8"));
    d.exec(`INSERT INTO orcamento_vinculos (tipo, chave, texto) VALUES ('orgao', 'A', 'A'), ('unidade', 'B', 'B');`);
    d.exec(readFileSync(join(DIR, arquivos[i79]), "utf8"));
    const linhas = d.prepare("SELECT tipo, chave, acoes_fora AS f FROM orcamento_vinculos").all() as { tipo: string; chave: string; f: string | null }[];
    assert.deepEqual(linhas.map((l) => [l.tipo, l.chave, l.f]), [["unidade", "B", null]]);
  });

  it("0080 vínculos criados: uma unidade do CUBO em várias cadastradas, os de hoje viram 'as demais' sem perder as de fora", () => {
    const d = new DatabaseSync(":memory:");
    const i80 = arquivos.findIndex((f) => f.startsWith("0080"));
    assert.ok(i80 > 0, "migração 0080 ausente");
    for (const arq of arquivos.slice(0, i80)) d.exec(readFileSync(join(DIR, arq), "utf8"));
    d.exec(`INSERT INTO orgaos (id, nome, sigla) VALUES (950, 'Órgão', 'OR');
      INSERT INTO reparticoes (id, codigo, nome, orgao_id) VALUES (951, 'U1', 'Um', 950), (952, 'U2', 'Dois', 950);
      INSERT INTO orcamento_vinculos (tipo, chave, texto, reparticao_id, acoes_fora) VALUES
        ('unidade', 'B', 'B', 951, '["Z"]'), ('unidade', 'C', 'C', NULL, NULL);`);
    d.exec(readFileSync(join(DIR, arquivos[i80]), "utf8"));
    const linhas = d.prepare("SELECT chave, reparticao_id AS r, acoes AS a, acoes_fora AS f FROM orcamento_vinculos").all() as { chave: string; r: number; a: string | null; f: string | null }[];
    assert.deepEqual(linhas.map((l) => [l.chave, l.r, l.a, l.f]), [["B", 951, null, '["Z"]']], "o vínculo segue igual; o texto sem unidade sai");
    d.exec(`INSERT INTO orcamento_vinculos (tipo, chave, texto, reparticao_id, acoes) VALUES ('unidade', 'B', 'B', 952, '["Z"]')`);
    assert.throws(() => d.exec(`INSERT INTO orcamento_vinculos (tipo, chave, texto, reparticao_id) VALUES ('unidade', 'B', 'B', 952)`), "a mesma unidade cadastrada duas vezes");
  });

  it("0081 vínculos limpos: sem unidade saem; excluir a unidade cadastrada apaga os vínculos dela", () => {
    const d = new DatabaseSync(":memory:");
    const i81 = arquivos.findIndex((f) => f.startsWith("0081"));
    assert.ok(i81 > 0, "migração 0081 ausente");
    for (const arq of arquivos.slice(0, i81)) d.exec(readFileSync(join(DIR, arq), "utf8"));
    d.exec("PRAGMA foreign_keys = ON");
    d.exec(`INSERT INTO orgaos (id, nome, sigla) VALUES (960, 'Órgão', 'OR');
      INSERT INTO reparticoes (id, codigo, nome, orgao_id) VALUES (961, 'U1', 'Um', 960), (962, 'U2', 'Dois', 960);
      INSERT INTO orcamento_vinculos (tipo, chave, texto, reparticao_id) VALUES ('unidade', 'A', 'A', 961), ('unidade', 'A', 'A', 962), ('unidade', 'B', 'B', NULL);`);
    d.exec(readFileSync(join(DIR, arquivos[i81]), "utf8"));
    const resto = () => (d.prepare("SELECT reparticao_id AS r FROM orcamento_vinculos ORDER BY id").all() as { r: number | null }[]).map((x) => x.r);
    assert.deepEqual(resto(), [961, 962], "o sem unidade saiu");
    d.exec("DELETE FROM reparticoes WHERE id = 961");
    assert.deepEqual(resto(), [962], "o vínculo da unidade excluída saiu (não ficou NULL)");
  });

  it("0082 visões sem as dimensões do vínculo: unidade/ação/órgão saem dos filtros, o resto fica", () => {
    const d = new DatabaseSync(":memory:");
    const i82 = arquivos.findIndex((f) => f.startsWith("0082"));
    assert.ok(i82 > 0, "migração 0082 ausente");
    for (const arq of arquivos.slice(0, i82)) d.exec(readFileSync(join(DIR, arq), "utf8"));
    d.exec(`INSERT INTO orcamento_visoes (id, nome, filtros) VALUES
      (1, 'Mista', '{"unidade":["SEMED"],"acao":["2191"],"fonte":["100"],"orgaoSistema":["FME"]}'),
      (2, 'Só fonte', '{"fonte":["150"]}'),
      (3, 'Quebrada', 'lixo');`);
    d.exec(readFileSync(join(DIR, arquivos[i82]), "utf8"));
    const f = (id: number) => (d.prepare("SELECT filtros FROM orcamento_visoes WHERE id = ?").get(id) as { filtros: string }).filtros;
    assert.deepEqual(JSON.parse(f(1)), { fonte: ["100"] });
    assert.deepEqual(JSON.parse(f(2)), { fonte: ["150"] });
    assert.equal(f(3), "{}");
  });

  it("índice único de e-mail existe", () => {
    const idx = nomes(db, "SELECT name FROM sqlite_master WHERE type='index'");
    assert.ok(idx.includes("usuarios_email_uq"));
  });
});
