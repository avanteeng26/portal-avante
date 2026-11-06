'use client';
import { use, useCallback, useEffect, useState, type ReactNode } from 'react';
import Link from 'next/link';
import { useSessao } from '@/components/Sessao';
import { Carregando, Modal, Pill, SemPermissao, toast } from '@/components/ui';
import { avisarShell } from '@/components/Shell';
import { DocChecklist } from '@/components/DocChecklist';
import { DocPreview } from '@/components/DocPreview';
import { VagaCampos, vagaParaBanco, avisarEtapa, type VagaForm } from '@/components/AdmissaoComum';
import { supabase } from '@/lib/supabase/client';
import { CAND_F, ENCERRADAS, ETAPAS, ST_CLS, ST_LABEL, TIPOS_CONTRATO, dirNecessaria, numAdm, podeAgir, proxEtapa } from '@/lib/admissao';
import { DOCS_CAND, linksTemporarios, porTipo, situacao } from '@/lib/docs';
import { carregarFuncionarios, erroAmigavel, proximaMatricula } from '@/lib/dados';
import { BRL2, dk, esc, fD, fDT, hoje, N, pdk } from '@/lib/format';
import { contexto, renderModelo } from '@/lib/modelos';
import { carregarModelos } from '@/lib/modelosDb';
import { registrarEvento } from '@/lib/audit';
import { notificar } from '@/lib/notificar';
import { downloadCSV, downloadWord, logoDataURL, printHTML } from '@/lib/print';
import type { Admissao, AdmHistorico, Documento, ModeloDocumento } from '@/lib/types';

type Sess = ReturnType<typeof useSessao>;

export default function AdmissaoDetalhe({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const S = useSessao();
  const [r, setR] = useState<Admissao | null | undefined>(undefined);
  const [hist, setHist] = useState<AdmHistorico[]>([]);
  const [docs, setDocs] = useState<Documento[]>([]);
  const [nomes, setNomes] = useState<Record<string, string>>({});
  const [cancelar, setCancelar] = useState(false);

  const carregar = useCallback(async () => {
    const sb = supabase();
    const [a, h, d] = await Promise.all([
      sb.from('admissoes').select('*').eq('id', id).maybeSingle(),
      sb.from('admissao_historico').select('*').eq('admissao_id', id).order('criado_em'),
      S.perm('docs', 'ver') ? sb.from('documentos').select('*').eq('admissao_id', id) : Promise.resolve({ data: [] }),
    ]);
    const H = (h.data || []) as AdmHistorico[];
    const ids = [...new Set([...H.map((x) => x.usuario_id), a.data?.aberto_por].filter(Boolean))] as string[];
    if (ids.length) {
      const { data: us } = await sb.from('usuarios').select('id, nome, email').in('id', ids);
      setNomes(Object.fromEntries((us || []).map((u: { id: string; nome: string }) => [u.id, u.nome])));
    }
    setR((a.data as Admissao) || null); setHist(H); setDocs((d.data || []) as Documento[]);
  }, [id, S]);
  useEffect(() => { carregar(); }, [carregar]);

  if (!S.perm('admissao', 'ver')) return <SemPermissao />;
  if (r === undefined) return <Carregando />;
  if (!r) return <p>Vaga não encontrada ou fora das obras liberadas para você.</p>;

  const ctx = { usuarioId: S.usuario.id, perfilId: S.perfil.id, master: S.perfil.master, fluxo: S.cfg.fluxo, perm: S.perm, obraLiberada: S.obraLiberada };
  const age = podeAgir(ctx, r);
  const verSal = S.perm('salarios', 'ver') || r.aberto_por === S.usuario.id;
  const quem = (u: string | null) => (u ? nomes[u] || 'usuário do portal' : '—');
  const c = r.candidato || {};

  /** Atualiza a admissão, grava o histórico e avisa a próxima etapa */
  const mover = async (upd: Partial<Admissao>, acao: string, comentario?: string) => {
    const sb = supabase();
    const { data, error } = await sb.from('admissoes').update(upd).eq('id', r.id).select().single();
    if (error) { toast(erroAmigavel(error.message)); return null; }
    const h = await sb.from('admissao_historico').insert({ admissao_id: r.id, etapa: r.etapa, acao, comentario: comentario || null });
    if (h.error) toast('Etapa gravada, mas o histórico não: ' + erroAmigavel(h.error.message));
    if (upd.etapa && upd.etapa !== r.etapa) await avisarEtapa(S, data as Admissao);
    await carregar(); avisarShell();
    return data as Admissao;
  };

  return (
    <>
      <Link className="btn sm" href="/rh/admissao">← Nova admissão</Link>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', alignItems: 'flex-end', margin: '14px 0' }}>
        <div>
          <h1>{numAdm(r.numero)} · {S.funcaoNome(r.funcao_id)}</h1>
          <p className="sub" style={{ margin: 0 }}>{S.obraNome(r.obra_id)} · vaga aberta por {quem(r.aberto_por)} em {fD(r.criado_em)}</p>
        </div>
        <div><Pill t={ST_LABEL[r.etapa]} c={ST_CLS[r.etapa]} /></div>
      </div>
      <div className="card"><Stepper r={r} hist={hist} /></div>

      {age ? <Acao r={r} hist={hist} docs={docs} setDocs={setDocs} mover={mover} recarregar={carregar} />
        : !ENCERRADAS.includes(r.etapa) && <div className="note mt">Aguardando: <b>{ST_LABEL[r.etapa]}</b>. Quem precisa agir recebe aviso no portal.</div>}

      <div className="grid charts" style={{ gridTemplateColumns: 'repeat(auto-fit,minmax(340px,1fr))' }}>
        <div className="card"><h3>Vaga</h3>
          <dl className="ficha">
            <dt>Cargo</dt><dd>{S.funcaoNome(r.funcao_id)}</dd><dt>Obra</dt><dd>{S.obraNome(r.obra_id)}</dd>
            <dt>Motivo</dt><dd>{r.motivo}{r.substitui ? ' · substitui ' + r.substitui : ''}</dd>
            <dt>Salário</dt><dd>{verSal ? BRL2(r.salario || 0) : <span className="muted">restrito</span>}</dd>
            <dt>Contrato</dt><dd>{r.tipo_contrato}</dd><dt>Início previsto</dt><dd>{fD(r.inicio_previsto)}</dd><dt>Justificativa</dt><dd>{r.justificativa}</dd>
          </dl>
        </div>
        <div className="card"><h3>Candidato</h3>
          <dl className="ficha">
            <dt>Nome</dt><dd>{c.nome || 'A definir'}</dd><dt>CPF</dt><dd>{c.cpf || '—'}</dd><dt>Telefone</dt><dd>{c.tel || '—'}</dd>
            <dt>ASO</dt><dd>{r.aso_resultado ? <><Pill t={r.aso_resultado} c={r.aso_resultado === 'Apto' ? 'ok' : 'warn'} /> {fD(r.aso_data)}</> : '—'}</dd>
            {r.contab_enviado_em && <><dt>Contabilidade</dt><dd>ficha enviada em {fD(r.contab_enviado_em)}</dd></>}
            {r.recibo_esocial && <><dt>eSocial</dt><dd>recibo {r.recibo_esocial}</dd></>}
            {r.funcionario_id && <><dt>Matrícula</dt><dd><Link className="lp-link" href={'/rh/funcionarios/' + r.funcionario_id}>{r.matricula} · abrir ficha</Link></dd></>}
          </dl>
        </div>
      </div>

      <div className="card mt"><h3>Histórico</h3>
        <div className="tl">
          {hist.slice().reverse().map((h) => (
            <div key={h.id} className="tl-i"><b>{h.acao}</b> · {quem(h.usuario_id)} · <span className="muted">{fDT(h.criado_em)}</span>{h.comentario && <div className="tl-c">{h.comentario}</div>}</div>
          ))}
        </div>
      </div>
      {!ENCERRADAS.includes(r.etapa) && (r.aberto_por === S.usuario.id || S.perm('admissao', 'editar')) && (
        <div className="toolbar mt"><span className="sp" /><button className="btn sm" onClick={() => setCancelar(true)}>Cancelar processo</button></div>
      )}
      {cancelar && <Cancelar onClose={() => setCancelar(false)} onOk={async (m) => { setCancelar(false); if (await mover({ etapa: 'cancelada', parou_em: r.etapa }, 'Cancelou', m)) toast('Processo cancelado'); }} />}
    </>
  );
}

function Stepper({ r, hist }: { r: Admissao; hist: AdmHistorico[] }) {
  const S = useSessao();
  const term = ['reprovada', 'cancelada', 'devolvida'].includes(r.etapa);
  const cur = term ? r.parou_em || 'gestor' : r.etapa;
  const ci = ETAPAS.findIndex((x) => x[0] === cur);
  const feita = (id: string) => hist.slice().reverse().find((h) => h.etapa === id && !/^(Devolveu|Reprovou|Cancelou)/.test(h.acao))?.criado_em;
  return (
    <div className="stepper">
      {ETAPAS.map(([id, t], i) => {
        const skip = (id === 'gestor' && !S.cfg.fluxo.gestor.ativo && !feita(id)) || (id === 'diretoria' && !dirNecessaria(S.cfg.fluxo, r.salario) && !feita(id));
        let cls = 'pend', sub = '';
        if (skip) { cls = 'skip'; sub = 'não exigida'; }
        else if (r.etapa === 'concluida' || i < ci) cls = 'sok';
        else if (i === ci) cls = term ? 'bad' : 'cur';
        if (i === ci && term) sub = ({ reprovada: 'reprovada', devolvida: 'devolvida', cancelada: 'cancelada' } as Record<string, string>)[r.etapa];
        const f = id === 'concluida' && r.etapa === 'concluida' ? hist[hist.length - 1]?.criado_em : feita(id);
        if (f && !sub && cls === 'sok') sub = fD(f);
        return (
          <div key={id} className={'st ' + cls}>
            <div className="dot">{cls === 'sok' ? '✓' : cls === 'bad' ? '✕' : i + 1}</div>
            <div className="st-t">{t}</div><div className="st-s">{sub}</div>
          </div>
        );
      })}
    </div>
  );
}

type Mover = (upd: Partial<Admissao>, acao: string, comentario?: string) => Promise<Admissao | null>;

function Box({ t, sub, children }: { t: string; sub?: string; children: ReactNode }) {
  return <div className="card mt acao"><h3>{t}</h3>{sub && <p className="small muted" style={{ marginTop: -6 }}>{sub}</p>}{children}</div>;
}
function Botoes({ err, children }: { err: string; children: ReactNode }) {
  return <><div className="err">{err}</div><div className="toolbar mt" style={{ marginBottom: 0 }}><span className="sp" />{children}</div></>;
}

function Acao(p: { r: Admissao; hist: AdmHistorico[]; docs: Documento[]; setDocs: (d: Documento[]) => void; mover: Mover; recarregar: () => Promise<void> }) {
  const { r } = p;
  if (r.etapa === 'gestor' || r.etapa === 'diretoria') return <Aprovacao {...p} />;
  if (r.etapa === 'devolvida') return <Devolvida {...p} />;
  if (r.etapa === 'docs') return <EtapaDocs {...p} />;
  if (r.etapa === 'exame') return <EtapaExame {...p} />;
  if (r.etapa === 'contab') return <EtapaContab {...p} />;
  if (r.etapa === 'assin') return <EtapaAssin {...p} />;
  return null;
}

// ---------- gestor / diretoria ----------
function Aprovacao({ r, mover }: { r: Admissao; mover: Mover }) {
  const S = useSessao();
  const [com, setCom] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const q = r.etapa === 'gestor' ? 'gestor' : 'diretoria';
  const dec = async (d: 'aprovar' | 'devolver' | 'reprovar') => {
    if (d !== 'aprovar' && !com.trim()) return setErr('Escreva o motivo no comentário.');
    setBusy(true);
    const upd: Partial<Admissao> = d === 'aprovar' ? { etapa: proxEtapa(S.cfg.fluxo, r.salario, r.etapa) } : { etapa: d === 'devolver' ? 'devolvida' : 'reprovada', parou_em: r.etapa };
    const acao = d === 'aprovar' ? `Aprovou (${q})` : d === 'devolver' ? `Devolveu para ajuste (${q})` : `Reprovou (${q})`;
    const ok = await mover(upd, acao, com.trim());
    setBusy(false);
    if (ok) toast('Registrado: ' + ST_LABEL[ok.etapa]);
  };
  return (
    <Box t="Sua aprovação" sub={r.etapa === 'gestor' ? 'Confirme se a vaga é necessária para a obra.' : 'Confirme o custo e o orçamento da contratação.'}>
      <label>Comentário (obrigatório para devolver ou reprovar)</label>
      <textarea rows={2} value={com} onChange={(e) => setCom(e.target.value)} />
      <Botoes err={err}>
        <button className="btn" disabled={busy} onClick={() => dec('reprovar')}>Reprovar</button>
        <button className="btn" disabled={busy} onClick={() => dec('devolver')}>Devolver para a obra</button>
        <button className="btn primary" disabled={busy} onClick={() => dec('aprovar')}>Aprovar</button>
      </Botoes>
    </Box>
  );
}

function Devolvida({ r, hist, mover }: { r: Admissao; hist: AdmHistorico[]; mover: Mover }) {
  const S = useSessao();
  const [v, setV] = useState<VagaForm>({ funcao_id: r.funcao_id || '', obra_id: r.obra_id || '', motivo: r.motivo || '', substitui: r.substitui || '', salario: String(r.salario ?? ''), tipo_contrato: r.tipo_contrato, inicio_previsto: r.inicio_previsto || '', justificativa: r.justificativa, cand_nome: r.candidato?.nome || '', cand_tel: r.candidato?.tel || '' });
  const [err, setErr] = useState('');
  const motivo = hist.slice().reverse().find((h) => h.acao.startsWith('Devolveu'))?.comentario || '';
  const reenviar = async () => {
    if (!v.justificativa.trim() || !v.inicio_previsto) return setErr('Informe a justificativa e a data de início.');
    const base = vagaParaBanco(S, v);
    const ok = await mover({ ...base, candidato: { ...r.candidato, nome: v.cand_nome.trim(), tel: v.cand_tel.trim() }, etapa: proxEtapa(S.cfg.fluxo, base.salario, null), parou_em: null }, 'Ajustou e reenviou');
    if (ok) toast('Vaga reenviada para aprovação');
  };
  return (
    <Box t="Ajuste e reenvie">
      <p className="small muted">Motivo: <b>{motivo}</b></p>
      <VagaCampos v={v} setV={setV} />
      <Botoes err={err}><button className="btn primary" onClick={reenviar}>Reenviar</button></Botoes>
    </Box>
  );
}

// ---------- documentos e dados ----------
function CandForm({ c, set, ro }: { c: Record<string, string>; set: (c: Record<string, string>) => void; ro?: boolean }) {
  return (
    <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fill,minmax(200px,1fr))', gap: '0 12px' }}>
      {CAND_F.map(([k, l, obr, t]) => (
        <div key={k} style={k === 'end' || k === 'mae' ? { gridColumn: 'span 2' } : undefined}>
          <label>{l}{obr ? ' *' : ''}</label>
          {Array.isArray(t)
            ? <select disabled={ro} value={c[k] || ''} onChange={(e) => set({ ...c, [k]: e.target.value })}><option value="" />{t.map((o) => <option key={o}>{o}</option>)}</select>
            : <input disabled={ro} type={t === 'date' ? 'date' : 'text'} value={c[k] || ''} onChange={(e) => set({ ...c, [k]: e.target.value })} />}
        </div>
      ))}
    </div>
  );
}

function EtapaDocs({ r, docs, setDocs, mover, recarregar }: { r: Admissao; docs: Documento[]; setDocs: (d: Documento[]) => void; mover: Mover; recarregar: () => Promise<void> }) {
  const S = useSessao();
  const [c, setC] = useState<Record<string, string>>({ ...r.candidato });
  const [ct, setCt] = useState({ funcao_id: r.funcao_id || '', obra_id: r.obra_id || '', salario: String(r.salario ?? ''), tipo_contrato: r.tipo_contrato, inicio_previsto: r.inicio_previsto || '' });
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const sal = S.perm('salarios', 'ver');
  const dados = () => ({ candidato: c, funcao_id: ct.funcao_id || null, obra_id: ct.obra_id || null, salario: sal ? Number(ct.salario) || null : r.salario, tipo_contrato: ct.tipo_contrato, inicio_previsto: ct.inicio_previsto || null });

  const salvar = async () => {
    setBusy(true);
    const { data, error } = await supabase().from('admissoes').update(dados()).eq('id', r.id).select('id');
    setBusy(false);
    if (error) return toast(erroAmigavel(error.message));
    if (!data?.length) return toast(erroAmigavel('0 rows'));
    toast('Dados salvos'); recarregar();
  };
  const concluir = async () => {
    const m = porTipo(docs);
    const fc = CAND_F.filter((f) => f[2] && !(c[f[0]] || '').toString().trim()).map((f) => f[1]);
    const fd = DOCS_CAND.filter(([id, , o]) => o && situacao(m, id, o) !== 'recebido').map((x) => x[1]);
    if (fc.length || fd.length) return setErr((fc.length ? 'Preencha: ' + fc.slice(0, 6).join(', ') + (fc.length > 6 ? '…' : '') + '. ' : '') + (fd.length ? 'Faltam documentos: ' + fd.slice(0, 4).join(', ') + (fd.length > 4 ? '…' : '') + '.' : ''));
    setBusy(true);
    const ok = await mover({ ...dados(), etapa: proxEtapa(S.cfg.fluxo, r.salario, 'docs') }, 'Concluiu documentos e dados');
    setBusy(false);
    if (ok) toast('Documentos e dados concluídos');
  };
  const encerrar = async () => {
    const m = prompt('Motivo do encerramento (ex.: candidato desistiu):');
    if (!m) return;
    if (await mover({ etapa: 'reprovada', parou_em: 'docs' }, 'Encerrou (RH)', m)) toast('Processo encerrado');
  };

  return (
    <Box t="Documentos e dados do candidato" sub="Tudo o que a contabilidade vai precisar para o eSocial. Os campos com * são obrigatórios.">
      <h3 style={{ fontSize: 14 }}>Dados para a ficha de admissão</h3>
      <CandForm c={c} set={setC} />
      <h3 style={{ fontSize: 14 }} className="mt">Dados do contrato</h3>
      <div className="row">
        <div><label>Cargo</label><select value={ct.funcao_id} onChange={(e) => setCt({ ...ct, funcao_id: e.target.value })}>{S.funcoes.map((x) => <option key={x.id} value={x.id}>{x.nome}</option>)}</select></div>
        <div><label>Obra inicial</label><select value={ct.obra_id} onChange={(e) => setCt({ ...ct, obra_id: e.target.value })}>{S.obrasUser.map((o) => <option key={o.id} value={o.id}>{o.nome}</option>)}</select></div>
        <div><label>Salário (R$)</label><input type="number" disabled={!sal} value={ct.salario} onChange={(e) => setCt({ ...ct, salario: e.target.value })} /></div>
        <div><label>Tipo de contrato</label><select value={ct.tipo_contrato} onChange={(e) => setCt({ ...ct, tipo_contrato: e.target.value })}>{TIPOS_CONTRATO.map((x) => <option key={x}>{x}</option>)}</select></div>
        <div><label>Início previsto</label><input type="date" value={ct.inicio_previsto} onChange={(e) => setCt({ ...ct, inicio_previsto: e.target.value })} /></div>
      </div>
      <h3 style={{ fontSize: 14 }} className="mt">Documentos pessoais</h3>
      <DocChecklist semTabelaCard itens={DOCS_CAND} docs={docs} admissaoId={r.id} contexto={numAdm(r.numero)}
        podeEditar={S.perm('docs', 'editar')} podeIncluir={S.perm('docs', 'incluir')} podeExcluir={S.perm('docs', 'excluir')}
        onChange={(d) => setDocs([...docs.filter((x) => x.id !== d.id), d])} />
      <Botoes err={err}>
        <button className="btn" disabled={busy} onClick={encerrar}>Encerrar (candidato desistiu)</button>
        <button className="btn" disabled={busy} onClick={salvar}>Salvar rascunho</button>
        <button className="btn primary" disabled={busy} onClick={concluir}>Concluir documentos e dados</button>
      </Botoes>
    </Box>
  );
}

// ---------- exame admissional ----------
async function guiaHTML(S: Sess, r: Admissao, g: Record<string, string>) {
  const c = r.candidato || {}, E = S.cfg.empresa, logo = await logoDataURL();
  return `<img src="${logo}" style="height:38pt"><h1>GUIA DE ENCAMINHAMENTO PARA EXAME MÉDICO OCUPACIONAL</h1><p><b>Tipo de exame:</b> ADMISSIONAL</p>
 <h2>Empresa</h2><p>${esc(E.razao_social || 'Avante Engenharia')}${E.cnpj ? ' · CNPJ ' + esc(E.cnpj) : ''}<br>${esc(E.endereco || '')}</p>
 <h2>Candidato</h2><p><b>Nome:</b> ${esc(c.nome)}<br><b>CPF:</b> ${esc(c.cpf)} &nbsp; <b>RG:</b> ${esc(c.rg || '')} &nbsp; <b>Nascimento:</b> ${c.nasc ? fD(c.nasc) : ''}<br><b>Função:</b> ${esc(S.funcaoNome(r.funcao_id))} &nbsp; <b>Local de trabalho:</b> ${esc(S.obraNome(r.obra_id))}</p>
 <h2>Riscos ocupacionais</h2><p>${esc(g.riscos || '')}</p><h2>Exames solicitados</h2><p>${esc(g.exames || '')}</p>
 <h2>Clínica</h2><p>${esc(g.clinica || '______________________')}<br>${esc(g.end || '')}<br><b>Data/hora:</b> ${g.quando ? fDT(g.quando) : '____/____/______ às ____:____'}</p>
 <p style="font-size:9pt">O candidato deve apresentar documento oficial com foto. Esta guia não autoriza o início das atividades.</p>
 <table class="sig"><tr><td><div class="sl"></div>Responsável pelo RH · ${esc(S.usuario.nome)}</td><td><div class="sl"></div>Médico examinador / clínica</td></tr></table>`;
}

function EtapaExame({ r, docs, setDocs, mover, recarregar }: { r: Admissao; docs: Documento[]; setDocs: (d: Documento[]) => void; mover: Mover; recarregar: () => Promise<void> }) {
  const S = useSessao();
  const g0 = r.guia_exame || {};
  const [g, setG] = useState<Record<string, string>>({
    clinica: g0.clinica ?? S.cfg.empresa.clinica ?? '', end: g0.end ?? S.cfg.empresa.clinica_endereco ?? '', quando: g0.quando || '',
    riscos: g0.riscos ?? 'Conforme o PGR para a função de ' + S.funcaoNome(r.funcao_id) + '.', exames: g0.exames ?? 'Exame clínico ocupacional e exames complementares previstos no PCMSO para a função.',
  });
  const [aso, setAso] = useState({ res: r.aso_resultado || '', data: r.aso_data || '' });
  const [err, setErr] = useState('');
  const asoDoc = porTipo(docs).aso;

  const gerarGuia = async () => {
    const guia = { ...g, gerada_em: new Date().toISOString() };
    const ok = await mover({ guia_exame: guia }, 'Gerou guia de encaminhamento', g.clinica);
    if (!ok) return;
    registrarEvento('Imprimiu guia de exame admissional', numAdm(r.numero) + ' · ' + (r.candidato?.nome || ''));
    printHTML(await guiaHTML(S, ok, guia));
  };
  const concluir = async () => {
    if (!r.guia_exame?.gerada_em) return setErr('Gere a guia de encaminhamento primeiro.');
    if (!aso.res || !aso.data) return setErr('Informe o resultado e a data do exame.');
    if (aso.res === 'Inapto') return setErr('Candidato inapto: use "Encerrar".');
    if (!asoDoc?.arquivo_path) return setErr('Anexe o ASO admissional.');
    const ok = await mover({ aso_resultado: aso.res, aso_data: aso.data, guia_exame: { ...r.guia_exame, ...g }, etapa: 'contab' }, 'Registrou exame admissional', aso.res + ' em ' + fD(aso.data));
    if (ok) toast('Exame registrado');
  };
  const encerrar = async () => {
    const m = prompt('Motivo do encerramento (inapto / desistência):');
    if (!m) return;
    if (await mover({ etapa: 'reprovada', parou_em: 'exame', aso_resultado: aso.res || null, aso_data: aso.data || null }, 'Encerrou (RH)', m)) toast('Processo encerrado');
  };

  return (
    <Box t="Exame admissional" sub="Gere a guia, envie o candidato à clínica e registre o resultado.">
      <div className="row">
        <div><label>Clínica</label><input value={g.clinica} onChange={(e) => setG({ ...g, clinica: e.target.value })} /></div>
        <div><label>Endereço da clínica</label><input value={g.end} onChange={(e) => setG({ ...g, end: e.target.value })} /></div>
        <div><label>Data e hora agendadas</label><input type="datetime-local" value={g.quando} onChange={(e) => setG({ ...g, quando: e.target.value })} /></div>
      </div>
      <label>Riscos ocupacionais da função</label><textarea rows={2} value={g.riscos} onChange={(e) => setG({ ...g, riscos: e.target.value })} />
      <label>Exames solicitados</label><textarea rows={2} value={g.exames} onChange={(e) => setG({ ...g, exames: e.target.value })} />
      <div className="toolbar mt">
        <button className="btn" onClick={gerarGuia}>Gerar guia de encaminhamento</button>
        {r.guia_exame?.gerada_em && <span className="small muted">Guia gerada em {fDT(r.guia_exame.gerada_em)}</span>}
      </div>
      <h3 style={{ fontSize: 14 }} className="mt">Resultado</h3>
      <div className="row">
        <div><label>Resultado do ASO</label><select value={aso.res} onChange={(e) => setAso({ ...aso, res: e.target.value })}><option value="">Pendente</option>{['Apto', 'Apto com restrição', 'Inapto'].map((x) => <option key={x}>{x}</option>)}</select></div>
        <div><label>Data do exame</label><input type="date" value={aso.data} onChange={(e) => setAso({ ...aso, data: e.target.value })} /></div>
        <div />
      </div>
      <DocChecklist semTabelaCard itens={[['aso', 'ASO admissional', true]]} docs={docs} admissaoId={r.id} contexto={numAdm(r.numero)}
        podeEditar={S.perm('docs', 'editar')} podeIncluir={S.perm('docs', 'incluir')} podeExcluir={S.perm('docs', 'excluir')}
        onChange={(d) => { setDocs([...docs.filter((x) => x.id !== d.id), d]); recarregar(); }} />
      <Botoes err={err}>
        <button className="btn" onClick={encerrar}>Encerrar (inapto / desistência)</button>
        <button className="btn primary" onClick={concluir}>Concluir exame</button>
      </Botoes>
    </Box>
  );
}

// ---------- contabilidade / eSocial ----------
async function fichaPreliminar(S: Sess, r: Admissao, docs: Documento[]) {
  const c = r.candidato || {}, E = S.cfg.empresa, logo = await logoDataURL();
  const row = (l: string, v: unknown) => `<tr><td class="k">${l}</td><td>${esc(v || '')}</td></tr>`;
  const sec = (t: string, rows: string) => `<h2>${t}</h2><table class="fp">${rows}</table>`;
  const f = S.funcoes.find((x) => x.id === r.funcao_id);
  const m = porTipo(docs);
  return `<img src="${logo}" style="height:38pt"><h1>FICHA PRELIMINAR DE ADMISSÃO</h1><p style="text-align:center;font-size:9pt">Para registro pela contabilidade (eSocial S-2200) · ${numAdm(r.numero)} · emitida em ${fD(hoje())}</p>
 ${sec('Empregador', row('Razão social', E.razao_social) + row('CNPJ', E.cnpj))}
 ${sec('Dados pessoais', row('Nome completo', c.nome) + row('CPF', c.cpf) + row('RG / órgão / emissão', [c.rg, c.rgOrg, c.rgData ? fD(c.rgData) : ''].filter(Boolean).join(' · ')) + row('PIS/NIS', c.pis) + row('Data de nascimento', c.nasc ? fD(c.nasc) : '') + row('Sexo', c.sexo) + row('Raça/cor', c.racaCor) + row('Estado civil', c.ec) + row('Grau de instrução', c.escol) + row('Nacionalidade', c.nacion) + row('Naturalidade', c.natural) + row('Nome da mãe', c.mae) + row('Nome do pai', c.pai) + row('Título de eleitor', c.titulo) + row('Nº de dependentes', c.dep))}
 ${sec('Endereço e contato', row('Endereço', c.end) + row('CEP', c.cep) + row('Telefone', c.tel) + row('E-mail', c.email))}
 ${sec('Dados bancários', row('Banco', c.banco) + row('Agência', c.ag) + row('Conta', c.conta) + row('Chave PIX', c.pix))}
 ${sec('Contrato', row('Cargo', S.funcaoNome(r.funcao_id)) + row('Salário', BRL2(r.salario || 0) + ((f?.periculosidade_pct || 0) > 0 ? ' + periculosidade ' + N(f!.periculosidade_pct) + '%' : '')) + row('Tipo de contrato', r.tipo_contrato) + row('Data de admissão prevista', fD(r.inicio_previsto)) + row('Local de trabalho inicial', S.obraNome(r.obra_id)) + row('Jornada', S.cfg.jornada.texto) + row('Vale-transporte', c.vt) + row('Vale-alimentação', BRL2(f?.va_padrao || 300) + '/mês'))}
 ${sec('Exame admissional', row('Resultado', r.aso_resultado) + row('Data', r.aso_data ? fD(r.aso_data) : '') + row('Clínica', r.guia_exame?.clinica))}
 ${sec('Documentos anexados no portal', [...DOCS_CAND, ['aso', 'ASO admissional', true] as [string, string, boolean]].filter(([id]) => m[id]?.situacao === 'recebido').map(([id, n]) => row(n, m[id].arquivo_nome || 'recebido')).join(''))}
 <table class="sig"><tr><td><div class="sl"></div>Responsável pelo RH</td><td><div class="sl"></div>Contabilidade (recebido em ___/___/____)</td></tr></table>`;
}

function EtapaContab({ r, docs, mover }: { r: Admissao; docs: Documento[]; mover: Mover }) {
  const S = useSessao();
  const [email, setEmail] = useState(r.contab_email || S.cfg.empresa.email_contabilidade || '');
  const [ret, setRet] = useState({ data: r.data_admissao || dk(r.inicio_previsto && pdk(r.inicio_previsto) > hoje() ? pdk(r.inicio_previsto) : hoje()), mat: r.matricula || '', esocial: r.recibo_esocial || '' });
  const [prev, setPrev] = useState<string | null>(null);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => { if (!ret.mat) carregarFuncionarios().then((F) => setRet((x) => ({ ...x, mat: x.mat || proximaMatricula(F) }))); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const titulo = 'Ficha preliminar - ' + (r.candidato?.nome || numAdm(r.numero));

  const verFicha = async () => { registrarEvento('Visualizou ficha preliminar', numAdm(r.numero)); setPrev(await fichaPreliminar(S, r, docs)); };
  const word = async () => { downloadWord(titulo, await fichaPreliminar(S, r, docs)); registrarEvento('Baixou ficha preliminar', numAdm(r.numero)); };
  const csv = () => {
    downloadCSV('ficha_preliminar_' + numAdm(r.numero) + '.csv', [['Campo', 'Valor'], ...CAND_F.map(([k, l]) => [l, r.candidato?.[k] || '']), ['Cargo', S.funcaoNome(r.funcao_id)], ['Salário', N(r.salario || 0, 2)], ['Tipo de contrato', r.tipo_contrato], ['Admissão prevista', fD(r.inicio_previsto)], ['Obra', S.obraNome(r.obra_id)], ['ASO', (r.aso_resultado || '') + ' ' + (r.aso_data || '')]]);
    registrarEvento('Exportou CSV', 'Ficha preliminar · ' + numAdm(r.numero));
  };
  const enviar = async () => {
    const em = email.trim();
    if (!em.includes('@')) return setErr('Informe o e-mail da contabilidade.');
    setBusy(true); setErr('');
    await word();
    const links = await linksTemporarios(docs.filter((d) => d.situacao === 'recebido'));
    const corpo = `Segue a ficha preliminar de admissão (arquivo Word baixado do portal, anexe a este e-mail) e os documentos do candidato para registro no eSocial (S-2200).\n\nCandidato: ${r.candidato?.nome || ''}\nCargo: ${S.funcaoNome(r.funcao_id)}\nAdmissão prevista: ${fD(r.inicio_previsto)} · Obra: ${S.obraNome(r.obra_id)}\n\nDocumentos (links válidos por 7 dias):\n${links.map((l) => '- ' + l.nome + ': ' + l.url).join('\n')}\n\nPor favor, retorne com a matrícula e o número do recibo do eSocial.`;
    const assunto = `[${S.cfg.empresa.razao_social || 'Avante Engenharia'}] Admissão ${r.candidato?.nome || ''} – ${S.funcaoNome(r.funcao_id)}`;
    // abre o programa de e-mail depois que o download da ficha começou (navegar antes cancela o download)
    setTimeout(() => { const a = document.createElement('a'); a.href = `mailto:${encodeURIComponent(em)}?subject=${encodeURIComponent(assunto)}&body=${encodeURIComponent(corpo)}`; document.body.appendChild(a); a.click(); a.remove(); }, 600);
    const ok = await mover({ contab_email: em, contab_enviado_em: new Date().toISOString() }, 'Enviou ficha à contabilidade', em);
    setBusy(false);
    if (ok) toast('E-mail preparado para ' + em + '. Anexe a ficha baixada e envie.');
  };

  const efetivar = async () => {
    const mat = ret.mat.trim();
    if (!r.contab_enviado_em) return setErr('Envie a ficha à contabilidade primeiro.');
    if (!ret.esocial.trim()) return setErr('Informe o recibo do eSocial (S-2200) enviado pela contabilidade.');
    if (!mat || !ret.data) return setErr('Informe a matrícula e a data de admissão.');
    setBusy(true); setErr('');
    const sb = supabase();
    const c = r.candidato || {};
    const F = S.funcoes.find((x) => x.id === r.funcao_id);
    const asoVenc = r.aso_data ? (() => { const d = pdk(r.aso_data!); return dk(new Date(d.getFullYear() + 1, d.getMonth(), d.getDate())); })() : null;
    const { data: f, error } = await sb.from('funcionarios').insert({
      matricula: mat, nome: c.nome, cpf: c.cpf || null, rg: c.rg || null, rg_orgao: c.rgOrg || null, rg_emissao: c.rgData || null, pis: c.pis || null,
      nascimento: c.nasc || null, sexo: c.sexo || null, raca_cor: c.racaCor || null, estado_civil: c.ec || null, grau_instrucao: c.escol || null,
      nacionalidade: c.nacion || null, naturalidade: c.natural || null, nome_mae: c.mae || null, nome_pai: c.pai || null,
      endereco: c.end || null, cep: c.cep || null, telefone: c.tel || null, email: c.email || null, dependentes: parseInt(c.dep || '0', 10) || 0, titulo_eleitor: c.titulo || null,
      funcao_id: r.funcao_id, obra_referencia_id: F?.administrativa ? (S.obras.find((o) => o.nome === 'ESCRITÓRIO')?.id ?? r.obra_id) : r.obra_id,
      data_admissao: ret.data, status: 'Ativo', tipo_contrato: 'CLT · ' + r.tipo_contrato.toLowerCase(), aso_vencimento: asoVenc,
    }).select().single();
    if (error) { setBusy(false); return setErr(erroAmigavel(error.message)); }
    const avisos: string[] = [];
    const rem = await sb.from('funcionarios_remuneracao').insert({
      funcionario_id: f.id, salario: r.salario || F?.salario_base || 0, adicional_pct: F?.periculosidade_pct || 0, va_valor: F?.va_padrao || 300,
      vale_transporte: c.vt === 'Optante', banco: c.banco || null, agencia: c.ag || null, conta: c.conta || null, pix: c.pix || null,
    });
    if (rem.error) avisos.push('remuneração (' + erroAmigavel(rem.error.message) + ')');
    const dd_ = await sb.from('documentos').update({ funcionario_id: f.id }).eq('admissao_id', r.id);
    if (dd_.error) avisos.push('vínculo dos documentos (' + erroAmigavel(dd_.error.message) + ')');
    await sb.from('documentos').insert({ funcionario_id: f.id, admissao_id: r.id, tipo: 'esocial', situacao: 'recebido', arquivo_nome: 'Recibo S-2200 nº ' + ret.esocial.trim(), enviado_por: S.usuario.id, enviado_em: new Date().toISOString() });
    if (r.aso_data && r.aso_resultado) {
      const a = await sb.from('asos').insert({ funcionario_id: f.id, tipo: 'Admissional', data: r.aso_data, resultado: r.aso_resultado, validade_meses: 12, clinica: r.guia_exame?.clinica || null, arquivo_path: porTipo(docs).aso?.arquivo_path || null });
      if (a.error) avisos.push('ASO no SESMT (' + erroAmigavel(a.error.message) + ')');
    }
    const mb = await sb.from('mobilizacoes').insert({ funcionario_id: f.id, admissao_id: r.id, obra_id: r.obra_id });
    if (mb.error) avisos.push('mobilização (' + erroAmigavel(mb.error.message) + ')');
    for (const p of S.cfg.fluxo.avisar_mobilizacao.perfis || []) {
      await notificar({ perfil: p, titulo: 'Novo funcionário para mobilização: ' + c.nome, texto: S.funcaoNome(r.funcao_id) + ' · ' + S.obraNome(r.obra_id) + ' · admissão ' + fD(ret.data) + ' · integração, OS, EPI e treinamentos NR', link: '/rh/funcionarios/' + f.id, email: true });
    }
    const ok = await mover({ funcionario_id: f.id, matricula: mat, data_admissao: ret.data, recibo_esocial: ret.esocial.trim(), etapa: 'assin' }, 'Registrou efetivação', 'Matrícula ' + mat + ' · eSocial ' + ret.esocial.trim() + ' · admissão ' + fD(ret.data));
    setBusy(false);
    if (ok) toast('Efetivado: matrícula ' + mat + '. O ponto já está liberado e o SESMT foi avisado.' + (avisos.length ? ' Atenção, não gravou: ' + avisos.join('; ') : ''));
  };

  return (
    <Box t="Ficha preliminar e efetivação pela contabilidade">
      <div className="toolbar">
        <button className="btn" onClick={verFicha}>Ver / imprimir ficha preliminar</button>
        <button className="btn" onClick={word}>Baixar em Word</button>
        <button className="btn" disabled={!S.perm('admissao', 'exportar')} onClick={csv}>Exportar dados (CSV)</button>
      </div>
      <div className="row">
        <div><label>E-mail da contabilidade</label><input value={email} placeholder="contato@contabilidade.com.br" onChange={(e) => setEmail(e.target.value)} /></div>
        <div style={{ alignSelf: 'end' }}><button className="btn primary" disabled={busy} onClick={enviar}>{r.contab_enviado_em ? 'Reenviar' : 'Enviar'} ficha à contabilidade</button></div>
      </div>
      {r.contab_enviado_em
        ? <p className="small"><Pill t="Enviada" c="ok" /> em {fDT(r.contab_enviado_em)} para {r.contab_email}</p>
        : <p className="small muted">Abre o seu programa de e-mail com os links temporários dos documentos e baixa a ficha em Word para anexar.</p>}
      <h3 style={{ fontSize: 14 }} className="mt">Retorno da contabilidade</h3>
      <div className="row">
        <div><label>Data de admissão</label><input type="date" value={ret.data} onChange={(e) => setRet({ ...ret, data: e.target.value })} /></div>
        <div><label>Matrícula</label><input value={ret.mat} onChange={(e) => setRet({ ...ret, mat: e.target.value })} /></div>
        <div><label>Recibo do eSocial (S-2200)</label><input value={ret.esocial} placeholder="Nº do recibo" onChange={(e) => setRet({ ...ret, esocial: e.target.value })} /></div>
      </div>
      <p className="small muted">Ao registrar a efetivação o funcionário entra no cadastro, passa a aparecer na folha de ponto a partir da data de admissão e o SESMT é avisado para a mobilização e os treinamentos.</p>
      <Botoes err={err}><button className="btn primary" disabled={busy || !r.contab_enviado_em} title={r.contab_enviado_em ? '' : 'Envie a ficha à contabilidade primeiro'} onClick={efetivar}>Registrar efetivação</button></Botoes>
      {prev && <DocPreview titulo="Ficha preliminar de admissão" html={prev} onClose={() => setPrev(null)}
        acoes={<><button className="btn" onClick={word}>Baixar Word</button><button className="btn" onClick={() => { registrarEvento('Imprimiu ficha preliminar', numAdm(r.numero)); printHTML(prev); }}>Imprimir</button></>} />}
    </Box>
  );
}

// ---------- contrato e ficha assinados ----------
const GER: [string, string, ModeloDocumento['tipo']][] = [['contrato', 'Contrato de trabalho', 'contrato'], ['fichareg', 'Ficha de registro do empregado', 'ficha']];

function EtapaAssin({ r, hist, docs, setDocs, mover }: { r: Admissao; hist: AdmHistorico[]; docs: Documento[]; setDocs: (d: Documento[]) => void; mover: Mover }) {
  const S = useSessao();
  const [mods, setMods] = useState<ModeloDocumento[]>([]);
  const [sel, setSel] = useState<Record<string, string>>({});
  const [prevFim, setPrevFim] = useState(r.previsao_fim_obra || '');
  const [prev, setPrev] = useState<{ titulo: string; html: string; falt: string[] } | null>(null);
  const [err, setErr] = useState('');
  const [rem, setRem] = useState<number | null>(null);
  useEffect(() => {
    carregarModelos().then((L) => {
      setMods(L);
      const s: Record<string, string> = {};
      GER.forEach(([doc, , tipo]) => { const ms = L.filter((m) => m.tipo === tipo); s[doc] = (ms.find((m) => m.usar_para === r.tipo_contrato) || ms[0])?.id || ''; });
      setSel(s);
    });
    if (r.funcionario_id && S.perm('salarios', 'ver')) supabase().from('funcionarios_remuneracao').select('adicional_pct').eq('funcionario_id', r.funcionario_id).maybeSingle().then(({ data }) => setRem(data?.adicional_pct ?? null));
  }, [r.tipo_contrato, r.funcionario_id, S]);
  const m = porTipo(docs);

  const gerar = async (doc: string) => {
    const mod = mods.find((x) => x.id === sel[doc]);
    if (!mod) return toast('Cadastre um modelo para este documento');
    if (prevFim !== (r.previsao_fim_obra || '')) await supabase().from('admissoes').update({ previsao_fim_obra: prevFim || null }).eq('id', r.id);
    const c = r.candidato || {};
    const F = S.funcoes.find((x) => x.id === r.funcao_id);
    const res = renderModelo(mod.texto, contexto(S.cfg.empresa, S.cfg.jornada.texto || '', {
      nome: c.nome, cpf: c.cpf, rg: c.rg, pis: c.pis, nasc: c.nasc, ec: c.ec, end: c.end, tel: c.tel, mat: r.matricula,
      cargo: S.funcaoNome(r.funcao_id), obra: S.obraNome(r.obra_id), salario: r.salario, adicional: (rem ?? F?.periculosidade_pct ?? 0) > 0,
      adm: r.data_admissao ? pdk(r.data_admissao) : null, prev: prevFim || null, tipo: r.tipo_contrato,
    }));
    await supabase().from('admissao_historico').insert({ admissao_id: r.id, etapa: 'assin_gerado', acao: 'Gerou documento', comentario: mod.nome + ' (modelo v' + mod.versao + ')' + (res.falt.length ? ' · ' + res.falt.length + ' campo(s) em branco' : '') });
    setPrev({ titulo: mod.nome + ' · ' + (c.nome || numAdm(r.numero)), ...res });
  };
  const concluir = async () => {
    const falt = GER.filter(([d]) => !m[d]?.arquivo_path).map(([, n]) => n.toLowerCase() + ' assinado(a)');
    if (falt.length) return setErr('Anexe: ' + falt.join(' e ') + '.');
    const ok = await mover({ etapa: 'concluida', previsao_fim_obra: prevFim || null }, 'Anexou contrato e ficha assinados e concluiu a admissão');
    if (ok) toast('Admissão concluída');
  };
  const gerados = (doc: string) => hist.filter((h) => h.acao === 'Gerou documento' && (h.comentario || '').toLowerCase().includes(doc === 'contrato' ? 'contrato' : 'ficha')).length;

  return (
    <Box t="Contrato e ficha de registro assinados" sub="Gere pelos modelos (ou use os recebidos da contabilidade), colha as assinaturas e anexe as versões assinadas. O ponto já está liberado desde a efetivação.">
      {r.tipo_contrato === 'Prazo determinado (obra)' && (
        <div className="row"><div><label>Previsão de término da obra (vai no contrato)</label><input type="date" value={prevFim} onChange={(e) => setPrevFim(e.target.value)} /></div><div /></div>
      )}
      <div className="tablewrap" style={{ margin: '10px 0 16px' }}>
        <table>
          <thead><tr><th>Documento</th><th>Modelo</th><th>Gerado</th><th>Versão assinada</th><th></th></tr></thead>
          <tbody>
            {GER.map(([doc, nome, tipo]) => {
              const ms = mods.filter((x) => x.tipo === tipo);
              const n = gerados(doc);
              return (
                <tr key={doc}>
                  <td><b>{nome}</b></td>
                  <td><select style={{ width: 'auto', maxWidth: 260 }} value={sel[doc] || ''} onChange={(e) => setSel({ ...sel, [doc]: e.target.value })}>{ms.map((x) => <option key={x.id} value={x.id}>{x.nome}</option>)}{!ms.length && <option>Nenhum modelo</option>}</select></td>
                  <td className="small">{n ? <><Pill t="Gerado" c="ok" /> {n}ª via</> : <Pill t="Não gerado" c="warn" />}</td>
                  <td className="small">{m[doc]?.arquivo_path ? <><Pill t="Anexada" c="ok" /> {m[doc].arquivo_nome}</> : <Pill t="Pendente" c="warn" />}</td>
                  <td style={{ whiteSpace: 'nowrap' }}><button className="btn sm primary" onClick={() => gerar(doc)}>{n ? 'Gerar de novo' : 'Gerar'}</button></td>
                </tr>
              );
            })}
          </tbody>
        </table>
        <p className="small muted">Fluxo: gerar → imprimir ou baixar em Word → colher assinaturas → anexar a versão assinada abaixo. A admissão só é concluída com o contrato e a ficha assinados anexados.</p>
      </div>
      <DocChecklist semTabelaCard itens={GER.map(([d, n]) => [d, n + ' (assinado)', true] as [string, string, boolean])} docs={docs} admissaoId={r.id} funcionarioId={r.funcionario_id} contexto={numAdm(r.numero)}
        podeEditar={S.perm('docs', 'editar')} podeIncluir={S.perm('docs', 'incluir')} podeExcluir={S.perm('docs', 'excluir')}
        onChange={(d) => setDocs([...docs.filter((x) => x.id !== d.id), d])} />
      <Botoes err={err}><button className="btn primary" onClick={concluir}>Concluir admissão</button></Botoes>
      {prev && <DocPreview titulo={prev.titulo} html={prev.html} falt={prev.falt} onClose={() => setPrev(null)}
        acoes={<><button className="btn" onClick={() => { downloadWord(prev.titulo, prev.html); registrarEvento('Baixou documento', numAdm(r.numero) + ' · ' + prev.titulo); }}>Baixar Word</button><button className="btn" onClick={() => { registrarEvento('Imprimiu documento', numAdm(r.numero) + ' · ' + prev.titulo); printHTML(prev.html); }}>Imprimir</button></>} />}
    </Box>
  );
}

function Cancelar({ onClose, onOk }: { onClose: () => void; onOk: (m: string) => void }) {
  const [m, setM] = useState('');
  const [err, setErr] = useState('');
  return (
    <Modal onClose={onClose}>
      <h2>Cancelar processo?</h2>
      <label>Motivo</label><input value={m} onChange={(e) => setM(e.target.value)} />
      <div className="err">{err}</div>
      <div className="modal-actions"><button className="btn" onClick={onClose}>Voltar</button><button className="btn primary" onClick={() => (m.trim() ? onOk(m.trim()) : setErr('Informe o motivo.'))}>Cancelar processo</button></div>
    </Modal>
  );
}

