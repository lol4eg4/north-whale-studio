// Not built yet: same as off until its lane lands.
import type { Host } from "../../platform/host.ts";
import off from "./off.ts";

export default function init(host: Host) {
  off(host);
}
