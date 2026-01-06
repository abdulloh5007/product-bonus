// DOM Elements
const video = document.getElementById('video');
const videoContainer = document.getElementById('videoContainer');
const status = document.getElementById('status');
const overlay = document.getElementById('overlay');
const liveIndicator = document.getElementById('liveIndicator');
const controls = document.getElementById('controls');
const fullscreenBtn = document.getElementById('fullscreenBtn');
const playPauseBtn = document.getElementById('playPauseBtn');
const dateInfo = document.getElementById('dateInfo');

// WebSocket connection
const roomId = window.location.pathname.split('/').pop();
const wsProtocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
const wsUrl = `${wsProtocol}//${window.location.host}`;

let ws;
let pc;

// Format date in Uzbek
function formatDate(date) {
    const months = ['yanvar', 'fevral', 'mart', 'aprel', 'may', 'iyun',
        'iyul', 'avgust', 'sentabr', 'oktabr', 'noyabr', 'dekabr'];
    const d = new Date(date);
    const day = d.getDate();
    const month = months[d.getMonth()];
    const year = d.getFullYear();
    const hours = d.getHours().toString().padStart(2, '0');
    const minutes = d.getMinutes().toString().padStart(2, '0');
    return `${day} ${month} ${year}, ${hours}:${minutes}`;
}

// Update current date
dateInfo.textContent = formatDate(new Date());

// Set status text and class
function setStatus(text, className) {
    status.textContent = text;
    status.className = 'status ' + className;
}

// Update play/pause icon based on video state
function updatePlayPauseIcon() {
    if (video.paused) {
        playPauseBtn.innerHTML = '<i class="fas fa-play"></i>';
        playPauseBtn.title = 'Play';
    } else {
        playPauseBtn.innerHTML = '<i class="fas fa-pause"></i>';
        playPauseBtn.title = 'Pause';
    }
}

// Play/Pause toggle
playPauseBtn.addEventListener('click', () => {
    if (video.paused) {
        video.play().catch(err => console.log('Play error:', err));
    } else {
        video.pause();
    }
});

// Listen for video play/pause events
video.addEventListener('play', updatePlayPauseIcon);
video.addEventListener('pause', updatePlayPauseIcon);

// Check if fullscreen
function isFullscreen() {
    return document.fullscreenElement || document.webkitFullscreenElement;
}

// Update fullscreen button icon
function updateFullscreenIcon() {
    if (isFullscreen()) {
        fullscreenBtn.innerHTML = '<i class="fas fa-compress"></i>';
        fullscreenBtn.title = 'Chiqish';
    } else {
        fullscreenBtn.innerHTML = '<i class="fas fa-expand"></i>';
        fullscreenBtn.title = "To'liq ekran";
        // Auto-resume video after exiting fullscreen
        if (video.paused && video.srcObject) {
            video.play().catch(err => console.log('Auto-resume error:', err));
        }
    }
}

// Fullscreen toggle with mobile support
fullscreenBtn.addEventListener('click', () => {
    if (isFullscreen()) {
        if (document.exitFullscreen) {
            document.exitFullscreen();
        } else if (document.webkitExitFullscreen) {
            document.webkitExitFullscreen();
        }
    } else {
        if (videoContainer.requestFullscreen) {
            videoContainer.requestFullscreen();
        } else if (videoContainer.webkitRequestFullscreen) {
            videoContainer.webkitRequestFullscreen();
        } else if (video.webkitEnterFullscreen) {
            // iOS Safari fallback
            video.webkitEnterFullscreen();
        }
    }
});

// Listen for fullscreen changes
document.addEventListener('fullscreenchange', updateFullscreenIcon);
document.addEventListener('webkitfullscreenchange', updateFullscreenIcon);

// WebSocket connection
function connect() {
    ws = new WebSocket(wsUrl);

    ws.onopen = () => {
        setStatus('Ulanmoqda...', 'connecting');
        ws.send(JSON.stringify({ type: 'join-room', roomId }));
    };

    ws.onmessage = async (event) => {
        const message = JSON.parse(event.data);

        switch (message.type) {
            case 'joined-room':
                setStatus('Kutilmoqda...', 'connecting');
                if (message.createdAt) {
                    dateInfo.textContent = formatDate(message.createdAt);
                }
                break;

            case 'offer':
                await handleOffer(message.sdp);
                break;

            case 'ice-candidate':
                if (pc && message.candidate) {
                    await pc.addIceCandidate(new RTCIceCandidate(message.candidate));
                }
                break;

            case 'broadcaster-left':
                setStatus('Tugadi', 'disconnected');
                overlay.classList.remove('hidden');
                liveIndicator.style.display = 'none';
                controls.style.display = 'none';
                break;

            case 'error':
                setStatus(message.message, 'error');
                break;
        }
    };

    ws.onclose = () => {
        setStatus('Uzildi', 'disconnected');
        setTimeout(connect, 3000);
    };

    ws.onerror = () => {
        setStatus('Xato', 'error');
    };
}

// Handle WebRTC offer
async function handleOffer(sdp) {
    pc = new RTCPeerConnection({
        iceServers: [
            { urls: 'stun:stun.l.google.com:19302' },
            { urls: 'stun:stun1.l.google.com:19302' },
        ]
    });

    pc.ontrack = (event) => {
        video.srcObject = event.streams[0];
        setStatus('Ulandi', 'connected');
        overlay.classList.add('hidden');
        liveIndicator.style.display = 'flex';
        controls.style.display = 'flex';
    };

    pc.onicecandidate = (event) => {
        if (event.candidate) {
            ws.send(JSON.stringify({
                type: 'ice-candidate',
                candidate: event.candidate,
            }));
        }
    };

    pc.onconnectionstatechange = () => {
        if (pc.connectionState === 'disconnected' || pc.connectionState === 'failed') {
            setStatus('Uzildi', 'disconnected');
            overlay.classList.remove('hidden');
            liveIndicator.style.display = 'none';
            controls.style.display = 'none';
        }
    };

    await pc.setRemoteDescription(new RTCSessionDescription({ type: 'offer', sdp }));
    const answer = await pc.createAnswer();
    await pc.setLocalDescription(answer);

    ws.send(JSON.stringify({
        type: 'answer',
        sdp: answer.sdp,
    }));
}

// Start connection
connect();
