import './font.css';
import { api, escapeHtml, installGlobalCartLinks, showToast } from './portal.js';

installGlobalCartLinks();
const root = document.getElementById('careersPage');

function jobCard(job) {
  const meta = [job.branch, job.specialization, job.experienceYears && `خبرة ${job.experienceYears}`].filter(Boolean);
  return `<article class="job-card"><span>${String(job.id).padStart(2, '0')}</span><div><small>${meta.map(escapeHtml).join(' · ') || 'NOAMANY FITNESS CENTER'}</small><h2>${escapeHtml(job.title)}</h2><p>${escapeHtml(job.details || 'انضم لفريق عمل يهتم بالتطور والاحتراف وصناعة تجربة مميزة.')}</p></div><button data-job="${job.id}">قدم الآن ←</button></article>`;
}

function applicationForm(jobs) {
  return `<section class="career-form-shell" id="apply"><div class="career-form-copy"><span>JOIN THE TEAM</span><h2>ابدأ خطوتك<br><em>الجديدة.</em></h2><p>املأ البيانات الأساسية وارفق سيرتك الذاتية. الطلب سيظهر مباشرة داخل إدارة البوابة للمراجعة.</p><ul><li>ملفات PDF أو Word حتى 5MB</li><li>صورة شخصية اختيارية</li><li>لن نشارك بياناتك خارج فريق التوظيف</li></ul></div><form id="jobForm" class="career-form">
    <label class="wide">الوظيفة المطلوبة<select name="jobId" required><option value="">اختر الوظيفة</option>${jobs.map((job) => `<option value="${job.id}">${escapeHtml(job.title)}${job.branch ? ` — ${escapeHtml(job.branch)}` : ''}</option>`).join('')}</select></label>
    <label>الاسم الأول<input name="firstName" required maxlength="150"></label><label>اسم العائلة<input name="lastName" maxlength="150"></label>
    <label>رقم الموبايل<input name="mobile" required inputmode="tel" placeholder="01xxxxxxxxx"></label><label>البريد الإلكتروني<input name="email" type="email"></label>
    <label>المدينة<input name="city" maxlength="255"></label><label>المؤهل<input name="degree" maxlength="255"></label>
    <label class="wide">التخصص<input name="specialization" maxlength="255"></label><label class="wide">العنوان<input name="address" maxlength="1000"></label>
    <label class="wide">المهارات<textarea name="skills" maxlength="5000"></textarea></label><label class="wide">لماذا تريد الانضمام إلينا؟<textarea name="aboutJob" maxlength="5000"></textarea></label>
    <label class="file-field">السيرة الذاتية *<input name="cv" type="file" required accept=".pdf,.doc,.docx"><small>PDF / DOC / DOCX — بحد أقصى 5MB</small></label>
    <label class="file-field">صورة شخصية (اختياري)<input name="personalImage" type="file" accept="image/jpeg,image/png,image/webp"><small>JPG / PNG / WEBP</small></label>
    <button class="submit-application wide" type="submit">إرسال طلب التوظيف ←</button><p class="form-response wide" role="status"></p>
  </form></section>`;
}

async function load() {
  try {
    const jobs = await api('/jobs');
    if (!jobs.length) {
      root.className = 'empty-careers';
      root.innerHTML = '<span>NO OPEN POSITIONS</span><h2>لا توجد وظائف متاحة حاليًا.</h2><p>تابع الصفحة؛ تظهر هنا الوظائف التي تُنشر من إدارة البوابة فورًا.</p><a href="/">العودة للرئيسية ←</a>';
      return;
    }
    root.className = 'careers-content';
    root.innerHTML = `<div class="jobs-heading"><span>الفرص الحالية</span><h2>${String(jobs.length).padStart(2, '0')} فرص للانضمام إلينا</h2></div><div class="jobs-grid">${jobs.map(jobCard).join('')}</div>${applicationForm(jobs)}`;
    root.querySelectorAll('[data-job]').forEach((button) => button.addEventListener('click', () => {
      root.querySelector('[name="jobId"]').value = button.dataset.job;
      document.getElementById('apply').scrollIntoView({ behavior: 'smooth' });
    }));
    root.querySelector('#jobForm').addEventListener('submit', submit);
  } catch (error) {
    root.className = 'error-panel'; root.textContent = error.message;
  }
}

async function submit(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const button = form.querySelector('button[type="submit"]');
  const response = form.querySelector('.form-response');
  button.disabled = true; button.textContent = 'جاري إرسال الطلب...'; response.textContent = ''; response.dataset.kind = '';
  try {
    const result = await api('/job-applications', { method: 'POST', body: new FormData(form) });
    form.reset(); response.textContent = result.message; showToast(result.message);
  } catch (error) {
    response.textContent = error.message; response.dataset.kind = 'error'; showToast(error.message, 'error');
  } finally { button.disabled = false; button.textContent = 'إرسال طلب التوظيف ←'; }
}

load();
