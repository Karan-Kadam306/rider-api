# Team leader manual test

A step-by-step check of every team leader feature in the admin panel, using `rider_demo`.
Do the steps in order: later steps expect the earlier ones to have happened.
Start again at any time with `npm run demo:setup`.

## 0. Setup

1. `npm run demo:setup`. It prints the logins; every password is `demo-pass-123`.
2. In `.env`, change the database name at the end of `DATABASE_URL` to `rider_demo`
   (change it back when you finish). For step 10's payment link, also set `ENABLE_MOCK_PAY=true`
   and any `PAYMENT_WEBHOOK_SECRET`.
3. Start the API (`npm start`) and the panel (`cd admin-ui && npm run dev`), then open http://localhost:5173.
4. Use two browser windows, a normal one and a private one, so you can stay signed in as two people.
   **Window A** is the admin. **Window B** is the team leader.

| Login | Role | Holds |
|---|---|---|
| admin@demo.local | Admin | — |
| staff@demo.local | Staff | — |
| ravi.tl@demo.local | Team leader | Neha, Sanjay, Farhan, Pooja, Kiran, Dev, Anil (DM-009 to DM-015) |
| sunita.tl@demo.local | Team leader | Amit (DM-001), Meera (DM-008), Neha (shared with Ravi) |
| imran.tl@demo.local | Team leader | nobody |

## 1. Analytics baseline (A: admin)

Open **Analytics** (8 weeks). Scroll to **Team leaders**.

| Team leader | Riders | Calls | Promises kept / broken | Dues recovered | Owing now |
|---|---|---|---|---|---|
| Imran Shaikh | 0 | 0 (0 riders) | 0 / 0 of 0 | ₹0 (0 paid) | ₹0 (0 riders) |
| Ravi Kumar | 7 | 4 (4 riders) | 1 / 1 of 3 | ₹300 (1 paid) | ₹850 (3 riders) |
| Sunita Rao | 3 | 0 (0 riders) | 0 / 0 of 0 | ₹0 (0 paid) | ₹770 (2 riders) |

Why: Kiran's ₹300 charge was paid after his promise (kept, recovered). Neha's promise date passed
unpaid (broken). Neha ₹420, Sanjay ₹280 and Farhan ₹150 owe from last week (₹850). Sunita has Neha and Meera (₹350).

## 2. Users and roles (A: admin)

| Do | Expect |
|---|---|
| Open **Users** | Ravi, Sunita and Imran have a green **Team leader** badge |
| Click **Add user** and open the Role list | The options include "Team leader — sees only the riders assigned to them" (close without saving) |
| Look at the top bar | Your role reads "Admin" |

## 3. Assigning team leaders (A: admin, then staff)

| Do | Expect |
|---|---|
| Open rider **DM-009 Neha** | The Overview has a **Team leaders** section with *Ravi Kumar* and *Sunita Rao* |
| Open **DM-002 Sneha**, pick *Imran Shaikh · 0 riders*, click **Add** | Toast "Imran Shaikh now leads Sneha Kulkarni"; Imran's name appears |
| Click **Add** again with nothing chosen | The button is disabled |
| Click **×** on Imran | Toast; "No team leader assigned." |
| Open **DM-006 Kavya** (terminated) | The section shows, but there's no picker |
| Sign out and sign in as **staff@demo.local**, open Neha | Team leaders shown with no × and no picker; **Log follow-up** shows; no **Escalate** button; no **Users** in the sidebar |
| As staff, open **Analytics** | The Team leaders table loads |

Sign back in as **admin** in window A.

## 4. Team leader access (B: Ravi)

| Do | Expect |
|---|---|
| Sign in as **ravi.tl@demo.local** | You land on **Critical Queue**. The sidebar shows only *Critical Queue* (badge **4**) and *My Riders*. The top bar reads "Team leader" |
| Read the queue | 1. 🔴 **Neha**: "Promised to pay ₹420 by …, not paid" and "Owes ₹420…", **Call due**, last follow-up 3 days ago. 2. 🟠 **Farhan**: owes ₹150, last follow-up *Never*, **Call due**. 3. 🟠 **Sanjay**: owes ₹280, "Promised ₹280 by …" (in 2 days), no Call due. 4. ⚪ **Pooja**: "Lowest km: 35 km in the last 7 days" |
| Check who is missing | Dev and Anil have even less km but aren't listed (Dev on approved leave, Anil's bike is 2 days old). Kiran owes nothing |
| Open **My Riders** | 7 riders. Farhan, Neha and Sanjay come first with **Owes now** amounts; the rest say *Nothing* |
| Search `Pooja` | Only Pooja |
| Click a phone number | It opens your dialler / `tel:` link |
| Type `/bikes` in the address bar | You're sent back to Critical Queue |
| Type `/riders/DM-002` | "Rider not found" (Sneha isn't Ravi's) |
| Type `/riders/DM-001` | "Rider not found" (Amit is Sunita's, not Ravi's) |
| Open **Neha** from the queue | It opens her **Follow-ups** tab with Ravi's promise note. There are no Billing or Partner Mappings links, and the back link says *My Riders* |

## 5. Logging follow-ups (B: Ravi)

Open **Farhan (DM-011)** and click **Log follow-up**.

| Do | Expect |
|---|---|
| Click **Save** with nothing filled in | "Choose what the rider said" and "Write down what the rider said" |
| Choose Outcome *Promised to Pay*, then Save | Promised date and amount appear; "Enter the date the rider promised to pay" |
| Type amount `12.345` | "Enter an amount in rupees…" |
| Look at the date picker | Only today up to 30 days ahead can be picked |
| Change Outcome to **Unreachable**, note `Phone switched off, will try evening`, then Save | Toast "Follow-up saved"; the **Follow-ups** tab opens with your note, *Unreachable*, and "Ravi Kumar · Team leader" |
| Look for edit or delete on the follow-up | There's none; the dialog said it can't be edited |
| Go to **Critical Queue** and refresh | Farhan is still High, but last follow-up is "now" and **Call due** is gone |

## 6. Team leader Record escalation (B: Ravi)

Open **Pooja (DM-012)** and click **Record escalation**.

| Do | Expect |
|---|---|
| Look at the reasons | No *Payment Due*; no Amount field; "Recorded only, with no bike lock or payment link." |
| Tick *Attendance Issues*, comment `Missed 3 shifts`, Create | Toast; the Escalations tab shows a **Record** with no lock or payment link |
| Look for Close / Mark as paid | None (admins only) |

## 7. Queue alert and badge (A: admin, B: Ravi stays on any page)

| Do | Expect |
|---|---|
| A: open **Kiran (DM-013)**, **Escalate**, tick *Bike Misuse*, amount `100`, Create | Toast "Escalation raised"; no promise warning (Kiran's promise was kept) |
| B: wait up to 2 minutes without refreshing | Red toast "Kiran Desai needs attention: Bike locked: open escalation of ₹100.00"; the badge goes from 4 to **5** |

## 8. Promise warning before locking, then paid (A: admin)

Open **Sanjay (DM-010)**.

| Do | Expect |
|---|---|
| Look above the tabs | Blue banner "Promised to pay ₹280 by … — logged by Ravi Kumar" |
| **Escalate**, tick *Payment Due* | Amount fixed at 280, plus a blue box: "Ravi Kumar logged a promise to pay ₹280 by …" with **Lock the bike anyway** |
| Click **Create** without ticking | "Tick the box to lock the bike despite the promise" |
| Tick it and **Create** | Toast; in the Escalations tab the *Raised* step says "Raised despite a payment promise due …" |
| Click **Mark as paid**, reference `UPI-TEST-1` | Status *Paid*; the blue promise banner is gone (the payment kept the promise) |
| B (Ravi): refresh Critical Queue | Sanjay is gone |

## 9. Promise logged after the admin opened the page (A and B)

| Do | Expect |
|---|---|
| A: open **Neha (DM-009)** and leave it open | No blue banner (her old promise is overdue, not due) |
| B: open Neha, **Log follow-up**: *Promised to Pay*, date 3 days ahead, amount 420, note `Will clear on Monday`, Save | Saved |
| A: without refreshing, **Escalate**, *Bike Misuse*, amount `200`, Create | No error message. Instead the blue box appears with the server's message and **Lock the bike anyway** |
| A: tick it, **Create** | Escalation raised |
| B: refresh Critical Queue | Neha shows "open escalation of ₹200.00" (no bike, so nothing locked) and the new "Promised ₹420 by …"; the old *promise broken* line is gone |

## 10. "Says paid", then a real payment clears the queue (B: Ravi, A: admin)

| Do | Expect |
|---|---|
| B: open **Farhan (DM-011)**, **Log follow-up**, Outcome **Says paid** | A note under it: "Records what the rider said. The amount stays owed until an admin records the payment…" |
| B: note `Paid cash at the hub`, Save, then refresh Critical Queue | Farhan stays (High): "Says paid on …: waiting for an admin to confirm". No **Call due**: it's the admin's turn |
| A: open **Farhan** | Blue banner "Ravi Kumar says the rider paid (…): “Paid cash at the hub”. Check the money arrived, then use Mark as paid…" |
| A: **Escalate**, tick *Payment Due* (no promise box: Farhan has no promise), Create | Payment Due of ₹150 raised |
| Either **Mark as paid** (`UPI-TEST-2`), or open the payment link on the escalation and swipe to pay (needs `ENABLE_MOCK_PAY`) | Status *Paid* |
| B (Ravi): refresh Critical Queue | Farhan is gone, even though next week's payout hasn't run |
| B: **My Riders** | Farhan shows *Nothing* under Owes now |
| A: refresh Farhan's page | The "says the rider paid" banner is gone |

Payment Due is also raised automatically when a payout run leaves a rider negative (link and lock;
link only while a promise is due). The demo's last-week payout is already seeded, so this part is
covered by the automated tests (`tests/integration/autoPaymentDue.test.js`) rather than this walkthrough.

## 11. Low km fairness (A: admin)

| Do | Expect |
|---|---|
| Open **Dev (DM-014)** from **Rider Management** → *Inactive days* (top of the rider page) | An approved leave covering 3 days last week |
| Open **Anil (DM-015)** Overview | Current bike since 2 days ago |
| B (Ravi) queue | Only Pooja has a *Lowest km* reason |

## 12. Analytics after the steps (A: admin)

Refresh **Analytics** → Team leaders.

| Team leader | Riders | Calls | Promises kept / broken | Dues recovered | Owing now |
|---|---|---|---|---|---|
| Ravi Kumar | 7 | 7 (5 riders) | 2 / 1 of 4 | ₹730 (3 paid) | ₹420 (1 rider) |
| Sunita Rao | 3 | 0 (0 riders) | 0 / 0 of 0 | ₹0 (0 paid) | ₹770 (2 riders) |
| Imran Shaikh | 0 | 0 | 0 / 0 of 0 | ₹0 | ₹0 |

Why:
- **Calls:** Farhan twice (steps 5 and 10) and Neha's new promise (step 9) add three calls; those riders were already counted, so still 5 riders.
- **"Says paid" doesn't count as a kept promise.** Only a recorded payment does.
- **Promises kept:** Sanjay's became kept when he paid.
- **Recovered:** Sanjay's ₹280 and Farhan's ₹150 join Kiran's ₹300. The ₹100 and ₹200 charges are still open.
- **Owing now:** only Neha still owes.
- **Sunita:** recovered nothing, because Sanjay and Farhan aren't her riders.

| Do | Expect |
|---|---|
| B (Ravi): type `/analytics` | Sent back to Critical Queue |

## 13. Role change removes team leader access (A: admin)

| Do | Expect |
|---|---|
| **Users**, edit *Sunita Rao*, role **Staff**, Save | Saved |
| Open **Neha** | Team leaders now lists only *Ravi Kumar* |
| Open **Analytics** | Sunita is no longer in the Team leaders table |
| Sign in as sunita.tl@demo.local | She gets the staff panel (Dashboard, riders, …), with no Critical Queue |

## Reset

`npm run demo:setup` puts everything back. Remember to switch `DATABASE_URL` back to your main database.

Notes:
- The seed adds km and payouts for last week, so the **Payouts** page may show last week as changed
  since its payout. That's expected for the demo and not part of this test.
- Amounts in queue labels show paise (₹420.00); the tables show the same amounts formatted.
