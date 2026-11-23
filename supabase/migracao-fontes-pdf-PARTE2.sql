-- ============================================================================
-- RADAR BV — Migração: tipo de fonte "pdf" (Portal da Transparência da Prefeitura)
-- PARTE 2 de 2 — só rode depois que a Parte 1 já tiver rodado com sucesso.
--
-- Confirmei que o portal existe e que a página de licitações é real:
-- http://transparencia.boavista.rr.gov.br/licitacoes — ela lista editais
-- e avisos de licitação com link pra baixar o PDF de cada um (documentos
-- citados nos próprios editais do site, em
-- transparencia.boavista.rr.gov.br/arquivos/download/...).
--
-- Editoria 'politica': é o mesmo critério já usado pra "Portal da
-- Transparência Roraima" (estadual, busca por IA) — assuntos de gasto
-- público/licitação entram em política, não em economia ou cidade.
--
-- Seguro rodar mais de uma vez (idempotente).
-- ============================================================================

insert into fontes_monitoradas (nome, url_base, tipo, editoria_padrao, confiabilidade)
select 'Portal da Transparência — Prefeitura de Boa Vista (Licitações)', 'http://transparencia.boavista.rr.gov.br/licitacoes', 'pdf'::tipo_fonte, 'politica'::editoria, 7
where not exists (
  select 1 from fontes_monitoradas where nome = 'Portal da Transparência — Prefeitura de Boa Vista (Licitações)'
);
