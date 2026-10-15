# TODOS

Deferred on purpose. Each item names what it waits for.

## Waits for the studio's own data

- Case texts: task, what was done, result, numbers. Now placeholders in `plugins/content/data/cases.json` and both `texts.*.json`.
- Contacts: real email, WhatsApp, socials (Telegram is real). Now placeholders in `plugins/content/data/contacts.json`; the `<noscript>` line in `site/index.html` repeats the email.
- Subtitles for cases 3, 6 and 8 (the cases with sound): add `<track>` files when the texts arrive.
- Showreel: the studio has none yet. The hero keeps no slot for it.

## Waits for publication

- Own domain: set `PUBLIC_ORIGIN` so `og:image` gets an absolute address.
- Visit counter: `plugins/visits` has only `off.ts`. Needs a store on the server.
- A share card per case (`/#case-N` shows the site card today).
- Analytics: none until the studio picks a service.

## Later, from the visual check (2026-10-14)

- Keyboard dragging: pieces move only by mouse and touch. A move mode (focus a piece, arrows, Enter) would match the slingshot's keys. Impact: medium, accessibility.
- Spacing tokens: DESIGN.md names a 4/8/16/24/32/48 px scale; component CSS still uses some one-off values. Impact: polish.
- Plan B polaroid (finale): it turns site sound on and off but has no `aria-pressed`, unlike the sound button; the sound API has no state to read. Impact: polish, accessibility (2026-10-15).

## Not planned

- Dark theme; illustrations beyond the whale and the stickers.
- WebM or AV1 encodes next to H.264.
- An admin panel: texts and cases change through the data files.
