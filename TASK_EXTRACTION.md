# Task Extraction Cron Endpoint

## Overview

This endpoint automatically extracts tasks from Limitless transcripts and creates them in Todoist. It's designed to be triggered periodically by external cron services.

## Endpoint

```
POST /api/cron/extract-tasks
```

## Authentication

The endpoint requires a bearer token for security:

```bash
Authorization: Bearer YOUR_CRON_SECRET
```

Set `CRON_SECRET` in your environment variables (`.env.local`):

```env
CRON_SECRET=your-random-secret-string-here
```

## Required Environment Variables

```env
# Cron authentication
CRON_SECRET=your-secret-here

# API Keys
LIMITLESS_API_KEY=your-limitless-api-key
OPENAI_API_KEY=sk-...
TODOIST_API_KEY=your-todoist-api-key
```

## How It Works

1. **Loads State**: Reads `data/processed-tasks.json` to get the last processed timestamp and transcript IDs
2. **Fetches All Transcripts**: Paginates through Limitless API to fetch ALL transcripts since last run (not just 50!)
3. **Filters Duplicates**: Skips transcripts that have already been processed
4. **Scans for Keywords**: Looks for trigger phrases like:
   - "create a task"
   - "remind me"
   - "todo" / "to do"
   - "i need to"
   - "don't forget"
   - "remember to"
   - etc.
5. **Extracts Context**: Gets line before + matching line + line after for better understanding
6. **AI Processing**: Sends context to GPT-4o-mini to generate concise, actionable tasks
7. **Creates in Todoist**: Automatically creates tasks with labels "auto-extracted" and "from-transcript"
8. **Saves State**: Updates `data/processed-tasks.json` with new timestamp and processed IDs

## State Management

The endpoint maintains state in `data/processed-tasks.json`:

```json
{
  "lastProcessedTimestamp": "2025-10-07T12:34:56.789Z",
  "processedTranscriptIds": ["id1", "id2", "..."]
}
```

This ensures:
- No duplicate processing
- No missed transcripts (continuous coverage)
- Efficient processing (only new content)

The file keeps last 1000 transcript IDs to prevent it from growing too large.

## Usage Examples

### Manual Trigger (for testing)

```bash
curl -X POST http://localhost:3000/api/cron/extract-tasks \
  -H "Authorization: Bearer your-cron-secret" \
  -H "Content-Type: application/json"
```

### With External Cron Services

#### 1. **EasyCron** (https://www.easycron.com/)
- Create new cron job
- URL: `https://yourdomain.com/api/cron/extract-tasks`
- Method: POST
- Headers: `Authorization: Bearer your-cron-secret`
- Schedule: Every hour (`0 * * * *`)

#### 2. **GitHub Actions** (Free for public repos)

Create `.github/workflows/extract-tasks.yml`:

```yaml
name: Extract Tasks
on:
  schedule:
    - cron: '0 * * * *'  # Every hour
  workflow_dispatch:  # Allow manual trigger

jobs:
  extract:
    runs-on: ubuntu-latest
    steps:
      - name: Trigger task extraction
        run: |
          curl -X POST ${{ secrets.APP_URL }}/api/cron/extract-tasks \
            -H "Authorization: Bearer ${{ secrets.CRON_SECRET }}"
```

Add secrets in GitHub repo settings:
- `APP_URL`: Your deployment URL
- `CRON_SECRET`: Your cron secret

#### 3. **Vercel Cron** (Recommended for Vercel deploys)

Add to `vercel.json`:

```json
{
  "crons": [{
    "path": "/api/cron/extract-tasks",
    "schedule": "0 * * * *"
  }]
}
```

Note: Vercel Cron requires Pro plan ($20/month)

#### 4. **Uptime Robot** (Free tier available)

- Create HTTP(s) monitor
- URL: `https://yourdomain.com/api/cron/extract-tasks`
- Monitor Type: HTTP(s)
- Custom HTTP Headers: `Authorization: Bearer your-cron-secret`
- POST Body: `{}`
- Interval: Every 60 minutes

## Response Format

### Success Response

```json
{
  "success": true,
  "totalTranscripts": 45,
  "newTranscripts": 12,
  "potentialTasks": 5,
  "createdTasks": 4,
  "tasks": [
    {
      "task": "Review quarterly report before Friday",
      "todoistId": "7654321",
      "transcriptId": "abc123"
    }
  ],
  "processedRange": {
    "start": "2025-10-07T10:00:00.000Z",
    "end": "2025-10-07T11:00:00.000Z"
  }
}
```

### No New Transcripts

```json
{
  "message": "No new transcripts to process",
  "totalFetched": 0,
  "newTranscripts": 0
}
```

### Error Response

```json
{
  "error": "Failed to extract tasks",
  "details": "Error message here"
}
```

## Monitoring & Logs

The endpoint logs to console:
- Timestamp ranges being processed
- Number of transcripts fetched
- Number of tasks found and created
- Any errors during processing

Check your deployment logs to monitor execution.

## Testing

1. **First Run** (processes last 24 hours):
```bash
curl -X POST http://localhost:3000/api/cron/extract-tasks \
  -H "Authorization: Bearer your-cron-secret" \
  -H "Content-Type: application/json" \
  | jq
```

2. **Subsequent Runs** (processes since last run):
```bash
# Run again - should show "No new transcripts"
curl -X POST http://localhost:3000/api/cron/extract-tasks \
  -H "Authorization: Bearer your-cron-secret" \
  -H "Content-Type: application/json" \
  | jq
```

3. **Reset State** (to reprocess everything):
```bash
rm data/processed-tasks.json
```

## Customization

### Add More Trigger Keywords

Edit `/src/app/api/cron/extract-tasks/route.ts`:

```typescript
const TASK_KEYWORDS = [
  "create a task",
  "remind me",
  "your custom phrase here",
  // ... add more
];
```

### Change AI Model

```typescript
model: "gpt-4o",  // Use full GPT-4o instead of mini
```

### Adjust Task Labels

```typescript
labels: ["auto-extracted", "your-custom-label"],
```

## Troubleshooting

### "Unauthorized" error
- Check that `CRON_SECRET` is set in environment variables
- Verify the Authorization header matches

### "Missing required API keys" error
- Set `LIMITLESS_API_KEY`, `OPENAI_API_KEY`, and `TODOIST_API_KEY` in `.env.local`

### No tasks being created
- Check logs to see if keywords are being found
- Verify Todoist API key has write permissions
- Check that transcripts actually contain trigger phrases

### Duplicate tasks
- Check `data/processed-tasks.json` exists and is being updated
- Verify file write permissions

### Too many tasks
- Adjust trigger keywords to be more specific
- Increase the context AI needs to consider something a task
