'use client';
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase/client';
import { Calendario, JORNADA_PADRAO } from '@/lib/ponto';
import type { Acao, Empresa, FluxoAdmissao, Funcao, Jornada, Obra, Perfil, Permissao, Usuario, ValeAlimentacao } from '@/lib/types';

export interface Config {
  jornada: Jornada;
  empresa: Empresa;
  fluxo: FluxoAdmissao;
  va: ValeAlimentacao;
}

const CFG_PADRAO: Config = {
  jornada: JORNADA_PADRAO,
  empresa: { razao_social: '', cnpj: '', endereco: '', cidade: '', representante: '', representante_cargo: '', email_contabilidade: '', clinica: '' },
  fluxo: { gestor: { ativo: true, perfil: 'engenharia' }, diretoria: { ativo: true, perfil: 'diretoria', acima_de: 0 }, avisar_mobilizacao: { perfis: ['sesmt'], emails: '' } },
  va: { desconto_1_falta: 25, desconto_2_faltas: 50, desconto_3_ou_mais: 100, dias_base: 30 },
};

export interface SessaoCtx {
  usuario: Usuario;
  perfil: Perfil;
  permissoes: Permissao[];
  perfis: Perfil[];
  /** obras liberadas para o usuário (todas, se master ou todas_obras) */
  obrasUser: Obra[];
  obras: Obra[];
  funcoes: Funcao[];
  feriados: string[];
  cfg: Config;
  cal: Calendario;
  perm: (modulo: string, acao: Acao) => boolean;
  obraLiberada: (id: string | null | undefined) => boolean;
  obraNome: (id: string | null | undefined) => string;
  funcaoNome: (id: string | null | undefined) => string;
  recarregarConfig: () => Promise<void>;
  sair: () => Promise<void>;
}

const Ctx = createContext<SessaoCtx | null>(null);

export function useSessao() {
  const c = useContext(Ctx);
  if (!c) throw new Error('useSessao fora do provedor');
  return c;
}

export function SessaoProvider({ children }: { children: ReactNode }) {
  const router = useRouter();
  const [estado, setEstado] = useState<'carregando' | 'ok' | 'erro'>('carregando');
  const [erro, setErro] = useState('');
  const [base, setBase] = useState<Omit<SessaoCtx, 'perm' | 'obraLiberada' | 'obraNome' | 'funcaoNome' | 'recarregarConfig' | 'sair' | 'cal'> | null>(null);

  const lerConfig = useCallback(async (): Promise<Config> => {
    const { data } = await supabase().from('configuracoes').select('chave, valor');
    const m = Object.fromEntries((data || []).map((r: { chave: string; valor: unknown }) => [r.chave, r.valor]));
    return {
      jornada: { ...CFG_PADRAO.jornada, ...(m.jornada || {}) },
      empresa: { ...CFG_PADRAO.empresa, ...(m.empresa || {}) },
      fluxo: { ...CFG_PADRAO.fluxo, ...(m.fluxo_admissao || {}) },
      va: { ...CFG_PADRAO.va, ...(m.vale_alimentacao || {}) },
    };
  }, []);

  useEffect(() => {
    (async () => {
      const sb = supabase();
      const { data: { user } } = await sb.auth.getUser();
      if (!user) { router.replace('/login'); return; }
      const { data: u } = await sb.from('usuarios').select('*').eq('id', user.id).maybeSingle();
      if (!u || !u.ativo) {
        setErro(!u ? 'Seu login existe, mas não há cadastro de usuário do portal para ele. Peça ao administrador para cadastrá-lo.' : 'Seu usuário está desativado. Procure o administrador do portal.');
        setEstado('erro');
        return;
      }
      const [perfis, perms, obras, funcoes, feriados, uo, cfg] = await Promise.all([
        sb.from('perfis').select('*').order('nome'),
        sb.from('permissoes').select('*').eq('perfil_id', u.perfil_id),
        sb.from('obras').select('*').order('nome'),
        sb.from('funcoes').select('*').order('nome'),
        sb.from('feriados').select('data'),
        sb.from('usuario_obras').select('obra_id').eq('usuario_id', u.id),
        lerConfig(),
      ]);
      const perfil = (perfis.data || []).find((p: Perfil) => p.id === u.perfil_id) || { id: u.perfil_id || '', nome: u.perfil_id || '—', descricao: null, master: false };
      const todas = u.todas_obras || perfil.master;
      const lib = new Set((uo.data || []).map((x: { obra_id: string }) => x.obra_id));
      const obrasAll: Obra[] = obras.data || [];
      setBase({
        usuario: u,
        perfil,
        perfis: perfis.data || [],
        permissoes: perms.data || [],
        obras: obrasAll,
        obrasUser: obrasAll.filter((o) => todas || lib.has(o.id)),
        funcoes: funcoes.data || [],
        feriados: (feriados.data || []).map((f: { data: string }) => f.data),
        cfg,
      });
      setEstado('ok');
    })().catch((e) => { setErro(String(e?.message || e)); setEstado('erro'); });
  }, [router, lerConfig]);

  const sair = useCallback(async () => {
    await supabase().rpc('registrar_evento', { p_acao: 'Logout', p_detalhe: null });
    await supabase().auth.signOut();
    router.replace('/login');
  }, [router]);

  const valor = useMemo<SessaoCtx | null>(() => {
    if (!base) return null;
    const permMap = new Map(base.permissoes.map((p) => [p.modulo, p]));
    const todas = base.usuario.todas_obras || base.perfil.master;
    const libIds = new Set(base.obrasUser.map((o) => o.id));
    const oNome = new Map(base.obras.map((o) => [o.id, o.nome]));
    const fNome = new Map(base.funcoes.map((f) => [f.id, f.nome]));
    return {
      ...base,
      cal: new Calendario(base.feriados, base.cfg.jornada),
      perm: (m, a) => base.perfil.master || (m === 'comunicados' && a === 'ver') || !!permMap.get(m)?.[a],
      obraLiberada: (id) => !id || todas || libIds.has(id),
      obraNome: (id) => (id ? oNome.get(id) || '—' : '—'),
      funcaoNome: (id) => (id ? fNome.get(id) || '—' : '—'),
      recarregarConfig: async () => { const cfg = await lerConfig(); setBase((b) => (b ? { ...b, cfg } : b)); },
      sair,
    };
  }, [base, lerConfig, sair]);

  if (estado === 'carregando') return <div className="login"><p className="muted">Carregando o portal…</p></div>;
  if (estado === 'erro' || !valor)
    return (
      <div className="login"><div className="login-card">
        <h2>Não foi possível abrir o portal</h2>
        <p className="muted">{erro}</p>
        <button className="btn" onClick={async () => { await supabase().auth.signOut(); router.replace('/login'); }}>Voltar ao login</button>
      </div></div>
    );
  return <Ctx.Provider value={valor}>{children}</Ctx.Provider>;
}
