// The content itself: texts in two languages and the studio's data, read in the chosen language.
// Pure (no DOM), so it is tested directly.
import { media } from "../../platform/media.ts";
import type { CaseItem, CasePage, Client, Contacts, Lang, Logo, Member, Service } from "./api.ts";
import brandsData from "./data/brands.json";
import casesData from "./data/cases.json";
import clientsData from "./data/clients.json";
import contactsData from "./data/contacts.json";
import servicesData from "./data/services.json";
import teamData from "./data/team.json";
import pagesEn from "./data/pages.en.json";
import pagesRu from "./data/pages.ru.json";
import en from "./data/texts.en.json";
import ru from "./data/texts.ru.json";

type Local = { ru: string; en: string };
const texts: Record<Lang, Record<string, string>> = { ru, en };
const pages: Record<Lang, Record<string, CasePage>> = { ru: pagesRu, en: pagesEn };

// Address first, then the last visit, then the browser; anything but Russian reads English.
export function pickLanguage(search: string, remembered: string | null, browser: readonly string[]): Lang {
  const asked = new URLSearchParams(search).get("lang");
  if (asked === "ru" || asked === "en") return asked;
  if (remembered === "ru" || remembered === "en") return remembered;
  return (browser[0] ?? "").toLowerCase().startsWith("ru") ? "ru" : "en";
}

export function createStore(getLang: () => Lang, warn: (msg: string) => void = console.error) {
  const local = (v: Local) => v[getLang()];
  const text = (key: string) => {
    const value = texts[getLang()][key];
    if (value === undefined) {
      warn(`Missing text "${key}"`);
      return key;
    }
    return value;
  };
  const format = (key: string, params: Record<string, string | number>) =>
    text(key).replace(/\{(\w+)\}/g, (m, name: string) => (name in params ? String(params[name]) : m));

  const cases = (): CaseItem[] =>
    casesData.map((c, i) => {
      const client = local(c.client);
      const what = c.what ? local(c.what) : null;
      const result = c.result.map(local);
      const still = c.kind === "still";
      const n = i + 1;
      return {
        id: c.id,
        n,
        client,
        what,
        result,
        size: c.size as CaseItem["size"],
        kind: c.kind as CaseItem["kind"],
        sound: c.sound,
        vertical: c.vertical,
        color: c.color,
        press: c.press.map((p) => ({ ...p, logo: media(p.logo) })),
        logos: c.logos.map((p) => ({ ...p, logo: media(p.logo) })),
        media: {
          poster: media(`/media/c${c.id}.webp`),
          posterPhone: media(`/media/c${c.id}-phone.webp`),
          ring: still ? null : media(`/media/c${c.id}-ring.mp4`),
          ringPoster: media(`/media/c${c.id}-ring.webp`),
          full: still ? null : media(`/media/c${c.id}-full.mp4`),
          still: still ? media(`/media/c${c.id}-full.webp`) : null,
        },
        story: { task: text("case.task"), did: text("case.did"), result: text("case.result") },
        page: pages[getLang()][c.id] ?? null,
        sr: [format("case.label", { n }), client, what, ...result, c.press.length ? `${text("case.seenIn")}: ${c.press.map((p) => p.name).join(", ")}` : null]
          .filter(Boolean)
          .join(". "),
      };
    });

  const services = (): Service[] =>
    servicesData.map((s) => ({ id: s.id, main: s.main, title: local(s.title), phrase: local(s.phrase), includes: s.includes.map(local) }));
  const team = (): Member[] =>
    teamData.map((m) => ({ id: m.id, name: local(m.name), role: local(m.role), color: m.color, photo: media(m.photo), video: m.video ? media(m.video) : null }));
  const clients = (): Client[] =>
    clientsData.map((c) => ({ caseId: c.caseId, name: local(c.name), shape: c.shape as Client["shape"], bg: c.bg, fg: c.fg, phone: c.phone }));
  const brands = (): Logo[] => brandsData.map((b) => ({ ...b, logo: media(b.logo) }));
  const contacts = (): Contacts => contactsData;

  return {
    text,
    format,
    cases,
    caseById: (id: number) => cases().find((c) => c.id === id),
    services,
    team,
    clients,
    brands,
    contacts,
  };
}
