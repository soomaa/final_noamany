export function initProductCarousel(track) {
  if (!track) return () => {};
  const carousel = document.createElement('div');
  carousel.className = 'product-carousel';
  carousel.setAttribute('role', 'region');
  carousel.setAttribute('aria-label', 'منتجاتنا المميزة');
  track.before(carousel);
  carousel.append(track);
  track.id = 'featuredProductsTrack';
  track.tabIndex = 0;
  track.setAttribute('aria-label', 'المنتجات — اسحب أو استخدم أسهم التنقل');
  const controls = document.createElement('div');
  controls.className = 'product-carousel-controls';
  controls.innerHTML = '<button type="button" class="carousel-prev" aria-label="المنتجات السابقة" aria-controls="featuredProductsTrack">→</button><div class="carousel-progress" role="progressbar" aria-label="موضع عرض المنتجات" aria-valuemin="0" aria-valuemax="100"><span></span></div><button type="button" class="carousel-next" aria-label="المنتجات التالية" aria-controls="featuredProductsTrack">←</button>';
  carousel.append(controls);
  const prev = controls.querySelector('.carousel-prev');
  const next = controls.querySelector('.carousel-next');
  const progress = controls.querySelector('.carousel-progress');
  const thumb = progress.firstElementChild;
  const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
  const rtl = getComputedStyle(track).direction === 'rtl';
  function update() {
    const max = Math.max(0, track.scrollWidth - track.clientWidth);
    const position = Math.min(max, Math.abs(track.scrollLeft));
    const hasProducts = !!track.querySelector('.product');
    carousel.classList.toggle('is-empty', !hasProducts);
    controls.hidden = !hasProducts || max < 2;
    prev.disabled = position < 2;
    next.disabled = position >= max - 2;
    const ratio = max ? position / max : 0;
    const width = track.scrollWidth ? Math.min(100, track.clientWidth / track.scrollWidth * 100) : 100;
    thumb.style.width = `${width}%`;
    thumb.style.left = `${(rtl ? 1 - ratio : ratio) * (100 - width)}%`;
    progress.setAttribute('aria-valuenow', String(Math.round(ratio * 100)));
  }
  function move(forward) {
    const card = track.querySelector('.product');
    if (!card) return;
    const step = card.getBoundingClientRect().width + parseFloat(getComputedStyle(track).columnGap || 0);
    track.scrollBy({ left: step * (forward ? 1 : -1) * (rtl ? -1 : 1), behavior: reducedMotion.matches ? 'instant' : 'smooth' });
  }
  // Autoplay: advance one card at a time and wrap to the start after the last card.
  // Pauses while the visitor hovers, focuses, touches the carousel, or the tab is hidden.
  const AUTOPLAY_MS = 3500;
  let paused = false;
  let resumeTimer = 0;
  function advance() {
    if (paused || document.hidden || reducedMotion.matches || controls.hidden) return;
    const max = Math.max(0, track.scrollWidth - track.clientWidth);
    if (Math.abs(track.scrollLeft) >= max - 2) track.scrollTo({ left: 0, behavior: 'smooth' });
    else move(true);
  }
  setInterval(advance, AUTOPLAY_MS);
  const pause = () => { paused = true; clearTimeout(resumeTimer); };
  const resumeLater = () => { clearTimeout(resumeTimer); resumeTimer = setTimeout(() => { paused = false; }, AUTOPLAY_MS); };
  carousel.addEventListener('mouseenter', pause);
  carousel.addEventListener('mouseleave', resumeLater);
  carousel.addEventListener('focusin', pause);
  carousel.addEventListener('focusout', resumeLater);
  track.addEventListener('touchstart', pause, { passive: true });
  track.addEventListener('touchend', resumeLater, { passive: true });

  prev.addEventListener('click', () => { move(false); resumeLater(); });
  next.addEventListener('click', () => { move(true); resumeLater(); });
  track.addEventListener('keydown', (event) => {
    if (event.target !== track || !['ArrowLeft', 'ArrowRight'].includes(event.key)) return;
    event.preventDefault();
    move(event.key === (rtl ? 'ArrowLeft' : 'ArrowRight'));
  });
  track.addEventListener('scroll', update, { passive: true });
  new ResizeObserver(update).observe(track);
  update();
  return () => { track.scrollLeft = 0; requestAnimationFrame(update); };
}
