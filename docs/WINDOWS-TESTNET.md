# Internal testnet на Windows (ноутбук)

**Это не mainnet.** Этот гайд поднимает **локальный internal testnet** People’s Blockchain: две ноды + explorer через Docker Compose (как после PR #13). Исходники в **публичном** репозитории `people-blockchain/people` — секреты не коммитить, mainnet не деплоить.

Ноутбук — **оператор локальных нод**, а не «вся сеть» и не mainnet. Faucet работает **только на node-1**.

Нужно: публичный GitHub-репозиторий `people-blockchain/people` (отдельный доступ не требуется — `git clone` работает без приглашения) и несколько гигабайт RAM (Docker Desktop + две ноды + web; 4–8 ГБ для Docker спокойнее, чем дефолтные 2 ГБ).

---

## 1. Docker Desktop и WSL2

1. Включите в Windows функцию **Virtual Machine Platform** (если мастер Docker попросит).
2. Установите [Docker Desktop for Windows](https://docs.docker.com/desktop/setup/install/windows-install/) с бэкендом **WSL2**.
3. Дождитесь зелёного статуса Docker. Перезагрузка после установки WSL2 — нормально.

Поставьте также [Git for Windows](https://git-scm.com/download/win), если ещё нет `git`.

## 2. Клон репозитория

В PowerShell (для публичного репозитория отдельный вход в GitHub не обязателен):

```powershell
git clone https://github.com/people-blockchain/people.git
cd people\people-node
```

Дальше все команды — из каталога `people-node`. Compose-файл: `docker-compose.yml` (не `docker-compose.prod.yml`).

## 3. Локальный `.env` (ключ не в git)

```powershell
copy .env.example .env
```

В `.env` уже должно быть `CHAIN_ID=people-internal-testnet`. Заполните **только локально** `DEV_FAUCET_PRIVATE_KEY` 64 hex-символами (32 байта). Файл `.env` в gitignore — **не коммитьте** его.

Сгенерировать ключ и записать в `.env` без копирования «боевого» ключа в чат и в этот документ (PowerShell):

```powershell
$rng = [System.Security.Cryptography.RandomNumberGenerator]::Create()
$bytes = New-Object byte[] 32
$rng.GetBytes($bytes)
$hex = [System.BitConverter]::ToString($bytes).Replace('-','').ToLower()
(Get-Content .env -Raw) -replace 'DEV_FAUCET_PRIVATE_KEY=.*', "DEV_FAUCET_PRIVATE_KEY=$hex" | Set-Content .env -NoNewline
Remove-Variable hex, bytes, rng
```

Ключ только для **internal testnet**. Не используйте его как production custody. В документации нет и не должно быть настоящего ключа.

## 4. Запуск и проверка

Первая сборка образов долгая.

```powershell
docker compose --env-file .env up --build -d
```

В браузере:

- explorer / web: [http://localhost:3000](http://localhost:3000)
- здоровье node-1: [http://localhost:4001/health](http://localhost:4001/health)

По желанию: node-2 — [http://localhost:4011/health](http://localhost:4011/health). Faucet включён только у **node-1** (`ALLOW_FAUCET=1`); у node-2 faucet выключен.

Не пробрасывайте эти порты в интернет «для всей сети» — это локальный стек на этом ноутбуке.

## 5. Остановка (без удаления цепи)

Чтобы остановить контейнеры и **сохранить** данные томов:

```powershell
docker compose stop
```

Допустимо `docker compose down` **без** `-v` (контейнеры уйдут, named volumes с цепью останутся).

**Не запускайте** `docker compose down -v`: флаг `-v` удаляет volumes и локальную цепь.

Повторный старт (без полной пересборки, если образы уже есть):

```powershell
docker compose --env-file .env up -d
```


## Security protocol v2 (2026-09-30)

Fresh testnets require `BOOTSTRAP_ADDRESS` on every node and a separate
`BOOTSTRAP_PRIVATE_KEY` on the seed only. Generate it using the existing
`generateKeyPair` helper in a private environment; do not paste it into logs or Git.
Followers must leave the private bootstrap key unset. Existing v1 DATA_DIRs are
rejected, preserved and require an explicitly reviewed migration or approved new
chain. See [upgrade constraints](SECURITY-HARDENING.md) and
[approved decisions](PROTOCOL-DECISIONS.md). This is not a Mainnet deployment path.

### Предупреждение (M10-1, шаг 0)

Если сеть доступна посторонним, в `.env` нужно задать одинаковые на всех нодах:

```
SECURITY_UPGRADE_HEIGHT=<высота выше текущей головы на всех нодах>
VALIDATOR_ALLOWLIST=0xaaa…,0xbbb…
```

Без `SECURITY_UPGRADE_HEIGHT` валидатором становится любой адрес со 100 PPL.
`VALIDATOR_ALLOWLIST` без высоты — нода не стартует. Разные высоты на нодах
раскалывают цепь на высоте H. Порядок активации — в
[AUDIT-CRITICAL-FIXES.md](AUDIT-CRITICAL-FIXES.md).

Это не убирает риск остановки: у каждой высоты один допустимый proposer, и
молчащий proposer останавливает цепь. Резервный proposer — изменение правил
консенсуса, нужно письменное решение владельца (M10-1, шаги 1-2).
