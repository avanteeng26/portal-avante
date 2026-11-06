// Regras da folha de ponto (modelo Avante), idênticas à view public.v_ponto:
// período de 21 a 20; seg a qui 9h, sex 8h; sábado sem carga (tudo vira HE 50%);
// domingo e feriado HE 100%; tolerância diária configurável (padrão 10 min).
import { addD, dd, dk, fD, hm, MESES, pdk, t5 } from './format';
import type { Jornada, Ocorrencia, Ponto } from './types';

export const OC: [Ocorrencia, string][] = [
  ['TRABALHADO', 'Trabalhado'], ['FALTA', 'Falta'], ['ABONADO', 'Abonado'], ['ATESTADO', 'Atestado médico'],
  ['FERIAS', 'Férias'], ['LUTO', 'Afastamento por luto'], ['FOLGA', 'Folga / compensação'], ['AFASTADO', 'Afastado (INSS)'], ['FERIADO', 'Feriado'],
];
export const ocNome = (c: string) => (OC.find((o) => o[0] === c) || [c, c])[1];
export const PAGO: Ocorrencia[] = ['ABONADO', 'ATESTADO', 'FERIAS', 'LUTO', 'FOLGA', 'FERIADO'];
export const AUSENCIA: Ocorrencia[] = ['FALTA', 'ATESTADO', 'ABONADO', 'LUTO'];

export const JORNADA_PADRAO: Jornada = { seg_qui_min: 540, sexta_min: 480, tolerancia_min: 10, inicio_apuracao_dia: 21, texto: '' };

// ---------- competência (21 do mês anterior a 20 do mês) ----------
export const compKey = (d: Date) => d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');
export const compLabel = (k: string) => { const [y, m] = k.split('-').map(Number); return MESES[m - 1] + '/' + y; };
export const kAdd = (k: string, n: number) => { const [y, m] = k.split('-').map(Number); return compKey(new Date(y, m - 1 + n, 1)); };
export const compOf = (d: Date) => (d.getDate() >= 21 ? compKey(new Date(d.getFullYear(), d.getMonth() + 1, 1)) : compKey(d));
export function periodo(k: string) { const [y, m] = k.split('-').map(Number); return { ini: new Date(y, m - 2, 21), fim: new Date(y, m - 1, 20) }; }
export const perLabel = (k: string) => { const p = periodo(k); return fD(p.ini).slice(0, 5) + ' a ' + fD(p.fim); };
export function diasPer(k: string) { const p = periodo(k); const r: Date[] = []; for (let d = new Date(p.ini); d <= p.fim; d = addD(d, 1)) r.push(new Date(d)); return r; }
export const compAtual = () => { const t = new Date(); t.setHours(0, 0, 0, 0); return compOf(t); };

// ---------- calendário ----------
export class Calendario {
  private fer: Set<string>;
  constructor(feriados: string[], public jornada: Jornada = JORNADA_PADRAO) { this.fer = new Set(feriados.map((f) => f.slice(0, 10))); }
  isFer = (d: Date) => this.fer.has(dk(d));
  isUtil = (d: Date) => d.getDay() !== 0 && d.getDay() !== 6 && !this.isFer(d);
  carga = (d: Date) => {
    if (this.isFer(d) || d.getDay() === 0 || d.getDay() === 6) return 0;
    return d.getDay() === 5 ? this.jornada.sexta_min : this.jornada.seg_qui_min;
  };
  domFer = (d: Date) => d.getDay() === 0 || this.isFer(d);
  prevUtil = (d: Date) => { let x = new Date(d); while (!this.isUtil(x)) x = addD(x, -1); return x; };
}

/** Linha de ponto usada nas telas (horários 'HH:MM'; h2 em minutos) */
export interface LinhaPonto {
  oc: Ocorrencia; e: string; sa: string; r: string; s: string;
  obra: string; obra2: string; h2: number; obs: string; split?: boolean;
}
export const VAZIO = (): LinhaPonto => ({ oc: 'TRABALHADO', e: '', sa: '', r: '', s: '', obra: '', obra2: '', h2: 0, obs: '' });
export const linhaVazia = (l: LinhaPonto) => l.oc === 'TRABALHADO' && !l.e && !l.s;

export const deBanco = (p: Ponto): LinhaPonto => ({
  oc: p.ocorrencia, e: t5(p.entrada1), sa: t5(p.saida1), r: t5(p.entrada2), s: t5(p.saida2),
  obra: p.obra_id || '', obra2: p.obra2_id || '', h2: p.minutos_obra2 || 0, obs: p.observacao || '',
});
export const paraBanco = (funcionario_id: string, data: string, l: LinhaPonto): Ponto => {
  const t = l.oc === 'TRABALHADO';
  return {
    funcionario_id, data, ocorrencia: l.oc,
    entrada1: t ? l.e || null : null, saida1: t ? l.sa || null : null, entrada2: t ? l.r || null : null, saida2: t ? l.s || null : null,
    obra_id: l.obra || null, obra2_id: t && l.obra2 && l.h2 > 0 ? l.obra2 : null, minutos_obra2: t && l.obra2 && l.h2 > 0 ? Math.round(l.h2) : 0,
    observacao: l.obs || null,
  };
};
export const DEF = (d: Date) => ({ e: '07:00', sa: '12:00', r: '13:00', s: d.getDay() === 5 ? '16:00' : '17:00' });

export interface CalcDia { carga: number; trab: number; normal: number; atraso: number; falta: number; he50: number; he100: number; erro: string }

export function calcDia(cal: Calendario, r: LinhaPonto | null | undefined, d: Date): CalcDia {
  const c = cal.carga(d);
  const tol = cal.jornada.tolerancia_min ?? 10;
  const o: CalcDia = { carga: c, trab: 0, normal: 0, atraso: 0, falta: 0, he50: 0, he100: 0, erro: '' };
  if (!r || linhaVazia(r)) return o;
  if (r.oc === 'TRABALHADO') {
    const t = (hm(r.sa) - hm(r.e)) + (hm(r.s) - hm(r.r));
    if (isNaN(t) || t <= 0) { o.erro = 'Marcações incompletas'; return o; }
    o.trab = t;
    if (cal.domFer(d)) o.he100 = t;
    else if (c === 0) o.he50 = t;
    else {
      const dif = t - c;
      if (Math.abs(dif) <= tol) o.normal = c;
      else if (dif > 0) { o.normal = c; o.he50 = dif; }
      else { o.normal = t; o.atraso = -dif; }
    }
  } else if (r.oc === 'FALTA') o.falta = c;
  else if (PAGO.includes(r.oc)) o.normal = c;
  return o;
}

export function horasObra(r: LinhaPonto | null | undefined, o: CalcDia) {
  if (!r || r.oc !== 'TRABALHADO' || !o.trab) return [] as { obra: string; min: number }[];
  const h2 = r.obra2 ? Math.min(+r.h2 || 0, o.trab) : 0;
  return [{ obra: r.obra, min: o.trab - h2 }, { obra: r.obra2, min: h2 }].filter((x) => x.obra && x.min > 0);
}

export interface ResumoPer {
  carga: number; trab: number; normal: number; atraso: number; falta: number; he50: number; he100: number;
  aus: number; dias: number; faltas: number; semLanc: number; erros: number; horas: Record<string, number>;
}

/** Soma do período para um funcionário. pontos: data(YYYY-MM-DD) -> linha */
export function resumoPer(cal: Calendario, k: string, admissao: Date, pontos: Record<string, LinhaPonto>, desligado = false, ate?: Date): ResumoPer {
  const t: ResumoPer = { carga: 0, trab: 0, normal: 0, atraso: 0, falta: 0, he50: 0, he100: 0, aus: 0, dias: 0, faltas: 0, semLanc: 0, erros: 0, horas: {} };
  const limite = ate || (() => { const x = new Date(); x.setHours(0, 0, 0, 0); return x; })();
  diasPer(k).forEach((d) => {
    if (d < admissao || d >= limite) return;
    const r = pontos[dk(d)];
    const o = calcDia(cal, r, d);
    t.carga += o.carga; t.trab += o.trab; t.normal += o.normal; t.atraso += o.atraso; t.falta += o.falta; t.he50 += o.he50; t.he100 += o.he100;
    if (r && AUSENCIA.includes(r.oc)) t.aus += o.carga;
    t.aus += o.atraso;
    if (r && r.oc === 'TRABALHADO' && o.trab) t.dias++;
    if (r && r.oc === 'FALTA') t.faltas++;
    if ((!r || linhaVazia(r)) && o.carga > 0 && !desligado) t.semLanc++;
    if (o.erro) t.erros++;
    horasObra(r, o).forEach((h) => (t.horas[h.obra] = (t.horas[h.obra] || 0) + h.min));
  });
  return t;
}

/** Valida as linhas antes de gravar (mesmas regras das constraints da tabela ponto) */
export function validaLinha(cal: Calendario, l: LinhaPonto, d: Date): string | null {
  if (linhaVazia(l)) return null;
  if (l.oc !== 'TRABALHADO') return null;
  const t = [l.e, l.sa, l.r, l.s].map(hm);
  if (t.some(isNaN) || !(t[0] < t[1] && t[1] <= t[2] && t[2] < t[3])) return 'marcações incompletas ou fora de ordem';
  if (!l.obra) return 'informe a obra do dia';
  if (l.obra2 || l.split) {
    const o = calcDia(cal, l, d);
    if (!l.obra2) return 'escolha a 2ª obra ou desfaça a divisão';
    if (l.obra2 === l.obra) return 'a 2ª obra é igual à 1ª';
    if (!(+l.h2 > 0) || +l.h2 >= o.trab) return 'horas da 2ª obra devem ser maiores que zero e menores que o total trabalhado';
  }
  return null;
}

export const canon = (r: LinhaPonto | null) => {
  if (!r || linhaVazia(r)) return 'null';
  const t = r.oc === 'TRABALHADO';
  return JSON.stringify({ oc: r.oc, e: t ? r.e : '', sa: t ? r.sa : '', r: t ? r.r : '', s: t ? r.s : '', obra: r.obra || '', obra2: t && r.h2 > 0 ? r.obra2 || '' : '', h2: t && r.obra2 ? +r.h2 || 0 : 0, obs: r.obs || '' });
};

export const tardeMin = (r: LinhaPonto) => { const t = hm(r.s) - hm(r.r); return isNaN(t) || t <= 0 ? 0 : t; };

export { pdk, dd };
