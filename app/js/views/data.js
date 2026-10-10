// Data: backups, folder sync, and demo data.

function dataView() {
  const fileMode = location.protocol === "file:";
  const folderButtons = folder.handle
    ? `<button id="fsGrant">Restore access</button> <button id="fsImport">Import inbox now</button> <button id="fsWrite">Write state now</button>`
    : "";
  return `
    <div class="grid">
      <div class="panel">
        <h2>Backups</h2>
        <p>Everything is saved automatically in this browser (localStorage). Switching browsers, moving this folder, or clearing
          site data can lose it, so export a backup now and then.</p>
        <p>A backup is a single JSON file. Importing one first downloads a backup of your current data, then asks before replacing it.</p>
        <button id="backup">Export backup</button> <button id="import">Import backup</button>
      </div>

      <div class="panel">
        <h2>Folder sync</h2>
        <p>Connect this project's folder and the dashboard writes every change to <code>data/state/dashboard-state.json</code>,
          and imports new jobs from <code>data/scout/inbox.json</code> (and any <code>inbox-&lt;engine&gt;.json</code>).
          That is how your AI agent and the sync scripts see your decisions.</p>
        <p class="meta" id="fsStatus">${esc(folder.statusText())}</p>
        <button id="fsConnect" class="primary" ${folder.supported() ? "" : "disabled"}>${folder.handle ? "Change folder" : "Connect folder"}</button>
        ${folderButtons}
        <p class="meta">Choose the project's root folder (the one containing <code>app/</code> and <code>data/</code>).
          Works in Chrome and Edge when the page is served from localhost${fileMode ? " — run <code>python serve.py</code> and open http://localhost:8765/app/" : ""}.
          The browser asks for permission once per visit.</p>
      </div>

      <div class="panel">
        <h2>Demo data</h2>
        <p>${state.demo
          ? "You are looking at fictional demo data. Clear it to start with an empty dashboard. Folder sync stays paused until you do."
          : "Load the fictional demo dataset to explore the dashboard. Your current data is downloaded as a backup first."}</p>
        ${state.demo ? '<button id="clearDemo" class="primary">Clear demo data and start fresh</button>' : '<button id="loadDemo">Load demo data</button>'}
        <button id="eraseAll" class="danger">Erase all data</button>
      </div>

      <div class="panel">
        <h2>Files in this project</h2>
        <div class="file-links">
          <a href="../README.md" target="_blank">README ↗</a>
          <a href="../workflow/profile.example.md" target="_blank">Example candidate profile ↗</a>
          <a href="../workflow/job-scout/SKILL.md" target="_blank">Scout instructions for your agent ↗</a>
          <a href="../docs/data-formats.md" target="_blank">Data formats ↗</a>
        </div>
        <p class="meta">Your own profile (<code>workflow/profile.md</code>) and everything under <code>data/</code> stay on your machine and are git-ignored.</p>
      </div>
    </div>`;
}
