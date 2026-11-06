'use client';
import { use, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useSessao } from '@/components/Sessao';
import { Carregando, Modal, Pill, SEM_PERM, SemPermissao, toast } from '@/components/ui';
import { DocChecklist } from '@/components/DocChecklist';
import { DocPreview } from '@/components/DocPreview';
import { supabase } from '@/lib/supabase/client';
import { carregarPontos, erroAmigavel } from '@/lib/dados';
import { DOC_GRUPOS, DOC_ITENS, docResumo, porTipo, situacao } from '@/lib/docs';
import { EC, CAND_F } from '@/lib/admissao';
import { fD, fDT, fm, fmh, pdk } from '@/lib/format';
import { compAtual, compLabel, kAdd, perLabel, periodo, resumoPer } from '@/lib/ponto';
import { contexto, renderModelo } from '@/lib/modelos';
import { carregarModelos } from '@/lib/modelosDb';
import { registrarEvento } from '@/lib/audit';
import { downloadCSV, downloadWord, printHTML } from '@/lib/print';
import { STATUS_FUNC, type Documento, type Funcionario, type ModeloDocumento, type Remuneracao } from '@/lib/types';

type Campo = [keyof Funcionario | string, string, ('date' | 'num' | 'funcao' | 'obra' | string[])?];
const opc = (k: string) => (CAND_F.find((c) => c[0] === k)?.[3] as string[]) || [];
const GRUPOS: [string, Campo[]][] = [
  ['Dados pessoais', [
    ['nome', 'Nome completo'], ['cpf', 'CPF'], ['rg', 'RG'], ['rg_orgao', 'Órgão emissor / UF'], ['rg_emissao', 'Emissão do RG', 'date'], ['pis', 'PIS/NIS'],
    ['nascimento', 'Data de nascimento', 'date'], ['sexo', 'Sexo', opc('sexo')], ['raca_cor', 'Raça/cor', opc('racaCor')], ['estado_civil', 'Estado civil', EC],
    ['grau_instrucao', 'Grau de instrução', opc('escol')], ['nacionalidade', 'Nacionalidade'], ['naturalidade', 'Naturalidade'], ['nome_mae', 'Nome da mãe'], ['nome_pai', 'Nome do pai'],
    ['titulo_eleitor', 'Título de eleitor'], ['dependentes', 'Nº de dependentes', 'num'], ['telefone', 'Telefone'], ['email', 'E-mail pessoal'], ['endereco', 'Endereço'], ['cep', 'CEP'],
  ]],
  ['Contrato', [
    ['matricula', 'Matrícula'], ['funcao_id', 'Função', 'funcao'], ['obra_referencia_id', 'Obra de referência (só para custo sem ponto)', 'obra'], ['data_admissao', 'Data de admissão', 'date'],
    ['status', 'Status', [...STATUS_FUNC]], ['tipo_contrato', 'Tipo de contrato'], ['data_desligamento', 'Data de desligamento', 'date'], ['aso_vencimento', 'Vencimento do ASO', 'date'], ['ferias_limite', 'Limite para férias', 'date'],
  ]],
];
const REM: [keyof Remuneracao, string, ('num' | 'bool')?][] = [
  ['salario', 'Salário-base (R$)', 'num'], ['adicional_pct', 'Adicional de periculosidade (%)', 'num'], ['va_valor', 'Vale-alimentação (R$/mês)', 'num'], ['vale_transporte', 'Vale-transporte', 'bool'],
  ['banco', 'Banco'], ['agencia', 'Agência'], ['conta', 'Conta'], ['pix', 'Chave PIX'],
];

export default function Ficha({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const S = useSessao();
  const sp = useSearchParams();
  const [e, setE] = useState<Funcionario | null | undefined>(undefined);
  const [rem, setRem] = useState<Remuneracao | null>(null);
  const [docs, setDocs] = useState<Documento[]>([]);
  const [aba, setAba] = useState(sp.get('aba') || 'dados');

  useEffect(() => {
    (async () => {
      const sb = supabase();
      const [f, r, d] = await Promise.all([
        sb.from('funcionarios').select('*').eq('id', id).maybeSingle(),
        S.perm('salarios', 'ver') ? sb.from('funcionarios_remuneracao').select('*').eq('funcionario_id', id).maybeSingle() : Promise.resolve({ data: null }),
        S.perm('docs', 'ver') ? sb.from('documentos').select('*').eq('funcionario_id', id) : Promise.resolve({ data: [] }),
      ]);
      setE(f.data as Funcionario | null); setRem((r.data as Remuneracao) || null); setDocs((d.data || []) as Documento[]);
    })();
  }, [id, S]);

  if (!S.perm('colab', 'ver')) return <SemPermissao />;
  if (e === undefined) return <Carregando />;
  if (!e) return <p>Funcionário não encontrado.</p>;

  const d = docResumo(docs);
  const abas = [['dados', 'Dados cadastrais'], ['docs', `Documentos (${d.ok}/${d.tot})`], ['ponto', 'Ponto'], ['hist', 'Histórico']]
    .filter((t) => (t[0] !== 'docs' || S.perm('docs', 'ver')) && (t[0] !== 'ponto' || S.perm('ponto', 'ver')) && (t[0] !== 'hist' || S.perm('auditoria', 'ver')));
  const abaOk = abas.find((t) => t[0] === aba) ? aba : 'dados';

  return (
    <>
      <Link className="btn sm" href="/rh/funcionarios">← Funcionários</Link>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', gap: 12, flexWrap: 'wrap', margin: '14px 0 16px' }}>
        <div>
          <h1>{e.nome}</h1>
          <p className="sub" style={{ margin: 0 }}>Matrícula {e.matricula} · {S.funcaoNome(e.funcao_id)} · admissão {fD(e.data_admissao)}</p>
        </div>
        <div>
          <Pill t={e.status} c={e.status === 'Ativo' ? 'ok' : 'warn'} />{' '}
          {S.perm('docs', 'ver') && (d.obrPend ? <Pill t={d.obrPend + ' documento(s) obrigatório(s) pendente(s)'} c="bad" /> : <Pill t="Documentação completa" c="ok" />)}
        </div>
      </div>
      <div className="tabs">{abas.map((t) => <button key={t[0]} className={'btn sm ' + (abaOk === t[0] ? 'primary' : '')} onClick={() => setAba(t[0])}>{t[1]}</button>)}</div>
      {abaOk === 'dados' && <Dados e={e} rem={rem} onSaved={(f, r) => { setE(f); if (r) setRem(r); }} />}
      {abaOk === 'docs' && <Docs e={e} rem={rem} docs={docs} setDocs={setDocs} />}
      {abaOk === 'ponto' && <PontoResumo e={e} />}
      {abaOk === 'hist' && <Historico id={e.id} />}
    </>
  );
}

function Dados({ e, rem, onSaved }: { e: Funcionario; rem: Remuneracao | null; onSaved: (f: Funcionario, r?: Remuneracao | null) => void }) {
  const S = useSessao();
  const ed = S.perm('colab', 'editar');
  const verSal = S.perm('salarios', 'ver');
  const edSal = S.perm('salarios', 'editar');
  const [v, setV] = useState<Record<string, unknown>>({ ...e });
  const [r, setR] = useState<Record<string, unknown>>(rem ? { ...rem } : { salario: '', adicional_pct: 0, va_valor: 300, vale_transporte: false });
  const [busy, setBusy] = useState(false);

  const mudou = GRUPOS.flatMap((g) => g[1]).some(([k]) => String(v[k as string] ?? '') !== String((e as unknown as Record<string, unknown>)[k as string] ?? ''))
    || (edSal && REM.some(([k]) => String(r[k] ?? '') !== String(rem ? rem[k] ?? '' : (k === 'adicional_pct' ? 0 : k === 'va_valor' ? 300 : k === 'vale_transporte' ? false : ''))));

  const inp = (k: string, l: string, t: Campo[2], dis: boolean, val: unknown, set: (x: unknown) => void) => {
    let c;
    if (Array.isArray(t)) c = <select disabled={dis} value={String(val ?? '')} onChange={(x) => set(x.target.value || null)}><option value="" />{t.map((o) => <option key={o}>{o}</option>)}</select>;
    else if (t === 'funcao') c = <select disabled={dis} value={String(val ?? '')} onChange={(x) => set(x.target.value || null)}><option value="" />{S.funcoes.map((o) => <option key={o.id} value={o.id}>{o.nome}</option>)}</select>;
    else if (t === 'obra') c = <select disabled={dis} value={String(val ?? '')} onChange={(x) => set(x.target.value || null)}><option value="" />{S.obras.map((o) => <option key={o.id} value={o.id}>{o.nome}</option>)}</select>;
    else c = <input disabled={dis} type={t === 'date' ? 'date' : t === 'num' ? 'number' : 'text'} value={String(val ?? '')} onChange={(x) => set(x.target.value)} />;
    return <div key={k}><label>{l}</label>{c}</div>;
  };

  async function salvar() {
    setBusy(true);
    const sb = supabase();
    const upd: Record<string, unknown> = {};
    GRUPOS.flatMap((g) => g[1]).forEach(([k, , t]) => {
      const a = (e as unknown as Record<string, unknown>)[k as string], b = v[k as string];
      if (String(a ?? '') !== String(b ?? '')) upd[k as string] = b === '' ? null : t === 'num' ? Number(b) || 0 : b;
    });
    if (upd.data_admissao === null || upd.matricula === null || upd.nome === null) { setBusy(false); return toast('Nome, matrícula e data de admissão são obrigatórios.'); }
    let f = e;
    if (Object.keys(upd).length) {
      const res = await sb.from('funcionarios').update(upd).eq('id', e.id).select().single();
      if (res.error) { setBusy(false); return toast(erroAmigavel(res.error.message)); }
      f = res.data as Funcionario;
    }
    let nr: Remuneracao | null | undefined;
    if (edSal) {
      const linha = { funcionario_id: e.id, salario: Number(r.salario) || 0, adicional_pct: Number(r.adicional_pct) || 0, va_valor: Number(r.va_valor) || 0, vale_transporte: r.vale_transporte === true || r.vale_transporte === 'true', banco: (r.banco as string) || null, agencia: (r.agencia as string) || null, conta: (r.conta as string) || null, pix: (r.pix as string) || null };
      const res = rem ? await sb.from('funcionarios_remuneracao').update(linha).eq('funcionario_id', e.id).select().single() : await sb.from('funcionarios_remuneracao').insert(linha).select().single();
      if (res.error) toast('Remuneração não gravada: ' + erroAmigavel(res.error.message)); else nr = res.data as Remuneracao;
    }
    setBusy(false);
    onSaved(f, nr);
    toast('Cadastro salvo. As alterações ficam na auditoria.');
  }

  return (
    <>
      {GRUPOS.map(([g, fs]) => (
        <div className="card mt" key={g}><h3>{g}</h3>
          <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fill,minmax(220px,1fr))', gap: '0 14px' }}>
            {fs.map(([k, l, t]) => inp(k as string, l, t, !ed, v[k as string], (x) => setV({ ...v, [k as string]: x })))}
          </div>
        </div>
      ))}
      {verSal && (
        <div className="card mt"><h3>Remuneração e dados bancários</h3>
          {!rem && <p className="small muted">Sem remuneração cadastrada para este funcionário.</p>}
          <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fill,minmax(220px,1fr))', gap: '0 14px' }}>
            {REM.map(([k, l, t]) => t === 'bool'
              ? <div key={k}><label>{l}</label><select disabled={!edSal} value={String(r[k] === true || r[k] === 'true')} onChange={(x) => setR({ ...r, [k]: x.target.value === 'true' })}><option value="false">Não optante</option><option value="true">Optante</option></select></div>
              : inp(k, l, t, !edSal, r[k], (x) => setR({ ...r, [k]: x })))}
          </div>
        </div>
      )}
      <div className="toolbar mt">
        <span className="sp" /><span className="small muted">{mudou ? 'Alterações não salvas' : ''}</span>
        <button className="btn" disabled={!mudou} onClick={() => { setV({ ...e }); setR(rem ? { ...rem } : { salario: '', adicional_pct: 0, va_valor: 300, vale_transporte: false }); }}>Descartar alterações</button>
        <button className="btn primary" disabled={!(ed || edSal) || !mudou || busy} title={ed || edSal ? '' : SEM_PERM} onClick={salvar}>Salvar cadastro</button>
      </div>
    </>
  );
}

function Docs({ e, rem, docs, setDocs }: { e: Funcionario; rem: Remuneracao | null; docs: Documento[]; setDocs: (d: Documento[]) => void }) {
  const S = useSessao();
  const d = docResumo(docs);
  const [gerar, setGerar] = useState<ModeloDocumento[] | null>(null);
  const [sel, setSel] = useState('');
  const [prev, setPrev] = useState<{ titulo: string; html: string; falt: string[] } | null>(null);
  const atualiza = (x: Documento) => setDocs([...docs.filter((y) => y.id !== x.id), x]);

  const exportar = () => {
    const m = porTipo(docs);
    downloadCSV('documentos_' + e.matricula + '.csv', [['Documento', 'Obrigatório', 'Situação', 'Arquivo', 'Enviado em'], ...DOC_ITENS.map(([id, n, o]) => [n, o ? 'Sim' : 'Não', situacao(m, id, o), m[id]?.arquivo_nome || '', m[id]?.enviado_em ? fD(m[id].enviado_em) : ''])]);
    registrarEvento('Exportou CSV', 'Checklist de documentos · Mat. ' + e.matricula);
  };
  const gerarOk = () => {
    const mod = gerar!.find((m) => m.id === sel) || gerar![0];
    const ctx = contexto(S.cfg.empresa, S.cfg.jornada.texto || '', {
      nome: e.nome, cpf: e.cpf, rg: e.rg, pis: e.pis, nasc: e.nascimento, ec: e.estado_civil, end: e.endereco, tel: e.telefone, mat: e.matricula,
      cargo: S.funcaoNome(e.funcao_id), obra: S.obraNome(e.obra_referencia_id), salario: rem?.salario, adicional: (rem?.adicional_pct || 0) > 0, adm: pdk(e.data_admissao), tipo: e.tipo_contrato,
    });
    const res = renderModelo(mod.texto, ctx);
    registrarEvento('Gerou documento', 'Mat. ' + e.matricula + ' · ' + mod.nome + ' v' + mod.versao);
    setGerar(null);
    setPrev({ titulo: mod.nome + ' · ' + e.nome, ...res });
  };

  return (
    <>
      <div className="card">
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}><b>{d.ok} de {d.tot} documentos recebidos</b><span className="small muted">PDF, JPG ou PNG, até 10 MB por arquivo. Itens marcados como &quot;não se aplica&quot; não contam. Os arquivos ficam no armazenamento privado.</span></div>
        <div className="progress mt"><div style={{ width: (d.tot ? (d.ok / d.tot) * 100 : 0) + '%' }} /></div>
      </div>
      {DOC_GRUPOS.map((g) => (
        <DocChecklist key={g.g} titulo={g.g} itens={g.itens} docs={docs} funcionarioId={e.id} contexto={'Mat. ' + e.matricula}
          podeEditar={S.perm('docs', 'editar')} podeIncluir={S.perm('docs', 'incluir')} podeExcluir={S.perm('docs', 'excluir')} onChange={atualiza} />
      ))}
      <div className="toolbar mt">
        <span className="sp" />
        {(S.perm('modelos', 'ver') || S.perm('docs', 'incluir')) && <button className="btn sm" onClick={async () => { const L = await carregarModelos(); setSel(L[0]?.id || ''); setGerar(L); }}>Gerar documento a partir de modelo</button>}
        <button className="btn sm" disabled={!S.perm('docs', 'exportar')} title={S.perm('docs', 'exportar') ? '' : SEM_PERM} onClick={exportar}>Exportar checklist (CSV)</button>
      </div>
      {gerar && (
        <Modal onClose={() => setGerar(null)}>
          <h2>Gerar documento</h2><p className="muted">{e.nome} · os campos são preenchidos com o cadastro atual.</p>
          <label>Modelo</label><select value={sel} onChange={(x) => setSel(x.target.value)}>{gerar.map((m) => <option key={m.id} value={m.id}>{m.nome}</option>)}</select>
          <div className="modal-actions"><button className="btn" onClick={() => setGerar(null)}>Cancelar</button><button className="btn primary" onClick={gerarOk}>Gerar</button></div>
        </Modal>
      )}
      {prev && <DocPreview titulo={prev.titulo} html={prev.html} falt={prev.falt} onClose={() => setPrev(null)}
        acoes={<><button className="btn" onClick={() => downloadWord(prev.titulo, prev.html)}>Baixar Word</button><button className="btn" onClick={() => { registrarEvento('Imprimiu documento', prev.titulo); printHTML(prev.html); }}>Imprimir</button></>} />}
    </>
  );
}

function PontoResumo({ e }: { e: Funcionario }) {
  const S = useSessao();
  const k = compAtual(), k2 = kAdd(k, -1);
  const [pts, setPts] = useState<Awaited<ReturnType<typeof carregarPontos>>['mapa'] | null>(null);
  useEffect(() => { carregarPontos(periodo(k2).ini, periodo(k).fim, e.id).then((r) => setPts(r.mapa)); }, [e.id, k, k2]);
  const R = useMemo(() => (pts ? [k, k2].map((c) => resumoPer(S.cal, c, pdk(e.data_admissao), pts[e.id] || {}, e.status === 'Desligado')) : null), [pts, S.cal, e, k, k2]);
  if (!R) return <Carregando />;
  const lin = (t: string, x: (typeof R)[0]) => (
    <tr key={t}><td>{t}</td><td className="num">{x.dias}</td><td className="num">{fm(x.trab) || '00:00'}</td><td className="num">{fm(x.he50) || '—'}</td><td className="num">{fm(x.he100) || '—'}</td><td className="num">{x.faltas}</td><td className="num">{fm(x.atraso) || '—'}</td>
      <td>{Object.entries(x.horas).map(([o, m]) => <span key={o}><Pill t={S.obraNome(o) + ' · ' + fmh(m)} c="info" /> </span>)}</td></tr>
  );
  return (
    <div className="card tablewrap"><h3>Resumo do ponto</h3>
      <table><thead><tr><th>Competência</th><th className="num">Dias trab.</th><th className="num">Horas trab.</th><th className="num">HE 50%</th><th className="num">HE 100%</th><th className="num">Faltas</th><th className="num">Atrasos</th><th>Horas por obra</th></tr></thead>
        <tbody>{lin(compLabel(k) + ' (em aberto, ' + perLabel(k) + ')', R[0])}{lin(compLabel(k2) + ' (' + perLabel(k2) + ')', R[1])}</tbody></table>
      <div className="toolbar mt"><span className="sp" /><Link className="btn sm primary" href={`/rh/ponto?aba=espelho&f=${e.id}&c=${k}`}>Abrir espelho de ponto</Link></div>
    </div>
  );
}

function Historico({ id }: { id: string }) {
  const [L, setL] = useState<{ id: number; em: string; email: string | null; tabela: string | null; acao: string; detalhe: string | null; antes: Record<string, unknown> | null; depois: Record<string, unknown> | null }[] | null>(null);
  useEffect(() => {
    supabase().from('auditoria').select('*').or(`registro_id.eq.${id},detalhe.ilike.%${id}%`).order('em', { ascending: false }).limit(200).then(({ data }) => setL(data || []));
  }, [id]);
  if (!L) return <Carregando />;
  const resumo = (a: (typeof L)[0]) => {
    if (a.detalhe) return a.detalhe;
    if (a.acao === 'UPDATE' && a.antes && a.depois) {
      const ch = Object.keys(a.depois).filter((k) => JSON.stringify(a.antes![k]) !== JSON.stringify(a.depois![k]));
      return ch.map((k) => (['banco', 'agencia', 'conta', 'pix'].includes(k) ? k + ': (dado bancário alterado)' : `${k}: ${a.antes![k] ?? 'vazio'} → ${a.depois![k] ?? 'vazio'}`)).join(' · ');
    }
    return '';
  };
  return (
    <div className="card tablewrap">
      <table><thead><tr><th>Data e hora</th><th>Usuário</th><th>Tabela</th><th>Ação</th><th>Detalhe</th></tr></thead>
        <tbody>
          {L.map((a) => <tr key={a.id}><td style={{ whiteSpace: 'nowrap' }}>{fDT(a.em)}</td><td>{a.email || '—'}</td><td>{a.tabela || '—'}</td><td>{a.acao}</td><td className="small">{resumo(a)}</td></tr>)}
          {!L.length && <tr><td colSpan={5} className="muted">Sem registros.</td></tr>}
        </tbody></table>
    </div>
  );
}
