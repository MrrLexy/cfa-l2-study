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
