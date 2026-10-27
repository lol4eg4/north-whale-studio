# Как выложить сайт на Netlify

Инструкция для владельца GitHub-аккаунта lol4eg4. Займёт около 15 минут. Домен в Namecheap подключает заказчик по своей инструкции: [how-to-connect-domain-namecheap.md](how-to-connect-domain-namecheap.md).

Netlify сам берёт ветку `production` из GitHub, собирает сайт командой `bun run export` и выкладывает папку `dist/`. Настройки сборки лежат в `netlify.toml`, заголовки и переадресации — в `deploy/`. Токены не нужны.

Перед началом в GitHub должна быть ветка `production`: с неё Netlify выкладывает сайт.

Netlify по-английски. Названия кнопок даны так, как они написаны на сайте.

## Шаг 1. Регистрация

1. Откройте https://app.netlify.com/signup.
2. Нажмите **Sign up with GitHub** и войдите в аккаунт lol4eg4.
3. Нажмите **Authorize Netlify**.
4. Тариф — **Free**. Карта не нужна.

## Шаг 2. Подключение репозитория

1. Нажмите **Add new project**, затем **Import an existing project**.
2. Выберите **GitHub**.
3. Найдите в списке **north-whale-studio**.
   - Его нет в списке: нажмите **Configure the Netlify app on GitHub**. В разделе **Repository access** отметьте north-whale-studio и нажмите **Save**.
4. Настройки:
   - **Project name**: `northwhale-studio`. Если имя занято, возьмите свободное и сообщите его в чат задачи: оно нужно заказчику для записи DNS.
   - **Branch to deploy**: `production`.
   - Команду сборки и папку Netlify возьмёт из `netlify.toml`. Поля не трогайте.
5. Нажмите **Deploy northwhale-studio**.
6. Через 2–3 минуты вверху появится **Published**.
7. Откройте https://northwhale-studio.netlify.app. Должен открыться сайт студии.

## Шаг 3. Домен

1. В меню проекта откройте **Domain management**.
2. Нажмите **Add a domain**, впишите `northwhale.studio` без www, нажмите **Verify**, затем **Add domain**.
3. Netlify сам добавит www.northwhale.studio. Основной адрес — без www, с www Netlify переводит на него.
4. Netlify покажет **Awaiting External DNS**. Дальше заказчик добавляет записи в Namecheap.

## Шаг 4. HTTPS

1. Когда заказчик добавит записи, откройте **Domain management**, раздел **HTTPS**.
2. Нажмите **Verify DNS configuration**.
3. Сертификат Netlify выпустит сам, обычно за час. Готово, когда написано **Your site has HTTPS enabled**.
4. Через сутки сертификата нет: нажмите **Provision certificate**.

## Как выходят новые версии

- Сайт обновляется сам, когда меняется ветка `production`.
- Каждая выкладка видна в **Deploys**. Откатиться к прошлой: открыть её и нажать **Publish deploy**.
- Что отдаёт сайт сейчас: https://northwhale.studio/health показывает коммит.

## Лимиты бесплатного тарифа

- 300 кредитов в месяц. Гигабайт трафика стоит 20 кредитов, выкладка в production — 15.
- Главная страница весит около 1 МБ, полный ролик кейса — от 1 до 19 МБ.
- Хватает примерно на 10 000 посещений без роликов или на 1500–2000 посещений с одним роликом.
- Кредиты кончились — все сайты команды выключаются до начала следующего месяца.
- Расход: **Team settings** → **Usage & billing**. Платный тариф — от 9 $ в месяц.
