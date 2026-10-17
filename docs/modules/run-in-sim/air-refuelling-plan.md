# Air refuelling in the Run-in Simulator: plan (approved: Patrick's yes (relayed by Dad, 17 Oct 2026: 'pat says build'))

Dad, 17 Oct 2026: "can we also add in the airrefueling... to the run in sim". His card answers the same day: show **the rendezvous** first; the receiver is **the CT-156 as a stand-in** (labelled so; it has no probe). **Approved: Patrick's yes (relayed by Dad, 17 Oct 2026: 'pat says build')**, covering Steps 1 to 3 and the changes below (RS-15 to RS-22). They were built first on Dad's "Build anyway" (17 Oct 2026), and Patrick's yes followed the same day (V2.503; spec "Air refuelling", RS-15 to RS-18, RS-R10 to RS-R13, plan.md Step 7). Every number is still an estimate (ATP-56 not read). Step 4 stays on `future.md`. **Dad's change the same day (RS-19, RS-20, plan.md Step 7b, V2.504):** "Can we have the tanker in orbit while the ct156 is initial takeoff meeting at the IP then the tanker turns inbound to meet from the orbit" and "Giving turn range and offset would help too": the receiver now takes off from CYMJ and meets at the IP, the tanker turns inbound from its orbit, and the offset can be set by hand. **Then (RS-21, RS-22, plan.md Step 7c, V2.505):** the tanker's turn inbound is flown in the air mass with the offset and turn range worked out for the wind, and the take-off has its ground and CYMJ's runways in 3D.

## What it would show

A tanker flying an air-refuelling anchor (a racetrack, the holding pattern RS-11 already flies) and a receiver flying the rendezvous to join it: the run-in's engine with the target replaced by a moving tanker.

- **Tanker:** a KC-130J, drawn from the C-130J model (shared plan Step 3e) with its two wing-pod drogues. It flies its anchor at a set height and speed along a ground path at a steady speed; it has no performance set (RS-Q1), so its flying is a picture, not a performance claim, and says so.
- **Receiver:** the CT-156 on the T-6A set and the run-in pilot, labelled "stand-in receiver".
- **Rendezvous types:** the point-parallel (the tanker in its anchor turns toward the receiver at the worked-out turn range to roll out ahead of it) first, the en-route rendezvous (both on the same track at a set time) after.
- **The computer works out what's needed to join (as RS-9):** the tanker's turn range and moment, the receiver's speed and the join's timing, so the receiver arrives in a set trail (1 NM, an estimate), then closes to pre-contact behind the drogue at a set overtake.
- **The result card:** the trail at the tanker's roll-out against the plan, the closure and overtake on the join, the time to pre-contact, and flags (overtake past a reference, a tanker turn steeper than its set bank, the receiver ahead of the tanker's wing line).
- **Views:** the same 3D cameras plus a "from the tanker" and a "behind the drogue" view, and the 2D plan and profile (RS-13) with both tracks.

## Numbers (every one an estimate until a manual page or Patrick gives it)

Refuelling height and speed, the anchor's leg length and bank, the point-parallel's offset and turn range, the trail, the pre-contact position and the closure limits. ATP-56 (the NATO air-to-air refuelling publication) would be the reference to look for; nothing is read yet. The numbers built in, each an estimate, are in the spec's "Defaults for this run" table: 10,000 ft MSL, 200 KIAS, 25° bank, 20 NM legs, left turns, +3:00 rendezvous, 1,000 ft below, 1 NM trail, 20 kt overtake, braking 0.3 kt/s, the nose 15 ft behind the left basket; references 30 kt closure, 10 kt inside 200 ft. The offset (two turn radii), the turn range and moment, and the receiver's speed and start are worked out.

## Steps

1. [x] Spec, decisions and a screen picture (`air-refuelling-screen.png`) (17 Oct 2026).
2. [x] The tanker model (KC-130J from the C-130J model, drogues) and its anchor (V2.503).
3. [x] The point-parallel rendezvous and the join to pre-contact, worked out to hit (as RS-9) (V2.503).
4. [ ] The en-route rendezvous (on `future.md`; not built).
5. [ ] Sign-off checklist in Dad's and Patrick's words.

## Not in this plan

Contact and fuel transfer, a boom tanker, a real receiver model (a probe-equipped fighter would be its own model build), and fuel planning.
