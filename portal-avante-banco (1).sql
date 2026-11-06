-- =====================================================================
--  PORTAL AVANTE ENGENHARIA · ESTRUTURA DO BANCO DE DADOS (Supabase)
--  Versão 1 · gerado a partir do protótipo validado
--
--  COMO USAR
--  1. No Supabase: SQL Editor › New query
--  2. Cole este arquivo inteiro e clique em Run.
--  3. Antes de rodar, confira o e-mail do usuário master na seção 9
--     (precisa ser o mesmo e-mail criado em Authentication › Users).
--
--  O script pode ser executado mais de uma vez sem duplicar dados.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. ACESSO: perfis, permissões, usuários e obras liberadas
-- ---------------------------------------------------------------------
create table if not exists public.perfis (
  id          text primary key,
  nome        text not null,
  descricao   text,
  master      boolean not null default false,
  criado_em   timestamptz not null default now()
);

create table if not exists public.permissoes (
  perfil_id  text not null references public.perfis(id) on delete cascade,
  modulo     text not null,
  ver        boolean not null default false,
  incluir    boolean not null default false,
  editar     boolean not null default false,
  excluir    boolean not null default false,
  exportar   boolean not null default false,
  aprovar    boolean not null default false,
  primary key (perfil_id, modulo)
);

create table if not exists public.obras (
  id          uuid primary key default gen_random_uuid(),
  nome        text not null unique,
  centro_custo text,
  ativa       boolean not null default true,
  criado_em   timestamptz not null default now()
);

create table if not exists public.usuarios (
  id           uuid primary key references auth.users(id) on delete cascade,
  nome         text not null,
  email        text not null unique,
  perfil_id    text references public.perfis(id),
  todas_obras  boolean not null default false,
  ativo        boolean not null default true,
  criado_em    timestamptz not null default now()
);

create table if not exists public.usuario_obras (
  usuario_id uuid not null references public.usuarios(id) on delete cascade,
  obra_id    uuid not null references public.obras(id) on delete cascade,
  primary key (usuario_id, obra_id)
);

-- Funções de checagem usadas pelas regras de segurança (RLS)
create or replace function public.tem_perm(p_modulo text, p_acao text)
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce((
    select case when pf.master then true else
             case p_acao when 'ver' then pm.ver when 'incluir' then pm.incluir
                         when 'editar' then pm.editar when 'excluir' then pm.excluir
                         when 'exportar' then pm.exportar when 'aprovar' then pm.aprovar end
           end
      from public.usuarios u
      join public.perfis pf on pf.id = u.perfil_id
      left join public.permissoes pm on pm.perfil_id = u.perfil_id and pm.modulo = p_modulo
     where u.id = auth.uid() and u.ativo), false);
$$;

create or replace function public.obra_liberada(p_obra uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select p_obra is null or exists (
    select 1 from public.usuarios u
      left join public.perfis pf on pf.id = u.perfil_id
     where u.id = auth.uid() and u.ativo
       and (u.todas_obras or coalesce(pf.master,false)
            or exists (select 1 from public.usuario_obras uo where uo.usuario_id = u.id and uo.obra_id = p_obra)));
$$;

create or replace function public.usuario_ativo()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.usuarios where id = auth.uid() and ativo);
$$;

-- ---------------------------------------------------------------------
-- 2. CONFIGURAÇÕES GERAIS E CADASTROS BASE
-- ---------------------------------------------------------------------
create table if not exists public.configuracoes (
  chave  text primary key,
  valor  jsonb not null,
  atualizado_em timestamptz not null default now()
);

create table if not exists public.feriados (
  data       date primary key,
  descricao  text not null,
  abrangencia text not null default 'Nacional'   -- Nacional, Estadual, Municipal
);

create table if not exists public.funcoes (
  id            uuid primary key default gen_random_uuid(),
  nome          text not null unique,
  salario_base  numeric(12,2),
  va_padrao     numeric(12,2) not null default 300,
  nrs           text[] not null default '{}',     -- treinamentos NR obrigatórios
  administrativa boolean not null default false,
  periculosidade_pct numeric(5,2) not null default 0
);

-- ---------------------------------------------------------------------
-- 3. FUNCIONÁRIOS (dados cadastrais separados da remuneração)
-- ---------------------------------------------------------------------
create table if not exists public.funcionarios (
  id               uuid primary key default gen_random_uuid(),
  matricula        text not null unique,
  nome             text not null,
  cpf              text unique,
  rg               text, rg_orgao text, rg_emissao date,
  pis              text,
  nascimento       date,
  sexo             text, raca_cor text, estado_civil text, grau_instrucao text,
  nacionalidade    text, naturalidade text,
  nome_mae         text, nome_pai text,
  endereco         text, cep text, telefone text, email text,
  dependentes      int not null default 0,
  titulo_eleitor   text,
  funcao_id        uuid references public.funcoes(id),
  obra_referencia_id uuid references public.obras(id),   -- usada só quando não há ponto no período
  data_admissao    date not null,
  data_desligamento date,
  status           text not null default 'Ativo'
                   check (status in ('Ativo','Férias','Afastado (INSS)','Aviso prévio','Desligado')),
  tipo_contrato    text,
  aso_vencimento   date,
  ferias_limite    date,
  criado_em        timestamptz not null default now()
);

create table if not exists public.funcionarios_remuneracao (   -- módulo "salarios"
  funcionario_id  uuid primary key references public.funcionarios(id) on delete cascade,
  salario         numeric(12,2) not null,
  adicional_pct   numeric(5,2) not null default 0,
  va_valor        numeric(12,2) not null default 300,
  vale_transporte boolean not null default false,
  banco text, agencia text, conta text, pix text
);

-- Documentos (funcionário ou processo de admissão). O arquivo fica no bucket privado "documentos".
create table if not exists public.documentos (
  id              uuid primary key default gen_random_uuid(),
  funcionario_id  uuid references public.funcionarios(id) on delete cascade,
  admissao_id     uuid,
  tipo            text not null,          -- ex.: rg, cpf, aso, contrato, fichareg, esocial
  situacao        text not null default 'pendente' check (situacao in ('pendente','recebido','naoaplica')),
  arquivo_path    text,                   -- caminho no Storage
  arquivo_nome    text,
  tamanho_bytes   bigint,
  enviado_por     uuid references public.usuarios(id),
  enviado_em      timestamptz,
  check (funcionario_id is not null or admissao_id is not null)
);

-- ---------------------------------------------------------------------
-- 4. ADMISSÃO (abertura de vaga → aprovações → documentos → exame →
--    contabilidade/eSocial → contrato e ficha assinados → admitido)
-- ---------------------------------------------------------------------
create sequence if not exists public.admissao_numero_seq;
create table if not exists public.admissoes (
  id              uuid primary key default gen_random_uuid(),
  numero          int not null default nextval('public.admissao_numero_seq') unique,
  funcao_id       uuid references public.funcoes(id),
  obra_id         uuid references public.obras(id),
  motivo          text, substitui text,
  salario         numeric(12,2),
  tipo_contrato   text not null default 'Experiência 45 + 45 dias',
  inicio_previsto date,
  justificativa   text not null,
  etapa           text not null default 'gestor'
                  check (etapa in ('gestor','diretoria','docs','exame','contab','assin','concluida','reprovada','devolvida','cancelada')),
  parou_em        text,
  candidato       jsonb not null default '{}'::jsonb,   -- dados pessoais para a ficha preliminar
  guia_exame      jsonb not null default '{}'::jsonb,
  aso_resultado   text, aso_data date,
  contab_email    text, contab_enviado_em timestamptz,
  data_admissao   date, matricula text, recibo_esocial text,
  previsao_fim_obra date,
  funcionario_id  uuid references public.funcionarios(id),
  aberto_por      uuid references public.usuarios(id) default auth.uid(),
  criado_em       timestamptz not null default now()
);
alter table public.documentos drop constraint if exists documentos_admissao_fk;
alter table public.documentos add constraint documentos_admissao_fk foreign key (admissao_id) references public.admissoes(id) on delete cascade;

create table if not exists public.admissao_historico (
  id           bigint generated always as identity primary key,
  admissao_id  uuid not null references public.admissoes(id) on delete cascade,
  etapa        text,
  acao         text not null,
  comentario   text,
  usuario_id   uuid references public.usuarios(id) default auth.uid(),
  criado_em    timestamptz not null default now()
);

create table if not exists public.desligamentos (
  id             uuid primary key default gen_random_uuid(),
  funcionario_id uuid not null references public.funcionarios(id),
  data_desligamento date not null,
  motivo         text,
  checklist      jsonb not null default '{}'::jsonb,
  criado_por     uuid references public.usuarios(id) default auth.uid(),
  criado_em      timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- 5. PONTO (apuração de 21 a 20) E RATEIO
-- ---------------------------------------------------------------------
-- Competência do dia: de 21 do mês anterior a 20 do mês. Ex.: 21/09 a 20/10 = '2026-10'
create or replace function public.competencia_de(d date)
returns text language sql immutable as $$
  select to_char(case when extract(day from d) >= 21 then d + interval '1 month' else d end, 'YYYY-MM');
$$;

create or replace function public.carga_dia(d date)
returns int language sql stable as $$
  select case
    when exists (select 1 from public.feriados f where f.data = d) then 0
    when extract(isodow from d) in (6,7) then 0
    when extract(isodow from d) = 5 then coalesce((select (valor->>'sexta_min')::int   from public.configuracoes where chave = 'jornada'), 480)
    else                                 coalesce((select (valor->>'seg_qui_min')::int from public.configuracoes where chave = 'jornada'), 540)
  end;
$$;

create table if not exists public.ponto (
  id              uuid primary key default gen_random_uuid(),
  funcionario_id  uuid not null references public.funcionarios(id) on delete cascade,
  data            date not null,
  ocorrencia      text not null default 'TRABALHADO'
                  check (ocorrencia in ('TRABALHADO','FALTA','ABONADO','ATESTADO','FERIAS','LUTO','FOLGA','AFASTADO','FERIADO')),
  entrada1 time, saida1 time, entrada2 time, saida2 time,
  obra_id         uuid references public.obras(id),          -- obra escolhida no dia
  obra2_id        uuid references public.obras(id),          -- dia dividido
  minutos_obra2   int not null default 0,
  observacao      text,
  lancado_por     uuid references public.usuarios(id) default auth.uid(),
  lancado_em      timestamptz not null default now(),
  unique (funcionario_id, data),
  constraint ponto_marcacoes_ordem check (ocorrencia <> 'TRABALHADO' or
     (entrada1 < saida1 and saida1 <= entrada2 and entrada2 < saida2)),
  constraint ponto_obra_obrigatoria check (ocorrencia <> 'TRABALHADO' or obra_id is not null),
  constraint ponto_divisao check (obra2_id is null or (obra2_id <> obra_id and minutos_obra2 > 0))
);
create index if not exists ponto_data_idx on public.ponto (data);

create table if not exists public.ponto_dia_status (
  data        date primary key,
  status      text not null check (status in ('Rascunho','Enviado','Aprovado')),
  usuario_id  uuid references public.usuarios(id) default auth.uid(),
  em          timestamptz not null default now()
);

-- Cálculo diário no mesmo padrão da planilha (tolerância diária configurável, padrão 10 min)
create or replace view public.v_ponto with (security_invoker = on) as
with b as (
  select p.*, public.competencia_de(p.data) as competencia, public.carga_dia(p.data) as carga,
         (extract(isodow from p.data) = 7 or exists (select 1 from public.feriados f where f.data = p.data)) as dom_feriado,
         coalesce((select (valor->>'tolerancia_min')::int from public.configuracoes where chave = 'jornada'), 10) as tol,
         case when p.ocorrencia = 'TRABALHADO' and p.entrada1 is not null and p.saida2 is not null
              then (extract(epoch from (p.saida1 - p.entrada1)) + extract(epoch from (p.saida2 - p.entrada2)))::int / 60
              else 0 end as trab
    from public.ponto p
)
select b.*,
  case when ocorrencia = 'TRABALHADO' and carga > 0 then case when abs(trab - carga) <= tol then carga else least(trab, carga) end
       when ocorrencia in ('ABONADO','ATESTADO','FERIAS','LUTO','FOLGA','FERIADO') then carga else 0 end as normal,
  case when ocorrencia = 'TRABALHADO' and carga > 0 and carga - trab > tol then carga - trab else 0 end as atraso,
  case when ocorrencia = 'FALTA' then carga else 0 end as falta,
  case when ocorrencia = 'TRABALHADO' and not dom_feriado and carga = 0 then trab
       when ocorrencia = 'TRABALHADO' and carga > 0 and trab - carga > tol then trab - carga else 0 end as he50,
  case when ocorrencia = 'TRABALHADO' and dom_feriado then trab else 0 end as he100,
  greatest(trab - least(coalesce(minutos_obra2,0), trab), 0) as minutos_obra1
from b;

-- Horas por funcionário e obra em cada competência (base do rateio)
create or replace view public.v_horas_obra with (security_invoker = on) as
select competencia, funcionario_id, obra_id, sum(minutos_obra1) as minutos
  from public.v_ponto where ocorrencia = 'TRABALHADO' and obra_id is not null group by 1,2,3
union all
select competencia, funcionario_id, obra2_id, sum(least(minutos_obra2, trab))
  from public.v_ponto where ocorrencia = 'TRABALHADO' and obra2_id is not null group by 1,2,3;

create table if not exists public.competencias (
  id             text primary key,            -- 'YYYY-MM'
  inicio         date not null,
  fim            date not null,
  status         text not null default 'Aberta' check (status in ('Aberta','Fechada')),
  -- valores reais da folha (contabilidade); em branco = estimado pelos percentuais
  valor_inss     numeric(14,2), valor_fgts numeric(14,2),
  valor_ferias   numeric(14,2), valor_decimo numeric(14,2),
  pct_inss       numeric(6,3) not null default 26.8,
  pct_fgts       numeric(6,3) not null default 8,
  pct_ferias     numeric(6,3) not null default 14.32,
  pct_decimo     numeric(6,3) not null default 10.7,
  fechada_por    uuid references public.usuarios(id),
  fechada_em     timestamptz
);

-- Foto do rateio no fechamento (não muda depois de fechada a competência)
create table if not exists public.rateio_fechamento (
  competencia_id  text not null references public.competencias(id),
  funcionario_id  uuid not null references public.funcionarios(id),
  obra_id         uuid not null references public.obras(id),
  minutos         int not null default 0,
  salario numeric(14,2) not null default 0, horas_extras numeric(14,2) not null default 0,
  ferias  numeric(14,2) not null default 0, decimo numeric(14,2) not null default 0,
  inss    numeric(14,2) not null default 0, fgts numeric(14,2) not null default 0,
  va      numeric(14,2) not null default 0, total numeric(14,2) not null default 0,
  primary key (competencia_id, funcionario_id, obra_id)
);

create table if not exists public.rotinas_status (
  mes        text not null,              -- 'YYYY-MM'
  rotina     text not null,
  concluida  boolean not null default false,
  usuario_id uuid references public.usuarios(id) default auth.uid(),
  em         timestamptz not null default now(),
  primary key (mes, rotina)
);

-- ---------------------------------------------------------------------
-- 6. SESMT
-- ---------------------------------------------------------------------
create table if not exists public.asos (
  id uuid primary key default gen_random_uuid(),
  funcionario_id uuid not null references public.funcionarios(id) on delete cascade,
  tipo text not null check (tipo in ('Admissional','Periódico','Retorno ao trabalho','Mudança de risco','Demissional')),
  data date not null, resultado text not null, validade_meses int not null default 12,
  clinica text, arquivo_path text,
  criado_por uuid references public.usuarios(id) default auth.uid(), criado_em timestamptz not null default now()
);
create table if not exists public.nr_validade (
  treinamento text primary key, meses int, carga_horaria int, conteudo text
);
create table if not exists public.turmas (
  id uuid primary key default gen_random_uuid(),
  treinamento text not null, data date not null, carga_horaria int not null,
  local text, modalidade text, instrutor text not null, instrutor_qualificacao text,
  responsavel_tecnico text not null, responsavel_registro text, conteudo text,
  lista_assinada_path text,
  criado_por uuid references public.usuarios(id) default auth.uid(), criado_em timestamptz not null default now()
);
create table if not exists public.turma_participantes (
  turma_id uuid not null references public.turmas(id) on delete cascade,
  funcionario_id uuid not null references public.funcionarios(id) on delete cascade,
  vencimento date,
  primary key (turma_id, funcionario_id)
);
create table if not exists public.epi_entregas (
  id uuid primary key default gen_random_uuid(),
  funcionario_id uuid not null references public.funcionarios(id) on delete cascade,
  epi text not null, ca text not null, ca_validade date, quantidade int not null default 1,
  data date not null, troca_prevista date, motivo text, assinada boolean not null default false, arquivo_path text,
  criado_por uuid references public.usuarios(id) default auth.uid(), criado_em timestamptz not null default now()
);
create table if not exists public.dds (
  id uuid primary key default gen_random_uuid(),
  data date not null, obra_id uuid not null references public.obras(id), tema text not null,
  responsavel_id uuid references public.funcionarios(id), duracao_min int default 15, observacoes text, arquivo_path text,
  criado_por uuid references public.usuarios(id) default auth.uid(), criado_em timestamptz not null default now()
);
create table if not exists public.dds_participantes (
  dds_id uuid not null references public.dds(id) on delete cascade,
  funcionario_id uuid not null references public.funcionarios(id) on delete cascade,
  primary key (dds_id, funcionario_id)
);
create table if not exists public.inspecoes (
  id uuid primary key default gen_random_uuid(),
  obra_id uuid not null references public.obras(id), data date not null,
  itens jsonb not null,                       -- [{item, resultado C/NC/NA, observacao}]
  conformidade numeric(5,2),
  criado_por uuid references public.usuarios(id) default auth.uid(), criado_em timestamptz not null default now()
);
create table if not exists public.acoes (
  id uuid primary key default gen_random_uuid(),
  acao text not null, origem text, obra_id uuid not null references public.obras(id),
  responsavel_id uuid references public.funcionarios(id), prazo date not null,
  situacao text not null default 'Aberta' check (situacao in ('Aberta','Concluída')),
  evidencia text, arquivo_path text,
  criado_por uuid references public.usuarios(id) default auth.uid(), criado_em timestamptz not null default now()
);
create table if not exists public.permissoes_trabalho (
  id uuid primary key default gen_random_uuid(),
  tipo text not null, obra_id uuid not null references public.obras(id), data date not null,
  hora_inicio time, hora_fim time, local text, atividade text not null, medidas text,
  situacao text not null default 'Solicitada' check (situacao in ('Solicitada','Liberada','Encerrada','Cancelada')),
  liberada_por uuid references public.usuarios(id), liberada_em timestamptz, encerramento text,
  criado_por uuid references public.usuarios(id) default auth.uid(), criado_em timestamptz not null default now()
);
create table if not exists public.pt_executantes (
  pt_id uuid not null references public.permissoes_trabalho(id) on delete cascade,
  funcionario_id uuid not null references public.funcionarios(id),
  primary key (pt_id, funcionario_id)
);
create table if not exists public.ocorrencias (
  id uuid primary key default gen_random_uuid(),
  data date not null, hora time, obra_id uuid not null references public.obras(id),
  funcionario_id uuid references public.funcionarios(id),
  tipo text not null check (tipo in ('Com afastamento','Sem afastamento','Quase acidente','Acidente de trajeto','Doença ocupacional')),
  parte_corpo text, descricao text not null, dias_perdidos int not null default 0,
  cat_numero text, cat_data date, causas text, acoes text, investigacao_concluida boolean not null default false, arquivo_path text,
  criado_por uuid references public.usuarios(id) default auth.uid(), criado_em timestamptz not null default now()
);
create table if not exists public.programas_laudos (
  id uuid primary key default gen_random_uuid(),
  documento text not null, abrangencia text not null, responsavel text not null, registro text,
  emissao date not null, validade date not null, observacoes text, arquivo_path text,
  criado_por uuid references public.usuarios(id) default auth.uid(), criado_em timestamptz not null default now()
);
create table if not exists public.mobilizacoes (
  id uuid primary key default gen_random_uuid(),
  funcionario_id uuid not null references public.funcionarios(id) on delete cascade,
  admissao_id uuid references public.admissoes(id),
  obra_id uuid references public.obras(id),
  etapas jsonb not null default '{}'::jsonb,       -- integ, os, lib (as demais são calculadas)
  liberado_em timestamptz, liberado_por uuid references public.usuarios(id),
  criado_em timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- 7. EMPRESA, COMUNICAÇÃO E AUDITORIA
-- ---------------------------------------------------------------------
create table if not exists public.documentos_empresa (
  id uuid primary key default gen_random_uuid(),
  documento text not null, orgao text, numero text, emissao date not null, validade date,
  responsavel text, observacoes text, arquivo_path text,
  criado_por uuid references public.usuarios(id) default auth.uid(), criado_em timestamptz not null default now()
);
create table if not exists public.comunicados (
  id uuid primary key default gen_random_uuid(),
  titulo text not null, para_obra_id uuid references public.obras(id),   -- nulo = toda a empresa
  texto text not null, exibir_ate date, fixado boolean not null default false, arquivo_path text,
  criado_por uuid references public.usuarios(id) default auth.uid(), criado_em timestamptz not null default now()
);
create table if not exists public.modelos_documento (
  id uuid primary key default gen_random_uuid(),
  nome text not null, tipo text not null check (tipo in ('contrato','ficha','outro')),
  usar_para text, texto text not null, versao int not null default 1,
  atualizado_por uuid references public.usuarios(id) default auth.uid(), atualizado_em timestamptz not null default now()
);
create table if not exists public.notificacoes (
  id uuid primary key default gen_random_uuid(),
  perfil_id text references public.perfis(id), usuario_id uuid references public.usuarios(id),
  titulo text not null, texto text, link text, enviar_email boolean not null default false,
  criado_em timestamptz not null default now()
);
create table if not exists public.notificacao_leitura (
  notificacao_id uuid not null references public.notificacoes(id) on delete cascade,
  usuario_id uuid not null references public.usuarios(id) on delete cascade,
  lida_em timestamptz not null default now(),
  primary key (notificacao_id, usuario_id)
);

-- Auditoria: só recebe inclusões (ninguém edita ou apaga pelo portal)
create table if not exists public.auditoria (
  id          bigint generated always as identity primary key,
  em          timestamptz not null default now(),
  usuario_id  uuid,
  email       text,
  tabela      text,
  registro_id text,
  acao        text not null,
  detalhe     text,
  antes       jsonb,
  depois      jsonb
);

create or replace function public.fn_auditoria()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.auditoria (usuario_id, email, tabela, registro_id, acao, antes, depois)
  values (auth.uid(), (select email from public.usuarios where id = auth.uid()), tg_table_name,
          coalesce(to_jsonb(new)->>'id', to_jsonb(old)->>'id', to_jsonb(new)->>'funcionario_id', to_jsonb(old)->>'funcionario_id'),
          tg_op,
          case when tg_op in ('UPDATE','DELETE') then to_jsonb(old) end,
          case when tg_op in ('INSERT','UPDATE') then to_jsonb(new) end);
  return coalesce(new, old);
end $$;

-- Eventos que não são alteração de tabela (login, exportação, impressão, consulta de documento)
create or replace function public.registrar_evento(p_acao text, p_detalhe text default null)
returns void language sql security definer set search_path = public as $$
  insert into public.auditoria (usuario_id, email, acao, detalhe)
  values (auth.uid(), (select email from public.usuarios where id = auth.uid()), p_acao, p_detalhe);
$$;

-- ---------------------------------------------------------------------
-- 8. SEGURANÇA (RLS) E GATILHOS DE AUDITORIA
-- ---------------------------------------------------------------------
create or replace function public._politicas(p_tabela text, p_modulo text, p_col_obra text default null)
returns void language plpgsql as $$
declare c text := '';
begin
  if p_col_obra is not null then c := format(' and public.obra_liberada(%I)', p_col_obra); end if;
  execute format('alter table public.%I enable row level security', p_tabela);
  execute format('drop policy if exists p_ver on public.%I', p_tabela);
  execute format('drop policy if exists p_incluir on public.%I', p_tabela);
  execute format('drop policy if exists p_editar on public.%I', p_tabela);
  execute format('drop policy if exists p_excluir on public.%I', p_tabela);
  execute format('create policy p_ver on public.%I for select to authenticated using (public.tem_perm(%L,''ver'')%s)', p_tabela, p_modulo, c);
  execute format('create policy p_incluir on public.%I for insert to authenticated with check (public.tem_perm(%L,''incluir'')%s)', p_tabela, p_modulo, c);
  execute format('create policy p_editar on public.%I for update to authenticated using (public.tem_perm(%L,''editar'')%s) with check (public.tem_perm(%L,''editar'')%s)', p_tabela, p_modulo, c, p_modulo, c);
  execute format('create policy p_excluir on public.%I for delete to authenticated using (public.tem_perm(%L,''excluir'')%s)', p_tabela, p_modulo, c);
  execute format('drop trigger if exists t_auditoria on public.%I', p_tabela);
  execute format('create trigger t_auditoria after insert or update or delete on public.%I for each row execute function public.fn_auditoria()', p_tabela);
end $$;

select public._politicas(t, m, o) from (values
  ('perfis','usuarios',null), ('permissoes','usuarios',null), ('usuario_obras','usuarios',null),
  ('obras','cadastros',null), ('funcoes','cadastros',null), ('feriados','cadastros',null),
  ('funcionarios','colab',null), ('funcionarios_remuneracao','salarios',null), ('documentos','docs',null),
  ('admissoes','admissao','obra_id'), ('admissao_historico','admissao',null), ('desligamentos','movim',null),
  ('ponto','ponto','obra_id'), ('ponto_dia_status','ponto',null),
  ('competencias','rateio',null), ('rateio_fechamento','rateio','obra_id'), ('rotinas_status','rotinas',null),
  ('asos','sst',null), ('nr_validade','sst',null), ('turmas','sst',null), ('turma_participantes','sst',null),
  ('epi_entregas','sst',null), ('dds','sst','obra_id'), ('dds_participantes','sst',null),
  ('inspecoes','sst','obra_id'), ('acoes','sst','obra_id'), ('permissoes_trabalho','sst','obra_id'),
  ('pt_executantes','sst',null), ('ocorrencias','sst','obra_id'), ('programas_laudos','sst',null),
  ('mobilizacoes','sst',null),
  ('documentos_empresa','docsemp',null), ('comunicados','comunicados',null), ('modelos_documento','modelos',null)
) as x(t, m, o);

-- Leitura liberada a qualquer usuário ativo (cadastros base usados em todas as telas)
drop policy if exists p_ler_base on public.obras;     create policy p_ler_base on public.obras    for select to authenticated using (public.usuario_ativo());
drop policy if exists p_ler_base on public.funcoes;   create policy p_ler_base on public.funcoes  for select to authenticated using (public.usuario_ativo());
drop policy if exists p_ler_base on public.feriados;  create policy p_ler_base on public.feriados for select to authenticated using (public.usuario_ativo());
drop policy if exists p_ler_base on public.perfis;    create policy p_ler_base on public.perfis   for select to authenticated using (public.usuario_ativo());
drop policy if exists p_ler_base on public.permissoes; create policy p_ler_base on public.permissoes for select to authenticated using (public.usuario_ativo());

-- Usuários: cada um vê o próprio cadastro; quem tem o módulo "usuarios" gerencia todos
alter table public.usuarios enable row level security;
drop policy if exists u_ver on public.usuarios;    create policy u_ver on public.usuarios for select to authenticated using (id = auth.uid() or public.tem_perm('usuarios','ver'));
drop policy if exists u_incluir on public.usuarios; create policy u_incluir on public.usuarios for insert to authenticated with check (public.tem_perm('usuarios','incluir'));
drop policy if exists u_editar on public.usuarios;  create policy u_editar on public.usuarios for update to authenticated using (public.tem_perm('usuarios','editar')) with check (public.tem_perm('usuarios','editar'));
drop trigger if exists t_auditoria on public.usuarios;
create trigger t_auditoria after insert or update or delete on public.usuarios for each row execute function public.fn_auditoria();

-- Configurações: todos leem; só quem edita usuários (master) altera
alter table public.configuracoes enable row level security;
drop policy if exists c_ver on public.configuracoes;    create policy c_ver on public.configuracoes for select to authenticated using (public.usuario_ativo());
drop policy if exists c_editar on public.configuracoes; create policy c_editar on public.configuracoes for all to authenticated using (public.tem_perm('usuarios','editar')) with check (public.tem_perm('usuarios','editar'));
drop trigger if exists t_auditoria on public.configuracoes;
create trigger t_auditoria after insert or update or delete on public.configuracoes for each row execute function public.fn_auditoria();

-- Notificações: cada usuário vê as dele e as do seu perfil
alter table public.notificacoes enable row level security;
drop policy if exists n_ver on public.notificacoes;
create policy n_ver on public.notificacoes for select to authenticated using (
  usuario_id = auth.uid()
  or perfil_id = (select perfil_id from public.usuarios where id = auth.uid())
  or exists (select 1 from public.usuarios u join public.perfis p on p.id = u.perfil_id where u.id = auth.uid() and p.master));
drop policy if exists n_incluir on public.notificacoes;
create policy n_incluir on public.notificacoes for insert to authenticated with check (public.usuario_ativo());
alter table public.notificacao_leitura enable row level security;
drop policy if exists nl_proprio on public.notificacao_leitura;
create policy nl_proprio on public.notificacao_leitura for all to authenticated using (usuario_id = auth.uid()) with check (usuario_id = auth.uid());

-- Auditoria: só leitura, e só para quem tem o módulo
alter table public.auditoria enable row level security;
drop policy if exists a_ver on public.auditoria;
create policy a_ver on public.auditoria for select to authenticated using (public.tem_perm('auditoria','ver'));
revoke update, delete on public.auditoria from authenticated, anon;

-- Competência fechada não aceita mudança no ponto do período
create or replace function public.fn_bloqueia_competencia_fechada()
returns trigger language plpgsql as $$
declare d date := coalesce(new.data, old.data);
begin
  if exists (select 1 from public.competencias c where c.id = public.competencia_de(d) and c.status = 'Fechada') then
    raise exception 'A competência % está fechada. Reabra antes de alterar o ponto.', public.competencia_de(d);
  end if;
  return coalesce(new, old);
end $$;
drop trigger if exists t_bloqueio_fechada on public.ponto;
create trigger t_bloqueio_fechada before insert or update or delete on public.ponto for each row execute function public.fn_bloqueia_competencia_fechada();

-- Arquivos no Storage (bucket privado "documentos")
drop policy if exists docs_ver on storage.objects;
create policy docs_ver on storage.objects for select to authenticated using (bucket_id = 'documentos' and public.tem_perm('docs','ver'));
drop policy if exists docs_incluir on storage.objects;
create policy docs_incluir on storage.objects for insert to authenticated with check (bucket_id = 'documentos' and public.tem_perm('docs','incluir'));
drop policy if exists docs_excluir on storage.objects;
create policy docs_excluir on storage.objects for delete to authenticated using (bucket_id = 'documentos' and public.tem_perm('docs','excluir'));

-- ---------------------------------------------------------------------
-- 9. DADOS INICIAIS
-- ---------------------------------------------------------------------
insert into public.perfis (id, nome, descricao, master) values
  ('master','Administrador (master)','Acesso total; gerencia usuários, perfis e permissões.',true),
  ('rh','RH','Cadastra, admite, lança e aprova o ponto e fecha o rateio.',false),
  ('sesmt','SESMT','ASO, treinamentos, EPI, DDS, inspeções, PT, ocorrências e mobilização.',false),
  ('encarregado','Encarregado de obra','Abre vagas e lança o ponto apenas das obras liberadas.',false),
  ('engenharia','Engenharia','Aprova vagas das suas obras e acompanha ponto e custos.',false),
  ('diretoria','Diretoria','Consulta painéis e aprova contratações.',false),
  ('logistica','Logística','Frota, combustível e manutenção.',false)
on conflict (id) do nothing;

-- Permissões dos perfis não master (letras: v=ver i=incluir e=editar x=excluir p=exportar a=aprovar)
insert into public.permissoes (perfil_id, modulo, ver, incluir, editar, excluir, exportar, aprovar)
select perfil, modulo, acoes like '%v%', acoes like '%i%', acoes like '%e%', acoes like '%x%', acoes like '%p%', acoes like '%a%'
from (values
  ('rh','painel','vp'),('rh','colab','viexp'),('rh','admissao','viexpa'),('rh','docs','viexp'),('rh','salarios','ve'),
  ('rh','ponto','viexpa'),('rh','rateio','vepa'),('rh','va','vep'),('rh','movim','viexp'),('rh','ferias','viep'),
  ('rh','sst','viep'),('rh','rotinas','vie'),('rh','indicadores','vp'),('rh','modelos','v'),('rh','docsemp','viep'),('rh','comunicados','viex'),
  ('sesmt','sst','viexpa'),('sesmt','colab','v'),('sesmt','docs','v'),('sesmt','ponto','v'),('sesmt','indicadores','v'),('sesmt','docsemp','v'),('sesmt','comunicados','vie'),
  ('encarregado','ponto','vie'),('encarregado','colab','v'),('encarregado','admissao','vi'),('encarregado','sst','vi'),('encarregado','comunicados','v'),
  ('engenharia','admissao','vi'),('engenharia','ponto','v'),('engenharia','colab','v'),('engenharia','painel','v'),('engenharia','rateio','v'),('engenharia','indicadores','v'),('engenharia','sst','via'),('engenharia','comunicados','v'),
  ('diretoria','admissao','v'),('diretoria','painel','vp'),('diretoria','rateio','vp'),('diretoria','va','v'),('diretoria','sst','v'),('diretoria','indicadores','vp'),('diretoria','salarios','v'),('diretoria','docsemp','v'),('diretoria','comunicados','v'),
  ('logistica','logistica','viexp'),('logistica','indicadores','v'),('logistica','comunicados','v')
) as x(perfil, modulo, acoes)
on conflict (perfil_id, modulo) do nothing;

insert into public.obras (nome) values
  ('ESCRITÓRIO'),('ITAIPAVA'),('CASA VALTER'),('PAVIMENTO MARABÁ'),('RODRIGO'),('ARLISSON'),('CESTE BANHEIROS'),
  ('CESTE BABAÇULÂNDIA'),('SINOBRAS FLORESTAL'),('TAESA BASES'),('ARMAÇÃO TAESA'),('IGREJA'),('PH VEÍCULOS')
on conflict (nome) do nothing;

-- Funções: salário-base em branco para o RH preencher
insert into public.funcoes (nome, va_padrao, nrs, administrativa, periculosidade_pct) values
  ('Servente',300,'{NR-18,NR-35}',false,0),('Pedreiro',300,'{NR-18,NR-35}',false,0),('Carpinteiro',300,'{NR-18,NR-12}',false,0),
  ('Armador',300,'{NR-18}',false,0),('Eletricista',300,'{NR-10,NR-35}',false,30),('Operador de máquinas',300,'{NR-11,NR-12}',false,0),
  ('Motorista',300,'{NR-11}',false,0),('Encarregado de obra',400,'{NR-18,NR-35}',false,0),('Mestre de obras',400,'{NR-18,NR-35}',false,0),
  ('Técnico de segurança',400,'{NR-18,NR-33,NR-35}',false,0),('Engenheiro civil',400,'{NR-18,NR-35}',false,0),('Almoxarife',300,'{NR-11}',false,0),
  ('Auxiliar administrativo',300,'{}',true,0),('Analista de RH',300,'{}',true,0),('Analista financeiro',300,'{}',true,0)
on conflict (nome) do nothing;

-- Feriados nacionais 2026 e 2027 (inclua os estaduais e municipais de cada obra)
insert into public.feriados (data, descricao) values
  ('2026-01-01','Confraternização Universal'),('2026-04-03','Sexta-feira Santa'),('2026-04-21','Tiradentes'),('2026-05-01','Dia do Trabalho'),
  ('2026-09-07','Independência'),('2026-10-12','Nossa Senhora Aparecida'),('2026-11-02','Finados'),('2026-11-15','Proclamação da República'),
  ('2026-11-20','Dia Nacional de Zumbi e da Consciência Negra'),('2026-12-25','Natal'),
  ('2027-01-01','Confraternização Universal'),('2027-03-26','Sexta-feira Santa'),('2027-04-21','Tiradentes'),('2027-05-01','Dia do Trabalho'),
  ('2027-09-07','Independência'),('2027-10-12','Nossa Senhora Aparecida'),('2027-11-02','Finados'),('2027-11-15','Proclamação da República'),
  ('2027-11-20','Dia Nacional de Zumbi e da Consciência Negra'),('2027-12-25','Natal')
on conflict (data) do nothing;

insert into public.configuracoes (chave, valor) values
  ('jornada', '{"seg_qui_min":540,"sexta_min":480,"tolerancia_min":10,"inicio_apuracao_dia":21,"texto":"44 horas semanais, de segunda a quinta das 07h00 às 17h00 e às sextas das 07h00 às 16h00, com 1 hora de intervalo"}'),
  ('empresa', '{"razao_social":"","cnpj":"","endereco":"","cidade":"","representante":"","representante_cargo":"","email_contabilidade":"","clinica":""}'),
  ('fluxo_admissao', '{"gestor":{"ativo":true,"perfil":"engenharia"},"diretoria":{"ativo":true,"perfil":"diretoria","acima_de":0},"avisar_mobilizacao":{"perfis":["sesmt"],"emails":""}}'),
  ('vale_alimentacao', '{"desconto_1_falta":25,"desconto_2_faltas":50,"desconto_3_ou_mais":100,"dias_base":30}')
on conflict (chave) do nothing;

insert into public.nr_validade (treinamento, meses, carga_horaria) values
  ('INTEGRAÇÃO',null,4),('NR-10',24,40),('NR-11',12,16),('NR-12',24,8),('NR-18',24,4),('NR-33',12,16),('NR-35',24,8)
on conflict (treinamento) do nothing;

-- >>> USUÁRIO MASTER: troque o e-mail abaixo se o seu for diferente <<<
insert into public.usuarios (id, nome, email, perfil_id, todas_obras, ativo)
select id, 'Lucas André', email, 'master', true, true
  from auth.users where lower(email) = lower('lucasandre@aavante.com.br')
on conflict (id) do update set perfil_id = 'master', ativo = true, todas_obras = true;

-- Conferência final: deve mostrar 1 linha com o seu usuário e perfil master
select u.email, u.perfil_id, p.master from public.usuarios u join public.perfis p on p.id = u.perfil_id;
