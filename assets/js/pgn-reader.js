// ============================================================================
// pgn-reader.js  (Option A: ReaderBoard.ready gating for smooth animations)
// ============================================================================

(function () {
  "use strict";

  if (typeof Chess === "undefined") {
    console.warn("pgn-reader.js: chess.js missing");
    return;
  }
  if (typeof Chessboard === "undefined") {
    console.warn("pgn-reader.js: chessboard.js missing");
    return;
  }

  // --------------------------------------------------------------------------
  // Import from pgn-core.js
  // --------------------------------------------------------------------------

  const {
    PIECE_THEME_URL,
    SAN_CORE_REGEX,
    RESULT_REGEX,
    MOVE_NUMBER_REGEX,
    NBSP,
    NAG_MAP,
    EVAL_MAP,
    normalizeResult,
    extractYear,
    flipName,
    normalizeFigurines,
    appendText,
    makeCastlingUnbreakable
  } = window.PGNCore;

  // --------------------------------------------------------------------------
  // ReaderPGNView
  // --------------------------------------------------------------------------

  class ReaderPGNView {
    constructor(src) {
      this.sourceEl = src;
      this.wrapper = document.createElement("div");
      this.wrapper.className = "pgn-reader-block";
      this.finalResultPrinted = false;

      this.build();
      this.applyFigurines();
    }

    static isSANCore(t) {
      return SAN_CORE_REGEX.test(t);
    }

    static split(t) {
      let lines = t.split(/\r?\n/),
        H = [],
        M = [],
        inH = true;

      for (let L of lines) {
        let T = L.trim();
        if (inH && T.startsWith("[") && T.endsWith("]")) H.push(L);
        else if (inH && T === "") inH = false;
        else {
          inH = false;
          M.push(L);
        }
      }

      return { headers: H, moveText: M.join(" ").replace(/\s+/g, " ").trim() };
    }

    build() {
      let raw = this.sourceEl.textContent.trim();
      raw = normalizeFigurines(raw);

      let { headers: H, moveText: M } = ReaderPGNView.split(raw),
        pgn = (H.length ? H.join("\n") + "\n\n" : "") + M,
        chess = new Chess();

      chess.load_pgn(pgn, { sloppy: true });

      let head = chess.header(),
        res = normalizeResult(head.Result || ""),
        needsFinal = / (1-0|0-1|1\/2-1\/2|½-½|\*)$/.test(M),
        movetext = needsFinal ? M : M + (res ? " " + res : "");

      // HEADER
      this.headerDiv = document.createElement("div");
      this.headerDiv.className = "pgn-reader-header";
      this.headerDiv.appendChild(this.buildHeaderContent(head));
      this.wrapper.appendChild(this.headerDiv);

      // COLUMNS
      const cols = document.createElement("div");
      cols.className = "pgn-reader-cols";
      this.wrapper.appendChild(cols);

      // LEFT
      this.leftCol = document.createElement("div");
      this.leftCol.className = "pgn-reader-left";
      cols.appendChild(this.leftCol);

      // RIGHT
      this.movesCol = document.createElement("div");
      this.movesCol.className = "pgn-reader-right";
      cols.appendChild(this.movesCol);

      // BOARD + BUTTONS
      this.createReaderBoard();
      this.createReaderButtons();

      // MOVE PARSE
      this.parse(movetext);

      this.sourceEl.replaceWith(this.wrapper);
    }

    buildHeaderContent(h) {
      let W =
        (h.WhiteTitle ? h.WhiteTitle + " " : "") +
        flipName(h.White || "") +
        (h.WhiteElo ? " (" + h.WhiteElo + ")" : "");
      let B =
        (h.BlackTitle ? h.BlackTitle + " " : "") +
        flipName(h.Black || "") +
        (h.BlackElo ? " (" + h.BlackElo + ")" : "");
      let Y = extractYear(h.Date);
      let line = (h.Event || "") + (Y ? ", " + Y : "");

      let H = document.createElement("h4");
      H.appendChild(document.createTextNode(W + " – " + B));
      H.appendChild(document.createElement("br"));
      H.appendChild(document.createTextNode(line));
      return H;
    }

    createReaderBoard() {
      this.boardDiv = document.createElement("div");
      this.boardDiv.className = "pgn-reader-board";
      this.leftCol.appendChild(this.boardDiv);

      // -------------------------------------------------
      // Chessboard.js INIT (Option A: board.ready gating)
      // -------------------------------------------------

      ReaderBoard.ready = false;

      setTimeout(() => {
        ReaderBoard.board = Chessboard(this.boardDiv, {
          position: "start",
          draggable: false,
          pieceTheme: PIECE_THEME_URL,
          appearSpeed: 200,
          moveSpeed: 200,
          snapSpeed: 25,
          snapbackSpeed: 50
        });

        // Mark animation-ready AFTER full init
        setTimeout(() => {
          ReaderBoard.ready = true;
        }, 120);
      }, 0);
    }

    createReaderButtons() {
      const wrap = document.createElement("div");
      wrap.className = "pgn-reader-buttons";

      const prev = document.createElement("button");
      prev.className = "pgn-reader-btn";
      prev.textContent = "◀";
      prev.addEventListener("click", () => ReaderBoard.prev());

      const next = document.createElement("button");
      next.className = "pgn-reader-btn";
      next.textContent = "▶";
      next.addEventListener("click", () => ReaderBoard.next());

      wrap.appendChild(prev);
      wrap.appendChild(next);
      this.leftCol.appendChild(wrap);
    }

    ensure(ctx, cls) {
      if (!ctx.container) {
        let p = document.createElement("p");
        p.className = cls;
        this.movesCol.appendChild(p);
        ctx.container = p;
      }
    }

    parseComment(text, i, ctx) {
      let j = i;
      while (j < text.length && text[j] !== "}") j++;
      let raw = text.substring(i, j).trim();
      if (text[j] === "}") j++;

      raw = raw.replace(/\[%.*?]/g, "").trim();
      if (!raw.length) return j;

      // Remove result in comments if stuck to end
      if (ctx.type === "main") {
        let k = j;
        while (k < text.length && /\s/.test(text[k])) k++;
        let next = "";
        while (k < text.length && !/\s/.test(text[k]) && !"(){}".includes(text[k]))
          next += text[k++];
        if (RESULT_REGEX.test(next)) {
          raw = raw.replace(/(1-0|0-1|1\/2-1\/2|½-½|\*)$/, "").trim();
        }
      }

      let parts = raw.split("[D]");
      for (let idx = 0; idx < parts.length; idx++) {
        let c = parts[idx].trim();

        if (ctx.type === "variation") {
          this.ensure(ctx, "pgn-variation");
          if (c) appendText(ctx.container, " " + c);
        } else {
          if (c) {
            let p = document.createElement("p");
            p.className = "pgn-comment";
            appendText(p, c);
            this.movesCol.appendChild(p);
          }
          ctx.container = null;
        }
      }

      ctx.lastWasInterrupt = true;
      return j;
    }

    handleSAN(tok, ctx) {
      let core = tok.replace(/[^a-hKQRBN0-9=O0-]+$/g, "").replace(/0/g, "O");
      if (!ReaderPGNView.isSANCore(core)) {
        appendText(ctx.container, tok + " ");
        return null;
      }

      let base = ctx.baseHistoryLen || 0,
        past = ctx.chess.history().length,
        ply = base + past,
        white = ply % 2 === 0,
        num = Math.floor(ply / 2) + 1;

      // Move number
      if (white) appendText(ctx.container, num + "." + NBSP);
      else if (ctx.lastWasInterrupt) appendText(ctx.container, num + "..." + NBSP);

      ctx.prevFen = ctx.chess.fen();
      ctx.prevHistoryLen = ply;

      let mv = ctx.chess.move(core, { sloppy: true });
      if (!mv) {
        appendText(ctx.container, tok + " ");
        return null;
      }

      ctx.lastWasInterrupt = false;

      let span = document.createElement("span");
      span.className = "pgn-move reader-move";
      span.dataset.fen = ctx.chess.fen();
      span.dataset.mainline = ctx.type === "main" ? "1" : "0";
      span.textContent = makeCastlingUnbreakable(tok) + " ";

      ctx.container.appendChild(span);
      return span;
    }

    parse(t) {
      let chess = new Chess();

      let ctx = {
        type: "main",
        chess,
        container: null,
        parent: null,
        lastWasInterrupt: false,
        prevFen: chess.fen(),
        prevHistoryLen: 0,
        baseHistoryLen: null
      };

      let i = 0;

      for (; i < t.length; ) {
        let ch = t[i];

        if (/\s/.test(ch)) {
          while (/\s/.test(t[i])) i++;
          this.ensure(ctx, ctx.type === "main" ? "pgn-mainline" : "pgn-variation");
          appendText(ctx.container, " ");
          continue;
        }

        if (ch === "(") {
          i++;
          let fen = ctx.prevFen,
            len = ctx.prevHistoryLen;

          ctx = {
            type: "variation",
            chess: new Chess(fen),
            container: null,
            parent: ctx,
            lastWasInterrupt: true,
            prevFen: fen,
            prevHistoryLen: len,
            baseHistoryLen: len
          };
          this.ensure(ctx, "pgn-variation");
          continue;
        }

        if (ch === ")") {
          i++;
          if (ctx.parent) {
            ctx = ctx.parent;
            ctx.lastWasInterrupt = true;
            ctx.container = null;
          }
          continue;
        }

        if (ch === "{") {
          i = this.parseComment(t, i + 1, ctx);
          continue;
        }

        // Token
        let s = i;
        while (i < t.length && !/\s/.test(t[i]) && !"(){}".includes(t[i])) i++;
        let tok = t.substring(s, i);
        if (!tok) continue;

        if (/^\[%.*]$/.test(tok)) continue;

        if (tok === "[D]") {
          ctx.lastWasInterrupt = true;
          ctx.container = null;
          continue;
        }

        if (RESULT_REGEX.test(tok)) {
          if (!this.finalResultPrinted) {
            this.finalResultPrinted = true;
            this.ensure(ctx, ctx.type === "main" ? "pgn-mainline" : "pgn-variation");
            appendText(ctx.container, tok + " ");
          }
          continue;
        }

        if (MOVE_NUMBER_REGEX.test(tok)) continue;

        let core = tok.replace(/[^a-hKQRBN0-9=O0-]+$/g, "").replace(/0/g, "O");
        let isSAN = ReaderPGNView.isSANCore(core);

        if (!isSAN) {
          if (EVAL_MAP[tok]) {
            this.ensure(ctx, ctx.type === "main" ? "pgn-mainline" : "pgn-variation");
            appendText(ctx.container, EVAL_MAP[tok] + " ");
            continue;
          }

          if (tok[0] === "$") {
            let code = +tok.slice(1);
            if (NAG_MAP[code]) {
              this.ensure(ctx, ctx.type === "main" ? "pgn-mainline" : "pgn-variation");
              appendText(ctx.container, NAG_MAP[code] + " ");
            }
            continue;
          }

          if (/[A-Za-zÇĞİÖŞÜçğıöşü]/.test(tok)) {
            if (ctx.type === "variation") {
              this.ensure(ctx, "pgn-variation");
              appendText(ctx.container, " " + tok);
            } else {
              let p = document.createElement("p");
              p.className = "pgn-comment";
              appendText(p, tok);
              this.movesCol.appendChild(p);
              ctx.container = null;
              ctx.lastWasInterrupt = false;
            }
            continue;
          }

          this.ensure(ctx, ctx.type === "main" ? "pgn-mainline" : "pgn-variation");
          appendText(ctx.container, tok + " ");
          continue;
        }

        // SAN MOVE
        this.ensure(ctx, ctx.type === "main" ? "pgn-mainline" : "pgn-variation");

        let span = this.handleSAN(tok, ctx);
        if (!span) appendText(ctx.container, makeCastlingUnbreakable(tok) + " ");
      }
    }

    applyFigurines() {
      const map = { K: "♔", Q: "♕", R: "♖", B: "♗", N: "♘" };

      this.wrapper.querySelectorAll(".pgn-move").forEach(span => {
        let m = span.textContent.match(/^([KQRBN])(.+?)(\s*)$/);
        if (m) span.textContent = map[m[1]] + m[2] + (m[3] || "");
      });
    }
  }

  // --------------------------------------------------------------------------
  // ReaderBoard
  // --------------------------------------------------------------------------

  const ReaderBoard = {
    board: null,
    moveSpans: [],
    currentIndex: -1,
    movesContainer: null,
    mainlineMoves: [],
    mainlineIndex: -1,
    ready: false, // <-- OPTION A FLAG

    collectMoves(root) {
      this.moveSpans = Array.from(
        (root || document).querySelectorAll(".reader-move")
      );
    },

    goto(index) {
      if (!ReaderBoard.ready) return; // <-- prevents premove glitch

      const span = this.moveSpans[index];
      if (!span) return;

      this.currentIndex = index;
      const fen = span.dataset.fen;

      // ★ Smooth sliding animation (Chessboard.js built-in)
      this.board.position(fen, true);

      // Highlight move
      this.moveSpans.forEach(s =>
        s.classList.remove("reader-move-active")
      );
      span.classList.add("reader-move-active");

      // Mainline tracking
      if (span.dataset.mainline === "1") {
        let i = this.mainlineMoves.indexOf(span);
        if (i !== -1) this.mainlineIndex = i;
      }

      // Scroll local moves area
      if (this.movesContainer) {
        const parent = this.movesContainer;
        const top = span.offsetTop - parent.offsetTop - parent.clientHeight / 3;

        parent.scrollTo({
          top,
          behavior: "smooth"
        });
      }
    },

    gotoSpan(span) {
      let index = this.moveSpans.indexOf(span);
      if (index !== -1) this.goto(index);
    },

    next() {
      if (!ReaderBoard.ready) return;

      let max = this.mainlineMoves.length - 1;
      this.mainlineIndex = Math.min(this.mainlineIndex + 1, max);
      this.gotoSpan(this.mainlineMoves[this.mainlineIndex]);
    },

    prev() {
      if (!ReaderBoard.ready) return;

      this.mainlineIndex = Math.max(this.mainlineIndex - 1, 0);
      this.gotoSpan(this.mainlineMoves[this.mainlineIndex]);
    },

    activate(root) {
      this.movesContainer =
        (root || document).querySelector(".pgn-reader-right");

      this.collectMoves(root);

      this.mainlineMoves = this.moveSpans.filter(
        s => s.dataset.mainline === "1"
      );
      this.mainlineIndex = -1;

      // Click navigation
      this.moveSpans.forEach((span, idx) => {
        span.style.cursor = "pointer";
        span.addEventListener("click", () => this.goto(idx));
      });

      // Keyboard navigation
      window.addEventListener("keydown", e => {
        const tag = (e.target.tagName || "").toLowerCase();
        if (tag === "input" || tag === "textarea") return;

        if (e.key === "ArrowRight") {
          e.preventDefault();
          this.next();
        }
        if (e.key === "ArrowLeft") {
          e.preventDefault();
          this.prev();
        }
      });
    }
  };

  // --------------------------------------------------------------------------
  // CSS REFERENCES — loaded from pgn.css
  // --------------------------------------------------------------------------

  // (No inline CSS here — handled fully in pgn.css)

  // --------------------------------------------------------------------------
  // INIT
  // --------------------------------------------------------------------------

  document.addEventListener("DOMContentLoaded", () => {
    const els = document.querySelectorAll("pgn-reader");
    els.forEach(el => new ReaderPGNView(el));
    ReaderBoard.activate(document);
  });

})();
