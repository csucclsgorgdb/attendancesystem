/**
 * LOCAL AUTHENTICATION LOGIC - FOOTER VERSION
 */

// 1. I-set ang credentials dito
const ADMIN_EMAIL = "davie@hero.org";
const ADMIN_PASS = "admin123";

// 2. AUTHENTICATION FUNCTION
window.handleLocalAuth = () => {
    const inputEmail = document.getElementById('login-email').value.trim();
    const inputPass = document.getElementById('login-password').value;
    const errorMsg = document.getElementById('login-error');
    const overlay = document.getElementById('login-overlay');
    const logoutBtn = document.getElementById('logout-btn'); // Kunin ang button sa footer

    if (inputEmail === ADMIN_EMAIL && inputPass === ADMIN_PASS) {
        sessionStorage.setItem('isVerified', 'true');
        
        overlay.style.display = 'none';
        
        // --- 🟢 ITO ANG MAGPAPALITAW SA BUTTON ---
        if (logoutBtn) logoutBtn.style.display = 'inline-block';
        
        if (typeof showToast === "function") {
            showToast("✅ Access Granted. Welcome Admin!");
        }
        
        if (typeof initFirebaseListeners === "function") {
            initFirebaseListeners();
        }
    } else {
        errorMsg.innerText = "❌ Invalid Email or Password. Try again.";
        errorMsg.style.display = "block";
        document.getElementById('login-password').value = "";
    }
};

// 3. AUTO-LOGIN CHECK (On Page Load)
document.addEventListener('DOMContentLoaded', () => {
    const overlay = document.getElementById('login-overlay');
    const logoutBtn = document.getElementById('logout-btn'); // Kunin ang button sa footer
    const isVerified = sessionStorage.getItem('isVerified');

    if (isVerified === 'true') {
        if(overlay) overlay.style.display = 'none';
        
        // --- 🟢 IPAKITA ANG BUTTON KUNG VERIFIED NA ---
        if (logoutBtn) logoutBtn.style.display = 'inline-block';
        
        if (typeof initFirebaseListeners === "function") initFirebaseListeners(); 
    } else {
        if(overlay) overlay.style.display = 'flex';
        
        // --- 🔴 SIGURADUHING NAKATAGO KUNG HINDI LOGGED IN ---
        if (logoutBtn) logoutBtn.style.display = 'none';
    }
    
    if (typeof updateCurrentDate === "function") updateCurrentDate();
});

// 4. LOGOUT FUNCTION
window.handleLogout = () => {
    sessionStorage.removeItem('isVerified');
    location.reload(); 
};


/**
 * 📡 OFFLINE PERSISTENCE & AUTO-SYNC LOGIC
 * (Idikit sa pinakababa ng auth.js)
 */

// 1. Function para i-save sa local storage kapag walang internet
// 1. Function para i-save sa local storage kasama ang TIME
window.saveAttendanceOffline = (studentId, status, time) => {
    let pending = JSON.parse(localStorage.getItem('pendingSync')) || [];
    
    // Check kung nandun na yung ID, i-update lang
    const existingIndex = pending.findIndex(item => item.id === studentId);
    
    const record = {
        id: studentId,
        status: status,
        time: time || '--:--', // Isama ang oras mula sa script.js
        timestamp: new Date().toISOString()
    };

    if (existingIndex > -1) {
        pending[existingIndex] = record;
    } else {
        pending.push(record);
    }
    
    localStorage.setItem('pendingSync', JSON.stringify(pending));
    if (typeof updateSyncIndicator === "function") updateSyncIndicator();
    if (typeof showToast === "function") showToast("⚠️ Offline: Time Log Saved");
};

// 2. Updated Sync Logic (Saving as Object)
window.syncOfflineData = async () => {
    if (!navigator.onLine) return;
    
    const pending = JSON.parse(localStorage.getItem('pendingSync'));
    if (!pending || pending.length === 0) {
        if (typeof updateSyncIndicator === "function") updateSyncIndicator();
        return;
    }

    const activeSession = window.currentSession;
    if (!activeSession) return; 

    if (typeof showToast === "function") showToast("🔄 Syncing offline records...");

    for (const item of pending) {
        try {
            // 🚨 FIX: I-save bilang Object para mabasa ng Time Slot column
            await firebase.database().ref(`sessions/${activeSession}/${item.id}`).set({
                status: item.status,
                time: item.time
            });
        } catch (e) { 
            console.error("Sync error for " + item.id, e); 
        }
    }

    localStorage.removeItem('pendingSync');
    if (typeof updateSyncIndicator === "function") updateSyncIndicator();
    if (typeof showToast === "function") showToast("✅ Database Synced!");
    
    if (typeof updateAttendanceTable === "function") updateAttendanceTable();
};



// 3. UI Indicator (Para malaman mo kung may "baon" pang data ang Xpad)
function updateSyncIndicator() {
    const pending = JSON.parse(localStorage.getItem('pendingSync')) || [];
    let indicator = document.getElementById('sync-status');
    
    if (!indicator) {
        // Gawa tayo ng maliit na indicator sa tabi ng Logout button
        const logoutBtn = document.getElementById('logout-btn');
        if (logoutBtn) {
            indicator = document.createElement('span');
            indicator.id = 'sync-status';
            indicator.style.cssText = "font-size: 10px; margin-right: 10px; font-weight: bold;";
            logoutBtn.parentNode.insertBefore(indicator, logoutBtn);
        }
    }

    if (indicator) {
        if (pending.length > 0) {
            indicator.innerHTML = `⏳ ${pending.length} PENDING`;
            indicator.style.color = "#f59e0b"; // Orange
        } else {
            indicator.innerHTML = "☁️ ONLINE";
            indicator.style.color = "#10b981"; // Green
        }
    }
}

// 4. Internet Event Listeners
window.addEventListener('online', () => {
    syncOfflineData();
});

window.addEventListener('offline', () => {
    updateSyncIndicator();
    if (typeof showToast === "function") showToast("📡 System is now Offline.");
});

// I-run ang indicator check pag-load ng page
document.addEventListener('DOMContentLoaded', () => {
    updateSyncIndicator();
});
