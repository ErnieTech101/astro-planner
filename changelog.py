"""Release notes shown to members in the What's New window, newest first.

Write them for members, not administrators: what they'll notice and how to use it.
"""
CHANGELOG = [
    ("1.5.5", "2026-10-29", [
        "Phones: add your phone under Setup → Equipment (Type: Phone). Presets cover Pixel 8 Pro to 11 Pro, iPhone 13 Pro to 18 Pro, and Galaxy S23 to S26, with both the main and telephoto lenses. A Phone targets table then lists the Moon, planets, bright clusters and constellations passing through your box, with which lens to use. Thanks to our beta testers for the idea.",
        "Planets: Mercury, Venus, Mars, Jupiter and Saturn now appear on the chart, and Tonight's sky lists the ones that are up and whether they cross your box.",
        "Frame: a dashed rectangle on the chart shows how much sky one shot with your scope or phone covers. Point at a target in the tables and it moves onto that target.",
        "New Planets and Frame checkboxes under Show.",
    ]),
    ("1.5.4", "2026-10-29", [
        "The sky box chart now has a little neighborhood along the bottom: houses, trees, utility poles and the odd lit window. Each site gets its own street. Don't like it? Untick Horizon under Show.",
    ]),
    ("1.5.3", "2026-10-25", [
        "Not a smart scope? Setup → Equipment now has Calculate from Camera: pick your camera (ZWO models, DSLR and mirrorless sizes) or type the sensor size, enter the focal length and any reducer, and it fills in the field of view.",
        "Equipment now has Pixel size, which shows your image scale in arcseconds per pixel, and Mount: alt-az or equatorial. On an equatorial mount the frame doesn't rotate, so the Size / frame check is less cautious.",
    ]),
    ("1.5.2", "2026-10-25", [
        "Setup: the Sites button is now Setup, with two tabs: Sites and Equipment.",
        "Equipment: add the scopes you image with. Pick a model (Dwarf Mini, Dwarf 3, Dwarf II, Seestar S30, S30 Pro, S50 or S50 Pro) and its field of view, aperture, focal length and filters are filled in. Have more than one? Choose tonight's with the new Scope list under Session.",
        "Fits the frame: a new Size / frame column shows each object's size and whether it fits your scope's frame, fills it, or needs a mosaic.",
        "Your log records which scope you used, its filters are suggested first, and My Log can total your time by scope.",
        "Club Stats now shows which scopes club members use.",
    ]),
    ("1.5.1", "2026-10-25", [
        "The sky box chart now shows the sky behind your box: faint stars and constellation figures with their names, as they stand at your start time.",
        "A dashed meridian line marks due south, where every object reaches its highest point.",
        "Each target's path now starts with a symbol for its type (galaxy, globular, open cluster, nebula and so on). A key under the chart explains them.",
        "Too busy? Use Show, above the chart, to turn constellations, stars or the meridian off. Your choice is remembered.",
    ]),
    ("1.5.0", "2026-10-25", [
        "Sidereal time: shown under your session times, in the Your window in sky coordinates table, and when you point at the chart.",
        "Transit times: a new Transit column shows when each target crosses due south, its highest point of the night, and how high it gets. Bold means it happens during your session. Thanks to our beta testers for the idea.",
    ]),
    ("1.4.0", "2026-10-19", [
        "Help: click Help on the toolbar or press F1. It covers everything from setting up your site (including how to measure your sky box with a phone and your fist) to tips for imaging from town. The small ? buttons beside some sections open the matching topic.",
        "About: the version, credits, and the full version history.",
    ]),
    ("1.3.0", "2026-10-19", [
        "Club Stats: see how many members we have, how many sessions everyone has logged, and the club's favorite target. Click Club Stats on the toolbar.",
        "This What's New window, which appears once after each update.",
    ]),
    ("1.2.0", "2026-10-19", [
        "Many more targets: all 110 Messier objects, the Caldwell list, and NGC/IC objects down to magnitude 10.5. Choose your catalogs under Filters.",
        "The Moon: a Tonight's sky panel with its phase, rise and set times, and where it is during your session. Each target shows its distance from the Moon, flagged when a bright Moon is too close.",
        "Surface brightness filter, to skip big faint galaxies that are hard to image from town.",
        "Sunset and full-darkness times, with a note when your session starts in twilight.",
        "Red Light mode now tints the toolbar icons red as well.",
    ]),
    ("1.1.1", "2026-10-19", [
        "Easier-to-read chart: each target has its own color, matching a swatch in the target tables. Point at a table row to highlight its track.",
    ]),
    ("1.1.0", "2026-10-19", [
        "Behind the scenes: nightly backups of everyone's data.",
    ]),
    ("1.0.0", "2026-10-17", ["First release."]),
]


def vkey(v):
    return tuple(int(x) for x in (v or "0").split("."))


def news_since(seen, current):
    """Entries a member hasn't seen. A member who has never seen any gets just the current release."""
    if not seen:
        return [e for e in CHANGELOG if e[0] == current][:1]
    return [e for e in CHANGELOG if vkey(seen) < vkey(e[0]) <= vkey(current)]
