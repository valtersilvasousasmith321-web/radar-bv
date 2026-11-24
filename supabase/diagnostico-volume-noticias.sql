-- ============================================================================
-- DIAGNÓSTICO: por que estamos trazendo pouca notícia?
--
-- Antes de adicionar mais fontes "no chute", preciso ver 2 coisas reais:
--
-- 1) Se as fontes "Folha de Boa Vista" e "Roraima em Foco" (adicionadas
--    antes) estão realmente ativas e coletando, ou se travaram.
-- 2) Quantas matérias o sistema está REDIGINDO mas nunca publicando —
--    porque caíram como "rascunho" (reprovadas pelo Revisor, Verificador
--    de Fatos ou Jurídico) e ninguém olhou essa fila.
--
-- Rode as duas consultas abaixo SEPARADAMENTE (uma de cada vez) no SQL
-- Editor do Supabase e me manda um print do resultado de cada uma.
-- ============================================================================

-- CONSULTA 1: saúde das fontes de imprensa local + visão geral de todas as fontes
select
  nome,
  tipo,
  editoria_padrao,
  ativa,
  limite_diario,
  erros_consecutivos,
  ultimo_erro,
  ultima_verificacao
from fontes_monitoradas
order by ativa asc, erros_consecutivos desc, nome;
