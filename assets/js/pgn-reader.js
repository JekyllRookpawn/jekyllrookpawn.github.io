// ============================================================================
// pgn-reader.js
// Interactive reader for <pgn-reader>:
// - 2-column layout (header, left: sticky board + buttons, right: scrollable moves)
// - Figurines in input, figurines in output
// - Bold mainline (moves + numbers) vs normal-weight variations (via CSS)
// - Local scrolling inside move list
// - Animated board using Chessboard.js 1.0.0
// ============================================================================

(function () {
  "use strict";

  if (!window.PGNCore) {
    console.warn("pgn-reader.js: PGNCore missing");
    return;
  }
  if (typeof Chess === "undefined") {
    console.warn("pgn-reader.js: chess.js missing");
    return;
  }
  if (typeof Chessboard === "undefined") {
    console.warn("pgn-reader.js: chessboard.js missing");
    return;
  }

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
    // NOTE: we deliberately do NOT use createDiagram here
    // <pgn-reader> has NO [D] diagrams
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
        needs = / (1-0|0-1|1\/2-1\/2|½-½|\*)$/.test(M),
        movetext = needs ? M : M + (res ? " " + res : "");

      // Header
      this.headerDiv = document.createElement("div");
      this.headerDiv.className = "pgn-reader-header";
      this.wrapper.appendChild(this.headerDiv);
      this.headerDiv.appendChild(this.buildHeaderContent(head));

      // Two-column wrapper (layout is in pgn.css)
      const cols = document.createElement("div");
      cols.className = "pgn-reader-cols";
      this.wrapper.appendChild(cols);

      this.leftCol = document.createElement("div");
      this.leftCol.className = "pgn-reader-left";
      cols.appendChild(this.leftCol);

      this.movesCol = document.createElement("div");
      this.movesCol.className = "pgn-reader-right";
      cols.appendChild(this.movesCol);

      // Board + buttons
      this.createReaderBoard();
      this.createReaderButtons();

      // Parse the moves
      this.parse(movetext);

      this.sourceEl.replaceWith(this.wrapper);
    }

    buildHeaderContent(h) {
      let W =
          (h.WhiteTitle ? h.WhiteTitle + " " : "") +
          flipName(h.White || "") +
          (h.WhiteElo ? " (" + h.WhiteElo + ")" : ""),
        B =
          (h.BlackTitle ? h.BlackTitle + " " : "") +
          flipName(h.Black || "") +
          (h.BlackElo ? " (" + h.BlackElo + ")" : ""),
        Y = extractYear(h.Date),
        line = (h.Event || "") + (Y ? ", " + Y : "");

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

      // Use Chessboard.js default animation settings, but ensure instance is ready
      setTimeout(() => {
        ReaderBoard.board = Chessboard(this.boardDiv, {
          position: "start",
          draggable: false,
          pieceTheme: PIECE_THEME_URL
          // animation speeds are supported by Chessboard 1.0.0;
          // we can rely on its defaults or add them here if you like.
          // moveSpeed: 200,
          // snapSpeed: 25,
          // snapbackSpeed: 50,
          // appearSpeed: 200
        });
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

      if (ctx.type === "main") {
        let k = j;
        while (k < text.length && /\s/.test(text[k])) k++;
        let next = "";
        while (
          k < text.length &&
          !/\s/.test(text[k]) &&
          !"(){}".includes(text[k])
        ) {
          next += text[k++];
        }
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
        // IMPORTANT: <pgn-reader> does NOT create diagrams on [D]
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
        count = ctx.chess.history().length,
        ply = base + count,
        white = ply % 2 === 0,
        num = Math.floor(ply / 2) + 1;

      if (ctx.type === "main") {
        if (white) appendText(ctx.container, num + "." + NBSP);
        else if (ctx.lastWasInterrupt)
          appendText(ctx.container, num + "..." + NBSP);
      } else {
        if (white) appendText(ctx.container, num + "." + NBSP);
        else if (ctx.lastWasInterrupt)
          appendText(ctx.container, num + "..." + NBSP);
      }

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
      let chess = new Chess(),
        ctx = {
          type: "main",
          chess: chess,
          container: null,
          parent: null,
          lastWasInterrupt: false,
          prevFen: chess.fen(),
          prevHistoryLen: 0,
          baseHistoryLen: null
        },
        i = 0;

      for (; i < t.length; ) {
        let ch = t[i];

        if (/\s/.test(ch)) {
          while (i < t.length && /\s/.test(t[i])) i++;
          this.ensure(ctx, ctx.type === "main" ? "pgn-mainline" : "pgn-variation");
          appendText(ctx.container, " ");
          continue;
        }

        if (ch === "(") {
          i++;
          let fen = ctx.prevFen || ctx.chess.fen(),
            len =
              typeof ctx.prevHistoryLen === "number"
                ? ctx.prevHistoryLen
                : ctx.chess.history().length;
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

        let s = i;
        while (
          i < t.length &&
          !/\s/.test(t[i]) &&
          !"(){}".includes(t[i])
        )
          i++;

        let tok = t.substring(s, i);
        if (!tok) continue;

        if (/^\[%.*]$/.test(tok)) continue;

        if (tok === "[D]") {
          // For <pgn-reader>, [D] is just a separator, no diagrams
          ctx.lastWasInterrupt = true;
          ctx.container = null;
          continue;
        }

        if (RESULT_REGEX.test(tok)) {
          if (this.finalResultPrinted) continue;
          this.finalResultPrinted = true;
          this.ensure(ctx, ctx.type === "main" ? "pgn-mainline" : "pgn-variation");
          appendText(ctx.container, tok + " ");
          continue;
        }

        if (MOVE_NUMBER_REGEX.test(tok)) continue;

        let core = tok
            .replace(/[^a-hKQRBN0-9=O0-]+$/g, "")
            .replace(/0/g, "O"),
          isSAN = ReaderPGNView.isSANCore(core);

        if (!isSAN) {
          if (EVAL_MAP[tok]) {
            this.ensure(
              ctx,
              ctx.type === "main" ? "pgn-mainline" : "pgn-variation"
            );
            appendText(ctx.container, EVAL_MAP[tok] + " ");
            continue;
          }

          if (tok[0] === "$") {
            let code = +tok.slice(1);
            if (NAG_MAP[code]) {
              this.ensure(
                ctx,
                ctx.type === "main" ? "pgn-mainline" : "pgn-variation"
              );
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
          } else {
            this.ensure(
              ctx,
              ctx.type === "main" ? "pgn-mainline" : "pgn-variation"
            );
            appendText(ctx.container, tok + " ");
          }
          continue;
        }

        this.ensure(ctx, ctx.type === "main" ? "pgn-mainline" : "pgn-variation");
        let m = this.handleSAN(tok, ctx);
        if (!m) appendText(ctx.container, makeCastlingUnbreakable(tok) + " ");
      }
    }

    applyFigurines() {
      const map = { K: "♔", Q: "♕", R: "♖", B: "♗", N: "♘" };
      this.wrapper.querySelectorAll(".pgn-move").forEach(span => {
        let m = span.textContent.match(/^([KQRBN])(.+?)(\s*)$/);
        if (m) {
          span.textContent = map[m[1]] + m[2] + (m[3] || "");
        }
      });
    }
  }

  // --------------------------------------------------------------------------
  // ReaderBoard controller
  // --------------------------------------------------------------------------
  const ReaderBoard = {
    board: null,
    moveSpans: [],
    currentIndex: -1,
    movesContainer: null,
    mainlineMoves: [],
    mainlineIndex: -1,

    collectMoves(root) {
      this.moveSpans = Array.from(
        (root || document).querySelectorAll(".reader-move")
      );
    },

    goto(index) {
      if (index < 0 || index >= this.moveSpans.length) return;
      this.currentIndex = index;

      const span = this.moveSpans[index];
      const fen = span.dataset.fen;
      if (!fen || !this.board) return;

      // IMPORTANT: enable animation (Chessboard 1.0.0)
      this.board.position(fen, true);

      this.moveSpans.forEach(s =>
        s.classList.remove("reader-move-active")
      );
      span.classList.add("reader-move-active");

      // Keep mainline index in sync if this is a mainline move
      if (span.dataset.mainline === "1" && this.mainlineMoves.length) {
        const mi = this.mainlineMoves.indexOf(span);
        if (mi !== -1) this.mainlineIndex = mi;
      }

      // Local scrolling of the moves column only
      if (this.movesContainer) {
        const parent = this.movesContainer;
        const top =
          span.offsetTop - parent.offsetTop - parent.clientHeight / 3;

        parent.scrollTo({
          top,
          behavior: "smooth"
        });
      }
    },

    gotoSpan(span) {
      const index = this.moveSpans.indexOf(span);
      if (index !== -1) this.goto(index);
    },

    next() {
      if (!this.mainlineMoves.length) return;
      this.mainlineIndex = Math.min(
        this.mainlineIndex + 1,
        this.mainlineMoves.length - 1
      );
      this.gotoSpan(this.mainlineMoves[this.mainlineIndex]);
    },

    prev() {
      if (!this.mainlineMoves.length) return;
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

      this.moveSpans.forEach((span, idx) => {
        span.style.cursor = "pointer";
        span.addEventListener("click", () => this.goto(idx));
      });

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
  // DOM Ready
  // --------------------------------------------------------------------------
  document.addEventListener("DOMContentLoaded", () => {
    const els = document.querySelectorAll("pgn-reader");
    if (!els.length) return;

    els.forEach(el => new ReaderPGNView(el));
    ReaderBoard.activate(document);
  });
})();
