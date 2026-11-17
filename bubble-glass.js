// Keep the bubble's centre as a live, translucent backdrop. Only its rim gets
// a transparent wallpaper lens, computed off the main thread after layout settles.
export function mountBubbleGlass(box) {
  const wall = document.querySelector('.wall');
  if (!box || !wall || !window.Worker || !window.OffscreenCanvas || !window.createImageBitmap
      || !window.ResizeObserver || !window.IntersectionObserver) return () => {};
  const known = new Set(), visible = new Set(), pending = new Set(), urls = new Map();
  let worker = null, workerFailed = false, source = '', sourceReady = false, sourceVersion = 0;
  let nextId = 0, busy = null, timer = 0, stopped = false;
  const eligible = el => !el.matches('.pic, .file-message, .only-stk, .typing-bubble')
    && !el.querySelector('.photo, .chat-file, .stk');
  const clear = el => {
    el.style.removeProperty('--bubble-lens');
    const url = urls.get(el);
    if (url) URL.revokeObjectURL(url);
    urls.delete(el);
  };
  const fail = () => {
    worker?.terminate(); worker = null; workerFailed = true; sourceReady = false; busy = null;
    for (const el of known) { clear(el); el.classList.remove('bubble-glass'); }
  };
  const schedule = (delay = 80) => {
    if (stopped) return;
    clearTimeout(timer);
    timer = setTimeout(pump, delay);
  };
  const ensureWorker = () => {
    if (worker) return true;
    if (workerFailed) return false;
    try { worker = new Worker(new URL('./bubble-lens-worker.js', import.meta.url), { type: 'module' }); }
    catch { return false; }
    worker.onmessage = ({ data }) => {
      const job = busy; busy = null;
      if (!job || data.id !== job.id) { schedule(0); return; }
      if (data.type === 'paint' && job.version === sourceVersion && visible.has(job.el) && job.el.isConnected) {
        const url = URL.createObjectURL(data.blob);
        clear(job.el);
        urls.set(job.el, url);
        job.el.style.setProperty('--bubble-lens', `url(${JSON.stringify(url)})`);
      }
      if (data.type === 'error') fail();
      schedule(0);
    };
    worker.onerror = fail;
    return true;
  };
  const ensureSource = img => {
    const key = img.currentSrc || img.src;
    if (source === key) return sourceReady;
    source = key; sourceReady = false;
    const version = ++sourceVersion;
    for (const el of known) clear(el);
    createImageBitmap(img).then(bitmap => {
      if (stopped || version !== sourceVersion || !worker) { bitmap.close(); return; }
      worker.postMessage({ type: 'source', bitmap }, [bitmap]);
      sourceReady = true;
      schedule(0);
    }).catch(() => { sourceReady = false; });
    return false;
  };
  function pump() {
    timer = 0;
    if (busy || !pending.size || !document.body.classList.contains('on-wall')) return;
    const img = wall?.querySelector('img.on');
    if (!img?.complete || !img.naturalWidth || !ensureWorker() || !ensureSource(img)) return;
    const el = pending.values().next().value;
    pending.delete(el);
    if (!visible.has(el) || !el.isConnected || !eligible(el)) { schedule(0); return; }
    const rect = el.getBoundingClientRect(), bounds = wall.getBoundingClientRect();
    if (!rect.width || !rect.height) { schedule(0); return; }
    const style = getComputedStyle(el);
    const theme = getComputedStyle(document.body);
    const blur = parseFloat(theme.getPropertyValue('--convo-blur')) || 0;
    const veil = parseFloat(theme.getPropertyValue('--convo-veil')) || 12;
    const bg = theme.getPropertyValue('--bg').trim() || '#f4f3ee';
    const radii = [style.borderTopLeftRadius, style.borderTopRightRadius,
      style.borderBottomRightRadius, style.borderBottomLeftRadius].map(v => parseFloat(v) || 0);
    const id = ++nextId;
    busy = { id, el, version: sourceVersion };
    worker.postMessage({ type: 'paint', id, generation: sourceVersion,
      rect: { left: rect.left, top: rect.top, width: rect.width, height: rect.height },
      wall: { left: bounds.left, top: bounds.top, width: bounds.width, height: bounds.height },
      radii, blur, veil, bg });
  }
  if (!ensureWorker()) return () => {};
  const resize = new ResizeObserver(entries => {
    for (const { target } of entries) if (visible.has(target)) pending.add(target);
    schedule(180);
  });
  const intersect = new IntersectionObserver(entries => {
    for (const { target, isIntersecting } of entries) {
      if (isIntersecting && eligible(target)) {
        visible.add(target); resize.observe(target); pending.add(target);
      } else {
        visible.delete(target); pending.delete(target); resize.unobserve(target); clear(target);
      }
    }
    schedule();
  }, { root: box, rootMargin: '80px' });
  const add = root => {
    if (workerFailed) return;
    const nodes = root.matches?.('.msg.user, .msg.assistant') ? [root] : [];
    for (const el of root.querySelectorAll?.('.msg.user, .msg.assistant') || []) nodes.push(el);
    for (const el of nodes) if (!known.has(el) && eligible(el)) {
      known.add(el); el.classList.add('bubble-glass'); intersect.observe(el);
    }
  };
  add(box);
  const changes = new MutationObserver(records => {
    for (const record of records) {
      for (const node of record.addedNodes) if (node.nodeType === 1) add(node);
      for (const node of record.removedNodes) if (node.nodeType === 1) {
        const removed = node.matches?.('.bubble-glass') ? [node] : [];
        for (const el of node.querySelectorAll?.('.bubble-glass') || []) removed.push(el);
        for (const el of removed) if (!box.contains(el)) {
          intersect.unobserve(el); resize.unobserve(el); known.delete(el);
          visible.delete(el); pending.delete(el); clear(el);
        }
      }
    }
  });
  changes.observe(box, { childList: true, subtree: true });
  const refresh = () => { source = ''; for (const el of visible) pending.add(el); schedule(120); };
  const wallChanges = wall && new MutationObserver(refresh);
  wallChanges?.observe(wall, { subtree: true, attributes: true, attributeFilter: ['class', 'src'] });
  wall?.addEventListener('load', refresh, true);
  const onScroll = () => { for (const el of visible) pending.add(el); schedule(240); };
  box.addEventListener('scroll', onScroll, { passive: true });
  window.addEventListener('resize', refresh);
  return () => {
    stopped = true; clearTimeout(timer); changes.disconnect(); wallChanges?.disconnect();
    intersect.disconnect(); resize.disconnect(); worker?.terminate();
    wall?.removeEventListener('load', refresh, true);
    box.removeEventListener('scroll', onScroll); window.removeEventListener('resize', refresh);
    for (const el of known) { clear(el); el.classList.remove('bubble-glass'); }
  };
}
