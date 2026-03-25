const loginBtn  = document.getElementById('loginBtn');
const btnSpinner= document.getElementById('btnSpinner');
const errorMsg  = document.getElementById('errorMsg');
const errorText = document.getElementById('errorText');
const togglePw  = document.getElementById('togglePw');
const pwInput   = document.getElementById('password');
const userInput = document.getElementById('username');

togglePw.addEventListener('click', () => {
  pwInput.type = pwInput.type === 'text' ? 'password' : 'text';
});

[userInput, pwInput].forEach(el =>
  el.addEventListener('keydown', e => { if (e.key === 'Enter') doLogin(); })
);

loginBtn.addEventListener('click', doLogin);

async function doLogin() {
  const username = userInput.value.trim();
  const password = pwInput.value.trim();
  if (!username || !password) { showError('Please fill in all fields.'); return; }

  setLoading(true); hideError();

  try {
    const res  = await fetch('/api/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password })
    });
    const data = await res.json();

    if (data.success) {
      loginBtn.style.background = 'linear-gradient(135deg,#34d399,#10b981)';
      loginBtn.querySelector('.btn-text').textContent = 'Authenticated ✓';
      setTimeout(() => { window.location.href = '/upload'; }, 600);
    } else {
      setLoading(false);
      showError(data.message || 'Invalid credentials. Please try again.');
      shakeCard();
    }
  } catch {
    setLoading(false);
    showError('Network error. Is the server running?');
  }
}

function setLoading(on) {
  loginBtn.disabled = on;
  loginBtn.classList.toggle('loading', on);
}
function showError(msg) { errorText.textContent = msg; errorMsg.classList.add('show'); }
function hideError()    { errorMsg.classList.remove('show'); }

function shakeCard() {
  const card  = document.getElementById('loginCard');
  const steps = [10,-10,8,-8,5,-5,0];
  let i = 0;
  card.style.transition = 'transform 0.05s';
  const id = setInterval(() => {
    card.style.transform = `translateX(${steps[i++]}px)`;
    if (i >= steps.length) { clearInterval(id); card.style.transform = ''; }
  }, 50);
}