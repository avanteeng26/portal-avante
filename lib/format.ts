// Utilitários de formatação e datas (mesmo padrão do protótipo).

export const MESES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
export const MESESL = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
export const DOW = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'];

export const hoje = () => { const d = new Date(); d.setHours(0, 0, 0, 0); return d; };
export const addD = (d: Date, n: number) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
export const dd = (a: Date, b: Date) => Math.round((b.getTime() - a.getTime()) / 864e5);

/** Date -> 'YYYY-MM-DD' (data local, sem fuso) */
export const dk = (d: Date) => d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
/** 'YYYY-MM-DD' -> Date local */
export const pdk = (s: string) => { const [y, m, d] = s.slice(0, 10).split('-').map(Number); return new Date(y, m - 1, d); };

export const fD = (d: Date | string | null | undefined) => {
  if (!d) return '—';
  const x = typeof d === 'string' ? (d.length === 10 ? pdk(d) : new Date(d)) : d;
  return isNaN(x.getTime()) ? '—' : x.toLocaleDateString('pt-BR');
};
export const fDT = (d: Date | string | null | undefined) => (d ? new Date(d).toLocaleString('pt-BR') : '—');

export const N = (v: number, d = 0) => Number(v || 0).toLocaleString('pt-BR', { minimumFractionDigits: d, maximumFractionDigits: d });
export const P = (v: number, d = 1) => N(v, d) + '%';
export const BRL = (v: number) => Number(v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 });
export const BRL2 = (v: number) => Number(v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

/** 'HH:MM' -> minutos */
export const hm = (s: string | null | undefined) => { if (!s) return NaN; const [a, b] = String(s).split(':').map(Number); return a * 60 + b; };
/** minutos -> 'HH:MM' (vazio quando zero) */
export const fm = (m: number) => { if (!m) return ''; const s = m < 0 ? '-' : ''; m = Math.abs(Math.round(m)); return s + String(Math.floor(m / 60)).padStart(2, '0') + ':' + String(m % 60).padStart(2, '0'); };
export const fmh = (m: number) => N(m / 60, 1) + 'h';
/** formato do Excel: 9:05 */
export const hx = (m: number) => { m = Math.round(m || 0); return Math.floor(m / 60) + ':' + String(m % 60).padStart(2, '0'); };
export const hxs = (m: number) => hx(m) + ':00';
export const hhmm = (s: string | null | undefined) => { const m = hm(s); return isNaN(m) ? '' : hx(m); };
/** time do Postgres ('07:00:00') -> '07:00' */
export const t5 = (s: string | null | undefined) => (s ? String(s).slice(0, 5) : '');

export const dExt = (d: Date) => d.getDate() + ' de ' + MESESL[d.getMonth()] + ' de ' + d.getFullYear();

export const esc = (s: unknown) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] as string));

export const somenteDigitos = (s: string) => (s || '').replace(/\D/g, '');
