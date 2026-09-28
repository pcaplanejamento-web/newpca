"use client";

import { type CSSProperties, type ReactNode, useEffect, useState } from "react";
import { ANGULOS_GRADIENTE, cssGradiente, type FotoFundo, type FundoEscolha, type Gradiente, GRADIENTES_PADRAO, mesmoGradiente, PESQUISAS_SUGERIDAS } from "@/lib/imagem-fundo-core";
import { chamarPadronizacao as chamar } from "@/lib/padronizacao-cliente";
import { Button } from "./Button";
import { ColorField } from "./ColorField";
import { SearchField } from "./Field";
import { IconCheck, IconChevronLeft, IconMais, IconNenhum, IconPlus } from "./icons";
import { LinkExterno } from "./LinkExterno";
import { Skeleton } from "./Skeleton";

/** As fotos buscadas (por termo) nesta sessão — abrir o seletor de novo não refaz a busca. */
const cacheFotos = new Map<string, { fonte: "unsplash" | "picsum"; fotos: FotoFundo[] }>();

function useFotos(q: string) {
  const [r, setR] = useState<{ fonte: "unsplash" | "picsum"; fotos: FotoFundo[] } | null>(() => cacheFotos.get(q) ?? null);
  const [erro, setErro] = useState(false);
  useEffect(() => {
    const c = cacheFotos.get(q);
    if (c) return setR(c);
    setR(null);
    setErro(false);
    let vivo = true;
    const t = window.setTimeout(() => {
      chamar<{ fonte: "unsplash" | "picsum"; fotos: FotoFundo[] }>(`/api/tarefas/fotos?q=${encodeURIComponent(q)}`)
        .then((x) => {
          cacheFotos.set(q, x);
          if (vivo) setR(x);
        })
        .catch(() => vivo && setErro(true));
    }, q ? 350 : 0);
    return () => {
      vivo = false;
      window.clearTimeout(t);
    };
  }, [q]);
  return { r, erro };
}

/** A MINIATURA 16:9 de uma foto (some se não carregar). */
function Miniatura({ f, ativa, onEscolher, disabled }: { f: FotoFundo; ativa: boolean; onEscolher: () => void; disabled?: boolean }) {
  const [falhou, setFalhou] = useState(false);
  if (falhou) return null;
  return (
    <button
      type="button"
      disabled={disabled}
      aria-pressed={ativa}
      aria-label={`Usar a foto${f.autor ? ` de ${f.autor}` : ""} como fundo`}
      title={f.autor ? `Foto de ${f.autor}` : undefined}
      onClick={onEscolher}
      className={`group relative aspect-video overflow-hidden rounded-[6px] bg-surface-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent ${ativa ? "ring-2 ring-accent" : ""}`}
    >
      {/* biome-ignore lint/performance/noImgElement: miniatura externa. */}
      <img alt="" src={f.miniatura} loading="lazy" referrerPolicy="no-referrer" onError={() => setFalhou(true)} className="h-full w-full object-cover transition-transform duration-[var(--motion-duration)] group-hover:scale-105" />
      {ativa && (
        <span className="absolute inset-0 grid place-items-center bg-[var(--scrim)] text-white">
          <IconCheck className="h-4 w-4" />
        </span>
      )}
    </button>
  );
}

/** Um CÍRCULO de fundo (degradê, "sem fundo" ou "+"). */
function Circulo({ rotulo, ativo, onClick, style, children, disabled }: { rotulo: string; ativo?: boolean; onClick: () => void; style?: CSSProperties; children?: ReactNode; disabled?: boolean }) {
  return (
    <button
      type="button"
      title={rotulo}
      aria-label={rotulo}
      aria-pressed={ativo}
      disabled={disabled}
      onClick={onClick}
      style={style}
      className={`grid h-11 w-11 shrink-0 place-items-center rounded-full text-text-2 shadow-ring transition-transform hover:scale-105 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent disabled:opacity-50 lg:h-9 lg:w-9 ${
        ativo ? "outline-2 outline-offset-2 outline-[var(--text)]" : ""
      }`}
    >
      {ativo && !children ? <IconCheck className="h-4 w-4 text-white drop-shadow" /> : children}
    </button>
  );
}

/** O editor do DEGRADÊ PRÓPRIO: as cores (2 ou 3), o ângulo e a prévia. */
function EditorGradiente({ inicial, onAplicar, onCancelar }: { inicial: Gradiente; onAplicar: (g: Gradiente) => void; onCancelar: () => void }) {
  const [g, setG] = useState<Gradiente>(inicial);
  const setCor = (i: number, c: string) => setG((x) => ({ ...x, cores: x.cores.map((v, j) => (j === i ? c : v)) }));
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-3">
        <span aria-hidden className="h-16 w-16 shrink-0 rounded-full shadow-ring" style={{ background: cssGradiente(g) }} />
        <div className="min-w-0 flex-1">
          <p className="mb-1 text-[12.5px] font-semibold text-text">Direção</p>
          <div className="flex flex-wrap gap-1">
            {ANGULOS_GRADIENTE.map((a) => (
              <button
                key={a}
                type="button"
                aria-pressed={g.angulo === a}
                aria-label={`Ângulo ${a} graus`}
                onClick={() => setG((x) => ({ ...x, angulo: a }))}
                className={`grid h-11 w-11 place-items-center rounded-control text-[15px] lg:h-8 lg:w-8 ${g.angulo === a ? "bg-accent text-white" : "bg-surface-2 text-text-2 hover:bg-border"}`}
              >
                <span aria-hidden style={{ transform: `rotate(${a - 90}deg)` }}>
                  →
                </span>
              </button>
            ))}
          </div>
        </div>
      </div>
      <div className="grid gap-2 sm:grid-cols-2">
        {g.cores.map((c, i) => (
          <ColorField key={i} label={`Cor ${i + 1}`} value={c} onChange={(v) => setCor(i, v)} />
        ))}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        {g.cores.length < 3 ? (
          <Button size="sm" variant="ghost" icon={<IconPlus className="h-4 w-4" />} onClick={() => setG((x) => ({ ...x, cores: [...x.cores, "#ffffff"] }))}>
            3ª cor
          </Button>
        ) : (
          <Button size="sm" variant="ghost" onClick={() => setG((x) => ({ ...x, cores: x.cores.slice(0, 2) }))}>
            Só 2 cores
          </Button>
        )}
        <span className="flex-1" />
        <Button size="sm" variant="ghost" onClick={onCancelar}>
          Cancelar
        </Button>
        <Button size="sm" variant="accent" onClick={() => onAplicar(g)}>
          Usar este degradê
        </Button>
      </div>
    </div>
  );
}

/**
 * O SELETOR DE FUNDO do quadro (como o "Tela de fundo" do Trello): a PRÉVIA do quadro, uma fileira de FOTOS (16:9) com
 * "…" para a PESQUISA DE FOTOS (busca + pesquisas sugeridas + as principais — Unsplash com a chave, senão uma seleção
 * fixa), e os DEGRADÊS em CÍRCULOS (os predefinidos, "Sem fundo" = o padrão do sistema e "+" = criar um degradê próprio).
 * Controlado (`valor`/`onChange`) — o "Novo quadro" guarda no rascunho; a Configuração grava na hora.
 */
export function SeletorFundo({ valor, onChange, disabled = false, previa = true }: { valor: FundoEscolha; onChange: (v: FundoEscolha) => void; disabled?: boolean; previa?: boolean }) {
  const [tela, setTela] = useState<"inicio" | "fotos" | "gradiente">("inicio");
  const [busca, setBusca] = useState("");
  const destaque = useFotos("");
  const pesquisa = useFotos(tela === "fotos" ? busca : "");
  const gAtual = valor.tipo === "gradiente" ? valor.g : null;
  const proprio = gAtual && !GRADIENTES_PADRAO.some((p) => mesmoGradiente(p.g, gAtual));
  const escolherFoto = (f: FotoFundo) => onChange({ tipo: "imagem", url: f.url });
  const fundoPrevia =
    valor.tipo === "imagem"
      ? { backgroundImage: `url("${valor.url.replace(/["\\]/g, "")}")`, backgroundSize: "cover", backgroundPosition: "center" }
      : valor.tipo === "gradiente"
        ? { background: cssGradiente(valor.g) }
        : undefined;

  if (tela === "fotos")
    return (
      <div className="space-y-3">
        <div className="flex items-center gap-2">
          <Button size="sm" variant="ghost" aria-label="Voltar" icon={<IconChevronLeft className="h-4 w-4" />} onClick={() => setTela("inicio")} />
          <p className="flex-1 text-center text-[14px] font-semibold text-text">Pesquisa de fotos</p>
          <span className="w-11" />
        </div>
        <SearchField compacto placeholder="Pesquisar fotos" value={busca} onChange={(e) => setBusca(e.target.value)} onClear={() => setBusca("")} aria-label="Pesquisar fotos" />
        {!busca && (
          <div>
            <p className="mb-1.5 text-[12.5px] font-semibold text-muted">Pesquisas sugeridas</p>
            <div className="flex flex-wrap gap-1.5">
              {PESQUISAS_SUGERIDAS.map((s) => (
                <button key={s} type="button" onClick={() => setBusca(s)} className="min-h-11 rounded-control border border-border-2 px-3 text-[13px] text-text-2 hover:bg-surface-2 lg:min-h-8">
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}
        <p className="text-[12.5px] font-semibold text-muted">{busca ? `Resultados para “${busca}”` : "Principais fotos"}</p>
        {pesquisa.erro ? (
          <p className="py-6 text-center text-[13px] text-muted">Não foi possível carregar as fotos.</p>
        ) : !pesquisa.r ? (
          <div className="grid grid-cols-3 gap-2">
            {Array.from({ length: 9 }, (_, i) => (
              <Skeleton key={i} className="aspect-video w-full" />
            ))}
          </div>
        ) : pesquisa.r.fotos.length ? (
          <div className="grid max-h-[50vh] grid-cols-3 gap-2 overflow-y-auto">
            {pesquisa.r.fotos.map((f) => (
              <Miniatura key={f.id} f={f} disabled={disabled} ativa={valor.tipo === "imagem" && valor.url === f.url} onEscolher={() => escolherFoto(f)} />
            ))}
          </div>
        ) : (
          <p className="py-6 text-center text-[13px] text-muted">Nenhuma foto para “{busca}”.</p>
        )}
        {pesquisa.r?.fonte === "picsum" && busca && <p className="text-[12px] text-muted">A busca por termo depende da chave do Unsplash — por enquanto, as fotos da seleção.</p>}
        <p className="text-right text-[12px] text-muted">
          Fotos do{" "}
          {pesquisa.r?.fonte === "picsum" ? <LinkExterno href="https://picsum.photos">Picsum (Unsplash)</LinkExterno> : <LinkExterno href="https://unsplash.com/?utm_source=governarv&utm_medium=referral">Unsplash</LinkExterno>}
        </p>
      </div>
    );

  if (tela === "gradiente")
    return (
      <EditorGradiente
        inicial={gAtual ?? { cores: ["#579dff", "#9f8fef"], angulo: 135 }}
        onCancelar={() => setTela("inicio")}
        onAplicar={(g) => {
          onChange({ tipo: "gradiente", g });
          setTela("inicio");
        }}
      />
    );

  return (
    <div className="space-y-3">
      {previa && (
        // A PRÉVIA do quadro (como a do Trello): o fundo + três listas esquemáticas.
        <div aria-hidden className="mx-auto flex aspect-video w-full max-w-[18rem] items-start justify-center gap-1.5 rounded-lg bg-surface-2 p-3 shadow-ring" style={fundoPrevia}>
          {[3, 5, 2].map((n, i) => (
            <span key={i} className="w-1/4 space-y-1 rounded-[4px] bg-[var(--lista-quadro)] p-1 opacity-95">
              {Array.from({ length: n }, (_, j) => (
                <span key={j} className="block h-1.5 rounded-sm bg-surface" />
              ))}
            </span>
          ))}
        </div>
      )}
      <fieldset>
        <legend className="mb-1.5 text-[12.5px] font-semibold text-text">Tela de fundo</legend>
        <div className="grid grid-cols-5 gap-2">
          {destaque.r
            ? destaque.r.fotos.slice(0, 4).map((f) => <Miniatura key={f.id} f={f} disabled={disabled} ativa={valor.tipo === "imagem" && valor.url === f.url} onEscolher={() => escolherFoto(f)} />)
            : Array.from({ length: 4 }, (_, i) => (
                <Skeleton key={i} className="aspect-video w-full" />
              ))}
          <button
            type="button"
            aria-label="Mais fotos"
            title="Mais fotos"
            onClick={() => setTela("fotos")}
            className="grid aspect-video place-items-center rounded-[6px] bg-surface-2 text-text-2 hover:bg-border focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
          >
            <IconMais className="h-4 w-4" />
          </button>
        </div>
      </fieldset>
      <fieldset>
        <legend className="sr-only">Degradês</legend>
        <div className="flex flex-wrap gap-2">
          <Circulo rotulo="Sem fundo (padrão do sistema)" ativo={valor.tipo === "nenhum"} disabled={disabled} onClick={() => onChange({ tipo: "nenhum" })}>
            <IconNenhum className="h-4 w-4 text-muted" />
          </Circulo>
          {GRADIENTES_PADRAO.map((p) => (
            <Circulo key={p.nome} rotulo={`Degradê ${p.nome}`} ativo={mesmoGradiente(p.g, gAtual)} disabled={disabled} style={{ background: cssGradiente(p.g) }} onClick={() => onChange({ tipo: "gradiente", g: p.g })} />
          ))}
          {proprio && gAtual && <Circulo rotulo="O seu degradê" ativo disabled={disabled} style={{ background: cssGradiente(gAtual) }} onClick={() => setTela("gradiente")} />}
          <Circulo rotulo="Criar um degradê próprio" disabled={disabled} onClick={() => setTela("gradiente")}>
            <IconPlus className="h-4 w-4" />
          </Circulo>
        </div>
      </fieldset>
    </div>
  );
}
