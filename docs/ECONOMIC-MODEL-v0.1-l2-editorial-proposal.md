# Economic Model v0.1 — L2 editorial proposal

## STATUS

- Документ = **EDITORIAL PROPOSAL / NOT APPLIED**
- `docs/ECONOMIC-MODEL-v0.1.md` этим файлом **не редактируется**
- Числа модели **не меняются**
- Это не новый economic rule и не правка substance Economic Model
- Код = **NONE**. Production = **NONE**
- Growth Protocol остаётся **PROPOSAL / NOT APPROVED**

Предлагается одна правка текста. Пока этот файл не применён, фраза в модели остаётся на месте.

---

## Одна правка

Удалить фразу «плюс ворота L1 того же участника».

Та же оговорка стоит в двух местах `docs/ECONOMIC-MODEL-v0.1.md` и больше нигде менять не предлагается:

| Место | Сейчас | После удаления фразы |
| --- | --- | --- |
| §10, строка L2 | score ≥ 280, `C ≥ 5`, `N ≥ 6`, возраст ≥ 4, и ворота L1 того же участника | score ≥ 280, `C ≥ 5`, `N ≥ 6`, возраст ≥ 4 |
| §11, строка L2 threshold | score ≥ 280, `C ≥ 5`, `N ≥ 6`, возраст ≥ 4, плюс ворота L1 того же участника | score ≥ 280, `C ≥ 5`, `N ≥ 6`, возраст ≥ 4 |

Другие строки §10 и §11, проценты, формула score, пороги L1, кепы, claim, eligible set и bootstrap не входят в эту правку.

---

## L2 после правки

L2 eligibility = score ≥ 280, `C ≥ 5`, `N ≥ 6`, age ≥ 4.

Prerequisite «сначала пройти ворота L1 того же участника» нет.

**L2 additional L1-gate: NOT APPROVED.**

Фраза в таблице модели — documentation inconsistency. Удаление выравнивает текст с порогами L2, которые уже записаны числами. Новый порог, новый коэффициент и новое economic rule этим не вводятся.

---

## Что не делается

- Файл `docs/ECONOMIC-MODEL-v0.1.md` не открывается на запись.
- Substance Economic Model не меняется.
- Growth Protocol не получает нового параметра из этой правки: там L2 уже записан без L1 prerequisite.
- Runtime, consensus, fees и production не затрагиваются.
