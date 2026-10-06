# Assinaturas digitais no CRA Care

O CRA Care separa a experiência de uso do mecanismo que guarda o certificado. O certificado e a senha nunca podem ser salvos no sistema.

## Situação atual

- **Nuvem / VIDaaS:** fluxo real preparado para o Dr. Sérgio. O médico clica em `Assinar com VIDaaS`, lê o QR Code no app e autoriza a assinatura. A API registra o PDF assinado em PAdES.
- **Demonstração CRA Care:** gera um PDF marcado visivelmente como `ASSINATURA DEMONSTRATIVA — SEM VALIDADE JURÍDICA`. Serve apenas para apresentar o fluxo sem certificado.

## Modelos que serão suportados

| Modelo | Como o médico autoriza | O que é necessário |
| --- | --- | --- |
| Certificado em nuvem | QR Code, push ou app do provedor | Credenciais da API do provedor (VIDaaS, Soluti Bird ID, etc.) |
| A1 | Assinatura pelo conector local, sem enviar o PFX ao CRA Care | Aplicativo/conector homologado instalado no computador do médico |
| A3 | Token ou cartão conectado ao computador, via conector local | Driver do token/cartão e conector homologado no computador do médico |

## Regra de segurança

Um navegador ou servidor não deve receber a senha do token, o arquivo PFX, PIN ou chave privada do médico. Para A1 e A3, o conector local conversa com o certificado no computador do médico; para nuvem, o provedor recebe a autorização diretamente do médico.

## Próximos cadastros necessários

Para cada médico, registrar apenas:

1. O tipo: `nuvem`, `A1` ou `A3`.
2. O provedor (por exemplo, VIDaaS ou Soluti).
3. O CRM e a identificação pública retornada pelo provedor, quando houver.
4. A credencial da integração no Vercel, fornecida pelo provedor — nunca a credencial pessoal do médico.

