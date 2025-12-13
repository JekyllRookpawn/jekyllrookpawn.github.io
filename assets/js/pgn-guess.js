// ============================================================================
// pgn-guess.js — Guess-the-move PGN viewer (single-move display)
// Behavior:
//   - Right pane starts empty
//   - Each ▶ shows ONLY the last move (+ its comments)
//   - Previous moves disappear
// Fix:
//   - Comments are attached to the MOVE THEY FOLLOW (not one move late)
// ============================================================================

(function () {
  "use strict";

  if (typeof Chess !== "function") return;
  if (typeof Chessboard !== "function") return;
  if (!window.PGNCore) return;

  const C = window.PGNCore;

  // --------------------------------------------------------------------------
  function safeChessboard(targetEl, options, tries = 30, onReady) {
    if (!targetEl) return null;

    const r = targetEl.getBoundingClientRect();
    if ((r.width <= 0 || r.height <= 0) && tries > 0) {
      requestAnimationFrame(() =>
        safeChessboard(targetEl, options, tries - 1, onReady)
      );
      return null;
    }

    try {
      const board = Chessboard(targetEl, options);
      onReady && onReady(board);
      return board;
    } catch {
      if (tries > 0) {
        requestAnimationFrame(() =>
          safeChessboard(targetEl, options, tries - 1, onReady)
        );
      }
      return null;
    }
  }

  // --------------------------------------------------------------------------
  class ReaderPGNView {
    constructor(src) {
      if (src.__pgnReaderRendered) return;
      src.__pgnReaderRendered = true;

      this.sourceEl = src;
      this.wrapper = document.createElement("div");
      this.wrapper.className = "pgn-guess-block";

      this.moves = []; // { label, fen, comments[] }
      this.index = -1;

      this.build();
      this.parsePGN();
      this.initBoardAndControls();
      this.renderRightPane();
    }

    build() {
      this.wrapper.innerHTML =
        '<div class="pgn-guess-cols">' +
          '<div class="pgn-guess-left">' +
            '<div class="pgn-guess-board"></div>' +
            '<div class="pgn-guess-buttons">' +
              '<button class="pgn-guess-btn pgn-guess-prev" type="button">◀</button>' +
              '<button class="pgn-guess-btn pgn-guess-next" type="button">▶</button>' +
            '</div>' +
          '</div>' +
          '<div class="pgn-guess-right"></div>' +
        '</div>';

      this.sourceEl.replaceWith(this.wrapper);

      this.boardDiv = this.wrapper.querySelector(".pgn-guess-board");
      this.rightPane = this.wrapper.querySelector(".pgn-guess-right");
    }

    parsePGN() {
      // IMPORTANT: read the original text before it was replaced
      // (sourceEl is already replaced in build(), so use wrapper's previousSibling? No.)
      // We must capture from the original element before replace — but since build()
      // already ran, we can read from a stored copy if needed.
      // Easiest: we stored sourceEl; its textContent remains available.
      let raw = (this.sourceEl.textContent || "").trim();
      raw = C.normalizeFigurines(raw);

      const chess = new Chess();

      let ply = 0;
      let i = 0;
      let inVariation = 0;

      // Only used if comments appear before the first move (rare)
      let pendingComments = [];

      const attachComment = (txt) => {
        // strip engine/clock/cal tags
        const cleaned = (txt || "").replace(/\[%.*?]/g, "").trim();
        if (!cleaned) return;

        if (this.moves.length > 0) {
          // ✅ Correct PGN semantics: comment belongs to the preceding move
          this.moves[this.moves.length - 1].comments.push(cleaned);
        } else {
          pendingComments.push(cleaned);
        }
      };

      while (i < raw.length) {
        const ch = raw[i];

        // Skip variations completely (including comments inside them)
        if (ch === "(") { inVariation++; i++; continue; }
        if (ch === ")" && inVariation) { inVariation--; i++; continue; }
        if (inVariation) { i++; continue; }

        // Comments (attach to previous move)
        if (ch === "{") {
          let j = i + 1;
          while (j < raw.length && raw[j] !== "}") j++;
          const txt = raw.slice(i + 1, j);
          attachComment(txt);
          i = j + 1;
          continue;
        }

        // Ignore diagram token ([D]) and similar bracket tokens if present
        if (ch === "[") {
          let j = i + 1;
          while (j < raw.length && raw[j] !== "]") j++;
          i = j + 1;
          continue;
        }

        // Whitespace
        if (/\s/.test(ch)) { i++; continue; }

        // Token
        const start = i;
        while (i < raw.length && !/\s/.test(raw[i]) && !"(){}".includes(raw[i])) i++;
        const tok = raw.slice(start, i);

        // ignore move numbers / results / NAGs
        if (/^\d+\.{1,3}$/.test(tok)) continue;
        if (/^(1-0|0-1|1\/2-1\/2|½-½|\*)$/.test(tok)) continue;
        if (tok[0] === "$") continue;

        const core = tok.replace(/[^a-hKQRBN0-9=O0-]+$/g, "").replace(/0/g, "O");
        if (!C.SAN_CORE_REGEX.test(core)) continue;

        const isWhite = ply % 2 === 0;
        const moveNum = Math.floor(ply / 2) + 1;

        const mv = chess.move(core, { sloppy: true });
        if (!mv) continue;

        const label = isWhite
          ? `${moveNum}. ${tok}`
          : `${moveNum}... ${tok}`;

        const entry = {
          label,
          fen: chess.fen(),
          comments: []
        };

        // If there were comments before the first move, attach them to the first move
        if (pendingComments.length) {
          entry.comments.push(...pendingComments);
          pendingComments = [];
        }

        this.moves.push(entry);
        ply++;
      }
    }

    initBoardAndControls() {
      safeChessboard(
        this.boardDiv,
        {
          position: "start",
          draggable: false,
          pieceTheme: C.PIECE_THEME_URL,
          moveSpeed: 200
        },
        30,
        (b) => (this.board = b)
      );

      this.wrapper.querySelector(".pgn-guess-next")
        .addEventListener("click", () => this.next());
      this.wrapper.querySelector(".pgn-guess-prev")
        .addEventListener("click", () => this.prev());
    }

    renderRightPane() {
      this.rightPane.innerHTML = "";

      if (this.index < 0 || this.index >= this.moves.length) return;

      const m = this.moves[this.index];

      const moveLine = document.createElement("div");
      moveLine.className = "pgn-guess-current-move";
      moveLine.textContent = m.label;
      this.rightPane.appendChild(moveLine);

      (m.comments || []).forEach((c) => {
        const p = document.createElement("p");
        p.className = "pgn-comment";
        p.textContent = c;
        this.rightPane.appendChild(p);
      });
    }

    next() {
      if (this.index + 1 >= this.moves.length) return;
      this.index++;

      const apply = () => {
        if (!this.board || typeof this.board.position !== "function") {
          requestAnimationFrame(apply);
          return;
        }
        this.board.position(this.moves[this.index].fen, true);
      };
      apply();

      this.renderRightPane();
    }

    prev() {
      if (this.index < 0) return;
      this.index--;

      const apply = () => {
        if (!this.board || typeof this.board.position !== "function") {
          requestAnimationFrame(apply);
          return;
        }
        if (this.index < 0) this.board.position("start", true);
        else this.board.position(this.moves[this.index].fen, true);
      };
      apply();

      this.renderRightPane();
    }
  }

  function init() {
    document.querySelectorAll("pgn-guess")
      .forEach((el) => new ReaderPGNView(el));
  }

  document.readyState === "loading"
    ? document.addEventListener("DOMContentLoaded", init, { once: true })
    : init();
})();
