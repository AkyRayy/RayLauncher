# RayLauncher — план файлов и порядок реализации

**Статус:** этапы 1–3 (каркас, ядро Minecraft, запуск) выполнены — см. README.md. Дальше идём по таблице «Порядок реализации».
Решения, принятые при старте: публичный `CLIENT_ID` официального лаунчера, хранилище — встроенный `node:sqlite`
(нативных модулей и `@electron/rebuild` в проекте нет), код выдаётся файлами в воркспейс.
**Стек:** Electron 44.2.0 · electron-vite 5 · React 19.2.8 · TS 5 strict · Tailwind 4.3.3 · zustand 5 · framer-motion 13 · better-sqlite3 13 · zod · electron-builder 26 (NSIS, win x64 + arm64).

---

## 0. Архитектурные решения (фиксируем до кода)

| Решение | Как | Почему |
|---|---|---|
| Границы процессов | `main` = единственный источник правды (SQLite + electron-store), `renderer` = подписчик через zustand | Правило §5 «никакого дублирующего состояния» |
| Контракт IPC | Один файл `shared/ipc.ts`: карта `канал → { req, res }` + карта событий `канал → payload`. `preload` генерирует `window.ray` строго по этой карте | Нельзя добавить канал, не обновив тип с обеих сторон |
| Валидация | `shared/schemas.ts` — zod для каждого `req`. Обёртка `registerHandler()` в main: parse → handler → лог (канал, ms, код) → `RayError` при провале | Требование §4 безопасности |
| Тяжёлые операции | `utilityProcess`: `hash.worker` (SHA1 стримом), `unzip.worker` (natives, mrpack) | main не блокируется никогда |
| Пути | Все пути живут только в main (`core/paths.ts`). Renderer оперирует id (`profileId`, `taskId`, `modId`) | Нет `../`-инъекций |
| Секреты | `secrets.ts`: `safeStorage.encryptString` → base64 в electron-store. В логах маска через `logger.ts` (`RpsTicket`, `access_token`, `refresh_token`, `password`, `prefetched`, `x-api-key`) | §6 ограничений |
| Сеть | Один `core/http.ts`: `undici`-совместимый fetch, `User-Agent: RayLauncher/1.0.0 (+github.com/…)`, таймаут 30с, 3 ретрая с экспонентой + джиттер, `Range`-resume, учёт `x-ratelimit-remaining` Modrinth | Modrinth 403 без UA, §4 загрузок |
| Кэш файлов игры | Общие: `games/versions`, `games/libraries`, `games/assets`, `games/jre`. Персональные: `games/instances/{profileId}` | Библиотеки шарятся между профилями |
| Версии игры | Порядок и «последняя» — строго из манифеста по `releaseTime`. Ни одного `semver.compare` в проекте (lint-правило на импорт semver) | `26.2` > `1.21.11` |

### Дизайн: как совместить «Apple-like» с анти-слоп-правилами
Спецификация просит стекло и мягкость, скилл-набор запрещает «glassmorphism на всём». Компромисс, которого держимся:
- Стекло — **только** на трёх поверхностях: сайдбар, модалка/шит, command palette. Карточки, кнопки и списки — плотные, непрозрачные.
- Ноль градиентов на фонах (особенно фиолетово-синих). Акцент — заливка ≤ 8% площади: активный пункт сайдбара, кнопка «Играть», кольцо прогресса, фокус-кольцо.
- Иконки — один инлайн-SVG-набор (`components/icons`), нарисованный под 1.5px штрих. **Никаких эмодзи в интерфейсе**; эмодзи допустимы только как пользовательская иконка профиля (это данные, а не UI).
- Радиусы 6/10/14/20 — по назначению (контрол/карточка/панель/окно), без `rounded-full` на всём.
- Тени — по одной на уровень (`--shadow-1/2/3`), не «суп» из четырёх.
- Тексты интерфейса — конкретные: «Скачиваю библиотеки · 84 из 131 · 12,4 МБ/с», а не «Загрузка…». Пустые состояния объясняют следующий шаг.
- Анимации только `transform`/`opacity`; `prefers-reduced-motion` вырубает всё, кроме мгновенной смены состояния.

---

## 1. Дерево файлов

```
RayLauncher/
├─ package.json                     скрипты dev/build/build:win/rebuild/lint/typecheck/test, зависимости точных версий
├─ electron.vite.config.ts          три сборки (main/preload/renderer), alias @shared @main @renderer, externals для better-sqlite3
├─ electron-builder.yml             NSIS x64+arm64, ico, ассоциация .mrpack, publish: github
├─ tsconfig.json / tsconfig.node.json / tsconfig.web.json   strict, noUncheckedIndexedAccess, paths
├─ vitest.config.ts                 юнит-тесты node-окружения
├─ eslint.config.js                 flat config: ts strict, react-hooks, запрет semver/eval/shell
├─ .npmrc .gitignore .editorconfig .env.example
├─ build/
│  ├─ icon.ico                      16/32/48/256
│  ├─ installer.nsh                 доп. шаги NSIS (ассоциация .mrpack)
│  └─ auth-success.html             страница «Можно закрыть это окно» для loopback OAuth
├─ resources/
│  ├─ skins/steve.png alex.png      дефолтные скины гостя
│  └─ icons/presets/*.svg           пресеты иконок профилей
│
├─ src/shared/                      # общий код main ↔ renderer, без побочных эффектов
│  ├─ types.ts                      Account, Profile, ModEntry, DownloadTask, LoaderKind, стадии запуска
│  ├─ ipc.ts                        карта каналов invoke + карта событий main→renderer (единственный контракт)
│  ├─ schemas.ts                    zod-схемы всех входов IPC и ответов внешних API
│  ├─ errors.ts                     RayError { code, message, details }, коды NET_OFFLINE…GAME_CRASHED, isRayError
│  ├─ constants.ts                  URL Mojang/Modrinth/CF/Fabric/NeoForge/Forge/Quilt, UA, лимиты, дефолты
│  └─ util.ts                       formatBytes, formatSpeed, clamp, чистые хелперы для обеих сторон
│
├─ src/main/
│  ├─ index.ts                      bootstrap: single-instance, protocol, готовность БД, регистрация IPC, tray, updater
│  ├─ window.ts                     frameless 38px titlebar, transparent+roundedCorners, acrylic, восстановление геометрии
│  ├─ tray.ts                       трей при «свернуть при запуске игры»
│  ├─ updater.ts                    electron-updater, каналы stable/beta, события в renderer
│  ├─ logger.ts                     electron-log 10 МБ × 5 + маскирование секретов + перехват uncaughtException
│  ├─ ipc/
│  │  ├─ registry.ts                типизированный handle(): zod-валидация, тайминги, преобразование ошибок
│  │  ├─ system.ipc.ts              окно (min/max/close), openExternal с белым списком, openPath, выбор файла/папки
│  │  ├─ settings.ipc.ts            чтение/запись настроек, смена пути игр с переносом, сброс
│  │  ├─ accounts.ipc.ts            список/добавление MS, гость, yggdrasil, активный, выход, обновить скин
│  │  ├─ profiles.ipc.ts            CRUD, дублирование, экспорт/импорт, открыть папку, crash-reports
│  │  ├─ versions.ipc.ts            манифест версий, версии загрузчиков, поддерживаемые версии игры
│  │  ├─ java.ipc.ts                список установленных JRE, проверка custom-пути, установка компонента
│  │  ├─ install.ipc.ts             установка/починка версии, стадии, отмена
│  │  ├─ launch.ipc.ts              запуск/остановка, состояние, поток лога игры
│  │  ├─ mods.ipc.ts                поиск, проект, версии, установка/удаление/вкл-выкл, обновления, импорт паков
│  │  ├─ downloads.ipc.ts           очередь, пауза/возобновление/отмена/повтор, показать в папке
│  │  └─ news.ipc.ts                новости Mojang + changelog GitHub
│  ├─ core/
│  │  ├─ paths.ts                   userData, games/*, instances, natives, безопасный join, проверка >260 символов и OneDrive
│  │  ├─ fsx.ts                     ensureDir, атомарная запись (tmp+rename), безопасное удаление, размер каталога
│  │  ├─ http.ts                    fetch-обёртка: UA, таймаут, ретраи, Range, JSON+zod, лимиты Modrinth
│  │  ├─ hash.ts                    sha1/sha512 через worker-пул, verifyFile(path, sha1, size)
│  │  ├─ zip.ts                     распаковка через worker: natives (фильтр META-INF + exclude), mrpack, cf-zip
│  │  ├─ queue.ts                   пул с настраиваемой параллельностью 1–32, приоритеты, отмена, агрегат байтов
│  │  ├─ events.ts                  типизированная шина main→renderer (по карте из shared/ipc.ts)
│  │  └─ processes.ts               spawn-обёртка (execFile-семантика, никакого shell), убийство дерева
│  ├─ db/
│  │  ├─ database.ts                node:sqlite (DatabaseSync), WAL, миграции при старте
│  │  ├─ migrations/001_init.sql    profiles, mods, accounts_meta, downloads_history, cache_kv
│  │  ├─ profiles.repo.ts  mods.repo.ts  accounts.repo.ts  cache.repo.ts
│  ├─ store/
│  │  ├─ settings.store.ts          electron-store со схемой: язык, тема, акцент, пути, параллельность, CF key флаг, прокси
│  │  └─ secrets.ts                 safeStorage: refreshToken, cf-api-key, yggdrasil-пароли не храним
│  ├─ minecraft/
│  │  ├─ manifest.ts                version_manifest_v2 + кэш 15 мин, сортировка по releaseTime
│  │  ├─ versionJson.ts             загрузка, кэш в versions/{id}/{id}.json, рекурсивный мерж inheritsFrom
│  │  ├─ rules.ts                   вычисление rules (os.name/version/arch, features), чистая функция
│  │  ├─ maven.ts                   maven-координаты → относительный путь + список репозиториев-фолбэков
│  │  ├─ libraries.ts               фильтр по rules, план загрузки, classifiers natives (${arch})
│  │  ├─ natives.ts                 распаковка нужных jar в instances/{id}/natives, ретрай при FILE_LOCKED
│  │  ├─ assets.ts                  assetIndex → objects (дедуп по hash), indexes/{id}.json, legacy virtual
│  │  ├─ logging.ts                 log4j-конфиг при complianceLevel ≥ 1
│  │  ├─ installer.ts               оркестратор шагов 1–8, идемпотентность по sha1, события install:stage
│  │  ├─ repair.ts                  «Починить установку»: полная перепроверка sha1 и до-скачивание
│  │  ├─ arguments.ts               плейсхолдеры, value string|array|object-with-rules, legacy minecraftArguments
│  │  ├─ classpath.ts               сборка classpath через ';', пути с пробелами и кириллицей
│  │  ├─ launcher.ts                spawn java, стадии idle→…→running, exit code, стоп
│  │  ├─ logParser.ts               регулярки этапов, уровни лога, проценты
│  │  ├─ crashReport.ts             поиск свежего crash-report, вытяжка причины
│  │  └─ java/
│  │     ├─ runtimeManifest.ts      all.json Mojang → компоненты для windows-x64/arm64
│  │     ├─ javaManager.ts          установка компонента, проверка bin/java.exe, выбор по versionJson.javaVersion
│  │     └─ detect.ts               ручной путь: java -version → major, маппинг и понятная ошибка
│  ├─ loaders/
│  │  ├─ index.ts                   единый интерфейс LoaderProvider { listVersions, install }
│  │  ├─ fabric.ts  quilt.ts        meta API → готовый profile json с inheritsFrom
│  │  ├─ neoforge.ts  forge.ts      maven/promotions → installer.jar → --installClient через установленный JRE
│  │  └─ installerRunner.ts         запуск installer.jar, парсинг вывода, контроль результата
│  ├─ auth/
│  │  ├─ microsoft.ts               PKCE S256, свободный loopback-порт, state, таймаут 5 мин, отмена
│  │  ├─ xbox.ts                    XBL + XSTS, разбор ошибок 2148916233/235/238 в русские коды
│  │  ├─ minecraftServices.ts       login_with_xbox, entitlements, profile (404 → MS_NO_PROFILE)
│  │  ├─ tokenRefresher.ts          рефреш за 5 мин до истечения и перед каждым запуском
│  │  ├─ offline.ts                 UUID v3 от "OfflinePlayer:{nick}", валидация ника
│  │  ├─ yggdrasil.ts               внешний auth-сервер: authenticate, refresh, выбор профиля, prefetched base64
│  │  ├─ authlibInjector.ts         скачивание v1.2.8 из GitHub, сборка -javaagent аргументов
│  │  ├─ localYggdrasil.ts          встроенный мини-Yggdrasil на 127.0.0.1 для «своих скинов офлайн»
│  │  ├─ skins.ts                   кэш скинов, валидация PNG 64×64/64×32, загрузка своего
│  │  └─ accountManager.ts          хранение аккаунтов, активный, история гостевых ников
│  ├─ mods/
│  │  ├─ modrinth.ts                search/facets, project, versions, version_files, tags — все ответы через zod
│  │  ├─ curseforge.ts              то же за x-api-key, мягкое отключение без ключа
│  │  ├─ resolver.ts                рекурсивные зависимости, incompatible-блок, embedded-пропуск, защита от циклов
│  │  ├─ modManager.ts              установка/удаление/вкл-выкл (.jar.disabled), запись в SQLite
│  │  ├─ updates.ts                 POST version_files по sha1 → доступные обновления, «обновить всё»
│  │  ├─ localScan.ts               скан mods/, опознание по sha1, drag&drop-импорт
│  │  ├─ mrpack.ts                  modrinth.index.json + overrides
│  │  └─ cfpack.ts                  manifest.json + overrides
│  ├─ downloads/
│  │  ├─ manager.ts                 очередь, скорость, пауза/отмена/повтор, события download:progress
│  │  └─ task.ts                    одна загрузка: Range-resume, sha1-проверка, атомарное завершение
│  ├─ news/news.ts                  launchercontent news.json (кэш 15 мин) + GitHub releases
│  └─ workers/
│     ├─ hash.worker.ts             стриминговый SHA1/SHA512
│     └─ unzip.worker.ts            распаковка архивов
│
├─ src/preload/
│  ├─ index.ts                      contextBridge.exposeInMainWorld('ray', api) — генерация из shared/ipc.ts
│  ├─ api.ts                        invoke-обёртки + подписки on<Event>() с отпиской
│  └─ index.d.ts                    declare global Window.ray
│
└─ src/renderer/
   ├─ index.html                    CSP без unsafe-eval, корневой div
   └─ src/
      ├─ main.tsx  App.tsx  router.tsx        точка входа, layout, роуты
      ├─ styles/theme.css                     @theme Tailwind 4: цвета light/dark, 8 акцентов, радиусы, тени, шкала типографики
      ├─ styles/globals.css                   базовые слои, скроллбары, focus-visible, reduced-motion
      ├─ i18n/{index.ts,ru.ts,en.ts,errorCodes.ru.ts}   русский по умолчанию, коды ошибок → тексты
      ├─ lib/{api.ts,format.ts,cn.ts,fuzzy.ts,markdown.ts,motion.ts}   обёртка window.ray, sanitize-html, пресеты анимаций
      ├─ stores/{settings,accounts,profiles,mods,downloads,launch,toasts}.store.ts   zustand, обновляются событиями main
      ├─ components/ui/              Button, IconButton, SegmentedControl, Switch, Slider, Select, Field, Tabs,
      │                              Modal, Sheet, Toast, Tooltip, Skeleton, EmptyState, ProgressRing, CommandPalette,
      │                              Card, Badge, ScrollArea
      ├─ components/chrome/          TitleBar (drag-region + свои кнопки), Sidebar (240/68px), LaunchBar,
      │                              AccountSwitcher, DownloadsBadge, StageIndicator
      ├─ components/icons/           один инлайн-SVG-набор, штрих 1.5px
      ├─ components/skin/SkinViewer3D.tsx      skinview3d: вращение, ходьба, classic/slim
      ├─ features/…                  ProfileCard, ProfileWizard, ModCard, ModFilters, ModVersionList,
      │                              DependencyDialog, DownloadRow, LogViewer, JavaPicker, MemorySlider,
      │                              AccountCards, NicknameField
      └─ pages/                      Welcome, Home, Profiles, ProfileSettings, ModsCatalog, ModPage,
                                     ModsInstalled, Accounts, Downloads, News, Logs,
                                     Settings/{General,Java,Downloads,Mods,Appearance,Advanced,About}
tests/
  rules.test.ts (≥12 кейсов) · versionJson.test.ts (мерж inheritsFrom) · arguments.test.ts (плейсхолдеры, string|array)
  resolver.test.ts (required/optional/embedded/incompatible/цикл A→B→A) · offline.test.ts (известные ник→uuid)
  paths.test.ts (Windows-пути, пробелы, кириллица, >260) · maven.test.ts · logParser.test.ts
```

**Объём:** ~150 файлов, ориентировочно 14–18 тыс. строк.

---

## 2. Порядок реализации (по одному этапу за сообщение)

| Этап | Содержание | Проверяемый результат |
|---|---|---|
| **1. Каркас** ✅ | Конфиги, `shared/*`, `logger`, `paths`, `http`, окно + тайтлбар + сайдбар, дизайн-токены, роутер со всеми экранами, i18n, `registry.ts`, тесты `paths`/`rules` | Готово: `typecheck`, `lint`, 39 тестов и `electron-vite build` проходят |
| **2. Ядро Minecraft** ✅ | manifest, versionJson+inheritsFrom, rules, maven, libraries, assets, natives, logging, java-менеджер, downloads-очередь, installer | Ванильная версия скачивается целиком с прогрессом |
| **3. Запуск** ✅ | arguments, classpath, launcher, logParser, crashReport, состояния, кнопка «Играть» → кольцо прогресса, консоль-шит | Готово: команда собирается из живых метаданных 26.2 / 1.12.2 / 1.7.10, 126 тестов зелёные |
| **4. Аккаунты** ✅ | MS PKCE + XBL/XSTS + профиль, refresher, offline, yggdrasil + authlib-injector, локальный Yggdrasil, скины, экран `/accounts` | Готово: три способа входа, токены в safeStorage, 3D-скин, 162 теста зелёные |
| **5. Профили и загрузчики** ✅ | SQLite-репозитории, CRUD профилей, мастер создания, fabric/quilt/neoforge/forge, память/Java/аргументы | Готово: инстансы в `instances/{id}`, мастер создания, версии загрузчиков из их API, 173 теста зелёные |
| **6. Моды** ✅ | modrinth, resolver, modManager, updates, localScan, mrpack/cfpack, curseforge, `/mods` и `/mods/installed` | Готово: каталог Modrinth (+CurseForge по ключу), установка с зависимостями, обновления по sha1, импорт `.mrpack`, 191 тест |
| **7. Полировка и релиз** ✅ | Новости, настройки целиком, `/logs`, command palette, тосты, автообновление, NSIS-сборка, полный набор тестов, README | Готово: лента новостей, палитра Ctrl+K, тосты, автообновление, 232 теста; `npm run build:win` собирает NSIS x64 + arm64 |

---

## 3. Что нужно от тебя перед стартом

1. **Azure `CLIENT_ID`** — по умолчанию подставлю публичный ID официального лаунчера с возможностью заменить в настройках, либо впиши свой.
2. **`better-sqlite3`** тянет нативную пересборку под Electron 44 (`@electron/rebuild`). Оставляем как в спецификации или заменить каталог модов на JSON-хранилище (проще собирать, но медленнее на больших списках)?
3. **Ограничение среды:** этот воркспейс — Linux-песочница. Код будет писаться строго под Windows (пути, `;`, `java.exe`, NSIS), `typecheck`/`lint`/`vitest` я гоняю здесь, а `npm run dev` и `build:win` проверяешь ты на Windows.
