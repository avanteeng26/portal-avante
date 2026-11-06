// Tipos espelhando as tabelas do portal-avante-banco.sql (sem alterações de estrutura).

export type Acao = 'ver' | 'incluir' | 'editar' | 'excluir' | 'exportar' | 'aprovar';

export interface Perfil { id: string; nome: string; descricao: string | null; master: boolean }
export interface Permissao { perfil_id: string; modulo: string; ver: boolean; incluir: boolean; editar: boolean; excluir: boolean; exportar: boolean; aprovar: boolean }
export interface Obra { id: string; nome: string; centro_custo: string | null; ativa: boolean }
export interface Usuario { id: string; nome: string; email: string; perfil_id: string | null; todas_obras: boolean; ativo: boolean }
export interface Funcao { id: string; nome: string; salario_base: number | null; va_padrao: number; nrs: string[]; administrativa: boolean; periculosidade_pct: number }
export interface Feriado { data: string; descricao: string; abrangencia: string }

export const STATUS_FUNC = ['Ativo', 'Férias', 'Afastado (INSS)', 'Aviso prévio', 'Desligado'] as const;

export interface Funcionario {
  id: string; matricula: string; nome: string; cpf: string | null;
  rg: string | null; rg_orgao: string | null; rg_emissao: string | null; pis: string | null;
  nascimento: string | null; sexo: string | null; raca_cor: string | null; estado_civil: string | null; grau_instrucao: string | null;
  nacionalidade: string | null; naturalidade: string | null; nome_mae: string | null; nome_pai: string | null;
  endereco: string | null; cep: string | null; telefone: string | null; email: string | null;
  dependentes: number; titulo_eleitor: string | null;
  funcao_id: string | null; obra_referencia_id: string | null;
  data_admissao: string; data_desligamento: string | null; status: string; tipo_contrato: string | null;
  aso_vencimento: string | null; ferias_limite: string | null; criado_em: string;
}

export interface Remuneracao {
  funcionario_id: string; salario: number; adicional_pct: number; va_valor: number; vale_transporte: boolean;
  banco: string | null; agencia: string | null; conta: string | null; pix: string | null;
}

export type SituacaoDoc = 'pendente' | 'recebido' | 'naoaplica';
export interface Documento {
  id: string; funcionario_id: string | null; admissao_id: string | null; tipo: string; situacao: SituacaoDoc;
  arquivo_path: string | null; arquivo_nome: string | null; tamanho_bytes: number | null;
  enviado_por: string | null; enviado_em: string | null;
}

export type Etapa = 'gestor' | 'diretoria' | 'docs' | 'exame' | 'contab' | 'assin' | 'concluida' | 'reprovada' | 'devolvida' | 'cancelada';
export interface Admissao {
  id: string; numero: number; funcao_id: string | null; obra_id: string | null; motivo: string | null; substitui: string | null;
  salario: number | null; tipo_contrato: string; inicio_previsto: string | null; justificativa: string;
  etapa: Etapa; parou_em: string | null; candidato: Record<string, string>; guia_exame: Record<string, string>;
  aso_resultado: string | null; aso_data: string | null; contab_email: string | null; contab_enviado_em: string | null;
  data_admissao: string | null; matricula: string | null; recibo_esocial: string | null; previsao_fim_obra: string | null;
  funcionario_id: string | null; aberto_por: string | null; criado_em: string;
}
export interface AdmHistorico { id: number; admissao_id: string; etapa: string | null; acao: string; comentario: string | null; usuario_id: string | null; criado_em: string }

export type Ocorrencia = 'TRABALHADO' | 'FALTA' | 'ABONADO' | 'ATESTADO' | 'FERIAS' | 'LUTO' | 'FOLGA' | 'AFASTADO' | 'FERIADO';
export interface Ponto {
  id?: string; funcionario_id: string; data: string; ocorrencia: Ocorrencia;
  entrada1: string | null; saida1: string | null; entrada2: string | null; saida2: string | null;
  obra_id: string | null; obra2_id: string | null; minutos_obra2: number; observacao: string | null;
  lancado_por?: string | null; lancado_em?: string;
}
export interface PontoDiaStatus { data: string; status: 'Rascunho' | 'Enviado' | 'Aprovado'; usuario_id: string | null; em: string }

export interface Competencia {
  id: string; inicio: string; fim: string; status: 'Aberta' | 'Fechada';
  valor_inss: number | null; valor_fgts: number | null; valor_ferias: number | null; valor_decimo: number | null;
  pct_inss: number; pct_fgts: number; pct_ferias: number; pct_decimo: number;
  fechada_por: string | null; fechada_em: string | null;
}
export interface RateioFechamento {
  competencia_id: string; funcionario_id: string; obra_id: string; minutos: number;
  salario: number; horas_extras: number; ferias: number; decimo: number; inss: number; fgts: number; va: number; total: number;
}

export interface ModeloDocumento { id: string; nome: string; tipo: 'contrato' | 'ficha' | 'outro'; usar_para: string | null; texto: string; versao: number; atualizado_por: string | null; atualizado_em: string }

export interface Notificacao { id: string; perfil_id: string | null; usuario_id: string | null; titulo: string; texto: string | null; link: string | null; criado_em: string }

export interface Jornada { seg_qui_min: number; sexta_min: number; tolerancia_min: number; inicio_apuracao_dia: number; texto: string }
export interface Empresa { razao_social: string; cnpj: string; endereco: string; cidade: string; representante: string; representante_cargo: string; email_contabilidade: string; clinica: string; clinica_endereco?: string }
export interface FluxoAdmissao {
  gestor: { ativo: boolean; perfil: string };
  diretoria: { ativo: boolean; perfil: string; acima_de: number };
  avisar_mobilizacao: { perfis: string[]; emails: string };
}
export interface ValeAlimentacao { desconto_1_falta: number; desconto_2_faltas: number; desconto_3_ou_mais: number; dias_base: number }
