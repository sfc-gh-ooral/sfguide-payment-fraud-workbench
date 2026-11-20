-- ============================================================================
-- Payment Fraud Investigation Workbench: cleanup. Drops everything sql/setup.sql
-- created: the database (tables, views, the Feature Store dynamic table, the
-- model and its version, procedures, the task, the semantic view, and the
-- agent), the warehouse, and the role. Nothing else is touched.
-- ============================================================================
USE ROLE PAYMENT_FRAUD_WB_ROLE;
ALTER TASK IF EXISTS PAYMENT_FRAUD_WB.ML.SCORE_TRANSACTIONS_TASK SUSPEND;
DROP AGENT IF EXISTS PAYMENT_FRAUD_WB.APP.FRAUD_AGENT;

USE ROLE SYSADMIN;
DROP DATABASE IF EXISTS PAYMENT_FRAUD_WB;
DROP WAREHOUSE IF EXISTS PAYMENT_FRAUD_WB_WH;

USE ROLE ACCOUNTADMIN;
DROP ROLE IF EXISTS PAYMENT_FRAUD_WB_ROLE;
