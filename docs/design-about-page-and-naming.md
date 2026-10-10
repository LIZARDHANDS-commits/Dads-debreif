# OODA LOOP: Aviator Training & Debrief Suite
## Design Specification: Project Identity & "About" Page Architecture

**Date:** 2026-10-09  
**Status:** Validated & Approved  
**Co-Creators:** Kenny "Dad" Natelli (USAF Exchange IP) & Pat (2 CFFTS IP & Engineer)  
**Location:** 15 Wing Moose Jaw, Saskatchewan (2 CFFTS "The Big Two")  

---

## 1. Understanding Summary

* **Project Identity & Title:** The suite is officially branded **OODA LOOP**, with the primary subtitle **"Aviator Training & Debrief Suite"**. This preserves Kenny's foundational name across V1–V6, honoring Col. John Boyd's tactical decision cycle and Energy-Maneuverability (E-M) doctrine.
* **Why It Exists:** To provide military student pilots and instructors with intuitive, visual, and mathematically sound tools for debriefing 3D flight telemetry, practicing tactical formation and BFM geometry, rehearsing traffic pattern entries, and monitoring real-time SOF operational weather risk.
* **Target Audience:** Built flight-line first for **2 CFFTS ("The Big Two")** and the broader **USAF / RCAF T-6 Texan II & CT-156 Harvard II** community at 15 Wing Moose Jaw and sister training bases, accessible via a standard web browser without installation.
* **The Narrative:** Centers on the authentic partnership between two military instructor pilots at 15 Wing Moose Jaw: **Kenny "Dad" Natelli** (USAF Exchange IP) and **Pat** (2 CFFTS IP & Engineer). It tells the story of how an internal flight-room tool grew through an international partnership into a multi-module training suite.
* **Visual Imagery ("Flight Line Trio"):** 
  1. A hero action shot of a CT-156 Harvard II formation flight at the top.
  2. Co-creator profile cards featuring individual flight gear / ramp photos of Kenny and Pat.
  3. Official insignia: the USAF pilot badge / command crest for Kenny, and the 2 CFFTS "The Big Two" crest (`media/big2-badge.png`) for Pat.
* **Explicit Non-Goals:** Not an official USAF or RCAF program of record, not a replacement for official syllabus scoring/TIMS, and contains zero controlled DND/DoD goods or classified procedures.

---

## 2. Explicit Assumptions

1. **Military Disclaimer:** A standard, clear non-endorsement disclaimer is included on the About page (clarifying that this is an unofficial instructional aid created in personal capacity, with no classified or controlled information).
2. **AI Transparency:** AI software engineering disclosures are omitted from the page to keep the focus purely on aviation instruction.
3. **Photo Assets:** The page uses `media/about-photo.jpg` for the hero banner, `media/big2-badge.png` for 2 CFFTS, with drop-in slots for `media/kenny-natelli.jpg`, `media/pat.jpg`, and `media/usaf-badge.png`.
4. **App-Wide Consistency:** The name **"OODA LOOP — Aviator Training & Debrief Suite"** harmonizes the browser `<title>`, header bar, and About page, preserving existing internal code and legacy git branches without breaking any module imports.

---

## 3. Decision Log

| # | Topic | Decision | Alternatives Considered | Rationale |
| :--- | :--- | :--- | :--- | :--- |
| **D-01** | **Target Audience** | Squadron & Military Flight Line First (2 CFFTS / 15 Wing & T-6/Harvard II community). | Public sim community; enterprise DoD/DND; private flight room only. | Focuses directly on the real students and instructor peers who use the suite daily. |
| **D-02** | **Project Master Brand** | **OODA LOOP** (Subtitle: *Aviator Training & Debrief Suite*). | *CROSSCHECK*, *THE BIG TWO*, *PADLOCK*, *VORTEX*. | Retains Kenny's original name from V1–V6; directly connected to John Boyd's tactical loop and E-M theory in the debrief tool. |
| **D-03** | **Co-Creator Relationship** | Joint military instructor colleagues; "Dad" is Kenny's callsign/handle. | Anonymous/abstract creators. | Reflects the authentic flight-room reality: two instructors (one USAF exchange, one 2 CFFTS) collaborating at Moose Jaw. |
| **D-04** | **Instructor Credentials** | Kenny "Dad" Natelli (USAF Exchange IP) & Pat (2 CFFTS IP & Engineer). | Call-signs only; purely academic titles; anonymous. | Establishes immediate operational credibility and honors both services. |
| **D-05** | **Exchange Narrative** | Highlighted as an "International partnership in flight training". | Bilateral defense initiative; standard software credits. | Accurately describes the Canadian-American exchange framework at 15 Wing. |
| **D-06** | **Imagery Direction** | "Flight Line Trio" (Hero CT-156 formation + dual pilot photos + USAF and 2 CFFTS badges). | Aircraft only (no faces); single joint photo; tactical wireframes only. | Balances personal instructor pride, squadron identity, and visual appeal. |
| **D-07** | **Page Architecture** | Option 1: "The Flight Room Dossier" (modular responsive cards). | Story-first editorial prose; technical spec sheet. | Highly scannable on mobile/tablets on the flight line, modular, and easy to maintain. |
| **D-08** | **AI Attribution** | Removed from About page entirely. | Keep technical disclosure; move to footer. | Avoids cluttering an authentic aviator-built tool with AI boilerplate. |

---

## 4. Final About Page Content & Architecture

### Section 1: Navigation & Hero Banner
* **Navigation:** `← Home`
* **Eyebrow:** `About the Project`
* **Page Title:** `About OODA LOOP`
* **Subtitle:** `Aviator Training & Debrief Suite`
* **Hero Image (`<figure>`):**
  * File: `media/about-photo.jpg`
  * Alt: `CT-156 Harvard II 2-ship formation flight over Saskatchewan`
  * Caption: *"Fly • Learn • Debrief • Improve — 15 Wing Moose Jaw"*

### Section 2: Mission & Purpose
> **Visualizing the Flight Before and After the Chocks**  
>
> OODA LOOP is an aviator-built suite of flight debriefing, tactical simulation, and operational decision-support tools developed directly for the military flight training environment.
>
> In high-performance flight training, the margin between understanding a maneuver and falling behind the aircraft comes down to visual clarity. This suite exists to bridge the gap between 2D whiteboard stick figures and dynamic 3D flight geometry—giving student pilots and instructors an accessible, browser-based sandbox to visualize energy states, debrief sorties, rehearse patterns, and make informed operational decisions.

### Section 3: The Co-Creators & International Partnership

#### Card 1: Kenny "Dad" Natelli
* **Eyebrow:** `Co-creator · USAF Exchange`
* **Name:** `Kenny "Dad" Natelli`
* **Badges & Visuals:** `media/kenny-natelli.jpg` + USAF Pilot Wings / Crest (`media/usaf-badge.png`)
* **Bio:**
  > A U.S. Air Force exchange instructor pilot serving at 15 Wing Moose Jaw, Saskatchewan. Kenny conceived and built the original V1–V6 debrief tools in the flight room and developed the real-time SOF Dashboard, embedding USAF and 15 Wing operational weather limits and divert criteria to safeguard flight operations.

#### Card 2: Pat
* **Eyebrow:** `Co-creator · 2 CFFTS`
* **Name:** `Pat`
* **Badges & Visuals:** `media/pat.jpg` + 2 CFFTS "The Big Two" Crest (`media/big2-badge.png`)
* **Bio:**
  > A 2 CFFTS instructor pilot and engineer. Pat re-architected the suite into its modular engine, developing the tactical formation trainer, BFM fight simulator, and traffic pattern visualizer—calibrated to 15 Wing manuals, aerodynamic energy-maneuverability, and flight line instruction.

#### Partnership Callout
> **An International Partnership in Flight Training:** Built on the flight line at 15 Wing Moose Jaw through a Canadian-American instructor exchange, blending USAF doctrine with RCAF 2 CFFTS primary flying standards.

### Section 4: The Suite at a Glance
1. **Debrief Viewer:** 2D and 3D GPS/telemetry track replay, Debrief Focus Points (DFPs), and Energy-Maneuverability (E-M) flight envelope comparison.
2. **Formation Simulator:** Interactive step-by-step tactical turns, rejoin practice (TRJ, SARJ), station-keeping, and rollout judging against standards.
3. **Fight & Turn Sim (BFM):** 1-circle, 2-circle, and 3D BFM visualizer matched to the CT-156 Harvard II 5.0 G flight envelope.
4. **Traffic Pattern Sim:** Military overhead breaks, pattern entry procedures, spacing, and closed traffic management.
5. **SOF Dashboard:** Real-time Supervisor of Flying situational awareness—live weather minima, runway crosswind limits, METAR/TAF parsing, and radar.

### Section 5: The OODA Doctrine
> **Why "OODA LOOP"?**  
> Named in honor of Col. John Boyd, the legendary fighter pilot who pioneered Energy-Maneuverability (E-M) theory and the **Observe • Orient • Decide • Act** loop. In high-performance flight, victory and safety belong to the pilot who cycles through the loop fastest. This suite was built to train that exact scan—helping aircrew observe geometry, orient to energy states, decide decisively, and debrief effectively.

### Section 6: Contact & Support
* **Contact & Feedback:**  
  * Text: *"Built by instructors for instructors and students. If you notice a bug, have an idea for a new tactical scenario, or want to suggest an improvement to flight calculations, your feedback directly shapes future updates."*  
  * Button: `✉ kennynatelli@gmail.com`
* **Support the Project:**  
  * Text: *"OODA LOOP is independently developed, hosted, and maintained for the aviation training community. If these tools have been valuable to your debriefs, preparation, or instruction, voluntary contributions help keep the web services and live weather feeds running."*  
  * Button: `♡ Support via Venmo` (`https://www.venmo.com/u/Kenny-Natelli`)

### Section 7: Military Disclaimer
> **Notice:** OODA LOOP is an unofficial instructional aid developed by the creators in their personal capacity. It is not an official product, publication, or endorsement of the Royal Canadian Air Force (RCAF), the Department of National Defence (DND), the United States Air Force (USAF), 15 Wing Moose Jaw, or 2 CFFTS. It does not replace official flight manuals, orders, or standard operating procedures. Contains no classified, controlled goods, or proprietary defense data.

---

## 5. Technical Asset Mapping

| UI Element | Source File / Relative Path | Notes |
| :--- | :--- | :--- |
| **Hero Image** | `public/media/about-hero-formation.png` | Authentic CT-156 Harvard II 3-ship tactical formation photo. |
| **2 CFFTS Crest** | `public/media/big2-badge.png` | Existing high-res "The Big Two" crest. |
| **USAF Crest** | `public/media/usaf-badge.png` | Standard USAF Pilot Wings / AETC crest. |
| **Kenny Portrait** | `public/media/kenny-natelli.jpg` | Ramp / flight suit photo. |
| **Pat Portrait** | `public/media/pat.jpg` | Ramp / flight suit photo. |
| **Code Implementation** | `src/shell/about.js` | Built with `h()` DOM helper, zero external frameworks. |
| **Styles** | `src/shell/about.css` (or `src/styles/`) | CSS Grid, responsive on mobile & iPad. |
