# Ativar notificações programadas

O envio imediato continua igual. A área da Secretaria só libera **Agendar envio** depois de confirmar que o cron do Supabase está cadastrado e que o segredo da Vercel corresponde ao segredo guardado no Supabase Vault.

## Estado da ativação em produção

- A tabela e as funções de entrega já foram aplicadas no Supabase de produção pela migration `047`.
- As extensões `pg_cron` e `pg_net` já foram habilitadas pela migration `049`.
- `CRON_SECRET` já foi criado como variável sensível de produção na Vercel; os dois valores correspondentes já estão no Supabase Vault. O valor do segredo não é exibido neste documento.
- Falta publicar este código e, depois, executar a migration `048` no SQL Editor do Supabase. Só então o job começará a chamar o endpoint a cada minuto.

## 1. Segredo da Vercel

O segredo de produção já foi criado para este projeto. Não gere outro nem substitua o atual: os valores da Vercel e do Vault precisam continuar iguais.

Para configurar uma cópia em outro ambiente, gere um segredo aleatório no PowerShell (não o envie por mensagem):

```powershell
$rng = [System.Security.Cryptography.RandomNumberGenerator]::Create()
$bytes = New-Object byte[] 32
$rng.GetBytes($bytes)
[Convert]::ToBase64String($bytes).TrimEnd('=').Replace('+','-').Replace('/','_')
$rng.Dispose()
```

Copie o valor gerado para **Vercel → CRA Care → Settings → Environment Variables** como `CRON_SECRET`, no ambiente **Production**. Salve e publique um novo deploy para a variável entrar em vigor. Não coloque esse segredo no código-fonte.

## 2. Banco de dados

Na produção do CRA Care, a tabela e as funções da migration `047` já foram aplicadas. A migration `049` também já habilitou `pg_cron` e `pg_net`. Para configurar outro projeto, aplique `047` e `049` pelo SQL Editor.

## 3. Ative as extensões e guarde os segredos no Vault

Os dois segredos já foram criados no Vault de produção:

| Nome | Valor |
| --- | --- |
| `cra_care_app_url` | `https://cra-care.vercel.app` |
| `cra_care_cron_secret` | O mesmo valor de `CRON_SECRET` salvo na Vercel |

Se a URL principal de produção da Vercel mudar, atualize `cra_care_app_url` para a URL HTTPS de produção.

## 4. Publique e cadastre o cron

Publique o código atualizado. Depois, no SQL Editor do Supabase, execute `supabase/048_scheduled_patient_notifications_cron.sql`. Ele agenda a verificação a cada minuto e pode ser executado novamente sem criar outro job duplicado.

## 5. Confirme no aplicativo

Abra **Secretaria → Notificações aos pacientes** e atualize a página. A opção **Agendar envio** só ficará habilitada quando a tabela, o cron e os dois segredos estiverem configurados. Faça o primeiro envio para um paciente de teste e confirme que ele aparece na lista como **Enviada** e no sino do portal.

Os horários são exibidos no fuso de São Paulo; o disparo pode ocorrer até um minuto depois do horário escolhido. Se o agendamento aparecer desativado, confira Vercel `CRON_SECRET`, os nomes exatos dos segredos no Vault, as extensões habilitadas e o job `cra-care-dispatch-patient-notifications` na tela Cron do Supabase.

O Supabase Cron usa `pg_cron` para executar jobs e `pg_net` para chamar o endpoint HTTP. O plano Free pode pausar projetos com pouca atividade ao longo de uma semana; portanto, ele não garante disponibilidade contínua para uma função operacional da clínica. [Documentação de Cron](https://supabase.com/docs/guides/cron) · [Pausa de projetos Free](https://supabase.com/docs/guides/platform/free-project-pausing).
