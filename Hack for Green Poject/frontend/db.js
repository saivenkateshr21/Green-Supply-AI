/* ═══════════════════════════════════════════════════════════════
   GreenSupply AI — Firestore Database Service
   User Settings · Chat History · Alerts · Activity Logs
   ═══════════════════════════════════════════════════════════════ */

// ── Save User Settings ───────────────────────────────────────
async function saveUserSettings(settings) {
    if (!currentUser) return;
    try {
        await db.collection('users').doc(currentUser.uid).update({
            settings: settings,
            updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
        });
        console.log('[DB] Settings saved');
        return true;
    } catch (error) {
        console.error('[DB] Error saving settings:', error);
        return false;
    }
}

// ── Load User Settings ───────────────────────────────────────
async function loadUserSettings() {
    if (!currentUser) return null;
    try {
        const doc = await db.collection('users').doc(currentUser.uid).get();
        if (doc.exists && doc.data().settings) {
            return doc.data().settings;
        }
        return null;
    } catch (error) {
        console.error('[DB] Error loading settings:', error);
        return null;
    }
}

// ── Save Chat Message ────────────────────────────────────────
async function saveChatMessage(role, content) {
    if (!currentUser) return;
    try {
        await db.collection('users').doc(currentUser.uid)
            .collection('chat_history').add({
                role: role,
                content: content,
                timestamp: firebase.firestore.FieldValue.serverTimestamp(),
            });
    } catch (error) {
        console.error('[DB] Error saving chat:', error);
    }
}

// ── Load Chat History ────────────────────────────────────────
async function loadChatHistory() {
    if (!currentUser) return [];
    try {
        const snapshot = await db.collection('users').doc(currentUser.uid)
            .collection('chat_history')
            .orderBy('timestamp', 'asc')
            .limitToLast(50)
            .get();

        return snapshot.docs.map(doc => ({
            id: doc.id,
            ...doc.data(),
        }));
    } catch (error) {
        console.error('[DB] Error loading chat history:', error);
        return [];
    }
}

// ── Clear Chat History ───────────────────────────────────────
async function clearChatHistory() {
    if (!currentUser) return;
    try {
        const snapshot = await db.collection('users').doc(currentUser.uid)
            .collection('chat_history').get();

        const batch = db.batch();
        snapshot.docs.forEach(doc => batch.delete(doc.ref));
        await batch.commit();
        console.log('[DB] Chat history cleared');
    } catch (error) {
        console.error('[DB] Error clearing chat history:', error);
    }
}

// ── Save Alert to Database ───────────────────────────────────
async function saveAlertToDB(alertData) {
    if (!currentUser) return;
    try {
        await db.collection('alerts').add({
            ...alertData,
            userId: currentUser.uid,
            savedAt: firebase.firestore.FieldValue.serverTimestamp(),
        });
    } catch (error) {
        console.error('[DB] Error saving alert:', error);
    }
}

// ── Load Saved Alerts ────────────────────────────────────────
async function loadSavedAlerts(limit = 50) {
    if (!currentUser) return [];
    try {
        const snapshot = await db.collection('alerts')
            .where('userId', '==', currentUser.uid)
            .orderBy('savedAt', 'desc')
            .limit(limit)
            .get();

        return snapshot.docs.map(doc => ({
            id: doc.id,
            ...doc.data(),
        }));
    } catch (error) {
        console.error('[DB] Error loading alerts:', error);
        return [];
    }
}

// ── Save Activity Log ────────────────────────────────────────
async function logActivity(action, details = {}) {
    if (!currentUser) return;
    try {
        await db.collection('users').doc(currentUser.uid)
            .collection('activity_logs').add({
                action: action,
                details: details,
                timestamp: firebase.firestore.FieldValue.serverTimestamp(),
            });
    } catch (error) {
        console.error('[DB] Error logging activity:', error);
    }
}

// ── Update User Profile ──────────────────────────────────────
async function updateUserProfile(updates) {
    if (!currentUser) return;
    try {
        await db.collection('users').doc(currentUser.uid).update({
            ...updates,
            updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
        });
        console.log('[DB] Profile updated');
        return true;
    } catch (error) {
        console.error('[DB] Error updating profile:', error);
        return false;
    }
}

// ── Get All Team Members (for Permissions page) ──────────────
async function getTeamMembers() {
    try {
        const snapshot = await db.collection('users')
            .orderBy('createdAt', 'desc')
            .limit(20)
            .get();

        return snapshot.docs.map(doc => ({
            id: doc.id,
            ...doc.data(),
        }));
    } catch (error) {
        console.error('[DB] Error loading team:', error);
        return [];
    }
}

// ── Real-time Listener for Team Members ──────────────────────
function listenToTeamMembers(callback) {
    return db.collection('users')
        .orderBy('createdAt', 'desc')
        .limit(20)
        .onSnapshot(snapshot => {
            const members = snapshot.docs.map(doc => ({
                id: doc.id,
                ...doc.data(),
            }));
            callback(members);
        }, error => {
            console.error('[DB] Team listener error:', error);
        });
}

// ── Save Fleet Snapshot (periodic) ───────────────────────────
async function saveFleetSnapshot(fleetData) {
    if (!currentUser) return;
    try {
        await db.collection('fleet_snapshots').add({
            userId: currentUser.uid,
            trucks: fleetData.trucks || [],
            riskScore: fleetData.riskScore || 0,
            alertCount: fleetData.alertCount || 0,
            timestamp: firebase.firestore.FieldValue.serverTimestamp(),
        });
    } catch (error) {
        console.error('[DB] Error saving fleet snapshot:', error);
    }
}
