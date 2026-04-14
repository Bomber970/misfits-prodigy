const firebaseConfig = {
    apiKey: "AIzaSyBMCbpSq_PAGiE4iMZgR5GlkWJlYNx1ddQ",
    authDomain: "misfits-prodigy.firebaseapp.com",
    projectId: "misfits-prodigy",
    storageBucket: "misfits-prodigy.firebasestorage.app",
    messagingSenderId: "70127595002",
    appId: "1:70127595002:web:8f80e65ea8271c92184843"
};

firebase.initializeApp(firebaseConfig);
const auth = firebase.auth();
const db = firebase.firestore();

const ADMIN_EMAIL = "bombersnipez@gmail.com";

// UTILS
function getWeekNumber() {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    d.setDate(d.getDate() + 4 - (d.getDay() || 7));
    const yearStart = new Date(d.getFullYear(), 0, 1);
    return Math.ceil((((d - yearStart) / 86400000) + 1) / 7);
}

function showSection(id) {
    document.querySelectorAll('.tab-content').forEach(s => s.classList.add('hidden'));
    document.getElementById(id).classList.remove('hidden');
    if(id === 'history-sec') {
        const cw = getWeekNumber();
        document.getElementById('current-week-display').innerText = cw;
        document.getElementById('history-week-select').value = cw;
        loadHistoryByWeek();
    }
}

// AUTH LOGIC
async function handleLogin() {
    const email = document.getElementById('login-email').value;
    const pass = document.getElementById('login-pass').value;
    try {
        await auth.signInWithEmailAndPassword(email, pass);
    } catch (e) { 
        alert("Login Failed: " + e.message); 
    }
}

auth.onAuthStateChanged(user => {
    const loginScreen = document.getElementById('login-screen');
    const dashboard = document.getElementById('main-dashboard');
    const authStatus = document.getElementById('auth-status');
    const adminUI = document.querySelectorAll('.admin-only');

    if (user) {
        if(loginScreen) loginScreen.classList.add('hidden');
        if(dashboard) dashboard.classList.remove('hidden');
        if(authStatus) authStatus.innerHTML = `<span style="font-size:0.8rem; margin-right:10px;">${user.email}</span><button onclick="auth.signOut()">Logout</button>`;
        
        if (user.email === ADMIN_EMAIL) {
            adminUI.forEach(el => el.classList.remove('hidden'));
        } else {
            adminUI.forEach(el => el.classList.add('hidden'));
        }
        
        loadRoster(); loadFinance(); loadWeed(); loadMats(); loadMatThreads(); loadLogs();
    } else {
        if(loginScreen) loginScreen.classList.remove('hidden');
        if(dashboard) dashboard.classList.add('hidden');
    }
});

// ROSTER
async function registerMember() {
    const name = document.getElementById('new-name').value;
    const email = document.getElementById('new-email').value;
    const rank = document.getElementById('new-rank').value;
    const phone = document.getElementById('new-phone').value;
    if(!name || !email) return alert("Missing Info");
    try {
        await db.collection('members').add({
            name, email, rank, phone,
            debt: 5000, status: 'unpaid',
            joinedAt: new Date(), proof: "",
            weekNumber: getWeekNumber()
        });
        addLog(`Created profile for ${name}`);
        alert("Member Added.");
    } catch (e) { alert(e.message); }
}

function loadRoster() {
    db.collection('members').onSnapshot(snap => {
        const container = document.getElementById('roster-list');
        if(!container) return;
        container.innerHTML = '';
        snap.forEach(doc => {
            const d = doc.data();
            const isKaizo = auth.currentUser && auth.currentUser.email === ADMIN_EMAIL;
            container.innerHTML += `
                <div class="card" style="background:var(--panel-bg); padding:20px; border-radius:8px; border-top:3px solid var(--primary-blue);">
                    <h3 style="margin:0;">${d.name}</h3>
                    <p style="color:var(--primary-blue); font-weight:bold; margin:5px 0;">${d.rank.toUpperCase()}</p>
                    <p style="font-size:0.8rem;">Phone: ${d.phone || 'N/A'}</p>
                    ${isKaizo ? `<button onclick="removeMember('${doc.id}', '${d.name}')" style="background:#c0392b; font-size:0.7rem; margin-top:10px;">Remove</button>` : ''}
                </div>
            `;
        });
    });
}

async function removeMember(id, name) {
    if(confirm(`Remove ${name}?`)) {
        await db.collection('members').doc(id).delete();
        addLog(`Removed ${name}`);
    }
}

// FINANCE
async function submitPayment() {
    const proof = document.getElementById('proof-link').value;
    if(!proof) return alert("Link required");
    const user = auth.currentUser;
    const query = await db.collection('members').where('email', '==', user.email).get();
    if(!query.empty) {
        await db.collection('members').doc(query.docs[0].id).update({ 
            status: 'verifying', 
            proof, 
            submitDate: new Date(),
            weekNumber: getWeekNumber() 
        });
        addLog(`${user.email} submitted proof.`);
        alert("Proof Sent.");
    }
}

function loadFinance() {
    const currentWeek = getWeekNumber();
    db.collection('members').where('weekNumber', '==', currentWeek).onSnapshot(snap => {
        const list = document.getElementById('payment-list');
        if(!list) return;
        list.innerHTML = '';
        snap.forEach(doc => {
            const d = doc.data();
            let sClass = 'status-red';
            if(d.status === 'verifying') sClass = 'status-orange';
            if(d.status === 'paid') sClass = 'status-green';
            const dateStr = d.submitDate ? d.submitDate.toDate().toLocaleString() : 'N/A';

            list.innerHTML += `
                <tr>
                    <td>${d.name}</td><td>$${d.debt}</td>
                    <td>${d.proof ? `<a href="${d.proof}" target="_blank" style="color:cyan;">Proof</a>` : 'None'}</td>
                    <td class="${sClass}">${d.status}</td>
                    <td>${dateStr}</td>
                    <td><button onclick="confirmPay('${doc.id}')" style="background:green;">Confirm</button></td>
                </tr>
            `;
        });
    });
}

async function confirmPay(id) {
    if(auth.currentUser.email !== ADMIN_EMAIL) return;
    await db.collection('members').doc(id).update({ status: 'paid', debt: 0 });
    addLog(`Confirmed payment for ${id}`);
}

async function resetFinanceWeek() {
    if(auth.currentUser.email !== ADMIN_EMAIL) return;
    if(!confirm("Reset for new week?")) return;
    const newWeek = getWeekNumber();
    const snap = await db.collection('members').get();
    const batch = db.batch();
    snap.forEach(doc => {
        batch.update(doc.ref, { 
            status: 'unpaid', 
            proof: "", 
            debt: (doc.data().debt || 0) + 5000,
            weekNumber: newWeek,
            submitDate: null
        });
    });
    await batch.commit();
    addLog("Reset weekly cycle.");
    alert("Week Reset.");
}

// HISTORY
async function loadHistoryByWeek() {
    const week = parseInt(document.getElementById('history-week-select').value);
    const snap = await db.collection('members').where('weekNumber', '==', week).get();
    const list = document.getElementById('history-list');
    if(!list) return;
    list.innerHTML = '';
    snap.forEach(doc => {
        const d = doc.data();
        const dateStr = d.submitDate ? d.submitDate.toDate().toLocaleDateString() : 'N/A';
        list.innerHTML += `<tr><td>${d.name}</td><td>$${d.debt}</td><td>${d.status}</td><td>${dateStr}</td></tr>`;
    });
}

// WEED & MATS
async function logWeed(type) {
    const data = {
        strain: document.getElementById('weed-strain').value,
        zone: document.getElementById('weed-zone').value,
        amount: document.getElementById('weed-amount').value,
        lace: document.getElementById('weed-lace').value,
        buyer: document.getElementById('weed-buyer').value || "Stock",
        type, date: new Date(), user: auth.currentUser.email
    };
    await db.collection('weed_logs').add(data);
}

function loadWeed() {
    db.collection('weed_logs').orderBy('date', 'desc').onSnapshot(snap => {
        const list = document.getElementById('weed-list');
        if(!list) return;
        list.innerHTML = '';
        snap.forEach(doc => {
            const d = doc.data();
            list.innerHTML += `<tr><td>${d.strain}</td><td>${d.zone}</td><td>${d.amount}</td><td>${d.lace}</td><td>${d.buyer}</td><td>${d.date.toDate().toLocaleDateString()}</td></tr>`;
        });
    });
}

async function updateMaterials() {
    const data = {
        name: document.getElementById('mat-name').value,
        qty: document.getElementById('mat-qty').value,
        loc: document.getElementById('mat-loc').value,
        updated: new Date()
    };
    await db.collection('materials').add(data);
}

function loadMats() {
    db.collection('materials').orderBy('updated', 'desc').onSnapshot(snap => {
        const list = document.getElementById('mats-list');
        if(!list) return;
        list.innerHTML = '';
        snap.forEach(doc => {
            const d = doc.data();
            const isKaizo = auth.currentUser && auth.currentUser.email === ADMIN_EMAIL;
            list.innerHTML += `<tr>
                <td>${d.name}</td><td>${d.qty}</td><td>${d.loc}</td>
                <td>${isKaizo ? `<button onclick="deleteDoc('materials', '${doc.id}')" style="background:red;">X</button>` : ''}</td>
            </tr>`;
        });
    });
}

async function createMatThread() {
    const item = document.getElementById('thread-item').value;
    if(!item) return;
    await db.collection('mat_threads').add({ item, claimedBy: null, postedAt: new Date() });
    document.getElementById('thread-item').value = '';
}

function loadMatThreads() {
    db.collection('mat_threads').orderBy('postedAt', 'desc').onSnapshot(snap => {
        const container = document.getElementById('mats-threads-container');
        if(!container) return;
        container.innerHTML = '';
        snap.forEach(doc => {
            const d = doc.data();
            const isKaizo = auth.currentUser && auth.currentUser.email === ADMIN_EMAIL;
            const isClaimed = d.claimedBy !== null;
            container.innerHTML += `
                <div class="thread-card ${isClaimed ? 'claimed' : ''}">
                    <h4 style="margin:0;">${d.item}</h4>
                    <p style="font-size:0.8rem; color:#888;">${isClaimed ? `Claimed by: ${d.claimedBy}` : 'Unclaimed'}</p>
                    ${!isClaimed ? `<button onclick="claimThread('${doc.id}')" style="background:green; font-size:0.7rem; margin-top:5px;">Claim It</button>` : ''}
                    ${isKaizo ? `<button onclick="deleteDoc('mat_threads', '${doc.id}')" style="background:red; font-size:0.7rem; margin-top:5px; margin-left:5px;">Delete</button>` : ''}
                </div>
            `;
        });
    });
}

async function claimThread(id) {
    if(!auth.currentUser) return;
    await db.collection('mat_threads').doc(id).update({ claimedBy: auth.currentUser.email });
}

async function deleteDoc(col, id) {
    if(confirm("Delete this?")) await db.collection(col).doc(id).delete();
}

async function addLog(action) {
    await db.collection('logs').add({ user: auth.currentUser ? auth.currentUser.email : "System", action, date: new Date() });
}

function loadLogs() {
    db.collection('logs').orderBy('date', 'desc').limit(50).onSnapshot(snap => {
        const list = document.getElementById('log-list');
        if(!list) return;
        list.innerHTML = '';
        snap.forEach(doc => {
            const d = doc.data();
            list.innerHTML += `<tr><td>${d.user}</td><td>${d.action}</td><td>${d.date.toDate().toLocaleString()}</td></tr>`;
        });
    });
}

function filterLogs() {
    const val = document.getElementById('log-search').value.toLowerCase();
    document.querySelectorAll('#log-list tr').forEach(row => {
        row.style.display = row.innerText.toLowerCase().includes(val) ? '' : 'none';
    });
}