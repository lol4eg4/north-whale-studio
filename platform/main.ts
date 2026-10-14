// Page entry: frame, host, then every enabled plugin (see build.ts for how they are picked).
import plugins from "app:plugins";
import "./ui/tokens.css";
import "./ui/base.css";
import "./ui/parts.css";
import "./frame/frame.css";
import { createHost } from "./host.ts";
import { createMemory } from "./memory.ts";
import { createMotion } from "./motion.ts";
import { mountFrame } from "./frame/frame.ts";

const memory = createMemory();
const motion = createMotion(memory);
const { boot } = createHost(mountFrame(motion), motion, memory);
boot(plugins);
