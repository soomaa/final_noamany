const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { resolve } = require('node:path');
const test = require('node:test');

function loadRenderHero(document) {
  const source = readFileSync(resolve(__dirname, '..', 'src', 'main.js'), 'utf8');
  const start = source.indexOf('function renderHero(sliders) {');
  const end = source.indexOf('\nfunction renderSectionSettings', start);
  assert.notEqual(start, -1, 'renderHero must exist');
  assert.notEqual(end, -1, 'renderHero helper block must end before section settings');

  const createRenderer = new Function('document', 'assetUrl', 'Image', 'escapeHtml', `${source.slice(start, end)}; return renderHero;`);
  return createRenderer(document, (path) => `/uploads/${path}`, class {
    set src(value) { this.onload?.({ target: { src: value } }); }
  }, (value) => String(value).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;'));
}

function makeHeroDocument() {
  const background = { style: { setProperty() {} } };
  const heading = { innerHTML: 'النص الافتراضي' };
  const description = { textContent: 'الوصف الافتراضي' };
  const hero = {
    querySelector(selector) {
      return ({ '.hero-bg': background, '.hero-content h1': heading, '.hero-content > p': description })[selector] ?? null;
    },
  };
  return { document: { querySelector: (selector) => selector === '.luxe-hero' ? hero : null }, heading, description };
}

test('renders the slider title in the homepage hero', () => {
  const { document, heading } = makeHeroDocument();

  loadRenderHero(document)([{ title: 'قوة حقيقية' }]);

  assert.equal(heading.innerHTML, 'قوة <em>حقيقية</em>');
});

test('renders the slider details in the homepage hero', () => {
  const { document, description } = makeHeroDocument();

  loadRenderHero(document)([{ details: 'ابدأ خطتك التدريبية اليوم.' }]);

  assert.equal(description.textContent, 'ابدأ خطتك التدريبية اليوم.');
});
