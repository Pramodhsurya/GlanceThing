# Changelog

All notable changes to this fork of GlanceThing are documented here.
The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and versions follow [Semantic Versioning](https://semver.org/).

Versions up to 0.0.16 come from the upstream project,
[BluDood/GlanceThing](https://github.com/BluDood/GlanceThing).
Versions 0.1.0 and 0.1.1, and the upcoming 1.0.0, are from this fork,
[Pramodhsurya/GlanceThing](https://github.com/Pramodhsurya/GlanceThing).

## [1.0.0] - Unreleased

First major release of this fork. Everything currently in progress, and
upcoming work until this ships, belongs here.

This version adds a swipe-down apps tray to the Car Thing, with built-in apps
inspired by DeskThing apps and written natively for GlanceThing. It also adds
an Apps page and auto-update to the desktop app, new music sources, and a fix
for reading "Now Playing" on current macOS.

0.1.2 and 0.1.3 were local development versions of this work and were never
published. Their changes are included here.

### Added

#### Car Thing: apps tray

- Swipe down from the top of the Car Thing screen to open the apps tray.
  - A short swipe (about 50 to 160 pixels) shows a "Swipe or tap for apps"
    bar. Tapping it, or swiping further, opens the full tray.
  - A long swipe (160 pixels or more) opens the full tray straight away.
  - Swipes are detected anywhere on the screen, including on the top status
    bar.
  - Inside a scrollable area, such as the calendar, a downward swipe scrolls
    the area. It opens the tray only when that area is scrolled to the top, or
    when the swipe starts in the top 60 pixels of the screen.
- The full tray shows the apps in a 6-column grid. You can move the selection
  with the dial, open an app with the dial button, and go back with the back
  button (Escape).
- Opening the tray or an app closes the fullscreen player.
- Apps turned off in the desktop app are hidden from the tray. If an app is
  open when it's turned off, it closes.

#### Car Thing: built-in apps

Each app is a GlanceThing-native implementation. The DeskThing apps that
inspired them are credited in the README; no code was copied from them.

- **Music**: one app for everything that's playing.
  - Album art (also used as a blurred background), song, artist and album.
  - A seek bar you can drag, back and forward 10 seconds, previous, next and
    play/pause.
  - Shuffle, repeat (off, all, one) and volume.
  - A source button in the header opens a **Play from** list: Spotify, This
    computer, Apple Music (macOS) and YouTube Music. Sources that aren't ready
    are greyed out with a short explanation.
  - Controls that the current source doesn't support are greyed out.
  - Turning the dial raises or lowers volume, including when nothing is
    playing yet. Pressing the dial plays or pauses.
  - Inspired by DeskThing-GMP (controls) and DeskThing Local Audio (source
    picker).
- **Pomodoro**: focus timer with short and long breaks.
  - Configurable number of blocks, focus, short break and long break
    lengths, colours, and an optional screen flash when a phase ends.
  - Session dots, smart previous and next, and reset.
  - The timer keeps its state when you leave the app.
  - Timer taken directly from
    [grahamplace/pomodoro-thing](https://github.com/grahamplace/pomodoro-thing)
    (original contribution by grahamplace). The app UI credits that repo.
- **Resource Usage**: CPU and memory gauges for the computer, CPU history,
  per-core load bars, load average, uptime and hostname. Inspired by DeskThing
  System.
- **Recording Notes**: records voice notes with the Car Thing's microphone.
  - Shows a live level meter while recording.
  - Saves recordings on the computer as mono, level-normalised WAV files in
    `<user data>/recordings`.
  - Lists recordings, with play (on the computer), delete, and reveal folder.
  - The original Car Thing app (`superbird`) is stopped while recording,
    because it holds the microphone. GlanceThing waits until the mic is free,
    then resumes `superbird` afterwards and when GlanceThing quits.
  - Inspired by DeskThing Recording Notes.
- **GitHub**: your repositories and starred repositories, with open or closed
  pull requests and issues for each.
  - Uses a token saved in Settings, or falls back to the GitHub CLI login
    (`gh auth token`).
  - Results are cached for 5, 15 (default) or 60 minutes.
  - Inspired by DeskThing-GitHub.
- **Console Logs**: live GlanceThing log with level filters, scope chips and a
  "follow live" option. Shows the last 300 lines on open. Inspired by
  DeskThing Console Logs.
- **Link**: screens connected to the same computer share a tap pad, colours
  and a score board. Inspired by DeskThing Link.
- **Mic**: one icon. Tap (or press the dial) to mute the selected
  microphones. A dropdown lists every hardware mic (built-in, USB, iPhone,
  and so on) so you can choose which ones the button controls. When any of
  those mics starts being used, the Mic app opens on the Car Thing by
  itself; you can then close or leave it. Virtual meeting devices such as
  Teams and Zoom are left alone. The name can change later.

#### Desktop app

- **Apps** page laid out like DeskThing: Installed list with Settings / Pause /
  Run, a Download catalog, and **Add App**.
- Add a community app from a GitHub URL (`owner/repo` or github.com), or upload
  a zip. GlanceThing fetches the latest release zip, reads `manifest.json`, and
  asks you to acknowledge issues before **Initialize App** — including
  “Insecure App”, already installed, wrong platform, and missing web UI.
  A monorepo release with several zips (such as GlanceThing-Apps) adds each
  zip as its own Download row.
- Installed community apps appear on the Car Thing tray. Their web UI is served
  from this computer on the same port as the socket (`/community/{id}/`).
  DeskThing server-only apps without a client folder can be stored, but they
  cannot run yet. Manifest `platforms` values `mac` / `macos` count as this
  computer on macOS.
- **Apps** tab next to Home and Layout. It lists every Car Thing app with an
  icon, a description and an on/off switch, plus a count of enabled apps.
  Changes reach the Car Thing straight away.
- **Auto-update**, on by default. Turn it off in Settings → General →
  Auto-update.
  - Checks GitHub releases 15 seconds after start-up and then every hour.
  - When a newer version exists, it downloads it, installs it and restarts:
    - macOS: mounts the `.dmg`, copies the new app aside, and swaps it into
      place after GlanceThing quits, then reopens it.
    - Windows: runs the release's installer silently.
    - Linux: replaces the AppImage.
  - The Home banner shows download progress, then "Installing…" and
    "Restarting…".
  - With auto-update off, the banner offers an **Install** button instead.
- **GitHub settings** in Settings → General: a GitHub token field (stored
  encrypted) and a refresh interval (5, 15 or 60 minutes).
- **Apple Music** playback source (macOS).
  - Controls the Music app with AppleScript: play, pause, next, previous,
    seek, shuffle, repeat, volume and album art.
  - Never opens Music on its own.
  - macOS asks once for permission to control Music.
- **YouTube Music** playback source for the
  [YouTube Music Desktop app](https://github.com/th-ch/youtube-music).
  - Uses that app's built-in API Server plugin on port 26538.
  - The first time, YouTube Music asks whether to allow "glancething". The
    access token is then stored encrypted.
  - Supports play, pause, next, previous, seek, shuffle, repeat, volume and
    album art.
- Apple Music and YouTube Music are also available in the playback step of
  setup, with setup instructions.

#### Server and protocol

- Playback: new `seek` action (position in milliseconds), plus `sources` and
  `source` actions to list playback sources and switch between them.
- Spotify and the native source support seeking.
- New WebSocket handlers: `system`, `logs`, `link`, `recorder`, `github`
  and `mic`.
- The layout message now includes `hiddenApps`, so the Car Thing knows which
  apps to hide.

### Changed

- **"This computer" on macOS now uses
  [mediaremote-adapter](https://github.com/ungive/mediaremote-adapter).**
  macOS 15.4 and later block apps from reading Now Playing directly, so
  GlanceThing received nothing, for example from YouTube Music in Chrome. The
  adapter reads it through `/usr/bin/perl`, which macOS still allows.
  - Works for anything that shows in Control Center's media controls,
    including Chrome, Safari, Spotify and podcasts.
  - Reads song, artist, album, position, duration and album art. Supports
    play, pause, next, previous and seek.
  - Shuffle and repeat work when the player reports them.
  - Volume controls the Mac's system volume.
  - The adapter is bundled in `resources/common/mediaremote` under its BSD
    3-Clause license.
  - Windows and Linux still use `node-nowplaying`.
- The update banner only appears when GitHub has a newer version than the
  installed one. Versions are compared numerically, so 0.1.10 is newer than
  0.1.9. Previously it appeared whenever the versions differed, which offered
  v0.1.1 as an "update" to a newer local build.
- The Car Thing client version now matches the desktop app version (1.0.0).
  The two must match, or the Car Thing keeps reinstalling the client.
- The Car Thing client build rewrites CSS that Chrome 69 (the Car Thing's
  browser) doesn't support:
  - `inset` becomes `top`, `right`, `bottom` and `left`.
  - Flexbox `gap` becomes margins on the children.
  - `margin-left: auto` and `margin-top: auto` are marked `!important`, so
    they still win over the gap margins.
- Resource Usage reports available memory on macOS from `vm_stat` (free,
  speculative, purgeable and file-backed pages), instead of Node's free
  memory, which made memory look almost full.
- The Car Thing's media listener ignores unrelated playback messages, such as
  the new source list.

### Removed

- The separate Spotify, Music Player, GMP and Local Audio tray apps. They're
  replaced by the single Music app.

### Fixed

- Swiping down didn't open the apps tray on the device, because swipes that
  started on the status bar weren't detected.
- The "Swipe or tap for apps" bar appeared as a light-grey button with
  unreadable white text on the Car Thing.
- Recording Notes failed immediately (`error: closed`). Two things were
  wrong: `superbird` still held the microphone when `arecord` started, and
  `adb exec-out` cannot stream audio from the Car Thing at all (it closes
  even for `echo`). The app now waits until the mic is free, records to a
  file on the device, and copies that file back when you stop.

### Documentation

- README: a Credits table mapping each built-in app to the DeskThing app that
  inspired it, and a credit for mediaremote-adapter.
- CONTRIBUTING: rules for crediting code, assets or ideas taken from other
  repositories.
- APPS.md: how to build a community app, the required zip layout and
  `manifest.json` fields, and how GlanceThing installs and serves it.
- Official apps collection: [GlanceThing-Apps](https://github.com/Pramodhsurya/GlanceThing-Apps),
  with Music, Pomodoro, Resource Usage, Recording Notes, GitHub, Console Logs,
  Link and an `exampleapp` template. Adding that repo lists every
  `*-app-*.zip` on the latest release.
- AGENTS.md: update this changelog on every project change.
- Pomodoro credits [grahamplace/pomodoro-thing](https://github.com/grahamplace/pomodoro-thing)
  in the app UI, Apps details, README, and GlanceThing-Apps, because the
  timer was taken from that repo.
- GlanceThing-Apps README Credits (and the apps table) link each app to its
  original repo.
- README screenshots for the Apps tab, the Car Thing tray, and each built-in
  tray app (Music, Pomodoro, Resource Usage, Recording Notes, GitHub, Console
  Logs, Link), also used in GlanceThing-Apps. The Link shot sits in the same
  table layout as the other app shots.
- TODO.md: planned work to turn weather, calendar, AI usage and the other
  home features into apps that also offer layout widgets; widgets from the
  existing tray apps (Music, Pomodoro, and the rest) that can be added to
  home pages; a one-tap mute app for every mic on the computer; and, if
  possible, the Car Thing mic as a system input device.

### Known limitations

- On macOS, every rebuilt or updated version has a new ad-hoc signature, so
  macOS asks for Keychain access again after each update. Avoiding this needs
  an Apple Developer ID certificate.
- Auto-update installs nothing until a release newer than 1.0.0 is published
  on GitHub.
- While Recording Notes is recording, the original Car Thing app is stopped
  so the microphone is free. The dial still works inside GlanceThing
  (Chromium stays running), but the stock Car Thing UI is not available
  until recording ends.
- YouTube Music (desktop app) and Apple Music haven't been tested with music
  playing.

## [0.1.1] - 2026-09-24

### Changed

- Redesigned the AI usage widgets, with selectable layouts.

### Documentation

- Showed Car Thing screenshots inside a device frame, refreshed the cached
  screenshots, and added AI usage and photo album screenshots to the README.

## [0.1.0] - 2026-09-24

First release from this fork.

### Added

- Customisable screen layout, with a live preview of the Car Thing screen in
  the desktop app's layout editor.
- Multiple layout pages that you swipe between.
- Dial navigation, with page and item modes.
- Sleep and wake actions.
- Weather widget.
- Calendar widget with a Join button and meeting reminders (macOS).
- AI usage widget for Codex, Claude and Cursor subscriptions.
- Photo album screensaver with up to 10 rotating photos.
  - Photos are resized to the Car Thing screen on upload.
  - Each photo can fill or fit the screen.
  - Optional shuffle and an optional clock.
- A notice explaining the macOS Keychain prompt after an update.

### Changed

- Update checks and client downloads point at the fork.
- The fork's Car Thing client is bundled inside the desktop app.
- Client sources are kept out of the app archive.

### Fixed

- adb device selection and WebSocket reconnects are more reliable.
- Removed machine-specific shortcut labels.
- AI usage keeps working after a Keychain prompt at start-up.

### Build

- CI runs lint, format and build checks on pushes and pull requests.

## [0.0.16] - 2026-04-11

- Version bump. No other changes are recorded in this repository.

## [0.0.12-1] - 2025-07-09

### Fixed

- Spotify secrets are fetched dynamically.

## [0.0.12] - 2025-06-30

### Added

- Checks for updates and shows the new version on the Home page.
- New developer menu and better modal handling.

### Fixed

- Listeners are cleaned up for the playback manager.
- New Spotify cipher.
- Extra check for an open socket.

## [0.0.11] - 2025-06-13

### Added

- Linux support, with platform-specific logic refactored.
- Nightly version of the app, with nightly and stable Linux builds.

### Fixed

- Spotify changes that broke playback.
- macOS icon padding.
- Error for an invalid source.
- The desktop app is sandboxed.

### Build

- CI updated to Node 22, cancels running workflows on a new run, and has
  separate nightly and release configurations.

## [0.0.10] - 2025-05-22

### Added

- Native playback integration using `node-nowplaying`.
- Custom screensaver image.
- Uploading a custom GlanceThing client, with a validity check.
- Log tab in Settings, behind developer mode.
- Button in the developer menu to open DevTools.
- Reboot button.

### Fixed

- Carthing update interval crash.
- Spotify scope name.
- Handler config is validated instead of only checking that one exists.
- The image is cleared when none is available.
- Uses the `SystemRoot` variable for paths and the platform-specific `tar`.

### Build

- Windows builds run on Windows. All dependencies updated.

## [0.0.9] - 2025-05-11

### Changed

- Modular playback handlers. The Spotify handler was reworked and fixed.

## [0.0.8-2] - 2025-03-15

### Fixed

- New logic for getting the Spotify token (thanks to KRTirtho of Spotube).
- No longer crashes when Spotify breaks.

## [0.0.8-1] - 2025-03-10

### Fixed

- Hotfix for the new method of getting the Spotify token.

## [0.0.8] - 2025-03-09

### Added

- The client and server negotiate versions so the client updates
  automatically.
- USB patch, and a way to apply patches.
- Link to ThingFlash in the flash step of setup.
- Spotify podcast playback.
- Brightness is saved, and auto-brightness or brightness is applied on start.
- The client sends periodic pings to check the connection.

### Fixed

- The Spotify socket restarts automatically on close.
- The Car Thing is recognised even when some files are missing.
- The client wakes from sleep when connected.
- Single-instance lock, so the companion app can't open twice.
- Basic input validation in the shortcut editor.
- Escape (back button) closes the fullscreen player, and the player shows a
  placeholder when nothing is playing.

## [0.0.7] - 2025-02-27

### Added

- Fullscreen Spotify player with extra controls.

### Changed

- WebSocket handlers and setup functions moved to their own files.

## [0.0.6-1] - 2024-11-17

### Build

- Upload build artifacts and build a universal macOS app.

## [0.0.6] - 2024-11-11

### Added

- Track progress bar, and a volume slider you can show and hide.
- Updated system menu and sleep.
- Log levels, changeable in Settings.
- Auto-brightness and manual brightness settings.
- macOS builds.

### Changed

- Storage is kept in memory and is synchronous.

## [0.0.5] - 2024-11-06

### Fixed

- Spotify token refreshes when it expires.
- No Spotify requests without a session, and "no session" is reported when
  no device is active.
- Crash when play/pause was pressed with no active session.

## [0.0.4] - 2024-11-04

### Added

- Customisable date and time format.
- Basic logging to a file.
- More clickable Spotify buttons, and the cover image controls playback.
- macOS support for shortcuts.

### Fixed

- The server binds to a random port (1337 in development).
- The app keeps running when its windows are closed.
- adb not connecting to the Car Thing in built apps.

### Build

- Prettier, LF line endings and a license.

## [0.0.3] - 2024-10-25

### Added

- Developer mode setting in the desktop app.

### Fixed

- Checks that a local client build exists before using it.
- Better Spotify widget when nothing is playing, and layout adjustments when
  there are no shortcuts.

## [0.0.2] - 2024-10-24

### Added

- More error handling, forwarded to the client.
- Downloads adb automatically if it isn't installed.

## [0.0.1] - 2024-10-23

- Initial release.

[1.0.0]: https://github.com/Pramodhsurya/GlanceThing/compare/v0.1.1...HEAD
[0.1.1]: https://github.com/Pramodhsurya/GlanceThing/releases/tag/v0.1.1
[0.1.0]: https://github.com/Pramodhsurya/GlanceThing/releases/tag/v0.1.0
[0.0.16]: https://github.com/BluDood/GlanceThing/releases/tag/v0.0.16
[0.0.12-1]: https://github.com/BluDood/GlanceThing/releases/tag/v0.0.12-1
[0.0.12]: https://github.com/BluDood/GlanceThing/releases/tag/v0.0.12
[0.0.11]: https://github.com/BluDood/GlanceThing/releases/tag/v0.0.11
[0.0.10]: https://github.com/BluDood/GlanceThing/releases/tag/v0.0.10
[0.0.9]: https://github.com/BluDood/GlanceThing/releases/tag/v0.0.9
[0.0.8-2]: https://github.com/BluDood/GlanceThing/releases/tag/v0.0.8-2
[0.0.8-1]: https://github.com/BluDood/GlanceThing/releases/tag/v0.0.8-1
[0.0.8]: https://github.com/BluDood/GlanceThing/releases/tag/v0.0.8
[0.0.7]: https://github.com/BluDood/GlanceThing/releases/tag/v0.0.7
[0.0.6-1]: https://github.com/BluDood/GlanceThing/releases/tag/v0.0.6-1
[0.0.6]: https://github.com/BluDood/GlanceThing/releases/tag/v0.0.6
[0.0.5]: https://github.com/BluDood/GlanceThing/releases/tag/v0.0.5
[0.0.4]: https://github.com/BluDood/GlanceThing/releases/tag/v0.0.4
[0.0.3]: https://github.com/BluDood/GlanceThing/releases/tag/v0.0.3
[0.0.2]: https://github.com/BluDood/GlanceThing/releases/tag/v0.0.2
[0.0.1]: https://github.com/BluDood/GlanceThing/releases/tag/v0.0.1
