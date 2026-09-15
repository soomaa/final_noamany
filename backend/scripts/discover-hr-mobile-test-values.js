const baseUrl = 'https://final.noamanycenter.com';
const username = process.env.HR_ONLINE_USERNAME;
const password = process.env.HR_ONLINE_PASSWORD;

async function json(url, token, options = {}) {
  const response = await fetch(`${baseUrl}${url}`, {
    ...options,
    headers: { Accept: 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(options.headers ?? {}) },
  });
  return { status: response.status, data: await response.json().catch(() => null) };
}

async function main() {
  if (!username || !password) throw new Error('HR_ONLINE_USERNAME and HR_ONLINE_PASSWORD are required');
  const login = await json('/api/mobile/login', '', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username, password }) });
  if (!login.data?.accessToken) throw new Error(`Login failed: HTTP ${login.status}`);
  const token = login.data.accessToken;
  const [profile, leaveTypes, leaves, permissions, loans, activities, laws] = await Promise.all([
    json('/api/mobile/profile', token), json('/api/mobile/leaves/types', token), json('/api/mobile/leaves?mode=sader&page=1&pageSize=20', token), json('/api/mobile/permissions?mode=sader&page=1&pageSize=20', token), json('/api/mobile/loans?mode=sader&page=1&perPage=20', token), json('/api/mobile/activities?page=1&perPage=20', token), json('/api/mobile/legal-files?page=1&perPage=20', token),
  ]);
  console.log(JSON.stringify({ profile, leaveTypes, leaves, permissions, loans, activities, laws }, null, 2));
}

main().catch((error) => { console.error(error.message); process.exitCode = 1; });
