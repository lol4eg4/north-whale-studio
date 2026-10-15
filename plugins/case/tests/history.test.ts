import { describe, expect, test } from "bun:test";
import { isOurEntry, nextId, onLoad, onNavigate, onNext, onOpen, onRequestClose, parseHash, type Ctx } from "../history.ts";

const ids = [1, 2, 3, 4, 5, 6, 7, 8];
const ctx = (open: number | null = null, closing = false): Ctx => ({ open, closing, ids });

describe("hash", () => {
  test("valid, unknown and other hashes", () => {
    expect(parseHash("#case-3", ids)).toBe(3);
    expect(parseHash("#case-8", ids)).toBe(8);
    expect(parseHash("#case-42", ids)).toBe("unknown");
    expect(parseHash("#case-0", ids)).toBe("unknown");
    expect(parseHash("#case-", ids)).toBe("unknown");
    expect(parseHash("#case-3x", ids)).toBe("unknown");
    expect(parseHash("#case-03", ids)).toBe(3);
    expect(parseHash("#cases", ids)).toBe(null);
    expect(parseHash("#contacts", ids)).toBe(null);
    expect(parseHash("", ids)).toBe(null);
  });

  test("Next wraps from the last case to the first", () => {
    expect(nextId(1, ids)).toBe(2);
    expect(nextId(7, ids)).toBe(8);
    expect(nextId(8, ids)).toBe(1);
  });

  test("our own history entries carry nwsCase", () => {
    expect(isOurEntry({ nwsCase: 3 })).toBe(true);
    expect(isOurEntry(null)).toBe(false);
    expect(isOurEntry({ other: 1 })).toBe(false);
    expect(isOurEntry("x")).toBe(false);
  });
});

describe("load", () => {
  test("a valid case link: drop the hash, push our entry, open from link", () => {
    expect(onLoad("#case-3", ctx())).toEqual([
      { t: "replace", hash: "" },
      { t: "push", id: 3 },
      { t: "show", id: 3, from: "link" },
    ]);
  });

  test("an unknown case link shows the wall; other hashes do nothing", () => {
    expect(onLoad("#case-42", ctx())).toEqual([{ t: "wall" }]);
    expect(onLoad("#contacts", ctx())).toEqual([]);
    expect(onLoad("", ctx())).toEqual([]);
  });
});

describe("open and Next", () => {
  test("from the page: push when closed, replace when another case is open", () => {
    expect(onOpen(2, "tile", ctx())).toEqual([{ t: "push", id: 2 }, { t: "show", id: 2, from: "tile" }]);
    expect(onOpen(5, "dive", ctx(2))).toEqual([{ t: "replace", hash: "#case-5", id: 5 }, { t: "show", id: 5, from: "dive" }]);
  });

  test("the same case, an unknown case or a case while closing does nothing", () => {
    expect(onOpen(2, "tile", ctx(2))).toEqual([]);
    expect(onOpen(42, "tile", ctx())).toEqual([]);
    expect(onOpen(3, "tile", ctx(2, true))).toEqual([]);
  });

  test("Next replaces the address and wraps 8 -> 1", () => {
    expect(onNext(ctx(3))).toEqual([{ t: "replace", hash: "#case-4", id: 4 }, { t: "show", id: 4, from: "next" }]);
    expect(onNext(ctx(8))).toEqual([{ t: "replace", hash: "#case-1", id: 1 }, { t: "show", id: 1, from: "next" }]);
    expect(onNext(ctx())).toEqual([]);
    expect(onNext(ctx(8, true))).toEqual([]);
  });
});

describe("close", () => {
  test("our entry goes back; any other entry is replaced with #cases and closes now", () => {
    expect(onRequestClose(ctx(3), { nwsCase: 3 })).toEqual([{ t: "back" }]);
    expect(onRequestClose(ctx(3), null)).toEqual([{ t: "replace", hash: "#cases" }, { t: "hide" }]);
  });

  test("idempotent: closed or already closing does nothing", () => {
    expect(onRequestClose(ctx(), { nwsCase: 3 })).toEqual([]);
    expect(onRequestClose(ctx(3, true), { nwsCase: 3 })).toEqual([]);
  });
});

describe("Back, Forward and hash changes", () => {
  test("a valid hash opens its case unless it is the one open", () => {
    expect(onNavigate("#case-6", ctx())).toEqual([{ t: "show", id: 6, from: "link" }]);
    expect(onNavigate("#case-6", ctx(6))).toEqual([]);
    expect(onNavigate("#case-6", ctx(2))).toEqual([{ t: "show", id: 6, from: "link" }]);
  });

  test("anything else closes; an unknown case also shows the wall", () => {
    expect(onNavigate("", ctx(3, true))).toEqual([{ t: "hide" }]);
    expect(onNavigate("#contacts", ctx(3))).toEqual([{ t: "hide" }]);
    expect(onNavigate("", ctx())).toEqual([]);
    expect(onNavigate("#case-42", ctx(3))).toEqual([{ t: "hide" }, { t: "wall" }]);
    expect(onNavigate("#case-42", ctx())).toEqual([{ t: "wall" }]);
  });
});
