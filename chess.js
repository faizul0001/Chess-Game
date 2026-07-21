const squares = document.querySelectorAll(".square");

const INITIAL_BOARD = [
    "♜","♞","♝","♛","♚","♝","♞","♜",
    "♟","♟","♟","♟","♟","♟","♟","♟",
    "","","","","","","","",
    "","","","","","","","",
    "","","","","","","","",
    "","","","","","","","",
    "♙","♙","♙","♙","♙","♙","♙","♙",
    "♖","♘","♗","♕","♔","♗","♘","♖"
];

let selected = null;
let possibleMoves = [];
let turn = "white";
let gameOver = false;
let awaitingPromotion = false;
let pendingPromotion = null;

let roomCode = null;
let myColor = null;
let localBoardCache = INITIAL_BOARD.slice();

const promoModal = document.getElementById("promotion-modal");
const promoButtons = promoModal.querySelectorAll("button");
const gameoverOverlay = document.getElementById("gameover-overlay");
const gameoverText = gameoverOverlay.querySelector(".gameover-text");

const lobby = document.getElementById("lobby");
const gameWrapper = document.getElementById("game-wrapper");
const lobbyMessageEl = document.getElementById("lobby-message");
const roomCodeDisplay = document.getElementById("room-code-display");
const myColorDisplay = document.getElementById("my-color-display");
const turnDisplay = document.getElementById("turn-display");

const BLACK_PIECES = "♟♜♞♝♛♚";
const WHITE_PIECES = "♙♖♘♗♕♔";

function isBlack(ch) { return ch !== "" && BLACK_PIECES.includes(ch); }
function isWhite(ch) { return ch !== "" && WHITE_PIECES.includes(ch); }
function pieceColor(ch) {
    if (isWhite(ch)) return "white";
    if (isBlack(ch)) return "black";
    return null;
}

/* ---------- Pure move / check logic (no DOM, works on a plain board array) ---------- */

function slideMoves(index, board, isEnemy, moves, directions) {
    const row = Math.floor(index / 8), col = index % 8;
    directions.forEach(([dr, dc]) => {
        let r = row + dr, c = col + dc;
        while (r >= 0 && r < 8 && c >= 0 && c < 8) {
            const t = r * 8 + c;
            if (board[t] === "") {
                moves.push(t);
            } else {
                if (isEnemy(board[t])) moves.push(t);
                break;
            }
            r += dr; c += dc;
        }
    });
}

function getRawMoves(piece, index, board) {
    const moves = [];
    const own = pieceColor(piece);
    const isEnemy = (ch) => ch !== "" && pieceColor(ch) !== own;
    const isEmpty = (ch) => ch === "";
    const row = Math.floor(index / 8);
    const col = index % 8;

    if (piece === "♙" || piece === "♟") {
        const dir = piece === "♙" ? -1 : 1;
        const startRow = piece === "♙" ? 6 : 1;
        const oneStep = index + dir * 8;

        if (oneStep >= 0 && oneStep < 64 && isEmpty(board[oneStep])) {
            moves.push(oneStep);
            const twoStep = index + dir * 16;
            if (row === startRow && isEmpty(board[twoStep])) {
                moves.push(twoStep);
            }
        }

        [-1, 1].forEach(dc => {
            const newCol = col + dc;
            if (newCol < 0 || newCol > 7) return;
            const target = index + dir * 8 + dc;
            if (target < 0 || target >= 64) return;
            if (isEnemy(board[target])) moves.push(target);
        });
    }

    if (piece === "♖" || piece === "♜") {
        slideMoves(index, board, isEnemy, moves, [[-1,0],[1,0],[0,-1],[0,1]]);
    }
    if (piece === "♗" || piece === "♝") {
        slideMoves(index, board, isEnemy, moves, [[-1,-1],[-1,1],[1,-1],[1,1]]);
    }
    if (piece === "♕" || piece === "♛") {
        slideMoves(index, board, isEnemy, moves, [[-1,0],[1,0],[0,-1],[0,1],[-1,-1],[-1,1],[1,-1],[1,1]]);
    }
    if (piece === "♘" || piece === "♞") {
        const knightDeltas = [[-2,-1],[-2,1],[-1,-2],[-1,2],[1,-2],[1,2],[2,-1],[2,1]];
        knightDeltas.forEach(([dr,dc]) => {
            const nr = row+dr, nc = col+dc;
            if (nr<0||nr>7||nc<0||nc>7) return;
            const t = nr*8+nc;
            if (isEmpty(board[t]) || isEnemy(board[t])) moves.push(t);
        });
    }
    if (piece === "♔" || piece === "♚") {
        for (let dr=-1; dr<=1; dr++) {
            for (let dc=-1; dc<=1; dc++) {
                if (dr===0 && dc===0) continue;
                const nr=row+dr, nc=col+dc;
                if (nr<0||nr>7||nc<0||nc>7) continue;
                const t = nr*8+nc;
                if (isEmpty(board[t]) || isEnemy(board[t])) moves.push(t);
            }
        }
    }
    return moves;
}

function clearPath(board, fromIndex, toIndex, rowStep, colStep) {
    let r = Math.floor(fromIndex/8)+rowStep, c = fromIndex%8+colStep;
    const tr = Math.floor(toIndex/8), tc = toIndex%8;
    while (r!==tr || c!==tc) {
        if (board[r*8+c] !== "") return false;
        r+=rowStep; c+=colStep;
    }
    return true;
}

function isSquareAttacked(board, target, attackerColor) {
    const tr = Math.floor(target/8), tc = target%8;
    for (let i=0;i<64;i++) {
        const piece = board[i];
        if (piece === "") continue;
        if (pieceColor(piece) !== attackerColor) continue;
        const pr = Math.floor(i/8), pc = i%8;
        const rowDiff = tr-pr, colDiff = tc-pc;
        if (piece === "♙" || piece === "♟") {
            const dir = piece === "♙" ? -1 : 1;
            if (rowDiff === dir && Math.abs(colDiff)===1) return true;
        } else if (piece === "♘" || piece === "♞") {
            if ((Math.abs(rowDiff)===2 && Math.abs(colDiff)===1)||(Math.abs(rowDiff)===1 && Math.abs(colDiff)===2)) return true;
        } else if (piece === "♔" || piece === "♚") {
            if (Math.abs(rowDiff)<=1 && Math.abs(colDiff)<=1 && (rowDiff!==0||colDiff!==0)) return true;
        } else {
            const isRookLike = piece==="♖"||piece==="♜"||piece==="♕"||piece==="♛";
            const isBishopLike = piece==="♗"||piece==="♝"||piece==="♕"||piece==="♛";
            if (rowDiff===0 && colDiff!==0 && isRookLike) {
                if (clearPath(board,i,target,0,colDiff>0?1:-1)) return true;
            } else if (colDiff===0 && rowDiff!==0 && isRookLike) {
                if (clearPath(board,i,target,rowDiff>0?1:-1,0)) return true;
            } else if (Math.abs(rowDiff)===Math.abs(colDiff) && rowDiff!==0 && isBishopLike) {
                if (clearPath(board,i,target,rowDiff>0?1:-1,colDiff>0?1:-1)) return true;
            }
        }
    }
    return false;
}

function findKing(board, color) {
    const k = color === "white" ? "♔" : "♚";
    return board.indexOf(k);
}

function isKingInCheck(board, color) {
    const kIndex = findKing(board, color);
    if (kIndex === -1) return false;
    return isSquareAttacked(board, kIndex, color === "white" ? "black" : "white");
}

function getLegalMoves(piece, index, board) {
    const color = pieceColor(piece);
    const raw = getRawMoves(piece, index, board);
    return raw.filter(target => {
        const newBoard = board.slice();
        newBoard[target] = piece;
        newBoard[index] = "";
        return !isKingInCheck(newBoard, color);
    });
}

function getAllLegalMoves(board, color) {
    let all = [];
    for (let i=0;i<64;i++) {
        const p = board[i];
        if (p==="" || pieceColor(p)!==color) continue;
        const moves = getLegalMoves(p, i, board);
        moves.forEach(m => all.push([i,m]));
    }
    return all;
}

function isPromotionMove(piece, targetIndex) {
    const row = Math.floor(targetIndex / 8);
    if (piece === "♙" && row === 0) return true;
    if (piece === "♟" && row === 7) return true;
    return false;
}

/* ---------- Rendering ---------- */

function clearDots() {
    document.querySelectorAll(".move-dot").forEach(dot => dot.remove());
    possibleMoves = [];
}

function showDot(index) {
    const dot = document.createElement("div");
    dot.className = "move-dot";
    squares[index].appendChild(dot);
    possibleMoves.push(index);
}

function showMoves(piece, index) {
    clearDots();
    const legal = getLegalMoves(piece, index, localBoardCache);
    legal.forEach(m => showDot(m));
}

function renderBoard(board) {
    for (let i = 0; i < 64; i++) {
        squares[i].textContent = board[i];
    }
}

function applyCheckHighlight(board, currentTurn) {
    squares.forEach(sq => sq.classList.remove("in-check"));
    if (isKingInCheck(board, currentTurn)) {
        const kIndex = findKing(board, currentTurn);
        if (kIndex !== -1) squares[kIndex].classList.add("in-check");
    }
}

function updateRoomInfoUI() {
    roomCodeDisplay.textContent = roomCode || "";
    myColorDisplay.textContent = myColor === "white" ? "সাদা" : "কালো";
    turnDisplay.textContent = turn === "white" ? "সাদার পালা" : "কালোর পালা";
}

/* ---------- Multiplayer sync (Firebase Realtime Database) ---------- */

function generateRoomCode() {
    return Math.random().toString(36).substring(2, 7).toUpperCase();
}

function lobbyMessage(msg) {
    lobbyMessageEl.textContent = msg;
}

function showGameScreen() {
    lobby.classList.add("hidden");
    gameWrapper.classList.remove("hidden");
}

function startListening() {
    db.ref("rooms/" + roomCode).on("value", (snap) => {
        const data = snap.val();
        if (!data || !data.board) return;

        localBoardCache = data.board.slice();
        turn = data.turn;
        gameOver = !!data.gameOver;
        selected = null;
        clearDots();
        squares.forEach(sq => {
            sq.classList.remove("selected-white");
            sq.classList.remove("selected-black");
        });

        renderBoard(localBoardCache);
        applyCheckHighlight(localBoardCache, turn);
        updateRoomInfoUI();

        if (gameOver) {
            gameoverText.textContent = data.gameOverText || "";
            gameoverOverlay.classList.remove("hidden");
        } else {
            gameoverOverlay.classList.add("hidden");
        }
    });
}

function createRoom() {
    roomCode = generateRoomCode();
    myColor = "white";

    db.ref("rooms/" + roomCode).set({
        board: INITIAL_BOARD,
        turn: "white",
        gameOver: false,
        gameOverText: "",
        seats: { white: true, black: false }
    }).then(() => {
        startListening();
        showGameScreen();
    }).catch((err) => {
        lobbyMessage("রুম বানাতে সমস্যা হয়েছে: " + err.message);
    });
}

function joinRoom(code) {
    const ref = db.ref("rooms/" + code);
    ref.once("value").then((snap) => {
        if (!snap.exists()) {
            lobbyMessage("এই কোডের কোনো রুম পাওয়া যায়নি।");
            return;
        }
        const data = snap.val();
        if (data.seats && data.seats.black) {
            lobbyMessage("এই রুম আগে থেকেই পূর্ণ।");
            return;
        }
        roomCode = code;
        myColor = "black";
        ref.update({ "seats/black": true }).then(() => {
            startListening();
            showGameScreen();
        });
    }).catch((err) => {
        lobbyMessage("জয়েন করতে সমস্যা হয়েছে: " + err.message);
    });
}

function pushBoardUpdate(board) {
    const newTurn = turn === "white" ? "black" : "white";
    const legal = getAllLegalMoves(board, newTurn);

    let newGameOver = false;
    let newGameOverText = "";

    if (legal.length === 0) {
        newGameOver = true;
        if (isKingInCheck(board, newTurn)) {
            const winner = newTurn === "white" ? "Black" : "White";
            newGameOverText = "Checkmate! " + winner + " Wins";
        } else {
            newGameOverText = "Stalemate! Draw";
        }
    }

    db.ref("rooms/" + roomCode).update({
        board: board,
        turn: newTurn,
        gameOver: newGameOver,
        gameOverText: newGameOverText
    });
}

function makeMove(fromIndex, toIndex) {
    const board = localBoardCache.slice();
    const movingPiece = board[fromIndex];

    board[toIndex] = movingPiece;
    board[fromIndex] = "";

    if (isPromotionMove(movingPiece, toIndex)) {
        pendingPromotion = { board, index: toIndex, color: pieceColor(movingPiece) };
        awaitingPromotion = true;

        renderBoard(board);

        const color = pieceColor(movingPiece);
        const pieceMap = color === "white"
            ? { queen: "♕", rook: "♖", bishop: "♗", knight: "♘" }
            : { queen: "♛", rook: "♜", bishop: "♝", knight: "♞" };
        promoButtons.forEach(btn => {
            btn.textContent = pieceMap[btn.dataset.piece];
        });
        promoModal.classList.remove("hidden");
        return;
    }

    pushBoardUpdate(board);
}

promoButtons.forEach(btn => {
    btn.addEventListener("click", () => {
        if (!pendingPromotion) return;

        const { board, index, color } = pendingPromotion;
        const pieceMap = color === "white"
            ? { queen: "♕", rook: "♖", bishop: "♗", knight: "♘" }
            : { queen: "♛", rook: "♜", bishop: "♝", knight: "♞" };

        board[index] = pieceMap[btn.dataset.piece];

        promoModal.classList.add("hidden");
        pendingPromotion = null;
        awaitingPromotion = false;

        pushBoardUpdate(board);
    });
});

/* ---------- Lobby buttons ---------- */

document.getElementById("create-room-btn").addEventListener("click", createRoom);

document.getElementById("join-room-btn").addEventListener("click", () => {
    const code = document.getElementById("room-code-input").value.trim().toUpperCase();
    if (!code) {
        lobbyMessage("রুম কোড লেখো।");
        return;
    }
    joinRoom(code);
});

/* ---------- Board clicks ---------- */

squares.forEach((square, index) => {
    square.addEventListener("click", () => {
        if (!roomCode || gameOver || awaitingPromotion) return;
        if (turn !== myColor) return;

        const board = localBoardCache;

        if (selected === null) {
            if (board[index] === "") return;
            if (pieceColor(board[index]) !== myColor) return;

            selected = index;
            square.classList.add(myColor === "white" ? "selected-white" : "selected-black");
            showMoves(board[index], index);
            return;
        }

        if (possibleMoves.includes(index)) {
            const fromIndex = selected;
            squares[selected].classList.remove("selected-white");
            squares[selected].classList.remove("selected-black");
            clearDots();
            selected = null;
            makeMove(fromIndex, index);
            return;
        }

        squares[selected].classList.remove("selected-white");
        squares[selected].classList.remove("selected-black");
        clearDots();

        if (selected === index) {
            selected = null;
            return;
        }

        if (board[index] !== "" && pieceColor(board[index]) === myColor) {
            selected = index;
            square.classList.add(myColor === "white" ? "selected-white" : "selected-black");
            showMoves(board[index], index);
        } else {
            selected = null;
        }
    });
});
