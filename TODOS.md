# TODOS

Deferred on purpose. Each item names what it waits for.

## Waits for the studio's own data

- Antiquerus (7) link: the studio sent none, so its page has no outside link.
- Pictures for AG1 (2: advertorials, landing pages): the page shows only the video.
- Brand films for Waldorf Astoria Berlin (1) and King’s Resort & Casino (5): their pages name a film, but the case videos are the website recordings.
- Like Center logo for the clients' sheet: no vector logo found (likecentre.ru and like.center do not answer from the server). Add it to `brands.json` when the studio sends the file.
- Contacts: Behance and VK addresses. Left out of the page until they arrive (`socials` in `plugins/content/data/contacts.json` is empty; the bot and support links are real; the `<noscript>` line in `site/index.html` repeats the bot link).
- Subtitles for case 3, Dear Passengers (the case with sound): add `<track>` files when the texts arrive.
- Showreel: the studio has none yet. The hero keeps no slot for it.
- Case previews for King’s Resort & Casino (5), Antiquerus (7), Skyeng (9) and Tria (11): frames from the videos until the studio sends its pictures (`poster` in `tools/media.json`).

## Waits for the public site

- Visit counter: `plugins/visits` has only `off.ts`. The public site on Netlify has no server of ours, so it needs an outside service.
- Real iPhone in Low Power Mode: check that case tiles show their cover, then their loops play after the first tap. Tested only in Chromium with `play()` refused (`tests/e2e/wall.test.ts`).
- A share card per case (`/#case-N` shows the site card today).
- Analytics: none until the studio picks a service.

## Later, from the visual check (2026-10-14)

- Keyboard dragging: pieces move only by mouse and touch. A move mode (focus a piece, arrows, Enter) would match the slingshot's keys. Impact: medium, accessibility.
- Spacing tokens: DESIGN.md names a 4/8/16/24/32/48 px scale; component CSS still uses some one-off values. Impact: polish.
- Plan B polaroid (finale): it turns site sound on and off but has no `aria-pressed`, unlike the sound button; the sound API has no state to read. Impact: polish, accessibility (2026-10-15).
- Roll call on a 1024x768 screen: the badges stand in two rows under the team block, and the sound and pause pill (bottom left) covers Maria's role for the 3 s of the roll call. Repro: 1024x768, «Команда» in the menu. Severity low, visual (testing, 2026-10-15).

- Phone previews (2026-11-05): the 720x900 loops are cut from the middle of wide site recordings, so AG1, Tria and Skyeng show words cut at the edges while they play. Tuning each case's `phoneFocus` in `tools/media.json` and rebuilding that case (`bun tools/media.ts --only N`) would aim each one at its subject: the phone poster and the phone loop share it. Impact: polish, visual.

## Not planned

- Dark theme; illustrations beyond the whale and the stickers.
- WebM or AV1 encodes next to H.264.
- An admin panel: texts and cases change through the data files.

## Completed

- Own domain: `bun run export` sets `PUBLIC_ORIGIN=https://northwhale.studio`, so `og:image` is absolute. **Completed:** 2026-10-27.
- DeckForge (8) website link: not needed, the owner removed the case. **Completed:** 2026-11-05.
