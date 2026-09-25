# Contributing

Thank you for showing interest in contributing to GlanceThing! This document will lay out some of the policies, processes and expectations for contributing to the project.

## Code of Conduct

Please be respectful and constructive when interacting with others.

Harassment, personal attacks, or disrespectful behavior will not be tolerated.
Assume good intentions and focus discussions on improving the project.

## How To Contribute

0. Make a fork of the repository and clone it locally
1. Create a new branch:
   ```bash
   git checkout -b my-awesome-feature
   ```
2. Start making your changes
3. Make sure you run the following commands to verify the code builds, and to follow formatting and code style rules:

   ```bash
   # in the root of the repository
   npm run build
   npm run lint
   npm run format

   # in /client
   npm run build
   npm run lint
   ```

   Installing Prettier and ESLint in your IDE can help automate this!

4. Commit your changes (following [Conventional Commits](https://conventionalcommits.org))
5. Push your changes
6. Make a pull request (style explained below)

## Making Pull Requests

Pull requests should:

- Focus on one or few changes at a time (massive pull reqeusts will be denied)
- Clearly describe its changes

Pull request titles should also follow [Conventional Commits](https://conventionalcommits.org), e.g.:

```
fix: prevent crash when configuration for X is missing
```

## Building a community app

Official apps belong in
[GlanceThing-Apps](https://github.com/Pramodhsurya/GlanceThing-Apps). Copy
`exampleapp/` there. The zip format, required `manifest.json` fields, Chrome 69
limits, and how GlanceThing finds `index.html` are in [APPS.md](APPS.md).

## Apps from existing repositories

GlanceThing ships a swipe-down apps tray with built-in apps. Some of those apps are inspired by (or may later be adapted from) work that already exists in other open-source projects — for example [DeskThing](https://github.com/ItsRiprod/DeskThing), [deskthing-apps](https://github.com/itsriprod/deskthing-apps), community apps such as [pomodoro-thing](https://github.com/grahamplace/pomodoro-thing), and similar Car Thing projects.

If you add, port, or vendor an app whose code, assets, UI, or behavior is taken **directly** from an existing repository (or a release zip / package from one):

1. **Say so in the pull request** — name the source repo, the license it uses, and what you copied or adapted (code, icons, layout, protocol, etc.).
2. **Credit it in code or docs** — add a short attribution near the app (comment, README blurb, or Credits section) so maintainers and users can see the origin without digging through history.
3. **Respect the upstream license** — keep required notices, and do not relicense third-party code in a way that conflicts with its terms.
4. **Prefer adaptation over blind copy** — call out whether this is a fresh GlanceThing-native implementation inspired by another app, or a direct port of that app’s sources.

Built-in tray apps that are GlanceThing-native but inspired by DeskThing counterparts (for example Music, which combines ideas from DeskThing-GMP and Local Audio) should still note inspiration in Credits when relevant. Direct reuse of upstream sources always needs explicit attribution as above.

The Pomodoro timer is taken directly from
[grahamplace/pomodoro-thing](https://github.com/grahamplace/pomodoro-thing)
(contribution by grahamplace). Keep that credit in the app UI, README, and
CHANGELOG if you change the timer.

## AI Policy

AI Tools (GitHub Copilot, Cursor, Claude, etc.) can be used for assistance when developing, but the human developer must understand and is responsible for the changes.

Using AI for research, suggestions, boilerplate/examples and autocompletion may be allowed.

Any AI used to make changes to the project must be disclosed in the pull request.

Automated changes and pull requests (e.g. OpenClaw) is disallowed.

Maintainers hold the right to close pull requests and deny changes that are suspected of using automated AI tools, or where the developer cannot explain what the changes contain.

## Maintainer Rights

The maintainer(s) holds the right to do the following:

- Request / push changes to a pull request before it is merged
- Reject pull requests that are low-quality, automated or do not align with the project's goals
- Close stale pull requests and issues

## Closing Thoughts

These guidelines help keep the project maintainable, and creates a sustainable environment for everyone looking to help the development of the project.

Thanks again for showing interest in helping the project!
