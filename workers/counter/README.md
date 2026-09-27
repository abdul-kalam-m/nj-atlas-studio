# Export counter (owner's deploy steps)

The counter is one Cloudflare Worker endpoint, `/v1/count`, that stores totals only (DECISIONS.md D-044, IMPLEMENTATION_GUIDE.md §4.13). The code is `index.js`; the table is `schema.sql`. It is off until `catalog/hosting.json` names `counter_url`.

The owner runs these steps with their own Cloudflare account. The agent never holds the credentials.

1. Install Wrangler and sign in: `npx wrangler login`.
2. Create the database: `npx wrangler d1 create nj-atlas-counter`. Note the database ID it prints.
3. Create the table: `npx wrangler d1 execute nj-atlas-counter --remote --file workers/counter/schema.sql`.
4. Copy `wrangler.example.toml` to `wrangler.toml`, fill in the database ID, the site's origin and the pilots' codes.
5. Set the read key: `npx wrangler secret put READ_KEY`. Share it with the pilot contacts.
6. Deploy: `npx wrangler deploy`. Note the Worker's address.
7. Put `https://<worker address>/v1/count` in `catalog/hosting.json` as `counter_url`, then release.

To read the totals:

```bash
curl -H "Authorization: Bearer <READ_KEY>" https://<worker address>/v1/count
```
