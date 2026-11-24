-- ============================================================================
-- Correção pontual: tira o crédito indevido "G1 — Brasil" da mesma matéria
-- de Macapá já corrigida em correcao-materia-macapa.sql
-- ============================================================================
-- G1 é cadastrado como veículo concorrente não-creditável (fontes_monitoradas
-- .creditar_publicamente = false), mas a IA tinha extraído "G1" como se fosse
-- a fonte PRIMÁRIA do fato (porque o texto apurado citava "segundo o G1"),
-- o que furou essa regra. Já corrigi isso em código (worker/src/ai/
-- pipeline.ts) pras próximas matérias; esta aqui só limpa o crédito que já
-- tinha saído errado nesta matéria específica.
--
-- Rode no SQL Editor do Supabase.
-- ============================================================================

update noticias
set fonte_credito = null
where slug = 'batalha-de-rap-macapa-reune-mcs-e-empreendedores-no-mercado-central-luyx8';
