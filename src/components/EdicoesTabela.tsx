"use client";

import { useMemo, useState } from "react";
import { chavePadrao, type EdicaoTabela, edicaoInicial, edicoesDaChave, idPadrao } from "@/lib/edicoes-tabela-core";
import { Button } from "./Button";
import { Checkbox, SelectField, TextField } from "./Field";
import { IconEstrela, IconPencil, IconTrash } from "./icons";
import { Modal } from "./Modal";
import { Segmented } from "./Segmented";

async function chamar(url: string, method: string, body?: unknown): Promise<{ id?: number }> {
  const r = await fetch(url, {
    method,
    headers: { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  }).catch(() => null);
  const j = (await r?.json().catch(() => null)) as { ok?: boolean; error?: string; id?: number } | null;
  if (!r?.ok || !j?.ok) throw new Error(j?.error ?? "Não foi possível concluir. Tente de novo.");
  return j;
}

/**
 * EDIÇÕES SALVAS de uma tabela (`chave`): as do usuário e as PÚBLICAS, a ESCOLHIDA agora (abre na PADRÃO dele — senão no
 * padrão do sistema) e as ações — escolher, definir como padrão, salvar (nova ou atualizar a própria; só para mim ou
 * pública) e excluir a própria. Chama `POST/PATCH/DELETE /api/tabela/edicoes` e guarda a padrão em
 * `/api/preferencias/tabela` (`padrao:<chave>`). Erros LANÇAM (a tela mostra no aviso flutuante).
 */
export function useEdicoesTabela(chave: string, edicoes: EdicaoTabela[], padroes: Record<string, unknown>) {
  const [lista, setLista] = useState(edicoes);
  const [prefs, setPrefs] = useState(padroes);
  const [escolhas, setEscolhas] = useState<Record<string, number | null>>({});
  const [gravando, setGravando] = useState(false);
  const { minhas, publicas } = useMemo(() => edicoesDaChave(lista, chave), [lista, chave]);
  const escolhida = chave in escolhas ? escolhas[chave] : (edicaoInicial(lista, prefs, chave)?.id ?? null);
  const atual = [...minhas, ...publicas].find((e) => e.id === escolhida) ?? null;
  const padraoId = idPadrao(prefs, chave);

  const gravar = async <T,>(f: () => Promise<T>): Promise<T> => {
    setGravando(true);
    try {
      return await f();
    } finally {
      setGravando(false);
    }
  };
  const escolher = (id: number | null) => setEscolhas((e) => ({ ...e, [chave]: id }));
  const definirPadrao = (id: number | null) =>
    gravar(async () => {
      const k = chavePadrao(chave);
      await chamar("/api/preferencias/tabela", id == null ? "DELETE" : "PUT", id == null ? { chave: k } : { chave: k, valor: { id } });
      setPrefs((p) => {
        const { [k]: _, ...resto } = p;
        return id == null ? resto : { ...resto, [k]: { id } };
      });
    });
  const excluir = (e: EdicaoTabela) =>
    gravar(async () => {
      await chamar(`/api/tabela/edicoes/${e.id}`, "DELETE");
      setLista((l) => l.filter((x) => x.id !== e.id));
      escolher(null);
    });
  const salvar = (d: { nome: string; publico: boolean; valor: Record<string, unknown>; atualizar: boolean; padrao: boolean }) =>
    gravar(async () => {
      let id: number;
      if (d.atualizar && atual?.minha) {
        id = atual.id;
        await chamar(`/api/tabela/edicoes/${id}`, "PATCH", { nome: d.nome, publico: d.publico, valor: d.valor });
        setLista((l) => l.map((x) => (x.id === id ? { ...x, nome: d.nome, publico: d.publico, valor: d.valor } : x)));
      } else {
        id = (await chamar("/api/tabela/edicoes", "POST", { chave, nome: d.nome, publico: d.publico, valor: d.valor })).id as number;
        setLista((l) => [...l, { id, chave, nome: d.nome, publico: d.publico, minha: true, autor: "Você", valor: d.valor }]);
      }
      escolher(id);
      if (d.padrao && padraoId !== id) {
        const k = chavePadrao(chave);
        await chamar("/api/preferencias/tabela", "PUT", { chave: k, valor: { id } });
        setPrefs((p) => ({ ...p, [k]: { id } }));
      }
      return id;
    });
  return { minhas, publicas, atual, padraoId, gravando, escolher, definirPadrao, excluir, salvar };
}

/**
 * SELETOR das edições salvas (no RODAPÉ da tabela): o LÁPIS (só o ícone) liga a edição; o seletor troca a edição em uso
 * ("Padrão do sistema", as minhas e as públicas com o autor); a ESTRELA marca a em uso como a minha PADRÃO (a tabela abre
 * nela); a lixeira exclui a minha. Na altura dos controles; 44px no toque.
 */
export function SeletorEdicoes({
  minhas,
  publicas,
  atual,
  padraoId,
  onEscolher,
  onPadrao,
  onExcluir,
  onEditar,
  disabled = false,
}: {
  minhas: EdicaoTabela[];
  publicas: EdicaoTabela[];
  atual: EdicaoTabela | null;
  padraoId: number | null;
  onEscolher: (id: number | null) => void;
  onPadrao: () => void;
  onExcluir: () => void;
  onEditar: () => void;
  disabled?: boolean;
}) {
  const ehPadrao = (atual?.id ?? null) === padraoId;
  return (
    <div className="flex items-center gap-1">
      <Button size="sm" variant="icon" icon={<IconPencil className="h-4 w-4" />} aria-label="Editar a planilha" title="Editar a planilha" onClick={onEditar} disabled={disabled} />
      <div className="w-44 sm:w-56">
        <SelectField
          compacto
          label="Edição"
          value={atual?.id ?? ""}
          disabled={disabled}
          onChange={(e) => onEscolher(e.target.value ? Number(e.target.value) : null)}
        >
          <option value="">Padrão do sistema</option>
          {minhas.length > 0 && (
            <optgroup label="Minhas">
              {minhas.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.nome}
                  {e.publico ? " · pública" : ""}
                </option>
              ))}
            </optgroup>
          )}
          {publicas.length > 0 && (
            <optgroup label="Públicas">
              {publicas.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.nome} · {e.autor}
                </option>
              ))}
            </optgroup>
          )}
        </SelectField>
      </div>
      <Button
        size="sm"
        variant="icon"
        aria-pressed={ehPadrao}
        aria-label={ehPadrao ? "Esta é a sua edição padrão" : "Usar como minha edição padrão"}
        title={ehPadrao ? "Sua edição padrão (a tabela abre nela)" : "Usar como minha edição padrão"}
        icon={<IconEstrela className={`h-4 w-4 ${ehPadrao ? "fill-current text-accent" : ""}`} />}
        onClick={onPadrao}
        disabled={disabled || ehPadrao}
      />
      {atual?.minha && (
        <Button
          size="sm"
          variant="icon"
          aria-label={`Excluir a edição ${atual.nome}`}
          title="Excluir esta edição"
          icon={<IconTrash className="h-4 w-4" style={{ color: "var(--danger)" }} />}
          onClick={onExcluir}
          disabled={disabled}
        />
      )}
    </div>
  );
}

type Destino = "atualizar" | "nova";

/**
 * SALVAR a edição da tabela: nome, **só para mim** ou **pública** (todos veem e usam) e "usar como minha padrão"; editando
 * uma edição MINHA, escolhe entre ATUALIZÁ-LA e salvar como NOVA (a de outra pessoa sempre vira uma nova, minha).
 */
export function SalvarEdicao({
  aberto,
  atual,
  ehPadrao,
  gravando,
  onFechar,
  onSalvar,
}: {
  aberto: boolean;
  atual: EdicaoTabela | null;
  ehPadrao: boolean;
  gravando: boolean;
  onFechar: () => void;
  onSalvar: (d: { nome: string; publico: boolean; atualizar: boolean; padrao: boolean }) => void;
}) {
  const podeAtualizar = atual?.minha === true;
  const [destino, setDestino] = useState<Destino>(podeAtualizar ? "atualizar" : "nova");
  const [nome, setNome] = useState(podeAtualizar ? (atual?.nome ?? "") : "");
  const [publico, setPublico] = useState(podeAtualizar ? (atual?.publico ?? false) : false);
  const [padrao, setPadrao] = useState(ehPadrao);
  const valido = nome.trim().length > 0 && nome.trim().length <= 60;
  return (
    <Modal
      open={aberto}
      onClose={onFechar}
      bloqueado={gravando}
      titulo="Salvar edição"
      size="md"
      rodape={
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onFechar} disabled={gravando}>
            Cancelar
          </Button>
          <Button
            onClick={() => onSalvar({ nome: nome.trim(), publico, atualizar: podeAtualizar && destino === "atualizar", padrao })}
            loading={gravando}
            disabled={!valido}
          >
            Salvar
          </Button>
        </div>
      }
    >
      <div className="space-y-[var(--gap-block)]">
        {podeAtualizar && (
          <Segmented<Destino>
            ariaLabel="Onde salvar"
            value={destino}
            onChange={(v) => {
              setDestino(v);
              if (v === "nova") setNome("");
              else {
                setNome(atual?.nome ?? "");
                setPublico(atual?.publico ?? false);
              }
            }}
            options={[
              { value: "atualizar", label: `Atualizar “${atual?.nome ?? ""}”`, curto: "Atualizar" },
              { value: "nova", label: "Salvar como nova", curto: "Nova" },
            ]}
          />
        )}
        <TextField label="Nome da edição" value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Ex.: Pessoal por elemento" maxLength={60} />
        <div className="space-y-2">
          <p className="text-[13.5px] font-bold text-text">Quem vê</p>
          <Segmented<"eu" | "todos">
            ariaLabel="Quem vê a edição"
            value={publico ? "todos" : "eu"}
            onChange={(v) => setPublico(v === "todos")}
            options={[
              { value: "eu", label: "Só para mim" },
              { value: "todos", label: "Pública (todos)" },
            ]}
          />
        </div>
        <Checkbox checked={padrao} onChange={(e) => setPadrao(e.target.checked)} label="Usar como minha edição padrão (a tabela abre nela)" />
      </div>
    </Modal>
  );
}
