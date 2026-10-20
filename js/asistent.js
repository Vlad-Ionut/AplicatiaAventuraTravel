const log = document.getElementById('jurnal-chat');
const form = document.getElementById('formular-chat');
const input = document.getElementById('camp-chat');

function adaugaMesaj(text, tip) {
  const div = document.createElement('div');
  div.className = 'mesaj-chat ' + tip;
  div.textContent = text;
  log.appendChild(div);
  log.scrollTop = log.scrollHeight;
}

async function trimite(mesaj) {
  adaugaMesaj(mesaj, 'utilizator');
  input.value = '';
  const res = await fetch('/api/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ mesaj }),
  });
  const data = await res.json();
  adaugaMesaj(data.raspuns || data.error || 'Eroare', 'asistent');
}

form.addEventListener('submit', (e) => {
  e.preventDefault();
  const m = input.value.trim();
  if (m) trimite(m);
});

document.querySelectorAll('.sugestii-chat button').forEach((btn) => {
  btn.addEventListener('click', () => trimite(btn.dataset.q));
});

adaugaMesaj('Salut! Sunt asistentul Aventura Travel. Cu ce te pot ajuta?', 'asistent');
