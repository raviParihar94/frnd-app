-- Phase 2: Razorpay-specific columns on transactions, for order/payment reconciliation.

ALTER TABLE transactions
  ADD COLUMN IF NOT EXISTS razorpay_order_id VARCHAR(100),
  ADD COLUMN IF NOT EXISTS razorpay_payment_id VARCHAR(100);

-- One transaction per Razorpay order; partial index so multiple NULLs (rows created
-- before an order exists, in theory) don't collide.
CREATE UNIQUE INDEX IF NOT EXISTS uq_transactions_razorpay_order_id
  ON transactions (razorpay_order_id)
  WHERE razorpay_order_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_transactions_razorpay_payment_id
  ON transactions (razorpay_payment_id);
