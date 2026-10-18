# Выкладка: закрытые медиа и аудит 2026-10-17

Ветка `review/audit-2026-10-17-v2`. Ниже — то, что нельзя сделать сборкой образов: host nginx,
Cloudflare и проверки после запуска.

## Что меняется

- Файлы `posts/`, `comments/`, `messages/` по адресу `/s3/bloomly/…` отдаются только тем, кому
  виден контент со ссылкой на файл. Nginx перед каждой отдачей спрашивает API
  (`auth_request` → `GET /api/media/authz`). Веб передаёт cookie `bloomly_media` (ставится при
  входе и обновлении сессии, `Path=/s3/`), мобильный клиент — заголовок `Authorization`.
- Аватары, баннеры, фоны, стикеры, рамки — публичны, как раньше.
- `private/…`, листинг бакета, запись/удаление и любые другие пути под `/s3/` снаружи — 404/403.
- Старые ссылки в БД не меняются, миграция файлов не нужна.

## Порядок

1. **Сначала API и frontend** (`docker compose up -d --build api frontend`). Новый API ставит
   cookie `bloomly_media` при каждом обновлении сессии (раз в ≤15 минут у открытой вкладки),
   поэтому к моменту переключения nginx у активных пользователей cookie уже будет.
   Миграции применяются сами (`prisma migrate deploy` в команде api): два индекса,
   `20261017200000_media_access_indexes` и `20261017200100_post_created_at_index` (вместе с миграциями
   поиска, ролей групп и журнала кошелька из fix/support-tickets).
   На текущем объёме данных создаются мгновенно.
2. **`.env`**: должен быть задан существующий `POSTGRES_PASSWORD`, совпадающий с паролем в
   `DATABASE_URL` (compose без него не стартует). Проверено 17.10.2026: в рабочем `.env` задан
   и подходит к работающей БД. `YOOKASSA_RECURRING` теперь передаётся в api.
3. **Host nginx** — заменить сайт и проверить:
   ```sh
   cp /etc/nginx/sites-available/bloomly /etc/nginx/sites-available/bloomly.bak-$(date +%F)
   cp deploy/nginx/bloomly.conf /etc/nginx/sites-available/bloomly
   nginx -t && systemctl reload nginx
   ```
   `bloomly.conf` — текущий рабочий конфиг (SEO для ботов, лимиты против флуда, WebSocket) плюс раздел
   «Файлы /s3/». Сниппеты `security-headers.conf`/`bloomly-auth.conf` и `conf.d/seo-bots.conf`,
   `conf.d/ddos-protection.conf` в `deploy/nginx/` — копии установленных, менять их не нужно.
4. **Cloudflare: Purge Cache по префиксу** `https://bloomly.fun/s3/bloomly/posts/`,
   `…/comments/`, `…/messages/` (или Purge Everything). Иначе ранее закэшированные копии
   закрытых файлов продолжат отдаваться с CDN без проверки. Новые ответы помечены
   `Cache-Control: private` и в общий кэш больше не попадут.

## Проверка после выкладки

```sh
# публичный файл — 200, файл закрытого поста без cookie — 403
curl -sI https://bloomly.fun/s3/bloomly/avatars/<файл>.webp | head -1
curl -sI https://bloomly.fun/s3/bloomly/posts/<файл закрытого поста>.webp | head -1
# служебные пути закрыты
curl -sI 'https://bloomly.fun/s3/bloomly/?list-type=2' | head -1     # 404
curl -sI https://bloomly.fun/s3/bloomly/private/x | head -1          # 404
```
В браузере: лента, профиль, переписка с вложениями и видео (перемотка — запросы Range, ответ 206)
открываются как раньше. После выхода из аккаунта картинки закрытых постов не грузятся.

## Откат

`cp /etc/nginx/sites-available/bloomly.bak-<дата> /etc/nginx/sites-available/bloomly && nginx -t && systemctl reload nginx` —
файлы снова отдаются без проверки (как до изменения). API и frontend можно оставить: cookie и
`/api/media/authz` без nginx ни на что не влияют. Индексы безопасно оставить.

## Ограничения

- Ссылку на файл видят все, кто видит пост: доступ решается по записи, а не по ссылке. Если пост
  стал закрытым, решение обновится в течение 30 секунд (кэш в API).
- Мобильный клиент передаёт Bearer в картинках постов (`mediaSource`), но на реальном устройстве
  с Expo это не проверялось.
- Tailwind 4 требует Safari 16.4+, Chrome 111+, Firefox 128+: в более старых браузерах часть
  оформления не применится.
