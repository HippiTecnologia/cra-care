# Módulo de Assinatura Digital do CRA Care

## Instalação

1. Execute as migrations `026`, `027` e `028` no SQL Editor do Supabase, nessa ordem.
2. Crie no Vercel as variáveis listadas em `.env.example`.
3. No painel administrativo, abra **Assinatura Digital → Configurações** e registre somente URLs públicas e nomes das variáveis de ambiente.
4. Nunca cole PIN, senha, PFX, chave privada ou Client Secret na interface.

## Fluxo

`Documento → solicitação → autenticação → assinatura no provedor → validação → armazenamento privado → auditoria → consulta pública por QR Code`.

O médico acessa **Assinatura Digital**, abre o documento e autoriza. A secretária solicita e acompanha. O administrador consulta auditoria e configura os provedores. Todos os acessos são segregados por clínica.

## Provedores

| Provider | Estado | Observação |
| --- | --- | --- |
| VIDaaS | Adaptador real existente | Requer credenciais e callback cadastrados pela Valid. |
| Soluti Bird ID | Interface preparada | A API completa exige credenciamento e documentação oficial da Soluti. Enquanto isso, aparece como `Integração pendente de configuração`. |
| A1 | Interface preparada | Requer SDK/conector homologado; o CRA Care não recebe o PFX nem a senha. |
| A3 | Interface preparada | Requer driver do token/cartão e conector oficial; o CRA Care não recebe o PIN. |
| Cloud genérico | Interface preparada | Requer API oficial do provedor escolhido. |

Não foram inventados endpoints para Soluti, A1 ou A3. Ativar uma variável sem o conector correspondente não produz assinatura e nenhum mock é marcado como válido.

### Validação A1 / ICP-Brasil

O Hippi Assinador A1 assina somente no computador do médico. Antes de aceitar o retorno, o CRA Care compara o PDF assinado com o PDF preparado, confere a assinatura CMS e confirma que o certificado usado é o mesmo vinculado ao médico. Em seguida, o servidor valida a cadeia até uma raiz ICP-Brasil configurada e consulta as listas de certificados revogados (CRL) publicadas pelas ACs.

Para habilitar essa última etapa, gere as raízes públicas atualizadas com `npm run icp:trust-store` e cadastre o conteúdo completo gerado no Vercel em `ICP_BRASIL_TRUSTED_ROOTS_PEM`, tanto em **Production** quanto em **Preview**. Faça um novo deploy após salvar. Sem essa variável, ou se uma CRL não puder ser consultada, o documento permanece em `signing` e o QR Code não informa que ele é autêntico.

## Banco e armazenamento

- `digital_signatures`: estado e evidências da assinatura.
- `signature_audit_logs`: trilha imutável de eventos funcionais.
- `signature_webhook_events`: deduplicação idempotente dos webhooks.
- `signature_provider_configs`: apenas configuração não sensível e nomes das variáveis de ambiente.
- `signature_document_rules`: quais documentos exigem assinatura.
- Bucket privado `digital-signatures`: PDF original preparado e PDF final assinado.

## Segurança

- APIs autenticadas usam token de sessão e verificam clínica/perfil no servidor.
- O documento é conferido por SHA-256 antes de iniciar a assinatura.
- Webhooks exigem HMAC e o mesmo evento não é processado duas vezes.
- O webhook nunca marca um documento como assinado sozinho: ainda é necessário consultar/confirmar o provedor e validar o PDF.
- Tokens, PKCE e segredos permanecem no servidor.
- O QR Code aponta para `/validar-documento/{codigo}` e nunca expõe CPF ou dados clínicos.
- O rate limit implementado é local ao processo. Em produção com múltiplas instâncias, configure também rate limiting no gateway/edge.

## Estados

`draft`, `awaiting_signature`, `authentication_pending`, `signing`, `signed`, `rejected`, `cancelled`, `expired`, `error` e `invalid`.

Somente `signed`, com `validation_result.valid = true` e `validated_at` preenchido, aparece como documento válido na consulta pública.

## Endpoints

- `GET/POST /api/signatures`
- `GET/DELETE /api/signatures/{id}`
- `POST /api/signatures/{id}/start`
- `GET /api/signatures/{id}/download`
- `GET /api/signatures/verify?code=...`
- `GET/PUT/POST /api/signatures/config`
- `POST /api/signatures/webhook/{provider}`

## Soluti

O portal público da Soluti confirma o Bird ID e o Hub de Integrações, mas o contrato da API de assinatura, autenticação, consulta, webhook e sandbox precisa ser fornecido pela Soluti ao integrador. Para finalizar o provider, solicite:

1. credenciais de sandbox e produção;
2. documentação OpenAPI/SDK oficial atual;
3. fluxo OAuth/OTP ou autorização móvel;
4. formato de assinatura PAdES;
5. endpoint oficial de consulta/validação;
6. esquema e assinatura dos webhooks;
7. URLs de callback permitidas.

