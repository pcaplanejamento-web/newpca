"use client";

import { useCallback, useEffect, useState } from "react";
import { ABA_KEYS, type AbaKey } from "@/lib/abas";
import { idDoNome, MAX_MODULOS, MAX_NOME_MODULO, type Modulo, rotuloAba, telasSemModulo } from "@/lib/modulos-core";
import { chamarPadronizacao as chamar } from "@/lib/padronizacao-cliente";
import { Ajuda, TopicoAjuda } from "./Ajuda";
import { Button } from "./Button";
import { Callout } from "./Callout";
import { ChipsIcone } from "./ChipsIcone";
import { useConfirmacao } from "./Confirmacao";
import { ErroCarga } from "./ErroCarga";
import { TextField } from "./Field";
import { IconArrowDown, IconArrowUp, IconInfo, IconPlus, IconSave, IconTrash } from "./icons";
import { NAV_MODULOS } from "./navModulos";
import { SkeletonLinhas } from "./Skeleton";
import { toast } from "./Toast";

const TELAS = NAV_MODULOS.map((m) => ({ value: m.aba, label: m.label, Icone: m.Icon, cor: "var(--accent)" }));
const naOrdem = (l: readonly AbaKey[]) => ABA_KEYS.filter((t) => l.includes(t));

/**
 * Configurações → MÓDULOS (ADM): o ADM agrupa as TELAS em módulos (nome + telas, na ordem). O menu mostra uma seção por
 * módulo e os GRUPOS liberam módulos — mudar as telas de um módulo muda o acesso de todos os grupos que o usam. Uma tela
 * fica em UM módulo (marcá-la num módulo a tira do outro).
 */
export function ModulosAdmin() {
  const [lista, setLista] = useState<Modulo[] | null>(null);
  const [salvo, setSalvo] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);
  const { confirmar, confirmacao } = useConfirmacao();
  const carregar = useCallback(() => {
    chamar<{ modulos: Modulo[] }>("/api/admin/modulos")
      .then((j) => {
        setLista(j.modulos);
        setSalvo(JSON.stringify(j.modulos));
        setErro(null);
      })
      .catch((e) => setErro((e as Error).message));
  }, []);
  useEffect(carregar, [carregar]);
  if (erro && !lista) return <ErroCarga msg={erro} onTentar={carregar} />;
  if (!lista) return <SkeletonLinhas linhas={4} />;

  const mudou = JSON.stringify(lista) !== salvo;
  const sem = telasSemModulo(lista);
  const vazioNome = lista.some((m) => !m.nome.trim());
  const mudar = (i: number, patch: Partial<Modulo>) => setLista(lista.map((m, j) => (j === i ? { ...m, ...patch } : m)));
  const alternar = (i: number, t: AbaKey, ligado: boolean) =>
    setLista(
      lista.map((m, j) =>
        j === i ? { ...m, telas: naOrdem(ligado ? [...m.telas, t] : m.telas.filter((x) => x !== t)) } : ligado ? { ...m, telas: m.telas.filter((x) => x !== t) } : m,
      ),
    );
  const mover = (i: number, d: -1 | 1) => {
    const l = [...lista];
    [l[i], l[i + d]] = [l[i + d], l[i]];
    setLista(l);
  };
  const novo = () => {
    const nome = `Módulo ${lista.length + 1}`;
    setLista([...lista, { id: idDoNome(nome, new Set(lista.map((m) => m.id))), nome, telas: [] }]);
  };
  const excluir = async (i: number) => {
    const m = lista[i];
    if (m.telas.length && !(await confirmar({ titulo: `Excluir o módulo “${m.nome}”?`, texto: `As telas dele (${m.telas.map(rotuloAba).join(", ")}) ficam sem módulo — os grupos que o liberam deixam de abri-las.`, confirmar: "Excluir", perigo: true })))
      return;
    setLista(lista.filter((_, j) => j !== i));
  };
  const salvar = async () => {
    setSalvando(true);
    try {
      const j = await chamar<{ modulos: Modulo[] }>("/api/admin/modulos", "PATCH", { modulos: lista.map((m) => ({ ...m, nome: m.nome.trim() })) });
      setLista(j.modulos);
      setSalvo(JSON.stringify(j.modulos));
      toast.success("Módulos salvos — o menu e o acesso dos grupos mudam ao abrir ou recarregar as telas.");
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setSalvando(false);
    }
  };

  return (
    <div className="space-y-[var(--gap-block)]">
      <div className="flex flex-wrap items-center gap-2">
        <p className="flex-1 text-[15px] font-semibold text-text">Módulos e telas</p>
        <Ajuda titulo="Módulos">
          <TopicoAjuda titulo="O que é um módulo">
            Um conjunto de telas com um nome. O menu lateral mostra uma seção por módulo, na ordem daqui; no celular, a barra
            inferior segue a mesma ordem.
          </TopicoAjuda>
          <TopicoAjuda titulo="Grupos">
            Cada grupo libera MÓDULOS (Administração → Grupos): as telas vêm deles. Mudar as telas de um módulo muda, na hora,
            o acesso de todos os grupos que o liberam. O papel de cada pessoa continua decidindo o que ela faz em cada tela.
          </TopicoAjuda>
          <TopicoAjuda titulo="Uma tela, um módulo">
            Marcar uma tela num módulo a tira do outro. A tela sem módulo não abre para ninguém além do Administrador.
          </TopicoAjuda>
        </Ajuda>
        <Button size="sm" variant="secondary" icon={<IconPlus className="h-4 w-4" />} onClick={novo} disabled={lista.length >= MAX_MODULOS}>
          Novo módulo
        </Button>
        <Button size="sm" icon={<IconSave className="h-4 w-4" />} onClick={salvar} loading={salvando} disabled={!mudou || vazioNome}>
          Salvar
        </Button>
      </div>
      {sem.length > 0 && (
        <Callout kind="warn" icon={<IconInfo className="h-4 w-4" />}>
          Sem módulo: {sem.map(rotuloAba).join(", ")} — só o Administrador abre {sem.length === 1 ? "essa tela" : "essas telas"}.
        </Callout>
      )}
      <ul className="space-y-[var(--gap-block)]">
        {lista.map((m, i) => (
          <li key={m.id} className="space-y-2 rounded-card border border-border bg-surface p-[var(--pad-card)] shadow-ring">
            <div className="flex items-end gap-1">
              <div className="min-w-0 flex-1">
                <TextField label="Nome do módulo" value={m.nome} maxLength={MAX_NOME_MODULO} onChange={(e) => mudar(i, { nome: e.target.value })} error={m.nome.trim() ? undefined : "Informe o nome."} denso />
              </div>
              <Button variant="ghost" size="xs" onClick={() => mover(i, -1)} disabled={i === 0} aria-label={`Mover ${m.nome} para cima`} icon={<IconArrowUp className="h-4 w-4" />} />
              <Button variant="ghost" size="xs" onClick={() => mover(i, 1)} disabled={i === lista.length - 1} aria-label={`Mover ${m.nome} para baixo`} icon={<IconArrowDown className="h-4 w-4" />} />
              <Button variant="ghost" size="xs" onClick={() => excluir(i)} disabled={lista.length === 1} aria-label={`Excluir ${m.nome}`} icon={<IconTrash className="h-4 w-4" />} />
            </div>
            <ChipsIcone ariaLabel={`Telas do módulo ${m.nome}`} itens={TELAS} ligados={m.telas} onAlternar={(t, ligado) => alternar(i, t, ligado)} />
          </li>
        ))}
      </ul>
      {confirmacao}
    </div>
  );
}
