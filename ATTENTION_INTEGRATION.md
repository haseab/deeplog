# Attention sidebar integration

`GET /api/integrations/tracking-now` accepts `Authorization: Bearer <ATTENTION_API_KEY>`.
Configure a separate random `ATTENTION_API_KEY` of at least 32 characters on the
DeepLog server and store it as `deeplogApiKey` in BB's Attention plugin.

DeepLog uses its existing server-side `TOGGL_SESSION_TOKEN` to read Toggl's current
entry. BB never receives that credential. The response is `{ entry: null }` when
no timer is running, or `{ entry: { description, start } }`. No history, workspace,
tag data, or credentials are returned. Requests fail closed when configuration or
the Toggl connection is unavailable, and responses use `Cache-Control: no-store`.

The API key grants access only to this read-only endpoint. Rotate it on the server
and replace Attention's stored secret to revoke an old key. Toggl session renewal
continues to happen inside DeepLog. Client-side encrypted descriptions remain
encrypted; this endpoint does not receive the user's decryption key.
