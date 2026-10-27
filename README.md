# North Whale Studio

The studio's one-page site: a wall of live cases, a case window, services, a manifesto, contacts, a giant footer slogan and a whale in a slingshot. Russian and English. TypeScript plugins, bundled by Bun when the server starts; no framework, no database.

## Run it

- `bun install`
- `PORT=3000 DEV=1 bun serve.ts`: serves the site; `DEV=1` rebuilds the page after edits. In a board task, `paneweb up` runs `.paneweb.json`'s command on its own port.
- `APP=app.light.json`: the light version, the showcase without the game layer.
- `/health` answers the commit the server runs.
- `bun run export`: the site as plain files in `dist/`, for the public site https://northwhale.studio.

## Check it

- `bun run test`: unit tests, no browser.
- `bun run e2e`: browser tests in Chromium (`tests/e2e`); one file: `bun test tests/e2e/<name>.test.ts --timeout 60000`.
- `bun run check`: TypeScript types.
- `E2E_EXPORT=1 bun run e2e`: the same browser tests on the exported site, served the way Netlify serves it.

## Where things are

- `plugins/<name>/`: one block of the site each (wall, case, sound, slingshot, ...): `plugin.json`, `index.ts`, the empty version `off.ts`, styles, tests. `app.json` turns them on.
- `plugins/content/data/`: all texts, cases, services, team and contacts, in Russian and English.
- `platform/`: the frame, motion and springs, text binding, browser memory and the shared UI parts.
- `build.ts`: bundles `platform/main.ts` with the plugins `app.json` enables. `serve.ts`: the server.
- `site/`: `index.html`, fonts, media (case videos, team photos, music), the whale, the link preview picture.
- `tools/media.ts`: builds `site/media` from the studio's source files, settings in `tools/media.json`.
- `tools/export.ts`: writes the static site for Netlify. `netlify.toml`: Netlify's build settings. `deploy/`: its cache headers and redirects.
- `tests/`: server, build, token and plugin checks; `tests/e2e/`: browser checks.

## Docs

- [docs/tutorial-first-run.md](docs/tutorial-first-run.md): the site on your computer, step by step.
- [docs/how-to-update-content.md](docs/how-to-update-content.md): change texts, cases, contacts, the clients' sheet, the team, the music.
- [docs/how-to-publish-on-netlify.md](docs/how-to-publish-on-netlify.md): put the site on Netlify. [docs/how-to-connect-domain-namecheap.md](docs/how-to-connect-domain-namecheap.md): the customer points northwhale.studio at it.
- [docs/reference-site.md](docs/reference-site.md): commands, settings, addresses, data files, media limits, plugins.
- [docs/explanation-site-design.md](docs/explanation-site-design.md): why the site is built this way.
- [docs/product/system-architecture.md](docs/product/system-architecture.md): the blocks, their layers, APIs and events. Also [scope](docs/product/scope.md) and [user stories](docs/product/user-stories.md).
- [docs/designs/](docs/designs/): the brief, the build plan, the user stories and the visual check report.
- [DESIGN.md](DESIGN.md): the design system. [docs/credits.md](docs/credits.md): the music and its licence, where each logo came from. [TODOS.md](TODOS.md): deferred work. [CHANGELOG.md](CHANGELOG.md): what shipped.

## Staging, the public site and the bug widget

- Staging site: the board runs `.staging-site.json`'s command from branch `staging`.
- Task test site: `paneweb up` runs `.paneweb.json`'s command.
- Public site https://northwhale.studio: Netlify builds branch `production` with `bun run export` and serves `dist/`.
- The `<script>` in `site/index.html` and `site/404.html` loads the board's bug report widget on tailnet sites. Keep it in every page. The export leaves it out.
