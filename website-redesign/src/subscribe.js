import { api, escapeHtml, money } from './portal.js';

const message = document.querySelector('#subscriptionMessage');
const planId = Number(new URLSearchParams(location.search).get('plan'));
const memberStep = document.querySelector('[data-step="member"]');
const paymentStep = document.querySelector('[data-step="payment"]');
const memberForm = document.querySelector('#memberForm');
const paymentForm = document.querySelector('#subscriptionForm');
const state = { plan: null, memberCode: '', customerName: '', paymentMethodId: '' };

function setMessage(text = '', kind = '') { message.textContent = text; message.dataset.kind = kind; }
function planIdOf(plan) { return Number(plan.subscriptionTypeId ?? plan.id); }
function setStep(step) {
  const payment = step === 'payment'; memberStep.hidden = payment; paymentStep.hidden = !payment;
  document.querySelector('[data-indicator="details"]').classList.toggle('active', !payment);
  document.querySelector('[data-indicator="payment"]').classList.toggle('active', payment);
  window.scrollTo({ top: 0, behavior: 'smooth' });
}
function paintPlan(plan) {
  state.plan = { id: planIdOf(plan), name: plan.name || plan.subscriptionTypeName || plan.title, price: Number(plan.price ?? plan.subscriptionPrice), days: Number(plan.days ?? plan.subscriptionDays) };
  document.querySelector('#subscriptionTypeId').value = String(state.plan.id);
  document.querySelector('#planName').textContent = state.plan.name;
  document.querySelector('#planMeta').textContent = `${money(state.plan.price)} — ${state.plan.days} يوم`;
  const details = document.querySelector('#planDetails'); details.hidden = false;
  details.innerHTML = `<strong>${escapeHtml(state.plan.name)}</strong><span>${money(state.plan.price)}</span><span>مدة الاشتراك: ${state.plan.days} يوم</span>`;
}
async function loadSelectedPlan() {
  if (!planId) throw new Error('لم يتم تحديد باقة الاشتراك');
  const plans = await api('/membership-plans'); const plan = plans.find((item) => planIdOf(item) === planId);
  if (!plan) throw new Error('هذه الباقة غير متاحة حاليًا'); paintPlan(plan);
}
function renderPaymentMethods(methods) {
  const container = document.querySelector('#paymentMethods');
  container.innerHTML = methods.map((method) => `<label class="payment-choice"><input type="radio" name="selectedPaymentMethod" value="${Number(method.id)}"><span><b>${escapeHtml(method.name)}</b>${method.description ? `<small>${escapeHtml(method.description)}</small>` : ''}</span></label>`).join('');
  container.querySelectorAll('input').forEach((input) => input.addEventListener('change', () => { state.paymentMethodId = input.value; document.querySelector('#continueToPayment').disabled = false; }));
}
memberForm.addEventListener('submit', async (event) => {
  event.preventDefault(); const button = event.currentTarget.querySelector('button'); const form = new FormData(memberForm);
  state.memberCode = String(form.get('memberCode') || '').trim(); state.customerName = String(form.get('customerName') || '').trim();
  if (!state.memberCode || !state.customerName) return setMessage('أدخل كود العضو والاسم المسجلين في العضوية.', 'error');
  button.disabled = true; setMessage('جارٍ التحقق من العضوية...');
  try {
    const options = await api('/online-subscription-options', { method: 'POST', body: { memberCode: state.memberCode, customerName: state.customerName } });
    const permittedPlan = options.plans.find((plan) => planIdOf(plan) === planId);
    if (!permittedPlan) throw new Error('هذه الباقة غير متاحة لفرع عضويتك.');
    paintPlan(permittedPlan); renderPaymentMethods(options.paymentMethods || []); document.querySelector('#paymentChoices').hidden = false;
    setMessage('تم التحقق من العضوية. اختر طريقة الدفع للمتابعة.');
  } catch (error) { setMessage(error.message, 'error'); } finally { button.disabled = false; }
});
document.querySelector('#continueToPayment').addEventListener('click', () => {
  document.querySelector('#paymentSubscriptionTypeId').value = String(state.plan.id); document.querySelector('#paymentMethodId').value = state.paymentMethodId;
  document.querySelector('#paymentMemberCode').value = state.memberCode; document.querySelector('#paymentCustomerName').value = state.customerName;
  document.querySelector('#paymentPlanSummary').textContent = `${state.plan.name} — ${money(state.plan.price)} — ${state.plan.days} يوم`; setMessage(); setStep('payment');
});
document.querySelector('#backToDetails').addEventListener('click', () => setStep('details'));
paymentForm.addEventListener('submit', async (event) => {
  event.preventDefault(); const button = event.currentTarget.querySelector('[type="submit"]'); button.disabled = true; setMessage('جارٍ إرسال الطلب...');
  try { const result = await api('/online-subscriptions', { method: 'POST', body: new FormData(paymentForm) }); setMessage(result.message); paymentForm.reset(); } catch (error) { setMessage(error.message, 'error'); } finally { button.disabled = false; }
});
loadSelectedPlan().catch((error) => setMessage(error.message, 'error'));
