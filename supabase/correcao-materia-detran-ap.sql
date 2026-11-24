-- ============================================================================
-- Correção pontual: matéria do Detran-AP (trânsito em Macapá/Amapá) publicada
-- como editoria "política" e creditada "G1 — Brasil"
-- ============================================================================
-- Mesmo tipo de erro corrigido hoje mais cedo (matéria de Macapá), só que
-- dessa vez escapou pela editoria "política" em vez de "boa_vista"/"roraima"
-- (a Trava de Geografia só cobria essas duas antes — corrigido no código,
-- ver pipeline.ts) e o crédito "G1 — Brasil" escapou porque a fonte
-- cadastrada com esse nome não estava marcada como não-creditável no banco
-- (corrigido também em código, não depende mais só dessa marcação).
--
-- Reclassifica pra "brasil_mundo" (fato é de Macapá/AP, não daqui) e remove
-- o crédito ao G1 (vira matéria sem nenhuma linha "Com informações de").
--
-- Rode no SQL Editor do Supabase.
-- ============================================================================

update noticias
set
  editoria = 'brasil_mundo',
  fonte_credito = null
where titulo ilike '%Detran-AP%Maio Amarelo%';
