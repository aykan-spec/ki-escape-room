// server.js - KI Escape Multiplayer (Node.js + Socket.io)
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const shortid = require('shortid');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static(path.join(__dirname, 'public')));

// Questions / rounds
const QUESTIONS = [
  { id:0, title: 'Labor - Binär', text: 'Welche Buchstaben ergeben 0100 0110 0101 0100 (ASCII)?', type:'multiple', choices:['CODE','FED','AI'], answerIndex:1 },
  { id:1, title: 'Datenbank - Wissen', text: 'Welche Aussagen sind richtig? (z.B. 2,4)', type:'text', answerText:'2,4' },
  { id:2, title: 'Neuronales Netzwerk - Rechnen', text: 'Addiere die geraden Zahlen: 3,8,12,15,20,21', type:'text', answerText:'40' },
  { id:3, title: 'Finale - Passwort', text: "Wie lautet das Passwort? Hinweis: 'Ich bin, was du mich lehrst.'", type:'text', answerText:'LERNEN' }
];

// Rooms in-memory store
// roomCode -> { hostId, players: { socketId: {name, score}}, state, questionIndex, answersThisRound, timer }
const rooms = {};

function makeRoomCode() {
  return shortid.generate().slice(0,5).toUpperCase();
}

io.on('connection', (socket) => {
  console.log('conn', socket.id);

  socket.on('create_room', ({ hostName }, ack) => {
    const code = makeRoomCode();
    rooms[code] = {
      hostId: socket.id,
      hostName: hostName || 'Host',
      players: {},
      state: 'lobby',
      questionIndex: 0,
      answersThisRound: {},
      timer: null,
      timerEndsAt: null
    };
    socket.join(code);
    ack({ ok:true, code });
    io.to(code).emit('room_update', rooms[code]);
  });

  socket.on('join_room', ({ code, name }, ack) => {
    const room = rooms[code];
    if (!room) return ack({ ok:false, error:'Raum nicht gefunden' });
    room.players[socket.id] = { name: name || 'Spieler', score: 0 };
    socket.join(code);
    io.to(code).emit('room_update', room);
    ack({ ok:true });
  });

  socket.on('start_round', ({ code, seconds }, ack) => {
    const room = rooms[code];
    if (!room) return ack({ ok:false });
    if (socket.id !== room.hostId) return ack({ ok:false, error:'Nur Host' });
    room.state = 'running';
    room.answersThisRound = {};
    // send question
    const q = QUESTIONS[room.questionIndex];
    io.to(code).emit('question', { index: room.questionIndex, question: q });
    // start timer (server-driven)
    const dur = (seconds && typeof seconds === 'number') ? seconds : 30;
    if (room.timer) clearInterval(room.timer);
    const endAt = Date.now() + dur*1000;
    room.timerEndsAt = endAt;
    io.to(code).emit('timer_start', { duration: dur, endAt });
    room.timer = setInterval(()=>{
      const remain = Math.max(0, Math.ceil((room.timerEndsAt - Date.now())/1000));
      io.to(code).emit('timer_tick', { remain });
      if (remain <= 0) {
        clearInterval(room.timer);
        room.timer = null;
        // evaluate end of round
        evaluateRound(code);
      }
    }, 500);
    ack({ ok:true });
  });

  socket.on('submit_answer', ({ code, answer }, ack) => {
    const room = rooms[code];
    if (!room || room.state !== 'running') return ack({ ok:false, error:'Kein laufendes Spiel' });
    if (room.answersThisRound[socket.id]) return ack({ ok:false, error:'Schon geantwortet' });
    const q = QUESTIONS[room.questionIndex];
    let correct = false;
    if (q.type === 'multiple') {
      const idx = parseInt(answer);
      correct = (idx === q.answerIndex);
    } else {
      let a = (''+answer).toString().trim().toUpperCase();
      let expected = (q.answerText || '').toString().trim().toUpperCase();
      if (expected.includes(',')) {
        const eParts = expected.split(',').map(x=>x.trim()).sort().join(',');
        const aParts = a.split(',').map(x=>x.trim()).sort().join(',');
        correct = (eParts === aParts);
      } else {
        correct = (a === expected);
      }
    }
    room.answersThisRound[socket.id] = { answer, correct, time: Date.now() };
    // scoring
    if (correct) {
      // base points
      room.players[socket.id].score += 10;
      // speed bonus: earlier answer -> more bonus
      const correctCount = Object.values(room.answersThisRound).filter(x=>x.correct).length;
      if (correctCount === 1) room.players[socket.id].score += 5; // first correct bonus
    }
    // broadcast partial update
    io.to(code).emit('round_update', {
      answersCount: Object.keys(room.answersThisRound).length,
      totalPlayers: Object.keys(room.players).length,
      players: room.players
    });
    ack({ ok:true, correct });
    // if all players answered, finish early
    if (Object.keys(room.answersThisRound).length >= Object.keys(room.players).length) {
      if (room.timer) {
        clearInterval(room.timer);
        room.timer = null;
      }
      evaluateRound(code);
    }
  });

  socket.on('next_question', ({ code }, ack) => {
    const room = rooms[code];
    if (!room) return ack({ ok:false });
    if (socket.id !== room.hostId) return ack({ ok:false, error:'Nur Host' });
    // advance
    room.questionIndex++;
    if (room.questionIndex >= QUESTIONS.length) {
      room.state = 'finished';
      io.to(code).emit('game_finished', { players: room.players });
    } else {
      room.state = 'lobby';
      io.to(code).emit('room_update', room);
    }
    ack({ ok:true });
  });

  socket.on('disconnect', () => {
    // remove player from any room
    for (const code in rooms) {
      const room = rooms[code];
      if (room.players[socket.id]) {
        delete room.players[socket.id];
        io.to(code).emit('room_update', room);
      }
      if (room.hostId === socket.id) {
        // host left -> close room
        io.to(code).emit('room_closed');
        if (room.timer) clearInterval(room.timer);
        delete rooms[code];
      }
    }
  });
});

function evaluateRound(code) {
  const room = rooms[code];
  if (!room) return;
  // reveal correct answers and update scores already done
  const q = QUESTIONS[room.questionIndex];
  // send round_result with which players were correct
  const results = Object.keys(room.players).map(id => {
    return {
      id,
      name: room.players[id].name,
      score: room.players[id].score,
      answered: !!room.answersThisRound[id],
      correct: room.answersThisRound[id] ? room.answersThisRound[id].correct : false
    };
  });
  io.to(code).emit('round_result', { questionIndex: room.questionIndex, results, correctAnswer: q.answerIndex !== undefined ? q.answerIndex : q.answerText });
  // prepare for next state (host must click next to proceed)
  room.state = 'between';
  io.to(code).emit('room_update', room);
}

const PORT = process.env.PORT || 3000;
server.listen(PORT, ()=> console.log('Server running on port', PORT));
