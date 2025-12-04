// ============================================================================
// pgn-sticky.js
// FINAL VERSION — Two-row layout:
// Row 1 (sticky): Header + diagram + buttons
// Row 2 (scrollable): Moves, comments, variations
// Matches pgn.js parser and features
// ============================================================================

(function () {
    "use strict";

    // ========== DEPENDENCY CHECK ===================================================
    if (typeof Chess === "undefined") {
        console.warn("pgn-sticky.js: chess.js missing");
        return;
    }

    const PIECE_THEME_URL =
        "https://chessboardjs.com/img/chesspieces/wikipedia/{piece}.png";

    // Same regex/constants as pgn.js
    const SAN_CORE_REGEX = /^([O0]-[O0](-[O0])?[+#]?|[KQRBN]?[a-h]?[1-8]?x?[a-h][1-8](=[QRBN])?[+#]?|[a-h][1-8](=[QRBN])?[+#]?)$/;
    const RESULT_REGEX = /^(1-0|0-1|1\/2-1\/2|½-½|\*)$/;
    const MOVE_NUMBER_REGEX = /^(\d+)(\.+)$/;
    const NBSP = "\u00A0";
    const NAG_MAP = {
        1: "!", 2: "?",
        3: "‼", 4: "⁇",
        5: "⁉", 6: "⁈",
        13: "→", 14: "↑",
        15: "⇆", 16: "⇄",
        17: "⟂", 18: "∞",
        19: "⟳", 20: "⟲",
        36: "⩲", 37: "⩱",
        38: "±", 39: "∓",
        40: "+=", 41: "=+",
        42: "±", 43: "∓",
        44: "⨀", 45: "⨁"
    };

    const EVAL_MAP = {
        "=": "=", "+/=": "⩲", "=/+": "⩱",
        "+/-": "±", "+/−": "±",
        "-/+": "∓", "−/+": "∓",
        "+-": "+−", "+−": "+−",
        "-+": "−+", "−+": "−+",
        "∞": "∞", "=/∞": "⯹"
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

    // ============================================================================
    //                           StickyPGNView
    // ============================================================================
    class StickyPGNView {

        constructor(src) {
            this.src = src;
            this.wrapper = document.createElement("div");
            this.wrapper.className = "pgn-sticky-block";
            this.build();
            this.applyFigurines();   // same as pgn.js
        }

        splitPGN(raw) {
            const lines = raw.split(/\r?\n/);
            let headers = [];
            let moves = [];
            let inHeader = true;

            for (const L of lines) {
                const T = L.trim();

                if (inHeader && T.startsWith("[") && T.endsWith("]")) {
                    headers.push(T);
                } else if (T === "") {
                    inHeader = false;
                } else {
                    inHeader = false;
                    moves.push(T);
                }
            }

            return {
                headers,
                movetext: moves.join(" ").trim()
            };
        }

        build() {
            const raw = this.src.textContent.trim();
            const { headers, movetext } = this.splitPGN(raw);

            const pgn =
                (headers.length ? headers.join("\n") + "\n\n" : "") + movetext;

            const chess = new Chess();
            chess.load_pgn(pgn, { sloppy: true });

            const headerObj = chess.header();

            // ============================================================
            // ROW 1 — Sticky header + board + buttons
            // ============================================================
            this.headerBlock = document.createElement("div");
            this.headerBlock.className = "pgn-sticky-headerblock";
            this.wrapper.appendChild(this.headerBlock);

            this.buildHeader(headerObj, this.headerBlock);
            this.buildStickyBoard(this.headerBlock);
            this.buildStickyButtons(this.headerBlock);

            // Reset board state for replay
            chess.reset();

            // ============================================================
            // ROW 2 — Scrollable PGN data
            // ============================================================
            this.scrollBox = document.createElement("div");
            this.scrollBox.className = "pgn-sticky-scrollbox";
            this.wrapper.appendChild(this.scrollBox);

            this.parse(movetext, chess, this.scrollBox);

            this.src.replaceWith(this.wrapper);
        }

        buildHeader(h, parent) {
            const W =
                (h.WhiteTitle ? h.WhiteTitle + " " : "") +
                flipName(h.White || "") +
                (h.WhiteElo ? " (" + h.WhiteElo + ")" : "");

            const B =
                (h.BlackTitle ? h.BlackTitle + " " : "") +
                flipName(h.Black || "") +
                (h.BlackElo ? " (" + h.BlackElo + ")" : "");

            const Y = extractYear(h.Date);
            const eventLine = (h.Event || "") + (Y ? ", " + Y : "");

            const H = document.createElement("h4");
            H.appendChild(document.createTextNode(W + " – " + B));
            H.appendChild(document.createElement("br"));
            H.appendChild(document.createTextNode(eventLine));

            parent.appendChild(H);
        }

        buildStickyBoard(parent) {
            const d = document.createElement("div");
            d.id = "pgn-sticky-board";
            d.className = "pgn-sticky-diagram";
            parent.appendChild(d);

            setTimeout(() => {
                StickyBoard.board = Chessboard(d, {
                    position: "start",
                    draggable: false,
                    pieceTheme: PIECE_THEME_URL,
                    moveSpeed: 200,
                    snapSpeed: 20,
                    snapbackSpeed: 20,
                    appearSpeed: 150
                });
            }, 0);
        }

        buildStickyButtons(parent) {
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
            parent.appendChild(wrap);
        }

        // ============================================================================
        // PGN Parsing (IDENTICAL to pgn.js except [D] removed)
        // ============================================================================
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

            const ensure = cls => {
                if (!ctx.container) {
                    const p = document.createElement("p");
                    p.className = cls;
                    outputParent.appendChild(p);
                    ctx.container = p;
                }
            };

            const parseComment = (text, i) => {
                let j = i;
                while (j < text.length && text[j] !== "}") j++;

                let raw = text.substring(i, j).trim();
                if (text[j] === "}") j++;
                raw = raw.replace(/\[%.*?]/g, "").trim();

                if (!raw.length) return j;

                if (ctx.type === "main") {
                    const p = document.createElement("p");
                    p.className = "pgn-comment";
                    appendText(p, raw);
                    outputParent.appendChild(p);
                    ctx.container = null;
                } else {
                    ensure("pgn-variation");
                    appendText(ctx.container, " " + raw);
                }

                ctx.lastWasInterrupt = true;
                return j;
            };

            for (; i < t.length; ) {
                let ch = t[i];

                if (/\s/.test(ch)) {
                    while (i < t.length && /\s/.test(t[i])) i++;
                    ensure(ctx.type === "main" ? "pgn-mainline" : "pgn-variation");
                    appendText(ctx.container, " ");
                    continue;
                }

                if (ch === "{") {
                    i = parseComment(t, i + 1);
                    continue;
                }

                if (ch === "(") {
                    i++;
                    let fen = ctx.prevFen || ctx.chess.fen();
                    let len = typeof ctx.prevHistoryLen === "number"
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

                    ensure("pgn-variation");
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

                if (t.substring(i, i + 3) === "[D]") {
                    i += 3;
                    ctx.container = null;
                    ctx.lastWasInterrupt = true;
                    continue;
                }

                let s = i;
                while (
                    i < t.length &&
                    !/\s/.test(t[i]) &&
                    !"(){}".includes(t[i])
                ) {
                    i++;
                }
                let tok = t.substring(s, i);
                if (!tok) continue;

                if (/^\[%.*]$/.test(tok)) continue;

                if (RESULT_REGEX.test(tok)) {
                    ensure(ctx.type === "main" ? "pgn-mainline" : "pgn-variation");
                    appendText(ctx.container, tok + " ");
                    continue;
                }

                if (MOVE_NUMBER_REGEX.test(tok)) continue;

                const core = tok
                    .replace(/[^a-hKQRBN0-9=O0-]+$/g, "")
                    .replace(/0/g, "O");
                const isSAN = SAN_CORE_REGEX.test(core);

                if (!isSAN) {
                    if (EVAL_MAP[tok]) {
                        ensure(ctx.type === "main" ? "pgn-mainline" : "pgn-variation");
                        appendText(ctx.container, EVAL_MAP[tok] + " ");
                        continue;
                    }

                    if (tok[0] === "$") {
                        let code = +tok.slice(1);
                        if (NAG_MAP[code]) {
                            ensure(ctx.type === "main" ? "pgn-mainline" : "pgn-variation");
                            appendText(ctx.container, NAG_MAP[code] + " ");
                        }
                        continue;
                    }

                    if (/[A-Za-zÇĞİÖŞÜçğıöşü]/.test(tok)) {
                        if (ctx.type === "variation") {
                            ensure("pgn-variation");
                            appendText(ctx.container, " " + tok);
                        } else {
                            const p = document.createElement("p");
                            p.className = "pgn-comment";
                            appendText(p, tok);
                            outputParent.appendChild(p);
                            ctx.container = null;
                            ctx.lastWasInterrupt = false;
                        }
                    } else {
                        ensure(ctx.type === "main" ? "pgn-mainline" : "pgn-variation");
                        appendText(ctx.container, tok + " ");
                    }
                    continue;
                }

                ensure(ctx.type === "main" ? "pgn-mainline" : "pgn-variation");

                ctx.prevFen = ctx.chess.fen();
                ctx.prevHistoryLen =
                    ctx.baseHistoryLen + ctx.chess.history().length;

                let mv = ctx.chess.move(core, { sloppy: true });

                if (!mv) {
                    appendText(ctx.container, makeCastlingUnbreakable(tok) + " ");
                    continue;
                }

                let ply = ctx.prevHistoryLen;
                let white = ply % 2 === 0;
                let num = Math.floor(ply / 2) + 1;

                if (white) appendText(ctx.container, num + "." + NBSP);
                else if (ctx.lastWasInterrupt)
                    appendText(ctx.container, num + "..." + NBSP);

                ctx.lastWasInterrupt = false;

                const span = document.createElement("span");
                span.className = "pgn-move sticky-move";
                span.dataset.fen = ctx.chess.fen();
                span.textContent = makeCastlingUnbreakable(mv.san) + " ";
                ctx.container.appendChild(span);
            }
        }

        // ============================================================================
        // Figurines (same logic as pgn.js)
        // ============================================================================
        applyFigurines() {
            const map = { K: "♔", Q: "♕", R: "♖", B: "♗", N: "♘" };

            this.wrapper.querySelectorAll(".pgn-move").forEach(span => {
                let m = span.textContent.match(/^([KQRBN])(.+?)(\s*)$/);
                if (m) span.textContent = map[m[1]] + m[2] + (m[3] || "");
            });
        }
    }

    // ============================================================================
    // StickyBoard Navigation Engine
    // ============================================================================
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
            if (!fen) return;

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

    // ============================================================================
    // CSS (clean, borderless, no shadows)
    // ============================================================================
    const style = document.createElement("style");
    style.textContent = `
.pgn-sticky-block {
    position: relative;
    padding-top: 0.5rem;
    margin-bottom: 2rem;
}

/* ROW 1 — Sticky title + board + buttons */
.pgn-sticky-headerblock {
    position: sticky;
    top: 1rem;
    z-index: 100;
    background: #ffffff;
    padding: 0.5rem 0 1rem 0;
}

.pgn-sticky-headerblock h4 {
    margin: 0 0 0.3rem 0;
}

/* Board in Row 1 */
.pgn-sticky-diagram {
    width: 320px;
    max-width: 100%;
    margin: 0.5rem 0 0 0;
}

/* Center the buttons */
.pgn-sticky-buttons {
    width: 100%;
    display: flex;
    justify-content: center;
    gap: 1rem;
    margin-top: 0.3rem;
}

.pgn-sticky-btn {
    font-size: 1.2rem;
    padding: 0.2rem 0.6rem;
    cursor: pointer;
    background: #ffffff;
    border: 1px solid #ccc;
    border-radius: 4px;
    transition: background 0.15s;
}

.pgn-sticky-btn:hover {
    background: #f5f5f5;
}

/* ROW 2 — Scrollable PGN text */
.pgn-sticky-scrollbox {
    max-height: calc(100vh - 440px); 
    overflow-y: auto;
    padding-right: 0.5rem;
    margin-top: 1rem;
}

/* PGN formatting */
.pgn-mainline,
.pgn-variation {
    line-height: 1.7;
    font-size: 1rem;
}

.pgn-variation {
    margin-left: 1.5rem;
    padding-left: 0.5rem;
    border-left: 2px solid transparent;
    margin-top: 0.5rem;
}

.pgn-comment {
    font-style: italic;
    margin: 0.3rem 0;
}

/* Move highlighting */
.sticky-move {
    cursor: pointer;
}

.sticky-move-active {
    background: #ffe38a;
    border-radius: 4px;
    padding: 2px 4px;
}
`;
    document.head.appendChild(style);

    // ============================================================================
    // Activate rendering
    // ============================================================================
    document.addEventListener("DOMContentLoaded", () => {
        const stickyEls = document.querySelectorAll("pgn-sticky");
        if (!stickyEls.length) return;

        stickyEls.forEach(el => new StickyPGNView(el));

        StickyBoard.activate(document);
    });

})();
