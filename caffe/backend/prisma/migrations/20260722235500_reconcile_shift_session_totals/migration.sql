-- Rebuild stored shift totals from explicit source links. This repairs legacy
-- sessions that were previously closed using an unsafe configured-time fallback.
CREATE TEMPORARY TABLE `tmp_shift_session_totals` AS
SELECT
  `session`.`id` AS `session_id`,
  ROUND(COALESCE(`pos`.`sales_total`, 0) + COALESCE(`booking`.`sales_total`, 0), 2) AS `sales_total`,
  ROUND(COALESCE(`pos`.`cash_total`, 0) + COALESCE(`booking`.`cash_total`, 0), 2) AS `cash_total`,
  ROUND(COALESCE(`pos`.`card_total`, 0) + COALESCE(`booking`.`card_total`, 0), 2) AS `card_total`,
  ROUND(COALESCE(`pos`.`wallet_total`, 0) + COALESCE(`booking`.`wallet_total`, 0), 2) AS `wallet_total`,
  ROUND(COALESCE(`pos`.`transfer_total`, 0) + COALESCE(`booking`.`transfer_total`, 0), 2) AS `transfer_total`,
  ROUND(COALESCE(`pos`.`discount_total`, 0), 2) AS `discount_total`,
  ROUND(COALESCE(`pos`.`tax_total`, 0), 2) AS `tax_total`,
  COALESCE(`pos`.`transaction_count`, 0) + COALESCE(`booking`.`transaction_count`, 0) AS `transaction_count`,
  ROUND(
    `session`.`opening_balance`
    + COALESCE(`pos`.`cash_total`, 0)
    + COALESCE(`booking`.`cash_total`, 0)
    + COALESCE(`drawer`.`signed_total`, 0),
    2
  ) AS `expected_balance`
FROM `sales_shift_sessions` AS `session`
LEFT JOIN (
  SELECT
    `sale`.`shift_session_id` AS `session_id`,
    SUM(`sale`.`total_amount`) AS `sales_total`,
    SUM(
      CASE
        WHEN `sale`.`payment_method` = 'cash' THEN `sale`.`collected_amount`
        WHEN `sale`.`payment_method` = 'mixed' THEN COALESCE(`payment`.`cash_total`, 0)
        ELSE 0
      END
    ) AS `cash_total`,
    SUM(
      CASE
        WHEN `sale`.`payment_method` = 'card' THEN `sale`.`collected_amount`
        WHEN `sale`.`payment_method` = 'mixed' THEN COALESCE(`payment`.`card_total`, 0)
        ELSE 0
      END
    ) AS `card_total`,
    SUM(
      CASE
        WHEN `sale`.`payment_method` = 'wallet' THEN `sale`.`collected_amount`
        WHEN `sale`.`payment_method` = 'mixed' THEN COALESCE(`payment`.`wallet_total`, 0)
        ELSE 0
      END
    ) AS `wallet_total`,
    SUM(
      CASE
        WHEN `sale`.`payment_method` = 'transfer' THEN `sale`.`collected_amount`
        WHEN `sale`.`payment_method` = 'mixed' THEN COALESCE(`payment`.`transfer_total`, 0)
        ELSE 0
      END
    ) AS `transfer_total`,
    SUM(`sale`.`discount_amount`) AS `discount_total`,
    SUM(`sale`.`tax_amount`) AS `tax_total`,
    COUNT(*) AS `transaction_count`
  FROM `sales_quick_sales` AS `sale`
  LEFT JOIN (
    SELECT
      `quick_sale_id`,
      SUM(CASE WHEN `method` = 'cash' THEN `amount` ELSE 0 END) AS `cash_total`,
      SUM(CASE WHEN `method` = 'card' THEN `amount` ELSE 0 END) AS `card_total`,
      SUM(CASE WHEN `method` = 'wallet' THEN `amount` ELSE 0 END) AS `wallet_total`,
      SUM(CASE WHEN `method` = 'transfer' THEN `amount` ELSE 0 END) AS `transfer_total`
    FROM `sales_pos_payments`
    GROUP BY `quick_sale_id`
  ) AS `payment` ON `payment`.`quick_sale_id` = `sale`.`id`
  WHERE `sale`.`status` = 'completed'
    AND `sale`.`shift_session_id` IS NOT NULL
  GROUP BY `sale`.`shift_session_id`
) AS `pos` ON `pos`.`session_id` = `session`.`id`
LEFT JOIN (
  SELECT
    `shift_session_id` AS `session_id`,
    SUM(CASE WHEN `kind` = 'refund' THEN -`amount` ELSE `amount` END) AS `sales_total`,
    SUM(CASE WHEN `method` = 'cash' THEN (CASE WHEN `kind` = 'refund' THEN -`amount` ELSE `amount` END) ELSE 0 END) AS `cash_total`,
    SUM(CASE WHEN `method` = 'card' THEN (CASE WHEN `kind` = 'refund' THEN -`amount` ELSE `amount` END) ELSE 0 END) AS `card_total`,
    SUM(CASE WHEN `method` = 'wallet' THEN (CASE WHEN `kind` = 'refund' THEN -`amount` ELSE `amount` END) ELSE 0 END) AS `wallet_total`,
    SUM(CASE WHEN `method` = 'transfer' THEN (CASE WHEN `kind` = 'refund' THEN -`amount` ELSE `amount` END) ELSE 0 END) AS `transfer_total`,
    COUNT(*) AS `transaction_count`
  FROM `sales_booking_payments`
  WHERE `status` = 'posted'
    AND `shift_session_id` IS NOT NULL
  GROUP BY `shift_session_id`
) AS `booking` ON `booking`.`session_id` = `session`.`id`
LEFT JOIN (
  SELECT
    `shift_session_id` AS `session_id`,
    SUM(CASE WHEN `direction` = 'in' THEN `amount` ELSE -`amount` END) AS `signed_total`
  FROM `sales_cash_drawer_transactions`
  WHERE `status` = 'posted'
    AND `movement_type` IN ('petty_expense', 'custody_issue', 'custody_return', 'adjustment')
  GROUP BY `shift_session_id`
) AS `drawer` ON `drawer`.`session_id` = `session`.`id`;

UPDATE `sales_shift_sessions` AS `session`
JOIN `tmp_shift_session_totals` AS `total` ON `total`.`session_id` = `session`.`id`
SET
  `session`.`total_sales` = `total`.`sales_total`,
  `session`.`total_cash` = `total`.`cash_total`,
  `session`.`total_card` = `total`.`card_total`,
  `session`.`total_wallet` = `total`.`wallet_total`,
  `session`.`total_transfer` = `total`.`transfer_total`,
  `session`.`total_discount` = `total`.`discount_total`,
  `session`.`total_tax` = `total`.`tax_total`,
  `session`.`transactions_count` = `total`.`transaction_count`,
  `session`.`expected_closing_balance` = `total`.`expected_balance`,
  `session`.`cash_difference` = CASE
    WHEN `session`.`closing_balance` IS NULL THEN NULL
    ELSE ROUND(`session`.`closing_balance` - `total`.`expected_balance`, 2)
  END;

DROP TEMPORARY TABLE `tmp_shift_session_totals`;

