# TODOS

Deferred on purpose. Each item names what it waits for.

## Waits for the studio's own data

- Case texts: task, what was done, result, numbers. Now placeholders in `plugins/content/data/cases.json` and both `texts.*.json`.
- Team: names, roles, photos. Now placeholders in `plugins/content/data/team.json`.
- Contacts: real email, Telegram, WhatsApp, socials. Now placeholders in `plugins/content/data/contacts.json`; the `<noscript>` line in `site/index.html` repeats the email.
- Subtitles for cases 3, 6 and 8 (the cases with sound): add `<track>` files when the texts arrive.
- Showreel: the studio has none yet. The hero keeps no slot for it.

## Waits for publication

- Own domain: set `PUBLIC_ORIGIN` so `og:image` gets an absolute address.
- Visit counter: `plugins/visits` has only `off.ts`. Needs a store on the server.
- A share card per case (`/#case-N` shows the site card today).
- Analytics: none until the studio picks a service.

## Not planned

- Dark theme; illustrations beyond the whale and the stickers.
- WebM or AV1 encodes next to H.264.
- An admin panel: texts and cases change through the data files.
