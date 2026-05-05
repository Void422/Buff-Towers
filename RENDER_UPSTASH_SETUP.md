# Render + Upstash setup

This app stores live tower state in Upstash Redis when these environment variables are present:

```env
UPSTASH_REDIS_REST_URL="https://your-db.upstash.io"
UPSTASH_REDIS_REST_TOKEN="your-token"
TOWER_STATE_REDIS_KEY="buff-towers:snapshot"
```

On Render, add the variables in your service's Environment tab. Do not commit the real token to GitHub.

If the Upstash variables are missing, the app falls back to `data/towers.json` for local development only. File storage is not reliable on Render free services because the filesystem is ephemeral.

After deploying, tower time and marker updates should save to Redis, not GitHub.
