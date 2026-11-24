-- ============================================================================
-- Crédito da foto no banco de fotos + baixador de imagem por URL
-- ============================================================================
-- Pedido do Valter: poder importar uma foto pública de divulgação (ex: do
-- SESC, de uma prefeitura, de qualquer órgão público) colando o link da
-- imagem, em vez de precisar baixar no computador e depois subir de novo.
--
-- Junto com isso, o banco de fotos passa a guardar o crédito da foto (ex:
-- "Foto: Divulgação/SESC-RR") junto com a imagem — assim, toda vez que essa
-- mesma foto for usada numa notícia, o crédito certo já vem preenchido
-- sozinho, sem precisar digitar de novo toda vez.
-- ============================================================================

alter table banco_fotos add column if not exists credito text;
