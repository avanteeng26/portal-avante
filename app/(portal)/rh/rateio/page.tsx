'use client';
import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import type { ChartConfiguration } from 'chart.js';
import { useSessao } from '@/components/Sessao';
import { Carregando, Modal, Pill, SEM_PERM, SemPermissao, toast } from '@/components/ui';
import { Grafico } from '@/components/Grafico';
import { supabase } from '@/lib/supabase/client';
import { carregarFuncionarios, carregarPontos, carregarRemuneracoes, erroAmigavel, todas, ultimasObras } from '@/lib/dados';
import { BRL, BRL2, dk, fDT, N, P } from '@/lib/format';
import { compAtual, compLabel, kAdd, perLabel, periodo } from '@/lib/ponto';
import { ENC, PCT_PADRAO, calcularRateio, paramDe, type EncKey, type Rateio } from '@/lib/rateio';
import { registrarEvento } from '@/lib/audit';
import { downloadCSV } from '@/lib/print';
import type { Competencia, Funcionario, RateioFechamento, Remuneracao } from '@/lib/types';
import type { LinhaPonto } from '@/lib/ponto';

const F = ['sal', 'he', 'ferias', 'decimo', 'inss', 'fgts', 'va', 'total'] as const;

export default function RateioPage() {
  const S = useSessao();
  const atual = compAtual();
  const [comps, setComps] = useState<Competencia[]>([]);
  const [k, setK] = useState(kAdd(atual, -1));
  const [base, setBase] = useState<{ funcs: Funcionario[]; rem: Record<string, Remuneracao>; ult: Record<string, string> } | null>(null);
  const [pontos, setPontos] = useState<Record<string, Record<string, LinhaPonto>> | null>(null);
  const [snap, setSnap] = useState<RateioFechamento[] | null>(null);
  const [form, setForm] = useState<{ real: Record<EncKey, string>; pct: Record<EncKey, string> } | null>(null);
  const [f, setF] = useState({ q: '', multi: false });
  const [fechar, setFechar] = useState(false);
  const [busy, setBusy] = useState(false);
  const verSal = S.perm('salarios', 'ver');

  const lerComps = useCallback(async () => {
    const { data } = await supabase().from('competencias').select('*').order('id', { ascending: false });
    setComps((data || []) as Competencia[]);
  }, []);

  useEffect(() => {
    if (!S.perm('rateio', 'ver')) return;
    lerComps();
    Promise.all([carregarFuncionarios(), verSal ? carregarRemuneracoes() : Promise.resolve({}), ultimasObras()]).then(([funcs, rem, ult]) => setBase({ funcs, rem, ult }));
  }, [S, verSal, lerComps]);

  const comp = comps.find((c) => c.id === k) || null;
  const fechada = comp?.status === 'Fechada';

  useEffect(() => {
    if (!S.perm('rateio', 'ver')) return;
    setPontos(null); setSnap(null);
    const p = periodo(k);
    const [y, m] = k.split('-').map(Number);
    const fimMes = new Date(y, m, 0);
    carregarPontos(p.ini, fimMes > p.fim ? fimMes : p.fim).then((r) => setPontos(r.mapa));
    todas<RateioFechamento>((a, b) => supabase().from('rateio_fechamento').select('*').eq('competencia_id', k).range(a, b)).then(setSnap).catch(() => setSnap([]));
  }, [k, S]);

  useEffect(() => {
    const pr = paramDe(comp);
    setForm({
      real: Object.fromEntries(ENC.map(([x]) => [x, pr.real[x] != null ? String(pr.real[x]) : ''])) as Record<EncKey, string>,
      pct: Object.fromEntries(ENC.map(([x]) => [x, String(pr.pct[x])])) as Record<EncKey, string>,
    });
  }, [comp]);

  const R: Rateio | null = useMemo(() => {
    if (!base || !pontos || !form) return null;
    const param = {
      pct: Object.fromEntries(ENC.map(([x]) => [x, Number(form.pct[x]) || 0])) as Record<EncKey, number>,
      real: Object.fromEntries(ENC.map(([x]) => [x, form.real[x] === '' ? null : Number(form.real[x])])) as Record<EncKey, number | null>,
    };
    return calcularRateio({ cal: S.cal, va: S.cfg.va, k, funcs: base.funcs, rem: base.rem, pontos, param, obraPadrao: (e) => e.obra_referencia_id || base.ult[e.id] || '' });
  }, [base, pontos, form, k, S]);

  const lista = [...new Set([kAdd(atual, -3), kAdd(atual, -2), kAdd(atual, -1), atual, ...comps.map((c) => c.id)])].sort().reverse();
  const aberta = k === atual;
  const ed = (S.perm('rateio', 'editar') || S.perm('rateio', 'aprovar')) && !fechada;

  // Competência fechada: mostra a foto gravada no fechamento (não muda depois)
  const usarSnap = fechada && snap && snap.length > 0;
  const porObra = usarSnap ? agruparSnap(snap!) : R ? R.porObra : null;
  const ob = (porObra || []).filter((o) => o.total > 0 || o.horas > 0).sort((a, b) => b.total - a.total || b.horas - a.horas);
  const total = ob.reduce((s, o) => s + o.total, 0);

  const salvarParam = async () => {
    if (!form) return;
    setBusy(true);
    const p = periodo(k);
    const linha = {
      id: k, inicio: dk(p.ini), fim: dk(p.fim),
      valor_ferias: form.real.ferias === '' ? null : +form.real.ferias, valor_decimo: form.real.decimo === '' ? null : +form.real.decimo,
      valor_inss: form.real.inss === '' ? null : +form.real.inss, valor_fgts: form.real.fgts === '' ? null : +form.real.fgts,
      pct_ferias: +form.pct.ferias || 0, pct_decimo: +form.pct.decimo || 0, pct_inss: +form.pct.inss || 0, pct_fgts: +form.pct.fgts || 0,
    };
    const res = comp ? await supabase().from('competencias').update(linha).eq('id', k).select('id') : await supabase().from('competencias').insert({ ...linha, status: 'Aberta' }).select('id');
    setBusy(false);
    if (res.error) return toast(erroAmigavel(res.error.message));
    if (!res.data?.length) return toast(erroAmigavel('0 rows'));
    toast('Valores da folha salvos (registrados na auditoria)');
    lerComps();
  };

  const fecharOk = async () => {
    if (!R) return;
    setFechar(false); setBusy(true);
    const sb = supabase();
    const p = periodo(k);
    const linhas = new Map<string, RateioFechamento>();
    R.linhas.forEach(({ e, obra, min, f, c }) => {
      const kk = e.id + '|' + obra;
      const x = linhas.get(kk) || { competencia_id: k, funcionario_id: e.id, obra_id: obra, minutos: 0, salario: 0, horas_extras: 0, ferias: 0, decimo: 0, inss: 0, fgts: 0, va: 0, total: 0 };
      x.minutos += Math.round(min); x.salario += (c.base - c.desc) * f; x.horas_extras += c.he * f; x.ferias += c.ferias * f; x.decimo += c.decimo * f; x.inss += c.inss * f; x.fgts += c.fgts * f; x.va += c.va * f; x.total += c.total * f;
      linhas.set(kk, x);
    });
    const arr = [...linhas.values()].map((x) => ({ ...x, salario: r2(x.salario), horas_extras: r2(x.horas_extras), ferias: r2(x.ferias), decimo: r2(x.decimo), inss: r2(x.inss), fgts: r2(x.fgts), va: r2(x.va), total: r2(x.total) }));
    const c1 = comp
      ? await sb.from('competencias').update({ status: 'Fechada', fechada_por: S.usuario.id, fechada_em: new Date().toISOString() }).eq('id', k).select('id')
      : await sb.from('competencias').insert({ id: k, inicio: dk(p.ini), fim: dk(p.fim), status: 'Fechada', fechada_por: S.usuario.id, fechada_em: new Date().toISOString(), pct_ferias: +form!.pct.ferias, pct_decimo: +form!.pct.decimo, pct_inss: +form!.pct.inss, pct_fgts: +form!.pct.fgts }).select('id');
    if (c1.error) { setBusy(false); return toast(erroAmigavel(c1.error.message)); }
    if (!c1.data?.length) { setBusy(false); return toast(erroAmigavel('0 rows')); }
    for (let i = 0; i < arr.length; i += 500) {
      const { error } = await sb.from('rateio_fechamento').upsert(arr.slice(i, i + 500), { onConflict: 'competencia_id,funcionario_id,obra_id' });
      if (error) { setBusy(false); toast('Competência fechada, mas a foto do rateio não foi gravada: ' + erroAmigavel(error.message)); lerComps(); return; }
    }
    // remove linhas antigas que não existem mais (se houve reabertura)
    const vivas = new Set(arr.map((x) => x.funcionario_id + '|' + x.obra_id));
    const velhas = (snap || []).filter((x) => !vivas.has(x.funcionario_id + '|' + x.obra_id));
    for (const v of velhas) await sb.from('rateio_fechamento').delete().eq('competencia_id', k).eq('funcionario_id', v.funcionario_id).eq('obra_id', v.obra_id);
    registrarEvento('Fechou competência', compLabel(k) + ' · ' + BRL2(R.total) + ' · ' + arr.length + ' linhas');
    setBusy(false); toast('Competência ' + compLabel(k) + ' fechada. O ponto do período fica bloqueado.');
    await lerComps();
    todas<RateioFechamento>((a, b) => sb.from('rateio_fechamento').select('*').eq('competencia_id', k).range(a, b)).then(setSnap);
  };

  const reabrir = async () => {
    if (!confirm('Reabrir a competência ' + compLabel(k) + '? O ponto do período volta a aceitar alterações e a foto do rateio será refeita no próximo fechamento.')) return;
    const { data, error } = await supabase().from('competencias').update({ status: 'Aberta', fechada_por: null, fechada_em: null }).eq('id', k).select('id');
    if (error) return toast(erroAmigavel(error.message));
    if (!data?.length) return toast(erroAmigavel('0 rows'));
    registrarEvento('Reabriu competência', compLabel(k));
    toast('Competência reaberta'); lerComps();
  };

  const exportar = () => {
    if (!R) return;
    const cols = ob.map((o) => o.obra);
    const L = base!.funcs.map((e) => ({ e, c: R.custos.get(e.id) })).filter((x) => x.c);
    const pob = (o: string) => ob.find((x) => x.obra === o)!;
    const rows: (string | number)[][] = [
      ['CUSTO DE MÃO DE OBRA - ' + perLabel(k)],
      ['FUNCIONÁRIO', 'SALÁRIO + HE', 'TOTAL HT', 'VALOR HORA', ...cols.flatMap((c) => [S.obraNome(c) + ' HORAS TRAB', S.obraNome(c) + ' VALOR'])],
      ...L.map(({ e, c }) => { const ht = Object.values(c!.R.horas).reduce((s, v) => s + v, 0) / 60; const vh = ht ? c!.bruto / ht : 0; return [e.nome, N(c!.bruto, 2), N(ht, 2), N(vh, 2), ...cols.flatMap((o) => { const h = (c!.R.horas[o] || 0) / 60; return [h ? N(h, 2) : '', h ? N(h * vh, 2) : '']; })]; }),
      [],
      ['TOTAL', '', '', '', ...cols.flatMap((o) => [N(pob(o).horas / 60, 2), N(pob(o).sal + pob(o).he, 2)])],
      ...ENC.map(([x, l]) => [l.toUpperCase(), N(ob.reduce((s, o) => s + o[x], 0), 2), 'COEF. ' + N(R.coef[x] * 100, 4) + '%', R.coef.fonte[x], ...cols.flatMap((o) => ['', N(pob(o)[x], 2)])]),
      ['VALE-ALIMENTAÇÃO', '', '', '', ...cols.flatMap((o) => ['', N(pob(o).va, 2)])],
      ['CUSTO TOTAL DA OBRA', '', '', '', ...cols.flatMap((o) => ['', N(pob(o).total, 2)])],
    ];
    downloadCSV('rateio_' + k + '.csv', rows);
    registrarEvento('Exportou rateio', compLabel(k));
  };

  const chartCfg = useCallback((pal: string[]): ChartConfiguration => ({
    type: 'bar',
    data: { labels: ob.map((o) => S.obraNome(o.obra)), datasets: ([['Salários', 'sal'], ['H. extras', 'he'], ['Férias', 'ferias'], ['13º', 'decimo'], ['INSS', 'inss'], ['FGTS', 'fgts'], ['VA', 'va']] as [string, (typeof F)[number]][]).map(([l, x], i) => ({ label: l, data: ob.map((o) => Math.round(o[x])), backgroundColor: pal[i] })) },
    options: { scales: { x: { stacked: true }, y: { stacked: true, ticks: { callback: (v) => N(+v / 1000) + ' mil' } } }, plugins: { tooltip: { callbacks: { label: (c) => c.dataset.label + ': ' + BRL(c.raw as number) } } } },
  }), [JSON.stringify(ob.map((o) => [o.obra, o.total]))]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!S.perm('rateio', 'ver')) return <SemPermissao />;
  return (
    <>
      <h1>Rateio da folha por obra</h1>
      <p className="sub">Ao fim de cada período de apuração (dia 21 ao dia 20), o custo de mão de obra é distribuído entre as obras na proporção das horas lançadas no ponto, como na aba RATEIO GERAL da planilha.</p>
      <div className="toolbar">
        <select value={k} onChange={(e) => setK(e.target.value)}>
          {lista.map((x) => <option key={x} value={x}>{compLabel(x)} · {perLabel(x)}{comps.find((c) => c.id === x)?.status === 'Fechada' ? ' · fechada' : x === atual ? ' · em apuração' : ''}</option>)}
        </select>
        <span className="sp" />
        {fechada ? <><Pill t={'Competência fechada' + (comp?.fechada_em ? ' em ' + fDT(comp.fechada_em) : '')} c="neutral" />{S.perm('rateio', 'aprovar') && <button className="btn sm" onClick={reabrir}>Reabrir</button>}</>
          : aberta ? <Pill t="Período em apuração: parcial até ontem" c="info" />
            : <button className="btn sm primary" disabled={!S.perm('rateio', 'aprovar') || !R || !verSal || busy} title={S.perm('rateio', 'aprovar') ? '' : SEM_PERM} onClick={() => setFechar(true)}>Fechar competência</button>}
        <button className="btn sm" disabled={!S.perm('rateio', 'exportar') || !R || !verSal} title={S.perm('rateio', 'exportar') ? '' : SEM_PERM} onClick={exportar}>Exportar no formato da planilha</button>
      </div>

      {!verSal && !usarSnap && <div className="note">Seu perfil não vê salários, por isso o rateio mostra apenas as horas por obra. Os valores aparecem depois que o RH fechar a competência.</div>}

      {verSal && form && R && (
        <div className="card">
          <h3>INSS, FGTS, férias e 13º de {compLabel(k)}</h3>
          <p className="small muted" style={{ marginTop: -6 }}>Informe os valores da folha enviados pela contabilidade. Cada um é rateado entre as obras proporcionalmente ao salário + horas extras de cada uma (o mesmo coeficiente da planilha). Enquanto um valor não for informado, o portal estima pelo percentual.</p>
          <div className="tablewrap"><table>
            <thead><tr><th>Item</th><th className="num">Valor da folha (R$)</th><th className="num">Percentual estimado</th><th>Em uso</th><th className="num">Coeficiente</th><th className="num">Total rateado</th></tr></thead>
            <tbody>
              {ENC.map(([x, l]) => (
                <tr key={x}>
                  <td><b>{l}</b></td>
                  <td className="num"><input type="number" step="0.01" placeholder="não informado" style={{ width: 150, textAlign: 'right' }} disabled={!ed} value={form.real[x]} onChange={(e) => setForm({ ...form, real: { ...form.real, [x]: e.target.value } })} /></td>
                  <td className="num"><input type="number" step="0.01" style={{ width: 80, textAlign: 'right' }} disabled={!ed || R.coef.fonte[x] === 'real'} value={form.pct[x]} onChange={(e) => setForm({ ...form, pct: { ...form.pct, [x]: e.target.value } })} /> %</td>
                  <td>{R.coef.fonte[x] === 'real' ? <Pill t="Valor real" c="ok" /> : <Pill t="Estimado" c="warn" />}</td>
                  <td className="num">{N(R.coef[x] * 100, 2)}%</td>
                  <td className="num"><b>{BRL2(R.porObra.reduce((s, o) => s + o[x], 0))}</b></td>
                </tr>
              ))}
            </tbody>
          </table></div>
          <div className="toolbar mt" style={{ marginBottom: 0 }}>
            <span className="small muted">Base de cálculo (salários + horas extras − faltas) do período: {BRL2(R.coef.tb)}. Padrões: férias {P(PCT_PADRAO.ferias, 2)}, 13º {P(PCT_PADRAO.decimo, 1)}, INSS {P(PCT_PADRAO.inss, 1)}, FGTS {P(PCT_PADRAO.fgts, 0)}.</span>
            <span className="sp" />{ed && <button className="btn sm primary" disabled={busy} onClick={salvarParam}>Salvar valores da folha</button>}
          </div>
        </div>
      )}

      {R && !usarSnap && (R.semLanc > 0 || R.erros > 0) && (
        <div className="note mt">{R.semLanc > 0 && <><b>{R.semLanc}</b> dia(s) úteis sem lançamento de ponto neste período. </>}{R.erros > 0 && <><b>{R.erros}</b> dia(s) com marcação incompleta. </>}Revise antes de fechar: dias sem lançamento não entram nas horas.</div>
      )}

      {!porObra ? <Carregando /> : (
        <>
          <div className="card mt tablewrap">
            <h3>Resumo por obra · {compLabel(k)}{usarSnap && <span className="small muted"> (foto do fechamento)</span>}</h3>
            <table>
              <thead><tr><th>Obra</th><th className="num">Pessoas</th><th className="num">Horas</th><th className="num">Salários</th><th className="num">H. extras</th><th className="num">Férias</th><th className="num">13º</th><th className="num">INSS</th><th className="num">FGTS</th><th className="num">VA</th><th className="num">Total</th><th className="num">%</th></tr></thead>
              <tbody>
                {ob.map((o) => (
                  <tr key={o.obra}><td>{S.obraNome(o.obra)}</td><td className="num">{o.colabs.size}</td><td className="num">{N(o.horas / 60)}</td>
                    {F.map((x) => <td key={x} className="num">{x === 'total' ? <b>{BRL(o[x])}</b> : BRL(o[x])}</td>)}<td className="num">{total ? P((o.total / total) * 100) : '—'}</td></tr>
                ))}
                {!ob.length && <tr><td colSpan={12} className="muted">Sem horas lançadas neste período.</td></tr>}
              </tbody>
              <tfoot><tr><td>Total</td><td /><td className="num">{N(ob.reduce((s, o) => s + o.horas, 0) / 60)}</td>{F.map((x) => <td key={x} className="num">{BRL(ob.reduce((s, o) => s + o[x], 0))}</td>)}<td className="num">100%</td></tr></tfoot>
            </table>
          </div>
          {total > 0 && <div className="card mt"><h3>Composição do custo por obra</h3><Grafico config={chartCfg} /></div>}
          {R && base && (
            <div className="card mt">
              <div className="toolbar"><h3 style={{ margin: 0 }}>Horas por funcionário e obra</h3><span className="sp" />
                <input placeholder="Buscar funcionário" value={f.q} onChange={(e) => setF({ ...f, q: e.target.value })} />
                <label className="check" style={{ margin: 0 }}><input type="checkbox" checked={f.multi} onChange={(e) => setF({ ...f, multi: e.target.checked })} /> Só quem passou por mais de uma obra</label>
              </div>
              <TabelaFunc R={R} funcs={base.funcs} cols={ob.map((o) => o.obra)} f={f} k={k} verSal={verSal} />
              <p className="small muted">Valor-hora = custo total do funcionário ÷ horas trabalhadas no período. Quem não trabalhou nenhuma hora (férias, afastamento) tem o custo lançado na obra de referência do cadastro.</p>
            </div>
          )}
        </>
      )}
      {fechar && R && (
        <Modal onClose={() => setFechar(false)}>
          <h2>Fechar {compLabel(k)}?</h2>
          <p>Total de {BRL2(R.total)} rateado entre {ob.length} obra(s). A foto do rateio é gravada e o ponto de {perLabel(k)} fica bloqueado para alterações até a competência ser reaberta.</p>
          {(R.semLanc > 0 || R.erros > 0) && <div className="note">Atenção: {R.semLanc} dia(s) útil(eis) sem lançamento e {R.erros} com marcação incompleta.</div>}
          {ENC.some(([x]) => R.coef.fonte[x] !== 'real') && <div className="note">Há valores estimados por percentual ({ENC.filter(([x]) => R.coef.fonte[x] !== 'real').map(([, l]) => l).join(', ')}). Se a contabilidade já enviou a folha, informe os valores reais antes de fechar.</div>}
          <div className="modal-actions"><button className="btn" onClick={() => setFechar(false)}>Cancelar</button><button className="btn primary" onClick={fecharOk}>Fechar competência</button></div>
        </Modal>
      )}
    </>
  );
}

const r2 = (v: number) => Math.round(v * 100) / 100;

function agruparSnap(L: RateioFechamento[]) {
  const m: Record<string, { obra: string; colabs: Set<string>; horas: number; sal: number; he: number; ferias: number; decimo: number; inss: number; fgts: number; va: number; total: number }> = {};
  L.forEach((x) => {
    const o = (m[x.obra_id] = m[x.obra_id] || { obra: x.obra_id, colabs: new Set(), horas: 0, sal: 0, he: 0, ferias: 0, decimo: 0, inss: 0, fgts: 0, va: 0, total: 0 });
    o.colabs.add(x.funcionario_id); o.horas += x.minutos; o.sal += +x.salario; o.he += +x.horas_extras; o.ferias += +x.ferias; o.decimo += +x.decimo; o.inss += +x.inss; o.fgts += +x.fgts; o.va += +x.va; o.total += +x.total;
  });
  return Object.values(m);
}

function TabelaFunc({ R, funcs, cols, f, k, verSal }: { R: Rateio; funcs: Funcionario[]; cols: string[]; f: { q: string; multi: boolean }; k: string; verSal: boolean }) {
  const S = useSessao();
  const q = f.q.toLowerCase();
  const L = funcs.map((e) => ({ e, c: R.custos.get(e.id) })).filter((x) => x.c && (!q || (x.e.nome + x.e.matricula).toLowerCase().includes(q)) && (!f.multi || Object.keys(x.c.R.horas).length > 1));
  return (
    <div className="tablewrap">
      <table>
        <thead><tr><th>Funcionário</th>{verSal && <><th className="num">Custo total</th></>}<th className="num">Horas trab.</th>{verSal && <th className="num">Valor-hora</th>}{cols.map((c) => <th key={c} className="num" style={{ whiteSpace: 'normal', minWidth: 80 }}>{S.obraNome(c)}</th>)}</tr></thead>
        <tbody>
          {L.map(({ e, c }) => {
            const ht = Object.values(c!.R.horas).reduce((s, v) => s + v, 0);
            return (
              <tr key={e.id}>
                <td><Link href={`/rh/ponto?aba=espelho&f=${e.id}&c=${k}`} style={{ color: 'var(--accent)' }}>{e.nome}</Link><div className="small muted">{S.funcaoNome(e.funcao_id)}</div></td>
                {verSal && <td className="num">{BRL(c!.total)}</td>}
                <td className="num">{N(ht / 60, 1)}</td>
                {verSal && <td className="num">{ht ? BRL2(c!.total / (ht / 60)) : '—'}</td>}
                {cols.map((o) => <td key={o} className="num">{c!.R.horas[o] ? N(c!.R.horas[o] / 60, 1) : ''}</td>)}
              </tr>
            );
          })}
        </tbody>
      </table>
      <p className="small muted">{L.length} funcionários</p>
    </div>
  );
}
