-- ============================================================================
-- RADAR BV — Migração: Cobertura Brasil/Mundo (item 6 do Plano da Redação de IA)
--
-- "Hoje só sai notícia local; precisa de fontes nacionais/internacionais
-- monitoradas, do jeito que outros portais locais fazem." A editoria
-- "brasil_mundo" já existia desde o início — só faltava alguma fonte
-- alimentando ela. Aqui também é só SQL, zero código novo: 3 feeds RSS
-- reais e confiáveis (verificados antes de cadastrar), do mesmo tipo "rss"
-- que o coletor já sabe ler desde a Fase 1.
--
-- Seguro rodar mais de uma vez (idempotente).
-- ============================================================================

insert into fontes_monitoradas (nome, url_base, tipo, editoria_padrao, confiabilidade)
select v.nome, v.url, 'rss', 'brasil_mundo'::editoria, 7
from (
  values
    ('G1 — Brasil', 'https://g1.globo.com/rss/g1/brasil/'),
    ('G1 — Mundo', 'https://g1.globo.com/rss/g1/mundo/'),
    ('Agência Brasil — Últimas notícias', 'https://agenciabrasil.ebc.com.br/feed/ultimasnoticias/feed.xml')
) as v(nome, url)
where not exists (
  select 1 from fontes_monitoradas f where f.nome = v.nome
);
