-- Correção pontual: matéria do jacaré resgatado no campus do IFAP em
-- Macapá (Amapá) saiu publicada como editoria "policia" (deveria ser
-- "brasil_mundo" — mesmo bug de geografia, agora com a 2ª trava aplicada
-- no código pra não repetir).
update noticias
set
  editoria = 'brasil_mundo',
  fonte_credito = null
where titulo ilike '%jacaré%' and titulo ilike '%IFAP%';
