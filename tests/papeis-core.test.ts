import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { ABA_KEYS } from "../src/lib/abas.ts";
import {
  ACOES_PAPEL,
  acoesDaTela,
  alternarCelula,
  alternarColuna,
  alternarLinha,
  aplicavel,
  CAPACIDADES_MEMBRO,
  CATALOGO_PAPEIS,
  capacidadesEfetivas,
  capacidadesTudo,
  coerceCapacidades,
  diffCapacidades,
  estadoColuna,
  estadoLinha,
  MODELOS_PAPEL,
  mensagemSemPermissao,
  mensagemTelaFechada,
  motivoSemModulos,
  PAPEIS_SISTEMA,
  PODE_MESA_NADA,
  PODE_NADA,
  PODE_TUDO,
  papelSistema,
  podeNaTela,
  podeNoRecurso,
  resumoCapacidades,
  retiraAlgo,
  telasFechadasPeloPapel,
  textoResumoCapacidades,
  roleEspelho,
  telaDoRecurso,
  telasAbertas,
  textoDiffCapacidades,
} from "../src/lib/papeis-core.ts";

const TODAS_ABAS = [...ABA_KEYS];

describe("catálogo de ações por tela", () => {
  it("toda tela do sistema está no catálogo, com Visualizar", () => {
    for (const t of ABA_KEYS) {
      assert.ok(CATALOGO_PAPEIS[t], t);
      assert.equal(aplicavel(t, "visualizar"), true, t);
    }
  });

  it("o que não se aplica: Manipular no Orçamento e Configurar no Calendário", () => {
    assert.equal(aplicavel("orcamento", "manipular"), false);
    assert.equal(aplicavel("calendario", "configurar"), false);
    assert.deepEqual(acoesDaTela("dfd"), [...ACOES_PAPEL]);
    assert.deepEqual(acoesDaTela("orcamento"), ["visualizar", "importar", "exportar", "excluir", "configurar"]);
    assert.deepEqual(acoesDaTela("calendario"), ["visualizar", "manipular", "importar", "exportar", "excluir"]);
  });
});

describe("coerceCapacidades", () => {
  it("qualquer valor estranho vira vazio", () => {
    for (const x of [null, undefined, 1, "x", [], [["dfd"]]]) assert.deepEqual(coerceCapacidades(x), {});
  });

  it("descarta tela/ação desconhecida e ação que não se aplica; sem repetir; na ordem da matriz", () => {
    assert.deepEqual(
      coerceCapacidades({ xyz: ["visualizar"], dfd: ["excluir", "visualizar", "excluir", "voar"], orcamento: ["manipular"], calendario: "tudo" }),
      { dfd: ["visualizar", "excluir"] },
    );
  });

  it("qualquer ação liga o Visualizar (a tela precisa estar aberta)", () => {
    assert.deepEqual(coerceCapacidades({ pca: ["importar"] }), { pca: ["visualizar", "importar"] });
  });

  it("idempotente", () => {
    const uma = coerceCapacidades({ tarefas: ["configurar", "manipular"], dfd: ["exportar"] });
    assert.deepEqual(coerceCapacidades(uma), uma);
    assert.deepEqual(Object.keys(uma), ["dfd", "tarefas"]);
  });
});

describe("acesso efetivo = grupo libera E papel visualiza", () => {
  const membro = { admin: false, capacidades: CAPACIDADES_MEMBRO, abas: TODAS_ABAS };

  it("o Administrador pode tudo em todas as telas, mesmo sem grupo (regra firme)", () => {
    for (const t of ABA_KEYS) assert.deepEqual(podeNaTela({ admin: true, capacidades: {}, abas: [] }, t), PODE_TUDO);
    assert.deepEqual(telasAbertas({ admin: true, capacidades: {}, abas: [] }), TODAS_ABAS);
  });

  it("o grupo não libera a tela ⇒ fechada, qualquer que seja o papel", () => {
    assert.deepEqual(podeNaTela({ admin: false, capacidades: capacidadesTudo(), abas: ["pca"] }, "dfd"), PODE_NADA);
  });

  it("o papel sem Visualizar ⇒ fechada, mesmo com o grupo liberando", () => {
    assert.deepEqual(podeNaTela({ admin: false, capacidades: { pca: ["visualizar"] }, abas: ["dfd", "pca"] }, "dfd"), PODE_NADA);
    assert.deepEqual(telasAbertas({ admin: false, capacidades: { pca: ["visualizar"] }, abas: ["dfd", "pca"] }), ["pca"]);
  });

  it("capacidade gravada sem Visualizar (dado antigo/manual) não abre a tela", () => {
    assert.deepEqual(podeNaTela({ admin: false, capacidades: { dfd: ["excluir"] }, abas: ["dfd"] }, "dfd"), PODE_NADA);
  });

  it("uma ação que não se aplica nunca vale", () => {
    const p = podeNaTela({ admin: false, capacidades: { orcamento: ["visualizar", "manipular"] }, abas: ["orcamento"] }, "orcamento");
    assert.equal(p.visualizar, true);
    assert.equal(p.manipular, false);
  });

  it("aceita as telas do grupo como Set", () => {
    assert.equal(podeNaTela({ ...membro, abas: new Set(["tarefas"]) }, "tarefas").manipular, true);
  });

  it("telas abertas seguem a ordem da navegação", () => {
    assert.deepEqual(telasAbertas({ admin: false, capacidades: capacidadesTudo(), abas: ["calendario", "dfd", "tarefas"] }), ["dfd", "tarefas", "calendario"]);
  });
});

describe("papéis do sistema reproduzem as guardas de antes", () => {
  const pode = (chave: string, tela: (typeof ABA_KEYS)[number]) =>
    podeNaTela({ admin: chave === "admin", capacidades: papelSistema(chave)?.capacidades ?? {}, abas: TODAS_ABAS }, tela);

  it("3 papéis, chaves únicas, só o Membro é o padrão de cadastro", () => {
    assert.deepEqual(
      PAPEIS_SISTEMA.map((p) => p.chave),
      ["admin", "gestor", "membro"],
    );
    assert.deepEqual(
      PAPEIS_SISTEMA.filter((p) => p.padraoCadastro).map((p) => p.chave),
      ["membro"],
    );
  });

  it("Gestor (o antigo 'editor'): tudo o que se aplica, em todas as telas", () => {
    for (const t of ABA_KEYS) for (const a of acoesDaTela(t)) assert.equal(pode("gestor", t)[a], true, `${t}.${a}`);
  });

  it("Membro: consulta e exporta Mesa/PCA/Catálogo/Orçamento, sem editar, importar, excluir nem configurar", () => {
    for (const t of ["dfd", "pca", "catalogo", "orcamento"] as const) {
      const p = pode("membro", t);
      assert.equal(p.visualizar && p.exportar, true, t);
      assert.equal(p.manipular || p.importar || p.excluir || p.configurar, false, t);
    }
  });

  it("Membro: trabalha nas tarefas (sem excluir, importar do Trello nem configurar quadro)", () => {
    const p = pode("membro", "tarefas");
    assert.deepEqual([p.visualizar, p.manipular, p.exportar], [true, true, true]);
    assert.deepEqual([p.importar, p.excluir, p.configurar], [false, false, false]);
  });

  it("Membro: no Calendário cria/edita, assina agendas externas e exporta — não exclui tarefa", () => {
    const p = pode("membro", "calendario");
    assert.deepEqual([p.visualizar, p.manipular, p.importar, p.exportar, p.excluir], [true, true, true, true, false]);
  });

  it("papel desconhecido = nenhum papel do sistema", () => {
    assert.equal(papelSistema("xyz"), null);
    assert.equal(papelSistema(null), null);
  });

  it("o role espelho só distingue os papéis do sistema (o customizado = membro)", () => {
    assert.equal(roleEspelho("admin"), "admin");
    assert.equal(roleEspelho("gestor"), "gestor");
    assert.equal(roleEspelho("membro"), "membro");
    assert.equal(roleEspelho(null), "membro");
    assert.equal(roleEspelho("xyz"), "membro");
  });

  it("modelos do editor: consulta = só Visualizar em tudo; tudo = o Gestor; nada = vazio", () => {
    const m = Object.fromEntries(MODELOS_PAPEL.map((x) => [x.id, x.capacidades]));
    for (const t of ABA_KEYS) assert.deepEqual(coerceCapacidades(m.consulta)[t], ["visualizar"]);
    assert.deepEqual(m.tudo, capacidadesTudo());
    assert.deepEqual(m.membro, CAPACIDADES_MEMBRO);
    assert.deepEqual(m.nada, {});
  });
});

describe("edição da matriz com as implicações", () => {
  it("ligar uma ação liga o Visualizar", () => {
    assert.deepEqual(alternarCelula({}, "catalogo", "importar", true), { catalogo: ["visualizar", "importar"] });
  });

  it("desligar o Visualizar fecha a tela (tira todas as ações)", () => {
    assert.deepEqual(alternarCelula({ dfd: ["visualizar", "manipular", "excluir"] }, "dfd", "visualizar", false), {});
  });

  it("desligar outra ação mantém o Visualizar", () => {
    assert.deepEqual(alternarCelula({ dfd: ["visualizar", "excluir"] }, "dfd", "excluir", false), { dfd: ["visualizar"] });
  });

  it("uma ação que não se aplica não muda nada", () => {
    assert.deepEqual(alternarCelula({ pca: ["visualizar"] }, "orcamento", "manipular", true), { pca: ["visualizar"] });
  });

  it("linha: tudo o que se aplica / fecha", () => {
    assert.deepEqual(alternarLinha({}, "orcamento", true), { orcamento: acoesDaTela("orcamento") });
    assert.deepEqual(alternarLinha({ orcamento: ["visualizar"] }, "orcamento", false), {});
  });

  it("coluna: em todas as telas em que se aplica (com Visualizar); desligar Visualizar fecha tudo", () => {
    const c = alternarColuna({}, "configurar", true);
    assert.equal(c.calendario, undefined);
    for (const t of ABA_KEYS.filter((x) => x !== "calendario")) assert.deepEqual(c[t], ["visualizar", "configurar"], t);
    assert.deepEqual(alternarColuna(capacidadesTudo(), "visualizar", false), {});
  });

  it("estado da linha e da coluna (a caixa de marcar tudo)", () => {
    assert.equal(estadoLinha({}, "dfd"), "nenhuma");
    assert.equal(estadoLinha({ dfd: ["visualizar"] }, "dfd"), "algumas");
    assert.equal(estadoLinha(capacidadesTudo(), "calendario"), "todas");
    assert.equal(estadoColuna(capacidadesTudo(), "configurar"), "todas");
    assert.equal(estadoColuna(CAPACIDADES_MEMBRO, "manipular"), "algumas");
    assert.equal(estadoColuna(CAPACIDADES_MEMBRO, "configurar"), "nenhuma");
  });
});

describe("diferenças e resumo", () => {
  it("diff por tela, na ordem da navegação, e o texto do histórico", () => {
    const d = diffCapacidades({ dfd: ["visualizar", "excluir"], pca: ["visualizar"] }, { dfd: ["visualizar", "importar"], tarefas: ["visualizar"] });
    assert.deepEqual(d, [
      { tela: "dfd", ganhou: ["importar"], perdeu: ["excluir"] },
      { tela: "pca", ganhou: [], perdeu: ["visualizar"] },
      { tela: "tarefas", ganhou: ["visualizar"], perdeu: [] },
    ]);
    assert.equal(textoDiffCapacidades(d), "Mesa: +Importar −Excluir; PCA: −Visualizar; Tarefas: +Visualizar");
    assert.equal(retiraAlgo(d), true);
    assert.equal(retiraAlgo(diffCapacidades({}, { dfd: ["visualizar"] })), false);
    assert.deepEqual(diffCapacidades(CAPACIDADES_MEMBRO, CAPACIDADES_MEMBRO), []);
  });

  it("resumo: só as telas abertas, marcando a tela completa", () => {
    assert.deepEqual(resumoCapacidades({ calendario: acoesDaTela("calendario"), dfd: ["visualizar"] }), [
      { tela: "dfd", rotulo: "Mesa", acoes: ["visualizar"], tudo: false },
      { tela: "calendario", rotulo: "Calendário", acoes: acoesDaTela("calendario"), tudo: true },
    ]);
  });
});

describe("mensagens", () => {
  it("recusa e tela fechada com a preposição certa", () => {
    assert.equal(mensagemSemPermissao("dfd", "importar"), "Seu papel não permite importar na Mesa.");
    assert.equal(mensagemSemPermissao("tarefas", "excluir"), "Seu papel não permite excluir em Tarefas.");
    assert.equal(mensagemSemPermissao("pca", "manipular"), "Seu papel não permite editar no PCA.");
    assert.match(mensagemTelaFechada("orcamento"), /^Você não tem acesso ao Orçamento/);
    assert.match(mensagemTelaFechada("dfd"), /^Você não tem acesso à Mesa/);
  });

  it("por que a pessoa não abre nenhuma tela", () => {
    const base = { admin: false, temGrupo: true, abasDoGrupo: ["dfd"], capacidades: CAPACIDADES_MEMBRO };
    assert.equal(motivoSemModulos({ ...base, admin: true, temGrupo: false }), null);
    assert.match(motivoSemModulos({ ...base, temGrupo: false }) ?? "", /nenhum grupo/);
    assert.match(motivoSemModulos({ ...base, abasDoGrupo: [] }) ?? "", /não libera nenhuma tela/);
    assert.match(motivoSemModulos({ ...base, abasDoGrupo: ["nao-existe"] }) ?? "", /não libera nenhuma tela/);
    assert.match(motivoSemModulos({ ...base, capacidades: { pca: ["visualizar"] } }) ?? "", /Seu papel não permite visualizar/);
    assert.equal(motivoSemModulos(base), null);
  });
});

describe("as duas Mesas — cada recurso segue a Mesa em que está", () => {
  it("protocolo num PCA (enviado ou incorporado) é da Mesa do PCA; fora dele, da Mesa do sistema", () => {
    assert.equal(telaDoRecurso(7), "pca");
    assert.equal(telaDoRecurso(null), "dfd");
    assert.equal(telaDoRecurso(undefined), "dfd");
  });

  it("o papel de cada Mesa vale só nos recursos dela", () => {
    const ctx = { admin: false, capacidades: coerceCapacidades({ dfd: ["visualizar", "manipular"], pca: ["visualizar"] }), abas: ["dfd", "pca"] };
    const pode = { sistema: podeNaTela(ctx, "dfd"), pca: podeNaTela(ctx, "pca"), vis: PODE_MESA_NADA.vis };
    assert.equal(podeNoRecurso(pode, null).manipular, true);
    assert.equal(podeNoRecurso(pode, 3).manipular, false);
    assert.equal(podeNoRecurso(pode, 3).visualizar, true);
    assert.deepEqual(podeNoRecurso(PODE_MESA_NADA, null), PODE_NADA);
  });
});

describe("o acesso EFETIVO de uma pessoa num grupo (\"Ver acesso\" em Usuários)", () => {
  const membro = { admin: false, capacidades: CAPACIDADES_MEMBRO };

  it("só as telas que o grupo libera E o papel visualiza, com as ações do papel nelas", () => {
    const efetivo = capacidadesEfetivas({ ...membro, abas: ["dfd", "tarefas", "orcamento"] });
    assert.deepEqual(efetivo, { dfd: ["visualizar", "exportar"], orcamento: ["visualizar", "exportar"], tarefas: ["visualizar", "manipular", "exportar"] });
    // O mesmo que podeNaTela diz, tela a tela.
    for (const tela of ABA_KEYS) {
      const pode = podeNaTela({ ...membro, abas: ["dfd", "tarefas", "orcamento"] }, tela);
      assert.deepEqual(efetivo[tela] ?? [], pode.visualizar ? ACOES_PAPEL.filter((a) => pode[a]) : []);
    }
  });

  it("sem grupo (nenhuma tela liberada) = nada; o ADM = tudo o que se aplica, sem as ações que não se aplicam", () => {
    assert.deepEqual(capacidadesEfetivas({ ...membro, abas: [] }), {});
    assert.deepEqual(capacidadesEfetivas({ admin: true, capacidades: {}, abas: [] }), capacidadesTudo());
    assert.equal(capacidadesEfetivas({ admin: true, capacidades: {}, abas: [] }).orcamento?.includes("manipular"), false);
  });

  it("aponta as telas que o grupo libera mas o papel deixa fechadas (nunca para o ADM)", () => {
    const consulta = { admin: false, capacidades: coerceCapacidades({ dfd: ["visualizar"] }) };
    assert.deepEqual(telasFechadasPeloPapel({ ...consulta, abas: ["dfd", "pca", "catalogo"] }), ["pca", "catalogo"]);
    assert.deepEqual(telasFechadasPeloPapel({ ...consulta, abas: ["dfd"] }), []);
    assert.deepEqual(telasFechadasPeloPapel({ admin: true, capacidades: {}, abas: ["dfd", "pca"] }), []);
  });

  it("o resumo numa linha: \"tudo\" quando a tela tem todas as ações; sem telas, diz", () => {
    assert.equal(textoResumoCapacidades({}), "nenhuma tela");
    assert.equal(textoResumoCapacidades(coerceCapacidades({ dfd: acoesDaTela("dfd"), pca: ["exportar"] })), "Mesa: tudo; PCA: Visualizar, Exportar");
  });
});
