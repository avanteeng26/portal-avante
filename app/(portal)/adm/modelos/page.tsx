'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useSessao } from '@/components/Sessao';
import { Carregando, SEM_PERM, SemPermissao, toast } from '@/components/ui';
import { DocPreview } from '@/components/DocPreview';
import { supabase } from '@/lib/supabase/client';
import { erroAmigavel } from '@/lib/dados';
import { fD, pdk } from '@/lib/format';
import { PH, contexto, ehPadrao, renderModelo } from '@/lib/modelos';
import { carregarModelos } from '@/lib/modelosDb';
import { TIPOS_CONTRATO } from '@/lib/admissao';
import type { Empresa, Funcionario, ModeloDocumento } from '@/lib/types';

const CAMPOS_EMP: [keyof Empresa, string][] = [
  ['razao_social', 'Razão social'], ['cnpj', 'CNPJ'], ['endereco', 'Endereço da sede'], ['cidade', 'Cidade/UF (local de assinatura)'],
  ['representante', 'Representante legal'], ['representante_cargo', 'Cargo do representante'], ['email_contabilidade', 'E-mail da contabilidade'],
  ['clinica', 'Clínica do exame admissional'], ['clinica_endereco', 'Endereço da clínica'],
];

export default function Modelos() {
  const S = useSessao();
  const edEmp = S.perm('usuarios', 'editar'); // configuracoes: master
  const ed = S.perm('modelos', 'editar');
  const [E, setE] = useState<Empresa>(S.cfg.empresa);
  const [jornada, setJornada] = useState(S.cfg.jornada.texto || '');
  const [mods, setMods] = useState<ModeloDocumento[] | null>(null);
  const [sel, setSel] = useState('');
  const [m, setM] = useState<ModeloDocumento | null>(null);
  const [prev, setPrev] = useState<{ titulo: string; html: string; falt: string[] } | null>(null);
  const [nomes, setNomes] = useState<Record<string, string>>({});
  const ta = useRef<HTMLTextAreaElement>(null);

  const carregar = useCallback(async (manter?: string) => {
    const L = await carregarModelos();
    setMods(L);
    const ids = [...new Set(L.map((x) => x.atualizado_por).filter(Boolean))] as string[];
    if (ids.length) { const { data } = await supabase().from('usuarios').select('id, nome').in('id', ids); setNomes(Object.fromEntries((data || []).map((u: { id: string; nome: string }) => [u.id, u.nome]))); }
    const alvo = L.find((x) => x.id === (manter || sel)) || L[0];
    setSel(alvo?.id || ''); setM(alvo ? { ...alvo } : null);
  }, [sel]);
  useEffect(() => { if (S.perm('modelos', 'ver')) carregar(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  if (!S.perm('modelos', 'ver')) return <SemPermissao />;
  if (!mods || !m) return <Carregando />;
  const faltE = (['razao_social', 'cnpj', 'endereco', 'cidade', 'representante'] as const).filter((k) => !E[k]);

  const salvarEmpresa = async () => {
    const sb = supabase();
    const a = await sb.from('configuracoes').upsert({ chave: 'empresa', valor: E, atualizado_em: new Date().toISOString() });
    const b = await sb.from('configuracoes').upsert({ chave: 'jornada', valor: { ...S.cfg.jornada, texto: jornada }, atualizado_em: new Date().toISOString() });
    if (a.error || b.error) return toast(erroAmigavel((a.error || b.error)!.message));
    await S.recarregarConfig();
    toast('Dados da empresa salvos (registrados na auditoria)');
  };

  const salvarModelo = async () => {
    const sb = supabase();
    const linha = { nome: m.nome.trim() || 'Modelo', tipo: m.tipo, usar_para: m.usar_para || null, texto: m.texto, atualizado_por: S.usuario.id, atualizado_em: new Date().toISOString() };
    let res;
    if (ehPadrao(m)) res = await sb.from('modelos_documento').insert({ ...linha, versao: m.versao + 1 }).select().single();
    else {
      const orig = mods.find((x) => x.id === m.id)!;
      if (orig.texto === m.texto && orig.nome === m.nome && orig.tipo === m.tipo && (orig.usar_para || '') === (m.usar_para || '')) return toast('Nada alterado');
      res = await sb.from('modelos_documento').update({ ...linha, versao: orig.versao + 1 }).eq('id', m.id).select().single();
    }
    if (res.error) return toast(erroAmigavel(res.error.message));
    if (m.usar_para) {
      const outros = mods.filter((x) => x.id !== m.id && !ehPadrao(x) && x.usar_para === m.usar_para);
      for (const o of outros) await sb.from('modelos_documento').update({ usar_para: null }).eq('id', o.id);
    }
    toast('Versão ' + res.data.versao + ' salva. Documentos já gerados não mudam.');
    carregar(res.data.id);
  };
  const novo = async (base?: ModeloDocumento) => {
    const { data, error } = await supabase().from('modelos_documento').insert({
      nome: base ? base.nome + ' (cópia)' : 'Novo modelo', tipo: base?.tipo || 'outro', usar_para: null, versao: 1, atualizado_por: S.usuario.id,
      texto: base?.texto || '# TÍTULO DO DOCUMENTO\n\nTexto com {{nome}}, CPF {{cpf}}, função {{cargo}}.\n\n{{empresa_cidade}}, {{data_hoje_extenso}}.\n\n[[assinaturas-partes]]',
    }).select().single();
    if (error) return toast(erroAmigavel(error.message));
    carregar(data.id);
  };
  const inserir = (k: string) => {
    const el = ta.current; if (!el) return;
    const t = '{{' + k + '}}'; const s = el.selectionStart ?? m.texto.length; const e2 = el.selectionEnd ?? s;
    setM({ ...m, texto: m.texto.slice(0, s) + t + m.texto.slice(e2) });
    setTimeout(() => { el.focus(); el.selectionStart = el.selectionEnd = s + t.length; });
  };
  const previsualizar = async () => {
    const { data } = await supabase().from('funcionarios').select('*').eq('status', 'Ativo').limit(1).maybeSingle();
    const e = data as Funcionario | null;
    const ctx = contexto(E, jornada, e
      ? { nome: e.nome, cpf: e.cpf, rg: e.rg, pis: e.pis, nasc: e.nascimento, ec: e.estado_civil, end: e.endereco, tel: e.telefone, mat: e.matricula, cargo: S.funcaoNome(e.funcao_id), obra: S.obraNome(e.obra_referencia_id), adm: pdk(e.data_admissao), tipo: e.tipo_contrato }
      : { cargo: '', obra: '' });
    setPrev({ titulo: 'Pré-visualização' + (e ? ' com ' + e.nome : ''), ...renderModelo(m.texto, ctx) });
  };

  return (
    <>
      <h1>Modelos de documentos</h1>
      <p className="sub">Contratos e fichas usados na admissão. Os campos entre chaves são preenchidos automaticamente com os dados da vaga aprovada ou do cadastro do funcionário.</p>
      {faltE.length > 0 && <div className="note"><b>Complete os dados da empresa</b> para que apareçam nos contratos (faltam: {faltE.length} campo(s)).</div>}
      <div className="card"><h3>Dados da empresa</h3>
        <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fill,minmax(240px,1fr))', gap: '0 14px' }}>
          {CAMPOS_EMP.map(([k, l]) => <div key={k}><label>{l}</label><input disabled={!edEmp} value={E[k] || ''} onChange={(e) => setE({ ...E, [k]: e.target.value })} /></div>)}
        </div>
        <label>Jornada padrão (usada nos contratos e na ficha preliminar)</label>
        <textarea rows={2} disabled={!edEmp} value={jornada} onChange={(e) => setJornada(e.target.value)} />
        {edEmp ? <div className="toolbar mt" style={{ marginBottom: 0 }}><span className="sp" /><button className="btn primary" onClick={salvarEmpresa}>Salvar dados da empresa</button></div>
          : <p className="small muted">Só o administrador (master) altera os dados da empresa.</p>}
      </div>
      <div className="tabs mt">
        {mods.map((x) => <button key={x.id} className={'btn sm ' + (x.id === m.id ? 'primary' : '')} onClick={() => { setSel(x.id); setM({ ...x }); }}>{x.nome}</button>)}
        <button className="btn sm" disabled={!S.perm('modelos', 'incluir')} title={S.perm('modelos', 'incluir') ? '' : SEM_PERM} onClick={() => novo()}>+ Novo modelo</button>
      </div>
      <div className="card">
        <div className="row">
          <div><label>Nome do modelo</label><input disabled={!ed} value={m.nome} onChange={(e) => setM({ ...m, nome: e.target.value })} /></div>
          <div><label>Tipo</label><select disabled={!ed} value={m.tipo} onChange={(e) => setM({ ...m, tipo: e.target.value as ModeloDocumento['tipo'] })}><option value="contrato">Contrato de trabalho</option><option value="ficha">Ficha de registro</option><option value="outro">Outro documento</option></select></div>
          <div><label>Usar por padrão para o contrato</label><select disabled={!ed} value={m.usar_para || ''} onChange={(e) => setM({ ...m, usar_para: e.target.value || null })}><option value="">—</option>{TIPOS_CONTRATO.map((x) => <option key={x}>{x}</option>)}</select></div>
        </div>
        <p className="small muted">{ehPadrao(m) ? 'Texto-base do portal (ainda não salvo no banco). Ao salvar, vira um modelo cadastrado.' : `Versão ${m.versao} · atualizado em ${fD(m.atualizado_em)}${m.atualizado_por ? ' por ' + (nomes[m.atualizado_por] || 'usuário do portal') : ''}`}</p>
        <label>Texto do modelo</label>
        <textarea ref={ta} rows={22} style={{ fontFamily: 'ui-monospace,Consolas,monospace', fontSize: 12.5, lineHeight: 1.5 }} disabled={!ed} value={m.texto} onChange={(e) => setM({ ...m, texto: e.target.value })} />
        <p className="small muted">Formatação: linha com <b>#</b> = título · <b>##</b> = cláusula · <b>**texto**</b> = negrito · linha em branco separa parágrafos · <b>[[assinaturas]]</b> = empregadora, empregado e duas testemunhas · <b>[[assinaturas-partes]]</b> = só as partes.</p>
        <label>Campos automáticos (clique para inserir no texto)</label>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>{PH.map(([k, l]) => <button key={k} className="btn sm" title={'{{' + k + '}}'} disabled={!ed} onClick={() => inserir(k)}>{l}</button>)}</div>
        <div className="toolbar mt" style={{ marginBottom: 0 }}>
          <button className="btn sm" onClick={previsualizar}>Pré-visualizar com um funcionário</button><span className="sp" />
          {S.perm('modelos', 'incluir') && <button className="btn sm" onClick={() => novo(m)}>Duplicar</button>}
          {(ed || (ehPadrao(m) && S.perm('modelos', 'incluir'))) && <button className="btn primary" onClick={salvarModelo}>Salvar nova versão</button>}
        </div>
      </div>
      <div className="note mt">Os textos-base seguem a CLT, mas são um ponto de partida: revise com o jurídico ou a contabilidade e ajuste à convenção coletiva da construção civil aplicável antes de usar.</div>
      {prev && <DocPreview titulo={prev.titulo} html={prev.html} falt={prev.falt} onClose={() => setPrev(null)} />}
    </>
  );
}
