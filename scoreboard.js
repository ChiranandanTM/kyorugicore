let roundDeclared = false;
let hongScore = 0;
let chongScore = 0;
let hongGamJeom = 0;
let chongGamJeom = 0;
let currentRound = 1;
const totalRounds = 3;
let hongRoundsWon = 0;
let chongRoundsWon = 0;
let timerInterval = null;
let timerTime = 0;
let timerSetTime = 0;
let isTimerRunning = false;
let matchWinnerDeclared = false;
let currentRoomId = null;
let isMedicalTimeout = false;
let redBlinkClass = '';
let blueBlinkClass = '';

let pointAction = '';
let team = '';
let defaultSettings = {
    roundMinutes: 2,
    breakSeconds: 30,
    medicalTimeout: 60,
    courtNumber: 'none'
};

// ========== ROOM CREATION ==========
function generateRoomId() {
    return Math.random().toString(36).substr(2, 6).toUpperCase();
}

function createRoom() {
    currentRoomId = generateRoomId();
    const roomId = currentRoomId;

    const initialData = {
        teamA: { score: 0, gamJeoms: 0 }, // Hong (red)
        teamB: { score: 0, gamJeoms: 0 }, // Chong (blue)
        timer: { minutes: defaultSettings.roundMinutes, seconds: 0, running: false },
        round: 1,
        hongRoundsWon: 0,
        chongRoundsWon: 0,
        medicalTimeout: { active: false, team: '' },
        redBlinkClass: '',
        blueBlinkClass: '',
        settings: defaultSettings,
        submissions: {},
        referees: {}
    };

    try {
        db.ref(`rooms/${roomId}`).off();
        
        db.ref(`rooms/${roomId}`).set(initialData).then(() => {
            document.getElementById('roomIdDisplay').textContent = `Room ID: ${roomId}`;
            const qrCanvas = document.getElementById('qrCode');
            qrCanvas.innerHTML = '';
            QRCode.toCanvas(qrCanvas, roomId, (error) => {
                if (error) console.error("QR code generation failed:", error);
            });
            listenToRoom(roomId);
            listenToReferees();
        }).catch((error) => {
            console.error("Failed to create room:", error);
            listenToRoom(roomId);
        });
    } catch (error) {
        console.error("Firebase unavailable:", error);
        listenToRoom(roomId);
    }
}

function listenToRoom(roomId) {
    try {
        db.ref(`rooms/${roomId}`).on('value', (snapshot) => {
            const data = snapshot.val();
            if (data) {
                hongScore = data.teamA?.score || hongScore; // Hong (red)
                chongScore = data.teamB?.score || chongScore; // Chong (blue)
                hongGamJeom = data.teamA?.gamJeoms || hongGamJeom;
                chongGamJeom = data.teamB?.gamJeoms || chongGamJeom;
                currentRound = data.round || currentRound;
                hongRoundsWon = data.hongRoundsWon || hongRoundsWon;
                chongRoundsWon = data.chongRoundsWon || chongRoundsWon;
                if (!isTimerRunning) {
                    timerTime = (data.timer?.minutes || 0) * 60 + (data.timer?.seconds || 0);
                }
                isTimerRunning = data.timer?.running && !matchWinnerDeclared && !roundDeclared;
                isMedicalTimeout = data.medicalTimeout?.active || isMedicalTimeout;
                redBlinkClass = data.redBlinkClass || redBlinkClass;
                blueBlinkClass = data.blueBlinkClass || blueBlinkClass;
                defaultSettings = data.settings || defaultSettings;

                if (isMedicalTimeout) {
                    const timeoutTeam = data.medicalTimeout?.team || '';
                    if (timeoutTeam) {
                        document.getElementById(timeoutTeam === 'hong' ? 'redTimeout' : 'blueTimeout').textContent = `${timeoutTeam.toUpperCase()} Medical Timeout`;
                    }
                    document.getElementById('stopTimeoutButton').style.display = 'block';
                } else {
                    document.getElementById('redTimeout').textContent = '';
                    document.getElementById('blueTimeout').textContent = '';
                    document.getElementById('stopTimeoutButton').style.display = 'none';
                }

                updateCourtNumberDisplay();
                updateDisplay();
                updateTimerDisplay();
                updateTimerInputs();

                if (isTimerRunning && !timerInterval && !matchWinnerDeclared && !roundDeclared) {
                    toggleTimer();
                } else if (!isTimerRunning && timerInterval) {
                    stopTimer();
                }
            }
        }, (error) => {
            console.error("Error listening to room:", error);
        });
    } catch (error) {
        console.error("Firebase listener setup failed:", error);
        updateCourtNumberDisplay();
        updateDisplay();
        updateTimerDisplay();
        updateTimerInputs();
    }
}

function listenToReferees() {
    db.ref(`rooms/${currentRoomId}/referees`).on("value", (snapshot) => {
        const data = snapshot.val() || {};
        const list = Object.entries(data).map(([id, val]) => {
            return `<div>${id}: <input class="rename" value="${val.name || ''}" onchange="renameDevice('${id}', this.value)" /></div>`;
        });
        document.getElementById("connectedDevices").innerHTML = `<h3>Connected Devices (${list.length})</h3>` + list.join('');
    });
}

function renameDevice(id, newName) {
    if (!currentRoomId) return;
    db.ref(`rooms/${currentRoomId}/referees/${id}`).update({ name: newName });
}

// ========== SCOREBOARD SETTINGS ==========
function openEditScoreboardSlide() {
    const slide = document.getElementById('editScoreboardSlide');
    if (slide) {
        document.getElementById('defaultRoundMinutes').value = defaultSettings.roundMinutes;
        document.getElementById('defaultBreakSeconds').value = defaultSettings.breakSeconds;
        document.getElementById('defaultMedicalTimeout').value = defaultSettings.medicalTimeout;
        document.getElementById('courtNumberSelect').value = defaultSettings.courtNumber;
        // Ensure seconds is set to 0 in the timer section
        document.getElementById('timerSeconds').value = 0;
        slide.style.display = 'block';
    }
}

function closeEditScoreboardSlide() {
    const slide = document.getElementById('editScoreboardSlide');
    if (slide) {
        slide.style.display = 'none';
    }
}

function saveScoreboardSettings() {
    defaultSettings.roundMinutes = parseInt(document.getElementById('defaultRoundMinutes').value) || 2;
    defaultSettings.breakSeconds = parseInt(document.getElementById('defaultBreakSeconds').value) || 30;
    defaultSettings.medicalTimeout = parseInt(document.getElementById('defaultMedicalTimeout').value) || 60;
    defaultSettings.courtNumber = document.getElementById('courtNumberSelect').value;

    if (currentRoomId) {
        db.ref(`rooms/${currentRoomId}/settings`).update(defaultSettings);
    }

    updateCourtNumberDisplay();
    updateTimerInputs();
    closeEditScoreboardSlide();
}

function updateCourtNumberDisplay() {
    const courtNumberEl = document.getElementById('courtNumber');
    if (courtNumberEl) {
        if (defaultSettings.courtNumber === 'none') {
            courtNumberEl.textContent = '';
        } else {
            courtNumberEl.textContent = `Court No ${defaultSettings.courtNumber}`;
        }
    }
}

function updateTimerInputs() {
    const timerMinutesInput = document.getElementById('timerMinutes');
    const timerSecondsInput = document.getElementById('timerSeconds');
    if (timerMinutesInput && timerSecondsInput) {
        timerMinutesInput.value = defaultSettings.roundMinutes;
        timerSecondsInput.value = 0;
        timerSetTime = defaultSettings.roundMinutes * 60;
        timerTime = timerSetTime;
        updateTimerDisplay();
    }
}

// ========== DISPLAY ==========
function updateDisplay() {
    const redScoreEl = document.getElementById("redScore");
    const blueScoreEl = document.getElementById("blueScore");
    const redGamJeomEl = document.getElementById("redGamJeomCounter");
    const blueGamJeomEl = document.getElementById("blueGamJeomCounter");
    const roundEl = document.getElementById("currentRound");

    if (redScoreEl && blueScoreEl && redGamJeomEl && blueGamJeomEl && roundEl) {
        redScoreEl.textContent = hongScore; // Hong (red)
        blueScoreEl.textContent = chongScore; // Chong (blue)
        redGamJeomEl.textContent = `${hongGamJeom}/5`;
        blueGamJeomEl.textContent = `${chongGamJeom}/5`;
        roundEl.textContent = currentRound;

        // Update CSS variables for Gam-Jeom progress
        document.querySelector('.gamjeom-container-left').style.setProperty('--hongGamJeom', hongGamJeom);
        document.querySelector('.gamjeom-container-right').style.setProperty('--chongGamJeom', chongGamJeom);

        redScoreEl.classList.remove('blink-white', 'blink-yellow');
        blueScoreEl.classList.remove('blink-white', 'blink-yellow');
        if (redBlinkClass) redScoreEl.classList.add(redBlinkClass);
        if (blueBlinkClass) blueScoreEl.classList.add(blueBlinkClass);

        if (matchWinnerDeclared) {
            disableButtons();
        }
    } else {
        console.warn("One or more score elements not found in DOM");
    }
}

// ========== POINT ADJUSTMENT ==========
function openPointSlide(action, teamColor) {
    if (matchWinnerDeclared || isMedicalTimeout || roundDeclared) return;
    pointAction = action;
    team = teamColor;
    const slideHeader = document.getElementById('slideHeader');
    if (slideHeader) {
        slideHeader.textContent = action === 'add' ? 'Add Points' : 'Subtract Points';
        document.getElementById('pointSlide').style.display = 'block';
    }
}

function closePointSlide() {
    const pointSlide = document.getElementById('pointSlide');
    if (pointSlide) {
        pointSlide.style.display = 'none';
    }
    pointAction = '';
    team = '';
}

function adjustPoints(points) {
    if (matchWinnerDeclared || isMedicalTimeout || roundDeclared) return;

    if (pointAction === 'add') {
        if (team === 'red') {
            hongScore += points; // Hong (red)
        } else if (team === 'blue') {
            chongScore += points; // Chong (blue)
        }
    } else if (pointAction === 'subtract') {
        if (team === 'red') {
            hongScore = Math.max(0, hongScore - points); // Hong (red)
        } else if (team === 'blue') {
            chongScore = Math.max(0, chongScore - points); // Chong (blue)
        }
    }
    updateDisplay();
    checkPointGap();
    checkGamJeomLimit();
    closePointSlide();

    if (currentRoomId) {
        db.ref(`rooms/${currentRoomId}`).update({
            teamA: { score: hongScore, gamJeoms: hongGamJeom }, // Hong (red)
            teamB: { score: chongScore, gamJeoms: chongGamJeom } // Chong (blue)
        });
    }
}

// ========== GAM-JEOM ==========
function addGamJeom(team) {
    if (matchWinnerDeclared || isMedicalTimeout || roundDeclared) return;
    if (team === 'hong') {
        hongGamJeom++;
        chongScore++; // Opponent (Chong) gets point
    } else if (team === 'chong') {
        chongGamJeom++;
        hongScore++; // Opponent (Hong) gets point
    }
    updateDisplay();
    checkPointGap();
    checkGamJeomLimit();

    if (currentRoomId) {
        db.ref(`rooms/${currentRoomId}`).update({
            teamA: { score: hongScore, gamJeoms: hongGamJeom }, // Hong (red)
            teamB: { score: chongScore, gamJeoms: chongGamJeom } // Chong (blue)
        });
    }
}

function subtractGamJeom(team) {
    if (matchWinnerDeclared || isMedicalTimeout || roundDeclared) return;
    if (team === 'hong') {
        if (hongGamJeom > 0) {
            hongGamJeom--;
            if (chongScore > 0) chongScore--; // Remove point from opponent (Chong)
        }
    } else if (team === 'chong') {
        if (chongGamJeom > 0) {
            chongGamJeom--;
            if (hongScore > 0) hongScore--; // Remove point from opponent (Hong)
        }
    }
    updateDisplay();
    checkPointGap();
    checkGamJeomLimit();

    if (currentRoomId) {
        db.ref(`rooms/${currentRoomId}`).update({
            teamA: { score: hongScore, gamJeoms: hongGamJeom }, // Hong (red)
            teamB: { score: chongScore, gamJeoms: chongGamJeom } // Chong (blue)
        });
    }
}

function checkGamJeomLimit() {
    if (hongGamJeom >= 5 && hongRoundsWon < 2 && chongRoundsWon < 2 && !matchWinnerDeclared && !roundDeclared) {
        declareRoundWinner('chong');
    } else if (chongGamJeom >= 5 && hongRoundsWon < 2 && chongRoundsWon < 2 && !matchWinnerDeclared && !roundDeclared) {
        declareRoundWinner('hong');
    }
}

// ========== POINT GAP ==========
function checkPointGap() {
    if (hongScore - chongScore >= 12 && hongRoundsWon < 2 && chongRoundsWon < 2 && !matchWinnerDeclared && !roundDeclared) {
        declareRoundWinner('hong');
    } else if (chongScore - hongScore >= 12 && hongRoundsWon < 2 && chongRoundsWon < 2 && !matchWinnerDeclared && !roundDeclared) {
        declareRoundWinner('chong');
    }
}

// ========== WINNER ==========
function declareRoundWinner(winner) {
    if (matchWinnerDeclared || isMedicalTimeout || roundDeclared) return;

    roundDeclared = true;
    redBlinkClass = winner === 'hong' ? 'blink-white' : '';
    blueBlinkClass = winner === 'chong' ? 'blink-white' : '';
    if (winner === 'hong') {
        hongRoundsWon++;
    } else if (winner === 'chong') {
        chongRoundsWon++;
    }

    stopTimer();
    updateDisplay();

    if (hongRoundsWon >= 2 || chongRoundsWon >= 2) {
        declareMatchWinner(winner);
    }

    if (currentRoomId) {
        db.ref(`rooms/${currentRoomId}`).update({
            round: currentRound,
            hongRoundsWon: hongRoundsWon,
            chongRoundsWon: chongRoundsWon,
            redBlinkClass: redBlinkClass,
            blueBlinkClass: blueBlinkClass,
            teamA: { score: hongScore, gamJeoms: hongGamJeom }, // Hong (red)
            teamB: { score: chongScore, gamJeoms: chongGamJeom } // Chong (blue)
        });
    }
}

function declareMatchWinner(winner) {
    if (matchWinnerDeclared) return;
    matchWinnerDeclared = true;
    redBlinkClass = winner === 'hong' ? 'blink-yellow' : '';
    blueBlinkClass = winner === 'chong' ? 'blink-yellow' : '';

    stopTimer();
    disableButtons();
    document.querySelector('.reset-scores-button').disabled = false;
    document.querySelector('.new-match-button').disabled = false;
    updateDisplay();

    if (currentRoomId) {
        db.ref(`rooms/${currentRoomId}`).update({
            redBlinkClass: redBlinkClass,
            blueBlinkClass: blueBlinkClass
        });
    }
}

// ========== MEDICAL TIMEOUT ==========
function medicalTimeout(team) {
    if (matchWinnerDeclared || isMedicalTimeout || roundDeclared) return;
    
    isMedicalTimeout = true;
    disableButtons();
    document.getElementById('stopTimeoutButton').style.display = 'block';
    
    if (team === 'red') { // Hong is red
        document.getElementById('redTimeout').textContent = 'HONG Medical Timeout';
    } else { // Chong is blue
        document.getElementById('blueTimeout').textContent = 'CHONG Medical Timeout';
    }
    
    stopTimer();
    timerTime = defaultSettings.medicalTimeout;
    updateTimerDisplay();
    updateDisplay();

    if (currentRoomId) {
        db.ref(`rooms/${currentRoomId}`).update({
            medicalTimeout: { active: true, team: team === 'red' ? 'hong' : 'chong' },
            timer: { minutes: Math.floor(defaultSettings.medicalTimeout / 60), seconds: defaultSettings.medicalTimeout % 60, running: false }
        });
    }
}

function stopMedicalTimeout() {
    if (!isMedicalTimeout) return;
    isMedicalTimeout = false;
    document.getElementById('redTimeout').textContent = '';
    document.getElementById('blueTimeout').textContent = '';
    document.getElementById('stopTimeoutButton').style.display = 'none';
    enableAllButtons();
    timerTime = timerSetTime;
    updateTimerDisplay();
    updateDisplay();

    if (currentRoomId) {
        db.ref(`rooms/${currentRoomId}`).update({
            medicalTimeout: { active: false, team: '' },
            timer: { minutes: Math.floor(timerSetTime / 60), seconds: timerSetTime % 60, running: false }
        });
    }
}

// ========== RESET AND NEW MATCH ==========
function resetScores() {
    if (isMedicalTimeout) return;
    hongScore = 0;
    chongScore = 0;
    hongGamJeom = 0;
    chongGamJeom = 0;
    redBlinkClass = '';
    blueBlinkClass = '';
    roundDeclared = false;

    timerTime = 0;
    timerSetTime = 0;
    updateTimerDisplay();

    if (!matchWinnerDeclared && currentRound < totalRounds) {
        currentRound++;
        timerTime = defaultSettings.breakSeconds;
        timerSetTime = defaultSettings.breakSeconds;
        updateTimerDisplay();
    }

    stopTimer();
    updateDisplay();

    if (currentRoomId) {
        db.ref(`rooms/${currentRoomId}`).update({
            teamA: { score: 0, gamJeoms: 0 }, // Hong (red)
            teamB: { score: 0, gamJeoms: 0 }, // Chong (blue)
            round: currentRound,
            redBlinkClass: '',
            blueBlinkClass: '',
            timer: { minutes: Math.floor(timerSetTime / 60), seconds: timerSetTime % 60, running: false }
        });
    }
}

function newMatch() {
    if (isMedicalTimeout) return;
    hongScore = 0;
    chongScore = 0;
    hongGamJeom = 0;
    chongGamJeom = 0;
    hongRoundsWon = 0;
    chongRoundsWon = 0;
    currentRound = 1;
    matchWinnerDeclared = false;
    timerTime = defaultSettings.roundMinutes * 60;
    timerSetTime = defaultSettings.roundMinutes * 60;
    isTimerRunning = false;
    roundDeclared = false;
    redBlinkClass = '';
    blueBlinkClass = '';
    stopTimer();
    updateCourtNumberDisplay();
    updateDisplay();
    updateTimerDisplay();
    updateTimerInputs();
    enableAllButtons();

    if (currentRoomId) {
        db.ref(`rooms/${currentRoomId}`).update({
            teamA: { score: 0, gamJeoms: 0 }, // Hong (red)
            teamB: { score: 0, gamJeoms: 0 }, // Chong (blue)
            timer: { minutes: defaultSettings.roundMinutes, seconds: 0, running: false },
            round: 1,
            hongRoundsWon: 0,
            chongRoundsWon: 0,
            medicalTimeout: { active: false, team: '' },
            redBlinkClass: '',
            blueBlinkClass: '',
            submissions: {}
        }).catch((error) => {
            console.warn("Failed to update Firebase in newMatch:", error);
        });
    } else {
        console.warn("No currentRoomId set, skipping Firebase update in newMatch");
    }
}

// ========== TIMER ==========
function setTimer() {
    if (isMedicalTimeout || roundDeclared) return;
    let minutes = parseInt(document.getElementById('timerMinutes').value) || 0;
    let seconds = parseInt(document.getElementById('timerSeconds').value) || 0;
    timerSetTime = minutes * 60 + seconds;
    timerTime = timerSetTime;
    updateTimerDisplay();

    if (currentRoomId) {
        db.ref(`rooms/${currentRoomId}/timer`).update({
            minutes: minutes,
            seconds: seconds,
            running: false
        });
    }
}

function updateTimerDisplay() {
    const minutes = Math.floor(timerTime / 60).toString().padStart(2, '0');
    const seconds = (timerTime % 60).toString().padStart(2, '0');
    document.getElementById('timerDisplay').textContent = `${minutes}:${seconds}`;
}

function toggleTimer() {
    if (isMedicalTimeout || matchWinnerDeclared || roundDeclared) return;
    if (isTimerRunning) {
        clearInterval(timerInterval);
        timerInterval = null;
        isTimerRunning = false;
        document.getElementById('playPauseImage').src = 'assets/images/play.svg';
    } else {
        timerInterval = setInterval(() => {
            if (timerTime > 0 && !matchWinnerDeclared && !isMedicalTimeout && !roundDeclared) {
                timerTime--;
                updateTimerDisplay();
                updateDisplay();
            } else {
                clearInterval(timerInterval);
                timerInterval = null;
                isTimerRunning = false;
                document.getElementById('playPauseImage').src = 'assets/images/play.svg';
                if (timerTime <= 0 && !matchWinnerDeclared && !roundDeclared) {
                    if (hongScore > chongScore) {
                        declareRoundWinner('hong');
                    } else if (chongScore > hongScore) {
                        declareRoundWinner('chong');
                    } else {
                        displayMessage("Round tied!");
                        roundDeclared = true;
                        stopTimer();
                        updateDisplay();
                        if (currentRoomId) {
                            db.ref(`rooms/${currentRoomId}`).update({
                                round: currentRound,
                                redBlinkClass: '',
                                blueBlinkClass: ''
                            });
                        }
                    }
                }
            }
        }, 1000);
        isTimerRunning = true;
        document.getElementById('playPauseImage').src = 'assets/images/pause.svg';
    }
    updateDisplay();

    if (currentRoomId) {
        db.ref(`rooms/${currentRoomId}/timer`).update({
            running: isTimerRunning
        });
    }
}

function stopTimer() {
    clearInterval(timerInterval);
    timerInterval = null;
    isTimerRunning = false;
    document.getElementById('playPauseImage').src = 'assets/images/play.svg';
    document.getElementById('timerMinutes').value = defaultSettings.roundMinutes;
    document.getElementById('timerSeconds').value = 0;
    updateDisplay();

    if (currentRoomId) {
        db.ref(`rooms/${currentRoomId}/timer`).update({
            running: false
        });
    }
}

function resetTimer() {
    if (isMedicalTimeout || roundDeclared) return;
    stopTimer();
    timerTime = timerSetTime;
    updateTimerDisplay();
    updateDisplay();

    if (currentRoomId) {
        db.ref(`rooms/${currentRoomId}/timer`).update({
            minutes: Math.floor(timerSetTime / 60),
            seconds: timerSetTime % 60,
            running: false
        });
    }
}

// ========== UTILITY ==========
function disableButtons() {
    const buttons = document.querySelectorAll('button');
    buttons.forEach((button) => {
        if (!button.classList.contains('reset-scores-button') && 
            !button.classList.contains('new-match-button') && 
            !button.classList.contains('create-room-button') &&
            button.id !== 'stopTimeoutButton' &&
            button.id !== 'editScoreboardButton') {
            button.disabled = true;
        }
    });
}

function enableAllButtons() {
    const buttons = document.querySelectorAll('button');
    buttons.forEach((button) => {
        button.disabled = false;
    });
}

function displayMessage(message) {
    const messageDiv = document.createElement('div');
    messageDiv.id = 'winnerMessage';
    messageDiv.textContent = message;
    messageDiv.style.position = 'fixed';
    messageDiv.style.top = '50%';
    messageDiv.style.left = '50%';
    messageDiv.style.transform = 'translate(-50%, -50%)';
    messageDiv.style.fontSize = '32px';
    messageDiv.style.fontWeight = 'bold';
    messageDiv.style.color = '#000';
    messageDiv.style.backgroundColor = '#fff';
    messageDiv.style.padding = '20px';
    messageDiv.style.border = '3px solid #000';
    messageDiv.style.borderRadius = '10px';
    messageDiv.style.textAlign = 'center';
    messageDiv.style.zIndex = '1000';

    document.body.appendChild(messageDiv);

    setTimeout(() => {
        if (messageDiv && messageDiv.parentNode) {
            document.body.removeChild(messageDiv);
        }
    }, 2000);
}

// ========== BINDING ==========
window.onload = function () {
    try {
        // Left Team (Hong, red)
        const leftTeam = document.querySelector('.left-team');
        if (leftTeam) {
            const leftButtons = leftTeam.querySelectorAll('button');
            if (leftButtons[0]) leftButtons[0].onclick = () => openPointSlide('add', 'red'); // Add Points
            if (leftButtons[1]) leftButtons[1].onclick = () => openPointSlide('subtract', 'red'); // Remove Points
            if (leftButtons[2]) leftButtons[2].onclick = () => declareRoundWinner('hong'); // Declare Round Winner
            if (leftButtons[3]) leftButtons[3].onclick = () => declareMatchWinner('hong'); // Declare Match Winner
            if (leftButtons[4]) leftButtons[4].onclick = () => medicalTimeout('red'); // Medical Timeout
        }

        // Right Team (Chong, blue)
        const rightTeam = document.querySelector('.right-team');
        if (rightTeam) {
            const rightButtons = rightTeam.querySelectorAll('button');
            if (rightButtons[0]) rightButtons[0].onclick = () => openPointSlide('add', 'blue'); // Add Points
            if (rightButtons[1]) rightButtons[1].onclick = () => openPointSlide('subtract', 'blue'); // Remove Points
            if (rightButtons[2]) rightButtons[2].onclick = () => declareRoundWinner('chong'); // Declare Round Winner
            if (rightButtons[3]) rightButtons[3].onclick = () => declareMatchWinner('chong'); // Declare Match Winner
            if (rightButtons[4]) rightButtons[4].onclick = () => medicalTimeout('blue'); // Medical Timeout
        }

        // Gam-Jeom Controls
        const gamjeomLeft = document.querySelector('.gamjeom-container-left');
        if (gamjeomLeft) {
            gamjeomLeft.children[1].onclick = () => addGamJeom('hong');
            gamjeomLeft.children[2].onclick = () => subtractGamJeom('hong');
        }
        const gamjeomRight = document.querySelector('.gamjeom-container-right');
        if (gamjeomRight) {
            gamjeomRight.children[1].onclick = () => addGamJeom('chong');
            gamjeomRight.children[2].onclick = () => subtractGamJeom('chong');
        }

        // Timer Controls
        const playPauseButton = document.getElementById('playPauseButton');
        if (playPauseButton) playPauseButton.onclick = toggleTimer;
        const setTimerButton = document.querySelector('.input-container button');
        if (setTimerButton) setTimerButton.onclick = setTimer;
        const resetTimerButton = document.getElementById('resetTimerButton');
        if (resetTimerButton) resetTimerButton.onclick = resetTimer;

        // Edit Scoreboard
        const editScoreboardButton = document.getElementById('editScoreboardButton');
        if (editScoreboardButton) {
            editScoreboardButton.addEventListener('click', openEditScoreboardSlide);
        }

        // Reset and New Match
        const resetScoresButton = document.querySelector('.reset-scores-button');
        if (resetScoresButton) resetScoresButton.onclick = resetScores;
        const newMatchButton = document.querySelector('.new-match-button');
        if (newMatchButton) newMatchButton.onclick = newMatch;

        // Point Slide Buttons
        const pointButtonsContainer = document.querySelector('.point-buttons');
        if (pointButtonsContainer) {
            const pointButtons = pointButtonsContainer.children;
            for (let i = 0; i < pointButtons.length; i++) {
                pointButtons[i].onclick = () => adjustPoints(i + 1);
            }
        }
        const closeSlideButton = document.querySelector('.close-slide');
        if (closeSlideButton) closeSlideButton.onclick = closePointSlide;

        // Stop Timeout
        const stopTimeoutButton = document.getElementById('stopTimeoutButton');
        if (stopTimeoutButton) stopTimeoutButton.onclick = stopMedicalTimeout;

        updateCourtNumberDisplay();
        updateDisplay();
        updateTimerDisplay();
        updateTimerInputs();
    } catch (error) {
        console.error("Error setting up event listeners:", error);
    }
}