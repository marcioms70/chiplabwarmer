# Chip Lab Warmer

Painel de laboratório para registrar e disparar conversas de teste entre números que pertencem a você. Por padrão, ele apenas simula e registra as mensagens.

## Proteções

- Painel e API exigem `ADMIN_TOKEN`.
- Dois participantes distintos e aprovados manualmente são necessários.
- Envio externo começa desligado (`ENABLE_DELIVERY=false`).
- Histórico local persistente.

## Deploy no Coolify

1. Crie um recurso **Docker Compose** apontando para este repositório.
2. Crie as variáveis de `.env.example` em **Environment Variables**, com `ADMIN_TOKEN` forte.
3. Adicione volume persistente para `/app/data`.
4. Faça o deploy e associe domínio HTTPS.
5. Teste em modo simulação com dois números próprios.
6. Após validar a Evolution, defina `ENABLE_DELIVERY=true` e faça novo deploy.

A integração Evolution usa `POST /message/sendText/{instance}` com `apikey`. Confirme se o endpoint da sua instalação é o mesmo antes da ativação.
