# AOJ Engage

Corporate communications and automated email management for **AOJ Global Concept Limited**.

> Prepare once. Personalise automatically. Schedule intelligently. Deliver consistently.

AOJ Engage keeps the staff and customer databases, knows the Nigerian corporate calendar, writes branded and personalised emails from reusable templates, routes sensitive campaigns through management approval, and delivers through Amazon SES. Every send is recorded.

---

## What's included

| Module | Highlights |
|---|---|
| **Dashboard** | KPI cards, next-14-days occasions with campaign status, smart recommendations, recent activity, quick actions, engine status, conversational assistant |
| **Contacts** | Central database for staff, customers, partners and prospects. Duplicate and email validation, deactivate-not-delete, NDPA consent records, relationship timeline, project associations, CSV export |
| **Import** | CSV and Excel (.xlsx) upload → column mapping → validation preview with inline correction → import report. Invalid and duplicate rows are never imported silently |
| **Staff / Customers** | Dedicated directories with upcoming birthdays and work anniversaries. Birthday privacy controls |
| **Segments** | Dynamic groups by category, department, city, relationship status, project stage, birthday month and consent |
| **Calendar** | Nigerian public holidays (fixed), Easter-based dates (computed), Eid dates (provisional until confirmed with a recorded source), international observances, company occasions, recurring sends, birthdays and anniversaries. Month, week and list views, filters, reminders at 14/7/3/1 days |
| **Template Studio** | 27 launch templates. Drag-and-drop block editor, `{{placeholders}}`, `{{#if staff}}…{{else}}…{{/if}}` conditionals, live desktop and mobile preview personalised as a real contact, missing-variable and invalid-link detection, immutable versioning with restore, duplication, test sends, optional AI drafting |
| **Campaigns** | Wizard (template → recipients → personalisation → schedule → sender → classification). Pre-send recipient analysis (active, suppressed, invalid, no consent, batches), personalised preview, test send, per-recipient report, CSV export |
| **Automations** | Trigger → Conditions → Actions builder: weekly, monthly, calendar occasion, birthday, work anniversary, relationship anniversary. Enable, pause, disable, duplicate, next and previous execution, history, failures |
| **Approvals** | Approval binds to the exact campaign **revision**. Any edit voids it. Request-changes and reject require a comment. Creators can't approve their own campaigns |
| **Delivery** | Amazon SES v2, sender identity per category, `List-Unsubscribe` one-click, retry with exponential backoff (5/10/20 min), hard-bounce and complaint suppression, per-campaign and daily limits, emergency stop |
| **Analytics** | Sent, delivered, bounced, delivery and complaint rates, daily volume, template-version comparison. Filters by date, campaign, template, audience, department, status and sender. Export to CSV, Excel or PDF (print) |
| **Admin** | Users and roles, branding, sender identities, policies, suppression list, append-only audit log, notifications, media library |

### Roles

| Role | Access |
|---|---|
| ICT Administrator | Everything |
| Communications Officer | Contacts (edits external), templates, campaigns, calendar, analytics. Submits for approval |
| HR Personnel | Internal contacts, birthdays and anniversaries, internal templates and campaigns. **No customer data** |
| Management / Approver | Reviews and approves campaigns, reports |
| Read-only Auditor | History, reports, audit logs |

---

## Architecture

```
Next.js 15 (App Router, TypeScript, Tailwind)  ← UI + server actions + REST routes
        │
   Prisma ORM ── PostgreSQL (Neon / RDS)        ← all state, unique constraints for idempotency
        │
  Engine (src/lib/engine.ts)                    ← plan → dispatch, channel-independent
   ├─ Vercel Cron  → GET /api/cron/tick         (daily 08:00 WAT)
   ├─ "Send now" / "Run engine now"             (background via next/server `after`)
   └─ Amazon SES v2 ──► SNS ──► POST /api/webhooks/ses (signature-verified)
```

**How this maps to the specification.** The spec recommends NestJS + Redis/BullMQ. To deploy on Vercel as one project, this build uses a *modular monolith inside Next.js*: server actions and route handlers replace the NestJS controllers, and the Postgres-backed queue replaces BullMQ. The guarantees the spec cares about are enforced at the database level:

- `Campaign(automationId, occurrenceKey)` and `AutomationRun(automationId, occurrenceKey)` are unique, so an occurrence is planned once, however many times the job runs.
- `CampaignRecipient(campaignId, contactId)` is unique, so one delivery record exists per contact per campaign.
- Each message is **claimed** with a conditional `QUEUED → SENDING` update before sending, so parallel workers never double-send. A message left in `SENDING` by a crash is marked for review, never blindly re-sent.
- Approval stores the approved **revision**. Dispatch refuses to send unless `approvedRevision === revision`.
- A Postgres trigger makes `AuditLog` append-only.

The engine is independent of the UI and of email specifics (`renderForContact` + `sendEmail`), so SMS or WhatsApp channels can be added later without touching contacts, calendar, templates or campaigns.

---

## Deploy to Vercel

1. **Push this folder to GitHub** and import the repository in Vercel.
2. **Add a database.** In the Vercel project, open *Storage → Marketplace → Neon (Postgres)* and connect it. This sets `DATABASE_URL` and `DATABASE_URL_UNPOOLED` automatically. (Any Postgres works. Set both variables yourself, with the direct connection string in `DATABASE_URL_UNPOOLED`.)
3. **Set environment variables** (Project → Settings → Environment Variables). See `.env.example`:
   - `SESSION_SECRET`: 32+ random characters (`node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`)
   - `CRON_SECRET`: random string. Vercel Cron sends it automatically.
   - `APP_URL`: e.g. `https://engage.aojglobal.com`
   - AWS SES variables when you're ready to send real email (see below). Without them the app runs in **simulation mode**.
4. **Deploy.** The build runs `prisma migrate deploy`, then the idempotent seed (templates, calendar, automations, segments), then `next build`.
5. Open the site. You'll be sent to **/setup** to create the first ICT Administrator. That page disappears once an administrator exists.
6. Add users under *Settings → Users & roles*.

### Scheduling note

Vercel **Hobby** allows one daily cron, configured for **07:00 UTC = 08:00 Lagos**. Campaigns due at 08:00 send then. Later send times on the same day go out on the next run, or immediately with *Send now* or *Run engine now*. For exact times, either:
- upgrade to Vercel Pro and change `vercel.json` to `"*/15 * * * *"`, or
- point any external scheduler (e.g. cron-job.org, GitHub Actions) at `GET /api/cron/tick` with header `Authorization: Bearer $CRON_SECRET` every 15 minutes.

### Going live with Amazon SES

1. Verify `aojglobal.com` in SES (eu-west-1 or your region). Publish the DKIM CNAMEs, set a custom MAIL FROM domain (SPF), and publish DMARC.
2. Request SES **production access** (out of the sandbox).
3. Create an IAM user limited to `ses:SendEmail` and set `AWS_REGION`, `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`.
4. Create a **configuration set** with an SNS event destination (Delivery, Bounce, Complaint, Reject). Subscribe `https://<APP_URL>/api/webhooks/ses` over HTTPS. Set `AWS_SES_CONFIGURATION_SET` and `SES_SNS_TOPIC_ARNS`.
5. Verify each sender identity (communications@, hr@, customers@, notifications@) and check them in *Settings*.

Optional: set `OPENAI_API_KEY` to enable the AI writing assistant in the template editor. Drafts are never activated automatically.

---

## Local development

```bash
cp .env.example .env              # fill DATABASE_URL, DATABASE_URL_UNPOOLED, SESSION_SECRET, CRON_SECRET
npm install
npx prisma migrate deploy
SEED_DEMO_DATA=true npm run db:seed   # fictitious sample contacts and history
npm run dev
```

Quick Postgres: `docker run -d -p 5432:5432 -e POSTGRES_PASSWORD=dev postgres:16-alpine`

In simulation mode, any address containing `bounce` simulates a hard bounce, and `tempfail` simulates a temporary failure.

---

## Data protection (NDPA 2023)

- External contacts are **not** marketing-eligible by default. Consent is recorded with source and evidence, and imports default to *not recorded*.
- Campaigns are classified as *marketing/relationship* (consent required, unsubscribe link and `List-Unsubscribe` header added) or *operational/project/internal* (no marketing consent needed).
- Unsubscribing withdraws marketing consent only. Spam complaints and hard bounces suppress the address entirely.
- HR controls staff birthday visibility. Birthday greetings can be turned off per person.
- Purpose statement and retention period are configurable in *Settings → Policies*. Everything sensitive is audit-logged.

## Security

Argon2id password hashing · signed, HTTP-only session cookies (10 h) with server-side invalidation on role change, deactivation or password reset · login rate limiting and account lockout · role checks in every server action and route · Next.js server-action origin checks (CSRF) · React output escaping and HTML-escaped email variables (XSS) · Prisma parameterised queries (SQL injection) · email header-injection guard · CSV and Excel formula-injection guard · SNS signature verification · security headers (HSTS, frame-options, nosniff) · `noindex`.

## Project layout

```
prisma/            schema, migrations (with audit-log trigger), idempotent seed
src/lib/           engine, calendar, segments, email rendering + SES provider, auth, permissions, catalogue
src/actions/       server actions per module
src/app/(app)/     authenticated pages        src/app/(auth)/  login + first-run setup
src/app/api/       cron, SES webhook, unsubscribe, exports
src/components/    shell, template editor, campaign wizard, automation builder, import wizard
```
