export async function createFastLegacyMaps(tx, sourceKey) {
  const pairs = [
    ['tmp_customer_member_map','tbl_members','club_members'],
    ['tmp_customer_orphan_map','legacy_orphan_members','club_members'],
    ['tmp_customer_type_map','tbl_subscription_settings','club_subscription_types'],
    ['tmp_customer_sub_map','tbl_subscription_members','club_subscriptions'],
    ['tmp_customer_locker_map','tbl_locker_number','club_lockers'],
  ];
  for (const [name, legacy, target] of pairs) {
    await tx.$executeRawUnsafe(`DROP TEMPORARY TABLE IF EXISTS ${name}`);
    await tx.$executeRawUnsafe(`CREATE TEMPORARY TABLE ${name} (legacy_id INT PRIMARY KEY,target_id INT) ENGINE=MEMORY`);
    await tx.$executeRawUnsafe(`INSERT INTO ${name} SELECT CAST(legacy_id AS UNSIGNED),target_id FROM legacy_record_mappings WHERE source_key=? AND legacy_table=? AND target_table=?`,sourceKey,legacy,target);
  }
}
