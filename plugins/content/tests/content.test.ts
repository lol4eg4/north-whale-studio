import { describe, expect, test } from "bun:test";
import { readdirSync, readFileSync } from "node:fs";
import type { Lang } from "../api.ts";
import en from "../data/texts.en.json";
import ru from "../data/texts.ru.json";
import { createStore, pickLanguage } from "../store.ts";

const store = (lang: Lang) => createStore(() => lang, (m) => { throw new Error(m); });

describe("texts", () => {
  test("Russian and English have the same keys and no empty text", () => {
    expect(Object.keys(en).sort()).toEqual(Object.keys(ru).sort());
    for (const [k, v] of [...Object.entries(ru), ...Object.entries(en)]) expect(v.trim(), k).not.toBe("");
  });

  test("a messenger or social with an address links over https", () => {
    const { messengers } = store("ru").contacts();
    for (const m of messengers) if (m.url) expect(m.url, m.name).toStartWith("https://");
    expect(messengers.find((m) => m.name === "Telegram")?.url).toBe("https://t.me/romansmirn0v");
  });

  test("format fills parameters; an unknown key is reported", () => {
    expect(store("ru").format("case.counter", { n: 3, total: 8 })).toBe("Кейс 3 из 8");
    expect(store("en").format("tidy.done", { n: 5 })).toBe("Back in place: 5");
    expect(() => store("ru").text("no.such.key")).toThrow('Missing text "no.such.key"');
  });
});

describe("language", () => {
  test("address first, then the last visit, then the browser; anything but Russian reads English", () => {
    expect(pickLanguage("?lang=en", "ru", ["ru-RU"])).toBe("en");
    expect(pickLanguage("?lang=xx", "en", ["ru-RU"])).toBe("en");
    expect(pickLanguage("", null, ["ru-RU", "en"])).toBe("ru");
    expect(pickLanguage("", null, ["de-DE"])).toBe("en");
    expect(pickLanguage("", null, [])).toBe("en");
  });
});

describe("cases", () => {
  const cases = store("ru").cases();
  test("ten cases in the studio's order, numbered from 1 without a gap, complete, with existing media names", () => {
    expect(cases.map((c) => c.id)).toEqual([1, 2, 3, 4, 5, 7, 8, 9, 10, 11]);
    expect(cases.map((c) => c.n)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
    for (const c of cases) {
      expect(c.client).not.toBe("");
      expect(["xl", "l", "t"]).toContain(c.size);
      expect(c.media.ringPoster).toBe(`/media/c${c.id}-ring.webp`);
      expect(c.kind === "still" ? c.media.still : c.media.full).toBeTruthy();
    }
    expect(cases.every((c) => c.kind === "video" && c.media.ring === `/media/c${c.id}-ring.mp4`)).toBe(true);
    expect(cases.find((c) => c.id === 5)!.client).toBe("King’s Resort & Casino");
    expect(cases.filter((c) => c.sound).map((c) => c.id)).toEqual([3, 8]);
    expect(cases.find((c) => c.id === 8)!.size).toBe("xl");
    for (const c of cases) expect(["ink", "paper", "buoy", "cobalt", "lemon", "jellyfish", "mint", "signal", "tape", "royal"]).toContain(c.color);
    expect(new Set(cases.map((c) => c.color)).size).toBe(cases.length);
  });

  test("every tile has the studio's caption and at least one lemon plate, in both languages; Dear Passengers has two", () => {
    for (const lang of ["ru", "en"] as const)
      for (const c of store(lang).cases()) {
        expect(c.what?.trim(), `case ${c.id} ${lang}`).toBeTruthy();
        expect(c.result.length, `case ${c.id} ${lang}`).toBeGreaterThan(0);
        for (const r of c.result) expect(r.trim(), `case ${c.id} ${lang}`).not.toBe("");
      }
    expect(store("en").caseById(3)!.result).toEqual(["100M+ organic views", "500K+ Steam wishlists"]);
    expect(store("ru").caseById(8)!.what).toBe("free 2 play игра");
  });

  test("Dear Passengers' client sticker names the client, FLEXUS", () => {
    expect(store("ru").clients().find((c) => c.caseId === 3)!.name).toBe("FLEXUS");
  });

  test("screen readers hear number, client, what, every result and the press that wrote about it", () => {
    expect(store("ru").caseById(3)!.sr).toBe("Кейс 3. Dear Passengers. first-person, physics-driven cooperative action. 100 млн+ органических просмотров. 500 тыс.+ вишлистов в Steam");
    expect(store("en").caseById(1)!.sr).toBe("Case 1. Waldorf Astoria Berlin. Hilton Hotels. Live Content Production. As seen in: Rolling Stone UK, Forbes Travel Guide, Condé Nast Traveler, Business Traveller");
    expect(store("ru").caseById(2)!.sr).toBe("Кейс 2. AG1. Премиум БАДы. 200% средняя окупаемость рекламы");
    expect(store("en").caseById(4)!.sr).toBe("Case 4. Mabrook. Super app. Website redesign");
    // The number is the case's place on the wall: Антикрус (id 7) is the sixth since case 6 was taken off.
    expect(store("ru").caseById(7)!.sr).toBe("Кейс 6. Антикрус. Аукционный дом. Полный цикл ребрендинга");
    expect(store("ru").caseById(6)).toBeUndefined();
    expect(store("ru").caseById(12)).toBeUndefined();
  });

  test("case pages: same cases and same shape in both languages, real links, closed highlights", () => {
    const shape = (id: number, lang: "ru" | "en") => {
      const p = store(lang).caseById(id)!.page;
      if (!p) return null;
      return [p.sections.map((x) => [x.text.length, !!x.kicker]), !!p.card, p.role.items.length, p.results?.items.length ?? 0, !!p.results?.note, p.links.length];
    };
    expect(cases.filter((c) => c.page).map((c) => c.id)).toEqual([1, 2, 3, 4, 5, 7, 8, 9, 10, 11]);
    for (const c of cases) {
      expect(shape(c.id, "en"), `case ${c.id}`).toEqual(shape(c.id, "ru"));
      const p = c.page;
      if (!p) continue;
      expect(p.sections.length).toBeGreaterThan(0);
      for (const v of [p.eyebrow, p.client, p.category, p.lead, p.media, ...p.sections.map((x) => x.title), p.role.deliverables ?? "-"]) expect(v.trim()).not.toBe("");
      const texts = [p.lead, ...p.sections.flatMap((x) => x.text), p.card?.copy ?? "", p.role.deliverables ?? ""];
      for (const t of texts) expect(t.split("==").length % 2, t).toBe(1);
      for (const l of p.links) expect(l.url).toMatch(/^https:\/\//);
    }
    expect(store("en").caseById(3)!.page!.links[0].url).toBe(store("ru").caseById(3)!.page!.links[0].url);
  });

  test("logo rows: Dear Passengers' platforms, DeckForge's partners, each under a label in its results, each logo on disk", () => {
    expect(cases.find((c) => c.id === 3)!.logos.map((p) => p.name)).toEqual(["Instagram", "YouTube", "TikTok"]);
    expect(cases.find((c) => c.id === 8)!.logos.map((p) => p.name)).toEqual(["VK", "RuStore", "Xiaomi"]);
    for (const c of cases) {
      for (const lang of ["ru", "en"] as const) expect(!!store(lang).caseById(c.id)!.page?.results?.logos, `case ${c.id} ${lang}`).toBe(c.logos.length > 0);
      for (const p of c.logos) {
        expect(Bun.file(`${import.meta.dir}/../../../site${p.logo}`).size, p.logo).toBeGreaterThan(0);
        expect(p.ratio).toBeGreaterThan(1);
      }
    }
  });

  test("logos taken from other sites are plain drawings: no scripts, handlers, embedded pictures or outside addresses", () => {
    const dir = `${import.meta.dir}/../../../site/media`;
    const files = readdirSync(dir).filter((f) => /^(client|partner|platform|press)-.*\.svg$/.test(f));
    expect(files.length).toBeGreaterThanOrEqual(19); // 9 clients, 3 partners, 3 platforms, 4 publications
    for (const f of files) {
      const svg = readFileSync(`${dir}/${f}`, "utf8");
      expect(svg.trimStart().startsWith("<svg") || svg.trimStart().startsWith("<?xml"), f).toBe(true);
      for (const bad of [/<script/i, /\son[a-z]+\s*=/i, /<foreignObject/i, /<image/i, /href\s*=/i, /@import/i, /url\(\s*['"]?(https?:|\/\/)/i, /data:/i]) expect(bad.test(svg), `${f}: ${bad}`).toBe(false);
    }
  });

  test("press: Waldorf's four publications, each with a logo on disk, a ratio, a headline and a link", () => {
    expect(cases.find((c) => c.id === 1)!.press.map((p) => p.name)).toEqual(["Rolling Stone UK", "Forbes Travel Guide", "Condé Nast Traveler", "Business Traveller"]);
    for (const c of cases)
      for (const p of c.press) {
        expect(Bun.file(`${import.meta.dir}/../../../site${p.logo}`).size, p.logo).toBeGreaterThan(0);
        expect(p.ratio).toBeGreaterThan(1);
        expect(p.scale).toBeGreaterThan(0);
        expect(p.title.trim()).not.toBe("");
        expect(p.url).toMatch(/^https:\/\//);
      }
  });

  test("the media files a case names exist once the media pipeline ran", () => {
    let files: string[] = [];
    try {
      files = readdirSync(`${import.meta.dir}/../../../site/media`);
    } catch {}
    if (!files.length) return; // media not generated in this checkout yet
    for (const c of cases)
      for (const url of Object.values(c.media)) if (url) expect(files, url).toContain(url.replace("/media/", ""));
  });
});

describe("studio data", () => {
  test("the clients' sheet: the owner's brands in order (Like Center waits for its logo), each logo on disk", () => {
    const brands = store("ru").brands();
    expect(brands.map((b) => b.name)).toEqual(["Mercedes-Benz", "Lavazza", "Burger King", "Danone", "Efes", "Skillbox", "Skyeng", "Skillfactory", "GeekBrains", "VK"]);
    for (const b of brands) {
      expect(Bun.file(`${import.meta.dir}/../../../site${b.logo}`).size, b.logo).toBeGreaterThan(0);
      expect(b.ratio).toBeGreaterThan(0);
      expect(b.scale).toBeGreaterThan(0);
    }
  });

  test("a logo used twice (VK on the sheet and in DeckForge's partners) has one name, ratio and scale", () => {
    const s = store("ru");
    const all = [...s.brands(), ...s.cases().flatMap((c) => [...c.logos, ...c.press])];
    const seen = new Map<string, string>();
    for (const l of all) {
      const shape = JSON.stringify([l.name, l.ratio, l.scale]);
      expect(seen.get(l.logo) ?? shape, l.logo).toBe(shape);
      seen.set(l.logo, shape);
    }
    expect(seen.size).toBeLessThan(all.length);
  });

  test("clients come from the cases; websites and packaging lead the services", () => {
    const s = store("ru");
    const ids = s.cases().map((c) => c.id);
    expect(s.clients().every((c) => ids.includes(c.caseId))).toBe(true);
    expect(s.services().map((x) => x.title).slice(0, 2)).toEqual(["Сайты под ключ", "Упаковка бизнеса"]);
    expect(s.services()[0].main).toBe(true);
  });
});

describe("team", () => {
  // From the studio's CEO, in this order. ШАН / SHAN stays in capitals.
  const crew: [string, string, string, string, string][] = [
    ["Погорелов", "Pogorelov", "Арт-директор", "Art Director", "cobalt"],
    ["ШАН", "SHAN", "Продукт-менеджер", "Product Manager", "ink"],
    ["Мария", "Maria", "Хэд-дизайнер", "Head Designer", "mint"],
    ["Джексон", "Jackson", "Бренд-менеджер", "Brand Manager", "buoy"],
  ];

  test("four members in the CEO's order with names and roles in both languages", () => {
    for (const lang of ["ru", "en"] as const) {
      const team = store(lang).team();
      expect(team.map((m) => m.id)).toEqual([1, 2, 3, 4]);
      expect(team.map((m) => m.name)).toEqual(crew.map((c) => c[lang === "ru" ? 0 : 1]));
      expect(team.map((m) => m.role)).toEqual(crew.map((c) => c[lang === "ru" ? 2 : 3]));
      expect(team.map((m) => m.color)).toEqual(crew.map((c) => c[4]));
    }
  });

  test("every member has a photo, only Maria has a video, and the files exist", () => {
    const team = store("ru").team();
    expect(team.map((m) => m.photo)).toEqual([1, 2, 3, 4].map((n) => `/media/team-${n}.webp`));
    expect(team.map((m) => m.video)).toEqual([null, null, "/media/team-3.mp4", null]);
    const files = readdirSync(`${import.meta.dir}/../../../site/media`);
    for (const m of team) for (const url of [m.photo, m.video]) if (url) expect(files, url).toContain(url.replace("/media/", ""));
  });
});
