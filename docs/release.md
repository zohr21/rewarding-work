# Releasing Grovyn on Google Play

`npm run release` builds the `play` version as an app bundle (`grovyn-play-<version>.aab` in the
project folder). That is the file you upload in Play Console. `npm run apk` / `apk:play` still
build the debug APKs for the phone.

## Once: make the upload key

Play signs the app for users (Play App Signing). You sign each upload with your own **upload
key**. Make it once, and keep it outside the project and outside OneDrive:

```bash
mkdir -p ~/.grovyn
keytool -genkeypair -v -keystore ~/.grovyn/grovyn-upload.jks -alias upload -keyalg RSA -keysize 2048 -validity 10000
```

`keytool` comes with Android Studio (`C:\Program Files\Android\Android Studio\jbr\bin\keytool.exe`).
Then write `~/.grovyn/keystore.properties`:

```properties
storeFile=C:/Users/<you>/.grovyn/grovyn-upload.jks
storePassword=<the store password>
keyAlias=upload
keyPassword=<the key password>
```

- Another place for it: set `GROVYN_KEYSTORE` to the path of that `keystore.properties`.
- **Back up the `.jks` file and both passwords** somewhere safe, like a password manager. If you
  lose them, Play can reset the upload key, but that takes a support request and a few days.
- `.gitignore` leaves out `*.jks`, `*.keystore`, `keystore.properties` and `*.aab`.
- Without the key, `npm run release` still builds the bundle unsigned and says so. Play won't
  take an unsigned one.

After the first upload, add the **upload key's SHA-1** and Play's **app signing key's SHA-1**
(Play Console → Test and release → App integrity) to the `app.grovyn` Android app in Firebase.
Google sign-in fails in the Play build without them.

```bash
keytool -list -v -keystore ~/.grovyn/grovyn-upload.jks -alias upload
```

## Every upload: bump the version

The version comes from `package.json` (`"version": "0.1.0"`). Play's `versionCode` is made from
it: `1.2.3` → `10203`. Play refuses a code it has already seen, so raise the version before each
upload (`npm version patch --no-git-tag-version`).

## What the play version leaves out

- `READ_SMS` and the *Past SMS* import: `full` only (`android/app/src/full/AndroidManifest.xml`).
- Android backup and phone-to-phone copy are off in both versions (`allowBackup="false"` and
  `res/xml/data_extraction_rules.xml`). Health numbers, screen time and bank alerts stay on the
  phone; the backup file and the account sync are how data moves.
- Exact alarms are asked for (`SCHEDULE_EXACT_ALARM`), not assumed. If they're off, the timer's
  phase-end alert is set inexact and can come a few minutes late. *You → Notifications and
  widgets* says so and opens Android's *Alarms & reminders* screen.

Play Console answers (Data safety, declarations) are in `docs/play-store-readiness.md`.
The closed test, step by step, is in `docs/closed-test.md`.
