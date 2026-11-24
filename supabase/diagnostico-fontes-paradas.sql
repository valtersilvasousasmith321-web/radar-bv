-- Mostra, pra CADA fonte ativa, quantas notícias ela produziu nos últimos 14
-- dias. Fontes com "ativa = true", "erros_consecutivos = 0" (aparentam
-- saudáveis) mas "total_14_dias = 0" são exatamente o padrão que deixou o
-- Serviço ao Cidadão invisível por semanas sem nenhum alarme disparar —
-- essa consulta acha TODAS as fontes nessa situação de uma vez, não só as
-- 3 suspeitas (IBGE, Banco Central/Receita, Portal da Transparência).
select
  f.nome,
  f.tipo,
  f.editoria_padrao,
  f.ativa,
  f.erros_consecutivos,
  f.ultima_verificacao,
  count(n.id) filter (where n.criado_em >= now() - interval '14 days') as total_14_dias,
  max(n.criado_em) as ultima_noticia_criada
from fontes_monitoradas f
left join noticias n on n.fonte_id = f.id
where f.ativa = true
group by f.id, f.nome, f.tipo, f.editoria_padrao, f.ativa, f.erros_consecutivos, f.ultima_verificacao
order by total_14_dias asc, f.nome;
