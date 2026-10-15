(function () {
  'use strict';

  var pendingImageUrl;
  var fieldId = 'one80-cafe-image-url-hotfix';
  var activeProductDialog = null;

  function isCafeProductRequest(method, url) {
    return /^(POST|PUT|PATCH)$/i.test(method || '') && /\/api\/cafe-products(?:\/\d+)?(?:[/?#]|$)/.test(url || '');
  }

  function withImageUrl(body) {
    if (pendingImageUrl === undefined || typeof body !== 'string') return body;
    try {
      var parsed = JSON.parse(body);
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return body;
      parsed.imageUrl = pendingImageUrl;
      return JSON.stringify(parsed);
    } catch (_error) {
      return body;
    }
  }

  var originalOpen = XMLHttpRequest.prototype.open;
  var originalSend = XMLHttpRequest.prototype.send;
  XMLHttpRequest.prototype.open = function (method, url) {
    this.__one80Method = String(method || '');
    this.__one80Url = String(url || '');
    return originalOpen.apply(this, arguments);
  };
  XMLHttpRequest.prototype.send = function (body) {
    if (isCafeProductRequest(this.__one80Method, this.__one80Url)) {
      body = withImageUrl(body);
    }
    return originalSend.call(this, body);
  };

  if (window.fetch) {
    var originalFetch = window.fetch;
    window.fetch = function (input, init) {
      var requestUrl = typeof input === 'string' ? input : input && input.url;
      var method = (init && init.method) || (input && input.method) || 'GET';
      if (init && isCafeProductRequest(method, String(requestUrl || ''))) {
        init = Object.assign({}, init, { body: withImageUrl(init.body) });
      }
      return originalFetch.call(this, input, init);
    };
  }

  function safeExistingUrl(preview) {
    if (!preview) return '';
    var src = preview.getAttribute('src') || '';
    return /^https:\/\//i.test(src) ? src : '';
  }

  function installField() {
    var dialogs = document.querySelectorAll('[role="dialog"]');
    for (var i = 0; i < dialogs.length; i += 1) {
      var dialog = dialogs[i];
      if (!/منتج الكافيه|منتج كافيه/.test(dialog.textContent || '')) continue;
      if (activeProductDialog && activeProductDialog !== dialog) pendingImageUrl = undefined;
      activeProductDialog = dialog;
      if (dialog.querySelector('#' + fieldId)) continue;

      var fileInput = dialog.querySelector('input[type="file"][accept*="image"]');
      if (!fileInput || !fileInput.parentElement || !fileInput.parentElement.parentElement) continue;
      var uploadRoot = fileInput.parentElement.parentElement;
      var card = uploadRoot.parentElement;
      var preview = card && card.querySelector(':scope > img');

      var wrapper = document.createElement('div');
      wrapper.id = fieldId;
      wrapper.dir = 'rtl';
      wrapper.style.cssText = 'border-top:1px solid hsl(var(--border));padding-top:12px;text-align:right;';

      var label = document.createElement('label');
      label.htmlFor = fieldId + '-input';
      label.textContent = 'أو الصق رابط الصورة';
      label.style.cssText = 'display:block;margin-bottom:6px;font-size:12px;font-weight:700;color:hsl(var(--foreground));';

      var input = document.createElement('input');
      input.id = fieldId + '-input';
      input.type = 'url';
      input.inputMode = 'url';
      input.autocomplete = 'url';
      input.dir = 'ltr';
      input.placeholder = 'https://example.com/product.jpg';
      input.value = safeExistingUrl(preview);
      input.style.cssText = 'display:flex;width:100%;height:40px;border:1px solid hsl(var(--input));border-radius:10px;background:hsl(var(--background));padding:0 12px;font:inherit;font-size:14px;color:hsl(var(--foreground));outline:none;';

      var help = document.createElement('p');
      help.textContent = 'يمكنك لصق رابط مباشر للصورة بدل رفع ملف.';
      help.style.cssText = 'margin:6px 0 0;font-size:12px;color:hsl(var(--muted-foreground));';

      var importButton = document.createElement('button');
      importButton.type = 'button';
      importButton.textContent = 'استخدام الرابط';
      importButton.style.cssText = 'width:100%;height:38px;margin-top:8px;border:0;border-radius:10px;background:hsl(var(--primary));color:hsl(var(--primary-foreground));font:inherit;font-size:13px;font-weight:700;cursor:pointer;';
      var importPromise = null;

      function validate() {
        var value = input.value.trim();
        var valid = !value || /^https:\/\/[^\s]+$/i.test(value);
        input.setCustomValidity(valid ? '' : 'استخدمي رابطًا يبدأ بـ https://');
        input.style.borderColor = valid ? 'hsl(var(--input))' : 'hsl(var(--destructive))';
        help.textContent = valid
          ? 'يمكنك لصق رابط مباشر للصورة بدل رفع ملف.'
          : 'الرابط غير صالح. استخدمي رابطًا يبدأ بـ https://';
        help.style.color = valid ? 'hsl(var(--muted-foreground))' : 'hsl(var(--destructive))';
        return valid;
      }

      function importUrl() {
        if (importPromise) return importPromise;
        if (!validate() || !input.value.trim()) return Promise.resolve(false);
        importButton.disabled = true;
        importButton.style.opacity = '0.65';
        importButton.textContent = 'جارٍ تجهيز الصورة…';
        help.textContent = 'يتم الآن حفظ نسخة آمنة على سيرفر ONE80.';
        wrapper.dataset.uploading = 'true';
        importPromise = window.fetch(input.value.trim(), { mode: 'cors', referrerPolicy: 'no-referrer' })
          .then(function (response) {
            if (!response.ok) throw new Error('تعذر تحميل الصورة من الرابط');
            return response.blob();
          })
          .then(function (blob) {
            if (!/^image\/(jpeg|png|webp)$/i.test(blob.type) || blob.size > 5 * 1024 * 1024) {
              throw new Error('الصورة يجب أن تكون JPG أو PNG أو WebP وأقل من 5MB');
            }
            var extension = blob.type.split('/')[1].replace('jpeg', 'jpg');
            var formData = new FormData();
            formData.append('file', new File([blob], 'linked-product.' + extension, { type: blob.type }));
            var token = localStorage.getItem('one80_token');
            return window.fetch('/api/uploads/product-image', {
              method: 'POST',
              headers: token ? { Authorization: 'Bearer ' + token } : {},
              credentials: 'include',
              body: formData,
            });
          })
          .then(function (response) {
            if (!response.ok) throw new Error('تعذر رفع الصورة إلى ONE80');
            return response.json();
          })
          .then(function (result) {
            if (!result || !/^public-file:/.test(result.path || '')) throw new Error('مرجع الصورة غير صالح');
            pendingImageUrl = result.path;
            if (preview) preview.src = result.url;
            help.textContent = 'تم تجهيز الصورة وستُحفظ مع المنتج.';
            help.style.color = 'rgb(5 150 105)';
            importButton.textContent = 'تم استخدام الرابط ✓';
            return true;
          })
          .catch(function (error) {
            pendingImageUrl = undefined;
            help.textContent = error && error.message ? error.message : 'تعذر استخدام رابط الصورة';
            help.style.color = 'hsl(var(--destructive))';
            importButton.textContent = 'إعادة المحاولة';
            return false;
          })
          .finally(function () {
            wrapper.dataset.uploading = 'false';
            importButton.disabled = false;
            importButton.style.opacity = '1';
            importPromise = null;
          });
        return importPromise;
      }

      input.addEventListener('focus', function () {
        input.style.boxShadow = '0 0 0 2px hsl(var(--ring) / 0.25)';
      });
      input.addEventListener('blur', function () {
        input.style.boxShadow = 'none';
        validate();
      });
      input.addEventListener('input', function () {
        if (!validate()) return;
        pendingImageUrl = undefined;
        if (preview && input.value.trim()) preview.src = input.value.trim();
      });
      importButton.addEventListener('click', importUrl);
      fileInput.addEventListener('change', function () {
        pendingImageUrl = undefined;
        input.value = '';
        validate();
      });

      wrapper.appendChild(label);
      wrapper.appendChild(input);
      wrapper.appendChild(importButton);
      wrapper.appendChild(help);
      uploadRoot.insertAdjacentElement('afterend', wrapper);
    }
  }

  document.addEventListener('submit', function (event) {
    var input = document.getElementById(fieldId + '-input');
    if (!input) return;
    if (!input.checkValidity()) {
      event.preventDefault();
      event.stopImmediatePropagation();
      input.reportValidity();
      return;
    }
    if (input.value.trim() && pendingImageUrl === undefined) {
      event.preventDefault();
      event.stopImmediatePropagation();
      var form = event.target;
      var submitter = event.submitter;
      var button = document.querySelector('#' + fieldId + ' button');
      if (button) button.click();
      var waitForImport = window.setInterval(function () {
        var wrapper = document.getElementById(fieldId);
        if (!wrapper || wrapper.dataset.uploading === 'true') return;
        window.clearInterval(waitForImport);
        if (pendingImageUrl !== undefined && form && form.requestSubmit) form.requestSubmit(submitter || undefined);
      }, 100);
    }
  }, true);

  var scheduled = false;
  var observer = new MutationObserver(function () {
    if (scheduled) return;
    scheduled = true;
    requestAnimationFrame(function () {
      scheduled = false;
      installField();
      // Tabs unmount the details panel (and its URL field) while the product
      // dialog stays open. Keep the prepared upload until the whole dialog
      // closes, otherwise the final review submit silently loses imageUrl.
      if (activeProductDialog && !document.documentElement.contains(activeProductDialog)) {
        activeProductDialog = null;
        pendingImageUrl = undefined;
      }
    });
  });

  function start() {
    observer.observe(document.body, { childList: true, subtree: true });
    installField();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
  else start();
})();
