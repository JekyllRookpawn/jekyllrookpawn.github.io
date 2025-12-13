// ============================================================================
// pgn-guess.js — Guess-the-move PGN trainer (correct init autoplay logic)
// ============================================================================

(function () {
  "use strict";

  if (typeof Chess !== "function") return;
  if (typeof Chessboard !== "function") return;
  if (!window.PGNCore) return;

  const C = window.PGNCore;

  function ensureGuessStylesOnce() {
    if (document.getElementById("pgn-guess-style")) return;
    const style = document.createElement("style");
    style.id = "pgn-guess-style";
    style.textContent = `
      .pgn-move-row { font-weight: 900; margin-top: 0.5em; }
      .pgn-move-no { margin-right: 0.3em; }
      .pgn-move-white { margin-right: 0.6em; }
      .pgn-move-black { margin-left: 0.3em; }

      .pgn-guess-status {
        margin-top: 0.4em;
        font-weight: 700;
        text-align: center;
        opacity: 0;
        transition: opacity 0.2s ease;
      }

      .pgn-guess-board { touch-action: manipulation; }

      .pgn-guess-board.flash-correct {
        box-shadow: 0 0 0 4px #3fb950 inset;
        animation: flash-green 0.35s ease;
      }

      .pgn-guess-board.flash-wrong {
        box-shadow: 0 0 0 4px #f85149 inset;
        animation: flash-red 0.35s ease;
      }
    `;
    document.head.appendChild(style);
  }

  function safeChessboard(targetEl, options, tries = 30, onReady) {
    if (!targetEl) return;
    const r = targetEl.getBoundingClientRect();
    if ((r.width <= 0 || r.height <= 0) && tries > 0) {
      requestAnimationFrame(() =>
        safeChessboard(targetEl, options, tries - 1, onReady)
      );
      return;
    }
    try {
      const board = Chessboard(targetEl, options);
      onReady && onReady(board);
    } catch {
      if (tries > 0) {
        requestAnimationFrame(() =>
          safeChessboard(targetEl, options, tries - 1, onReady)
        );
      }
    }
  }

  function extractVariationDisplay(text) {
    return text
      .replace(/\[%.*?]/g, "")
      .replace(/\[D\]/g, "")
      .replace(/\{\s*\}/g, "")
      .replace(/\s+/g, " ")
      .trim();
  }

  class ReaderPGNView {
    constructor(src) {
      if (src.__pgnReaderRendered) return;
      src.__pgnReaderRendered = true;

      ensureGuessStylesOnce();

      this.rawText = (src.textContent || "").trim();
      this.flipBoard = src.tagName.toLowerCase() === "pgn-guess-black";
      this.userIsWhite = !this.flipBoard;

      this.moves = [];
      this.index = -1;
      this.currentRow = null;
      this.game = new Chess();

      this.build(src);
      this.parsePGN();
      this.initBoard();
    }

    build(src) {
      const wrapper = document.createElement("div");
      wrapper.innerHTML = `
        <div class="pgn-guess-board"></div>
        <div class="pgn-guess-status"></div>
        <button class="pgn-guess-next">▶</button>
        <div class="pgn-guess-right"></div>
      `;
      src.replaceWith(wrapper);

      this.boardDiv = wrapper.querySelector(".pgn-guess-board");
      this.statusEl = wrapper.querySelector(".pgn-guess-status");
      this.nextBtn = wrapper.querySelector(".pgn-guess-next");
      this.rightPane = wrapper.querySelector(".pgn-guess-right");
    }

    parsePGN() {
      let raw = C.normalizeFigurines(this.rawText);
      const chess = new Chess();
      let ply = 0, i = 0, pending = [];

      const attach = (t) => {
        const c = t.replace(/\[%.*?]/g, "").trim();
        if (!c) return;
        if (this.moves.length) this.moves[this.moves.length - 1].comments.push(c);
        else pending.push(c);
      };

      while (i < raw.length) {
        const ch = raw[i];

        if (ch === "(") {
          let d = 1, j = i + 1;
          while (j < raw.length && d > 0) {
            if (raw[j] === "(") d++;
            else if (raw[j] === ")") d--;
            j++;
          }
          attach(extractVariationDisplay(raw.slice(i + 1, j - 1)));
          i = j;
          continue;
        }

        if (ch === "{") {
          let j = i + 1;
          while (raw[j] !== "}") j++;
          attach(raw.slice(i + 1, j));
          i = j + 1;
          continue;
        }

        if (/\s/.test(ch)) { i++; continue; }

        const s = i;
        while (i < raw.length && !/\s/.test(raw[i]) && !"(){}".includes(raw[i])) i++;
        const tok = raw.slice(s, i);

        if (/^\d+\.{1,3}$/.test(tok)) continue;

        if (!chess.move(tok, { sloppy: true })) continue;

        this.moves.push({
          isWhite: ply % 2 === 0,
          moveNo: Math.floor(ply / 2) + 1,
          san: tok,
          fen: chess.fen(),
          comments: pending.splice(0)
        });

        ply++;
      }
    }

    initBoard() {
      safeChessboard(
        this.boardDiv,
        {
          position: "start",
          orientation: this.flipBoard ? "black" : "white",
          draggable: true,
          pieceTheme: C.PIECE_THEME_URL,
          onDragStart: () => this.isGuessTurn(),
          onDrop: (s, t) => this.onUserDrop(s, t)
        },
        30,
        (b) => {
          this.board = b;
          this.initialAutoplay();
          this.autoAdvance();
          this.updateUI();
        }
      );

      this.nextBtn.onclick = () => this.nextUserMove();
    }

    initialAutoplay() {
      if (!this.moves.length) return;
      const m = this.moves[0];
      if (m.isWhite !== this.userIsWhite) {
        this.index = 0;
        this.game.move(m.san, { sloppy: true });
        this.board.position(m.fen, true);
        this.appendMove();
      }
    }

    isGuessTurn() {
      const next = this.moves[this.index + 1];
      return next && next.isWhite !== this.userIsWhite;
    }

    updateUI() {
      this.statusEl.textContent = this.isGuessTurn() ? "Your move" : "";
      this.statusEl.style.opacity = this.isGuessTurn() ? "1" : "0";
    }

    autoAdvance() {
      while (this.index + 1 < this.moves.length) {
        const n = this.moves[this.index + 1];
        if (n.isWhite !== this.userIsWhite) break;
        this.index++;
        this.game.move(n.san, { sloppy: true });
        this.board.position(n.fen, true);
        this.appendMove();
      }
    }

    onUserDrop(source, target) {
      if (!this.isGuessTurn()) return "snapback";

      const expected = this.moves[this.index + 1];
      const legal = this.game.moves({ verbose: true });

      const ok = legal.some(m => {
        if (m.from !== source || m.to !== target) return false;
        const t = new Chess(this.game.fen());
        t.move(m);
        return t.fen() === expected.fen;
      });

      if (!ok) return "snapback";

      this.index++;
      this.game.load(expected.fen);
      this.board.position(expected.fen, true);
      this.appendMove();
      this.autoAdvance();
      this.updateUI();
    }

    nextUserMove() {
      if (this.isGuessTurn()) return;
      if (this.index + 1 >= this.moves.length) return;

      this.index++;
      this.game.move(this.moves[this.index].san, { sloppy: true });
      this.board.position(this.moves[this.index].fen, true);
      this.appendMove();
      this.autoAdvance();
      this.updateUI();
    }

    appendMove() {
      const m = this.moves[this.index];
      if (!m) return;

      if (m.isWhite) {
        const row = document.createElement("div");
        row.className = "pgn-move-row";
        row.textContent = `${m.moveNo}. ${m.san}`;
        this.rightPane.appendChild(row);
        this.currentRow = row;
      } else if (this.currentRow) {
        this.currentRow.textContent += ` ${m.san}`;
      }
    }
  }

  function init() {
    document.querySelectorAll("pgn-guess, pgn-guess-black")
      .forEach(el => new ReaderPGNView(el));
  }

  document.readyState === "loading"
    ? document.addEventListener("DOMContentLoaded", init, { once: true })
    : init();

})();
