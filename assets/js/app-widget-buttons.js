document.addEventListener("DOMContentLoaded", () => {

  if (!window.JC) return;

  const container = document.querySelector(".placeholder-controls");
  if (!container) return;

  container.textContent = "";

  /* ======================================================
   * BUTTON FACTORY + CHECKMARK
   * ====================================================== */

  function makeButton(label, title) {
    const wrap = document.createElement("span");
    wrap.style.position = "relative";
    wrap.style.display = "inline-flex";
    wrap.style.alignItems = "center";

    const b = document.createElement("button");
    b.type = "button";
    b.textContent = label;
    b.title = title;

    const check = document.createElement("span");
    check.textContent = "✓";
    check.style.cssText = `
      color: #3ddc84;
      font-size: 16px;
      margin-left: 6px;
      opacity: 0;
      transition: opacity .2s ease;
    `;

    wrap.appendChild(b);
    wrap.appendChild(check);

    return { wrap, button: b, check };
  }

  function showCheck(check) {
    check.style.opacity = "1";
    setTimeout(() => check.style.opacity = "0", 3000);
  }

  const fenBtn     = makeButton("📋", "Copy FEN");
  const pgnBtn     = makeButton("📄", "Copy PGN");
  const commentBtn = makeButton("➕", "Add comment");
  const promoteBtn = makeButton("⬆️", "Promote variation");
  const deleteBtn  = makeButton("🗑️", "Delete variation");
  const undoBtn    = makeButton("↶", "Undo");

  /* initial visibility */
  promoteBtn.wrap.style.display = "none";
  deleteBtn.wrap.style.display  = "none";
  undoBtn.wrap.style.display    = "none";

  container.append(
    fenBtn.wrap,
    pgnBtn.wrap,
    commentBtn.wrap,
    promoteBtn.wrap,
    deleteBtn.wrap,
    undoBtn.wrap
  );


  /* ======================================================
   * COMMENT MODAL
   * ====================================================== */

  const modal = document.createElement("div");
  modal.style.cssText = `
    position: fixed;
    inset: 0;
    background: rgba(0,0,0,.6);
    display: none;
    align-items: center;
    justify-content: center;
    z-index: 9999;
  `;

  modal.innerHTML = `
    <div style="
      background:#161a24;
      padding:16px;
      border-radius:12px;
      width:min(90vw,400px);
      box-shadow:0 10px 30px rgba(0,0,0,.5)
    ">
      <textarea id="jc-comment-text"
        style="width:100%;min-height:100px;padding:10px;border-radius:8px"></textarea>
      <div style="margin-top:10px;text-align:right">
        <button id="jc-comment-done">Done</button>
      </div>
    </div>
  `;

  document.body.appendChild(modal);

  const commentBox  = modal.querySelector("#jc-comment-text");
  const commentDone = modal.querySelector("#jc-comment-done");


  /* ======================================================
   * HELPERS
   * ====================================================== */

  function getCursor() {
    return window.JC.getCursor();
  }

  function isVariation(node) {
    return node && node.parent && node.parent.next !== node;
  }

  function copy(text) {
    navigator.clipboard.writeText(text).catch(() => {});
  }

  function serializePGN() {
    const el = document.getElementById("moves");
    return el ? el.innerText.trim() : "";
  }


  /* ======================================================
   * UNDO STACK (single-level)
   * ====================================================== */

  let undoAction = null;

  function setUndo(action) {
    undoAction = action;
    undoBtn.wrap.style.display = "";
  }

  function clearUndo() {
    undoAction = null;
    undoBtn.wrap.style.display = "none";
  }


  /* ======================================================
   * BUTTON ACTIONS
   * ====================================================== */

  // COPY FEN
  fenBtn.button.onclick = () => {
    const n = getCursor();
    if (!n?.fen) return;
    copy(n.fen);
    showCheck(fenBtn.check);
  };

  // COPY PGN
  pgnBtn.button.onclick = () => {
    copy(serializePGN());
    showCheck(pgnBtn.check);
  };

  // ADD COMMENT
  commentBtn.button.onclick = () => {
    const n = getCursor();
    if (!n || n === window.JC.getRoot()) return;

    commentBox.value = n.comment || "";
    modal.style.display = "flex";

    commentDone.onclick = () => {
      n.comment = commentBox.value.trim();
      modal.style.display = "none";
      window.JC.render();
    };
  };

  // PROMOTE VARIATION
  promoteBtn.button.onclick = () => {
    const n = getCursor();
    if (!isVariation(n)) return;

    const p = n.parent;
    const oldMain = p.next;

    setUndo({
      type: "promote",
      parent: p,
      promoted: n,
      previousMain: oldMain
    });

    p.vars = p.vars.filter(v => v !== n);
    if (oldMain) p.vars.unshift(oldMain);
    p.next = n;

    window.JC.setCursor(n);
    window.JC.rebuildTo(n, true);
    window.JC.render();
  };

  // DELETE VARIATION
  deleteBtn.button.onclick = () => {
    const n = getCursor();
    if (!isVariation(n)) return;

    const p = n.parent;

    setUndo({
      type: "delete",
      parent: p,
      deleted: n
    });

    p.vars = p.vars.filter(v => v !== n);

    window.JC.setCursor(p);
    window.JC.rebuildTo(p, true);
    window.JC.render();
  };

  // UNDO
  undoBtn.button.onclick = () => {
    if (!undoAction) return;

    const a = undoAction;

    if (a.type === "promote") {
      a.parent.next = a.previousMain;
      a.parent.vars = a.parent.vars.filter(v => v !== a.previousMain);
      a.parent.vars.unshift(a.promoted);
      window.JC.setCursor(a.promoted.parent);
    }

    if (a.type === "delete") {
      a.parent.vars.push(a.deleted);
      window.JC.setCursor(a.deleted);
    }

    window.JC.rebuildTo(window.JC.getCursor(), true);
    window.JC.render();
    clearUndo();
  };


  /* ======================================================
   * VISIBILITY / STATE MANAGEMENT
   * ====================================================== */

  function updateStates() {
    const n = getCursor();
    const isVar = isVariation(n);

    promoteBtn.wrap.style.display = isVar ? "" : "none";
    deleteBtn.wrap.style.display  = isVar ? "" : "none";
  }

  document.addEventListener("click", e => {
    if (e.target.classList.contains("move")) {
      setTimeout(updateStates, 0);
    }
  });

  updateStates();
  clearUndo();

});
