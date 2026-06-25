# Achievement & Badge System

Data-driven achievement system that automatically awards badges when users reach predefined milestones. Spans backend (evaluation engine + API) and frontend (achievements page + toast notifications).

## Architecture

### Data-Driven Design

All badge definitions are stored as static data and evaluated by a centralized engine. No hardcoded badge checks scattered across the codebase. New badges can be added by simply appending to the definitions array.

### Badge Categories (7)

| Category | Focus |
|---|---|
| Streak | Consecutive days of verified activity |
| Workout | Total workouts completed |
| Academic | Total quizzes completed and passed |
| Plant | Plant growth stage milestones |
| Staking | G$ staked on commitments |
| Harvest | G$ claimed from harvests |
| Points | Total points earned |

### Rarity Levels (5)

| Rarity | Color | Description |
|---|---|---|
| Common | Gray | Early milestones, easy to achieve |
| Rare | Blue | Moderate dedication required |
| Epic | Purple | Significant commitment |
| Legendary | Orange | Elite achievement |
| Mythic | Red/Pink | Maximum dedication |

## Backend

### Files

| File | Purpose |
|---|---|
| `backend/badgeDefinitions.js` | All 27 badge definitions as static data |
| `backend/achievementService.js` | Core evaluation engine |
| `backend/db/badge-db.js` | SQLite schema (`badge_definitions`, `user_badges`) |
| `backend/server.js` | API routes + trigger points |

### Requirement Types (9)

- `streak_days` — consecutive days of verified activity
- `workouts_total` — lifetime workout count
- `quizzes_total` — lifetime quiz completions
- `points_total` — total points accumulated
- `plant_stage` — current plant growth stage (0-4)
- `has_stake` — has at least one active stake
- `has_claimed` — has claimed G$ at least once
- `total_staked` — total G$ staked across all commitments
- `total_claimed` — total G$ claimed from harvests

### API Endpoints

#### GET /api/achievements/:address

Returns all badges (unlocked + locked) with progress for a wallet.

```json
{
  "unlocked": [{ "slug": "first-workout", "title": "First Sweat", "unlockedAt": "..." }],
  "locked": [{ "slug": "centurion", "title": "Centurion", "progress": 42, "total": 100, "percentage": 42 }],
  "summary": { "totalBadges": 5, "totalPossible": 27, "completionPercentage": 18.5 }
}
```

#### GET /api/achievements/recent/:address

Returns most recently earned badges (default 5, configurable via `?limit=`).

#### POST /api/admin/migrate-badges

Backfill badges for existing users who have on-chain data.

### Automatic Triggers

Badge evaluation runs automatically after:
- **POST /api/workout/record** — badge awards returned in `badgeAwards[]` + `message`
- **POST /api/quiz/submit** — badge awards returned in `badgeAwards[]` + `message`

### Duplicate Prevention

`UNIQUE(walletAddress, badgeId)` constraint in SQLite. `awardBadge()` checks before inserting.

## Frontend

### Files

| File | Purpose |
|---|---|
| `frontend/src/config/badges.ts` | TypeScript types, rarity/category config |
| `frontend/src/hooks/useAchievements.ts` | `useAchievements()` and `useRecentAchievements()` hooks |
| `frontend/src/app/components/BadgeCard.tsx` | Badge card with icon, rarity badge, progress bar |
| `frontend/src/app/components/BadgeNotification.tsx` | Toast notification with slide-in animation |
| `frontend/src/app/achievements/page.tsx` | Full achievements page |
| `frontend/src/app/page.tsx` | Recent achievements widget (home page) |

### Pages

- **/achievements** — Stat cards, category filters, unlocked/locked badge grids
- **Home page widget** — Last 5 unlocked badges with rarity tags

### Toast Notifications

`BadgeNotification` component auto-dismisses after 6 seconds. Wired into `health/page.tsx` and `academics/page.tsx` — triggers when `data.badgeAwards` is present in workout/quiz submission response.

## All 27 Badge Definitions

### Streak
| # | Slug | Title | Rarity | Requirement |
|---|---|---|---|---|
| 1 | first-streak | First Step | Common | 1 streak day |
| 2 | week-warrior | Week Warrior | Rare | 7 streak days |
| 3 | dedicated | Dedicated | Epic | 14 streak days |
| 4 | monthly-master | Monthly Master | Legendary | 30 streak days |
| 5 | immortal | Immortal | Mythic | 100 streak days |

### Workout
| # | Slug | Title | Rarity | Requirement |
|---|---|---|---|---|
| 6 | first-workout | First Sweat | Common | 1 workout |
| 7 | getting-fit | Getting Fit | Rare | 10 workouts |
| 8 | fitness-addict | Fitness Addict | Epic | 50 workouts |
| 9 | iron-will | Iron Will | Legendary | 100 workouts |
| 10 | hercules | Hercules | Mythic | 500 workouts |

### Academic
| # | Slug | Title | Rarity | Requirement |
|---|---|---|---|---|
| 11 | first-quiz | First Brain Gain | Common | 1 quiz |
| 12 | bookworm | Bookworm | Rare | 10 quizzes |
| 13 | scholar | Scholar | Epic | 50 quizzes |
| 14 | genius | Genius | Legendary | 100 quizzes |
| 15 | socrates | Socrates | Mythic | 500 quizzes |

### Plant
| # | Slug | Title | Rarity | Requirement |
|---|---|---|---|---|
| 16 | sprout-stage | Tiny Sprout | Common | plant stage 1 |
| 17 | growing-stage | Growing Strong | Rare | plant stage 2 |
| 18 | mature-stage | Fully Grown | Epic | plant stage 3 |
| 19 | fruiting-stage | Bear Fruit | Legendary | plant stage 4 |

### Staking
| # | Slug | Title | Rarity | Requirement |
|---|---|---|---|---|
| 20 | first-commitment | First Commitment | Common | has any stake |
| 21 | believer | Believer | Rare | 50 G$ staked |
| 22 | true-believer | True Believer | Epic | 500 G$ staked |
| 23 | whale | Whale | Legendary | 5000 G$ staked |

### Harvest
| # | Slug | Title | Rarity | Requirement |
|---|---|---|---|---|
| 24 | first-harvest | First Harvest | Common | has any claim |
| 25 | gardener | Gardener | Rare | 100 G$ claimed |
| 26 | farmer | Farmer | Epic | 1000 G$ claimed |
| 27 | baron | Baron | Mythic | 10000 G$ claimed |

### Points
| # | Slug | Title | Rarity | Requirement |
|---|---|---|---|---|
| Bonus | centurion | Centurion | Rare | 100 points |
| Bonus | point-milestone | Point Collector | (in badgeDefinitions.js) | (see source) |

## Tests

**61 tests total** covering:
- `backend/test/achievement.service.test.js` (37) — definitions, plant stage, requirement evaluation, progress, awarding, duplicates
- `backend/test/achievement.api.test.js` (9) — endpoints, progress data, unlocked filtering, invalid addresses

Run with:
```bash
cd backend && npm test
```

## Known Caveats

- **Harvest badges use G$ amount**, not harvest event count (contract only exposes `totalClaimed` amount)
- **Staking/harvesting via direct wallet interaction** doesn't trigger badge evaluation — only workouts and quizzes do (they go through the backend verifier). Frontend-side triggers not yet implemented.
- **Single toast** — only 1 badge notification per action even if multiple unlock (all awarded silently server-side)
- **Plant stage is volatile** — badges derived from current points can be "lost" if points drop below threshold
