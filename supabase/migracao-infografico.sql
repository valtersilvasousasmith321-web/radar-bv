-- Migração: adiciona a coluna "infografico" à tabela noticias (item 18 do
-- plano — Infografia/visualização de dados). Guarda o gráfico de
-- barra/linha ou a linha do tempo que o Infografista extraiu da matéria,
-- quando ela tem dado numérico comparável ou sequência de eventos datados
-- (a maioria das matérias não tem, e fica null nesse caso — normal).
--
-- Rode direto no SQL Editor do Supabase, numa única execução (ao contrário
-- da migração de editorias, esta não mexe em nenhum ENUM, só adiciona uma
-- coluna nova — pode rodar tudo de uma vez).

alter table noticias add column if not exists infografico jsonb;
