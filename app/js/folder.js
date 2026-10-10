// Optional folder sync through the File System Access API (Chrome / Edge, and
// only on http://localhost — browsers do not allow it on file:// pages).
//
// Once you connect the project folder, the dashboard:
//   - writes its state to data/state/dashboard-state.json after every change;
//   - imports data/scout/inbox.json and any data/scout/inbox-<engine>.json;
//   - imports research notes from data/scout/research.json, if present.
// The folder handle is remembered in IndexedDB; the browser asks for
// permission again on each visit.

const folder = {
  handle: null,
  ready: false,
  lastError: "",
  lastImport: "",
  db: null,
  timer: null,

  supported() {
    return location.protocol !== "file:" && "showDirectoryPicker" in window;
  },

  statusText() {
    if (location.protocol === "file:") {
      return "This page was opened as a file (file://), where browsers do not allow folder access. Start the local server (python serve.py) and open http://localhost:8765/app/ instead.";
    }
    if (!("showDirectoryPicker" in window)) return "This browser cannot write to local folders. Use Chrome or Edge.";
    if (!this.handle) return "No folder connected.";
    if (!this.ready) return "Folder remembered; waiting for permission.";
    if (state.demo) return `Connected to “${this.handle.name}”. Sync is paused while demo data is loaded — clear the demo data to start.`;
    return [`Connected to “${this.handle.name}”`, this.lastImport, this.lastError].filter(Boolean).join(" · ");
  },

  paint() {
    const el = $("#fsStatus");
    if (el) el.textContent = this.statusText();
  },

  async openDb() {
    if (this.db) return this.db;
    this.db = await new Promise((resolve, reject) => {
      const req = indexedDB.open("job-search-dashboard-folder", 1);
      req.onupgradeneeded = () => req.result.createObjectStore("handles");
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
    return this.db;
  },

  // On page load: restore the remembered folder, if any.
  async load() {
    if (!this.supported()) return;
    try {
      const db = await this.openDb();
      this.handle = await new Promise((resolve, reject) => {
        const req = db.transaction("handles").objectStore("handles").get("root");
        req.onsuccess = () => resolve(req.result || null);
        req.onerror = () => reject(req.error);
      });
      if (this.handle) {
        const permission = await this.handle.queryPermission({ mode: "readwrite" });
        if (permission === "granted") await this.activate();
        else this.showBanner();
      }
    } catch (e) {
      this.lastError = "Could not restore the connected folder";
    }
    this.paint();
  },

  async remember() {
    const db = await this.openDb();
    await new Promise((resolve, reject) => {
      const req = db.transaction("handles", "readwrite").objectStore("handles").put(this.handle, "root");
      req.onsuccess = resolve;
      req.onerror = () => reject(req.error);
    });
  },

  async connect() {
    try {
      this.handle = await window.showDirectoryPicker({ mode: "readwrite", id: "job-search-dashboard" });
      await this.remember();
      await this.activate();
      render();
    } catch (e) {
      if (e.name !== "AbortError") {
        this.lastError = "Could not connect: " + e.message;
        this.paint();
      }
    }
  },

  async grant() {
    try {
      const permission = await this.handle.requestPermission({ mode: "readwrite" });
      if (permission === "granted") {
        await this.activate();
        render();
      }
    } catch (e) {
      this.lastError = "Permission request failed: " + e.message;
      this.paint();
    }
  },

  async activate() {
    this.ready = true;
    this.lastError = "";
    document.getElementById("fsBanner")?.remove();
    await this.sync();
  },

  // Import first, then write, so the state file always includes the latest inbox.
  async sync() {
    if (!this.ready || state.demo) return;
    await this.importAll(false);
    await this.writeState(false);
  },

  showBanner() {
    if (document.getElementById("fsBanner")) return;
    $("#notice").insertAdjacentHTML(
      "afterend",
      `<p id="fsBanner" class="notice banner"><strong>Folder sync is paused:</strong> the browser needs your permission again.
        <button id="fsBannerGrant" class="small primary">Allow folder access</button></p>`,
    );
  },

  async dir(parts, create) {
    let d = this.handle;
    for (const p of parts) d = await d.getDirectoryHandle(p, { create });
    return d;
  },

  async writeText(parts, name, text) {
    const d = await this.dir(parts, true);
    const file = await d.getFileHandle(name, { create: true });
    const writable = await file.createWritable();
    await writable.write(text);
    await writable.close();
  },

  async readText(parts, name) {
    try {
      const d = await this.dir(parts, false);
      const file = await d.getFileHandle(name);
      return await (await file.getFile()).text();
    } catch (e) {
      return null;
    }
  },

  // inbox.json plus any inbox-<engine>.json, in a stable order.
  async inboxNames() {
    const names = [];
    try {
      const d = await this.dir(["data", "scout"], false);
      for await (const [name, entry] of d.entries()) {
        if (entry.kind === "file" && /^inbox(-[A-Za-z0-9_.-]+)?\.json$/.test(name)) names.push(name);
      }
    } catch (e) {
      // No data/scout folder yet.
    }
    return names.sort();
  },

  scheduleWrite() {
    if (!this.ready || state.demo) return;
    clearTimeout(this.timer);
    this.timer = setTimeout(() => this.writeState(false), 800);
  },

  async writeState(manual) {
    if (!this.ready || state.demo) return;
    try {
      const payload = { ...state, savedAt: new Date().toISOString(), source: "dashboard-autosave" };
      await this.writeText(["data", "state"], "dashboard-state.json", JSON.stringify(payload, null, 1));
      this.lastError = "";
      if (manual) {
        this.lastImport = "Saved at " + formatTime(new Date());
        this.paint();
      }
    } catch (e) {
      this.lastError = "Could not write the state file: " + e.message;
      this.paint();
    }
  },

  async importAll(manual) {
    if (!this.ready || state.demo) return;
    try {
      const totals = { added: 0, updated: 0, withdrawn: 0, researched: 0 };
      const names = await this.inboxNames();
      for (const name of names) {
        const text = await this.readText(["data", "scout"], name);
        if (!text) continue;
        const result = importInbox(state, JSON.parse(text));
        totals.added += result.added;
        totals.updated += result.updated;
        totals.withdrawn += result.withdrawn;
      }
      const research = await this.readText(["data", "scout"], "research.json");
      if (research) totals.researched = importResearch(state, JSON.parse(research));

      if (!names.length && !research) {
        if (manual) {
          this.lastImport = "No inbox files found in data/scout/";
          this.paint();
        }
        return;
      }
      this.lastImport =
        `Inbox: ${totals.added} new, ${totals.updated} updated, ${totals.withdrawn} withdrawn` +
        (totals.researched ? `, ${totals.researched} research notes` : "");
      if (totals.added || totals.updated || totals.withdrawn || totals.researched) {
        save();
        render();
      }
      this.paint();
    } catch (e) {
      this.lastError = "Could not read the inbox: " + e.message;
      this.paint();
    }
  },
};
