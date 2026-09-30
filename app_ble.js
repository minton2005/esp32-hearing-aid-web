// Bluetooth UUIDs (ต้องตรงกับใน main.cpp ของ ESP32)
const SERVICE_UUID         = "4fafc201-1fb5-459e-8fcc-c5c9c331914b";
const CHARACTERISTIC_VOL_L = "beb5483e-36e1-4688-b7f5-ea07361b26a8";
const CHARACTERISTIC_VOL_R = "8b00d662-1b1d-4076-96a9-0b1a0301a2d1";
const CHARACTERISTIC_BAT_L = "09650011-8208-41f2-9596-f94d3809b44a";
const CHARACTERISTIC_NOISE = "c82f232a-5a21-4f11-a0a1-43e5c9a0ef01";
const CHARACTERISTIC_FOCUS = "d13f412b-6b32-5f22-b1b2-54f6d0b1fa02";

// Global Variables State
let bleDevice = null;
let gattServer = null;
let volLeftChar = null;
let volRightChar = null;
let noiseChar = null;
let focusChar = null;
let isWriting = false;

// Dynamic Analytics State
let usageTimer = null;
let usageSecondsToday = parseFloat(localStorage.getItem('usageSecondsToday')) || 0;
let currentFocusMode = 'directional';
let directionalSeconds = parseFloat(localStorage.getItem('directionalSeconds')) || 0;
let omniSeconds = parseFloat(localStorage.getItem('omniSeconds')) || 0;

// สลับหน้า Navigation Page
function switchPage(pageId, btnElement) {
    document.querySelectorAll('.page').forEach(page => page.classList.remove('active'));
    const targetPage = document.getElementById(pageId);
    if (targetPage) targetPage.classList.add('active');
    
    document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
    if (btnElement) btnElement.classList.add('active');
}

// สลับการเชื่อมต่อ Bluetooth
async function toggleBluetooth() {
    if (bleDevice && bleDevice.gatt.connected) {
        disconnectBluetooth();
    } else {
        await connectBluetooth();
    }
}

// เชื่อมต่อ Bluetooth
async function connectBluetooth() {
    try {
        console.log('Searching for BLE devices...');
        bleDevice = await navigator.bluetooth.requestDevice({
            filters: [{ name: 'ESP32_HearingAid' }],
            optionalServices: [SERVICE_UUID]
        });

        bleDevice.addEventListener('gattserverdisconnected', onDisconnected);

        console.log('Connecting to GATT Server...');
        gattServer = await bleDevice.gatt.connect();

        const service = await gattServer.getPrimaryService(SERVICE_UUID);
        volLeftChar = await service.getCharacteristic(CHARACTERISTIC_VOL_L);
        volRightChar = await service.getCharacteristic(CHARACTERISTIC_VOL_R);
        const batLeftChar = await service.getCharacteristic(CHARACTERISTIC_BAT_L);

        // ดึง Characteristic ของ Noise และ Focus Mode
        try {
            noiseChar = await service.getCharacteristic(CHARACTERISTIC_NOISE);
            focusChar = await service.getCharacteristic(CHARACTERISTIC_FOCUS);
        } catch (e) {
            console.warn("Noise/Focus Characteristics not ready on ESP32 yet:", e);
        }

        await batLeftChar.startNotifications();
        batLeftChar.addEventListener('characteristicvaluechanged', (e) => {
            const val = new TextDecoder().decode(e.target.value);
            console.log(`[BLE Received Battery] ${val}%`);
            const batL = document.getElementById('battery-left');
            const batR = document.getElementById('battery-right');
            if (batL) batL.textContent = `🔋 Battery ${val}%`;
            if (batR) batR.textContent = `🔋 Battery ${val}%`;
        });

        updateConnectionUI(true);
        console.log('Bluetooth Connected Successfully!');

    } catch (error) {
        console.error('Bluetooth Connection Failed:', error);
    }
}

// ตัดการเชื่อมต่อ Bluetooth
function disconnectBluetooth() {
    if (bleDevice && bleDevice.gatt.connected) {
        bleDevice.gatt.disconnect();
    }
}

function onDisconnected() {
    console.log('Bluetooth Disconnected!');
    updateConnectionUI(false);
    volLeftChar = null;
    volRightChar = null;
    noiseChar = null;
    focusChar = null;
}

// อัปเดต UI และสถิติ
function updateConnectionUI(isConnected) {
    const badges = [document.getElementById('badge-status-left'), document.getElementById('badge-status-right')];
    badges.forEach(b => {
        if (b) {
            b.textContent = isConnected ? 'Connected' : 'Disconnected';
            if (isConnected) b.classList.add('connected');
            else b.classList.remove('connected');
        }
    });

    if (!isConnected) {
        const batL = document.getElementById('battery-left');
        const batR = document.getElementById('battery-right');
        if (batL) batL.textContent = `🔋 Battery --%`;
        if (batR) batR.textContent = `🔋 Battery --%`;
        stopAnalyticsTracking();
    } else {
        startAnalyticsTracking();
    }

    const statusText = document.getElementById('ble-status-text');
    if (statusText) statusText.textContent = isConnected ? 'Bluetooth Connected' : 'Bluetooth Disconnected';

    const shortcutText = document.getElementById('connect-shortcut-text');
    if (shortcutText) shortcutText.textContent = isConnected ? 'Disconnect Processor' : 'Connect my Processor';

    const mainConnectBtn = document.getElementById('btn-main-connect');
    if (mainConnectBtn) {
        mainConnectBtn.textContent = isConnected ? 'Disconnect Bluetooth' : 'Connect via Bluetooth';
        mainConnectBtn.style.backgroundColor = isConnected ? '#ef4444' : '#2563eb';
    }
}

// Analytics Tracking System
function startAnalyticsTracking() {
    if (usageTimer) clearInterval(usageTimer);

    usageTimer = setInterval(() => {
        usageSecondsToday += 1;
        localStorage.setItem('usageSecondsToday', usageSecondsToday);
        const hoursToday = (usageSecondsToday / 3600).toFixed(1);
        const usageElem = document.getElementById('metric-usage-time');
        if (usageElem) usageElem.textContent = hoursToday;

        if (currentFocusMode === 'directional') directionalSeconds += 1;
        else omniSeconds += 1;

        localStorage.setItem('directionalSeconds', directionalSeconds);
        localStorage.setItem('omniSeconds', omniSeconds);

        updateFocusModeUsageUI();
    }, 1000);
}

function stopAnalyticsTracking() {
    if (usageTimer) {
        clearInterval(usageTimer);
        usageTimer = null;
    }
}

function updateFocusModeUsageUI() {
    const totalModeSeconds = directionalSeconds + omniSeconds;
    if (totalModeSeconds === 0) return;

    const dirPercent = Math.round((directionalSeconds / totalModeSeconds) * 100);
    const omniPercent = 100 - dirPercent;

    const dirSeg = document.querySelector('.dir-segment');
    const omniSeg = document.querySelector('.omni-segment');
    if (dirSeg) dirSeg.style.width = `${dirPercent}%`;
    if (omniSeg) omniSeg.style.width = `${omniPercent}%`;

    const labels = document.querySelectorAll('.progress-labels span');
    if (labels.length >= 2) {
        labels[0].innerHTML = `<strong style="color: #2563eb;">■</strong> Directional (${dirPercent}%)`;
        labels[1].innerHTML = `<strong style="color: #64748b;">■</strong> 360° Omnidirectional (${omniPercent}%)`;
    }
}

// ฟังก์ชันส่งข้อมูล BLE กลาง
async function sendBLEData(characteristic, value) {
    if (!characteristic || isWriting) return;
    try {
        isWriting = true;
        await characteristic.writeValue(new TextEncoder().encode(value.toString()));
        console.log(`[BLE Sent to ESP32] Value: ${value}`);
    } catch (err) {
        console.warn('BLE Write Failed or Busy:', err);
    } finally {
        isWriting = false;
    }
}

// Focus Mode Control
function setFocusMode(mode) {
    currentFocusMode = mode;
    console.log(`[Focus Mode] Switched to: ${mode}`);
    const btnDir = document.getElementById('btn-directional');
    const btn360 = document.getElementById('btn-360');

    if (mode === 'directional') {
        btnDir?.classList.add('active');
        btn360?.classList.remove('active');
    } else {
        btn360?.classList.add('active');
        btnDir?.classList.remove('active');
    }
    sendBLEData(focusChar, mode);
}

// Training Mode Control
function switchTrainingMode(mode) {
    const btnListen = document.getElementById('btn-type-listen');
    const btnSpeak = document.getElementById('btn-type-speak');
    const trainingList = document.querySelector('.training-list');

    if (mode === 'speak') {
        btnSpeak?.classList.add('active');
        btnListen?.classList.remove('active');
        if (trainingList) {
            trainingList.innerHTML = `
                <div class="card lesson-card">
                    <div class="lesson-header">
                        <div>
                            <h3>Vowel Sound Pronunciation</h3>
                            <p>Practice speaking clear vowel sounds (A, E, I, O, U).</p>
                        </div>
                        <div class="rating-stars">⭐⭐⭐</div>
                    </div>
                    <div class="lesson-footer">
                        <button class="btn-primary" onclick="startSpeechExercise('Vowels')">Start Speaking</button>
                    </div>
                </div>
            `;
        }
    } else {
        btnListen?.classList.add('active');
        btnSpeak?.classList.remove('active');
        if (trainingList) {
            trainingList.innerHTML = `
                <div class="card lesson-card">
                    <div class="lesson-header">
                        <div>
                            <h3>Listening in Restaurant Noise</h3>
                            <p>Practice separating speech from ambient background noise.</p>
                        </div>
                        <div class="rating-stars">⭐⭐⭐</div>
                    </div>
                    <div class="lesson-footer">
                        <button class="btn-primary" onclick="startAudioExercise('Restaurant Words', 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-1.mp3')">Start Practice</button>
                    </div>
                </div>
            `;
        }
    }
}

function startAudioExercise(title, audioUrl) {
    const audioModal = document.getElementById('audio-modal');
    const exerciseTitle = document.getElementById('exercise-title');
    const player = document.getElementById('practice-audio-player');
    const feedback = document.getElementById('quiz-feedback');

    if (exerciseTitle) exerciseTitle.textContent = title;
    if (player) {
        player.src = audioUrl;
        player.play();
    }
    if (feedback) feedback.textContent = '';
    if (audioModal) audioModal.classList.add('active');
}

function startSpeechExercise(title) {
    alert(`Starting Speaking Practice for: ${title}`);
}

function checkAnswer(isCorrect) {
    const feedback = document.getElementById('quiz-feedback');
    if (feedback) {
        feedback.textContent = isCorrect ? "🎉 Correct! Great listening!" : "❌ Try again! Listen carefully.";
        feedback.style.color = isCorrect ? "#16a34a" : "#dc2626";
    }
}

// DOM Initializer
document.addEventListener('DOMContentLoaded', () => {
    const usageElem = document.getElementById('metric-usage-time');
    if (usageElem) usageElem.textContent = (usageSecondsToday / 3600).toFixed(1);
    updateFocusModeUsageUI();

    // 1. Left Ear Volume Slider
    document.getElementById('slider-left')?.addEventListener('input', (e) => {
        const val = e.target.value;
        const valElem = document.getElementById('val-left');
        if (valElem) valElem.textContent = `${val}%`;
        console.log(`[Volume Left] Adjusted to: ${val}%`);
        sendBLEData(volLeftChar, val);
    });

    // 2. Right Ear Volume Slider
    document.getElementById('slider-right')?.addEventListener('input', (e) => {
        const val = e.target.value;
        const valElem = document.getElementById('val-right');
        if (valElem) valElem.textContent = `${val}%`;
        console.log(`[Volume Right] Adjusted to: ${val}%`);
        sendBLEData(volRightChar, val);
    });

    // 3. Noise Reduction Slider
    const noiseSlider = document.getElementById('slider-noise');
    const noiseValLabel = document.getElementById('val-noise');
    const noiseLevels = ["Low", "Medium", "High"];

    noiseSlider?.addEventListener('input', (e) => {
        const levelIndex = parseInt(e.target.value);
        const levelText = noiseLevels[levelIndex] || "Medium";
        if (noiseValLabel) noiseValLabel.textContent = levelText;
        console.log(`[Noise Reduction] Set to: ${levelText} (Level ${levelIndex})`);
        sendBLEData(noiseChar, levelIndex.toString());
    });

    const closeAudioBtn = document.getElementById('close-audio-modal-btn');
    closeAudioBtn?.addEventListener('click', () => {
        const player = document.getElementById('practice-audio-player');
        if (player) player.pause();
        document.getElementById('audio-modal')?.classList.remove('active');
    });

    const profileBtn = document.getElementById('user-profile-btn');
    const accountModal = document.getElementById('account-modal');
    profileBtn?.addEventListener('click', () => accountModal?.classList.add('active'));
    document.getElementById('close-modal-btn')?.addEventListener('click', () => accountModal?.classList.remove('active'));
    document.getElementById('cancel-modal-btn')?.addEventListener('click', () => accountModal?.classList.remove('active'));

    document.getElementById('save-modal-btn')?.addEventListener('click', () => {
        const newUserName = document.getElementById('input-username').value;
        const newDeviceName = document.getElementById('input-devicename').value;
        if (newUserName) document.getElementById('display-user-name').textContent = `Hello, ${newUserName}!`;
        if (newDeviceName) document.querySelectorAll('.device-title').forEach(el => el.textContent = newDeviceName);
        accountModal?.classList.remove('active');
    });

    // สลับเปิด/ปิด Sidebar บนมือถือ
    const menuBtn = document.getElementById('btn-toggle-menu');
    const sidebar = document.querySelector('.sidebar');

    menuBtn?.addEventListener('click', () => {
        sidebar?.classList.toggle('open');
    });

    // ปิด Sidebar อัตโนมัติเมื่อกดเลือกเมนู
    document.querySelectorAll('.nav-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            if (window.innerWidth <= 768) {
                sidebar?.classList.remove('open');
            }
        });
        // --- Theme Manager Logic ---
    const themeSelect = document.getElementById('theme-select');

    function applyTheme(theme) {
        if (theme === 'system') {
            const isSystemDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
            document.documentElement.setAttribute('data-theme', isSystemDark ? 'dark' : 'light');
        } else {
            document.documentElement.setAttribute('data-theme', theme);
        }
    }

    // โหลดธีมที่เคยบันทึกไว้
    const savedTheme = localStorage.getItem('user-theme') || 'system';
    if (themeSelect) {
        themeSelect.value = savedTheme;
        applyTheme(savedTheme);

        themeSelect.addEventListener('change', (e) => {
            const selected = e.target.value;
            localStorage.setItem('user-theme', selected);
            applyTheme(selected);
        });
    }
    });
});