import { mountBubbleGlass } from './bubble-glass.js';

const box = document.querySelector('#chat-scroll');
const wall = document.querySelector('.wall img');
const status = document.querySelector('#status');
const form = document.querySelector('#composer');
const input = document.querySelector('#message');
const stop = mountBubbleGlass(box);
let alternative = false;

form.addEventListener('submit', event => {
  event.preventDefault();
  const value = input.value.trim();
  if (!value) return;
  const bubble = document.createElement('div');
  bubble.className = 'msg user';
  bubble.textContent = value;
  box.append(bubble);
  bubble.scrollIntoView({ block: 'end', behavior: 'smooth' });
  input.value = '';
  input.focus();
});

document.querySelector('#change-wall').addEventListener('click', () => {
  alternative = !alternative;
  wall.src = alternative ? 'wallpaper-night.svg' : 'wallpaper.svg';
});

new MutationObserver(() => {
  const rendered = box.querySelectorAll('.bubble-glass[style*="--bubble-lens"]').length;
  status.textContent = rendered ? `${rendered} bubble${rendered === 1 ? '' : 's'} rendered` : 'Preparing lens…';
  document.body.dataset.lensReady = rendered ? 'true' : 'false';
}).observe(box, { subtree: true, attributes: true, attributeFilter: ['style'] });

window.addEventListener('pagehide', stop, { once: true });
