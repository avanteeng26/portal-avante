# Portal Avante

Portal de gestão interno da Avante Engenharia, em **Next.js 15 + Supabase**.

- Especificação de telas e regras: [`docs/portal-avante-rh.html`](docs/portal-avante-rh.html) (protótipo validado)
- Banco: [`docs/portal-avante-banco.sql`](docs/portal-avante-banco.sql), usado **sem alterações de estrutura**
- Decisões pendentes sobre permissões: [`docs/PENDENCIAS-BANCO.md`](docs/PENDENCIAS-BANCO.md)

## Fase 1: Recursos Humanos (pronta)

| Item | Onde | Observações |
|---|---|---|
| Login | `/login` | Supabase Auth (e-mail e senha), sem cadastro público. "Esqueci a senha" envia link para `/redefinir-senha`. Bloqueia login sem cadastro em `usuarios` ou com usuário inativo. Login, falha de login e logout vão para a auditoria. |
| Menu por setores | todas as páginas | Igual ao protótipo. Cada item aparece só se o perfil tiver `ver` no módulo. Itens de fases futuras aparecem como "em breve". |
| Cadastro de funcionários | `/rh/funcionarios` | Lista com filtros, última obra no ponto, documentos e ASO; salário só para quem tem o módulo `salarios`. Ficha com dados, remuneração, documentos, ponto e histórico (auditoria). |
| Documentos | ficha › Documentos | Checklist do protótipo; arquivos no bucket privado `documentos` (PDF/JPG/PNG até 10 MB), abertos por link temporário. Consultas, impressões e exportações são registradas na auditoria. |
| Admissão | `/rh/admissao` | Vaga → gestor → diretoria → documentos e dados → guia de exame → ficha preliminar para a contabilidade → efetivação (cria funcionário, remuneração, ASO, mobilização e avisa o SESMT) → contrato e ficha assinados → admitido. Aprovar, devolver ou reprovar, com histórico e avisos no sino. Fluxo configurável pelo master. |
| Folha de ponto | `/rh/ponto` | Período de 21 a 20; obra escolhida por dia e por funcionário; "Dividir dia" em duas obras; enviar e aprovar o dia; reabrir; validação igual às constraints da tabela. Competência fechada bloqueia edição. |
| Espelho de ponto | `/rh/ponto` › Espelho | Edição por funcionário; impressão no mesmo layout do protótipo (formato da planilha), individual ou de todos do período; CSV. |
| Rateio por obra | `/rh/rateio` | Custo por horas do ponto; INSS, FGTS, férias e 13º com valor real da folha (rateado por coeficiente) ou estimado por percentual; VA com desconto por faltas; fechamento grava a foto em `rateio_fechamento`; exportação no formato da planilha. |
| Modelos de documentos | `/adm/modelos` | Dados da empresa, jornada e textos de contrato e ficha com campos automáticos e versões. |

Os cálculos do ponto (`lib/ponto.ts`) foram conferidos caso a caso contra as views `v_ponto` e
`v_horas_obra` do banco (sábado, domingo, feriado, tolerância, atraso, hora extra, dia dividido e ocorrências): resultados idênticos.

**Permissões:** a regra de verdade é a RLS do banco. As telas só escondem ou desabilitam o que o perfil não pode fazer.
**Auditoria:** as alterações de tabela já são registradas pelos gatilhos `t_auditoria`. O portal chama
`registrar_evento` para o que não é alteração de tabela (login, exportação, impressão, consulta de documento, envio à contabilidade, fechamento).

## Como rodar

Requisitos: Node 20+ e um projeto Supabase com o `portal-avante-banco.sql` já executado.

```bash
cp .env.example .env.local   # preencha NEXT_PUBLIC_SUPABASE_URL e NEXT_PUBLIC_SUPABASE_ANON_KEY
npm install
npm run dev                  # http://localhost:3000
```

Produção (ex.: Vercel): configure as mesmas duas variáveis e rode `npm run build && npm start`.

### Configuração no Supabase

1. **Storage › New bucket**: `documentos`, **privado** (as políticas já vêm do SQL).
2. **Authentication › Providers › Email**: desligue *Allow new users to sign up* (não há cadastro público).
3. **Authentication › URL Configuration**: inclua `https://SEU-DOMINIO/redefinir-senha` em *Redirect URLs*.
4. Para cada pessoa: crie o usuário em **Authentication › Users** (ou envie convite) e a linha
   correspondente em `public.usuarios` (mesmo `id`), com `perfil_id`, `todas_obras` e, se for o caso, as obras em `usuario_obras`.
5. Veja [`docs/PENDENCIAS-BANCO.md`](docs/PENDENCIAS-BANCO.md): três ajustes de permissão são necessários
   para gestor/diretoria aprovarem vagas e para o RH gravar salário e fechar o rateio.

## Estrutura

```
app/login, app/redefinir-senha      telas públicas
app/(portal)/...                    páginas autenticadas (layout com menu por setores)
components/                         Sessao (perfil, permissões, obras), Shell (menu, sino), checklist de documentos
lib/ponto.ts                        regras do ponto (espelho de v_ponto)
lib/rateio.ts                       rateio e encargos
lib/espelho.ts                      espelho imprimível (layout da planilha)
lib/modelos.ts                      contratos/ficha e valores por extenso
lib/docs.ts                         checklist e Storage
middleware.ts                       sessão do Supabase e proteção das rotas
```
