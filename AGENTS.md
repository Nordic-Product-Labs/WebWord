# AGENTS.md

## Repository overview
- **DocPDF** is a static, browser-only rich text editor and PDF export app.
- Main entrypoint: `/home/runner/work/DocPDF/DocPDF/index.html`.
- Core logic is plain JavaScript modules in `/home/runner/work/DocPDF/DocPDF/js` attached to `window.*`.

## Important structure
- `/home/runner/work/DocPDF/DocPDF/index.html` — app shell, toolbar, modals, script load order.
- `/home/runner/work/DocPDF/DocPDF/js/editor.js` — Quill setup, custom blots/formats.
- `/home/runner/work/DocPDF/DocPDF/js/ui.js` — toolbar actions, shortcuts, theme, toasts.
- `/home/runner/work/DocPDF/DocPDF/js/export.js` — PDF export + print/export helpers.
- `/home/runner/work/DocPDF/DocPDF/js/autosave.js` — localStorage save/restore.
- `/home/runner/work/DocPDF/DocPDF/js/analysis.js` + `statspanel.js` + `aidetect_llm.js` — analysis, AI detection, panel rendering.
- `/home/runner/work/DocPDF/DocPDF/css/*.css` — app/editor/theme styling.
- `/home/runner/work/DocPDF/DocPDF/js/vendor` and `/home/runner/work/DocPDF/DocPDF/css/vendor` — third-party vendored assets (treat as external).

## Working rules for agents
- Keep changes **small and targeted**; avoid broad refactors.
- Preserve current module pattern (IIFE + `window.ModuleName` exports) unless explicitly asked.
- Maintain script load order in `index.html`; many modules depend on globals initialized earlier.
- Do not edit vendored/minified files under `js/vendor` or `css/vendor` unless explicitly requested.
- When changing export/printing behavior, verify both PDF export and browser print paths still work.

## Local validation
- No dedicated lint/test tooling is currently configured in this repository.
- Validate by running the app in a browser and smoke-testing:
  - edit content,
  - autosave restore,
  - export (PDF/TXT/HTML),
  - print,
  - find/replace,
  - stats/analysis panel.

## Deployment
- GitHub Pages workflow: `/home/runner/work/DocPDF/DocPDF/.github/workflows/pages.yml`.
- Deployment publishes a copied `_site` directory from repository root content.
