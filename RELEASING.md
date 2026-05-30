# Release policy

R34 Pro keeps **one canonical app build** on GitHub.

## Android APK

- **Branch:** `main` only
- **Path:** `releases/r34pro-1.7.0.apk` (overwrite this file when rebuilding; do not add parallel filenames unless the app version in `package.json` changes)
- **Direct download:** https://github.com/GlorbyZ/R34Pro/raw/main/releases/r34pro-1.7.0.apk

### Do not

- Commit or push APK files on feature branches (`cursor/*`, PR branches, etc.)
- Upload the same APK to multiple branches
- Add extra release files such as `r34pro-latest.apk` alongside the versioned file

### Rebuild and publish

Run this from `main` after code changes are merged:

```bash
npm run build:android
cp android/app/build/outputs/apk/release/app-release.apk releases/r34pro-1.7.0.apk
git add releases/r34pro-1.7.0.apk
git commit -m "Update releases/r34pro-1.7.0.apk"
git push origin main
```

## Browser extension

The Chrome extension is built to `.output/chrome-mv3` and is **not** checked into git. Users load it unpacked or build from source with `npm run build`.
