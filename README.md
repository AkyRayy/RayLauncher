<p align="center">
  <img alt="RayLauncher" width="100" src="buildAssets/icon.png">
</p>

<p align="center">
  <img src="https://img.shields.io/badge/Electron-44.2-1d1b16?style=flat-square" alt="Electron">
  <img src="https://img.shields.io/badge/React-19.2-1d1b16?style=flat-square" alt="React">
  <img src="https://img.shields.io/badge/TypeScript-5.9%20strict-1d1b16?style=flat-square" alt="TypeScript">
  <img src="https://img.shields.io/badge/tests-232-1d1b16?style=flat-square" alt="Tests">
  <a href="LICENSE"><img src="https://img.shields.io/badge/license-MIT-1d1b16?style=flat-square" alt="License"></a>
</p>

<p align="center">Лаунчер Minecraft Java Edition для Windows. Установка и запуск написаны по манифестам Mojang, без <code>minecraft-launcher-lib</code>.</p>

![home](docs/screenshots/home.png)

Установщик — на странице [Releases](https://github.com/AkyRayy/RayLauncher/releases). Подписи пока нет, поэтому SmartScreen предупредит при первом запуске.

## Возможности

- 📥 **Скачивание и установка**. Minecraft, Fabric, Quilt, Forge, NeoForge и Java — по официальным манифестам, с проверкой SHA1.
- ⚡️ **Загрузки не вешают интерфейс**. Общая очередь с докачкой и ограничением параллелизма, хеши и распаковка — в отдельных процессах.
- 📚 **Профили-инстансы**. У каждой сборки своя папка, память, Java и аргументы. Версии, библиотеки, ассеты и рантаймы общие.
- 🔥 **Modrinth и CurseForge**. Поиск, разбор зависимостей, обновления по SHA1 файлов, импорт `.mrpack` и модпаков CurseForge.
- 🔒 **Аккаунты**. Microsoft через PKCE, Yggdrasil и authlib-injector, гость с офлайн-UUID. Токены — в `safeStorage`.
- 🧍 **Скины**. Просмотр в 3D, свой PNG 64×64, модели Steve и Alex. Локальный Yggdrasil отдаёт скин гостю без интернета.
- 🎨 **Оформление**. Свой фон — картинка, gif или видео. Две темы, восемь акцентов, палитра команд по <kbd>Ctrl</kbd>+<kbd>K</kbd>.
- 📰 **Новости и обновления**. Лента Minecraft и релизов лаунчера, автообновление через `electron-updater`.
- 🧩 **Без нативных модулей**. SQLite берётся из `node:sqlite`, поэтому `npm install` не требует Build Tools.

## Скриншоты

| Сборки | Моды | Оформление |
|---|---|---|
| ![profiles](docs/screenshots/profiles.png) | ![mods](docs/screenshots/mods.png) | ![appearance](docs/screenshots/appearance.png) |

## Разработка

Нужны Windows 10/11 и Node.js 20.19+.

```bash
git clone https://github.com/AkyRayy/RayLauncher.git
cd RayLauncher
npm install
npm run dev
```

| Команда | Что делает |
|---|---|
| `npm run dev` | Electron с горячей перезагрузкой |
| `npm run dev:web` | интерфейс в браузере на `:5199`, IPC на моках |
| `npm run typecheck` | `tsc` по main и renderer |
| `npm run lint` | ESLint |
| `npm run test` | Vitest, 232 теста |
| `npm run build:win` | NSIS-установщики x64 и arm64 в `release/` |

Собрать под Windows можно и на Linux — тогда нужен `wine`, иначе NSIS не сделает деинсталлятор.

## Лицензия

[MIT](LICENSE)

Проект не связан с Mojang Studios и Microsoft. Minecraft — товарный знак Mojang Studios.
