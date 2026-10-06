(() => {
  'use strict';
  const $ = (s) => document.querySelector(s);
  const socket = io();

  const state = {
    me: null,
    channels: [],
    users: [],
    active: 'ch:general',
    convs: {},
    replyTarget: null,
    isBombActive: false,
    mediaRecorder: null,
    audioChunks: []
  };

  const EMOJIS = ['😀', '😂', '🔥', '🚀', '❤️', '👍', '🎉', '👀', '💡', '✨'];

  const esc = (s) => String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  const time = (ts) => new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  const keyIsDm = (k) => k.startsWith('dm:');
  const peerOf = (k) => k.slice(3);

  // Theme switch
  $('#themeBtn').onclick = () => {
    const next = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
    document.documentElement.dataset.theme = next;
    localStorage.setItem('convox-theme', next);
  };

  // Bomb toggle
  $('#bombToggle').onclick = () => {
    state.isBombActive = !state.isBombActive;
    $('#bombToggle').classList.toggle('active', state.isBombActive);
  };

  // Reply handlers
  function setReply(msg) {
    state.replyTarget = msg;
    $('#replyUser').textContent = msg.from;
    $('#replyMsg').textContent = msg.type === 'audio' ? '🎙️ Voice message' : msg.text;
    $('#replyPreview').hidden = false;
    $('#input').focus();
  }
  $('#cancelReply').onclick = () => {
    state.replyTarget = null;
    $('#replyPreview').hidden = true;
  };

  // Voice recording
  const recordBtn = $('#recordBtn');
  recordBtn.onclick = async () => {
    if (state.mediaRecorder && state.mediaRecorder.state === 'recording') {
      state.mediaRecorder.stop();
      recordBtn.classList.remove('recording');
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      state.mediaRecorder = new MediaRecorder(stream);
      state.audioChunks = [];

      state.mediaRecorder.ondataavailable = (e) => state.audioChunks.push(e.data);
      state.mediaRecorder.onstop = () => {
        const audioBlob = new Blob(state.audioChunks, { type: 'audio/webm' });
        const reader = new FileReader();
        reader.readAsDataURL(audioBlob);
        reader.onloadend = () => {
          socket.emit('message', {
            to: state.active,
            type: 'audio',
            audioData: reader.result,
            replyTo: state.replyTarget
          });
          state.replyTarget = null;
          $('#replyPreview').hidden = true;
        };
      };

      state.mediaRecorder.start();
      recordBtn.classList.add('recording');
    } catch (e) {
      alert('Microphone permission required to record.');
    }
  };

  // Message element renderer
  function msgEl(m) {
    const own = m.from === state.me;
    const el = document.createElement('div');
    el.className = `msg ${own ? 'self' : 'other'}`;
    el.dataset.id = m.id;

    let contentHtml = '';
    if (m.replyTo) {
      contentHtml += `<div class="quote-bubble"><strong>@${esc(m.replyTo.from)}:</strong> ${esc(m.replyTo.text || '🎙️ Voice')}</div>`;
    }

    if (m.type === 'poll') {
      const total = m.poll.options.reduce((a, b) => a + b.votes.length, 0);
      contentHtml += `<div class="poll-box">
        <div class="poll-title">📊 ${esc(m.poll.question)}</div>
        ${m.poll.options.map((opt, i) => {
          const pct = total ? Math.round((opt.votes.length / total) * 100) : 0;
          return `<button class="poll-opt" data-poll-idx="${i}">
            <div class="poll-fill" style="width:${pct}%"></div>
            <span>${esc(opt.text)}</span>
            <span>${pct}\% (${opt.votes.length})</span>
          </button>`;
        }).join('')}
      </div>`;
    } else if (m.type === 'audio') {
      contentHtml += `<div class="audio-msg"><audio controls src="${m.audioData}"></audio></div>`;
    } else {
      contentHtml += `<div class="text">${esc(m.text)}</div>`;
    }

    el.innerHTML = `
      <div class="bubble">
        <div class="msg-actions">
          <button data-action="reply">↩</button>
        </div>
        ${!own && !keyIsDm(m.to) ? `<div class="author">${esc(m.from)}</div>` : ''}
        ${contentHtml}
        <div style="font-size:10px; opacity:0.6; text-align:right; margin-top:4px;">
          ${time(m.ts)} ${m.bomb ? '• 💣 10s' : ''}
        </div>
      </div>
    `;

    if (m.bomb) {
      setTimeout(() => {
        el.style.transition = 'opacity 0.4s';
        el.style.opacity = '0';
        setTimeout(() => el.remove(), 400);
      }, 10000);
    }

    return el;
  }

  function renderMessages() {
    const box = $('#messages');
    const list = state.convs[state.active] || [];
    box.innerHTML = '';
    list.forEach((m) => box.appendChild(msgEl(m)));
    box.scrollTop = box.scrollHeight;
  }

  // Delegated clicks for replies & polls
  $('#messages').onclick = (e) => {
    const msgCard = e.target.closest('.msg');
    if (!msgCard) return;
    const msgId = Number(msgCard.dataset.id);
    const m = (state.convs[state.active] || []).find((x) => x.id === msgId);

    const btn = e.target.closest('button');
    if (!btn) return;

    if (btn.dataset.action === 'reply') {
      setReply(m);
    } else if (btn.classList.contains('poll-opt')) {
      socket.emit('vote-poll', { to: state.active, id: msgId, optionIdx: Number(btn.dataset.pollIdx) });
    }
  };

  function switchTo(key) {
    state.active = key;
    renderSidebar();
    renderHeader();
    renderMessages();
    $('#app').classList.remove('drawer-open');
  }

  function renderSidebar() {
    $('#channelList').innerHTML = state.channels.map((c) => `
      <li>
        <button class="conv ${state.active === `ch:${c}` ? 'active' : ''}" data-key="ch:${c}">
          <span>#</span>
          <span class="name">${esc(c)}</span>
        </button>
      </li>
    `).join('');

    const others = state.users.filter((u) => u.name !== state.me);
    $('#userList').innerHTML = others.map((u) => `
      <li>
        <button class="conv ${state.active === `dm:${u.name}` ? 'active' : ''}" data-key="dm:${u.name}">
          <span class="avatar" style="background:#6366f1">${u.name[0].toUpperCase()}
            <span class="dot"></span>
          </span>
          <span class="name">${esc(u.name)}</span>
        </button>
      </li>
    `).join('');

    $('#meBar').innerHTML = `<span class="avatar" style="background:#4f46e5">${state.me ? state.me[0].toUpperCase() : ''}</span><span>${esc(state.me || '')}</span>`;
  }

  function renderHeader() {
    if (keyIsDm(state.active)) {
      $('#chatTitle').textContent = `@${peerOf(state.active)}`;
      $('#chatSub').textContent = 'Direct Message';
    } else {
      $('#chatTitle').textContent = `# ${state.active.slice(3)}`;
      $('#chatSub').textContent = `${state.users.length} active online`;
    }
  }

  document.addEventListener('click', (e) => {
    const b = e.target.closest('.conv');
    if (b) switchTo(b.dataset.key);
  });

  // Sending messages & polls
  function send() {
    const input = $('#input');
    const text = input.value.trim();
    if (!text) return;

    if (text.startsWith('/poll ')) {
      const parts = text.slice(6).split('|').map((s) => s.trim());
      if (parts.length >= 3) {
        socket.emit('message', {
          to: state.active,
          type: 'poll',
          poll: {
            question: parts[0],
            options: parts.slice(1).map((opt) => ({ text: opt, votes: [] }))
          }
        });
        input.value = '';
        return;
      }
    }

    socket.emit('message', {
      to: state.active,
      type: 'text',
      text,
      bomb: state.isBombActive,
      replyTo: state.replyTarget
    });

    input.value = '';
    state.replyTarget = null;
    $('#replyPreview').hidden = true;
  }

  $('#composer').onsubmit = (e) => { e.preventDefault(); send(); };
  $('#input').onkeydown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      send();
    }
  };

  // Emoji picker popup
  $('#emojiPop').innerHTML = EMOJIS.map((em) => `<button type="button">${em}</button>`).join('');
  $('#emojiBtn').onclick = () => { $('#emojiPop').hidden = !$('#emojiPop').hidden; };
  $('#emojiPop').onclick = (e) => {
    if (e.target.tagName === 'BUTTON') {
      $('#input').value += e.target.textContent;
      $('#emojiPop').hidden = true;
      $('#input').focus();
    }
  };

  // Drawer for mobile
  $('#menuBtn').onclick = () => $('#app').classList.add('drawer-open');
  $('#scrim').onclick = () => $('#app').classList.remove('drawer-open');

  // Socket listener events
  socket.on('message', (m) => {
    (state.convs[m.to] ||= []).push(m);
    if (m.to === state.active) {
      const box = $('#messages');
      box.appendChild(msgEl(m));
      box.scrollTop = box.scrollHeight;
    }
  });

  socket.on('update-poll', ({ id, poll, to }) => {
    const list = state.convs[to] || [];
    const item = list.find((m) => m.id === id);
    if (item) {
      item.poll = poll;
      if (to === state.active) renderMessages();
    }
  });

  socket.on('users', (users) => {
    state.users = users;
    renderSidebar();
    renderHeader();
  });

  // Login handler with inline error display
  $('#loginForm').onsubmit = (e) => {
    e.preventDefault();
    const name = $('#nameInput').value.trim();
    $('#loginError').textContent = '';

    socket.emit('join', name, (res) => {
      if (!res.ok) {
        $('#loginError').textContent = res.error;
        return;
      }
      state.me = res.name;
      state.channels = res.channels;
      res.channels.forEach((c) => { state.convs[`ch:${c}`] = res.history[c] || []; });
      
      // Hide login and reveal app screen
      $('#login').hidden = true;
      $('#app').hidden = false;
      switchTo(state.active);
    });
  };
})();