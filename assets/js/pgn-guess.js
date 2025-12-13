// ============================================================================
// pgn-guess.js — Interactive PGN viewer (uses PGNCore)
// Progressive reveal with correct move numbers:
//   - White:  "N."
//   - Black at paragraph start: "N..."
// Comments force paragraph breaks.
// ============================================================================

(function () {
  "use strict";

  if (typeof Chess !== "function") return;
  if (typeof Chessboard !== "function") return;
  if (!window.PGNCore) return;

  const C = window.PGNCore;

  function safeChessboard(targetEl, options, tries = 30, onReady) {
    const el = targetEl;
    if (!el) return null;

    const r = el.getBoundingClientRect();
    if ((r.width <= 0 || r.height <= 0) && tries > 0) {
      requestAnimationFrame(() =>
        safeChessboard(targetEl, options, tries - 1, onReady)
      );
      return null;
    }

    try {
      const b = Chessboard(el, options);
      if (onReady) onReady(b);
      return b;
    } catch {
      if (tries > 0) {
        requestAnimationFrame(() =>
          safeChessboard(targetEl, options, tries - 1, onReady)
        );
      }
      return null;
    }
  }

  class ReaderPGNView {
    constructor(src) {
      if (src.__pgnReaderRendered) return;
      src.__pgnReaderRendered = true;

      this.sourceEl = src;
      this.wrapper = document.createElement("div");
      this.wrapper.className = "pgn-guess-block";

      this.board = null;
      this.build();
      this.initBoardAndControls();
      this.hideAll();
    }

    build() {
      let raw = (this.sourceEl.textContent || "").trim();
      raw = C.normalizeFigurines(raw);

      this.wrapper.innerHTML =
        '<div class="pgn-guess-cols">' +
          '<div class="pgn-guess-left">' +
            '<div class="pgn-guess-board"></div>' +
            '<div class="pgn-guess-buttons">' +
              '<button class="pgn-guess-btn pgn-guess-prev">◀</button>' +
              '<button class="pgn-guess-btn pgn-guess-next">▶</button>' +
            '</div>' +
          '</div>' +
          '<div class="pgn-guess-right"></div>' +
        '</div>';

      this.sourceEl.replaceWith(this.wrapper);

      this.boardDiv = this.wrapper.querySelector(".pgn-guess-board");
      this.movesCol = this.wrapper.querySelector(".pgn-guess-right");

      this.stream = document.createElement("div");
      this.stream.className = "pgn-guess-stream";
      this.movesCol.appendChild(this.stream);

      this.parsePGN(raw);
    }

    parsePGN(text) {
      const chess = new Chess();

      this.items = [];
      this.moveItems = [];

      let ply = 0;
      let i = 0;
      let inVariation = 0;
      let newParagraph = true;

      const makeSpan = (cls, txt) => {
        const s = document.createElement("span");
        s.className = cls;
        s.textContent = txt;
        s.style.display = "none";
        this.stream.appendChild(s);
        this.items.push(s);
        return s;
      };

      const makeComment = (txt) => {
        const p = document.createElement("p");
        p.className = "pgn-comment";
        p.textContent = txt;
        p.style.display = "none";
        this.stream.appendChild(p);
        this.items.push(p);
        newParagraph = true;
        return p;
      };

      while (i < text.length) {
        const ch = text[i];

        if (ch === "(") { inVariation++; i++; continue; }
        if (ch === ")" && inVariation > 0) { inVariation--; i++; continue; }
        if (inVariation > 0) { i++; continue; }

        if (ch === "{") {
          let j = i + 1;
          while (j < text.length && text[j] !== "}") j++;
          const raw = text.slice(i + 1, j).replace(/\[%.*?]/g, "").trim();
          if (raw) makeComment(raw);
          i = j + 1;
          continue;
        }

        if (/\s/.test(ch)) { i++; continue; }

        const start = i;
        while (i < text.length && !/\s/.test(text[i]) && !"(){}".includes(text[i])) i++;
        const tok = text.slice(start, i);

        if (/^\d+\.*$/.test(tok)) continue;
        if (/^(1-0|0-1|1\/2-1\/2|\*)$/.test(tok)) continue;

        const core = tok.replace(/[^a-hKQRBN0-9=O0-]+$/g, "").replace(/0/g, "O");
        if (!C.SAN_CORE_REGEX.test(core)) continue;

        const isWhite = ply % 2 === 0;
        const moveNum = Math.floor(ply / 2) + 1;

        if (newParagraph) {
          if (isWhite) {
            makeSpan("pgn-movenum guess-num", moveNum + ". ");
          } else {
            makeSpan("pgn-movenum guess-num", moveNum + "... ");
          }
        } else if (isWhite) {
          makeSpan("pgn-movenum guess-num", moveNum + ". ");
        }

        const mv = chess.move(core, { sloppy: true });
        if (!mv) continue;

        const m = makeSpan("pgn-move guess-move", tok + " ");
        m.dataset.fen = chess.fen();

        this.moveItems.push(m);
        ply++;
        newParagraph = false;
      }

      this.mainlineIndex = -1;
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

    hideAll() {
      this.items.forEach((el) => (el.style.display = "none"));
    }

    revealThroughMoveIndex(idx) {
      let shownMoves = 0;
      for (const el of this.items) {
        if (el.classList.contains("guess-move")) {
          if (shownMoves > idx) break;
          shownMoves++;
        }
        el.style.display = "";
      }
    }

    next() {
      if (this.mainlineIndex + 1 >= this.moveItems.length) return;
      this.mainlineIndex++;

      this.revealThroughMoveIndex(this.mainlineIndex);
      const span = this.moveItems[this.mainlineIndex];
      this.board.position(span.dataset.fen, true);
    }

    prev() {
      if (this.mainlineIndex < 0) return;
      this.mainlineIndex--;

      this.revealThroughMoveIndex(this.mainlineIndex);
      if (this.mainlineIndex < 0) {
        this.board.position("start", true);
      } else {
        this.board.position(this.moveItems[this.mainlineIndex].dataset.fen, true);
      }
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
