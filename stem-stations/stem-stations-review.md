# STEM Stations — Reviewer Guide

**Reviewer:** ___________________ **Date:** ___________________ **Browser/OS:** ___________________

---

## Overview

STEM Stations is a choice board web page for NYC FIRST students in self paced digital learning. It presents a curated set of external STEM tools organized into category sections with clickable cards. Your job is to verify the page loads and navigates correctly, all links work and open properly, and the content is accurate and appropriate for students. 

**Live page:** http://nycfirst-d13.github.io/stem-stations/stem-stations/

---

## 1. Page & Navigation

Open the live page and check each item.

- [ ] Page loads without errors
- [ ] Header and logo display correctly
- [ ] Subtitle text is readable
- [ ] Tab bar is visible and all 7 tabs appear (Robotics, Coding, 2D Design, 3D Design, Science, Math, Creative)
- [ ] Clicking a tab scrolls to the correct section
- [ ] Active tab is visually highlighted
- [ ] Page is fully scrollable to the bottom

---

## 2. Links — by Category

For each link: click the card, confirm it opens in a new tab, confirm the page loads, and confirm it matches its description.

**Robotics**
- [ ] micro:bit MakeCode — opens, loads
- [ ] LEGO SPIKE Prime — opens, loads
- [ ] FLL Robot Simulator — opens, loads

**Coding**
- [ ] MakeCode Arcade — opens, loads
- [ ] Code.org — opens, loads
- [ ] Blockly Games — opens, loads
- [ ] Raspberry Pi Code Clubs — opens, loads
- [ ] CodeMonkey — opens, loads
- [ ] RoboCodo — opens, loads

**2D Design**
- [ ] Canva for Education — opens, loads
- [ ] Adobe Express — opens, loads (note: requires DOE login via TeachHub)
- [ ] Pixilart — opens, loads

**Login friction — for any tool requiring a school/DOE login (Adobe Express, MakeCode Arcade, etc.):**

| Tool | Login worked? | Flow clear for a student? | Notes |
|---|---|---|---|
| Adobe Express | | | |
| MakeCode Arcade | | | |
| | | | |

**3D Design**
- [ ] Tinkercad — opens, loads
- [ ] Tinkercad Codeblocks — opens, loads

**Science**
- [ ] PhET Simulations — opens, loads
- [ ] NASA Climate Kids — opens, loads
- [ ] Google Earth — opens, loads

**Math**
- [ ] GeoGebra — opens, loads
- [ ] Prodigy Math — opens, loads

**Creative**
- [ ] Chrome Music Lab — opens, loads
- [ ] Ableton Learning Music — opens, loads
- [ ] Ableton Learning Synths — opens, loads
- [ ] Hello Waves Activities — opens, loads (should go to nycfirst-d13.github.io/hello-waves)

---

## 3. Feature Testing

- [ ] Each card shows a title and description
- [ ] Cards have a visible hover state
- [ ] All cards open in a new tab, not the same tab
- [ ] Each category section has a visible header or label
- [ ] Description text is legible and not cut off
- [ ] Page layout holds up at a narrow browser width (try dragging the window smaller)
- [ ] Hello Waves links to the correct nycfirst-d13.github.io address

---

## 4. Content Review

- [ ] All card titles are accurate and match the tool they link to
- [ ] Descriptions are age-appropriate for grades 4–7
- [ ] No broken, placeholder, or "TBD" content is visible
- [ ] No cards are missing images, icons, or labels
- [ ] DOE-login tools (Adobe Express) are clearly noted for students

**Student perspective — answer for each card you visit:**

- Would a 4th grader know what to do on this card without teacher help? ___________________________
- Are there any descriptions that would confuse a student? ___________________________
- Any tools that feel out of place or too advanced for the listed difficulty? ___________________________

---

## 5. Bug Log

| # | Description | Steps to Reproduce | Severity (Low / Med / High) | Notes |
|---|-------------|-------------------|----------------------------|-------|
| 1 | | | | |
| 2 | | | | |
| 3 | | | | |
| 4 | | | | |

---

## 6. Adding New Stations — Your Input

We need a way for staff to submit new station ideas (tools, links, descriptions) to keep the board updated. Three approaches are on the table. Read each option and mark your vote, then add any notes.

---

**Option A — Submission form on the site**
A hosted page (e.g. `nycfirst-d13.github.io/stem-stations/submit`) where anyone with the link can fill out a form. Submissions route to a backend database. The stations page pulls from that database to render cards.

- Pros: low friction for submitters, no external tool required, fully custom
- Cons: requires building and maintaining a backend; needs auth to prevent spam

**Option B — Monday.com board as the database**
Staff submit new stations by adding a row to a Monday.com board. The site fetches from the Monday.com API to render cards dynamically.

- Pros: familiar tool for staff already using Monday.com, no custom backend, built-in review/approval workflow
- Cons: dependency on a third-party service and API key; requires Monday.com account access

**Option C — Another approach**
Something else entirely (direct GitHub PR, Google Sheet, Notion, Airtable, static file edit, etc.).

---

**Your vote:**

- [ ] A — Submit on the site (hosted submission form + backend database)
- [ ] B — Monday.com board as database
- [ ] C — Other (describe below)

**Notes / reasoning:**

&nbsp;

&nbsp;

&nbsp;

---

**Station Organization — Your Input**

How should station items be categorized and organized on the page? Consider:

- Should each item belong to a **single category** (Science, Robotics, Art, etc.) — clean and simple, one place per item
- Or should items support **multiple tags** — more flexible, but raises questions:
  - Does a multi-tagged item appear in each matching category section, or only once?
  - If it appears multiple times, does that feel repetitive or helpful?
- Should organization be strictly by **subject type**, or could other groupings make sense (by difficulty, by tool type, by grade level)?

**Your thoughts:**

&nbsp;

&nbsp;

&nbsp;

---

## 7. Suggested Stations to Add

Note any tools you think should be on the board. These feed directly into the submission workflow discussion above.

| Tool Name | Category | Why add it? | Link (if known) |
|---|---|---|---|
| | | | |
| | | | |
| | | | |
| | | | |

---

## 8. General Notes & Suggestions

*Use this space for freeform observations — anything that feels off, student experience impressions, missing tools, or suggestions.*

&nbsp;

&nbsp;

&nbsp;

&nbsp;

&nbsp;
