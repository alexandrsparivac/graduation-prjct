const greetings = [
  "Salut", "Bine ai venit", "Hello", "Welcome", "Bonjour", "Bienvenue", "Hola", "Bienvenido",
  "Привет", "Добро пожаловать", "Hallo", "Willkommen", "こんにちは", "ようこそ", "안녕하세요", "환영합니다",
  "你好", "欢迎", "Ciao", "Benvenuto", "Olá", "Bem-vindo", "مرحبا", "أهلا وسهلا", "Γειά σου", "Καλώς ήρθες",
  "Namaste", "स्वागत है", "Merhaba", "Hoş geldin", "Sawubona", "Hej", "Välkommen", "Cześć", "Witamy",
  "Hei", "Xin chào", "Sawasdee", "Selamat datang"
];

const animVariants = ['anim-drift', 'anim-bob', 'anim-spin', 'anim-pulse'];

export function mountBackgroundWords(container = document.getElementById('wordField')) {
  if (!container) return;
  const vw = () => window.innerWidth;
  const vh = () => window.innerHeight;

  function layout() {
    container.innerHTML = '';
    const cols = 8, rows = 7;
    const cellW = vw() / cols, cellH = vh() / rows;
    const shuffled = [...greetings].sort(() => Math.random() - 0.5);
    const totalCells = cols * rows;
    const cellIndices = Array.from({ length: totalCells }, (_, n) => n);
    for (let n = cellIndices.length - 1; n > 0; n--) {
      const j = Math.floor(Math.random() * (n + 1));
      [cellIndices[n], cellIndices[j]] = [cellIndices[j], cellIndices[n]];
    }
    const activeCells = new Set(cellIndices.slice(0, Math.round(totalCells * 0.86)));

    let i = 0, cellIdx = 0;
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        if (!activeCells.has(cellIdx++)) continue;
        const word = shuffled[i++ % shuffled.length];
        const pos = document.createElement('div');
        pos.className = 'bg-word-pos';
        const el = document.createElement('span');
        const variant = animVariants[Math.floor(Math.random() * animVariants.length)];
        el.className = 'bg-word ' + variant;
        el.textContent = word;
        pos.appendChild(el);

        const left = c * cellW + cellW / 2 + (Math.random() - 0.5) * cellW * 0.55;
        const top = r * cellH + cellH / 2 + (Math.random() - 0.5) * cellH * 0.55;

        const roll = Math.random();
        let size = roll < 0.35 ? 13 + Math.random() * 10 : roll < 0.75 ? 22 + Math.random() * 20 : 40 + Math.random() * 38;
        const maxAllowed = Math.min(cellW * 1.7 / Math.max(word.length * 0.5, 3), cellH * 1.4);
        size = Math.min(size, Math.max(maxAllowed, 14));

        const dur = variant === 'anim-pulse' ? 3.5 + Math.random() * 3 : 5 + Math.random() * 9;
        const delay = -Math.random() * dur * 2;
        const rot = (Math.random() - 0.5) * 10;
        const opA = 0.25 + Math.random() * 0.2;

        pos.style.left = left + 'px';
        pos.style.top = top + 'px';
        pos.style.zIndex = Math.round(size);
        el.style.fontSize = size + 'px';
        el.style.setProperty('--dx', (Math.random() - 0.5) * (26 + size * 0.3) + 'px');
        el.style.setProperty('--dy', (Math.random() - 0.5) * (22 + size * 0.3) + 'px');
        el.style.setProperty('--rot', rot + 'deg');
        el.style.setProperty('--rot2', rot + (Math.random() - 0.5) * 10 + 'deg');
        el.style.setProperty('--op-a', opA);
        el.style.setProperty('--op-b', Math.min(opA + 0.4 + Math.random() * 0.25, 1));
        el.style.setProperty('--s', (0.94 + Math.random() * 0.12).toFixed(2));
        el.style.animationDuration = dur + 's, ' + dur * 1.3 + 's';
        el.style.animationDelay = delay + 's, ' + delay + 's';
        container.appendChild(pos);
      }
    }
  }

  layout();
  let t;
  window.addEventListener('resize', () => { clearTimeout(t); t = setTimeout(layout, 200); });
}
