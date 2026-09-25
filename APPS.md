# Building apps for GlanceThing

This is the format GlanceThing understands. If your zip follows it, the
desktop **Apps** tab can download it from GitHub, and the Car Thing can open
it from the swipe-down tray.

GlanceThing does **not** run a DeskThing Node server process. It only serves
the app's **web UI** (static HTML, CSS and JavaScript) from this computer to
the Car Thing.

## Official apps repo

The official collection lives in
[Pramodhsurya/GlanceThing-Apps](https://github.com/Pramodhsurya/GlanceThing-Apps),
the same kind of monorepo as
[ItsRiprod/Deskthing-Apps](https://github.com/ItsRiprod/Deskthing-Apps).

It holds every current GlanceThing tray app (Music, Pomodoro, Resource Usage,
Recording Notes, GitHub, Console Logs, Link, Mic, Weather, Calendar, AI usage,
Photos) plus `exampleapp`. None of those are preinstalled. You pick them on
first setup, or later from the Store. Copy `exampleapp` when you want a new
id you can initialize from Git.

Open **Apps → Store**. GlanceThing lists the official repo on its own. If the
latest release has several `*-app-*.zip` files, each one is a store row.

## Install an existing app

From the official store:

1. Open GlanceThing → **Apps** → **Store**.
2. Click **Install** on the app you want. No Git URL to paste.
3. Official apps install immediately. Community zips still show
   **Potential Issues Found**; tick **Acknowledge?** and **Initialize App**.

From another GitHub repo:

1. Open **Apps → From Git**.
2. Paste `owner/repo` or a `https://github.com/owner/repo` URL.
3. Click **Add Repository**, then **Install**.
4. Acknowledge the warnings and **Initialize App**.

You can also use **Upload Local File** with a `.zip` that matches the layout
below.

The repo must have at least one **GitHub Release** with a `.zip` (or
`.tar.gz`) asset. If the latest release has several zips, each one is added
to the Download list. If there is only one zip, GlanceThing uses that.

## What GlanceThing looks for

After extract, GlanceThing walks the zip root and one folder down.

### Required

| File            | Why                                                                          |
| --------------- | ---------------------------------------------------------------------------- |
| `manifest.json` | Tells GlanceThing the app id, name and version. Without this, install fails. |
| `index.html`    | The screen that opens on the Car Thing.                                      |

`index.html` may sit in any of these places:

```
your-app.zip
├── manifest.json
└── index.html                 ← accepted

your-app.zip
├── manifest.json
└── client/index.html          ← preferred

your-app.zip
├── manifest.json
└── dist/index.html            ← accepted

your-app.zip
└── some-folder/
    ├── manifest.json
    └── client/index.html      ← accepted (one extra folder)
```

`webapp/index.html` is also accepted.

### `manifest.json`

Only `id` is strictly required. Everything else has a fallback.

```json
{
  "id": "hello-world",
  "label": "Hello World",
  "version": "1.0.0",
  "author": "Your Name",
  "description": "A one-screen example for the Car Thing.",
  "repository": "https://github.com/you/hello-world",
  "platforms": ["mac", "windows", "linux"],
  "requiredVersions": {
    "server": "1.0.0"
  }
}
```

| Field                     | Required | How GlanceThing reads it                                                                                                  |
| ------------------------- | -------- | ------------------------------------------------------------------------------------------------------------------------- |
| `id`                      | Yes      | Lowercased. Only `a–z`, `0–9`, `-` and `_` are kept. Used as the folder name and the tray id. If missing, `name` is used. |
| `label`                   | No       | Name in the Apps list and the tray. Falls back to `name`, then `id`.                                                      |
| `version`                 | No       | Shown on the card. Falls back to `0.0.0`. Compared when you install over an older copy.                                   |
| `author`                  | No       | Shown as “By …”. Falls back to `Unknown`.                                                                                 |
| `description`             | No       | Shown in Settings.                                                                                                        |
| `repository`              | No       | Stored with the install.                                                                                                  |
| `platforms`               | No       | If set, it must include this computer. `mac` / `macos` / `osx` count as macOS. `windows` / `win` count as Windows.        |
| `requiredVersions.server` | No       | If set, this GlanceThing version must be greater than or equal to it.                                                     |

`name` is accepted as a stand-in for `id` or `label`, so many DeskThing
manifests work as-is.

**Reserved ids** (cannot be used): `music`, `pomodoro`, `system`, `logs`,
`link`, `recorder`, `github`, `mic`, `weather`, `calendar`, `usage`,
`photos`, `spotify`, `gmp`, `local`.

## How GlanceThing understands an install

1. The **Store** loads GlanceThing-Apps (releases when they exist, plus
   `catalog.json`). **From Git** calls GitHub
   `GET /repos/{owner}/{repo}/releases` and remembers the latest zip URL.
2. After you accept the disclaimer, **Install** saves the zip (or the app
   folder from the official repo), extracts it, and reads `manifest.json`.
3. It looks for `index.html` in `client/`, `dist/`, `webapp/`, or the same
   folder as the manifest.
4. It builds a list of warnings (see below). You must acknowledge each one.
5. **Initialize App** copies the extract to
   `<GlanceThing user data>/apps/{id}/`.
6. If the app is **Run** (enabled), GlanceThing adds it to the layout message
   the Car Thing already receives.
7. The Car Thing tray shows the app. Opening it loads

   `http://localhost:1337/community/{id}/`

   on the same port as the existing WebSocket (adb already forwards that
   port). GlanceThing serves files from the app's `index.html` folder.

Pause hides it from the tray. **Purge** deletes the folder and the catalog
entry.

## Warnings you must acknowledge

These are the same style of checks DeskThing shows before initialize.

| Title                 | When it appears                                                                          |
| --------------------- | ---------------------------------------------------------------------------------------- |
| Insecure App          | Always. Community apps are not reviewed by GlanceThing.                                  |
| No Web UI             | No `index.html` was found. The zip can be stored, but it will not open on the Car Thing. |
| Reserved App ID       | `id` clashes with a built-in app. Initialize is blocked.                                 |
| App Already Exists    | This `id` is already installed. Installing overwrites it.                                |
| Incompatible Platform | `platforms` does not include this computer.                                              |
| compatible-server     | This GlanceThing is older than `requiredVersions.server`.                                |

## Build a new app

The Car Thing browser is **Chrome 69**. Keep the UI to HTML, CSS and
JavaScript that that browser can run. Avoid `gap` in flexbox, `inset`,
`color-mix`, and optional chaining if you inject scripts by hand. Vite with
`@vitejs/plugin-legacy` targeting Chrome 69 is a safe build.

### 1. Project layout

```
hello-world/
├── manifest.json
├── src/
│   └── main.js
├── index.html
└── package.json
```

A minimal `index.html`:

```html
<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <title>Hello World</title>
    <style>
      html,
      body {
        margin: 0;
        height: 100%;
        background: #111;
        color: #fff;
        font-family: sans-serif;
      }
      main {
        height: 100%;
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: 28px;
      }
    </style>
  </head>
  <body>
    <main>Hello from GlanceThing</main>
  </body>
</html>
```

The screen is **800×480**. Leave room at the top: GlanceThing draws its own
back button above your iframe.

### 2. Pack a release zip

The zip must contain `manifest.json` and `index.html` (or `client/index.html`).
Do not wrap them in extra junk folders if you can avoid it. One top-level
folder is fine.

```bash
zip -r hello-world-v1.0.0.zip manifest.json index.html
```

If you use Vite, zip `manifest.json` plus the `dist/` folder, or put
`manifest.json` inside `dist/` and zip that folder.

### 3. Publish on GitHub

1. Create a repo.
2. **Releases → Create a new release**.
3. Tag it (for example `v1.0.0`).
4. Attach `hello-world-v1.0.0.zip`. Putting `app` in the file name helps
   GlanceThing pick it when several assets exist.

Then in GlanceThing use `yourname/hello-world`.

### 4. Try it without GitHub

**Apps → From Git → Upload Local File** and choose the zip. The same
acknowledge step runs.

## What does not run

- DeskThing **server** apps that only ship `index.js` for a Node child
  process. GlanceThing will install them if `manifest.json` exists, then warn
  **No Web UI**.
- A repo with **no GitHub Releases**, or a release with no zip. A monorepo
  can attach one zip per app (`*-app-*.zip`); GlanceThing lists all of them.
  See [GlanceThing-Apps](https://github.com/Pramodhsurya/GlanceThing-Apps).

## Examples

- Official collection: [Pramodhsurya/GlanceThing-Apps](https://github.com/Pramodhsurya/GlanceThing-Apps).
- Community example: [grahamplace/pomodoro-thing](https://github.com/grahamplace/pomodoro-thing)
  ships `pomodoro-thing-v0.10.1.zip` with `manifest.json` and `index.html` at
  the root.
