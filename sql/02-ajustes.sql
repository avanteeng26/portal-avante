-- =====================================================================
--  PORTAL AVANTE · AJUSTE 02 (rodar depois do portal-avante-banco.sql)
--  SQL Editor › New query › colar › Run. Pode ser executado mais de uma vez.
-- =====================================================================

-- Liberar no portal um usuário já criado em Authentication › Users
create or replace function public.vincular_usuario(p_email text, p_nome text, p_perfil text, p_todas_obras boolean default false)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_id uuid;
begin
  if not public.tem_perm('usuarios','incluir') then raise exception 'Sem permissão para cadastrar usuários.'; end if;
  select id into v_id from auth.users where lower(email) = lower(trim(p_email));
  if v_id is null then raise exception 'E-mail % não encontrado. Crie o usuário primeiro em Authentication › Users no Supabase.', p_email; end if;
  insert into public.usuarios (id, nome, email, perfil_id, todas_obras, ativo)
  values (v_id, p_nome, lower(trim(p_email)), p_perfil, p_todas_obras, true)
  on conflict (id) do update set nome = excluded.nome, perfil_id = excluded.perfil_id, todas_obras = excluded.todas_obras, ativo = true;
  perform public.registrar_evento('Vinculou usuário', p_email || ' · perfil ' || p_perfil);
  return v_id;
end $$;

-- Nomes dos usuários para exibir em históricos (sem dados sensíveis)
create or replace function public.lista_usuarios()
returns table (id uuid, nome text, email text) language sql stable security definer set search_path = public as $$
  select u.id, u.nome, u.email from public.usuarios u where public.usuario_ativo();
$$;

-- O RH precisa criar a competência ao informar INSS/FGTS/férias/13º e registrar a remuneração na efetivação
update public.permissoes set incluir = true where perfil_id = 'rh' and modulo in ('rateio','salarios');

-- Os perfis passam a poder ver o próprio cadastro de permissões (menu) e as obras liberadas
drop policy if exists uo_proprio on public.usuario_obras;
create policy uo_proprio on public.usuario_obras for select to authenticated using (usuario_id = auth.uid());

-- Garante o bucket privado de documentos (caso não tenha sido criado pelo painel)
insert into storage.buckets (id, name, public) values ('documentos','documentos', false) on conflict (id) do nothing;

select 'Ajuste 02 aplicado' as resultado;
