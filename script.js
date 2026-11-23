/* =============================================================================
   SpendWise — gestion de budget personnel

   Ce fichier gère toute la logique de l’application :
     1. Les constantes (catégories, icônes, couleurs)
     2. L’état de l’application, sauvegardé dans le navigateur (localStorage)
     3. Des fonctions utilitaires (formatage, calculs, sécurité)
     4. L’interface (thème, navigation, fenêtre d’ajout)
     5. L’affichage de chaque page (tableau de bord, transactions, budgets,
        statistiques)
     6. Les actions (ajouter, supprimer, exporter)
     7. Les écouteurs d’événements (clics, formulaires…)

   Les graphiques utilisent la bibliothèque Chart.js, chargée dans index.html.
   ============================================================================= */


/* =============================================================================
   1. CONSTANTES
   ============================================================================= */

// Catégories proposées pour les dépenses
const EXPENSE_CATEGORIES = [
  "Alimentation",
  "Transport",
  "Logement",
  "Études",
  "Santé",
  "Loisirs",
  "Shopping",
  "Abonnements",
  "Autres"
];

// Catégories proposées pour les revenus
const INCOME_CATEGORIES = ["Salaire", "Bourse", "Aide", "Activités", "Autres"];

// Une icône (emoji) pour chaque catégorie
const ICONS = {
  "Alimentation": "🍽️",
  "Transport": "🚌",
  "Logement": "🏠",
  "Études": "📚",
  "Santé": "💊",
  "Loisirs": "🎮",
  "Shopping": "🛍️",
  "Abonnements": "🔁",
  "Autres": "📦",
  "Salaire": "💼",
  "Bourse": "🎓",
  "Aide": "🤝",
  "Activités": "✨"
};

// Couleurs utilisées par les graphiques en anneau (une par catégorie)
const CHART_COLORS = [
  "#6d5ce8",
  "#35b891",
  "#f4ad54",
  "#e76b7c",
  "#58a6df",
  "#9a7bea",
  "#6bc4c8",
  "#d58db9",
  "#a9afbf"
];

// État de départ, utilisé quand rien n’est encore sauvegardé
const defaultState = {
  transactions: [],     // liste des opérations (voir saveTransaction pour leur forme)
  monthlyBudget: 0,     // budget global du mois
  categoryBudgets: {},  // limite par catégorie, ex. { "Transport": 50 }
  currency: "EUR",      // devise affichée
  dark: false           // thème sombre activé ou non
};


/* =============================================================================
   2. ÉTAT DE L’APPLICATION
   ============================================================================= */

let state = loadState();            // données sauvegardées (transactions, budgets, réglages)
let currentMonth = new Date();      // mois actuellement affiché
let modalType = "expense";          // type choisi dans la fenêtre d’ajout : "expense" ou "income"

// Références vers les graphiques Chart.js, pour pouvoir les détruire avant de les redessiner
let categoryChart = null;
let monthlyChart = null;
let statsCategoryChart = null;


/* =============================================================================
   3. SAUVEGARDE DANS LE NAVIGATEUR (localStorage)
   ============================================================================= */

// Lit les données sauvegardées. En cas de problème (données absentes ou
// corrompues), on repart de l’état par défaut.
function loadState() {
  try {
    const saved = JSON.parse(localStorage.getItem("spendwiseState") || "{}");
    return { ...defaultState, ...saved };
  } catch {
    return { ...defaultState };
  }
}

// Enregistre l’état actuel dans le navigateur.
function saveState() {
  localStorage.setItem("spendwiseState", JSON.stringify(state));
}


/* =============================================================================
   4. FONCTIONS UTILITAIRES
   ============================================================================= */

// Raccourci : $("monId") équivaut à document.getElementById("monId")
const $ = (id) => document.getElementById(id);

// Formate un nombre en montant selon la devise choisie (ex. 12,5 → "12,50 €").
// Le franc Pacifique (XPF) n’a pas de centimes, d’où 0 décimale.
function money(n) {
  const formatter = new Intl.NumberFormat("fr-FR", {
    style: "currency",
    currency: state.currency,
    maximumFractionDigits: state.currency === "XPF" ? 0 : 2
  });
  return formatter.format(Number(n) || 0);
}

// Renvoie la devise sous forme de symbole seul (ex. "€", "$", "£").
function currencySymbol() {
  const parts = new Intl.NumberFormat("fr-FR", {
    style: "currency",
    currency: state.currency
  }).formatToParts(0);
  return parts.find((part) => part.type === "currency")?.value || state.currency;
}

// Convertit une date en texte "AAAA-MM-JJ" en tenant compte du fuseau horaire.
function dateISO(d = new Date()) {
  const localTime = d.getTime() - d.getTimezoneOffset() * 60000;
  return new Date(localTime).toISOString().slice(0, 10);
}

// Extrait le mois d’une date : "2026-11-23" → "2026-11"
function monthKey(d) {
  return d.slice(0, 7);
}

// Transforme "2026-11" en texte lisible : "novembre 2026"
function monthLabel(d) {
  return new Date(d + "-01T12:00:00").toLocaleDateString("fr-FR", {
    month: "long",
    year: "numeric"
  });
}

// Renvoie les transactions d’un mois donné (m au format "AAAA-MM").
function transactionsInMonth(m) {
  return state.transactions.filter((t) => monthKey(t.date) === m);
}

// Total des dépenses d’une liste de transactions.
function expenses(list) {
  return list
    .filter((t) => t.type === "expense")
    .reduce((total, t) => total + Number(t.amount), 0);
}

// Total des revenus d’une liste de transactions.
function incomes(list) {
  return list
    .filter((t) => t.type === "income")
    .reduce((total, t) => total + Number(t.amount), 0);
}

// Additionne les dépenses par catégorie.
// Exemple de résultat : { "Alimentation": 120, "Transport": 45.5 }
function sumExpensesByCategory(list) {
  const sums = {};
  list
    .filter((t) => t.type === "expense")
    .forEach((t) => {
      sums[t.category] = (sums[t.category] || 0) + Number(t.amount);
    });
  return sums;
}

// Lit la valeur d’une variable CSS (ex. "--muted"), pour colorer les graphiques
// comme le reste du thème.
function cssVar(name) {
  return getComputedStyle(document.body).getPropertyValue(name);
}

// Neutralise les caractères spéciaux du HTML. À utiliser pour tout texte saisi
// par l’utilisateur avant de l’insérer dans la page (protège contre l’injection de code).
function escapeHtml(str) {
  const replacements = {
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;"
  };
  return String(str).replace(/[&<>"']/g, (c) => replacements[c]);
}

// Affiche un court message en bas de l’écran pendant 2,4 secondes.
function toast(msg) {
  const el = $("toast");
  el.textContent = msg;
  el.classList.add("show");
  clearTimeout(toast.timer); // annule le minuteur précédent si un message est déjà affiché
  toast.timer = setTimeout(() => el.classList.remove("show"), 2400);
}

// Génère les <option> d’une liste déroulante à partir d’un tableau de catégories.
function categoryOptions(categories, withValue) {
  return categories
    .map((c) => (withValue
      ? `<option value="${escapeHtml(c)}">${escapeHtml(c)}</option>`
      : `<option>${escapeHtml(c)}</option>`))
    .join("");
}


/* =============================================================================
   5. INTERFACE : THÈME, NAVIGATION ET FENÊTRE D’AJOUT
   ============================================================================= */

// Applique le thème clair ou sombre et met à jour l’icône du bouton.
function applyTheme() {
  document.body.classList.toggle("dark", state.dark);
  $("themeToggle").textContent = state.dark ? "☀" : "☾";
}

// Affiche la page demandée ("dashboard", "transactions", "budgets",
// "statistics" ou "settings") et masque les autres.
function showPage(page) {
  // Seule la page choisie reçoit la classe "active"
  document.querySelectorAll(".page").forEach((p) => {
    p.classList.toggle("active", p.id === page);
  });
  // Même chose pour le bouton correspondant dans le menu
  document.querySelectorAll(".nav-item[data-page]").forEach((b) => {
    b.classList.toggle("active", b.dataset.page === page);
  });

  // Petit titre + titre principal affichés en haut de chaque page
  const titles = {
    dashboard: ["VUE D'ENSEMBLE", "Tableau de bord"],
    transactions: ["GESTION", "Transactions"],
    budgets: ["PLANIFICATION", "Mes budgets"],
    statistics: ["ANALYSE", "Statistiques"],
    settings: ["PRÉFÉRENCES", "Paramètres"]
  };
  $("pageEyebrow").textContent = titles[page][0];
  $("pageTitle").textContent = titles[page][1];

  // Referme le menu latéral (utile sur téléphone)
  $("sidebar").classList.remove("open");

  // Recalcule les pages qui dépendent des données
  if (page === "statistics") renderStatistics();
  if (page === "budgets") renderBudgets();
  if (page === "transactions") renderTransactions();
}

// Ouvre la fenêtre d’ajout. Si on lui donne une transaction (tx), elle sert
// de fenêtre de modification et les champs sont pré-remplis.
function openModal(type = "expense", tx = null) {
  modalType = tx?.type || type;

  $("transactionId").value = tx?.id || "";
  $("modalTitle").textContent = tx ? "Modifier la transaction" : "Nouvelle transaction";
  $("amount").value = tx?.amount || "";
  $("description").value = tx?.description || "";
  $("transactionDate").value = tx?.date || dateISO();
  $("note").value = tx?.note || "";

  // Liste des catégories adaptée au type (dépense ou revenu)
  const categories = modalType === "income" ? INCOME_CATEGORIES : EXPENSE_CATEGORIES;
  $("transactionCategory").innerHTML = categoryOptions(categories, true);
  $("transactionCategory").value = tx?.category || $("transactionCategory").options[0].value;

  updateTypeButtons();
  $("modalOverlay").classList.add("open");
}

// Ferme la fenêtre d’ajout.
function closeModal() {
  $("modalOverlay").classList.remove("open");
}

// Met à jour la fenêtre d’ajout quand on bascule entre « Dépense » et « Revenu » :
// bouton sélectionné, catégories proposées et symbole de la devise.
function updateTypeButtons() {
  document.querySelectorAll(".type-toggle button").forEach((b) => {
    b.classList.toggle("selected", b.dataset.type === modalType);
  });

  const categories = modalType === "income" ? INCOME_CATEGORIES : EXPENSE_CATEGORIES;
  $("transactionCategory").innerHTML = categoryOptions(categories, false);

  document.querySelector(".currencyMark").textContent = currencySymbol();
}


/* =============================================================================
   6. AFFICHAGE DES PAGES
   ============================================================================= */

// Redessine toute l’application. À appeler après chaque changement de données.
function renderAll() {
  applyTheme();
  $("currencySelect").value = state.currency;
  $("currencySuffix").textContent = currencySymbol();
  document.querySelector(".currencyMark").textContent = currencySymbol();
  $("monthLabel").textContent = monthLabel(dateISO(currentMonth).slice(0, 7));

  renderDashboard();
  renderTransactions();
  renderBudgets();
  renderStatistics();
}

// ---------- Tableau de bord ----------

function renderDashboard() {
  // Données du mois affiché
  const month = dateISO(currentMonth).slice(0, 7);
  const list = transactionsInMonth(month);
  const totalExpenses = expenses(list);
  const totalIncomes = incomes(list);
  const budget = Number(state.monthlyBudget) || 0;
  const remaining = budget - totalExpenses;

  // Cartes de résumé
  $("balanceValue").textContent = money(totalIncomes - totalExpenses);
  $("incomeValue").textContent = money(totalIncomes);
  $("expenseValue").textContent = money(totalExpenses);
  $("remainingValue").textContent = money(remaining);

  // Carte « Budget mensuel »
  $("budgetSpent").textContent = money(totalExpenses);
  $("budgetTotal").textContent = money(budget);
  $("budgetAvailable").textContent = money(remaining);

  // Pourcentage du budget utilisé (plafonné à 100 pour la barre de progression)
  const pct = budget ? Math.min(100, totalExpenses / budget * 100) : 0;
  $("budgetPercent").textContent = budget ? Math.round(totalExpenses / budget * 100) + "%" : "—";
  $("budgetProgress").style.width = pct + "%";

  // La barre devient orange à partir de 75 %, rouge à 100 %
  let progressClass = "progress-fill";
  if (pct >= 100) progressClass += " danger";
  else if (pct >= 75) progressClass += " warning";
  $("budgetProgress").className = progressClass;

  // Légende sous le montant restant.
  // NB : la condition Math.max(0, remaining) >= 0 est toujours vraie, donc le
  // texte « Dépassé » n’apparaît jamais (comportement d’origine conservé).
  $("budgetCaption").textContent = budget
    ? `${Math.max(0, remaining) >= 0 ? "Disponible" : "Dépassé"} · Budget mensuel`
    : "À définir";

  // Message d’encouragement selon la situation
  let status;
  if (!budget) {
    status = "Définis ton budget dans la page Budgets.";
  } else if (totalExpenses >= budget) {
    status = "Budget dépassé : pense à ajuster tes dépenses.";
  } else if (pct >= 75) {
    status = "Attention, tu approches de la limite de ton budget.";
  } else {
    status = "Tu es dans les limites de ton budget. Continue ainsi !";
  }
  $("budgetStatus").textContent = status;

  renderRecent(list);
  renderCategoryChart($("categoryChart"), list, $("chartEmpty"), $("categoryChartPeriod").value);
}

// Affiche les 5 dernières transactions du mois.
function renderRecent(list) {
  const latest = [...list]
    .sort((a, b) => b.date.localeCompare(a.date)) // la plus récente d’abord
    .slice(0, 5);

  $("recentTransactions").innerHTML = latest.length
    ? `<div class="transaction-list">${latest.map(transactionRow).join("")}</div>`
    : emptyState("🧾", "Aucune transaction ce mois-ci", "Ajoute une dépense ou un revenu pour commencer.");
}

// Construit le HTML d’une ligne de transaction (icône, nom, catégorie, date,
// montant et boutons modifier / supprimer).
function transactionRow(t) {
  const icon = ICONS[t.category] || "📌";
  const note = t.note ? ` · ${escapeHtml(t.note)}` : "";
  const date = new Date(t.date + "T12:00:00").toLocaleDateString("fr-FR", {
    day: "2-digit",
    month: "short",
    year: "numeric"
  });
  const sign = t.type === "income" ? "+" : "−";

  return `<div class="transaction-row">`
    + `<div class="transaction-name">`
    +   `<div class="transaction-icon">${icon}</div>`
    +   `<div><b>${escapeHtml(t.description)}</b><small>${escapeHtml(t.category)}${note}</small></div>`
    + `</div>`
    + `<div class="transaction-category">${escapeHtml(t.category)}</div>`
    + `<div class="transaction-date">${date}</div>`
    + `<div class="amount ${t.type}">${sign} ${money(t.amount)}</div>`
    + `<div class="row-actions">`
    +   `<button title="Modifier" data-edit="${t.id}">✎</button>`
    +   `<button title="Supprimer" data-delete="${t.id}">×</button>`
    + `</div>`
    + `</div>`;
}

// Message affiché quand une liste est vide (icône + titre + explication).
function emptyState(icon, title, desc) {
  return `<div class="empty-state"><div class="empty-icon">${icon}</div><b>${title}</b><span>${desc}</span></div>`;
}

// Graphique en anneau des dépenses par catégorie (page d’accueil).
// period vaut "month" (mois affiché) ou "all" (toutes les données).
function renderCategoryChart(canvas, list, emptyEl, period = "month") {
  const dataset = period === "all" ? state.transactions : list;
  const sums = sumExpensesByCategory(dataset);
  const labels = Object.keys(sums);
  const values = Object.values(sums);

  // Sans dépense, on affiche le message « Ajoute des dépenses… » à la place du graphique
  emptyEl.style.display = labels.length ? "none" : "grid";

  // Chart.js exige de détruire l’ancien graphique avant d’en créer un nouveau
  if (categoryChart) categoryChart.destroy();

  categoryChart = new Chart(canvas, {
    type: "doughnut",
    data: {
      labels,
      datasets: [{
        data: values,
        backgroundColor: CHART_COLORS,
        borderWidth: 0,
        hoverOffset: 6
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      cutout: "68%", // épaisseur de l’anneau
      plugins: {
        legend: {
          position: "bottom",
          labels: {
            usePointStyle: true,
            pointStyle: "circle",
            padding: 14,
            color: cssVar("--muted"),
            font: { size: 10 }
          }
        },
        tooltip: {
          callbacks: {
            label: (ctx) => `${ctx.label}: ${money(ctx.parsed)}`
          }
        }
      }
    }
  });
}

// ---------- Page « Transactions » ----------

// Affiche toutes les transactions en appliquant la recherche et les filtres.
function renderTransactions() {
  // Valeurs des filtres (les ? protègent si un élément n’existe pas encore)
  const query = ($("searchInput")?.value || "").toLowerCase();
  const type = $("typeFilter")?.value || "all";
  const category = $("categoryFilter")?.value || "all";
  const month = $("monthFilter")?.value || "";

  const list = [...state.transactions]
    .filter((t) => {
      const matchesSearch = !query
        || t.description.toLowerCase().includes(query)
        || t.category.toLowerCase().includes(query);
      const matchesType = type === "all" || t.type === type;
      const matchesCategory = category === "all" || t.category === category;
      const matchesMonth = !month || monthKey(t.date) === month;
      return matchesSearch && matchesType && matchesCategory && matchesMonth;
    })
    .sort((a, b) => b.date.localeCompare(a.date)); // la plus récente d’abord

  // Reconstruit la liste des catégories du filtre, puis restaure le choix en cours
  $("categoryFilter").innerHTML =
    '<option value="all">Toutes les catégories</option>'
    + categoryOptions([...EXPENSE_CATEGORIES, ...INCOME_CATEGORIES], true);
  $("categoryFilter").value = category;

  $("allTransactions").innerHTML = list.length
    ? `<div class="transaction-list">${list.map(transactionRow).join("")}</div>`
    : emptyState("🔎", "Aucun résultat", "Modifie tes filtres ou ajoute une transaction.");
}

// ---------- Page « Budgets » ----------

// Affiche une ligne par catégorie de dépense avec sa limite et sa progression.
function renderBudgets() {
  const list = transactionsInMonth(dateISO(currentMonth).slice(0, 7));
  $("globalBudgetInput").value = state.monthlyBudget || "";

  const rows = EXPENSE_CATEGORIES.map((cat) => {
    // Dépensé ce mois-ci dans cette catégorie
    const spent = list
      .filter((t) => t.type === "expense" && t.category === cat)
      .reduce((total, t) => total + Number(t.amount), 0);
    const limit = Number(state.categoryBudgets[cat]) || 0;
    const pct = limit ? Math.min(100, spent / limit * 100) : 0;

    // Couleur de la barre : rouge à 100 %, orange à 75 %, sinon violet
    let barColor = "var(--primary)";
    if (pct >= 100) barColor = "var(--red)";
    else if (pct >= 75) barColor = "var(--orange)";

    const limitText = limit ? ` / ${money(limit)}` : "";

    return `<div class="category-budget-row">`
      + `<div class="cat-name"><span>${ICONS[cat] || "📦"}</span>${cat}</div>`
      + `<div><input class="cat-budget-input" type="number" min="0" step="0.01" placeholder="Limite (€)" data-budget-cat="${escapeHtml(cat)}" value="${limit || ""}"></div>`
      + `<div class="cat-progress"><span style="width:${pct}%;background:${barColor}"></span></div>`
      + `<div class="cat-spent">${money(spent)}${limitText}</div>`
      + `</div>`;
  });

  $("categoryBudgets").innerHTML = rows.join("");
}

// ---------- Page « Statistiques » ----------

function renderStatistics() {
  const today = dateISO(currentMonth);
  const list = transactionsInMonth(monthKey(today));
  const monthExpenses = list.filter((t) => t.type === "expense");

  // Plus grande dépense du mois
  const biggest = [...monthExpenses].sort((a, b) => b.amount - a.amount)[0];
  $("biggestExpense").textContent = biggest ? money(biggest.amount) : "—";
  $("biggestExpenseName").textContent = biggest ? biggest.description : "Aucune dépense";

  // Moyenne quotidienne = dépenses du mois ÷ jour du mois (au moins 1)
  const days = Math.max(1, new Date(today).getDate());
  $("dailyAverage").textContent = money(expenses(list) / days);

  // Catégorie où l’on a le plus dépensé ce mois-ci
  const sums = sumExpensesByCategory(monthExpenses);
  const top = Object.entries(sums).sort((a, b) => b[1] - a[1])[0]; // [nom, total]
  $("topCategory").textContent = top ? top[0] : "—";
  $("topCategoryAmount").textContent = top ? money(top[1]) : "Pas encore de données";

  // --- Graphique en barres : revenus et dépenses mois par mois ---
  const monthsCount = Number($("statsPeriod")?.value || 6);
  const labels = [];       // noms des mois (axe horizontal)
  const incomeData = [];   // revenus de chaque mois
  const expenseData = [];  // dépenses de chaque mois

  // On remonte dans le temps : du mois le plus ancien jusqu’au mois affiché
  for (let i = monthsCount - 1; i >= 0; i--) {
    const d = new Date(currentMonth.getFullYear(), currentMonth.getMonth() - i, 1);
    const key = dateISO(d).slice(0, 7);
    const monthList = transactionsInMonth(key);

    labels.push(d.toLocaleDateString("fr-FR", { month: "short", year: "2-digit" }));
    incomeData.push(incomes(monthList));
    expenseData.push(expenses(monthList));
  }

  if (monthlyChart) monthlyChart.destroy();
  monthlyChart = new Chart($("monthlyChart"), {
    type: "bar",
    data: {
      labels,
      datasets: [
        { label: "Revenus", data: incomeData, backgroundColor: "#35b891", borderRadius: 5 },
        { label: "Dépenses", data: expenseData, backgroundColor: "#e76b7c", borderRadius: 5 }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          position: "bottom",
          labels: {
            usePointStyle: true,
            color: cssVar("--muted"),
            font: { size: 10 }
          }
        }
      },
      scales: {
        x: {
          grid: { display: false },
          ticks: { color: "var(--muted)" }
        },
        y: {
          grid: { color: cssVar("--border") },
          ticks: {
            color: "var(--muted)",
            callback: (value) => money(value) // montants formatés avec la devise
          }
        }
      }
    }
  });

  // --- Graphique en anneau : répartition de toutes les dépenses ---
  const allSums = sumExpensesByCategory(state.transactions);

  if (statsCategoryChart) statsCategoryChart.destroy();
  statsCategoryChart = new Chart($("statsCategoryChart"), {
    type: "doughnut",
    data: {
      labels: Object.keys(allSums),
      datasets: [{
        data: Object.values(allSums),
        backgroundColor: CHART_COLORS,
        borderWidth: 0
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      cutout: "62%",
      plugins: {
        legend: {
          position: "bottom",
          labels: {
            usePointStyle: true,
            color: cssVar("--muted"),
            padding: 12,
            font: { size: 10 }
          }
        },
        tooltip: {
          callbacks: {
            label: (ctx) => `${ctx.label}: ${money(ctx.parsed)}`
          }
        }
      }
    }
  });
}


/* =============================================================================
   7. ACTIONS : AJOUTER, SUPPRIMER, EXPORTER
   ============================================================================= */

// Enregistre le formulaire : crée une nouvelle transaction ou modifie une
// transaction existante (si le champ caché « transactionId » est rempli).
function saveTransaction(e) {
  e.preventDefault(); // empêche le rechargement de la page à l’envoi du formulaire

  // Vérification du montant
  const amount = Number($("amount").value);
  if (!amount || amount <= 0) {
    toast("Le montant doit être supérieur à zéro.");
    return;
  }

  // Une nouvelle transaction reçoit comme identifiant l’heure actuelle en millisecondes
  const id = $("transactionId").value || String(Date.now());
  const tx = {
    id,
    type: modalType,
    amount,
    description: $("description").value.trim(),
    category: $("transactionCategory").value,
    date: $("transactionDate").value,
    note: $("note").value.trim()
  };

  // Vérification des champs obligatoires
  if (!tx.description || !tx.date) {
    toast("Complète les champs obligatoires.");
    return;
  }

  // Si l’identifiant existe déjà, on remplace la transaction ; sinon on l’ajoute
  const index = state.transactions.findIndex((t) => t.id === id);
  if (index >= 0) state.transactions[index] = tx;
  else state.transactions.push(tx);

  saveState();
  closeModal();
  renderAll();
  toast(index >= 0 ? "Transaction modifiée ✓" : "Transaction ajoutée ✓");
}

// Supprime une transaction après confirmation.
function deleteTransaction(id) {
  if (!confirm("Supprimer cette transaction ?")) return;

  state.transactions = state.transactions.filter((t) => t.id !== id);
  saveState();
  renderAll();
  toast("Transaction supprimée");
}

// Télécharge toutes les transactions dans un fichier CSV (ouvrable avec Excel).
function exportCSV() {
  if (!state.transactions.length) {
    toast("Aucune transaction à exporter.");
    return;
  }

  // Ligne d’en-têtes, puis une ligne par transaction
  const rows = [
    ["Date", "Type", "Description", "Catégorie", "Montant", "Note"],
    ...state.transactions.map((t) => [t.date, t.type, t.description, t.category, t.amount, t.note || ""])
  ];

  // Chaque valeur est mise entre guillemets (les guillemets internes sont doublés),
  // les colonnes sont séparées par « ; » et les lignes par un retour à la ligne
  const csv = rows
    .map((row) => row.map((x) => `"${String(x).replaceAll('"', '""')}"`).join(";"))
    .join("\n");

  // "\uFEFF" aide Excel à reconnaître l’encodage UTF-8 (accents)
  const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);

  // Simule un clic sur un lien de téléchargement temporaire
  const link = document.createElement("a");
  link.href = url;
  link.download = "spendwise-transactions.csv";
  link.click();
  URL.revokeObjectURL(url);

  toast("Export CSV téléchargé");
}


/* =============================================================================
   8. ÉCOUTEURS D’ÉVÉNEMENTS
   ============================================================================= */

// --- Navigation ---

// Boutons du menu latéral
document.querySelectorAll(".nav-item[data-page]").forEach((b) => {
  b.addEventListener("click", () => showPage(b.dataset.page));
});

// Boutons « Voir le budget », « Tout voir »… qui mènent à une autre page
document.querySelectorAll("[data-goto]").forEach((b) => {
  b.addEventListener("click", () => showPage(b.dataset.goto));
});

// Bouton « menu » sur téléphone
$("mobileMenu").onclick = () => $("sidebar").classList.toggle("open");

// Navigation entre les mois
$("prevMonth").onclick = () => {
  currentMonth = new Date(currentMonth.getFullYear(), currentMonth.getMonth() - 1, 1);
  renderAll();
};
$("nextMonth").onclick = () => {
  currentMonth = new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1, 1);
  renderAll();
};

// --- Fenêtre d’ajout / modification ---

// Boutons « Ajouter » (en haut et sur la page Transactions)
$("quickAdd").onclick = $("addTransactionBtn").onclick = () => openModal();

// Fermeture : bouton ×, bouton « Annuler », clic en dehors de la fenêtre, touche Échap
$("closeModal").onclick = $("cancelModal").onclick = closeModal;
$("modalOverlay").addEventListener("click", (e) => {
  if (e.target === $("modalOverlay")) closeModal();
});
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape") closeModal();
});

// Bascule entre « Dépense » et « Revenu »
document.querySelectorAll(".type-toggle button").forEach((b) => {
  b.onclick = () => {
    modalType = b.dataset.type;
    updateTypeButtons();
  };
});

// Envoi du formulaire
$("transactionForm").addEventListener("submit", saveTransaction);

// Boutons ✎ (modifier) et × (supprimer) des lignes de transaction.
// Ces boutons sont créés dynamiquement : on écoute donc les clics sur toute la page.
document.addEventListener("click", (e) => {
  const editButton = e.target.closest("[data-edit]");
  const deleteButton = e.target.closest("[data-delete]");

  if (editButton) {
    const tx = state.transactions.find((t) => t.id === editButton.dataset.edit);
    if (tx) openModal(tx.type, tx);
  }
  if (deleteButton) deleteTransaction(deleteButton.dataset.delete);
});

// --- Filtres et graphiques ---

// Recherche et filtres de la page Transactions : mise à jour à chaque saisie
["searchInput", "typeFilter", "categoryFilter", "monthFilter"].forEach((id) => {
  $(id).addEventListener("input", renderTransactions);
});

// Sélecteurs de période des graphiques
$("categoryChartPeriod").onchange = () => renderDashboard();
$("statsPeriod").onchange = renderStatistics;

// --- Budgets ---

// Budget global mensuel
$("globalBudgetForm").onsubmit = (e) => {
  e.preventDefault();
  state.monthlyBudget = Math.max(0, Number($("globalBudgetInput").value) || 0);
  saveState();
  renderAll();
  toast("Budget mensuel enregistré ✓");
};

// Limites par catégorie (les champs sont créés dynamiquement par renderBudgets)
$("categoryBudgets").addEventListener("change", (e) => {
  const input = e.target.closest("[data-budget-cat]");
  if (!input) return;

  state.categoryBudgets[input.dataset.budgetCat] = Math.max(0, Number(input.value) || 0);
  saveState();
  renderAll();
  toast("Budget de catégorie mis à jour");
});

// --- Paramètres ---

// Changement de thème (bouton en haut et bouton dans les paramètres)
$("themeToggle").onclick = $("settingsTheme").onclick = () => {
  state.dark = !state.dark;
  saveState();
  applyTheme();
  renderAll();
};

// Changement de devise
$("currencySelect").onchange = () => {
  state.currency = $("currencySelect").value;
  saveState();
  renderAll();
  toast("Devise mise à jour");
};

// Export CSV
$("exportCsv").onclick = exportCSV;

// Réinitialisation : efface transactions et budgets mais garde devise et thème
$("resetData").onclick = () => {
  const confirmed = confirm(
    "Es-tu sûr de vouloir effacer toutes les transactions et tous les budgets ? Cette action est irréversible."
  );
  if (confirmed) {
    state = { ...defaultState, currency: state.currency, dark: state.dark };
    saveState();
    renderAll();
    toast("Données réinitialisées");
  }
};


/* =============================================================================
   9. DÉMARRAGE
   ============================================================================= */

// Le filtre de mois de la page Transactions démarre sur le mois en cours
$("monthFilter").value = dateISO().slice(0, 7);

// Premier affichage de l’application
renderAll();