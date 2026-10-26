# Настройка верификации основателей (Founders)

Статус: **операционная инструкция** для владельца. Бесплатные тарифы; секреты только в переменных окружения Vercel / `.env.local`.

## Переменные окружения (полный список)

| Переменная | Назначение |
| --- | --- |
| `FOUNDERS_PHONE_HASH_SALT` | Соль для хеша номера телефона (никогда не храним сам номер). Сгенерируйте: `openssl rand -base64 32` |
| `FOUNDERS_TELEGRAM_BOT_TOKEN` | Токен бота от @BotFather |
| `FOUNDERS_TELEGRAM_BOT_USERNAME` | Имя бота без `@`, например `PeopleFoundersBot` |
| `FOUNDERS_TELEGRAM_WEBHOOK_SECRET` | Случайная строка для заголовка `X-Telegram-Bot-Api-Secret-Token` |
| `FOUNDERS_TELEGRAM_LINK_SECRET` | Секрет для ссылок `/start` (если пусто — используется `AUTH_SECRET`) |
| `FOUNDERS_WORLD_ID_APP_ID` | `app_id` из [World Developer Portal](https://developer.world.org/) |
| `FOUNDERS_WORLD_ID_RP_ID` | `rp_id` из портала (World ID 4.0) |
| `FOUNDERS_WORLD_ID_SIGNING_KEY` | `signing_key` из портала (**секрет**, только сервер) |
| `FOUNDERS_WORLD_ID_ACTION` | *(опционально)* action для proof (по умолчанию `founders-level-2`) |
| `NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID` | Project ID из [Reown Cloud](https://cloud.reown.com) для WalletConnect в модалке кошелька |

Соль, webhook и link secret можно сгенерировать агентом/владельцем; Telegram token и World ID credentials — только владелец.

---

## 1. Telegram (уровень 1 — телефон, 50% очков)

1. Откройте Telegram и найдите **@BotFather**: https://t.me/BotFather  
2. Отправьте команду `/newbot`.  
3. Введите **отображаемое имя** бота (например `PEOPLE Founders`).  
4. Введите **username** (должен заканчиваться на `bot`, например `PeopleFoundersBot`).  
5. BotFather пришлёт **HTTP API token** — скопируйте его целиком в `FOUNDERS_TELEGRAM_BOT_TOKEN`.  
6. В `FOUNDERS_TELEGRAM_BOT_USERNAME` укажите username **без** символа `@`.  
7. Сгенерируйте секрет webhook: `openssl rand -hex 24` → `FOUNDERS_TELEGRAM_WEBHOOK_SECRET`.  
8. Установите webhook (подставьте свой домен и токены):

```text
https://api.telegram.org/bot<FOUNDERS_TELEGRAM_BOT_TOKEN>/setWebhook?url=https://www.peopleblockchain.network/api/founders/telegram/webhook&secret_token=<FOUNDERS_TELEGRAM_WEBHOOK_SECRET>
```

9. На сайте основатель нажимает «Открыть Telegram-бота», делится контактом («Share phone number»). Номер сохраняется только как salted hash.

---

## 2. World ID 4.0 (уровень 2 — 100% очков)

Документация: https://docs.world.org/world-id/quick-start/installation

1. Откройте https://developer.world.org/ и войдите (бесплатный аккаунт).  
2. **Create app** (или откройте существующее) → при миграции на 4.0 нажмите **Enable World ID 4.0** / завершите RP registration.  
3. Скопируйте из портала:
   - **App ID** → `FOUNDERS_WORLD_ID_APP_ID`
   - **RP ID** → `FOUNDERS_WORLD_ID_RP_ID`
   - **Signing key** → `FOUNDERS_WORLD_ID_SIGNING_KEY` (никогда не публикуйте в клиенте)
4. В настройках приложения добавьте разрешённый домен сайта (например `www.peopleblockchain.network`).  
5. *(Опционально)* задайте `FOUNDERS_WORLD_ID_ACTION` — тот же action, что в виджете (по умолчанию `founders-level-2`).  
6. На `/founders` пользователь нажимает **Verify with World ID**: сайт запрашивает RP-подпись на бэкенде, открывает IDKit, затем проверяет proof через `POST https://developer.world.org/api/v4/verify/{rp_id}` (environment `production`) и сохраняет nullifier в Postgres как `NUMERIC(78,0)` с уникальностью по `(nullifier, action)`.

---

## 3. WalletConnect (внешние кошельки на сайте)

1. Откройте https://cloud.reown.com/ и войдите или зарегистрируйтесь.  
2. **Create project** (или откройте существующий).  
3. Скопируйте **Project ID** → `NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID` в Vercel (Production и Preview).  
4. Без этой переменной кнопки MetaMask и Trust Wallet остаются; **WalletConnect скрыт**.

---

## 4. Соль для телефона

```bash
openssl rand -base64 32
```

Значение → `FOUNDERS_PHONE_HASH_SALT`. **Не меняйте** на проде после запуска без миграции — старые хеши перестанут совпадать.

---

## 5. Отметка бота (clawback пригласившему)

Админ (email из `DISCOVER_ADMIN_EMAILS`):

`POST /api/founders/admin/mark-bot` с телом `{ "userId": "<uuid пользователя>" }`.

Отзывает invite-очки у пригласившего и помечает приглашённого как бота.
