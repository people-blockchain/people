# DRAFT — creator-facing copy (EN / RU)

**Status:** draft only. Not wired into `website/src/lib/locales` or the live site.
**Owner rule:** Alex, 2026-10-13. User tokens: leftover mode Burn (default) or Community pool.
**Do not ship** until product review. PPL sale copy is unchanged.

---

## English — Launch page (`/factory` token launch)

### Leftover mode (radio group)

**Title:** Curve leftover & 180-day unsold  
**Hint:** Choose what happens to tokens still on the bonding curve when it migrates to the AMM, or if the curve does not sell out within 180 days. Never to you (the creator) and never to the protocol treasury.

- **Burn (recommended)** — Default. Leftover and unsold tokens are permanently burned (sent to a dead address).  
- **To community pool** — Leftover and unsold tokens go to this token’s own community pool (the same pool that already receives 10% at launch).

### Short launch summary (optional blurb above submit)

When you launch a token on People:

1. **10%** of supply goes to your token’s **community pool** at creation.  
2. You choose what happens to **curve leftovers** after AMM migration and to **unsold** tokens if the curve is finalized after **180 days**: **burn** (default) or **community pool**.  
3. Optional **referral share** for invites: default **5%** of supply reserved for your referral program, maximum **10%**; invite bounty default **5%** of the invitee’s purchase (off-chain program; not an on-chain factory fee).

---

## English — How it works

**Token launch allocation**  
Every standard community token sends **10%** of its supply to its own community pool at launch.

**Bonding curve leftovers**  
After the curve sells enough to migrate into the AMM, any remaining curve inventory (and unused liquidity reserve) is disposed of by the creator’s launch choice: **burned** by default, or sent to that token’s **community pool**. The same choice applies if the curve does not sell out and is finalized after **180 days**. Leftovers never go to the creator or the protocol treasury.

**Optional referral share**  
At launch, a creator may opt into an issuer referral program: by default **5%** of supply (max **10%**) can be reserved for invite rewards, with a default invite bounty of **5%** of the invitee’s purchase. This is optional and off by default.

---

## Русский — Страница запуска токена

### Режим остатка (радиогруппа)

**Заголовок:** Остаток кривой и нераспроданное за 180 дней  
**Подсказка:** Выберите, что происходит с токенами, которые остаются на бондинг-кривой при миграции в AMM, или если кривая не распродаётся за 180 дней. Никогда вам (создателю) и никогда в казну протокола.

- **Сжечь (рекомендуется)** — По умолчанию. Остаток и нераспроданные токены навсегда сжигаются.  
- **В пул сообщества** — Остаток и нераспроданные токены идут в собственный пул сообщества этого токена (тот же пул, куда уже уходит 10% при запуске).

### Краткое резюме запуска

При запуске токена в People:

1. **10%** эмиссии сразу идёт в **пул сообщества** вашего токена.  
2. Вы выбираете судьбу **остатка кривой** после миграции в AMM и **нераспроданного** при финализации через **180 дней**: **сжигание** (по умолчанию) или **пул сообщества**.  
3. Опциональная **реферальная доля** за приглашения: по умолчанию **5%** эмиссии под реферальную программу (максимум **10%**); награда за приглашение по умолчанию **5%** от покупки приглашённого (офчейн-программа; это не on-chain комиссия фабрики).

---

## Русский — «Как это работает»

**Доля при запуске**  
Каждый стандартный токен сообщества при создании отправляет **10%** эмиссии в свой пул сообщества.

**Остаток бондинг-кривой**  
Когда кривая набирает достаточно продаж и мигрирует в AMM, оставшийся запас кривой (и неиспользованный резерв ликвидности) распоряжается по выбору создателя при запуске: по умолчанию **сжигается**, либо уходит в **пул сообщества** этого токена. Тот же выбор действует, если кривая не распродалась и через **180 дней** её финализируют. Остаток никогда не уходит создателю и никогда в казну протокола.

**Опциональная реферальная доля**  
При запуске создатель может включить реферальную программу эмитента: по умолчанию **5%** эмиссии (макс. **10%**) резервируется под награды за приглашения; награда за приглашение по умолчанию **5%** от покупки приглашённого. Опция выключена, пока создатель её не отметит.

---

## Wire-up checklist (later, not this PR)

- [ ] `factory-en.json` / `factory-ru.json` (and other locales) leftover radio strings  
- [ ] `hiw-en.json` / `hiw-ru.json` (+ warm variants) paragraphs above  
- [ ] Assert scripts if any copy tests pin the old “always to community pool” leftover wording  
