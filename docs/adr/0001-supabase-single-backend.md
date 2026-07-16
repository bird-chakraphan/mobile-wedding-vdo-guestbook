# ADR-0001: Supabase as the single backend

## Status
Accepted (2026-07-16)

## Context
Clips must reach the Couple automatically (guest-download-only was rejected — clips would be lost). Staff Page settings must be readable by every guest phone, so browser-local storage on the staff device cannot work. Both needs require internet-reachable storage.

## Decision
Use Supabase for everything:
- **Storage bucket** for recorded clips and staff-uploaded images (frame, two gesture graphics)
- **One table** for staff settings (output size, time limit, beauty slider values, image references)

## Alternatives considered
- Firebase: equivalent, but Bird already has hands-on Supabase experience (used with low-code tools)
- Settings hardcoded in the deployed site: no staff page needed, but every change requires redeploy — unacceptable for event-day adjustments

## Consequences
- Free tier ≈ 1GB storage; at ~10–30MB per clip this covers roughly 30–80 clips. Recording time limit and compression settings directly affect this budget; upgrade (~$25/mo Pro, 100GB) if the guest count demands it.
- The couple browses/downloads clips via the Supabase dashboard or a simple gallery page (post-MVP).
- Guest page writes to storage anonymously — bucket policies must allow insert-only for guests (no list/read of others' clips) to keep clips private.
