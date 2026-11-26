# Changelog

All notable changes to Better Watch Later are listed here, newest first.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and version numbers follow [Semantic Versioning](https://semver.org/).

## [Unreleased]

## [0.2.0] - 2026-11-26

### Added

- Clock button in the top-right corner of video thumbnails across YouTube, for one-click adding to Watch Later, with Undo. It shows on the home page, subscriptions, search, channel pages, playlists, history and the list next to the video you're watching. We added it because YouTube's own option is sometimes missing from a video page or grid.

### Changed

- The extension now runs on all of YouTube, not just the Watch Later page. Only the clock button shows elsewhere. Everything else still only appears on the Watch Later page.

## [0.1.3] - 2026-11-07

Maintenance release. The extension itself is unchanged.

### Changed

- The project has moved to https://github.com/KIFFCollective/BetterWatchLater. The add-on's homepage link points there now.
- New versions are now submitted to addons.mozilla.org automatically when a release is made.
- Releases are made with one command, `.github/scripts/release.sh`, which checks everything before tagging.

## [0.1.2] - 2026-10-23

### Added

- Extension icon: a clock with a tick, in `icons/`. The SVG is the source; the PNGs are what browsers use.
- GitHub releases are now created automatically from version tags, with the changelog entry as the release notes and a zip of the extension attached.

## [0.1.1] - 2026-10-23

### Changed

- Removing a video with ✕ now feels instant. The row disappears as soon as you click, and YouTube is told in the background. Before, the row stayed until YouTube answered, which took about two seconds on a large Watch Later list.
- If YouTube refuses a removal, the video comes back and an error message explains why.
- Clicking Undo while a removal is still in progress now waits for the removal to finish before adding the video back, so the two can't arrive at YouTube in the wrong order.

## [0.1.0] - 2026-10-23

First release, submitted to addons.mozilla.org.

### Added

- ✕ button on every Watch Later video for one-click removal, with Undo.
- "Remove watched…" panel that scans the whole playlist, asks for confirmation and downloads a backup list before removing videos watched past a chosen percentage.
- "Shuffle loaded" to show the loaded videos in random order.
- Firefox data collection declaration (`none`), required by addons.mozilla.org.
- Link to the source code on the add-on's page.

[Unreleased]: https://github.com/KIFFCollective/BetterWatchLater/compare/v0.2.0...HEAD
[0.2.0]: https://github.com/KIFFCollective/BetterWatchLater/compare/v0.1.3...v0.2.0
[0.1.3]: https://github.com/KIFFCollective/BetterWatchLater/compare/v0.1.2...v0.1.3
[0.1.2]: https://github.com/KIFFCollective/BetterWatchLater/compare/v0.1.1...v0.1.2
[0.1.1]: https://github.com/KIFFCollective/BetterWatchLater/compare/v0.1.0...v0.1.1
[0.1.0]: https://github.com/KIFFCollective/BetterWatchLater/releases/tag/v0.1.0
