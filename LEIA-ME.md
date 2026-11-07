# Portal Avante Engenharia · versão 1 (RH)

Sistema web ligado ao banco de dados Supabase. Não precisa de instalação nem de compilação.

## Arquivos
- `index.html`, `app.js`, `estilo.css`, `logo.png`, `logo-marca.png`: o portal
- `config.js`: **único arquivo que você edita** (endereço e chave pública do Supabase)
- `vercel.json`: configurações de segurança da hospedagem
- `sql/02-ajustes.sql`: complemento do banco (rodar uma vez no SQL Editor do Supabase)

## Colocar no ar
1. Supabase › SQL Editor: rode `sql/02-ajustes.sql`.
2. Edite `config.js` com a Project URL e a chave anon/publishable (Project Settings › API).
3. Envie todos os arquivos para o repositório no GitHub (substituindo os anteriores).
4. Vercel › Add New › Project › escolha o repositório › Deploy (sem configurações extras).
5. Supabase › Authentication › URL Configuration: coloque o endereço do portal em **Site URL** e em **Redirect URLs**.

## Incluir usuários
1. Supabase › Authentication › Users › Add user › Send invitation (e-mail da pessoa).
2. Portal › Administração › Usuários › Liberar usuário (mesmo e-mail, perfil e obras).

## Fase 1 (no ar)
Login e recuperação de senha · menu por setores · funcionários (cadastro, importação por planilha, documentos) · nova admissão completa (vaga → aprovações → documentos → guia de exame → ficha preliminar para a contabilidade → efetivação → contrato e ficha assinados) · folha de ponto diária (21 a 20, obra por dia, dia dividido) · espelho no formato da planilha · rateio por obra com INSS, FGTS, férias e 13º e fechamento da competência · usuários, perfis e permissões · auditoria.

## Próximas fases
SESMT · Logística · Engenharia · Financeiro · Suprimentos.
