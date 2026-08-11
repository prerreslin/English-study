(() => {
  const STORAGE_KEY = "lexraid-c1-v1";

  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

  function shuffle(arr) {
    const a = [...arr];
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }

  function pickN(arr, n, excludeId) {
    return shuffle(arr.filter((x) => x.id !== excludeId)).slice(0, n);
  }

  function dayWords(dayIndex) {
    let start = 0;
    for (let i = 0; i < dayIndex; i++) start += DAY_SIZES[i];
    return VOCAB.slice(start, start + DAY_SIZES[dayIndex]);
  }

  function defaultState() {
    const mastery = {};
    VOCAB.forEach((w) => {
      mastery[w.id] = 0;
    });
    return {
      xp: 0,
      streak: 0,
      bestStreak: 0,
      unlockedDay: 0,
      cleared: {},
      mastery,
      plays: 0,
    };
  }

  function load() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return defaultState();
      return { ...defaultState(), ...JSON.parse(raw) };
    } catch {
      return defaultState();
    }
  }

  function save() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  }

  let state = load();
  let currentDay = 0;
  let session = null;

  const screens = {
    hub: $("#screen-hub"),
    lobby: $("#screen-lobby"),
    play: $("#screen-play"),
    arsenal: $("#screen-arsenal"),
  };

  function showScreen(name) {
    Object.values(screens).forEach((el) => el.classList.remove("active"));
    screens[name].classList.add("active");
  }

  function toast(msg) {
    const el = $("#toast");
    el.textContent = msg;
    el.classList.add("show");
    clearTimeout(toast._t);
    toast._t = setTimeout(() => el.classList.remove("show"), 2200);
  }

  function masteryStars(level) {
    return "★".repeat(level) + "☆".repeat(Math.max(0, 3 - level));
  }

  function dayMasteryAvg(dayIndex) {
    const words = dayWords(dayIndex);
    if (!words.length) return 0;
    const sum = words.reduce((s, w) => s + (state.mastery[w.id] || 0), 0);
    return sum / (words.length * 3);
  }

  function updateTopStats() {
    $("#stat-xp").textContent = state.xp;
    $("#stat-streak").textContent = state.streak;
    $("#stat-best").textContent = state.bestStreak;
    const mastered = VOCAB.filter((w) => (state.mastery[w.id] || 0) >= 3).length;
    $("#stat-mastered").textContent = `${mastered}/67`;
    const weekPct = Math.round(
      (VOCAB.reduce((s, w) => s + (state.mastery[w.id] || 0), 0) / (67 * 3)) * 100
    );
    $("#week-pct").textContent = `${weekPct}%`;
    $("#week-bar").style.width = `${weekPct}%`;
  }

  function renderHub() {
    updateTopStats();
    const root = $("#days");
    root.innerHTML = "";
    for (let i = 0; i < 7; i++) {
      const unlocked = i <= state.unlockedDay;
      const cleared = !!state.cleared[i];
      const avg = dayMasteryAvg(i);
      const stars = Math.round(avg * 3);
      const card = document.createElement("button");
      card.className = `day-card ${unlocked ? "unlocked" : "locked"} ${cleared ? "cleared" : ""}`;
      card.type = "button";
      card.innerHTML = `
        <div class="day-num">День ${i + 1}</div>
        <h3>${DAY_TITLES[i]}</h3>
        <div class="blurb">${DAY_BLURBS[i]}</div>
        <div class="day-foot">
          <span class="stars">${masteryStars(stars)}</span>
          <span class="badge ${cleared ? "ok" : unlocked ? "" : "lock"}">
            ${cleared ? "Пройден" : unlocked ? `${DAY_SIZES[i]} слов` : "Закрыто"}
          </span>
        </div>`;
      if (unlocked) {
        card.addEventListener("click", () => openLobby(i));
      } else {
        card.addEventListener("click", () => toast("Сначала пройди босса предыдущего дня"));
      }
      root.appendChild(card);
    }
    showScreen("hub");
  }

  function openLobby(dayIndex) {
    currentDay = dayIndex;
    const words = dayWords(dayIndex);
    $("#lobby-title").textContent = `День ${dayIndex + 1}: ${DAY_TITLES[dayIndex]}`;
    $("#lobby-blurb").textContent = DAY_BLURBS[dayIndex];
    const strip = $("#word-strip");
    strip.innerHTML = "";
    words.forEach((w) => {
      const m = state.mastery[w.id] || 0;
      const chip = document.createElement("span");
      chip.className = `chip m${m}`;
      chip.textContent = w.word;
      chip.title = w.meaning;
      strip.appendChild(chip);
    });
    showScreen("lobby");
  }

  function bumpMastery(id, delta) {
    const cur = state.mastery[id] || 0;
    state.mastery[id] = Math.max(0, Math.min(3, cur + delta));
  }

  function onCorrect(wordId, points) {
    state.streak += 1;
    state.bestStreak = Math.max(state.bestStreak, state.streak);
    const mult = Math.min(3, 1 + Math.floor(state.streak / 3) * 0.5);
    const gained = Math.round(points * mult);
    state.xp += gained;
    bumpMastery(wordId, 1);
    save();
    return { gained, streak: state.streak };
  }

  function onWrong(wordId) {
    state.streak = 0;
    bumpMastery(wordId, -1);
    save();
  }

  /* —— Session runners —— */
  function startMode(mode) {
    const words = dayWords(currentDay);
    state.plays += 1;
    save();

    if (mode === "match") {
      startMatch(words);
      return;
    }

    const rounds = buildRounds(mode, words);
    session = {
      mode,
      words,
      rounds,
      index: 0,
      correct: 0,
      lives: mode === "boss" ? 3 : mode === "blitz" ? 5 : 99,
      maxLives: mode === "boss" ? 3 : mode === "blitz" ? 5 : 99,
      answered: false,
    };
    showScreen("play");
    renderRound();
  }

  function buildRounds(mode, words) {
    if (mode === "duel") {
      return shuffle(words).map((w) => ({ type: "meaning-to-word", word: w }));
    }
    if (mode === "recall") {
      return shuffle(words).map((w) => ({ type: "word-to-meaning", word: w }));
    }
    if (mode === "spell") {
      return shuffle(words).map((w) => ({ type: "spell", word: w }));
    }
    if (mode === "blitz") {
      const pool = [];
      shuffle(words).forEach((w) => {
        pool.push({ type: "meaning-to-word", word: w });
        pool.push({ type: "word-to-meaning", word: w });
      });
      return shuffle(pool).slice(0, Math.min(16, pool.length));
    }
    if (mode === "boss") {
      const duel = shuffle(words).map((w) => ({ type: "meaning-to-word", word: w }));
      const spell = shuffle(words)
        .slice(0, Math.min(4, words.length))
        .map((w) => ({ type: "spell", word: w }));
      const recall = shuffle(words)
        .slice(0, Math.min(4, words.length))
        .map((w) => ({ type: "word-to-meaning", word: w }));
      return shuffle([...duel, ...spell, ...recall]);
    }
    return [];
  }

  function renderHud() {
    const s = session;
    const pct = Math.round((s.index / s.rounds.length) * 100);
    $("#play-progress").style.width = `${pct}%`;
    $("#play-mode-label").textContent = modeLabel(s.mode);
    $("#play-score").textContent = `${s.correct}/${s.index}`;
    $("#play-combo").textContent = state.streak > 1 ? `×${state.streak}` : "—";

    const livesEl = $("#lives");
    if (s.maxLives < 90) {
      livesEl.classList.remove("hidden");
      livesEl.innerHTML = "";
      for (let i = 0; i < s.maxLives; i++) {
        const d = document.createElement("span");
        d.className = `life ${i < s.lives ? "" : "off"}`;
        livesEl.appendChild(d);
      }
    } else {
      livesEl.classList.add("hidden");
    }
  }

  function modeLabel(mode) {
    return (
      {
        duel: "Дуэль значений",
        recall: "Обратный вызов",
        spell: "Напиши слово",
        blitz: "Блиц",
        boss: "Босс дня",
        match: "Пары",
      }[mode] || mode
    );
  }

  function renderRound() {
    const s = session;
    if (s.index >= s.rounds.length || s.lives <= 0) {
      endSession();
      return;
    }
    s.answered = false;
    renderHud();
    const round = s.rounds[s.index];
    const card = $("#play-card");
    card.classList.remove("wrong", "right");
    card.innerHTML = "";

    if (round.type === "meaning-to-word") {
      card.innerHTML = `<div class="prompt-label">Какое слово значит…</div>
        <p class="prompt">${escapeHtml(round.word.meaning)}</p>
        <div class="choices" id="choices"></div>`;
      const distractors = pickN(VOCAB, 3, round.word.id).map((w) => w.word);
      const opts = shuffle([round.word.word, ...distractors]);
      mountChoices(opts, round.word.word, round.word.id);
    } else if (round.type === "word-to-meaning") {
      card.innerHTML = `<div class="prompt-label">Что значит слово</div>
        <p class="prompt word">${escapeHtml(round.word.word)}</p>
        <div class="choices" id="choices"></div>`;
      const distractors = pickN(VOCAB, 3, round.word.id).map((w) => w.meaning);
      const opts = shuffle([round.word.meaning, ...distractors]);
      mountChoices(opts, round.word.meaning, round.word.id);
    } else if (round.type === "spell") {
      card.innerHTML = `<div class="prompt-label">Напиши слово по значению</div>
        <p class="prompt">${escapeHtml(round.word.meaning)}</p>
        <div class="spell-row">
          <input id="spell-input" autocomplete="off" autocorrect="off" spellcheck="false" placeholder="type the word…" />
          <button class="btn btn-primary" id="spell-submit" type="button">OK</button>
        </div>
        <p style="margin:0.9rem 0 0;color:var(--muted);font-size:0.85rem">Подсказка: ${round.word.word.length} букв, начинается на «${round.word.word[0]}»</p>`;
      const input = $("#spell-input");
      const submit = () => {
        if (s.answered) return;
        judge(input.value.trim().toLowerCase() === round.word.word.toLowerCase(), round.word.id, round.word.word);
      };
      $("#spell-submit").addEventListener("click", submit);
      input.addEventListener("keydown", (e) => {
        if (e.key === "Enter") submit();
      });
      setTimeout(() => input.focus(), 50);
    }
  }

  function mountChoices(opts, correct, wordId) {
    const box = $("#choices");
    opts.forEach((opt) => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "choice";
      btn.textContent = opt;
      btn.addEventListener("click", () => {
        if (session.answered) return;
        const ok = opt === correct;
        $$(".choice", box).forEach((b) => {
          b.disabled = true;
          if (b.textContent === correct) b.classList.add("correct");
        });
        if (!ok) btn.classList.add("incorrect");
        judge(ok, wordId, correct);
      });
      box.appendChild(btn);
    });
  }

  function judge(ok, wordId, reveal) {
    session.answered = true;
    const card = $("#play-card");
    const fb = document.createElement("div");
    fb.className = `feedback ${ok ? "" : "bad"}`;

    if (ok) {
      session.correct += 1;
      const { gained, streak } = onCorrect(wordId, session.mode === "boss" ? 20 : 12);
      fb.textContent = streak > 1 ? `+${gained}  combo ${streak}` : `+${gained}`;
      card.classList.add("right");
    } else {
      onWrong(wordId);
      session.lives -= 1;
      fb.textContent = reveal ? `✗  ${reveal}` : "✗";
      card.classList.add("wrong");
      updateTopStats();
    }
    card.appendChild(fb);
    renderHud();
    updateTopStats();

    setTimeout(() => {
      session.index += 1;
      renderRound();
    }, ok ? 650 : 1100);
  }

  function endSession() {
    const s = session;
    const total = s.rounds.length;
    const ratio = total ? s.correct / total : 0;
    const survived = s.lives > 0;
    const passedBoss = s.mode === "boss" && survived && ratio >= 0.7;

    if (passedBoss) {
      state.cleared[currentDay] = true;
      if (currentDay === state.unlockedDay && currentDay < 6) {
        state.unlockedDay = currentDay + 1;
        toast(`День ${currentDay + 2} открыт!`);
      } else if (currentDay === 6) {
        toast("Неделя пройдена. Ты легенда лексикона.");
      }
      state.xp += 50;
      save();
    }

    const card = $("#play-card");
    const title =
      s.mode === "boss"
        ? passedBoss
          ? "Босс повержен"
          : "Босс устоял"
        : ratio >= 0.8
          ? "Отличный заход"
          : ratio >= 0.5
            ? "Есть прогресс"
            : "Нужен ещё раунд";

    card.innerHTML = `
      <div class="result">
        <h2>${title}</h2>
        <p>${s.correct} из ${total} верно${s.maxLives < 90 ? ` · жизни: ${Math.max(0, s.lives)}` : ""}${
      s.mode === "boss" ? (passedBoss ? " · день засчитан" : " · нужно ≥70% и хотя бы 1 жизнь") : ""
    }</p>
        <div class="result-actions">
          <button class="btn btn-primary" id="again" type="button">Ещё раз</button>
          <button class="btn btn-secondary" id="to-lobby" type="button">К режимам дня</button>
          <button class="btn btn-ghost" id="to-hub" type="button">Карта недели</button>
        </div>
      </div>`;

    $("#again").onclick = () => startMode(s.mode);
    $("#to-lobby").onclick = () => openLobby(currentDay);
    $("#to-hub").onclick = () => renderHub();
    updateTopStats();
  }

  /* —— Match mode —— */
  function startMatch(words) {
    const set = shuffle(words).slice(0, Math.min(6, words.length));
    session = {
      mode: "match",
      words: set,
      matched: 0,
      total: set.length,
      selected: null,
      lives: 99,
      maxLives: 99,
      correct: 0,
      index: 0,
      rounds: { length: set.length },
    };

    showScreen("play");
    $("#play-mode-label").textContent = modeLabel("match");
    $("#lives").classList.add("hidden");
    $("#play-combo").textContent = "—";
    $("#play-score").textContent = `0/${set.length}`;
    $("#play-progress").style.width = "0%";

    const left = shuffle(set);
    const right = shuffle(set);
    const card = $("#play-card");
    card.classList.remove("wrong", "right");
    card.innerHTML = `
      <div class="prompt-label">Собери пары · слово ↔ значение</div>
      <div class="match-board">
        <div class="match-col" id="match-words"></div>
        <div class="match-col" id="match-meanings"></div>
      </div>`;

    const wCol = $("#match-words");
    const mCol = $("#match-meanings");

    left.forEach((w) => {
      const t = document.createElement("button");
      t.type = "button";
      t.className = "match-tile";
      t.dataset.id = w.id;
      t.dataset.side = "w";
      t.textContent = w.word;
      t.addEventListener("click", () => onMatchClick(t));
      wCol.appendChild(t);
    });

    right.forEach((w) => {
      const t = document.createElement("button");
      t.type = "button";
      t.className = "match-tile";
      t.dataset.id = w.id;
      t.dataset.side = "m";
      t.textContent = w.meaning;
      t.addEventListener("click", () => onMatchClick(t));
      mCol.appendChild(t);
    });
  }

  function onMatchClick(tile) {
    if (tile.classList.contains("matched")) return;
    const sel = session.selected;

    if (!sel) {
      $$(".match-tile.selected").forEach((t) => t.classList.remove("selected"));
      tile.classList.add("selected");
      session.selected = tile;
      return;
    }

    if (sel === tile) {
      tile.classList.remove("selected");
      session.selected = null;
      return;
    }

    if (sel.dataset.side === tile.dataset.side) {
      sel.classList.remove("selected");
      tile.classList.add("selected");
      session.selected = tile;
      return;
    }

    const a = sel;
    const b = tile;
    session.selected = null;
    a.classList.remove("selected");

    if (a.dataset.id === b.dataset.id) {
      a.classList.add("matched");
      b.classList.add("matched");
      session.matched += 1;
      session.correct += 1;
      onCorrect(Number(a.dataset.id), 15);
      $("#play-score").textContent = `${session.matched}/${session.total}`;
      $("#play-progress").style.width = `${Math.round((session.matched / session.total) * 100)}%`;
      $("#play-combo").textContent = state.streak > 1 ? `×${state.streak}` : "—";
      updateTopStats();
      if (session.matched >= session.total) {
        setTimeout(() => {
          session.rounds = { length: session.total };
          session.index = session.total;
          session.lives = 99;
          endSession();
        }, 450);
      }
    } else {
      onWrong(Number(a.dataset.id));
      a.classList.add("miss");
      b.classList.add("miss");
      updateTopStats();
      setTimeout(() => {
        a.classList.remove("miss");
        b.classList.remove("miss");
      }, 400);
    }
  }

  function escapeHtml(str) {
    return String(str)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function renderArsenal() {
    updateTopStats();
    const root = $("#arsenal-grid");
    root.innerHTML = "";
    const filter = $("#arsenal-filter").value;
    let list = [...VOCAB];
    if (filter === "weak") list = list.filter((w) => (state.mastery[w.id] || 0) < 2);
    if (filter === "mastered") list = list.filter((w) => (state.mastery[w.id] || 0) >= 3);
    if (filter === "new") list = list.filter((w) => (state.mastery[w.id] || 0) === 0);

    list.forEach((w) => {
      const m = state.mastery[w.id] || 0;
      const el = document.createElement("div");
      el.className = "arsenal-item";
      el.innerHTML = `
        <div class="w">${escapeHtml(w.word)}</div>
        <div class="m">${escapeHtml(w.meaning)}</div>
        <div class="meta">${masteryStars(m)} · день ${dayOfWord(w.id)}</div>`;
      root.appendChild(el);
    });
    showScreen("arsenal");
  }

  function dayOfWord(id) {
    let start = 0;
    for (let i = 0; i < 7; i++) {
      if (id > start && id <= start + DAY_SIZES[i]) return i + 1;
      start += DAY_SIZES[i];
    }
    return "?";
  }

  function startWeakDrill() {
    const weak = VOCAB.filter((w) => (state.mastery[w.id] || 0) < 2);
    if (!weak.length) {
      toast("Слабых слов нет — ты в форме");
      return;
    }
    const words = shuffle(weak).slice(0, Math.min(12, weak.length));
    state.plays += 1;
    save();
    session = {
      mode: "blitz",
      words,
      rounds: buildRounds("blitz", words),
      index: 0,
      correct: 0,
      lives: 5,
      maxLives: 5,
      answered: false,
    };
    showScreen("play");
    renderRound();
  }

  /* —— Wire UI —— */
  $("#btn-arsenal").addEventListener("click", renderArsenal);
  $("#btn-weak").addEventListener("click", startWeakDrill);
  $("#btn-reset").addEventListener("click", () => {
    if (confirm("Сбросить весь прогресс?")) {
      state = defaultState();
      save();
      toast("Прогресс обнулён");
      renderHub();
    }
  });
  $("#back-hub").addEventListener("click", renderHub);
  $("#back-hub-2").addEventListener("click", renderHub);
  $("#arsenal-filter").addEventListener("change", renderArsenal);

  $$("[data-mode]").forEach((btn) => {
    btn.addEventListener("click", () => startMode(btn.dataset.mode));
  });

  $("#btn-continue").addEventListener("click", () => {
    openLobby(state.unlockedDay);
  });

  renderHub();
})();
