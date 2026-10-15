// Off: the page stays silent; callers keep working.
import type { Host } from "../../platform/host.ts";
import type { SoundApi } from "./api.ts";

export default function off(host: Host) {
  host.provide<SoundApi>("sound", { play() {}, toggle() {} });
}
