-- ============================================================================
-- RADAR BV — Migração: tipo de fonte "pdf" (Portal da Transparência da Prefeitura)
-- PARTE 1 de 2 — rode SOZINHA primeiro, clique Run, espere terminar.
--
-- Valter pediu o Portal da Transparência da Prefeitura de Boa Vista como
-- fonte, e notou corretamente que lá o conteúdo (editais, atas de
-- licitação) é só PDF pra baixar — não tem página de notícia pra ler
-- direto. Isso é capacidade NOVA no coletor (código também mudou, não é só
-- SQL desta vez): ele agora sabe abrir uma página de listagem de
-- documentos, baixar cada PDF e extrair o texto de dentro.
--
-- Essa Parte 1 só adiciona 'pdf' como valor novo do tipo "tipo_fonte" — o
-- Postgres exige que isso seja confirmado ANTES de poder ser usado em
-- outro comando (mesmo motivo da Parte 1/2 de servico_cidadao).
-- ============================================================================

alter type tipo_fonte add value if not exists 'pdf';
