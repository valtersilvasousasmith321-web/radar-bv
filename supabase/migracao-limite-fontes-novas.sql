-- Equilíbrio de Proporção, parte 2 (22/11/2026): as 8 fontes de busca novas
-- (PMRR/Bombeiros, TJRR, DOM Boa Vista, DOU, INMET, IBGE, Banco Central/
-- Receita Federal, Portal da Transparência) não tinham teto diário — ao
-- lado da ALE-RR (fonte html de verdade, sem teto, igual às outras fontes
-- locais institucionais), elas podiam aumentar bastante o volume diário de
-- itens coletados. Mais volume do que a Fila de Gotejamento consegue
-- escoar em 24h empurra notícia pro dia seguinte, cada vez mais atrasada —
-- exatamente o problema que Valter flagrou (notícia saindo atrasada frente
-- a outros veículos). Mesmo princípio já usado em "Busca: Brasil e Mundo"
-- (teto 5): essas 8 são cobertura suplementar, não o foco local principal,
-- então um teto mais conservador (2/dia cada) é seguro.
update fontes_monitoradas set limite_diario = 2
where nome in (
  'Busca: Polícia Militar e Bombeiros de Roraima',
  'Busca: Tribunal de Justiça de Roraima',
  'Busca: Diário Oficial do Município de Boa Vista',
  'Busca: Diário Oficial da União em Roraima',
  'Busca: Alertas meteorológicos INMET Roraima',
  'Busca: IBGE Roraima',
  'Busca: Banco Central e Receita Federal em Roraima',
  'Busca: Portal da Transparência Roraima'
);
