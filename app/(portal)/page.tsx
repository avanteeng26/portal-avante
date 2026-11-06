'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useSessao } from '@/components/Sessao';
import { Kpi, Pill } from '@/components/ui';
import { supabase } from '@/lib/supabase/client';
import { podeAgir, numAdm, ST_LABEL } from '@/lib/admissao';
import { addD, dExt, DOW, dk, fD, hoje } from '@/lib/format';
import { compAtual, compLabel, perLabel } from '@/lib/ponto';
import type { Admissao } from '@/lib/types';

export default function Inicio() {
  const S = useSessao();
  const router = useRouter();
  const [aprov, setAprov] = useState<Admissao[]>([]);
  const [ponto, setPonto] = useState<{ dia: Date; faltam: number; total: number; enviados: string[] } | null>(null);
  const [ativos, setAtivos] = useState<number | null>(null);
  const T0 = hoje();
  const h = new Date().getHours();

  useEffect(() => {
    const sb = supabase();
    const ctx = { usuarioId: S.usuario.id, perfilId: S.perfil.id, master: S.perfil.master, fluxo: S.cfg.fluxo, perm: S.perm, obraLiberada: S.obraLiberada };
    if (S.perm('admissao', 'ver')) sb.from('admissoes').select('*').in('etapa', ['gestor', 'diretoria', 'docs', 'exame', 'contab', 'assin', 'devolvida']).then(({ data }) => setAprov(((data || []) as Admissao[]).filter((r) => podeAgir(ctx, r))));
    if (S.perm('colab', 'ver')) sb.from('funcionarios').select('id', { count: 'exact', head: true }).neq('status', 'Desligado').then(({ count }) => setAtivos(count ?? 0));
    if (S.perm('ponto', 'ver')) {
      const ontem = addD(T0, -1);
      const dia = S.cal.carga(ontem) > 0 ? ontem : S.cal.prevUtil(ontem);
      Promise.all([
        sb.from('funcionarios').select('id', { count: 'exact', head: true }).eq('status', 'Ativo').lte('data_admissao', dk(dia)),
        sb.from('ponto').select('funcionario_id', { count: 'exact', head: true }).eq('data', dk(dia)),
        sb.from('ponto_dia_status').select('data').eq('status', 'Enviado').order('data'),
      ]).then(([a, b, c]) => setPonto({ dia, total: a.count ?? 0, faltam: Math.max(0, (a.count ?? 0) - (b.count ?? 0)), enviados: (c.data || []).map((x: { data: string }) => x.data) }));
    }
  }, [S]); // eslint-disable-line react-hooks/exhaustive-deps

  const pend: [string, string, string, string][] = [];
  if (aprov.length) pend.push(['warn', aprov.length + ' processo(s) de admissão aguardando sua ação', '/rh/admissao', 'RH']);
  if (ponto && ponto.faltam > 0 && S.perm('ponto', 'incluir')) pend.push(['bad', 'Ponto de ' + fD(ponto.dia) + ': ' + ponto.faltam + ' funcionário(s) sem lançamento', '/rh/ponto?aba=dia&d=' + dk(ponto.dia), 'Ponto']);
  if (ponto && ponto.enviados.length && S.perm('ponto', 'aprovar')) pend.push(['warn', ponto.enviados.length + ' dia(s) de ponto enviados aguardando aprovação', '/rh/ponto?aba=dia&d=' + ponto.enviados[0], 'Ponto']);
  const k = compAtual();

  return (
    <>
      <h1>{h < 12 ? 'Bom dia' : h < 18 ? 'Boa tarde' : 'Boa noite'}, {S.usuario.nome.split(' ')[0]}</h1>
      <p className="sub">{DOW[T0.getDay()]}, {dExt(T0)} · central de informações e gestão da Avante Engenharia</p>
      <div className="grid kpis" style={{ gridTemplateColumns: 'repeat(auto-fill,minmax(240px,1fr))' }}>
        {S.perm('colab', 'ver') && <Kpi l="Recursos Humanos" v={ativos == null ? '…' : ativos + ' funcionários'} h="ativos no cadastro" onClick={() => router.push('/rh/funcionarios')} />}
        {S.perm('ponto', 'ver') && <Kpi l="Folha de ponto" v={compLabel(k)} h={'Período de apuração ' + perLabel(k)} onClick={() => router.push('/rh/ponto')} />}
        {S.perm('admissao', 'ver') && <Kpi l="Nova admissão" v={aprov.length + ' com você'} h="processos aguardando sua ação" st={aprov.length ? 'warn' : 'ok'} onClick={() => router.push('/rh/admissao')} />}
        {S.perm('rateio', 'ver') && <Kpi l="Rateio da folha" v="Custo por obra" h="INSS, FGTS, férias e 13º por obra" onClick={() => router.push('/rh/rateio')} />}
      </div>
      <div className="grid charts">
        <div className="card">
          <h3>O que precisa da sua atenção ({pend.length})</h3>
          {pend.map((p) => (
            <div key={p[1]} className="alert-item"><span><Pill t={p[3]} c="neutral" /> {p[1]}</span><Link className="btn sm" href={p[2]}>Abrir</Link></div>
          ))}
          {!pend.length && <p className="muted">Nada pendente com você agora.</p>}
        </div>
        {aprov.length > 0 && (
          <div className="card">
            <h3>Admissões com você</h3>
            {aprov.slice(0, 8).map((r) => (
              <div key={r.id} className="alert-item"><span><b>{numAdm(r.numero)}</b> · {S.funcaoNome(r.funcao_id)} · {S.obraNome(r.obra_id)}<br /><span className="small muted">{ST_LABEL[r.etapa]}</span></span><Link className="btn sm" href={'/rh/admissao/' + r.id}>Abrir</Link></div>
            ))}
          </div>
        )}
      </div>
    </>
  );
}
