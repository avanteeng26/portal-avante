'use client';
import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useSessao } from '@/components/Sessao';
import { Carregando, Modal, Pill, SEM_PERM, SemPermissao, VencPill, toast } from '@/components/ui';
import { supabase } from '@/lib/supabase/client';
import { carregarFuncionarios, carregarRemuneracoes, erroAmigavel, proximaMatricula, todas, ultimasObras } from '@/lib/dados';
import { docResumo } from '@/lib/docs';
import { BRL, dd, fD, hoje, pdk } from '@/lib/format';
import { registrarEvento } from '@/lib/audit';
import { downloadCSV } from '@/lib/print';
import { STATUS_FUNC, type Documento, type Funcionario, type Remuneracao } from '@/lib/types';

export default function Funcionarios() {
  const S = useSessao();
  const router = useRouter();
  const [funcs, setFuncs] = useState<Funcionario[] | null>(null);
  const [rem, setRem] = useState<Record<string, Remuneracao>>({});
  const [docs, setDocs] = useState<Record<string, Documento[]>>({});
  const [ult, setUlt] = useState<Record<string, string>>({});
  const [f, setF] = useState({ q: '', obra: '', st: '', doc: false });
  const [novo, setNovo] = useState(false);
  const verSal = S.perm('salarios', 'ver');
  const verDocs = S.perm('docs', 'ver');

  useEffect(() => {
    if (!S.perm('colab', 'ver')) return;
    (async () => {
      const [F, R, U, D] = await Promise.all([
        carregarFuncionarios(),
        verSal ? carregarRemuneracoes() : Promise.resolve({}),
        ultimasObras(),
        verDocs ? todas<Documento>((a, b) => supabase().from('documentos').select('id, funcionario_id, tipo, situacao, enviado_em').not('funcionario_id', 'is', null).range(a, b)) : Promise.resolve([] as Documento[]),
      ]);
      const md: Record<string, Documento[]> = {};
      D.forEach((d) => { (md[d.funcionario_id!] = md[d.funcionario_id!] || []).push(d); });
      setFuncs(F); setRem(R); setUlt(U); setDocs(md);
    })().catch((e) => toast(String(e.message || e)));
  }, [S, verSal, verDocs]);

  const todasObras = S.usuario.todas_obras || S.perfil.master;
  const obraDe = (e: Funcionario) => ult[e.id] || e.obra_referencia_id || '';

  const lista = useMemo(() => {
    if (!funcs) return [];
    const q = f.q.toLowerCase();
    return funcs.filter((e) => {
      const ob = obraDe(e);
      if (!todasObras && !S.obraLiberada(ob || '__nenhuma')) return false;
      if (q && !(e.nome + ' ' + e.matricula + ' ' + S.funcaoNome(e.funcao_id)).toLowerCase().includes(q)) return false;
      if (f.obra && ob !== f.obra) return false;
      if (f.st && e.status !== f.st) return false;
      if (f.doc && docResumo(docs[e.id] || []).obrPend === 0) return false;
      return true;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [funcs, f, docs, ult]);

  if (!S.perm('colab', 'ver')) return <SemPermissao />;

  const exportar = () => {
    downloadCSV('funcionarios.csv', [
      ['Matrícula', 'Nome', 'CPF', 'Função', 'Última obra no ponto', 'Admissão', 'Status', ...(verSal ? ['Salário-base'] : [])],
      ...lista.map((e) => [e.matricula, e.nome, e.cpf, S.funcaoNome(e.funcao_id), S.obraNome(obraDe(e)), fD(e.data_admissao), e.status, ...(verSal ? [rem[e.id]?.salario ?? ''] : [])]),
    ]);
    registrarEvento('Exportou CSV', 'Cadastro de funcionários · ' + lista.length + ' linhas');
  };

  return (
    <>
      <h1>Cadastro de funcionários</h1>
      <p className="sub">Cadastro único. Clique em um funcionário para abrir a ficha completa, com documentos e ponto.</p>
      <div className="toolbar">
        <input placeholder="Buscar nome, matrícula ou função" value={f.q} onChange={(e) => setF({ ...f, q: e.target.value })} />
        <select value={f.obra} onChange={(e) => setF({ ...f, obra: e.target.value })}>
          <option value="">Todas as obras</option>
          {S.obrasUser.map((o) => <option key={o.id} value={o.id}>{o.nome}</option>)}
        </select>
        <select value={f.st} onChange={(e) => setF({ ...f, st: e.target.value })}>
          <option value="">Todos os status</option>
          {STATUS_FUNC.map((s) => <option key={s}>{s}</option>)}
        </select>
        {verDocs && <label className="check" style={{ margin: 0 }}><input type="checkbox" checked={f.doc} onChange={(e) => setF({ ...f, doc: e.target.checked })} /> Só com documentos pendentes</label>}
        <span className="sp" />
        <button className="btn sm" disabled={!S.perm('colab', 'exportar')} title={S.perm('colab', 'exportar') ? '' : SEM_PERM} onClick={exportar}>Exportar CSV</button>
        <button className="btn sm" disabled={!S.perm('colab', 'incluir')} title={S.perm('colab', 'incluir') ? 'Cadastro direto de quem já é funcionário' : SEM_PERM} onClick={() => setNovo(true)}>+ Cadastrar funcionário</button>
        <Link className="btn sm primary" href="/rh/admissao" aria-disabled={!S.perm('admissao', 'incluir')} style={S.perm('admissao', 'incluir') ? undefined : { pointerEvents: 'none', opacity: 0.45 }}>+ Nova admissão</Link>
      </div>
      <div className="card tablewrap">
        {!funcs ? <Carregando /> : (
          <>
            <table>
              <thead><tr><th>Mat.</th><th>Nome</th><th>Função</th><th>Última obra no ponto</th><th>Admissão</th><th>Status</th>{verDocs && <th>Documentos</th>}<th>ASO</th>{verSal && <th className="num">Salário-base</th>}</tr></thead>
              <tbody>
                {lista.map((e) => {
                  const exp = dd(pdk(e.data_admissao), hoje()) <= 89;
                  const d = docResumo(docs[e.id] || []);
                  return (
                    <tr key={e.id} className="click" onClick={() => router.push('/rh/funcionarios/' + e.id)}>
                      <td>{e.matricula}</td>
                      <td>{e.nome}{exp && <> <Pill t="Experiência" c="info" /></>}</td>
                      <td>{S.funcaoNome(e.funcao_id)}</td>
                      <td>{obraDe(e) ? S.obraNome(obraDe(e)) : '—'}</td>
                      <td>{fD(e.data_admissao)}</td>
                      <td><Pill t={e.status} c={e.status === 'Ativo' ? 'ok' : e.status === 'Desligado' ? 'neutral' : 'warn'} /></td>
                      {verDocs && <td><Pill t={d.ok + '/' + d.tot} c={d.obrPend ? 'bad' : d.pend ? 'warn' : 'ok'} /></td>}
                      <td><VencPill d={e.aso_vencimento} /></td>
                      {verSal && <td className="num">{rem[e.id] ? BRL(rem[e.id].salario) : '—'}</td>}
                    </tr>
                  );
                })}
                {!lista.length && <tr><td colSpan={9} className="muted">Nenhum funcionário com esse filtro.</td></tr>}
              </tbody>
            </table>
            <p className="small muted">{lista.length} funcionários</p>
          </>
        )}
      </div>
      {novo && funcs && <NovoFuncionario funcs={funcs} onClose={() => setNovo(false)} onOk={(id) => router.push('/rh/funcionarios/' + id + '?aba=docs')} />}
    </>
  );
}

function NovoFuncionario({ funcs, onClose, onOk }: { funcs: Funcionario[]; onClose: () => void; onOk: (id: string) => void }) {
  const S = useSessao();
  const verSal = S.perm('salarios', 'ver');
  const [v, setV] = useState({ nome: '', cpf: '', funcao: S.funcoes[0]?.id || '', obra: S.obrasUser[0]?.id || '', adm: '', sal: '', va: '300', mat: proximaMatricula(funcs) });
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  async function salvar() {
    if (!v.nome.trim() || !v.adm || !v.mat.trim()) return setErr('Preencha nome, matrícula e data de admissão.');
    setBusy(true); setErr('');
    const F = S.funcoes.find((x) => x.id === v.funcao);
    const sb = supabase();
    const { data, error } = await sb.from('funcionarios').insert({
      matricula: v.mat.trim(), nome: v.nome.trim(), cpf: v.cpf.trim() || null, funcao_id: v.funcao || null,
      obra_referencia_id: v.obra || null, data_admissao: v.adm, status: 'Ativo', tipo_contrato: 'CLT · experiência 45+45 dias',
    }).select().single();
    if (error) { setBusy(false); return setErr(erroAmigavel(error.message)); }
    if (verSal) {
      const r = await sb.from('funcionarios_remuneracao').insert({
        funcionario_id: data.id, salario: +v.sal || F?.salario_base || 0, adicional_pct: F?.periculosidade_pct || 0, va_valor: +v.va || F?.va_padrao || 300,
      });
      if (r.error) toast('Funcionário cadastrado, mas a remuneração não foi gravada: ' + erroAmigavel(r.error.message));
    }
    toast('Funcionário cadastrado. Agora anexe os documentos.');
    onOk(data.id);
  }

  return (
    <Modal onClose={onClose}>
      <h2>Cadastrar funcionário</h2>
      <p className="muted">Para quem já trabalha na empresa. Contratações novas seguem pelo fluxo de <b>Nova admissão</b>. Depois de salvar, a ficha abre na aba de documentos.</p>
      <div className="row">
        <div><label>Nome completo</label><input value={v.nome} onChange={(e) => setV({ ...v, nome: e.target.value })} /></div>
        <div><label>CPF</label><input placeholder="000.000.000-00" value={v.cpf} onChange={(e) => setV({ ...v, cpf: e.target.value })} /></div>
        <div style={{ maxWidth: 140 }}><label>Matrícula</label><input value={v.mat} onChange={(e) => setV({ ...v, mat: e.target.value })} /></div>
      </div>
      <div className="row">
        <div><label>Função</label><select value={v.funcao} onChange={(e) => setV({ ...v, funcao: e.target.value })}>{S.funcoes.map((x) => <option key={x.id} value={x.id}>{x.nome}</option>)}</select></div>
        <div><label>Obra de referência</label><select value={v.obra} onChange={(e) => setV({ ...v, obra: e.target.value })}>{S.obrasUser.map((o) => <option key={o.id} value={o.id}>{o.nome}</option>)}</select></div>
      </div>
      <div className="row">
        <div><label>Data de admissão</label><input type="date" value={v.adm} onChange={(e) => setV({ ...v, adm: e.target.value })} /></div>
        <div><label>Salário-base (R$)</label><input type="number" min={0} value={v.sal} disabled={!verSal} placeholder={verSal ? '' : 'Sem permissão'} onChange={(e) => setV({ ...v, sal: e.target.value })} /></div>
        <div><label>Vale-alimentação (R$)</label><input type="number" value={v.va} disabled={!verSal} onChange={(e) => setV({ ...v, va: e.target.value })} /></div>
      </div>
      <div className="err">{err}</div>
      <div className="modal-actions"><button className="btn" onClick={onClose}>Cancelar</button><button className="btn primary" disabled={busy} onClick={salvar}>Salvar e abrir ficha</button></div>
    </Modal>
  );
}
