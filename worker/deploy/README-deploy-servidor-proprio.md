# Deploy do worker no servidor próprio

Este guia cobre as duas formas de rodar o worker na sua máquina de casa: com
Docker (mais isolado, recomendado) ou direto com Node + systemd (mais simples,
sem instalar Docker).

O worker **não recebe nenhuma conexão de fora** — só faz chamadas de saída
(Supabase, Gemini, Claude, Groq, Unsplash/Pexels, webhook do WhatsApp). Isso
quer dizer: nenhuma porta precisa ser aberta no roteador, nenhum IP fixo,
nenhum DNS. Só precisa de internet e energia estáveis — que é exatamente o
que o seu projeto de ATS + solar está resolvendo.

---

## Opção A — Docker (recomendado)

### 1. Instalar o Docker na máquina de casa (uma vez só)

```bash
curl -fsSL https://get.docker.com | sudo sh
sudo usermod -aG docker $USER
# saia e entre de novo na sessão pra o grupo valer
```

### 2. Copiar o worker pra máquina

Do seu computador atual, ou direto puxando do seu repositório Git quando
tiver um:

```bash
scp -r worker/ usuario@ip-do-servidor:/opt/radar-bv/worker
```

### 3. Configurar o `.env`

```bash
cd /opt/radar-bv/worker
cp .env.example .env
nano .env   # cole as chaves reais (Supabase, Gemini, Claude, Groq, WhatsApp)
```

### 4. Buildar e subir

```bash
docker compose up -d --build
```

### 5. Confirmar que está rodando

```bash
docker compose logs -f
```

Você deve ver o worker logando a inicialização do cron (coleta periódica +
resumo diário às 8h). `Ctrl+C` só sai do log, não para o container.

### Dia a dia

```bash
docker compose restart      # reiniciar
docker compose down         # parar
docker compose up -d        # subir de novo
docker compose logs -f      # acompanhar logs
```

Com `restart: unless-stopped` no `docker-compose.yml`, o container volta
sozinho se a máquina reiniciar (ex.: depois de uma queda de luz que o ATS não
pegou a tempo) ou se o processo travar.

---

## Opção B — systemd direto (sem Docker)

### 1. Instalar o Node na máquina (versão 20 ou mais nova)

```bash
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo bash -
sudo apt install -y nodejs
```

### 2. Copiar o worker e instalar dependências

```bash
sudo mkdir -p /opt/radar-bv
sudo cp -r worker /opt/radar-bv/worker
cd /opt/radar-bv/worker
npm ci
npm run build
```

### 3. Criar o usuário dedicado e o `.env`

```bash
sudo useradd -r -s /usr/sbin/nologin radarbv
sudo chown -R radarbv:radarbv /opt/radar-bv
cp .env.example .env   # edite com as chaves reais
```

### 4. Instalar o serviço

```bash
sudo cp deploy/radar-bv-worker.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now radar-bv-worker
```

Confira o caminho do Node na sua máquina com `which node` — se não for
`/usr/bin/node`, ajuste a linha `ExecStart` do arquivo `.service` antes de
instalar.

### 5. Confirmar que está rodando

```bash
sudo systemctl status radar-bv-worker
journalctl -u radar-bv-worker -f
```

Com `Restart=always`, o systemd religa o worker automaticamente se o
processo cair, e `enable` garante que ele sobe sozinho no boot da máquina.

---

## O que foi testado de verdade aqui, e o que falta testar na sua máquina

- ✅ `npm run build` (TypeScript → JS) roda limpo, sem erros.
- ✅ Sintaxe do `docker-compose.yml` validada de verdade (`docker compose config`
  resolve o arquivo e as variáveis de ambiente corretamente).
- ✅ Sintaxe do unit file do systemd validada de verdade (`systemd-analyze
  verify`) — o único aviso foi o caminho do `node`, que varia por máquina (veja
  passo 4 da Opção B).
- ⚠️ **Não consegui rodar o `docker build` completo aqui** porque este
  ambiente de sandbox bloqueia por política o acesso ao Docker Hub
  (`registry-1.docker.io`), então não baixei a imagem `node:20-alpine` pra
  testar a build de ponta a ponta. O Dockerfile usa uma receita padrão
  (multi-stage, `npm ci` + `tsc`) que já é a mesma lógica validada no build
  do projeto — mas vale você rodar `docker compose up -d --build` na sua
  máquina e me avisar se aparecer algum erro, que eu corrijo.
