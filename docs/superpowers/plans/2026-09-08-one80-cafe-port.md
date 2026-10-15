# ONE80 café feature port

User approved all current ONE MILLION café updates and a slightly larger transparent ONE80 receipt logo. Preserve ONE80 gym/member/HR modules, data, credentials, native printing and finance GL. Work on the named saved project; source backup is /tmp/one80-cafe-port/one80-before-port.tar.gz.

- [x] Compare source/target and back up source code (no DB access).
- [x] Merge POS UI, keypad, employee settings, compact editable review and payment; retain member lookup/scanner.
- [x] Merge daily allowance, draft/finalization/refund, handover and printing. Retain richer ONE80 settlement logic.
- [x] Integrate finance register projections without duplicate legacy quick_sale rows or duplicate GL posting; preserve non-café finance sources.
- [x] Add cafe dashboard as its own route; keep existing HR dashboard.
- [x] Integrate salary preparation/approval with existing HR workflow to avoid parallel double payment.
- [x] Package only required additive schemas, run tests and build, inspect tablet/mobile and 58/80mm receipts.
- [x] Produce data-free ONE80 archive and server command; do not deploy live.
