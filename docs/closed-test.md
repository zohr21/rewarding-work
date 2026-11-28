# Closed test on Google Play

New personal developer accounts must run a **closed test with at least 12 testers opted in
for 14 days in a row** before they can apply for production. This page is the checklist,
in order. Each step says who does it. How to build and sign is in `release.md`. The Console
answers are in `play-console-answers.md`, and the listing text is in `play-listing.md`.

Prepared 14 Nov 2026. The Play bundle (`app.grovyn`, version 0.1.0, versionCode 100) builds
with `npm run release`, signed with the upload key made on 14 Nov.

## 1. Upload key (you, once, about 5 minutes)

It asks for passwords, so you run it yourself, in a terminal:

```bash
mkdir -p ~/.grovyn
"/c/Program Files/Android/Android Studio/jbr/bin/keytool.exe" -genkeypair -v -keystore ~/.grovyn/grovyn-upload.jks -alias upload -keyalg RSA -keysize 2048 -validity 10000
```

Then create `C:\Users\<you>\.grovyn\keystore.properties` with the four lines from
`release.md`. **Save the `.jks` file and both passwords in your password manager now.**
Keep them out of OneDrive and out of the repository.

## 2. Signed bundle (Claude, or you: `npm run release`)

- Builds `grovyn-play-0.1.0.aab` and signs it with the key from step 1.
- The script says "Signed" or "Not signed". Only a signed one uploads.

## 3. Play Console: create the app (you)

1. *Create app*. Name it **Grovyn**, choose *App*, *Free*, and accept the declarations.
2. *Test and release → Closed testing → Create track*. Call the track "Friends".
3. *Testers*: choose **Email list**, make a list called "Grovyn testers", and add the
   addresses people give you. (A Google Group also works, if you'd rather people join on their own.)
4. *Feedback URL or email*: `grovyn.support@gmail.com`.
5. *Countries*: at least Azerbaijan, plus wherever your testers live.
6. *Create release*:
   - Upload the `.aab` and keep **Play App Signing** on.
   - Paste the release notes from section 6 below.
7. Before the release can go out, Play asks for the forms. Each one has an answer in `play-console-answers.md`:
   - privacy policy URL;
   - app access;
   - ads ("No");
   - content rating;
   - target audience;
   - Data safety;
   - Health apps and Health Connect declarations;
   - financial features.
8. *Store listing*:
   - short and full description in English, Russian and Azerbaijani (from `play-listing.md`);
   - icon `public/icons/icon-512.png`;
   - feature graphic and screenshots from `docs/store/<lang>/`.
9. *Send for review*. The first review can take a few days. Testers can install once it passes.

## 4. Firebase, right after the first upload (you)

Google sign-in fails in the Play build until both SHA-1s are added to the `app.grovyn` Android
app in Firebase:
- the **upload key's** SHA-1, from `keytool -list -v -keystore ~/.grovyn/grovyn-upload.jks -alias upload`;
- **Play's app signing key's** SHA-1, from *Test and release → App integrity*.

## 5. Testers (you, starting today)

- Ask for **15 or more**. Some people never tap the opt-in link, and you need 12 still opted
  in on every one of the 14 days.
- They need an Android phone and the Gmail address they use on Google Play.
- Each tester must open the **opt-in link** (*Closed testing → Testers → Copy link*) and tap
  *Become a tester*, then install from Play. Being on the list alone doesn't count.
- The 14 days start when 12 have opted in. Leaving the test resets nothing for the others,
  but if fewer than 12 are in on any day, the count starts again.
- Google also looks at whether testers actually use the app and send feedback, so ask them
  to open it a few times a week and tell you one thing that confused them.

### Call for testers (Instagram story, LinkedIn)

Short enough for a story. People reply with their Gmail; then they get the invite below.

**English**

> 🌱 Looking for testers for my app Grovyn: a focus timer and tasks in small steps.
> 1. Send me the Gmail you use on Google Play (Android only)
> 2. You'll get a link: tap "Become a tester" and install the app
> 3. Keep it installed for 14 days and open it a few times a week
> 4. Tell me what was confusing
> Free, no ads. DM me 🙌

**Azərbaycanca**

> 🌱 Grovyn tətbiqim üçün testçilər axtarıram: fokus taymeri və kiçik addımlarla işlər.
> 1. Google Play-də istifadə etdiyin Gmail ünvanını mənə göndər (yalnız Android)
> 2. Sənə link gələcək: «Testçi ol» düyməsinə bas və tətbiqi yüklə
> 3. 14 gün silmə və həftədə bir neçə dəfə aç
> 4. Nə anlaşılmaz oldusa, yaz
> Pulsuz, reklamsız. Mesaj yaz 🙌

**Русский**

> 🌱 Ищу тестировщиков для своего приложения Grovyn: таймер фокуса и задачи маленькими шагами.
> 1. Пришлите Gmail, с которым вы заходите в Google Play (только Android)
> 2. Вы получите ссылку: нажмите «Стать тестировщиком» и установите приложение
> 3. Не удаляйте его 14 дней и открывайте несколько раз в неделю
> 4. Напишите, что было непонятно
> Бесплатно, без рекламы. Пишите в личку 🙌

For LinkedIn, add a line before the list, e.g. "I built Grovyn on my own and it's almost on Google Play. Google asks new developers to run a two-week test with real people first."

### Invite (English)

> Hi! I made a small focus app called Grovyn: a timer, tasks in small steps, and a little
> grove that grows while you focus. Before it goes on Google Play, I need testers for two weeks.
> Could you help? Send me the Gmail you use on Play. I'll send a link; tap "Become a tester",
> install it, and open it now and then. If something is confusing, just tell me. No ads, and
> nothing leaves your phone unless you make an account.

### Приглашение (русский)

> Привет! Я сделал(а) небольшое приложение для фокуса — Grovyn: таймер, задачи маленькими
> шагами и роща, которая растёт, пока вы работаете. Перед выходом в Google Play нужны
> тестировщики на две недели. Поможете? Пришлите Gmail, с которым вы заходите в Play. Я пришлю
> ссылку: нажмите «Стать тестировщиком», установите приложение и иногда открывайте его. Если
> что-то непонятно — просто напишите. Без рекламы, и данные остаются на телефоне, если не
> создавать аккаунт.

(Change «сделал(а)» to «сделал» or «сделала» before sending.)

### Dəvət (Azərbaycanca)

> Salam! Grovyn adlı kiçik bir fokus tətbiqi hazırlamışam: taymer, kiçik addımlarla işlər və
> sən işlədikcə böyüyən bir bağ. Google Play-ə çıxmazdan əvvəl iki həftəlik testçilərə ehtiyacım
> var. Kömək edərsən? Play-də istifadə etdiyin Gmail ünvanını göndər. Sənə link atacam:
> «Testçi ol» düyməsinə bas, tətbiqi quraşdır və arabir aç. Nəsə anlaşılmaz olsa, sadəcə yaz.
> Reklam yoxdur, hesab yaratmasan, məlumatlar telefonunda qalır.

## 6. Release notes for the test

These go in the release's notes, under 500 characters each.

```
<en-US>
First test version. Try the timer, break a task into steps, and watch your grove grow. Health, Budget and Screen time are optional; turn them on under You. Tell us what confused you: grovyn.support@gmail.com
</en-US>
<ru-RU>
Первая тестовая версия. Попробуйте таймер, разбейте задачу на шаги и посмотрите, как растёт роща. Здоровье, Бюджет и Экранное время — по желанию, их можно включить в Профиле. Напишите, что было непонятно: grovyn.support@gmail.com
</ru-RU>
<az-AZ>
İlk test versiyası. Taymeri sına, bir işi addımlara böl və bağının necə böyüdüyünə bax. Sağlamlıq, Büdcə və Ekran vaxtı istəyə bağlıdır, Profildə yandıra bilərsən. Nə anlaşılmaz oldusa, yaz: grovyn.support@gmail.com
</az-AZ>
```

Version 0.1.2 (the weekly board):

```
<en-US>
New: the weekly board. Join under a nickname (Grove › Board) and compare focus minutes with people at your stage, or just with friends. Tap any name to block or report it. Tell us what you think: grovyn.support@gmail.com
</en-US>
<ru-RU>
Новое: недельная доска. Присоединяйтесь под ником («Роща» › «Доска») и сравнивайте минуты фокуса с людьми на вашей стадии или только с друзьями. Нажмите на любое имя, чтобы заблокировать или пожаловаться. Пишите, что думаете: grovyn.support@gmail.com
</ru-RU>
<az-AZ>
Yeni: həftəlik lövhə. Ləqəblə qoşul («Bağ» › «Lövhə») və fokus dəqiqələrini öz mərhələndəki insanlarla və ya yalnız dostlarla müqayisə et. Bloklamaq və ya şikayət etmək üçün istənilən ada toxun. Fikrini yaz: grovyn.support@gmail.com
</az-AZ>
```

Version 0.1.10 (Budget safety):

```
<en-US>
Budget is safer: removed bills stay removed, and syncing two phones never drops your entries. Two payments of the same amount a few minutes apart are both counted, and amounts like 1,234.56 read right. A changed bill stays a bill, Undo after a bank import takes back all of it, and "You have" no longer counts a payment twice. Tell us what you think: grovyn.support@gmail.com
</en-US>
<ru-RU>
Бюджет стал надёжнее: удалённые счета не возвращаются, а синхронизация двух телефонов больше не теряет записи. Два платежа на одну сумму с разницей в несколько минут учитываются оба, а суммы вроде 1,234.56 читаются верно. Изменённый счёт остаётся счётом, «Отменить» после импорта из банка отменяет всё, а «У вас есть» больше не считает платёж дважды. Пишите, что думаете: grovyn.support@gmail.com
</ru-RU>
<az-AZ>
Büdcə daha etibarlıdır: silinən hesablar geri qayıtmır, iki telefonun sinxronlaşması qeydləri itirmir. Bir neçə dəqiqə arayla eyni məbləğli iki ödəniş ikisi də sayılır, 1,234.56 kimi məbləğlər düz oxunur. Dəyişdirilən hesab hesab olaraq qalır, bank idxalından sonra «Geri al» hamısını geri alır, «Səndə var» isə ödənişi iki dəfə saymır. Fikrini yaz: grovyn.support@gmail.com
</az-AZ>
```

Version 0.1.9 (Budget fixes):

```
<en-US>
Fixes in Budget: a month before your first income is no longer shown as gone over. Savings and "You have" count a salary written in for a later day from that day. Save first is only ticked for salary and freelance, so refunds aren't split. When needs go over, the Wants bar shows how much room is really left. Tell us what you think: grovyn.support@gmail.com
</en-US>
<ru-RU>
Исправления в Бюджете: месяц до первого дохода больше не считается перерасходом. Сбережения и «У вас есть» учитывают зарплату, записанную на будущий день, только с этого дня. «Сначала отложить в сбережения» отмечено только для зарплаты и фриланса, чтобы возвраты не делились. Если нужное вышло за план, полоска «Желаемое» показывает, сколько на самом деле осталось. Пишите, что думаете: grovyn.support@gmail.com
</ru-RU>
<az-AZ>
Büdcədə düzəlişlər: ilk gəlirdən əvvəlki ay artıq xərc kimi göstərilmir. Yığımlar və «Səndə var» gələcək günə yazılan maaşı yalnız o gündən sayır. «Əvvəlcə yığıma qoy» yalnız maaş və frilans üçün seçilir, ona görə geri qaytarılan pullar bölünmür. Ehtiyaclar plandan çox olanda, İstəklər zolağı həqiqətən nə qədər qaldığını göstərir. Fikrini yaz: grovyn.support@gmail.com
</az-AZ>
```

Version 0.1.8 (Budget months that start on payday):

```
<en-US>
New: your Budget month can start on payday. Pick a day from 1 to 28 in Plan, and paid early or late, the salary counts for the right month. What a month leaves carries into the next one, and so does an overspend; Grovyn never takes your savings by itself, it asks first. Set your balance once and see what you have. Tell us what you think: grovyn.support@gmail.com
</en-US>
<ru-RU>
Новое: месяц в Бюджете может начинаться в день зарплаты. Выберите день от 1 до 28 в «Плане», и зарплата, пришедшая раньше или позже, попадёт в нужный месяц. Остаток месяца переходит в следующий, перерасход тоже; сбережения Grovyn сам не трогает, а сначала спрашивает. Укажите баланс один раз и видите, сколько у вас есть. Пишите, что думаете: grovyn.support@gmail.com
</ru-RU>
<az-AZ>
Yeni: Büdcədə ay maaş günü başlaya bilər. Planda 1-dən 28-ə qədər gün seç, maaş tez və ya gec gəlsə də düzgün aya düşəcək. Ayın qalığı növbəti aya keçir, artıq xərc də; Grovyn yığımlarına özü toxunmur, əvvəlcə soruşur. Balansını bir dəfə yaz və nə qədər pulun olduğunu gör. Fikrini yaz: grovyn.support@gmail.com
</az-AZ>
```

Version 0.1.7 (Study, several plans, new You):

```
<en-US>
New: Exam prep is now Study. One card shows what to do today, chapters show time and how often you get them right, and you can add questions by hand. Study can hold several plans at once. You is tidier: short rows that open sheets, and one place to delete your data or account. Tell us what you think: grovyn.support@gmail.com
</en-US>
<ru-RU>
Новое: «Подготовка к экзамену» теперь называется «Учёба». Одна карточка показывает, что делать сегодня, у глав видно время и долю верных ответов, а вопросы можно добавлять вручную. В «Учёбе» может быть несколько планов сразу. «Профиль» стал проще: короткие строки открывают панели, а удалить данные или аккаунт можно в одном месте. Пишите, что думаете: grovyn.support@gmail.com
</ru-RU>
<az-AZ>
Yeni: İmtahana hazırlıq indi Təhsil adlanır. Bir kart bu gün nə edəcəyini göstərir, fəsillərdə vaxt və düzgün cavab payı görünür, sualları əl ilə əlavə edə bilərsən. Təhsildə eyni anda bir neçə plan ola bilər. Profil daha səliqəlidir: qısa sətirlər panel açır, məlumatlarını və ya hesabını bir yerdən silə bilərsən. Fikrini yaz: grovyn.support@gmail.com
</az-AZ>
```

Version 0.1.6 (Coach day rhythm, new Timer):

```
<en-US>
New: Coach follows your day. Plan your Top 3 in the morning, see what to do now, close the day in the evening and look back on the week. Your Coach days sync with your account. The Timer is calmer: pick your task at the top, rhythm and sound open from one button, and the screen goes quiet while you focus. Tell us what you think: grovyn.support@gmail.com
</en-US>
<ru-RU>
Новое: Ментор ведёт ваш день. Утром выберите Топ-3, днём смотрите, что делать сейчас, вечером подведите итог и взгляните на неделю. Дни Ментора синхронизируются с аккаунтом. Таймер стал спокойнее: задача выбирается сверху, ритм и звук открываются одной кнопкой, а во время фокуса экран затихает. Пишите, что думаете: grovyn.support@gmail.com
</ru-RU>
<az-AZ>
Yeni: Mentor gününü izləyir. Səhər Top 3-ü seç, gün ərzində indi nə edəcəyini gör, axşam günün yekununu vur və həftəyə bax. Mentor günlərin hesabınla sinxronlaşır. Taymer daha sakitdir: tapşırığı yuxarıdan seç, ritm və səs bir düymə ilə açılır, fokus zamanı ekran sakitləşir. Fikrini yaz: grovyn.support@gmail.com
</az-AZ>
```

## 7. During the 14 days (both)

- Keep a short log below: who joined, what they said, and what changed.
  When you apply for production, Google asks how you recruited testers, what feedback you got
  and what you changed. The log is the answer.
- Ship fixes as new versions (bump with `npm version patch --no-git-tag-version`, then
  `npm run release`). New uploads don't reset the 14 days.

## 8. Apply for production (you, after day 14)

*Dashboard → Apply for production*. Answer from the log. Review usually takes up to a week.

## Log

| Date | What happened |
|---|---|
| 14 Nov 2026 | Checklist written; Play bundle builds unsigned, waiting on the upload key. |
| 14 Nov 2026 | Upload key made (`CN=Grovyn`, valid to 2054). `grovyn-play-0.1.0.aab` built and signed. Upload key SHA-1 `FD:3B:FE:F7:AD:FB:EF:AA:CD:B4:FE:27:BB:CC:E8:86:4D:91:0D:0A` (add to Firebase, step 4). |
| 14 Nov 2026 | Play Console: app created (`app.grovyn`, Free, 13+). Saved: privacy policy, app access, ads, government, financial features, target audience, content rating (Everyone), Data safety (7 types, none shared; Name/Email/User IDs also marked App functionality), Health apps (Activity and fitness, Sleep management), Advertising ID (No; the bundle has no `AD_ID`), category Productivity, contact email and website. Store listing saved in English, Russian and Azerbaijani (text, icon, each language's feature graphic and 7 screenshots; assets not labelled as AI-made). |
| 15 Nov 2026 | Closed testing track (Alpha): 178 countries, feedback email `grovyn.support@gmail.com`, email list "Grovyn testers" (first tester: the owner). Release 100 (0.1.0) uploaded with notes in 3 languages; Health Connect permission reasons filled in. 17 changes sent for review. Opt-in link (works after approval): `https://play.google.com/apps/testing/app.grovyn`. Built before the AZ Health rings fix (PR 89), so that fix comes in the next version. |
| 15 Nov 2026 | Firebase: both SHA-1s added to the `app.grovyn` Android app (Play app signing `D8:FB:45:B0:2D:25:A9:10:78:DF:74:5E:7C:3E:58:AD:95:30:84:51`, upload key `FD:3B:…:0D:0A`). Google sign-in in the Play build not yet tried. |
| 19 Nov 2026 | Weekly board with report and block. Firestore rules published. Release 102 (0.1.2) uploaded to Alpha. New content rating questionnaire: users interact = Yes, block = Yes, report = Yes, no chat, not friends-only. Ratings unchanged (Everyone, ClassInd L) plus "Users Interact". Both sent for review. |
| 26 Nov 2026 | Release 106 (0.1.6) uploaded to Alpha: Coach day rhythm and sync, the new Timer (task on top, rhythm and sound in a sheet, quiet while focusing). Notes in 3 languages; supported devices unchanged; only warning is the usual missing deobfuscation file. Sent for review (managed publishing off). 0.1.5 had been published 25 Nov. |
| 27 Nov 2026 | Release 107 (0.1.7) uploaded to Alpha: Study (was Exam prep), several study plans at once, and the You page as rows that open sheets with one delete sheet (type DELETE). Notes in 3 languages; supported devices unchanged; only warning is the usual missing deobfuscation file. Sent for review (managed publishing off). 0.1.6 was available to testers. |
| 28 Nov 2026 | Release 108 (0.1.8) uploaded to Alpha: Budget months can start on payday, a month's rest or overspend carries into the next (savings only with a yes), and a "You have" balance row. Notes in 3 languages; supported devices unchanged; only warning is the usual missing deobfuscation file. Sent for review (managed publishing off). |
| 28 Nov 2026 | 0.1.8 approved and available to testers. Release 109 (0.1.9) uploaded to Alpha: Budget fixes (no overspend card before the first income, savings and "You have" count up to today, save first only for salary and freelance, Wants bar shrinks when needs go over). Notes in 3 languages; supported devices unchanged; only warning is the usual missing deobfuscation file. Sent for review (managed publishing off). |
| 28 Nov 2026 | 0.1.9 approved and available to testers. Release 110 (0.1.10) uploaded to Alpha: Budget safety (review items 1–14, PRs 117–119): removal markers kept, sync always merges Budget, big stores packed, same-price payments and comma thousands read right, bills keep their link, bank Undo/redo, truer balance. Notes in 3 languages; supported devices unchanged; only warning is the usual missing deobfuscation file. Sent for review (managed publishing off). |
