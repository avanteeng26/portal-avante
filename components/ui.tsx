'use client';
import { useEffect, useState, type ReactNode } from 'react';
import { ICON } from '@/lib/menu';
import { dd, fD, hoje, pdk } from '@/lib/format';

export function Ico({ k, s = 18 }: { k: string; s?: number }) {
  return (
    <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" dangerouslySetInnerHTML={{ __html: ICON[k] || '' }} />
  );
}

export const Chev = ({ s = 14 }: { s?: number }) => (
  <svg className="chev" width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><path d="M9 6l6 6-6 6" /></svg>
);

export type Tom = 'ok' | 'warn' | 'bad' | 'neutral' | 'info';
export const Pill = ({ t, c }: { t: ReactNode; c: Tom }) => <span className={'pill ' + c}>{t}</span>;

export function Kpi({ l, v, h, st, onClick }: { l: string; v: ReactNode; h?: ReactNode; st?: string; onClick?: () => void }) {
  return (
    <div className={'card kpi ' + (st || '') + (onClick ? ' click' : '')} onClick={onClick}>
      <div className="l">{l}</div><div className="v">{v}</div><div className="h">{h}</div>
    </div>
  );
}

export function VencPill({ d }: { d: string | null }) {
  if (!d) return <Pill t="—" c="neutral" />;
  const x = dd(hoje(), pdk(d));
  if (x < 0) return <Pill t={'Vencido há ' + -x + 'd'} c="bad" />;
  if (x <= 30) return <Pill t={'Vence em ' + x + 'd'} c="warn" />;
  return <Pill t={fD(d)} c="ok" />;
}

export function Modal({ children, onClose, wide }: { children: ReactNode; onClose: () => void; wide?: boolean }) {
  useEffect(() => {
    const f = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', f);
    return () => document.removeEventListener('keydown', f);
  }, [onClose]);
  return (
    <div className="modal-bg" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal" role="dialog" style={wide ? { maxWidth: 1000 } : undefined}>{children}</div>
    </div>
  );
}

// ---------- toast global ----------
let _set: ((m: string) => void) | null = null;
export function toast(m: string) { _set?.(m); }
export function ToastHost() {
  const [m, setM] = useState('');
  useEffect(() => { _set = (x) => { setM(x); setTimeout(() => setM((y) => (y === x ? '' : y)), 3200); }; return () => { _set = null; }; }, []);
  return m ? <div className="toast">{m}</div> : null;
}

export const Carregando = ({ t = 'Carregando…' }: { t?: string }) => <p className="spinner">{t}</p>;

export const SemPermissao = () => (
  <div className="card"><h3>Sem acesso</h3><p className="muted">Seu perfil não tem permissão para ver esta página. Se precisar, fale com o administrador do portal.</p></div>
);

/** title padrão quando a ação está bloqueada pelo perfil */
export const SEM_PERM = 'Seu perfil não tem permissão para esta ação';
