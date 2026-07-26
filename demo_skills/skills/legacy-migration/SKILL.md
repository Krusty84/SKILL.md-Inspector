---
name: legacy-migration
description: Helps migrate legacy systems to new systems when the user wants a migration.
---

# Legacy Migration

Migrate the legacy system step by step.

## Steps

1. Inventory the old system
2. Copy the data over

```sql
SELECT * FROM legacy_users;

3. Verify the data somehow
4. Turn off the old system when it feels safe
