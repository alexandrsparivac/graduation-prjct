const gradients = [
  { left: '8%', top: '14%', size: 'clamp(320px, 46vw, 620px)', delay: '-5s', hue: 'violet' },
  { left: '88%', top: '34%', size: 'clamp(300px, 43vw, 580px)', delay: '-13s', hue: 'blue' },
  { left: '42%', top: '94%', size: 'clamp(340px, 48vw, 640px)', delay: '-9s', hue: 'cyan' }
];

export function mountBackgroundWords(container = document.getElementById('wordField')) {
  if (!container) return;

  container.replaceChildren(...gradients.map(({ left, top, size, delay, hue }) => {
    const gradient = document.createElement('span');
    gradient.className = `bg-language-gradient bg-language-gradient-${hue}`;
    gradient.style.left = left;
    gradient.style.top = top;
    gradient.style.width = size;
    gradient.style.height = size;
    gradient.style.animationDelay = delay;
    return gradient;
  }));
}
