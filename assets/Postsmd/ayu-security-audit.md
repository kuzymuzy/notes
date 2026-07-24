# Security Audit: AyuGramDesktop

**Дата**: 24 июля 2026
**Версия репозитория**: `HEAD` на момент аудита (git clone --depth 1)
**Объект**: Форк Telegram Desktop (tdesktop) с изменениями от AyuGram
**Методология**: Статический анализ кода — AyuGram-специфичные изменения (директория `source/ayu/` и патчи upstream)
**Исключено из аудита**: Upstream tdesktop (MTProto, основной рендеринг, системные интеграции)

---

## 1. CRITICAL — Незашифрованная локальная база данных

**Файлы**:
- `Telegram/SourceFiles/ayu/data/ayu_database.cpp`
- `Telegram/SourceFiles/ayu/data/entities.h`

**Описание**: SQLite база `./tdata/ayudata.db` хранит:
- Удалённые сообщения (`DeletedMessage`)
- Отредактированные сообщения (`EditedMessage`)
- Историю прочтений (`SpyMessageRead`, `SpyMessageContentsRead`)
- Все regex-фильтры (`RegexFilter`)

в **полностью незашифрованном виде** без единого слоя шифрования (нет SQLCipher, нет шифрования на уровне приложения).

**Схема риска**: Физический доступ к диску или malware с пользовательскими правами → чтение всех сообщений, которые собеседник «удалил», плюс полный трекинг прочтений — какие сообщения пользователь прочитал и когда.

```cpp
auto storage = make_storage(
    "./tdata/ayudata.db",  // !!! hardcoded path, no encryption
    make_table<DeletedMessage>(...),
    make_table<EditedMessage>(...),
    make_table<SpyMessageRead>(...),
    make_table<SpyMessageContentsRead>(...),
);
```

**Upstream-контекст**: Telegram Desktop использует зашифрованное локальное хранилище с ключом, производным от MTProto auth key через PBKDF2. AyuGram полностью обходит эту защиту для своих данных.

**Рекомендация**:
- Использовать SQLCipher или встроить данные в основное зашифрованное хранилище tdesktop
- Или шифровать sensitive-поля перед записью

---

## 2. CRITICAL — Незашифрованный файл настроек

**Файл**: `Telegram/SourceFiles/ayu/ayu_settings.cpp` (строки 30–31, 366–426)

**Описание**: `./tdata/ayu_settings.json` хранит в plain JSON:
- Пер-аккаунт ghost mode конфигурацию (какие типы пакетов подавлять)
- Shadow ban list (user IDs)
- `localPremium` toggle
- `crashReporting` toggle
- Внутренние идентификаторы аккаунтов (user ID)

```json
{
  "ghostModeSettings": {
    "123456789": {
      "sendReadMessages": false,
      "sendOnlinePackets": false,
      "sendReadMessagesLocked": false
    }
  },
  "shadowBanIds": [987654321],
  "localPremium": true,
  "crashReporting": true
}
```

**Риск**: malware может прочитать настройки приватности, определить какие аккаунты мультиаккаунтятся в одном клиенте, и модифицировать файл для отключения ghost mode.

---

## 3. HIGH — Прямые HTTP-запросы к Google/Yandex Translate (утечка данных к третьим сторонам)

**Файлы**:
- `Telegram/SourceFiles/ayu/features/translator/implementations/google.cpp`
- `Telegram/SourceFiles/ayu/features/translator/implementations/yandex.cpp`

**Описание**: Когда выбран не «Telegram», а «Google» или «Yandex» как провайдер перевода, **текст сообщений отправляется напрямую на сервера Google/Yandex** через `QNetworkAccessManager` — в полный обход Telegram MTProto.

```cpp
// Google (google.cpp:106)
constexpr auto kGoogleTranslateUrl =
    "https://translate-pa.googleapis.com/v1/translateHtml";
auto reply = _nam.post(req, body);

// Yandex (yandex.cpp:78)
QUrl url("https://translate.yandex.net/api/v1/tr.json/translate");
auto reply = _nam.post(req, postDataEncoded);
```

**Риск**: Переводимые сообщения (включая приватные переписки) передаются третьей стороне. Пользователь **не предупреждён об этом в UI**. Для сравнения, Telegram API (`messages.translateText`) выполняет перевод на сервере Telegram без раскрытия текста отправляющему клиенту.

**Рекомендация**: Как минимум — добавить диалог-предупреждение при выборе external провайдера. В идеале — убрать прямые HTTP-запросы.

---

## 4. HIGH — Hardcoded Google API ключ

**Файл**: `Telegram/SourceFiles/ayu/features/translator/implementations/google.cpp:30`

```cpp
constexpr auto kGoogleDefaultApiKey =
    "AIzaSyATBXajvzQLTDHEQbcpq0Ihe0vWDHmO520";
```

**Риски**:
- Ключ доступен всем, кто скачает репозиторий
- Google может квотировать/заблокировать ключ при злоупотреблении
- Ключ привязан к учётной записи разработчика — если Google забанит ключ за abuse, это может затронуть разработчика
- Любой может использовать этот ключ для своего трафика

---

## 5. HIGH — Remote Config (RC) система без Certificate Pinning

**Файл**: `Telegram/SourceFiles/ayu/utils/rc_manager.cpp`

**Эндпоинты**:
```cpp
constexpr auto kPrimaryUrl = "https://update.ayugram.one/rc/current/desktop2";
constexpr auto kExteraUrl = "https://api.exteragram.app/api/v1/profiles/compact";
```

Клиент каждые **60 минут** скачивает JSON, который определяет:
- Какие user ID считаются «разработчиками» (получают особый бейдж)
- Какие user ID считаются «официальными каналами»
- Какие пользователи получают кастомные EmojiStatus
- Цены и реквизиты для донатов

**Проблема**: HTTP-запросы используют стандартный TLS (через Qt), **без certificate pinning**. Telegram Desktop использует строгий pinning для всех своих соединений. MiTM-атака на DNS или прокси может подменить ответ.

**Последствия атаки**:
- Поддельные бейджи разработчиков/каналов у любых пользователей
- Фальшивые реквизиты для донатов
- Подмена вердикта «официальный канал» — социальная инженерия

---

## 6. HIGH — Ghost Mode оставляет детектируемую сигнатуру

**Файлы**:
- `Telegram/SourceFiles/ayu/ayu_worker.cpp`
- `Telegram/SourceFiles/ayu/ayu_settings.cpp`

**Описание**: Ghost mode реализован **чисто клиентским подавлением пакетов** — не отправлять read receipts, не отправлять online status, не отправлять upload progress.

Telegram-сервер может детектировать этот паттерн:

```cpp
// ayu_worker.cpp:73 — отправить online, потом offline
session->api().request(MTPaccount_UpdateStatus(
    MTP_bool(true)
)).send();
```

- **Таймер 3 секунды** (строка 86): каждые 3 секунды клиент итерирует все аккаунты
- При включении ghost mode: подавляются read receipts, но `account.updateStatus(true)` всё ещё может быть отправлен
- Scheduled messages как обход read receipts: сообщение отправляется не немедленно, а через `schedule` на ~12 секунд — создаёт тайминговую сигнатуру

**Вывод**: Ghost mode может работать против обычных серверных проверок, но не защищает от целенаправленного анализа трафика со стороны Telegram. Использование — на страх и риск пользователя (возможны ограничения аккаунта).

---

## 7. MEDIUM — Загрузка языковых файлов с CDN без Pinning

**Файл**: `Telegram/SourceFiles/ayu/ayu_lang.cpp:121`

```cpp
url.setUrl(qsl(
    "https://cdn.jsdelivr.net/gh/AyuGram/Languages@l10n_main/values/langs/%1/Shared.json"
).arg(id));
```

**Риск**: CDN-компрометация или DNS-атака может подменить языковые файлы, которые содержат строки UI. Злонамеренная строка в UI — потенциальный вектор для социальной инженерии или эксплуатации через механизмы интернационализации.

---

## 8. MEDIUM — iTunes Search API

**Файл**: `Telegram/SourceFiles/ayu/ui/utils/itunes_search.cpp:698`

```cpp
QUrl url(QString::fromUtf8("https://itunes.apple.com/search"));
```

Поиск иконок приложений для кастомизации. Ещё один внешний HTTP-канал без pinning, без особого риска, но лишняя поверхность атаки.

---

## 9. MEDIUM — Обмен фильтрами через dpaste.com

**Файл**: `Telegram/SourceFiles/ayu/features/filters/filters_utils.cpp:365`

```cpp
QNetworkRequest request(QUrl("https://dpaste.com/api/v2/"));
```

Экспорт/импорт regex-фильтров. Пользовательские фильтры (которые могут содержать чувствительные паттерны) отправляются на сторонний pastebin без предупреждения.

---

## 10. MEDIUM — Spoofing User-Agent в Translator

**Файл**: `Telegram/SourceFiles/ayu/features/translator/implementations/base.cpp:34–36`

```cpp
QString randomDesktopUserAgent() {
    return desktopUserAgents[base::RandomIndex(
        static_cast<int>(desktopUserAgents.size()))];
}
```

Запросы к Google/Yandex API делаются со случайным User-Agent, имитирующим Chrome/Safari/Firefox. Это обходная мера против блокировки со стороны Google/Yandex, но:
- Нарушает ToS этих сервисов
- При проблемах с переводом сложнее диагностировать (User-Agent меняется)
- В сочетании с API-ключом выглядит как попытка маскировки

---

## 11. LOW — Отсутствие ReDoS-защиты в Regex-фильтрах

**Файлы**: `Telegram/SourceFiles/ayu/data/ayu_database.cpp`, `Telegram/SourceFiles/ayu/data/entities.h`

Пользователи могут создавать и делиться regex-фильтрами для содержимого сообщений.

**Риск**: Злонамеренно сформированный паттерн (например, `(a+)+b`) на большом тексте сообщения может заблокировать поток UI через ReDoS. Нет видимого таймаута или guards для regex-оценки.

---

## 12. INFO — Webview Spoofing (Android-маскировка)

**Файл**: `Telegram/SourceFiles/ayu/ayu_settings.h:287`

```cpp
[[nodiscard]] bool spoofWebviewAsAndroid() const { return _spoofWebviewAsAndroid.current(); }
```

Опция вынуждает встроенный webview (боты, TON, mini-apps) подавать User-Agent Android. Это меняет интерфейсы, которые сервер Telegram отдаёт в webview. Потенциально может повлиять на поведение авторизации и обработку данных внутри webview (Android-сборки mini-app иногда имеют иные security свойства, чем desktop).

---

## 13. INFO — Centralized Trust Model (Hardcoded ID + RC)

**Файл**: `Telegram/SourceFiles/ayu/utils/rc_manager.cpp:21–31`

```cpp
std::unordered_set<ID> default_developers = { 139303278, 168769611, 668557709, ... };
std::unordered_set<ID> default_channels = { 1172503281, 1434550607, ... };
```

23 hardcoded Telegram user IDs как «разработчики» и 23 как «каналы». Удалённый сервер может расширять оба списка. Это централизованная trust-модель с единой точкой контроля (мейнтейнер AyuGram).

**Риск**: Не злонамеренный, но если аккаунт мейнтейнера будет скомпрометирован, злоумышленник может получить контроль над badge-системой тысяч пользователей.

---

## 14. INFO — Crash Reporting (не до конца проверено)

Настройка `crashReporting` существует в UI и settings, но в проанализированном коде нет видимой отправки crash-reports на внешний сервер. Вероятно, используется оригинальный механизм Telegram Desktop. Рекомендуется подтвердить через динамический анализ.

---

## Итоговая таблица

| Уровень     | # | Проблема |
|-------------|---|----------|
| **Critical** | 1 | SQLite-база без шифрования |
| **Critical** | 2 | Настройки в plain JSON |
| **High**     | 3 | Текст сообщений уходит Google/Yandex напрямую |
| **High**     | 4 | Google API ключ в коде |
| **High**     | 5 | RC-система без certificate pinning |
| **High**     | 6 | Ghost Mode даёт детектируемый паттерн |
| **Medium**   | 7 | Языковые файлы с CDN без pinning |
| **Medium**   | 8 | iTunes Search без pinning |
| **Medium**   | 9 | Обмен фильтрами через dpaste |
| **Medium**   | 10 | User-Agent spoofing |
| **Low**      | 11 | ReDoS-вектор через regex-фильтры |
| **Info**     | 12 | Webview spoofing |
| **Info**     | 13 | Centralized trust model |
| **Info**     | 14 | Crash Reporting |

---

## Вердикт

Я бы **не стал использовать этот клиент для своих личных аккаунтов**. Вот почему:

**Две критические проблемы (1 и 2) сами по себе disqualify клиент**: любая локальная база данных, хранящая приватные сообщения без шифрования — это не опция, а антипаттерн. Если машина будет скомпрометирована (malware, физический доступ), все «удалённые» собеседником сообщения и история прочтений доступны читающему. Это не гипотетика — это классический вектор атаки на десктопные мессенджеры.

**Проблема 3 (утечка текста сообщений) — вторая красная линия**: перевод через Google/Yandex отправляет текст сообщений третьей стороне без уведомления пользователя. Для клиента, чьё позиционирование — privacy (ghost mode, anti-recall), это прямое противоречие.

**Certificate pinning отсутствует во всех внешних соединениях AyuGram** (RC, translate, locales) — в то время как upstream tdesktop использует строгий pinning. Это означает, что AyuGram слабее защищает свои каналы связи, чем базовый Telegram Desktop.

Позитивные моменты (чего нет в AyuGram):
- Нет модификаций MTProto-шифрования
- Нет воровства credentials
- Нет code injection или remote code execution
- Нет изменения механизма авторизации

Резюме: Если коротко — **использовать небезопасно в том виде, в каком код есть сейчас**. Основная причина — отсутствие шифрования локального хранилища и утечка сообщений через внешние API перевода. Ghost mode и anti-recall — фичи, которые работают, но их цена (локально незащищённые данные) слишком высока.
