(() => {
  const STORAGE_KEY = "lexraid-c1-v1";
  const TOTAL_DAYS = DAY_SIZES.length;
  const LAST_DAY = TOTAL_DAYS - 1;

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
  let studyScope = "day";
  let session = null;

  const screens = {
    hub: $("#screen-hub"),
    study: $("#screen-study"),
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
    for (let i = 0; i < TOTAL_DAYS; i++) {
      const cleared = !!state.cleared[i];
      const avg = dayMasteryAvg(i);
      const stars = Math.round(avg * 3);
      const card = document.createElement("button");
      card.className = `day-card unlocked ${cleared ? "cleared" : ""}`;
      card.type = "button";
      card.innerHTML = `
        <div class="day-num">День ${i + 1}</div>
        <h3>${DAY_TITLES[i]}</h3>
        <div class="blurb">${DAY_BLURBS[i]}</div>
        <div class="day-foot">
          <span class="stars">${masteryStars(stars)}</span>
          <span class="badge ${cleared ? "ok" : ""}">
            ${cleared ? "Пройден" : `${DAY_SIZES[i]} слов`}
          </span>
        </div>`;
      card.addEventListener("click", () => openDay(i));
      root.appendChild(card);
    }
    showScreen("hub");
  }

  function openDay(dayIndex) {
    currentDay = dayIndex;
    openStudy(dayIndex);
  }

  function fillStudyList(words) {
    const list = $("#study-list");
    list.innerHTML = "";
    words.forEach((w, i) => {
      const m = state.mastery[w.id] || 0;
      const item = document.createElement("article");
      item.className = "study-card";
      item.innerHTML = `
        <div class="study-num">${String(i + 1).padStart(2, "0")}</div>
        <div class="study-body">
          <div class="study-word">${escapeHtml(w.word)}</div>
          <div class="study-meaning">${escapeHtml(w.meaning)}</div>
          <div class="study-meta">${masteryStars(m)} · день ${dayOfWord(w.id)}</div>
        </div>`;
      list.appendChild(item);
    });
  }

  function openStudy(dayIndex) {
    studyScope = "day";
    currentDay = dayIndex;
    const words = dayWords(dayIndex);
    $("#study-title").textContent = `День ${dayIndex + 1}: слова`;
    $("#study-blurb").textContent =
      `${DAY_BLURBS[dayIndex]} Сначала выучи значения — потом набери слова сам и пройди тест.`;
    $("#btn-to-test").classList.remove("hidden");
    $("#btn-start-write-hard").classList.add("hidden");
    fillStudyList(words);
    showScreen("study");
  }

  function openAllStudy() {
    studyScope = "all";
    $("#study-title").textContent = "Все 67 слов";
    $("#study-blurb").textContent =
      "Все слова в одном месте. Обычный набор показывает длину, тяжёлый — нет, только подсказки по буквам.";
    $("#btn-to-test").classList.add("hidden");
    $("#btn-start-write-hard").classList.remove("hidden");
    fillStudyList(VOCAB);
    showScreen("study");
  }

  function openLobby(dayIndex) {
    currentDay = dayIndex;
    const words = dayWords(dayIndex);
    $("#lobby-title").textContent = `День ${dayIndex + 1}: тест`;
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
  function practiceWords() {
    return studyScope === "all" ? VOCAB : dayWords(currentDay);
  }

  function startMode(mode, wordList) {
    const words = wordList || practiceWords();
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
    if (mode === "spell" || mode === "write" || mode === "write-hard") {
      return shuffle(words).map((w) => ({ type: "spell", word: w, revealed: 0 }));
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
        .map((w) => ({ type: "spell", word: w, revealed: 1 }));
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
        write: "Набор",
        "write-hard": "Тяжёлый набор",
        blitz: "Блиц",
        boss: "Босс дня",
        match: "Пары",
      }[mode] || mode
    );
  }

  function isWriteMode(mode) {
    return mode === "write" || mode === "write-hard";
  }

  function spellMask(word, revealed) {
    return [...word]
      .map((ch, i) => (i < revealed ? ch : "·"))
      .join(" ");
  }

  function hardHintText(word, revealed) {
    if (!revealed) return "Длину не показываем — бери подсказку, если застрял.";
    return `Подсказка: ${word.slice(0, revealed)}`;
  }

  function renderSpellRound(round) {
    const s = session;
    const word = round.word.word;
    const revealed = round.revealed || 0;
    const hard = s.mode === "write-hard";
    const card = $("#play-card");
    const mask = hard ? hardHintText(word, revealed) : spellMask(word, revealed);
    const meta = hard
      ? revealed
        ? `подсказок: ${revealed}`
        : "длина скрыта"
      : `${word.length} букв · открыто ${revealed}/${word.length}`;
    card.innerHTML = `<div class="prompt-label">${
      hard ? "Впиши слово — без длины" : s.mode === "write" ? "Впиши слово по значению" : "Напиши слово по значению"
    }</div>
      <p class="prompt">${escapeHtml(round.word.meaning)}</p>
      <div class="spell-mask${hard ? " hard" : ""}" id="spell-mask">${escapeHtml(mask)}</div>
      <div class="spell-row">
        <input id="spell-input" autocomplete="off" autocorrect="off" spellcheck="false" autocapitalize="off" placeholder="${
          hard ? "пиши слово…" : "type the word…"
        }" />
        <button class="btn btn-primary" id="spell-submit" type="button">OK</button>
      </div>
      <div class="spell-tools">
        <button class="btn btn-secondary" id="spell-hint" type="button" ${revealed >= word.length ? "disabled" : ""}>
          ${hard ? "Подсказка: след. буква" : "Открыть след. букву"}
        </button>
        <span class="spell-meta">${meta}</span>
      </div>
      <div id="spell-reveal" class="spell-reveal hidden"></div>`;

    const input = $("#spell-input");
    const submit = () => {
      if (s.answered) return;
      const ok = input.value.trim().toLowerCase() === word.toLowerCase();
      judge(ok, round.word.id, word);
    };
    $("#spell-submit").addEventListener("click", submit);
    input.addEventListener("keydown", (e) => {
      if (e.key === "Enter") submit();
    });
    $("#spell-hint").addEventListener("click", () => {
      if (s.answered) return;
      if (round.revealed >= word.length) return;
      round.revealed += 1;
      $("#spell-mask").textContent = hard
        ? hardHintText(word, round.revealed)
        : spellMask(word, round.revealed);
      $("#spell-hint").disabled = round.revealed >= word.length;
      const metaEl = card.querySelector(".spell-meta");
      if (metaEl) {
        metaEl.textContent = hard
          ? `подсказок: ${round.revealed}`
          : `${word.length} букв · открыто ${round.revealed}/${word.length}`;
      }
      input.focus();
    });
    setTimeout(() => input.focus(), 50);
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
      if (round.revealed == null) round.revealed = isWriteMode(s.mode) ? 0 : 1;
      renderSpellRound(round);
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
      const { gained, streak } = onCorrect(
        wordId,
        session.mode === "boss" ? 20 : session.mode === "write-hard" ? 16 : 12
      );
      fb.textContent = streak > 1 ? `+${gained}  combo ${streak}` : `+${gained}`;
      card.classList.add("right");
    } else {
      onWrong(wordId);
      session.lives -= 1;
      fb.innerHTML = reveal
        ? `Неверно<br><span class="answer-correct">Правильно: <b>${escapeHtml(reveal)}</b></span>`
        : "✗";
      card.classList.add("wrong");
      const revealBox = $("#spell-reveal");
      if (revealBox && reveal) {
        revealBox.classList.remove("hidden");
        revealBox.innerHTML = `Правильное слово: <strong>${escapeHtml(reveal)}</strong>`;
      }
      const hintBtn = $("#spell-hint");
      if (hintBtn) hintBtn.disabled = true;
      const input = $("#spell-input");
      if (input) {
        input.disabled = true;
        input.value = reveal;
      }
      updateTopStats();
    }
    card.appendChild(fb);
    renderHud();
    updateTopStats();

    setTimeout(() => {
      session.index += 1;
      renderRound();
    }, ok ? 650 : 1800);
  }

  function endSession() {
    const s = session;
    const total = s.rounds.length;
    const ratio = total ? s.correct / total : 0;
    const survived = s.lives > 0;
    const passedBoss = s.mode === "boss" && survived && ratio >= 0.7;

    if (passedBoss) {
      state.cleared[currentDay] = true;
      const allCleared = [...Array(TOTAL_DAYS).keys()].every((i) => state.cleared[i]);
      toast(allCleared ? "Кампания пройдена. Ты легенда лексикона." : `День ${currentDay + 1} пройден!`);
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
          ${
            isWriteMode(s.mode) && studyScope === "all"
              ? `<button class="btn btn-secondary" id="to-list" type="button">К списку слов</button>`
              : isWriteMode(s.mode)
                ? `<button class="btn btn-secondary" id="to-test" type="button">К тесту</button>`
                : `<button class="btn btn-secondary" id="to-lobby" type="button">К режимам дня</button>`
          }
          <button class="btn btn-ghost" id="to-hub" type="button">Карта кампании</button>
        </div>
      </div>`;

    $("#again").onclick = () => startMode(s.mode, s.words);
    const toLobby = $("#to-lobby");
    if (toLobby) toLobby.onclick = () => openLobby(currentDay);
    const toTest = $("#to-test");
    if (toTest) toTest.onclick = () => openLobby(currentDay);
    const toList = $("#to-list");
    if (toList) toList.onclick = () => openAllStudy();
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
    for (let i = 0; i < TOTAL_DAYS; i++) {
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
  $("#btn-all-words").addEventListener("click", openAllStudy);
  $("#btn-arsenal-write").addEventListener("click", () => {
    studyScope = "all";
    startMode("write", VOCAB);
  });
  $("#btn-arsenal-write-hard").addEventListener("click", () => {
    studyScope = "all";
    startMode("write-hard", VOCAB);
  });
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
  $("#back-hub-study").addEventListener("click", renderHub);
  $("#btn-start-write").addEventListener("click", () => startMode("write"));
  $("#btn-start-write-hard").addEventListener("click", () => startMode("write-hard", VOCAB));
  $("#btn-to-test").addEventListener("click", () => openLobby(currentDay));
  $("#btn-lobby-study").addEventListener("click", () => openStudy(currentDay));
  $("#btn-lobby-write").addEventListener("click", () => startMode("write"));
  $("#arsenal-filter").addEventListener("change", renderArsenal);

  $$("[data-mode]").forEach((btn) => {
    btn.addEventListener("click", () => startMode(btn.dataset.mode));
  });

  $("#btn-continue").addEventListener("click", () => {
    const next = [...Array(TOTAL_DAYS).keys()].find((i) => !state.cleared[i]);
    openDay(next ?? LAST_DAY);
  });

  renderHub();
})();
