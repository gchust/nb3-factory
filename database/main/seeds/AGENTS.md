# Seeds

Seeds load data an installed application needs; they never create structure. Every seed here assumes the tables its
rows target already exist, because a migration created them. If a seed needs a new column or table, add a migration
first.

## Required data vs sample data

A seed declared with `defineSeed({ name, run })` is **required**: it loads during installation and again whenever it is
still pending. A seed declared with `defineSeed({ name, sample: true, run })` is **sample data**: it loads only when the
database is installed with `APP_SAMPLE_DATA` set, and `pnpm nocobase db sample` can load what was skipped in
development.

`202610070002_default_devices.ts` is required on purpose. The product asks for two devices to exist after the
application is installed, and sample data must never be the only source of something the running application depends
on. Keep it required unless the product changes that requirement.

## Rules for a seed in this directory

- Follow a migration: never create a collection, column, index or constraint from a seed.
- Be idempotent and non-destructive: a repeat run must not duplicate a row and must not overwrite a row a user edited.
  The device seed checks each fixed `code` and inserts only what is missing, which makes a user's edit win.
- Keep the data fixed and reproducible. No timestamps, no randomness, no values generated per run.
- Fictional data only. `Aurora Book 14` and `Nimbus Cam 4K` are placeholders; never seed real business records or
  credentials.
- Prefer the connection's `query` adapter for plain rows. Reach for a plugin's service or the `sampleDataToken` only
  when the row has to go through that plugin's own logic.
