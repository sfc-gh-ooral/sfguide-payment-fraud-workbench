# Payment Fraud Investigation Workbench

Help fraud analysts score card and real-time payments, see linked accounts and devices, and close cases faster with an AI case summary.

**[Guide](https://sfc-gh-ooral.github.io/sfguide-payment-fraud-workbench/) · [Try the example (no account needed)](https://sfc-gh-ooral.github.io/sfguide-payment-fraud-workbench/try/)**

A fraud operations app on Snowflake for a fictional bank, Northwind Financial. It has five screens:

| Screen | What the analyst does | Snowflake capability |
| --- | --- | --- |
| Fraud overview | Fraud rate in basis points, losses, alert volume, precision on worked alerts, and a map of fraud by H3 cell | Snowflake SQL, geospatial H3 functions |
| Alert queue | Works alerts by priority with score, reason codes, and an SLA timer; confirms fraud, marks a false positive, or escalates | Snowpark ML (XGBoost) scores from the Model Registry |
| Case detail | Reads the transaction and login timeline, a map of the card's swipes, and the account-device-IP link graph; drafts a case note with AI; records the decision | Recursive CTE, `ST_DISTANCE`, Cortex `AI_COMPLETE` |
| Model & rules | Moves a threshold slider to see the precision / recall trade-off and alert volume on labeled data | Feature Store (velocity features on a Dynamic Table), Model Registry |
| Ask | Asks questions such as "Which merchants had card-testing patterns this week?" | Cortex Agents with Cortex Analyst over a semantic view |

All data is synthetic, with five planted stories (card testing, account takeover, a 12-account mule ring, impossible travel, and a false-positive cluster after a promotion). See [data/README.md](data/README.md).

> **Disclaimer.** Synthetic data and illustrative logic only. This is not a production fraud system, and not regulatory, compliance, or legal advice. Model results describe this synthetic data set; real portfolios are noisier and labels arrive weeks late. This is an illustrative example, not an official Snowflake product, and is not supported by Snowflake Support.

## Prerequisites

- **Sample mode:** Node.js 20.19 or later. Nothing else.
- **Live mode:** a Snowflake account (Standard Edition is enough) where you can use ACCOUNTADMIN, or USERADMIN + SECURITYADMIN and SYSADMIN, to run `sql/setup.sql`.
  - Cortex AI available in your region, or cross-region inference enabled, for `AI_COMPLETE` (default model `claude-sonnet-4-5`) and Cortex Agents.
  - Anaconda packages for Snowpark Python (`snowflake-ml-python`, `xgboost`, `scikit-learn`), which setup uses inside stored procedures.
  - Key-pair authentication (or a programmatic access token) for the user that runs the app.
- Tested with Node.js 22, Next.js 16, and snowflake-sdk 3.4 in November 2026 on an AWS US West account.

## Quick start: Sample mode (no account)

```bash
git clone https://github.com/sfc-gh-ooral/sfguide-payment-fraud-workbench.git
cd sfguide-payment-fraud-workbench
npm install
npm run dev
```

Open http://localhost:3000. The header switch shows **Sample**. Data comes from `lib/mock/sample.json`, captured from a Live run. AI answers are labeled **Sample AI response**: they are scripted text captured from live calls, shown after a short delay with the same steps the live call runs. Decisions you record stay in your browser.

## Live mode: deploy to your account

1. Open a Snowsight SQL worksheet as ACCOUNTADMIN and run [`sql/setup.sql`](sql/setup.sql) top to bottom. No edits are needed. It generates the data, builds the Feature Store view, trains and registers the model, scores November payments, builds alerts, and creates the semantic view and agent.
2. Create a key pair and register the public key on your user (steps are in `.env.example`).
3. Copy `.env.example` to `.env.local` and fill in your account identifier, user, and key path. `.env.local` is git-ignored; never commit it.
4. Run `npm run dev` and switch the header to **Live**. If a live call fails, the app shows the error; it never falls back to sample data.

Setup grants `PAYMENT_FRAUD_WB_ROLE` to the user who runs it, and the app connects with only that role (`USE SECONDARY ROLES NONE`).

### Objects created

| Object | Name | Notes |
| --- | --- | --- |
| Role | `PAYMENT_FRAUD_WB_ROLE` | Least-privilege role: schema-scoped grants, `SNOWFLAKE.CORTEX_USER`, `EXECUTE TASK` |
| Warehouse | `PAYMENT_FRAUD_WB_WH` | XSMALL, `AUTO_SUSPEND = 60`, initially suspended |
| Database | `PAYMENT_FRAUD_WB` | Schemas `RAW`, `FEATURES`, `ML`, `APP` |
| Tables | `RAW.*` | Customers, accounts, cards, devices, IPs, merchants, ~3M transactions, account events, chargebacks |
| Feature Store | `FEATURES` entity `TXN`, feature view `TXN_VELOCITY$1` | A Dynamic Table with 14 card, account, device, merchant, and geo velocity features |
| Model | `ML.FRAUD_XGB` version `V1` | XGBoost classifier in the Model Registry |
| Procedures | `ML.TRAIN_MODEL`, `ML.SCORE_TRANSACTIONS` | Snowpark Python; scoring uses `model.run` in the warehouse |
| Task | `ML.SCORE_TRANSACTIONS_TASK` | Daily batch scoring; created suspended (we ran it once with `EXECUTE TASK` to verify) |
| Tables | `ML.MODEL_EVAL`, `ML.SCORES`, `ML.PR_CURVE` | Metrics, scores, precision/recall by threshold |
| Tables | `APP.ALERTS`, `APP.ALERT_ACTIONS`, `APP.CASES`, `APP.LINK_EDGES`, `APP.LINK_CLUSTERS` | Alerts with reason codes, analyst decisions, link graph |
| Views | `APP.DAILY_KPIS`, `APP.FRAUD_HEX`, `APP.ALERTS_ENRICHED` | App reads |
| Semantic view | `APP.ALERTS_SV` | Alerts for Cortex Analyst |
| Agent | `APP.FRAUD_AGENT` | Cortex Agent for the Ask screen |

### Cleanup

Run [`sql/cleanup.sql`](sql/cleanup.sql). It suspends the task, drops the agent, then drops the database, warehouse, and role. Nothing else is touched. Delete `.env.local` too.

## Expected cost and time

Measured on an XSMALL warehouse in November 2026:

- `sql/setup.sql` ran in **2 minutes 49 seconds** (data generation, the Feature Store Dynamic Table over ~3M rows, training, and scoring).
- The warehouse metered **0.41 credits** in the hour that covered setup and a full Live walkthrough of every screen. Your numbers will vary with region, edition, and how long you click around.
- AI calls are billed separately by tokens: in our run an `AI_COMPLETE` case summary took 6 to 8 seconds and an agent answer 10 to 21 seconds. Check `SNOWFLAKE.ACCOUNT_USAGE.CORTEX_FUNCTIONS_USAGE_HISTORY` for your own cost.
- Screens other than the AI buttons answer in about 0.2 to 2 seconds in Live mode.

## Known limitations

- **Batch, not real time.** Payments are scored in batch with the registered model, and a daily task is created suspended. Real-time authorization scoring would use Snowpipe Streaming for ingestion and model serving on Snowpark Container Services; this example doesn't build either.
- **Synthetic signals are clean.** The model scores an AUC of 0.9996 and 70% precision at 92% recall (threshold 0.5) on November data, only because the synthetic fraud is easy to separate. Expect much lower numbers on real data, and labels that arrive weeks after the payment.
- **Labels are complete.** Every fraudulent synthetic payment has a chargeback or issuer confirmation; real chargebacks are partial and late.
- **The Feature Store view refreshes in full.** The velocity windows use range window frames, so the Dynamic Table can't refresh incrementally.
- **Link analysis is bounded.** The case graph walks two account hops through shared devices and IPs with a recursive CTE, and skips devices or IPs used by more than 50 accounts. It isn't a graph database.
- **The password-reset feature uses each account's latest reset**, which is enough for this data set.
- **The SLA clock is fixed** to the data set's "now" (2026-11-15 09:00), so timers match the screenshots.
- **Decisions in Live mode update `APP.ALERTS`.** Re-run `sql/setup.sql` to reset the queue.
- **AI output can be wrong.** Case summaries and agent answers are drafts for an analyst to check.

## Customize with Cortex Code

- "Map my authorization feed to `RAW.TRANSACTIONS` and build the velocity features as dynamic tables. Explain the mapping and propose least-privilege access before changing anything."
- "Retrain `FRAUD_XGB` with my chargeback labels and show the precision/recall curve at three thresholds, with alert volume per day at each."
- "Add a rule for first-party fraud and backtest it on 90 days of my data. Report how many extra alerts it adds and how many confirmed frauds it catches."

## How it's built

- Next.js (App Router) + TypeScript + Tailwind + Recharts; `snowflake-sdk` on the server for Live mode, with bind variables for every input.
- `lib/live-data.ts` holds the Live queries; `lib/client.ts` switches between the API routes (Live) and `lib/mock/sample.json` (Sample).
- `npm run build:example` exports the Sample-mode app to `docs/try/` for GitHub Pages; `npm run capture` refreshes the screenshots; `node scripts/capture-sample.mjs` refreshes the sample bundle from a running Live app.

## License

Apache 2.0. See [LICENSE](LICENSE). Provided as-is: an illustrative example, not an official Snowflake product, and not supported by Snowflake Support.

Owner: Oz Oral · Last reviewed: November 2026
