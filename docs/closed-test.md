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
