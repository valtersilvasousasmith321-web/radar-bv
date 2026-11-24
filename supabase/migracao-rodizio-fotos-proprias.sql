-- ============================================================================
-- Rodízio do banco de fotos próprias (flagrado por Valter em 23/11/2026:
-- "nossas fotos continuam a ser repetidas")
-- ============================================================================
-- O banco de fotos próprias (imagens_fallback, padrao=false) hoje escolhe uma
-- foto aleatória entre as que batem a tag — com poucas fotos cadastradas por
-- tema (3-4 cada), isso faz a mesma foto aparecer de novo cedo, sem
-- distribuir o uso. Esta coluna guarda a última vez que cada foto foi usada,
-- pro código (worker/src/images.ts) priorizar sempre a foto NÃO usada
-- recentemente, em vez de sortear sem memória — reduz repetição imediata
-- mesmo com poucas fotos cadastradas (o fundo do problema continua sendo
-- "temos poucas fotos próprias" — rodízio ajuda a espalhar o uso, mas o
-- banco crescer com mais fotos reais é o que resolve de verdade).
--
-- Rode no SQL Editor do Supabase.
-- ============================================================================

alter table imagens_fallback add column if not exists ultima_vez_usada timestamptz;

create index if not exists idx_imagens_fallback_ultima_vez_usada on imagens_fallback (ultima_vez_usada);
