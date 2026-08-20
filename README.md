# Logbook

**A local-first, multi-user daily productivity and work log — track hours, log tasks, and review your history, backed by Supabase and deployed on Vercel.**

🔗 Live app: [focus-app-nine-eosin.vercel.app](https://focus-app-nine-eosin.vercel.app)

---

## About

Logbook is a minimalist daily work tracker for people who want a fast, no-friction way to record what they worked on and how long it took. Pick a date, log your hours, jot down what you completed, and see the last 7 days of effort at a glance — all wrapped in a distraction-free "ledger" interface with light and dark modes.

Every account has its own private history. Authentication and data isolation are handled by Supabase (Postgres + Auth + Row Level Security), and the app itself is a lightweight static frontend with no framework or build step — just HTML, CSS, and vanilla JavaScript.

## Features

- **Date navigation** — jump to any day via quick "Today"/"Yesterday" buttons, prev/next arrows, or a date picker
- **Hours tracking** — quick-add buttons (+0.5h / +1h / +2h) or set an exact value, with a live progress bar
- **Task / mission log** — log completed work with one keystroke (Enter to submit), delete entries individually
- **Weekly analytics** — a 7-day activity ribbon plus at-a-glance metrics: week total, daily average, tasks per week, and day streak
- **Full history** — browse, revisit, and delete any past day's entry
- **Accounts** — email/password sign-up and login, each user's data private to their own account
- **Light / dark mode** — toggle with the sun/moon control, respects system preference on first load
- **Fully responsive** — works cleanly on desktop and mobile

## Tech stack

| Layer | Technology |
|---|---|
| Frontend | Vanilla HTML / CSS / JavaScript (no build step, no framework) |
| Auth | [Supabase Auth](https://supabase.com/auth) (email + password) |
| Database | [Supabase](https://supabase.com) (Postgres) |
| Data security | Postgres Row Level Security (RLS) — every row is scoped to its owner at the database level |
| Hosting | [Vercel](https://vercel.com) (static deployment, GitHub-integrated CI/CD) |

## Security

- Passwords are never handled by this app's code — Supabase Auth manages hashing, sessions, and tokens.
- Every table has Row Level Security enabled; every policy checks `auth.uid() = user_id`, enforced by Postgres on every query regardless of what the client sends.
- The Supabase `anon` key shipped to the browser is safe to expose by design — RLS, not key secrecy, is what restricts access. The `service_role` key is never used client-side.
- User-generated content is rendered via `textContent`, not `innerHTML`, to prevent script injection.

## Getting started

```bash
git clone <this-repo-url>
cd logbook
```

1. Create a [Supabase](https://supabase.com) project.
2. Run `supabase/schema.sql` in the Supabase SQL Editor to create the `daily_logs` table with RLS policies.
3. In **Project Settings → API**, copy your Project URL and `anon` public key into `config.js`.
4. Serve the folder locally to test:
   ```bash
   npx serve .
   ```
5. Push to GitHub and import the repo into [Vercel](https://vercel.com) — no build step or environment variables required, since the site is fully static.

See `supabase/schema.sql` for the full database schema and security policies.

## Project structure

```
├── index.html          # App shell — auth screens + dashboard markup
├── styles.css           # All styling (light/dark themes)
├── app.js                # App logic — auth flow, Supabase queries, rendering
├── config.js             # Supabase project URL + anon key
├── vercel.json            # Static deployment config
└── supabase/
    └── schema.sql          # Database schema + Row Level Security policies
```

## Roadmap ideas

- CSV/JSON export of history
- Custom daily hour goals
- Monthly view / heatmap
- Team or shared workspace mode

## License

MIT — free to use, modify, and build on.
