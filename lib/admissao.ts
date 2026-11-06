// Fluxo de admissão da Avante (versão final do protótipo):
// abertura da vaga → gestor → diretoria → documentos e dados → exame admissional →
// contabilidade/eSocial (ficha preliminar + efetivação) → contrato e ficha assinados → admitido.
import type { Admissao, Etapa, FluxoAdmissao } from './types';
import type { Tom } from '@/components/ui';

export const ETAPAS: [string, string][] = [
  ['solic', 'Abertura da vaga'], ['gestor', 'Aprovação do gestor'], ['diretoria', 'Aprovação da diretoria'],
  ['docs', 'Documentos e dados'], ['exame', 'Exame admissional'], ['contab', 'Contabilidade / eSocial'],
  ['assin', 'Contrato e ficha assinados'], ['concluida', 'Admitido'],
];
export const ORD: Etapa[] = ['gestor', 'diretoria', 'docs', 'exame', 'contab', 'assin', 'concluida'];

export const ST_LABEL: Record<Etapa, string> = {
  gestor: 'Aguardando gestor', diretoria: 'Aguardando diretoria', docs: 'Documentos e dados (RH)', exame: 'Exame admissional (RH)',
  contab: 'Contabilidade / eSocial', assin: 'Contrato e ficha pendentes', concluida: 'Admitido', reprovada: 'Reprovada',
  devolvida: 'Devolvida para ajuste', cancelada: 'Cancelada',
};
export const ST_CLS: Record<Etapa, Tom> = {
  gestor: 'info', diretoria: 'info', docs: 'warn', exame: 'warn', contab: 'info', assin: 'warn', concluida: 'ok',
  reprovada: 'bad', devolvida: 'warn', cancelada: 'neutral',
};
export const EM_ANDAMENTO: Etapa[] = ['gestor', 'diretoria', 'docs', 'exame', 'contab', 'assin', 'devolvida'];
export const ENCERRADAS: Etapa[] = ['concluida', 'reprovada', 'cancelada'];

export const MOTIVOS = ['Aumento de quadro', 'Substituição de funcionário', 'Nova obra / mobilização', 'Demanda temporária'];
export const TIPOS_CONTRATO = ['Experiência 45 + 45 dias', 'Prazo determinado (obra)', 'Prazo indeterminado'];

export const numAdm = (n: number) => 'SA-' + String(n).padStart(4, '0');

export const dirNecessaria = (f: FluxoAdmissao, salario: number | null) =>
  f.diretoria.ativo && (!f.diretoria.acima_de || (salario || 0) > f.diretoria.acima_de);

export function proxEtapa(f: FluxoAdmissao, salario: number | null, de: Etapa | null): Etapa {
  let i = de ? ORD.indexOf(de) + 1 : 0;
  while (i < ORD.length) {
    const e = ORD[i];
    if (e === 'gestor' && !f.gestor.ativo) { i++; continue; }
    if (e === 'diretoria' && !dirNecessaria(f, salario)) { i++; continue; }
    return e;
  }
  return 'concluida';
}

export interface CtxAgir {
  usuarioId: string; perfilId: string; master: boolean;
  fluxo: FluxoAdmissao;
  perm: (m: string, a: 'ver' | 'incluir' | 'editar' | 'excluir' | 'exportar' | 'aprovar') => boolean;
  obraLiberada: (id: string | null) => boolean;
}

/** Quem pode agir na etapa atual (mesma regra do protótipo) */
export function podeAgir(c: CtxAgir, r: Admissao) {
  if (r.etapa === 'gestor') return (c.master || c.perfilId === c.fluxo.gestor.perfil) && c.obraLiberada(r.obra_id);
  if (r.etapa === 'diretoria') return c.master || c.perfilId === c.fluxo.diretoria.perfil;
  if (['docs', 'exame', 'contab', 'assin'].includes(r.etapa)) return c.perm('admissao', 'aprovar');
  if (r.etapa === 'devolvida') return r.aberto_por === c.usuarioId || c.perm('admissao', 'editar');
  return false;
}

/** Campos do candidato para a ficha preliminar (eSocial). [chave, rótulo, obrigatório, tipo] */
export const EC = ['Solteiro(a)', 'Casado(a)', 'União estável', 'Divorciado(a)', 'Viúvo(a)'];
export const CAND_F: [string, string, boolean, string | string[] | undefined][] = [
  ['nome', 'Nome completo', true, undefined], ['cpf', 'CPF', true, undefined], ['rg', 'RG', true, undefined], ['rgOrg', 'Órgão emissor / UF', false, undefined],
  ['rgData', 'Emissão do RG', false, 'date'], ['pis', 'PIS/NIS', false, undefined], ['nasc', 'Data de nascimento', true, 'date'],
  ['sexo', 'Sexo', true, ['Masculino', 'Feminino']], ['racaCor', 'Raça/cor (eSocial)', true, ['Branca', 'Preta', 'Parda', 'Amarela', 'Indígena', 'Não informado']],
  ['ec', 'Estado civil', true, EC],
  ['escol', 'Grau de instrução', true, ['Fundamental incompleto', 'Fundamental completo', 'Médio incompleto', 'Médio completo', 'Superior incompleto', 'Superior completo', 'Pós-graduação']],
  ['nacion', 'Nacionalidade', false, undefined], ['natural', 'Naturalidade (cidade/UF)', false, undefined], ['mae', 'Nome da mãe', true, undefined], ['pai', 'Nome do pai', false, undefined],
  ['end', 'Endereço completo', true, undefined], ['cep', 'CEP', true, undefined], ['tel', 'Telefone', true, undefined], ['email', 'E-mail', false, undefined],
  ['dep', 'Nº de dependentes', false, undefined], ['titulo', 'Título de eleitor', false, undefined], ['banco', 'Banco', false, undefined], ['ag', 'Agência', false, undefined],
  ['conta', 'Conta', false, undefined], ['pix', 'Chave PIX', false, undefined], ['vt', 'Vale-transporte', false, ['Não optante', 'Optante']],
];
