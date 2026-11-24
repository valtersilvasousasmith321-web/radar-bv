-- ============================================================================
-- NOVAS FONTES: saúde pública e fiscalização (Defensoria Pública)
-- ============================================================================
-- Pedido do Valter (23/11/2026): o Radar BV está perdendo o tipo de pauta
-- que jornal tradicional cobre todo dia — fiscalização de serviço público e
-- saúde ("falta de médico", "suspensão de cirurgia", "fila de espera").
-- Hoje o sistema não tem NENHUMA fonte dedicada a isso: a Sesau (Secretaria
-- de Saúde de Roraima) e a Defensoria Pública do Estado (DPE-RR) só
-- aparecem quando por acaso saem em alguma busca genérica de política.
--
-- PESQUISEI antes de cadastrar (nada no chute):
-- - Sesau e DPE-RR têm assessoria de imprensa (Ascom) que divulga nota
--   oficial com frequência, mas eu NÃO achei uma página de listagem de
--   notícias própria e confiável de nenhuma das duas (diferente da
--   Prefeitura/Governo/Câmara, que têm RSS confirmado). Por isso, igual já
--   foi feito pra PMRR/Bombeiros/TJRR, uso tipo 'busca' (a IA pesquisa o
--   tema a cada ciclo) em vez de arriscar uma URL de HTML que pode nem
--   existir ou mudar sem avisar.
-- - Isso cobre tanto nota oficial (Ascom) quanto reportagem de fiscalização
--   (ex.: apuração da Defensoria sobre fila de cirurgia) que cita as duas.
--
-- Sem limite_diario de propósito: o problema sinalizado agora é POUCA
-- notícia, não excesso — diferente do ajuste de 22/11 que colocou teto
-- de 2/dia nas 8 fontes de busca por excesso de volume represado.
-- ============================================================================

insert into fontes_monitoradas (nome, url_base, tipo, editoria_padrao)
values
  ('Busca: Secretaria de Saúde de Roraima (Sesau) e HGR', 'notícias sobre a Secretaria de Saúde de Roraima (Sesau), Hospital Geral de Roraima (HGR) e rede pública de saúde em Boa Vista', 'busca', 'saude'),
  ('Busca: Defensoria Pública de Roraima (DPE-RR)', 'notícias e ações da Defensoria Pública do Estado de Roraima (DPE-RR), incluindo fiscalização de serviços públicos em Boa Vista', 'busca', 'servico_cidadao')
on conflict do nothing;
