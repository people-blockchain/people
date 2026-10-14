import type { Language } from "./preferences";
import docsAr from "./locales/surfaces/docs-ar.json" with { type: "json" };
import docsDe from "./locales/surfaces/docs-de.json" with { type: "json" };
import docsEs from "./locales/surfaces/docs-es.json" with { type: "json" };
import docsFr from "./locales/surfaces/docs-fr.json" with { type: "json" };
import docsId from "./locales/surfaces/docs-id.json" with { type: "json" };
import docsIt from "./locales/surfaces/docs-it.json" with { type: "json" };
import docsPt from "./locales/surfaces/docs-pt.json" with { type: "json" };
import docsTr from "./locales/surfaces/docs-tr.json" with { type: "json" };
import docsVi from "./locales/surfaces/docs-vi.json" with { type: "json" };
import docsZh from "./locales/surfaces/docs-zh.json" with { type: "json" };

export type GuideSection = { id: string; title: string; lead: string; items: { title: string; text: string }[]; links: {label: string; href: string}[]; code?: string };
export type NodeQuickStartCopy = { title: string; intro: string; copy: string; copied: string; copyManual: string; hint: string };
export type Guide = { eyebrow: string; title: string; description: string; notice: string; noticeText: string; contents: string; search: string; empty: string; clear: string; results: string; read: string; cards: {title: string; text: string; href: string}[]; nodeQuickStart: NodeQuickStartCopy; sections: GuideSection[] };
export const docsContent: Record<Language, Guide> = {
  "ru": {
    "eyebrow": "БАЗА ЗНАНИЙ / PEOPLE",
    "title": "Разберитесь.\nПопробуйте.\nУчаствуйте.",
    "description": "От первого кошелька до своей ноды — понятное руководство по People’s Blockchain.",
    "notice": "Тестовая сеть",
    "noticeText": "Mainnet ещё не запущен. Доступность операций зависит от подключения сайта и версии сети. Тестовые монеты не являются обещанием дохода.",
    "contents": "В этом руководстве",
    "search": "Найти в документации",
    "empty": "Ничего не найдено. Попробуйте «кошелёк», «награды» или «нода».",
    "clear": "Сбросить поиск",
    "results": "Найдено разделов",
    "read": "Перейти к инструкции",
    "nodeQuickStart": {
      "title": "Своя нода — одна команда",
      "intro": "Установите и запустите Docker. Команда ниже запускает обычную проверяющую ноду с постоянным хранилищем в публичной тестовой сети. Кошелёк, залог и приватные ключи не нужны.",
      "copy": "Копировать",
      "copied": "Скопировано",
      "copyManual": "Выделите команду и скопируйте вручную.",
      "hint": "Проверка: curl http://127.0.0.1:4001/health — в ответе ok:true и chainId people-public-testnet-v2-2026-09-30. Логи: docker logs people-node. Остановка: docker stop people-node. Повторный запуск: docker start people-node. Обновление образа: docker stop people-node && docker rm people-node, затем снова выполните команду выше (том people-node-data сохраняет цепочку)."
    },
    "cards": [
      {
        "title": "Я начинаю",
        "text": "Кошелёк, PPL и первый перевод",
        "href": "#start"
      },
      {
        "title": "Хочу участвовать",
        "text": "Награды, продукты и ограничения",
        "href": "#earn"
      },
      {
        "title": "Запускаю ноду",
        "text": "Подключение, проверка и обслуживание",
        "href": "#node"
      }
    ],
    "sections": [
      {
        "id": "basics",
        "title": "Как устроен People",
        "lead": "Блокчейн — общая история операций. Кошелёк подписывает действие, ноды проверяют его, а валидаторы включают в блоки.",
        "items": [
          {
            "title": "PPL — монета сети",
            "text": "People (PPL) используется для сетевых комиссий и операций протокола. Тестовые PPL предназначены для проверки сети; их наличие не означает денежный доход."
          },
          {
            "title": "Участник, нода и валидатор",
            "text": "Участник пользуется кошельком и приложениями. Полная нода хранит и проверяет состояние сети. Валидатор дополнительно участвует в выпуске и подтверждении блоков. Телефон или открытая вкладка сами по себе не становятся валидатором."
          },
          {
            "title": "Как устроена сеть",
            "text": "Каждая нода хранит состояние цепочки на своём диске. Валидаторы создают и подтверждают блоки, а обычные следящие ноды всё проверяют, но блоки не производят. Кошелёк, сканер, обмен и фабрики на этом сайте читают одну и ту же цепочку — актуальное состояние видно в разделе /explorer. Доли комиссий, правила выпуска и учёт записаны в коде протокола, поэтому страница сайта не может их изменить."
          },
          {
            "title": "Куда идёт каждая комиссия",
            "text": "Каждая протокольная комиссия делится по фиксированным долям: 30% валидаторам, 25% в Community Pool, 20% в казну, 10% в ликвидность и 15% в Growth, 0% сжигается — включая дробные комиссии. В версии протокола v2 те же доли применяются к дробным комиссиям: расчёт идёт в минимальных единицах PPL, а остаток получают валидаторы. Газ контрактов оплачивается заранее, неиспользованный газ не возвращается."
          },
          {
            "title": "Выкуп",
            "text": "100% комиссий за запуск токенов и NFT (USDC/USDT) идут на публичный выкуп PPL — включая тестовые стейблкоины (tUSDC/tUSDT) через StableFeeGateway. 30% сетевых комиссий идут на публичный выкуп PPL (казна 20% + ликвидность 10%). Оставшиеся 70% сетевых комиссий идут валидаторам (30%), в пул сообщества (25%) и в Growth Pool (15%). В итоге всё возвращается участникам. Выкуп выполняется по опубликованному расписанию через казначейский мультисиг 2-из-3, каждая покупка видна в проводнике. Выкупленный PPL затем делится 30/25/20/10/15. Цифры предварительные и зависят от голосования сообщества."
          },
          {
            "title": "Запуск ноды",
            "text": "Любой может запустить следящую ноду одной командой Docker: она проверяет блоки, и ей не нужны кошелёк, залог или приватные ключи. Валидатор — отдельная роль: нужен свой ключ, залог и согласование с оператором, он производит блоки и должен быть на связи. Телефон или открытая вкладка браузера участвует в сети, но валидатором не является."
          },
          {
            "title": "От подписи до подтверждения",
            "text": "Отправленная операция сначала проходит проверки и попадает в очередь. Принятие в очередь ещё не означает включение в блок или финальность. Проверяйте результат в сканере."
          }
        ],
        "links": [
          {
            "label": "Посмотреть сеть",
            "href": "/explorer"
          },
          {
            "label": "Визуальное объяснение",
            "href": "/how-it-works"
          },
          {
            "label": "Токеномика PPL",
            "href": "/tokenomics"
          }
        ]
      },
      {
        "id": "start",
        "title": "Начните с кошелька",
        "lead": "Для первых шагов не нужен собственный сервер.",
        "items": [
          {
            "title": "01 · Создайте или восстановите кошелёк",
            "text": "Откройте кошелёк, выберите создание нового либо восстановление своего. Сохраните фразу восстановления в надёжном месте вне сайта. Пароль защищает локальное хранилище, но не заменяет резервную копию фразы."
          },
          {
            "title": "02 · Проверьте подключение",
            "text": "В кошельке должен отображаться статус Testnet. Если видите, что сеть недоступна, подождите и обновите страницу."
          },
          {
            "title": "03 · Получите тестовые PPL",
            "text": "Если в этой сети включён кран, запросите тестовые монеты через доступный интерфейс. Действуют ограничения. Не покупайте тестовые монеты ради обещания будущего дохода."
          },
          {
            "title": "04 · Сделайте небольшой перевод",
            "text": "Проверьте адрес, сумму и комиссию. Оставьте PPL на следующие операции. После отправки найдите идентификатор транзакции в сканере и проверьте включение в блок."
          }
        ],
        "links": [
          {
            "label": "Открыть кошелёк",
            "href": "/wallet"
          },
          {
            "label": "Проверить комиссию",
            "href": "/fees"
          }
        ]
      },
      {
        "id": "earn",
        "title": "Как можно участвовать",
        "lead": "Сеть находится в тестовой стадии. Здесь описаны механизмы участия, а не обещание прибыли.",
        "items": [
          {
            "title": "Валидация · тестовый протокол",
            "text": "Вознаграждения связаны с участием валидатора в работе сети и её параметрами. Нужны регистрация, залог и работающая инфраструктура. Учитывайте расходы сервера и риски протокола; фиксированная доходность не обещана. Обычная нода без роли валидатора не получает награду только за запуск."
          },
          {
            "title": "Создание продуктов · зависит от спроса",
            "text": "Можно тестировать токены, NFT и контракты. Выпуск актива сам по себе не создаёт покупателей, ликвидность или прибыль. Ценность продукта и спрос на него не гарантируются протоколом."
          },
          {
            "title": "Growth-рефералы",
            "text": "Два уровня: L1 и L2. Веса 70/30 относятся к допустимому бюджету распределения, а не к сумме каждого перевода. Учитываются активность, возраст участия, созревание и лимиты. Само приглашение не даёт выплату. Просматривайте и получайте Growth-награды в партнёрском кабинете, когда выполнены условия."
          },
          {
            "title": "Мобильное участие",
            "text": "Сессии участия в один тап с телефона. Награды зависят от подтверждённой активности, а не от открытой вкладки или «майнинга» PPL."
          },
          {
            "title": "Proof of Humanity",
            "text": "Многосигнальные проверки без биометрии и без хранения личных данных в блокчейне."
          },
          {
            "title": "Баллы участия",
            "text": "Баллы определяют вашу долю наград из Community Pool от сетевых комиссий. Их нельзя купить или передать."
          }
        ],
        "links": [
          {
            "label": "Узнать о валидаторах",
            "href": "#validators"
          }
        ]
      },
      {
        "id": "create",
        "title": "Создавайте в тестовой сети",
        "lead": "Выберите подходящий инструмент и проверьте результат в сканере.",
        "items": [
          {
            "title": "Токен",
            "text": "Задайте параметры выпуска и изучите правила распределения. Во встроенном механизме выпуска 10% нового токена направляется в его пул сообщества. Это не означает автоматическую выплату каждому держателю PPL и не является универсальным правилом любого Solidity-контракта."
          },
          {
            "title": "NFT",
            "text": "Подготовьте метаданные и изображение, проверьте права на материалы и комиссию. Доступность формы ещё не означает, что выпуск выполнен: нужна подписанная и включённая в блок операция."
          },
          {
            "title": "Контракт",
            "text": "Развёртывание требует PPL на газ и проверки исходного кода. Успешная компиляция не является аудитом безопасности. Сначала тестируйте операции без реальных ценностей."
          }
        ],
        "links": [
          {
            "label": "Создать токен",
            "href": "/create/token"
          },
          {
            "label": "Создать NFT",
            "href": "/create/nft"
          },
          {
            "label": "Создать контракт",
            "href": "/create/contract"
          }
        ]
      },
      {
        "id": "fees",
        "title": "Куда идут комиссии",
        "lead": "Комиссия оплачивает операцию в сети; сумма перевода и комиссия — разные величины.",
        "items": [
          {
            "title": "Как делятся комиссии протокола",
            "text": "Каждая комиссия протокола делится так: 30% валидаторам, 25% сообществу, 20% казне, 10% ликвидности, 15% в Growth, 0% сжигается — в том числе дробные комиссии.",
          },
          {
            "title": "Дробные комиссии",
            "text": "В обновлении протокола v2 те же доли применяются и к дробным комиссиям, с расчётом в минимальных единицах PPL и остатком валидаторам. При отсутствии валидаторов их доля направляется в Treasury."
          },
          {
            "title": "Проверяйте цену перед подписью",
            "text": "Операции имеют разные тарифы. Для контрактов газ оплачивается заранее; текущий механизм не возвращает неиспользованный газ при успехе или откате. Актуальные для сайта значения вынесены на страницу комиссий."
          }
        ],
        "links": [
          {
            "label": "Комиссии и тарифы",
            "href": "/fees"
          }
        ]
      },
      {
        "id": "node",
        "title": "Как подключить свою ноду",
        "lead": "Новый способ подключения — готовый Docker-образ и одна команда. Доступ к закрытому репозиторию, кошелёк и приватные ключи не нужны.",
        "items": [
          {
            "title": "01 · Подготовьте Docker",
            "text": "Установите Docker и убедитесь, что он запущен. Первый проверенный образ рассчитан на Linux amd64 (x86-64). Другие платформы пока не заявлены как проверенные."
          },
          {
            "title": "02 · Проверьте блок выше",
            "text": "Используйте команду в блоке выше. Она закреплена за текущим публичным выпуском тестовой сети. Не подставляйте другие образы или адреса сети."
          },
          {
            "title": "03 · Скопируйте и выполните команду",
            "text": "Команда загрузит закреплённую версию образа, создаст контейнер people-node и постоянный том people-node-data. Настройки сети загрузятся автоматически по HTTPS и сохранятся в томе. Выбирать ключи или редактировать .env для обычной ноды не требуется."
          },
          {
            "title": "04 · Дождитесь синхронизации",
            "text": "Нода подключится к архивному узлу, получит блоки с начала цепочки и сама проверит подписи и изменения состояния. Время зависит от длины истории и вашего подключения. API доступен только на вашем компьютере; открывать входящие порты для обычного подключения не нужно."
          },
          {
            "title": "05 · Проверьте результат",
            "text": "Откройте http://localhost:4001/health и http://localhost:4001/chain/head. Доступность API ещё не означает завершение синхронизации: сравните высоту и данные блока с сетью. Подробная проверка и команды обслуживания — в следующем разделе."
          }
        ],
        "links": [
          {
            "label": "Проверка и обслуживание",
            "href": "#verify"
          },
          {
            "label": "Ручная сборка для разработчиков",
            "href": "#node-manual"
          }
        ]
      },
      {
        "id": "verify",
        "title": "Проверка и обслуживание ноды",
        "lead": "Проверьте синхронизацию, затем управляйте уже созданным контейнером. Повторно выполнять команду docker run при каждом запуске не нужно.",
        "items": [
          {
            "title": "Проверьте состояние",
            "text": "После запуска выполните команды ниже на своём компьютере. /health должен вернуть JSON с ok:true. /chain/head покажет локальную высоту — сравните её с публичным сканером. Успешный /health сам по себе не доказывает полную синхронизацию. Локальный API без пароля; не путайте с посторонними ошибками 401 на других сайтах."
          },
          {
            "title": "Логи, остановка и повторный запуск",
            "text": "docker logs --tail 100 people-node покажет последние сообщения. docker stop people-node корректно остановит процесс; docker start people-node запустит тот же контейнер с сохранённой цепочкой. При перезапуске используются закреплённые настройки, даже если сервер их выдачи временно недоступен."
          },
          {
            "title": "Сохраняйте данные",
            "text": "Не удаляйте том people-node-data: в нём находятся цепочка и закреплённые настройки сети. В ручном запуске сохраняйте DATA_DIR. Не выполняйте docker compose down -v для нужных данных. Ответ /snapshot — обзор состояния, а не резервная копия. Для другой сети создайте отдельный том."
          },
          {
            "title": "Подключение к старой цепочке",
            "text": "История на ноде ограничена окном хранения. Новая пустая нода может не догнать сеть, если ранние блоки уже удалены. Для новой сети v2 добавлен архивный режим: выделенная нода сохраняет блоки с первого и отдаёт их для полной проверки. Включение архива не восстанавливает уже удалённые блоки."
          }
        ],
        "links": [],
        "code": "curl http://127.0.0.1:4001/health\n# {\"ok\":true,\"chainId\":\"people-public-testnet-v2-2026-09-30\",...}\ncurl http://127.0.0.1:4001/chain/head"
      },
      {
        "id": "node-manual",
        "title": "Для разработчиков: ручная сборка",
        "lead": "Дополнительный путь для тех, кто имеет доступ к исходникам. Для обычного подключения через Docker этот раздел не нужен.",
        "items": [
          {
            "title": "01 · Получите исходный код",
            "text": "Для ручной сборки нужен доступ к репозиторию и согласованная ревизия. Возьмите CHAIN_ID, GENESIS_FAUCET_ADDRESS, BOOTSTRAP_ADDRESS, BOOTSTRAP_PEERS и тарифы из опубликованной конфигурации v2 на https://node.peopleblockchain.network/network. Для другой сети используйте отдельный каталог данных."
          },
          {
            "title": "02 · Подготовьте окружение",
            "text": "Используйте Node.js 22 и npm. В полученном репозитории выполните команды ниже. Сборка обязательна: пакеты используют dist."
          },
          {
            "title": "03 · Подготовьте .env.node",
            "text": "В .env.node задайте PEER_ID, CHAIN_ID, GENESIS_FAUCET_ADDRESS, BOOTSTRAP_ADDRESS, BOOTSTRAP_PEERS, DATA_DIR, PORT=4001, GOSSIP_PORT=4002 и BIND_HOST=127.0.0.1. EXPECTED_GENESIS_HASH должен совпадать с genesisHash публичной конфигурации; TOKEN_CREATE_MIN_FEE и NFT_MINT_MIN_FEE — с её тарифами. PUBLIC_GOSSIP_URL нужен только для принимающей внешние gossip-соединения ноды."
          },
          {
            "title": "04 · Используйте только публичные параметры",
            "text": "GENESIS_FAUCET_ADDRESS и BOOTSTRAP_ADDRESS — публичные адреса. DEV_FAUCET_PRIVATE_KEY остаётся у крана, BOOTSTRAP_PRIVATE_KEY — у выделенного производителя начальных блоков. Не запрашивайте и не копируйте эти секреты на свою ноду."
          },
          {
            "title": "05 · Запустите процесс",
            "text": "Сохраните .env.node в каталоге people-node внутри клонированного репозитория Peoples-Blockchain и ограничьте доступ к файлу. Не включайте ALLOW_FAUCET и ALLOW_DEV_ENDPOINTS для обычной ноды. Не публикуйте HTTP API в интернет без согласованной защиты."
          }
        ],
        "links": [],
        "code": "git clone https://github.com/rednaxelavoroge/Peoples-Blockchain.git\ncd Peoples-Blockchain/people-node\nnpm ci\nnpm run build\nnode --env-file=.env.node apps/node/dist/index.js"
      },
      {
        "id": "validators",
        "title": "Как стать валидатором",
        "lead": "Сначала запустите и синхронизируйте обычную ноду, затем согласуйте участие с оператором.",
        "items": [
          {
            "title": "Отдельный ключ и залог",
            "text": "Создайте отдельный ключ валидатора и сохраните его безопасно. Получите тестовые PPL на залог и комиссию, уточните действующие параметры регистрации и период ожидания. Регистрация выполняется подписанной join-операцией; один запуск сервера не регистрирует валидатора."
          },
          {
            "title": "Включение роли",
            "text": "После регистрации задайте соответствующие VALIDATOR_ADDRESS и VALIDATOR_PRIVATE_KEY в окружении ноды и перезапустите процесс. Используйте инструкцию оператора для текущей версии сети и проверяйте фактическое участие в блоках."
          },
          {
            "title": "Доступность имеет значение",
            "text": "Если выбранный валидатор недоступен, выпуск блоков приостанавливается до его возвращения. Планируйте обслуживание вместе с оператором и не сбрасывайте цепочку самостоятельно."
          }
        ],
        "links": []
      },
      {
        "id": "participation-depth",
        "title": "Сила участия и награды",
        "lead": "Как считается ваша доля в Community Pool.",
        "items": [
          {
            "title": "Сила участия",
            "text": "Личный вес, от которого зависит ваша доля выплат из Community Pool за счёт комиссий сети в PPL. Её нельзя продать или передать."
          },
          {
            "title": "Лимит на человека и эпохи",
            "text": "Участие считается по периодам — эпохам. Каждая следующая активность даёт всё меньше, а на человека есть жёсткий лимит, поэтому один аккаунт не заберёт весь пул."
          },
          {
            "title": "Откуда деньги в пуле",
            "text": "25% подходящих комиссий сети идут в Community Pool и каждую эпоху выплачиваются активным участникам, которые прошли условия."
          },
          {
            "title": "Защита от фейковых аккаунтов",
            "text": "Новые аккаунты набирают вес медленно, неактивные теряют его, а лимиты не дают группе фейков много заработать."
          },
          {
            "title": "Если никто не прошёл условия",
            "text": "Если в эпохе никто не прошёл условия, ничего не выплачивается как бесплатный доход. Деньги остаются в пуле по правилам протокола."
          }
        ],
        "links": [
          {
            "label": "Как это работает",
            "href": "/how-it-works"
          }
        ]
      },
      {
        "id": "network-architecture",
        "title": "Как устроена сеть",
        "lead": "Из чего состоит сеть и какие правила нельзя поменять вручную.",
        "items": [
          {
            "title": "Консенсус и валидаторы",
            "text": "Отдельные валидаторы создают и подтверждают блоки. Телефоны и вкладки браузера участвуют в сети, но валидаторами не являются."
          },
          {
            "title": "Состояние и хранение",
            "text": "Каждая нода хранит состояние цепочки на своём диске. Обычные ноды могут удалять старые блоки; валидаторы перезапускаются из своей папки с данными."
          },
          {
            "title": "Неизменные правила",
            "text": "Доли комиссий, правила выпуска и учёт записаны в коде протокола, поэтому текст на сайте не может их изменить."
          }
        ],
        "links": [
          {
            "label": "Запустить ноду",
            "href": "#node"
          }
        ]
      },
      {
        "id": "product-phases",
        "title": "Что уже можно использовать",
        "lead": "Что уже работает в тестовой сети и что будет дальше. Дата mainnet не назначена.",
        "items": [
          {
            "title": "Доступно сейчас · тестовая сеть",
            "text": "Кошелёк, фабрика токенов и NFT, обмен на тестовые PPL, контракты и распределение комиссий."
          },
          {
            "title": "Доступно сейчас · сеть людей",
            "text": "Участие с телефона в одно касание, проверка, что вы живой человек, без биометрии, и баллы участия для доли в Community Pool."
          },
          {
            "title": "Дальше · приложения для всех",
            "text": "Hub и инструменты для авторов на том же протоколе."
          }
        ],
        "links": []
      },
      {
        "id": "ppl-native",
        "title": "PPL — монета сети",
        "lead": "People (PPL) оплачивает комиссии сети и действия протокола в этой цепочке.",
        "items": [
          {
            "title": "Тестовые монеты",
            "text": "Тестовые PPL нужны, чтобы попробовать сеть. Наличие тестовых PPL не означает прибыль."
          },
          {
            "title": "Комиссии только в PPL",
            "text": "Переводы, создание токена или NFT и газ контрактов оплачиваются в PPL."
          }
        ],
        "links": [
          {
            "label": "Комиссии",
            "href": "/fees"
          }
        ]
      },
      {
        "id": "safety",
        "title": "Безопасность кошелька",
        "lead": "Кто владеет секретом, тот может подписывать операции.",
        "items": [
          {
            "title": "Фраза восстановления — только у вас",
            "text": "Не отправляйте фразу, приватный ключ или пароль в поддержку, чат, форму сайта или репозиторий. Для проверки операции достаточно публичного адреса и идентификатора транзакции."
          },
          {
            "title": "Перед подписью",
            "text": "Проверяйте домен, сеть, адрес получателя, сумму и назначение операции. Сначала попробуйте небольшую сумму. Блокчейн не предоставляет привычной отмены ошибочного перевода."
          },
          {
            "title": "Если потеряли доступ",
            "text": "Ищите свою резервную копию фразы или ключа. Пароль сайта и данные цепочки не позволяют восстановить потерянный приватный ключ. Не доверяйте предложениям «восстановить» его за оплату."
          }
        ],
        "links": []
      },
      {
        "id": "help",
        "title": "Частые вопросы",
        "lead": "Что проверить, если что-то не получается.",
        "items": [
          {
            "title": "Сеть недоступна",
            "text": "Сайт не может связаться с сетью. Подождите и обновите страницу. Не вводите секреты в сторонних сервисах."
          },
          {
            "title": "Перевод отправлен, баланс не изменился",
            "text": "Проверьте идентификатор операции в сканере, включение в блок и состояние сети. Проверьте адрес и выбранную сеть. Не отправляйте повторный перевод, пока не выясните судьбу первого."
          },
          {
            "title": "Блоки перестали появляться",
            "text": "Возможны проблемы связи или недоступность выбранного валидатора. Сообщите оператору высоту и время наблюдения. Не удаляйте данные ноды ради попытки исправить остановку."
          },
          {
            "title": "Что отправить для диагностики",
            "text": "Адрес страницы, текст ошибки, время, публичный адрес и идентификатор операции. Оператор ноды может добавить SHA версии, CHAIN_ID и высоту. Удалите из логов секреты; файл .env отправлять не нужно."
          }
        ],
        "links": []
      }
    ]
  },
  "en": {
    "eyebrow": "KNOWLEDGE BASE / PEOPLE",
    "title": "Understand.\nTry it.\nTake part.",
    "description": "From your first wallet to your own node — a practical guide to People’s Blockchain.",
    "notice": "Test network",
    "noticeText": "Mainnet has not launched. Available operations depend on the site connection and network version. Test coins are not a promise of income.",
    "contents": "In this guide",
    "search": "Search documentation",
    "empty": "No results. Try “wallet”, “rewards” or “node”.",
    "clear": "Clear search",
    "results": "Sections found",
    "read": "Read the guide",
    "nodeQuickStart": {
      "title": "Your node — one command",
      "intro": "Install and start Docker. The command below runs a verifying follower node with persistent storage on the public testnet. No wallet, bond or private keys are required.",
      "copy": "Copy",
      "copied": "Copied",
      "copyManual": "Select the command and copy it manually.",
      "hint": "Check: curl http://127.0.0.1:4001/health should return ok:true and chainId people-public-testnet-v2-2026-09-30. Logs: docker logs people-node. Stop: docker stop people-node. Start again: docker start people-node. Update image: docker stop people-node && docker rm people-node, then run the command again (keep volume people-node-data)."
    },
    "cards": [
      {
        "title": "I’m getting started",
        "text": "A wallet, PPL and your first transfer",
        "href": "#start"
      },
      {
        "title": "I want to participate",
        "text": "Rewards, products and limitations",
        "href": "#earn"
      },
      {
        "title": "I’m running a node",
        "text": "Connect, verify and maintain",
        "href": "#node"
      }
    ],
    "sections": [
      {
        "id": "basics",
        "title": "How People works",
        "lead": "A blockchain is a shared record of operations. Your wallet signs an action, nodes verify it, and validators include it in blocks.",
        "items": [
          {
            "title": "PPL is the network coin",
            "text": "People (PPL) pays for network fees and protocol operations. Test PPL is for testing the network; holding it does not mean you have earned money."
          },
          {
            "title": "Participant, node, validator",
            "text": "A participant uses wallets and applications. A full node stores and verifies network state. A validator also produces and attests to blocks. A phone or an open browser tab does not automatically become a validator."
          },
          {
            "title": "How the network is assembled",
            "text": "Each node keeps the chain state on its own disk. Validators produce and attest to blocks; ordinary follower nodes verify everything and produce nothing. The wallet, explorer, swap and factories on this site all read that same chain — see /explorer for the live state. Fee shares, supply rules and accounting live in the protocol code, so a page on this website cannot change them."
          },
          {
            "title": "Where every fee goes",
            "text": "Every protocol fee is split by fixed shares: 30% to validators, 25% to the Community Pool, 20% to the treasury, 10% to liquidity and 15% to Growth, with 0% burned — fractional fees included. Protocol v2 applies the same shares to fractional fees, calculated in the smallest PPL units with the remainder going to validators. Contract gas is prepaid and unused gas is not refunded."
          },
          {
            "title": "Buybacks",
            "text": "100% of token and NFT launch fees (USDC/USDT) go to public PPL buybacks — including test stablecoin (tUSDC/tUSDT) fees through the StableFeeGateway. 30% of network fees go to public PPL buybacks (treasury 20% + liquidity 10%). The remaining 70% of network fees go to validators (30%), the community pool (25%) and the Growth Pool (15%). It all ultimately goes back to participants. Buybacks run on a published cadence through the 2-of-3 treasury multisig, and every purchase is visible in the explorer. Bought-back PPL is then split 30/25/20/10/15. Figures are preliminary and subject to community governance."
          },
          {
            "title": "Running a node",
            "text": "Anyone can run a follower node with one Docker command: it verifies blocks and needs no wallet, bond or private keys. A validator is a separate role: it needs its own key, a bond and coordination with the operator, produces blocks, and must stay online. A phone or an open browser tab takes part in the network but is not a validator."
          },
          {
            "title": "From signature to confirmation",
            "text": "An operation passes checks and enters a queue. Queue acceptance is not block inclusion or finality. Check the outcome in the explorer."
          }
        ],
        "links": [
          {
            "label": "Explore the network",
            "href": "/explorer"
          },
          {
            "label": "The visual explanation",
            "href": "/how-it-works"
          },
          {
            "label": "PPL tokenomics",
            "href": "/tokenomics"
          }
        ]
      },
      {
        "id": "start",
        "title": "Start with a wallet",
        "lead": "You do not need your own server to get started.",
        "items": [
          {
            "title": "01 · Create or restore a wallet",
            "text": "Open the wallet and create a new one or restore your own. Keep the recovery phrase somewhere safe outside the website. A password protects local storage; it does not replace a backup of your phrase."
          },
          {
            "title": "02 · Check the connection",
            "text": "The wallet should show Testnet status. If the network seems unavailable, wait a moment and refresh the page."
          },
          {
            "title": "03 · Get test PPL",
            "text": "If the faucet is enabled on this network, request test coins through the available interface. Limits apply. Do not buy test coins on the promise of future income."
          },
          {
            "title": "04 · Try a small transfer",
            "text": "Check the recipient, amount and fee. Leave some PPL for later operations. After sending, find the transaction ID in the explorer and check block inclusion."
          }
        ],
        "links": [
          {
            "label": "Open wallet",
            "href": "/wallet"
          },
          {
            "label": "Check fees",
            "href": "/fees"
          }
        ]
      },
      {
        "id": "earn",
        "title": "Ways to take part",
        "lead": "The network is in its test stage. These are participation mechanisms, not a promise of profit.",
        "items": [
          {
            "title": "Validation · test protocol",
            "text": "Rewards depend on validator participation and network parameters. Registration, a bond and running infrastructure are required. Account for server costs and protocol risks; there is no promised fixed yield. Running an ordinary non-validator node does not earn a reward by itself."
          },
          {
            "title": "Building products · depends on demand",
            "text": "You can test tokens, NFTs and contracts. Creating an asset does not create buyers, liquidity or profit. The protocol cannot guarantee product value or demand."
          },
          {
            "title": "Growth referrals",
            "text": "Two levels, L1 and L2. The 70/30 weights apply to an eligible settlement budget, not the amount of every transfer. Activity, participation age, maturation and caps apply. An invitation alone does not earn a payment. View and claim Growth rewards through the partner portal when you qualify."
          },
          {
            "title": "Mobile participation",
            "text": "One-tap participation sessions from your phone. Rewards depend on verified activity, not on keeping a page open or mining PPL."
          },
          {
            "title": "Proof of humanity",
            "text": "Multi-signal checks without biometrics or raw personal data stored on-chain."
          },
          {
            "title": "Participation points",
            "text": "Points set your share of Community Pool rewards from network fees. They cannot be bought or transferred."
          }
        ],
        "links": [
          {
            "label": "Learn about validators",
            "href": "#validators"
          }
        ]
      },
      {
        "id": "create",
        "title": "Build on the test network",
        "lead": "Choose a tool and verify the result in the explorer.",
        "items": [
          {
            "title": "Token",
            "text": "Choose issuance parameters and understand the allocation rules. The built-in token issuance mechanism allocates 10% of a new token to its community pool. This is not an automatic payment to every PPL holder or a universal rule for arbitrary Solidity contracts."
          },
          {
            "title": "NFT",
            "text": "Prepare metadata and an image, check your rights to the materials and review the fee. An available form does not mean minting is complete: a signed operation must be included in a block."
          },
          {
            "title": "Contract",
            "text": "Deployment requires PPL for gas and source review. Successful compilation is not a security audit. Test operations without real value first."
          }
        ],
        "links": [
          {
            "label": "Create a token",
            "href": "/create/token"
          },
          {
            "label": "Create an NFT",
            "href": "/create/nft"
          },
          {
            "label": "Create a contract",
            "href": "/create/contract"
          }
        ]
      },
      {
        "id": "fees",
        "title": "Where fees go",
        "lead": "A fee pays for a network operation; the transfer amount and its fee are different amounts.",
        "items": [
          {
            "title": "How protocol fees are split",
            "text": "Every protocol fee is split: 30% to validators, 25% to the community pool, 20% to the treasury, 10% to liquidity, 15% to Growth, 0% burned — including fractional fees.",
          },
          {
            "title": "Fractional fees",
            "text": "Protocol v2 applies the same shares to fractional fees, calculated in the smallest PPL units with the remainder going to validators. With no validators, their share goes to Treasury."
          },
          {
            "title": "Check before signing",
            "text": "Different operations have different prices. Contract gas is prepaid; the current mechanism does not refund unused gas on success or revert. The fees page lists the values used by the website."
          }
        ],
        "links": [
          {
            "label": "Fees and pricing",
            "href": "/fees"
          }
        ]
      },
      {
        "id": "node",
        "title": "Connect your own node",
        "lead": "The new joining path uses a ready-made Docker image and one command. No private repository access, wallet or private keys are required.",
        "items": [
          {
            "title": "01 · Prepare Docker",
            "text": "Install Docker and make sure it is running. The first verified image targets Linux amd64 (x86-64). Other platforms are not yet advertised as verified."
          },
          {
            "title": "02 · Check the panel above",
            "text": "Use the command in the panel above. It is pinned to the current public testnet release. Do not substitute other images or network URLs."
          },
          {
            "title": "03 · Copy and run the command",
            "text": "The command downloads a pinned image version, creates the people-node container and the persistent people-node-data volume. Network settings are fetched automatically over HTTPS and saved in the volume. Ordinary followers do not need to choose keys or edit an .env file."
          },
          {
            "title": "04 · Wait for synchronization",
            "text": "Your node connects to the archive seed, receives blocks from genesis and verifies signatures and state changes itself. Time depends on history length and your connection. The API is available only on your computer; ordinary joining does not require opening inbound ports."
          },
          {
            "title": "05 · Verify the result",
            "text": "Open http://localhost:4001/health and http://localhost:4001/chain/head. API availability alone does not prove synchronization: compare height and block data with the network. The next section covers verification and maintenance commands."
          }
        ],
        "links": [
          {
            "label": "Verification and maintenance",
            "href": "#verify"
          },
          {
            "label": "Manual build for developers",
            "href": "#node-manual"
          }
        ]
      },
      {
        "id": "verify",
        "title": "Verify and maintain your node",
        "lead": "Check synchronization, then manage the existing container. Do not repeat docker run each time you want to start your node.",
        "items": [
          {
            "title": "Check the state",
            "text": "After startup, run the commands below on your computer. /health should return JSON with ok:true. /chain/head shows your local height — compare it with the public explorer. A successful /health alone does not prove full sync. The local API has no login; ignore unrelated 401 errors on other websites."
          },
          {
            "title": "Logs, stop and restart",
            "text": "docker logs --tail 100 people-node shows recent messages. docker stop people-node shuts it down gracefully; docker start people-node starts the same container with its saved chain. Restart uses pinned settings even if the configuration server is temporarily unavailable."
          },
          {
            "title": "Keep your data",
            "text": "Keep the people-node-data volume: it contains the chain and pinned network configuration. For manual startup, preserve DATA_DIR. Do not run docker compose down -v for data you need. The /snapshot response is a state overview, not a backup. Use a separate volume for another network."
          },
          {
            "title": "Joining an older chain",
            "text": "Nodes retain a limited history window. An empty node may not catch up if early blocks have already been removed. The new v2 network has an archive mode: a dedicated node retains blocks from genesis for full verification. Enabling archive mode cannot recover previously deleted blocks."
          }
        ],
        "links": [],
        "code": "curl http://127.0.0.1:4001/health\n# {\"ok\":true,\"chainId\":\"people-public-testnet-v2-2026-09-30\",...}\ncurl http://127.0.0.1:4001/chain/head"
      },
      {
        "id": "node-manual",
        "title": "For developers: manual build",
        "lead": "An optional path for developers with source access. Ordinary Docker users do not need this section.",
        "items": [
          {
            "title": "01 · Get the source code",
            "text": "Manual builds need repository access and an approved revision. Take CHAIN_ID, GENESIS_FAUCET_ADDRESS, BOOTSTRAP_ADDRESS, BOOTSTRAP_PEERS and fee parameters from the published v2 network configuration at https://node.peopleblockchain.network/network. Use a separate data directory for a different chain."
          },
          {
            "title": "02 · Prepare the environment",
            "text": "Use Node.js 22 and npm. In the repository you received, run the commands below. Building is required: packages load dist."
          },
          {
            "title": "03 · Prepare .env.node",
            "text": "Set PEER_ID, CHAIN_ID, GENESIS_FAUCET_ADDRESS, BOOTSTRAP_ADDRESS, BOOTSTRAP_PEERS, DATA_DIR, PORT=4001, GOSSIP_PORT=4002 and BIND_HOST=127.0.0.1 in .env.node. EXPECTED_GENESIS_HASH must match genesisHash in the public configuration; TOKEN_CREATE_MIN_FEE and NFT_MINT_MIN_FEE must match its fees. PUBLIC_GOSSIP_URL is only needed for a node accepting inbound gossip connections."
          },
          {
            "title": "04 · Use public settings only",
            "text": "GENESIS_FAUCET_ADDRESS and BOOTSTRAP_ADDRESS are public addresses. DEV_FAUCET_PRIVATE_KEY stays with the faucet and BOOTSTRAP_PRIVATE_KEY stays with the designated initial-block producer. Do not request or copy these secrets to your node."
          },
          {
            "title": "05 · Start the process",
            "text": "Save .env.node inside people-node in your Peoples-Blockchain checkout and restrict file permissions. Do not enable ALLOW_FAUCET or ALLOW_DEV_ENDPOINTS on an ordinary node. Do not expose the HTTP API to the internet without agreed protection."
          }
        ],
        "links": [],
        "code": "git clone https://github.com/rednaxelavoroge/Peoples-Blockchain.git\ncd Peoples-Blockchain/people-node\nnpm ci\nnpm run build\nnode --env-file=.env.node apps/node/dist/index.js"
      },
      {
        "id": "validators",
        "title": "Become a validator",
        "lead": "Run and synchronize an ordinary node first, then coordinate participation with the operator.",
        "items": [
          {
            "title": "Separate key and bond",
            "text": "Create a dedicated validator key and keep it safe. Obtain test PPL for the bond and fee, and confirm current registration parameters and the waiting period. Registration uses a signed join operation; starting a server alone does not register a validator."
          },
          {
            "title": "Enable the role",
            "text": "After registration, configure the matching VALIDATOR_ADDRESS and VALIDATOR_PRIVATE_KEY in the node environment and restart. Follow the operator’s instructions for the current network version and verify actual participation in blocks."
          },
          {
            "title": "Availability matters",
            "text": "If a selected validator goes offline, block production pauses until it is back. Plan maintenance with the operator; do not reset the chain yourself."
          }
        ],
        "links": []
      },
      {
        "id": "participation-depth",
        "title": "Participation Power and rewards",
        "lead": "How your share of the Community Pool is counted.",
        "items": [
          {
            "title": "Participation Power",
            "text": "A personal weight that sets your share of Community Pool payouts from network fees in PPL. You cannot sell or transfer it."
          },
          {
            "title": "Limits per person and epochs",
            "text": "Participation is counted in periods called epochs. Extra activity brings less and less, and each person has a hard limit, so one account cannot take the whole pool."
          },
          {
            "title": "Where the pool money comes from",
            "text": "25% of eligible network fees go to the Community Pool and are paid out each epoch to active participants who qualify."
          },
          {
            "title": "Protection from fake accounts",
            "text": "New accounts gain weight slowly, inactive ones lose it, and limits stop a group of fake accounts from earning much."
          },
          {
            "title": "When nobody qualifies",
            "text": "If no one qualifies in an epoch, nothing is paid out as free income. The pool keeps the money under the protocol rules."
          }
        ],
        "links": [
          {
            "label": "How it works",
            "href": "/how-it-works"
          }
        ]
      },
      {
        "id": "network-architecture",
        "title": "How the network works",
        "lead": "The parts of the network and the rules no one can change by hand.",
        "items": [
          {
            "title": "Consensus and validators",
            "text": "Dedicated validators create and confirm blocks. Phones and browser tabs take part in the network but are not validators."
          },
          {
            "title": "State and storage",
            "text": "Each node keeps the chain state on its own disk. Ordinary nodes may delete old blocks; validators restart from their own data folder."
          },
          {
            "title": "Fixed rules",
            "text": "Fee shares, supply rules and accounting are written into the protocol code, so a website text cannot change them."
          }
        ],
        "links": [
          {
            "label": "Run a node",
            "href": "#node"
          }
        ]
      },
      {
        "id": "product-phases",
        "title": "What you can use",
        "lead": "What already works on the test network and what comes after it. No mainnet date is set.",
        "items": [
          {
            "title": "Available now · test network",
            "text": "Wallet, token and NFT factory, swaps for test PPL, contracts and fee routing."
          },
          {
            "title": "Available now · human network",
            "text": "One-tap participation from your phone, a check that you are a real person without biometrics, and participation points for your share of the Community Pool."
          },
          {
            "title": "After that · apps for everyone",
            "text": "The Hub and tools for creators, built on the same protocol."
          }
        ],
        "links": []
      },
      {
        "id": "ppl-native",
        "title": "PPL — the network coin",
        "lead": "People (PPL) pays for network fees and protocol actions on this chain.",
        "items": [
          {
            "title": "Test coins",
            "text": "Test PPL is for trying the network. Holding test PPL does not mean profit."
          },
          {
            "title": "Fees only in PPL",
            "text": "Transfers, creating a token or NFT, and contract gas are all priced in PPL."
          }
        ],
        "links": [
          {
            "label": "Fees",
            "href": "/fees"
          }
        ]
      },
      {
        "id": "safety",
        "title": "Keep your wallet safe",
        "lead": "Whoever holds the secret can sign operations.",
        "items": [
          {
            "title": "Your recovery phrase is yours alone",
            "text": "Never send your phrase, private key or password to support, a chat, a website form or a repository. A public address and transaction ID are enough to investigate an operation."
          },
          {
            "title": "Before signing",
            "text": "Check the domain, network, recipient, amount and purpose. Try a small amount first. A blockchain does not provide the usual cancellation of an accidental transfer."
          },
          {
            "title": "If you lose access",
            "text": "Look for your own backup of the phrase or key. A website password and chain data cannot recover a lost private key. Do not trust offers to “recover” it for a fee."
          }
        ],
        "links": []
      },
      {
        "id": "help",
        "title": "Common questions",
        "lead": "What to check when something does not work.",
        "items": [
          {
            "title": "Network unavailable",
            "text": "The site cannot reach the network right now. Wait and refresh the page. Do not re-enter secrets into third-party services."
          },
          {
            "title": "I sent a transfer but the balance did not change",
            "text": "Check the transaction ID, block inclusion and network state in the explorer. Check the address and selected network. Do not send a duplicate transfer before finding out what happened to the first."
          },
          {
            "title": "New blocks stopped appearing",
            "text": "Connectivity or an unavailable selected validator may be responsible. Report the observed height and time to the operator. Do not delete node data to try to fix a halt."
          },
          {
            "title": "What to include in a support report",
            "text": "Page address, error text, time, public address and transaction ID. Node operators can add the code SHA, CHAIN_ID and height. Remove secrets from logs; do not send your .env file."
          }
        ],
        "links": []
      }
    ]
  },
  es: docsEs as Guide,
  pt: docsPt as Guide,
  fr: docsFr as Guide,
  de: docsDe as Guide,
  it: docsIt as Guide,
  tr: docsTr as Guide,
  vi: docsVi as Guide,
  id: docsId as Guide,
  zh: docsZh as Guide,
  ar: docsAr as Guide,
};
export function searchSections(sections: GuideSection[], query: string): GuideSection[] {
  const words = query.trim().toLocaleLowerCase().split(/\s+/).filter(Boolean);
  return sections.filter(section => {
    const text = [section.title, section.lead, ...section.items.flatMap(item => [item.title, item.text]), section.code ?? ""].join(" ").toLocaleLowerCase();
    return words.every(word => text.includes(word));
  });
}
