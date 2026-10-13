# Protocol roadmap

Операционный статус. Не эссе.

| Поле | Значение |
| --- | --- |
| Последний протокол | Claim D, merge PR #11 `2f5299c`. Дальше в этой карте только статус |
| Active phase | Код выплат на месте. Дальше только аудит, testnet и публичный репозиторий |
| PR | A+B: #6 MERGED. C: #7 MERGED. D: #8 MERGED. Score/C/N/split: #9 MERGED `dbfd079`. Settlement: #10 MERGED `bbb9085`. Claim D: #11 MERGED `2f5299c` |
| Tests | `npm test`, `typecheck`, `lint` в `people-node` |
| Blockers | Внешний аудит не начат. Public repo нет. Mainnet нет. Production не задеплоен. Railway durable URL не создан (free plan limit) |
| Next task | Внешний аудит. Не деплой mainnet и не публикация репозитория |
| Production | не деплоить. Репозиторий не публиковать. Mainnet не запускать |
| Audit | not started |
| Internal Testnet | **UP (IN PROGRESS)** на worker VM, Docker Compose. Не mainnet. URLs на этой VM: node `http://127.0.0.1:4001`, node-2 `http://127.0.0.1:4011`, web/explorer `http://127.0.0.1:3000`. `CHAIN_ID=people-internal-testnet`. Faucet только node-1 через env `DEV_FAUCET_PRIVATE_KEY` (не в git). Внешний ingress на public IP закрыт |


## Фазы

| Фаза | Содержание | Статус |
| --- | --- | --- |
| A | Явное состояние Participant, отдельно от аккаунта и валидатора | DONE, PR #6 merged |
| B | Реферальный лес: один родитель, `linkedAtHeight`, depth ≤ 5, без награды | DONE, PR #6 merged |
| C | C, N, age, maturation, каркас score, `isL1Eligible` / `isL2Eligible` | DONE, PR #7 merged |
| D | Учёт Growth Pool | DONE, PR #8 merged |
| — | Score `40×C+14×N`, каталоги `C`/`N`, живой fee split Model A | DONE, PR #9 merged `dbfd079`. Implementation decision, subject to audit |
| E | Epoch + Settlement L1/L2, кепы, floor, FORFEIT | DONE, PR #10 merged `bbb9085` |
| — | Beta Growth payout weights L1=70 / L2=30; referral graph L1/L2 only (depth 2) | IMPLEMENTATION of approved economic decision. Growth Pool remains 15% of eligible fees |
| F | Claim D + возврат через 4 эпохи | DONE, PR #11 merged `2f5299c`. Subject to audit |
| — | Anti-Sybil, wash, S-gate, clawback | не делаются |
| G | API / SDK / Explorer / UI | не начато |
| — | Internal Testnet | **UP (IN PROGRESS)** на worker VM. Compose: node `:4001`, node-2 `:4011`, web `:3000`. Mainnet не запущен |
| — | Stress | не начато |
| — | Independent Audit | not started |
| — | Security Audit | not started |
| — | Mainnet Readiness | не начато |
| — | Mainnet | не начато |

Сделано в коде: score, каталоги `C`/`N`, живой split 30/25/20/10/15/0, settlement L1/L2 с активными весами 70/30, Claim D с возвратом через 4 эпохи. Новые PPL не минтятся.

Ещё не сделано, и этот PR это не включает: внешний аудит, публичный репозиторий, production deploy, mainnet. Wash-детектор, S-gate и admin clawback не делаются. Internal testnet поднят локально (см. таблицу статуса); durable Railway URL нет.

Черновик EVM (`contractDeploy`/`contractCall`) живёт в отдельном Draft PR поверх Token/NFT factory. Это **не** Mainnet и не смена Growth.
