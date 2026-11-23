-- ============================================================================
-- RADAR BV — Migração: Crédito de Fonte Primária (22/11/2026, a pedido do
-- Valter)
--
-- Problema: o portal cita "Com informações de: G1 — Brasil" (ou Folha, ou
-- qualquer outro veículo concorrente) sempre que uma matéria vem de uma
-- fonte RSS desse veículo — mesmo quando a própria matéria do G1/Folha já
-- cita de onde ELES tiraram a informação (um ministério, a Polícia Federal,
-- uma nota oficial, etc.). Isso faz o Radar BV parecer que só copia o
-- trabalho de outros portais, quando na real toda matéria é redigida do
-- zero por aqui ("Tudo é feito por nós" — Valter).
--
-- Solução em 2 partes:
--   1. (Este arquivo) Marca quais fontes são veículos concorrentes que NÃO
--      devem aparecer no crédito público quando a IA não achar uma fonte
--      primária mais específica dentro do próprio texto. Fontes oficiais,
--      agências de notícia públicas (ex.: Agência Brasil) e fontes "busca"
--      continuam sendo creditadas normalmente — o problema é só com
--      portais comerciais concorrentes.
--   2. (Código, worker/src/ai/prompts.ts + pipeline.ts + queue.ts) A IA
--      agora extrai, dos próprios tópicos apurados, qual foi a fonte
--      primária real da notícia (ex.: "Ministério da Saúde", "Polícia
--      Federal") quando ela estiver explícita no texto — e o Radar BV
--      credita ESSA fonte, não o portal onde a notícia foi lida. Quando
--      nenhuma fonte primária for identificável E a fonte de coleta for um
--      veículo concorrente marcado aqui, o crédito público fica em branco
--      (a matéria não exibe nenhuma linha "Com informações de").
--
-- Seguro rodar mais de uma vez (idempotente).
-- ============================================================================

alter table fontes_monitoradas
  add column if not exists creditar_publicamente boolean not null default true;

comment on column fontes_monitoradas.creditar_publicamente is
  'false = veículo concorrente (ex.: G1, Folha): só aparece no crédito público da matéria se a IA não achar uma fonte primária mais específica no texto. Fontes oficiais/agências continuam true.';

update fontes_monitoradas
set creditar_publicamente = false
where nome in ('G1 — Brasil', 'G1 — Mundo');
