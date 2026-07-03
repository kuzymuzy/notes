# Инструкция по настройке MasterDnsVPN

Полный гайд от установки сервера до оптимальной клиентской настройки.

---

## Что нужно перед началом

- Домен (у примера: `kuzymuzy.ru`)
- VPS за рубежом с доступным портом 53/UDP
- Mac / Linux / Windows для клиента

---

## Шаг 1. DNS-записи

Нужны **две записи**: A-запись создаёт "имя-указатель" на IP сервера, а NS-запись делегирует туннельный поддомен этому имени.

| Тип | Имя (Host) | Значение |
|---|---|---|
| **A** | `ns` | `IP_твоего_VPS` |
| **NS** | `v` | `ns.kuzymuzy.ru` |

⚠️ Если DNS-зона на Cloudflare — обе записи должны быть в режиме **DNS only** (серое облако), не проксируемые.

**Проверка после пропагации (может занять от минут до 48ч):**
```bash
dig v.kuzymuzy.ru NS
dig @ns.kuzymuzy.ru v.kuzymuzy.ru A
```
Если ответ `NOERROR` (не timeout) — всё настроено верно.

---

## Шаг 2. Установка сервера

На VPS по SSH:
```bash
curl -Ls https://raw.githubusercontent.com/masterking32/MasterDnsVPN/main/server_linux_install.sh -o install.sh
sudo bash install.sh
```
(Скачиваем в файл, а не через `sudo bash <(curl ...)` — иначе бывает ошибка `/dev/fd/63: No such file or directory`.)

При запросе домена вводи ровно тот, что в NS-записи: `v.kuzymuzy.ru`.

В конце сохрани содержимое `encrypt_key.txt` — этот ключ нужен для клиента.

**Проверка после установки:**
```bash
sudo systemctl status masterdnsvpn
sudo ss -ulpn | grep :53
```
Порт 53/UDP должен быть открыт в firewall (`ufw allow 53/udp`) и в security group хостера.

---

## Шаг 3. Установка клиента (Mac)

```bash
# Apple Silicon
curl -Ls -o masterdnsvpn-client https://github.com/masterking32/MasterDnsVPN/releases/latest/download/masterdnsvpn-darwin-arm64
# Intel — заменить arm64 на amd64

chmod +x masterdnsvpn-client
xattr -d com.apple.quarantine masterdnsvpn-client

curl -Ls -o client_config.toml https://raw.githubusercontent.com/masterking32/MasterDnsVPN/main/client_config.toml.simple
curl -Ls -o client_resolvers.txt https://raw.githubusercontent.com/masterking32/MasterDnsVPN/main/client_resolvers.simple
```

---

## Шаг 4. Список резолверов (`client_resolvers.txt`)

Ниже — набор, который на практике показал **максимальный MTU (Upload 139 / Download 3603)** в тестах на Москву/МТС. Обязательно перепроверь через MTU-тест клиента в своей сети — резолверы отличаются по регионам и операторам.

```
77.88.8.8
77.88.8.7
77.88.8.3
77.88.8.1
77.88.8.88
77.88.8.2
213.87.2.88
213.87.74.5
212.188.4.10
213.87.74.21
213.87.211.20
213.87.210.20
213.87.99.120
213.87.99.100
213.87.0.1
```

**Как проверить и почистить пул под свою сеть:**
1. Запусти клиента, дай пройти MTU discovery
2. В логе смотри `Download MTU` по каждому резолверу
3. Резолверы с MTU сильно ниже максимума (`Optimizer dropped ... Outlier`) — можно удалить из файла, они только замедляют тест при следующих запусках
4. Резолверы с `UPLOAD_MTU=0 / Rejected` — не поддерживают туннель, тоже удалить

---

## Шаг 5. Ключевые настройки `client_config.toml`

| Параметр | Значение | Зачем |
|---|---|---|
| `DOMAINS` | `["v.kuzymuzy.ru"]` | твой туннельный поддомен |
| `ENCRYPTION_KEY` | из `encrypt_key.txt` | обязательно, иначе сессия не поднимется |
| `RESOLVER_BALANCING_STRATEGY` | `8` | Least Loss Top Round Robin — параллельная нагрузка среди лучших 10% резолверов вместо одного "чемпиона" |
| `PACKET_DUPLICATION_COUNT` | `1` | на стабильной сети дублирование не нужно, экономит полосу (на нестабильной — можно `2-3`) |
| `SETUP_PACKET_DUPLICATION_COUNT` | `4` | дублирование только для установки сессии — не бьёт по постоянной скорости |
| `UPLOAD_COMPRESSION_TYPE` / `DOWNLOAD_COMPRESSION_TYPE` | `2` (LZ4) | сжатие полезной нагрузки, особенно важно при узком Upload MTU |
| `LOCAL_DNS_ENABLED` | `true` | свой локальный DNS-кэш, снижает нагрузку и защищает от возможного DNS-перехвата оператором |
| `SESSION_INIT_RACING_COUNT` | `3-5` | параллельные попытки инициализации сессии для надёжности |
| `AUTO_REMOVE_LOW_MTU_SERVERS` | `true` | автоматически выкидывает медленные резолверы из синхронизации MTU |

---

## Шаг 6. Запуск и проверка

```bash
./masterdnsvpn-client -config client_config.toml
```

В логе смотри:
- `Selected Synced Upload/Download MTU` — чем ближе к 139/3603, тем лучше
- `SOCKS5 Proxy server is listening on 127.0.0.1:18000`

**Проверка туннеля напрямую (не через браузер):**
```bash
curl --socks5 127.0.0.1:18000 https://ifconfig.me
```
Должен вернуться IP твоего VPS.

**Тест скорости (не через speedtest.net — он врёт по SOCKS5, особенно на upload):**
```bash
# download
curl --socks5 127.0.0.1:18000 -o /dev/null -w "%{speed_download}\n" https://proof.ovh.net/files/100Mb.dat

# upload
dd if=/dev/urandom of=test50k.bin bs=1024 count=50
curl --socks5 127.0.0.1:18000 -X POST -F "file=@test50k.bin" http://httpbin.org/post -w "\nUpload: %{speed_upload}\n" -o /dev/null -s
```

---

## Шаг 7. Настройка системы/браузера

**Firefox** (проще для теста):
```
about:preferences → Network Settings → Manual proxy configuration
SOCKS Host: 127.0.0.1   Port: 18000
✅ SOCKS v5
✅ Proxy DNS when using SOCKS v5   ← обязательно
```

**Системный прокси Mac:**
```
Системные настройки → Сеть → Wi-Fi → Подробнее → Прокси-серверы → SOCKS Proxy
127.0.0.1 : 18000
```

---

## Реалистичные ожидания по скорости

DNS как транспорт физически ограничен (маленький размер UDP-пакета, round-trip на каждый запрос). При хорошей настройке реалистично получить единицы–десятки Мбит/с на download и заметно меньше на upload (десятки-сотни Кбит/с) — этого достаточно для браузинга и мессенджеров, но не для стриминга/торрентов.
