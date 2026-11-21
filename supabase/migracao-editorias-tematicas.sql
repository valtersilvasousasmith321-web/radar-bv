-- Migração: adiciona três novas editorias temáticas ao banco já existente —
-- Saúde, Educação e Cultura — completando o conjunto de editorias por
-- assunto do item 17 do plano da redação de IA (que já cobria Boa Vista,
-- Roraima, polícia, política, economia, esportes e Brasil/mundo). A IA já
-- sai pesquisando esses temas sozinha a cada ciclo, usando o mesmo mecanismo
-- de busca que já existe (pesquisador.ts + coletarBusca).
--
-- IMPORTANTE: rode em DUAS ETAPAS SEPARADAS no SQL Editor do Supabase
-- (selecione o bloco 1, clique em Run; depois selecione o bloco 2, clique em
-- Run de novo). Isso é exigência do próprio Postgres: um valor novo de ENUM
-- (ALTER TYPE ... ADD VALUE) só pode ser usado depois que esse comando já
-- foi confirmado — não dá pra usar os valores novos no mesmo INSERT que os
-- criou, senão o Postgres recusa com erro.

-- ========== BLOCO 1 — rode isto primeiro ==========
alter type editoria add value if not exists 'saude';
alter type editoria add value if not exists 'educacao';
alter type editoria add value if not exists 'cultura';

-- ========== BLOCO 2 — rode isto DEPOIS do bloco 1 (numa segunda execução) ==========
insert into fontes_monitoradas (nome, url_base, tipo, editoria_padrao)
values
  ('Busca: Saúde', 'saúde em Roraima e Boa Vista', 'busca', 'saude'),
  ('Busca: Educação', 'educação em Roraima e Boa Vista', 'busca', 'educacao'),
  ('Busca: Cultura', 'cultura em Roraima e Boa Vista', 'busca', 'cultura')
on conflict do nothing;
