# Better Watch Later

A small Chrome and Firefox extension that makes YouTube's Watch Later page easier to manage.

## Why it exists

I have 4,900 to 5,000 videos on my Watch Later list on YouTube at all times. I want to manage it well, but YouTube's default UI was missing features I wanted. The worst part is that "Remove from Watch Later" is hidden behind a three-dot menu on every single video. We've been meaning to build this extension for many years, but never got round to it. 

Now it exists and we use it every day. That's Good!

## Features

- **One-click remove.** Every video gets a ✕ button. Click it and the video is gone, with an Undo button in case you slip.
- **Remove watched videos.** Scans the whole playlist (not just what's loaded on screen), finds videos you've watched past a percentage you choose (default 90%), shows you what it found and asks before removing anything. It downloads a backup list of those videos first, so nothing is lost for good.
- **Shuffle.** Shows the loaded videos in random order. This only changes what you see; reload to get YouTube's order back.

All of this only appears on the Watch Later page (`youtube.com/playlist?list=WL`).

## Install

**Chrome, Edge, Brave:** open `chrome://extensions`, turn on Developer mode, click "Load unpacked" and pick this folder.

**Firefox (128 or newer):** open `about:debugging#/runtime/this-firefox`, click "Load Temporary Add-on" and pick `manifest.json`. Temporary add-ons disappear when Firefox restarts. To keep it installed, sign it (free, unlisted) at [addons.mozilla.org](https://addons.mozilla.org/developers/). If nothing shows up on YouTube, check the extension's Permissions tab in `about:addons` and allow youtube.com.

## How it works

- `src/api.js` calls the same internal YouTube endpoints the website itself uses when you remove a video from the three-dot menu.
- `src/content.js` adds the buttons and the panel, and keeps up with YouTube's page changes.
- `src/styles.css` uses YouTube's own colours, so it follows light and dark mode.
- `icons/icon.svg` is the icon's source. Chrome can't use SVG icons, so the manifest points at PNG copies in `icons/`. If you change the SVG, export it again at 16, 32, 48, 96 and 128 pixels with the same file names.

These endpoints are not an official, documented API. If YouTube changes them, removing videos may stop working until the extension is updated. When that happens you'll see an error message; it won't remove anything silently.

## Release management

Releases are fully automated. You write the changelog entry and run one command. GitHub creates the release and submits it to addons.mozilla.org.

### Making a release

1. Make sure your changes are committed on `main`.
2. At the top of `CHANGELOG.md`, add an entry for the new version with a heading like `## [0.1.4] - 2026-12-01`. At the bottom, add its compare link, like the ones already there.
3. In Git Bash, run:

   ```
   .github/scripts/release.sh 0.1.4
   ```

   The script checks that you're on an up-to-date `main` with no stray changes, that the version is new and higher than the last one, and that the changelog has an entry and a link for it. It sets the version in `manifest.json`, shows you the release notes and asks before doing anything. Then it commits, tags and pushes. If a check fails, it tells you what to fix and changes nothing.
4. Watch the run under the **Actions** tab on GitHub. It does two things:
   - Creates a GitHub release with the changelog entry as notes and `better-watch-later-0.1.4.zip` attached. The zip only holds `manifest.json`, `src/`, `icons/` and `LICENSE.md`.
   - Submits that same zip to addons.mozilla.org as a new version, with the changelog entry as release notes. Mozilla then reviews it, which usually takes minutes to hours. Mozilla emails you when it is live.

Version numbers follow [Semantic Versioning](https://semver.org/). For a bug fix, bump the last number (0.1.3 → 0.1.4). For new features, bump the middle one (0.1.4 → 0.2.0).

### If something fails

- **The GitHub release failed.** Read the error in the Actions log. The usual causes are a missing changelog entry or a `manifest.json` version that doesn't match the tag. The script should catch both before you push.
- **The Mozilla submission failed.** The GitHub release is already done. If the log says the version already exists, Mozilla has it and there's nothing to do. If it says the keys are missing or invalid, see below. Otherwise, fix the cause and click **Re-run failed jobs** on the run.
- **You need to re-run a release for a tag that already exists.** Go to **Actions → Release → Run workflow**, keep the branch on `main` and enter the tag (for example `v0.1.3`). Only tick "Also submit to addons.mozilla.org" if Mozilla doesn't have that version yet.

To preview a version's release notes on your own machine, run `.github/scripts/changelog-section.sh 0.1.4`.

### Mozilla API keys

The Mozilla job signs in with an API key stored as two repository secrets, `AMO_JWT_ISSUER` and `AMO_JWT_SECRET`. Mozilla keys don't expire, but if they're revoked or lost:

1. Go to https://addons.mozilla.org/developers/addon/api/key/ and generate new credentials.
2. On GitHub, go to the repository's **Settings → Secrets and variables → Actions**. Set `AMO_JWT_ISSUER` to the "JWT issuer" value and `AMO_JWT_SECRET` to the "JWT secret" value.

### Things that must not change

- `browser_specific_settings.gecko.id` in `manifest.json` (`betterwatchlater@kiff-ii`). This is the add-on's permanent ID on addons.mozilla.org. It still says `kiff-ii` from the project's old name, and that is fine. If it changed, Mozilla would treat the upload as a different add-on, and existing users would stop getting updates.

## Built with AI

This extension was written by **Claude Opus 5.5**, an AI model made by [Anthropic](https://www.anthropic.com), working through **Claude Code**. We described the problem and the features we wanted, along with screenshots of the Watch Later page. Claude wrote the code and tested it against a mocked copy of the page. We edited the extension for suitability and tested it against the live YouTube API.

## License

[GNU General Public License v3.0](LICENSE.md).
