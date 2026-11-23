-- ----------------------------------------------------------------------------
-- Mais 2 elos gratuitos na bancada de IA (22/11/2026, a pedido do Valter):
-- Mistral e Cohere, entrando no FIM da cascata (depois de Gemini, Claude,
-- Groq e OpenRouter). Isso amplia o enum origem_ia — sem rodar isto, o
-- worker vai dar erro ao tentar gravar uma matéria redigida pelo Mistral ou
-- pela Cohere (o Postgres rejeita qualquer valor fora do enum existente).
-- ----------------------------------------------------------------------------

alter type origem_ia add value if not exists 'mistral';
alter type origem_ia add value if not exists 'cohere';
