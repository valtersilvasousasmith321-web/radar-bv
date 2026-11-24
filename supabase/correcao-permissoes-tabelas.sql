-- ============================================================================
-- CORREÇÃO: Permissões de acesso às tabelas (erro "permission denied for table")
-- ============================================================================
-- O QUE ACONTECEU:
-- Várias tabelas (banco_fotos, reclamacoes_ouvidoria, dicas_bairro e possivelmente
-- outras) foram criadas direto no SQL Editor. Quando isso acontece, o Supabase
-- NÃO dá automaticamente a permissão de acesso pro usuário que o site usa pra
-- ler e gravar dados (chamado "service_role"). Resultado: o site via a tabela,
-- mas não tinha autorização pra ler ela, dando "permission denied".
--
-- O QUE ESSE SCRIPT FAZ:
-- 1. Dá a permissão de acesso completo em TODAS as tabelas que já existem hoje
--    (resolve o erro no banco_fotos, reclamacoes_ouvidoria, dicas_bairro, etc.)
-- 2. Configura o banco pra que QUALQUER TABELA NOVA criada no futuro já nasça
--    com essa permissão automaticamente — pra esse erro nunca mais acontecer.
--
-- É seguro rodar mesmo se já tiver rodado outras correções antes.
-- ============================================================================

-- 1) Corrige as tabelas que já existem agora
grant usage on schema public to service_role, authenticated, anon;

grant all on all tables in schema public to service_role;
grant all on all sequences in schema public to service_role;
grant all on all routines in schema public to service_role;

-- 2) Garante que toda tabela/sequência/função NOVA, criada a partir de agora,
--    já nasça com essa permissão automaticamente (evita o problema se repetir)
alter default privileges in schema public
  grant all on tables to service_role;

alter default privileges in schema public
  grant all on sequences to service_role;

alter default privileges in schema public
  grant all on routines to service_role;
