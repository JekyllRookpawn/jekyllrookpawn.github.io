// ============================================================================
// pgn.js — static blog-style PGN renderer
// Shares parser logic with pgn-reader.js via pgn-core.js
// ============================================================================

(function () {
  "use strict";

  if (typeof Chess === "undefined") {
    console.warn("pgn.js: chess.js missing");
    return;
  }
  if (typeof window.PGNCore === "undefined") {
    console.warn("pgn.js: pgn-core.js missing");
    return;
  }

  // Import from PGNCore
  const {
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

  class PGNGameView {
    constructor(src) {
      this.sourceEl = src;
      this.wrapper = document.createElement("div");
      this.wrapper.className = "pgn-block";
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

      let { headers: H, moveText: M } = PGNGameView.split(raw),
        pgn = (H.length ? H.join("\n") + "\n\n" : "") + M,
        chess = new Chess();

      chess.load_pgn(pgn, { sloppy: true });

      let head = chess.header(),
        res = normalizeResult(head.Result || ""),
        needs = / (1-0|0-1|1\/2-1\/2|½-½|\*)$/.test(M),
        movetext = needs ? M : M + (res ? " " + res : "");

      this.buildHeader(head);

      // Single flat wrapper
      this.movesWrapper = document.createElement("div");
      this.movesWrapper.className = "pgn-moves";
      this.wrapper.appendChild(this.movesWrapper);

      this.parse(movetext);

      this.sourceEl.replaceWith(this.wrapper);
    }

    buildHeader(h) {
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
      H.className = "pgn-header";
      H.appendChild(document.createTextNode(W + " – " + B));
      H.appendChild(document.createElement("br"));
      H.appendChild(document.createTextNode(line));
      this.wrapper.appendChild(H);
    }

    ensure(ctx, cls) {
      if (!ctx.container) {
        let p = document.createElement("p");
        p.className = cls;
        this.movesWrapper.appendChild(p);
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
          raw = raw.replace(/(1-0|0-1|1\/2-1\/2|½-½|\*)$/, "");
        }
      }

      let p = document.createElement("p");
      p.className = "pgn-comment";
      appendText(p, raw);
      this.movesWrapper.appendChild(p);

      ctx.container = null;
      ctx.lastWasInterrupt = true;
      return j;
    }

    handleSAN(tok, ctx) {
      let core = tok.replace(/[^a-hKQRBN0-9=O0-]+$/g, "").replace(/0/g, "O");
      if (!PGNGameView.isSANCore(core)) {
        appendText(ctx.container, tok + " ");
        return null;
      }

      let base = ctx.baseHistoryLen || 0,
        count = ctx.chess.history().length,
        ply = base + count,
        white = ply % 2 === 0,
        num = Math.floor(ply / 2) + 1;

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
      span.className = "pgn-move";
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
          ctx = ctx.parent;
          ctx.lastWasInterrupt = true;
          ctx.container = null;
          continue;
        }

        if (ch === "{") {
          i = this.parseComment(t, i + 1, ctx);
          continue;
        }

        let s = i;
        while (i < t.length && !"(){}".includes(t[i]) && !/\s/.test(t[i])) i++;

        let tok = t.substring(s, i);
        if (!tok) continue;

        if (/^\[%.*]$/.test(tok)) continue;
        if (tok === "[D]") {
          ctx.lastWasInterrupt = true;
          ctx.container = null;
          continue;
        }

        if (RESULT_REGEX.test(tok)) {
          this.ensure(ctx, "pgn-mainline");
          appendText(ctx.container, tok + " ");
          continue;
        }

        if (MOVE_NUMBER_REGEX.test(tok)) continue;

        let core = tok.replace(/[^a-hKQRBN0-9=O0-]+$/g, "").replace(/0/g, "O"),
          isSAN = PGNGameView.isSANCore(core);

        if (!isSAN) {
          if (EVAL_MAP[tok]) {
            this.ensure(ctx, ctx.type === "main" ? "pgn-mainline" : "pgn-variation");
            appendText(ctx.container, EVAL_MAP[tok] + " ");
            continue;
          }

          if (tok[0] === "$") {
            let nag = NAG_MAP[+tok.slice(1)];
            if (nag) {
              this.ensure(ctx, ctx.type === "main" ? "pgn-mainline" : "pgn-variation");
              appendText(ctx.container, nag + " ");
            }
            continue;
          }

          let isWord = /[A-Za-zÇĞİÖŞÜçğıöşü]/.test(tok);
          if (isWord) {
            if (ctx.type === "variation") {
              this.ensure(ctx, "pgn-variation");
              appendText(ctx.container, " " + tok);
            } else {
              let p = document.createElement("p");
              p.className = "pgn-comment";
              appendText(p, tok);
              this.movesWrapper.appendChild(p);
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
        let m = span.textContent.match(/^([KQRBN])(.+?)\s*$/);
        if (m) {
          span.textContent = map[m[1]] + m[2] + " ";
        }
      });
    }
  }

  class PGNRenderer {
    static renderAll(root) {
      (root || document).querySelectorAll("pgn").forEach(el => new PGNGameView(el));
    }

    static init() {
      PGNRenderer.renderAll(document);
      window.PGNRenderer = {
        run(r) {
          PGNRenderer.renderAll(r || document.body);
        }
      };
    }
  }

  document.readyState === "loading"
    ? document.addEventListener("DOMContentLoaded", () => PGNRenderer.init())
    : PGNRenderer.init();
})();
