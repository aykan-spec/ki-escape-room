const socket = io();
let myRoom = null;
let amHost = false;
let myId = null;
let currentQuestion = null;
let timerInterval = null;

// DOM
const createBtn = document.getElementById('createBtn');
const joinBtn = document.getElementById('joinBtn');
const startRoundBtn = document.getElementById('startRoundBtn');
const nextBtn = document.getElementById('nextBtn');
const roomInfo = document.getElementById('roomInfo');
const roomCodeChip = document.getElementById('roomCode');
const questionArea = document.getElementById('questionArea');
const answerArea = document.getElementById('answerArea');
const scoreboard = document.getElementById('scoreboard');
const timerDisplay = document.getElementById('timerDisplay');

function beep(vol=0.1, freq=440, duration=150){ try { const ctx = new (window.AudioContext||window.webkitAudioContext)(); const o = ctx.createOscillator(); const g = ctx.createGain(); o.type='sine'; o.frequency.value=freq; g.gain.value=vol; o.connect(g); g.connect(ctx.destination); o.start(0); g.gain.exponentialRampToValueAtTime(0.00001, ctx.currentTime + duration/1000); setTimeout(()=>{ o.stop(); ctx.close(); }, duration); } catch(e){} }

createBtn.onclick = ()=>{
  const hostName = document.getElementById('hostName').value || 'Lehrer';
  socket.emit('create_room', { hostName }, (res)=>{
    if(res.ok){
      myRoom = res.code;
      amHost = true;
      roomInfo.innerText = 'Raum erstellt: ' + myRoom;
      roomCodeChip.innerText = myRoom;
      showGame();
      startRoundBtn.style.display = 'inline-block';
      startRoundBtn.innerText = 'Start Runde (30s)';
    }
  });
};

joinBtn.onclick = ()=>{
  const code = document.getElementById('joinCode').value.trim().toUpperCase();
  const name = document.getElementById('playerName').value || 'Spieler';
  if(!code){ alert('Bitte Raumcode eingeben'); return; }
  socket.emit('join_room', { code, name }, (res)=>{
    if(res.ok){
      myRoom = code;
      amHost = false;
      roomCodeChip.innerText = myRoom;
      roomInfo.innerText = 'Verbunden mit Raum ' + myRoom;
      showGame();
    } else {
      alert('Raum nicht gefunden');
    }
  });
};

startRoundBtn.onclick = ()=>{
  if(!myRoom) return;
  socket.emit('start_round', { code: myRoom, seconds: 30 }, (res)=>{
    if(!res.ok) alert('Fehler: ' + (res.error||''));
  });
};

nextBtn.onclick = ()=>{
  socket.emit('next_question', { code: myRoom }, (res)=>{});
};

socket.on('room_update', (room)=>{
  // update scoreboard
  updateScoreboard(room.players);
});

socket.on('question', ({ index, question })=>{
  currentQuestion = question;
  renderQuestion(question);
  beep(0.08,880,100);
});

socket.on('timer_start', ({ duration, endAt })=>{
  const update = ()=>{
    const remain = Math.max(0, Math.ceil((endAt - Date.now())/1000));
    timerDisplay.innerText = 'Zeit: ' + String(remain).padStart(2,'0') + 's';
    const pct = Math.max(0, (remain/duration)*100);
    renderProgress(pct);
    if(remain <= 0) clearInterval(timerInterval);
  };
  clearInterval(timerInterval);
  update();
  timerInterval = setInterval(update, 250);
});

socket.on('timer_tick', ({ remain })=>{
  timerDisplay.innerText = 'Zeit: ' + String(remain).padStart(2,'0') + 's';
});

socket.on('round_update', (data)=>{
  updateScoreboard(data.players);
});

socket.on('round_result', ({ questionIndex, results, correctAnswer })=>{
  // show results
  let html = '<h3>Ergebnis</h3>';
  html += '<ul>';
  results.forEach(r=>{
    html += '<li>' + r.name + ': ' + r.score + ' Punkte - ' + (r.correct? '<span class="correct">Richtig</span>':'<span class="wrong">Falsch</span>') + '</li>';
  });
  html += '</ul>';
  questionArea.innerHTML = html;
  answerArea.innerHTML = '';
  // show next button for host
  nextBtn.style.display = 'inline-block';
  if(amHost) nextBtn.style.display = 'inline-block';
  beep(0.12,440,220);
});

socket.on('game_finished', ({ players })=>{
  // show final ranking
  const arr = Object.values(players).sort((a,b)=>b.score-a.score);
  let html = '<h2>Spiel beendet — Rangliste</h2><ol>';
  arr.forEach(p=> html += '<li>' + p.name + ' — ' + p.score + ' Punkte</li>');
  html += '</ol>';
  questionArea.innerHTML = html;
  answerArea.innerHTML = '';
  updateScoreboard(players);
  beep(0.18,660,300);
});

function renderQuestion(q){
  let html = '<h3>' + q.title + '</h3><p>' + q.text + '</p>';
  questionArea.innerHTML = html;
  if(q.type === 'multiple'){
    let bhtml = '';
    q.choices.forEach((c,i)=>{
      bhtml += `<button class="choiceBtn" onclick="submitAnswer('${i}')">${c}</button>`;
    });
    answerArea.innerHTML = bhtml;
  } else {
    answerArea.innerHTML = `<input id="freeAnswer" placeholder="Antwort eingeben"><button onclick="submitAnswer(document.getElementById('freeAnswer').value)">Senden</button>`;
  }
  nextBtn.style.display = 'none';
}

function submitAnswer(ans){
  if(!myRoom) return;
  socket.emit('submit_answer', { code: myRoom, answer: ans }, (res)=>{
    if(res.ok){
      if(res.correct) {
        alert('✅ Richtig!');
        beep(0.12,880,140);
      } else {
        alert('❌ Falsch!');
        beep(0.06,220,140);
      }
    } else {
      alert(res.error || 'Fehler');
    }
  });
}

function updateScoreboard(players){
  const list = Object.values(players).map(p=>`<div class="playerRow"><strong>${escapeHtml(p.name)}</strong><span>${p.score} pts</span></div>`).join('');
  scoreboard.innerHTML = '<h4>Punktestand</h4>' + list;
}

function renderProgress(pct){
  let html = `<div class="progress"><div class="bar" style="width:${pct}%"></div></div>`;
  document.getElementById('questionArea').insertAdjacentHTML('beforeend', html);
}

function showGame(){
  document.getElementById('lobbyCard').style.display = 'none';
  document.getElementById('gameCard').style.display = 'block';
}

function escapeHtml(unsafe){
    return unsafe.replace(/[&<"']/g, function(m){ return ({'&':'&amp;','<':'&lt;','"':'&quot;',"'":'&#039;'}[m]); });
}
