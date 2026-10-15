// One-shot, read-only capture. Run in the browser console while the affected POS
// page is open on one80.alatheertech.com. It reads the visible stock section and
// makes one authenticated GET as the currently signed-in user. No token/cookie is
// read or printed. It does not refresh the UI or change inventory.
// This captures the present comparison; it cannot recover a past screen.
(async () => {
  if (location.hostname !== 'one80.alatheertech.com') {
    throw new Error('افتح صفحة POS على one80.alatheertech.com أولًا');
  }
  const section = document.querySelector('section[aria-label="متابعة المخزون في الوردية"]');
  const readVisible = () => section ? section.innerText.trim().slice(0, 5000) : null;
  const report = {
    capturedAtClientUtc: new Date().toISOString(),
    queriedBranchId: 1,
    interpretation: 'Present visible section versus a fresh branch-1 API read; not a historical response. A concurrent sale may change the balance between the two readings.',
    sectionFound: Boolean(section),
    visibleBefore: readVisible(),
    pageVisibility: document.visibilityState,
    api: null,
    visibleAfter: null,
  };
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 10000);
  try {
    const response = await fetch('/api/pos/stock-watch?branchId=1', {
      method: 'GET', credentials: 'same-origin', cache: 'no-store',
      redirect: 'error', signal: controller.signal,
    });
    report.api = { status: response.status, serverDate: response.headers.get('date'),
      requestId: response.headers.get('x-request-id'), cacheControl: response.headers.get('cache-control') };
    if (response.ok && response.headers.get('content-type')?.includes('application/json')) {
      const body = await response.json();
      const water = Array.isArray(body.items) ? body.items.find(item => item.productId === 36) : null;
      report.api.since = body.since;
      report.api.shiftId = body.shift?.id ?? null;
      report.api.water = water ? {
        productId: water.productId, balanceNow: water.balanceNow,
        balanceAtShiftStart: water.balanceAtShiftStart, soldThisShift: water.soldThisShift,
        returnedThisShift: water.returnedThisShift, otherThisShift: water.otherThisShift,
      } : null;
    }
  } catch (error) {
    report.api = { errorName: error.name };
  } finally {
    clearTimeout(timer);
    report.visibleAfter = readVisible();
    console.log('ONE80_POS_READ_ONLY_CAPTURE\n' + JSON.stringify(report, null, 2));
  }
})();
