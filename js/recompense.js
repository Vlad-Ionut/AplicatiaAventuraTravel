(() => {
  const canvas = document.getElementById('roata-recompense');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  const btnSpin = document.getElementById('buton-invartire');
  const quizModal = document.getElementById('fereastra-quiz');
  const resultModal = document.getElementById('fereastra-rezultat');
  const confettiLayer = document.getElementById('strat-confeti');

  let segments = (window.REWARDS_BOOT && window.REWARDS_BOOT.wheel) || [];
  let spinning = false;
  let currentRotation = 0;
  let timerId = null;

  function drawWheel(highlightId) {
    const w = canvas.width;
    const h = canvas.height;
    const cx = w / 2;
    const cy = h / 2;
    const radius = Math.min(cx, cy) - 8;
    ctx.clearRect(0, 0, w, h);

    if (!segments.length) {
      ctx.fillStyle = '#e2e8f0';
      ctx.beginPath();
      ctx.arc(cx, cy, radius, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#64748b';
      ctx.font = '16px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('Fără recompense', cx, cy);
      return;
    }

    const arc = (Math.PI * 2) / segments.length;
    segments.forEach((seg, i) => {
      const start = i * arc;
      const end = start + arc;
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.arc(cx, cy, radius, start, end);
      ctx.closePath();
      ctx.fillStyle = seg.culoare || '#0f68b1';
      if (highlightId && seg.id === highlightId) {
        ctx.globalAlpha = 1;
      } else {
        ctx.globalAlpha = 0.92;
      }
      ctx.fill();
      ctx.globalAlpha = 1;
      ctx.strokeStyle = 'rgba(255,255,255,0.7)';
      ctx.lineWidth = 2;
      ctx.stroke();

      ctx.save();
      ctx.translate(cx, cy);
      ctx.rotate(start + arc / 2);
      ctx.textAlign = 'right';
      ctx.fillStyle = '#fff';
      ctx.font = 'bold 12px system-ui, sans-serif';
      const label = String(seg.nume || '').slice(0, 14);
      ctx.fillText(label, radius - 16, 4);
      ctx.restore();
    });

    ctx.beginPath();
    ctx.arc(cx, cy, 28, 0, Math.PI * 2);
    ctx.fillStyle = '#fff';
    ctx.fill();
    ctx.strokeStyle = '#082f49';
    ctx.lineWidth = 3;
    ctx.stroke();
  }

  function setCanvasRotation(deg) {
    canvas.style.transform = `rotate(${deg}deg)`;
    currentRotation = deg;
  }

  function indexForReward(rewardId) {
    const idx = segments.findIndex((s) => s.id === rewardId);
    return idx >= 0 ? idx : 0;
  }

  function rotationForIndex(index) {
    const n = segments.length || 1;
    const slice = 360 / n;
    const segmentCenter = index * slice + slice / 2;
    return 360 * 6 + (270 - segmentCenter);
  }

  function showConfetti() {
    if (!confettiLayer) return;
    confettiLayer.hidden = false;
    confettiLayer.innerHTML = '';
    const colors = ['#0f68b1', '#10b981', '#f59e0b', '#38bdf8', '#a855f7', '#ef4444'];
    for (let i = 0; i < 40; i++) {
      const el = document.createElement('span');
      el.className = 'bucata-confeti';
      el.style.left = Math.random() * 100 + '%';
      el.style.background = colors[i % colors.length];
      el.style.animationDelay = Math.random() * 0.4 + 's';
      confettiLayer.appendChild(el);
    }
    setTimeout(() => {
      confettiLayer.hidden = true;
      confettiLayer.innerHTML = '';
    }, 2200);
  }

  function openQuiz(play) {
    const q = play.question;
    document.getElementById('meta-quiz').textContent = `${q.categorie || 'Quiz'} · ${q.dificultate || ''}`;
    document.getElementById('intrebare-quiz').textContent = q.intrebare;
    const box = document.getElementById('optiuni-quiz');
    const feedback = document.getElementById('feedback-quiz');
    feedback.hidden = true;
    const opts = [
      ['A', q.optiune_a],
      ['B', q.optiune_b],
      ['C', q.optiune_c],
      ['D', q.optiune_d],
    ];
    box.innerHTML = opts
      .map(
        ([k, text]) =>
          `<button type="button" data-answer="${k}"><strong>${k}.</strong> ${escapeHtml(text)}</button>`
      )
      .join('');

    quizModal.hidden = false;
    let left = 30;
    const timerEl = document.getElementById('cronometru-quiz');
    timerEl.textContent = String(left);
    clearInterval(timerId);
    timerId = setInterval(() => {
      left -= 1;
      timerEl.textContent = String(left);
      if (left <= 0) {
        clearInterval(timerId);
        submitAnswer(play.playId, 'Z', box);
      }
    }, 1000);

    box.querySelectorAll('button').forEach((btn) => {
      btn.addEventListener('click', () => {
        clearInterval(timerId);
        submitAnswer(play.playId, btn.dataset.answer, box, btn);
      });
    });
  }

  async function submitAnswer(playId, answer, box, clickedBtn) {
    box.querySelectorAll('button').forEach((b) => (b.disabled = true));
    try {
      const res = await fetch('/api/quiz/answer', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ playId, answer: answer === 'Z' ? '' : answer }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Eroare quiz');

      const feedback = document.getElementById('feedback-quiz');
      feedback.hidden = false;

      box.querySelectorAll('button').forEach((b) => {
        if (b.dataset.answer === data.raspunsCorect) b.classList.add('corect');
      });
      if (clickedBtn && !data.corect) clickedBtn.classList.add('gresit');

      if (data.corect) {
        feedback.textContent = 'Corect! ' + (data.explicatie || '');
        feedback.style.color = '#059669';
        showConfetti();
        setTimeout(() => {
          quizModal.hidden = true;
          showResult(true, data.rewardNume, data.explicatie);
        }, 900);
      } else {
        feedback.textContent = 'Greșit. ' + (data.explicatie || `Răspuns corect: ${data.raspunsCorect}`);
        feedback.style.color = '#dc2626';
        setTimeout(() => {
          quizModal.hidden = true;
          showResult(false, data.rewardNume, data.explicatie);
        }, 1100);
      }
    } catch (e) {
      alert(e.message);
      quizModal.hidden = true;
      spinning = false;
      btnSpin.disabled = false;
    }
  }

  function showResult(won, rewardName, explanation) {
    document.getElementById('pictograma-rezultat').className = 'pictograma-rezultat ' + (won ? 'castig' : 'pierdere');
    document.getElementById('pictograma-rezultat').innerHTML = won
      ? '<i class="fa-solid fa-trophy"></i>'
      : '<i class="fa-solid fa-circle-xmark"></i>';
    document.getElementById('titlu-rezultat').textContent = won ? 'Recompensă deblocată!' : 'Recompensa a fost pierdută';
    document.getElementById('text-rezultat').textContent = won
      ? `Ai câștigat: ${rewardName}. ${explanation || ''}`
      : `Ai ratat: ${rewardName}. ${explanation || 'Încearcă din nou după următoarea rezervare.'}`;
    resultModal.hidden = false;
  }

  document.getElementById('inchide-rezultat')?.addEventListener('click', () => {
    resultModal.hidden = true;
    location.reload();
  });

  function escapeHtml(s) {
    return String(s ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  btnSpin?.addEventListener('click', async () => {
    if (spinning) return;
    spinning = true;
    btnSpin.disabled = true;
    document.getElementById('indiciu-rotire').textContent = 'Roata se învârte...';

    try {
      const res = await fetch('/api/spin', { method: 'POST', headers: { 'Content-Type': 'application/json' } });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Nu s-a putut învârti roata');

      if (data.wheelRewards?.length) segments = data.wheelRewards;
      drawWheel();

      const idx = indexForReward(data.reward.id);
      const target = rotationForIndex(idx);
      canvas.style.transition = 'none';
      setCanvasRotation(currentRotation % 360);
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          canvas.style.transition = 'transform 4s cubic-bezier(0.12, 0.75, 0.12, 1)';
          setCanvasRotation(target);
        });
      });

      setTimeout(() => {
        drawWheel(data.reward.id);
        openQuiz(data);
      }, 4200);
    } catch (e) {
      document.getElementById('indiciu-rotire').textContent = e.message;
      spinning = false;
      btnSpin.disabled = (window.REWARDS_BOOT?.spins || 0) < 1;
    }
  });

  drawWheel();
  setCanvasRotation(0);
})();
