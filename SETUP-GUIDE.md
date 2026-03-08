# SplitMate — Setup Guide

## What You're Getting
A self-hosted, invite-only group expense tracker that:
- Uses **your own Google Sheet** as the database
- Authenticates via **Google OAuth** (only invited emails can access)
- Runs as a **single HTML file** you host anywhere for free
- Supports **split equally**, **split unequally**, and **split by %**
- Multi-currency support (INR, USD, EUR, GBP, JPY, AED, SGD, THB)
- Visual charts (category, per-person, timeline)
- Settlement calculator: who owes whom

---

## Step 1 — Google Cloud Setup (One-time, ~10 mins)

### 1.1 Create a Project
1. Go to [console.cloud.google.com](https://console.cloud.google.com)
2. Click **"New Project"** → Name it `SplitMate`
3. Click **Create**

### 1.2 Enable APIs
1. Go to **APIs & Services → Library**
2. Search for and enable:
   - **Google Sheets API**
   - **Google Drive API**

### 1.3 Create OAuth Credentials
1. Go to **APIs & Services → Credentials**
2. Click **"+ Create Credentials" → OAuth Client ID**
3. If prompted, configure the **OAuth Consent Screen** first:
   - User Type: **External**
   - App name: `SplitMate`
   - Add your email as test user (and all friend emails)
4. Application type: **Web application**
5. Name it `SplitMate Web`
6. Under **Authorized JavaScript origins**, add:
   - `http://localhost:8080` (for local testing)
   - `https://yourdomain.github.io` (your hosted URL)
7. Under **Authorized redirect URIs**, add the same URLs
8. Click **Create** → Copy your **Client ID**

---

## Step 2 — Configure the HTML File

Open `expense-tracker.html` in a text editor. Find these lines near the top of the `<script>` section:

```javascript
const CLIENT_ID = 'YOUR_GOOGLE_OAUTH_CLIENT_ID';   // ← Paste your Client ID here

const ALLOWED_EMAILS = [                             // ← Add friend emails
  'you@gmail.com',
  'friend1@gmail.com',
  'friend2@gmail.com',
];
```

Replace the values with your actual Client ID and the Google email addresses of everyone you want to allow in.

> ⚠️ If `ALLOWED_EMAILS` is empty (`[]`), ANY Google account can sign in. Always fill this in before sharing.

---

## Step 3 — Create Your Google Sheet

1. Go to [sheets.google.com](https://sheets.google.com) → Create a **blank spreadsheet**
2. Name it `SplitMate Expenses`
3. Copy the **Sheet ID** from the URL:
   ```
   https://docs.google.com/spreadsheets/d/[THIS_IS_YOUR_SHEET_ID]/edit
   ```
4. The app will **auto-create** three tabs:
   - `Expenses` — all expense rows
   - `Members` — group member names
   - `Trips` — trip/event names

### Sheet Schema (auto-created)

**Expenses tab columns:**
| Column | Field | Example |
|--------|-------|---------|
| A | ID | exp_1234567890 |
| B | Date | 2025-01-15 |
| C | Name | Dinner at Olive Garden |
| D | Category | 🍽️ Food & Drinks |
| E | Amount | 2400.00 |
| F | Currency | INR |
| G | PaidBy | Alice |
| H | Trip | Goa Trip 2025 |
| I | SplitType | equal |
| J | Splits | {"Alice":400,"Bob":400,...} |
| K | Notes | Birthday dinner |
| L | AddedBy | Alice |
| M | Timestamp | 2025-01-15T19:23:00Z |

---

## Step 4 — Connect the Sheet in the App

1. Open the app (sign in first)
2. Go to **Settings**
3. Paste your Sheet ID in the **Spreadsheet ID** field
4. Click **Save & Connect**
5. The app will initialize all tabs and headers automatically

---

## Step 5 — Host the App (Free Options)

### Option A: GitHub Pages (Recommended)
1. Create a GitHub account (free)
2. Create a new **public repository**
3. Upload `expense-tracker.html` and rename it `index.html`
4. Go to Settings → Pages → Source: **main branch**
5. Your URL: `https://yourusername.github.io/repository-name`

### Option B: Netlify
1. Go to [netlify.com](https://netlify.com) → Sign up free
2. Drag and drop the HTML file onto the dashboard
3. Get an instant URL like `https://splitmate-abc123.netlify.app`

### Option C: Vercel
1. Go to [vercel.com](https://vercel.com)
2. Deploy via CLI or drag & drop
3. Get URL like `https://splitmate.vercel.app`

> After hosting, **go back to your Google Cloud credentials** and add your new hosted URL to the authorized origins/redirect URIs list.

---

## Step 6 — Add Members & Trips

1. In the app, go to **Settings → Group Members**
2. Add each person's name (email optional)
3. Click **Save Members**
4. Under **Trips / Events**, add your trip names
5. Click **Save Trips**

---

## Usage Guide

### Adding an Expense
1. Click **"Add Expense"** in the sidebar
2. Fill in: Name, Category, Amount, Currency, Date
3. Select **who paid**
4. Choose split type:
   - **Split Equally**: Check the members included
   - **Split Unequally**: Enter exact amounts per person (must total the expense)
   - **By Percent**: Enter % per person (must total 100%)
5. Click **Save Expense**

### Viewing Settlements
- Go to **Settlement** tab
- Shows simplified "who owes whom" with minimum transactions
- Filter by trip to see settlements per event

### Editing / Deleting
- Go to **History**
- Click any expense card to edit or delete

### Syncing
- Click 🔄 **Sync** in History to reload from Google Sheets
- Any changes made directly in the Sheet will appear after syncing

---

## Tips

- **Multiple currencies**: Amounts are stored as-is. The settlement page uses the currency of each expense — for multi-currency trips, manually convert to one currency before entering.
- **Up to 15 people**: Tested and optimized for 9–15 person groups.
- **Invite control**: Only emails in `ALLOWED_EMAILS` can log in. To add a new friend, update the HTML file and redeploy.
- **Data ownership**: All data is in your Google Drive. You can view/edit the Sheet directly at any time.
- **Demo mode**: If `CLIENT_ID` is not set, the app runs in Demo Mode with sample data — great for previewing.
