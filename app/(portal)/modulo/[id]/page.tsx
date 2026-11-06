'use client';
import { use } from 'react';
import { TODOS_ITENS } from '@/lib/menu';
import { useSessao } from '@/components/Sessao';
import { SemPermissao } from '@/components/ui';

export default function Previsto({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const S = useSessao();
  const it = TODOS_ITENS.find((i) => i.id === id);
  if (!it) return <p>Página não encontrada.</p>;
  if (!S.perm(it.mod, 'ver')) return <SemPermissao />;
  return (
    <>
      <h1>{it.t}</h1>
      <p className="sub">Módulo previsto para as próximas fases do Portal Avante.</p>
      <div className="note">
        Esta aba já aparece no menu conforme o protótipo e respeita as permissões do seu perfil. Ela vai usar a mesma base do portal:
        obras como centro de custo, permissões por perfil, auditoria e indicadores.
      </div>
    </>
  );
}
