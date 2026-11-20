-- Migração: adiciona o tipo de fonte "busca" ao banco já existente.
-- Rode isso UMA VEZ no SQL Editor do Supabase (banco que já está no ar).
-- Depois disso, dá pra cadastrar fontes do tipo "Busca (tema)" no painel
-- admin (/admin/fontes) normalmente.
--
-- Por que precisa disso: "tipo_fonte" é um ENUM do Postgres, criado só com
-- ('rss', 'html', 'api') quando o banco foi montado. Adicionar um valor novo
-- a um ENUM que já existe não é feito automaticamente reaplicando o
-- schema.sql — precisa desse ALTER TYPE específico.

alter type tipo_fonte add value if not exists 'busca';
