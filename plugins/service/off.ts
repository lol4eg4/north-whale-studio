// Off: service stickers stay on the wall without a card.
import type { Host } from "../../platform/host.ts";
import type { ServiceApi } from "./api.ts";

export default function off(host: Host) {
  host.provide<ServiceApi>("service", { open() {} });
}
