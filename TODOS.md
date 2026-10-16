# TODOS

Deferred on purpose. Each item names what it waits for.

## Waits for the studio's own data

- DeckForge (8) website link: the studio wrote «Visit the website» with no address; play.deckforge.net from their YouTube shows the host's «renew your subscription» page.
- Antiquerus (7) link: the studio sent none, so its page has no outside link.
- Pictures for AG1 (2: advertorials, landing pages) and Sergey Ibadov (6: brand identity): the pages show only the videos.
- Brand films for Waldorf Astoria Berlin (1) and King’s Resort & Casino (5): their pages name a film, but the case videos are the website recordings.
- Like Center logo for the clients' sheet: no vector logo found (likecentre.ru and like.center do not answer from the server). Add it to `brands.json` when the studio sends the file.
- Contacts: Behance and VK addresses. Left out of the page until they arrive (`socials` in `plugins/content/data/contacts.json` is empty; email, Telegram and WhatsApp are real; the `<noscript>` line in `site/index.html` repeats the email).
- Subtitles for cases 3, 6 and 8 (the cases with sound): add `<track>` files when the texts arrive.
- Showreel: the studio has none yet. The hero keeps no slot for it.
- Case previews for King’s Resort & Casino (5), Antiquerus (7) and DeckForge (8): frames from the videos until the studio sends its pictures (`poster` in `tools/media.json`).

## Waits for publication

- Own domain: set `PUBLIC_ORIGIN` so `og:image` gets an absolute address.
- Visit counter: `plugins/visits` has only `off.ts`. Needs a store on the server.
- A share card per case (`/#case-N` shows the site card today).
- Analytics: none until the studio picks a service.

## Later, from the visual check (2026-10-14)

- Keyboard dragging: pieces move only by mouse and touch. A move mode (focus a piece, arrows, Enter) would match the slingshot's keys. Impact: medium, accessibility.
- Spacing tokens: DESIGN.md names a 4/8/16/24/32/48 px scale; component CSS still uses some one-off values. Impact: polish.
- Plan B polaroid (finale): it turns site sound on and off but has no `aria-pressed`, unlike the sound button; the sound API has no state to read. Impact: polish, accessibility (2026-10-15).
- Roll call on a 1024x768 screen: the badges stand in two rows under the team block, and the sound and pause pill (bottom left) covers Maria's role for the 3 s of the roll call. Repro: 1024x768, «Команда» in the menu. Severity low, visual (testing, 2026-10-15).

## Not planned

- Dark theme; illustrations beyond the whale and the stickers.
- WebM or AV1 encodes next to H.264.
- An admin panel: texts and cases change through the data files.
