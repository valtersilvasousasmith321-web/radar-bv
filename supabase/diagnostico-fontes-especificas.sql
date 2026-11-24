-- Consulta focada só nas fontes que eu preciso confirmar agora, sem
-- precisar rolar pelas 59 linhas da tabela inteira.
select
  nome,
  tipo,
  editoria_padrao,
  ativa,
  limite_diario,
  erros_consecutivos,
  ultimo_erro,
  ultima_verificacao,
  criado_em
from fontes_monitoradas
where
  nome ilike '%folha%'
  or nome ilike '%roraima em foco%'
  or nome ilike '%prefeitura de boa vista%'
  or nome ilike '%pol%cia civil%'
  or nome ilike '%sesau%'
  or nome ilike '%defensoria%'
order by nome;
