/**
 * ATTENDANCE PRO - FINAL CONSOLIDATED LOGIC
 */

let allStudents = [];      
let currentSession = null;  
let sessionData = {};      
let currentPage = 1;
const rowsPerPage = 10;
let filteredStudents = [];

// --- Initialize App ---
document.addEventListener('DOMContentLoaded', () => {
    initFirebaseListeners();
    const subHeader = document.getElementById('subHeader');
    if (subHeader) {
        subHeader.innerText = new Date().toLocaleDateString('en-US', { 
            weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' 
        });
    }
});

function initFirebaseListeners() {
    db.ref('master_students').on('value', (snapshot) => {
        const data = snapshot.val();
        allStudents = data ? Object.values(data) : [];
        filteredStudents = [...allStudents];
        updateMasterUI();
        if (currentSession) updateAttendanceTable();
    });

    db.ref('sessions').on('value', (snapshot) => {
        const sessions = snapshot.val();
        const picker = document.getElementById('eventPicker');
        if (!picker) return;
        picker.innerHTML = '<option value="" disabled selected>Select a session...</option>';
        if (sessions) {
            Object.keys(sessions).forEach(sessionId => {
                const displayTitle = sessions[sessionId].name || sessionId;
                let opt = document.createElement('option');
                opt.value = sessionId; 
                opt.innerText = displayTitle;
                picker.appendChild(opt);
            });
        }
    });
}

// FIX: Siguradong may clearing at toast!
function createNewEvent() {
    const input = document.getElementById('newEventName');
    const btn = document.getElementById('createEventBtn');
    
    if (!input || !btn) return;
    const eventName = input.value.trim();

    if (!eventName) return showToast("⚠️ Please enter an Event Name!");

    btn.innerText = "⏳ Creating...";
    btn.disabled = true;

    const newSessionRef = db.ref('sessions').push();
    
    newSessionRef.set({
        name: eventName,
        createdAt: Date.now(),
        status: "active"
    })
    .then(() => {
        showToast(`✅ "${eventName}" Created Successfully!`);
        input.value = ""; // Clear box
        input.blur();     // Hide keyboard
    })
    .catch(err => {
        showToast("❌ Error: " + err.message);
    })
    .finally(() => {
        btn.innerText = "CREATE SESSION";
        btn.disabled = false;
    });
}

function showToast(msg) {
    const toast = document.getElementById('toast');
    const message = document.getElementById('toastMessage');
    const iconContainer = toast.querySelector('.toast-icon'); // Hanapin ang icon span
    
    if (!toast || !message) return;

    // 1. Tukuyin kung ano ang tamang icon base sa message
    let icon = "✅"; // Default success
    if (msg.includes("⚠️") || msg.includes("Error") || msg.includes("required")) {
        icon = "⚠️";
    }
    if (msg.includes("🗑️") || msg.includes("Deleted")) {
        icon = "🗑️";
    }

    // 2. Linisin ang message mula sa mga emoji para hindi double emoji
    const cleanMsg = msg.replace(/[✅⚠️🗑️📊❌⏳]/g, '').trim();

    // 3. I-update ang UI
    iconContainer.innerText = icon;
    message.innerText = cleanMsg;
    
    // 4. Animation logic
    toast.style.display = 'block';
    setTimeout(() => toast.classList.add('show'), 10);

    // 5. Auto-hide
    setTimeout(() => {
        toast.classList.remove('show');
        setTimeout(() => { toast.style.display = 'none'; }, 500);
    }, 3000);
}

// --- Registration Logic ---
function addStudent() {
    const name = document.getElementById('nameIn').value.trim();
    let id = document.getElementById('idIn').value.trim();
    const section = document.getElementById('classIn').value.trim();
    const year = document.getElementById('yearIn').value.trim();

    if (!name) return showToast("⚠️ Name is required!");
    if (!id || id === "-") id = "TEMP-" + Math.random().toString(36).substr(2, 5).toUpperCase();

    db.ref('master_students').push({
        name, id, section: section || 'N/A', year: year || 'N/A', timestamp: Date.now()
    }).then(() => {
        ['nameIn', 'idIn', 'classIn', 'yearIn'].forEach(i => document.getElementById(i).value = '');
        showToast("✅ Student Registered!");
    }).catch(err => showToast("❌ Error: " + err.message));
}

function handleFileSelect() {
    const fileInput = document.getElementById('csvFile');
    const statusText = document.getElementById('fileStatus');
    if (fileInput.files && fileInput.files[0]) {
        statusText.innerText = `READY: ${fileInput.files[0].name}`;
        statusText.style.color = "#4f46e5";
    }
}

function uploadCSV() {
    const fileInput = document.getElementById('csvFile');
    const statusText = document.getElementById('fileStatus');
    const bulkBtn = document.getElementById('bulkBtn'); // FIXED: Defined it here
    const file = fileInput.files[0];
    
    if (!file) return showToast("⚠️ Select a CSV file.");
    
    bulkBtn.innerText = "⏳ Processing...";
    bulkBtn.disabled = true;

    const reader = new FileReader();
    reader.onload = function(e) {
        const lines = e.target.result.split(/\r?\n/).filter(line => line.trim() !== "");
        const batchUpdates = {};

        lines.forEach((line, index) => {
            if (index === 0) return;
            const cols = line.split(',').map(c => c.trim());
            if (cols.length >= 1 && cols[0] !== "") {
                const newRef = db.ref('master_students').push();
                batchUpdates[newRef.key] = {
                    name: cols[0], id: cols[1] || "-", section: cols[2] || "N/A", year: cols[3] || "N/A", timestamp: Date.now()
                };
            }
        });

        db.ref('master_students').update(batchUpdates).then(() => {
            showToast("📊 Upload Success!");
            fileInput.value = '';
            bulkBtn.innerText = "Process information of Students";
            bulkBtn.disabled = false;
        }).catch(err => showToast("❌ Error: " + err.message));
    };
    reader.readAsText(file);
}

// --- Session & Attendance ---
function renderSheet() {
    const picker = document.getElementById('eventPicker');
    currentSession = picker.value;
    if (!currentSession || currentSession.includes("Select")) return showToast("⚠️ Select a session");

    document.getElementById('activeEventTitle').innerText = picker.options[picker.selectedIndex].text;
    document.getElementById('dashboard').style.display = 'none';
    document.getElementById('sheet').style.display = 'block';

    db.ref(`sessions/${currentSession}`).on('value', (snapshot) => {
        sessionData = snapshot.val() || {};
        updateAttendanceTable();
    });
}

function updateAttendanceTable() {
    const body = document.getElementById('studentTableBody');
    if (!body) return;
    const start = (currentPage - 1) * rowsPerPage;
    const paginated = filteredStudents.slice(start, start + rowsPerPage);

    body.innerHTML = paginated.map(s => {
        const status = sessionData[s.id] || 'absent';
        return `
            <tr>
                <td><div style="font-weight:700;">${s.name}</div></td>
                <td align="center"><code>${s.id}</code></td>
                <td align="center" style="font-size:0.6rem;">${s.section}<br>${s.year}</td>
                <td align="right">
                    <button class="status-btn" onclick="toggleStatus('${s.id}', '${status}')" 
                        style="background: ${getStatusColor(status)}; color:white; border:none; padding:10px; border-radius:12px; font-size:0.65rem; min-width:80px;">
                        ${status.toUpperCase()}
                    </button>
                </td>
            </tr>`;
    }).join('');
    updateStats();
    document.getElementById('pageIndicator').innerText = `Page ${currentPage} / ${Math.ceil(filteredStudents.length/rowsPerPage) || 1}`;
}

function toggleStatus(studentId, currentStatus) {
    const statuses = ['absent', 'present', 'excused'];
    let nextStatus = statuses[(statuses.indexOf(currentStatus) + 1) % statuses.length];
    db.ref(`sessions/${currentSession}/${studentId}`).set(nextStatus);
}

function getStatusColor(s) {
    if (s === 'present') return '#10b981';
    if (s === 'excused') return '#f59e0b';
    return '#94a3b8';
}

function updateStats() {
    const vals = Object.values(sessionData);
    const p = vals.filter(v => v === 'present').length;
    const e = vals.filter(v => v === 'excused').length;
    document.getElementById('pCount').innerText = p;
    document.getElementById('eCount').innerText = e;
    document.getElementById('aCount').innerText = Math.max(0, allStudents.length - (p + e));
}

function handleSearch() {
    const term = document.getElementById('searchInput').value.toLowerCase();
    filteredStudents = allStudents.filter(s => s.name.toLowerCase().includes(term) || s.id.toLowerCase().includes(term));
    currentPage = 1;
    updateAttendanceTable();
}

function changePage(dir) {
    const max = Math.ceil(filteredStudents.length / rowsPerPage);
    if (currentPage + dir >= 1 && currentPage + dir <= max) {
        currentPage += dir;
        updateAttendanceTable();
    }
}

function goHome() {
    if (currentSession) db.ref(`sessions/${currentSession}`).off();
    document.getElementById('dashboard').style.display = 'block';
    document.getElementById('sheet').style.display = 'none';
}

function closeModal() {
    document.getElementById('customModal').style.display = 'none';
}

function deleteEvent() {
    const picker = document.getElementById('eventPicker');
    const sessionId = picker.value;
    if (!sessionId || sessionId.includes("Select")) return showToast("⚠️ Select a session!");

    const modal = document.getElementById('customModal');
    document.getElementById('modalTitle').innerText = "Delete Session";
    document.getElementById('modalBody').innerHTML = `Delete <strong>"${picker.options[picker.selectedIndex].text}"</strong>?`;
    modal.style.display = 'flex';

    document.getElementById('confirmBtn').onclick = function() {
        db.ref(`sessions/${sessionId}`).remove().then(() => {
            showToast("🗑️ Session Deleted!");
            closeModal();
            picker.value = "";
        });
    };
}

function clearAllStudents() {
    const modal = document.getElementById('customModal');
    document.getElementById('modalTitle').innerText = "Wipe Database";
    document.getElementById('modalBody').innerText = "This will delete ALL students. Are you sure?";
    modal.style.display = 'flex';

    document.getElementById('confirmBtn').onclick = function() {
        db.ref('master_students').remove().then(() => {
            showToast("⚠️ Database Cleared!");
            closeModal();
        });
    };
}

function updateMasterUI() {
    const body = document.getElementById('masterRosterBody');
    if (!body) return;
    body.innerHTML = [...allStudents].slice(-5).reverse().map(s => `
        <tr><td style="font-size:0.7rem;"><b>${s.name}</b></td><td align="right">ID: ${s.id}</td></tr>
    `).join('');
}

function exportToCSV() {
    if (!allStudents.length) return showToast("⚠️ No data to export!");
    let csvRows = ["Student Name,ID Number,Section,Year Level,Attendance Status"];
    let p = 0, a = 0, e = 0;

    allStudents.forEach(s => {
        const status = (sessionData[s.id] || 'absent').toUpperCase();
        if (status === 'PRESENT') p++; else if (status === 'EXCUSED') e++; else a++;
        csvRows.push(`"${s.name}","${s.id}","${s.section}","${s.year}","${status}"`);
    });

    csvRows.push(`\n"TOTAL PRESENT",,,"${p}"\n"TOTAL EXCUSED",,,"${e}"\n"TOTAL ABSENT",,,"${a}"`);
    
    const blob = new Blob([csvRows.join("\n")], { type: 'text/csv' });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = `Report_${document.getElementById('activeEventTitle').innerText}.csv`;
    link.click();
}

/* --- 📅 AUTOMATIC DATE UPDATER --- */
const updateCurrentDate = () => {
    const dateElement = document.getElementById('current-date');
    
    if (dateElement) {
        const today = new Date();
        
        // Format: "Sunday, March 22, 2026"
        const options = { 
            weekday: 'long', 
            year: 'numeric', 
            month: 'long', 
            day: 'numeric' 
        };
        
        const formattedDate = today.toLocaleDateString('en-US', options);
        
        // Ilalagay na nito ang tamang petsa sa loob ng iyong "Elite Glass Pill"
        dateElement.textContent = formattedDate;
    }
};

async function sendFormalReport() {
    const eventName = document.getElementById('activeEventTitle')?.innerText || "General Event";
    
    // 1. Siguraduhin na may data sa allStudents
    if (!allStudents || allStudents.length === 0) {
        showToast("⚠️ No student data found!");
        return;
    }

    const recipientEmail = prompt("📧 Enter recipient's email:", "daviesialongo@gmail.com");
    if (!recipientEmail || recipientEmail.trim() === "") return;

    showToast("📤 Preparing full report...");

    // 2. MAPA: Kunin ang data at i-check ang status sa sessionData
    const attendanceData = allStudents.map(student => {
        // Kunin ang status mula sa sessionData (na galing sa Firebase)
        // Mahalaga: student.id ang ginagamit nating key sa Firebase sessions
        let status = "absent"; 
        
        if (sessionData && sessionData[student.id]) {
            status = sessionData[student.id];
        }

        return {
            name: student.name || "N/A",
            id: student.id || "N/A",
            // Pinagsama ang Section at Year para sa Info column
            info: `${student.section || ''} ${student.year || ''}`.trim() || "N/A",
            status: status.toUpperCase()
        };
    });

    const payload = {
        eventName: eventName,
        attendance: attendanceData,
        recipientEmail: recipientEmail
    };

    const GAS_URL = "https://script.google.com/macros/s/AKfycby_j1cFEvptqyuMfWoGMV6XfOeHeIWZHhfv2AnVjlksejD7Ql-PKpi5LNKH_7XXPY2fEw/exec"; 

    try {
        await fetch(GAS_URL, {
            method: "POST",
            mode: "no-cors", 
            body: JSON.stringify(payload)
        });
        showToast(`✅ Sent! ${attendanceData.length} students processed.`);
    } catch (err) {
        console.error("Error:", err);
        showToast("❌ Connection Failed");
    }
}



// Tatakbo agad ang script kapag na-load na ang page
document.addEventListener('DOMContentLoaded', updateCurrentDate);

// Global scope exposures
window.createNewEvent = createNewEvent;
window.addStudent = addStudent;
window.handleFileSelect = handleFileSelect;
window.uploadCSV = uploadCSV;
window.renderSheet = renderSheet;
window.deleteEvent = deleteEvent;
window.toggleStatus = toggleStatus;
window.handleSearch = handleSearch;
window.changePage = changePage;
window.goHome = goHome;
window.clearAllStudents = clearAllStudents;
window.closeModal = closeModal;
window.exportToCSV = exportToCSV;
