-- Migração: novas fotos reais de Boa Vista/Roraima enviadas pelo Valter pro
-- Banco de Imagens Próprias (mesmo esquema da migracao-banco-imagens-proprio.sql
-- original — arquivos publicados em apps/web/public/img/fallback/, servidos
-- pelo próprio domínio radarbv.com.br).
--
-- Cobre: Cidade da Polícia Civil, Polícia Federal, Bosque dos Papagaios,
-- Femarh, Hospital da Criança Santo Antônio, Maternidade/Hospital Materno
-- Infantil, Iteraima, Emhur, e movimento de comércio/rua em Boa Vista.
--
-- Rode isto inteiro de uma vez só no SQL Editor do Supabase (não precisa de
-- 2 blocos — não cria ENUM novo, só insere linhas numa tabela que já existe).

insert into imagens_fallback (editoria, url, descricao, padrao, tags)
values
  ('policia', 'https://radarbv.com.br/img/fallback/policia-civil-1.jpg', 'Cidade da Polícia Civil, Boa Vista', false, array['policia civil','cidade da policia civil','sede da policia civil','seguranca','civil police','police station']),
  ('policia', 'https://radarbv.com.br/img/fallback/policia-federal-1.jpg', 'Sede da Polícia Federal em Boa Vista', false, array['policia federal','pf','seguranca federal','delegacia da policia federal','federal police','federal police station']),
  ('boa_vista', 'https://radarbv.com.br/img/fallback/bosque-papagaios-1.jpg', 'Bosque dos Papagaios, Boa Vista', false, array['bosque dos papagaios','parque','lazer','prefeitura de boa vista','city park','leisure park']),
  ('boa_vista', 'https://radarbv.com.br/img/fallback/bosque-papagaios-2.jpg', 'Bosque dos Papagaios, Boa Vista', false, array['bosque dos papagaios','parque','lazer','prefeitura de boa vista','city park','leisure park']),
  ('politica', 'https://radarbv.com.br/img/fallback/femarh-1.jpg', 'Sede da Femarh (Fundação Estadual do Meio Ambiente e Recursos Hídricos)', false, array['femarh','fundacao estadual do meio ambiente','meio ambiente','predio publico','governo do estado','environmental agency','government building']),
  ('politica', 'https://radarbv.com.br/img/fallback/femarh-2.jpg', 'Sede da Femarh (Fundação Estadual do Meio Ambiente e Recursos Hídricos)', false, array['femarh','fundacao estadual do meio ambiente','meio ambiente','predio publico','governo do estado','environmental agency','government building']),
  ('saude', 'https://radarbv.com.br/img/fallback/hospital-crianca-1.jpg', 'Hospital da Criança Santo Antônio, Boa Vista', false, array['hospital da crianca','hospital santo antonio','saude','hospital infantil','children hospital','pediatric hospital']),
  ('saude', 'https://radarbv.com.br/img/fallback/hospital-crianca-2.jpg', 'Hospital da Criança Santo Antônio, Boa Vista', false, array['hospital da crianca','hospital santo antonio','saude','hospital infantil','children hospital','pediatric hospital']),
  ('saude', 'https://radarbv.com.br/img/fallback/maternidade-1.jpg', 'Maternidade/Hospital Materno Infantil, Boa Vista', false, array['maternidade','hospital materno infantil','saude materno infantil','maternity hospital','obstetrics hospital']),
  ('roraima', 'https://radarbv.com.br/img/fallback/iteraima-1.jpg', 'Sede do Iteraima (Instituto de Terras e Colonização de Roraima)', false, array['iteraima','instituto de terras de roraima','regularizacao fundiaria','terras','land institute','land regularization']),
  ('saude', 'https://radarbv.com.br/img/fallback/hospital-materno-infantil-1.jpg', 'Hospital Materno Infantil, Urgência/Emergência, Governo de Roraima', false, array['hospital materno infantil','urgencia','emergencia','governo de roraima','saude','emergency hospital','maternal child hospital']),
  ('politica', 'https://radarbv.com.br/img/fallback/emhur-1.jpg', 'Sede da Emhur (Empresa de Desenvolvimento Urbano e Habitacional), Prefeitura de Boa Vista', false, array['emhur','empresa de desenvolvimento urbano e habitacional','habitacao','prefeitura de boa vista','urban housing agency','municipal building']),
  ('boa_vista', 'https://radarbv.com.br/img/fallback/comercio-rua-1.jpg', 'Movimento de comércio e trânsito em rua de Boa Vista', false, array['comercio','movimento de rua','centro comercial','natal','transito','boa vista commerce','street commerce','shopping street']),
  ('boa_vista', 'https://radarbv.com.br/img/fallback/comercio-rua-2.jpg', 'Movimento de comércio em rua de Boa Vista', false, array['comercio','movimento de rua','centro comercial','boa vista commerce','street commerce','shopping street'])
on conflict do nothing;
