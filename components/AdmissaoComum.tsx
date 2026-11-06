'use client';
import { useSessao } from './Sessao';
import { MOTIVOS, ST_LABEL, TIPOS_CONTRATO, numAdm } from '@/lib/admissao';
import { notificar } from '@/lib/notificar';
import type { Admissao, FluxoAdmissao } from '@/lib/types';

export interface VagaForm { funcao_id: string; obra_id: string; motivo: string; substitui: string; salario: string; tipo_contrato: string; inicio_previsto: string; justificativa: string; cand_nome: string; cand_tel: string }

export function VagaCampos({ v, setV }: { v: VagaForm; setV: (v: VagaForm) => void }) {
  const S = useSessao();
  const sal = S.perm('salarios', 'ver');
  return (
    <>
      <div className="row">
        <div><label>Cargo</label><select value={v.funcao_id} onChange={(e) => { const f = S.funcoes.find((x) => x.id === e.target.value); setV({ ...v, funcao_id: e.target.value, salario: f?.salario_base ? String(f.salario_base) : v.salario }); }}>{S.funcoes.map((x) => <option key={x.id} value={x.id}>{x.nome}</option>)}</select></div>
        <div><label>Obra / centro de custo</label><select value={v.obra_id} onChange={(e) => setV({ ...v, obra_id: e.target.value })}>{S.obrasUser.map((o) => <option key={o.id} value={o.id}>{o.nome}</option>)}</select></div>
      </div>
      <div className="row">
        <div><label>Motivo</label><select value={v.motivo} onChange={(e) => setV({ ...v, motivo: e.target.value })}>{MOTIVOS.map((m) => <option key={m}>{m}</option>)}</select></div>
        <div><label>Substitui (se for o caso)</label><input value={v.substitui} placeholder="Nome de quem saiu" onChange={(e) => setV({ ...v, substitui: e.target.value })} /></div>
      </div>
      <div className="row">
        <div><label>Salário proposto (R$)</label><input type="number" value={v.salario} disabled={!sal} title={sal ? '' : 'O RH confirma o salário da função'} onChange={(e) => setV({ ...v, salario: e.target.value })} /></div>
        <div><label>Tipo de contrato</label><select value={v.tipo_contrato} onChange={(e) => setV({ ...v, tipo_contrato: e.target.value })}>{TIPOS_CONTRATO.map((x) => <option key={x}>{x}</option>)}</select></div>
        <div><label>Início previsto</label><input type="date" value={v.inicio_previsto} onChange={(e) => setV({ ...v, inicio_previsto: e.target.value })} /></div>
      </div>
      <label>Justificativa</label><textarea rows={2} placeholder="Por que a contratação é necessária agora?" value={v.justificativa} onChange={(e) => setV({ ...v, justificativa: e.target.value })} />
      <div className="row">
        <div><label>Candidato indicado (opcional)</label><input value={v.cand_nome} onChange={(e) => setV({ ...v, cand_nome: e.target.value })} /></div>
        <div><label>Telefone do candidato</label><input value={v.cand_tel} onChange={(e) => setV({ ...v, cand_tel: e.target.value })} /></div>
      </div>
    </>
  );
}

export function vagaParaBanco(S: ReturnType<typeof useSessao>, v: VagaForm) {
  const f = S.funcoes.find((x) => x.id === v.funcao_id);
  const salario = S.perm('salarios', 'ver') ? Number(v.salario) || f?.salario_base || null : f?.salario_base ?? null;
  return { funcao_id: v.funcao_id || null, obra_id: v.obra_id || null, motivo: v.motivo, substitui: v.substitui.trim() || null, salario, tipo_contrato: v.tipo_contrato, inicio_previsto: v.inicio_previsto, justificativa: v.justificativa.trim() };
}

export async function avisarEtapa(S: ReturnType<typeof useSessao>, r: Admissao) {
  const f: FluxoAdmissao = S.cfg.fluxo;
  const titulo = numAdm(r.numero) + ' aguardando: ' + ST_LABEL[r.etapa];
  const texto = S.funcaoNome(r.funcao_id) + ' · ' + S.obraNome(r.obra_id) + (r.candidato?.nome ? ' · ' + r.candidato.nome : '');
  const link = '/rh/admissao/' + r.id;
  if (r.etapa === 'devolvida') { if (r.aberto_por) await notificar({ usuario: r.aberto_por, titulo: numAdm(r.numero) + ' devolvida para ajuste', texto, link }); return; }
  const perfil = r.etapa === 'gestor' ? f.gestor.perfil : r.etapa === 'diretoria' ? f.diretoria.perfil : ['docs', 'exame', 'contab', 'assin'].includes(r.etapa) ? 'rh' : null;
  if (perfil) await notificar({ perfil, titulo, texto, link });
  if (r.etapa === 'reprovada' && r.aberto_por) await notificar({ usuario: r.aberto_por, titulo: numAdm(r.numero) + ' reprovada', texto, link });
}

