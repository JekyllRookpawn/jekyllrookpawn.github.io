// ============================================================================
// pgn-guess.js — Interactive PGN viewer (uses PGNCore)
// FINAL BEHAVIOR FIX:
//   - Move list wraps and scrolls vertically
//   - ONLY revealed moves are visible (guess-the-move mode)
//   - Future moves stay hidden
// ============================================================================

(function () {
  "use strict";

  if (typeof Chess !== "function") return;
  if (typeof Chessboard !== "function") return;
  if (!window.PGNCore) return;

  const C = window.PGNCore;

  // ---- Inject hard wrap CSS once -------------------------------------------
  function ensureWrapCSSOnce() {
    if (document.getElementById("pgn-guess-wrap-css")) return;

    const style = document.createElement("style");
    style.id = "pgn-guess-wrap-css";
    style.textContent = `
      .pgn-guess-right{
        white-space: normal !important;
        overflow-x: hidden !important;
        overflow-y: auto !important;
        word-break: break-word !important;
        overflow-wrap: anywhere !important;
        min-width: 0 !important;
      }
      .pgn-guess-cols{
        min-width: 0 !important;
      }
      .pgn-guess-right .pgn-guess-stream{
        display: block !important;
        white-space: normal !important;
        word-break: break-word !important;
        overflow-wrap: anywhere !important;
      }
      .pgn-guess-right .guess-move,
      .pgn-guess-right .guess-num{
        display: inline !important;
        white-space: normal !important;
      }
    `;
    document.head.appendChild(style);
  }

  // ---- Chessboard init guard ----------------------------------------------
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
      const b = Chessboard(targetEl, options);
      onReady && onReady(b);
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

      ensureWrapCSSOnce();

      this.sourceEl = src;
      this.wrapper = document.createElement("div");
      this.wrapper.className = "pgn-guess-block";

      this.build();
      this.initBoardAndControls();

      this.mainlineIndex = -1;
      this.updateVisibility();
    }

    build() {
      let raw = (this.sourceEl.textContent || "").trim();
      raw = C.normalizeFigurines(raw);

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

      const makeMove = (label, san, fen) => {
        const span = document.createElement("span");
        span.className = "pgn-move guess-move";
        span.dataset.fen = fen;

        if (label) {
          const n = document.createElement("span");
          n.className = "guess-num";
          n.textContent = label;
          span.appendChild(n);
        }

        span.appendChild(document.createTextNode(san + " "));
        this.stream.appendChild(span);

        this.items.push(span);
        this.moveItems.push(span);

        newParagraph = false;
      };

      const makeComment = (txt) => {
        const p = document.createElement("p");
        p.className = "pgn-comment";
        p.textContent = txt;
        this.stream.appendChild(p);
        this.items.push(p);
        newParagraph = true;
      };

      while (i < text.length) {
        const ch = text[i];

        if (ch === "(") { inVariation++; i++; newParagraph = true; continue; }
        if (ch === ")" && inVariation) { inVariation--; i++; continue; }
        if (inVariation) { i++; continue; }

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

        if (/^\d+\.{1,3}$/.test(tok)) continue;
        if (/^(1-0|0-1|1\/2-1\/2|\*)$/.test(tok)) continue;

        const core = tok.replace(/[^a-hKQRBN0-9=O0-]+$/g, "").replace(/0/g, "O");
        if (!C.SAN_CORE_REGEX.test(core)) continue;

        const isWhite = ply % 2 === 0;
        const moveNum = Math.floor(ply / 2) + 1;

        const mv = chess.move(core, { sloppy: true });
        if (!mv) continue;

        let label = null;
        if (isWhite) label = moveNum + ". ";
        else if (newParagraph) label = moveNum + "... ";

        makeMove(label, tok, chess.fen());
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

    updateVisibility() {
      let moveCount = 0;

      for (const el of this.items) {
        if (el.classList.contains("guess-move")) {
          if (moveCount <= this.mainlineIndex) {
            el.style.display = "";
          } else {
            el.style.display = "none";
          }
          moveCount++;
        } else {
          // comments belong to the last revealed move
          el.style.display = moveCount - 1 <= this.mainlineIndex ? "" : "none";
        }
      }
    }

    next() {
      if (this.mainlineIndex + 1 >= this.moveItems.length) return;
      this.mainlineIndex++;
      this.updateVisibility();
      this.board.position(this.moveItems[this.mainlineIndex].dataset.fen, true);
    }

    prev() {
      if (this.mainlineIndex < 0) return;
      this.mainlineIndex--;
      this.updateVisibility();

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

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init, { once: true });
  } else {
    init();
  }
})();
