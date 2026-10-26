# Módulo de Assinatura Digital do CRA Care

## Fluxo principal

`Receita → autorização do médico → assinatura no provedor → validação ICP-Brasil → armazenamento privado → histórico e consulta por QR Code`.

O médico usa **Assinatura Digital** para conectar o VIDaaS uma vez e assinar cada receita pelo botão **Assinar** enquanto a sessão estiver válida. A secretária pode solicitar e acompanhar; somente o médico signatário autoriza. O administrador consulta auditoria e configura os provedores. Todos os acessos são segregados por clínica.

## Provedores

| Provider | Estado | Observação |
| --- | --- | --- |
| Certillion via VIDaaS | Ativo para novas assinaturas A3 em nuvem | Usa as credenciais da aplicação Certillion e PSC `VIDAAS`; autorização `signature_session` permite várias assinaturas durante a validade concedida. |
| VIDaaS direto | Adaptador legado preservado | Não é o fluxo oferecido na tela principal; a integração em uso passa pela API Certillion. |
| Soluti Bird ID | Interface preparada | A API completa exige credenciamento e documentação oficial da Soluti. |
| A1 | Desativado para novas assinaturas | O CRA Care não recebe PFX nem senha. |
| A3 local | Não configurado | `CERTILLION_SIGNER` exige assinador e certificado local; não é o fluxo atual. |
| Cloud genérico | Interface preparada | Requer API oficial do provedor escolhido. |

A documentação operacional e as variáveis do fluxo atual estão em [certillion-a3.md](certillion-a3.md). O CRA Care não armazena PIN, PFX ou chave privada do médico.

## Banco e armazenamento

- `digital_signatures`: estado e evidências da assinatura.
- `signature_audit_logs`: trilha imutável de eventos funcionais.
- `signature_webhook_events`: deduplicação idempotente dos webhooks.
- `signature_provider_configs`: configuração não sensível e nomes das variáveis de ambiente.
- `signature_document_rules`: quais documentos exigem assinatura.
- Bucket privado `digital-signatures`: PDF original preparado e PDF final assinado.

## Segurança

- APIs autenticadas usam token de sessão e verificam clínica/perfil no servidor.
- O documento é conferido por SHA-256 antes de iniciar a assinatura.
- Tokens OAuth, PKCE e segredos permanecem protegidos no servidor ou em cookie HttpOnly cifrado.
- O webhook nunca marca um documento como assinado sozinho: o provedor precisa confirmar e o PDF precisa ser validado.
- O QR Code aponta para `/validar-documento/{codigo}` e não expõe CPF ou dados clínicos.
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
