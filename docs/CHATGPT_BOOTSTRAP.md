# ChatGPT Memory Bootstrap

The bootstrap importer seeds JARVIS with a small, reviewed set of durable facts from selected ChatGPT conversations.

## Safety model

- Explicit, user-approved statements are treated as authoritative.
- Assistant recommendations are context only unless the user explicitly adopted them.
- Every imported decision, memory, and profile fact points to a local source message.
- Each source message contains the original ChatGPT conversation ID.
- Imported memories and facts use `source_type = imported`.
- The importer is idempotent: running it again updates the curated project snapshot and does not duplicate exact records.
- Dry-run mode is the default.

## Review the plan

```bash
npm run bootstrap:chats
```

## Apply the reviewed seed

```bash
npm run bootstrap:chats:apply
```

The initial source set is:

1. `Entrepreneurship Priorities Hub`
2. `Creating Your Own AI`

Future conversations should be added only after reviewing explicit user statements, later reversals, and the final authoritative state.
