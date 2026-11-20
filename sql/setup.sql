-- ============================================================================
-- Payment Fraud Investigation Workbench: Snowflake setup
-- Synthetic data and an illustrative fraud model only. Not a production fraud
-- system, and not regulatory, compliance, or legal advice.
-- ============================================================================
-- Run top to bottom in a Snowsight SQL worksheet. No edits or find-and-replace.
-- Takes about 15 to 20 minutes on an XSMALL warehouse (data generation,
-- feature engineering on ~3M transactions, model training, and scoring).
--
-- Requires: ACCOUNTADMIN (or USERADMIN + SECURITYADMIN) and SYSADMIN.
-- Cortex AI (AI_COMPLETE, Cortex Agents) in your region or with cross-region
-- inference enabled. Standard Edition is enough.
--
-- Creates (sql/cleanup.sql drops all of it); changes nothing that already exists:
--   role       PAYMENT_FRAUD_WB_ROLE   least-privilege pipeline + app role
--   warehouse  PAYMENT_FRAUD_WB_WH     XSMALL, AUTO_SUSPEND = 60
--   database   PAYMENT_FRAUD_WB        schemas RAW, FEATURES, ML, APP
--   RAW        CITIES, CUSTOMERS, ACCOUNTS, CARDS, DEVICES, IP_ADDRESSES,
--              MERCHANTS, TRANSACTIONS (~3M rows), ACCOUNT_EVENTS, CHARGEBACKS,
--              function U (seeded uniform random)
--   FEATURES   Feature Store: entity TXN, feature view TXN_VELOCITY (a Dynamic Table)
--   ML         model FRAUD_XGB (V1), procedures TRAIN_MODEL / SCORE_TRANSACTIONS,
--              task SCORE_TRANSACTIONS_TASK (created suspended), tables MODEL_EVAL,
--              SCORES, PR_CURVE
--   APP        ALERTS, ALERT_ACTIONS, CASES, LINK_EDGES, LINK_CLUSTERS, views,
--              semantic view ALERTS_SV, agent FRAUD_AGENT
-- ============================================================================

-- --------------------------------------------------------------------------
-- 0. Account-level: one least-privilege role for the pipeline and the app
-- --------------------------------------------------------------------------
USE ROLE ACCOUNTADMIN;
CREATE ROLE IF NOT EXISTS PAYMENT_FRAUD_WB_ROLE
  COMMENT = 'Payment Fraud Investigation Workbench example: owns only objects in PAYMENT_FRAUD_WB';
GRANT ROLE PAYMENT_FRAUD_WB_ROLE TO ROLE SYSADMIN;
SET my_user = CURRENT_USER();
GRANT ROLE PAYMENT_FRAUD_WB_ROLE TO USER IDENTIFIER($my_user);
GRANT DATABASE ROLE SNOWFLAKE.CORTEX_USER TO ROLE PAYMENT_FRAUD_WB_ROLE; -- AI_COMPLETE, Cortex Agents
GRANT EXECUTE TASK ON ACCOUNT TO ROLE PAYMENT_FRAUD_WB_ROLE;           -- the scoring task

-- --------------------------------------------------------------------------
-- 1. Warehouse, database, schemas (SYSADMIN), with schema-scoped grants only
-- --------------------------------------------------------------------------
USE ROLE SYSADMIN;
CREATE WAREHOUSE IF NOT EXISTS PAYMENT_FRAUD_WB_WH
  WAREHOUSE_SIZE = XSMALL AUTO_SUSPEND = 60 AUTO_RESUME = TRUE INITIALLY_SUSPENDED = TRUE
  COMMENT = 'Payment Fraud Investigation Workbench example';
CREATE DATABASE IF NOT EXISTS PAYMENT_FRAUD_WB COMMENT = 'Payment Fraud Investigation Workbench example (synthetic data)';
CREATE SCHEMA IF NOT EXISTS PAYMENT_FRAUD_WB.RAW;
CREATE SCHEMA IF NOT EXISTS PAYMENT_FRAUD_WB.FEATURES;
CREATE SCHEMA IF NOT EXISTS PAYMENT_FRAUD_WB.ML;
CREATE SCHEMA IF NOT EXISTS PAYMENT_FRAUD_WB.APP;

GRANT USAGE, OPERATE ON WAREHOUSE PAYMENT_FRAUD_WB_WH TO ROLE PAYMENT_FRAUD_WB_ROLE;
GRANT USAGE ON DATABASE PAYMENT_FRAUD_WB TO ROLE PAYMENT_FRAUD_WB_ROLE;
GRANT USAGE, CREATE TABLE, CREATE VIEW, CREATE FUNCTION ON SCHEMA PAYMENT_FRAUD_WB.RAW TO ROLE PAYMENT_FRAUD_WB_ROLE;
-- The Feature Store creates dynamic tables, views, and tags in its schema.
GRANT USAGE, CREATE TABLE, CREATE VIEW, CREATE DYNAMIC TABLE, CREATE TAG, CREATE TASK
  ON SCHEMA PAYMENT_FRAUD_WB.FEATURES TO ROLE PAYMENT_FRAUD_WB_ROLE;
GRANT USAGE, CREATE TABLE, CREATE VIEW, CREATE MODEL, CREATE PROCEDURE, CREATE TASK, CREATE STAGE
  ON SCHEMA PAYMENT_FRAUD_WB.ML TO ROLE PAYMENT_FRAUD_WB_ROLE;
GRANT USAGE, CREATE TABLE, CREATE VIEW, CREATE SEMANTIC VIEW, CREATE AGENT
  ON SCHEMA PAYMENT_FRAUD_WB.APP TO ROLE PAYMENT_FRAUD_WB_ROLE;

-- Everything below runs as the least-privilege role.
USE ROLE PAYMENT_FRAUD_WB_ROLE;
USE WAREHOUSE PAYMENT_FRAUD_WB_WH;
USE SCHEMA PAYMENT_FRAUD_WB.RAW;

-- --------------------------------------------------------------------------
-- 2. Seeded synthetic data. U(i, k) is a deterministic uniform [0, 1) draw,
--    so every run produces the same rows. The data window is 2026-10-01 to
--    2026-11-14; "now" in the data is 2026-11-15 09:00.
-- --------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION U(I NUMBER, K STRING) RETURNS FLOAT
  AS 'MOD(ABS(HASH(I, K)), 1000000007)::FLOAT / 1000000007';

CREATE OR REPLACE TABLE CITIES (CITY_ID NUMBER, CITY STRING, STATE STRING, LAT FLOAT, LON FLOAT) AS
SELECT column1, column2, column3, column4, column5 FROM VALUES
 (0,'Boston','MA',42.360,-71.059),(1,'Miami','FL',25.762,-80.192),(2,'New York','NY',40.713,-74.006),
 (3,'Chicago','IL',41.878,-87.630),(4,'Dallas','TX',32.777,-96.797),(5,'Houston','TX',29.760,-95.370),
 (6,'Atlanta','GA',33.749,-84.388),(7,'Denver','CO',39.739,-104.990),(8,'Seattle','WA',47.606,-122.332),
 (9,'San Francisco','CA',37.775,-122.419),(10,'Los Angeles','CA',34.052,-118.244),(11,'Phoenix','AZ',33.448,-112.074),
 (12,'Philadelphia','PA',39.953,-75.165),(13,'Washington','DC',38.907,-77.037),(14,'Minneapolis','MN',44.978,-93.265),
 (15,'Detroit','MI',42.331,-83.046),(16,'Charlotte','NC',35.227,-80.843),(17,'Nashville','TN',36.163,-86.781),
 (18,'Austin','TX',30.267,-97.743),(19,'Portland','OR',45.515,-122.679),(20,'San Diego','CA',32.716,-117.161),
 (21,'Las Vegas','NV',36.170,-115.140),(22,'Salt Lake City','UT',40.761,-111.891),(23,'Kansas City','MO',39.100,-94.579),
 (24,'Columbus','OH',39.961,-82.999),(25,'Indianapolis','IN',39.768,-86.158),(26,'Tampa','FL',27.951,-82.457),
 (27,'St. Louis','MO',38.627,-90.199),(28,'Pittsburgh','PA',40.441,-79.996),(29,'Raleigh','NC',35.780,-78.638);

-- 60,000 customers, one checking account and one debit card each (plus 12 mule accounts below).
CREATE OR REPLACE TABLE CUSTOMERS AS
WITH f AS (SELECT INDEX AS I, VALUE::STRING AS N FROM TABLE(FLATTEN(INPUT => SPLIT('Ava,Liam,Maya,Noah,Iris,Owen,Lena,Ezra,Nora,Caleb,Ruth,Milo,Hazel,Jonah,Clara,Felix,Sofia,Theo,Leah,Adrian,Mira,Elias,June,Rowan,Esme,Silas,Talia,Jude,Priya,Marcus,Yara,Dmitri,Ines,Kofi,Mei,Rafael,Anya,Tomas,Leila,Victor', ',')))),
     l AS (SELECT INDEX AS I, VALUE::STRING AS N FROM TABLE(FLATTEN(INPUT => SPLIT('Abernell,Brightwater,Castellane,Dunmore,Everly,Farrowind,Galloway,Hartwell,Ivers,Jessup,Kincaid,Lindqvist,Marchetti,Nakamura,Okafor,Pemberton,Quill,Ravensdale,Sorensen,Thorne,Underhill,Valdez,Whitlock,Yardley,Zielinski,Ashcombe,Bellamy,Corwin,Delacroix,Ellsworth', ','))))
SELECT 'CU' || LPAD(s.N, 6, '0') AS CUSTOMER_ID, f.N || ' ' || l.N AS FULL_NAME,
       (s.N * 7) % 30 AS HOME_CITY_ID, DATEADD(DAY, -FLOOR(U(s.N, 'tenure') * 3000), '2026-09-30'::DATE) AS CUSTOMER_SINCE
FROM (SELECT ROW_NUMBER() OVER (ORDER BY SEQ4()) AS N FROM TABLE(GENERATOR(ROWCOUNT => 60000))) s
JOIN f ON f.I = FLOOR(U(s.N, 'first') * 40) JOIN l ON l.I = FLOOR(U(s.N, 'last') * 30);

INSERT INTO CUSTOMERS
SELECT 'CU' || LPAD(60000 + n, 6, '0'), name, (n * 5) % 30, DATEADD(DAY, n % 6, '2026-10-20'::DATE)
FROM (SELECT INDEX + 1 AS n, VALUE::STRING AS name FROM TABLE(FLATTEN(INPUT => SPLIT(
  'Brannock Tate,Celia Vorn,Dax Mirrell,Elsa Quarn,Fenn Oldry,Gia Harlow,Hugo Pressel,Isla Venner,Jory Calder,Kira Stenholt,Luca Varnes,Mina Orrick', ','))));

CREATE OR REPLACE TABLE ACCOUNTS AS
SELECT 'A' || SUBSTR(CUSTOMER_ID, 3) AS ACCOUNT_ID, CUSTOMER_ID,
       IFF(TO_NUMBER(SUBSTR(CUSTOMER_ID, 3)) > 60000, 'CHECKING_NEW', 'CHECKING') AS PRODUCT,
       IFF(TO_NUMBER(SUBSTR(CUSTOMER_ID, 3)) > 60000, CUSTOMER_SINCE, DATEADD(DAY, FLOOR(U(TO_NUMBER(SUBSTR(CUSTOMER_ID, 3)), 'open') * 200), CUSTOMER_SINCE)) AS OPENED_ON,
       HOME_CITY_ID
FROM CUSTOMERS;

CREATE OR REPLACE TABLE CARDS AS
SELECT 'C' || SUBSTR(ACCOUNT_ID, 2) AS CARD_ID, ACCOUNT_ID, 'DEBIT' AS CARD_TYPE,
       LPAD(MOD(ABS(HASH(ACCOUNT_ID, 'last4')), 10000), 4, '0') AS LAST4
FROM ACCOUNTS;

-- Merchants: 60 in-store per city, 200 online, and two named online merchants used by the stories.
CREATE OR REPLACE TABLE MERCHANTS AS
WITH stems AS (SELECT INDEX AS I, VALUE::STRING AS S FROM TABLE(FLATTEN(INPUT => SPLIT('Brindle,Calvory,Durnwick,Elmora,Fenstow,Galvane,Harrowby,Istrel,Jorvane,Kestrin,Lumenor,Marvelle,Norbeck,Orlaith,Pellmont,Quarrin,Rosvane,Selwick,Tavron,Ulvere', ',')))),
     kinds AS (SELECT column1 AS K, column2 AS MCC, column3 AS LABEL, column4 AS CATEGORY FROM VALUES
       (0,'5411','Market','Grocery'),(1,'5541','Fuel','Fuel'),(2,'5812','Bistro','Restaurants'),(3,'5912','Pharmacy','Pharmacy'),
       (4,'5732','Electronics','Electronics'),(5,'5651','Outfitters','Apparel'),(6,'4511','Travel','Travel'),(7,'5815','Digital','Digital goods')),
     n AS (SELECT ROW_NUMBER() OVER (ORDER BY SEQ4()) AS N FROM TABLE(GENERATOR(ROWCOUNT => 2000)))
SELECT 'M' || LPAD(n.N, 5, '0') AS MERCHANT_ID,
       s.S || ' ' || k.LABEL || IFF(n.N > 1800, ' Online', '') AS MERCHANT_NAME,
       k.MCC, k.CATEGORY, IFF(n.N > 1800, 'ONLINE', 'IN_STORE') AS MERCHANT_TYPE,
       c.CITY_ID, c.CITY, c.STATE,
       ROUND(c.LAT + (U(n.N, 'mlat') - 0.5) * 0.12, 5) AS LAT, ROUND(c.LON + (U(n.N, 'mlon') - 0.5) * 0.12, 5) AS LON
FROM n
JOIN kinds k ON k.K = IFF(n.N > 1800, 4 + MOD(n.N, 4), MOD(n.N, 8))
JOIN stems s ON s.I = MOD(FLOOR(n.N / 8), 20)
JOIN CITIES c ON c.CITY_ID = IFF(n.N > 1800, MOD(n.N, 30), FLOOR((n.N - 1) / 60));
INSERT INTO MERCHANTS VALUES
  ('M02001', 'Zentrova Digital Goods', '5815', 'Digital goods', 'ONLINE', 21, 'Las Vegas', 'NV', 36.170, -115.140),
  ('M02002', 'Quillmont Outfitters', '5651', 'Apparel', 'ONLINE', 19, 'Portland', 'OR', 45.515, -122.679),
  ('M02003', 'Varnell Gift Cards', '5947', 'Gift cards', 'ONLINE', 4, 'Dallas', 'TX', 32.777, -96.797);

-- ~2.97M everyday transactions plus a small background of fraud with realistic signals:
-- an unfamiliar device and IP, larger amounts, and night-time hours.
CREATE OR REPLACE TABLE TRANSACTIONS AS
WITH s AS (SELECT ROW_NUMBER() OVER (ORDER BY SEQ4()) AS I FROM TABLE(GENERATOR(ROWCOUNT => 2970000))),
b AS (
  SELECT I, 1 + FLOOR(U(I, 'acct') * 60000) AS A, U(I, 'chan') AS RC, FLOOR(U(I, 'day') * 45) AS D, U(I, 'amt') AS RA, U(I, 'hr') AS RH
  FROM s),
c AS (
  SELECT b.*, CASE WHEN RC < 0.55 THEN 'CARD_PRESENT' WHEN RC < 0.85 THEN 'CARD_NOT_PRESENT' ELSE 'P2P' END AS CHANNEL,
         (A * 7) % 30 AS HOME,
         -- About 3% of account-days are travel days in another city.
         IFF(U(A * 100 + D, 'travel') < 0.03, MOD(A + D + 11, 30), (A * 7) % 30) AS TODAY_CITY,
         U(I, 'fraud') < CASE WHEN RC < 0.55 THEN 0.0003 WHEN RC < 0.85 THEN 0.0016 ELSE 0.0012 END AS F
  FROM b)
SELECT 'T' || LPAD(I, 8, '0') AS TXN_ID,
       DATEADD(SECOND, FLOOR(U(I, 'sec') * 3600),
         DATEADD(HOUR, CASE WHEN F AND U(I, 'night') < 0.6 THEN 1 + FLOOR(RH * 4) WHEN U(I, 'any') < 0.06 THEN FLOOR(RH * 24) ELSE 7 + FLOOR(RH * 16) END,
           DATEADD(DAY, D, '2026-10-01'::TIMESTAMP_NTZ))) AS TS,
       'A' || LPAD(A, 6, '0') AS ACCOUNT_ID,
       IFF(CHANNEL = 'P2P', NULL, 'C' || LPAD(A, 6, '0')) AS CARD_ID,
       CHANNEL,
       CASE CHANNEL WHEN 'CARD_PRESENT' THEN 'M' || LPAD(IFF(F, MOD(A + 17, 30), TODAY_CITY) * 60 + 1 + FLOOR(U(I, 'merch') * 60), 5, '0')
                    WHEN 'CARD_NOT_PRESENT' THEN 'M' || LPAD(1801 + FLOOR(U(I, 'merch') * 200), 5, '0') END AS MERCHANT_ID,
       IFF(CHANNEL = 'P2P', 'A' || LPAD(1 + FLOOR(U(I, 'payee') * 60000), 6, '0'), NULL) AS COUNTERPARTY_ACCOUNT_ID,
       ROUND(IFF(F, 2.5, 1) * CASE CHANNEL WHEN 'CARD_PRESENT' THEN 4 + 120 * POWER(RA, 2.2) + IFF(U(I, 'big') < 0.03, 300 * U(I, 'bigamt'), 0)
                                  WHEN 'CARD_NOT_PRESENT' THEN 8 + 180 * POWER(RA, 2)
                                  ELSE 20 + 400 * POWER(RA, 2) END + IFF(F, 40, 0), 2) AS AMOUNT,
       IFF(CHANNEL = 'CARD_PRESENT', NULL, IFF(F, 'DX' || I, IFF(U(I, 'dev2') < 0.1, 'D' || LPAD(A + 100000, 6, '0'), 'D' || LPAD(A, 6, '0')))) AS DEVICE_ID,
       IFF(CHANNEL = 'CARD_PRESENT', NULL, IFF(F, 'IPX' || MOD(I, 5000), 'IP' || LPAD(A, 6, '0'))) AS IP_ID,
       IFF(CHANNEL = 'CARD_PRESENT', NULL, HOME) AS GEO_CITY_ID,  -- non-card-present geolocates to the IP
       F AS IS_FRAUD_TRUTH
FROM c;

-- Card-present rows take the merchant's location; others take the account's home city.
ALTER TABLE TRANSACTIONS ADD COLUMN LAT FLOAT;
ALTER TABLE TRANSACTIONS ADD COLUMN LON FLOAT;
UPDATE TRANSACTIONS t SET LAT = m.LAT, LON = m.LON FROM MERCHANTS m WHERE t.CHANNEL = 'CARD_PRESENT' AND m.MERCHANT_ID = t.MERCHANT_ID;
UPDATE TRANSACTIONS t SET LAT = ROUND(c.LAT + (U(TO_NUMBER(SUBSTR(t.TXN_ID, 2)), 'glat') - 0.5) * 0.1, 5),
                          LON = ROUND(c.LON + (U(TO_NUMBER(SUBSTR(t.TXN_ID, 2)), 'glon') - 0.5) * 0.1, 5)
  FROM CITIES c WHERE t.CHANNEL <> 'CARD_PRESENT' AND c.CITY_ID = t.GEO_CITY_ID;

CREATE OR REPLACE TABLE ACCOUNT_EVENTS (EVENT_ID STRING, TS TIMESTAMP_NTZ, ACCOUNT_ID STRING, EVENT_TYPE STRING, DEVICE_ID STRING, IP_ID STRING, DETAIL STRING);

-- ---- Planted stories (documented in data/README.md) ----------------------
-- (1) Card testing: 420 tiny card-not-present authorizations on 420 cards at one
--     merchant in 90 minutes from four bot devices, then 18 of those cards cash out.
INSERT INTO TRANSACTIONS (TXN_ID, TS, ACCOUNT_ID, CARD_ID, CHANNEL, MERCHANT_ID, COUNTERPARTY_ACCOUNT_ID, AMOUNT, DEVICE_ID, IP_ID, GEO_CITY_ID, IS_FRAUD_TRUTH, LAT, LON)
SELECT 'T9' || LPAD(n, 7, '0'), DATEADD(SECOND, FLOOR(n * 12.8), '2026-11-12 02:10:00'::TIMESTAMP_NTZ),
       'A' || LPAD(a, 6, '0'), 'C' || LPAD(a, 6, '0'), 'CARD_NOT_PRESENT', 'M02001', NULL,
       ROUND(0.5 + U(n, 'ctamt') * 1.49, 2), 'DCT' || MOD(n, 4), 'IPCT1', 21, TRUE, 36.170, -115.140
FROM (SELECT n, 1 + MOD(n * 1709, 60000) AS a FROM (SELECT ROW_NUMBER() OVER (ORDER BY SEQ4()) AS n FROM TABLE(GENERATOR(ROWCOUNT => 420))));
INSERT INTO TRANSACTIONS (TXN_ID, TS, ACCOUNT_ID, CARD_ID, CHANNEL, MERCHANT_ID, COUNTERPARTY_ACCOUNT_ID, AMOUNT, DEVICE_ID, IP_ID, GEO_CITY_ID, IS_FRAUD_TRUTH, LAT, LON)
SELECT 'T91' || LPAD(n, 6, '0'), DATEADD(MINUTE, n * 37, '2026-11-13 06:00:00'::TIMESTAMP_NTZ),
       'A' || LPAD(a, 6, '0'), 'C' || LPAD(a, 6, '0'), 'CARD_NOT_PRESENT', 'M0' || (1801 + MOD(n * 13, 200)), NULL,
       ROUND(300 + U(n, 'coamt') * 600, 2), 'DCT' || MOD(n, 4), 'IPCT1', 21, TRUE, 36.170, -115.140
FROM (SELECT n, 1 + MOD(n * 23 * 1709, 60000) AS a FROM (SELECT ROW_NUMBER() OVER (ORDER BY SEQ4()) AS n FROM TABLE(GENERATOR(ROWCOUNT => 18))));

-- (2) Account takeover on A012345: a new device logs in, resets the password, adds
--     payees, then drains $9,800 by P2P into the mule ring.
INSERT INTO ACCOUNT_EVENTS VALUES
  ('E0000001', '2026-11-14 09:02:11', 'A012345', 'LOGIN_NEW_DEVICE', 'DATO1', 'IPATO1', 'First login from this device'),
  ('E0000002', '2026-11-14 09:04:40', 'A012345', 'PASSWORD_RESET', 'DATO1', 'IPATO1', 'Reset via email link'),
  ('E0000003', '2026-11-14 09:07:05', 'A012345', 'PAYEE_ADDED', 'DATO1', 'IPATO1', 'Payee A060001'),
  ('E0000004', '2026-11-14 09:07:52', 'A012345', 'PAYEE_ADDED', 'DATO1', 'IPATO1', 'Payee A060004'),
  ('E0000005', '2026-11-14 09:08:30', 'A012345', 'PAYEE_ADDED', 'DATO1', 'IPATO1', 'Payee A060007');
INSERT INTO TRANSACTIONS (TXN_ID, TS, ACCOUNT_ID, CARD_ID, CHANNEL, MERCHANT_ID, COUNTERPARTY_ACCOUNT_ID, AMOUNT, DEVICE_ID, IP_ID, GEO_CITY_ID, IS_FRAUD_TRUTH, LAT, LON)
SELECT column1, column2::TIMESTAMP_NTZ, 'A012345', NULL, 'P2P', NULL, column3, column4, 'DATO1', 'IPATO1', 4, TRUE, 32.80, -96.77
FROM VALUES ('T9200001', '2026-11-14 09:10:14', 'A060001', 1900.00), ('T9200002', '2026-11-14 09:16:47', 'A060004', 1850.00),
            ('T9200003', '2026-11-14 09:23:05', 'A060007', 1700.00), ('T9200004', '2026-11-14 09:29:58', 'A060001', 1600.00),
            ('T9200005', '2026-11-14 09:37:21', 'A060004', 1500.00), ('T9200006', '2026-11-14 09:44:02', 'A060007', 1250.00);

-- (3) Mule ring: 12 new accounts share three devices and two IPs, take P2P inflows,
--     pass money between themselves, and cash out in gift cards. The takeover
--     device DATO1 also logs in to one of the mule accounts.
INSERT INTO ACCOUNT_EVENTS
SELECT 'E1' || LPAD(n, 6, '0'), DATEADD(HOUR, n * 7, '2026-10-26 10:00:00'::TIMESTAMP_NTZ), 'A0' || (60001 + MOD(n, 12)),
       'LOGIN', 'DMULE' || (1 + MOD(n, 3)), 'IPMULE' || (1 + MOD(n, 2)), 'Login'
FROM (SELECT ROW_NUMBER() OVER (ORDER BY SEQ4()) AS n FROM TABLE(GENERATOR(ROWCOUNT => 72)));
INSERT INTO ACCOUNT_EVENTS VALUES ('E2000001', '2026-11-14 11:30:00', 'A060004', 'LOGIN', 'DATO1', 'IPATO1', 'Login');
INSERT INTO TRANSACTIONS (TXN_ID, TS, ACCOUNT_ID, CARD_ID, CHANNEL, MERCHANT_ID, COUNTERPARTY_ACCOUNT_ID, AMOUNT, DEVICE_ID, IP_ID, GEO_CITY_ID, IS_FRAUD_TRUTH, LAT, LON)
SELECT 'T93' || LPAD(n, 5, '0'), DATEADD(MINUTE, n * 251, '2026-11-01 08:00:00'::TIMESTAMP_NTZ),
       'A' || LPAD(1 + MOD(n * 4973, 60000), 6, '0'), NULL, 'P2P', NULL, 'A0' || (60001 + MOD(n, 12)),
       ROUND(250 + U(n, 'inamt') * 900, 2), 'D' || LPAD(1 + MOD(n * 4973, 60000), 6, '0'), 'IP' || LPAD(1 + MOD(n * 4973, 60000), 6, '0'), 4, FALSE, 32.78, -96.80
FROM (SELECT ROW_NUMBER() OVER (ORDER BY SEQ4()) AS n FROM TABLE(GENERATOR(ROWCOUNT => 60)));
INSERT INTO TRANSACTIONS (TXN_ID, TS, ACCOUNT_ID, CARD_ID, CHANNEL, MERCHANT_ID, COUNTERPARTY_ACCOUNT_ID, AMOUNT, DEVICE_ID, IP_ID, GEO_CITY_ID, IS_FRAUD_TRUTH, LAT, LON)
SELECT 'T94' || LPAD(n, 5, '0'), DATEADD(MINUTE, n * 173, '2026-11-02 12:00:00'::TIMESTAMP_NTZ),
       'A0' || (60001 + MOD(n, 12)), IFF(MOD(n, 3) = 0, 'C0' || (60001 + MOD(n, 12)), NULL),
       IFF(MOD(n, 3) = 0, 'CARD_NOT_PRESENT', 'P2P'), IFF(MOD(n, 3) = 0, 'M02003', NULL),
       IFF(MOD(n, 3) = 0, NULL, 'A0' || (60001 + MOD(n + 5, 12))),
       ROUND(400 + U(n, 'outamt') * 1100, 2), 'DMULE' || (1 + MOD(n, 3)), 'IPMULE' || (1 + MOD(n, 2)), 4, TRUE, 32.78, -96.80
FROM (SELECT ROW_NUMBER() OVER (ORDER BY SEQ4()) AS n FROM TABLE(GENERATOR(ROWCOUNT => 90)));

-- (4) Impossible travel on card C034560 (home Boston): an in-store swipe in Boston,
--     then 28 minutes later a counterfeit in-store swipe 2,025 km away in Miami.
INSERT INTO TRANSACTIONS (TXN_ID, TS, ACCOUNT_ID, CARD_ID, CHANNEL, MERCHANT_ID, COUNTERPARTY_ACCOUNT_ID, AMOUNT, DEVICE_ID, IP_ID, GEO_CITY_ID, IS_FRAUD_TRUTH, LAT, LON)
SELECT column1, column2::TIMESTAMP_NTZ, 'A034560', 'C034560', 'CARD_PRESENT', column3, NULL, column4, NULL, NULL, NULL, column5,
       m.LAT, m.LON
FROM VALUES ('T9500001', '2026-11-13 14:02:37', 'M00007', 42.18, FALSE), ('T9500002', '2026-11-13 14:30:09', 'M00065', 639.99, TRUE),
            ('T9500003', '2026-11-13 14:41:55', 'M00068', 412.50, TRUE) v
JOIN MERCHANTS m ON m.MERCHANT_ID = v.column3;

-- (5) False-positive cluster: a legitimate promotion at Quillmont Outfitters on
--     2026-11-08 brings 950 checkouts at $149 or $179, many from shoppers' new phones.
INSERT INTO TRANSACTIONS (TXN_ID, TS, ACCOUNT_ID, CARD_ID, CHANNEL, MERCHANT_ID, COUNTERPARTY_ACCOUNT_ID, AMOUNT, DEVICE_ID, IP_ID, GEO_CITY_ID, IS_FRAUD_TRUTH, LAT, LON)
SELECT 'T96' || LPAD(n, 5, '0'), DATEADD(SECOND, FLOOR(n * 37.9), '2026-11-08 10:00:00'::TIMESTAMP_NTZ),
       'A' || LPAD(a, 6, '0'), 'C' || LPAD(a, 6, '0'), 'CARD_NOT_PRESENT', 'M02002', NULL,
       IFF(MOD(n, 3) = 0, 179.00, 149.00), IFF(MOD(n, 20) < 9, 'DNEW' || n, 'D' || LPAD(a, 6, '0')), 'IP' || LPAD(a, 6, '0'),
       (a * 7) % 30, FALSE, c.LAT, c.LON
FROM (SELECT n, 1 + MOD(n * 7919, 60000) AS a FROM (SELECT ROW_NUMBER() OVER (ORDER BY SEQ4()) AS n FROM TABLE(GENERATOR(ROWCOUNT => 950)))) x
JOIN CITIES c ON c.CITY_ID = (x.a * 7) % 30;

-- Devices and IPs seen in the data, with first-seen time.
CREATE OR REPLACE TABLE DEVICES AS
SELECT DEVICE_ID, MIN(TS) AS FIRST_SEEN, COUNT(DISTINCT ACCOUNT_ID) AS ACCOUNTS,
       IFF(DEVICE_ID LIKE 'D0%' OR DEVICE_ID LIKE 'D1%', 'Customer phone', 'Unrecognized device') AS DEVICE_LABEL
FROM (SELECT DEVICE_ID, TS, ACCOUNT_ID FROM TRANSACTIONS WHERE DEVICE_ID IS NOT NULL
      UNION ALL SELECT DEVICE_ID, TS, ACCOUNT_ID FROM ACCOUNT_EVENTS) GROUP BY DEVICE_ID;
CREATE OR REPLACE TABLE IP_ADDRESSES AS
SELECT IP_ID, MIN(TS) AS FIRST_SEEN, COUNT(DISTINCT ACCOUNT_ID) AS ACCOUNTS
FROM (SELECT IP_ID, TS, ACCOUNT_ID FROM TRANSACTIONS WHERE IP_ID IS NOT NULL
      UNION ALL SELECT IP_ID, TS, ACCOUNT_ID FROM ACCOUNT_EVENTS) GROUP BY IP_ID;

-- Fraud labels: chargebacks filed on fraudulent transactions (the card-testing
-- micro-authorizations are labeled as confirmed by the issuer instead).
CREATE OR REPLACE TABLE CHARGEBACKS AS
SELECT 'CB' || SUBSTR(TXN_ID, 2) AS CHARGEBACK_ID, TXN_ID, AMOUNT,
       CASE WHEN MERCHANT_ID = 'M02001' AND AMOUNT < 3 THEN 'Card testing (issuer confirmed)'
            WHEN CHANNEL = 'P2P' THEN 'Unauthorized transfer'
            WHEN CHANNEL = 'CARD_PRESENT' THEN 'Counterfeit card'
            ELSE 'Card not present fraud' END AS REASON,
       DATEADD(DAY, 3 + FLOOR(U(TO_NUMBER(SUBSTR(TXN_ID, 2)), 'cbdays') * 20), TS)::DATE AS FILED_ON
FROM TRANSACTIONS WHERE IS_FRAUD_TRUTH;
-- Ground truth lives only in CHARGEBACKS from here on.
ALTER TABLE TRANSACTIONS DROP COLUMN IS_FRAUD_TRUTH;

-- --------------------------------------------------------------------------
-- 3. Feature Store (velocity features on a Dynamic Table), training, and the
--    Model Registry, all inside a Snowpark Python procedure in the warehouse
-- --------------------------------------------------------------------------
USE SCHEMA PAYMENT_FRAUD_WB.ML;
CREATE TABLE IF NOT EXISTS MODEL_EVAL (MODEL_VERSION STRING, PAYLOAD VARIANT, CREATED_AT TIMESTAMP_NTZ);

CREATE OR REPLACE PROCEDURE TRAIN_MODEL()
RETURNS VARIANT
LANGUAGE PYTHON
RUNTIME_VERSION = '3.11'
PACKAGES = ('snowflake-snowpark-python', 'snowflake-ml-python', 'xgboost', 'scikit-learn', 'pandas', 'numpy')
HANDLER = 'run'
AS
$$
import json, numpy as np, xgboost as xgb
from sklearn.metrics import roc_auc_score, average_precision_score
from snowflake.ml.feature_store import FeatureStore, Entity, FeatureView, CreationMode
from snowflake.ml.registry import Registry
from snowflake.ml.model import task

DB, WH = 'PAYMENT_FRAUD_WB', 'PAYMENT_FRAUD_WB_WH'
COLS = ['AMOUNT', 'IS_CNP', 'IS_P2P', 'HOUR_OF_DAY', 'CARD_TXN_1H', 'ACCT_AMT_24H', 'AMT_TO_AVG', 'NEW_DEVICE',
        'DEVICE_ACCOUNTS', 'MERCH_SMALL_1H', 'KM_FROM_PREV', 'KMH_FROM_PREV', 'FIRST_TIME_PAYEE', 'PW_RESET_24H']

VELOCITY_SQL = """
WITH t AS (
  SELECT t.*, DATE_PART(EPOCH_SECOND, t.TS) AS EPOCH FROM PAYMENT_FRAUD_WB.RAW.TRANSACTIONS t),
w AS (
  SELECT t.TXN_ID, t.TS, t.AMOUNT::FLOAT AS AMOUNT,
    IFF(t.CHANNEL = 'CARD_NOT_PRESENT', 1, 0)::FLOAT AS IS_CNP, IFF(t.CHANNEL = 'P2P', 1, 0)::FLOAT AS IS_P2P,
    HOUR(t.TS)::FLOAT AS HOUR_OF_DAY,
    IFF(t.CARD_ID IS NULL, 0, COUNT(*) OVER (PARTITION BY t.CARD_ID ORDER BY t.EPOCH RANGE BETWEEN 3600 PRECEDING AND CURRENT ROW))::FLOAT AS CARD_TXN_1H,
    SUM(t.AMOUNT) OVER (PARTITION BY t.ACCOUNT_ID ORDER BY t.EPOCH RANGE BETWEEN 86400 PRECEDING AND CURRENT ROW)::FLOAT AS ACCT_AMT_24H,
    (t.AMOUNT / NULLIF(AVG(t.AMOUNT) OVER (PARTITION BY t.ACCOUNT_ID ORDER BY t.EPOCH RANGE BETWEEN 2592000 PRECEDING AND 1 PRECEDING), 0))::FLOAT AS AMT_TO_AVG,
    IFF(t.DEVICE_ID IS NOT NULL AND t.DEVICE_ID NOT IN ('D' || SUBSTR(t.ACCOUNT_ID, 2), 'D' || LPAD(TO_NUMBER(SUBSTR(t.ACCOUNT_ID, 2)) + 100000, 6, '0')), 1, 0)::FLOAT AS NEW_DEVICE,
    COALESCE(d.ACCOUNTS, 0)::FLOAT AS DEVICE_ACCOUNTS,
    IFF(t.MERCHANT_ID IS NULL, 0, SUM(IFF(t.AMOUNT < 3 AND t.CHANNEL = 'CARD_NOT_PRESENT', 1, 0))
        OVER (PARTITION BY t.MERCHANT_ID ORDER BY t.EPOCH RANGE BETWEEN 3600 PRECEDING AND CURRENT ROW))::FLOAT AS MERCH_SMALL_1H,
    LAG(t.LAT) OVER (PARTITION BY t.CARD_ID ORDER BY t.TS) AS PLAT, LAG(t.LON) OVER (PARTITION BY t.CARD_ID ORDER BY t.TS) AS PLON,
    LAG(t.TS) OVER (PARTITION BY t.CARD_ID ORDER BY t.TS) AS PTS, t.LAT, t.LON, t.CARD_ID,
    IFF(t.CHANNEL = 'P2P' AND ROW_NUMBER() OVER (PARTITION BY t.ACCOUNT_ID, t.COUNTERPARTY_ACCOUNT_ID ORDER BY t.TS) = 1, 1, 0)::FLOAT AS FIRST_TIME_PAYEE,
    t.ACCOUNT_ID
  FROM t LEFT JOIN PAYMENT_FRAUD_WB.RAW.DEVICES d ON d.DEVICE_ID = t.DEVICE_ID)
SELECT w.TXN_ID, w.TS, w.AMOUNT, w.IS_CNP, w.IS_P2P, w.HOUR_OF_DAY, w.CARD_TXN_1H, w.ACCT_AMT_24H,
  COALESCE(w.AMT_TO_AVG, 1)::FLOAT AS AMT_TO_AVG, w.NEW_DEVICE, w.DEVICE_ACCOUNTS, w.MERCH_SMALL_1H,
  -- Geospatial: distance and implied speed since the card's previous transaction (impossible travel)
  COALESCE(IFF(w.CARD_ID IS NULL OR w.PLAT IS NULL, 0, ST_DISTANCE(ST_MAKEPOINT(w.LON, w.LAT), ST_MAKEPOINT(w.PLON, w.PLAT)) / 1000), 0)::FLOAT AS KM_FROM_PREV,
  COALESCE(IFF(w.CARD_ID IS NULL OR w.PLAT IS NULL, 0, (ST_DISTANCE(ST_MAKEPOINT(w.LON, w.LAT), ST_MAKEPOINT(w.PLON, w.PLAT)) / 1000)
      / GREATEST(DATEDIFF(SECOND, w.PTS, w.TS), 60) * 3600), 0)::FLOAT AS KMH_FROM_PREV,
  w.FIRST_TIME_PAYEE,
  IFF(r.RESET_TS <= w.TS AND r.RESET_TS > DATEADD(HOUR, -24, w.TS), 1, 0)::FLOAT AS PW_RESET_24H
FROM w LEFT JOIN (SELECT ACCOUNT_ID, MAX(TS) AS RESET_TS FROM PAYMENT_FRAUD_WB.RAW.ACCOUNT_EVENTS
                  WHERE EVENT_TYPE = 'PASSWORD_RESET' GROUP BY ACCOUNT_ID) r ON r.ACCOUNT_ID = w.ACCOUNT_ID
"""

def run(session):
    fs = FeatureStore(session=session, database=DB, name='FEATURES', default_warehouse=WH,
                      creation_mode=CreationMode.CREATE_IF_NOT_EXIST)
    txn = Entity(name='TXN', join_keys=['TXN_ID'], desc='One payment: card present, card not present, or P2P')
    fs.register_entity(txn)
    fv = fs.register_feature_view(
        FeatureView(name='TXN_VELOCITY', entities=[txn], feature_df=session.sql(VELOCITY_SQL), timestamp_col='TS',
                    refresh_freq='1 day', desc='Card, account, device, merchant, and geo velocity features per transaction'),
        version='1', block=True, overwrite=True)

    # Train on October (all fraud plus a 12% sample of good payments); test on November 1-14.
    labeled = """SELECT f.*, IFF(c.TXN_ID IS NULL, 0, 1) AS LABEL FROM PAYMENT_FRAUD_WB.FEATURES."TXN_VELOCITY$1" f
                 LEFT JOIN PAYMENT_FRAUD_WB.RAW.CHARGEBACKS c ON c.TXN_ID = f.TXN_ID"""
    train = session.sql(f"SELECT * FROM ({labeled}) WHERE TS < '2026-11-01' AND (LABEL = 1 OR MOD(ABS(HASH(TXN_ID)), 100) < 12)").to_pandas()
    test = session.sql(f"SELECT * FROM ({labeled}) WHERE TS >= '2026-11-01'").to_pandas()
    weight = np.where(train.LABEL == 1, 1.0, 100 / 12)  # undo the down-sampling

    clf = xgb.XGBClassifier(max_depth=5, learning_rate=0.08, n_estimators=300, subsample=0.8, colsample_bytree=0.8,
                            min_child_weight=5, random_state=7, n_jobs=1, eval_metric='aucpr')
    X = train[COLS].astype('float64')
    clf.fit(X, train.LABEL, sample_weight=weight)
    p = clf.predict_proba(test[COLS].astype('float64'))[:, 1]
    auc = float(roc_auc_score(test.LABEL, p)); ap = float(average_precision_score(test.LABEL, p))
    imp = clf.get_booster().get_score(importance_type='gain'); tot = sum(imp.values())
    importance = sorted([{'feature': k, 'importance': round(v / tot, 4)} for k, v in imp.items()], key=lambda r: -r['importance'])

    reg = Registry(session=session, database_name=DB, schema_name='ML')
    try:
        reg.delete_model('FRAUD_XGB')
    except Exception:
        pass
    reg.log_model(clf, model_name='FRAUD_XGB', version_name='V1', sample_input_data=X.head(500),
                  task=task.Task.TABULAR_BINARY_CLASSIFICATION, conda_dependencies=['xgboost'], target_platforms=['WAREHOUSE'],
                  comment='XGBoost payment fraud model trained on October 2026 synthetic payments',
                  metrics={'test_auc': round(auc, 4), 'test_avg_precision': round(ap, 4), 'train_rows': int(len(train))})
    payload = {'version': 'V1', 'algorithm': 'XGBoost classifier', 'trainingWindow': '2026-10-01 to 2026-10-31',
               'testWindow': '2026-11-01 to 2026-11-14', 'features': COLS, 'trainRows': int(len(train)),
               'trainFraud': int(train.LABEL.sum()), 'testRows': int(len(test)), 'testFraud': int(test.LABEL.sum()),
               'auc': round(auc, 4), 'avgPrecision': round(ap, 4), 'importance': importance,
               'featureView': 'FEATURES.TXN_VELOCITY$1'}
    session.sql('TRUNCATE TABLE PAYMENT_FRAUD_WB.ML.MODEL_EVAL').collect()
    session.sql('INSERT INTO PAYMENT_FRAUD_WB.ML.MODEL_EVAL SELECT ?, PARSE_JSON(?), CURRENT_TIMESTAMP()::TIMESTAMP_NTZ',
                params=['V1', json.dumps(payload)]).collect()
    return {'auc': round(auc, 4), 'avgPrecision': round(ap, 4), 'trainRows': int(len(train))}
$$;

CALL TRAIN_MODEL();

-- --------------------------------------------------------------------------
-- 4. Batch scoring with the registered model (model.run in the warehouse). A
--    task runs it daily once resumed; real-time scoring would use Snowpipe
--    Streaming and model serving on Snowpark Container Services (not built here).
-- --------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS SCORES (TXN_ID STRING, TS TIMESTAMP_NTZ, SCORE FLOAT, SCORED_AT TIMESTAMP_NTZ);

CREATE OR REPLACE PROCEDURE SCORE_TRANSACTIONS()
RETURNS VARIANT
LANGUAGE PYTHON
RUNTIME_VERSION = '3.11'
PACKAGES = ('snowflake-snowpark-python', 'snowflake-ml-python')
HANDLER = 'run'
AS
$$
from snowflake.ml.registry import Registry
import snowflake.snowpark.functions as F
COLS = ['AMOUNT', 'IS_CNP', 'IS_P2P', 'HOUR_OF_DAY', 'CARD_TXN_1H', 'ACCT_AMT_24H', 'AMT_TO_AVG', 'NEW_DEVICE',
        'DEVICE_ACCOUNTS', 'MERCH_SMALL_1H', 'KM_FROM_PREV', 'KMH_FROM_PREV', 'FIRST_TIME_PAYEE', 'PW_RESET_24H']
def run(session):
    mv = Registry(session=session, database_name='PAYMENT_FRAUD_WB', schema_name='ML').get_model('FRAUD_XGB').version('V1')
    df = session.sql("SELECT TXN_ID, TS, " + ", ".join(COLS) +
                     " FROM PAYMENT_FRAUD_WB.FEATURES.\"TXN_VELOCITY$1\" WHERE TS >= '2026-11-01'")
    out = mv.run(df, function_name='predict_proba')
    out.select('TXN_ID', 'TS', out['"output_feature_1"'].cast('FLOAT').alias('SCORE')) \
       .with_column('SCORED_AT', F.current_timestamp().cast('TIMESTAMP_NTZ')) \
       .write.save_as_table('PAYMENT_FRAUD_WB.ML.SCORES', mode='overwrite')
    return session.sql('SELECT COUNT(*) AS N FROM PAYMENT_FRAUD_WB.ML.SCORES').collect()[0]['N']
$$;

CALL SCORE_TRANSACTIONS();

CREATE OR REPLACE TASK SCORE_TRANSACTIONS_TASK
  WAREHOUSE = PAYMENT_FRAUD_WB_WH SCHEDULE = 'USING CRON 0 6 * * * UTC'
  COMMENT = 'Daily batch scoring with FRAUD_XGB. Created suspended; ALTER TASK ... RESUME to schedule it.'
  AS CALL PAYMENT_FRAUD_WB.ML.SCORE_TRANSACTIONS();

-- Precision / recall / alert volume at each threshold, on labeled November data.
CREATE OR REPLACE TABLE PR_CURVE AS
WITH s AS (SELECT s.SCORE, IFF(c.TXN_ID IS NULL, 0, 1) AS Y FROM SCORES s LEFT JOIN PAYMENT_FRAUD_WB.RAW.CHARGEBACKS c ON c.TXN_ID = s.TXN_ID),
th AS (SELECT ROUND(SEQ4() * 0.05 + 0.05, 2) AS T FROM TABLE(GENERATOR(ROWCOUNT => 19)))
SELECT th.T AS THRESHOLD, COUNT_IF(s.SCORE >= th.T) AS ALERTS, COUNT_IF(s.SCORE >= th.T AND s.Y = 1) AS TRUE_POS,
       ROUND(COUNT_IF(s.SCORE >= th.T AND s.Y = 1) / NULLIF(COUNT_IF(s.SCORE >= th.T), 0), 4) AS PRECISION,
       ROUND(COUNT_IF(s.SCORE >= th.T AND s.Y = 1) / NULLIF(SUM(s.Y), 0), 4) AS RECALL,
       ROUND(COUNT_IF(s.SCORE >= th.T) / 14, 1) AS ALERTS_PER_DAY
FROM th CROSS JOIN s GROUP BY th.T ORDER BY th.T;

-- --------------------------------------------------------------------------
-- 5. Alerts: the model at threshold 0.5 plus three rules (card testing,
--    impossible travel via ST_DISTANCE, shared device). Reason codes come from
--    the feature values, so analysts can see why a payment was flagged.
-- --------------------------------------------------------------------------
USE SCHEMA PAYMENT_FRAUD_WB.APP;
CREATE OR REPLACE TABLE ALERTS AS
WITH f AS (
  SELECT v.*, s.SCORE, t.ACCOUNT_ID, t.CARD_ID, t.CHANNEL, t.MERCHANT_ID, t.COUNTERPARTY_ACCOUNT_ID, t.DEVICE_ID, t.IP_ID, t.LAT, t.LON
  FROM PAYMENT_FRAUD_WB.ML.SCORES s
  JOIN PAYMENT_FRAUD_WB.FEATURES."TXN_VELOCITY$1" v ON v.TXN_ID = s.TXN_ID
  JOIN PAYMENT_FRAUD_WB.RAW.TRANSACTIONS t ON t.TXN_ID = s.TXN_ID),
r AS (
  SELECT f.*, ARRAY_COMPACT(ARRAY_CONSTRUCT(
      IFF(MERCH_SMALL_1H >= 25 AND AMOUNT < 3, 'CARD_TESTING', NULL),
      IFF(KM_FROM_PREV > 500 AND KMH_FROM_PREV > 900, 'IMPOSSIBLE_TRAVEL', NULL),
      IFF(DEVICE_ACCOUNTS >= 5, 'SHARED_DEVICE', NULL))) AS RULES,
    ARRAY_COMPACT(ARRAY_CONSTRUCT(
      IFF(NEW_DEVICE = 1, 'NEW_DEVICE', NULL), IFF(PW_RESET_24H = 1, 'RECENT_PASSWORD_RESET', NULL),
      IFF(FIRST_TIME_PAYEE = 1 AND IS_P2P = 1, 'FIRST_TIME_PAYEE', NULL), IFF(AMT_TO_AVG >= 4, 'AMOUNT_SPIKE', NULL),
      IFF(CARD_TXN_1H >= 4, 'CARD_VELOCITY', NULL), IFF(HOUR_OF_DAY < 5, 'NIGHT_TIME', NULL),
      IFF(MERCH_SMALL_1H >= 25, 'MERCHANT_BURST', NULL), IFF(KMH_FROM_PREV > 900 AND KM_FROM_PREV > 500, 'GEO_VELOCITY', NULL),
      IFF(DEVICE_ACCOUNTS >= 5, 'DEVICE_SHARED_BY_ACCOUNTS', NULL))) AS REASON_CODES
  FROM f)
SELECT 'AL' || SUBSTR(TXN_ID, 2) AS ALERT_ID, TXN_ID, TS AS CREATED_TS, ACCOUNT_ID, CARD_ID, CHANNEL, MERCHANT_ID,
       COUNTERPARTY_ACCOUNT_ID, DEVICE_ID, IP_ID, AMOUNT, LAT, LON, ROUND(SCORE, 4) AS SCORE, RULES, REASON_CODES,
       CASE WHEN SCORE >= 0.9 OR ARRAY_SIZE(RULES) > 0 THEN 'HIGH' WHEN SCORE >= 0.7 THEN 'MEDIUM' ELSE 'LOW' END AS PRIORITY,
       DATEADD(HOUR, CASE WHEN SCORE >= 0.9 OR ARRAY_SIZE(RULES) > 0 THEN 4 WHEN SCORE >= 0.7 THEN 12 ELSE 24 END, TS) AS SLA_DUE_TS
FROM r WHERE SCORE >= 0.5 OR ARRAY_SIZE(RULES) > 0;

-- Older alerts are already worked: their disposition follows the labels. Alerts
-- from 2026-11-13 on, and every alert on a story account, are open in the queue.
ALTER TABLE ALERTS ADD COLUMN STATUS STRING;
UPDATE ALERTS a SET STATUS = CASE
  WHEN a.CREATED_TS >= '2026-11-13' OR a.ACCOUNT_ID IN ('A012345', 'A034560') OR a.MERCHANT_ID IN ('M02001', 'M02002')
       OR a.ACCOUNT_ID LIKE 'A0600%' AND a.ACCOUNT_ID > 'A060000' THEN 'OPEN'
  WHEN EXISTS (SELECT 1 FROM PAYMENT_FRAUD_WB.RAW.CHARGEBACKS c WHERE c.TXN_ID = a.TXN_ID) THEN 'CONFIRMED_FRAUD'
  ELSE 'FALSE_POSITIVE' END;
-- The promo cluster was reviewed the same day and closed as false positives.
UPDATE ALERTS SET STATUS = 'FALSE_POSITIVE' WHERE MERCHANT_ID = 'M02002';

CREATE TABLE IF NOT EXISTS ALERT_ACTIONS (ALERT_ID STRING, ACTION STRING, NOTE STRING, ACTED_BY STRING, ACTED_AT TIMESTAMP_NTZ);
CREATE OR REPLACE TABLE CASES AS
SELECT 'CASE-' || ACCOUNT_ID AS CASE_ID, ACCOUNT_ID, MIN(CREATED_TS) AS OPENED_TS, COUNT(*) AS ALERTS, SUM(AMOUNT) AS EXPOSURE, MAX(SCORE) AS MAX_SCORE
FROM ALERTS WHERE STATUS = 'OPEN' GROUP BY ACCOUNT_ID;

-- Link graph edges (account - device, account - IP) and connected components
-- over shared devices and IPs, found with a recursive CTE.
CREATE OR REPLACE TABLE LINK_EDGES AS
SELECT DISTINCT ACCOUNT_ID, 'DEVICE' AS NODE_TYPE, DEVICE_ID AS NODE_ID FROM PAYMENT_FRAUD_WB.RAW.TRANSACTIONS WHERE DEVICE_ID IS NOT NULL
UNION SELECT DISTINCT ACCOUNT_ID, 'DEVICE', DEVICE_ID FROM PAYMENT_FRAUD_WB.RAW.ACCOUNT_EVENTS
UNION SELECT DISTINCT ACCOUNT_ID, 'IP', IP_ID FROM PAYMENT_FRAUD_WB.RAW.TRANSACTIONS WHERE IP_ID IS NOT NULL
UNION SELECT DISTINCT ACCOUNT_ID, 'IP', IP_ID FROM PAYMENT_FRAUD_WB.RAW.ACCOUNT_EVENTS;

CREATE OR REPLACE TABLE LINK_CLUSTERS AS
WITH RECURSIVE shared AS (
  SELECT e.* FROM LINK_EDGES e JOIN (SELECT NODE_ID FROM LINK_EDGES GROUP BY NODE_ID HAVING COUNT(DISTINCT ACCOUNT_ID) BETWEEN 2 AND 50) n USING (NODE_ID)),
pairs AS (SELECT DISTINCT a.ACCOUNT_ID AS SRC, b.ACCOUNT_ID AS DST FROM shared a JOIN shared b ON a.NODE_ID = b.NODE_ID AND a.ACCOUNT_ID <> b.ACCOUNT_ID),
walk (ROOT, ACCOUNT_ID, DEPTH) AS (
  SELECT SRC, SRC, 0 FROM (SELECT DISTINCT SRC FROM pairs)
  UNION ALL
  SELECT w.ROOT, p.DST, w.DEPTH + 1 FROM walk w JOIN pairs p ON p.SRC = w.ACCOUNT_ID WHERE w.DEPTH < 4)
SELECT ROOT AS ACCOUNT_ID, MIN(ACCOUNT_ID) AS CLUSTER_ID, COUNT(DISTINCT ACCOUNT_ID) AS CLUSTER_SIZE FROM walk GROUP BY ROOT;

-- Views the app reads.
CREATE OR REPLACE VIEW DAILY_KPIS AS
SELECT t.TS::DATE AS DAY, COUNT(*) AS TXNS, COUNT(c.TXN_ID) AS FRAUD_TXNS,
       ROUND(COUNT(c.TXN_ID) / COUNT(*) * 10000, 2) AS FRAUD_BPS, ROUND(SUM(c.AMOUNT), 2) AS FRAUD_LOSS,
       ROUND(SUM(t.AMOUNT), 2) AS VOLUME
FROM PAYMENT_FRAUD_WB.RAW.TRANSACTIONS t LEFT JOIN PAYMENT_FRAUD_WB.RAW.CHARGEBACKS c ON c.TXN_ID = t.TXN_ID
GROUP BY 1;

-- Map: confirmed fraud aggregated to H3 resolution-3 cells.
CREATE OR REPLACE VIEW FRAUD_HEX AS
SELECT H3_LATLNG_TO_CELL_STRING(t.LAT, t.LON, 3) AS H3_CELL,
       ST_Y(H3_CELL_TO_POINT(H3_LATLNG_TO_CELL_STRING(t.LAT, t.LON, 3))) AS LAT,
       ST_X(H3_CELL_TO_POINT(H3_LATLNG_TO_CELL_STRING(t.LAT, t.LON, 3))) AS LON,
       COUNT(*) AS FRAUD_TXNS, ROUND(SUM(c.AMOUNT), 2) AS FRAUD_LOSS
FROM PAYMENT_FRAUD_WB.RAW.TRANSACTIONS t JOIN PAYMENT_FRAUD_WB.RAW.CHARGEBACKS c ON c.TXN_ID = t.TXN_ID
WHERE t.TS >= '2026-11-01' GROUP BY 1, 2, 3;

CREATE OR REPLACE VIEW ALERTS_ENRICHED AS
SELECT a.*, m.MERCHANT_NAME, m.CATEGORY AS MERCHANT_CATEGORY, m.MCC, cu.FULL_NAME AS CUSTOMER_NAME,
       COALESCE(lc.CLUSTER_SIZE, 1) AS LINKED_ACCOUNTS,
       IFF(ARRAY_CONTAINS('CARD_TESTING'::VARIANT, a.RULES), 'Yes', 'No') AS CARD_TESTING_FLAG,
       IFF(ARRAY_CONTAINS('IMPOSSIBLE_TRAVEL'::VARIANT, a.RULES), 'Yes', 'No') AS IMPOSSIBLE_TRAVEL_FLAG,
       IFF(ARRAY_CONTAINS('SHARED_DEVICE'::VARIANT, a.RULES), 'Yes', 'No') AS SHARED_DEVICE_FLAG,
       ARRAY_TO_STRING(a.REASON_CODES, ', ') AS REASONS,
       IFF(EXISTS (SELECT 1 FROM PAYMENT_FRAUD_WB.RAW.CHARGEBACKS c WHERE c.TXN_ID = a.TXN_ID), 'Fraud', 'Not fraud') AS LABEL
FROM ALERTS a
LEFT JOIN PAYMENT_FRAUD_WB.RAW.MERCHANTS m ON m.MERCHANT_ID = a.MERCHANT_ID
LEFT JOIN PAYMENT_FRAUD_WB.RAW.ACCOUNTS ac ON ac.ACCOUNT_ID = a.ACCOUNT_ID
LEFT JOIN PAYMENT_FRAUD_WB.RAW.CUSTOMERS cu ON cu.CUSTOMER_ID = ac.CUSTOMER_ID
LEFT JOIN LINK_CLUSTERS lc ON lc.ACCOUNT_ID = a.ACCOUNT_ID;

-- --------------------------------------------------------------------------
-- 6. Semantic view and Cortex Agent for the Ask screen
-- --------------------------------------------------------------------------
CREATE OR REPLACE SEMANTIC VIEW ALERTS_SV
  TABLES (
    ALERTS AS ALERTS_ENRICHED PRIMARY KEY (ALERT_ID)
      COMMENT = 'Fraud alerts raised by the XGBoost model (score >= 0.5) or by rules, 2026-11-01 to 2026-11-14'
  )
  DIMENSIONS (
    ALERTS.ALERT_DATE AS CREATED_TS::DATE COMMENT = 'Date the alert was raised',
    ALERTS.MERCHANT AS MERCHANT_NAME COMMENT = 'Merchant name (null for P2P transfers)',
    ALERTS.MERCHANT_CATEGORY AS MERCHANT_CATEGORY COMMENT = 'Merchant category, for example Digital goods or Apparel',
    ALERTS.CHANNEL AS CHANNEL COMMENT = 'CARD_PRESENT, CARD_NOT_PRESENT, or P2P' SAMPLE_VALUES ('CARD_PRESENT', 'CARD_NOT_PRESENT', 'P2P'),
    ALERTS.STATUS AS STATUS COMMENT = 'OPEN, CONFIRMED_FRAUD, or FALSE_POSITIVE' SAMPLE_VALUES ('OPEN', 'CONFIRMED_FRAUD', 'FALSE_POSITIVE'),
    ALERTS.PRIORITY AS PRIORITY COMMENT = 'HIGH, MEDIUM, or LOW',
    ALERTS.ACCOUNT AS ACCOUNT_ID COMMENT = 'Account that made the payment',
    ALERTS.CUSTOMER AS CUSTOMER_NAME COMMENT = 'Customer name (synthetic)',
    ALERTS.CARD_TESTING AS CARD_TESTING_FLAG COMMENT = 'Yes when the card-testing rule fired: many tiny card-not-present authorizations at one merchant within an hour' SAMPLE_VALUES ('Yes', 'No'),
    ALERTS.IMPOSSIBLE_TRAVEL AS IMPOSSIBLE_TRAVEL_FLAG COMMENT = 'Yes when two swipes on one card imply travel faster than 900 km/h over 500 km' SAMPLE_VALUES ('Yes', 'No'),
    ALERTS.SHARED_DEVICE AS SHARED_DEVICE_FLAG COMMENT = 'Yes when the device is used by five or more accounts (possible mule ring)' SAMPLE_VALUES ('Yes', 'No'),
    ALERTS.REASONS AS REASONS COMMENT = 'Comma-separated reason codes',
    ALERTS.LABEL AS LABEL COMMENT = 'Fraud if a chargeback or issuer confirmation exists, otherwise Not fraud' SAMPLE_VALUES ('Fraud', 'Not fraud')
  )
  METRICS (
    ALERTS.ALERT_COUNT AS COUNT(ALERT_ID) COMMENT = 'Number of alerts',
    ALERTS.ALERTED_AMOUNT AS SUM(AMOUNT) COMMENT = 'Total payment amount in USD across alerts',
    ALERTS.AVG_SCORE AS AVG(SCORE) COMMENT = 'Average model score (0 to 1)',
    ALERTS.ACCOUNTS AS COUNT(DISTINCT ACCOUNT_ID) COMMENT = 'Distinct accounts with alerts',
    ALERTS.CARDS AS COUNT(DISTINCT CARD_ID) COMMENT = 'Distinct cards with alerts'
  )
  COMMENT = 'Synthetic payment fraud alerts. "This week" means 2026-11-08 to 2026-11-14; now is 2026-11-15.';

CREATE OR REPLACE AGENT FRAUD_AGENT
  COMMENT = 'Fraud operations assistant over synthetic alerts'
  FROM SPECIFICATION $$
  models:
    orchestration: auto
  orchestration:
    budget:
      seconds: 60
      tokens: 16000
  instructions:
    response: |
      You answer fraud analysts' questions about payment fraud alerts. Always query the data before answering.
      Be concise: lead with the answer (names and numbers), then one or two sentences of context.
      Today is 2026-11-15 in this data set; "this week" means 2026-11-08 to 2026-11-14.
      The data is synthetic. Never speculate about individual customers beyond the data.
    orchestration: Use the Analyst tool for every data question.
    sample_questions:
      - question: Which merchants had card-testing patterns this week?
      - question: How many open high-priority alerts are there by channel?
  tools:
    - tool_spec:
        type: cortex_analyst_text_to_sql
        name: Analyst
        description: Payment fraud alerts with merchants, channels, rules, reason codes, status, and labels
  tool_resources:
    Analyst:
      semantic_view: PAYMENT_FRAUD_WB.APP.ALERTS_SV
      execution_environment:
        type: warehouse
        warehouse: PAYMENT_FRAUD_WB_WH
  $$;

-- --------------------------------------------------------------------------
-- 7. Quick check: the five stories
-- --------------------------------------------------------------------------
SELECT 'card testing' AS STORY, COUNT(*) AS ALERTS FROM ALERTS WHERE ARRAY_CONTAINS('CARD_TESTING'::VARIANT, RULES)
UNION ALL SELECT 'account takeover', COUNT(*) FROM ALERTS WHERE ACCOUNT_ID = 'A012345'
UNION ALL SELECT 'mule ring accounts', COUNT(DISTINCT ACCOUNT_ID) FROM LINK_CLUSTERS WHERE CLUSTER_ID IN (SELECT CLUSTER_ID FROM LINK_CLUSTERS WHERE ACCOUNT_ID = 'A060001')
UNION ALL SELECT 'impossible travel', COUNT(*) FROM ALERTS WHERE ACCOUNT_ID = 'A034560' AND ARRAY_CONTAINS('IMPOSSIBLE_TRAVEL'::VARIANT, RULES)
UNION ALL SELECT 'promo false positives', COUNT(*) FROM ALERTS WHERE MERCHANT_ID = 'M02002';
