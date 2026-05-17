# Freshkeep

Household food & item tracking app built with React Native (Expo) + Supabase.

## Stack
- **Frontend:** React Native (Expo SDK 54), TypeScript, expo-router (file-based routing)
- **Backend:** Supabase (PostgreSQL, Auth, Realtime, RLS)
- **Auth:** PKCE OAuth flow via `expo-web-browser` — Google sign-in with `supabase.auth.signInWithOAuth` + `exchangeCodeForSession`
- **State:** React Context (`AuthContext`, item state)
- **Testing:** Jest
- **Linting:** ESLint (expo config), `tsc --noEmit` for type checking
- **Sentry:** @sentry/react-native for error tracking

## Project Structure
```
freshkeep/
├── app/                # expo-router pages
│   ├── (auth)/         # Auth group (login/signup)
│   ├── (tabs)/         # Main tab navigation
│   ├── add-item.tsx    # Add item form
│   ├── item/           # Item detail views
│   └── ...
├── components/         # Reusable UI components
├── constants/          # Colors, config, etc.
├── context/            # React Context providers
├── hooks/              # Custom hooks
├── lib/                # Utility libs (supabase client, etc.)
├── types/              # TypeScript type definitions
├── supabase/           # Supabase migrations/config
└── ios/                # iOS native project
```

## Key Commands
- `npm start` — Start Expo dev server
- `npm run ios` — Build & run on iOS simulator
- `npm run android` — Build & run on Android
- `npm run lint` — Run ESLint
- `npm run typecheck` — Run TypeScript checks
- `npm test` — Run Jest tests
- `npm run web` — Start web version

## Architecture Notes
- **Auth:** PKCE flow is already implemented (`be8213a`). Google sign-in via OAuth, email/password fallback. Auth state managed in `AuthContext`.
- **Database:** Supabase PostgreSQL with Row-Level Security. Items scoped as "Ours" (household) or "Mine" (personal).
- **Realtime:** Supabase Realtime subscriptions keep household inventory in sync across members.
- **Notifications:** Push notifications via Expo Notifications.
- **Items lifecycle:** Active → Consumed/Trashed with freshness tracking (Fresh, Soon, Today, Overdue).

## Coding Standards
- TypeScript with strict mode
- expo-router for file-based navigation
- Functional components with hooks
- React Context for global state
- Jest for unit tests
