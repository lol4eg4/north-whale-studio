import { describe, expect, test } from "bun:test";
import { readdirSync } from "node:fs";
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
  test("eight cases in the studio's order, complete, with existing media names", () => {
    expect(cases.map((c) => c.id)).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
    for (const c of cases) {
      expect(c.client).not.toBe("");
      expect(["xl", "l", "t"]).toContain(c.size);
      expect(c.media.tile).toBe(`/media/c${c.id}-tile.mp4`);
      expect(c.kind === "still" ? c.media.still : c.media.full).toBeTruthy();
    }
    expect(cases.find((c) => c.id === 5)!.kind).toBe("still");
    expect(cases.filter((c) => c.sound).map((c) => c.id)).toEqual([3, 6, 8]);
    expect(cases.find((c) => c.id === 8)!.size).toBe("t");
  });

  test("screen readers hear number, client and what the file name says", () => {
    expect(store("ru").caseById(3)!.sr).toBe("Кейс 3. Dear Passengers. 50 млн+ просмотров на YouTube");
    expect(store("en").caseById(1)!.sr).toBe("Case 1. Waldorf Astoria Berlin. Full-cycle production");
    expect(store("ru").caseById(2)!.sr).toBe("Кейс 2. AG1");
    expect(store("ru").caseById(9)).toBeUndefined();
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
  test("clients come from the cases; websites and packaging lead the services", () => {
    const s = store("ru");
    const ids = s.cases().map((c) => c.id);
    expect(s.clients().every((c) => ids.includes(c.caseId))).toBe(true);
    expect(s.services().map((x) => x.title).slice(0, 2)).toEqual(["Сайты под ключ", "Упаковка бизнеса"]);
    expect(s.services()[0].main).toBe(true);
    expect(s.team()).toHaveLength(6);
    expect(s.contacts().placeholder).toBe(true);
  });

  test("the placeholder list names every place waiting for the studio's data", () => {
    const list = store("ru").placeholders();
    expect(list).toHaveLength(8 + 3);
    expect(list[0]).toEqual({ where: "Кейс 1, Waldorf Astoria Berlin", what: "задача, что сделали, результат" });
  });
});
