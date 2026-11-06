// Rateio da folha por obra (versão final do protótipo, aba RATEIO GERAL da planilha):
// custo de cada funcionário distribuído entre as obras na proporção das horas do ponto.
// INSS, FGTS, férias e 13º: valor real da folha (contabilidade) rateado pelo coeficiente
// valor ÷ (salários + HE − faltas); enquanto não informado, estimado pelo percentual.
import { addD, dd, dk, hoje, pdk } from './format';
import { periodo, resumoPer, type Calendario, type LinhaPonto, type ResumoPer } from './ponto';
import type { Competencia, Funcionario, Remuneracao, ValeAlimentacao } from './types';

export const ENC: ['ferias' | 'decimo' | 'inss' | 'fgts', string][] = [
  ['ferias', 'Provisão de férias + 1/3'], ['decimo', 'Provisão de 13º salário'], ['inss', 'INSS (parte da empresa)'], ['fgts', 'FGTS'],
];
export type EncKey = (typeof ENC)[number][0];

export const PCT_PADRAO = { ferias: 14.32, decimo: 10.7, inss: 26.8, fgts: 8 };

export interface ParamComp { pct: Record<EncKey, number>; real: Partial<Record<EncKey, number | null>> }
export function paramDe(c: Competencia | null | undefined): ParamComp {
  return {
    pct: { ferias: c?.pct_ferias ?? PCT_PADRAO.ferias, decimo: c?.pct_decimo ?? PCT_PADRAO.decimo, inss: c?.pct_inss ?? PCT_PADRAO.inss, fgts: c?.pct_fgts ?? PCT_PADRAO.fgts },
    real: { ferias: c?.valor_ferias ?? null, decimo: c?.valor_decimo ?? null, inss: c?.valor_inss ?? null, fgts: c?.valor_fgts ?? null },
  };
}

/** Vale-alimentação do mês civil da competência, com desconto por faltas (configuração vale_alimentacao) */
export function vaMes(va: ValeAlimentacao, valor: number, adm: Date, ym: string, pontos: Record<string, LinhaPonto>) {
  const [y, m] = ym.split('-').map(Number);
  const ini = new Date(y, m - 1, 1), fim = new Date(y, m, 0);
  if (adm > fim) return null;
  const de = adm > ini ? adm : ini;
  const base = va.dias_base || 30;
  const dias = Math.min(base, dd(de, fim) + 1);
  const T0 = hoje();
  let faltas = 0;
  for (let d = new Date(ini); d <= fim && d < T0; d = addD(d, 1)) if (pontos[dk(d)]?.oc === 'FALTA') faltas++;
  const prop = (valor * Math.min(dias, base)) / base;
  const pct = faltas === 0 ? 0 : faltas === 1 ? va.desconto_1_falta : faltas === 2 ? va.desconto_2_faltas : va.desconto_3_ou_mais;
  const desc = (prop * pct) / 100;
  return { dias, faltas, prop, desc, receber: prop - desc };
}

export interface Bruto { R: ResumoPer; vh: number; fr: number; base: number; he: number; desc: number; bruto: number; va: number }

export function brutoEmp(cal: Calendario, va: ValeAlimentacao, e: Funcionario, rem: Remuneracao | undefined, k: string, pontos: Record<string, LinhaPonto>): Bruto | null {
  const p = periodo(k);
  const adm = pdk(e.data_admissao);
  if (adm > p.fim) return null;
  const desl = e.data_desligamento ? pdk(e.data_desligamento) : null;
  if (desl && desl < p.ini) return null;
  const R = resumoPer(cal, k, adm, pontos, e.status === 'Desligado');
  const sal = rem?.salario || 0;
  const adic = (rem?.adicional_pct || 0) / 100;
  const vh = (sal * (1 + adic)) / 220;
  const de = adm > p.ini ? adm : p.ini;
  let ate = p.fim < hoje() ? p.fim : addD(hoje(), -1);
  if (desl && desl < ate) ate = desl;
  const totDias = dd(p.ini, p.fim) + 1;
  const fr = Math.max(0, Math.min(1, (dd(de, ate) + 1) / totDias));
  const base = sal * (1 + adic) * fr;
  const he = (R.he50 / 60) * vh * 1.5 + (R.he100 / 60) * vh * 2;
  const desc = ((R.falta + R.atraso) / 60) * vh;
  const v = vaMes(va, rem?.va_valor ?? 0, adm, k, pontos);
  return { R, vh, fr, base, he, desc, bruto: Math.max(0, base + he - desc), va: v ? v.receber * fr : 0 };
}

export interface Custo extends Bruto { ferias: number; decimo: number; inss: number; fgts: number; prov: number; enc: number; total: number }
export interface LinhaObra { obra: string; colabs: Set<string>; horas: number; sal: number; he: number; ferias: number; decimo: number; inss: number; fgts: number; prov: number; enc: number; va: number; total: number }

export function calcularRateio(o: {
  cal: Calendario; va: ValeAlimentacao; k: string; funcs: Funcionario[]; rem: Record<string, Remuneracao>;
  pontos: Record<string, Record<string, LinhaPonto>>; param: ParamComp; obraPadrao: (e: Funcionario) => string;
}) {
  const brutos = new Map<string, Bruto>();
  let tb = 0;
  o.funcs.forEach((e) => { const b = brutoEmp(o.cal, o.va, e, o.rem[e.id], o.k, o.pontos[e.id] || {}); if (b) { brutos.set(e.id, b); tb += b.bruto; } });
  const coef = { tb, fonte: {} as Record<EncKey, 'real' | 'estimado'> } as { tb: number; fonte: Record<EncKey, 'real' | 'estimado'> } & Record<EncKey, number>;
  ENC.forEach(([x]) => {
    const v = o.param.real[x];
    if (v != null && !isNaN(+v) && tb) { coef[x] = +v / tb; coef.fonte[x] = 'real'; }
    else { coef[x] = (o.param.pct[x] || 0) / 100; coef.fonte[x] = 'estimado'; }
  });
  const res: Record<string, LinhaObra> = {};
  const nova = (obra: string): LinhaObra => ({ obra, colabs: new Set(), horas: 0, sal: 0, he: 0, ferias: 0, decimo: 0, inss: 0, fgts: 0, prov: 0, enc: 0, va: 0, total: 0 });
  const custos = new Map<string, Custo>();
  const linhas: { e: Funcionario; obra: string; min: number; f: number; c: Custo }[] = [];
  let semLanc = 0, erros = 0;
  o.funcs.forEach((e) => {
    const b = brutos.get(e.id);
    if (!b) return;
    const c: Custo = { ...b, ferias: b.bruto * coef.ferias, decimo: b.bruto * coef.decimo, inss: b.bruto * coef.inss, fgts: b.bruto * coef.fgts, prov: 0, enc: 0, total: 0 };
    c.prov = c.ferias + c.decimo; c.enc = c.inss + c.fgts; c.total = c.bruto + c.prov + c.enc + c.va;
    custos.set(e.id, c);
    semLanc += b.R.semLanc; erros += b.R.erros;
    let hs = Object.entries(b.R.horas);
    const ht = hs.reduce((s, h) => s + h[1], 0);
    const sh = !ht;
    if (sh) { const ob = o.obraPadrao(e); hs = ob ? [[ob, 1]] : []; }
    const tot = ht || 1;
    hs.forEach(([ob, min]) => {
      const f = min / tot;
      const r = (res[ob] = res[ob] || nova(ob));
      r.colabs.add(e.id); r.horas += sh ? 0 : min;
      r.sal += (c.base - c.desc) * f; r.he += c.he * f;
      (['ferias', 'decimo', 'inss', 'fgts', 'va', 'prov', 'enc', 'total'] as const).forEach((x) => (r[x] += c[x] * f));
      linhas.push({ e, obra: ob, min: sh ? 0 : min, f, c });
    });
  });
  const porObra = Object.values(res);
  return { porObra, linhas, custos, total: porObra.reduce((s, x) => s + x.total, 0), semLanc, erros, coef };
}
export type Rateio = ReturnType<typeof calcularRateio>;
