// ============================================================================
// pgn-reader.js — interactive PGN viewer (animated)
// Uses PGNCore for all parsing and constants
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
  if (!window.PGNCore) {
    console.error("pgn-reader.js: PGNCore missing");
    return;
  }

  const C = PGNCore;

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
      return C.SAN_CORE_REGEX.test(t);
    }

    static split(text) {
      let lines = text.split(/\r?\n/),
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

      return {
        headers: H,
        moveText: M.join(" ").replace(/\s+/g, " ").trim()
      };
    }

    build() {
      let raw = this.sourceEl.textContent.trim();
      raw = C.normalizeFigurines(raw);

      const { headers: H, moveText: M } = ReaderPGNView.split(raw);
      const pgn = (H.length ? H.join("\n") + "\n\n" : "") + M;

      const chess = new Chess();
      chess.load_pgn(pgn, { sloppy: true });

      const head = chess.header();
      const res = C.normalizeResult(head.Result || "");
      const needsResult = / (1-0|0-1|1\/2-1\/2|½-½|\*)$/.test(M);
      const movetext = needsResult ? M : M + (res ? " " + res : "");

      // Header
      this.headerDiv = document.createElement("div");
      this.headerDiv.className = "pgn-reader-header";
      this.wrapper.appendChild(this.headerDiv);
      this.headerDiv.appendChild(this.buildHeaderContent(head));

      // 2 columns
      const cols = document.createElement("div");
      cols.className = "pgn-reader-cols";
      this.wrapper.appendChild(cols);

      this.leftCol = document.createElement("div");
      this.leftCol.className = "pgn-reader-left";
      cols.appendChild(this.leftCol);

      this.movesCol = document.createElement("div");
      this.movesCol.className = "pgn-reader-right";
      cols.appendChild(this.movesCol);

      this.createReaderBoard();
      this.createReaderButtons();

      this.parse(movetext);

      this.sourceEl.replaceWith(this.wrapper);
    }

    buildHeaderContent(h) {
      let H = document.createElement("h4");

      const W =
        (h.WhiteTitle ? h.WhiteTitle + " " : "") +
        C.flipName(h.White || "") +
        (h.WhiteElo ? " (" + h.WhiteElo + ")" : "");
      const B =
        (h.BlackTitle ? h.BlackTitle + " " : "") +
        C.flipName(h.Black || "") +
        (h.BlackElo ? " (" + h.BlackElo + ")" : "");
      const Y = C.extractYear(h.Date);
      const line = (h.Event || "") + (Y ? ", " + Y : "");

      H.appendChild(document.createTextNode(W + " – " + B));
      H.appendChild(document.createElement("br"));
      H.appendChild(document.createTextNode(line));

      return H;
    }

    createReaderBoard() {
      this.boardDiv = document.createElement("div");
      this.boardDiv.className = "pgn-reader-board";
      this.leftCol.appendChild(this.boardDiv);

      // Smooth animations
      setTimeout(() => {
        ReaderBoard.board = Chessboard(this.boardDiv, {
          position: "start",
          draggable: false,
          pieceTheme: C.PIECE_THEME_URL,
          appearSpeed: 200,
          moveSpeed: 200,
          snapSpeed: 25,
          snapbackSpeed: 50
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
        const p = document.createElement("p");
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

      const parts = raw.split("[D]");
      for (let idx = 0; idx < parts.length; idx++) {
        const c = parts[idx].trim();
        if (ctx.type === "variation") {
          this.ensure(ctx, "pgn-variation");
          if (c) C.appendText(ctx.container, " " + c);
        } else {
          if (c) {
            const p = document.createElement("p");
            p.className = "pgn-comment";
            C.appendText(p, c);
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
        C.appendText(ctx.container, tok + " ");
        return null;
      }

      const base = ctx.baseHistoryLen || 0;
      const count = ctx.chess.history().length;
      const ply = base + count;
      const white = ply % 2 === 0;
      const num = Math.floor(ply / 2) + 1;

      if (white) C.appendText(ctx.container, num + "." + C.NBSP);
      else if (ctx.lastWasInterrupt)
        C.appendText(ctx.container, num + "..." + C.NBSP);

      ctx.prevFen = ctx.chess.fen();
      ctx.prevHistoryLen = ply;

      const mv = ctx.chess.move(core, { sloppy: true });
      if (!mv) {
        C.appendText(ctx.container, tok + " ");
        return null;
      }

      ctx.lastWasInterrupt = false;

      const span = document.createElement("span");
      span.className = "pgn-move reader-move";
      span.dataset.fen = ctx.chess.fen();
      span.dataset.mainline = ctx.type === "main" ? "1" : "0";
      span.textContent = C.makeCastlingUnbreakable(tok) + " ";
      ctx.container.appendChild(span);

      return span;
    }

    parse(t) {
      const chess = new Chess();

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
      while (i < t.length) {
        let ch = t[i];

        if (/\s/.test(ch)) {
          while (i < t.length && /\s/.test(t[i])) i++;
          this.ensure(ctx, ctx.type === "main" ? "pgn-mainline" : "pgn-variation");
          C.appendText(ctx.container, " ");
          continue;
        }

        if (ch === "(") {
          i++;
          const fen = ctx.prevFen || ctx.chess.fen();
          const len = typeof ctx.prevHistoryLen === "number"
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
          ctx.lastWasInterrupt = true;
          ctx.container = null;
          continue;
        }

        if (C.RESULT_REGEX.test(tok)) {
          if (!this.finalResultPrinted) {
            this.finalResultPrinted = true;
            this.ensure(ctx, ctx.type === "main" ? "pgn-mainline" : "pgn-variation");
            C.appendText(ctx.container, tok + " ");
          }
          continue;
        }

        if (C.MOVE_NUMBER_REGEX.test(tok)) continue;

        let core = tok
          .replace(/[^a-hKQRBN0-9=O0-]+$/g, "")
          .replace(/0/g, "O");

        const isSAN = ReaderPGNView.isSANCore(core);

        if (!isSAN) {
          if (C.EVAL_MAP[tok]) {
            this.ensure(ctx, ctx.type === "main" ? "pgn-mainline" : "pgn-variation");
            C.appendText(ctx.container, C.EVAL_MAP[tok] + " ");
            continue;
          }

          if (tok[0] === "$") {
            const code = +tok.slice(1);
            if (C.NAG_MAP[code]) {
              this.ensure(ctx, ctx.type === "main" ? "pgn-mainline" : "pgn-variation");
              C.appendText(ctx.container, C.NAG_MAP[code] + " ");
            }
            continue;
          }

          if (/[A-Za-zÇĞİÖŞÜçğıöşü]/.test(tok)) {
            if (ctx.type === "variation") {
              this.ensure(ctx, "pgn-variation");
              C.appendText(ctx.container, " " + tok);
            } else {
              const p = document.createElement("p");
              p.className = "pgn-comment";
              C.appendText(p, tok);
              this.movesCol.appendChild(p);
              ctx.container = null;
              ctx.lastWasInterrupt = false;
            }
          } else {
            this.ensure(ctx, ctx.type === "main" ? "pgn-mainline" : "pgn-variation");
            C.appendText(ctx.container, tok + " ");
          }

          continue;
        }

        this.ensure(ctx, ctx.type === "main" ? "pgn-mainline" : "pgn-variation");
        const m = this.handleSAN(tok, ctx);
        if (!m) C.appendText(ctx.container, C.makeCastlingUnbreakable(tok) + " ");
      }
    }

    applyFigurines() {
      const map = { K: "♔", Q: "♕", R: "♖", B: "♗", N: "♘" };
      this.wrapper.querySelectorAll(".pgn-move").forEach(span => {
        const m = span.textContent.match(/^([KQRBN])(.+?)(\s*)$/);
        if (m) span.textContent = map[m[1]] + m[2] + (m[3] || "");
      });
    }
  }

  // --------------------------------------------------------------------------
  // ReaderBoard — smooth animation logic
  // --------------------------------------------------------------------------

  const ReaderBoard = {
    board: null,
    moveSpans: [],
    movesContainer: null,
    currentIndex: -1,
    mainlineMoves: [],
    mainlineIndex: -1,
    lastFen: null,

    parseFen(fen) {
      const rows = fen.split(" ")[0].split("/");
      const out = {};
      rows.forEach((row, r) => {
        let file = 0;
        row.split("").forEach(ch => {
          if (/\d/.test(ch)) file += Number(ch);
          else {
            const rank = 8 - r;
            out["abcdefgh"[file] + rank] = ch;
            file++;
          }
        });
      });
      return out;
    },

    findMove(prevFen, nextFen) {
      const A = this.parseFen(prevFen);
      const B = this.parseFen(nextFen);

      let from = null,
        to = null;

      for (let sq in A) if (!(sq in B)) from = sq;
      for (let sq in B) if (!(sq in A)) to = sq;

      if (!from || !to) return null;
      return from + "-" + to;
    },

    collectMoves(root) {
      this.moveSpans = Array.from(
        (root || document).querySelectorAll(".reader-move")
      );
    },

    goto(index) {
      if (index < 0 || index >= this.moveSpans.length) return;

      this.currentIndex = index;

      const span = this.moveSpans[index];
      const nextFen = span.dataset.fen;
      const prevFen = this.lastFen || "start";

      this.lastFen = nextFen;

      const move = this.findMove(prevFen, nextFen);

      if (move) {
        this.board.move(move);
      } else {
        this.board.position(nextFen, false);
      }

      this.moveSpans.forEach(s => s.classList.remove("reader-move-active"));
      span.classList.add("reader-move-active");

      if (span.dataset.mainline === "1") {
        const i = this.mainlineMoves.indexOf(span);
        if (i !== -1) this.mainlineIndex = i;
      }

      if (this.movesContainer) {
        const parent = this.movesContainer;
        const scrollTo =
          span.offsetTop - parent.offsetTop - parent.clientHeight / 3;

        parent.scrollTo({ top: scrollTo, behavior: "smooth" });
      }
    },

    gotoSpan(span) {
      const i = this.moveSpans.indexOf(span);
      if (i !== -1) this.goto(i);
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
      this.movesContainer = (root || document).querySelector(".pgn-reader-right");

      this.collectMoves(root);

      this.mainlineMoves = this.moveSpans.filter(
        s => s.dataset.mainline === "1"
      );

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
  // Init
  // --------------------------------------------------------------------------

  document.addEventListener("DOMContentLoaded", () => {
    document.querySelectorAll("pgn-reader").forEach(el => new ReaderPGNView(el));
    ReaderBoard.activate(document);
  });

})();
