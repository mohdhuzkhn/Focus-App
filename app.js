(function () {
  "use strict";

  // =====================================================================
  // Supabase client
  // =====================================================================
  if (!window.SUPABASE_URL || window.SUPABASE_URL.includes("YOUR-PROJECT-REF")) {
    console.warn("Fill in config.js with your real Supabase URL and anon key.");
  }
  const supabase = window.supabase.createClient(window.SUPABASE_URL, window.SUPABASE_ANON_KEY);

  // ---------- date helpers (local time, no UTC drift) ----------
  function toKey(d) {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${y}-${m}-${day}`;
  }
  function fromKey(key) {
    const [y, m, d] = key.split("-").map(Number);
    return new Date(y, m - 1, d);
  }
  function addDays(d, n) {
    const nd = new Date(d);
    nd.setDate(nd.getDate() + n);
    return nd;
  }
  function startOfToday() {
    const t = new Date();
    return new Date(t.getFullYear(), t.getMonth(), t.getDate());
  }
  const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
  const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

  // =====================================================================
  // State
  // =====================================================================
  let currentUser = null;   // supabase auth user object
  let logs = {};            // { 'YYYY-MM-DD': { hours, tasks:[{id,text,ts}] } }
  let goals = [];           // [{ id, text, created_at }] — persistent, not date-scoped
  let selectedDate = startOfToday();

  function getEntry(key) {
    return logs[key] || { hours: 0, tasks: [] };
  }
  function displayName() {
    return (currentUser && currentUser.user_metadata && currentUser.user_metadata.display_name)
      || (currentUser && currentUser.email)
      || "";
  }

  // =====================================================================
  // Theme
  // =====================================================================
  const THEME_KEY = "logbook_theme_v1";
  function applyTheme(theme) {
    document.documentElement.setAttribute("data-theme", theme);
    localStorage.setItem(THEME_KEY, theme);
    document.getElementById("btnLight").classList.toggle("active", theme === "light");
    document.getElementById("btnDark").classList.toggle("active", theme === "dark");
  }
  function initTheme() {
    let theme = localStorage.getItem(THEME_KEY);
    if (!theme) {
      theme = window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
    }
    applyTheme(theme);
  }
  document.getElementById("btnLight").addEventListener("click", () => applyTheme("light"));
  document.getElementById("btnDark").addEventListener("click", () => applyTheme("dark"));

  // =====================================================================
  // Auth screen
  // =====================================================================
  const authWrap = document.getElementById("authWrap");
  const dashboard = document.getElementById("dashboard");
  const authForm = document.getElementById("authForm");
  const authError = document.getElementById("authError");
  const authNotice = document.getElementById("authNotice");
  const authSubmit = document.getElementById("authSubmit");
  const authFootnote = document.getElementById("authFootnote");
  const tabLogin = document.getElementById("tabLogin");
  const tabSignup = document.getElementById("tabSignup");
  const displayNameField = document.getElementById("displayNameField");
  const displayNameInput = document.getElementById("authDisplayName");
  const emailInput = document.getElementById("authEmail");
  const passwordInput = document.getElementById("authPassword");

  let authMode = "login";

  function setAuthMode(mode) {
    authMode = mode;
    tabLogin.classList.toggle("active", mode === "login");
    tabSignup.classList.toggle("active", mode === "signup");
    authSubmit.textContent = mode === "login" ? "Log in" : "Create account";
    displayNameField.hidden = mode === "login";
    passwordInput.autocomplete = mode === "login" ? "current-password" : "new-password";
    passwordInput.placeholder = mode === "login" ? "Your password" : "At least 8 characters";
    authError.hidden = true;
    authNotice.hidden = true;
    authFootnote.innerHTML = mode === "login"
      ? `New here? <button type="button" class="auth-link" id="switchToSignup">Create an account</button>`
      : `Already have an account? <button type="button" class="auth-link" id="switchToLogin">Log in</button>`;
    const linkBtn = document.getElementById(mode === "login" ? "switchToSignup" : "switchToLogin");
    linkBtn.addEventListener("click", () => setAuthMode(mode === "login" ? "signup" : "login"));
  }
  tabLogin.addEventListener("click", () => setAuthMode("login"));
  tabSignup.addEventListener("click", () => setAuthMode("signup"));
  document.getElementById("switchToSignup").addEventListener("click", () => setAuthMode("signup"));

  authForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    authError.hidden = true;
    authNotice.hidden = true;
    const email = emailInput.value.trim();
    const password = passwordInput.value;
    const displayNameVal = displayNameInput.value.trim();

    authSubmit.disabled = true;
    authSubmit.textContent = authMode === "login" ? "Logging in…" : "Creating account…";

    try {
      if (authMode === "login") {
        const { data, error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        currentUser = data.user;
        passwordInput.value = "";
        await enterDashboard();
      } else {
        const { data, error } = await supabase.auth.signUp({
          email,
          password,
          options: { data: { display_name: displayNameVal || email.split("@")[0] } },
        });
        if (error) throw error;

        if (data.session) {
          // Email confirmation is off in your Supabase project settings —
          // the account is active immediately.
          currentUser = data.user;
          passwordInput.value = "";
          await enterDashboard();
        } else {
          // Email confirmation is on — Supabase emailed a confirmation link.
          authNotice.textContent = "Account created. Check your email to confirm it, then log in.";
          authNotice.hidden = false;
          setAuthMode("login");
          emailInput.value = email;
        }
      }
    } catch (err) {
      // Supabase already returns a generic "Invalid login credentials" for
      // bad logins, so this doesn't leak whether an email is registered.
      authError.textContent = err.message || "Something went wrong.";
      authError.hidden = false;
    } finally {
      authSubmit.disabled = false;
      authSubmit.textContent = authMode === "login" ? "Log in" : "Create account";
    }
  });

  document.getElementById("logoutBtn").addEventListener("click", async () => {
    await supabase.auth.signOut();
    currentUser = null;
    logs = {};
    goals = [];
    authForm.reset();
    dashboard.hidden = true;
    authWrap.hidden = false;
    setAuthMode("login");
  });

  async function enterDashboard() {
    document.getElementById("usernameLabel").textContent = displayName();
    document.getElementById("footerUsername").textContent = displayName();
    authWrap.hidden = true;
    dashboard.hidden = false;
    selectedDate = startOfToday();
    await Promise.all([loadLogs(), loadGoals()]);
    renderAll();
  }

  async function checkExistingSession() {
    const { data } = await supabase.auth.getSession();
    if (data.session) {
      currentUser = data.session.user;
      await enterDashboard();
    } else {
      authWrap.hidden = false;
      dashboard.hidden = true;
    }
  }

  // Keep the UI in sync if the session expires/refreshes/logs out elsewhere
  // (e.g. another tab).
  supabase.auth.onAuthStateChange((event) => {
    if (event === "SIGNED_OUT") {
      currentUser = null;
      logs = {};
      goals = [];
      dashboard.hidden = true;
      authWrap.hidden = false;
      setAuthMode("login");
    }
  });

  // =====================================================================
  // Data loading — one row per (user, date) in daily_logs, with missions
  // stored as a jsonb array on that row. RLS means this query can only
  // ever return the signed-in user's own rows, even though no
  // .eq('user_id', ...) filter is written here.
  // =====================================================================
  async function loadLogs() {
    const { data, error } = await supabase.from("daily_logs").select("date, work_hours, missions");
    if (error) {
      alert(error.message || "Could not load your data.");
      return;
    }
    const byDate = {};
    for (const row of data || []) {
      byDate[row.date] = {
        hours: Number(row.work_hours) || 0,
        tasks: (row.missions || []).map((m) => ({ id: m.id, text: m.text, ts: m.ts })),
      };
    }
    logs = byDate;
  }

  // =====================================================================
  // Goals & Projects — persistent, not tied to any date. Stay until the
  // user deletes them. Same RLS-backed isolation as daily_logs.
  // =====================================================================
  async function loadGoals() {
    const { data, error } = await supabase
      .from("goals")
      .select("id, text, created_at")
      .order("created_at", { ascending: true });
    if (error) {
      alert(error.message || "Could not load your goals.");
      return;
    }
    goals = data || [];
  }

  function renderGoals() {
    const list = document.getElementById("goalList");
    document.getElementById("goalCountLabel").textContent = `${goals.length} active`;

    if (goals.length === 0) {
      list.innerHTML = `<li style="border:none;"><div class="empty-state" style="width:100%;">No goals yet — add something you're working toward.</div></li>`;
      return;
    }

    list.innerHTML = "";
    goals.forEach((goal) => {
      const li = document.createElement("li");
      li.innerHTML = `
        <div class="goal-dot"></div>
        <div class="goal-text"></div>
        <div class="goal-actions">
          <button class="goal-edit-btn" aria-label="Edit goal">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 013 3L7 19l-4 1 1-4 12.5-12.5z"/></svg>
          </button>
          <button class="goal-del-btn" aria-label="Delete goal">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><path d="M18 6L6 18M6 6l12 12"/></svg>
          </button>
        </div>
      `;
      const textEl = li.querySelector(".goal-text");
      textEl.textContent = goal.text; // textContent — never innerHTML — avoids XSS

      const startEdit = () => beginEditGoal(li, goal);
      textEl.addEventListener("click", startEdit);
      li.querySelector(".goal-edit-btn").addEventListener("click", startEdit);
      li.querySelector(".goal-del-btn").addEventListener("click", () => deleteGoal(goal.id));
      list.appendChild(li);
    });
  }

  function beginEditGoal(li, goal) {
    const textEl = li.querySelector(".goal-text");
    const input = document.createElement("input");
    input.type = "text";
    input.className = "goal-edit-input";
    input.maxLength = 200;
    input.value = goal.text;
    textEl.replaceWith(input);
    input.focus();
    input.setSelectionRange(input.value.length, input.value.length);

    let settled = false;
    const commit = async () => {
      if (settled) return;
      settled = true;
      const newText = input.value.trim();
      if (!newText || newText === goal.text) { renderGoals(); return; }
      await saveGoalEdit(goal.id, newText);
    };
    const cancel = () => { if (!settled) { settled = true; renderGoals(); } };

    input.addEventListener("blur", commit);
    input.addEventListener("keydown", (e) => {
      if (e.key === "Enter") { e.preventDefault(); commit(); }
      if (e.key === "Escape") { e.preventDefault(); cancel(); }
    });
  }

  async function addGoal() {
    const input = document.getElementById("goalInput");
    const text = input.value.trim();
    if (!text) return;
    const { data, error } = await supabase
      .from("goals")
      .insert({ user_id: currentUser.id, text })
      .select()
      .single();
    if (error) { alert(error.message); return; }
    goals.push(data);
    input.value = "";
    renderGoals();
    input.focus();
  }

  async function saveGoalEdit(id, newText) {
    const { error } = await supabase
      .from("goals")
      .update({ text: newText, updated_at: new Date().toISOString() })
      .eq("id", id);
    if (error) { alert(error.message); renderGoals(); return; }
    const goal = goals.find((g) => g.id === id);
    if (goal) goal.text = newText;
    renderGoals();
  }

  async function deleteGoal(id) {
    const { error } = await supabase.from("goals").delete().eq("id", id);
    if (error) { alert(error.message); return; }
    goals = goals.filter((g) => g.id !== id);
    renderGoals();
  }

  document.getElementById("addGoalBtn").addEventListener("click", addGoal);
  document.getElementById("goalInput").addEventListener("keydown", (e) => {
    if (e.key === "Enter") addGoal();
  });

  // =====================================================================
  // Render: date bar
  // =====================================================================
  function renderDateBar() {
    const key = toKey(selectedDate);
    document.getElementById("weekdayLabel").textContent = WEEKDAYS[selectedDate.getDay()];
    document.getElementById("fullDateLabel").textContent =
      `${MONTHS[selectedDate.getMonth()]} ${selectedDate.getDate()}, ${selectedDate.getFullYear()}`;
    document.getElementById("datePicker").value = key;
    document.getElementById("btnToday").classList.toggle("today-active", key === toKey(startOfToday()));
  }

  // =====================================================================
  // Render + actions: hours
  // =====================================================================
  function renderHours() {
    const entry = getEntry(toKey(selectedDate));
    const hours = entry.hours || 0;
    document.getElementById("hoursNum").textContent = (Math.round(hours * 100) / 100).toString();
    const pct = Math.min(100, (hours / 8) * 100);
    document.getElementById("hoursBarFill").style.width = pct + "%";
    document.getElementById("manualHours").value = "";
  }

  async function commitHours(newHours) {
    const key = toKey(selectedDate);
    const clamped = Math.max(0, Math.min(24, Math.round(newHours * 100) / 100));
    // Only work_hours + updated_at are in the payload, so on conflict this
    // updates just those columns — it does not touch/clear missions.
    const { error } = await supabase
      .from("daily_logs")
      .upsert(
        { user_id: currentUser.id, date: key, work_hours: clamped, updated_at: new Date().toISOString() },
        { onConflict: "user_id,date" }
      );
    if (error) { alert(error.message); return; }
    logs[key] = logs[key] || { hours: 0, tasks: [] };
    logs[key].hours = clamped;
    renderAll();
  }

  document.querySelectorAll(".quick-add").forEach((btn) => {
    btn.addEventListener("click", () => {
      const entry = getEntry(toKey(selectedDate));
      commitHours((entry.hours || 0) + parseFloat(btn.dataset.add));
    });
  });
  document.getElementById("setHoursBtn").addEventListener("click", () => {
    const val = parseFloat(document.getElementById("manualHours").value);
    if (!isNaN(val) && val >= 0) commitHours(val);
  });
  document.getElementById("manualHours").addEventListener("keydown", (e) => {
    if (e.key === "Enter") document.getElementById("setHoursBtn").click();
  });
  document.getElementById("resetHours").addEventListener("click", () => commitHours(0));

  // =====================================================================
  // Render + actions: tasks
  // =====================================================================
  function renderTasks() {
    const key = toKey(selectedDate);
    const entry = getEntry(key);
    const list = document.getElementById("taskList");
    const tasks = entry.tasks || [];
    document.getElementById("taskCountLabel").textContent = `${tasks.length} ${tasks.length === 1 ? "entry" : "entries"}`;

    if (tasks.length === 0) {
      list.innerHTML = `<li style="border:none;"><div class="empty-state" style="width:100%;">No missions logged for this day yet.</div></li>`;
      return;
    }

    list.innerHTML = "";
    tasks.forEach((task) => {
      const li = document.createElement("li");
      const time = new Date(task.ts);
      const timeStr = time.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
      li.innerHTML = `
        <div class="task-dot"></div>
        <div class="task-text"></div>
        <div class="task-time">${timeStr}</div>
        <button class="task-del" aria-label="Delete task">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><path d="M18 6L6 18M6 6l12 12"/></svg>
        </button>
      `;
      li.querySelector(".task-text").textContent = task.text; // textContent — never innerHTML — avoids XSS
      li.querySelector(".task-del").addEventListener("click", () => deleteTask(key, task.id));
      list.appendChild(li);
    });
  }

  // missions is a jsonb array on the daily_logs row, so adding/removing a
  // task means writing the whole array back. Fine for one person editing
  // their own day; if you expect the same account open in multiple tabs at
  // once editing the same date simultaneously, consider a Postgres RPC that
  // mutates the array atomically instead.
  async function addTask() {
    const input = document.getElementById("taskInput");
    const text = input.value.trim();
    if (!text) return;
    const key = toKey(selectedDate);

    const existing = getEntry(key).tasks || [];
    const newTask = { id: crypto.randomUUID(), text, ts: Date.now() };
    const updated = [...existing, newTask];

    const { error } = await supabase
      .from("daily_logs")
      .upsert(
        { user_id: currentUser.id, date: key, missions: updated, updated_at: new Date().toISOString() },
        { onConflict: "user_id,date" }
      );
    if (error) { alert(error.message); return; }

    logs[key] = logs[key] || { hours: 0, tasks: [] };
    logs[key].tasks = updated;
    input.value = "";
    renderAll();
    input.focus();
  }

  async function deleteTask(key, taskId) {
    const remaining = (getEntry(key).tasks || []).filter((t) => t.id !== taskId);
    const { error } = await supabase
      .from("daily_logs")
      .update({ missions: remaining, updated_at: new Date().toISOString() })
      .eq("date", key);
    if (error) { alert(error.message); return; }
    if (logs[key]) logs[key].tasks = remaining;
    renderAll();
  }
  document.getElementById("addTaskBtn").addEventListener("click", addTask);
  document.getElementById("taskInput").addEventListener("keydown", (e) => {
    if (e.key === "Enter") addTask();
  });

  // =====================================================================
  // Render: week ribbon + metrics
  // =====================================================================
  function renderWeekAndMetrics() {
    const today = startOfToday();
    const days = [];
    for (let i = 6; i >= 0; i--) days.push(addDays(today, -i));

    const ribbon = document.getElementById("weekRibbon");
    ribbon.innerHTML = "";

    const hoursList = days.map((d) => getEntry(toKey(d)).hours || 0);
    const maxHours = Math.max(1, ...hoursList);

    let weekTotal = 0, weekTasks = 0;
    days.forEach((d) => {
      const key = toKey(d);
      const entry = getEntry(key);
      const h = entry.hours || 0;
      weekTotal += h;
      weekTasks += (entry.tasks || []).length;

      const tab = document.createElement("div");
      tab.className = "ribbon-tab" + (key === toKey(selectedDate) ? " selected" : "");
      const heightPct = Math.max(4, (h / maxHours) * 100);
      tab.innerHTML = `
        <div class="ribbon-day">${WEEKDAYS[d.getDay()].slice(0, 3)}</div>
        <div class="ribbon-bar-track"><div class="ribbon-bar" style="height:${heightPct}%"></div></div>
        <div class="ribbon-val">${h ? Math.round(h * 10) / 10 : "–"}</div>
      `;
      tab.addEventListener("click", () => {
        selectedDate = d;
        renderAll();
      });
      ribbon.appendChild(tab);
    });

    document.getElementById("metricWeekTotal").textContent = Math.round(weekTotal * 10) / 10 + "h";
    document.getElementById("metricDailyAvg").textContent = Math.round((weekTotal / 7) * 10) / 10 + "h";
    document.getElementById("metricWeekTasks").textContent = weekTasks;

    let streak = 0;
    let cursor = today;
    while (true) {
      const h = getEntry(toKey(cursor)).hours || 0;
      if (h > 0) { streak++; cursor = addDays(cursor, -1); } else break;
    }
    document.getElementById("metricStreak").textContent = streak;
  }

  // =====================================================================
  // Render + actions: history
  // =====================================================================
  function renderHistory() {
    const keys = Object.keys(logs)
      .filter((k) => logs[k].hours > 0 || (logs[k].tasks && logs[k].tasks.length > 0))
      .sort((a, b) => b.localeCompare(a));

    const list = document.getElementById("historyList");
    document.getElementById("historyCountLabel").textContent = `${keys.length} ${keys.length === 1 ? "day" : "days"}`;

    if (keys.length === 0) {
      list.innerHTML = `<div class="empty-state">No history yet. Start logging your day.</div>`;
      return;
    }

    list.innerHTML = "";
    keys.forEach((key) => {
      const entry = logs[key];
      const d = fromKey(key);
      const row = document.createElement("div");
      row.className = "history-row" + (key === toKey(selectedDate) ? " selected" : "");
      row.innerHTML = `
        <div class="history-date">
          <div class="d1">${MONTHS[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()}</div>
          <div class="d2">${WEEKDAYS[d.getDay()]}</div>
        </div>
        <div class="history-tasks">${(entry.tasks || []).length} ${(entry.tasks || []).length === 1 ? "task" : "tasks"}</div>
        <div class="history-hours">${Math.round((entry.hours || 0) * 100) / 100}h</div>
        <button class="history-del" aria-label="Delete entry">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><path d="M3 6h18M8 6V4a2 2 0 012-2h4a2 2 0 012 2v2m2 0v14a2 2 0 01-2 2H8a2 2 0 01-2-2V6h12z"/></svg>
        </button>
      `;
      row.addEventListener("click", (e) => {
        if (e.target.closest(".history-del")) return;
        selectedDate = fromKey(key);
        renderAll();
      });
      row.querySelector(".history-del").addEventListener("click", async (e) => {
        e.stopPropagation();
        const { error } = await supabase.from("daily_logs").delete().eq("date", key);
        if (error) { alert(error.message); return; }
        delete logs[key];
        renderAll();
      });
      list.appendChild(row);
    });
  }

  // =====================================================================
  // Date navigation
  // =====================================================================
  document.getElementById("prevDay").addEventListener("click", () => { selectedDate = addDays(selectedDate, -1); renderAll(); });
  document.getElementById("nextDay").addEventListener("click", () => { selectedDate = addDays(selectedDate, 1); renderAll(); });
  document.getElementById("btnToday").addEventListener("click", () => { selectedDate = startOfToday(); renderAll(); });
  document.getElementById("btnYesterday").addEventListener("click", () => { selectedDate = addDays(startOfToday(), -1); renderAll(); });
  document.getElementById("datePicker").addEventListener("change", (e) => {
    if (e.target.value) { selectedDate = fromKey(e.target.value); renderAll(); }
  });

  // =====================================================================
  // Master render + boot
  // =====================================================================
  function renderAll() {
    renderDateBar();
    renderHours();
    renderTasks();
    renderGoals();
    renderWeekAndMetrics();
    renderHistory();
  }

  initTheme();
  setAuthMode("login");
  checkExistingSession();
})();
