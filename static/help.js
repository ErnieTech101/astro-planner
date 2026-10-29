"use strict";
/* Astro Imaging Planner: Help topics. Each topic is plain HTML shown in the Help window.
   Keep the wording plain and practical, and update it whenever a feature changes. */
const HELP = [
{id:"start", title:"Getting started", html:`
<h3>Getting started</h3>
<p>The planner answers one question: <b>what can I image tonight, from my own yard, in the time I have?</b></p>
<p>You tell it three things once: where you are, which patch of sky you can actually see, and when you usually image. Each night it works out which objects will stay inside that patch long enough to collect a good stack, and lists them brightest first.</p>
<h4>Your first evening</h4>
<ol>
<li><b>Set up your site.</b> The first time you sign in, the Observing Sites window opens. Enter your location, time zone and the part of the sky you can see. See <a href="#" data-topic="site">Setting up your site</a>.</li>
<li><b>Add your scope.</b> Click <b>Setup</b>, then the <b>Equipment</b> tab, and pick your model. The planner then shows how each target fits your frame. See <a href="#" data-topic="equipment">Your equipment</a>.</li>
<li><b>Pick your session time</b> under <b>Session</b>: the date (the night of) and your start and finish times.</li>
<li><b>Read the Targets list.</b> Every object there spends at least your chosen time in your window tonight. The <b>In window</b> column says exactly when.</li>
<li><b>Check the Moon.</b> The <b>Tonight's sky</b> panel and the <b>Moon</b> column warn you when a bright Moon will wash a target out.</li>
<li><b>Log what you image.</b> Click <b>Log…</b> beside a target after your session. Your log builds up a record, and the planner marks what you've already captured.</li>
</ol>
<p>Your settings are saved to your account automatically, so the planner looks the same on your phone and your computer.</p>
<p class="tip">Press <kbd>F1</kbd> or click <b>Help</b> at any time. The small <b>?</b> buttons next to some sections open the matching topic.</p>`},

{id:"site", title:"Setting up your site", html:`
<h3>Setting up your site</h3>
<p>A <b>site</b> is a place you image from: its location, time zone, and the patch of sky you can see from there. Click <b>Setup</b> on the toolbar (or <b>Edit Sites…</b>) and use the <b>Sites</b> tab to change it. You can have several, such as your yard and a darker spot you visit, and switch between them with the <b>Site</b> list under Session.</p>
<h4>Location and time zone</h4>
<p>Click <b>Use My Location</b> to fill in latitude and longitude from your phone or computer, or type them in. North latitudes are positive; west longitudes are <b>negative</b> (Philadelphia is about 40.0, −75.1). Pick your time zone from the list so the times shown match your clock.</p>
<h4>Your sky box</h4>
<p>The sky box is the rectangle of sky you can actually see past houses, trees and streetlights. It has two ranges:</p>
<ul>
<li><b>Azimuth</b> is the compass direction, measured clockwise from north: 0 = north, 90 = east, 180 = south, 270 = west.</li>
<li><b>Altitude</b> is the height above the horizon: 0 at the horizon, 90 straight overhead.</li>
</ul>
<p>For example, a clear view to the south from southeast to southwest, between the rooftops and about halfway up the sky, is azimuth <b>150 to 210</b> and altitude <b>20 to 50</b>.</p>
<h4>Measuring it from your yard</h4>
<ul>
<li><b>Azimuth:</b> stand where the telescope goes and use a compass app on your phone. Note the reading at the left and right edges of your clear view. Most compass apps can show <b>true north</b> (look in the app's settings); use that. If yours only shows magnetic north, subtract about 11° from its readings around Philadelphia, where magnetic north lies about 11° west of true north.</li>
<li><b>Altitude:</b> hold your fist at arm's length. One fist is about <b>10°</b>, and a spread hand about <b>20°</b>. Count fists up from the horizon to the top of the trees or roofs for the bottom of your box, and to where your view ends for the top. A phone level or clinometer app works too.</li>
</ul>
<p>Windows that cross north work as well: a view from northwest to northeast is azimuth <b>315 to 45</b>.</p>
<p class="tip">Start a little generous, then tighten the box after a few sessions once you see where targets actually disappear behind something.</p>
<h4>Bortle class and notes</h4>
<p>The Bortle class (1 = pristine dark sky, 9 = inner city) is for your reference; most suburbs are 6 to 8. Use <b>Notes</b> for anything worth remembering, such as "neighbor's floodlight after 10 pm".</p>`},

{id:"equipment", title:"Your equipment", html:`
<h3>Your equipment</h3>
<p>Click <b>Setup</b> on the toolbar (or <b>Edit Equipment…</b> under Session) and choose the <b>Equipment</b> tab. Add each telescope you image with; if you have both a Dwarf and a Seestar, add both and pick tonight's with the <b>Scope</b> list under Session.</p>
<ul>
<li><b>Model:</b> picking one fills in the maker's specs: field of view, aperture, focal length, pixel size and built-in filters. Choose <b>Other</b> for anything else, such as a refractor with an astro camera or a DSLR on a lens.</li>
<li><b>Calculate from Camera…</b> works out the field of view for your own gear. Pick your camera (or type its sensor size in mm), enter the telescope's focal length and any reducer or Barlow, and click <b>Fill In Field of View</b>. The rule behind it: field of view in degrees ≈ 57.3 × sensor size ÷ focal length. A ZWO ASI533 on a 400 mm refractor covers about 1.6° × 1.6°.</li>
<li><b>Pixel size</b> (optional) adds your image scale in arcseconds per pixel. Around 1 to 3″ per pixel suits most backyard deep-sky imaging.</li>
<li><b>Mount:</b> every smart scope is <b>alt-az</b>. Choose <b>Equatorial</b> for a camera on an EQ mount; it changes how the frame check works (below).</li>
<li><b>Field of view:</b> the patch of sky one frame covers, in degrees, long side first. This is what the frame check uses. Use the single-frame figure, not the mosaic mode's.</li>
<li><b>Filters:</b> listed first when you choose a filter in a log entry.</li>
<li><b>Save and Use</b> makes it tonight's scope.</li>
</ul>
<table class="hk">
<tr><th>Model</th><th>Field of view</th><th>Aperture, focal length</th></tr>
<tr><td>Dwarf Mini</td><td>2.13° × 1.20°</td><td>30 mm, 150 mm (f/5)</td></tr>
<tr><td>Dwarf 3</td><td>2.93° × 1.65°</td><td>35 mm, 150 mm (f/4.3)</td></tr>
<tr><td>Dwarf II</td><td>3.19° × 1.79°</td><td>24 mm, 100 mm (f/4.2)</td></tr>
<tr><td>Seestar S30</td><td>2.13° × 1.20°</td><td>30 mm, 150 mm (f/5)</td></tr>
<tr><td>Seestar S30 Pro</td><td>3.99° × 2.24°</td><td>30 mm, 160 mm (f/5.3)</td></tr>
<tr><td>Seestar S50</td><td>1.29° × 0.73°</td><td>50 mm, 250 mm (f/5)</td></tr>
<tr><td>Seestar S50 Pro</td><td>2.45° × 1.38°</td><td>50 mm, 260 mm (f/5.2)</td></tr>
</table>
<h4>Does it fit the frame?</h4>
<p>The <b>Size / frame</b> column compares each object's size with your field of view. Smart telescopes sit on alt-az mounts, so the frame turns slowly against the sky during a long session (field rotation) and the stacked image gets cropped to the part every frame covered. So <b>Fits</b> means the object fits whichever way the frame turns, with a little room to spare. <b>Snug</b> means it only fits lengthwise; expect the edges to be tight. <b>Too big</b> means more than one frame: use your scope's mosaic mode if it has one, or frame the brightest part.</p>
<p>On an <b>equatorial</b> mount the frame doesn't turn, and you can rotate the camera to line it up, so an object that fits lengthwise counts as <b>Fits</b>. <b>Small</b> means it covers under 4% of the frame width either way; it will be a speck unless you crop.</p>
<p class="tip">Catalog sizes are measured on deep photographs, so faint outer parts you won't capture from town are included. An object marked Snug often looks fine.</p>`},

{id:"plan", title:"Planning a session", html:`
<h3>Planning a session</h3>
<h4>Session</h4>
<ul>
<li><b>Date (night of):</b> the evening your session starts. A session from 11 pm to 1 am on the night of the 20th stays under the 20th.</li>
<li><b>From / To:</b> your start and finish times, in your site's time zone. Below them is the <b>sidereal time</b> at the start and end (see <a href="#" data-topic="radec">RA / Dec and your telescope</a>).</li>
<li><b>Scope:</b> the telescope you're using tonight, from <b>Setup → Equipment</b>. It sets the frame size for the Size / frame column. Choose (none) to turn the frame check off.</li>
<li><b>Prev</b>, <b>Tonight</b> and <b>Next</b> on the toolbar step through nights, which is handy for planning a week ahead.</li>
</ul>
<h4>The Targets table</h4>
<table class="hk">
<tr><th>Object</th><td>Catalog number and type, with its common name and other designations (M31 is also NGC 224). The colored swatch matches its line on the chart.</td></tr>
<tr><th>Mag</th><td>Brightness: smaller is brighter. "SB" below it is the surface brightness for galaxies and nebulae (see <a href="#" data-topic="filters">Filters</a>).</td></tr>
<tr><th>Size / frame</th><td>How big it looks, in arcminutes (′; the full Moon is about 31′). With a scope chosen, how it fits your frame: <b>Fits</b> (fits at any angle), <b>Snug</b> (fills the frame; fits only along the long side), <b>Too big</b> (needs a mosaic, or settle for the core), or <b>Small</b> (tiny in the frame; crop to enlarge). The percentage is its size against the width of the frame. See <a href="#" data-topic="equipment">Your equipment</a>.</td></tr>
<tr><th>RA / Dec</th><td>Its position in the sky (J2000), for telescope apps that take coordinates.</td></tr>
<tr><th>In window</th><td>When it is inside your sky box tonight, and for how many minutes in a row.</td></tr>
<tr><th>Alt range</th><td>How high it is while in your box. Higher is better: less air and less city glow.</td></tr>
<tr><th>Transit</th><td>When it crosses the meridian (due south), its highest point of the night, and how high that is. Shown in <b>bold</b> when it happens during your session: the best time to image it.</td></tr>
<tr><th>Moon</th><td>How far it is from the Moon, flagged when a bright Moon is too close. "Down" means the Moon is below the horizon then.</td></tr>
<tr><th>Your log</th><td>How much time you've already spent on it, from your imaging log.</td></tr>
</table>
<p>Tick <b>Not-yet-imaged first</b> to bring targets you haven't logged to the top.</p>
<p><b>Just past your limit</b> lists objects up to 1.5 magnitudes fainter than your limit. Star clusters there often image fine; faint galaxies usually don't.</p>
<h4>Your window in sky coordinates</h4>
<p>This table shows the patch of sky your box covers, in RA and Dec, at the start and end of your session. Your box is fixed to the ground, so the sky slides through it: the RA range moves about one hour for every hour of clock time, while the Dec range stays put.</p>`},

{id:"chart", title:"Reading the sky box chart", html:`
<h3>Reading the sky box chart</h3>
<p>The chart is a picture of your view: compass direction across the bottom, height above the horizon up the side, and your sky box in yellow.</p>
<ul>
<li>Each <b>colored line</b> is a target's path during your session, matching the swatch beside it in the tables. <b>Solid</b> lines are within your magnitude limit; <b>dashed</b> lines are just past it.</li>
<li>Each path starts with a <b>symbol</b> for the object's type, at its place at your start time: an ellipse for a galaxy, a circle with a cross for a globular cluster, a dotted circle for an open cluster, a square for a nebula, a circle with four spokes for a planetary nebula, and a dotted circle in a square for a cluster with nebula. The key under the chart lists the ones on tonight's chart. Small squares mark every 30 minutes after that.</li>
<li>The thick <b>gray line</b> with a round marker is the <b>Moon</b>, when it's in view.</li>
<li>In the background, faint <b>stars</b> (brighter ones are bigger), <b>constellation figures</b> and names show the sky as it stands at your start time, so you can tell where your box sits among the patterns you know. The stars go down to magnitude 5, a little fainter than you'll see from a city.</li>
<li>The dashed line is the <b>meridian</b>, the line due south (and due north) through the point overhead. Every object is highest when it crosses it; that's the Transit time in the tables. Imaging near the meridian means looking through the least air.</li>
<li>Along the bottom, a little <b>skyline</b> of houses, trees and poles marks the ground. It's for looks, not a map of your real view: each site gets its own street, and it always stays below your sky box. Your box is what tells the planner where you can actually see.</li>
<li>Use <b>Show</b> above the chart to turn constellations, stars, the meridian or the horizon skyline off. Your choice is remembered.</li>
<li><b>Point at a row</b> in the Targets table to highlight that target's path and fade the others. On a busy night, this is the easiest way to read the chart.</li>
<li><b>Point at any spot</b> on the chart to read its compass direction, height, RA and Dec (at your start time) under the chart.</li>
</ul>
<p>Targets move from left to right (east to west) as the night goes on, rising on the left and setting on the right.</p>`},

{id:"filters", title:"Filters and catalogs", html:`
<h3>Filters and catalogs</h3>
<h4>Min. time in window</h4>
<p>How long a target must stay in your box, without leaving, to be listed. One hour suits most smart telescopes; choose longer if you like deep stacks.</p>
<h4>Magnitude limit</h4>
<p>The faintest total brightness to list. Smaller numbers are brighter. From a bright suburb or city (Bortle 7 to 9), <b>6.0</b> is a sensible start; raise it to 7 or 8 under darker skies or with longer exposures.</p>
<h4>Surface brightness</h4>
<p>A galaxy's magnitude is its <i>total</i> light. A big galaxy spreads that light thinly over a large area, so it can vanish against a bright sky even when its magnitude looks good. Surface brightness measures how bright each small patch is (in magnitudes per square arcsecond; again, smaller is brighter).</p>
<p>Choose a limit to hide thin, spread-out galaxies and nebulae. For city skies, <b>22 or brighter</b> is a good start: it keeps the Andromeda Galaxy (M31, 22.3) and drops the Triangulum Galaxy (M33, 22.8), which is very hard from town. Star clusters are never filtered by this, because their stars show individually.</p>
<h4>Moon</h4>
<p><b>Show distance only</b> lists everything and flags Moon trouble in the Moon column. <b>Hide targets it washes out</b> removes targets marked "too close" (see <a href="#" data-topic="moon">The Moon and darkness</a>).</p>
<h4>Catalogs</h4>
<ul>
<li><b>Messier</b>: the 110 classic showpieces, mostly bright and well placed for northern observers.</li>
<li><b>Caldwell</b>: 109 more favorites chosen by Patrick Moore, such as the Double Cluster, the Veil and the Helix. (The Coalsack, a dark nebula, is left out.)</li>
<li><b>NGC / IC</b>: every other deep-sky object in those catalogs down to magnitude 10.5.</li>
</ul>
<p>An object in more than one catalog appears once. It's shown when any of its catalogs is ticked.</p>`},

{id:"moon", title:"The Moon and darkness", html:`
<h3>The Moon and darkness</h3>
<h4>Tonight's sky</h4>
<p>The panel shows the Moon's phase and how much is lit, when it rises and sets, and where it is during your session. The second line gives sunset and the hours of <b>full darkness</b> (astronomical twilight). If your session starts before full darkness, it says so: the background sky is brighter until then.</p>
<h4>The Moon column</h4>
<p>Moonlight brightens the whole sky, worst near the Moon itself. The planner measures each target's distance from the Moon while the target is in your window, and flags it by how bright the Moon is:</p>
<table class="hk">
<tr><th>Moon lit</th><th>"Too close"</th><th>"Close"</th></tr>
<tr><td>75% or more</td><td>under 35°</td><td>under 70°</td></tr>
<tr><td>40 to 75%</td><td>under 25°</td><td>under 50°</td></tr>
<tr><td>25 to 40%</td><td>under 15°</td><td>under 30°</td></tr>
<tr><td>under 25%</td><td colspan="2">never flagged</td></tr>
</table>
<p>"Down" means the Moon is below the horizon while that target is in your window, so it doesn't matter tonight.</p>
<p class="tip">Around full Moon, stick to bright star clusters and planetary nebulae, or use a dual-band filter for emission nebulae. Save galaxies for the week around new Moon.</p>`},

{id:"radec", title:"RA / Dec, sidereal time, transit", html:`
<h3>RA / Dec and your telescope</h3>
<p>Right ascension (RA) and declination (Dec) are the sky's latitude and longitude. RA is given in hours and minutes (0h to 24h); Dec in degrees north (+) or south (−) of the celestial equator.</p>
<p>The planner shows coordinates for the standard <b>J2000</b> epoch, which most telescope apps, star charts and plate solvers use. If your telescope app lets you go to a target by name or catalog number, you won't need them; they're there for apps that take coordinates, and for finding things on a chart.</p>
<h4>Sidereal time and transit</h4>
<p><b>Local sidereal time</b> (LST) is star time: it equals the right ascension that is crossing your <b>meridian</b>, the line from north through overhead to due south. At an LST of 19h 40m, objects at RA 19h 40m are due south and as high as they get. Sidereal time runs about 4 minutes a day faster than clock time, which is why the same object rises 4 minutes earlier each night.</p>
<p>The planner shows LST beside your session times, in the <b>Your window in sky coordinates</b> table, and in the chart's pointer readout. Each target's <b>Transit</b> time is when the LST equals its RA.</p>
<p>Objects drift about a third of a degree from their J2000 positions over 25 years because Earth's axis wobbles slowly (precession). The planner allows for that in its own calculations.</p>`},

{id:"log", title:"Your imaging log", html:`
<h3>Your imaging log</h3>
<h4>Adding an entry</h4>
<p>Click <b>Log…</b> beside a target, or <b>Log Entry</b> on the toolbar. The date, site and scope are filled in for you. Fill in what you have; only the object is required.</p>
<ul>
<li><b>Object:</b> type any designation or name: "M31", "NGC 224", "Caldwell 63" or "Helix Nebula" all work, and are filed under one name.</li>
<li><b>Number of subs</b> and <b>Sub length:</b> the planner multiplies them into your total integration time.</li>
<li><b>Filter:</b> pick from the list, which starts with your scope's own filters, or type any name.</li>
<li><b>Gain</b>, <b>Sky conditions</b>, <b>Result</b> (one to five stars) and <b>Notes:</b> whatever helps you compare sessions later.</li>
</ul>
<h4>My Log</h4>
<p>Click <b>My Log</b> to see every entry, newest first, with search. Switch <b>View</b> to <b>Totals by object</b> to see how much time you've spent on each target, or <b>Totals by scope</b> to compare your telescopes. <b>Edit</b> and <b>Delete</b> are beside each entry.</p>
<p><b>Export CSV</b> downloads your log as a spreadsheet file you can open in Excel or similar.</p>
<p>Your log is private. Nobody else can see it; Club Stats shows only club-wide totals.</p>`},

{id:"red", title:"Red Light mode", html:`
<h3>Red Light mode</h3>
<p>Your eyes take 20 to 30 minutes to adapt fully to the dark, and one glance at a white screen undoes it. Click <b>Red Light</b> on the toolbar to turn the whole planner black and red. Red light disturbs dark adaptation the least.</p>
<p>Click it again to switch back. Your choice is remembered.</p>
<p class="tip">Turn your phone or screen brightness all the way down as well. Red Light mode works best dim.</p>`},

{id:"account", title:"Your account", html:`
<h3>Your account</h3>
<p>Click <b>Account</b> to change your name, callsign or password. Your user name can't be changed.</p>
<p>You stay signed in on each device for 90 days, so you won't need your password often. On a shared or public computer, click <b>Log Off</b> when you finish.</p>
<p><b>Forgot your password?</b> Ask the site administrator. They'll give you a temporary password, and the planner will ask you to choose a new one when you sign in with it.</p>
<p><b>Club Stats</b> shows the club's totals: members, sessions logged, hours of light collected, and the club's favorite target. After an update, a <b>What's New</b> window appears once to describe the changes; <b>About</b> has the full version history.</p>`},

{id:"tips", title:"Tips for imaging from town", html:`
<h3>Tips for imaging from town</h3>
<ul>
<li><b>Go for compact, bright targets.</b> Globular and open clusters and planetary nebulae cut through light pollution far better than big galaxies.</li>
<li><b>Higher is better.</b> Near the horizon you look through more air and more city glow. Prefer targets with a higher <b>Alt range</b>.</li>
<li><b>Mind the Moon.</b> Plan galaxies and faint nebulae around new Moon; keep clusters for moonlit nights.</li>
<li><b>Use a dual-band filter on emission nebulae.</b> It passes the glowing gas and blocks most streetlight. The Lagoon (M8), Eagle (M16), Omega (M17) and North America (NGC 7000) nebulae all respond well.</li>
<li><b>Stack longer.</b> From a bright sky, an hour or more of total integration on one target beats ten minutes each on six.</li>
<li><b>Come back to a target.</b> Log each session; the planner adds them up so you can see your total time on an object grow over several nights.</li>
<li><b>Wait for full darkness</b> when you can. The <b>Tonight's sky</b> panel shows when it begins.</li>
</ul>`},

{id:"glossary", title:"Glossary", html:`
<h3>Glossary</h3>
<table class="hk">
<tr><th>Altitude</th><td>Height above the horizon, 0° to 90°.</td></tr>
<tr><th>Azimuth</th><td>Compass direction, clockwise from north: 90° east, 180° south, 270° west.</td></tr>
<tr><th>Bortle class</th><td>A 1 to 9 scale of sky darkness. 1 is a pristine dark site; 8 and 9 are city skies.</td></tr>
<tr><th>Caldwell</th><td>A list of 109 bright deep-sky objects compiled by Sir Patrick Moore to complement Messier's.</td></tr>
<tr><th>Dec (declination)</th><td>Position north or south of the celestial equator, in degrees.</td></tr>
<tr><th>Integration</th><td>The total exposure time of a stack: number of subs × sub length.</td></tr>
<tr><th>J2000</th><td>The standard reference date for star coordinates (January 1, 2000).</td></tr>
<tr><th>Magnitude</th><td>Brightness on a scale where smaller is brighter. Each step is about 2.5 times brighter or fainter.</td></tr>
<tr><th>Meridian</th><td>The line across the sky from due north, through overhead, to due south. Objects are highest when they cross it.</td></tr>
<tr><th>Messier</th><td>Charles Messier's 18th-century list of 110 bright nebulae and clusters, numbered M1 to M110.</td></tr>
<tr><th>NGC / IC</th><td>The New General Catalogue and Index Catalogues: about 13,000 deep-sky objects.</td></tr>
<tr><th>RA (right ascension)</th><td>Position around the sky east of the March equinox point, in hours (0h to 24h).</td></tr>
<tr><th>Sidereal time</th><td>Star time: the right ascension crossing your meridian right now. It gains about 4 minutes a day on clock time.</td></tr>
<tr><th>Sub</th><td>One exposure in a stack, usually a few seconds to a minute on a smart telescope.</td></tr>
<tr><th>Surface brightness</th><td>Brightness per small patch of an extended object, in magnitudes per square arcsecond.</td></tr>
<tr><th>Transit</th><td>An object crossing the meridian, at its highest point of the night.</td></tr>
<tr><th>Twilight (astronomical)</th><td>The time after sunset until the Sun is 18° below the horizon. After that the sky is fully dark.</td></tr>
</table>`},

{id:"faq", title:"Questions and problems", html:`
<h3>Questions and problems</h3>
<h4>The Targets list is empty.</h4>
<p>Nothing bright enough stays in your box long enough tonight. Try a shorter <b>Min. time in window</b>, a higher <b>Magnitude limit</b>, a later session, or another night with <b>Next</b>. Check that at least one catalog is ticked under Filters. Some patches of sky are simply sparse in some seasons.</p>
<h4>An object I expected isn't listed.</h4>
<p>It may be fainter than your limit (check "Just past your limit"), filtered out by surface brightness or the Moon setting, outside your box during your session, or never high enough to reach the bottom of your box from your latitude.</p>
<h4>The times look wrong.</h4>
<p>Check your site's time zone under <b>Setup → Sites</b>. All times are shown in the site's time zone.</p>
<h4>A target is in the list, but my telescope can't see it.</h4>
<p>Your sky box may be bigger than your real view. Tighten it under <b>Setup → Sites</b>; a tree or roof just inside the edge is the usual culprit.</p>
<h4>I forgot my password.</h4>
<p>Ask the site administrator for a temporary one.</p>
<h4>Something else is wrong, or I have an idea.</h4>
<p>Tell the site administrator. Every question helps make the planner better.</p>`},

{id:"admin", title:"For administrators", admin:true, html:`
<h3>For administrators</h3>
<p>The <b>Admin</b> button appears only for administrators.</p>
<ul>
<li><b>Invite a friend:</b> type who it's for, click <b>Create Invite</b>, then <b>Copy Sign-up Link</b> and send it. Each code works once. Unused codes can be revoked.</li>
<li><b>Members</b> are listed least recently active first. Anyone with no activity for 90 days is marked <b>Inactive</b>, and a red badge on the Admin button shows how many.</li>
<li><b>Properties…</b> beside a member lets you reset their password (they choose a new one at next sign-in), turn the account off or on, make them an administrator, or delete them.</li>
<li><b>Download Backup</b> saves a copy of the whole database to your computer.</li>
</ul>
<p>Server set-up, nightly backups, restoring, updating and troubleshooting are covered in the <b>Administrator's Guide</b> (<code>ADMIN.md</code>, shipped with the app).</p>`},
];
