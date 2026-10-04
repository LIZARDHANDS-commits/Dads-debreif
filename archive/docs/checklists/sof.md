# Sign-off checklist: the SOF Dashboard

Anyone can run this in about twenty minutes, in any up-to-date browser on a desktop or laptop. Nothing needs installing. Tick each line. If one fails, use **Report a problem** in the app, say which line failed, and name your browser.

Link: https://lizardhands-commits.github.io/Dads-debreif/#/sof

This runs on the live weather, so what you see depends on today. Where a line needs a certain kind of weather (a closed field, lightning), it says what to do if today doesn't have it: tick "not today" and go on. A few lines use the limits in the **SOF settings** menu to make the screen show a caution on demand. Put them back afterwards (choose the **Local (MTCA)** trigger: 2000 ft and 3 SM).

Keep the NAV CANADA weather site open in another tab for the side-by-side line.

## The top, the cards and the limits

- [ ] The **SOF Dashboard** card on the home screen opens the screen. The bar shows the date-time group (for example 301842Z SEP 26), "Weather just now" (or a few minutes ago) with a tick, and **Refresh**. Press **Refresh**: it says "Refreshing" for a moment and the age goes back to "just now". Nothing covers anything else.
- [ ] There is a card for home (CYMJ, marked HOME) and one for each alternate. Each shows the flight category and NATO colour state as words on small chips, the METAR and TAF with their ages, and a result line such as "Within limits" with a tick. Compare one METAR with NAV CANADA's: the raw words are the same, and the age ("42 min ago") is right for the time in the report.
- [ ] Open **SOF settings** (closed at first). Set **Home ceiling below** to 10000 and **Home visibility below** to 10. The trigger shows Custom and the home card says "Below limits" with the reason in words (for example "CEILING 4500 FT < 10000 FT"). The words in the report that cause it are underlined and marked, and they agree with the reason. Leave it like this for the banner lines below.

## Old reports and closed fields

- [ ] A METAR more than 75 minutes old (a card that says **STALE** with how old it is, or wait until one does) has grey chips, and never says "Within limits" as if it were current: it says "Unknown" and the age. No stale card today: tick "not today".
- [ ] A field that is closed overnight (CYMJ does this: its METAR ends "LAST OBS/NXT" and a time): the card says "Within limits at last observation (field closed until" that time, with grey chips, and it does not say STALE. Not closed today: tick "not today".
- [ ] Switch the network off (airplane mode) and press **Refresh**. The bar says the weather failed and how old the reports on screen are, and a line under it says the weather feeds are not answering and names the sources. The cards keep the last reports, marked as old. Turn the network on and press **Refresh**: it recovers.

## The caution banner

- [ ] With the limits from above, a **NEW CAUTION** box shows above the waves. Each line names the airfield, METAR or TAF, and the reason in words, with the report's own words marked under it ("In the report:"). It has a symbol and words, not only a colour.
- [ ] Press **Acknowledge**: the box goes. Reload the page: it stays gone for the day. Set the ceiling and visibility back to normal (Local (MTCA)) and then to 10000 and 10 again: a caution that cleared and came back is new, and the box returns.
- [ ] In **SOF settings**, untick **Show the new-caution banner**. The box goes, the cards still show every weather caution, and the hint under the switch says lightning then shows only in the map's strip. Tick it again and put the limits back to Local (MTCA).

## Waves and the alternate call

- [ ] Press **Add wave**. A row appears with a name (W1) and **Takeoff** and **Landing** times in home local time, with the zone (CST) named. Enter times for today. A chip shows the alternate call in words: "No alternate needed", "ALTERNATE REQUIRED", "At the limit", "TAF doesn't cover the wave" or "No TAF", and how many alternates meet. Press the chip: the list of every reason opens with its time (for example "TEMPO 1/2SM FG from 16Z"); press it again to close it.
- [ ] Each alternate card shows its own line for the selected wave (meets, meets with a caution, or does not meet) with the reason. Pick another wave and the lines change. **Tomorrow** moves the waves to tomorrow's date. A landing earlier than takeoff means the next day.
- [ ] Add waves until there are five: **Add wave** stops and says why. Remove one: the others stay. Reload: the waves are kept.

## The 24-hour timeline

- [ ] The **24-hour timeline** has one row for home and each alternate over the home local day, the axis in Zulu (or local, if Settings puts that first), each piece labelled with its NATO colour state in words, your waves as bands across every row, and a line for now. The heading folds it away and back, and a reload keeps your choice.
- [ ] A piece below the limits is hatched and has a ▼; a very short piece shows only the ▼, as the legend under the timeline says. Hover or Tab to a piece: a card gives the group, the times in Zulu and local, the conditions in words and the result.

## The map

- [ ] Below the cards is the map: satellite picture, home and the alternates as dots with their ICAO and flight category in words, wind barbs, and dashed 25 and 50 NM rings. The strip under the map says when each picture is from and how old it is (for example "Radar 1840Z (2 min ago) ✓"). **+**, **−** and dragging move it, and **Home** brings it back and says it centred on home.
- [ ] Open **Layers**. Press Tab once: focus goes into the menu, not across the map. Press Escape from inside the menu, then open it again and press Escape from **Home** or **+**: the menu closes and focus is back on **Layers**.
- [ ] In the menu, switch **Satellite cloud picture (GOES)** on and off, move the **Radar (rain or snow)** slider, and try **VNC chart**, **VNC over satellite** (its opacity slider comes alive) and **Satellite** again. With a VNC chart showing, the credit line under the map names VNC charts © NAV CANADA and a note says the charts cover Moose Jaw, Regina, Saskatoon and Swift Current. Reload: your layer choices are kept.
- [ ] Press **Map key** under the strip. It explains the radar colours (light blue lightest, purple heaviest, in mm/h of rain, or cm/h of snow when **Radar shows** is Snow), the lightning mark (yellow with a dark outline) and the rings. Close it.

## Lightning near home

- [ ] The strip has a line for lightning near home, for example "No lightning within 20 NM of home ✓". On the map, lightning is a bright yellow mark with a dark outline that is easy to see on the satellite. If there is lightning within the radius, the line says how far and which way and a caution shows in the banner. To see the other wording with clear skies, open **SOF settings**, set **Lightning radius around home** to 50 and then back to 20.
- [ ] "Can't tell" means the check could not read the lightning picture (no network, the weather service is down, or the picture is too old). It does not mean it is clear. The strip line shows a question mark and "can't tell" instead of a tick, and with no earlier reading the banner gets an amber "Lightning: can't tell" line. A lightning caution that was already up stays up, marked "can't tell now, last seen" some minutes ago, until a good reading replaces it. To see it, switch the network off for a couple of minutes and wait for the next refresh. Then turn it on again.
- [ ] If a lightning caution is up, press **Acknowledge** and reload the page: it stays acknowledged (the same storm is the same caution after a reload). No lightning today: tick "not today".

## The ADS-B Exchange view

- [ ] Press **ADS-B Exchange view**. The map is replaced by ADS-B Exchange's own live map centred on your area, with a link **Open ADS-B Exchange in a new tab**. **Home**, **+**, **−** and **Radar shows** go grey, the strip says ADS-B Exchange's own map is showing, and the lightning-near-home line stays. Their page has its own ads; that is theirs. Press the button again: your map comes back with your layers, and focus is on the map.

## The settings menu and the keyboard

- [ ] **SOF settings** opens in the page (not a popup) and holds only what you need: the trigger, the home ceiling and visibility, the banner switch, the lightning radius and the traffic relay address (empty, so there is no Traffic button, and that is right). A number out of range is refused and the range is said.
- [ ] Put the limits back to Local (MTCA). Tab through the screen from the top: every button, box and chip can be reached and used without the mouse, in the order you read them, with a clear outline.

## Sign-off

Browser and version: ________  Date: ________  Name: ________

Differences from V6 or NAV CANADA noted (what, where, their value, the SOF's value): ________

All lines ticked, or marked "not today" with a reason, means the SOF Dashboard is done (R21).
