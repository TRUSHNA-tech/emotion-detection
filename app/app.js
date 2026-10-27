/* ============================================================
   EmotionAI — app.js
   Handles: API calls, UI rendering, animated background
   ============================================================ */

const API_URL = 'http://localhost:5000/predict';

const EMOTION_COLORS = {
  Joy:      '#FFD700',
  Sadness:  '#5B9BD5',
  Love:     '#FF69B4',
  Anger:    '#FF4500',
  Fear:     '#9370DB',
  Surprise: '#32CD32'
};

const CONFIDENCE_LABELS = {
  high:   'High Confidence',
  medium: 'Medium Confidence',
  low:    'Low Confidence'
};

// ── Animated particle background ─────────────────────────────────────────────
(function initBackground() {
  const canvas = document.getElementById('bg-canvas');
  const ctx    = canvas.getContext('2d');
  let W, H, particles = [];

  function resize() {
    W = canvas.width  = window.innerWidth;
    H = canvas.height = window.innerHeight;
  }

  function mkParticle() {
    return {
      x:   Math.random() * W,
      y:   Math.random() * H,
      r:   Math.random() * 1.5 + 0.3,
      vx:  (Math.random() - 0.5) * 0.25,
      vy:  (Math.random() - 0.5) * 0.25,
      a:   Math.random() * 0.5 + 0.1,
      hue: Math.random() > 0.5 ? 260 : 310  // purple / pink
    };
  }

  function init() {
    resize();
    particles = Array.from({ length: 90 }, mkParticle);
  }

  function draw() {
    ctx.clearRect(0, 0, W, H);
    particles.forEach(p => {
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
      ctx.fillStyle = `hsla(${p.hue}, 70%, 65%, ${p.a})`;
      ctx.fill();
      p.x += p.vx;
      p.y += p.vy;
      if (p.x < 0 || p.x > W) p.vx *= -1;
      if (p.y < 0 || p.y > H) p.vy *= -1;
    });
    requestAnimationFrame(draw);
  }

  window.addEventListener('resize', resize);
  init();
  draw();
})();

// ── Character counter ─────────────────────────────────────────────────────────
const textInput  = document.getElementById('text-input');
const charCount  = document.getElementById('char-count');

textInput.addEventListener('input', () => {
  const len = textInput.value.length;
  charCount.textContent = len;
  charCount.style.color = len > 900 ? '#FF4500' : '';
});

// ── Example chip click ────────────────────────────────────────────────────────
document.querySelectorAll('.example-chip').forEach(chip => {
  chip.addEventListener('click', () => {
    textInput.value = chip.dataset.text;
    charCount.textContent = chip.dataset.text.length;
    textInput.focus();
    // Ripple effect
    chip.style.transform = 'scale(0.95)';
    setTimeout(() => chip.style.transform = '', 150);
  });
});

// Allow Enter key (Ctrl+Enter) to trigger detection
textInput.addEventListener('keydown', e => {
  if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') detectEmotion();
});

// ── Main detection function ───────────────────────────────────────────────────
async function detectEmotion() {
  const text = textInput.value.trim();
  if (!text) {
    textInput.focus();
    textInput.style.borderColor = '#FF4500';
    setTimeout(() => textInput.style.borderColor = '', 1500);
    return;
  }

  setLoading(true);
  hideError();
  hideResult();

  try {
    const res  = await fetch(API_URL, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ text })
    });

    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.error || `Server error: ${res.status}`);
    }

    const data = await res.json();
    renderResult(data);

  } catch (err) {
    let msg = err.message;
    if (err.message.includes('fetch') || err.message.includes('Failed')) {
      msg = '🔌 Cannot connect to the server. Please run: python server.py (in the app/ folder)';
    }
    showError(msg);
  } finally {
    setLoading(false);
  }
}

// ── Render result ─────────────────────────────────────────────────────────────
function renderResult(data) {
  const emotion    = data.primary_emotion;
  const emoji      = data.primary_emoji;
  const confidence = data.primary_confidence;
  const color      = EMOTION_COLORS[emotion] || '#8a63ff';

  // Primary result
  document.getElementById('result-emoji').textContent    = emoji;
  document.getElementById('result-emotion').textContent  = emotion;
  document.getElementById('result-emotion').style.color  = color;
  document.getElementById('result-confidence').textContent = `Confidence: ${confidence.toFixed(1)}%`;
  document.getElementById('model-tag').textContent       = `Model: ${data.model_name}`;

  // Confidence badge
  const badge = document.getElementById('result-badge');
  if (confidence >= 70) {
    badge.textContent  = CONFIDENCE_LABELS.high;
    badge.style.color  = '#32CD32';
    badge.style.background = 'rgba(50,205,50,0.1)';
    badge.style.borderColor = 'rgba(50,205,50,0.3)';
  } else if (confidence >= 40) {
    badge.textContent  = CONFIDENCE_LABELS.medium;
    badge.style.color  = '#FFD700';
    badge.style.background = 'rgba(255,215,0,0.1)';
    badge.style.borderColor = 'rgba(255,215,0,0.3)';
  } else {
    badge.textContent  = CONFIDENCE_LABELS.low;
    badge.style.color  = '#FF6584';
    badge.style.background = 'rgba(255,101,132,0.1)';
    badge.style.borderColor = 'rgba(255,101,132,0.3)';
  }

  // Emotion bars
  const barsContainer = document.getElementById('emotion-bars');
  barsContainer.innerHTML = '';

  data.all_emotions.forEach((em, idx) => {
    const emColor = EMOTION_COLORS[em.label] || '#8a63ff';
    const isTop   = idx === 0;

    const row = document.createElement('div');
    row.className = `emotion-row${isTop ? ' is-top' : ''}`;
    row.innerHTML = `
      <div class="emotion-row-label">
        <span>${em.emoji}</span> ${em.label}
      </div>
      <div class="bar-track">
        <div class="bar-fill" data-width="${em.confidence}"
             style="background: linear-gradient(90deg, ${emColor}99, ${emColor});"></div>
      </div>
      <div class="emotion-pct">${em.confidence.toFixed(1)}%</div>
    `;
    barsContainer.appendChild(row);
  });

  showResult();

  // Animate bars after render
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      document.querySelectorAll('.bar-fill').forEach(bar => {
        bar.style.width = bar.dataset.width + '%';
      });
    });
  });
}

// ── UI Helpers ────────────────────────────────────────────────────────────────
function setLoading(on) {
  const btn    = document.getElementById('detect-btn');
  const loader = document.getElementById('btn-loader');
  const btnTxt = btn.querySelector('.btn-text');
  const btnIco = btn.querySelector('.btn-icon');

  btn.disabled      = on;
  loader.hidden     = !on;
  btnTxt.textContent = on ? 'Analyzing...' : 'Detect Emotion';
  btnIco.style.display = on ? 'none' : '';
}

function showResult() {
  const card = document.getElementById('result-card');
  card.classList.remove('hidden');
  card.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

function hideResult() {
  document.getElementById('result-card').classList.add('hidden');
}

function showError(msg) {
  const banner = document.getElementById('error-banner');
  document.getElementById('error-msg').textContent = msg;
  banner.classList.remove('hidden');
}

function hideError() {
  document.getElementById('error-banner').classList.add('hidden');
}

function resetUI() {
  hideResult();
  hideError();
  textInput.value = '';
  charCount.textContent = '0';
  textInput.focus();
  window.scrollTo({ top: 0, behavior: 'smooth' });
}
