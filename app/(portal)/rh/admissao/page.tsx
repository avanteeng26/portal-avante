'use client';
import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useSessao } from '@/components/Sessao';
import { Carregando, Kpi, Modal, Pill, SEM_PERM, SemPermissao, toast } from '@/components/ui';
import { avisarShell } from '@/components/Shell';
import { supabase } from '@/lib/supabase/client';
import { EM_ANDAMENTO, MOTIVOS, ST_CLS, ST_LABEL, TIPOS_CONTRATO, numAdm, podeAgir, proxEtapa } from '@/lib/admissao';
import { addD, BRL, dd, dk, fD, hoje, N, pdk } from '@/lib/format';
import { erroAmigavel, todas } from '@/lib/dados';
import { notificar } from '@/lib/notificar';
import type { Admissao, AdmHistorico, FluxoAdmissao } from '@/lib/types';
import { VagaCampos, vagaParaBanco, avisarEtapa, type VagaForm } from '@/components/AdmissaoComum';

export default function Admissoes() {
  const S = useSessao();
  const router = useRouter();
  const [L, setL] = useState<Admissao[] | null>(null);
  const [fim, setFim] = useState<Record<string, string>>({});
  const [tab, setTab] = useState<string | null>(null);
  const [nova, setNova] = useState(false);

  const ctx = { usuarioId: S.usuario.id, perfilId: S.perfil.id, master: S.perfil.master, fluxo: S.cfg.fluxo, perm: S.perm, obraLiberada: S.obraLiberada };

  useEffect(() => {
    if (!S.perm('admissao', 'ver')) return;
    (async () => {
      const A = await todas<Admissao>((a, b) => supabase().from('admissoes').select('*').order('numero', { ascending: false }).range(a, b));
      const conc = A.filter((r) => r.etapa === 'concluida').map((r) => r.id);
      const H = conc.length ? await todas<AdmHistorico>((a, b) => supabase().from('admissao_historico').select('admissao_id, criado_em, acao').in('admissao_id', conc).range(a, b)) : [];
      const m: Record<string, string> = {};
      H.forEach((h) => { if (!m[h.admissao_id] || h.criado_em > m[h.admissao_id]) m[h.admissao_id] = h.criado_em; });
      setFim(m); setL(A);
    })().catch((e) => toast(String(e.message || e)));
  }, [S]);

  const minhas = useMemo(() => (L || []).filter((r) => podeAgir(ctx, r)), [L]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!S.perm('admissao', 'ver')) return <SemPermissao />;
  if (!L) return <Carregando />;

  const t = tab || (minhas.length ? 'minhas' : 'todas');
  const ab = L.filter((r) => EM_ANDAMENTO.includes(r.etapa));
  const conc = L.filter((r) => r.etapa === 'concluida');
  const tempo = conc.length ? conc.reduce((s, r) => s + dd(new Date(r.criado_em), new Date(fim[r.id] || r.criado_em)), 0) / conc.length : 0;
  const lista = t === 'minhas' ? minhas : t === 'abertas' ? ab : L;

  return (
    <>
      <h1>Nova admissão</h1>
      <p className="sub">A obra abre a vaga; depois das aprovações, o RH reúne documentos e dados, encaminha o exame admissional, envia a ficha preliminar à contabilidade para o eSocial e, após a efetivação, anexa contrato e ficha assinados.</p>
      <div className="grid kpis">
        <Kpi l="Aguardando minha ação" v={minhas.length} st={minhas.length ? 'warn' : 'ok'} />
        <Kpi l="Em andamento" v={ab.length} h={ab.filter((r) => r.etapa === 'gestor' || r.etapa === 'diretoria').length + ' em aprovação · ' + ab.filter((r) => ['docs', 'exame', 'contab', 'assin'].includes(r.etapa)).length + ' com o RH'} />
        <Kpi l="Admitidos (45 dias)" v={conc.filter((r) => dd(new Date(r.criado_em), hoje()) <= 45).length} />
        <Kpi l="Tempo médio até a admissão" v={N(tempo) + ' dias'} h="Da abertura da vaga à conclusão" />
      </div>
      <div className="tabs mt">
        {[['minhas', 'Aguardando minha ação (' + minhas.length + ')'], ['abertas', 'Em andamento'], ['todas', 'Todas'], ['fluxo', 'Fluxo de aprovação']].map((x) => (
          <button key={x[0]} className={'btn sm ' + (t === x[0] ? 'primary' : '')} onClick={() => setTab(x[0])}>{x[1]}</button>
        ))}
        <span style={{ flex: 1 }} />
        <button className="btn sm primary" disabled={!S.perm('admissao', 'incluir')} title={S.perm('admissao', 'incluir') ? '' : SEM_PERM} onClick={() => setNova(true)}>+ Abrir vaga</button>
      </div>
      {t === 'fluxo' ? <Fluxo /> : (
        <div className="card tablewrap">
          <table>
            <thead><tr><th>Nº</th><th>Cargo</th><th>Obra</th><th>Candidato</th><th>Motivo</th><th>Início previsto</th><th>Situação</th><th className="num">Dias</th></tr></thead>
            <tbody>
              {lista.map((r) => (
                <tr key={r.id} className="click" onClick={() => router.push('/rh/admissao/' + r.id)}>
                  <td><b>{numAdm(r.numero)}</b></td><td>{S.funcaoNome(r.funcao_id)}</td><td>{S.obraNome(r.obra_id)}</td>
                  <td>{r.candidato?.nome || 'A definir'}</td><td className="small">{r.motivo}</td><td>{fD(r.inicio_previsto)}</td>
                  <td><Pill t={ST_LABEL[r.etapa]} c={ST_CLS[r.etapa]} />{podeAgir(ctx, r) && <> <Pill t="Sua vez" c="bad" /></>}</td>
                  <td className="num">{dd(new Date(r.criado_em), hoje())}</td>
                </tr>
              ))}
              {!lista.length && <tr><td colSpan={8} className="muted">Nada por aqui.</td></tr>}
            </tbody>
          </table>
        </div>
      )}
      {nova && <AbrirVaga onClose={() => setNova(false)} onOk={(id) => router.push('/rh/admissao/' + id)} />}
    </>
  );
}

function AbrirVaga({ onClose, onOk }: { onClose: () => void; onOk: (id: string) => void }) {
  const S = useSessao();
  const f0 = S.funcoes[0];
  const [v, setV] = useState<VagaForm>({ funcao_id: f0?.id || '', obra_id: (S.obrasUser.find((o) => o.nome !== 'ESCRITÓRIO') || S.obrasUser[0])?.id || '', motivo: MOTIVOS[0], substitui: '', salario: f0?.salario_base ? String(f0.salario_base) : '', tipo_contrato: TIPOS_CONTRATO[0], inicio_previsto: dk(addD(hoje(), 15)), justificativa: '', cand_nome: '', cand_tel: '' });
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const fl = S.cfg.fluxo;

  async function criar() {
    if (!v.justificativa.trim() || !v.inicio_previsto) return setErr('Informe a justificativa e a data de início.');
    if (!v.obra_id) return setErr('Escolha a obra.');
    setBusy(true);
    const base = vagaParaBanco(S, v);
    const etapa = proxEtapa(fl, base.salario, null);
    const sb = supabase();
    const { data, error } = await sb.from('admissoes').insert({ ...base, etapa, candidato: { nome: v.cand_nome.trim(), tel: v.cand_tel.trim() } }).select().single();
    if (error) { setBusy(false); return setErr(erroAmigavel(error.message)); }
    await sb.from('admissao_historico').insert({ admissao_id: data.id, etapa: 'solic', acao: 'Abriu a vaga', comentario: null });
    await avisarEtapa(S, data as Admissao);
    avisarShell();
    toast('Vaga ' + numAdm(data.numero) + ' aberta: ' + ST_LABEL[etapa as Admissao['etapa']].toLowerCase());
    onOk(data.id);
  }

  return (
    <Modal wide onClose={onClose}>
      <h2>Abertura de vaga</h2>
      <p className="muted">A obra informa a necessidade e o RH conduz a admissão. Depois de enviada, segue para: {[fl.gestor.ativo ? 'gestor' : '', fl.diretoria.ativo ? 'diretoria' + (fl.diretoria.acima_de ? ' (acima de ' + BRL(fl.diretoria.acima_de) + ')' : '') : '', 'RH'].filter(Boolean).join(' → ')}.</p>
      <VagaCampos v={v} setV={setV} />
      <div className="err">{err}</div>
      <div className="modal-actions"><button className="btn" onClick={onClose}>Cancelar</button><button className="btn primary" disabled={busy} onClick={criar}>Abrir vaga</button></div>
    </Modal>
  );
}

function Fluxo() {
  const S = useSessao();
  const ed = S.perm('usuarios', 'editar'); // configuracoes: só quem edita usuários (master)
  const [f, setF] = useState<FluxoAdmissao>(S.cfg.fluxo);
  const [busy, setBusy] = useState(false);
  const salvar = async () => {
    setBusy(true);
    const { error } = await supabase().from('configuracoes').upsert({ chave: 'fluxo_admissao', valor: f, atualizado_em: new Date().toISOString() });
    setBusy(false);
    if (error) return toast(erroAmigavel(error.message));
    await S.recarregarConfig();
    toast('Fluxo atualizado (registrado na auditoria)');
  };
  return (
    <>
      <div className="card"><h3>Fluxo de aprovação de contratações</h3>
        <p className="small muted">Definido pelo usuário master. Vale para as novas vagas e para as que ainda não passaram pela etapa.</p>
        <div className="tablewrap"><table>
          <thead><tr><th>#</th><th>Etapa</th><th>Quem age</th><th>Quando é exigida</th><th>Ativa</th></tr></thead>
          <tbody>
            <tr><td>1</td><td><b>Abertura da vaga</b><div className="small muted">Cargo, obra, motivo, salário, início e justificativa</div></td><td>Quem pode incluir em &quot;Nova admissão&quot; (encarregados, engenharia, RH)</td><td>Sempre</td><td><Pill t="Sim" c="ok" /></td></tr>
            <tr><td>2</td><td><b>Aprovação do gestor</b><div className="small muted">Valida a necessidade na obra</div></td>
              <td><select disabled={!ed} style={{ width: 'auto' }} value={f.gestor.perfil} onChange={(e) => setF({ ...f, gestor: { ...f.gestor, perfil: e.target.value } })}>{S.perfis.map((p) => <option key={p.id} value={p.id}>{p.nome}</option>)}</select><div className="small muted">só para as obras liberadas ao usuário</div></td>
              <td>Sempre</td><td><input type="checkbox" style={{ width: 'auto' }} disabled={!ed} checked={f.gestor.ativo} onChange={(e) => setF({ ...f, gestor: { ...f.gestor, ativo: e.target.checked } })} /></td></tr>
            <tr><td>3</td><td><b>Aprovação da diretoria</b><div className="small muted">Valida custo e orçamento</div></td>
              <td><select disabled={!ed} style={{ width: 'auto' }} value={f.diretoria.perfil} onChange={(e) => setF({ ...f, diretoria: { ...f.diretoria, perfil: e.target.value } })}>{S.perfis.map((p) => <option key={p.id} value={p.id}>{p.nome}</option>)}</select></td>
              <td>Salário acima de R$ <input type="number" style={{ width: 100 }} disabled={!ed} value={f.diretoria.acima_de} onChange={(e) => setF({ ...f, diretoria: { ...f.diretoria, acima_de: +e.target.value || 0 } })} /><div className="small muted">0 = sempre</div></td>
              <td><input type="checkbox" style={{ width: 'auto' }} disabled={!ed} checked={f.diretoria.ativo} onChange={(e) => setF({ ...f, diretoria: { ...f.diretoria, ativo: e.target.checked } })} /></td></tr>
            {[['Documentos e dados', 'Dados do candidato para a ficha e documentos pessoais'], ['Exame admissional', 'Guia de encaminhamento e resultado do ASO'], ['Contabilidade / eSocial', 'Ficha preliminar enviada; efetivação com matrícula e recibo S-2200'], ['Contrato e ficha assinados', 'Gerados pelos modelos e anexados assinados']].map(([a, b], i) => (
              <tr key={a}><td>{i + 4}</td><td><b>{a}</b><div className="small muted">{b}</div></td><td>RH (permissão &quot;Aprovar&quot; em Nova admissão)</td><td>Sempre</td><td><Pill t="Sim" c="ok" /></td></tr>
            ))}
          </tbody></table></div>
        <p className="small muted">Em cada aprovação é possível aprovar, devolver para ajuste ou reprovar (com motivo obrigatório). Quem precisa agir recebe aviso no portal. Tudo fica no histórico da vaga e na auditoria.</p>
      </div>
      <div className="card mt"><h3>Ao efetivar a admissão, avisar para mobilização e treinamentos</h3>
        <p className="small muted">Aviso no portal para os perfis marcados.</p>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px 18px' }}>
          {S.perfis.map((p) => (
            <label key={p.id} className="check"><input type="checkbox" disabled={!ed} checked={f.avisar_mobilizacao.perfis.includes(p.id)}
              onChange={(e) => setF({ ...f, avisar_mobilizacao: { ...f.avisar_mobilizacao, perfis: e.target.checked ? [...f.avisar_mobilizacao.perfis, p.id] : f.avisar_mobilizacao.perfis.filter((x) => x !== p.id) } })} /> {p.nome}</label>
          ))}
        </div>
        <label>E-mails adicionais (separados por vírgula)</label>
        <input disabled={!ed} value={f.avisar_mobilizacao.emails} onChange={(e) => setF({ ...f, avisar_mobilizacao: { ...f.avisar_mobilizacao, emails: e.target.value } })} />
        {ed && <div className="toolbar mt" style={{ marginBottom: 0 }}><span className="sp" /><button className="btn primary" disabled={busy} onClick={salvar}>Salvar fluxo</button></div>}
      </div>
    </>
  );
}

