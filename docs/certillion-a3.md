# Certillion via VIDaaS (A3 em nuvem)

O provedor `a3` usa a API unificada da Certillion com o PSC `VIDAAS`. O certificado do médico permanece na conta VIDaaS; o CRA Care não recebe nem armazena PFX, PIN, token físico ou chave privada. Para VIDaaS, a API usa `https://cloud.certillion.com`; `cloud-ws.certillion.com` e `CERTILLION_SIGNER` são destinados ao assinador local e não são usados neste fluxo.

## Configuração segura

As variáveis devem existir somente no ambiente de servidor da Vercel, sem prefixo `NEXT_PUBLIC_`. Não grave credenciais no Git nem as envie por chat.

| Variável | Obrigatória | Uso |
| --- | --- | --- |
| `CERTILLION_CLIENT_ID` | Sim | Credencial da aplicação, usada em `client_token`, upload, download e validação. |
| `CERTILLION_CLIENT_SECRET` | Sim | Segredo da aplicação, usado somente no servidor. |
| `CERTILLION_MANAGER_ID` | Não | Identificador usado no OAuth. Se omitido, usa o Client ID. |
| `CERTILLION_MANAGER_SECRET` | Não | Segredo enviado no POST de troca do código OAuth. Se omitido, usa o Client Secret. |
| `CERTILLION_REDIRECT_URI` | Sim | Callback cadastrado na Certillion: `https://cra-care.vercel.app/api/assinatura/certillion/retorno`. |
| `CERTILLION_SESSION_ENCRYPTION_KEY` | Sim | Chave aleatória forte do CRA Care para cifrar o token de sessão no cookie HttpOnly. |
| `CERTILLION_SESSION_LIFETIME_SECONDS` | Não | Tempo solicitado para a sessão; padrão de 3600 segundos. A validade efetiva é a retornada pela API. |

A integração fixa o PSC `VIDAAS` e o host oficial `https://cloud.certillion.com`. O host `CERTILLION_SIGNER` não deve ser usado para esta modalidade. As credenciais fornecidas para esta conta foram descritas como válidas por 90 dias, até 200 assinaturas por mês e arquivos de até 100 KB; confirme os limites e a validade atuais com a e-Sec.

## Como o médico usa

1. Entre no CRA Care em `https://cra-care.vercel.app` com o perfil do médico.
2. Abra **Assinatura Digital** e clique em **Conectar VIDaaS**.
3. Entre no VIDaaS com a conta que possui o certificado e autorize a sessão.
4. Prepare a solicitação da receita, se ela ainda não estiver na lista, e clique em **Assinar**.
5. As próximas receitas podem ser assinadas pelo botão **Assinar** enquanto a sessão VIDaaS estiver válida. A sessão fica guardada em cookie HttpOnly e vinculada ao médico, à clínica e ao navegador; em outro navegador ou computador, conecte o VIDaaS novamente.

A sessão usa o escopo `signature_session`, que permite várias solicitações de assinatura durante o período concedido. Isso evita repetir o fluxo de autorização OAuth a cada receita. O VIDaaS ainda pode apresentar uma confirmação própria conforme as regras da conta/certificado.

## O que o sistema valida

O CRA Care envia o PDF à Certillion, solicita assinatura `PADES_ICP_BR`, baixa o resultado e valida a assinatura ICP-Brasil. Só então marca a receita como assinada. O PDF original é limitado a 100.000 bytes. Se a resposta da assinatura ficar incerta, o sistema bloqueia o reenvio automático para não criar uma assinatura duplicada.

A conexão é iniciada por OAuth com PKCE. O callback cadastrado deve corresponder exatamente ao domínio e caminho acima. O código OAuth é trocado no servidor usando `manager_id` e `manager_secret`; o segredo não é colocado na URL. O token da sessão é cifrado no cookie HttpOnly e não é gravado em texto aberto no banco.

## Estado de verificação

O teste de conexão técnica valida as credenciais da aplicação com `client_token`. A primeira autorização real e a primeira assinatura ainda precisam ser confirmadas pelo médico titular no VIDaaS. Faça o primeiro teste com uma receita de teste aprovada pelo médico e confira o PDF assinado e o estado **Assinado** no histórico.

Não é necessário instalar o aplicativo Certillion nem conectar token/cartão físico ao computador para o fluxo VIDaaS. O assinador local é outra modalidade da API (`CERTILLION_SIGNER`) e não faz parte desta configuração.
