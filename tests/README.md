# Regression Checks

Run `npm test` for isolated account-response races, blocked Cloud cancellation,
and the real Store verifier handler with mocked upstream HTTP responses. These use Node's test runner and
the existing TypeScript compiler; no backend, account, or payment is touched.

`harness.mjs` transpiles the source under test. Its small hook scheduler makes
late-response ordering deterministic; it does not prove React rendering,
keyboard behavior, or visual correctness. Re-drive those in an isolated browser.

To prove a check catches a regression, set `TDG_TEST_SOURCE_REF` to a revision
containing the original defect and run the suite again. Only the source modules
come from that revision; the assertions remain current. Unset it afterward.
The original account/inbox, Cloud and verifier defects were confirmed this way.
