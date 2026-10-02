# Browser smoke checks

Run `node tests/browser-smoke.cjs` with Node 22+ and Microsoft Edge installed.
Set `EDGE_PATH` if Edge is installed somewhere other than its standard Windows path.
No npm install is required. The test serves the app on a temporary local port,
uses an isolated browser profile, and blocks external requests.

Checks cover editing, autosave and legacy restore, storage failures, image-only
drafts, find/replace without formatting changes, undo, keyboard dialogs, downloaded
PDF/TXT/HTML files, the print entry point, mobile controls, and pagination growth
and shrinkage. Screenshots and downloads are written to ignored `test-results/`.

Manually verify the native print dialog and paper output before a release; the
automated check verifies that Print opens its generated document. Online grammar
and optional model downloads are not exercised by this offline smoke test.
