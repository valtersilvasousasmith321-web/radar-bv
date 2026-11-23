-- Curadoria Multi-Fonte (proposta de Valter, 22/11/2026, parte 2): quando o
-- Agrupador de Pauta do worker detecta que 2+ fontes diferentes, no mesmo
-- ciclo, cobrem o MESMO fato, a matéria final passa a cruzar os tópicos de
-- todas elas (em vez de usar só 1 e descartar as outras). Essa coluna guarda
-- a lista completa de fontes cruzadas, pra auditoria/transparência — null
-- continua significando "matéria de fonte única", igual sempre foi.
alter table noticias add column if not exists fontes_cruzadas jsonb;
