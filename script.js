import { initializeApp } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js";
import {
  getDatabase,
  ref,
  push,
  onValue,
  remove,
  serverTimestamp,
  update
} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-database.js";

const firebaseConfig = {
  apiKey: "AIzaSyCIfleywEbd1rcjymkfEfFYxPpvYdZHGhk",
  authDomain: "cvang-vahan.firebaseapp.com",
  databaseURL: "https://cvang-vahan-default-rtdb.firebaseio.com",
  projectId: "cvang-vahan",
  storageBucket: "cvang-vahan.appspot.com",
  messagingSenderId: "117318825099",
  appId: "1:117318825099:web:afc0e2f863117cb14bfc"
};

const PEOPLE = [
  { id: "shivang", name: "Shivang", password: "0000" },
  { id: "vivek", name: "Vivek", password: "2222" },
  { id: "rahul", name: "Rahul", password: "1111" }
];

const app = initializeApp(firebaseConfig);
const db = getDatabase(app);
const expensesRef = ref(db, "tripExpenseHisab/transactions");

const els = {
  loginView: document.querySelector("#loginView"),
  appView: document.querySelector("#appView"),
  personButtons: document.querySelector("#personButtons"),
  logoutBtn: document.querySelector("#logoutBtn"),
  activeUserName: document.querySelector("#activeUserName"),
  tripTotal: document.querySelector("#tripTotal"),
  entryCount: document.querySelector("#entryCount"),
  peopleSummary: document.querySelector("#peopleSummary"),
  settlementList: document.querySelector("#settlementList"),
  passwordDialog: document.querySelector("#passwordDialog"),
  passwordForm: document.querySelector("#passwordForm"),
  passwordTitle: document.querySelector("#passwordTitle"),
  passwordInput: document.querySelector("#passwordInput"),
  passwordError: document.querySelector("#passwordError"),
  addExpenseBtn: document.querySelector("#addExpenseBtn"),
  expenseDialog: document.querySelector("#expenseDialog"),
  expenseForm: document.querySelector("#expenseForm"),
  expenseModeLabel: document.querySelector("#expenseModeLabel"),
  expenseTitle: document.querySelector("#expenseTitle"),
  amountInput: document.querySelector("#amountInput"),
  reasonInput: document.querySelector("#reasonInput"),
  dateInput: document.querySelector("#dateInput"),
  participantInputs: document.querySelector("#participantInputs"),
  expenseError: document.querySelector("#expenseError"),
  detailsDialog: document.querySelector("#detailsDialog"),
  detailsEyebrow: document.querySelector("#detailsEyebrow"),
  detailsTitle: document.querySelector("#detailsTitle"),
  detailsList: document.querySelector("#detailsList")
};

let activeUser = null;
let pendingLoginUser = null;
let transactions = [];
let editingId = null;
let detailsPersonId = null;

const formatMoney = (value) => {
  const amount = Number(value || 0);
  return `Rs ${amount.toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;
};

const today = () => new Date().toISOString().slice(0, 10);
const personById = (id) => PEOPLE.find((person) => person.id === id);

function openDialog(dialog) {
  if (typeof dialog.showModal === "function") {
    dialog.showModal();
    return;
  }
  dialog.setAttribute("open", "");
}

function closeDialog(dialog) {
  dialog.close ? dialog.close() : dialog.removeAttribute("open");
}

function renderLoginButtons() {
  els.personButtons.innerHTML = PEOPLE.map((person) => `
    <button class="person-btn" type="button" data-login="${person.id}">
      <strong>${person.name}</strong>
      <span>Enter PIN to add expenses</span>
    </button>
  `).join("");
}

function renderParticipantInputs(selected = PEOPLE.map((person) => person.id)) {
  els.participantInputs.innerHTML = PEOPLE.map((person) => `
    <label class="check-pill">
      <input type="checkbox" value="${person.id}" ${selected.includes(person.id) ? "checked" : ""}>
      <span>${person.name}</span>
    </label>
  `).join("");
}

function setLoggedInUser(person) {
  activeUser = person;
  sessionStorage.setItem("tripExpenseUser", person.id);
  els.loginView.classList.add("hidden");
  els.appView.classList.remove("hidden");
  els.logoutBtn.classList.remove("hidden");
  els.activeUserName.textContent = person.name;
  renderAll();
}

function logout() {
  activeUser = null;
  sessionStorage.removeItem("tripExpenseUser");
  els.appView.classList.add("hidden");
  els.logoutBtn.classList.add("hidden");
  els.loginView.classList.remove("hidden");
}

function getPersonStats() {
  const stats = Object.fromEntries(PEOPLE.map((person) => [
    person.id,
    { paid: 0, share: 0, count: 0 }
  ]));

  transactions.forEach((item) => {
    const amount = Number(item.amount || 0);
    const participants = Array.isArray(item.participants) && item.participants.length
      ? item.participants
      : PEOPLE.map((person) => person.id);
    const payer = item.paidBy || item.ownerId;

    if (stats[payer]) {
      stats[payer].paid += amount;
      stats[payer].count += 1;
    }

    participants.forEach((personId) => {
      if (stats[personId]) {
        stats[personId].share += amount / participants.length;
      }
    });
  });

  return stats;
}

function renderPeopleSummary(stats) {
  els.peopleSummary.innerHTML = PEOPLE.map((person) => {
    const personStats = stats[person.id];
    const net = personStats.paid - personStats.share;
    const netClass = net >= 0 ? "net-positive" : "net-negative";

    return `
      <button class="person-row" type="button" data-details="${person.id}">
        <span>
          <strong>${person.name}</strong>
          <small>${personStats.count} transaction${personStats.count === 1 ? "" : "s"} | Balance <b class="${netClass}">${formatMoney(net)}</b></small>
        </span>
        <span class="amount">Paid ${formatMoney(personStats.paid)}</span>
      </button>
    `;
  }).join("");
}

function renderSettlements(stats) {
  const debtors = [];
  const creditors = [];

  PEOPLE.forEach((person) => {
    const net = Number((stats[person.id].paid - stats[person.id].share).toFixed(2));
    if (net < -0.01) debtors.push({ id: person.id, amount: Math.abs(net) });
    if (net > 0.01) creditors.push({ id: person.id, amount: net });
  });

  const settlements = [];
  let i = 0;
  let j = 0;

  while (i < debtors.length && j < creditors.length) {
    const amount = Math.min(debtors[i].amount, creditors[j].amount);
    settlements.push({
      from: debtors[i].id,
      to: creditors[j].id,
      amount
    });
    debtors[i].amount = Number((debtors[i].amount - amount).toFixed(2));
    creditors[j].amount = Number((creditors[j].amount - amount).toFixed(2));
    if (debtors[i].amount <= 0.01) i += 1;
    if (creditors[j].amount <= 0.01) j += 1;
  }

  if (!settlements.length) {
    els.settlementList.innerHTML = `<div class="empty-state">Everything is settled right now.</div>`;
    return;
  }

  els.settlementList.innerHTML = settlements.map((item) => `
    <div class="settlement-item">
      <strong>${personById(item.from).name}</strong> should pay
      <strong>${personById(item.to).name}</strong>
      <strong>${formatMoney(item.amount)}</strong>.
    </div>
  `).join("");
}

function renderAll() {
  const total = transactions.reduce((sum, item) => sum + Number(item.amount || 0), 0);
  const stats = getPersonStats();

  els.tripTotal.textContent = formatMoney(total);
  els.entryCount.textContent = String(transactions.length);
  renderPeopleSummary(stats);
  renderSettlements(stats);

  if (detailsPersonId && els.detailsDialog.open) {
    renderDetails(detailsPersonId);
  }
}

function resetExpenseForm() {
  editingId = null;
  els.expenseModeLabel.textContent = "New transaction";
  els.expenseTitle.textContent = "Add expense";
  els.amountInput.value = "";
  els.reasonInput.value = "";
  els.dateInput.value = today();
  els.expenseError.textContent = "";
  renderParticipantInputs();
}

function openExpenseForEdit(item) {
  editingId = item.id;
  els.expenseModeLabel.textContent = "Edit transaction";
  els.expenseTitle.textContent = "Update expense";
  els.amountInput.value = item.amount;
  els.reasonInput.value = item.reason;
  els.dateInput.value = item.date || today();
  els.expenseError.textContent = "";
  renderParticipantInputs(item.participants || PEOPLE.map((person) => person.id));
  openDialog(els.expenseDialog);
}

function renderDetails(personId) {
  detailsPersonId = personId;
  const person = personById(personId);
  const items = transactions
    .filter((item) => (item.paidBy || item.ownerId) === personId)
    .sort((a, b) => String(b.date || "").localeCompare(String(a.date || "")));

  els.detailsEyebrow.textContent = `${person.name}'s expenses`;
  els.detailsTitle.textContent = `${items.length} transaction${items.length === 1 ? "" : "s"}`;

  if (!items.length) {
    els.detailsList.innerHTML = `<div class="empty-state">No transactions yet.</div>`;
    openDialog(els.detailsDialog);
    return;
  }

  els.detailsList.innerHTML = items.map((item) => {
    const participants = (item.participants || []).map((id) => personById(id)?.name).filter(Boolean).join(", ");
    const canManage = activeUser?.id === item.ownerId;
    return `
      <article class="transaction">
        <div class="transaction-head">
          <div>
            <h3>${item.reason}</h3>
            <p>${item.date || "No date"} | Included: ${participants || "Everyone"}</p>
          </div>
          <strong class="amount">${formatMoney(item.amount)}</strong>
        </div>
        <p>Added by ${personById(item.ownerId)?.name || "Unknown"}</p>
        ${canManage ? `
          <div class="transaction-actions">
            <button class="soft-btn" type="button" data-edit="${item.id}">Edit</button>
            <button class="danger-btn" type="button" data-delete="${item.id}">Delete</button>
          </div>
        ` : ""}
      </article>
    `;
  }).join("");

  openDialog(els.detailsDialog);
}

async function saveExpense(event) {
  event.preventDefault();
  if (!activeUser) return;

  const amount = Number(els.amountInput.value);
  const reason = els.reasonInput.value.trim();
  const date = els.dateInput.value;
  const participants = [...els.participantInputs.querySelectorAll("input:checked")].map((input) => input.value);

  if (!amount || amount <= 0) {
    els.expenseError.textContent = "Enter a valid amount.";
    return;
  }

  if (!reason) {
    els.expenseError.textContent = "Add a reason for this expense.";
    return;
  }

  if (!participants.length) {
    els.expenseError.textContent = "Select at least one person for the split.";
    return;
  }

  const payload = {
    amount,
    reason,
    date,
    participants,
    paidBy: activeUser.id,
    ownerId: activeUser.id,
    updatedAt: serverTimestamp()
  };

  try {
    if (editingId) {
      const existing = transactions.find((item) => item.id === editingId);
      if (!existing || existing.ownerId !== activeUser.id) {
        els.expenseError.textContent = "Only the person who added this transaction can edit it.";
        return;
      }
      await update(ref(db, `tripExpenseHisab/transactions/${editingId}`), payload);
    } else {
      await push(expensesRef, {
        ...payload,
        createdAt: serverTimestamp()
      });
    }
    closeDialog(els.expenseDialog);
  } catch (error) {
    els.expenseError.textContent = `Could not save: ${error.message}`;
  }
}

async function deleteExpense(id) {
  const item = transactions.find((entry) => entry.id === id);
  if (!item || item.ownerId !== activeUser?.id) return;

  const ok = window.confirm("Delete this transaction?");
  if (!ok) return;

  await remove(ref(db, `tripExpenseHisab/transactions/${id}`));
}

function bindEvents() {
  els.personButtons.addEventListener("click", (event) => {
    const button = event.target.closest("[data-login]");
    if (!button) return;

    pendingLoginUser = personById(button.dataset.login);
    els.passwordTitle.textContent = `${pendingLoginUser.name} login`;
    els.passwordInput.value = "";
    els.passwordError.textContent = "";
    openDialog(els.passwordDialog);
    setTimeout(() => els.passwordInput.focus(), 50);
  });

  els.passwordForm.addEventListener("submit", (event) => {
    event.preventDefault();
    if (!pendingLoginUser) return;

    if (els.passwordInput.value !== pendingLoginUser.password) {
      els.passwordError.textContent = "Incorrect password.";
      return;
    }

    closeDialog(els.passwordDialog);
    setLoggedInUser(pendingLoginUser);
  });

  els.logoutBtn.addEventListener("click", logout);

  els.addExpenseBtn.addEventListener("click", () => {
    resetExpenseForm();
    openDialog(els.expenseDialog);
  });

  els.expenseForm.addEventListener("submit", saveExpense);

  els.peopleSummary.addEventListener("click", (event) => {
    const button = event.target.closest("[data-details]");
    if (!button) return;
    renderDetails(button.dataset.details);
  });

  els.detailsList.addEventListener("click", (event) => {
    const editButton = event.target.closest("[data-edit]");
    const deleteButton = event.target.closest("[data-delete]");

    if (editButton) {
      const item = transactions.find((entry) => entry.id === editButton.dataset.edit);
      if (item) openExpenseForEdit(item);
    }

    if (deleteButton) {
      deleteExpense(deleteButton.dataset.delete);
    }
  });

  document.querySelector("[data-close-password]").addEventListener("click", () => closeDialog(els.passwordDialog));
  document.querySelector("[data-close-expense]").addEventListener("click", () => closeDialog(els.expenseDialog));
  document.querySelector("[data-close-details]").addEventListener("click", () => closeDialog(els.detailsDialog));
}

function startRealtimeSync() {
  onValue(expensesRef, (snapshot) => {
    const data = snapshot.val() || {};
    transactions = Object.entries(data).map(([id, value]) => ({ id, ...value }));
    renderAll();
  }, (error) => {
    els.peopleSummary.innerHTML = `<div class="empty-state">Firebase read error: ${error.message}</div>`;
  });
}

function boot() {
  renderLoginButtons();
  renderParticipantInputs();
  bindEvents();
  startRealtimeSync();

  const rememberedUser = personById(sessionStorage.getItem("tripExpenseUser"));
  if (rememberedUser) {
    setLoggedInUser(rememberedUser);
  }
}

boot();
