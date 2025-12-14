// ============================================================================
// pgn-guess.js — Guess-the-move PGN trainer (FINAL, eval/clk stripped)
// ============================================================================

(function () {
  "use strict";

  if (typeof Chess !== "function") return;
  if (typeof Chessboard !== "function") return;
  if (!window.PGNCore) return;

  const C = window.PGNCore;
  const AUTOPLAY_DELAY = 700;
  const FEEDBACK_DELAY = 600;

  // --------------------------------------------------------------------------
  // Styles
  // --------------------------------------------------------------------------

  function ensureGuessStylesOnce() {
    if (document.getElementById("pgn-guess-style")) return;

    const style = document.createElement("style");
    style.id = "pgn-guess-style";
    style.textContent = `
      .pgn-guess-cols { display:flex; gap:1rem; align-items:flex-start; }
      .pgn-guess-board { width:360px; touch-action:manipulation; }
      .pgn-guess-status { margin-top:.4em; font-size:.95em; white-space:nowrap; }
      .pgn-guess-status button { margin-left:.3em; font-size:.9em; }
      .pgn-guess-right { flex:1; max-height:420px; overflow-y:auto; }

      .pgn-move-row { font-weight:900; margin-top:.5em; }
      .pgn-move-no { margin-right:.3em; }
      .pgn-move-white { margin-right:.6em; }
      .pgn-move-black { margin-left:.3em; }
      .pgn-comment { font-weight:400; margin:.35em 0; }
    `;
    document.head.appendChild(style);
  }

  // --------------------------------------------------------------------------

  function normalizeSAN(tok) {
    return tok
      .replace(/\[%.*?]/g, "")
      .replace(/[!?]+/g, "")
      .replace(/[+#]$/, "")
      .replace(/0/g, "O")
      .trim();
  }

  function sanitizeComment(text) {
    return (text || "")
      .replace(/\[%.*?]/g, "")
      .replace(/\s+/g, " ")
      .trim();
  }

  // --------------------------------------------------------------------------

  class ReaderPGNView {
    constructor(src) {
      ensureGuessStylesOnce();

      this.rawText = (src.textContent || "").trim();
      this.flipBoard = src.tagName.toLowerCase() === "pgn-guess-black";
      this.userIsWhite = !this.flipBoard;

      this.moves = [];
      this.index = -1;
      this.currentRow = null;

      this.game = new Chess();
      this.currentFen = "start";
      this.resultMessage = "";
      this.solved = false;

      this.build(src);
      this.parsePGN();
      this.initBoard();
    }

    // ------------------------------------------------------------------------

    build(src) {
      const wrap = document.createElement("div");
      wrap.className = "pgn-guess-cols";

      wrap.innerHTML = `
        <div>
          <div class="pgn-guess-board"></div>
          <div class="pgn-guess-status"></div>
        </div>
        <div class="pgn-guess-right"></div>
      `;

      src.replaceWith(wrap);

      this.boardDiv = wrap.querySelector(".pgn-guess-board");
      this.statusEl = wrap.querySelector(".pgn-guess-status");
      this.rightPane = wrap.querySelector(".pgn-guess-right");
    }

    // ------------------------------------------------------------------------
    // SAFE PGN PARSER (eval/clk stripped)
    // ------------------------------------------------------------------------

    parsePGN() {
      const raw = C.normalizeFigurines(this.rawText);
      const chess = new Chess();

      let ply = 0;
      let i = 0;
      let pending = [];

      const attach = (t) => {
        const c = sanitizeComment(t);
        if (!c) return;
        if (this.moves.length) this.moves[this.moves.length - 1].comments.push(c);
        else pending.push(c);
      };

      while (i < raw.length) {
        const ch = raw[i];

        if (ch === "(") {
          let d = 1, j = i + 1;
          while (j < raw.length && d) {
            if (raw[j] === "(") d++;
            else if (raw[j] === ")") d--;
            j++;
          }
          attach(raw.slice(i + 1, j - 1));
          i = j;
          continue;
        }

        if (ch === "{") {
          let j = i + 1;
          while (j < raw.length && raw[j] !== "}") j++;
          attach(raw.slice(i + 1, j));
          i = j + 1;
          continue;
        }

        if (/\s/.test(ch)) { i++; continue; }

        let s = i;
        while (i < raw.length && !/\s/.test(raw[i]) && !"(){}".includes(raw[i])) i++;
        const tok = raw.slice(s, i);

        if (/^\d+\.{1,3}$/.test(tok)) continue;

        const san = normalizeSAN(tok);
        if (!chess.move(san, { sloppy:true })) continue;

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

    // ------------------------------------------------------------------------

    initBoard() {
      this.board = Chessboard(this.boardDiv, {
        position: "start",
        orientation: this.flipBoard ? "black" : "white",
        draggable: true,
        pieceTheme: C.PIECE_THEME_URL,
        moveSpeed: 200,
        onDragStart: () => !this.solved && this.isGuessTurn(),
        onDrop: (s, t) => this.onUserDrop(s, t),
        onSnapEnd: () => this.board.position(this.currentFen, false)
      });

      this.updateStatus();

      setTimeout(() => {
        this.autoplayOpponentMoves();
        this.updateStatus();
      }, AUTOPLAY_DELAY);
    }

    autoplayOpponentMoves() {
      while (this.index + 1 < this.moves.length) {
        const n = this.moves[this.index + 1];
        if (n.isWhite === this.userIsWhite) break;

        this.index++;
        this.game.move(normalizeSAN(n.san), { sloppy:true });
        this.currentFen = n.fen;
        this.board.position(n.fen, true);
        this.appendMove();
      }
      this.resultMessage = "";
    }

    isGuessTurn() {
      const n = this.moves[this.index + 1];
      return n && n.isWhite === this.userIsWhite;
    }

    // ------------------------------------------------------------------------

    updateStatus() {
      this.statusEl.innerHTML = "";

      if (this.solved) {
        const solved = document.createElement("span");
        solved.textContent = "Training solved! 🏆";
        this.statusEl.appendChild(solved);

        this.statusEl.append(
          this.makeNavButton("↻", () => this.goto(-1), this.index < 0),
          this.makeNavButton("◀", () => this.goto(this.index - 1), this.index < 0),
          this.makeNavButton("▶", () => this.goto(this.index + 1), this.index >= this.moves.length - 1)
        );
        return;
      }

      const flag = this.game.turn() === "w" ? "⚐" : "⚑";
      const side = this.game.turn() === "w" ? "White" : "Black";
      const suffix = this.resultMessage ? ` · ${this.resultMessage}` : "";
      this.statusEl.textContent = `${flag} ${side} to move${suffix}`;
    }

    makeNavButton(icon, onClick, disabled) {
      const b = document.createElement("button");
      b.textContent = icon;
      b.disabled = disabled;
      b.onclick = onClick;
      return b;
    }

    goto(i) {
      if (i < -1) i = -1;
      if (i >= this.moves.length) i = this.moves.length - 1;

      this.index = i;

      if (i === -1) {
        this.game.reset();
        this.currentFen = "start";
      } else {
        this.game.load(this.moves[i].fen);
        this.currentFen = this.moves[i].fen;
      }

      this.board.position(this.currentFen, false);
      this.updateStatus();
    }

    // ------------------------------------------------------------------------

    onUserDrop(source, target) {
      if (source === target) return "snapback";
      if (!this.isGuessTurn()) return "snapback";

      const exp = this.moves[this.index + 1];
      const legal = this.game.moves({ verbose:true });

      const ok = legal.some(m => {
        if (m.from !== source || m.to !== target) return false;
        const g = new Chess(this.game.fen());
        g.move(m);
        return g.fen() === exp.fen;
      });

      if (!ok) {
        this.resultMessage = "Wrong move ❌";
        this.updateStatus();
        return "snapback";
      }

      this.index++;
      this.game.load(exp.fen);
      this.currentFen = exp.fen;
      this.board.position(exp.fen, false);
      this.appendMove();

      if (this.index === this.moves.length - 1) {
        this.solved = true;
        this.updateStatus();
        return;
      }

      this.resultMessage = "Correct! ✅";
      this.updateStatus();

      setTimeout(() => {
        this.autoplayOpponentMoves();
        this.updateStatus();
      }, FEEDBACK_DELAY);
    }

    appendMove() {
      const m = this.moves[this.index];
      if (!m) return;

      if (m.isWhite) {
        const row = document.createElement("div");
        row.className = "pgn-move-row";
        row.innerHTML =
          `<span class="pgn-move-no">${m.moveNo}.</span>` +
          `<span class="pgn-move-white">${m.san}</span>`;
        this.rightPane.appendChild(row);
        this.currentRow = row;
      } else if (this.currentRow) {
        const b = document.createElement("span");
        b.className = "pgn-move-black";
        b.textContent = m.san;
        this.currentRow.appendChild(b);
      }

      m.comments.forEach(c => {
        const p = document.createElement("p");
        p.className = "pgn-comment";
        p.textContent = c;
        this.rightPane.appendChild(p);
      });

      this.rightPane.scrollTop = this.rightPane.scrollHeight;
    }
  }

  function init() {
    document.querySelectorAll("pgn-guess, pgn-guess-black")
      .forEach(el => new ReaderPGNView(el));
  }

  document.readyState === "loading"
    ? document.addEventListener("DOMContentLoaded", init, { once:true })
    : init();

})();
