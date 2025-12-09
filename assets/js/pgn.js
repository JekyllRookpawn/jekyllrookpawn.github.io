// ============================================================================
// pgn.js — Static PGN blog renderer (uses PGNCore)
// ============================================================================

(function () {
  "use strict";

  if (typeof Chess === "undefined") {
    console.warn("pgn.js: chess.js missing");
    return;
  }
  if (!window.PGNCore) {
    console.error("pgn.js: PGNCore missing");
    return;
  }

  const C = PGNCore;

  let diagramCounter = 0;

  function createDiagram(parent, fen) {
    const id = "pgn-diagram-" + (diagramCounter++);
    const d = document.createElement("div");
    d.className = "pgn-diagram";
    d.id = id;
    parent.appendChild(d);

    setTimeout(() => {
      Chessboard(id, {
        position: fen,
        draggable: false,
        pieceTheme: C.PIECE_THEME_URL
      });
    }, 0);
  }

  class PGNGameView {
    constructor(src) {
      this.sourceEl = src;
      this.wrapper = document.createElement("div");
      this.wrapper.className = "pgn-blog-block";
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

      let { headers: H, moveText: M } = PGNGameView.split(raw);

      const pgn = (H.length ? H.join("\n") + "\n\n" : "") + M;

      const chess = new Chess();
      chess.load_pgn(pgn, { sloppy: true });

      const head = chess.header();
      const res = C.normalizeResult(head.Result || "");
      const needsResult = / (1-0|0-1|1\/2-1\/2|½-½|\*)$/.test(M);
      const movetext = needsResult ? M : M + (res ? " " + res : "");

      this.header(head);
      this.parse(movetext);

      this.sourceEl.replaceWith(this.wrapper);
    }

    header(h) {
      const H = document.createElement("h4");
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
      this.wrapper.appendChild(H);
    }

    ensure(ctx, cls) {
      if (!ctx.container) {
        const p = document.createElement("p");
        p.className = cls;
        this.wrapper.appendChild(p);
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
            this.wrapper.appendChild(p);
          }
          ctx.container = null;
        }

        if (idx < parts.length - 1) createDiagram(this.wrapper, ctx.chess.fen());
      }

      ctx.lastWasInterrupt = true;
      return j;
    }

    handleSAN(tok, ctx) {
      let core = tok.replace(/[^a-hKQRBN0-9=O0-]+$/g, "").replace(/0/g, "O");
      if (!PGNGameView.isSANCore(core)) {
        C.appendText(ctx.container, tok + " ");
        return null;
      }

      let base = ctx.baseHistoryLen || 0,
        count = ctx.chess.history().length,
        ply = base + count,
        white = ply % 2 === 0,
        num = Math.floor(ply / 2) + 1;

      if (ctx.type === "main") {
        if (white) C.appendText(ctx.container, num + "." + C.NBSP);
        else if (ctx.lastWasInterrupt)
          C.appendText(ctx.container, num + "..." + C.NBSP);
      } else {
        if (white) C.appendText(ctx.container, num + "." + C.NBSP);
        else if (ctx.lastWasInterrupt)
          C.appendText(ctx.container, num + "..." + C.NBSP);
      }

      ctx.prevFen = ctx.chess.fen();
      ctx.prevHistoryLen = ply;

      let mv = ctx.chess.move(core, { sloppy: true });
      if (!mv) {
        C.appendText(ctx.container, tok + " ");
        return null;
      }

      ctx.lastWasInterrupt = false;

      const span = document.createElement("span");
      span.className = "pgn-move";
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
        while (i < t.length && !/\s/.test(t[i]) && !"(){}".includes(t[i])) i++;
        let tok = t.substring(s, i);
        if (!tok) continue;

        if (/^\[%.*]$/.test(tok)) continue;

        if (tok === "[D]") {
          createDiagram(this.wrapper, ctx.chess.fen());
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

        const isSAN = PGNGameView.isSANCore(core);

        if (!isSAN) {
          if (C.EVAL_MAP[tok]) {
            this.ensure(
              ctx,
              ctx.type === "main" ? "pgn-mainline" : "pgn-variation"
            );
            C.appendText(ctx.container, C.EVAL_MAP[tok] + " ");
            continue;
          }

          if (tok[0] === "$") {
            const code = +tok.slice(1);
            if (C.NAG_MAP[code]) {
              this.ensure(
                ctx,
                ctx.type === "main" ? "pgn-mainline" : "pgn-variation"
              );
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
              this.wrapper.appendChild(p);
              ctx.container = null;
              ctx.lastWasInterrupt = false;
            }
          } else {
            this.ensure(
              ctx,
              ctx.type === "main" ? "pgn-mainline" : "pgn-variation"
            );
            C.appendText(ctx.container, tok + " ");
          }
          continue;
        }

        this.ensure(ctx, ctx.type === "main" ? "pgn-mainline" : "pgn-variation");
        let m = this.handleSAN(tok, ctx);
        if (!m) C.appendText(ctx.container, C.makeCastlingUnbreakable(tok) + " ");
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

  class PGNRenderer {
    static renderAll(root) {
      (root || document).querySelectorAll("pgn").forEach(el => new PGNGameView(el));
    }

    static init() {
      PGNRenderer.renderAll(document);
    }
  }

  document.readyState === "loading"
    ? document.addEventListener("DOMContentLoaded", () => PGNRenderer.init())
    : PGNRenderer.init();

})();
