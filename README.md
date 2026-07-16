# Wedding VDO Guest Book

A mobile web app for wedding guests to record video messages for the couple — with beauty filter, finger-heart gesture effects, and the wedding's frame baked into every clip. Guests scan a QR code; clips upload automatically to the couple's storage.

**Live:** https://wedding-vdo-guestbook.vercel.app

## How it works

- **Guest page** (phone browser): camera preview with beauty filter (MediaPipe FaceLandmarker), finger-heart gesture detection on both hands (HandLandmarker), floating heart graphics, canvas+mic recording, auto-upload to Supabase.
- **Backend**: Supabase — private `clips` bucket (guests upload, can't browse), public `assets` bucket, `staff_settings` table with a passcode-gated write RPC. See [supabase/setup.sql](supabase/setup.sql).
- **Hosting**: Vercel; pushes to `main` auto-deploy.

Read [CONTEXT.md](CONTEXT.md) for the glossary and all decisions, [docs/adr/](docs/adr/) for architecture records, and [TESTED-LEARNINGS.md](TESTED-LEARNINGS.md) for hard-won bugs and fixes. The `*.html` files are standalone learning prototypes that the real app's code was distilled from.

## Development

```bash
npm install
cp .env.example .env   # fill in Supabase URL + publishable key
npm run dev            # local dev server
npm test               # 27 Vitest tests (gesture geometry, heart animation, recording logic)
npm run build          # production build
```

## Roadmap

See the [PRD (issue #1)](https://github.com/bird-chakraphan/mobile-wedding-vdo-guestbook/issues/1) and issues #2–#10 for the remaining MVP slices.
