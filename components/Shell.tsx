'use client';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { useSessao } from './Sessao';
import { Chev, Ico, Modal, ToastHost } from './ui';
import { SETORES, isGrupo, itensDoSetor, localizar, type Item } from '@/lib/menu';
import { supabase } from '@/lib/supabase/client';
import { podeAgir } from '@/lib/admissao';
import { fDT } from '@/lib/format';
import type { Admissao, Notificacao } from '@/lib/types';

export function Shell({ children }: { children: ReactNode }) {
  const S = useSessao();
  const path = usePathname();
  const router = useRouter();
  const [open, setOpen] = useState<Record<string, boolean>>({});
  const [menuMob, setMenuMob] = useState(false);
  const [aprov, setAprov] = useState(0);
  const [notifs, setNotifs] = useState<Notificacao[]>([]);
  const [lidas, setLidas] = useState<Set<string>>(new Set());
  const [verNotif, setVerNotif] = useState(false);

  const can = (i: Item) => S.perm(i.mod, 'ver');
  const loc = localizar(path);
  const crumbs = path === '/' ? ['Início'] : loc ? [loc.setor.t, loc.grupo?.t, loc.item.t].filter(Boolean) as string[] : [];

  const atualizar = useCallback(async () => {
    const sb = supabase();
    if (S.perm('admissao', 'ver')) {
      const { data } = await sb.from('admissoes').select('*').in('etapa', ['gestor', 'diretoria', 'docs', 'exame', 'contab', 'assin', 'devolvida']);
      const c = { usuarioId: S.usuario.id, perfilId: S.perfil.id, master: S.perfil.master, fluxo: S.cfg.fluxo, perm: S.perm, obraLiberada: S.obraLiberada };
      setAprov(((data || []) as Admissao[]).filter((r) => podeAgir(c, r)).length);
    }
    const [n, l] = await Promise.all([
      sb.from('notificacoes').select('*').order('criado_em', { ascending: false }).limit(50),
      sb.from('notificacao_leitura').select('notificacao_id').eq('usuario_id', S.usuario.id),
    ]);
    setNotifs((n.data || []) as Notificacao[]);
    setLidas(new Set((l.data || []).map((x: { notificacao_id: string }) => x.notificacao_id)));
  }, [S]);

  useEffect(() => { atualizar(); setMenuMob(false); }, [path, atualizar]);
  useEffect(() => {
    const f = () => atualizar();
    window.addEventListener('portal:atualizar', f);
    return () => window.removeEventListener('portal:atualizar', f);
  }, [atualizar]);

  const naoLidas = notifs.filter((n) => !lidas.has(n.id));
  const marcarLidas = async () => {
    if (!naoLidas.length) return;
    await supabase().from('notificacao_leitura').upsert(naoLidas.map((n) => ({ notificacao_id: n.id, usuario_id: S.usuario.id })), { onConflict: 'notificacao_id,usuario_id' });
    setLidas(new Set([...lidas, ...naoLidas.map((n) => n.id)]));
  };

  return (
    <div className="app">
      <aside className={'side' + (menuMob ? ' open' : '')} id="side">
        <div style={{ padding: '4px 6px 14px' }}>
          <img src="/logo.png" alt="Avante Engenharia" className="logo-img logo-sm" />
        </div>
        <Link href="/" className={'sec-h home ' + (path === '/' ? 'cur' : '')}><Ico k="home" /><span>Início</span></Link>
        {SETORES.map((s) => {
          const its = s.items.filter((i) => (isGrupo(i) ? i.sub.some(can) : can(i)));
          if (!its.length) return null;
          const has = itensDoSetor(s).some((i) => loc?.item.id === i.id);
          const aberto = open[s.id] ?? has;
          return (
            <div key={s.id} className={'sec ' + (aberto ? 'open' : '')}>
              <button className={'sec-h ' + (has ? 'cur' : '')} aria-expanded={aberto} onClick={() => setOpen({ ...open, [s.id]: !aberto })}>
                <Ico k={s.icon} /><span>{s.t}</span><Chev />
              </button>
              {aberto && (
                <nav className="nav sec-b">
                  {its.map((i) => {
                    if (isGrupo(i)) {
                      const so = open[i.grp] ?? true;
                      return (
                        <div key={i.grp}>
                          <a className={'grp ' + (so ? 'open' : '')} onClick={() => setOpen({ ...open, [i.grp]: !so })}><span>{i.t}</span><Chev s={12} /></a>
                          {so && i.sub.filter(can).map((x) => (
                            <Link key={x.id} href={x.href} className={'nsub ' + (loc?.item.id === x.id ? 'active' : '') + (x.soon ? ' soon' : '')}>
                              {x.t}{x.soon && <span className="tag">em breve</span>}
                              {x.id === 'admissao' && aprov > 0 && <span className="nbadge">{aprov}</span>}
                            </Link>
                          ))}
                        </div>
                      );
                    }
                    return (
                      <Link key={i.id} href={i.href} className={(loc?.item.id === i.id ? 'active' : '') + (i.soon ? ' soon' : '')}>
                        {i.t}{i.soon && <span className="tag">em breve</span>}
                      </Link>
                    );
                  })}
                </nav>
              )}
            </div>
          );
        })}
      </aside>
      <div className="main">
        <header className="top">
          <div style={{ display: 'flex', gap: 10, alignItems: 'center', minWidth: 0 }}>
            <button className="btn sm menu-btn" onClick={() => setMenuMob(!menuMob)}>Menu</button>
            <span className="small muted crumbs">
              {crumbs.map((c, i) => <span key={i} style={{ opacity: 1, margin: 0 }}>{i > 0 && <span> › </span>}{c}</span>)}
            </span>
          </div>
          <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
            <button className="btn sm bell" aria-label="Notificações" onClick={() => setVerNotif(true)}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9M13.73 21a2 2 0 0 1-3.46 0" /></svg>
              {naoLidas.length > 0 && <span className="nbadge">{naoLidas.length}</span>}
            </button>
            <div style={{ textAlign: 'right' }}>
              <div style={{ fontWeight: 600 }}>{S.usuario.nome}</div>
              <div className="small muted">{S.perfil.nome}</div>
            </div>
            <button className="btn sm" onClick={S.sair}>Sair</button>
          </div>
        </header>
        <section className="content">{children}</section>
      </div>
      {verNotif && (
        <Modal wide onClose={() => setVerNotif(false)}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <h2>Notificações</h2>
            {naoLidas.length > 0 && <button className="btn sm" onClick={marcarLidas}>Marcar todas como lidas</button>}
          </div>
          {notifs.length === 0 && <p className="muted">Nenhuma notificação.</p>}
          {notifs.map((n) => {
            const nova = !lidas.has(n.id);
            return (
              <div key={n.id} className="tl-i" style={nova ? { borderLeftColor: 'var(--accent)' } : undefined}>
                <b>{nova ? '● ' : ''}{n.titulo}</b> · <span className="muted">{fDT(n.criado_em)}</span>
                {n.texto && <div className="small">{n.texto}</div>}
                {n.link && <button className="linklike small" onClick={async () => {
                  await supabase().from('notificacao_leitura').upsert({ notificacao_id: n.id, usuario_id: S.usuario.id }, { onConflict: 'notificacao_id,usuario_id' });
                  setVerNotif(false); router.push(n.link!);
                }}>Abrir</button>}
              </div>
            );
          })}
          <div className="modal-actions"><button className="btn primary" onClick={() => setVerNotif(false)}>Fechar</button></div>
        </Modal>
      )}
      <ToastHost />
    </div>
  );
}

/** Pede ao shell para recontar notificações/aprovações depois de uma ação */
export const avisarShell = () => window.dispatchEvent(new Event('portal:atualizar'));
