(() => {

  'use strict';


  const $ = (selector) =>
    document.querySelector(selector);


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

    audioChunks: [],

    authMode: 'login'

  };


  const EMOJIS = [
    '😀',
    '😂',
    '🔥',
    '🚀',
    '❤️',
    '👍',
    '🎉',
    '👀',
    '💡',
    '✨',
    '😎',
    '🙌',
    '💯',
    '🎯',
    '👏'
  ];


  /* =========================
     HELPERS
  ========================= */


  const esc = (value) => {

    return String(value ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');

  };


  const time = (timestamp) => {

    return new Date(timestamp)
      .toLocaleTimeString([], {
        hour: '2-digit',
        minute: '2-digit'
      });

  };


  const keyIsDm = (key) =>
    key.startsWith('dm:');


  const peerOf = (key) =>
    key.slice(3);


  /* =========================
     THEME
  ========================= */


  function setTheme() {

    const next =
      document.documentElement.dataset.theme === 'dark'
        ? 'light'
        : 'dark';


    document.documentElement.dataset.theme =
      next;


    localStorage.setItem(
      'convox-theme',
      next
    );

  }


  $('#themeBtn').onclick =
    setTheme;


  $('#authThemeBtn').onclick =
    setTheme;


  /* =========================
     AUTH UI
  ========================= */


  function setAuthMode(mode) {

    state.authMode = mode;


    const signup =
      mode === 'signup';


    $('#loginTab')
      .classList
      .toggle(
        'active',
        !signup
      );


    $('#signupTab')
      .classList
      .toggle(
        'active',
        signup
      );


    $('#authEyebrow')
      .textContent =
      signup
        ? 'NEW TO CONVOX'
        : 'WELCOME BACK';


    $('#authTitle')
      .textContent =
      signup
        ? 'Create your account'
        : 'Sign in to ConvoX';


    $('#authSubtitle')
      .textContent =
      signup
        ? 'Set up your account and start chatting.'
        : 'Continue to your conversations.';


    $('#confirmField').hidden =
      !signup;


    $('#authPassword')
      .autocomplete =
      signup
        ? 'new-password'
        : 'current-password';


    $('#authSubmitText')
      .textContent =
      signup
        ? 'Create account'
        : 'Sign in';


    $('#authFooter')
      .innerHTML = signup

        ? `
          Already have an account?
          <button type="button" id="switchAuth">
            Sign in
          </button>
        `

        : `
          Don't have an account?
          <button type="button" id="switchAuth">
            Create one
          </button>
        `;


    $('#authError')
      .textContent = '';


    $('#authName').focus();


    $('#switchAuth').onclick = () => {

      setAuthMode(
        signup
          ? 'login'
          : 'signup'
      );

    };

  }


  $('#loginTab').onclick = () =>
    setAuthMode('login');


  $('#signupTab').onclick = () =>
    setAuthMode('signup');


  /* =========================
     PASSWORD VISIBILITY
  ========================= */


  $('#passwordToggle').onclick = () => {

    const input =
      $('#authPassword');


    const visible =
      input.type === 'text';


    input.type =
      visible
        ? 'password'
        : 'text';


    $('#passwordToggle')
      .textContent =
      visible
        ? 'Show'
        : 'Hide';

  };


  /* =========================
     LOGIN / SIGNUP
  ========================= */


  $('#authForm').onsubmit = (event) => {

    event.preventDefault();


    const username =
      $('#authName')
        .value
        .trim();


    const password =
      $('#authPassword')
        .value;


    const confirm =
      $('#authConfirm')
        .value;


    const signup =
      state.authMode === 'signup';


    $('#authError')
      .textContent = '';


    if (
      !/^[a-zA-Z0-9_]{3,20}$/
        .test(username)
    ) {

      $('#authError')
        .textContent =
        'Username must be 3–20 characters using letters, numbers or _.';

      return;

    }


    if (password.length < 6) {

      $('#authError')
        .textContent =
        'Password must contain at least 6 characters.';

      return;

    }


    if (
      signup &&
      password !== confirm
    ) {

      $('#authError')
        .textContent =
        'Passwords do not match.';

      return;

    }


    const eventName =
      signup
        ? 'signup'
        : 'login';


    const button =
      $('#authSubmit');


    button.disabled = true;


    $('#authSubmitText')
      .textContent =
      signup
        ? 'Creating...'
        : 'Signing in...';


    socket.emit(
      eventName,
      {
        name: username,
        password
      },

      (response) => {

        button.disabled = false;


        $('#authSubmitText')
          .textContent =
          signup
            ? 'Create account'
            : 'Sign in';


        if (!response?.ok) {

          $('#authError')
            .textContent =
            response?.error ||
            'Something went wrong.';

          return;

        }


        initializeApp(response);

      }

    );

  };


  /* =========================
     INITIALIZE APP
  ========================= */


  function initializeApp(response) {

    state.me =
      response.name;


    state.channels =
      response.channels;


    state.users =
      response.users || [];


    state.convs = {};


    response.channels.forEach(
      (channel) => {

        state.convs[
          `ch:${channel}`
        ] =
          response.history[channel] ||
          [];

      }
    );


    $('#authScreen').hidden =
      true;


    $('#app').hidden =
      false;


    $('#meName')
      .textContent =
      state.me;


    $('#meAvatar')
      .textContent =
      state.me[0]
        .toUpperCase();


    switchTo(
      state.active
    );


    $('#input').focus();

  }


  /* =========================
     LOGOUT
  ========================= */


  function logout() {

    socket.emit('logout');


    state.me = null;

    state.convs = {};


    $('#app').hidden =
      true;


    $('#authScreen').hidden =
      false;


    $('#authName').value = '';

    $('#authPassword').value = '';

    $('#authConfirm').value = '';


    setAuthMode('login');

  }


  $('#logoutBtn').onclick =
    logout;


  /* =========================
     BOMB MODE
  ========================= */


  $('#bombToggle').onclick = () => {

    state.isBombActive =
      !state.isBombActive;


    $('#bombToggle')
      .classList
      .toggle(
        'active',
        state.isBombActive
      );


    $('#bombToggle').title =
      state.isBombActive
        ? 'Bomb mode ON'
        : 'Bomb mode OFF';

  };


  /* =========================
     REPLY
  ========================= */


  function setReply(message) {

    state.replyTarget =
      message;


    $('#replyUser')
      .textContent =
      message.from;


    $('#replyMsg')
      .textContent =
      message.type === 'audio'
        ? '🎙 Voice message'
        : (
            message.text ||
            'Message'
          );


    $('#replyPreview')
      .hidden =
      false;


    $('#input').focus();

  }


  $('#cancelReply').onclick = () => {

    state.replyTarget =
      null;


    $('#replyPreview')
      .hidden =
      true;

  };


  /* =========================
     VOICE RECORDING
  ========================= */


  $('#recordBtn').onclick =
    async () => {

      if (
        state.mediaRecorder &&
        state.mediaRecorder.state ===
        'recording'
      ) {

        state.mediaRecorder.stop();


        $('#recordBtn')
          .classList
          .remove('recording');


        return;

      }


      try {

        const stream =
          await navigator
            .mediaDevices
            .getUserMedia({
              audio: true
            });


        state.mediaRecorder =
          new MediaRecorder(
            stream
          );


        state.audioChunks = [];


        state.mediaRecorder
          .ondataavailable =
          (event) => {

            state.audioChunks
              .push(event.data);

          };


        state.mediaRecorder
          .onstop = () => {

            stream
              .getTracks()
              .forEach(
                track =>
                  track.stop()
              );


            const blob =
              new Blob(
                state.audioChunks,
                {
                  type:
                    'audio/webm'
                }
              );


            const reader =
              new FileReader();


            reader.onloadend = () => {

              socket.emit(
                'message',
                {
                  to:
                    state.active,

                  type:
                    'audio',

                  audioData:
                    reader.result,

                  replyTo:
                    state.replyTarget
                }
              );


              state.replyTarget =
                null;


              $('#replyPreview')
                .hidden =
                true;

            };


            reader.readAsDataURL(
              blob
            );

          };


        state.mediaRecorder.start();


        $('#recordBtn')
          .classList
          .add('recording');

      }

      catch {

        alert(
          'Microphone permission is required.'
        );

      }

    };


  /* =========================
     MESSAGE RENDERER
  ========================= */


  function msgEl(message) {

    const own =
      message.from ===
      state.me;


    const element =
      document.createElement(
        'div'
      );


    element.className =
      `msg ${
        own
          ? 'self'
          : 'other'
      }`;


    element.dataset.id =
      message.id;


    let content = '';


    if (message.replyTo) {

      content += `

        <div class="quote-bubble">

          <strong>
            @${esc(message.replyTo.from)}:
          </strong>

          ${esc(
            message.replyTo.text ||
            '🎙 Voice message'
          )}

        </div>

      `;

    }


    if (
      message.type === 'poll' &&
      message.poll
    ) {

      const total =
        message.poll.options
          .reduce(
            (sum, option) =>
              sum +
              option.votes.length,
            0
          );


      content += `

        <div class="poll-box">

          <div class="poll-title">

            📊
            ${esc(
              message.poll.question
            )}

          </div>

          ${message.poll.options
            .map(
              (option, index) => {

                const percentage =
                  total
                    ? Math.round(
                        (
                          option
                            .votes
                            .length /
                          total
                        ) * 100
                      )
                    : 0;


                return `

                  <button
                    class="poll-opt"
                    data-poll-idx="${index}"
                  >

                    <div
                      class="poll-fill"
                      style="
                        width:${percentage}%
                      "
                    ></div>

                    <span>
                      ${esc(
                        option.text
                      )}
                    </span>

                    <span>
                      ${percentage}%
                      (${option.votes.length})
                    </span>

                  </button>

                `;

              }
            )
            .join('')}

        </div>

      `;

    }


    else if (
      message.type ===
      'audio'
    ) {

      content += `

        <div class="audio-msg">

          <audio
            controls
            src="${message.audioData}"
          ></audio>

        </div>

      `;

    }


    else {

      content += `

        <div class="text">

          ${esc(message.text)}

        </div>

      `;

    }


    element.innerHTML = `

      <div class="bubble">

        <div class="msg-actions">

          <button
            data-action="reply"
            title="Reply"
          >
            ↩
          </button>

        </div>


        ${
          !own &&
          !keyIsDm(message.to)

            ? `
              <div class="author">
                ${esc(message.from)}
              </div>
            `

            : ''
        }


        ${content}


        <div
          style="
            font-size:9px;
            opacity:.58;
            text-align:right;
            margin-top:4px;
          "
        >

          ${time(message.ts)}

          ${
            message.bomb
              ? ' • 💣 10s'
              : ''
          }

        </div>

      </div>

    `;


    if (message.bomb) {

      setTimeout(
        () => {

          element.style.transition =
            'opacity .4s, transform .4s';


          element.style.opacity =
            '0';


          element.style.transform =
            'scale(.96)';


          setTimeout(
            () =>
              element.remove(),
            400
          );

        },

        10000
      );

    }


    return element;

  }


  /* =========================
     RENDER MESSAGES
  ========================= */


  function renderMessages() {

    const box =
      $('#messages');


    const list =
      state.convs[
        state.active
      ] || [];


    box.innerHTML =
      '';


    if (!list.length) {

      box.innerHTML = `

        <div class="empty-state">

          <div class="empty-icon">

            ${
              keyIsDm(
                state.active
              )
                ? '👋'
                : '💬'
            }

          </div>


          <h3>

            ${
              keyIsDm(
                state.active
              )

                ? 'Say hello!'

                : 'Start the conversation'

            }

          </h3>


          <p>

            ${
              keyIsDm(
                state.active
              )

                ? `Send a private message to
                   ${esc(
                     peerOf(
                       state.active
                     )
                   )}.`

                : 'Send a message, create a poll, or share a voice note.'

            }

          </p>

        </div>

      `;

      return;

    }


    list.forEach(
      message =>
        box.appendChild(
          msgEl(message)
        )
    );


    box.scrollTop =
      box.scrollHeight;

  }


  /* =========================
     MESSAGE ACTIONS
  ========================= */


  $('#messages').onclick =
    (event) => {

      const card =
        event.target.closest(
          '.msg'
        );


      if (!card) return;


      const id =
        Number(
          card.dataset.id
        );


      const message =
        (
          state.convs[
            state.active
          ] || []
        )
        .find(
          item =>
            item.id === id
        );


      if (!message) return;


      const button =
        event.target.closest(
          'button'
        );


      if (!button) return;


      if (
        button.dataset.action ===
        'reply'
      ) {

        setReply(message);

      }


      else if (
        button.classList.contains(
          'poll-opt'
        )
      ) {

        socket.emit(
          'vote-poll',
          {
            to:
              state.active,

            id,

            optionIdx:
              Number(
                button.dataset
                  .pollIdx
              )
          }
        );

      }

    };


  /* =========================
     SWITCH CHAT
  ========================= */


  function switchTo(key) {

    state.active =
      key;


    renderSidebar();


    renderHeader();


    renderMessages();


    $('#input')
      .placeholder =
      keyIsDm(key)

        ? `Message @${peerOf(key)}`

        : `Message #${key.slice(3)}`;


    $('#app')
      .classList
      .remove(
        'drawer-open'
      );

  }


  /* =========================
     SIDEBAR
  ========================= */


  function renderSidebar(
    filter = ''
  ) {

    const query =
      filter.toLowerCase();


    const channels =
      state.channels.filter(
        channel =>
          channel
            .toLowerCase()
            .includes(query)
      );


    $('#channelCount')
      .textContent =
      channels.length;


    $('#channelList')
      .innerHTML =
      channels
        .map(
          channel => `

            <li>

              <button
                class="
                  conv
                  ${
                    state.active ===
                    `ch:${channel}`
                      ? 'active'
                      : ''
                  }
                "
                data-key="
                  ch:${channel}
                "
              >

                <span
                  class="channel-hash"
                >
                  #
                </span>

                <span class="name">
                  ${esc(channel)}
                </span>

              </button>

            </li>

          `
        )
        .join('');


    const users =
      state.users.filter(
        user =>
          user.name !==
          state.me &&
          user.name
            .toLowerCase()
            .includes(query)
      );


    $('#userCount')
      .textContent =
      users.length;


    $('#userList')
      .innerHTML =
      users
        .map(
          user => `

            <li>

              <button
                class="
                  conv
                  ${
                    state.active ===
                    `dm:${user.name}`
                      ? 'active'
                      : ''
                  }
                "
                data-key="
                  dm:${user.name}
                "
              >

                <span class="avatar">

                  ${esc(
                    user.name[0]
                      .toUpperCase()
                  )}

                  <span
                    class="dot"
                  ></span>

                </span>


                <span class="name">

                  ${esc(
                    user.name
                  )}

                </span>

              </button>

            </li>

          `
        )
        .join('');

  }


  /* =========================
     HEADER
  ========================= */


  function renderHeader() {

    const dm =
      keyIsDm(
        state.active
      );


    $('#chatSymbol')
      .textContent =
      dm ? '@' : '#';


    $('#chatTitle')
      .textContent =
      dm
        ? `@${peerOf(
            state.active
          )}`

        : state.active.slice(
            3
          );


    $('#chatSub')
      .textContent =
      dm
        ? 'Private conversation'

        : `${state.users.length} people online`;


    $('#onlineCount')
      .textContent =
      state.users.length;

  }


  /* =========================
     SIDEBAR CLICK
  ========================= */


  document.addEventListener(
    'click',
    (event) => {

      const button =
        event.target.closest(
          '.conv'
        );


      if (button) {

        switchTo(
          button.dataset.key
        );

      }

    }
  );


  /* =========================
     SEARCH
  ========================= */


  $('#searchInput').oninput =
    (event) => {

      renderSidebar(
        event.target.value
      );

    };


  $('#searchBtn').onclick =
    () => {

      $('#searchInput')
        .focus();

      $('#searchInput')
        .select();

    };


  document.addEventListener(
    'keydown',
    (event) => {

      if (
        (event.ctrlKey ||
          event.metaKey) &&
        event.key.toLowerCase() ===
        'k'
      ) {

        event.preventDefault();

        $('#searchInput')
          .focus();

      }

    }
  );


  /* =========================
     SEND MESSAGE
  ========================= */


  function send() {

    const input =
      $('#input');


    const text =
      input.value.trim();


    if (!text) return;


    /* POLL */

    if (
      text.startsWith(
        '/poll '
      )
    ) {

      const parts =
        text
          .slice(6)
          .split('|')
          .map(
            item =>
              item.trim()
          )
          .filter(Boolean);


      if (
        parts.length >= 3
      ) {

        socket.emit(
          'message',
          {

            to:
              state.active,

            type:
              'poll',

            poll: {

              question:
                parts[0],

              options:
                parts
                  .slice(1)
                  .map(
                    option => ({
                      text:
                        option,

                      votes:
                        []
                    })
                  )

            },

            replyTo:
              state.replyTarget

          }
        );


        input.value =
          '';


        state.replyTarget =
          null;


        $('#replyPreview')
          .hidden =
          true;


        return;

      }

    }


    /* NORMAL MESSAGE */

    socket.emit(
      'message',
      {

        to:
          state.active,

        type:
          'text',

        text,

        bomb:
          state.isBombActive,

        replyTo:
          state.replyTarget

      }
    );


    input.value =
      '';


    state.replyTarget =
      null;


    $('#replyPreview')
      .hidden =
      true;


    input.style.height =
      'auto';

  }


  $('#composer').onsubmit =
    (event) => {

      event.preventDefault();

      send();

    };


  /* AUTO RESIZE */

  $('#input').oninput =
    function () {

      this.style.height =
        'auto';


      this.style.height =
        Math.min(
          this.scrollHeight,
          110
        ) + 'px';

    };


  /* ENTER SEND */

  $('#input').onkeydown =
    (event) => {

      if (
        event.key ===
        'Enter' &&
        !event.shiftKey
      ) {

        event.preventDefault();

        send();

      }

    };


  /* =========================
     EMOJI
  ========================= */


  $('#emojiPop')
    .innerHTML =
    EMOJIS
      .map(
        emoji =>
          `<button type="button">${emoji}</button>`
      )
      .join('');


  $('#emojiBtn').onclick =
    () => {

      $('#emojiPop')
        .hidden =
        !$('#emojiPop')
          .hidden;

    };


  $('#emojiPop').onclick =
    (event) => {

      if (
        event.target.tagName ===
        'BUTTON'
      ) {

        $('#input').value +=
          event.target
            .textContent;


        $('#emojiPop')
          .hidden =
          true;


        $('#input')
          .focus();

      }

    };


  /* =========================
     MOBILE
  ========================= */


  $('#menuBtn').onclick =
    () =>
      $('#app')
        .classList
        .add(
          'drawer-open'
        );


  $('#scrim').onclick =
    () =>
      $('#app')
        .classList
        .remove(
          'drawer-open'
        );


  /* =========================
     SOCKET EVENTS
  ========================= */


  socket.on(
    'message',
    (message) => {

      (
        state.convs[
          message.to
        ] ||= []
      )
        .push(message);


      if (
        message.to ===
        state.active
      ) {

        const empty =
          $(
            '#messages .empty-state'
          );


        if (empty)
          empty.remove();


        const box =
          $('#messages');


        box.appendChild(
          msgEl(message)
        );


        box.scrollTop =
          box.scrollHeight;

      }

    }
  );


  socket.on(
    'update-poll',
    ({
      id,
      poll,
      to
    }) => {

      const list =
        state.convs[to] ||
        [];


      const item =
        list.find(
          message =>
            message.id === id
        );


      if (item) {

        item.poll =
          poll;


        if (
          to ===
          state.active
        ) {

          renderMessages();

        }

      }

    }
  );


  socket.on(
    'users',
    (users) => {

      state.users =
        users;


      if (state.me) {

        renderSidebar(
          $('#searchInput')
            .value
        );


        renderHeader();

      }

    }
  );


  socket.on(
    'auth-error',
    (message) => {

      $('#authError')
        .textContent =
        message;

    }
  );

})();