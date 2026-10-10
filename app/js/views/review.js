// Weekly review: one free-text note per week.

function reviewView() {
  return `
    <div class="panel">
      <h2>Weekly review · week of ${esc(week)}</h2>
      <p>What moved forward? What is still weak? What feedback did you get from the market? What is the one blocker to clear first next week?</p>
      <textarea id="reviewText" aria-label="Weekly review" class="review-text"
        placeholder="Write down real progress, blockers and next steps…">${esc(state.reviews[week] || "")}</textarea>
      <button id="saveReview" class="primary">Save review</button>
      <span id="reviewSaved" class="meta"></span>
    </div>`;
}
