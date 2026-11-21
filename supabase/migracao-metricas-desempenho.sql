-- ============================================================================
-- Item 15 do plano — Analista de Desempenho/Estratégia
--
-- A tabela `noticias` já tinha a coluna `visualizacoes` e `banners_publicidade`
-- já tinha `visualizacoes`/`cliques`, mas NADA no site incrementava esses
-- números na prática (ficavam sempre em 0) — ou seja, não existia estatística
-- real nenhuma pra um "Analista de Desempenho" analisar. Essas duas funções
-- são o que o site chama (via service_role, nas novas rotas de API) toda vez
-- que uma notícia é vista ou um banner é visto/clicado.
--
-- Funções em vez de update direto porque update direto de "coluna = coluna + 1"
-- direto do supabase-js não é atômico sem um RPC — com muita gente acessando
-- ao mesmo tempo, duas requisições lendo o mesmo valor e escrevendo de volta
-- perderiam incrementos. Dentro da função, o próprio Postgres garante que
-- "visualizacoes = visualizacoes + 1" é atômico.
-- ============================================================================

create or replace function incrementar_visualizacao_noticia(p_id uuid)
returns void
language sql
as $$
  update noticias set visualizacoes = visualizacoes + 1 where id = p_id;
$$;

create or replace function incrementar_metrica_banner(p_id uuid, p_campo text)
returns void
language plpgsql
as $$
begin
  if p_campo = 'visualizacoes' then
    update banners_publicidade set visualizacoes = visualizacoes + 1 where id = p_id;
  elsif p_campo = 'cliques' then
    update banners_publicidade set cliques = cliques + 1 where id = p_id;
  end if;
end;
$$;
