#!/usr/bin/env python3
"""고객이 요청한 네 가지가 실제로 들어갔는지 화면과 소리에서 직접 재서 확인한다.

  「코믹하게 촬영하고 / 남색보다 좀더 밝은 색 / 배경음악 좀 밝게 / 자막은 없애는 게 좋을 것 같습니다」

말로 "넣었습니다" 하지 않는다. 넷 다 파일에서 재서 답을 낸다.

  1) 배경 밝기 — 세 단계를 각각 그려 놓고 완성본이 어느 쪽에 가까운지 견준다
  2) 자막 없음 — 자막을 켜고 끈 두 장을 그려 놓고 완성본이 어느 쪽인지 견준다
  3) 배경음악 — 어두운 판과 밝은 판을 둘 다 만들어 낮은 음역대에서 견준다
  4) 코믹 — 엄지척과 고개 떨어지는 컷이 제자리에 들어갔는지 원본과 대조한다

  python3 check_request.py out/파일.mp4
"""
import json, pathlib, subprocess, sys, tempfile, wave
import numpy as np
import imageio_ffmpeg
from PIL import Image

D = pathlib.Path(__file__).parent
FF = imageio_ffmpeg.get_ffmpeg_exe()
UP = pathlib.Path("/root/.claude/uploads/9bc329f1-9649-5e79-9d0d-26f445e4d774")
def _pick_times(n=3):
    """자막이 실제로 뜨는 자리 중 촬영분이 덮지 않는 곳을 고른다.
    자막이 원래 없는 자리를 골라 놓고 '자막이 없다' 를 확인해봐야 아무 말도 안 된다."""
    D0 = pathlib.Path(__file__).parent
    subs = json.loads((D0 / "timeline_school.json").read_text())["subs"]
    cuts = json.loads((D0 / "cuts.json").read_text())["cuts"]
    ok = []
    for c in subs:
        t = round((c["a"] + c["b"]) / 2, 1)
        if t < 35 or t > 175:
            continue
        if any(x["at"] - 0.5 <= t <= x["to"] + 0.5 for x in cuts):
            continue
        ok.append(t)
    return [ok[len(ok) * (k + 1) // (n + 1)] for k in range(n)]


REF_T = _pick_times()
verdicts = []


def frame(path, t, ss=None):
    """영상에서 한 장 뽑아 배열로 돌려준다."""
    with tempfile.NamedTemporaryFile(suffix=".png", delete=False) as f:
        p = f.name
    subprocess.run([FF, "-y", "-v", "error", "-ss", str(t), "-i", str(path),
                    "-frames:v", "1", p], check=True)
    a = np.asarray(Image.open(p).convert("RGB")).astype(float)
    pathlib.Path(p).unlink()
    return a


def band(path, lo, hi, sr=8000):
    """낮은 음역대만 남긴 파형. 배경음악 베이스를 보려는 것."""
    r = subprocess.run([FF, "-v", "error", "-i", str(path), "-ac", "1", "-ar", str(sr),
                        "-af", f"highpass=f={lo},lowpass=f={hi}", "-f", "f32le", "-"],
                       capture_output=True)
    return np.frombuffer(r.stdout, dtype=np.float32).astype(np.float64)


def say(no, name, ok, detail):
    verdicts.append(ok)
    print(f"\n[{no}] {name}   {'들어갔습니다' if ok else '★ 안 들어갔습니다'}")
    for d in detail:
        print("     " + d)


def render_refs():
    """배경 세 단계 × 자막 켬/끔 기준 화면을 그려 둔다."""
    outs = {}
    base = [sys.executable, str(D / "render.py"), "--stills",
            ",".join(str(t) for t in REF_T), "--timeline", "timeline_school.json",
            "--school", "--name", "신정중학교", "--who", "차민"]
    for tag, extra in (("bg1", ["--nosub"]), ("bg2", ["--bg", "2", "--nosub"]),
                       ("bg3", ["--bg", "3", "--nosub"]), ("sub", ["--bg", "2"])):
        subprocess.run(base + extra, capture_output=True, check=True)
        outs[tag] = {t: np.asarray(Image.open(D / "stills" / f"t{t:06.1f}.png")
                                   .convert("RGB")).astype(float) for t in REF_T}
    return outs


def check_bg(path, refs):
    det, votes = [], []
    for t in REF_T:
        got = frame(path, t)
        d = {k: np.abs(got - refs[k][t]).mean() for k in ("bg1", "bg2", "bg3")}
        pick = min(d, key=d.get)
        votes.append(pick)
        det.append(f"{t:5.0f}초  1단계와 차이 {d['bg1']:5.2f} · "
                   f"2단계 {d['bg2']:5.2f} · 3단계 {d['bg3']:5.2f}  →  {pick[-1]}단계")
    ok = all(v == "bg2" for v in votes)
    det.append("남색(1단계)보다 한 단계 밝은 2단계입니다." if ok
               else f"고른 단계가 {set(v[-1] for v in votes)} 로 나옵니다.")
    say(1, "남색보다 밝은 색", ok, det)


def check_sub(path, refs):
    det, ok = [], True
    for t in REF_T:
        got = frame(path, t)
        dn = np.abs(got - refs["bg2"][t]).mean()      # 자막 끈 기준
        dy = np.abs(got - refs["sub"][t]).mean()      # 자막 켠 기준
        ok &= dn < dy
        det.append(f"{t:5.0f}초  자막 끈 화면과 차이 {dn:5.2f} · 켠 화면과 {dy:5.2f}"
                   f"  →  {'끔' if dn < dy else '켬'}")
    det.append("세 자리 모두 자막이 없습니다." if ok else "자막이 보이는 자리가 있습니다.")
    say(2, "자막 없애기", ok, det)


def check_bgm(path):
    subprocess.run([sys.executable, str(D / "bgm.py"), "--out", "_cmp_dark.wav"],
                   capture_output=True, check=True)
    subprocess.run([sys.executable, str(D / "bgm.py"), "--bright", "--out", "_cmp_bright.wav"],
                   capture_output=True, check=True)
    def env(v, h=400):
        m = len(v) // h
        return np.abs(v[:m * h]).reshape(m, h).mean(axis=1)

    # 두 판은 쓰는 음이 같고 순서만 다르다. 그래서 음 높이로는 못 가른다.
    # 표본을 그대로 견주면 필터가 위상을 틀어 0 이 나온다. 소리 세기로 견준다.
    a = band(path, 60, 200)
    res = {}
    for tag, f in (("어두운 판", "_cmp_dark.wav"), ("밝은 판", "_cmp_bright.wav")):
        b = band(D / "audio" / f, 60, 200)
        n = min(len(a), len(b))
        res[tag] = float(np.corrcoef(env(a[:n]), env(b[:n]))[0, 1])
        (D / "audio" / f).unlink(missing_ok=True)
    pick = max(res, key=res.get)

    # 어느 파일을 썼는지만 봐서는 모자란다. 앞서 만든 밝은 판은 어두운 판과
    # 같은 네 화음을 순서만 돌린 것이라, 파일은 맞는데 귀로는 구분이 안 됐다.
    # 그래서 실제로 밝게 들리는지를 따로 잰다. 스펙트럼 무게중심이 높을수록
    # 높은 소리가 많아 밝게 들린다.
    def centroid(x, sr=8000):
        o = []
        for i in range(0, len(x) - sr, sr):
            w = x[i:i + sr] * np.hanning(sr)
            sp = np.abs(np.fft.rfft(w))
            fr = np.fft.rfftfreq(sr, 1 / sr)
            if sp.sum() > 1e-6:
                o.append((fr * sp).sum() / sp.sum())
        return float(np.median(o)) if o else 0.0

    def wide(p):
        r = subprocess.run([FF, "-v", "error", "-i", str(p), "-ac", "1", "-ar", "8000",
                            "-f", "f32le", "-"], capture_output=True)
        return np.frombuffer(r.stdout, dtype=np.float32).astype(np.float64)

    # 나레이션이 없는 자리에서만 잰다. 말소리가 섞이면 밝기가 흐려진다.
    tl = json.loads((D / "timeline.json").read_text())
    ends = []
    for x in tl["audio"]:
        w = wave.open(x["file"])
        ends.append((x["at"], x["at"] + w.getnframes() / w.getframerate()))
    holes = [(0.3, ends[0][0] - 0.3)]
    holes += [(ends[i][1] + 0.3, ends[i + 1][0] - 0.3) for i in range(len(ends) - 1)]
    a8 = wide(path)
    seg = np.concatenate([a8[int(t0 * 8000):int(t1 * 8000)]
                          for t0, t1 in holes if t1 - t0 > 0.8])
    subprocess.run([sys.executable, str(D / "bgm.py"), "--out", "_cmp_dark.wav"],
                   capture_output=True, check=True)
    dark_c = centroid(wide(D / "audio" / "_cmp_dark.wav"))
    (D / "audio" / "_cmp_dark.wav").unlink(missing_ok=True)
    got_c = centroid(seg)
    gain = got_c / dark_c - 1
    ok = pick == "밝은 판" and gain > 0.25
    say(3, "배경음악 밝게", ok, [
        f"어두운 판과 닮은 정도 {res['어두운 판']:+.3f} · 밝은 판과 {res['밝은 판']:+.3f}"
        f"  →  {pick}",
        f"밝기(스펙트럼 무게중심)  어두운 판 {dark_c:.0f}Hz  →  완성본 {got_c:.0f}Hz"
        f"   {gain*100:+.0f}%",
        "화음도 단조를 빼고 도–파–솔–도로 바꿔 도로 돌아와 끝납니다."
        if ok else "밝기가 충분히 오르지 않았습니다. 귀로 구분이 안 됩니다."])


def check_comic(path):
    cuts = json.loads((D / "cuts.json").read_text())["cuts"]
    det, ok = [], True
    for c in cuts:
        src = sorted(UP.glob(f"*{c['clip']}.*"))[0]
        mid = (c["at"] + c["to"]) / 2
        off = c["from"] + (mid - c["at"])
        def norm(x):
            v = x.mean(axis=2)
            return (v - v.mean()) / (v.std() + 1e-9)

        g = norm(frame(path, mid))
        # 색 보정과 압축 때문에 절대 점수는 낮게 나온다. 그래서 "몇 점 넘느냐" 가
        # 아니라 "다른 클립들보다 이 클립이 더 닮았느냐" 로 가른다.
        scores = {}
        for other in {x["clip"] for x in cuts}:
            osrc = sorted(UP.glob(f"*{other}.*"))[0]
            oo = c["from"] + (mid - c["at"]) if other == c["clip"] else 1.0
            scores[other] = float((g * norm(frame(osrc, oo))).mean())
        win = max(scores, key=scores.get)
        second = sorted(scores.values())[-2]
        good = win == c["clip"] and scores[win] - second > 0.15
        ok &= good
        det.append(f"{c['at']:6.2f}초  {c['clip']}  {scores[c['clip']]:.3f}"
                   f" (다음 후보 {second:.3f})  {'○' if good else '×'}   {c['line'][:20]}")
    if ok:
        c4 = next(x for x in cuts if x["clip"] == "IMG_1474")
        c5 = next(x for x in cuts if x["clip"] == "IMG_1480")
        det.append(f"엄지척({c4['at']:.2f}초)과 고개 떨어짐({c5['at']:.2f}초)이 붙어 있어 "
                   f"웃음이 만들어집니다.")
    else:
        det.append("제자리에 없는 컷이 있습니다.")
    say(4, "코믹하게 — 촬영분이 제자리에 들어갔는가", ok, det)


if __name__ == "__main__":
    P = pathlib.Path(sys.argv[1] if len(sys.argv) > 1
                     else D / "out" / "신정중학교_차민_교내대회_최종.mp4")
    print(f"요청 사항 확인: {P.name}")
    refs = render_refs()
    check_bg(P, refs)
    check_sub(P, refs)
    check_bgm(P)
    check_comic(P)
    print("\n" + "=" * 58)
    print(f"네 가지 중 {sum(verdicts)}가지 확인"
          + ("  —  요청하신 것이 전부 들어갔습니다." if all(verdicts) else "  —  빠진 것이 있습니다."))
