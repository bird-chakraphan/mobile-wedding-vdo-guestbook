# ADR-0003: Time-boxed token gate for staff asset uploads

## Status
Accepted (2026-07-17)

## Context
The `assets` storage bucket has public read (every guest phone must fetch the frame/gesture images) but, until now, no write path at all — issue #9 asks for staff to upload the frame and two gesture graphics from the Staff Page. Storage RLS policies run as the `anon` role and cannot check an arbitrary passcode per request the way `update_staff_settings`'s `security definer` RPC does for the settings table.

## Decision
A `security definer` RPC (`mint_upload_token`) checks the passcode and inserts a row into `upload_tokens` (a random token, ~10-minute expiry). The `assets` bucket's INSERT/UPDATE storage policies require **any unexpired row to exist** in `upload_tokens` — not scoped to a specific path, filename, or the session that minted it. Staff uploads to fixed filenames (`frame.png`, `gesture-left.png`, `gesture-right.png`) with `upsert: true`, so re-uploads replace rather than accumulate.

## Alternatives considered
- **Token embedded in the upload path** (`token/filename`, policy checks `split_part(name, '/', 1)`), matching issue #9's original phrasing more literally. Rejected: it would make every upload land under a new token-prefixed folder, so "old versions overwritten, not accumulated" (an explicit acceptance criterion) would require a follow-up `move`/rename step whose storage RLS semantics aren't something I could verify without a live Supabase project to test against. Fixed filenames + `upsert` achieves the same criterion with no unverified behavior.
- **Server-side proxy / edge function** validating the passcode per upload. More infrastructure than the MVP justifies — same reasoning ADR-0002 used to reject server-side compositing.

## Consequences
- Any unexpired token permits writes to any path in `assets`, not just the one the minting staff member intended — acceptable under the "curious guest, not an attacker" threat model (same threat model as the Staff Page passcode gate itself): the window is short (~10 min) and only someone who already knows the passcode can open it.
- `upload_tokens` is a public-readable table (`SELECT` granted to `anon`) so the storage policy's subquery can run as the uploading role — Postgres RLS subqueries run under the querying role's own privileges, not the definer's. Rows contain only a random token and an expiry timestamp, nothing sensitive.
- Expired rows are cleaned up lazily (deleted at the start of the next successful mint), not via a cron job — matches the file's existing "keep it simple" style for a low-traffic staff-only path.
