-- 002_order_number_seq.sql
-- Dedicated sequence for concurrency-safe orderNumber generation
-- (replaces COUNT(*)-based numbering which collided under parallel inserts).
CREATE SEQUENCE IF NOT EXISTS order_number_seq;
