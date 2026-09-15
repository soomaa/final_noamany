import { useLayoutEffect, useRef } from 'react';

/** Keep checkout inside the app's visible scrollport, including an expanded topbar. */
export function usePosCartViewport() {
  const ref = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const cart = ref.current;
    if (!cart) return;
    const scrollport = cart.closest('main') ?? document.documentElement;
    let frame = 0;
    const measure = () => {
      const bottom = Math.min(window.innerHeight, scrollport.getBoundingClientRect().bottom);
      const height = Math.max(0, bottom - Math.max(0, cart.getBoundingClientRect().top) - 16);
      cart.style.setProperty('--pos-cart-height', `${height}px`);
    };
    const schedule = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(measure);
    };
    const observer = new ResizeObserver(schedule);
    observer.observe(scrollport);
    if (cart.parentElement) observer.observe(cart.parentElement);
    scrollport.addEventListener('scroll', schedule, { passive: true });
    window.addEventListener('resize', schedule);
    measure();
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
      scrollport.removeEventListener('scroll', schedule);
      window.removeEventListener('resize', schedule);
    };
  }, []);
  return ref;
}
