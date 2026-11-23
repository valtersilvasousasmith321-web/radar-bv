-- Novas fontes primárias, parte do plano de reduzir a dependência de
-- reescrever outros portais e passar a apurar direto de fontes oficiais.
--
-- Pesquisei antes de adicionar cada uma. Resultado:
--
-- - Assembleia Legislativa de Roraima (ALE-RR): tem página de notícias
--   real e navegável (al.rr.leg.br/noticias/), sem RSS -> entra como
--   fonte "html" de verdade, igual à Câmara e à Prefeitura.
-- - Polícia Militar (PMRR) e Corpo de Bombeiros (CBMRR) de Roraima: não
--   encontrei página oficial de notícias própria de nenhum dos dois —
--   a cobertura que existe sobre eles é sempre via outros portais
--   (FolhaBV etc.), não um site oficial com seção de notícias.
-- - Tribunal de Justiça de Roraima (TJRR): o site existe e está ativo,
--   mas não achei uma seção de notícias/assessoria de imprensa própria
--   com URL confiável para configurar como "html".
-- - Diário Oficial do Município de Boa Vista (DOM): confirmei o padrão
--   de URL das edições (publicacoes.boavista.rr.gov.br/ler/diario/N),
--   mas não achei a página de listagem/índice pra usar como fonte
--   "html" (que precisa de uma página com links pra cada edição).
--
-- Pra essas 4 (PMRR, CBMRR, TJRR, DOM) e pros órgãos de dados abertos
-- (DOU, INMET, IBGE, Banco Central, Receita Federal, Portal da
-- Transparência), em vez de arriscar configurar uma URL que pode quebrar
-- ou nem existir, usei o tipo "busca" (a IA pesquisa o tema sozinha a
-- cada ciclo, igual já faz pra Política/Economia/etc.) — é o jeito
-- seguro de cobrir essas fontes sem risco de um coletor "html" apontando
-- pra lugar nenhum. Isso não é a mesma coisa que ler a API/site oficial
-- direto (principalmente faria diferença pros alertas do INMET, que são
-- estruturados e urgentes) — se quiser aquele nível pra algum desses,
-- é um projeto de código novo, não só uma fonte nova.
insert into fontes_monitoradas (nome, url_base, tipo, editoria_padrao)
values
  ('Assembleia Legislativa de Roraima (ALE-RR)', 'https://al.rr.leg.br/noticias/', 'html', 'politica'),
  ('Busca: Polícia Militar e Bombeiros de Roraima', 'notas oficiais da Polícia Militar de Roraima e do Corpo de Bombeiros Militar de Roraima', 'busca', 'policia'),
  ('Busca: Tribunal de Justiça de Roraima', 'notícias e decisões do Tribunal de Justiça de Roraima (TJRR)', 'busca', 'politica'),
  ('Busca: Diário Oficial do Município de Boa Vista', 'atos e publicações do Diário Oficial do Município de Boa Vista', 'busca', 'politica'),
  ('Busca: Diário Oficial da União em Roraima', 'atos do Diário Oficial da União sobre Roraima e Boa Vista', 'busca', 'politica'),
  ('Busca: Alertas meteorológicos INMET Roraima', 'alerta meteorológico do INMET para Roraima e Boa Vista hoje', 'busca', 'roraima'),
  ('Busca: IBGE Roraima', 'dados do IBGE sobre Roraima e Boa Vista', 'busca', 'roraima'),
  ('Busca: Banco Central e Receita Federal em Roraima', 'Banco Central e Receita Federal: economia e tributos em Roraima', 'busca', 'economia'),
  ('Busca: Portal da Transparência Roraima', 'Portal da Transparência: gastos públicos em Roraima e Boa Vista', 'busca', 'politica')
on conflict do nothing;
