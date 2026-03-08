# SplitMate — Setup Guide

## What You're Getting

A self-hosted, invite-only group expense tracker that:
- Uses **your own Google Sheet** as the database — full data ownership
- Authenticates via **Google OAuth** — only members you add can access
- Runs as a **single HTML file** you can host anywhere for free
- **Google Apps Script** backend handles all sheet operations securely
- Split equally, unequally, or by percentage
- Multi-currency support: INR, USD, EUR, GBP, JPY, AED, SGD, THB
- Visual charts: spending by category, per-person, and over time
- Settlement calculator with partial payment support
- Email notifications via EmailJS (reminders, settlement confirmations)
- Dark / light theme — saved per user in the sheet
- Request Access flow for new users on the login page

---

## Architecture Overview

```
Browser (index.html)
  └─ Google OAuth (identity only — no spreadsheet scope)
  └─ Google Apps Script Web App  ←→  Google Sheet
  └─ EmailJS  (email notifications)
```

All sheet read/write operations go through your Apps Script web app — deployed under your Google account. The HTML file never touches the sheet directly.

---

## Step 1 — Google Cloud Setup

### 1.1 Create a Project
1. Go to [console.cloud.google.com](https://console.cloud.google.com)
2. Click **New Project** → Name it `SplitMate` → **Create**

### 1.2 Configure OAuth Consent Screen
1. Go to **APIs & Services → OAuth consent screen**
2. User Type: **External** → **Create**
3. Fill in:
   - App name: `SplitMate`
   - User support email: your email
   - Developer contact email: your email
4. Click **Save and Continue** through the remaining steps
5. Under **Test users**, add all email addresses that will use the app

### 1.3 Create OAuth Credentials
1. Go to **APIs & Services → Credentials**
2. Click **+ Create Credentials → OAuth Client ID**
3. Application type: **Web application**
4. Name it `SplitMate Web`
5. Under **Authorized JavaScript origins**, add your hosted URL (e.g. `https://your-app.netlify.app`)
   - Also add `http://localhost:8080` for local testing
6. Under **Authorized redirect URIs**, add the same URLs
7. Click **Create** → copy your **Client ID**

---

## Step 2 — Create Your Google Sheet

1. Go to [sheets.google.com](https://sheets.google.com) → create a **blank spreadsheet**
2. Name it `SplitMate`
3. Copy the **Sheet ID** from the URL:
   ```
   https://docs.google.com/spreadsheets/d/YOUR_SHEET_ID_IS_HERE/edit
   ```
4. Leave the sheet blank — the app will auto-create all tabs and headers when you first connect.

### Sheet Tabs (auto-created by the app)

| Tab | Contents |
|-----|----------|
| `Expenses` | All expense rows |
| `Members` | Member names + emails (access control) |
| `Trips` | Trip / event names |
| `Settlements` | Recorded payments between members |
| `Settings` | Active trip, email notifications toggle, per-user theme |

### Expenses Tab Schema

| Col | Field | Example |
|-----|-------|---------|
| A | ID | `exp_1234567890` |
| B | Date | `2025-01-15` |
| C | Name | `Dinner at Olive Garden` |
| D | Category | `🍽️ Food & Drinks` |
| E | Amount | `2400.00` |
| F | Currency | `INR` |
| G | PaidBy | `Alice` |
| H | Trip | `Goa 2025` |
| I | SplitType | `equal` |
| J | Splits | `{"Alice":800,"Bob":800,...}` |
| K | Notes | `Birthday dinner` |
| L | AddedBy | `alice@gmail.com` |
| M | Timestamp | `2025-01-15T19:23:00Z` |

---

## Step 3 — Deploy the Apps Script Backend

The backend (`apps-script/Code.gs`) runs under your Google account and handles all sheet operations.

1. Go to [script.google.com](https://script.google.com) → **New project**
2. Name it `SplitMate Backend`
3. Delete the default code and paste the full contents of `apps-script/Code.gs`
4. Fill in the config at the top:
   ```javascript
   const SHEET_ID  = 'YOUR_GOOGLE_SHEET_ID';        // from Step 2
   const CLIENT_ID = 'YOUR_GOOGLE_OAUTH_CLIENT_ID';  // from Step 1.3
   const ADMIN_EMAILS = [
     'your-admin@gmail.com'   // your email — grants full settings access
   ];
   ```
5. Click **Deploy → New deployment**
   - Type: **Web App**
   - Execute as: **Me**
   - Who has access: **Anyone**
6. Click **Deploy** → copy the `/exec` URL — you'll need it in Step 4

> ⚠️ Every time you change `Code.gs`, go to **Deploy → Manage deployments → Edit → New version → Deploy** to publish your changes.

---

## Step 4 — Configure `index.html`

Open `index.html` in a text editor. Find the configuration block near the top of the `<script>` section and fill in your values:

```javascript
const CLIENT_ID = 'YOUR_GOOGLE_OAUTH_CLIENT_ID';   // ← from Step 1.3

const ADMIN_EMAILS = [
  'your-admin@gmail.com'   // ← your email (must match Code.gs)
];

const SCRIPT_URL = 'YOUR_APPS_SCRIPT_WEB_APP_URL'; // ← /exec URL from Step 3

const SHEET_ID = 'YOUR_GOOGLE_SHEET_ID';           // ← from Step 2

// EmailJS (Step 5)
const EMAILJS_SERVICE_ID  = 'YOUR_EMAILJS_SERVICE_ID';
const EMAILJS_TEMPLATE_ID = 'YOUR_EMAILJS_TEMPLATE_ID';
const EMAILJS_PUBLIC_KEY  = 'YOUR_EMAILJS_PUBLIC_KEY';

const APP_URL = 'https://your-app.netlify.app';    // ← your hosted URL
```

> `ADMIN_EMAILS` in `index.html` and `Code.gs` must be identical. Admin users get full Settings access (manage members, trips, active trip, email notifications toggle).

---

## Step 5 — Set Up EmailJS (Optional but Recommended)

EmailJS sends email notifications without a server — free tier allows 200 emails/month.

1. Sign up at [emailjs.com](https://www.emailjs.com)
2. **Add an Email Service** (connect Gmail or another provider) → copy the **Service ID**
3. **Create an Email Template** with the following variables:
   - `{{to_name}}` — recipient name
   - `{{to_email}}` — recipient email
   - `{{subject}}` — email subject
   - `{{message}}` — email body
   - `{{app_url}}` — link back to the app
4. Copy the **Template ID**
5. Go to **Account → Public Key** → copy it
6. Paste all three values into `index.html` (see Step 4)

Email notifications are used for:
- **Settlement confirmation** — sent to both parties when a payment is recorded
- **Payment reminders** — sent to the person who owes money
- **Access requests** — sent to the admin inbox when a new user requests access

> The admin can enable/disable email notifications app-wide from **Settings → Notifications**.

---

## Step 6 — Host the App

### Option A: Netlify (Recommended)
1. Go to [netlify.com](https://netlify.com) → sign up free
2. Drag and drop the project folder (containing `index.html` and `images/`) onto the dashboard
3. Get an instant URL like `https://splitmate-abc123.netlify.app`

### Option B: GitHub Pages
1. Push the project to a public GitHub repository
2. Go to **Settings → Pages → Source: main branch → / (root)**
3. Your URL: `https://yourusername.github.io/repository-name`

### Option C: Vercel
1. Go to [vercel.com](https://vercel.com) → deploy via drag & drop or CLI
2. Get a URL like `https://splitmate.vercel.app`

> After hosting, go back to your **Google Cloud OAuth credentials** and add the final URL to the **Authorized JavaScript origins** and **Authorized redirect URIs** lists.

---

## Step 7 — First Launch

1. Open the app → **Sign in with Google** (using your admin email)
2. Go to **Settings → Google Sheets Connection**
3. Paste your Sheet ID → click **Save & Connect**
4. The app calls Apps Script to create all tabs and headers automatically
5. Add your group members under **Settings → Group Members** (name + email required)
6. Add trip names under **Settings → Trips / Events**
7. Click **💾 Save to Sheet** for both

Members will be able to sign in with Google once their email is in the Members tab — no code changes needed.

---

## Access Control

| Role | How it's set | What they can do |
|------|-------------|-----------------|
| **Admin** | `ADMIN_EMAILS` in `index.html` + `Code.gs` | Full settings, manage members/trips, toggle notifications |
| **Member** | Added via Settings → Group Members (email required) | Add/edit/delete expenses, record settlements |

- Members who aren't in the Members tab are **blocked at login** — they see an "Access denied" error
- New users can click **Request Access** on the login page — this checks the sheet first and only sends an email to the admin if they don't already have access

---

## Usage Guide

### Adding an Expense
1. Click **Add Expense** in the sidebar
2. Fill in: Name, Category, Amount, Currency, Date, Paid By
3. Choose a split type:
   - **Equal** — select which members to include; amount divided equally
   - **Unequal** — enter an exact amount per person (must total the expense)
   - **By %** — enter a percentage per person (must total 100%)
4. Click **Save Expense** — written to the sheet immediately

### Recording a Settlement
1. Go to **Settlement** → click **Settle Up** on any outstanding balance
2. Choose **Full** or **Partial** payment, add an optional note
3. Click **Confirm** — settlement is saved and confirmation emails are sent (if enabled)

### Adding Members (Admin only)
1. Go to **Settings → Group Members**
2. Enter name + email → **Add**
3. Click **💾 Save to Sheet**
4. The new member can sign in immediately — no redeployment needed

### Theme (Dark / Light Mode)
- Click the **moon/sun icon** in the sidebar to toggle between dark and light mode
- Your preference is automatically saved to the sheet under your email
- It is restored every time you sign in — no need to re-set it per device

### Email Notifications (Admin only)
- Go to **Settings → Notifications**
- Toggle the **Email Notifications** switch on or off
- This is an **app-level setting** — it affects all members
- When off, no reminder or settlement confirmation emails are sent to anyone
- Members can see the current status (read-only) on their Info page
- Access request emails to the admin inbox are **always sent** regardless of this setting

### Syncing
- Click **🔄 Sync** to pull the latest data from the sheet
- All members see the same data — synced from the central sheet

---

## Tips

- **Access control is live** — add or remove a member email in the sheet and it takes effect on their next login, no code change required
- **Multiple currencies** — amounts are stored as entered; the settlement page groups by currency. For mixed-currency trips, convert to one currency manually before entering
- **Theme** — each user's dark/light preference is saved to the sheet under their email and restored automatically on next login
- **Data ownership** — everything lives in your Google Drive sheet; you can view, export or edit it directly at any time
- **Admin inbox for requests** — update the `to_email` in the `submitAccessRequest` function in `index.html` to your actual email before deploying
