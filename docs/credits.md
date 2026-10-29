# Credits

## Music: site/media/music.m4a

The background music that plays when a visitor turns site sound on (`plugins/sound/music.ts`).

| | |
|---|---|
| Title | Disco Ain't Old School |
| Author | Michael Ramir C. |
| Track page | https://mixkit.co/free-stock-music/disco/ (Mixkit has no page per track; the track is listed there, Mixkit item 935, published 2020-01-28) |
| Source file | https://assets.mixkit.co/music/935/935.mp3 (the file Mixkit's "Download Free Music" button hands out) |
| Licence | Mixkit Stock Music Free License, https://mixkit.co/license/#musicFree |
| Date accessed | 2026-10-14 |
| Credit text | None required. The licence allows commercial use, copying, modifying and public performance on any web platform without attribution. |
| Not allowed by the licence | CDs and DVDs, TV and radio broadcast, video games; remixing it or using it in a music-only track; claiming it as your own; registering it with a rights management service. |

The licence text was read at https://mixkit.co/license/modal/musicFree/ (the text behind the "View License" button on https://mixkit.co/license/). The Mixkit User Terms (https://mixkit.co/terms/) also apply.

### What the file is

`site/media/music.m4a` is a 30.72 s loop cut from the source: 16 bars at 125 BPM, from bar 26 (49.92 s) to bar 42 (80.64 s) of the 51-bar track, so the loop is a whole number of bars (1,354,752 samples at 44.1 kHz, exactly 1323 AAC frames, so the encoder adds no padding at the end).

- In the source, bars 42-44 repeat bars 26-28 (the arrangement cycles every 16 bars from bar 26). The first beat of the loop is cross-faded (linear, 0.48 s) with the music that follows bar 42 in the source. That is the same music, so the join is the track's own bar line.
- Gain +3.7 dB, then AAC-LC, 128 kbps, stereo, 44.1 kHz, no tags.
- Result: 528,792 bytes, integrated loudness -16.4 LUFS, true peak -1.3 dBFS, loudness range 3.2 LU.

Recipe (ffmpeg from `node_modules/ffmpeg-static`; `src.wav` is the source mp3 decoded to 44.1 kHz stereo float):

```sh
A=2201472 L=1354752 X=21168   # start, length, cross-fade: 26 bars, 16 bars, 1 beat, in samples
ffmpeg -i src.wav -filter_complex "
[0:a]asplit=3[s1][s2][s3];
[s1]atrim=start_sample=$((A+L)):end_sample=$((A+L+X)),asetpts=N/SR/TB,afade=t=out:ns=$X:curve=tri[cont];
[s2]atrim=start_sample=$A:end_sample=$((A+X)),asetpts=N/SR/TB,afade=t=in:ns=$X:curve=tri[head];
[cont][head]amix=inputs=2:normalize=0:duration=longest[xf];
[s3]atrim=start_sample=$((A+X)):end_sample=$((A+L)),asetpts=N/SR/TB[body];
[xf][body]concat=n=2:v=0:a=1[out]" -map "[out]" -c:a pcm_f32le loop.wav
ffmpeg -i loop.wav -af volume=3.7dB -map_metadata -1 -c:a aac -b:a 128k -ar 44100 -ac 2 -movflags +faststart site/media/music.m4a
```

## Logos: site/media/{client,partner,platform,press}-*.svg

Each logo is the trademark of its owner. The site shows it only to name a client, a publication that wrote about a case, a case's partner or the platform its results come from. Every file is one colour: the site draws it through a CSS mask, so only its shape counts. A test (`plugins/content/tests/content.test.ts`) keeps scripts, event handlers, embedded pictures and outside addresses out of these files.

Clients ("Our clients" sheet on the wall), accessed 2026-10-15:

- `client-mercedes-benz.svg`: Wikimedia Commons, `Mercedes-Benz (2025).svg`. The star and the wordmark stand side by side instead of stacked, so the wordmark stays readable when small.
- `client-lavazza.svg`: lavazza.com, the header logo glyph from the site's `icomoon.ttf` icon font. Wordmark without the TORINO line.
- `client-burger-king.svg`: simple-icons 13.21.0, `burgerking.svg`.
- `client-danone.svg`: danone.it, the header logo (WebP, 1280 px), traced to vector. Emblem and wordmark, no tagline.
- `client-efes.svg`: anadoluefes.com.tr, `efeslogo26.png`, traced to vector. The current Anadolu Efes logo; the Efes beer wordmark exists only as a small raster.
- `client-skillbox.svg`: skillbox.ru, the header logo file.
- `client-skyeng.svg`: skyeng.ru, the header file `skyeng-logo-dark.svg`. A thin gap cut around the front arrow, so both arrows read in one colour.
- `client-skillfactory.svg`: skillfactory.ru, the header logo.
- `client-geekbrains.svg`: ru.wikipedia, `Файл:Geekbrains_logo.svg`.
- VK uses `partner-vk.svg` (below).

Publications (Waldorf Astoria Berlin, "As seen in" and "In the press"):

- `press-rolling-stone-uk.svg`: Wikimedia Commons, `Rolling_Stone_logo.svg`, with a small "UK" added after the wordmark.
- `press-forbes-travel-guide.svg`: https://secure.s.forbestravelguide.com/images/ftg-logo.svg
- `press-conde-nast-traveler.svg`: the header logo of https://www.cntraveler.com/hotels/berlin/waldorf-astoria-berlin
- `press-business-traveller.svg`: the header logo of https://www.businesstraveller.com/tried-tested/hotel-check-waldorf-astoria-berlin/

Publications (the Forbes 30 Under 30 clipping on the first screen), accessed 2026-10-29:

- `press-forbes.svg`: Wikimedia Commons, `Forbes_logo.svg` (public domain, text logo), recoloured to ink.

Partners (DeckForge, "Official partners"):

- `partner-vk.svg`: Wikimedia Commons, `VK Full Logo (2021-present).svg`.
- `partner-rustore.svg`: https://static.rustore.ru/rustore-strapi/6/logo_color_30_px_2_fa2039288f.svg (the rustore.ru header logo).
- `partner-xiaomi.svg`: Wikimedia Commons, `Xiaomi logo horizontal (2021-).svg`.

Platforms (Dear Passengers, "Platforms"):

- `platform-youtube.svg`: Wikimedia Commons, `YouTube_Logo_2017.svg`.
- `platform-instagram.svg`: the glyph from simple-icons 13.21.0 `instagram.svg`, the wordmark from Wikimedia Commons `Instagram_logo.svg`.
- `platform-tiktok.svg`: the glyph from simple-icons 13.21.0 `tiktok.svg`, the wordmark from Wikimedia Commons `Tiktok_logo_text.svg`.
