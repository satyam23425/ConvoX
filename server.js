const path = require('path');
const http = require('http');
const express = require('express');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);

// Enable payload for base64 audio snippets (5mb)
const io = new Server(server, { maxHttpBufferSize: 5e6 });

app.use(express.static(path.join(__dirname, 'public')));

const CHANNELS = ['general', 'random', 'dev', 'design'];
const byId = new Map();
const byName = new Map();
const history = Object.fromEntries(CHANNELS.map((c) => [c, []]));
let seq = 0;

function resolve(user, to) {
  if (typeof to !== 'string') return null;
  if (to.startsWith('ch:')) {
    const ch = to.slice(3);
    return CHANNELS.includes(ch) ? { type: 'ch', room: `ch:${ch}`, ch } : null;
  }
  if (to.startsWith('dm:')) {
    const peer = byName.get(to.slice(3).toLowerCase());
    return peer ? { type: 'dm', peer } : null;
  }
  return null;
}

io.on('connection', (socket) => {
  socket.on('join', (name, ack) => {
    if (!name || name.length > 20) return ack({ ok: false, error: 'Invalid alias.' });
    if (byName.has(name.toLowerCase())) return ack({ ok: false, error: 'Name already active.' });

    const user = { id: socket.id, name, status: 'online' };
    byId.set(socket.id, user);
    byName.set(name.toLowerCase(), user);

    CHANNELS.forEach((c) => socket.join(`ch:${c}`));
    ack({ ok: true, name, channels: CHANNELS, history });
    io.emit('users', [...byId.values()]);
  });

  socket.on('message', (data) => {
    const user = byId.get(socket.id);
    if (!user) return;
    const target = resolve(user, data.to);
    if (!target) return;

    const msg = {
      id: ++seq,
      from: user.name,
      to: data.to,
      type: data.type || 'text',
      text: data.text || '',
      audioData: data.audioData || null,
      poll: data.poll || null,
      bomb: !!data.bomb,
      replyTo: data.replyTo || null,
      ts: Date.now()
    };

    if (target.type === 'ch') {
      if (!msg.bomb) {
        history[target.ch].push(msg);
        if (history[target.ch].length > 40) history[target.ch].shift();
      }
      io.to(target.room).emit('message', msg);
    } else {
      io.to(target.peer.id).emit('message', { ...msg, to: `dm:${user.name}` });
      socket.emit('message', { ...msg, to: `dm:${target.peer.name}` });
    }
  });

  // Dynamic Poll Voting
  socket.on('vote-poll', ({ to, id, optionIdx }) => {
    const user = byId.get(socket.id);
    if (!user) return;
    const target = resolve(user, to);
    if (!target || target.type !== 'ch') return;

    const msg = history[target.ch].find((m) => m.id === id);
    if (msg && msg.poll && msg.poll.options[optionIdx]) {
      // Remove any prior vote by user in this poll
      msg.poll.options.forEach((opt) => {
        opt.votes = opt.votes.filter((u) => u !== user.name);
      });
      // Add current vote
      msg.poll.options[optionIdx].votes.push(user.name);
      io.to(target.room).emit('update-poll', { id, poll: msg.poll, to });
    }
  });

  socket.on('disconnect', () => {
    const user = byId.get(socket.id);
    if (user) {
      byName.delete(user.name.toLowerCase());
      byId.delete(socket.id);
      io.emit('users', [...byId.values()]);
    }
  });
});

server.listen(3000, () => console.log('ConvoX server live on http://localhost:3000'));