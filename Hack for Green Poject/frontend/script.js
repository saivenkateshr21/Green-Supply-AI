/* ═══════════════════════════════════════════════════════════════
   GreenSupply AI — Frontend Controller
   WebSocket · Charts · Maps · Navigation · AI Assistant
   ═══════════════════════════════════════════════════════════════ */

// ── State ────────────────────────────────────────────────────
let ws = null;
let reconnectTimer = null;
let truckData = {};
let alertsList = [];
let selectedTruckId = null;
let dashboardMap = null;
let trackingMap = null;
let mapMarkers = {};
let trackingMarkers = {};
let charts = {};
let chartData = { eta: [], speed: [], risk: [] };
let totalAlertCount = 0;
let settings = {
    wsUrl: 'ws://localhost:8000/ws',
    predictiveRerouting: true,
    autonomousAlerts: true,
    fuelOptimization: false,
};

// ── Initialize ───────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
    // Auth guard: wait for Firebase to resolve auth state
    initAuthGuard(async (user) => {
        // User is authenticated — show dashboard
        document.getElementById('auth-loader').style.display = 'none';
        const appLayout = document.querySelector('.app-layout');
        appLayout.style.display = '';

        // Display user info in sidebar
        updateUserDisplay(user);

        // Initialize all modules
        initNavigation();
        initMaps();
        initCharts();
        connectWebSocket();
        initAIInput();
        initSearch();
        initFullscreen();

        // Load saved settings from Firestore
        await loadSettingsFromDB();

        // Load chat history from Firestore
        await loadChatFromDB();

        // Load team members in settings page
        loadTeamMembersUI();

        addSystemLog('success', 'Frontend initialized');
        addSystemLog('info', 'Connecting to streaming engine...');
        addSystemLog('success', `Authenticated as ${user.email}`);
    });
});

// ── User Display ─────────────────────────────────────────────
function updateUserDisplay(user) {
    // Try to get user profile from Firestore
    if (typeof db !== 'undefined') {
        db.collection('users').doc(user.uid).get().then(doc => {
            if (doc.exists) {
                const data = doc.data();
                document.querySelector('.user-avatar').textContent = data.initials || '--';
                document.querySelector('.user-name').textContent = data.displayName || user.email;
                document.querySelector('.user-role').textContent = data.role || 'Fleet Manager';
            } else {
                const name = user.displayName || user.email.split('@')[0];
                const initials = name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
                document.querySelector('.user-avatar').textContent = initials;
                document.querySelector('.user-name').textContent = name;
            }
        }).catch(() => {
            document.querySelector('.user-name').textContent = user.email;
        });
    }
}

// ── Firestore Settings ───────────────────────────────────────
async function loadSettingsFromDB() {
    if (typeof loadUserSettings === 'function') {
        const saved = await loadUserSettings();
        if (saved) {
            if (saved.wsUrl) settings.wsUrl = saved.wsUrl;
            if (saved.predictiveRerouting !== undefined) settings.predictiveRerouting = saved.predictiveRerouting;
            if (saved.autonomousAlerts !== undefined) settings.autonomousAlerts = saved.autonomousAlerts;
            if (saved.fuelOptimization !== undefined) settings.fuelOptimization = saved.fuelOptimization;

            // Apply to UI
            const wsInput = document.getElementById('setting-ws-url');
            if (wsInput) wsInput.value = settings.wsUrl;

            // Apply toggle states
            document.querySelectorAll('.toggle-switch').forEach(el => {
                const key = el.dataset.setting;
                const settingKey = key.replace(/-([a-z])/g, (_, c) => c.toUpperCase());
                if (settings[settingKey] !== undefined) {
                    el.classList.toggle('active', settings[settingKey]);
                }
            });

            addSystemLog('info', 'Settings loaded from cloud');
        }
    }
}

// ── Firestore Chat History ───────────────────────────────────
async function loadChatFromDB() {
    if (typeof loadChatHistory === 'function') {
        const history = await loadChatHistory();
        if (history.length > 0) {
            const container = document.getElementById('ai-chat-messages');
            // Keep the welcome message, append history
            history.forEach(msg => {
                const time = msg.timestamp ? new Date(msg.timestamp.seconds * 1000).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }) : '--';
                let html = msg.content
                    .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
                    .replace(/\n/g, '<br>')
                    .replace(/• /g, '&bull; ');

                const msgDiv = document.createElement('div');
                msgDiv.className = `chat-message ${msg.role}`;
                msgDiv.innerHTML = `
                    <div class="chat-bubble"><p>${html}</p></div>
                    <div class="chat-time">${time}</div>
                `;
                container.appendChild(msgDiv);
            });
            container.scrollTop = container.scrollHeight;
            addSystemLog('info', `Loaded ${history.length} chat messages from history`);
        }
    }
}

// ── Team Members Loading ─────────────────────────────────────
function loadTeamMembersUI() {
    if (typeof getTeamMembers === 'function') {
        getTeamMembers().then(members => {
            const container = document.getElementById('team-members-list');
            if (!container || members.length === 0) return;

            const colors = [
                'linear-gradient(135deg,var(--accent-dim),var(--accent))',
                'linear-gradient(135deg,#3b82f6,#06b6d4)',
                'linear-gradient(135deg,#a855f7,#ec4899)',
                'linear-gradient(135deg,#f97316,#eab308)',
                'linear-gradient(135deg,#06b6d4,#22c55e)',
            ];

            container.innerHTML = members.map((m, i) => `
                <div class="permission-item">
                    <div class="permission-user">
                        <div class="permission-avatar" style="background:${colors[i % colors.length]}">${m.initials || '--'}</div>
                        <span class="permission-name">${m.displayName || m.email || 'Unknown'}</span>
                    </div>
                    <span class="permission-role">${m.role || 'Team Member'}</span>
                </div>
            `).join('');
        }).catch(() => { });
    }
}

// ── Navigation ───────────────────────────────────────────────
function initNavigation() {
    const navItems = document.querySelectorAll('.nav-item');
    navItems.forEach(item => {
        item.addEventListener('click', () => {
            const page = item.dataset.page;
            switchPage(page);
        });
    });
}

function switchPage(pageId) {
    // Update nav
    document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
    const navBtn = document.querySelector(`.nav-item[data-page="${pageId}"]`);
    if (navBtn) navBtn.classList.add('active');

    // Update pages
    document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
    const page = document.getElementById(`page-${pageId}`);
    if (page) page.classList.add('active');

    // Update title
    const titles = {
        'dashboard': 'Dashboard',
        'tracking': 'Live Tracking',
        'alerts': 'Alerts',
        'analytics': 'Analytics',
        'ai-assistant': 'AI Assistant',
        'settings': 'Settings',
    };
    document.getElementById('page-title').textContent = titles[pageId] || pageId;

    // Resize maps when switching
    if (pageId === 'dashboard' && dashboardMap) {
        setTimeout(() => dashboardMap.invalidateSize(), 100);
    }
    if (pageId === 'tracking' && trackingMap) {
        setTimeout(() => trackingMap.invalidateSize(), 100);
    }
    // Resize charts
    if (pageId === 'analytics') {
        setTimeout(() => {
            Object.values(charts).forEach(c => c.resize && c.resize());
        }, 100);
    }
}

// ── Maps ─────────────────────────────────────────────────────
function initMaps() {
    // Dashboard mini-map
    dashboardMap = L.map('dashboard-map', {
        center: [39.8283, -98.5795],
        zoom: 4,
        zoomControl: false,
        attributionControl: false,
    });
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        maxZoom: 18,
    }).addTo(dashboardMap);

    // Tracking full map
    trackingMap = L.map('tracking-map', {
        center: [39.8283, -98.5795],
        zoom: 4,
        attributionControl: false,
    });
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        maxZoom: 18,
    }).addTo(trackingMap);
}

function getMarkerColor(riskLevel) {
    switch (riskLevel) {
        case 'CRITICAL': return '#ef4444';
        case 'HIGH': return '#f97316';
        case 'MEDIUM': return '#eab308';
        default: return '#3cf91a';
    }
}

function createTruckIcon(color) {
    return L.divIcon({
        html: `<div style="
            width:14px;height:14px;
            background:${color};
            border-radius:50%;
            border:3px solid rgba(255,255,255,0.8);
            box-shadow:0 0 8px ${color}80;
        "></div>`,
        className: 'truck-marker',
        iconSize: [14, 14],
        iconAnchor: [7, 7],
    });
}

function updateMapMarkers(trucks) {
    trucks.forEach(truck => {
        const id = truck.truck_id;
        const lat = truck.latitude;
        const lon = truck.longitude;
        const color = getMarkerColor(truck.risk_level);
        const icon = createTruckIcon(color);

        const popupContent = `
            <div style="font-family:'Space Grotesk',sans-serif;min-width:160px">
                <strong style="color:${color}">${id}</strong><br>
                <span style="color:#94a38f">Speed:</span> ${truck.speed} mph<br>
                <span style="color:#94a38f">Temp:</span> ${truck.temperature}°F<br>
                <span style="color:#94a38f">ETA:</span> ${Math.round(truck.eta_minutes || 0)} min<br>
                <span style="color:#94a38f">Risk:</span> <span style="color:${color}">${truck.risk_level}</span><br>
                <span style="color:#94a38f">Route:</span> ${truck.origin} → ${truck.destination}
            </div>
        `;

        // Dashboard map
        if (mapMarkers[id]) {
            mapMarkers[id].setLatLng([lat, lon]);
            mapMarkers[id].setIcon(icon);
            mapMarkers[id].setPopupContent(popupContent);
        } else {
            mapMarkers[id] = L.marker([lat, lon], { icon })
                .bindPopup(popupContent)
                .addTo(dashboardMap);
        }

        // Tracking map
        if (trackingMarkers[id]) {
            trackingMarkers[id].setLatLng([lat, lon]);
            trackingMarkers[id].setIcon(icon);
            trackingMarkers[id].setPopupContent(popupContent);
        } else {
            trackingMarkers[id] = L.marker([lat, lon], { icon })
                .bindPopup(popupContent)
                .addTo(trackingMap);
            trackingMarkers[id].on('click', () => selectTruck(id));
        }
    });

    document.getElementById('map-truck-label').textContent = `${Object.keys(mapMarkers).length} trucks active`;
}

// ── Charts ───────────────────────────────────────────────────
const chartDefaults = {
    responsive: true,
    maintainAspectRatio: false,
    animation: { duration: 400 },
    plugins: {
        legend: { display: false },
    },
    scales: {
        x: {
            display: true,
            grid: { color: '#1e2e1e' },
            ticks: { color: '#5a6b55', maxTicksLimit: 8, font: { family: 'Space Grotesk', size: 10 } },
        },
        y: {
            display: true,
            grid: { color: '#1e2e1e' },
            ticks: { color: '#5a6b55', font: { family: 'Space Grotesk', size: 10 } },
        },
    },
};

function initCharts() {
    // Dashboard ETA chart
    charts.eta = new Chart(document.getElementById('chart-eta'), {
        type: 'line',
        data: {
            labels: [],
            datasets: [{
                label: 'Avg ETA (min)',
                data: [],
                borderColor: '#3cf91a',
                backgroundColor: 'rgba(60, 249, 26, 0.1)',
                borderWidth: 2,
                fill: true,
                tension: 0.4,
                pointRadius: 0,
            }],
        },
        options: { ...chartDefaults },
    });

    // Dashboard speed chart
    charts.speed = new Chart(document.getElementById('chart-speed'), {
        type: 'line',
        data: {
            labels: [],
            datasets: [{
                label: 'Fleet Speed (mph)',
                data: [],
                borderColor: '#3b82f6',
                backgroundColor: 'rgba(59, 130, 246, 0.1)',
                borderWidth: 2,
                fill: true,
                tension: 0.4,
                pointRadius: 0,
            }],
        },
        options: { ...chartDefaults },
    });

    // Analytics — Full ETA chart
    charts.etaFull = new Chart(document.getElementById('chart-eta-full'), {
        type: 'line',
        data: {
            labels: [],
            datasets: [{
                label: 'Avg ETA (min)',
                data: [],
                borderColor: '#3cf91a',
                backgroundColor: 'rgba(60, 249, 26, 0.08)',
                borderWidth: 2,
                fill: true,
                tension: 0.4,
                pointRadius: 2,
                pointBackgroundColor: '#3cf91a',
            }],
        },
        options: { ...chartDefaults },
    });

    // Analytics — Risk trend
    charts.riskTrend = new Chart(document.getElementById('chart-risk-trend'), {
        type: 'line',
        data: {
            labels: [],
            datasets: [{
                label: 'Risk Score',
                data: [],
                borderColor: '#ef4444',
                backgroundColor: 'rgba(239, 68, 68, 0.08)',
                borderWidth: 2,
                fill: true,
                tension: 0.4,
                pointRadius: 0,
            }],
        },
        options: {
            ...chartDefaults,
            scales: {
                ...chartDefaults.scales,
                y: { ...chartDefaults.scales.y, min: 0, max: 100 },
            },
        },
    });

    // Analytics — Speed trend
    charts.speedTrend = new Chart(document.getElementById('chart-speed-trend'), {
        type: 'line',
        data: {
            labels: [],
            datasets: [{
                label: 'Avg Speed (mph)',
                data: [],
                borderColor: '#06b6d4',
                backgroundColor: 'rgba(6, 182, 212, 0.08)',
                borderWidth: 2,
                fill: true,
                tension: 0.4,
                pointRadius: 0,
            }],
        },
        options: { ...chartDefaults },
    });

    // Analytics — Temp compliance (doughnut)
    charts.tempCompliance = new Chart(document.getElementById('chart-temp-compliance'), {
        type: 'doughnut',
        data: {
            labels: ['Compliant', 'Warning', 'Critical'],
            datasets: [{
                data: [80, 15, 5],
                backgroundColor: ['#3cf91a', '#eab308', '#ef4444'],
                borderWidth: 0,
                hoverOffset: 8,
            }],
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    position: 'bottom',
                    labels: {
                        color: '#94a38f',
                        font: { family: 'Space Grotesk', size: 11 },
                        padding: 16,
                    },
                },
            },
            cutout: '65%',
        },
    });
}

function updateCharts(data) {
    const timeLabel = new Date().toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' });

    // Calculate averages from truck data
    const trucks = Object.values(truckData);
    const avgEta = trucks.length ? trucks.reduce((s, t) => s + (t.eta_minutes || 0), 0) / trucks.length : 0;
    const avgSpeed = data.fleet_stats ? data.fleet_stats.avg_fleet_speed : 0;
    const riskScore = data.fleet_risk ? data.fleet_risk.overall_score : 0;

    // Push data
    chartData.eta.push({ t: timeLabel, v: Math.round(avgEta) });
    chartData.speed.push({ t: timeLabel, v: avgSpeed });
    chartData.risk.push({ t: timeLabel, v: riskScore });

    // Limit to 30 points
    if (chartData.eta.length > 30) chartData.eta.shift();
    if (chartData.speed.length > 30) chartData.speed.shift();
    if (chartData.risk.length > 30) chartData.risk.shift();

    const etaLabels = chartData.eta.map(d => d.t);
    const etaValues = chartData.eta.map(d => d.v);
    const speedLabels = chartData.speed.map(d => d.t);
    const speedValues = chartData.speed.map(d => d.v);
    const riskLabels = chartData.risk.map(d => d.t);
    const riskValues = chartData.risk.map(d => d.v);

    // Dashboard charts
    charts.eta.data.labels = etaLabels;
    charts.eta.data.datasets[0].data = etaValues;
    charts.eta.update('none');

    charts.speed.data.labels = speedLabels;
    charts.speed.data.datasets[0].data = speedValues;
    charts.speed.update('none');

    // Analytics charts
    charts.etaFull.data.labels = etaLabels;
    charts.etaFull.data.datasets[0].data = etaValues;
    charts.etaFull.update('none');

    charts.riskTrend.data.labels = riskLabels;
    charts.riskTrend.data.datasets[0].data = riskValues;
    charts.riskTrend.update('none');

    charts.speedTrend.data.labels = speedLabels;
    charts.speedTrend.data.datasets[0].data = speedValues;
    charts.speedTrend.update('none');

    // Update temp compliance
    const compliant = trucks.filter(t => t.temperature >= 28 && t.temperature <= 38).length;
    const warning = trucks.filter(t => (t.temperature < 28 && t.temperature >= 25) || (t.temperature > 38 && t.temperature <= 42)).length;
    const critical = trucks.filter(t => t.temperature < 25 || t.temperature > 42).length;
    charts.tempCompliance.data.datasets[0].data = [compliant || 1, warning, critical];
    charts.tempCompliance.update('none');
}

// ── WebSocket ────────────────────────────────────────────────
function connectWebSocket() {
    const url = settings.wsUrl;
    ws = new WebSocket(url);

    ws.onopen = () => {
        console.log('[WS] Connected');
        setConnectionStatus(true);
        addSystemLog('success', 'WebSocket connected to streaming engine');
        if (reconnectTimer) {
            clearInterval(reconnectTimer);
            reconnectTimer = null;
        }
    };

    ws.onmessage = (event) => {
        try {
            const data = JSON.parse(event.data);
            handleMessage(data);
        } catch (e) {
            console.error('[WS] Parse error:', e);
        }
    };

    ws.onclose = () => {
        console.log('[WS] Disconnected');
        setConnectionStatus(false);
        addSystemLog('warn', 'WebSocket disconnected. Reconnecting...');
        scheduleReconnect();
    };

    ws.onerror = (err) => {
        console.error('[WS] Error:', err);
        setConnectionStatus(false);
    };
}

function scheduleReconnect() {
    if (!reconnectTimer) {
        reconnectTimer = setInterval(() => {
            console.log('[WS] Attempting reconnect...');
            connectWebSocket();
        }, 3000);
    }
}

function setConnectionStatus(connected) {
    const el = document.getElementById('ws-status');
    const text = document.getElementById('ws-status-text');
    if (connected) {
        el.className = 'connection-status connected';
        text.textContent = 'Connected';
    } else {
        el.className = 'connection-status disconnected';
        text.textContent = 'Disconnected';
    }
}

function handleMessage(data) {
    switch (data.type) {
        case 'initial_state':
            handleInitialState(data);
            break;
        case 'stream_update':
            handleStreamUpdate(data);
            break;
        case 'ai_response':
            handleAIResponse(data);
            break;
        case 'pong':
            break;
    }
}

function handleInitialState(data) {
    addSystemLog('info', `Initial state: ${data.trucks.length} trucks loaded`);

    // Populate truck data
    data.trucks.forEach(t => { truckData[t.truck_id] = t; });
    alertsList = data.alerts || [];

    // Update UI
    updateKPIs(data.kpi);
    updateMapMarkers(data.trucks);
    updateFleetList();
    updateDashboardAlerts();
    updateAlertsPage();
    updateRiskGauge(data.fleet_risk);
    updateSpeedDisplay(data.fleet_stats);
    updateAnalyticsStats(data);

    // Load history into charts
    if (data.eta_history) {
        data.eta_history.forEach(h => {
            const t = new Date(h.timestamp).toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' });
            chartData.eta.push({ t, v: Math.round(h.avg_eta) });
        });
    }
    if (data.speed_history) {
        data.speed_history.forEach(h => {
            const t = new Date(h.timestamp).toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' });
            chartData.speed.push({ t, v: h.avg_speed });
        });
    }
    if (data.risk_history) {
        data.risk_history.forEach(h => {
            const t = new Date(h.timestamp).toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' });
            chartData.risk.push({ t, v: h.risk_score });
        });
    }

    updateCharts(data);
}

function handleStreamUpdate(data) {
    // Update truck data
    data.trucks.forEach(t => { truckData[t.truck_id] = t; });

    // Add new alerts
    if (data.alerts && data.alerts.length > 0) {
        alertsList.push(...data.alerts);
        if (alertsList.length > 200) alertsList = alertsList.slice(-200);
        totalAlertCount += data.alerts.length;
        updateDashboardAlerts();
        updateAlertsPage();
        data.alerts.forEach(a => {
            addSystemLog(a.severity === 'critical' ? 'error' : a.severity === 'warning' ? 'warn' : 'info',
                `[${a.truck_id}] ${a.title}`);
        });
    }

    // Update KPIs with animation
    updateKPIs(data.kpi);
    updateMapMarkers(data.trucks);
    updateFleetList();
    updateRiskGauge(data.fleet_risk);
    updateSpeedDisplay(data.fleet_stats);
    updateCharts(data);
    updateAnalyticsStats(data);

    // Update selected truck detail
    if (selectedTruckId && truckData[selectedTruckId]) {
        updateTruckDetail(truckData[selectedTruckId]);
    }

    // Update alert badge
    document.getElementById('alert-count-badge').textContent = totalAlertCount;
}

// ── KPI Updates ──────────────────────────────────────────────
function updateKPIs(kpi) {
    if (!kpi) return;
    animateValue('kpi-trucks', kpi.active_trucks);
    animateValue('kpi-ontime', kpi.on_time_pct);
    animateValue('kpi-delayed', kpi.delayed);
    animateValue('kpi-highrisk', kpi.high_risk);
}

function animateValue(elementId, newValue) {
    const el = document.getElementById(elementId);
    if (!el) return;
    const current = parseInt(el.textContent) || 0;
    if (current === newValue) return;

    const diff = newValue - current;
    const steps = 15;
    const stepVal = diff / steps;
    let step = 0;

    const interval = setInterval(() => {
        step++;
        const val = Math.round(current + stepVal * step);
        el.textContent = val;
        if (step >= steps) {
            el.textContent = newValue;
            clearInterval(interval);
        }
    }, 30);
}

// ── Risk Gauge ───────────────────────────────────────────────
function updateRiskGauge(risk) {
    if (!risk) return;
    const score = Math.round(risk.overall_score);
    const level = risk.overall_level;

    document.getElementById('risk-score-value').textContent = score;
    document.getElementById('risk-level-text').textContent = `Overall Risk Level: ${level}`;

    const badge = document.getElementById('risk-badge');
    badge.textContent = level;
    badge.className = 'card-badge ' + (
        level === 'LOW' ? 'badge-low' :
            level === 'MEDIUM' ? 'badge-medium' :
                level === 'HIGH' ? 'badge-high' : 'badge-critical'
    );

    const circle = document.getElementById('risk-circle');
    const color = level === 'LOW' ? '#3cf91a' : level === 'MEDIUM' ? '#eab308' : level === 'HIGH' ? '#f97316' : '#ef4444';
    circle.style.borderColor = color;
    document.getElementById('risk-score-value').style.color = color;
}

// ── Speed Display ────────────────────────────────────────────
function updateSpeedDisplay(stats) {
    if (!stats) return;
    document.getElementById('speed-urban').innerHTML = `${Math.round(stats.urban_avg_speed || 0)}<span class="speed-unit">mph</span>`;
    document.getElementById('speed-interstate').innerHTML = `${Math.round(stats.interstate_avg_speed || 0)}<span class="speed-unit">mph</span>`;
}

// ── Dashboard Alerts ─────────────────────────────────────────
function updateDashboardAlerts() {
    const container = document.getElementById('dashboard-alerts');
    const recent = alertsList.slice(-8).reverse();

    if (recent.length === 0) return;

    container.innerHTML = recent.map(alert => `
        <div class="alert-item">
            <div class="alert-severity ${alert.severity}"></div>
            <div class="alert-content">
                <div class="alert-title">
                    ${alert.title}
                    <span class="card-badge badge-${alert.severity === 'critical' ? 'critical' : alert.severity === 'warning' ? 'medium' : 'low'}">
                        ${alert.severity.toUpperCase()}
                    </span>
                </div>
                <div class="alert-message">${alert.message}</div>
                <div class="alert-time">${timeAgo(alert.timestamp)}</div>
            </div>
        </div>
    `).join('');

    document.getElementById('alerts-count-label').textContent = `${recent.length} new`;
}

// ── Alerts Page ──────────────────────────────────────────────
function updateAlertsPage() {
    const container = document.getElementById('alerts-full-list');
    const alerts = alertsList.slice(-20).reverse();

    if (alerts.length === 0) return;

    document.getElementById('alerts-vehicle-count').textContent = Object.keys(truckData).length;

    container.innerHTML = alerts.map(alert => `
        <div class="alert-card-full ${alert.severity}">
            <div class="alert-card-header">
                <div class="alert-card-title">
                    <span class="material-symbols-outlined">${alert.severity === 'critical' ? 'error' :
            alert.severity === 'warning' ? 'warning' : 'info'
        }</span>
                    ${alert.title}
                </div>
                <span class="card-badge badge-${alert.severity === 'critical' ? 'critical' : alert.severity === 'warning' ? 'medium' : 'low'}">
                    ${alert.severity.toUpperCase()}
                </span>
            </div>
            <div class="alert-card-body">
                <strong>AI Insight:</strong> ${alert.ai_insight || alert.message}
            </div>
            <div style="margin-top:8px;font-size:0.72rem;color:var(--text-muted)">${timeAgo(alert.timestamp)}</div>
        </div>
    `).join('');
}

// ── Fleet List (Tracking Page) ───────────────────────────────
function updateFleetList() {
    const container = document.getElementById('fleet-list-items');
    if (!container) return;

    const trucks = Object.values(truckData);
    container.innerHTML = trucks.map(t => {
        const statusClass = t.risk_level === 'CRITICAL' ? 'critical' : t.risk_level === 'HIGH' ? 'delayed' : 'on-time';
        const isSelected = t.truck_id === selectedTruckId;
        return `
            <div class="fleet-item ${isSelected ? 'active' : ''}" onclick="selectTruck('${t.truck_id}')">
                <div class="fleet-route">
                    <span class="fleet-status ${statusClass}"></span>
                    ${t.origin} → ${t.destination}
                </div>
                <div class="fleet-truck-id">${t.truck_id} · ${Math.round(t.speed)} mph · ETA ${Math.round(t.eta_minutes || 0)} min</div>
            </div>
        `;
    }).join('');
}

// ── Truck Detail ─────────────────────────────────────────────
function selectTruck(truckId) {
    selectedTruckId = truckId;
    const truck = truckData[truckId];
    if (!truck) return;

    updateTruckDetail(truck);
    updateFleetList();

    // Pan tracking map to truck
    if (trackingMap && truck.latitude && truck.longitude) {
        trackingMap.setView([truck.latitude, truck.longitude], 6, { animate: true });
        if (trackingMarkers[truckId]) trackingMarkers[truckId].openPopup();
    }
}

function updateTruckDetail(truck) {
    document.getElementById('detail-truck-title').innerHTML = `<span class="material-symbols-outlined">local_shipping</span> ${truck.truck_id}`;

    // Metrics
    document.getElementById('detail-speed').textContent = `${Math.round(truck.speed)} mph`;
    document.getElementById('detail-speed-bar').style.width = `${Math.min(100, (truck.speed / 85) * 100)}%`;

    document.getElementById('detail-fuel').textContent = `${Math.round(truck.fuel_level)}%`;
    document.getElementById('detail-fuel-bar').style.width = `${truck.fuel_level}%`;
    updateBarColor('detail-fuel-bar', truck.fuel_level < 20 ? 'red' : truck.fuel_level < 40 ? 'yellow' : 'blue');

    document.getElementById('detail-temp').textContent = `${truck.temperature}°F`;
    document.getElementById('detail-temp-bar').style.width = `${Math.min(100, (truck.temperature / 50) * 100)}%`;
    updateBarColor('detail-temp-bar', truck.temperature > 38 ? 'red' : truck.temperature < 28 ? 'yellow' : 'cyan');

    document.getElementById('detail-engine').textContent = `${Math.round(truck.engine_load)}%`;
    document.getElementById('detail-engine-bar').style.width = `${truck.engine_load}%`;

    // Driver
    const initials = truck.driver ? truck.driver.split(' ').map(n => n[0]).join('') : '--';
    document.getElementById('detail-driver-avatar').textContent = initials;
    document.getElementById('detail-driver-name').textContent = truck.driver || '--';
    document.getElementById('detail-driver-license').textContent = `License: #${truck.driver_license || '--'}`;

    // Route info
    document.getElementById('detail-route').textContent = `${truck.origin} → ${truck.destination}`;
    document.getElementById('detail-remaining').textContent = `${Math.round(truck.remaining_distance_miles || 0)} mi`;
    document.getElementById('detail-eta').textContent = `${Math.round(truck.eta_minutes || 0)} min`;

    const riskEl = document.getElementById('detail-risk');
    riskEl.textContent = truck.risk_level || '--';
    riskEl.style.color = getMarkerColor(truck.risk_level);

    // AI Insight
    document.getElementById('detail-ai-insight').textContent =
        truck.explanation || `${truck.truck_id} is currently en route from ${truck.origin} to ${truck.destination}. Speed: ${Math.round(truck.speed)} mph, ETA: ${Math.round(truck.eta_minutes || 0)} minutes.`;
}

function updateBarColor(barId, color) {
    const bar = document.getElementById(barId);
    bar.className = `progress-fill ${color}`;
}

// ── Analytics Stats ──────────────────────────────────────────
function updateAnalyticsStats(data) {
    const trucks = Object.values(truckData);
    document.getElementById('stat-total-trucks').textContent = trucks.length;
    document.getElementById('stat-ontime-rate').textContent = (data.kpi ? data.kpi.on_time_pct : 0) + '%';
    document.getElementById('stat-avg-speed').textContent = (data.fleet_stats ? Math.round(data.fleet_stats.avg_fleet_speed) : 0) + ' mph';
    document.getElementById('stat-high-risk').textContent = data.fleet_risk ? data.fleet_risk.high_risk_count : 0;
    document.getElementById('stat-total-alerts').textContent = totalAlertCount;
}

// ── AI Assistant ─────────────────────────────────────────────
function initAIInput() {
    const input = document.getElementById('ai-input');
    input.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') sendAIMessage();
    });
}

function sendAIMessage() {
    const input = document.getElementById('ai-input');
    const question = input.value.trim();
    if (!question) return;

    // Add user message
    addChatMessage('user', question);
    input.value = '';

    // Show typing indicator
    showTypingIndicator();

    // Send via WebSocket
    if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: 'ai_question', question }));
    } else {
        // Fallback: use REST API
        fetch('/api/ai/ask', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ question }),
        })
            .then(r => r.json())
            .then(data => handleAIResponse(data))
            .catch(() => {
                removeTypingIndicator();
                addChatMessage('assistant', 'Unable to connect to the AI service. Please ensure the backend is running.');
            });
    }
}

function askSuggestion(btn) {
    const text = typeof btn === 'string' ? btn : btn.textContent;
    document.getElementById('ai-input').value = text;
    sendAIMessage();
}

function handleAIResponse(data) {
    removeTypingIndicator();

    const response = data.response || 'No response received.';
    addChatMessage('assistant', response);

    // Update token usage
    if (data.token_usage !== undefined) {
        document.getElementById('token-used').textContent = `${data.token_usage.toLocaleString()}`;
        const pct = (data.token_usage / (data.max_tokens || 10000)) * 100;
        document.getElementById('token-bar-fill').style.width = `${Math.min(100, pct)}%`;
    }

    // Update badge
    const badge = document.getElementById('ai-source-badge');
    badge.textContent = data.source === 'gemini' ? 'GEMINI' : 'RULE-BASED';
}

function addChatMessage(role, content) {
    const container = document.getElementById('ai-chat-messages');
    const time = new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });

    // Convert markdown-like formatting to HTML
    let html = content
        .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
        .replace(/\n/g, '<br>')
        .replace(/• /g, '&bull; ');

    const msgDiv = document.createElement('div');
    msgDiv.className = `chat-message ${role}`;
    msgDiv.innerHTML = `
        <div class="chat-bubble"><p>${html}</p></div>
        <div class="chat-time">${time}</div>
    `;

    container.appendChild(msgDiv);
    container.scrollTop = container.scrollHeight;

    // Save to Firestore
    if (typeof saveChatMessage === 'function') {
        saveChatMessage(role, content);
    }
}

function showTypingIndicator() {
    const container = document.getElementById('ai-chat-messages');
    const typing = document.createElement('div');
    typing.className = 'chat-message assistant';
    typing.id = 'typing-indicator';
    typing.innerHTML = `
        <div class="chat-bubble">
            <div class="typing-indicator">
                <span></span><span></span><span></span>
            </div>
        </div>
    `;
    container.appendChild(typing);
    container.scrollTop = container.scrollHeight;
}

function removeTypingIndicator() {
    const el = document.getElementById('typing-indicator');
    if (el) el.remove();
}

// ── Settings ─────────────────────────────────────────────────
function toggleSwitch(el) {
    el.classList.toggle('active');
    const setting = el.dataset.setting;
    const isActive = el.classList.contains('active');
    const settingKey = setting.replace(/-([a-z])/g, (_, c) => c.toUpperCase());
    settings[settingKey] = isActive;
    addSystemLog('info', `Setting "${setting}" ${isActive ? 'enabled' : 'disabled'}`);
}

async function saveSettings() {
    const wsUrl = document.getElementById('setting-ws-url').value;
    const geminiKey = document.getElementById('setting-gemini-key').value;
    const interval = document.getElementById('setting-interval').value;

    settings.wsUrl = wsUrl;

    // Save to Firestore
    if (typeof saveUserSettings === 'function') {
        await saveUserSettings(settings);
    }

    addSystemLog('success', 'Settings saved to cloud');

    // Show feedback
    const btn = document.querySelector('.btn-save');
    const originalText = btn.textContent;
    btn.textContent = '✓ Saved!';
    btn.style.background = '#2bc812';
    setTimeout(() => {
        btn.textContent = originalText;
        btn.style.background = '';
    }, 2000);
}

// ── Search ───────────────────────────────────────────────────
function initSearch() {
    const input = document.getElementById('global-search');
    input.addEventListener('input', (e) => {
        const query = e.target.value.toLowerCase();
        if (query.length < 2) return;

        // Search trucks
        const match = Object.values(truckData).find(t =>
            t.truck_id.toLowerCase().includes(query) ||
            t.destination.toLowerCase().includes(query) ||
            t.origin.toLowerCase().includes(query) ||
            t.driver.toLowerCase().includes(query)
        );

        if (match) {
            switchPage('tracking');
            selectTruck(match.truck_id);
        }
    });
}

// ── Fullscreen ───────────────────────────────────────────────
function initFullscreen() {
    document.getElementById('btn-fullscreen').addEventListener('click', () => {
        if (!document.fullscreenElement) {
            document.documentElement.requestFullscreen();
        } else {
            document.exitFullscreen();
        }
    });

    document.getElementById('btn-notifications').addEventListener('click', () => {
        switchPage('alerts');
    });
}

// ── System Logs ──────────────────────────────────────────────
function addSystemLog(level, message) {
    const container = document.getElementById('system-logs');
    if (!container) return;

    const time = new Date().toLocaleTimeString('en-US', { hour12: false });
    const levelClass = level === 'error' ? 'error' : level === 'warn' ? 'warn' : level === 'success' ? 'success' : 'info';

    const entry = document.createElement('div');
    entry.className = 'log-entry';
    entry.innerHTML = `<span class="log-time">${time}</span><span class="log-level ${levelClass}">${level.toUpperCase()}</span>${message}`;

    container.insertBefore(entry, container.firstChild);

    // Limit logs
    while (container.children.length > 50) {
        container.removeChild(container.lastChild);
    }
}

// ── Utilities ────────────────────────────────────────────────
function timeAgo(timestamp) {
    if (!timestamp) return 'Just now';
    const now = new Date();
    const then = new Date(timestamp);
    const diff = Math.floor((now - then) / 1000);

    if (diff < 10) return 'Just now';
    if (diff < 60) return `${diff} seconds ago`;
    if (diff < 3600) return `${Math.floor(diff / 60)} minutes ago`;
    if (diff < 86400) return `${Math.floor(diff / 3600)} hours ago`;
    return `${Math.floor(diff / 86400)} days ago`;
}

// ── Performance Simulation ───────────────────────────────────
setInterval(() => {
    const cpu = 18 + Math.random() * 15;
    const mem = 40 + Math.random() * 20;
    const latency = 30 + Math.random() * 25;
    const throughput = (0.8 + Math.random() * 0.8).toFixed(1);

    document.getElementById('perf-cpu').textContent = Math.round(cpu) + '%';
    document.getElementById('perf-cpu-bar').style.width = cpu + '%';
    document.getElementById('perf-memory').textContent = Math.round(mem) + '%';
    document.getElementById('perf-mem-bar').style.width = mem + '%';
    document.getElementById('perf-latency').textContent = Math.round(latency) + 'ms';
    document.getElementById('perf-throughput').textContent = throughput + 'K';
}, 5000);
