#!/usr/bin/env python3
"""Port the guided walkthrough (Learn and Exam modes) from the published site back into Pat's source, so the next
build_standalone.py run keeps it. Run it from anywhere:  python3 port_walkthrough.py   (add --check to only report)

What it does, in order (it stops before changing anything if a step can't be done cleanly):
  1. brings ~/Pat/_publish/cfa-l2-study up to date with GitHub (where the walkthrough was added)
  2. checks that every edit fits the source files exactly, or is already there
  3. backs up each file it will change to ~/Pat/_archive/port-walkthrough-<time>/
  4. copies static/walk.js and static/learn.js into ~/Pat/app/static/ and applies the edits to
     study_map.html, cases.html, static/rapid.html, static/path.js, static/ties.js and build_standalone.py
  5. runs build_standalone.py (a normal, unpublished build into ~/Pat/outputs/) and checks the walkthrough is in it
It never publishes: publish as you usually do once the check passes."""
import base64, datetime, filecmp, json, os, re, shutil, subprocess, sys, zlib

PAT = os.path.expanduser("~/Pat")
APP, PUB, OUT = os.path.join(PAT, "app"), os.path.join(PAT, "_publish", "cfa-l2-study"), os.path.join(PAT, "outputs", "CFA-L2-Study-App")
CHECK = "--check" in sys.argv
EDITS = json.loads(zlib.decompress(base64.b64decode("".join("""
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
""".split()))))

def say(*a): print(*a, flush=True)
def stop(msg): say("\nSTOPPED: " + msg + "\nNothing in ~/Pat/app was changed."); sys.exit(1)
def read(p): return open(p, encoding="utf-8").read()

# the two changes to the build script: copy walk.js and learn.js, and give Rapid fire the data Learn mode reads
def build_edits(src):
    out = []
    a = 'for n in ("study-path", "casedata")) + \'<script src="static/standalone.js"></script>\\n\''
    b = 'for n in ("study-path", "casedata", "los-cards", "guide-narratives", "glossary")) + \'<script src="static/standalone.js"></script>\\n\''
    out.append((a, b))
    m = re.search(r'^([ \t]*)write\(os\.path\.join\(st, "ties\.js"\), pc\.clean_text\(read\(os\.path\.join\(APP, "static", "ties\.js"\)\), "js"\)\)\n', src, re.M)
    if m:
        ind, line = m.group(1), m.group(0)
        add = "".join(f'{ind}write(os.path.join(st, "{n}"), pc.clean_text(read(os.path.join(APP, "static", "{n}")), "js"))\n' for n in ("walk.js", "learn.js"))
        out.append((line, line + add))
    else:
        out.append(("<the line that writes static/ties.js>", None))
    return out

say("1. Updating the publish clone from GitHub")
r = subprocess.run(["git", "-C", PUB, "pull", "--ff-only"], capture_output=True, text=True)
say("   " + (r.stdout + r.stderr).strip().replace("\n", "\n   "))
if r.returncode: stop("git pull in ~/Pat/_publish/cfa-l2-study failed (see above).")
for n in ("walk.js", "learn.js"):
    if not os.path.exists(os.path.join(PUB, "static", n)): stop(f"static/{n} is not in the publish clone after the pull.")

say("\n2. Checking every edit against the source")
plan, problems = {}, []
for e in EDITS:
    p = os.path.join(APP, e["file"]); t = plan.get(p)
    if t is None: t = plan[p] = read(p)
    if e["new"] in t: continue                                 # already there
    n = t.count(e["old"])
    if n != 1: problems.append(f'{e["file"]}: expected text found {n} times:\n      ' + e["old"].strip()[:160].replace("\n", "\n      ")); continue
    plan[p] = t.replace(e["old"], e["new"])
bp = os.path.join(APP, "build_standalone.py"); t = read(bp)
for a, b in build_edits(t):
    if b is None: problems.append("build_standalone.py: " + a + " was not found"); continue
    if b in t: continue
    if t.count(a) != 1: problems.append(f"build_standalone.py: expected text found {t.count(a)} times: {a[:120]}"); continue
    t = t.replace(a, b)
plan[bp] = t
changed = [p for p, t in plan.items() if t != read(p)]
copies = [n for n in ("walk.js", "learn.js") if not os.path.exists(os.path.join(APP, "static", n)) or not filecmp.cmp(os.path.join(PUB, "static", n), os.path.join(APP, "static", n), shallow=False)]
say(f"   {len(EDITS) + 2} edits checked; files to change: {len(changed)}; files to copy: {len(copies)}")
if problems:
    say("\n   These edits don't fit the source:\n   - " + "\n   - ".join(problems))
    stop(f"{len(problems)} edit(s) don't fit. Paste this output to Claude.")
if CHECK: say("\n--check: everything fits. Run again without --check to apply."); sys.exit(0)

if changed or copies:
    bak = os.path.join(PAT, "_archive", "port-walkthrough-" + datetime.datetime.now().strftime("%Y%m%d-%H%M%S"))
    say(f"\n3. Backing up to {bak}")
    for p in changed + [os.path.join(APP, "static", n) for n in copies if os.path.exists(os.path.join(APP, "static", n))]:
        d = os.path.join(bak, os.path.relpath(p, APP)); os.makedirs(os.path.dirname(d), exist_ok=True); shutil.copy2(p, d)
    say("\n4. Applying")
    for p in changed:
        open(p, "w", encoding="utf-8").write(plan[p]); say("   edited " + os.path.relpath(p, PAT))
    for n in copies:
        shutil.copyfile(os.path.join(PUB, "static", n), os.path.join(APP, "static", n)); say("   copied app/static/" + n)
else:
    say("\n3-4. The source already has the walkthrough; nothing to change.")

say("\n5. Building (build_standalone.py, not published)")
r = subprocess.run([sys.executable, "build_standalone.py"], cwd=APP, capture_output=True, text=True)
say("   " + "\n   ".join((r.stdout + r.stderr).strip().splitlines()[-12:]))
if r.returncode: say("\nThe build failed (see above). The originals are in the backup folder. Paste this output to Claude."); sys.exit(1)

say("\n6. Checking the build")
ok = True
def check(label, cond):
    global ok
    ok = ok and cond; say(f"   {'OK  ' if cond else 'FAIL'} {label}")
for n in ("walk.js", "learn.js"):
    f = os.path.join(OUT, "static", n)
    check(f"static/{n} is in the build", os.path.exists(f))
for page in ("app.html", "cases.html", "rapid.html"):
    h = read(os.path.join(OUT, page))
    check(f"{page} loads walk.js and learn.js", 'static/walk.js' in h and 'static/learn.js' in h)
check("rapid.html loads the outcome cards, guides and glossary", all(f"static/data/{n}.js" in read(os.path.join(OUT, "rapid.html")) for n in ("los-cards", "guide-narratives", "glossary")))
check("the offline copy (sw.js) includes walk.js and learn.js", "static/walk.js" in read(os.path.join(OUT, "sw.js")) and "static/learn.js" in read(os.path.join(OUT, "sw.js")))
for n in ("path.js", "ties.js", "walk.js", "learn.js"):
    a, b = os.path.join(OUT, "static", n), os.path.join(PUB, "static", n)
    same = os.path.exists(a) and filecmp.cmp(a, b, shallow=False)
    say(f"   {'same' if same else 'DIFFERENT'} static/{n} as the published copy" + ("" if same else " (fine if your source had newer changes of its own)"))
say("\n" + ("All done. The walkthrough is in the source now, so your next build and publish keep it." if ok else "Something is missing (FAIL above). Paste this output to Claude."))
