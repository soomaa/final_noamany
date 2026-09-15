import { api, escapeHtml, money } from './portal.js';

const params = new URLSearchParams(location.search);
const packageId = Number(params.get('packageId'));
let selectedBranch = Number(params.get('branchId'));
const state = document.querySelector('#checkoutState');
const form = document.querySelector('#membershipCheckoutForm');
const branch = document.querySelector('#checkoutBranch');
const method = document.querySelector('#paymentMethod');
const destination = document.querySelector('#paymentDestination');
const button = form.querySelector('[type="submit"]');
let methods = [];
let branchRevision = 0;
let submitting = false;

function fail(message) {
  state.hidden = false;
  state.classList.add('error');
  state.textContent = message;
}

async function loadBranch() {
  const revision = ++branchRevision;
  const branchId = selectedBranch;
  methods = [];
  method.disabled = true;
  button.disabled = true;
  destination.textContent = '';
  state.hidden = false;
  state.classList.remove('error');
  state.textContent = 'جاري تحديث الباقة وطرق الدفع…';
  try {
    const [pkg, availableMethods] = await Promise.all([
      api(`/memberships/${packageId}?branchId=${branchId}`),
      api(`/payment-methods?branchId=${branchId}`),
    ]);
    if (revision !== branchRevision) return;
    methods = availableMethods;
    document.querySelector('#packageSummary').textContent = `${pkg.name} — ${money(pkg.price)}`;
    document.querySelector('#backToPackage').href = `/memberships/${packageId}?branchId=${branchId}`;
    method.innerHTML = methods.length ? methods.map((item) => `<option value="${item.id}">${escapeHtml(item.name)}</option>`).join('') : '<option value="">لا توجد طريقة دفع متاحة</option>';
    method.disabled = !methods.length;
    button.disabled = !methods.length;
    method.onchange = () => {
      const item = methods.find((entry) => Number(entry.id) === Number(method.value));
      destination.textContent = item ? `${item.destination || ''}${item.account ? ` — ${item.account}` : ''}` : 'لا توجد طريقة دفع متاحة لهذا الفرع';
    };
    method.onchange();
    state.hidden = true;
  } catch (error) {
    if (revision === branchRevision) fail(error.message);
  }
}

async function initialize() {
  if (!Number.isInteger(packageId) || packageId < 1 || !Number.isInteger(selectedBranch) || selectedBranch < 1) {
    fail('اختر باقة وفرعًا صحيحين من صفحة العضويات.');
    return;
  }
  try {
    const home = await api('/home');
    const branches = home.branches || [];
    if (!branches.some((item) => Number(item.id) === selectedBranch)) throw new Error('الفرع المطلوب غير متاح. ارجع إلى صفحة العضويات واختر فرعًا متاحًا.');
    branch.innerHTML = branches.map((item) => `<option value="${item.id}" ${Number(item.id) === selectedBranch ? 'selected' : ''}>${escapeHtml(item.name || `فرع ${item.id}`)}</option>`).join('');
    branch.onchange = async () => {
      if (submitting) return;
      selectedBranch = Number(branch.value);
      await loadBranch();
    };
    await loadBranch();
    form.hidden = false;
  } catch (error) { fail(error.message); }
}

form.addEventListener('submit', async (event) => {
  event.preventDefault();
  if (submitting || button.disabled || !form.reportValidity() || !methods.length) return;
  const proof = form.elements.proof.files?.[0];
  if (!proof || !['application/pdf', 'image/png', 'image/jpeg'].includes(proof.type)) { fail('اختر إثبات تحويل بصيغة PDF أو PNG أو JPG.'); return; }
  if (proof.size > 5 * 1024 * 1024) { fail('حجم إثبات التحويل يجب ألا يتجاوز 5 ميجابايت.'); return; }
  const data = new FormData(form);
  data.set('packageId', String(packageId));
  data.set('branchId', String(selectedBranch));
  submitting = true;
  button.disabled = true;
  branch.disabled = true;
  button.textContent = 'جاري إرسال الطلب…';
  try {
    const result = await api('/online-memberships', { method: 'POST', body: data });
    state.classList.remove('error');
    state.textContent = `${result.message} رقم الطلب: ${result.id}`;
    state.hidden = false;
    form.hidden = true;
  } catch (error) { fail(error.message); }
  finally {
    submitting = false;
    branch.disabled = false;
    button.disabled = !methods.length;
    button.textContent = 'إرسال طلب الاشتراك';
  }
});

initialize();
