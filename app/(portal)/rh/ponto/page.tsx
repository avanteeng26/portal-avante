'use client';
import { Suspense, useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useSessao } from '@/components/Sessao';
import { Carregando, Modal, Pill, SEM_PERM, SemPermissao, toast } from '@/components/ui';
import { supabase } from '@/lib/supabase/client';
import { carregarFuncionarios, carregarPontos, erroAmigavel, todas, ultimasObras } from '@/lib/dados';
import { addD, DOW, dk, fD, fDT, fm, fmh, hoje, pdk } from '@/lib/format';
import {
  DEF, OC, VAZIO, calcDia, canon, compAtual, compLabel, compOf, diasPer, horasObra, kAdd, linhaVazia, ocNome, paraBanco, perLabel, periodo,
  tardeMin, validaLinha, type CalcDia, type LinhaPonto,
} from '@/lib/ponto';
import { espelhoExcel } from '@/lib/espelho';
import { registrarEvento } from '@/lib/audit';
import { downloadCSV, logoDataURL, printHTML } from '@/lib/print';
import type { Competencia, Funcionario, PontoDiaStatus } from '@/lib/types';

type Sess = ReturnType<typeof useSessao>;
const key = (fid: string, d: string) => fid + '|' + d;
const splitKey = (k: string) => { const [fid, d] = k.split('|'); return { fid, d }; };

export default function PontoPage() {
  return <Suspense fallback={<Carregando />}><Ponto /></Suspense>;
}

function Ponto() {
  const S = useSessao();
  const sp = useSearchParams();
  const [aba, setAba] = useState(sp.get('aba') || 'dia');
  const [funcs, setFuncs] = useState<Funcionario[] | null>(null);
  const [ult, setUlt] = useState<Record<string, string>>({});
  const [fechadas, setFechadas] = useState<Set<string>>(new Set());
  useEffect(() => {
    if (!S.perm('ponto', 'ver')) return;
    Promise.all([carregarFuncionarios(), ultimasObras(), supabase().from('competencias').select('id, status')]).then(([F, U, C]) => {
      setFuncs(F); setUlt(U);
      setFechadas(new Set(((C.data || []) as Pick<Competencia, 'id' | 'status'>[]).filter((c) => c.status === 'Fechada').map((c) => c.id)));
    }).catch((e) => toast(String(e.message || e)));
  }, [S]);

  if (!S.perm('ponto', 'ver')) return <SemPermissao />;
  const k = compAtual();
  const p = periodo(k);
  const falta = Math.round((p.fim.getTime() - hoje().getTime()) / 864e5);

  return (
    <>
      <h1>Folha de ponto</h1>
      <p className="sub">A obra é escolhida a cada dia, para cada funcionário. Se ele trabalhou em duas obras no mesmo dia, use &quot;Dividir dia&quot; e informe as horas da 2ª obra. Regras da planilha da Avante: período de 21 a 20, 9h de segunda a quinta, 8h na sexta, sábado = HE 50%, domingo e feriado = HE 100%.</p>
      <div className="note">Período de apuração atual: <b>{perLabel(k)}</b> (competência {compLabel(k)}) · {falta > 0 ? 'termina em ' + falta + ' dia(s)' : falta === 0 ? 'termina hoje' : 'encerrado'}. No dia 21 começa automaticamente a próxima apuração; feche o período anterior em <Link className="lp-link" href="/rh/rateio">Rateio da folha</Link>.</div>
      <div className="tabs">
        {[['dia', 'Lançamento diário'], ['espelho', 'Espelho de ponto'], ['sit', 'Situação dos lançamentos']].map((t) => (
          <button key={t[0]} className={'btn sm ' + (aba === t[0] ? 'primary' : '')} onClick={() => setAba(t[0])}>{t[1]}</button>
        ))}
      </div>
      {!funcs ? <Carregando /> : aba === 'dia' ? <Dia funcs={funcs} ult={ult} fechadas={fechadas} />
        : aba === 'espelho' ? <Espelho funcs={funcs} ult={ult} fechadas={fechadas} fid0={sp.get('f')} comp0={sp.get('c')} />
          : <Situacao funcs={funcs} onIr={(d) => { window.history.replaceState(null, '', '/rh/ponto?aba=dia&d=' + d); setAba('dia'); }} />}
    </>
  );
}

// ---------------------------------------------------------------- linha editável
function CalcCell({ o, nome }: { o: CalcDia | null; nome?: (id: string) => string }) {
  void nome;
  if (!o) return <span className="muted small">não lançado</span>;
  if (o.erro) return <Pill t={o.erro} c="bad" />;
  const p: ReactNode[] = [];
  if (o.trab) p.push(<b key="t">{fm(o.trab)}</b>);
  if (o.he50) p.push(<Pill key="h5" t={'+' + fm(o.he50) + ' 50%'} c="warn" />);
  if (o.he100) p.push(<Pill key="h1" t={'+' + fm(o.he100) + ' 100%'} c="bad" />);
  if (o.atraso) p.push(<Pill key="a" t={'-' + fm(o.atraso) + ' atraso'} c="warn" />);
  if (o.falta) p.push(<Pill key="f" t="Falta" c="bad" />);
  if (!p.length) p.push(o.normal ? <span key="n" className="muted small">abonado {fm(o.normal)}</span> : <span key="n" className="muted small">—</span>);
  return <>{p.map((x, i) => <span key={i}>{x} </span>)}</>;
}

function Linha({ S, first, r, d, lock, set }: { S: Sess; first: ReactNode; r: LinhaPonto; d: Date; lock: boolean; set: (r: LinhaPonto) => void }) {
  const tN = r.oc === 'TRABALHADO';
  const o = linhaVazia(r) ? null : calcDia(S.cal, r, d);
  const semObra = tN && (r.e || r.s) && !r.obra;
  const obras = S.obrasUser;
  const opts = (ph: string) => [<option key="" value="">{ph}</option>, ...obras.map((x) => <option key={x.id} value={x.id}>{x.nome}</option>)];
  const ti = (f: 'e' | 'sa' | 'r' | 's') => <input type="time" style={{ width: 96 }} disabled={!tN || lock} value={r[f]} onChange={(e) => set({ ...r, [f]: e.target.value })} />;
  const mudaOc = (v: LinhaPonto['oc']) => {
    let n: LinhaPonto = { ...r, oc: v };
    if (v === 'TRABALHADO' && !r.e && S.cal.carga(d) > 0) n = { ...n, ...DEF(d) };
    if (v !== 'TRABALHADO') n = { ...n, obra2: '', h2: 0, split: false };
    set(n);
  };
  const tot = o ? o.trab : 0;
  const h2 = Math.min(+r.h2 || 0, tot);
  return (
    <tr>
      {first}
      <td><select style={{ width: 150 }} disabled={lock} value={r.oc} onChange={(e) => mudaOc(e.target.value as LinhaPonto['oc'])}>{OC.map((x) => <option key={x[0]} value={x[0]}>{x[1]}</option>)}</select></td>
      <td>{ti('e')}</td><td>{ti('sa')}</td><td>{ti('r')}</td><td>{ti('s')}</td>
      <td className="num"><CalcCell o={o} /></td>
      <td><select disabled={lock} style={{ width: 190, ...(semObra ? { borderColor: 'var(--bad)' } : {}) }} value={r.obra} onChange={(e) => set({ ...r, obra: e.target.value })}>
        {opts('Selecione a obra…')}
        {r.obra && !obras.some((x) => x.id === r.obra) && <option value={r.obra}>{S.obraNome(r.obra)}</option>}
      </select></td>
      <td style={{ minWidth: 150 }}>
        {!tN ? <span className="muted small">—</span>
          : !r.obra2 && !r.split ? (lock ? null : <button className="btn sm" title="Trabalhou em duas obras neste dia" onClick={() => set({ ...r, split: true, obra2: '', h2: tardeMin(r) })}>Dividir dia</button>)
            : <>
              <div className="split">
                <select disabled={lock} value={r.obra2} onChange={(e) => set({ ...r, obra2: e.target.value })}>{opts('2ª obra…')}</select>
                <input type="number" step="0.25" min="0" disabled={lock} placeholder="horas" title="Horas trabalhadas na 2ª obra" value={r.h2 ? +(r.h2 / 60).toFixed(2) : ''} onChange={(e) => set({ ...r, h2: e.target.value === '' ? 0 : Math.round(+e.target.value * 60) })} />
                {!lock && <button className="btn sm" aria-label="Desfazer divisão" title="Desfazer divisão" onClick={() => set({ ...r, split: false, obra2: '', h2: 0 })}>✕</button>}
              </div>
              <div className="small muted">{r.obra && r.obra2 && tot ? S.obraNome(r.obra) + ' ' + fmh(tot - h2) + ' · ' + S.obraNome(r.obra2) + ' ' + fmh(h2) : 'informe a obra e as horas'}</div>
            </>}
      </td>
      <td><input disabled={lock} placeholder="Deslocamento, integração…" style={{ minWidth: 160 }} value={r.obs} onChange={(e) => set({ ...r, obs: e.target.value })} /></td>
    </tr>
  );
}

const PHEAD = (c1: string) => (
  <thead><tr><th>{c1}</th><th>Ocorrência</th><th>Entrada</th><th>Saída</th><th>Entrada</th><th>Saída</th><th className="num">Trabalhado</th><th>Obra do dia</th><th>Dividir o dia</th><th>Atividade / observação</th></tr></thead>
);

/** Grava as linhas alteradas: upsert das preenchidas, exclusão das esvaziadas. */
async function gravar(orig: Record<string, LinhaPonto | null>, draft: Record<string, LinhaPonto>) {
  const sb = supabase();
  const up: ReturnType<typeof paraBanco>[] = [];
  const del: { fid: string; d: string }[] = [];
  const ch: string[] = [];
  Object.entries(draft).forEach(([k, r]) => {
    if (canon(orig[k] || null) === canon(r)) return;
    const { fid, d } = splitKey(k);
    ch.push(k);
    if (linhaVazia(r)) { if (orig[k]) del.push({ fid, d }); }
    else up.push(paraBanco(fid, d, r));
  });
  if (up.length) {
    const { error } = await sb.from('ponto').upsert(up, { onConflict: 'funcionario_id,data' });
    if (error) throw new Error(erroAmigavel(error.message));
  }
  for (const x of del) {
    const { data, error } = await sb.from('ponto').delete().eq('funcionario_id', x.fid).eq('data', x.d).select('id');
    if (error) throw new Error(erroAmigavel(error.message));
    if (!data?.length) throw new Error('Seu perfil não tem permissão para apagar lançamentos de ponto. Em vez de limpar a linha, use a ocorrência correta (ex.: Falta).');
  }
  return ch;
}

function erros(S: Sess, draft: Record<string, LinhaPonto>, rotulo: (k: string) => string) {
  const out: string[] = [];
  Object.entries(draft).forEach(([k, r]) => { const v = validaLinha(S.cal, r, pdk(splitKey(k).d)); if (v) out.push(rotulo(k) + ': ' + v); });
  return out;
}

function ModalErros({ L, onClose }: { L: string[]; onClose: () => void }) {
  return (
    <Modal onClose={onClose}>
      <h2>Corrija antes de salvar</h2>
      <ul>{L.slice(0, 12).map((x) => <li key={x}>{x}</li>)}</ul>{L.length > 12 && <p className="muted">+ {L.length - 12} outros</p>}
      <div className="modal-actions"><button className="btn primary" onClick={onClose}>OK</button></div>
    </Modal>
  );
}

// ---------------------------------------------------------------- lançamento diário
function Dia({ funcs, ult, fechadas }: { funcs: Funcionario[]; ult: Record<string, string>; fechadas: Set<string> }) {
  const S = useSessao();
  const sp = useSearchParams();
  const [data, setData] = useState(sp.get('d') || dk(hoje()));
  const [orig, setOrig] = useState<Record<string, LinhaPonto | null> | null>(null);
  const [draft, setDraft] = useState<Record<string, LinhaPonto>>({});
  const [st, setSt] = useState<PontoDiaStatus | null>(null);
  const [stNome, setStNome] = useState('');
  const [f, setF] = useState({ q: '', obra: '' });
  const [errs, setErrs] = useState<string[] | null>(null);
  const [busy, setBusy] = useState(false);
  const d = pdk(data);
  const todasObras = S.usuario.todas_obras || S.perfil.master;

  const carregar = useCallback(async () => {
    setOrig(null);
    const sb = supabase();
    const [{ mapa }, s] = await Promise.all([carregarPontos(d, d), sb.from('ponto_dia_status').select('*').eq('data', data).maybeSingle()]);
    const o: Record<string, LinhaPonto | null> = {};
    Object.entries(mapa).forEach(([fid, m]) => { o[key(fid, data)] = m[data] || null; });
    setOrig(o); setDraft({}); setSt((s.data as PontoDiaStatus) || null);
    if (s.data?.usuario_id) { const { data: u } = await sb.from('usuarios').select('nome').eq('id', s.data.usuario_id).maybeSingle(); setStNome(u?.nome || ''); } else setStNome('');
  }, [data]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { carregar(); }, [carregar]);

  const lista = useMemo(() => {
    if (!orig) return [];
    const q = f.q.toLowerCase();
    return funcs.filter((e) => (e.status !== 'Desligado' || (e.data_desligamento && e.data_desligamento >= data)) && e.data_admissao <= data).filter((e) => {
      const r = draft[key(e.id, data)] || orig[key(e.id, data)];
      if (!todasObras) {
        if (r && r.obra) { if (!S.obraLiberada(r.obra) && !S.obraLiberada(r.obra2 || '__')) return false; }
        else if (!S.obraLiberada(ult[e.id] || e.obra_referencia_id || '__')) return false;
      }
      if (q && !(e.nome + ' ' + e.matricula + ' ' + S.funcaoNome(e.funcao_id)).toLowerCase().includes(q)) return false;
      if (f.obra === '__sem') return !r || linhaVazia(r);
      if (f.obra && !(r && (r.obra === f.obra || r.obra2 === f.obra))) return false;
      return true;
    });
  }, [funcs, orig, draft, f, data, ult]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!orig) return <Carregando />;
  const aprov = st?.status === 'Aprovado';
  const fechada = fechadas.has(compOf(d));
  const lock = aprov || fechada || !S.perm('ponto', 'editar');
  const linha = (fid: string) => draft[key(fid, data)] || orig[key(fid, data)] || VAZIO();
  const set = (fid: string, r: LinhaPonto) => setDraft({ ...draft, [key(fid, data)]: r });
  const sujo = Object.entries(draft).some(([k, r]) => canon(orig[k] || null) !== canon(r));
  const c = S.cal.carga(d);
  const tipo = S.cal.isFer(d) ? 'Feriado: horas = HE 100%' : d.getDay() === 0 ? 'Domingo: horas = HE 100%' : d.getDay() === 6 ? 'Sábado: horas = HE 50%' : 'Jornada de ' + fm(c);
  const t = { pres: 0, aus: 0, nl: 0, semObra: 0, div: 0 };
  lista.forEach((e) => { const r = linha(e.id); if (linhaVazia(r)) t.nl++; else if (r.oc === 'TRABALHADO') { t.pres++; if (!r.obra) t.semObra++; if (r.obra2) t.div++; } else t.aus++; });

  const irPara = (n: string) => { if (sujo && !confirm('Há alterações não salvas. Descartar?')) return; setData(n); };
  const padrao = () => {
    const nd = { ...draft }; let n = 0;
    lista.forEach((e) => { const r = linha(e.id); if (c > 0 && linhaVazia(r)) { nd[key(e.id, data)] = { ...r, ...DEF(d) }; n++; } });
    setDraft(nd); toast(n ? n + ' linha(s) com 07:00–12:00 / 13:00–17:00 (sexta até 16:00). Falta escolher a obra.' : 'Nenhuma linha vazia para preencher');
  };
  const repetir = async () => {
    const ids = lista.filter((e) => { const r = linha(e.id); return !r.obra && r.oc === 'TRABALHADO'; }).map((e) => e.id);
    if (!ids.length) return toast('Todos já têm obra');
    const { data: L } = await supabase().from('ponto').select('funcionario_id, obra_id, data').in('funcionario_id', ids).eq('ocorrencia', 'TRABALHADO').lt('data', data).gte('data', dk(addD(d, -10))).order('data', { ascending: false });
    const m: Record<string, string> = {};
    (L || []).forEach((p: { funcionario_id: string; obra_id: string | null }) => { if (p.obra_id && !m[p.funcionario_id]) m[p.funcionario_id] = p.obra_id; });
    const nd = { ...draft }; let n = 0;
    ids.forEach((fid) => { if (m[fid]) { nd[key(fid, data)] = { ...linha(fid), obra: m[fid] }; n++; } });
    setDraft(nd); toast(n + ' funcionário(s) com a obra do último dia trabalhado. Confira antes de salvar.');
  };
  const salvar = async (status: PontoDiaStatus['status']) => {
    const nome = (k: string) => funcs.find((x) => x.id === splitKey(k).fid)?.nome || '';
    const er = erros(S, draft, nome);
    if (er.length) return setErrs(er);
    setBusy(true);
    try {
      const ch = await gravar(orig, draft);
      const { error } = await supabase().from('ponto_dia_status').upsert({ data, status, usuario_id: S.usuario.id, em: new Date().toISOString() });
      if (error) throw new Error(erroAmigavel(error.message));
      registrarEvento(status === 'Enviado' ? 'Enviou ponto para aprovação' : status === 'Aprovado' ? 'Salvou e aprovou ponto do dia' : 'Salvou ponto do dia', fD(d) + ' · ' + ch.length + ' alteração(ões)');
      toast(status === 'Enviado' ? 'Ponto enviado para aprovação' : status === 'Aprovado' ? 'Dia aprovado' : 'Rascunho salvo');
      await carregar();
    } catch (e) { toast(String((e as Error).message)); }
    setBusy(false);
  };
  const aprovar = async () => {
    if (sujo && S.perm('ponto', 'editar')) return salvar('Aprovado');
    const { error } = await supabase().from('ponto_dia_status').upsert({ data, status: 'Aprovado', usuario_id: S.usuario.id, em: new Date().toISOString() });
    if (error) return toast(erroAmigavel(error.message));
    registrarEvento('Aprovou ponto do dia', fD(d)); toast('Dia aprovado'); carregar();
  };
  const reabrir = async () => {
    const { error } = await supabase().from('ponto_dia_status').upsert({ data, status: 'Rascunho', usuario_id: S.usuario.id, em: new Date().toISOString() });
    if (error) return toast(erroAmigavel(error.message));
    registrarEvento('Reabriu ponto do dia', fD(d)); carregar();
  };

  return (
    <>
      <div className="card">
        <div className="toolbar" style={{ margin: 0 }}>
          <button className="btn sm" aria-label="Dia anterior" onClick={() => irPara(dk(addD(d, -1)))}>◀</button>
          <input type="date" style={{ minWidth: 0, width: 'auto' }} max={dk(hoje())} value={data} onChange={(e) => e.target.value && irPara(e.target.value)} />
          <button className="btn sm" aria-label="Próximo dia" disabled={data >= dk(hoje())} onClick={() => irPara(dk(addD(d, 1)))}>▶</button>
          <span>{DOW[d.getDay()]} · {tipo} · competência {compLabel(compOf(d))}</span>
          <span className="sp" />
          {st ? <Pill t={st.status + (stNome ? ' · ' + stNome : '') + ' · ' + fDT(st.em)} c={aprov ? 'ok' : st.status === 'Enviado' ? 'info' : 'neutral'} /> : <Pill t="Não lançado" c="warn" />}
        </div>
        <div className="toolbar mt" style={{ marginBottom: 0 }}>
          <input placeholder="Buscar funcionário ou função" value={f.q} onChange={(e) => setF({ ...f, q: e.target.value })} />
          <select value={f.obra} onChange={(e) => setF({ ...f, obra: e.target.value })}>
            <option value="">Todas as obras</option><option value="__sem">Sem lançamento no dia</option>
            {S.obrasUser.map((o) => <option key={o.id} value={o.id}>Lançados em {o.nome}</option>)}
          </select>
          {!lock && <><span className="sp" /><button className="btn sm" onClick={repetir}>Repetir obras do último dia trabalhado</button><button className="btn sm" onClick={padrao}>Preencher horário padrão nos vazios</button></>}
        </div>
      </div>
      {fechada && <div className="note mt">A competência {compLabel(compOf(d))} está fechada no rateio. Para corrigir o ponto, reabra a competência.</div>}
      {aprov && !fechada && <div className="note mt">Dia aprovado, por isso a edição está bloqueada. {S.perm('ponto', 'aprovar') ? 'Use "Reabrir dia" para corrigir; a reabertura fica na auditoria.' : 'Peça ao RH para reabrir se precisar corrigir.'}</div>}
      <div className="card mt tablewrap">
        <table>{PHEAD('Funcionário')}
          <tbody>
            {lista.map((e) => (
              <Linha key={e.id} S={S} d={d} lock={lock} r={linha(e.id)} set={(r) => set(e.id, r)}
                first={<td style={{ minWidth: 190 }}><b>{e.nome}</b><div className="small muted">{e.matricula} · {S.funcaoNome(e.funcao_id)}</div></td>} />
            ))}
            {!lista.length && <tr><td colSpan={10} className="muted">Nenhum funcionário com esse filtro.</td></tr>}
          </tbody>
        </table>
        <p className="small muted">{lista.length} funcionários · {t.pres} trabalharam{t.div ? ' (' + t.div + ' em duas obras)' : ''} · {t.aus} com ocorrência · {t.nl} sem lançamento{t.semObra ? <b style={{ color: 'var(--bad)' }}> · {t.semObra} sem obra informada</b> : ''}. Diferenças de até {S.cfg.jornada.tolerancia_min} min no dia não geram atraso nem extra (CLT, art. 58, §1º).</p>
      </div>
      <div className="toolbar mt">
        <span className="sp" />{sujo && <span className="small muted">Alterações não salvas</span>}
        {!lock && <><button className="btn" disabled={busy} onClick={() => salvar('Rascunho')}>Salvar rascunho</button><button className="btn primary" disabled={busy} onClick={() => salvar('Enviado')}>Salvar e enviar para aprovação</button></>}
        {S.perm('ponto', 'aprovar') && !fechada && (aprov ? <button className="btn" onClick={reabrir}>Reabrir dia</button> : <button className="btn primary" disabled={busy} onClick={aprovar}>Aprovar dia</button>)}
      </div>
      {errs && <ModalErros L={errs} onClose={() => setErrs(null)} />}
    </>
  );
}

// ---------------------------------------------------------------- espelho
function Espelho({ funcs, ult, fechadas, fid0, comp0 }: { funcs: Funcionario[]; ult: Record<string, string>; fechadas: Set<string>; fid0: string | null; comp0: string | null }) {
  const S = useSessao();
  const atual = compAtual();
  const COMPS = [kAdd(atual, -3), kAdd(atual, -2), kAdd(atual, -1), atual];
  if (comp0 && !COMPS.includes(comp0)) COMPS.unshift(comp0);
  const [comp, setComp] = useState(comp0 || atual);
  const todasObras = S.usuario.todas_obras || S.perfil.master;
  const L = funcs.filter((e) => e.status !== 'Desligado' || (e.data_desligamento && e.data_desligamento >= dk(periodo(comp).ini)))
    .filter((e) => todasObras || S.obraLiberada(ult[e.id] || e.obra_referencia_id || '__'));
  const [fid, setFid] = useState(fid0 && funcs.some((x) => x.id === fid0) ? fid0 : L[0]?.id || '');
  const e = funcs.find((x) => x.id === fid);
  const [orig, setOrig] = useState<Record<string, LinhaPonto | null> | null>(null);
  const [stDias, setStDias] = useState<Record<string, string>>({});
  const [draft, setDraft] = useState<Record<string, LinhaPonto>>({});
  const [errs, setErrs] = useState<string[] | null>(null);
  const [prev, setPrev] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const p = periodo(comp);
  const T0 = hoje();

  const carregar = useCallback(async () => {
    if (!fid) return;
    setOrig(null);
    const [{ mapa }, st] = await Promise.all([carregarPontos(p.ini, p.fim, fid), supabase().from('ponto_dia_status').select('data, status').gte('data', dk(p.ini)).lte('data', dk(p.fim))]);
    const o: Record<string, LinhaPonto | null> = {};
    diasPer(comp).forEach((d) => { o[key(fid, dk(d))] = mapa[fid]?.[dk(d)] || null; });
    setOrig(o); setDraft({});
    setStDias(Object.fromEntries((st.data || []).map((x: { data: string; status: string }) => [x.data, x.status])));
  }, [fid, comp]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { carregar(); }, [carregar]);

  if (!e) return <p className="muted">Nenhum funcionário.</p>;
  if (!orig) return <Carregando />;
  const adm = pdk(e.data_admissao);
  const fechada = fechadas.has(comp);
  const ed = S.perm('ponto', 'editar') && !fechada;
  const linha = (d: Date) => draft[key(fid, dk(d))] || orig[key(fid, dk(d))] || VAZIO();
  const sujo = Object.entries(draft).some(([k, r]) => canon(orig[k] || null) !== canon(r));
  const pontosAtuais = () => Object.fromEntries(diasPer(comp).map((d) => [dk(d), linha(d)]));
  const dados = () => ({ nome: e.nome, funcao: S.funcaoNome(e.funcao_id), matricula: e.matricula, cpf: e.cpf || '', admissao: adm });

  const T = { normal: 0, he50: 0, he100: 0, atraso: 0, falta: 0, trab: 0 };
  const H: Record<string, number> = {};
  const rows = diasPer(comp).map((d) => {
    const fut = d >= T0, antes = d < adm;
    const r = linha(d);
    const o = calcDia(S.cal, linhaVazia(r) ? null : r, d);
    (Object.keys(T) as (keyof typeof T)[]).forEach((x) => (T[x] += o[x]));
    horasObra(r, o).forEach((h) => (H[h.obra] = (H[h.obra] || 0) + h.min));
    const we = d.getDay() === 0 || d.getDay() === 6 || S.cal.isFer(d);
    const first = <td style={{ whiteSpace: 'nowrap', ...(we ? { color: 'var(--muted)' } : {}) }}>{DOW[d.getDay()].slice(0, 3)} {fD(d).slice(0, 5)}{S.cal.isFer(d) && <> <span className="tag">feriado</span></>}</td>;
    if (ed && !fut && !antes) {
      const lock = stDias[dk(d)] === 'Aprovado' && !S.perm('ponto', 'aprovar');
      return <Linha key={dk(d)} S={S} d={d} lock={lock} r={r} set={(x) => setDraft({ ...draft, [key(fid, dk(d))]: x })} first={first} />;
    }
    const vazio = linhaVazia(r);
    const marc = vazio ? (fut || antes ? '' : o.carga ? <Pill t="sem lançamento" c="warn" /> : '') : r.oc === 'TRABALHADO' ? `${r.e} – ${r.sa} · ${r.r} – ${r.s}` : <b>{ocNome(r.oc).toUpperCase()}</b>;
    return (
      <tr key={dk(d)} style={we ? { background: 'var(--surface2)' } : undefined}>
        {first}<td colSpan={5}>{marc}</td><td className="num"><CalcCell o={vazio ? null : o} /></td>
        <td colSpan={3} className="small">{!vazio && r.obra ? S.obraNome(r.obra) + (r.obra2 ? ' / ' + S.obraNome(r.obra2) + ' (' + fmh(r.h2) + ')' : '') : ''}{!vazio && r.obs && <span className="muted"> · {r.obs}</span>}</td>
      </tr>
    );
  });

  const trocar = (fn: () => void) => { if (sujo && !confirm('Há alterações não salvas. Descartar?')) return; fn(); };
  const padrao = () => {
    const nd = { ...draft }; let n = 0;
    diasPer(comp).forEach((d) => { if (d >= T0 || d < adm) return; const r = linha(d); if (S.cal.carga(d) > 0 && linhaVazia(r)) { nd[key(fid, dk(d))] = { ...r, ...DEF(d) }; n++; } });
    setDraft(nd); toast(n ? n + ' dia(s) com 07:00–12:00 / 13:00–17:00 (sexta até 16:00). Falta escolher a obra.' : 'Nenhum dia útil vazio para preencher');
  };
  const salvar = async () => {
    const er = erros(S, draft, (k) => fD(pdk(splitKey(k).d)));
    if (er.length) return setErrs(er);
    setBusy(true);
    try {
      const ch = await gravar(orig, draft);
      registrarEvento('Ajustou espelho', 'Mat. ' + e.matricula + ' · ' + compLabel(comp) + ' · ' + ch.length + ' dia(s)');
      toast(ch.length ? ch.length + ' dia(s) atualizado(s)' : 'Nada alterado');
      await carregar();
    } catch (x) { toast(String((x as Error).message)); }
    setBusy(false);
  };
  const csv = () => {
    downloadCSV('espelho_' + e.matricula + '_' + comp + '.csv', [
      ['Dia', 'Data', 'Ocorrência', 'Entrada', 'Saída', 'Entrada', 'Saída', 'Trabalhado', 'Normal', 'Atraso', 'Falta', 'HE 50%', 'HE 100%', 'Obra', '2ª obra', 'Horas 2ª obra', 'Observação'],
      ...diasPer(comp).map((d) => { const r = linha(d); const v = linhaVazia(r); const o = calcDia(S.cal, v ? null : r, d); return [DOW[d.getDay()], fD(d), v ? '' : ocNome(r.oc), r.e, r.sa, r.r, r.s, fm(o.trab), fm(o.normal), fm(o.atraso), fm(o.falta), fm(o.he50), fm(o.he100), r.obra ? S.obraNome(r.obra) : '', r.obra2 ? S.obraNome(r.obra2) : '', r.h2 ? fm(r.h2) : '', r.obs]; }),
    ]);
    registrarEvento('Exportou CSV', 'Espelho de ponto · Mat. ' + e.matricula + ' · ' + compLabel(comp));
  };
  const verExcel = async () => setPrev(espelhoExcel(S.cal, dados(), comp, pontosAtuais(), await logoDataURL()));
  const imprimir = async () => {
    registrarEvento('Imprimiu espelho', 'Mat. ' + e.matricula + ' · ' + compLabel(comp));
    printHTML(espelhoExcel(S.cal, dados(), comp, pontosAtuais(), await logoDataURL()));
  };
  const imprimirTodos = async () => {
    setBusy(true);
    const { mapa } = await carregarPontos(p.ini, p.fim);
    const logo = await logoDataURL();
    const LL = L.filter((x) => x.data_admissao <= dk(p.fim)).sort((a, b) => a.nome.localeCompare(b.nome));
    const html = LL.map((x) => espelhoExcel(S.cal, { nome: x.nome, funcao: S.funcaoNome(x.funcao_id), matricula: x.matricula, cpf: x.cpf || '', admissao: pdk(x.data_admissao) }, comp, mapa[x.id] || {}, logo)).join('');
    setBusy(false);
    registrarEvento('Imprimiu todos os espelhos', compLabel(comp) + ' · ' + LL.length + ' funcionários');
    printHTML(html);
  };

  return (
    <>
      <div className="toolbar">
        <select style={{ minWidth: 260 }} value={fid} onChange={(x) => { const v = x.target.value; trocar(() => setFid(v)); }}>{L.map((x) => <option key={x.id} value={x.id}>{x.nome} · {x.matricula}</option>)}</select>
        <select value={comp} onChange={(x) => { const v = x.target.value; trocar(() => setComp(v)); }}>{COMPS.map((k) => <option key={k} value={k}>{compLabel(k)} · {perLabel(k)}{fechadas.has(k) ? ' · fechada' : ''}</option>)}</select>
        <span className="sp" />
        {ed && <button className="btn sm" onClick={padrao}>Preencher horário padrão nos dias úteis vazios</button>}
        <button className="btn sm" disabled={!S.perm('ponto', 'exportar')} title={S.perm('ponto', 'exportar') ? '' : SEM_PERM} onClick={csv}>Exportar CSV</button>
        <button className="btn sm" onClick={verExcel}>Ver espelho (formato Excel)</button>
        <button className="btn sm" onClick={imprimir}>Imprimir espelho</button>
        <button className="btn sm" disabled={busy} onClick={imprimirTodos}>Imprimir todos do período</button>
      </div>
      {fechada && <div className="note">Competência {compLabel(comp)} fechada: o espelho está somente para consulta.</div>}
      <div className="card">
        <dl className="ficha" style={{ gridTemplateColumns: '110px 1fr 110px 1fr', margin: '0 0 14px' }}>
          <dt>Nome</dt><dd><b>{e.nome}</b></dd><dt>Admissão</dt><dd>{fD(e.data_admissao)}</dd>
          <dt>Cargo</dt><dd>{S.funcaoNome(e.funcao_id)}</dd><dt>Matrícula</dt><dd>{e.matricula}</dd>
          <dt>CPF</dt><dd>{e.cpf || '—'}</dd><dt>Período</dt><dd>{perLabel(comp)}</dd>
        </dl>
        <div className="tablewrap"><table>{PHEAD('Dia')}<tbody>{rows}</tbody></table></div>
        <div className="grid mt" style={{ gridTemplateColumns: 'repeat(auto-fit,minmax(140px,1fr))' }}>
          {([['Hora normal', T.normal], ['Hora extra 50%', T.he50], ['Hora extra 100%', T.he100], ['Atraso', T.atraso], ['Falta', T.falta]] as [string, number][]).map((x) => (
            <div key={x[0]} className="card kpi"><div className="l">{x[0]}</div><div className="v" style={{ fontSize: 20 }}>{fm(x[1]) || '00:00'}</div></div>
          ))}
        </div>
        <p className="small mt"><b>Horas por obra no período:</b> {Object.entries(H).sort((a, b) => b[1] - a[1]).map(([o, m]) => <span key={o}><Pill t={S.obraNome(o) + ' · ' + fmh(m)} c="info" /> </span>)}{!Object.keys(H).length && '—'}</p>
      </div>
      {ed && (
        <div className="toolbar mt"><span className="sp" /><span className="small muted">{sujo ? 'Alterações não salvas' : ''}</span>
          <button className="btn" disabled={!sujo} onClick={() => setDraft({})}>Descartar</button>
          <button className="btn primary" disabled={!sujo || busy} onClick={salvar}>Salvar alterações do espelho</button>
        </div>
      )}
      {errs && <ModalErros L={errs} onClose={() => setErrs(null)} />}
      {prev && (
        <Modal wide onClose={() => setPrev(null)}>
          <h2>Espelho de ponto · {e.nome}</h2>
          <div className="docprev" style={{ padding: 20 }} dangerouslySetInnerHTML={{ __html: prev }} />
          <div className="modal-actions"><button className="btn primary" onClick={imprimir}>Imprimir</button><button className="btn" onClick={() => setPrev(null)}>Fechar</button></div>
        </Modal>
      )}
    </>
  );
}

// ---------------------------------------------------------------- situação
function Situacao({ funcs, onIr }: { funcs: Funcionario[]; onIr: (d: string) => void }) {
  const S = useSessao();
  const k = compAtual();
  const T0 = hoje();
  const dias = diasPer(k).filter((d) => d <= T0);
  const [dados, setDados] = useState<{ st: Record<string, string>; n: Record<string, Set<string>>; div: Record<string, number> } | null>(null);
  useEffect(() => {
    const p = periodo(k);
    Promise.all([
      supabase().from('ponto_dia_status').select('data, status').gte('data', dk(p.ini)).lte('data', dk(p.fim)),
      todas<{ funcionario_id: string; data: string; obra2_id: string | null }>((a, b) => supabase().from('ponto').select('funcionario_id, data, obra2_id').gte('data', dk(p.ini)).lte('data', dk(p.fim)).range(a, b)),
    ]).then(([st, L]) => {
      const n: Record<string, Set<string>> = {}, div: Record<string, number> = {};
      L.forEach((x) => { (n[x.data] = n[x.data] || new Set()).add(x.funcionario_id); if (x.obra2_id) div[x.data] = (div[x.data] || 0) + 1; });
      setDados({ st: Object.fromEntries((st.data || []).map((x: { data: string; status: string }) => [x.data, x.status])), n, div });
    });
  }, [k]);
  if (!dados) return <Carregando />;
  const ativos = (d: Date) => funcs.filter((e) => (e.status !== 'Desligado' || (e.data_desligamento && e.data_desligamento >= dk(d))) && e.data_admissao <= dk(d));
  return (
    <>
      <p className="small muted">Competência {compLabel(k)} ({perLabel(k)}). Clique em um dia para abrir o lançamento.</p>
      <div className="card tablewrap">
        <table>
          <thead><tr><th />{dias.map((d) => <th key={dk(d)} style={{ textAlign: 'center', padding: '6px 4px' }}>{String(d.getDate()).padStart(2, '0')}<br /><span className="small">{DOW[d.getDay()].slice(0, 3)}</span></th>)}</tr></thead>
          <tbody>
            <tr><td><b>Situação</b></td>{dias.map((d) => {
              const st = dados.st[dk(d)]; const c = S.cal.carga(d); let cls = 'neutral', t = '';
              if (st) { cls = st === 'Aprovado' ? 'ok' : st === 'Enviado' ? 'info' : 'warn'; t = st[0]; } else if (c) { cls = dk(d) === dk(T0) ? 'warn' : 'bad'; t = '!'; }
              return <td key={dk(d)} style={{ textAlign: 'center', padding: '4px 2px' }}>{t && <span className={'pill ' + cls} style={{ cursor: 'pointer', padding: '2px 6px' }} title={st || 'Não lançado'} onClick={() => onIr(dk(d))}>{t}</span>}</td>;
            })}</tr>
            <tr><td style={{ whiteSpace: 'nowrap' }}><b>Lançados</b></td>{dias.map((d) => {
              const a = ativos(d); const n = a.filter((e) => dados.n[dk(d)]?.has(e.id)).length; const c = S.cal.carga(d);
              return <td key={dk(d)} style={{ textAlign: 'center', fontSize: 11, ...(c && n < a.length ? { color: 'var(--bad)', fontWeight: 700 } : { color: 'var(--muted)' }) }}>{c || n ? n + '/' + a.length : ''}</td>;
            })}</tr>
            <tr><td style={{ whiteSpace: 'nowrap' }}><b>Em 2 obras</b></td>{dias.map((d) => <td key={dk(d)} style={{ textAlign: 'center', fontSize: 11 }} className="muted">{dados.div[dk(d)] || ''}</td>)}</tr>
          </tbody>
        </table>
        <p className="small muted mt"><Pill t="A" c="ok" /> aprovado · <Pill t="E" c="info" /> enviado, aguardando o RH · <Pill t="R" c="warn" /> rascunho · <Pill t="!" c="bad" /> dia útil sem lançamento</p>
      </div>
    </>
  );
}
