// ============================================================================
// pgn-guess.js — Guess-the-move PGN trainer (FULL + header + stable logic)
// ============================================================================

(function () {
  "use strict";

  if (typeof Chess !== "function") return;
  if (typeof Chessboard !== "function") return;
  if (!window.PGNCore) return;

  const C = window.PGNCore;

  const AUTOPLAY_DELAY = 700;  // show turn indicator first, then autoplay
  const FEEDBACK_DELAY = 600;  // show "Correct! ✅" briefly before autoplay continues

  // --------------------------------------------------------------------------
  // Styles
  // --------------------------------------------------------------------------

  function ensureGuessStylesOnce() {
    if (document.getElementById("pgn-guess-style")) return;

    const style = document.createElement("style");
    style.id = "pgn-guess-style";
    style.textContent = `
      .pgn-guess-wrapper { margin-bottom: 1rem; }

      .pgn-guess-header {
        margin: 0 0 0.6rem 0;
        font-weight: 600;
      }

      .pgn-guess-cols { display:flex; gap:1rem; align-items:flex-start; }

      .pgn-guess-board { width:360px; max-width:100%; touch-action:manipulation; }

      .pgn-guess-status { margin-top:.4em; font-size:.95em; white-space:nowrap; }
      .pgn-guess-status button { margin-left:.3em; font-size:1em; padding:0 .4em; }

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
  // Helpers
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
      .replace(/\[%.*?]/g, "")   // strip engine/clock tags
      .replace(/\s+/g, " ")
      .trim();
  }

  function parseHeaders(text) {
    const headers = {};
    (text || "").replace(/\[(\w+)\s+"([^"]*)"\]/g, (_, k, v) => {
      headers[k] = v;
      return "";
    });
    return headers;
  }

  function safeFlipName(name) {
    if (typeof C.flipName === "function") return C.flipName(name || "");
    return (name || "").trim();
  }

  function safeExtractYear(dateStr) {
    if (typeof C.extractYear === "function") return C.extractYear(dateStr);
    const m = String(dateStr || "").match(/(\d{4})/);
    return m ? m[1] : "";
  }

  // --------------------------------------------------------------------------
  // Main class
  // --------------------------------------------------------------------------

  class ReaderPGNView {
    constructor(src) {
      if (src.__pgnReaderRendered) return;
      src.__pgnReaderRendered = true;

      ensureGuessStylesOnce();

      this.rawText = (src.textContent || "").trim();
      this.headers = parseHeaders(this.rawText);

      this.flipBoard = src.tagName.toLowerCase() === "pgn-guess-black";
      this.userIsWhite = !this.flipBoard; // <pgn-guess> => user guesses White; <pgn-guess-black> => user guesses Black

      this.moves = [];
      this.index = -1;
      this.currentRow = null;

      this.game = new Chess();
      this.currentFen = "start";   // authoritative fen for snap-end resync
      this.resultMessage = "";
      this.solved = false;

      this.build(src);
      this.parsePGN();
      this.initBoard();
    }

    // ------------------------------------------------------------------------
    // Header (players + event + opening) — OUTSIDE the 2-column layout
    // ------------------------------------------------------------------------

    renderHeader() {
      const h = this.headers || {};

      const W =
        (h.WhiteTitle ? h.WhiteTitle + " " : "") +
        safeFlipName(h.White || "") +
        (h.WhiteElo ? " (" + h.WhiteElo + ")" : "");

      const B =
        (h.BlackTitle ? h.BlackTitle + " " : "") +
        safeFlipName(h.Black || "") +
        (h.BlackElo ? " (" + h.BlackElo + ")" : "");

      const Y = safeExtractYear(h.Date);
      const line2 = (h.Event || "") + (Y ? ", " + Y : "");
      const opening = (h.Opening || "").trim();

      // If there's nothing meaningful, don't render an empty header
      if (!W && !B && !line2 && !opening) return;

      const H = document.createElement("h3");
      H.className = "pgn-guess-header";

      // Line 1: Players
      if (W || B) {
        H.appendChild(document.createTextNode((W || "?") + " – " + (B || "?")));
        H.appendChild(document.createElement("br"));
      }

      // Line 2: Event + year
      if (line2) {
        H.appendChild(document.createTextNode(line2));
        if (opening) H.appendChild(document.createElement("br"));
      }

      // Line 3: Opening (optional)
      if (opening) {
        H.appendChild(document.createTextNode(opening));
      }

      this.wrapper.appendChild(H);
    }

    // ------------------------------------------------------------------------

    build(src) {
      this.wrapper = document.createElement("div");
      this.wrapper.className = "pgn-guess-wrapper";

      // Header first (NOT part of 2-col layout)
      this.renderHeader();

      // Columns (board/status left, move list right)
      const cols = document.createElement("div");
      cols.className = "pgn-guess-cols";

      cols.innerHTML = `
        <div>
          <div class="pgn-guess-board"></div>
          <div class="pgn-guess-status"></div>
        </div>
        <div class="pgn-guess-right"></div>
      `;

      this.wrapper.appendChild(cols);
      src.replaceWith(this.wrapper);

      this.boardDiv = cols.querySelector(".pgn-guess-board");
      this.statusEl = cols.querySelector(".pgn-guess-status");
      this.rightPane = cols.querySelector(".pgn-guess-right");
    }

    // ------------------------------------------------------------------------
    // Safe PGN parser (comments/variations ok; eval/clk stripped)
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

        // ( ... ) variation
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

        // { ... } comment
        if (ch === "{") {
          let j = i + 1;
          while (j < raw.length && raw[j] !== "}") j++;
          attach(raw.slice(i + 1, j));
          i = j + 1;
          continue;
        }

        if (/\s/.test(ch)) { i++; continue; }

        // token
        const s = i;
        while (i < raw.length && !/\s/.test(raw[i]) && !"(){}".includes(raw[i])) i++;
        const tok = raw.slice(s, i);

        // move numbers
        if (/^\d+\.{1,3}$/.test(tok)) continue;

        const san = normalizeSAN(tok);
        if (!san) continue;

        if (!chess.move(san, { sloppy: true })) continue;

        this.moves.push({
          isWhite: ply % 2 === 0,
          moveNo: Math.floor(ply / 2) + 1,
          san: tok,          // display token
          fen: chess.fen(),  // authoritative resulting fen
          comments: pending.splice(0)
        });

        ply++;
      }
    }

    // ------------------------------------------------------------------------
    // Board init
    // ------------------------------------------------------------------------

    initBoard() {
      safeChessboard(
        this.boardDiv,
        {
          position: "start",
          orientation: this.flipBoard ? "black" : "white",
          draggable: true,
          pieceTheme: C.PIECE_THEME_URL,
          moveSpeed: 200,

          onDragStart: () => !this.solved && this.isGuessTurn(),
          onDrop: (s, t) => this.onUserDrop(s, t),

          // After any animation (captures especially), force-sync to authoritative fen
          onSnapEnd: () => {
            if (!this.board) return;
            this.board.position(this.currentFen, false);
          }
        },
        30,
        (b) => {
          this.board = b;

          // Show initial indicator immediately
          this.updateStatus();

          // Delay then autoplay opponent moves
          setTimeout(() => {
            this.autoplayOpponentMoves();
            this.updateStatus();
          }, AUTOPLAY_DELAY);
        }
      );
    }

    // ------------------------------------------------------------------------
    // Autoplay + puzzle turn logic
    // ------------------------------------------------------------------------

    isGuessTurn() {
      const next = this.moves[this.index + 1];
      return !!next && next.isWhite === this.userIsWhite;
    }

    autoplayOpponentMoves() {
      while (this.index + 1 < this.moves.length) {
        const next = this.moves[this.index + 1];

        // Stop at user's puzzle move
        if (next.isWhite === this.userIsWhite) break;

        this.index++;
        this.game.move(normalizeSAN(next.san), { sloppy: true });

        this.currentFen = next.fen;
        this.board.position(next.fen, true); // animate autoplay
        this.appendMove();
      }

      // Clear feedback after autoplay finishes at a puzzle
      this.resultMessage = "";
    }

    // ------------------------------------------------------------------------
    // Status + solved navigation
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
      b.addEventListener("click", onClick);
      return b;
    }

    goto(i) {
      if (i < -1) i = -1;
      if (i >= this.moves.length) i = this.moves.length - 1;

      this.index = i;

      if (i === -1) {
        this.game.reset();
        this.currentFen = "start";
        this.board.position("start", false);
      } else {
        this.game.load(this.moves[i].fen);
        this.currentFen = this.moves[i].fen;
        this.board.position(this.currentFen, false);
      }

      this.updateStatus();
    }

    // ------------------------------------------------------------------------
    // User move via drag-drop
    // ------------------------------------------------------------------------

    onUserDrop(source, target) {
      // Ignore clicks / non-moves
      if (source === target) return "snapback";

      if (this.solved) return "snapback";
      if (!this.isGuessTurn()) return "snapback";

      const expected = this.moves[this.index + 1];
      const legal = this.game.moves({ verbose: true });

      // Validate by resulting FEN (supports alternate SANs / multiple correct moves)
      const ok = legal.some((m) => {
        if (m.from !== source || m.to !== target) return false;
        const g = new Chess(this.game.fen());
        g.move(m);
        return g.fen() === expected.fen;
      });

      if (!ok) {
        this.resultMessage = "Wrong move ❌";
        this.updateStatus();
        return "snapback";
      }

      // Correct: advance without animation
      this.index++;
      this.game.load(expected.fen);
      this.currentFen = expected.fen;
      this.board.position(expected.fen, false);
      this.appendMove();

      // Solved?
      if (this.index === this.moves.length - 1) {
        this.solved = true;
        this.resultMessage = "";
        this.updateStatus();
        return;
      }

      // Show correct briefly, then autoplay opponent replies
      this.resultMessage = "Correct! ✅";
      this.updateStatus();

      setTimeout(() => {
        this.autoplayOpponentMoves();
        this.updateStatus();
      }, FEEDBACK_DELAY);
    }

    // ------------------------------------------------------------------------
    // Move list rendering (stacked + paired + comments revealed as played)
    // ------------------------------------------------------------------------

    appendMove() {
      const m = this.moves[this.index];
      if (!m) return;

      if (m.isWhite) {
        const row = document.createElement("div");
        row.className = "pgn-move-row";

        const no = document.createElement("span");
        no.className = "pgn-move-no";
        no.textContent = `${m.moveNo}.`;

        const w = document.createElement("span");
        w.className = "pgn-move-white";
        w.textContent = m.san;

        row.appendChild(no);
        row.appendChild(w);

        this.rightPane.appendChild(row);
        this.currentRow = row;
      } else if (this.currentRow) {
        const b = document.createElement("span");
        b.className = "pgn-move-black";
        b.textContent = m.san;
        this.currentRow.appendChild(b);
      }

      m.comments.forEach((c) => {
        const p = document.createElement("p");
        p.className = "pgn-comment";
        p.textContent = c;
        this.rightPane.appendChild(p);
      });

      this.rightPane.scrollTop = this.rightPane.scrollHeight;
    }
  }

  // --------------------------------------------------------------------------
  // Init
  // --------------------------------------------------------------------------

  function init() {
    document.querySelectorAll("pgn-guess, pgn-guess-black")
      .forEach((el) => new ReaderPGNView(el));
  }

  document.readyState === "loading"
    ? document.addEventListener("DOMContentLoaded", init, { once: true })
    : init();

})();
