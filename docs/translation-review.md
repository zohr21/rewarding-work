# Translation read-through (Russian, Azerbaijani)

The step left over from Wave 1: read both translations as a native speaker would, area by
area, and fix what reads wrong. Started 14 Nov 2026. A native reader should still check every
area before the listing goes live; the notes below are what a careful non-native pass caught.

## Progress

| Area (keys) | Read | Notes |
|---|---|---|
| Automated check, all 2,625 keys | yes | No placeholder, plural-shape or markup mismatches; nothing missing. |
| `nav`, `lang`, `today`, `common`, `undo` | yes | |
| `tier`, `sprig`, `module` | yes | |
| `timer` (130) | yes | |
| Welcome (`you.*` on `/welcome`) | yes | |
| `tasks` (136), `grove` (155), `chain` (97) | yes | |
| `you` (331), `tour` (151) | yes | |
| `tip`, `book`, `guide` | yes | |
| `budget` (392), `health` (279) | yes | |
| `screen`, `workout` | yes | |
| `exam` (186), `coach` (107), `tech`, `problem` | yes | |
| `board`, `export`, `err`, everything else | yes | |
| Play listing text (`docs/play-listing.md`) | yes | Russian and Azerbaijani drafts. |

## Fixed

- **Mascot name.** Sprig is «Сприг» / «Sprig» everywhere now. Four strings called it «Росток»
  (RU) or «Cücərti» (AZ), the same words as the Sprout / Seedling tier names, so "Hi, I'm
  Sprout" sat next to the Sprout tier. The tier names are unchanged.
- **The You tab's name.** Welcome and account deletion said to change things under «Вы» /
  «Sən», but the tab is «Профиль» / «Profil». Three strings in each language.
- **AZ: one word for a session.** «seans» (83 uses) and «sessiya» (25) were mixed; all are
  «seans» now, with case endings adjusted.
- **AZ timer.** Pause is «Pauza» (was «Dayandır», which reads as Stop). "What did you get
  done?" is «Nə iş gördün?» (was «Nə etdin?», which can sound like a reproach). "What's
  next?" is «Sırada nə var?» (was a literal «Növbəti nədir?»).
- **Smoother lines:** AZ `today.seedText`, `tier.everyTier`; RU `tier.everyTier`,
  `tier.noGuess`.
- **AZ chains: wrong meaning.** The − and + buttons on an amount chain said «Bir az» ("a
  little") and «Bir artıq» ("one extra"); now «Bir azalt» / «Bir artır». Three lines about a
  past day said «bu gün» ("today") where English means "this day"; now «həmin gün».
- **AZ chains: one word for a slot.** Parts of a chain are «hissə», not «bölmə» (which the app
  uses for its sections).
- **AZ tasks.** "Clear" and "Delete" now name what they act on («… fikrini sil», «…
  tapşırığını sil»), as Azerbaijani needs the object. "Mark not done" is «İşarəni götür»; "Do
  first" is «Birinci qoy»; the session log's "Did" is «Görüldü», matching «Görülənlər».
- **AZ grove.** "all time" is «ümumilikdə»; "Focus over time" is «Fokus dinamikası»; the
  chain form's broken «Gün sayılır, əgər edilib» is «Günün sayılma həddi».
- **RU grove.** "Things done per week" no longer repeats "Done this week" («Сделано по
  неделям»); the heatmap's flat view is «Плоский»; an example no longer starts with a capital
  after «например,».
- **One name for the weekly board.** Its tab in Grove says «Доска» / «Lövhə», but You called it
  «таблица» / «cədvəl» in nine places, including the path "Grove › Board › Friends". All say
  board now.
- **The You page title** in the app said «Вы» / «Sən»; it now matches the tab, «Профиль» /
  «Profil». The delete-account steps ("go to You") follow.
- **Matching names across screens.** The tours now use the same words as the screens they
  point at: the Finished list («Завершённые» / «Bitənlər»), the flat heatmap view («Плоский»),
  "Focus over time", and «Pauza» in AZ. RU Help says «Туры», as the Help page heading does.
- **RU You.** Sound "Play" is «Включить» (was «Играть», "play a game"); "All time" is «За всё
  время».
- **AZ You.** «Bağlantılar» for Connections, «Taymerin standart ayarları», «Pauzada» for a
  paused sound (was «Fasilədə», "on a break"), and a few verb forms («göndərəcəyik», «o bir
  daha soruşulacaq»).
- **AZ: number endings in templates.** Four Budget lines put a case ending after a number
  («{day}-ci», «{day}-i», «{day}-də»), which is wrong for most numbers (1-i, 2-si, 3-ü). They
  now avoid the ending («{day} tarixində», «Gün {n}»). No `{n}-…` forms are left in `az.ts`.
- **AZ budget: wrong meaning.** One-time codes were «ötürülür» ("sent on"); now «nəzərə
  alınmır» ("ignored"). "Turn on the Budget lock" said «kilidini aç», which reads as "unlock
  it"; now «aktiv et». "Ahead of pace" («Tempdən tez») now says plainly that spending is too
  fast («Tempdən sürətli xərcləyirsən»). "Lock again after" lost its "after".
- **AZ health: "this day" vs "today".** Four lines about a picked day said «bu gün» (today);
  now «həmin gün». Heart rate is «zərbə/dəq» (was «vurğu/dəq»).
- **AZ smaller:** «Hesabının şifrəsi» (was «parol», used nowhere else), «Türkiyə lirəsi»,
  «Son bir il», «Bitmə vaxtı», and a doubled «Yığılan yığımda».
- **RU budget and health.** «Согласиться» (was «Согласен», male only), «Проверить вручную»
  (was «самому», male only), «Чтение…» (was «Читаю…», first person), a clearer PIN-saved line,
  "Discard this workout?" is «Не сохранять…» (was «Отменить…», which reads as cancelling a
  session), and «Исходя из: расстояние» (wrong case before).
- **RU exam: "I took the exam" said "I passed".** «Я сдал(а) экзамен» means passed in Russian,
  so the button that opens "How did it go? Passed / Didn't pass" already gave the answer. Now
  «Экзамен уже прошёл», with «Экзамен сдан» / «Не сдан» as the answers.
- **RU: no more "(а)" forms.** Russian verbs in the past show gender; six strings used
  «сдал(а)», «пробовал(а)», «закончил(а)», «подтвердил(а)». All are reworded without it, and
  none are left.
- **RU smaller:** "studied" is «Занятия: {time}» (was «Изучено», which reads as "learned");
  Flowtime's coach line says "until focus fades" as the English does (was "until you tire").
- **AZ smaller:** the exam practice "Done" button is «Hazır»; the lose-focus explanation said
  sessions make it easy "to distract someone" («diqqəti yayındırmaq»), now "for attention to
  drift" («diqqətin yayınması»).

- **Tips and Help.** RU tip counts say «совет» like the rest of Help (were «подсказка»); the
  heatmap tip names the view «Плоский», as the screen does.
- **AZ sounds.** A paused sound is «Pauza: …» / «pauzada», matching the timer (was «Fasilə»,
  "a break"). A disabled account is «deaktiv edilib» (was «söndürülüb», which reads as
  switched off like a lamp).
- **Play listing: tier names.** The RU and AZ drafts listed the stages with different words
  from the app (RU «семечко», AZ «toxum … cücərti»); they now match the tier names in the app
  (RU «сеянец, росток…», AZ «cücərti, zoğ…»). AZ "get a technique" is «texnika tap».

- **Mentor in both languages (owner, 14 Nov).** The Coach tab is «Ментор» in Russian too (was
  «Коуч»), in the app and the listing, so both languages use the same word. «Терапия и
  коучинг» in Budget is a spending kind and stays.
- **Kept by the owner (14 Nov):** AZ «fokuslanmaq», and AZ «Sönülü» for "Off" for now.
- **AZ Life tab is «Rifah» (owner, 14 Nov)**, "well-being" (was «Həyat»). The Budget
  category that was also «Rifah» is now «Özünə qulluq» ("self-care"), in Budget and Health.

## For the owner or a native reader to decide

- **AZ listing opening line** «Grovyn işi görməyə dəyər edir» is close to the English but
  reads a little like a calque; a native reader may prefer something freer.

- **RU tier names.** «Сеянец» (Seedling) is a gardening term that few people use. «Росток» →
  «Побег», or shifting to «Росток / Побег / Саженец», would read more naturally. That changes
  names people already see, so it's your call.
- **RU «Жизнь»** for the Life tab: the owner picked «Rifah» for Azerbaijani; Russian keeps «Жизнь» unless a short word for well-being is found.
- **RU «Туры»** for guided tours is a loan word; «Обзоры» or «Подсказки по экрану» are options.
- **AZ "Edit profile" reads backwards** («Redaktə et profili»): the markup puts the verb first
  (`account.astro`, `you.edit` + `you.profile`). Needs a small markup change, not a string.
- **AZ «tab»** ("each has a tab here", Grove tour) is a loan word; «vərəq» or «bölmə» are options.
