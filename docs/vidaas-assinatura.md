# Assinatura ICP-Brasil via VIDaaS

## O que solicitar à Valid

Solicite o cadastro de aplicação para a API VIDaaS, nos ambientes de homologação e produção, com autorização por QR Code. Cadastre estas URLs de retorno:

```text
https://cra-care.vercel.app/api/assinatura/vidaas/retorno
```

Para homologação, a Valid pode exigir uma URL temporária específica; ela deve ser cadastrada também antes do teste.

## Variáveis de ambiente

Cadastre no Vercel, como variáveis secretas de Production e Preview:

```text
VIDAAS_CLIENT_ID=<fornecido-pela-valid>
VIDAAS_CLIENT_SECRET=<fornecido-pela-valid>
VIDAAS_REDIRECT_URI=https://cra-care.vercel.app/api/assinatura/vidaas/retorno
VIDAAS_BASE_URL=https://certificado.vidaas.com.br
VIDAAS_DOCTOR_CRM=20762
```

Para homologação, use a URL base informada pela Valid (normalmente `https://hml-certificado.vidaas.com.br`) e as credenciais exclusivas desse ambiente.

Não cadastre certificado, arquivo PFX, token físico ou senha do médico nas variáveis do projeto. A autorização é feita pelo próprio médico no aplicativo VIDaaS.

## Aplicação do banco

Execute `supabase/026_prescription_digital_signatures.sql` no SQL Editor do Supabase antes do primeiro teste. Ele registra cada tentativa de assinatura, o PDF original, o PDF assinado e possíveis erros — sempre com acesso restrito ao médico responsável.

## Teste do Dr. Sérgio

1. Use o ambiente de homologação e o certificado habilitado pela Valid.
2. Crie uma receita fictícia com o perfil do Dr. Sérgio.
3. Clique em **Assinar com VIDaaS**.
4. Leia o QR Code no aplicativo VIDaaS e autorize o uso do certificado.
5. A janela de retorno confirma o resultado e a receita passa para **Assinada digitalmente**.

O CRA Care nunca recebe a senha ou a chave privada do certificado.
