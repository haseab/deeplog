# DeepLog - Application Architecture Documentation

## Overview
DeepLog is a Next.js 15 time tracking application that integrates with Toggl Track and Limitless AI. It provides advanced time entry management with client-side encryption, sync queue management, and AI-powered task extraction from transcriptions.

**Stack:**
- Next.js 15 (App Router)
- React 19
- TypeScript
- Tailwind CSS 4
- Radix UI components
- TipTap editor

---

## Project Structure

```
deeplog/
├── src/
│   ├── app/                          # Next.js app router
│   │   ├── (timetracking)/           # Route group for time tracking
│   │   │   └── page.tsx              # Main time tracker page (/)
│   │   ├── (limitless)/              # Route group for Limitless AI
│   │   │   └── pendant/
│   │   │       └── page.tsx          # Limitless transcriptions (/pendant)
│   │   ├── api/                      # API routes
│   │   │   ├── time-entries/
│   │   │   │   ├── route.ts          # GET/POST time entries
│   │   │   │   ├── analytics-route.ts # Analytics API (Toggl)
│   │   │   │   ├── session-utils.ts  # Session token helpers
│   │   │   │   ├── utils.ts          # Time entry utilities
│   │   │   │   ├── [id]/route.ts     # PATCH/DELETE specific entry
│   │   │   │   ├── split/route.ts    # Split time entries
│   │   │   │   └── combine/route.ts  # Combine time entries
│   │   │   ├── limitless/
│   │   │   │   └── route.ts          # Limitless API proxy
│   │   │   ├── cron/
│   │   │   │   └── extract-tasks/route.ts # Task extraction cron
│   │   │   ├── projects/route.ts     # GET/POST projects
│   │   │   ├── tags/route.ts         # GET/POST tags
│   │   │   ├── validate-session-token/route.ts
│   │   │   └── validate-api-key/route.ts
│   │   ├── layout.tsx                # Root layout with providers
│   │   └── globals.css               # Global styles
│   ├── components/                   # React components (37 total)
│   │   ├── ui/                       # Shadcn/Radix UI primitives
│   │   ├── time-tracker-table.tsx    # Main time tracking table
│   │   ├── limitless-transcription-table.tsx # Limitless UI
│   │   ├── welcome-form.tsx          # Authentication form
│   │   ├── app-settings.tsx          # Settings dialog
│   │   ├── encryption-status.tsx     # E2EE status indicator
│   │   ├── pinned-time-entries.tsx   # Quick-start timers
│   │   ├── project-selector.tsx      # Project picker
│   │   ├── tag-selector.tsx          # Tag picker
│   │   ├── time-editor.tsx           # Start/stop time editor
│   │   ├── duration-editor.tsx       # Duration editor
│   │   ├── split-entry-dialog.tsx    # Split entry UI
│   │   ├── combine-entry-dialog.tsx  # Combine entries UI
│   │   ├── delete-confirmation-dialog.tsx
│   │   ├── expandable-description.tsx # Collapsible text
│   │   ├── sync-status-badge.tsx     # Sync state indicator
│   │   ├── live-duration.tsx         # Running timer display
│   │   ├── actions-menu.tsx          # Row actions dropdown
│   │   ├── recent-timers-popover.tsx # Recent timer search
│   │   ├── pin-dialog.tsx            # Pin entry dialog
│   │   ├── theme-toggle.tsx          # Dark/light mode
│   │   └── theme-provider.tsx        # next-themes provider
│   ├── contexts/
│   │   └── encryption-context.tsx    # E2EE context provider
│   ├── hooks/
│   │   ├── use-encryption.ts         # E2EE state management
│   │   ├── use-pinned-entries.ts     # Pinned entries localStorage
│   │   └── use-infinite-scroll.ts    # Infinite scroll pagination
│   ├── lib/
│   │   ├── encryption.ts             # AES-256-GCM encryption
│   │   ├── sync-queue.ts             # Operation queue manager
│   │   ├── recent-timers-cache.ts    # Recent timers fuzzy search
│   │   ├── toast.ts                  # Toast notification helpers
│   │   └── utils.ts                  # General utilities (cn, etc)
│   └── types/
│       └── index.ts                  # TypeScript type definitions
├── scripts/                          # Automation scripts
│   ├── cron.ts                       # Main cron job runner
│   ├── 5m-cron.ts                    # 5-minute interval jobs
│   ├── generate-tasks.ts             # Task extraction from Limitless
│   ├── seed-account.ts               # Seed test data
│   ├── reset-account.ts              # Clean up test data
│   └── decrypt-*.js                  # Decryption utilities
├── data/
│   └── processed-tasks.json          # Cron job state
├── public/
│   ├── deeplog.svg                   # App logo
│   └── manifest.json                 # PWA manifest
└── .env                              # Environment variables
```

---

## Data Models

### TimeEntry
```typescript
type TimeEntry = {
  id: number;                 // Toggl entry ID (negative = temp ID)
  description: string;        // Entry description (may be encrypted)
  project_id: number | null;  // Associated project
  project_name: string;       // Denormalized for display
  project_color: string;      // Hex color
  start: string;              // ISO 8601 timestamp
  stop: string;               // ISO 8601 timestamp
  duration: number;           // Seconds
  tags: string[];             // Tag names (denormalized)
  tag_ids: number[];          // Tag IDs
  syncStatus?: SyncStatus;    // 'pending' | 'syncing' | 'synced' | 'error'
  tempId?: number;            // Preserved after ID replacement
};
```

### PinnedEntry
```typescript
type PinnedEntry = {
  id: string;               // UUID for pinned entry
  description: string;      // Entry template description
  project_name: string;     // Project name
  project_color: string;    // Hex color
  tags: string[];           // Tag names
};
```

### Project
```typescript
type Project = {
  id: number;
  name: string;
  color: string;
};
```

### Tag
```typescript
type Tag = {
  id: number;
  name: string;
};
```

---

## Authentication & API Keys

### Storage Locations (localStorage)
- **Toggl Session Token:** `toggl_session_token`
- **Limitless API Key:** `limitless_api_key`
- **E2EE PIN Hash:** `e2ee_pin_hash`
- **E2EE Enabled:** `e2ee_enabled`
- **Device ID:** `e2ee_device_id`
- **Encrypted Entry IDs:** `e2ee_encrypted_entries`
- **Pinned Entries:** `deeplog_pinned_entries`
- **Recent Timers Cache:** `deeplog_recent_timers`

### Environment Variables (.env)
```bash
TOGGL_SESSION_TOKEN=<jwt_token>
LIMITLESS_API_KEY=sk-xxx
OPENAI_API_KEY=sk-proj-xxx
TODOIST_API_KEY=xxx
CRON_SECRET=<secret>
```

### Authentication Flow

#### Toggl Track Authentication
1. User visits main page [/](/)
2. If no `toggl_session_token` in localStorage → show [welcome-form.tsx](src/components/welcome-form.tsx)
3. User manually copies session token from browser cookies (`__Secure-accounts-session`)
4. App validates token via [validate-session-token/route.ts](src/app/api/validate-session-token/route.ts)
5. Token stored in localStorage, user ID/workspace ID extracted
6. Main app loads with [TimeTrackerTable](src/components/time-tracker-table.tsx)

#### Limitless AI Authentication
1. User visits [/pendant](/pendant)
2. If no `limitless_api_key` in localStorage → show [welcome-form.tsx](src/components/welcome-form.tsx)
3. User enters API key from Limitless Developer Portal
4. App stores key and loads [LimitlessTranscriptionTable](src/components/limitless-transcription-table.tsx)

**Note:** Session tokens expire monthly and must be manually refreshed.

---

## Core Services & Utilities

### 1. Encryption Service ([lib/encryption.ts](src/lib/encryption.ts))

**Purpose:** Client-side E2EE for time entry descriptions using AES-256-GCM.

**Key Functions:**
- `hashPin(pin)` - Hash 6-digit PIN with SHA-256
- `deriveKeyFromHash(pinHash, deviceId)` - Generate encryption key
- `encryptDescription(text, key, entryId)` - Encrypt with random IV + auth tag
- `decryptDescription(ciphertext, key, entryId)` - Decrypt and verify
- `validatePin(pin)` - Ensure PIN is 6 digits
- `getDeviceId()` - Get/create device ID from localStorage

**Encryption Format:** `{iv}:{authTag}:{ciphertext}` (base64 encoded)

**Hook:** [use-encryption.ts](src/hooks/use-encryption.ts)
- Manages E2EE state (enabled, unlocked, session key)
- Handles PIN verification with lockout (3 attempts, 5 min lockout)
- Tracks which entry IDs are encrypted
- Auto-unlocks on mount if PIN hash exists

**Context:** [encryption-context.tsx](src/contexts/encryption-context.tsx)
- Wraps app in `<EncryptionProvider>` at root and `/pendant` layouts

### 2. Sync Queue Manager ([lib/sync-queue.ts](src/lib/sync-queue.ts))

**Purpose:** Queue operations on temp ID entries until real ID is assigned.

**Problem Solved:** When creating a new entry, the client generates a negative temp ID. If the user edits the entry before the server responds with the real ID, those operations need to be queued.

**Key Methods:**
- `queueOperation(op)` - Queue an operation for a temp ID
- `registerIdMapping(tempId, realId)` - Map temp → real ID and execute queue
- `processQueue(entryId)` - Execute all queued operations in order
- `setSyncStatus(id, status)` - Update sync badge state
- `isTempId(id)` - Check if ID is temporary (negative)

**Operation Types:**
```typescript
type OperationType =
  | 'UPDATE_DESCRIPTION'
  | 'UPDATE_PROJECT'
  | 'UPDATE_TAGS'
  | 'UPDATE_TIME'
  | 'UPDATE_DURATION'
  | 'UPDATE_BULK'
  | 'DELETE'
  | 'STOP'
  | 'COMBINE';
```

**Usage:** Instantiated in [time-tracker-table.tsx](src/components/time-tracker-table.tsx) as `syncQueue` ref.

### 3. Recent Timers Cache ([lib/recent-timers-cache.ts](src/lib/recent-timers-cache.ts))

**Purpose:** Fuzzy search over recent time entries for quick timer start.

**Key Functions:**
- `getRecentTimers()` - Load from localStorage
- `addToRecentTimers(entry)` - Add entry to cache (dedupe by description/project/tags)
- `updateRecentTimersCache(entries)` - Bulk update from fetched entries
- `searchRecentTimers(query, limit)` - Fuzzy search with scoring
- `fuzzyMatch(query, text)` - Match algorithm (word start bonus, consecutive bonus)
- `incrementTimerUsage(desc, projId, tagIds)` - Track usage count

**Storage Key:** `deeplog_recent_timers`

**Used In:** [recent-timers-popover.tsx](src/components/recent-timers-popover.tsx)

### 4. Toast Notifications ([lib/toast.ts](src/lib/toast.ts))

**Purpose:** Wrapper around Sonner with undo support.

**Key Functions:**
- `toast.success(message, options)` - Success toast with undo
- `toast.error(message)` - Error toast
- `triggerUndo()` - Programmatically trigger undo
- `hasActiveToast()` - Check if undo toast is active

**Library:** `sonner` (via [ui/sonner.tsx](src/components/ui/sonner.tsx))

### 5. Pinned Entries ([hooks/use-pinned-entries.ts](src/hooks/use-pinned-entries.ts))

**Purpose:** Persist "quick start" timer templates in localStorage.

**Key Functions:**
- `pinEntry(entry)` - Add to pinned list
- `unpinEntry(id)` - Remove from pinned list
- `isPinned(id)` - Check if entry is pinned

**Storage Key:** `deeplog_pinned_entries`

**Used In:** [pinned-time-entries.tsx](src/components/pinned-time-entries.tsx)

---

## Important Pages & Routes

### Main Pages

#### 1. Time Tracker Page ([/](/) - [page.tsx](src/app/(timetracking)/page.tsx))
**Purpose:** Main time tracking interface with Toggl integration.

**Components:**
- `<WelcomeForm>` - If no session token
- `<TimeTrackerTable>` - Main table with entries
- `<AppSettings>` - Settings dialog (top right)
- `<EncryptionProvider>` - E2EE context

**Features:**
- Create/edit/delete time entries
- Start/stop timers
- Split/combine entries
- Pin entries for quick access
- Date range picker
- Project/tag management
- Client-side encryption toggle

#### 2. Limitless History Page ([/pendant](/pendant) - [pendant/page.tsx](src/app/(limitless)/pendant/page.tsx))
**Purpose:** Browse AI transcriptions from Limitless AI.

**Components:**
- `<WelcomeForm>` - If no API key
- `<LimitlessTranscriptionTable>` - Transcription list
- `<AppSettings>` - Settings dialog

**Features:**
- Fetch transcriptions by date
- Search transcriptions
- View markdown/headings
- Infinite scroll pagination

### API Routes

#### Time Entries API

**GET/POST** [/api/time-entries/route.ts](src/app/api/time-entries/route.ts)
- Delegates to [analytics-route.ts](src/app/api/time-entries/analytics-route.ts)
- Uses Toggl Analytics API for bulk fetching (5000 limit)
- Session token from `x-toggl-session-token` header

**GET** `/api/time-entries` (with session token header)
Query params:
- `start_date` - ISO 8601 start
- `end_date` - ISO 8601 end
- `timezone_offset` - Minutes offset (e.g., 420 for PDT)
- `page` - Pagination page
- `limit` - Results per page

Returns:
```json
{
  "entries": [...],
  "projects": [...],
  "tags": [...],
  "page": 0,
  "totalPages": 5
}
```

**POST** `/api/time-entries` (create entry)
Body:
```json
{
  "description": "Work on project",
  "project_id": 123,
  "tag_ids": [1, 2],
  "start": "2025-01-01T10:00:00Z",
  "stop": "2025-01-01T12:00:00Z",
  "duration": 7200,
  "created_with": "deeplog"
}
```

**PATCH** [/api/time-entries/[id]/route.ts](src/app/api/time-entries/[id]/route.ts)
- Update specific entry fields
- Supports bulk updates

**DELETE** `/api/time-entries/[id]`
- Delete entry by ID

**POST** [/api/time-entries/split/route.ts](src/app/api/time-entries/split/route.ts)
- Split entry into N segments
- Body: `{ entryId, numSegments }`

**POST** [/api/time-entries/combine/route.ts](src/app/api/time-entries/combine/route.ts)
- Combine multiple entries into one
- Body: `{ entryIds: [1, 2, 3] }`

#### Limitless API

**GET** [/api/limitless/route.ts](src/app/api/limitless/route.ts)
Proxy to Limitless AI API with API key from `x-limitless-api-key` header.

Query params:
- `start`/`end` - ISO timestamps OR `date` (YYYY-MM-DD)
- `limit` - Results per page (default 10)
- `cursor` - Pagination cursor
- `direction` - `asc` or `desc` (default `desc`)
- `includeMarkdown` - Include markdown (default `true`)
- `includeHeadings` - Include headings (default `true`)

Returns:
```json
{
  "lifelogs": [...],
  "nextCursor": "abc123"
}
```

#### Task Extraction Cron

**GET** [/api/cron/extract-tasks/route.ts](src/app/api/cron/extract-tasks/route.ts)
- Extracts tasks from Limitless transcriptions
- Uses OpenAI to parse task keywords
- Creates Todoist tasks
- Requires `x-cron-secret` header

Triggered by: [scripts/cron.ts](scripts/cron.ts) or [scripts/5m-cron.ts](scripts/5m-cron.ts)

---

## Key Features & How They Work

### 1. Client-Side Encryption (E2EE)

**Flow:**
1. User enables E2EE in settings → enters 6-digit PIN
2. PIN hashed with SHA-256 → stored in localStorage
3. Encryption key derived from hash + device ID
4. Session key kept in memory during session
5. On mount, auto-unlock if PIN hash exists
6. Each entry description encrypted on save with:
   - Random 12-byte IV
   - AES-256-GCM cipher
   - 16-byte auth tag
7. Encrypted entries tracked by ID in localStorage
8. On load, decrypt descriptions if unlocked

**Lockout:** 3 failed PIN attempts = 5 minute lockout

**Files:**
- [lib/encryption.ts](src/lib/encryption.ts) - Crypto primitives
- [hooks/use-encryption.ts](src/hooks/use-encryption.ts) - State management
- [components/encryption-status.tsx](src/components/encryption-status.tsx) - UI indicator

### 2. Optimistic UI with Sync Queue

**Problem:** User creates entry → client assigns temp ID (e.g., -1) → user edits immediately → server responds with real ID (e.g., 12345) → edits lost.

**Solution:**
1. New entry created with temp ID (-1, -2, etc.)
2. Entry added to UI immediately (optimistic)
3. POST request sent to server
4. Any edits before response → queued in `SyncQueueManager`
5. Server responds with real ID
6. Client calls `registerIdMapping(-1, 12345)`
7. Queue executes all pending operations in order
8. Sync status badge shows: pending → syncing → synced

**Files:**
- [lib/sync-queue.ts](src/lib/sync-queue.ts) - Queue manager
- [components/sync-status-badge.tsx](src/components/sync-status-badge.tsx) - UI

### 3. Pinned Entries (Quick Start Timers)

**Purpose:** Save frequently used timer templates for one-click start.

**Flow:**
1. User clicks "Pin" action on entry
2. Entry saved to localStorage with UUID
3. Pinned entries appear at top of table
4. Click pinned entry → start new timer with same description/project/tags
5. Running timer shown with live duration counter

**Files:**
- [hooks/use-pinned-entries.ts](src/hooks/use-pinned-entries.ts) - State
- [components/pinned-time-entries.tsx](src/components/pinned-time-entries.tsx) - UI
- [components/pin-dialog.tsx](src/components/pin-dialog.tsx) - Pin confirmation

### 4. Recent Timers Fuzzy Search

**Purpose:** Quickly find and restart recent timers by typing partial descriptions.

**Flow:**
1. User types in "Recent Timers" popover
2. Fuzzy match algorithm scores all cached entries:
   - Word start matches get 10 points
   - Consecutive matches get 5 bonus points
   - Regular char matches get 1 point
3. Results sorted by score, then usage count
4. Select entry → start new timer

**Files:**
- [lib/recent-timers-cache.ts](src/lib/recent-timers-cache.ts) - Search logic
- [components/recent-timers-popover.tsx](src/components/recent-timers-popover.tsx) - UI

### 5. Split & Combine Entries

**Split Entry:**
1. Right-click entry → "Split Entry"
2. Enter number of segments (2-10)
3. Server divides duration equally, deletes original, creates N new entries
4. Client refetches entries

**Combine Entries:**
1. Select multiple entries (Cmd+Click rows)
2. Right-click → "Combine Entries"
3. Server creates single entry from earliest start to latest stop
4. Deletes originals
5. Client refetches entries

**Files:**
- [app/api/time-entries/split/route.ts](src/app/api/time-entries/split/route.ts)
- [app/api/time-entries/combine/route.ts](src/app/api/time-entries/combine/route.ts)
- [components/split-entry-dialog.tsx](src/components/split-entry-dialog.tsx)
- [components/combine-entry-dialog.tsx](src/components/combine-entry-dialog.tsx)

### 6. Keyboard Navigation

**Shortcuts:**
- `1-5` - Jump to columns (description, project, tags, time, duration)
- `Enter` - Edit selected cell
- `Escape` - Cancel edit
- `Tab` - Next cell
- `Shift+Tab` - Previous cell
- `↑/↓` - Navigate rows
- `Cmd+Click` - Multi-select rows
- `Cmd+A` - Select all visible rows

**Implementation:** [time-tracker-table.tsx](src/components/time-tracker-table.tsx) (lines 800+)

### 7. Date Range Picker

**Presets:**
- Today
- Yesterday
- Last 7 days
- Last 30 days
- This week
- Last week
- Custom range

**Implementation:** [components/ui/calendar.tsx](src/components/ui/calendar.tsx) with `react-day-picker`

### 8. Task Extraction from Limitless

**Flow:**
1. Cron job runs every 5 minutes ([scripts/5m-cron.ts](scripts/5m-cron.ts))
2. Fetches new Limitless transcriptions since last run
3. Searches for task keywords ("remind me", "todo", "deadline", etc.)
4. Sends matched excerpts to OpenAI for structured extraction
5. Creates tasks in Todoist with:
   - Content from transcription
   - Due date (parsed with `chrono-node`)
   - Link back to Limitless transcript
6. Saves last processed timestamp to [data/processed-tasks.json](data/processed-tasks.json)

**Files:**
- [app/api/cron/extract-tasks/route.ts](src/app/api/cron/extract-tasks/route.ts) - Extraction logic
- [scripts/cron.ts](scripts/cron.ts) - Manual runner
- [scripts/5m-cron.ts](scripts/5m-cron.ts) - Automated runner

---

## Common Patterns & Code Locations

### Where to Find Things

**Need to add a new time entry operation?**
→ Add API route in [app/api/time-entries/](src/app/api/time-entries/)
→ Add operation type to [lib/sync-queue.ts](src/lib/sync-queue.ts)
→ Call from [time-tracker-table.tsx](src/components/time-tracker-table.tsx)

**Need to modify authentication?**
→ Session token validation: [app/api/validate-session-token/route.ts](src/app/api/validate-session-token/route.ts)
→ Session token usage: [app/api/time-entries/session-utils.ts](src/app/api/time-entries/session-utils.ts)
→ Welcome form: [components/welcome-form.tsx](src/components/welcome-form.tsx)

**Need to change encryption behavior?**
→ Crypto functions: [lib/encryption.ts](src/lib/encryption.ts)
→ State management: [hooks/use-encryption.ts](src/hooks/use-encryption.ts)
→ UI controls: [components/encryption-status.tsx](src/components/encryption-status.tsx)

**Need to adjust UI components?**
→ Primitives: [components/ui/](src/components/ui/)
→ Main table: [components/time-tracker-table.tsx](src/components/time-tracker-table.tsx)
→ Settings: [components/app-settings.tsx](src/components/app-settings.tsx)

**Need to modify Toggl API calls?**
→ Analytics API: [app/api/time-entries/analytics-route.ts](src/app/api/time-entries/analytics-route.ts)
→ Session helpers: [app/api/time-entries/session-utils.ts](src/app/api/time-entries/session-utils.ts)

**Need to change Limitless integration?**
→ API proxy: [app/api/limitless/route.ts](src/app/api/limitless/route.ts)
→ UI table: [components/limitless-transcription-table.tsx](src/components/limitless-transcription-table.tsx)
→ Page: [app/(limitless)/pendant/page.tsx](src/app/(limitless)/pendant/page.tsx)

---

## Scripts & Automation

### Development Scripts

**`npm run dev`** - Start dev server with Turbopack
**`npm run build`** - Production build
**`npm run start`** - Start production server
**`npm run seed`** - Seed test time entries ([scripts/seed-account.ts](scripts/seed-account.ts))
**`npm run reset`** - Delete all time entries ([scripts/reset-account.ts](scripts/reset-account.ts))

### Cron Jobs

**[scripts/cron.ts](scripts/cron.ts)** - Manual cron job runner
- Calls `/api/cron/extract-tasks` with `CRON_SECRET`

**[scripts/5m-cron.ts](scripts/5m-cron.ts)** - Automated 5-minute runner
- Runs task extraction every 5 minutes
- Set up with cron or systemd timer

**[scripts/generate-tasks.ts](scripts/generate-tasks.ts)** - Standalone task extractor
- Fetches Limitless transcriptions
- Extracts tasks with OpenAI
- Creates Todoist tasks

---

## Important Gotchas & Known Issues

### 1. Session Token Expiration
Toggl session tokens expire after ~30 days. When expired:
- All API calls return 401
- User must manually refresh token from browser cookies
- No automatic refresh mechanism

**Fix:** Go to Toggl Track → DevTools → Application → Cookies → Copy `__Secure-accounts-session`

### 2. Temp ID Race Conditions
If user edits entry before server responds with real ID, edits are queued. If user navigates away or refreshes page before queue executes, edits are lost.

**Mitigation:** Sync queue is in-memory only (not persisted).

### 3. Encryption Key Device Locking
Encryption key was originally derived with device ID, meaning encrypted entries couldn't be decrypted on a different device. This was removed in [lib/encryption.ts:53](src/lib/encryption.ts#L53) (device ID parameter ignored).

**Current Behavior:** Same PIN works across devices for entries encrypted after this change. Old entries may still be locked to original device.

### 4. Analytics API Date Handling
Toggl Analytics API expects dates in YYYY-MM-DD format in user's local timezone, not UTC. The client sends `timezone_offset` in minutes, which the server uses to convert UTC timestamps to local dates.

**Implementation:** [analytics-route.ts:110-121](src/app/api/time-entries/analytics-route.ts#L110)

### 5. Recent Timers Cache Staleness
Recent timers cache can get out of sync if entries are edited in Toggl web/mobile apps. Cache is updated on fetch via `updateRecentTimersCache()`, which removes stale entries.

**Behavior:** Descriptions <60 chars are cached; longer descriptions are not.

---

## Testing & Development

### Local Development
1. Copy `.env.example` to `.env`
2. Add Toggl session token
3. Add Limitless API key (optional)
4. Run `npm install`
5. Run `npm run dev`
6. Visit `http://localhost:3000`

### Seeding Test Data
```bash
npm run seed
```
Creates 100 random time entries in Toggl for testing.

### Resetting Account
```bash
npm run reset
```
Deletes all time entries in Toggl (use with caution!).

### Testing Encryption
In browser console:
```javascript
import { testEncryption } from '@/lib/encryption';
testEncryption('123456'); // Returns true if roundtrip works
```

---

## Technology Decisions

### Why Next.js App Router?
- Server-side API routes for secure token handling
- Client-side React for rich interactions
- File-based routing with route groups
- Built-in API proxy (no CORS issues)

### Why localStorage for Tokens?
- No backend database required
- Fully client-side application
- Simple authentication model
- User controls their own credentials

### Why AES-256-GCM?
- Built into Node.js crypto module
- Authenticated encryption (prevents tampering)
- Industry standard
- No external dependencies

### Why Sync Queue?
- Optimistic UI for instant feedback
- Prevents race conditions with temp IDs
- Guarantees operation ordering
- Better UX than blocking on server responses

### Why Analytics API?
- Toggl standard API has 200 entry limit per page
- Analytics API returns up to 5000 entries in one request
- Faster page loads for users with many entries
- Single request instead of multiple paginated requests

---

## Future Enhancements

### Possible Improvements
- [ ] Persist sync queue to localStorage (survive page refresh)
- [ ] Auto-refresh session tokens (requires OAuth flow)
- [ ] Offline mode with IndexedDB
- [ ] Bulk edit operations
- [ ] CSV export
- [ ] Time entry templates
- [ ] Project color customization
- [ ] Weekly/monthly reports
- [ ] Pomodoro timer integration
- [ ] Mobile app (React Native)

---

## Quick Reference

### Most Important Files
1. [src/components/time-tracker-table.tsx](src/components/time-tracker-table.tsx) - Main UI logic (1800+ lines)
2. [src/app/api/time-entries/analytics-route.ts](src/app/api/time-entries/analytics-route.ts) - Data fetching
3. [src/lib/sync-queue.ts](src/lib/sync-queue.ts) - Operation queue
4. [src/hooks/use-encryption.ts](src/hooks/use-encryption.ts) - E2EE state
5. [src/lib/encryption.ts](src/lib/encryption.ts) - Crypto functions

### Most Common Operations
- **Fetch time entries:** GET `/api/time-entries` with session token header
- **Create entry:** POST `/api/time-entries` with body
- **Update entry:** PATCH `/api/time-entries/[id]` with fields
- **Delete entry:** DELETE `/api/time-entries/[id]`
- **Start timer:** POST `/api/time-entries` with `duration: -1`, `stop: null`
- **Stop timer:** PATCH `/api/time-entries/[id]` with `stop: <timestamp>`

### Key localStorage Keys
- `toggl_session_token` - Toggl auth
- `limitless_api_key` - Limitless auth
- `e2ee_pin_hash` - Encryption PIN
- `e2ee_enabled` - E2EE toggle
- `e2ee_encrypted_entries` - Encrypted entry IDs
- `deeplog_pinned_entries` - Pinned timers
- `deeplog_recent_timers` - Recent timer cache

---

## Accessing Different Parts of the App

### Routes
- `/` - Main time tracker (requires Toggl session token)
- `/pendant` - Limitless transcriptions (requires Limitless API key)

### API Endpoints
- `/api/time-entries` - Time entry CRUD
- `/api/time-entries/[id]` - Single entry operations
- `/api/time-entries/split` - Split entry
- `/api/time-entries/combine` - Combine entries
- `/api/projects` - Project CRUD
- `/api/tags` - Tag CRUD
- `/api/limitless` - Limitless API proxy
- `/api/cron/extract-tasks` - Task extraction cron
- `/api/validate-session-token` - Validate Toggl token
- `/api/validate-api-key` - Validate API key

### Component Hierarchy
```
App
├── ThemeProvider (dark/light mode)
├── EncryptionProvider (E2EE context)
├── Toaster (toast notifications)
└── Page
    ├── WelcomeForm (if no auth)
    └── Main UI
        ├── AppSettings (top right)
        ├── PinnedTimeEntries (quick start)
        └── TimeTrackerTable
            ├── Calendar (date picker)
            ├── RecentTimersPopover (search)
            ├── Table (entries list)
            │   └── Row (per entry)
            │       ├── ExpandableDescription
            │       ├── ProjectSelector
            │       ├── TagSelector
            │       ├── TimeEditor
            │       ├── DurationEditor
            │       ├── SyncStatusBadge
            │       └── ActionsMenu
            ├── SplitEntryDialog
            ├── CombineEntryDialog
            ├── DeleteConfirmationDialog
            └── PinDialog
```

---

*This document was generated to help Claude Code understand the DeepLog codebase without repeatedly searching for the same information.*
