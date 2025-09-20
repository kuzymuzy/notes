# 🖥️ Аренда хоста
Я не буду долго рассказывать какой хост можно арендовать и как это делать, потому что каждый находит что-то свое, но я бы рекомендовал брать хост за границей (Нидерладны, Финляндия и т.д.).

Если вам интересно, то я использую [HostVDS](https://hostvds.com/?affiliate_uuid=c638d8e0-428b-4ca9-83dc-6a422cb250c2) просто потому, что 12 баксов в год это очень бюджетно)

# 🛠️ Первая настройка хоста

Как ОС я советую Ubuntu 24.04, ну или любую другую Ubuntu, просто потому что система более легкая для новичков. 

Окей, вот мы арендовали хост, поставили систему, и у нас есть пароль от root пользователя => нам стоит подлючится к хосту по ssh. Если вы не знаете как это делать, это ужасно и не понятно зачем вы вообще полезли сюда, но ладно так уж и быть уж ловите команду:

```bash
ssh root@serveip
```

Прекрасно, мы в консоле нашего сервера, давайте обновим все пакеты, что бы проблем меньше было:
```bash
sudo apt update && sudo apt upgrade -y
```
Отлично, пакеты обновили, давайте подумаем про безопасность. Создадим отдельного пользователя:

```bash
sudo usermod -aG sudo имя_пользователя
```

И дадим ему доступ к sudo:

```bash
sudo usermod -aG wheel имя_пользователя
```
Выходим из под root (команда exit если что) и логинемся в нашего пользователя

```bash
ssh newuser@serveip
```

# 📶 Настройка VLESS + Reality

1. Запускаем установочный скрипт XRay:

```
sudo bash -c "$(curl -L https://github.com/XTLS/Xray-install/raw/main/install-release.sh)" @ install
```
2. Генерируем данные, они нам понадобяться дальше:
```
xray uuid
xray x25519
```
3. Дальше нам нужно создать конфиг, так как это терминал редактировать надо через vim, nano ну или что вам там угодно): 
Команда с vim:
```
sudo vim /usr/local/etc/xray/config.json
```

```
{
  "log": {
    "loglevel": "warning"
  },
  "inbounds": [
    {
      "port": 443,
      "protocol": "vless",
      "settings": {
        "clients": [
          {
            "id": "",          // Здесь вставить uuid, сгенерированный на шаге 2 (нижу можно добавить еще пользовательй, uuid легко получаеться либо командой либо на сайтах для генирации)
            "flow": "xtls-rprx-vision"
	        }
	      ],
        "decryption": "none"
      },
      "streamSettings": {
        "network": "tcp",
        "security": "reality",
        "realitySettings": {
          "dest": "87.240.137.164:443", // Тут либо ip vk либо vk.com (лучше ничего тут не менять)
          "serverNames": [
            "vk.com", 
            "www.vk.com"
          ],
          "privateKey": "", // Вставить приватный ключ (Private key), созданный на шаге 2
          "shortIds": [
            "0a381e1fa219", // Список уникальных коротких идентификаторов, доступных клиентам, чтобы их различать
            "be0ce04754dc", // Длина: от 2 до 16 символов. Используемые символы: 0-f. 
            "41beec74f4bc" // Для удобства, значения можно сгенерировать командой `openssl rand -hex 6`
          ]
        },
        "tlsSettings": {
          "fingerprint": "chrome"
        }
      },
      "sniffing": {
        "enabled": true,
        "destOverride": [
          "http",
          "tls"
        ]
      }
    }
  ],
  "outbounds": [
    {
      "protocol": "freedom",
      "tag": "direct"
    },
    {
      "protocol": "dns",
      "tag": "doh",
      "settings": {
        "servers": [
          "https://cloudflare-dns.com/dns-query",
          "https://dns.google/dns-query"
        ]
      }
    }
  ]
}
```

4. Перезагружаем Xray и проверяем работает ли он:
```
systemctl restart xray
systemctl status xray
```
5. Если все окей делаем ссылку для того что бы добавить конфиг:

```
vless://<uuid из шага 2>@<ip сервара>:443?type=tcp&security=reality&pbk=<password из шага 2>&fp=chrome&sni=vk.com&sid=<одно из значений shortIds в конфиге>&flow=xtls-rprx-vision#vlessvk
```

# 📡 Какой клиент использовать для VLESS?

Често, каждому свое, но как по мне самый удобный это [v2RayTun](https://v2raytun.com/) он вроде есть на все платформы и очень простой, тут уже ваш выбор)
