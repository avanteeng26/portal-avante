# Pendências do banco: decisões do administrador

A estrutura do `portal-avante-banco.sql` **não foi alterada**. Todas as regras de RLS foram testadas
num Postgres local com o script original, rodado sem nenhuma modificação, usando um usuário de cada perfil.
Os itens abaixo são **permissões padrão (dados da tabela `permissoes`)** que hoje impedem
partes do fluxo de funcionar para perfis que não são master. O portal mostra a mensagem
"Seu perfil não tem permissão…" quando isso acontece; nada é gravado pela metade sem aviso.

Nenhum SQL abaixo foi executado. São sugestões para você aprovar e rodar no SQL Editor do Supabase.

## 1. Gestor e diretoria não conseguem aprovar vagas (bloqueia o fluxo)

A aprovação grava `admissoes.etapa` (UPDATE), e a RLS exige `admissao.editar`. O histórico
(`admissao_historico`) exige `admissao.incluir`.

| Perfil | Hoje (`admissao`) | Resultado no teste |
|---|---|---|
| engenharia (gestor) | `vi` | UPDATE bloqueado (0 linhas) |
| diretoria | `v` | UPDATE bloqueado; histórico recusado |

Sugestão:
```sql
update public.permissoes set editar = true where perfil_id = 'engenharia' and modulo = 'admissao';
update public.permissoes set editar = true, incluir = true where perfil_id = 'diretoria' and modulo = 'admissao';
```
Observação: com `editar`, a engenharia só altera vagas das **obras liberadas** para ela (a RLS de
`admissoes` já filtra por `obra_liberada`). Usuários da diretoria precisam de `todas_obras = true`.

## 2. RH não consegue gravar a remuneração do novo funcionário

Na efetivação o portal cria `funcionarios` (ok) e `funcionarios_remuneracao`, que exige
`salarios.incluir`. O RH tem `salarios = ve`.
```sql
update public.permissoes set incluir = true where perfil_id = 'rh' and modulo = 'salarios';
```
Sem isso o funcionário é criado e o salário fica em branco (o portal avisa); só o master consegue completar.

## 3. RH não consegue abrir nem fechar competência do rateio

Criar a linha de `competencias` e gravar a foto em `rateio_fechamento` exigem `rateio.incluir`.
O RH tem `rateio = vepa`.
```sql
update public.permissoes set incluir = true where perfil_id = 'rh' and modulo = 'rateio';
```
Atualizar valores de uma competência que já existe funciona com a permissão atual.

## 4. Itens só informativos (não exigem ação)

- **Nomes de quem agiu no histórico**: a RLS de `usuarios` só mostra o próprio cadastro para quem
  não tem o módulo "usuarios". Por isso, para o RH, o histórico da admissão mostra "usuário do portal"
  em vez do nome de quem aprovou. Para mostrar os nomes, seria preciso uma view ou função com os nomes
  (mudança de estrutura, não feita).
- **Encarregado não apaga lançamento de ponto** (`ponto = vie`, sem excluir). O portal avisa e
  orienta a usar a ocorrência correta em vez de limpar a linha. Mantido como está, porque parece intencional.
- **Bucket `documentos`**: o SQL cria só as políticas em `storage.objects`. O bucket privado
  `documentos` precisa existir (Storage › New bucket › Private).
- **Dados da empresa, jornada e fluxo de aprovação** (`configuracoes`): só o master altera, pela
  regra do SQL. O RH vê, mas não edita.
- **Modelos de contrato**: o RH tem `modelos = v`. Enquanto não houver modelos cadastrados, o portal
  usa os textos-base do protótipo. O master pode salvar e versionar os modelos em
  Administração › Modelos de documentos.
- **E-mail**: `notificacoes.enviar_email` é gravado, mas o envio real de e-mail precisa de uma Edge
  Function ou serviço SMTP (fora da Fase 1). O envio da ficha à contabilidade abre o programa de
  e-mail do usuário, com links temporários (7 dias) dos documentos.
