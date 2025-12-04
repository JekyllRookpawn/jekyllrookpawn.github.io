// ============================================================================
// pgn-sticky.js
// Two-column sticky PGN renderer, mirroring pgn.js parsing behavior
// - Header + board + buttons in sticky left column
// - Moves/comments/variations in scrollable right column
// - Same SAN / comment / variation handling as pgn.js
// - [D] diagrams are ignored (no extra boards)
// - Figurine input (♕xd5, ♘f6, …) is normalized to SAN before parsing
// ============================================================================

(function () {
  "use strict";

  // --------------------------------------------------------------------------
  // Dependency checks
  // --------------------------------------------------------------------------
  if (typeof Chess === "undefined") {
    console.warn("pgn-sticky.js: chess.js missing");
    return;
  }
  if (typeof Chessboard === "undefined") {
    console.warn("pgn-sticky.js: chessboard.js missing");
    return;
  }

  // --------------------------------------------------------------------------
  // Constants / regex (copied from pgn.js)
  // --------------------------------------------------------------------------
  const PIECE_THEME_URL =
    "https://chessboardjs.com/img/chesspieces/wikipedia/{piece}.png";
  const SAN_CORE_REGEX =
    /^([O0]-[O0](-[O0])?[+#]?|[KQRBN]?[a-h]?[1-8]?x?[a-h][1-8](=[QRBN])?[+#]?|[a-h][1-8](=[QRBN])?[+#]?)$/;
  const RESULT_REGEX = /^(1-0|0-1|1\/2-1\/2|½-½|\*)$/;
  const MOVE_NUMBER_REGEX = /^(\d+)(\.+)$/;
  const NBSP = "\u00A0";

  const NAG_MAP = {
    1: "!",
    2: "?",
    3: "‼",
    4: "⁇",
    5: "⁉",
    6: "⁈",
    13: "→",
    14: "↑",
    15: "⇆",
    16: "⇄",
    17: "⟂",
    18: "∞",
    19: "⟳",
    20: "⟲",
    36: "⩲",
    37: "⩱",
    38: "±",
    39: "∓",
    40: "+=",
    41: "=+",
    42: "±",
    43: "∓",
    44: "⨀",
    45: "⨁"
  };

  const EVAL_MAP = {
    "=": "=",
    "+/=": "⩲",
    "=/+": "⩱",
    "+/-": "±",
    "+/−": "±",
    "-/+": "∓",
    "−/+": "∓",
    "+-": "+−",
    "+−": "+−",
    "-+": "−+",
    "−+": "−+",
    "∞": "∞",
    "=/∞": "⯹"
  };

  function normalizeResult(r) {
    return r ? r.replace(/1\/2-1\/2/g, "½-½") : "";
  }

  function extractYear(d) {
    if (!d) return "";
    let p = d.split(".");
    return /^\d{4}$/.test(p[0]) ? p[0] : "";
  }

  function flipName(n) {
    if (!n) return "";
    let i = n.indexOf(",");
    return i === -1
      ? n.trim()
      : n.slice(i + 1).trim() + " " + n.slice(0, i).trim();
  }

  function appendText(el, txt) {
    if (txt) el.appendChild(document.createTextNode(txt));
  }

  function makeCastlingUnbreakable(s) {
    return s
      .replace(/0-0-0|O-O-O/g, m => m[0] + "\u2011" + m[2] + "\u2011" + m[4])
      .replace(/0-0|O-O/g, m => m[0] + "\u2011" + m[2]);
  }

  // Normalize figurines in the *input PGN text* to SAN letters
  function normalizeFigurinesInPGN(text) {
    return text
      .replace(/♔/g, "K")
      .replace(/♕/g, "Q")
      .replace(/♖/g, "R")
      .replace(/♗/g, "B")
      .replace(/♘/g, "N");
  }

  // --------------------------------------------------------------------------
  // StickyPGNView — same parsing as pgn.js, but laid out in 2 columns
  // --------------------------------------------------------------------------
  class StickyPGNView {
    constructor(src) {
      this.sourceEl = src;
      this.wrapper = document.createElement("div");
      this.wrapper.className = "pgn-sticky-block";
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
      // 1) Read raw PGN, normalize figurines to SAN letters for parsing
      let raw = this.sourceEl.textContent.trim();
      raw = normalizeFigurinesInPGN(raw);

      let { headers: H, moveText: M } = StickyPGNView.split(raw),
        pgn = (H.length ? H.join("\n") + "\n\n" : "") + M,
        chess = new Chess();

      chess.load_pgn(pgn, { sloppy: true });
      let head = chess.header(),
        res = normalizeResult(head.Result || ""),
        needs = / (1-0|0-1|1\/2-1\/2|½-½|\*)$/.test(M),
        movetext = needs ? M : M + (res ? " " + res : "");

      // 2) Two-column layout
      const cols = document.createElement("div");
      cols.className = "pgn-sticky-cols";
      this.wrapper.appendChild(cols);

      // Left sticky column (header + board + buttons)
      this.leftCol = document.createElement("div");
      this.leftCol.className = "pgn-sticky-left";
      cols.appendChild(this.leftCol);

      // Right scrollable column (moves/comments/variations)
      this.movesCol = document.createElement("div");
      this.movesCol.className = "pgn-sticky-right";
      cols.appendChild(this.movesCol);

      // Header in left column (same format as pgn.js header)
      this.header(head);

      // Sticky board + buttons in left column
      this.createStickyBoard();
      this.createStickyButtons();

      // 3) Parse moves into right column using the same logic as pgn.js
      this.parse(movetext);

      this.sourceEl.replaceWith(this.wrapper);
    }

    header(h) {
      let W =
          (h.WhiteTitle ? h.WhiteTitle + " " : "") +
          flipName(h.White || "") +
          (h.WhiteElo ? " (" + h.WhiteElo + ")" : ""),
        B =
          (h.BlackTitle ? h.BlackTitle + " " : "") +
          flipName(h.Black || "") +
          (h.BlackElo ? " (" + h.BlackElo + ")" : ""),
        Y = extractYear(h.Date),
        line = (h.Event || "") + (Y ? ", " + Y : ""),
        H = document.createElement("h4");

      H.appendChild(document.createTextNode(W + " – " + B));
      H.appendChild(document.createElement("br"));
      H.appendChild(document.createTextNode(line));

      const wrap = document.createElement("div");
      wrap.className = "pgn-sticky-header";
      wrap.appendChild(H);

      this.leftCol.appendChild(wrap);
    }

    createStickyBoard() {
      this.boardDiv = document.createElement("div");
      this.boardDiv.className = "pgn-sticky-board";
      this.leftCol.appendChild(this.boardDiv);

      setTimeout(() => {
        StickyBoard.board = Chessboard(this.boardDiv, {
          position: "start",
          draggable: false,
          pieceTheme: PIECE_THEME_URL
        });
      }, 0);
    }

    createStickyButtons() {
      const wrap = document.createElement("div");
      wrap.className = "pgn-sticky-buttons";

      const prev = document.createElement("button");
      prev.className = "pgn-sticky-btn";
      prev.textContent = "◀";
      prev.addEventListener("click", () => StickyBoard.prev());

      const next = document.createElement("button");
      next.className = "pgn-sticky-btn";
      next.textContent = "▶";
      next.addEventListener("click", () => StickyBoard.next());

      wrap.appendChild(prev);
      wrap.appendChild(next);
      this.leftCol.appendChild(wrap);
    }

    ensure(ctx, cls) {
      if (!ctx.container) {
        let p = document.createElement("p");
        p.className = cls;
        // NOTE: everything textual (moves, comments, variations) goes to movesCol
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
        )
          next += text[k++];
        if (RESULT_REGEX.test(next)) {
          raw = raw
            .replace(/(1-0|0-1|1\/2-1\/2|½-½|\*)$/, "")
            .trim();
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
        // In pgn.js this is where [D] diagrams are created.
        // For pgn-sticky we intentionally do *not* create diagrams.
      }
      ctx.lastWasInterrupt = true;
      return j;
    }

    handleSAN(tok, ctx) {
      let core = tok.replace(/[^a-hKQRBN0-9=O0-]+$/g, "").replace(/0/g, "O");
      if (!StickyPGNView.isSANCore(core)) {
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
      span.className = "pgn-move sticky-move";
      span.dataset.fen = ctx.chess.fen();
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
          // In pgn.js this would create a diagram; here we skip diagrams entirely.
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
          isSAN = StickyPGNView.isSANCore(core);

        if (!isSAN) {
          // EVAL tokens
          if (EVAL_MAP[tok]) {
            this.ensure(ctx, ctx.type === "main" ? "pgn-mainline" : "pgn-variation");
            appendText(ctx.container, EVAL_MAP[tok] + " ");
            continue;
          }

          // NAGs
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
          } else {
            this.ensure(ctx, ctx.type === "main" ? "pgn-mainline" : "pgn-variation");
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
        if (m)
          span.textContent = map[m[1]] + m[2] + (m[3] || "");
      });
    }
  }

  // --------------------------------------------------------------------------
  // StickyBoard navigation
  // --------------------------------------------------------------------------
  const StickyBoard = {
    board: null,
    moveSpans: [],
    currentIndex: -1,

    collectMoves(root) {
      this.moveSpans = Array.from(
        (root || document).querySelectorAll(".sticky-move")
      );
    },

    goto(index) {
      if (index < 0 || index >= this.moveSpans.length) return;
      this.currentIndex = index;

      const span = this.moveSpans[index];
      const fen = span.dataset.fen;
      if (!fen || !this.board) return;

      this.board.position(fen, true);

      this.moveSpans.forEach(s =>
        s.classList.remove("sticky-move-active")
      );
      span.classList.add("sticky-move-active");

      span.scrollIntoView({
        behavior: "smooth",
        block: "center"
      });
    },

    next() {
      this.goto(this.currentIndex + 1);
    },

    prev() {
      this.goto(this.currentIndex - 1);
    },

    activate(root) {
      this.collectMoves(root);

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
  // CSS — 2-column layout, left sticky
  // --------------------------------------------------------------------------
  const style = document.createElement("style");
  style.textContent = `
.pgn-sticky-block{
  background:#fff;
  margin-bottom:2rem;
  padding-top:0.5rem;
}

/* Two columns: left sticky, right scroll */
.pgn-sticky-cols{
  display:grid;
  grid-template-columns:340px 1fr;
  gap:2rem;
}

/* Left column: header + board + buttons (sticky as a whole) */
.pgn-sticky-left{
  position:sticky;
  top:1rem;
  align-self:start;
  background:#fff;
}

/* Header inside left column */
.pgn-sticky-header h4{
  margin:0 0 0.25rem 0;
}

/* Board */
.pgn-sticky-board{
  width:320px;
  max-width:100%;
  margin-top:0.5rem;
}

/* Buttons centered relative to board width */
.pgn-sticky-buttons{
  width:320px;
  max-width:100%;
  display:flex;
  justify-content:center;
  gap:1rem;
  margin-top:0.3rem;
}
.pgn-sticky-btn{
  font-size:1.2rem;
  padding:0.2rem 0.6rem;
  cursor:pointer;
  background:#fff;
  border:1px solid #ccc;
  border-radius:4px;
}

/* Right column scrolls independently */
.pgn-sticky-right{
  max-height:calc(100vh - 150px);
  overflow-y:auto;
  padding-right:0.5rem;
}

/* Moves and variations */
.pgn-mainline,
.pgn-variation{
  line-height:1.7;
  font-size:1rem;
}
.pgn-variation{
  margin-left:1.5rem;
  padding-left:0.5rem;
}

/* Comments */
.pgn-comment{
  font-style:italic;
  margin:0.3rem 0;
}

/* Active move highlight */
.sticky-move-active{
  background:#ffe38a;
  border-radius:4px;
  padding:2px 4px;
}
`;
  document.head.appendChild(style);

  // --------------------------------------------------------------------------
  // Init on DOMContentLoaded
  // --------------------------------------------------------------------------
  document.addEventListener("DOMContentLoaded", () => {
    const els = document.querySelectorAll("pgn-sticky");
    if (!els.length) return;

    els.forEach(el => new StickyPGNView(el));
    StickyBoard.activate(document);
  });
})();
