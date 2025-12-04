// ============================================================================
// pgn-sticky.js
// Two-column sticky layout using the same parsing logic as pgn.js
// - Accepts figurine input (♘f3, ♕xd5, …) by normalizing to SAN internally
// - Header + board + buttons in left sticky column
// - Moves / comments / variations in scrollable right column
// - No [D] diagrams (only the sticky board)
// ============================================================================

(function () {
  "use strict";

  // --------------------------------------------------------------------------
  // Dependencies
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
  // Constants / regexes (mirroring pgn.js)
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

  // normalize figurine SAN (♔♕♖♗♘) to letters for parsing
  function stripFigurines(s) {
    return s
      .replace(/♔/g, "K")
      .replace(/♕/g, "Q")
      .replace(/♖/g, "R")
      .replace(/♗/g, "B")
      .replace(/♘/g, "N");
  }

  // --------------------------------------------------------------------------
  // StickyPGNView — same parser as pgn.js, different layout
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
      let raw = this.sourceEl.textContent.trim(),
        { headers: H, moveText: M } = StickyPGNView.split(raw),
        pgn = (H.length ? H.join("\n") + "\n\n" : "") + M,
        chess = new Chess();

      chess.load_pgn(pgn, { sloppy: true });
      let head = chess.header(),
        res = head.Result || "",
        needs = / (1-0|0-1|1\/2-1\/2|½-½|\*)$/.test(M),
        movetext = needs ? M : M + (res ? " " + res : "");

      // ---- Layout: two columns -------------------------------------------
      const cols = document.createElement("div");
      cols.className = "pgn-sticky-cols";
      this.wrapper.appendChild(cols);

      // Left sticky column: header + board + buttons
      this.leftCol = document.createElement("div");
      this.leftCol.className = "pgn-sticky-left";
      cols.appendChild(this.leftCol);

      this.header(head);

      this.createStickyBoard();

      this.createStickyButtons();

      // Right column: moves, comments, variations
      this.rightCol = document.createElement("div");
      this.rightCol.className = "pgn-sticky-right";
      cols.appendChild(this.rightCol);

      this.parse(movetext, chess, this.rightCol);

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

    ensure(ctx, cls, outputParent) {
      if (!ctx.container) {
        let p = document.createElement("p");
        p.className = cls;
        outputParent.appendChild(p);
        ctx.container = p;
      }
    }

    parseComment(text, i, ctx, outputParent) {
      let j = i;
      while (j < text.length && text[j] !== "}") j++;
      let raw = text.substring(i, j).trim();
      if (text[j] === "}") j++;

      raw = raw.replace(/\[%.*?]/g, "").trim();
      if (!raw.length) return j;

      // Strip result markers at comment end if they appear duplicated
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

      // raw may contain "[D]" markers; in pgn.js they'd create diagrams.
      // For sticky version we *ignore* diagrams and only keep text.
      let parts = raw.split("[D]");
      for (let idx = 0; idx < parts.length; idx++) {
        let c = parts[idx].trim();
        if (ctx.type === "variation") {
          this.ensure(ctx, "pgn-variation", outputParent);
          if (c) appendText(ctx.container, " " + c);
        } else {
          if (c) {
            let p = document.createElement("p");
            p.className = "pgn-comment";
            appendText(p, c);
            outputParent.appendChild(p);
          }
          ctx.container = null;
        }
        // In pgn.js here: createDiagram. We intentionally skip that.
      }

      ctx.lastWasInterrupt = true;
      return j;
    }

    handleSAN(tok, ctx) {
      const displayTok = makeCastlingUnbreakable(tok);
      const asciiTok = stripFigurines(tok);

      let core = asciiTok
        .replace(/[^a-hKQRBN0-9=O0-]+$/g, "")
        .replace(/0/g, "O");

      if (!StickyPGNView.isSANCore(core)) {
        appendText(ctx.container, displayTok + " ");
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
        appendText(ctx.container, displayTok + " ");
        return null;
      }

      ctx.lastWasInterrupt = false;

      let span = document.createElement("span");
      span.className = "pgn-move sticky-move";
      span.dataset.fen = ctx.chess.fen();
      span.textContent = displayTok + " ";
      ctx.container.appendChild(span);
      return span;
    }

    parse(t, chess, outputParent) {
      let ctx = {
        type: "main",
        chess: chess,
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

        // whitespace
        if (/\s/.test(ch)) {
          while (i < t.length && /\s/.test(t[i])) i++;
          this.ensure(ctx, ctx.type === "main" ? "pgn-mainline" : "pgn-variation", outputParent);
          appendText(ctx.container, " ");
          continue;
        }

        // variation start
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
          this.ensure(ctx, "pgn-variation", outputParent);
          continue;
        }

        // variation end
        if (ch === ")") {
          i++;
          if (ctx.parent) {
            ctx = ctx.parent;
            ctx.lastWasInterrupt = true;
            ctx.container = null;
          }
          continue;
        }

        // comment
        if (ch === "{") {
          i = this.parseComment(t, i + 1, ctx, outputParent);
          continue;
        }

        // token
        let s = i;
        while (
          i < t.length &&
          !/\s/.test(t[i]) &&
          !"(){}".includes(t[i])
        )
          i++;
        let tok = t.substring(s, i);
        if (!tok) continue;

        // skip [%...] tags
        if (/^\[%.*]$/.test(tok)) continue;

        // ignore [D] here (no diagrams)
        if (tok === "[D]") {
          ctx.lastWasInterrupt = true;
          ctx.container = null;
          continue;
        }

        // result
        if (RESULT_REGEX.test(tok)) {
          if (this.finalResultPrinted) continue;
          this.finalResultPrinted = true;
          this.ensure(ctx, ctx.type === "main" ? "pgn-mainline" : "pgn-variation", outputParent);
          appendText(ctx.container, tok + " ");
          continue;
        }

        // move numbers
        if (MOVE_NUMBER_REGEX.test(tok)) continue;

        // SAN detection using figurine-normalized token
        const asciiTok = stripFigurines(tok);
        let core = asciiTok
          .replace(/[^a-hKQRBN0-9=O0-]+$/g, "")
          .replace(/0/g, "O");
        let isSAN = StickyPGNView.isSANCore(core);

        if (!isSAN) {
          // eval
          if (EVAL_MAP[tok]) {
            this.ensure(ctx, ctx.type === "main" ? "pgn-mainline" : "pgn-variation", outputParent);
            appendText(ctx.container, EVAL_MAP[tok] + " ");
            continue;
          }

          // NAG
          if (tok[0] === "$") {
            let code = +tok.slice(1);
            if (NAG_MAP[code]) {
              this.ensure(ctx, ctx.type === "main" ? "pgn-mainline" : "pgn-variation", outputParent);
              appendText(ctx.container, NAG_MAP[code] + " ");
            }
            continue;
          }

          // word-like (comment-ish) tokens
          if (/[A-Za-zÇĞİÖŞÜçğıöşü]/.test(tok)) {
            if (ctx.type === "variation") {
              this.ensure(ctx, "pgn-variation", outputParent);
              appendText(ctx.container, " " + tok);
            } else {
              let p = document.createElement("p");
              p.className = "pgn-comment";
              appendText(p, tok);
              outputParent.appendChild(p);
              ctx.container = null;
              ctx.lastWasInterrupt = false;
            }
          } else {
            this.ensure(ctx, ctx.type === "main" ? "pgn-mainline" : "pgn-variation", outputParent);
            appendText(ctx.container, tok + " ");
          }
          continue;
        }

        // actual SAN move
        this.ensure(ctx, ctx.type === "main" ? "pgn-mainline" : "pgn-variation", outputParent);
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
  // StickyBoard navigation (shared board for all sticky-move spans)
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
  // CSS — two columns, left sticky
  // --------------------------------------------------------------------------
  const style = document.createElement("style");
  style.textContent = `
.pgn-sticky-block{
  background:#fff;
  margin-bottom:2rem;
  padding-top:0.5rem;
}

/* two columns: left sticky, right scroll */
.pgn-sticky-cols{
  display:grid;
  grid-template-columns:340px 1fr;
  gap:2rem;
}

/* left side: sticky header+board+buttons */
.pgn-sticky-left{
  position:sticky;
  top:1rem;
  align-self:start;
  background:#fff;
}

/* header inside left column */
.pgn-sticky-header h4{
  margin:0 0 0.25rem 0;
}
.pgn-sticky-sub{
  font-size:0.9rem;
  color:#666;
}

/* board */
.pgn-sticky-board{
  width:320px;
  max-width:100%;
  margin-top:0.5rem;
}

/* buttons centered to board width */
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

/* right column scrolls */
.pgn-sticky-right{
  max-height:calc(100vh - 150px);
  overflow-y:auto;
  padding-right:0.5rem;
}

/* pgn text formatting */
.pgn-mainline,
.pgn-variation{
  line-height:1.7;
  font-size:1rem;
}
.pgn-variation{
  margin-left:1.5rem;
  padding-left:0.5rem;
}

/* comments */
.pgn-comment{
  font-style:italic;
  margin:0.3rem 0;
}

/* active move highlight */
.sticky-move-active{
  background:#ffe38a;
  border-radius:4px;
  padding:2px 4px;
}
`;
  document.head.appendChild(style);

  // --------------------------------------------------------------------------
  // Init
  // --------------------------------------------------------------------------
  document.addEventListener("DOMContentLoaded", () => {
    const stickyEls = document.querySelectorAll("pgn-sticky");
    if (!stickyEls.length) return;

    stickyEls.forEach(el => new StickyPGNView(el));
    StickyBoard.activate(document);
  });
})();
