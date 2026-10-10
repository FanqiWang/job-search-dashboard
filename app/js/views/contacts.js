// Contacts: people you are talking to, with a next follow-up date.

function contactsView() {
  const contacts = state.contacts.filter((c) => !!c.archived === showArchived && inFilter(c));
  const rows = contacts.map(
    (c) => `
      <tr>
        <td><strong>${hl(c.title)}</strong><div class="meta">${hl(c.detail)}</div></td>
        <td>${esc(c.market)}<div class="meta">${esc(c.kind)}</div></td>
        <td>${badge(c.status)}</td>
        <td>${dueBadge(c.due) || '<span class="meta">not set</span>'}</td>
        <td><button class="small" data-edit="contacts:${esc(c.id)}">Open</button></td>
      </tr>`,
  );
  const table = `
    <div class="table-wrap"><table>
      <thead><tr><th>Name / organization</th><th>Region / type</th><th>Status</th><th>Next follow-up</th><th>Actions</th></tr></thead>
      <tbody>${rows.join("")}</tbody>
    </table></div>`;
  return {
    hits: contacts.length,
    html: `
      <div class="panel">
        <h2>${showArchived ? "Archived contacts" : "Contacts"}</h2>
        <p class="meta">Recruiters, referrers and anyone else you are in touch with. Set a next follow-up date and it shows up on the overview and the calendar.</p>
        ${contacts.length ? table : empty(query ? "No contacts match your search." : "No contacts yet. Add the first person you want to reach out to.")}
      </div>`,
  };
}
