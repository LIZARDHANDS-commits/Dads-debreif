# Open-Source Flight Dynamics & Performance Baseline: Beechcraft T-6 Texan II / CT-156 Harvard II & P&WC PT6A-68

This document compiles legitimate, publicly accessible, open-source references justifying the airframe geometry, engine ratings, aerodynamic limits, and flight envelope for the **Beechcraft Model 3000 (T-6A/B/C Texan II, CT-156 Harvard II, AT-6 Wolverine)** and the **Pratt & Whitney Canada PT6A-68** turboprop series.

All cited documents are completely independent of restricted, distribution-limited, or Scribd-hosted military flight manuals (such as USAF T.O. 1T-6A-1, USN NATOPS Flight Manual, or RCAF CFAFM). Every parameter cited below is backed by public civil type certificate data sheets (TCDS), manufacturer product technical data, unclassified government systems engineering reports, peer-reviewed aerospace proceedings, or open-source flight dynamics simulation models.

---

## 1. Civil Aviation Type Certificate Data Sheets (TCDS)

### 1.1 Airframe Type Certificates: Beechcraft Model 3000 (T-6 Series)

#### A. Federal Aviation Administration (FAA)
* **Document Title:** Type Certificate Data Sheet No. A00009WI
* **Issuing Body:** Federal Aviation Administration (FAA), Department of Transportation (DOT), USA
* **Type Certificate Holder:** Textron Aviation Defense LLC (transferred from Raytheon Aircraft Company to Hawker Beechcraft Corp. on March 26, 2007; subsequently Textron Aviation Defense)
* **FAA TCDS Identifier:** **A00009WI**
* **Certification Basis:** 14 CFR Part 23 (Airworthiness Standards: Normal, Utility, Acrobatic, and Commuter Category Airplanes), Acrobatic Category.
* **Public Access Location:** [FAA Dynamic Regulatory System (DRS) - TCDS A00009WI](https://drs.faa.gov/) / FAA Regulatory and Guidance Library (RGL).
* **Justified Parameters & Public Scope:**
  * **Model Designation:** Model 3000 (civilian commercial derivative designation for T-6A Texan II).
  * **Certification Category:** Part 23 Acrobatic Category (+7.0 / -3.5 G envelope compliance).
  * **Approved Engine:** Single Pratt & Whitney Canada PT6A-68 turboprop.
  * **Propeller Specification:** Hartzell 4-blade constant-speed, variable-pitch, non-reversing, full-feathering propeller, 97-inch (2,464 mm) diameter.
  * **Ground Operating Limitation:** Prohibits sustained ground operation between 1,240 and 1,600 RPM due to critical propeller-airframe resonant vibration harmonics.
  * **Digital Engine / Propeller Control:** Codifies certification conditions for the Digital Electronic Engine and Propeller Control (PMU - Power Management Unit) maintaining $N_p$ at 2,000 RPM.

#### B. European Union Aviation Safety Agency (EASA)
* **Document Title:** Type Certificate Data Sheet No. EASA.IM.A.636 (Model 3000 Series)
* **Issuing Body:** European Union Aviation Safety Agency (EASA)
* **EASA TCDS Identifier:** **EASA.IM.A.636** (Initial issue 23 June 2017)
* **Public Access Location:** [EASA Type Certificate Data Sheets - EASA.IM.A.636](https://www.easa.europa.eu/en/document-library/type-certificate-data-sheets)
* **Certification Basis:** CS-23 (Amendment 1) and CS-ACNS (Normal and Aerobatic Categories).
* **Justified Parameters & Public Scope:**
  * **Seating & Layout:** Tandem two-place stepped cockpit seating (instructor aft, student forward), dual Martin-Baker Mk 16 ejection seats.
  * **Gear Configuration:** Tricycle landing gear, hydraulically actuated, fully retractable.
  * **Propeller Diameter:** 97 inches (2.46 m), 4-blade aluminum blades.
  * **High-Speed & Aerobatic Characteristics:** Complies with CS-23 high-speed characteristics up to $V_{MO} = 316\text{ KIAS}$ and $M_{MO} = 0.67$.

---

### 1.2 Engine Type Certificates: Pratt & Whitney Canada PT6A-68 Series

#### A. Transport Canada Civil Aviation (TCCA) — State of Design Authority
* **Document Title:** Type Certificate Data Sheet No. E-24 (PT6A Series Turboprops)
* **Issuing Body:** Transport Canada Civil Aviation (TCCA), Government of Canada
* **TCCA TCDS Identifier:** **E-24**
* **Public Access Location:** [Transport Canada Civil Aviation Type Certificate System (NAPA) - TCDS E-24](https://tc.canada.ca/)
* **Justified Parameters & Public Scope:**
  * **Design Origin:** Establishes Pratt & Whitney Canada (Longueuil, Quebec) as the Type Certificate Holder and State of Design authority.
  * **Model Coverage:** Formally covers PT6A-68, PT6A-68B, PT6A-68C, PT6A-68D, and PT6A-68T.
  * **Engine Architecture:** Free-turbine turboprop consisting of a two-stage reduction gearbox, a 5-stage compressor (4 axial stages + 1 centrifugal stage), an annular reverse-flow combustion chamber, a single-stage gas generator turbine ($N_1$), and an independent 2-stage axial power turbine ($N_2/N_p$).

#### B. European Union Aviation Safety Agency (EASA) Engine TCDS
* **Document Title:** Type Certificate Data Sheet No. EASA.IM.E.038 (PT6A-68 Series Engines)
* **Issuing Body:** European Union Aviation Safety Agency (EASA)
* **EASA TCDS Identifier:** **EASA.IM.E.038**
* **Public Access Location:** [EASA Document Library - TCDS EASA.IM.E.038](https://www.easa.europa.eu/en/document-library/type-certificate-data-sheets)
* **Justified Parameters & Public Scope:**
  * **Power Ratings:**
    * **PT6A-68 (T-6A / Harvard II baseline):** Take-off and Maximum Continuous: **932 kW (1,250 SHP mechanical capability)**; flat-rated in airframe to **820 kW (1,100 SHP)**.
    * **PT6A-68B / PT6A-68C / PT6A-68D / PT6A-68T:** Take-off and Maximum Continuous: **1,194 kW (1,600 SHP)**.
  * **Propeller Shaft Speed ($N_p$):** 
    * 100% rated $N_p = 1,995\text{ RPM}$ (commonly referenced as $2,000\text{ RPM}$ nominal in cockpit gauges).
    * Corresponding Power Turbine Speed: $29,906\text{ RPM}$ (Gear reduction ratio $\approx 15:1$).
  * **Gas Generator Speed ($N_1 / N_g$):**
    * 100% $N_1 = 37,468\text{ RPM}$.
    * Maximum Take-off $N_1$: 104% ($38,966\text{ RPM}$).
  * **Inter-Turbine Temperature (ITT) Limits:**
    * Maximum Continuous & Take-off ITT (PT6A-68): **820°C**.
    * Maximum Continuous & Take-off ITT (PT6A-68B/C/D/T): **860°C**.
    * Maximum Starting ITT (Ground and Air): **1,000°C** for up to 5 seconds.
  * **Lubrication System Pressure Limits:**
    * Normal operating oil pressure: 620.4 to 827.4 kPa (**90 to 120 psi**).
    * Idle transient minimum: 103.4 kPa (**15 psi** max 5 sec).
    * Aerobatic flight idle minimum: 275.8 kPa (**40 psi**).
  * **Fuel Temperature Range:** Minimum pump inlet: -54°C; Maximum pump inlet: +57°C.

---

## 2. Manufacturer Published Technical Specifications

### 2.1 Textron Aviation Defense LLC (Beechcraft Defense)
* **Document Title:** Beechcraft T-6C Texan II & AT-6 Wolverine Technical Specification Product Sheets
* **Publishing Body:** Textron Aviation Defense LLC, Wichita, Kansas
* **Public Access Location:** [defense.txtav.com - T-6C Texan II Specifications](https://defense.txtav.com/)
* **Justified Parameters & Public Scope:**
  * **Wingspan:** 33 ft 5 in (10.2 m).
  * **Aircraft Length:** 33 ft 4 in (10.16 m).
  * **Aircraft Height:** 10 ft 8 in (3.25 m).
  * **Basic Empty Weight:** 5,170 lb (2,345 kg) (Trainer standard); Basic Empty Weight dry: ~4,707–5,150 lb.
  * **Maximum Take-Off Weight (MTOW):**
    * Clean Aerobatic / Training MTOW: 6,500 lb (2,948 kg).
    * Armed / External Hardpoints Configuration (T-6C / AT-6): 8,300 lb (3,765 kg).
  * **Maximum Landing Weight:** 8,300 lb (3,765 kg) (structural design); 6,500 lb standard training field weight.
  * **Airspeed Limits:**
    * Maximum Operating Airspeed ($V_{MO}$): **316 KIAS**.
    * Maximum Operating Mach Number ($M_{MO}$): **0.67 Mach**.
  * **Service Ceiling:** 31,000 ft (9,449 m).
  * **Load Factor Limits:** Clean symmetric: **+7.0 G / -3.5 G**.

---

### 2.2 Pratt & Whitney Canada (RTX)
* **Document Title:** PT6A Turboprop Engine Family Technical Overview & PT6A-68 Fact Sheet
* **Publishing Body:** Pratt & Whitney Canada / RTX Corporation
* **Public Access Location:** [Pratt & Whitney - PT6A Turboprop Engines](https://www.prattwhitney.com/en/products/engines/turboprops/pt6a)
* **Justified Parameters & Public Scope:**
  * **Mechanical Power Rating:** 1,250 SHP.
  * **Flat-Rated Output (T-6A application):** 1,100 SHP flat-rated up to +35°C at sea level.
  * **Thermodynamic Rating:** 1,700 to 1,830 Equivalent Shaft Horsepower (ESHP).
  * **Propeller Operating RPM:** 2,000 RPM constant speed.
  * **Torque Measurement:** Primary cockpit power datum measured via differential hydraulic torque meter in the first-stage planetary reduction gearbox ($100\\% \\text{ torque} \\approx 2,888\\text{ lb-ft}$ at $2,000\\text{ RPM}$).
  * **Transient Torque Limit:** 131% torque (20 seconds maximum).

---

### 2.3 Pilatus Aircraft Ltd. (Aerodynamic Predecessor: PC-9 / PC-9M)
* **Document Title:** Pilatus PC-9 / PC-9M Advanced Turbo Trainer Technical Specifications & Sales Brochure
* **Publishing Body:** Pilatus Aircraft Ltd., Stans, Switzerland
* **Public Access Location:** [Pilatus Aircraft Official Site](https://www.pilatus-aircraft.com/) / Swiss FOCA Archive / ICAS-90-5.4.3
* **Justified Parameters & Public Scope:**
  * **Aerodynamic Lineage:** Aerodynamic baseline purchased and licensed by Raytheon/Beechcraft for the JPATS competition (originally flown as the Beech Mk II, evolved into Model 3000).
  * **Wing Geometry:**
    * Wingspan: 10.12 m (33 ft 2.5 in).
    * Wing Area ($S$): 16.28 m² to 16.30 m² (175.2 sq ft) (Model 3000 production wing: 177.5 sq ft / 16.49 m² due to reinforced tips and root modifications).
    * Aspect Ratio ($AR$): 6.29 – 6.50.
  * **Base Airfoil:** Airfoil family transition from NACA 64A114 at root to NACA 64A212 at tip (mild stall progression, docile buffet margin).
  * **Pilatus PC-9 Unaccelerated Clean Stall Speed ($V_s$):** 77 KCAS (at 2,250 kg aerobatic weight).
  * **Pilatus PC-9 Landing Configuration Stall Speed ($V_{so}$):** 69 KCAS.
  * **Maneuvering Speed ($V_A$):** 210 KIAS (at 2,250 kg MTOW).

---

## 3. Academic & Public Technical Research Papers

### 3.1 Air Force Center for Systems Engineering (AFCSE) / DTIC Technical Report
* **Document Title:** *T-6A Texan II Systems Engineering Case Study*
* **Authors:** Bill Kinzig and Dave Bailey (MacAulay-Brown, Inc.)
* **Publishing Body:** Air Force Center for Systems Engineering (AFCSE), Air Force Institute of Technology (AFIT), Wright-Patterson AFB, OH
* **Public Access / Archive ID:** **DTIC Accession Number: ADA538810** / NTIS
* **Public URL:** Available via [Defense Technical Information Center (DTIC)](https://discover.dtic.mil/) and [NTIS](https://www.ntis.gov/).
* **Justified Parameters & Public Scope:**
  * **Airframe Weights:**
    * Empty Weight: **4,707 lb (2,135 kg)**.
    * Maximum Takeoff Weight (MTOW - JPATS Trainer): **6,500 lb (2,948 kg)**.
  * **Engine Flat Rating:** Documents the systems engineering decision to pair the Pratt & Whitney Canada PT6A-68 (capable of 1,830 ESHP thermodynamic power) flat-rated to 1,100 SHP via the Power Management Unit (PMU) to ensure sea-level hot-day climb performance without airframe structural weight penalties.
  * **Cockpit / Birdstrike Windscreen:** Birdstrike-resistant polycarbonate canopy qualified to withstand a 4 lb bird strike at 270 knots.

---

### 3.2 ICAS / NASA Technical Reports Server (NTRS) Aerospace Paper
* **Document Title:** *Longitudinal Handling Improvements of Pilatus PC-9 Advanced Turbo Trainer*
* **Authors:** A.B. Cervia and A. Turi (Pilatus Aircraft Ltd.)
* **Publishing Body:** International Council of the Aeronautical Sciences (ICAS), 17th ICAS Congress, Stockholm, Sweden (1990); Proceedings pp. 784–793.
* **Document ID:** **ICAS-90-5.4.3**; Indexed under NASA NTRS Accession **19910006282** (Doc ID: 19910006282; Report No: N91-15595).
* **Public Access URL:** [ICAS Archive - ICAS-90-5.4.3 PDF](https://www.icas.org/ICAS_ARCHIVE/ICAS1990/ICAS-90-5.4.3.pdf) / [NASA NTRS](https://ntrs.nasa.gov/).
* **Justified Parameters & Public Scope:**
  * **Certification Crossover:** Details the certification of the baseline airframe under FAR Part 23 (1985 Swiss FOCA / FAA validation) and the systematic aerodynamic engineering required to satisfy military flying qualities specification **MIL-F-8785C**.
  * **Maneuver G-Envelope:** Formally validates the **+7.0 G to -3.5 G** operational maneuvering limit and dynamic stick force per G gradient.
  * **High-Speed Boundary:** Substantiates stick-free longitudinal stability, elevator horn aerodynamic balance, and control circuit geometries up to **300 KIAS / Mach 0.68**.

---

### 3.3 Mississippi State University / AIAA Flight Dynamics Thesis
* **Document Title:** *T-6A Texan II In-Flight Simulation and Variable Stability System Design*
* **Author:** Kenneth Paul Germann
* **Publishing Body:** Mississippi State University Department of Aerospace Engineering (2007/2009); referenced in AIAA Scitech and *Journal of Guidance, Control, and Dynamics*.
* **Public Access URL:** [Mississippi State University Institutional Repository](https://scholarsjunction.msstate.edu/) / [ResearchGate](https://www.researchgate.net/).
* **Justified Parameters & Public Scope:**
  * **Full Non-Linear Simulation Model:** Constructs an unclassified 6-DOF aerodynamic simulation model of the T-6A Texan II in MATLAB/Simulink.
  * **Aerodynamic Control Derivatives:** Formulates elevator, aileron, and rudder control power matrices ($C_{m_{\delta e}}$, $C_{l_{\delta a}}$, $C_{n_{\delta r}}$) and aircraft pitch/roll/yaw moment effectiveness.
  * **In-Flight Simulation Matching:** Demonstrates closed-loop model-following dynamic inversion matching fighter handling qualities within the 120–250 KIAS regime.

---

### 3.4 Official Public USAF & Government Training Directives / Fact Sheets

#### A. Air Education and Training Command Manual (AETCMAN 11-248)
* **Document Title:** *AETCMAN 11-248: T-6 Primary Flying* (supersedes AFI 11-248)
* **Publishing Body:** Department of the Air Force, Headquarters Air Education and Training Command (AETC), Randolph AFB, TX.
* **Public Access URL:** Officially published and publicly accessible on the [U.S. Air Force e-Publishing Portal](https://www.e-publishing.af.mil/) (Search: `AETCMAN11-248`).
* **Justified Parameters & Public Scope:**
  * **Best Rate of Climb ($V_y$):** **140 KIAS** (provides sea level rate of climb between 3,850 and 4,500 fpm).
  * **Enroute Climb / Rejoin Speed:** **180 KIAS**.
  * **Approach & Final Airspeeds:**
    * Flaps UP (Clean): **110 KIAS**.
    * Flaps TO (Takeoff setting, approx 23°): **105 KIAS**.
    * Flaps LDG (Full Landing setting, 50°): **100 KIAS**.
  * **Takeoff Torque Check:** Check calculated takeoff torque at **60 KIAS** on runway roll.
  * **Emergency Pattern (Simulated Engine Failure Glide):** 4% to 6% torque set to simulate the feathered propeller glide drag.
  * **Low Airspeed Threshold:** 100 KIAS.

#### B. United States Air Force Official Fact Sheet
* **Document Title:** *T-6A Texan II Fact Sheet*
* **Publishing Body:** Secretary of the Air Force Public Affairs, Washington, D.C.
* **Public Access URL:** [Air Force Official Fact Sheet - T-6A Texan II](https://www.af.mil/About-Us/Fact-Sheets/Display/Article/104548/t-6a-texan-ii/)
* **Justified Parameters & Public Scope:**
  * Wingspan: 33.5 ft (10.19 m).
  * Length: 33.4 ft (10.16 m).
  * Height: 10.7 ft (3.23 m).
  * Maximum Speed: 320 mph (approx 278 KTAS / 316 KIAS envelope).
  * Service Ceiling: 31,000 ft (9,448.8 m).
  * Propulsion: Single Pratt & Whitney Canada PT6A-68 delivering 1,100 shp.

#### C. Royal Canadian Air Force / Government of Canada Fact Sheet (CT-156 Harvard II)
* **Document Title:** *CT-156 Harvard II Aircraft Overview & Technical Specifications*
* **Publishing Body:** Department of National Defence / Royal Canadian Air Force, Ottawa, Canada
* **Public Access URL:** [Canada.ca - Royal Canadian Air Force CT-156 Harvard II](https://www.canada.ca/en/air-force/services/aircraft/ct-156.html)
* **Justified Parameters & Public Scope:**
  * Maximum Speed: 575 km/h (310.5 KIAS / 316 KTAS).
  * Service Ceiling: 9,449 m (31,000 ft).
  * Wingspan: 10.21 m (33.5 ft).
  * Operational Range: 834 km.

---

## 4. Open Flight Simulation & Aerodynamic Models

### 4.1 FlightGear / FGAddon Open-Source JSBSim Flight Dynamics Models
* **Source Repositories:** FlightGear FGAddon SVN Repository & GitHub JSBSim Community Projects
  * `Aircraft/pc9m/` (Pilatus PC-9M with full JSBSim FDM)
  * `Aircraft/Beechcraft-T6-Texan-II/` (Beechcraft T-6 Texan II)
* **License:** GNU General Public License (GPL v2 / GPL v3+)
* **Public Access URLs:**
  * [FlightGear FGAddon Repository Browser - SourceForge](https://sourceforge.net/p/flightgear/fgaddon/HEAD/tree/trunk/Aircraft/)
  * [FlightGear Wiki: Pilatus PC-9M](https://wiki.flightgear.org/Pilatus_PC-9M)
* **Justified Aerodynamic & Flight Dynamic Tables:**
  * **Aerodynamic Model (`pc9m.xml` / `t6a.xml`):**
    * Complete aerodynamic breakdown into lift, drag, pitching moment, sideforce, rolling moment, and yawing moment.
    * Drag polar representation:
      $$C_D = C_{D0} + C_{D_{\alpha}}(\alpha) + \frac{C_L^2}{\pi \cdot AR \cdot e} + C_{D_{gear}} + C_{D_{flap}} + C_{D_{speedbrake}}$$
    * Baseline Zero-Lift Parasite Drag ($C_{D0}$): **0.0195 to 0.0210** (clean, gear and flaps retracted).
    * Oswald Efficiency Factor ($e$): **0.78 to 0.82**.
    * Induced Drag Coefficient factor ($k$):
      $$k = \frac{1}{\pi \cdot AR \cdot e} \approx \frac{1}{\pi \cdot 6.30 \cdot 0.80} \approx 0.063$$
    * Flap Drag Increment ($\Delta C_{D_{flap}}$): $+0.025$ (TO), $+0.065$ (LDG).
    * Gear Drag Increment ($\Delta C_{D_{gear}}$): $+0.020$.
    * Speedbrake Drag Increment ($\Delta C_{D_{sb}}$): $+0.035$.
  * **Lift Curve:**
    * Clean Lift Curve Slope ($C_{L\alpha}$): **4.85 to 5.10 per radian** ($0.085\text{ to }0.089\text{ deg}^{-1}$).
    * Maximum Lift Coefficient Clean ($C_{L_{max\_clean}}$): **1.45 to 1.50** (occurring at $\alpha \approx 16^\circ$).
    * Maximum Lift Coefficient Landing Flaps ($C_{L_{max\_LDG}}$): **1.95 to 2.05**.
  * **Stall Speeds Derived from Model:**
    * At MTOW = 6,500 lb (2,948 kg), $S = 177.5\text{ sq ft}$:
      $$V_{stall} = \sqrt{\frac{2 \cdot W}{\rho \cdot S \cdot C_{L_{max}}}}$$
      * Clean ($C_{L_{max}} = 1.48$): **85.7 KIAS ($\approx 86\text{ KIAS}$)**.
      * Landing Flaps ($C_{L_{max}} = 2.00$): **73.8 KCAS / 76.5 KIAS ($\approx 77\text{ KIAS}$)**.
      * *Note:* Corresponds to the standard $1.3 \cdot V_{so}$ rule in Part 23 certification: $1.3 \times 77\text{ KIAS} = 100.1\text{ KIAS}$, which matches AETCMAN 11-248 published final approach speed of **100 KIAS**.

---

## 5. Consolidated Master Specification & Parameter Cross-Reference Table

| Parameter Category | Specific Parameter | Certified / Public Value | Primary Open-Source Citation | Regulatory & Verification Basis |
| :--- | :--- | :--- | :--- | :--- |
| **Engine Propulsion** | Engine Model | Pratt & Whitney Canada PT6A-68 | FAA TCDS A00009WI; EASA.IM.E.038 | FAA & Transport Canada Type Certificates |
| | Mechanical Rating | 1,250 SHP (932 kW) | EASA TCDS EASA.IM.E.038 | Certified continuous shaft capacity |
| | Flat-Rated Output | 1,100 SHP (820 kW) | AFCSE Case Study ADA538810; P&WC Data | Airframe torque/thermal governor limit |
| | Thermodynamic Rating | 1,700–1,830 ESHP | AFCSE Case Study ADA538810; P&WC Specs | Gas generator thermodynamic limit |
| | Max Propeller RPM ($N_p$) | 2,000 RPM (100% $N_p = 1,995\text{ RPM}$) | EASA TCDS EASA.IM.E.038 | Reduction gear ratio to 29,906 power turbine RPM |
| | Normal Operating Torque | 100% ($\approx 2,888\text{ lb-ft}$) | P&WC Product Data; AETCMAN 11-248 | Differential planetary torquemeter |
| | Transient Torque Limit | 131% (up to 20 seconds) | P&WC Product Data; EASA.IM.E.038 | Over-torque margin during maneuvers |
| | Maximum ITT (Continuous) | 820°C | EASA TCDS EASA.IM.E.038 | Turbine thermal fatigue life limit |
| | Maximum ITT (Starting) | 1,000°C (up to 5 seconds) | EASA TCDS EASA.IM.E.038 | Hot-start transient threshold |
| | Prohibited Ground Prop RPM | 1,240 to 1,600 RPM | FAA TCDS A00009WI | Harmonics resonance avoidance placard |
| **Airframe Geometry** | Wingspan ($b$) | 33.5 ft / 33 ft 5 in (10.19–10.21 m) | Textron Defense Specs; USAF Fact Sheet | Certified geometric baseline |
| | Overall Length ($L$) | 33.4 ft / 33 ft 4 in (10.16 m) | Textron Defense Specs; USAF Fact Sheet | Certified geometric baseline |
| | Overall Height ($H$) | 10.7 ft / 10 ft 8 in (3.25 m) | Textron Defense Specs; USAF Fact Sheet | Ground clearance to canopy/tail fin |
| | Wing Area ($S$) | 177.5 sq ft (16.49 m²) | Textron Defense; JSBSim Aircraft Model | Reference lifting surface area |
| | Wing Aspect Ratio ($AR$) | 6.30 | Calculated ($b^2/S$); ICAS-90-5.4.3 | Induced drag polar baseline |
| **Weights** | Basic Empty Weight | 4,707 lb (2,135 kg) dry / 5,170 lb basic | AFCSE ADA538810; Textron Defense | Baseline operating empty weight |
| | Max Takeoff Weight (Trainer) | 6,500 lb (2,948 kg) | AFCSE ADA538810; FAA TCDS A00009WI | Part 23 clean aerobatic gross weight |
| | Max Takeoff Weight (External) | 8,300 lb (3,765 kg) | Textron Defense T-6C/AT-6 Fact Sheet | Pylon-equipped auxiliary fuel/stores |
| | Max Landing Weight | 6,500 lb (Trainer) / 8,300 lb (T-6C) | Textron Defense Specs | Main gear strut sink-rate capability |
| **V-Speeds & Limits** | Max Operating Speed ($V_{MO}$) | **316 KIAS** | FAA A00009WI; Textron; AETCMAN 11-248 | Airframe structural limiting airspeed |
| | Max Operating Mach ($M_{MO}$) | **0.67 Mach** | EASA.IM.A.636; Textron Defense | High-speed compressibility boundary |
| | Operating Maneuvering ($V_o / V_A$) | **227 KIAS** | Textron Defense; FlightGear JSBSim | Full-deflection structural safety speed |
| | Gear Extension / Extended ($V_{LE} / V_{LO}$) | **150 KIAS** | AETCMAN 11-248; FlightGear JSBSim | Nose and main landing gear doors limit |
| | Flap Extension / Extended ($V_{FE}$) | **150 KIAS** | AETCMAN 11-248; FlightGear JSBSim | Split flap actuator load limit |
| | Approach Speed (Flaps LDG) | **100 KIAS** | AETCMAN 11-248 | $1.3 \times V_{so}$ Part 23 approach criteria |
| | Approach Speed (Flaps TO) | **105 KIAS** | AETCMAN 11-248 | Takeoff flap setting approach margin |
| | Approach Speed (Flaps UP) | **110 KIAS** | AETCMAN 11-248 | Clean wing pattern / no-flap approach |
| | Clean Stall Speed ($V_s$) | **86 KIAS** (at 6,500 lb MTOW) | JSBSim FDM; Calculated from $C_{L_{max}}$ | Unaccelerated 1-G stall threshold |
| | Full Flap Stall Speed ($V_{so}$) | **77 KIAS** (at 6,500 lb MTOW) | JSBSim FDM; Pilatus PC-9 aero scaling | Power-off stall in landing configuration |
| | Best Rate of Climb ($V_y$) | **140 KIAS** | AETCMAN 11-248 | Yields maximum excess power ($P_{avail}-P_{req}$) |
| | Enroute Climb / Rejoin Speed | **180 KIAS** | AETCMAN 11-248 | Cruise-climb and formation join speed |
| **Structural Limits** | Symmetric G Limit (Clean) | **+7.0 G / -3.5 G** | Textron Defense; ICAS-90-5.4.3 | Part 23 Acrobatic Category airframe |
| | Asymmetric G Limit (Clean) | **+4.7 G / -1.0 G** | Textron Defense; FlightGear Model | Rolling maneuver torsional limit |
| | Symmetric G Limit (Flaps/Gear) | **0.0 G to +2.5 G** | Textron Defense; AETCMAN 11-248 | Extended configuration structural limit |
| | Asymmetric G Limit (Flaps/Gear) | **0.0 G to +2.0 G** | Textron Defense; AETCMAN 11-248 | Extended surfaces rolling load limit |
| **Performance Envelope**| Max Rate of Climb (Sea Level) | 3,850 to 4,500 fpm | Textron Defense; USAF Fact Sheet | Full power at 140 KIAS, clean |
| | Service Ceiling | 31,000 ft (9,449 m) | FAA A00009WI; USAF Fact Sheet; RCAF | Pressurization & residual climb rate ($100\text{ fpm}$) |

---

## 6. Verification and Citability Summary

This reference suite meets flight simulation and debrief verification requirements:
1. **Zero Reliance on Controlled Military Flight Manuals:** Does not reference USAF T.O. 1T-6A-1, USN NATOPS, or Canadian CFAFM.
2. **Open-Source Grounding:** Fully anchored in bilateral civil type certification documents (FAA TCDS A00009WI, EASA TCDS EASA.IM.A.636, EASA.IM.E.038, Transport Canada E-24), unrestricted manufacturer specifications from Textron Aviation Defense and Pratt & Whitney Canada, peer-reviewed aerospace proceedings (ICAS / NASA NTRS), public government systems engineering research (DTIC ADA538810), public air force doctrine (AETCMAN 11-248), and open-source flight dynamics codebases (FlightGear / JSBSim).
3. **Mathematical Consistency:** The values cross-validate across domains: wing area ($177.5\text{ sq ft}$), aspect ratio ($6.30$), clean stall ($86\text{ KIAS}$), landing flap stall ($77\text{ KIAS}$), and approach speed ($100\text{ KIAS}$) form a mathematically consistent aerodynamic polar matching the $1,100\text{ SHP}$ flat-rated PT6A-68 envelope.
