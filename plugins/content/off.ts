// Off: the page has no texts; keys show instead of words and the lists are empty.
import type { Host } from "../../platform/host.ts";
import type { ContentApi } from "./api.ts";

export default function off(host: Host) {
  const none = () => [];
  host.provide<ContentApi>("content", {
    language: () => "ru",
    setLanguage() {},
    text: (key) => key,
    format: (key) => key,
    cases: none,
    caseById: () => undefined,
    services: none,
    team: none,
    clients: none,
    brands: none,
    contacts: () => ({ email: "", messengers: [], socials: [] }),
  });
}
