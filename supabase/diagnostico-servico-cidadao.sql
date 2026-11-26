-- Diagnóstico: por que a editoria "Serviço ao Cidadão" nunca publicou nada
-- (flagrado por Valter em 26/11/2026: "o do cidadão nunca saiu").
--
-- Duas perguntas pra responder:
-- 1) Existe alguma FONTE cadastrada apontando pra essa editoria?
-- 2) Alguma notícia (de qualquer status, até rascunho/erro) já tentou sair
--    como "servico_cidadao", ou é zero desde sempre?

-- 1) Fontes que alimentam (ou deveriam alimentar) essa editoria
select
  nome,
  tipo,
  url_base,
  editoria_padrao,
  ativa,
  limite_diario,
  erros_consecutivos,
  ultimo_erro,
  ultima_verificacao
from fontes_monitoradas
where editoria_padrao = 'servico_cidadao'
order by nome;

-- 2) Quantas notícias (em QUALQUER status) já saíram como "servico_cidadao"
select
  status,
  count(*) as quantidade
from noticias
where editoria = 'servico_cidadao'
group by status;

-- 3) Se a pergunta 2 vier zerada, olhar se ALGUMA fonte de busca com tema
-- "serviço ao cidadão" existe mas nunca produziu nada publicável (pode ser
-- fonte cadastrada mas sempre com erro, ou tema de busca mal definido)
select
  nome,
  tipo,
  url_base,
  ativa,
  erros_consecutivos,
  ultimo_erro,
  ultima_verificacao,
  criado_em
from fontes_monitoradas
where
  nome ilike '%cidad%'
  or url_base ilike '%cidad%'
  or url_base ilike '%servi%'
order by nome;
