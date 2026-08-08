# Sports Pool - NFL Betting Platform

A modern Next.js application for creating and managing NFL betting pools. Users can create public or private pools, make picks on games, and compete for prize pots.

## Features

- 🔐 **Authentication** - User signup, login, and session management with Supabase Auth
- 🏈 **Pool Management** - Create public or private pools (6-9 games, $20+ entry fee)
- 🎴 **Parlay Card System** - Purchase up to 3 cards per pool, make Win/Loss/Tie predictions
- 🎮 **Game Selection** - Select NFL games from ESPN API, filter by date and status
- 💬 **Social Features** - Pool chat (requires card purchase), comments and discussions
- 📊 **Real-time Updates** - Live pool statistics, game outcomes, and prize pot tracking
- 💰 **Transaction Tracking** - Platform fee calculation (10% default), prize pot management
- 🎨 **Modern UI** - Beautiful glassmorphism design with 3D effects and animations

## Tech Stack

- **Framework**: Next.js 16.1.5 (App Router)
- **Language**: TypeScript
- **Styling**: Tailwind CSS 4
- **Database**: Supabase (PostgreSQL)
- **Authentication**: Supabase Auth
- **State Management**: TanStack React Query
- **Form Validation**: React Hook Form + Zod
- **UI Components**: Radix UI + Custom components

## Getting Started

### Prerequisites

- Node.js 18+ and npm/yarn/pnpm
- A Supabase account (free tier works)

### Installation

1. **Clone the repository**
   ```bash
   git clone <repository-url>
   cd sportspool_b
   ```

2. **Install dependencies**
   ```bash
   npm install
   # or
   yarn install
   # or
   pnpm install
   ```

3. **Set up Supabase**
   - Create a new project at [supabase.com](https://supabase.com)
   - Go to Settings > API to get your project URL and anon key
   - Apply the database schema by running the migrations in `supabase/migrations/`
     (see **Database Setup** below). Do NOT use the legacy `schema.sql` — it is
     an outdated snapshot missing the balance/payout tables and functions.

4. **Configure environment variables**
   Create a `.env.local` file in the root directory:
   ```env
   NEXT_PUBLIC_SUPABASE_URL=your_supabase_project_url
   NEXT_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key
   SUPABASE_SERVICE_ROLE_KEY=your_supabase_service_role_key
   NEXT_PUBLIC_APP_URL=http://localhost:3000
   ```

5. **Run the development server**
   ```bash
   npm run dev
   # or
   yarn dev
   # or
   pnpm dev
   ```

6. **Open your browser**
   Navigate to [http://localhost:3000](http://localhost:3000)

## Database Setup

The single source of truth for the schema is the ordered migration set in
`supabase/migrations/`. It defines every table, index, function (RPC), trigger,
and RLS policy — including the balance/payout subsystem that `schema.sql` (a
stale one-off snapshot) does not contain.

1. Install the Supabase CLI and link your project (`npx supabase link`).
2. Apply all migrations: `npm run db:migrate` (`supabase db push`).
3. (Optional) Seed reference/demo data: `npm run seed`.
4. Bootstrap the first admin (one-time), then unset the secret:
   `curl -X POST "$NEXT_PUBLIC_APP_URL/api/seed-admin" -H "Authorization: Bearer $SETUP_SECRET"`

> `schema.sql` is retained only for historical reference and must not be used to
> provision a database — it predates the money subsystem and several RPCs.

## Project Structure

```
sportspool_b/
├── app/                    # Next.js App Router pages
│   ├── api/               # API routes
│   ├── create-pool/       # Pool creation page
│   ├── login/             # Authentication pages
│   ├── signup/
│   ├── public-pools/      # Browse public pools
│   ├── private-pools/     # User's private pools
│   └── pool/[id]/         # Individual pool detail
├── components/            # React components
│   ├── auth/             # Authentication components
│   ├── create-pool/      # Pool creation components
│   ├── home/             # Homepage sections
│   ├── layout/           # Layout components
│   └── ui/               # Reusable UI components
├── lib/
│   ├── hooks/            # Custom React hooks
│   ├── supabase/         # Supabase client setup
│   └── validations.ts    # Zod schemas
└── middleware.ts         # Next.js middleware for auth
```

## API Routes

- `POST /api/auth/signup` - Create new user account
- `POST /api/auth/signin` - Sign in user
- `POST /api/auth/signout` - Sign out user
- `GET /api/auth/me` - Get current user
- `GET /api/pools` - List pools (with optional type/status filters)
- `POST /api/pools` - Create new pool
- `GET /api/pools/[poolId]` - Get pool details
- `POST /api/pools/[poolId]/cards/purchase` - Purchase a parlay card
- `GET /api/pools/[poolId]/cards` - Get user's cards for a pool
- `POST /api/pools/[poolId]/cards/[cardId]/picks` - Submit picks for a card
- `GET /api/pools/[poolId]/cards/[cardId]/picks` - Get picks for a card
- `GET /api/pools/[poolId]/chat` - Get pool comments
- `POST /api/pools/[poolId]/chat` - Add comment
- `GET /api/games` - List games (with optional week/status filters)
- `GET /api/games/[gameId]` - Get game details

## Environment Variables

See `.env.example` for all required environment variables. For Stripe card payments you also need:

- `STRIPE_SECRET_KEY` – Stripe secret key (starts with `sk_`)
- `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` – Stripe publishable key (starts with `pk_`)
- `NEXT_PUBLIC_APP_URL` – App base URL (used for Stripe redirects)

Run the migration in `docs/stripe-migration.sql` before using Stripe. See `docs/STRIPE_SETUP.md` for details.

## Development

- Run `npm run dev` to start the development server
- Run `npm run build` to build for production
- Run `npm run start` to start the production server
- Run `npm run lint` to run ESLint

## Deployment

### Vercel (Recommended)

1. Push your code to GitHub
2. Import your repository in Vercel
3. Add your environment variables in Vercel dashboard
4. Deploy!

### Other Platforms

The app can be deployed to any platform that supports Next.js:
- Netlify
- Railway
- Render
- AWS Amplify

Make sure to set all environment variables in your deployment platform.

## Contributing

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add some amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## License

This project is licensed under the MIT License.

## Support

For issues and questions, please open an issue on GitHub.
