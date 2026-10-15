// Media addresses with their file's content hash: /media/<file>?v=<hash>. A picture, video or track
// replaced under the same name gets a new address, so no browser shows the old one from its cache.
// build.ts puts the hashes in the bundle; the unit tests run without a bundle and get plain paths.
declare const __MEDIA__: Record<string, string>;
const versions: Record<string, string> = typeof __MEDIA__ === "undefined" ? {} : __MEDIA__;

export const media = (path: string) => (versions[path] ? `${path}?v=${versions[path]}` : path);
