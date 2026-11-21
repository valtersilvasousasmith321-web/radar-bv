-- ============================================================================
-- RADAR BV — Migração: Serviço ao Cidadão (item 5 do Plano da Redação de IA)
-- PARTE 1 de 2 — rode SOZINHA primeiro, clique Run, espere terminar.
--
-- Isso só adiciona um novo valor ao "editoria" (categoria de notícia) que já
-- existe: "servico_cidadao". O Postgres exige que esse tipo de alteração
-- seja confirmada (commitada) ANTES de poder ser usada em outro comando —
-- por isso vem separada da Parte 2, que já usa esse valor novo.
-- ============================================================================

alter type editoria add value if not exists 'servico_cidadao';
