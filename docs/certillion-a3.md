# Certillion A3 (assinador local)

O provedor `a3` usa a API Certillion com o PSC `CERTILLION_SIGNER`. O Hippi A1 foi retirado do fluxo de novas assinaturas; o fluxo A3 não recebe nem armazena PFX, PIN ou chave privada.

## Variáveis do servidor

Configure somente no ambiente seguro do servidor (por exemplo, Vercel → Settings → Environment Variables). Não use prefixo `NEXT_PUBLIC_`, não grave valores no Git e não os envie pelo chat.

| Variável | Obrigatória | Uso |
| --- | --- | --- |
| `CERTILLION_CLIENT_ID` | Sim | Credencial da aplicação, usada em `client_token`, upload, download e validação. |
| `CERTILLION_CLIENT_SECRET` | Sim | Segredo da aplicação; permanece no servidor. |
| `CERTILLION_MANAGER_ID` | Não* | ID Manager usado na troca OAuth. Se omitido, usa o Client ID como `manager_id` no OAuth. |
| `CERTILLION_MANAGER_SECRET` | Não* | Segredo Manager usado na troca OAuth. Se omitido, usa o Client Secret como `manager_secret` no POST de troca do código. |
| `CERTILLION_REDIRECT_URI` | Sim | URL exata registrada na Certillion: `https://SEU-DOMINIO/api/assinatura/certillion/retorno`. |
| `CERTILLION_SESSION_ENCRYPTION_KEY` | Sim | Segredo aleatório do CRA Care para cifrar o token OAuth em cookie HttpOnly. Gere um valor novo e forte; não reutilize a credencial Certillion. |
| `CERTILLION_API_BASE_URL` | Não | Padrão `https://cloud-ws.certillion.com` para `CERTILLION_SIGNER`. |
| `CERTILLION_SESSION_LIFETIME_SECONDS` | Não | Padrão `3600` (1 hora); a validade efetiva é a retornada pela API. |

\* O e-mail forneceu um único par de credenciais da aplicação e orientou mudar os nomes dos parâmetros para `manager_id`/`manager_secret` no OAuth. A integração usa esse mesmo par por padrão; os overrides só são necessários se a e-Sec emitir credenciais distintas.

## Fluxo implementado

1. O médico usa **Conectar certificado A3** na tela `/assinatura-digital`. O botão abre o OAuth PKCE da Certillion com escopo `signature_session`, sem precisar preparar uma receita. A primeira assinatura também pode iniciar essa autorização.
2. No callback, o servidor troca o código, cifra o token e vincula a sessão ao usuário e à clínica no cookie HttpOnly.
3. A conexão avulsa retorna a sessão pronta para assinar; quando a autorização foi iniciada por uma receita, o callback também conclui essa assinatura. O botão `Assinar` reutiliza a sessão enquanto ela estiver válida.
4. Cada documento é enviado (limite configurado em 100.000 bytes), assinado como `PADES_ICP_BR`, baixado e validado. O CRA Care só o marca como assinado após confirmação `SIGNATURE_VALID`.
5. Se a resposta do pedido de assinatura ficar incerta, uma repetição automática é bloqueada para evitar cobrança ou assinatura duplicada. O documento fica disponível para retomar download/validação quando a transação já foi confirmada.

A sessão OAuth elimina uma nova autorização OAuth a cada documento; ela não elimina eventuais confirmações exibidas pelo aplicativo/assinador Certillion ao usar o token/cartão A3.

## Configuração e verificação

Domínio de produção: `https://cra-care.vercel.app`.

Retorno OAuth: `https://cra-care.vercel.app/api/assinatura/certillion/retorno`.

As credenciais e a chave de criptografia da sessão foram cadastradas como segredos de produção na Vercel. Nenhum valor está neste documento ou no Git. A API oficial recebeu as credenciais: `client_token` retornou HTTP 200 com token; `authorize` redirecionou para a página Certillion e a página carregou com HTTP 200. A troca do código e a assinatura real dependem da autorização do titular com o A3 conectado.

O GET de autorização usa `manager_id`; o segredo segue somente no POST de troca do código, como documentado publicamente pela Certillion. O cookie cifrado de autorização vincula o retorno ao navegador que iniciou o fluxo e expira em 15 minutos. O processamento usa atualização condicional para impedir duas solicitações de assinatura concorrentes; respostas HTTP 5xx de assinatura permanecem incertas e não geram nova assinatura automática.

Instale o aplicativo oficial em https://download.certillion.com/ e o driver do token/cartão. O médico entra no CRA Care, abre **Assinatura Digital**, clica em **Conectar certificado A3**, seleciona seu certificado e autoriza. O PIN é informado somente no aplicativo oficial. As próximas receitas usam a sessão até expirar; o A3 pode exigir confirmação adicional.

O Hippi deixou de ser oferecido nas telas de assinatura e configuração. As receitas históricas continuam consultáveis. Os arquivos antigos do assinador foram preservados; a instalação do Windows não foi desinstalada por esta alteração.

## Limites e operação

## Verificação da implementação (25/10/2026)

- Oito testes automatizados passaram: PKCE/cookies, isolamento entre usuários/clínicas, assinatura/validação simuladas, retomada sem duplicar, bloqueio de resposta incerta, concorrência, limite do documento e tamanho de uma receita gerada pelo CRA Care.
- Compilação de produção aprovada. Next.js e eslint-config-next foram atualizados para 16.4.3 para corrigir a vulnerabilidade crítica que bloqueava a compilação da versão 16.4.0.
- Os endpoints antigos de recebimento de assinatura A1 e cadastro de certificado A1 retornam HTTP 410. A biblioteca node-forge, que ainda possui um alerta alto sem correção disponível no npm, permanece apenas no código legado preservado e não é importada pelo fluxo publicado de assinatura.
- O teste real com o dispositivo A3, a troca do código OAuth e a conferência do primeiro PDF assinado ainda dependem da autorização do titular. Não foi realizada uma assinatura real automaticamente.

As credenciais fornecidas para esta conta foram descritas como válidas por 90 dias, com até 200 assinaturas/mês e arquivos de até 100 KB. A API pode manter documentos temporariamente no servidor para o download após assinatura; acompanhe as condições contratuais vigentes com a e-Sec.
