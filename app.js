const CLIENT_ID = "Ov23lixbBF0smeFnPMGs";
const GIST_DESCRIPTION = "topic-library-data";
const GIST_FILENAME = "topic-library.json";
const TOKEN_KEY = "topic_gh_token";
const GIST_ID_KEY = "topic_gh_gist_id";

const ICONS = {
  "lightbulb": '<path d="M15 14c.2-1 .7-1.7 1.5-2.5 1-.9 1.5-2.2 1.5-3.5A6 6 0 0 0 6 8c0 1 .2 2.2 1.5 3.5.7.7 1.3 1.5 1.5 2.5"/><path d="M9 18h6"/><path d="M10 22h4"/>',
  "search": '<circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/>',
  "plus": '<path d="M5 12h14"/><path d="M12 5v14"/>',
  "tag": '<path d="M12.586 2.586A2 2 0 0 0 11.172 2H4a2 2 0 0 0-2 2v7.172a2 2 0 0 0 .586 1.414l8.704 8.704a2.426 2.426 0 0 0 3.42 0l6.58-6.58a2.426 2.426 0 0 0 0-3.42z"/><circle cx="7.5" cy="7.5" r=".5"/>',
  "calendar": '<path d="M8 2v4"/><path d="M16 2v4"/><rect width="18" height="18" x="3" y="4" rx="2"/><path d="M3 10h18"/>',
  "clock": '<circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>',
  "chevron-left": '<path d="m15 18-6-6 6-6"/>',
  "trash": '<path d="M3 6h18"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>',
  "log-out": '<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" x2="9" y1="12" y2="12"/>',
  "link": '<path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/>',
  "x": '<path d="M18 6 6 18"/><path d="m6 6 12 12"/>'
};

const STATUSES = ["灵感", "已选", "制作中", "已发布"];

const state = {
  token: localStorage.getItem(TOKEN_KEY) || "",
  gistId: localStorage.getItem(GIST_ID_KEY) || "",
  db: { ideas: [] },
  ideas: [],
  filters: { q: "", status: "", tag: "", time: "", from: "", to: "" },
  sortDesc: true,
  editingId: null,
  draft: null,
  saveTimer: null,
  savedDraft: "",
  device: null,
  pollTimer: null
};

const $ = (id) => document.getElementById(id);

function icon(name, className = "") {
  return `<svg class="icon ${className}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONS[name] || ""}</svg>`;
}

function mountIcons(root = document) {
  root.querySelectorAll("[data-icon]").forEach((el) => {
    const name = el.dataset.icon;
    if (ICONS[name]) el.innerHTML = icon(name);
  });
}

function escapeHtml(str) {
  return String(str).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

function escapeAttr(str) {
  return escapeHtml(str).replace(/`/g, "&#96;");
}

function showToast(message) {
  const el = $("toast");
  el.textContent = message;
  el.classList.remove("hidden");
  clearTimeout(showToast.timer);
  showToast.timer = setTimeout(() => el.classList.add("hidden"), 1800);
}

async function gh(path, options = {}) {
  const res = await fetch("https://api.github.com" + path, {
    ...options,
    headers: {
      Accept: "application/vnd.github+json",
      "Content-Type": "application/json",
      Authorization: "Bearer " + state.token,
      ...(options.headers || {})
    }
  });
  if (res.status === 401) {
    logout(false);
    throw new Error("登录已失效，请重新登录");
  }
  const text = await res.text();
  let data = {};
  try {
    data = text ? JSON.parse(text) : {};
  } catch (err) {
    data = { message: text };
  }
  if (!res.ok) throw new Error(data.message || "请求失败");
  return data;
}

function showAuth() {
  $("app-view").classList.add("hidden");
  $("editor").classList.add("hidden");
  $("auth-view").classList.remove("hidden");
  $("auth-error").textContent = "";
  $("token-input").value = "";
}

function showApp() {
  $("auth-view").classList.add("hidden");
  $("app-view").classList.remove("hidden");
}

async function enterApp() {
  showApp();
  state.db = await loadDb();
  state.ideas = state.db.ideas || [];
  render();
}

function logout(show = true) {
  clearTimeout(state.saveTimer);
  state.token = "";
  localStorage.removeItem(TOKEN_KEY);
  if (show) showAuth();
}

function tokenLogin() {
  $("auth-error").textContent = "";
  const token = $("token-input").value.trim();
  if (!token) {
    $("auth-error").textContent = "请先粘贴访问令牌";
    return;
  }
  state.token = token;
  localStorage.setItem(TOKEN_KEY, token);
  enterApp().catch((err) => {
    logout(false);
    $("auth-error").textContent = err.message;
  });
}

async function findGist() {
  if (state.gistId) return state.gistId;
  const gists = await gh("/gists?per_page=100");
  const found = Array.isArray(gists) ? gists.find((gist) => gist.description === GIST_DESCRIPTION) : null;
  if (found) {
    state.gistId = found.id;
    localStorage.setItem(GIST_ID_KEY, found.id);
  }
  return state.gistId;
}

async function loadDb() {
  const id = await findGist();
  if (!id) return { ideas: [] };
  const gist = await gh("/gists/" + id);
  const file = gist.files && gist.files[GIST_FILENAME];
  if (!file || !file.content) return { ideas: [] };
  try {
    const db = JSON.parse(file.content);
    if (!Array.isArray(db.ideas)) db.ideas = [];
    return db;
  } catch (err) {
    return { ideas: [] };
  }
}

async function saveDb(db, opts = {}) {
  const content = JSON.stringify(db);
  const id = await findGist();
  if (id) {
    let finalDb = db;
    if (!opts.allowEmpty && (!Array.isArray(db.ideas) || db.ideas.length === 0)) {
      try {
        const current = await gh("/gists/" + id);
        const file = current.files && current.files[GIST_FILENAME];
        if (file && file.content) {
          const server = JSON.parse(file.content);
          if (Array.isArray(server.ideas) && server.ideas.length > 0) {
            finalDb = { ideas: server.ideas };
            showToast("已保留云端已有的内容，没有用空数据覆盖");
          }
        }
      } catch (err) {}
    }
    await gh("/gists/" + id, {
      method: "PATCH",
      body: JSON.stringify({ files: { [GIST_FILENAME]: { content: JSON.stringify(finalDb) } } })
    });
  } else {
    const gist = await gh("/gists", {
      method: "POST",
      body: JSON.stringify({
        description: GIST_DESCRIPTION,
        public: false,
        files: { [GIST_FILENAME]: { content } }
      })
    });
    state.gistId = gist.id;
    localStorage.setItem(GIST_ID_KEY, gist.id);
  }
}

function formatFullDate(iso) {
  if (!iso) return "时间未知";
  return new Intl.DateTimeFormat("zh-CN", {
    year: "numeric", month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit"
  }).format(new Date(iso));
}

async function openRevisions() {
  $("revisions-modal").classList.remove("hidden");
  const listEl = $("revisions-list");
  listEl.innerHTML = '<p class="muted">正在读取历史版本...</p>';
  try {
    const id = await findGist();
    if (!id) {
      listEl.innerHTML = '<p class="muted">还没有云端数据，找不到历史版本。</p>';
      return;
    }
    const commits = await gh("/gists/" + id + "/commits?per_page=30");
    if (!Array.isArray(commits) || commits.length === 0) {
      listEl.innerHTML = '<p class="muted">没有历史版本。</p>';
      return;
    }
    const rows = [];
    for (const commit of commits.slice(0, 20)) {
      let count = null;
      try {
        const rev = await gh("/gists/" + id + "/" + commit.version);
        const file = rev.files && rev.files[GIST_FILENAME];
        if (file && file.content) {
          const db = JSON.parse(file.content);
          if (Array.isArray(db.ideas)) count = db.ideas.length;
        }
      } catch (err) {}
      rows.push({ version: commit.version, at: commit.committed_at, count });
    }
    listEl.innerHTML = rows.map((row) => `
      <div class="revision-row">
        <div>
          <strong>${escapeHtml(formatFullDate(row.at))}</strong>
          <span class="muted">${row.count === null ? "内容无法读取" : `${row.count} 条选题`}</span>
        </div>
        <button type="button" class="btn btn-primary restore-btn" data-version="${escapeAttr(row.version)}">恢复</button>
      </div>`).join("");
  } catch (err) {
    listEl.innerHTML = `<p class="form-error">${escapeHtml(err.message)}</p>`;
  }
}

async function restoreRevision(version) {
  const id = await findGist();
  if (!id) throw new Error("找不到云端数据");
  const rev = await gh("/gists/" + id + "/" + version);
  const file = rev.files && rev.files[GIST_FILENAME];
  if (!file || !file.content) throw new Error("这个版本没有内容");
  const db = JSON.parse(file.content);
  const ideas = Array.isArray(db.ideas) ? db.ideas : [];
  await saveDb({ ideas }, { allowEmpty: true });
  state.db = { ideas };
  state.ideas = ideas;
  $("revisions-modal").classList.add("hidden");
  render();
  showToast(`已恢复 ${ideas.length} 条选题`);
}

function allTags() {
  const set = new Set();
  state.ideas.forEach((idea) => idea.tags.forEach((tag) => set.add(tag)));
  return [...set].sort((a, b) => a.localeCompare(b, "zh-CN"));
}

function formatDate(iso) {
  const d = new Date(iso);
  const now = new Date();
  if (d.toDateString() === now.toDateString()) {
    return `今天 ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
  }
  return new Intl.DateTimeFormat("zh-CN", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" }).format(d);
}

function timePasses(iso) {
  const { time, from, to } = state.filters;
  if (!time) return true;
  const d = new Date(iso);
  const now = new Date();
  if (time === "today") return d >= new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const day = 24 * 60 * 60 * 1000;
  if (time === "7d") return now - d <= 7 * day;
  if (time === "30d") return now - d <= 30 * day;
  if (time === "custom") {
    if (from && d < new Date(from + "T00:00:00")) return false;
    if (to && d > new Date(to + "T23:59:59")) return false;
    return true;
  }
  return true;
}

function filteredIdeas() {
  const { q, status, tag } = state.filters;
  const query = q.trim().toLowerCase();
  let list = state.ideas.filter((idea) => {
    if (status && idea.status !== status) return false;
    if (tag && !idea.tags.includes(tag)) return false;
    if (!timePasses(idea.createdAt)) return false;
    if (query) {
      const hay = [idea.title, idea.content, ...idea.tags].join(" ").toLowerCase();
      if (!hay.includes(query)) return false;
    }
    return true;
  });
  list = [...list].sort((a, b) => {
    const diff = new Date(b.createdAt) - new Date(a.createdAt);
    return state.sortDesc ? diff : -diff;
  });
  return list;
}

function statusChip(value, label, count, active) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "chip" + (active ? " active" : "");
  button.innerHTML = `${escapeHtml(label)}<span class="count">${count}</span>`;
  button.addEventListener("click", () => {
    state.filters.status = value;
    render();
  });
  return button;
}

function ideaCard(idea) {
  const snippet = idea.content || "（只有标题，还没有内容）";
  const tags = idea.tags.map((tag) => `<span class="mini-tag">${icon("tag", "sm")}${escapeHtml(tag)}</span>`).join("");
  return `
    <button class="idea-card" type="button" data-id="${idea.id}">
      <div class="idea-card-top">
        <h2 class="idea-title">${escapeHtml(idea.title)}</h2>
        <span class="status-badge status-${escapeAttr(idea.status)}">${escapeHtml(idea.status)}</span>
      </div>
      <p class="idea-snippet">${escapeHtml(snippet)}</p>
      <div class="idea-meta">
        <span>${formatDate(idea.createdAt)}</span>
        ${tags}
      </div>
    </button>`;
}

function render() {
  const list = filteredIdeas();
  $("idea-count").textContent = `${state.ideas.length} 条选题`;

  const counts = {};
  STATUSES.forEach((s) => (counts[s] = 0));
  state.ideas.forEach((idea) => {
    if (counts[idea.status] !== undefined) counts[idea.status] += 1;
  });

  const statusEl = $("status-filters");
  statusEl.innerHTML = "";
  statusEl.appendChild(statusChip("", "全部", state.ideas.length, state.filters.status === ""));
  STATUSES.forEach((s) => statusEl.appendChild(statusChip(s, s, counts[s], state.filters.status === s)));

  const tagEl = $("tag-filter");
  const tags = allTags();
  const currentTag = tagEl.value;
  tagEl.innerHTML = '<option value="">全部标签</option>' + tags
    .map((tag) => `<option value="${escapeAttr(tag)}">${escapeHtml(tag)}</option>`)
    .join("");
  tagEl.value = tags.includes(currentTag) ? currentTag : "";

  $("sort-label").textContent = state.sortDesc ? "最新在前" : "最早在前";
  $("custom-range").classList.toggle("hidden", state.filters.time !== "custom");

  const listEl = $("idea-list");
  listEl.innerHTML = "";
  if (list.length === 0) {
    $("empty-state").classList.remove("hidden");
    return;
  }
  $("empty-state").classList.add("hidden");
  listEl.innerHTML = list.map(ideaCard).join("");
}

function openEditor(id) {
  const idea = state.ideas.find((item) => item.id === id);
  state.editingId = id || null;
  state.draft = idea
    ? { title: idea.title, content: idea.content, status: idea.status, tags: [...idea.tags], sourceUrl: idea.sourceUrl || "" }
    : { title: "", content: "", status: "灵感", tags: [], sourceUrl: "" };
  state.savedDraft = JSON.stringify(state.draft);
  renderEditor();
  $("editor").classList.remove("hidden");
  $("editor-delete").classList.toggle("hidden", !id);
  setSaveState(id ? "已保存" : "输入标题后自动保存", Boolean(id));
  setTimeout(() => $("editor-title-input").focus(), 50);
}

function closeEditor() {
  clearTimeout(state.saveTimer);
  if (state.editingId && state.savedDraft !== JSON.stringify(state.draft)) {
    saveIdea();
  }
  $("editor").classList.add("hidden");
  state.editingId = null;
  state.draft = null;
}

function renderEditor() {
  $("editor-title-input").value = state.draft.title;
  $("editor-content").value = state.draft.content;
  $("editor-source").value = state.draft.sourceUrl;

  const statusEl = $("editor-status");
  statusEl.innerHTML = "";
  STATUSES.forEach((s) => {
    const chip = document.createElement("button");
    chip.type = "button";
    chip.className = "chip" + (state.draft.status === s ? " active" : "");
    chip.textContent = s;
    chip.addEventListener("click", () => {
      state.draft.status = s;
      renderEditor();
      scheduleSave();
    });
    statusEl.appendChild(chip);
  });

  const tagsEl = $("editor-tags");
  tagsEl.innerHTML = state.draft.tags.map((tag) => `
    <span class="tag-chip">${escapeHtml(tag)}
      <button type="button" data-remove-tag="${escapeAttr(tag)}" aria-label="移除标签 ${escapeAttr(tag)}">${icon("x")}</button>
    </span>`).join("");
  tagsEl.querySelectorAll("[data-remove-tag]").forEach((btn) => {
    btn.addEventListener("click", () => {
      state.draft.tags = state.draft.tags.filter((t) => t !== btn.dataset.removeTag);
      renderEditor();
      scheduleSave();
    });
  });
}

function setSaveState(text, saved = false) {
  const el = $("save-state");
  el.textContent = text;
  el.classList.toggle("saved", saved);
}

function scheduleSave() {
  clearTimeout(state.saveTimer);
  if (!state.draft.title.trim()) {
    setSaveState("输入标题后自动保存");
    return;
  }
  setSaveState("编辑中...");
  state.saveTimer = setTimeout(() => saveIdea(), 800);
}

async function saveIdea() {
  if (!state.draft) return;
  const payload = {
    title: state.draft.title.trim(),
    content: state.draft.content.trim(),
    status: state.draft.status,
    tags: state.draft.tags,
    sourceUrl: state.draft.sourceUrl.trim()
  };
  if (!payload.title) {
    setSaveState("输入标题后自动保存");
    return;
  }
  try {
    let saved;
    if (state.editingId) {
      const index = state.db.ideas.findIndex((idea) => idea.id === state.editingId);
      if (index === -1) throw new Error("记录不存在");
      state.db.ideas[index] = {
        ...state.db.ideas[index],
        ...payload,
        updatedAt: new Date().toISOString()
      };
      saved = state.db.ideas[index];
    } else {
      const now = new Date().toISOString();
      saved = {
        id: crypto.randomUUID(),
        ...payload,
        createdAt: now,
        updatedAt: now
      };
      state.db.ideas.push(saved);
      state.editingId = saved.id;
    }
    await saveDb(state.db);
    state.savedDraft = JSON.stringify({
      title: saved.title,
      content: saved.content,
      status: saved.status,
      tags: [...saved.tags],
      sourceUrl: saved.sourceUrl || ""
    });
    setSaveState(`已保存 ${formatDate(new Date().toISOString())}`, true);
    state.ideas = state.db.ideas;
    render();
  } catch (err) {
    setSaveState("保存失败");
    showToast(err.message);
  }
}

async function deleteCurrentIdea() {
  if (!state.editingId) return closeEditor();
  const idea = state.ideas.find((item) => item.id === state.editingId);
  const ok = window.confirm(`确定删除「${idea ? idea.title : "这条选题"}」吗？`);
  if (!ok) return;
  try {
    state.db.ideas = state.db.ideas.filter((item) => item.id !== state.editingId);
    await saveDb(state.db, { allowEmpty: true });
    closeEditor();
    state.ideas = state.db.ideas;
    render();
    showToast("已删除");
  } catch (err) {
    showToast(err.message);
  }
}

function bindEvents() {
  $("token-login-btn").addEventListener("click", tokenLogin);
  $("token-input").addEventListener("keydown", (e) => {
    if (e.key === "Enter") tokenLogin();
  });
  $("logout-btn").addEventListener("click", () => logout());
  $("revisions-btn").addEventListener("click", openRevisions);
  $("empty-recover-btn").addEventListener("click", openRevisions);
  $("revisions-close").addEventListener("click", () => $("revisions-modal").classList.add("hidden"));
  $("revisions-modal").addEventListener("click", (e) => {
    if (e.target === $("revisions-modal")) $("revisions-modal").classList.add("hidden");
  });
  $("revisions-list").addEventListener("click", (e) => {
    const btn = e.target.closest(".restore-btn");
    if (!btn) return;
    btn.disabled = true;
    btn.textContent = "恢复中...";
    restoreRevision(btn.dataset.version)
      .catch((err) => showToast(err.message))
      .finally(() => {
        btn.disabled = false;
        btn.textContent = "恢复";
      });
  });

  $("search-input").addEventListener("input", (e) => {
    state.filters.q = e.target.value;
    render();
  });

  $("tag-filter").addEventListener("change", (e) => {
    state.filters.tag = e.target.value;
    render();
  });

  $("time-filter").addEventListener("change", (e) => {
    state.filters.time = e.target.value;
    if (e.target.value !== "custom") {
      state.filters.from = "";
      state.filters.to = "";
    }
    render();
  });

  $("date-from").addEventListener("change", (e) => {
    state.filters.from = e.target.value;
    render();
  });

  $("date-to").addEventListener("change", (e) => {
    state.filters.to = e.target.value;
    render();
  });

  $("sort-btn").addEventListener("click", () => {
    state.sortDesc = !state.sortDesc;
    render();
  });

  $("new-idea-btn").addEventListener("click", () => openEditor(null));
  $("idea-list").addEventListener("click", (e) => {
    const card = e.target.closest(".idea-card");
    if (card) openEditor(card.dataset.id);
  });
  $("editor-back").addEventListener("click", closeEditor);
  $("editor-delete").addEventListener("click", deleteCurrentIdea);

  $("editor-title-input").addEventListener("input", (e) => {
    state.draft.title = e.target.value;
    scheduleSave();
  });
  $("editor-content").addEventListener("input", (e) => {
    state.draft.content = e.target.value;
    scheduleSave();
  });
  $("editor-source").addEventListener("input", (e) => {
    state.draft.sourceUrl = e.target.value;
    scheduleSave();
  });

  $("tag-input").addEventListener("keydown", (e) => {
    if (e.key === "Enter" || e.key === ",") {
      e.preventDefault();
      const value = e.target.value.trim().replace(/^#/, "");
      if (value && !state.draft.tags.includes(value)) {
        state.draft.tags.push(value);
        renderEditor();
        scheduleSave();
      }
      e.target.value = "";
    }
  });

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && !$("editor").classList.contains("hidden")) closeEditor();
  });
}

async function init() {
  mountIcons();
  bindEvents();
  if (state.token) {
    try {
      await enterApp();
    } catch (err) {
      logout(false);
    }
  } else {
    showAuth();
  }
}

init();
