## Design System
Always read DESIGN.md before making any visual or UI decisions.
All font choices, colors, spacing, and aesthetic direction are defined there.
Do not deviate without explicit user approval.
In QA mode, flag any code that doesn't match DESIGN.md.

## Testing
- Unit tests: `bun run test`. A new test file in `tests/` goes into that script too.
- Browser tests (Playwright, Chromium): `bun run e2e`; one file: `bun test tests/e2e/<name>.test.ts --timeout 60000`.
- Types: `bun run check`.
