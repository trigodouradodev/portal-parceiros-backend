# Motivo de ausência de previsão de pagamento

## Payloads

No registro de interação de tarefa (`POST /activities/tasks/:taskId/interactions`):

```json
{
  "channel": "call",
  "recipientType": "client",
  "result": "no_forecast",
  "noForecastReason": "job_loss"
}
```

No Follow-up manual estruturado (`POST /follow-up`):

```json
{
  "contractId": "22222222-2222-4222-8222-222222222222",
  "followUpType": "call",
  "party": "client",
  "expectedResult": "no_forecast",
  "noForecastReason": "job_loss"
}
```

O modelo legado também exige o motivo quando o resultado efetivo for Sem
previsão: utiliza-se `expectedResult ?? status`, conforme o CHECK do banco.

## Validação e persistência

- `noForecastReason` é obrigatório para novos registros de Sem previsão.
- Aceita exatamente um dos 25 códigos de `src/common/no-forecast-reason.enum.ts`.
  Esse catálogo espelha a migration `20261110120000_add_no_forecast_reason.ts`
  do `trigo-connector`. O último código é `other` (Outro).
- Valores desconhecidos, vazios, rótulos de apresentação, listas ou objetos
  recebem HTTP 400. Para outro resultado, o motivo deve estar ausente ou nulo.
- A validação do DTO protege o formato; os serviços validam a obrigatoriedade
  e a relação com o resultado, inclusive em chamadas internas.
- Interação e Follow-up são gravados com o mesmo motivo, na mesma transação
  que conclui a tarefa. Falhas são propagadas para rollback da transação.
- Falecimento, fraude e contrato não cedido são somente categorias do resultado
  Sem previsão. Os efeitos atuais de `no_forecast` continuam valendo.
- A classificação não acrescenta obrigatoriedade de observação, inclusive em
  Outro; as regras já existentes de observações são preservadas.

Os serviços usam os códigos de erro:

| Código | Situação |
| --- | --- |
| `no_forecast_reason_required` | Sem previsão sem motivo |
| `no_forecast_reason_invalid` | Código de motivo desconhecido ou inválido |
| `no_forecast_reason_not_allowed` | Motivo informado com outro resultado |

Erros de formato também podem ser retornados pelo ValidationPipe no formato
padrão da aplicação, antes de chegar ao serviço.

## Consultas

O campo camelCase `noForecastReason` está disponível:

- Na interação devolvida após o registro da tarefa.
- Na interação do histórico de tarefas do detalhe da parcela.
- Na última interação dos cards da fila.
- Nos itens de histórico de Follow-up do detalhe da carteira.

O endpoint de criação de Follow-up mantém seu retorno atual em snake_case,
incluindo `no_forecast_reason` no registro retornado pelo Prisma.

Histórico com motivo nulo continua válido; os históricos camelCase omitem o
campo no JSON. As observações permanecem em seus campos atuais.

## Rollout

Executar a migration do `trigo-connector` antes deste backend. A migration
permite nulos para preservar o histórico e suportar os produtores anteriores.
Coordenar a publicação dos formulários com a obrigatoriedade no backend: os
frontends anteriores não enviam o motivo. Não há backfill ou transição de dados
para esta classificação.
