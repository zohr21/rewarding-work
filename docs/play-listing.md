# Play Store listing (draft)

What goes under **Grow users → Store presence → Main store listing** for the `play` version (`app.grovyn`).
Drafted 2026-11-07. Policy answers are in `docs/play-console-answers.md`; building and signing in `docs/release.md`.

The description names the three sensitive features (bank alerts from notifications, Health Connect, screen time),
because Play wants every sensitive permission to serve a feature the listing promotes.

## Text

**App name** (30 max): `Grovyn: Focus Timer & Tasks` (27)

**Short description** (80 max):

> Focus timer, tasks in small steps, and a grove that grows with every minute.

(76 characters)

**Full description** (4000 max):

> Grovyn makes work feel worth doing. Start a focus session, break a big task into small steps, and watch Sprig grow
> from a seed into a whole grove with every minute you put in.
>
> FOCUS
> • A focus timer with Pomodoro (25/5), 52/17, Flowtime or your own lengths
> • Jot a thought mid-session without losing your place; sort it afterwards
> • Calm sounds: rain, waves, fireplace, brown noise and more
> • Timer alerts and a home-screen widget
>
> TASKS
> • Today, Next and Someday lists, with one task "first up"
> • Break any task into steps, like an installer: see how far along you are
> • A done list that shows what you actually finished
>
> SEE IT GROW
> • Sprig grows with your total focus time: seedling, sprout, sapling, tree, grove
> • Chains for daily habits, and stats for your week
>
> COACH
> • Stuck? Pick what's in the way ("I can't start", "I keep drifting", "Too much to do") and get a technique that
>   fits, with the evidence behind it
> • Exam prep: a study plan and practice questions for one exam
>
> OPTIONAL SECTIONS (turn on only what you want)
> • Health: see sleep, steps and activity next to your focus. Read from Health Connect, only with your permission,
>   and kept on your phone. You can also type them in yourself.
> • Budget: plan the month and see what is safe to spend today. Grovyn can add expenses from your bank's alerts:
>   with your permission it reads notifications from the banking apps you pick, keeps the amount, shop and date,
>   and ignores everything else.
> • Screen time: see where your phone time goes next to your plan. With your permission it reads how long you use
>   each app; this stays on your phone.
>
> PRIVATE BY DEFAULT
> • No ads, no analytics, no tracking
> • Works without an account; everything stays on your phone
> • Sign in (Google, email or guest) only if you want a backup and sync between devices
> • Delete your account and its data any time, in the app or on the web
>
> Questions or ideas: grovyn.support@gmail.com

**Category:** Productivity. **Tags:** Productivity, Time management, Habit tracker (pick from Play's list).
**Contact email:** grovyn.support@gmail.com. **Website:** `<site>/`. **Privacy policy:** `<site>/privacy/`.

## Graphics

One folder per listing language: `docs/store/en/`, `docs/store/ru/`, `docs/store/az/`. Regenerate with
`node scripts/store-shots.mjs` while the Play preview runs (see the script's header). It seeds sample data in each
language and captures the Play version, so there is no weekly board in them. Captions and sample data live in `COPY`
at the top of the script; a new language is one more entry there.

| Asset | File | Spec |
|---|---|---|
| App icon | `public/icons/maskable-512.png` | 512×512 PNG, full-bleed square (Play rounds the corners). Use this one, not `icon-512.png`. |
| Feature graphic | `docs/store/<lang>/feature-graphic.png` | 1024×500, no alpha |
| Phone screenshots | `docs/store/<lang>/01-today.png` … `07-private.png` | 1080×1920 (9:16), 7 of the 8 allowed |

Each screenshot is a caption above the real screen. Upload them in this order:

| | File | English | Russian | Azerbaijani |
|---|---|---|---|---|
| 1 | `01-today.png` | One thing first | Сначала одно дело | Əvvəlcə bir iş |
| 2 | `02-timer.png` | A calm timer, your way | Спокойный таймер на ваш лад | Sakit taymer, öz qaydanla |
| 3 | `03-tasks.png` | Big tasks, small steps | Большие задачи маленькими шагами | Böyük işlər, kiçik addımlar |
| 4 | `04-grove.png` | Every minute grows your grove | Каждая минута растит вашу рощу | Hər dəqiqə bağını böyüdür |
| 5 | `05-coach.png` | Stuck? A technique that fits | Застряли? Подберём технику | İlişmisən? Uyğun texnika tap |
| 6 | `06-more.png` | Sleep, steps and budget, if you want them | Сон, шаги и бюджет, если захотите | Yuxu, addımlar və büdcə, istəsən |
| 7 | `07-private.png` | No ads. No tracking. Yours. | Без рекламы. Без слежки. Всё ваше. | Reklamsız. İzləməsiz. Sənindir. |

Frames 1 to 5 show the app as it starts (four tabs, no optional sections). Frame 6 shows Health and Budget, which Play
wants promoted because they use sensitive permissions. Frame 7 is words and Sprig, not a screen.

If a screen changes before release, regenerate them.

## Russian and Azerbaijani listings (drafts)

Add each under **Store presence → Main store listing → Manage translations**. These are drafts: have a native speaker
read them before publishing. Russian addresses the reader as "вы", Azerbaijani as "sən", as the app does.

### Русский

**App name** (30 max): `Grovyn: таймер фокуса и задачи` (30)

**Short description** (80 max):

> Таймер фокуса, задачи маленькими шагами и роща, которая растёт с каждой минутой.

(80 characters)

**Full description:**

> Grovyn помогает почувствовать, что работа того стоит. Запустите сессию фокуса, разбейте большую задачу на маленькие
> шаги и смотрите, как Сприг с каждой минутой растёт от семечка до целой рощи.
>
> БЕЗ РЕКЛАМЫ И СЛЕЖКИ
> • Без рекламы, аналитики и отслеживания
> • Работает без аккаунта: всё остаётся на вашем телефоне
> • Вход (Google, почта или гость) нужен только для резервной копии и синхронизации между устройствами
> • Аккаунт и его данные можно удалить в любой момент, в приложении или на сайте
>
> ФОКУС
> • Таймер с режимами Pomodoro (25/5), 52/17, Flowtime или своими интервалами
> • Запишите мысль посреди сессии, не теряя места, и разберите её потом
> • Спокойные звуки: дождь, волны, камин, коричневый шум и другие
> • Уведомления таймера и виджет на главном экране
>
> ЗАДАЧИ
> • Списки «Сегодня», «Далее» и «Когда-нибудь», одна задача «первым делом»
> • Разбейте любую задачу на шаги и смотрите, сколько уже пройдено
> • Список сделанного показывает, что вы действительно закончили
>
> СМОТРИТЕ, КАК РАСТЁТ
> • Сприг растёт вместе с общим временем фокуса: сеянец, росток, саженец, дерево, роща
> • Цепочки для ежедневных привычек и статистика за неделю
>
> МЕНТОР
> • Застряли? Выберите, что мешает («Не могу начать», «Постоянно отвлекаюсь», «Слишком много дел»), и получите
>   подходящую технику с объяснением, на чём она основана
> • Подготовка к экзамену: учебный план и тренировочные вопросы
>
> ДОПОЛНИТЕЛЬНЫЕ РАЗДЕЛЫ (включайте только то, что нужно)
> • Здоровье: сон, шаги и активность рядом с вашим фокусом. Читается из Health Connect только с вашего разрешения
>   и остаётся на телефоне. Можно вводить и вручную.
> • Бюджет: спланируйте месяц и узнайте, сколько можно потратить сегодня. Grovyn может добавлять расходы из
>   уведомлений банка: с вашего разрешения он читает уведомления выбранных вами банковских приложений, сохраняет
>   сумму, магазин и дату, а всё остальное пропускает.
> • Экранное время: куда уходит время в телефоне рядом с вашим планом. С вашего разрешения читает, сколько вы
>   пользуетесь каждым приложением; эти данные остаются на телефоне.
>
> Вопросы и идеи: grovyn.support@gmail.com

### Azərbaycanca

**App name** (30 max): `Grovyn: Fokus taymeri, işlər` (28)

**Short description** (80 max):

> Fokus taymeri, kiçik addımlarla işlər və hər dəqiqə ilə böyüyən bağ.

(68 characters)

**Full description:**

> Grovyn işi görməyə dəyər edir. Fokus seansına başla, böyük işi kiçik addımlara böl və Sprigin hər dəqiqə ilə
> toxumdan bütöv bağa qədər böyüməsinə bax.
>
> REKLAMSIZ VƏ İZLƏMƏSİZ
> • Reklam, analitika və izləmə yoxdur
> • Hesabsız işləyir: hər şey telefonunda qalır
> • Giriş (Google, e-poçt və ya qonaq) yalnız ehtiyat nüsxə və cihazlar arasında sinxronlaşdırma üçün lazımdır
> • Hesabını və məlumatlarını istədiyin vaxt, tətbiqdə və ya saytda silə bilərsən
>
> FOKUS
> • Pomodoro (25/5), 52/17, Flowtime və ya öz intervalların ilə fokus taymeri
> • Seansın ortasında yerini itirmədən fikrini qeyd et, sonra baxarsan
> • Sakit səslər: yağış, dalğalar, ocaq, qəhvəyi səs-küy və başqaları
> • Taymer bildirişləri və əsas ekran vidceti
>
> TAPŞIRIQLAR
> • «Bu gün», «Sonra» və «Nə vaxtsa» siyahıları, bir tapşırıq «ilk növbədə»
> • İstənilən tapşırığı addımlara böl və nə qədər irəlilədiyini gör
> • Görülənlər siyahısı həqiqətən nəyi bitirdiyini göstərir
>
> BÖYÜMƏSİNƏ BAX
> • Sprig ümumi fokus vaxtınla böyüyür: cücərti, zoğ, fidan, ağac, bağ
> • Gündəlik vərdişlər üçün zəncirlər və həftəlik statistika
>
> MENTOR
> • İlişmisən? Nəyin mane olduğunu seç («Başlaya bilmirəm», «Diqqətim dağılır», «Çox iş var») və nəyə əsaslandığı
>   ilə birlikdə uyğun texnika tap
> • İmtahana hazırlıq: bir imtahan üçün dərs planı və məşq sualları
>
> ƏLAVƏ BÖLMƏLƏR (yalnız istədiyini yandır)
> • Sağlamlıq: yuxu, addımlar və aktivlik fokusunun yanında. Yalnız icazənlə Health Connect-dən oxunur və
>   telefonunda qalır. Əl ilə də daxil edə bilərsən.
> • Büdcə: ayı planla və bu gün nə qədər xərcləyə biləcəyini gör. Grovyn bankının bildirişlərindən xərcləri əlavə
>   edə bilər: icazənlə seçdiyin bank tətbiqlərinin bildirişlərini oxuyur, məbləği, mağazanı və tarixi saxlayır,
>   qalanını nəzərə almır.
> • Ekran vaxtı: telefonda vaxtın hara getdiyini planının yanında gör. İcazənlə hər tətbiqdən nə qədər istifadə
>   etdiyini oxuyur; bu məlumat telefonunda qalır.
>
> Suallar və fikirlər: grovyn.support@gmail.com
