import { md, gd, type Module } from '../types';

const PRESETS_CFG = `; export_presets.cfg (excerpt). Godot writes this file; commit it.
[preset.0]

name="Windows Desktop"
platform="Windows Desktop"
runnable=true
export_filter="all_resources"
exclude_filter="test/*, docs/*"
export_path="builds/windows/Shardbound.exe"

[preset.0.options]

binary_format/embed_pck=false
application/product_name="Shardbound"

[preset.1]

name="Linux"
platform="Linux"
runnable=true
export_filter="all_resources"
exclude_filter="test/*, docs/*"
export_path="builds/linux/Shardbound.x86_64"
`;

const BUILD_SH = `#!/bin/sh
# tools/build.sh: export release builds of every platform from the command line.
# Run from the project folder; "godot" is the editor binary of the same version as the templates.
set -e
mkdir -p builds/windows builds/linux
godot --headless --export-release "Windows Desktop" builds/windows/Shardbound.exe
godot --headless --export-release "Linux" builds/linux/Shardbound.x86_64
echo "Built $(git describe --tags --always)"
`;

const FOCUS_PAUSE = gd`
extends Node
## Pauses the game when the window loses focus: alt-tab, the Steam overlay, a Deck going to sleep.
## Add it to the main scene. Resuming is left to the pause menu, so the player is never surprised.

@export var pause_menu: CanvasItem


func _ready() -> void:
    process_mode = Node.PROCESS_MODE_ALWAYS


func _notification(what: int) -> void:
    if what == NOTIFICATION_APPLICATION_FOCUS_OUT and not get_tree().paused:
        get_tree().paused = true
        if pause_menu:
            pause_menu.show()
`;

const APP_BUILD = `"AppBuild"
{
	"AppID" "1234560"
	"Desc" "Shardbound 0.3.0 slice"
	"ContentRoot" "../builds/"
	"BuildOutput" "../steam_output/"
	"SetLive" "beta"
	"Depots"
	{
		"1234561"
		{
			"FileMapping"
			{
				"LocalPath" "windows/*"
				"DepotPath" "."
				"recursive" "1"
			}
		}
		"1234562"
		{
			"FileMapping"
			{
				"LocalPath" "linux/*"
				"DepotPath" "."
				"recursive" "1"
			}
		}
	}
}
`;

const UPLOAD_SH = `#!/bin/sh
# tools/upload.sh: export, then upload to Steam. The account is a Steamworks builder account;
# steamcmd asks for the password and a Steam Guard code the first time.
set -e
sh tools/build.sh
steamcmd +login my_builder_account +run_app_build "$(pwd)/steam/app_build_1234560.vdf" +quit
`;

const STEAM_SERVICE = gd`
extends Node
## SteamService autoload: a thin wrapper around GodotSteam. The game calls these methods and never
## touches Steam directly, so a build without Steam (a DRM-free copy, a playtest build) still runs.
## The GodotSteam calls are illustrative: check names and return values against the version you install.

const APP_ID := 480  # Valve's "Spacewar" test app; replace with your own app ID

var is_ready := false
var _steam = null  # untyped on purpose: its methods come from the extension, not from Object


func _init() -> void:
    # lets the game find its app ID when started from the editor instead of the Steam client
    OS.set_environment("SteamAppId", str(APP_ID))
    OS.set_environment("SteamGameId", str(APP_ID))


func _ready() -> void:
    if not Engine.has_singleton("Steam"):
        push_warning("GodotSteam is not installed: running without Steam")
        return
    _steam = Engine.get_singleton("Steam")
    var result: Dictionary = _steam.steamInitEx()
    # status 0 means OK; otherwise (Steam not running, wrong app ID) "verbal" explains why
    if int(result.get("status", -1)) != 0:
        push_warning("Steam init failed: %s" % result.get("verbal", "unknown error"))
        return
    is_ready = true


func _process(_delta: float) -> void:
    if is_ready:
        _steam.run_callbacks()  # delivers Steam's replies and events to the game


func unlock_achievement(api_name: String) -> void:
    if not is_ready:
        return
    _steam.setAchievement(api_name)
    # storeStats sends the change to Steam; without it the unlock may never reach the servers
    _steam.storeStats()
`;

const ACHIEVEMENTS = gd`
extends Node
## Maps game events to achievements, so gameplay code never mentions Steam.
## Assumes the Events bus declares boss_defeated(boss_id: String) and shard_equipped().


func _ready() -> void:
    Events.boss_defeated.connect(_on_boss_defeated)
    Events.shard_equipped.connect(_on_shard_equipped)


func _on_boss_defeated(boss_id: String) -> void:
    if boss_id == "golem":
        SteamService.unlock_achievement("ACH_GOLEM")


func _on_shard_equipped() -> void:
    SteamService.unlock_achievement("ACH_FIRST_SHARD")
`;

const USER_DIR_CFG = `; project.godot (excerpt): a stable save folder for Steam Auto-Cloud
[application]

config/name="Shardbound"
config/use_custom_user_dir=true
config/custom_user_dir_name="Shardbound"
; user:// is now %APPDATA%\\Shardbound on Windows and ~/.local/share/Shardbound on Linux
`;

const STORE_DRAFT = `SHORT DESCRIPTION (one or two sentences: genre, hook, what you do)
A pixel-art action RPG where you fight in real time to charge your party's ATB, then slow
time to spend it on abilities. Lead three heroes, socket shards into your gear, and climb
a ruined land where every ledge can be jumped.

TAGS (accurate first; the ones a fan of the game would search for)
Action RPG, Pixel Graphics, Party-Based RPG, Real-Time with Pause, Exploration,
Singleplayer, 2D, Fantasy, Controller

SCREENSHOTS (1920x1080 or 1280x720 integer-scaled captures, no UI mock-ups)
1 combat: Kai mid-combo, ATB bars filling, a slime flashing
2 tactical mode: time slowed, ability menu open, golem staggered
3 exploration: jumping between two cliff heights in the field
4 the town at dusk, NPC dialogue box
5 equipment screen with shards socketed
`;

const LICENSES = gd`
extends RichTextLabel
## Credits > Licenses. Godot's MIT licence asks you to include its notice; its third-party
## components have their own notices, and Godot can list them all at runtime.


func _ready() -> void:
    bbcode_enabled = true
    var lines: Array[String] = []
    lines.append("[b]Godot Engine[/b]")
    lines.append(Engine.get_license_text())
    for info in Engine.get_copyright_info():
        lines.append("[b]%s[/b]" % info["name"])
        for part in info["parts"]:
            lines.append("%s (%s)" % [", ".join(part["copyright"]), part["license"]])
    lines.append("[b]Add-ons and assets[/b]")
    lines.append("GodotSteam (MIT). GUT, development only (MIT). Course art and sound (CC0).")
    text = "\n".join(lines)
`;

export const MODULE: Module = {
  id: 'p03',
  part: 'ship',
  order: 3,
  title: 'Shipping on Steam',
  summary: 'Export templates and presets, release builds for Windows and Linux, screen scaling for the Steam Deck; Steamworks, SteamPipe uploads, GodotSteam achievements and cloud saves; the store page, Coming Soon and Next Fest timing, pricing, revenue and the legal basics.',
  relevance: md`This is the path from "it runs in the editor" to "it is for sale". Shardbound gets a scripted release export for Windows and Linux that scales cleanly on a Steam Deck, a Steamworks app with depots and a beta branch fed by \`steamcmd\`, a \`SteamService\` autoload that unlocks achievements without tying gameplay code to Steam, Auto-Cloud saves, a Coming Soon page with a dated plan to Next Fest and launch, and a revenue model you can check against the price you choose.`,
  prereqs: ['p02'],
  areas: ['ship'],
  lessons: [
    // =========================================================================== p03-1
    {
      id: 'p03-1',
      title: 'Exporting builds: templates, presets and the Steam Deck',
      minutes: 40,
      objectives: [
        'Install export templates and create Windows, Linux and macOS presets; know what `export_presets.cfg` holds.',
        'Export a release build (executable + `.pck`) from the editor and from the command line.',
        'Configure the 320×180 viewport for integer scaling and check text size on a 1280×800 screen.',
        'Prepare for the Steam Deck (Linux or Proton, gamepad-first UI, focus loss) and know the macOS notarization caveat.',
      ],
      cells: [
        {
          kind: 'text',
          md: md`A player does not have Godot. What they download is an **export**: a copy of the Godot engine compiled for their platform (an *export template*), plus your project packed into a single data file, the \`.pck\`. Exporting is quick once set up, but the first time has traps: missing templates, a \`.pck\` left behind, a debug build shipped by accident, text that looked fine on a 27-inch monitor and is unreadable on a 7-inch Deck.

This lesson sets up exports once, scripts them so every build is made the same way, and checks the result on the screens players will actually use.`,
        },
        {
          kind: 'callout',
          tone: 'godot',
          title: 'Templates, presets and the .pck',
          md: md`**Export templates** are the engine binaries for each platform, in debug and release versions. They must match your editor's version exactly; install them from **Editor → Manage Export Templates → Download and Install**.

An **export preset** (**Project → Export → Add...**) holds the settings for one target:
- platform and output path
- which resources to include
- icons, version numbers and product name.

Godot stores all presets in \`export_presets.cfg\` at the project root; commit it, so any machine can produce the same build. Passwords and signing keys go to \`.godot/export_credentials.cfg\` instead, which is ignored with the rest of \`.godot/\`.

An export produces an executable and a \`.pck\` with the same name, which must stay next to each other, unless you tick *Embed PCK* to put them in one file. **Release** exports leave out the debugger and editor-only checks. Export with *Export With Debug* unticked for players.`,
        },
        {
          kind: 'steps',
          title: 'First release export',
          steps: [
            md`**Editor → Manage Export Templates**: click **Download and Install** and wait for the templates of your exact version.`,
            md`**Project → Export → Add... → Windows Desktop**. Set *Export Path* to \`builds/windows/Shardbound.exe\`. In *Resources*, add \`test/*, docs/*\` to the exclude filter so tests and notes do not ship. Under *Application*, set the product name and version.`,
            md`**Add... → Linux**, path \`builds/linux/Shardbound.x86_64\`. Add **macOS** too if you plan to sell there (see the caveat below).`,
            md`Select Windows Desktop and click **Export Project**. Untick **Export With Debug** and save. Do the same for Linux.`,
            md`Copy the whole \`builds/windows\` folder (executable and \`.pck\`) to a machine without Godot and run it. Check that F1 (the debug overlay) does nothing.`,
          ],
          result: md`\`builds/windows\` contains \`Shardbound.exe\` and \`Shardbound.pck\`; the game starts on another computer, at the right scale, without the debug overlay.`,
          troubleshoot: [
            { problem: md`"No export template found at the expected path".`, fix: md`Templates are missing or for a different version (4.4.1 templates do not work with a 4.4 editor). Install them from *Manage Export Templates*.` },
            { problem: md`The exported game shows errors about missing resources that work in the editor.`, fix: md`Something is loaded by a path built at runtime (\`load("res://enemies/" + name + ".tscn")\`), so the exporter did not see it as used. Keep *Export all resources* on, or add those folders to the include filter.` },
            { problem: md`A tester gets "Couldn't load project data".`, fix: md`They received the executable without the \`.pck\`. Ship the folder, or enable *Embed PCK*.` },
          ],
        },
        { kind: 'code', file: 'export_presets.cfg', lang: 'cfg', code: PRESETS_CFG },
        {
          kind: 'text',
          md: md`### Exporting from the command line

Clicking through the export dialog for every platform before every upload invites mistakes. The editor binary can export headlessly using the presets: \`--export-release "<preset name>" <path>\` (and \`--export-debug\` for test builds, \`--export-pack\` for a \`.pck\` alone). A short script makes every build identical and is the first half of the Steam upload in the next lesson.`,
        },
        { kind: 'code', file: 'tools/build.sh', lang: 'text', code: BUILD_SH, note: md`On Windows, the same two \`godot\` lines work in a \`.bat\` file. \`git describe\` prints the latest tag, so tagging releases (\`git tag v0.3.0\`) names the build.` },
        {
          kind: 'check',
          q: md`A friend reports that \`Shardbound.exe\` opens and immediately closes with a message about project data. You sent them only the \`.exe\`. Why?`,
          options: [
            md`The game's scenes, scripts and assets are in \`Shardbound.pck\`, which must sit next to the executable unless *Embed PCK* is on`,
            md`Their computer needs Godot installed`,
            md`Release builds cannot run on other machines without the export templates installed there`,
            md`The executable needs \`export_presets.cfg\` next to it`,
          ],
          answer: 0,
          explain: md`The executable is the engine; the \`.pck\` is the game. Players need both files (or one embedded file). Templates and presets matter only on the machine that exports.`,
        },
        {
          kind: 'text',
          md: md`### Screens: integer scaling and the Steam Deck

Shardbound renders at 320×180 (GamePage's technical baseline). With **Stretch → Mode: viewport**, Godot draws the game at exactly 320×180 and then scales the image to the window. **Scale Mode: integer** only allows whole-number scales, so every game pixel becomes the same square of screen pixels, and fills the rest with black bars. **Fractional** fills more of the screen, but at 4.27× some game pixels are 4 screen pixels wide and some 5, which makes thin lines and scrolling shimmer.

The Steam Deck's screen is 1280×800: a 4× scale gives 1280×720 with 40-pixel bars above and below. It is also small, so the question is not whether the game fits but whether its text is readable at arm's length.`,
        },
        {
          kind: 'derive',
          title: 'How big is a letter on the Deck?',
          goal: md`Find the physical height of a 7-pixel capital letter from the bitmap font on a 7-inch 1280×800 screen at 4× scale.`,
          steps: [
            { md: md`On screen the letter is $7 \times 4 = 28$ pixels tall.` },
            {
              md: md`Pixel density: the diagonal has $\sqrt{1280^2 + 800^2} \approx 1509.4$ pixels over 7 inches, so about 215.6 pixels per inch (ppi).`,
              choose: {
                prompt: md`So the letter is how tall?`,
                options: [md`$28 / 215.6 \approx 0.13$ in $\approx 3.3$ mm`, md`$28 / 1509.4 \approx 0.02$ in`, md`$28 \times 25.4 / 7 \approx 102$ mm`],
                answer: 0,
                explain: md`Divide pixels by pixels per inch to get inches, then multiply by 25.4 for millimetres: $0.13 \times 25.4 \approx 3.3$ mm.`,
              },
            },
            { md: md`On a 24-inch 1080p monitor (92 ppi) at 6× the same letter is 42 px, about 11.6 mm, but viewed from about three times further away. What matters is the angle the letter covers at the eye, and handhelds are where text gets small. Check the real device, or a 1280×800 window held at arm's length, and draw HUD numbers at 2× if they are hard to read.` },
          ],
          takeaway: md`Readability is physical size against viewing distance, not pixels. A pixel font that is crisp on a desktop monitor can be too small on a handheld.`,
        },
        {
          kind: 'viz',
          viz: { type: 'ship.screenfit', screen: 'deck' },
          task: md`Compare **integer** and **fractional** on the laptop and the 2560×1600 screen. Then find the screen where the 7-pixel HUD text is physically smallest.`,
          caption: md`The readout's "game pixel" row shows the cost of fractional scaling: uneven pixel widths. The letter size uses each screen's diagonal and resolution; viewing distance is up to you.`,
        },
        {
          kind: 'numeric',
          q: md`On a 1366×768 laptop screen with integer scaling, how wide (in screen pixels) is each black bar at the left and right?`,
          answer: { kind: 'number', value: 43 },
          explain: md`The scale is $\min(\lfloor 1366/320 \rfloor, \lfloor 768/180 \rfloor) = \min(4, 4) = 4$, so the game is 1280 px wide; $(1366 - 1280)/2 = 43$ px on each side (and 24 px above and below).`,
        },
        {
          kind: 'callout',
          tone: 'design',
          title: 'Steam Deck checklist',
          md: md`The Deck runs SteamOS, a Linux system. It can run your Windows build through **Proton**, Valve's compatibility layer, or a native Linux build; Godot exports both, so test both and upload whichever works best. Valve reviews games for Deck compatibility and labels them in the store; their review looks at how the game plays on the device. For Shardbound:

- **Gamepad first.** Every screen, including options and the first-launch screen, works with the controller alone, and the on-screen button prompts show controller glyphs (r05).
- **Readable text** at 1280×800, as computed above.
- **Text entry** (naming a save) opens the on-screen keyboard, or avoid free text entirely.
- **Suspend and resume.** The device sleeps mid-fight; pausing on focus loss (below) keeps the player from dying while away.
- **Battery.** A 2D game has no reason to render at hundreds of frames per second; keep V-Sync on.`,
        },
        {
          kind: 'callout',
          tone: 'warning',
          title: 'macOS builds',
          md: md`macOS blocks apps downloaded from the internet unless they are **code-signed and notarized** by Apple, which requires a paid Apple Developer Program membership and a Mac (or Godot's signing tools with the right certificates). An unsigned build will show a warning or refuse to open, and players will report the game as broken. Either set up signing and notarization in the macOS export preset (the *Codesign* and *Notarization* options) and test on a real Mac, or launch on Windows and Linux first and add macOS later.`,
        },
        { kind: 'code', file: 'scripts/focus_pause.gd', code: FOCUS_PAUSE },
        {
          kind: 'build',
          ch: {
            id: 'p03-1-build',
            title: 'Release builds that run anywhere',
            goal: md`Produce Windows and Linux release builds of the current slice with one command, and check them on the screens that matter.`,
            requirements: [
              md`\`tools/build.sh\` (or a \`.bat\`) exports both platforms in release mode into \`builds/\`, and \`builds/\` is in \`.gitignore\`.`,
              md`The Windows build runs on a computer without Godot; the Linux build runs on Linux or a Steam Deck.`,
              md`Scaling is integer with black bars; at 1280×800 the game fills 1280×720.`,
              md`HUD text is readable on a 1280×800 window viewed from arm's length (or on a Deck).`,
              md`Alt-tabbing away pauses the game; the debug overlay is absent from the release build.`,
            ],
            hints: [
              md`If the editor binary is not on your PATH, put its full path in the script.`,
              md`To test a 1280×800 screen without a Deck, set *Window Width/Height Override* to 1280×800 temporarily, or resize the window.`,
            ],
            solution: [
              { file: 'tools/build.sh', code: BUILD_SH, lang: 'text' },
              { file: 'scripts/focus_pause.gd', code: FOCUS_PAUSE },
            ],
            explain: md`The script turns exporting into one repeatable step; the next lesson adds the upload to it. The focus handler pauses only, leaving the resume to the pause menu, because unpausing automatically when focus returns could restart a fight before the player is ready.`,
          },
        },
        {
          kind: 'paper',
          problem: {
            id: 'p03-1-paper',
            title: 'A 2560×1600 laptop',
            type: 'compute',
            difficulty: 1,
            minutes: 4,
            statement: md`A laptop has a 2560×1600 screen. With integer scaling of the 320×180 viewport, what is the scale, and how tall is the black bar above the game? Enter both.`,
            solution: [md`$\lfloor 2560/320 \rfloor = 8$, $\lfloor 1600/180 \rfloor = 8$; the scale is 8, giving 2560×1440.`, md`The height left over is $1600 - 1440 = 160$ px, split into 80 px above and 80 below.`],
            answer: { kind: 'vector', value: [8, 80] },
          },
        },
        {
          kind: 'recall',
          prompt: md`What does an export consist of, and which files must a player receive?`,
          answer: md`An export template (the engine binary for the platform, release version) renamed as your executable, plus a \`.pck\` with the project's scenes, scripts and assets. Players need both side by side, or one file with *Embed PCK*.`,
        },
        {
          kind: 'explain',
          prompt: md`Why use integer scaling with black bars instead of filling the screen?`,
          model: md`Pixel art is built on a grid where every pixel is the same size. At an integer scale each game pixel becomes an identical square, so lines stay even and scrolling stays stable. A fractional scale such as 4.27× makes some pixels 4 screen pixels wide and some 5, which looks uneven and shimmers when the camera moves. The bars cost a little screen space; on common 16:9 screens at 1080p, 1440p and 4K they disappear entirely because those resolutions are exact multiples of 320×180.`,
        },
      ],
      cards: [
        { id: 'p03-1-c1', kind: 'cloze', text: md`Command-line release export: \`godot --headless --{{}} "Linux" builds/linux/Shardbound.x86_64\`.`, answers: ['export-release'] },
        { id: 'p03-1-c2', kind: 'compute', front: md`Integer scale of 320×180 on a 1280×800 Deck, and bar height?`, answer: { kind: 'vector', value: [4, 40] }, back: md`Scale 4 (1280×720), $(800-720)/2 = 40$ px above and below.` },
        { id: 'p03-1-c3', kind: 'concept', front: md`Which export file do you commit, and where do signing passwords go?`, back: md`Commit \`export_presets.cfg\`. Credentials go to \`.godot/export_credentials.cfg\`, which stays out of git with the rest of \`.godot/\`.` },
        { id: 'p03-1-c4', kind: 'concept', front: md`How can a Steam Deck run a Godot game?`, back: md`SteamOS is Linux: either a native Linux export or the Windows build through Proton. Test both.` },
        { id: 'p03-1-c5', kind: 'concept', front: md`What do macOS builds need before players can open them normally?`, back: md`Code signing and notarization by Apple (a paid developer membership). Otherwise Gatekeeper warns or blocks the app.` },
      ],
    },
    // =========================================================================== p03-2
    {
      id: 'p03-2',
      title: 'Steamworks: SteamPipe, GodotSteam, achievements and cloud saves',
      minutes: 45,
      objectives: [
        'Set up a Steamworks app: the Steam Direct fee (US\\$100, recoupable), app ID, depots, builds and branches.',
        'Upload builds with `steamcmd` and an app build VDF, and set them live on a branch.',
        'Integrate GodotSteam behind a `SteamService` autoload: initialise, run callbacks, unlock achievements.',
        'Back up saves with Steam Auto-Cloud and keep the game running without Steam.',
      ],
      cells: [
        {
          kind: 'text',
          md: md`The Steam version of Shardbound is the same export as before, delivered and extended by Steam: the Steam client installs and updates it, shows the overlay, records achievements and syncs saves between a desktop and a Deck. The work splits into three parts: setting up the app in **Steamworks** (Valve's partner site), **uploading** builds with Valve's command-line tool, and adding a small amount of **code** that talks to Steam through the Steamworks SDK.`,
        },
        {
          kind: 'callout',
          tone: 'definition',
          title: 'Steamworks vocabulary',
          md: md`- **Partner account**: your Steamworks account, with your business details, bank information and a tax interview.
- **Steam Direct fee**: US\$100 per game, paid back to you once the game has earned US\$1,000 in adjusted gross revenue. Paying it creates an **app ID**, the number that identifies the game everywhere.
- **Depot**: a set of files, usually one per operating system (a Windows depot, a Linux depot).
- **Build**: one upload of the depots, with a build ID.
- **Branch**: which build a group of players gets. *default* is what everyone gets; *beta* or password-protected branches are for testers.
- **Package**: what is sold (the app plus its depots).

Achievements and cloud saves are features of the **Steamworks SDK**: a game must use it to have them.`,
        },
        {
          kind: 'steps',
          title: 'Create the app and its depots',
          steps: [
            md`Sign up at partner.steamgames.com, complete the business, bank and tax information, pay the Steam Direct fee, and note your app ID. (While waiting, everything below can be tried with Valve's public test app, ID 480.)`,
            md`In the app's admin pages, open **SteamPipe → Depots**. Create a Windows depot and a Linux depot, and set each depot's operating system. Note the depot IDs (usually the app ID +1, +2).`,
            md`Open **Installation → General** and add a launch option per OS: executable \`Shardbound.exe\` for Windows, \`Shardbound.x86_64\` for Linux.`,
            md`Steamworks changes are drafts until published: open **Publish**, review and publish.`,
            md`Download **steamcmd** (part of the Steamworks SDK's tools) and create the folder \`steam/\` in your project for the build script below.`,
          ],
          result: md`The app has two depots and two launch options, published. \`steamcmd\` runs on your machine.`,
          troubleshoot: [
            { problem: md`Steam installs the game but "Play" does nothing.`, fix: md`The launch option's executable name or OS is wrong, or the depot does not contain that file. Check the launch options and the file mapping in the VDF.` },
            { problem: md`Changes in Steamworks have no effect.`, fix: md`They were not published. Most app configuration needs **Publish** before Steam uses it.` },
          ],
        },
        { kind: 'code', file: 'steam/app_build_1234560.vdf', lang: 'text', code: APP_BUILD, note: md`\`ContentRoot\` is relative to the VDF file. Each depot maps a local folder into the depot's root. \`SetLive\` can set a non-default branch automatically; the default branch, which players get, is set live on the Steamworks website.` },
        { kind: 'code', file: 'tools/upload.sh', lang: 'text', code: UPLOAD_SH },
        {
          kind: 'viz',
          viz: { type: 'ship.steampipe' },
          task: md`Export, upload, and look at what players on *default* get. Then set the build live on default. Turn off the Linux depot, upload a new version and set it live: what does a Deck player get now?`,
          caption: md`An upload creates a build and, with \`SetLive "beta"\`, updates the beta branch. Nothing changes for players until a build is set live on *default*. Without a Linux depot, the Deck runs the Windows build through Proton.`,
        },
        {
          kind: 'check',
          q: md`You ran \`steamcmd\` with \`"SetLive" ""\` and it reported success. Players say the update has not arrived. Why?`,
          options: [
            md`The upload created a new build but no branch points to it; set it live on *default* in Steamworks`,
            md`Steam takes a week to distribute updates`,
            md`Players must reinstall the game to get new builds`,
            md`The VDF must list every file individually`,
          ],
          answer: 0,
          explain: md`Uploading and releasing are separate steps, by design: you can upload, test the build on a beta branch, and only then set it live for everyone.`,
        },
        {
          kind: 'text',
          md: md`### GodotSteam

Godot does not include the Steamworks SDK. **GodotSteam** is a community project that wraps it, available as a GDExtension from the Asset Library (or as a prebuilt editor with Steam built in). It exposes the SDK as a singleton named \`Steam\`, with method names following the SDK's (\`steamInitEx\`, \`setAchievement\`, \`storeStats\`, and so on).

Two design decisions keep this manageable:
- **One wrapper.** Gameplay code never calls \`Steam\` directly; it calls a \`SteamService\` autoload. Swapping platforms, or running without Steam, then touches one file.
- **Steam is optional.** If the extension is missing or Steam is not running, the game logs a warning and continues. That keeps playtest builds, a DRM-free release and the editor working.

GodotSteam's API changes between versions, so treat the method names below as illustrative and check them against the documentation of the version you install.

For testing from the editor, the Steam client must be running and the game must know its app ID. The \`_init()\` below sets the environment variables that the SDK reads.`,
        },
        { kind: 'code', file: 'scripts/autoload/steam_service.gd', code: STEAM_SERVICE },
        {
          kind: 'text',
          md: md`### Achievements

Achievements are defined in Steamworks (**Stats & Achievements**) with an **API name** (\`ACH_GOLEM\`), a display name, a description and two icons, then published. The game only sends "unlock \`ACH_GOLEM\`".

Connect them to game events rather than sprinkling calls through combat code. The \`Events\` bus already announces things like a boss being defeated, so a small listener translates events into achievements.

For the slice, a handful is enough:
- defeat the golem
- equip a first shard
- finish the quest
- stagger an enemy with each party member.

Avoid achievements that reward grinding or that can be missed permanently without warning.`,
        },
        { kind: 'code', file: 'scripts/achievements.gd', code: ACHIEVEMENTS, note: md`Add the signals to \`events.gd\` if your bus does not have them yet: \`signal boss_defeated(boss_id: String)\` and \`signal shard_equipped\`.` },
        {
          kind: 'check',
          q: md`In testing, the "Golem" achievement only appears in the Steam overlay after restarting the game, and sometimes not at all. The code calls \`setAchievement("ACH_GOLEM")\`. What is missing?`,
          options: [md`A call to \`storeStats()\` to send the change to Steam`, md`A second call to \`setAchievement\``, md`Restarting Steam`, md`An achievement icon`],
          answer: 0,
          explain: md`\`setAchievement\` changes the local value; \`storeStats\` sends stats and achievements to Steam, which then shows the notification. \`unlock_achievement\` in the service always calls both.`,
        },
        {
          kind: 'text',
          md: md`### Cloud saves with Auto-Cloud

Steam can back up and sync save files with no code at all: **Steam Auto-Cloud**, configured in Steamworks under *Steam Cloud*. You give it a byte and file quota, then a list of save locations: a **root** (a known folder per OS), a subdirectory and a file pattern such as \`*.save\`. Steam syncs those files before the game starts and after it exits, and asks the player what to do when two machines disagree.

The save files must therefore be in a predictable place. \`user://\` in Godot is per-project. By default it lives under a \`Godot/app_userdata\` folder named after the project; with *Use Custom User Dir* on, it is a folder named by you directly in the OS's application data folder. Set that, then point Auto-Cloud's roots at that folder on Windows and Linux. Exact root names and the root-override option for other OSes are listed in the Steamworks Cloud documentation.`,
        },
        { kind: 'code', file: 'project.godot', lang: 'cfg', code: USER_DIR_CFG },
        {
          kind: 'numeric',
          q: md`Shardbound earns US\$950 of adjusted gross revenue by the end of month 2 and US\$1,400 by the end of month 4. How much of the Steam Direct fee has come back by each date? Enter both, in dollars.`,
          answer: { kind: 'vector', value: [0, 100] },
          explain: md`The US\$100 is paid back once adjusted gross revenue reaches US\$1,000. At US\$950 it has not; at US\$1,400 it has, so the full US\$100 is recouped.`,
        },
        {
          kind: 'build',
          ch: {
            id: 'p03-2-build',
            title: 'The slice on Steam',
            goal: md`Get the slice onto a beta branch through \`steamcmd\`, with one achievement and cloud saves working, and with the game still running when Steam is absent.`,
            requirements: [
              md`\`tools/upload.sh\` builds and uploads both depots, setting the build live on a \`beta\` branch.`,
              md`Installing the game from the Steam client on the beta branch works on Windows, and on Linux or a Deck.`,
              md`Defeating the golem unlocks \`ACH_GOLEM\` with the overlay notification (on your own app ID; the test app 480 has its own achievements).`,
              md`A save made on one machine appears on another after Steam syncs.`,
              md`Running the exported game with Steam closed, or with GodotSteam removed, starts normally and logs one warning.`,
            ],
            hints: [
              md`Register \`SteamService\` as an autoload before any script that calls it.`,
              md`If Auto-Cloud does not pick up a file, open the folder in the Steamworks Cloud settings preview and compare the path with what \`OS.get_user_data_dir()\` prints.`,
            ],
            solution: [
              { file: 'scripts/autoload/steam_service.gd', code: STEAM_SERVICE },
              { file: 'scripts/achievements.gd', code: ACHIEVEMENTS },
              { file: 'tools/upload.sh', code: UPLOAD_SH, lang: 'text' },
            ],
            explain: md`Gameplay emits events; \`achievements.gd\` turns them into achievement names; \`SteamService\` talks to Steam if it can. Each layer can be replaced without touching the others, and the guard in \`_ready()\` keeps every non-Steam build working.`,
          },
        },
        {
          kind: 'paper',
          problem: {
            id: 'p03-2-paper',
            title: 'Achievements for the slice',
            type: 'design',
            difficulty: 1,
            minutes: 8,
            statement: md`Design 5 achievements for Shardbound's vertical slice. For each give the API name, the condition, and the game event that triggers it. Explain what makes an achievement good or bad for a game like this.`,
            solution: [
              md`\`ACH_GOLEM\`: defeat the golem (\`boss_defeated("golem")\`). \`ACH_FIRST_SHARD\`: socket a shard (\`shard_equipped\`). \`ACH_STAGGER_ALL\`: stagger an enemy with Kai, Lyra and Bram (\`enemy_staggered(by)\`, tracked in \`GameState\`). \`ACH_QUEST\`: finish the town quest (\`quest_completed\`). \`ACH_NO_HIT_SLIME\`: clear the field without taking damage (\`area_cleared\` with a flag).`,
              md`Good achievements point players at systems they might skip (shards, stagger, switching characters) and mark progress. Bad ones reward grinding (kill 1,000 slimes), or can be missed forever without warning.`,
            ],
            rubric: [md`Each has a clear condition and a triggering event`, md`At least two teach a system`, md`Discusses grind and missable achievements`],
          },
        },
        {
          kind: 'recall',
          prompt: md`Explain depot, build and branch, and how a build reaches players.`,
          answer: md`A depot is a set of files (usually per OS). A build is one upload of the depots, with a build ID. A branch points to a build: default for everyone, beta and others for testers. steamcmd uploads a build (optionally setting a non-default branch live); setting it live on default in Steamworks releases it.`,
        },
        {
          kind: 'explain',
          prompt: md`Why put GodotSteam behind a \`SteamService\` autoload that tolerates Steam being absent?`,
          model: md`Gameplay code then depends on a small interface (unlock an achievement) instead of a third-party API, so GodotSteam updates, a second store or a DRM-free build change one file. Tolerating absence keeps the editor, playtest builds and non-Steam copies running: a missing extension or a closed Steam client logs a warning instead of crashing, and achievement calls become no-ops.`,
        },
      ],
      cards: [
        { id: 'p03-2-c1', kind: 'concept', front: md`The Steam Direct fee: amount and when it comes back?`, back: md`US\$100 per game, paid back once the game has US\$1,000 of adjusted gross revenue.` },
        { id: 'p03-2-c2', kind: 'cloze', text: md`Uploading a build: \`steamcmd +login <account> +{{}} <path to app_build.vdf> +quit\`.`, answers: ['run_app_build'] },
        { id: 'p03-2-c3', kind: 'concept', front: md`Two calls to unlock an achievement with GodotSteam?`, back: md`\`setAchievement(api_name)\` then \`storeStats()\` to send it to Steam (method names from GodotSteam; check your version).` },
        { id: 'p03-2-c4', kind: 'concept', front: md`How does Steam Auto-Cloud find your saves?`, back: md`It is configured in Steamworks with a root folder per OS, a subdirectory and a file pattern. Use a custom user dir so \`user://\` has a predictable path.` },
        { id: 'p03-2-c5', kind: 'concept', front: md`Does uploading a build release it?`, back: md`No. It creates a build; setting it live on the default branch (on the Steamworks site) releases it. \`SetLive\` in the VDF can only set non-default branches.` },
      ],
    },
    // =========================================================================== p03-3
    {
      id: 'p03-3',
      title: 'The store page, launch timing, pricing and the legal basics',
      minutes: 40,
      objectives: [
        'Assemble a store page: capsule images, trailer, screenshots, short description and tags.',
        'Plan the Coming Soon page, a Next Fest demo and the launch backwards from the release date.',
        'Compute revenue from price and copies with regional pricing, refunds, the Valve share tiers and the fee recoup.',
        "List the legal basics: a business entity, the tax interview, licences for fonts, music and add-ons, and Godot's MIT notice.",
      ],
      cells: [
        {
          kind: 'text',
          md: md`Most people who meet Shardbound on Steam will see a small capsule image, then perhaps the store page, then perhaps the trailer, and decide in that order. They can **wishlist** a game that is not out yet; at launch, Steam notifies the people who wishlisted it. So the store page is not a launch-week task: it goes up months earlier as a **Coming Soon** page, collects wishlists, and is the place that festivals, trailers and posts send people to.

This lesson covers what the page contains, when each step of the launch happens, how much money a sale brings in, and the paperwork that makes it legal.`,
        },
        {
          kind: 'callout',
          tone: 'definition',
          title: 'What a store page needs',
          md: md`- **Capsule images**: the game's key art with a readable logo, in several sizes, from a small capsule in lists to large library images. Steamworks lists the exact dimensions for each.
- **Screenshots**: at least five, of real gameplay.
- **A trailer** that shows play in its first seconds.
- **A short description** of one or two sentences under the header.
- **A longer "About this game" section.**
- **Tags**, which place the game in Steam's browsing and recommendations; you suggest them and players can add more.
- **System requirements, supported languages and controller support.**

Valve reviews the page before it can go public.`,
        },
        {
          kind: 'text',
          md: md`A few principles, from what players can see.

**Capsules.** The capsule is often shown small, so the logo must read at that size and the art must say "pixel-art action RPG" at a glance. A busy scene shrinks into noise.

**Screenshots and trailer.** Show the moments that make Shardbound different: an attack string filling ATB, tactical mode slowing time, a stagger, jumping between heights. Avoid menus and empty fields.

**Short description.** Say the genre, the hook and what the player does, in plain words.

**Tags.** Choose tags that are accurate: a tag that brings the wrong audience brings people who will not buy it.`,
        },
        { kind: 'code', file: 'docs/store_page.txt', lang: 'text', code: STORE_DRAFT },
        {
          kind: 'text',
          md: md`### Timing: Coming Soon, Next Fest, launch

Work backwards from the release date.

- **The Coming Soon page** should go live as early as you have a trailer and screenshots that represent the game, because it collects wishlists for as long as it is up. Steamworks also requires a minimum Coming Soon period before release.
- **The Steam Direct fee** must be paid a minimum time before release, and the page needs Valve's review first. Steamworks documents both durations; plan with margin.
- **Steam Next Fest** runs several times a year. It features demos of **unreleased** games for about a week, which makes it a natural target for the slice as a demo. Valve announces the dates and the registration deadlines; a game can take part once.
  - A demo is set up as its own small app linked to the main game, with its own builds.
  - It needs a store page that is already live, so festival visitors can wishlist the game.
- **Before launch**, the release build also goes through review.`,
        },
        {
          kind: 'viz',
          viz: { type: 'ship.launch' },
          task: md`Put the launch 12 months from now and the Next Fest 3 months before it. Then shorten the Coming Soon lead until a warning appears, and move Next Fest after the launch. What does each warning protect against?`,
          caption: md`The two "Steamworks rules" sliders are there because the rules can change: look up the current minimum Coming Soon period and the waiting time after paying the fee, and set them. The planner's one-week page review and two-week build review are planning margins, not rules.`,
        },
        {
          kind: 'check',
          q: md`You plan to launch in March and want the slice demo in a Next Fest. Which order works?`,
          options: [
            md`Coming Soon page live → demo in the Next Fest before March → launch in March`,
            md`Launch in March → demo in the next Next Fest`,
            md`Next Fest demo → Coming Soon page a week before launch → launch`,
            md`Launch, then make the store page`,
          ],
          answer: 0,
          explain: md`Next Fest features unreleased games, so it must come before the launch, and festival visitors need a live page to wishlist; the page also needs time to collect wishlists before the launch notification goes out.`,
        },
        {
          kind: 'text',
          md: md`### Price and revenue

**Price** says something about scope: compare games of similar length and type, and price for the game you ship, not the one you planned.

**Regional pricing.** Steamworks proposes prices for other currencies and regions from your US price. You can accept or adjust them, and many are lower than the US price.

**Discounts and refunds.** Sales and a launch discount lower the average price you get. Steam lets players refund recent purchases with little playtime (the limits are in Steam's refund policy), and refunded copies earn nothing.

**What is left.** From what remains (Valve calls it **adjusted gross revenue**), Valve takes its share. The standard share is:
- 30% of a game's revenue up to US\$10M
- 25% from US\$10M to US\$50M
- 20% above US\$50M.

The US\$100 Steam Direct fee comes back once adjusted gross passes US\$1,000. Income tax in your country comes after all of this.`,
        },
        {
          kind: 'derive',
          title: 'From price to net revenue',
          goal: md`Write the developer's net revenue as a function of price $P$, copies $N$ and the reductions, then apply the share tiers.`,
          steps: [
            { md: md`Each reduction keeps a fraction of what is left: regional pricing $r$, discounts $d$, sales tax or VAT $v$, refunds $f$. Adjusted gross: $$A = P\,N\,(1-r)(1-d)(1-v)(1-f).$$` },
            {
              md: md`The share is **tiered**: each rate applies only to the part of $A$ inside its band, like income tax brackets. For $A \le 10\text{M}$, $\text{share} = 0.3A$.`,
              choose: {
                prompt: md`What is the share on $A = 12\text{M}$?`,
                options: [md`$0.3 \times 10\text{M} + 0.25 \times 2\text{M} = 3.5\text{M}$`, md`$0.25 \times 12\text{M} = 3\text{M}$`, md`$0.3 \times 12\text{M} = 3.6\text{M}$`],
                answer: 0,
                explain: md`The first 10M is shared at 30%, only the 2M above it at 25%. Applying the lower rate to everything would mean earning more could reduce what Valve receives on the first 10M, which is not how tiers work.`,
              },
            },
            { md: md`Net to the developer, before income tax: $$\text{net} = A - \text{share}(A) - 100 + 100\cdot[A \ge 1000].$$ For any indie-sized result this is $0.7A$, plus or minus the fee.` },
          ],
          takeaway: md`Multiplying list price by copies overstates revenue: regional prices, discounts, tax and refunds each take a slice before the 30%.`,
        },
        {
          kind: 'viz',
          viz: { type: 'ship.revenue', price: 14.99, units: 5000 },
          task: md`Set the assumptions you believe for Shardbound. How many copies at US\$14.99 does it take to pay for one year of your time at a wage you choose? Then compare US\$9.99 and US\$19.99.`,
          caption: md`The sliders are assumptions, not data about Steam. The Valve share and the fee are the standard terms. The "per copy" readout is the number to multiply by your copy estimate.`,
        },
        {
          kind: 'numeric',
          q: md`Price US\$15, 4,000 copies, regional pricing averaging −20%, no discounts, no sales tax, 5% refunds. What is the net to the developer, in US dollars, before income tax?`,
          answer: { kind: 'number', value: 15 * 4000 * 0.8 * 0.95 * 0.7 },
          hints: [md`Adjusted gross first, then the 30% share; the fee is recouped.`],
          explain: md`$A = 15 \times 4000 \times 0.8 \times 0.95 = 45{,}600$. The share is $0.3 \times 45{,}600 = 13{,}680$. The fee is paid and recouped. Net: $31{,}920$.`,
        },
        {
          kind: 'numeric',
          q: md`At US\$9.99 with regional pricing averaging −20% and 5% refunds (no discounts or tax), how many copies must sell before the Steam Direct fee is paid back?`,
          answer: { kind: 'number', value: Math.ceil(1000 / (9.99 * 0.8 * 0.95)) },
          explain: md`Each copy adds $9.99 \times 0.8 \times 0.95 \approx 7.59$ of adjusted gross. $1000 / 7.59 \approx 131.7$, so 132 copies.`,
        },
        {
          kind: 'text',
          md: md`### Legal basics

None of this is legal or tax advice; it is the list of things to sort out, ideally with an accountant in your country.

- **Who sells the game.** You can sell as an individual or through a company. A company separates the business's liabilities from your own; whether it is worth it depends on your country.
- **Taxes.** Steamworks' **tax interview** collects your identity and tax residency and produces the tax forms Valve needs. It decides whether US tax is withheld from payments (non-US developers may reduce withholding through a tax treaty). Income tax on what you earn is then due where you live.
- **Licences of everything you ship:**
  - Fonts: some licences forbid embedding; the SIL Open Font License allows it.
  - Music and sound: the licence must cover commercial games, and trailers and streaming.
  - Add-ons: GodotSteam and GUT are MIT.
  - The course's assets: CC0.

  Keep a file listing every third-party asset, where it came from, and its licence.
- **Godot's licence.** Godot is MIT-licensed: you may sell games made with it, and you must include its copyright and licence notice, for example on a licences page in the credits. Godot also bundles third-party libraries with their own notices, and it can list them at runtime.`,
        },
        { kind: 'code', file: 'ui/licenses_screen.gd', code: LICENSES, note: md`\`Engine.get_license_text()\` returns Godot's MIT licence text; \`Engine.get_copyright_info()\` lists every component of the engine with its copyright holders and licence.` },
        {
          kind: 'check',
          q: md`Which of these must appear in Shardbound's credits or licences screen?`,
          options: [md`Godot's MIT copyright and licence notice (and the notices of components it bundles)`, md`Nothing: the MIT licence has no conditions`, md`A paid licence number from the Godot Foundation`, md`The source code of the game`],
          answer: 0,
          explain: md`The MIT licence lets you use, change and sell the software as long as the copyright and licence notice are included. It does not require payment or releasing your own code.`,
        },
        {
          kind: 'build',
          ch: {
            id: 'p03-3-build',
            title: 'Store page and launch plan',
            goal: md`Prepare everything the Coming Soon page and the launch need, and put the legal notices in the game.`,
            requirements: [
              md`\`docs/store_page.txt\` has a short description, 6–10 accurate tags, and five screenshots captured from the slice at an integer scale.`,
              md`A capsule draft whose logo is readable when shrunk to a small capsule size (check by viewing it at that size).`,
              md`\`docs/launch.md\` lists dated steps (fee, page review, page live, Next Fest registration and demo, build review, launch), using the current Steamworks minimums.`,
              md`A revenue table with a low, middle and high scenario, all assumptions written next to it.`,
              md`The game has a licences screen with Godot's notice, and \`docs/third_party.md\` lists every external asset and add-on with its licence.`,
            ],
            hints: [
              md`Take screenshots with the debug overlay off and the window at 1920×1080 (6×), so they are crisp.`,
              md`For the scenarios, vary copies sold by 10× between low and high rather than tweaking the price.`,
            ],
            solution: [
              { file: 'docs/store_page.txt', code: STORE_DRAFT, lang: 'text' },
              { file: 'ui/licenses_screen.gd', code: LICENSES },
            ],
            explain: md`The page draft and the plan are documents you keep revising as the slice improves; the licences screen is code, because the engine's own list of notices changes with each Godot version and is generated rather than copied.`,
          },
        },
        {
          kind: 'paper',
          problem: {
            id: 'p03-3-paper',
            title: 'Write the pitch',
            type: 'design',
            difficulty: 2,
            minutes: 10,
            statement: md`Write Shardbound's short description (at most two sentences) and choose five tags. Explain what a player who reads only the short description should understand, and why each tag is there.`,
            solution: [
              md`Example: "Fight in real time to charge your party's ATB, then slow time to spend it on abilities. A pixel-art action RPG with three heroes, socketable shards and a world you explore by jumping between heights."`,
              md`The reader should know the genre (action RPG), the hook (real-time attacks feeding a tactical layer), the look (pixel art) and what they do (fight, build, explore).`,
              md`Tags: *Action RPG* (genre), *Pixel Graphics* (look), *Party-Based RPG* (three heroes), *Real-Time with Pause* (tactical mode), *Exploration* (height platforming). Each matches something visible in the screenshots, so the people it attracts find what they expect.`,
            ],
            rubric: [md`Genre, hook and verbs in two sentences`, md`Tags accurate and justified`, md`No vague claims ("epic", "unique")`],
          },
        },
        {
          kind: 'recall',
          prompt: md`State the standard Valve revenue share and the Steam Direct fee terms.`,
          answer: md`30% of a game's adjusted gross revenue up to US\$10M, 25% from US\$10M to US\$50M, 20% above US\$50M. The fee is US\$100 per game, paid back after US\$1,000 of adjusted gross revenue.`,
        },
        {
          kind: 'explain',
          prompt: md`Why put the store page up months before launch?`,
          model: md`A Coming Soon page lets players wishlist the game, and Steam notifies wishlisters when it launches, so every week the page is up adds to the audience at launch. It is also the destination for everything else: festival visitors, trailer viewers and posts all need somewhere to click. Valve's review and minimum Coming Soon period mean it cannot be done in the last week anyway.`,
        },
      ],
      cards: [
        { id: 'p03-3-c1', kind: 'compute', front: md`Valve share on US\$20M of adjusted gross revenue?`, answer: { kind: 'number', value: 5.5e6 }, back: md`$0.3 \times 10\text{M} + 0.25 \times 10\text{M} = 5.5\text{M}$.` },
        { id: 'p03-3-c2', kind: 'concept', front: md`What happens to wishlisters when a game launches?`, back: md`Steam notifies them. That is why the Coming Soon page goes up months before launch.` },
        { id: 'p03-3-c3', kind: 'concept', front: md`Steam Next Fest: which games, and what do you need?`, back: md`Unreleased games, with a demo (its own linked app) and a live store page; Valve announces the dates and registration deadlines.` },
        { id: 'p03-3-c4', kind: 'concept', front: md`What does Godot's MIT licence require of a commercial game?`, back: md`Include Godot's copyright and licence notice (and those of bundled components): \`Engine.get_license_text()\`, \`Engine.get_copyright_info()\`.` },
        { id: 'p03-3-c5', kind: 'cloze', text: md`Valve's share applies to adjusted {{}} revenue, after refunds.`, answers: ['gross'] },
      ],
    },
  ],
  problems: [
    {
      id: 'p03-p1',
      title: 'A 1920×1200 monitor',
      type: 'compute',
      difficulty: 1,
      minutes: 3,
      statement: md`With integer scaling of 320×180, how tall is each black bar (above and below) on a 1920×1200 monitor?`,
      solution: [md`$\lfloor 1920/320 \rfloor = 6$, $\lfloor 1200/180 \rfloor = 6$; scale 6 gives 1920×1080.`, md`$(1200 - 1080)/2 = 60$ px.`],
      answer: { kind: 'number', value: 60 },
      areas: ['ship'],
    },
    {
      id: 'p03-p2',
      title: 'Share at fifteen million',
      type: 'compute',
      difficulty: 2,
      minutes: 4,
      statement: md`A game has US\$15M of lifetime adjusted gross revenue on Steam. With the standard tiers, how much is Valve's share in US dollars?`,
      solution: [md`First US\$10M at 30%: US\$3M. Next US\$5M at 25%: US\$1.25M.`, md`Total US\$4.25M (28.3% overall).`],
      answer: { kind: 'number', value: 4.25e6 },
      areas: ['ship'],
    },
    {
      id: 'p03-p3',
      title: 'Copies to recoup the fee',
      type: 'compute',
      difficulty: 1,
      minutes: 4,
      statement: md`A game sells for US\$4.99. Assume regional pricing averages −25% and refunds are 8%, with no discounts or tax. How many copies until the Steam Direct fee is paid back?`,
      solution: [md`Adjusted gross per copy: $4.99 \times 0.75 \times 0.92 \approx 3.443$.`, md`$1000 / 3.443 \approx 290.4$, so 291 copies.`],
      answer: { kind: 'number', value: Math.ceil(1000 / (4.99 * 0.75 * 0.92)) },
      areas: ['ship'],
    },
    {
      id: 'p03-p4',
      title: 'Net from a scenario',
      type: 'compute',
      difficulty: 2,
      minutes: 6,
      statement: md`Price US\$19.99, 2,500 copies, regional pricing −20%, average discount −10%, sales tax 10% of the price paid, refunds 6%. What does the developer net before income tax?`,
      solution: [
        md`$A = 19.99 \times 2500 \times 0.8 \times 0.9 \times 0.9 \times 0.94 \approx 30{,}442.8$.`,
        md`Share $0.3A \approx 9{,}132.8$; the fee is paid and recouped. Net $\approx 21{,}309.9$.`,
      ],
      answer: { kind: 'number', value: 19.99 * 2500 * 0.8 * 0.9 * 0.9 * 0.94 * 0.7, tol: 0.002 },
      areas: ['ship'],
    },
    {
      id: 'p03-p5',
      title: 'Crash without Steam',
      type: 'debug',
      difficulty: 2,
      minutes: 6,
      statement: md`A playtester's DRM-free build closes at once with a script error. The Steam build works. The autoload contains:

\`\`\`gdscript
func _ready() -> void:
	Steam.steamInitEx()
	Steam.setAchievement("ACH_STARTED")
	Steam.storeStats()
\`\`\`

Explain the failure and fix it.`,
      solution: [
        md`The playtest build was exported without GodotSteam (or the Steam library is not present), so the identifier \`Steam\` does not exist and the script fails. Even with the extension present, initialisation fails when Steam is not running, and the achievement calls should not happen then.`,
        md`Guard everything: check \`Engine.has_singleton("Steam")\`, fetch it with \`Engine.get_singleton("Steam")\`, check \`steamInitEx()\`'s result status, keep an \`is_ready\` flag, and make every wrapper method a no-op when it is false, as in \`SteamService\`.`,
      ],
      rubric: [md`Explains why \`Steam\` is missing`, md`Checks for the singleton and the init result`, md`Keeps the game running without Steam`],
      areas: ['ship', 'godot'],
    },
    {
      id: 'p03-p6',
      title: 'Deck readiness review',
      type: 'design',
      difficulty: 2,
      minutes: 10,
      statement: md`Write a Steam Deck checklist for Shardbound's slice, with a concrete test for each item.`,
      solution: [
        md`Controller only: play from launch to the golem without touching a keyboard or the touchscreen, including options and save naming.`,
        md`Glyphs: every prompt shows controller buttons when a controller is used.`,
        md`Text: the smallest HUD text read comfortably at arm's length on 1280×800, at integer 4× scale.`,
        md`Suspend: put the Deck to sleep mid-fight; on wake the game is paused.`,
        md`Builds: both the Linux build and the Windows build under Proton start, save and load; the better one is set as the Linux depot's content.`,
        md`Performance: no frame over 16.7 ms in the busiest fight, V-Sync on.`,
      ],
      rubric: [md`Covers input, text, suspend, platform build and performance`, md`Each item has a test you can perform`],
      areas: ['ship'],
    },
    {
      id: 'p03-p7',
      title: 'Depot, build, branch',
      type: 'concept',
      difficulty: 1,
      minutes: 4,
      statement: md`You want testers to try version 0.4 while players keep 0.3. Describe what you upload and what you change in Steamworks, using the words depot, build and branch.`,
      solution: [md`Export 0.4 for each OS, and upload with \`steamcmd\` so the Windows and Linux depots get new content in a new build. Set that build live on a beta branch (or a password-protected one), either with \`SetLive\` in the VDF or on the Builds page.`, md`The default branch keeps pointing at the 0.3 build, so players are unaffected. Testers opt into the beta branch in the game's Properties in the Steam client.`],
      rubric: [md`Uses depot/build/branch correctly`, md`Keeps default on the old build`],
      areas: ['ship'],
    },
    {
      id: 'p03-p8',
      title: 'Licence audit',
      type: 'concept',
      difficulty: 1,
      minutes: 5,
      statement: md`List what you must check about the licences of Shardbound's third-party parts before release: engine, add-ons, fonts, music and art.`,
      solution: [
        md`Engine: Godot is MIT; include its notice and those of bundled components. Add-ons: GodotSteam and others (check each; MIT needs a notice; GUT is development-only and not shipped).`,
        md`Fonts: the licence must allow embedding in a game (the OFL does). Music and sound: commercial use, including trailers and streams. Art: CC0 needs nothing, but record the source anyway. Keep a third-party list with source and licence for each.`,
      ],
      rubric: [md`Covers engine, add-ons, fonts, audio, art`, md`Mentions notices and commercial-use terms`],
      areas: ['ship'],
    },
  ],
};
