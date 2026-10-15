// Module types the bundler provides.
declare module "app:plugins" {
  import type { LoadedPlugin } from "./host.ts";
  const plugins: LoadedPlugin[];
  export default plugins;
}
declare module "*.css";
