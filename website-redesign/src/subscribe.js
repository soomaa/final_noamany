import './font.css';
import { api, assetUrl, escapeHtml, money } from './portal.js';

const $ = (selector) => document.querySelector(selector);
const message = $('#subscriptionMessage');
const planId = Number(new URLSearchParams(location.search).get('plan'));
const detailsStep = $('[data-step="details"]');
const memberStep = $('[data-step="member"]');
const paymentStep = $('[data-step="payment"]');
const memberForm = $('#memberForm');
const paymentForm = $('#subscriptionForm');
const state = { plans: [], branches: [], plan: null, memberCode: '', customerName: '', paymentMethodId: '', methods: [], verified: false, busy: false };
let previewUrl;
let verificationVersion = 0;
let currentStep = 'details';

// A selected-plan link opens its details without showing the catalog while loading.
if (planId) $('#catalog').hidden = true;

function setMessage(text = '', kind = '') { message.textContent = text; message.dataset.kind = kind; }
function planIdOf(plan) { return Number(plan.subscriptionTypeId ?? plan.id); }
function setStep(step) {
  currentStep = step;
  detailsStep.hidden = step !== 'details'; memberStep.hidden = step !== 'methods'; paymentStep.hidden = step !== 'payment';
  ['details', 'methods', 'payment'].forEach((name) => $(`[data-indicator="${name}"]`).classList.toggle('active', name === step));
  window.scrollTo({ top: 0, behavior: 'smooth' });
}
function paintPlan(plan) {
  state.plan = { ...(state.plan?.id === planIdOf(plan) ? state.plan : {}), ...plan, id: planIdOf(plan), name: plan.name || plan.subscriptionTypeName || plan.title, price: Number(plan.price ?? plan.subscriptionPrice), days: Number(plan.days ?? plan.subscriptionDays) };
  $('#subscriptionTypeId').value = String(state.plan.id);
  $('#planName').textContent = state.plan.name;
  $('#planMeta').textContent = `${money(state.plan.price)} — ${state.plan.days} يوم`;
  $('#planDetails').hidden = false;
  const selected = state.plan;
  const branches = selected.allBranches ? 'كل الفروع' : state.branches.filter((branch) => selected.branchIds?.includes(branch.id)).map((branch) => branch.name).join(' • ');
  const features = planFeatures(selected);
  $('#planDetails').innerHTML = `<strong>${escapeHtml(selected.name)}</strong>${selected.subtitle ? `<p>${escapeHtml(selected.subtitle)}</p>` : ''}${selected.details ? `<p>${escapeHtml(selected.details)}</p>` : ''}<span>قيمة الاشتراك: ${money(selected.price)}</span><span>مدة الاشتراك: ${selected.days} يوم</span><p>الفروع المتاحة: ${escapeHtml(branches)}</p><ul>${features.map((feature) => `<li>✓ ${escapeHtml(feature)}</li>`).join('')}</ul>`;
}
function planFeatures(plan) {
  return [...new Set([plan.isLinkedToSessions && plan.sessionsCount ? `${plan.sessionsCount} جلسة` : '', plan.invitationsCount ? `${plan.invitationsCount} دعوات` : '', plan.inbodyCount ? `${plan.inbodyCount} قياسات InBody` : '', plan.includesSpa ? (plan.spaCount ? `${plan.spaCount} جلسات سبا` : 'يشمل السبا') : '', plan.forStudents ? 'اشتراك للطلاب' : '', ...String(plan.extraText || '').split(/\r?\n/)].filter(Boolean))];
}
function invalidateVerification() {
  verificationVersion++;
  state.verified = false; state.paymentMethodId = ''; state.methods = [];
  $('#continueToPayment').disabled = true;
}
function clearPreview() {
  if (previewUrl) URL.revokeObjectURL(previewUrl);
  previewUrl = undefined; $('#proofPreview').hidden = true; $('#proofPreview').removeAttribute('src');
}
function choosePlan(plan) {
  invalidateVerification(); $('#paymentMethods').replaceChildren(); paymentForm.reset(); clearPreview(); paintPlan(plan);
  $('#catalog').hidden = true; $('#checkout').hidden = false; setMessage(); setStep('details');
  $('#planName').focus({ preventScroll: true });
}
function renderCatalog() {
  const branch = Number($('#branchFilter').value);
  const search = $('#planSearch').value.trim().toLocaleLowerCase('ar');
  const plans = state.plans.filter((plan) => (!branch || plan.allBranches || plan.branchIds.includes(branch)) && plan.name.toLocaleLowerCase('ar').includes(search));
  $('#catalogPlans').innerHTML = plans.map((plan, index) => {
    const branches = plan.allBranches ? 'متاح في كل الفروع' : state.branches.filter((item) => plan.branchIds.includes(item.id)).map((item) => item.name).join(' • ');
    const features = planFeatures(plan);
    return `<article class="catalog-plan"><span class="catalog-plan-number">${String(index + 1).padStart(2, '0')} / MEMBERSHIP</span><h2>${escapeHtml(plan.name)}</h2><div class="catalog-plan-price">${money(plan.price)}</div><span class="catalog-plan-duration">مدة الاشتراك ${Number(plan.days)} يوم</span><p class="catalog-plan-branches">${escapeHtml(branches)}</p><ul>${features.map((feature) => `<li>✓ ${escapeHtml(feature)}</li>`).join('')}</ul><button type="button" class="btn primary" data-plan="${Number(plan.id)}">اشترك في الباقة ←</button></article>`;
  }).join('');
  $('#catalogEmpty').hidden = plans.length > 0; $('#planCount').textContent = `${plans.length} اشتراك متاح`;
}
async function loadCatalog() {
  $('#retryCatalog').hidden = true; $('#catalogPlans').setAttribute('aria-busy', 'true'); setMessage(planId ? 'جارٍ تحميل تفاصيل الاشتراك...' : '');
  try {
    const [catalog, marketing] = await Promise.all([api('/subscription-catalog'), api('/membership-plans').catch(() => [])]);
    state.plans = catalog.plans.map((plan) => ({ ...marketing.find((item) => planIdOf(item) === plan.id), ...plan })); state.branches = catalog.branches;
    $('#branchFilter').innerHTML = '<option value="">كل الفروع</option>' + state.branches.map((branch) => `<option value="${Number(branch.id)}">${escapeHtml(branch.name)}</option>`).join('');
    renderCatalog();
    if (planId) {
      const selected = state.plans.find((plan) => planIdOf(plan) === planId);
      if (selected) choosePlan(selected); else {
        $('#catalog').hidden = false;
        setMessage('الباقة المطلوبة غير متاحة حاليًا. اختار من الاشتراكات المتاحة.', 'error');
      }
    }
  } catch (error) { setMessage(error.message, 'error'); $('#planCount').textContent = 'تعذر تحميل الاشتراكات'; $('#retryCatalog').hidden = false; }
  finally { $('#catalogPlans').setAttribute('aria-busy', 'false'); }
}
function paymentDetails(method) {
  return `<b>${escapeHtml(method.name)}</b>${method.number ? `<small>رقم التحويل: <bdi>${escapeHtml(method.number)}</bdi></small>` : ''}${method.username ? `<small>الحساب: <bdi>${escapeHtml(method.username)}</bdi></small>` : ''}${method.description ? `<small>${escapeHtml(method.description)}</small>` : ''}`;
}
function paymentImage(method) {
  return method.image ? `<img class="payment-details-image" src="${escapeHtml(assetUrl(method.image))}" alt="بيانات ${escapeHtml(method.name)}" loading="lazy">` : '';
}
function renderPaymentMethods(methods) {
  const container = $('#paymentMethods'); state.methods = methods; state.paymentMethodId = ''; $('#continueToPayment').disabled = true;
  container.innerHTML = methods.length ? methods.map((method) => `<label class="payment-choice"><input type="radio" name="selectedPaymentMethod" value="${Number(method.id)}"><span>${paymentDetails(method)}</span>${paymentImage(method)}</label>`).join('') : '<p class="step-help">لا توجد طرق دفع متاحة حاليًا. يرجى التواصل مع الفرع.</p>';
  container.querySelectorAll('input').forEach((input) => input.addEventListener('change', () => { state.paymentMethodId = input.value; $('#continueToPayment').disabled = !state.verified; }));
}
$('#confirmSubscription').addEventListener('click', async () => {
  setStep('methods'); setMessage('جارٍ تحميل طرق الدفع...');
  const selectedPlanId = state.plan.id;
  try {
    const methods = await api('/payment-methods');
    if (selectedPlanId !== state.plan.id || currentStep !== 'methods' || state.verified) return;
    renderPaymentMethods(methods); setMessage();
  } catch (error) { if (selectedPlanId === state.plan.id && currentStep === 'methods' && !state.verified) setMessage(error.message, 'error'); }
});
$('#backToPlan').addEventListener('click', () => { invalidateVerification(); setMessage(); setStep('details'); });
$('#catalogPlans').addEventListener('click', (event) => { const button = event.target.closest('[data-plan]'); if (button) choosePlan(state.plans.find((plan) => plan.id === Number(button.dataset.plan))); });
$('#branchFilter').addEventListener('change', renderCatalog); $('#planSearch').addEventListener('input', renderCatalog);
$('#resetFilters').addEventListener('click', () => { $('#branchFilter').value = ''; $('#planSearch').value = ''; renderCatalog(); });
$('#retryCatalog').addEventListener('click', loadCatalog);
$('#backToCatalog').addEventListener('click', () => { if (state.busy) return; invalidateVerification(); $('#checkout').hidden = true; $('#catalog').hidden = false; setMessage(); window.scrollTo({ top: 0, behavior: 'smooth' }); });
memberForm.addEventListener('input', invalidateVerification);
memberForm.addEventListener('submit', async (event) => {
  event.preventDefault(); const button = memberForm.querySelector('button'); const form = new FormData(memberForm);
  invalidateVerification(); const version = verificationVersion;
  state.memberCode = String(form.get('memberCode') || '').trim(); state.customerName = String(form.get('customerName') || '').trim();
  if (!state.memberCode || !state.customerName) return setMessage('أدخل كود العضو والاسم المسجلين في العضوية.', 'error');
  button.disabled = true; setMessage('جارٍ التحقق من العضوية...');
  try {
    const options = await api('/online-subscription-options', { method: 'POST', body: { memberCode: state.memberCode, customerName: state.customerName } });
    if (version !== verificationVersion) return;
    const permittedPlan = options.plans.find((plan) => planIdOf(plan) === state.plan.id);
    if (!permittedPlan) throw new Error('هذه الباقة غير متاحة لفرع عضويتك. ارجع للاشتراكات واختار باقة مناسبة لفرعك.');
    paintPlan(permittedPlan); state.verified = true; renderPaymentMethods(options.paymentMethods || []); $('#paymentChoices').hidden = false;
    setMessage(options.paymentMethods?.length ? 'تم التحقق من العضوية. اختر طريقة الدفع للمتابعة.' : 'لا توجد طرق دفع متاحة حاليًا.', options.paymentMethods?.length ? '' : 'error');
    $('#paymentChoices').scrollIntoView({ behavior: 'smooth', block: 'center' });
  } catch (error) { if (version === verificationVersion) setMessage(error.message, 'error'); } finally { button.disabled = false; }
});
$('#continueToPayment').addEventListener('click', () => {
  if (!state.verified || !state.paymentMethodId) return;
  const method = state.methods.find((item) => String(item.id) === state.paymentMethodId);
  if (!method) return;
  $('#paymentSubscriptionTypeId').value = String(state.plan.id); $('#paymentMethodId').value = state.paymentMethodId;
  $('#paymentMemberCode').value = state.memberCode; $('#paymentCustomerName').value = state.customerName;
  $('#paymentPlanSummary').textContent = `${state.plan.name} — ${money(state.plan.price)} — ${state.plan.days} يوم`;
  $('#selectedPaymentDetails').innerHTML = `<span>${paymentDetails(method)}</span>${paymentImage(method)}`;
  const date = new Date(); const localDate = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
  if (!paymentForm.elements.startDate.value) paymentForm.elements.startDate.value = localDate;
  setMessage(); setStep('payment');
});
$('#backToDetails').addEventListener('click', () => { if (!state.busy) { setMessage(); setStep('methods'); } });
paymentForm.elements.paymentProof.addEventListener('change', () => {
  clearPreview(); const input = paymentForm.elements.paymentProof; const file = input.files[0]; input.setCustomValidity('');
  if (!file) return;
  if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type) || file.size > 5 * 1024 * 1024) {
    input.value = ''; input.setCustomValidity('ارفق صورة JPG أو PNG أو WebP بحجم لا يزيد عن 5 ميجابايت.'); input.reportValidity(); return;
  }
  previewUrl = URL.createObjectURL(file); $('#proofPreview').src = previewUrl; $('#proofPreview').hidden = false;
});
paymentForm.addEventListener('submit', async (event) => {
  event.preventDefault(); if (state.busy || !state.verified || !state.paymentMethodId || !paymentForm.reportValidity()) return;
  const payload = new FormData(paymentForm); state.busy = true;
  const buttons = [paymentForm.querySelector('[type="submit"]'), $('#backToDetails'), $('#backToCatalog')]; buttons.forEach((button) => { button.disabled = true; });
  setMessage('جارٍ إرسال الطلب...');
  try {
    const result = await api('/online-subscriptions', { method: 'POST', body: payload });
    if (!result.success) throw new Error(result.message || 'تعذر إرسال الطلب، حاول مرة أخرى');
    $('#checkout').hidden = true; $('#subscriptionSuccess').hidden = false; $('#subscriptionSuccess').focus(); setMessage(); paymentForm.reset(); clearPreview(); invalidateVerification();
  } catch (error) { setMessage(error.message, 'error'); } finally { state.busy = false; buttons.forEach((button) => { button.disabled = false; }); }
});
loadCatalog();
