const squares = document.querySelectorAll(".square");

const boardState = [
    ["♜","♞","♝","♛","♚","♝","♞","♜"],
    ["♟","♟","♟","♟","♟","♟","♟","♟"],
    ["","","","","","","",""],
    ["","","","","","","",""],
    ["","","","","","","",""],
    ["","","","","","","",""],
    ["♙","♙","♙","♙","♙","♙","♙","♙"],
    ["♖","♘","♗","♕","♔","♗","♘","♖"]
];

function drawBoard() {
    let index = 0;
    for (let row = 0; row < 8; row++) {
        for (let col = 0; col < 8; col++) {
            squares[index].textContent = boardState[row][col];
            index++;
        }
    }
}

drawBoard();

let selected = null;
let possibleMoves = [];
let turn = "white";
let gameOver = false;
let awaitingPromotion = false;
let pendingPromotion = null;

const promoModal = document.getElementById("promotion-modal");
const promoButtons = promoModal.querySelectorAll("button");
const gameoverOverlay = document.getElementById("gameover-overlay");
const gameoverText = gameoverOverlay.querySelector(".gameover-text");

const BLACK_PIECES = "♟♜♞♝♛♚";
const WHITE_PIECES = "♙♖♘♗♕♔";

function isBlack(ch) { return ch !== "" && BLACK_PIECES.includes(ch); }
function isWhite(ch) { return ch !== "" && WHITE_PIECES.includes(ch); }
function pieceColor(ch) {
    if (isWhite(ch)) return "white";
    if (isBlack(ch)) return "black";
    return null;
}

function getBoardSnapshot() {
    return Array.from(squares).map(sq => sq.textContent);
}

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

function updateCheckHighlight() {
    document.querySelectorAll(".square").forEach(sq => sq.classList.remove("in-check"));
    const board = getBoardSnapshot();
    if (isKingInCheck(board, turn)) {
        const kIndex = findKing(board, turn);
        if (kIndex !== -1) squares[kIndex].classList.add("in-check");
    }
}

function checkGameEnd() {
    const board = getBoardSnapshot();
    const legal = getAllLegalMoves(board, turn);
    if (legal.length === 0) {
        gameOver = true;
        if (isKingInCheck(board, turn)) {
            const winner = turn === "white" ? "Black" : "White";
            showGameOver("Checkmate! " + winner + " Wins");
        } else {
            showGameOver("Stalemate! Draw");
        }
    }
}

function showGameOver(text) {
    gameoverText.textContent = text;
    gameoverOverlay.classList.remove("hidden");
}

function isPromotionMove(piece, targetIndex) {
    const row = Math.floor(targetIndex / 8);
    if (piece === "♙" && row === 0) return true;
    if (piece === "♟" && row === 7) return true;
    return false;
}

function openPromotionModal(index, color) {
    awaitingPromotion = true;
    pendingPromotion = { index, color };

    const pieceMap = color === "white"
        ? { queen: "♕", rook: "♖", bishop: "♗", knight: "♘" }
        : { queen: "♛", rook: "♜", bishop: "♝", knight: "♞" };

    promoButtons.forEach(btn => {
        btn.textContent = pieceMap[btn.dataset.piece];
    });

    promoModal.classList.remove("hidden");
}

promoButtons.forEach(btn => {
    btn.addEventListener("click", () => {
        if (!pendingPromotion) return;

        const { index, color } = pendingPromotion;
        const pieceMap = color === "white"
            ? { queen: "♕", rook: "♖", bishop: "♗", knight: "♘" }
            : { queen: "♛", rook: "♜", bishop: "♝", knight: "♞" };

        squares[index].textContent = pieceMap[btn.dataset.piece];

        promoModal.classList.add("hidden");
        pendingPromotion = null;
        awaitingPromotion = false;

        turn = turn === "white" ? "black" : "white";
        updateCheckHighlight();
        checkGameEnd();
    });
});

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
    const board = getBoardSnapshot();
    const legal = getLegalMoves(piece, index, board);
    legal.forEach(m => showDot(m));
}

squares.forEach((square, index) => {
    square.addEventListener("click", () => {
        if (gameOver || awaitingPromotion) return;

        if (selected === null) {
            if (square.textContent === "") return;
            if (pieceColor(square.textContent) !== turn) return;

            selected = index;
            square.classList.add(turn === "white" ? "selected-white" : "selected-black");
            showMoves(square.textContent, index);
            return;
        }

        if (possibleMoves.includes(index)) {
            const movingPiece = squares[selected].textContent;

            squares[index].textContent = movingPiece;
            squares[selected].textContent = "";
            squares[selected].classList.remove("selected-white");
            squares[selected].classList.remove("selected-black");
            clearDots();
            selected = null;

            if (isPromotionMove(movingPiece, index)) {
                openPromotionModal(index, pieceColor(movingPiece));
                return;
            }

            turn = turn === "white" ? "black" : "white";
            updateCheckHighlight();
            checkGameEnd();
            return;
        }

        squares[selected].classList.remove("selected-white");
        squares[selected].classList.remove("selected-black");
        clearDots();

        if (selected === index) {
            selected = null;
            return;
        }

        if (square.textContent !== "" && pieceColor(square.textContent) === turn) {
            selected = index;
            square.classList.add(turn === "white" ? "selected-white" : "selected-black");
            showMoves(square.textContent, index);
        } else {
            selected = null;
        }
    });
});