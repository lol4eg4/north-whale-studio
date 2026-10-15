// Off: tiles stay on the wall without opening.
import type { Host } from "../../platform/host.ts";
import type { CaseApi } from "./api.ts";

export default function off(host: Host) {
  host.provide<CaseApi>("case", { open() {}, close() {} });
}
