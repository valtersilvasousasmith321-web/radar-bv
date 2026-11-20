-- Migração: adiciona o tipo de fonte "busca" ao banco já existente, e já
-- cadastra os temas de busca prontos de fábrica — as mesmas editorias que o
-- site já usa (Boa Vista, Roraima, polícia, política, economia, esportes,
-- Brasil e mundo). Nada manual pra fazer no painel admin depois disso: a IA
-- já sai pesquisando esses temas sozinha a cada ciclo.
--
-- IMPORTANTE: rode em DUAS ETAPAS SEPARADAS no SQL Editor do Supabase
-- (selecione o bloco 1, clique em Run; depois selecione o bloco 2, clique em
-- Run de novo). Isso é exigência do próprio Postgres: um valor novo de ENUM
-- (ALTER TYPE ... ADD VALUE) só pode ser usado depois que esse comando já
-- foi confirmado — não dá pra usar o valor "busca" no mesmo INSERT que o
-- criou, senão o Postgres recusa com erro.

-- ========== BLOCO 1 — rode isto primeiro ==========
alter type tipo_fonte add value if not exists 'busca';

-- ========== BLOCO 2 — rode isto DEPOIS do bloco 1 (numa segunda execução) ==========
insert into fontes_monitoradas (nome, url_base, tipo, editoria_padrao)
values
  ('Busca: Boa Vista', 'notícias de Boa Vista hoje', 'busca', 'boa_vista'),
  ('Busca: Roraima', 'notícias de Roraima hoje', 'busca', 'roraima'),
  ('Busca: Polícia', 'ocorrências policiais em Boa Vista e Roraima', 'busca', 'policia'),
  ('Busca: Política', 'política em Roraima e Boa Vista', 'busca', 'politica'),
  ('Busca: Economia', 'economia em Roraima e Boa Vista', 'busca', 'economia'),
  ('Busca: Esportes', 'esportes em Roraima e Boa Vista', 'busca', 'esportes'),
  ('Busca: Brasil e Mundo', 'principais notícias do Brasil e do mundo hoje', 'busca', 'brasil_mundo')
on conflict do nothing;
