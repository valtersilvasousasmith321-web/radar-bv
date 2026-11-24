-- CONSULTA 2: quantas matérias viraram "rascunho" (reprovadas, nunca publicadas)
-- nos últimos 7 dias, e quantas foram publicadas de fato — por dia.
select
  date(criado_em) as dia,
  status,
  count(*) as quantidade
from noticias
where criado_em >= now() - interval '7 days'
group by date(criado_em), status
order by dia desc, status;
