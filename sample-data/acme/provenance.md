# Dataset provenance

Acme content is synthetic. No real employee messages, customer records, resumes, credentials, or proprietary source code are included.

## Structural references

- Slack source layout follows Slack's documented JSON export concepts: workspace-level users and conversations plus dated message files per conversation.
- Email messages use ordinary RFC 5322-style headers and `.eml` files.
- Git code-context fixtures are original, deliberately small TypeScript repositories with locally generated commit history.
- Markdown documents are original fixtures with Primer-specific provenance and access frontmatter.

## Public material considered but not copied

- CMU's Enron corpus was considered as an email-style reference but rejected as canonical content because it represents a real unrelated organization.
- Public Apache development mailing lists were considered as software-team language references but not copied because they contain real participants and unrelated project history.
- Public CRM and job-board repositories were considered as structural references. Their code was not copied; the fixture repositories were written specifically around Acme claims and evaluation needs.

## Generation discipline

Important facts originate in `ground-truth/events.json` and `ground-truth/claims.json`, then appear with controlled variation across ingestible sources. Generated filler must not introduce new product behavior unless the truth ledger is updated first and evaluation implications are reviewed.
