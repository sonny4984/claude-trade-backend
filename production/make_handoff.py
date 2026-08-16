#!/usr/bin/env python3
"""나레이션 인수인계 문서를 timeline.json 에서 직접 만들어낸다.

숫자를 손으로 옮겨 적으면 대본이 바뀔 때마다 문서가 먼저 틀어진다.
"""
import base64, html, json, pathlib, re, subprocess, sys

D = pathlib.Path(__file__).parent
HAN = re.compile(r"[가-힣]")
tl = json.loads((D / "timeline.json").read_text())
script = json.loads((D / "script.json").read_text())
TOTAL = tl["timing"]["total"]

ORIG = {
    "시험 기간, 집중력을 올리려고 먹은 달콤한 간식!",
    "그런데 왜 내 뇌는 더 졸리고 멍해질까요?",
    "범인은 바로 내 몸속 시한폭탄, 혈당 스파이크입니다.",
    "설탕이 가득한 음식을 먹으면 혈당이 급상승합니다.",
    "깜짝 놀란 우리 몸은 인슐린을 마구 뿜어내어 혈당을 뚝 떨어뜨립니다.",
    "이때 연료를 빼앗긴 뇌세포는 비명을 지르게 됩니다.",
    "이것이 바로 가짜 피로, 혈당 크래시입니다.",
    "우리 뇌의 시상하부에는 깨어있게 만드는 오렉신 스위치가 있습니다.",
    "하지만 포도당이 급격히 많아지면 이 스위치는 강제로 꺼집니다.",
    "반면 완만하게 소화되는 통곡물이나 견과류는 오렉신을 안정적으로 유지해 줍니다.",
    "최고의 학습 효율과 집중력을 원한다면?",
    "오늘부터 혈당을 지키는 과학적인 식습관을 시작해 보세요.",
    "삼분 과학 소통이었습니다!",
}
READING = [("밤 열한시", "밤 11시"), ("삼십분", "30분"), ("이퍼센트", "2%"),
           ("이십퍼센트", "20%"), ("삼분 과학", "3분 과학")]


def mmss(t):
    return f"{int(t // 60)}:{t % 60:05.2f}"


def sents(t):
    return [s for s in re.split(r"(?<=[.!?])\s+", t.strip()) if s]


# 목표 길이는 내 음원 길이가 아니라 콘티 슬롯에서 뽑는다. 어떤 도구로 만들든
# 유효해야 하고, 내 쪽 음원이 바뀌어도 사양이 흔들리면 안 된다.
RATE = 5.4          # 교육·다큐 낭독 대역 (음절/초)
tracks = []
for i, sec in enumerate(script["sections"], 1):
    ss = sents(sec["narration"])
    a, b = sec["slot"]
    syl = len(HAN.findall(sec["narration"]))
    at = a + (1.6 if i == 1 else 0.9)                 # 장면이 잡히고 나서 말이 붙는다
    ideal = syl / RATE + (len(ss) - 1) * 0.75 + 0.3   # 말 + 문장 사이 호흡
    tracks.append({
        "n": i, "name": sec["name"], "at": at, "dur": ideal,
        "slot": (a, b), "syl": syl, "sents": ss,
        "hi": b - at - 0.8, "lo": syl / 6.6 + (len(ss) - 1) * 0.5,
    })


def font_css():
    """쓰인 글자만 남긴 Pretendard 를 통째로 심는다 — 외부 요청은 차단된다."""
    try:
        from fontTools import subset
    except ImportError:
        return ""
    used = set("".join(t["name"] + "".join(t["sents"]) for t in tracks))
    used |= set(pathlib.Path(__file__).read_text())
    used |= set("0123456789.:-~%()[]/·→ ", )
    out = []
    for w, f in ((900, "Black"), (700, "Bold"), (500, "Medium"), (400, "Regular")):
        src = D / "fonts" / f"Pretendard-{f}.otf"
        if not src.exists():
            continue
        dst = D / "out" / f"_sub{w}.woff2"
        opt = subset.Options(flavor="woff2", desubroutinize=True,
                             layout_features=["kern", "liga"])
        fnt = subset.load_font(str(src), opt)
        subset.Subsetter(opt).subset(fnt) if False else None
        s = subset.Subsetter(options=opt)
        s.populate(text="".join(sorted(used)) + "가나다라마바사아자차카타파하")
        s.subset(fnt)
        subset.save_font(fnt, str(dst), opt)
        b64 = base64.b64encode(dst.read_bytes()).decode()
        out.append(f"@font-face{{font-family:'PD';font-weight:{w};font-display:swap;"
                   f"src:url(data:font/woff2;base64,{b64}) format('woff2')}}")
        dst.unlink()
    return "\n".join(out)


def esc(s):
    return html.escape(s)


ruler = []
for t in tracks:
    ruler.append(
        f'<div class="seg t{t["n"]}" style="left:{t["at"]/TOTAL*100:.3f}%;'
        f'width:{t["dur"]/TOTAL*100:.3f}%"><span>{t["n"]}</span></div>')

cards = []
for t in tracks:
    rows = []
    for s in t["sents"]:
        tag = '<b class="orig">기획서</b>' if s in ORIG else ""
        rows.append(f"<li>{esc(s)}{tag}</li>")
    cards.append(f"""
<article class="track">
  <header>
    <div class="tnum">트랙 {t['n']}</div>
    <h3>{esc(t['name'])}</h3>
  </header>
  <dl class="spec">
    <div><dt>배치 시각</dt><dd class="num">{t['at']:.2f}s</dd></div>
    <div><dt>목표 길이</dt><dd class="num">{t['dur']:.2f}s</dd></div>
    <div><dt>허용 범위</dt><dd class="num">{t['lo']:.1f} ~ {t['hi']:.1f}s</dd></div>
    <div><dt>장면 구간</dt><dd class="num">{t['slot'][0]:.0f} ~ {t['slot'][1]:.0f}s</dd></div>
    <div><dt>분량</dt><dd class="num">{t['syl']}음절 · {len(t['sents'])}문장</dd></div>
  </dl>
  <ol class="lines">{''.join(rows)}</ol>
</article>""")

read_rows = "".join(
    f"<tr><td>{esc(a)}</td><td class=\"num\">{esc(b)}</td></tr>" for a, b in READING)

page = f"""<title>나레이션 인수인계</title>
<style>
{font_css()}
:root{{
  --paper:#F1F3F2; --surface:#FFFFFF; --ink:#16202A; --muted:#5E6B72;
  --line:#D8DEDC; --accent:#0E7C63; --accent-soft:#DCEDE7; --warn:#A8500E;
  --warn-soft:#F6E7D8;
  --mono:ui-monospace,SFMono-Regular,"SF Mono",Menlo,Consolas,monospace;
}}
@media (prefers-color-scheme:dark){{
  :root:not([data-theme="light"]){{
    --paper:#10171A; --surface:#172126; --ink:#E6ECEA; --muted:#8FA0A6;
    --line:#26343A; --accent:#3FD6AE; --accent-soft:#12332C; --warn:#E0912F;
    --warn-soft:#33240F;
  }}
}}
:root[data-theme="dark"]{{
  --paper:#10171A; --surface:#172126; --ink:#E6ECEA; --muted:#8FA0A6;
  --line:#26343A; --accent:#3FD6AE; --accent-soft:#12332C; --warn:#E0912F;
  --warn-soft:#33240F;
}}
*{{box-sizing:border-box}}
body{{margin:0;background:var(--paper);color:var(--ink);
  font-family:'PD',system-ui,sans-serif;font-size:16px;line-height:1.72;
  -webkit-font-smoothing:antialiased}}
.wrap{{max-width:60rem;margin:0 auto;padding:clamp(28px,6vw,72px) clamp(18px,5vw,40px) 96px;
  display:flex;flex-direction:column;gap:56px}}
h1{{font-weight:900;font-size:clamp(30px,5.2vw,46px);line-height:1.14;margin:0;
  letter-spacing:-.03em;text-wrap:balance}}
h2{{font-weight:900;font-size:clamp(19px,2.6vw,24px);margin:0;letter-spacing:-.02em}}
h3{{font-weight:800;font-size:19px;margin:0;letter-spacing:-.01em}}
p{{margin:0}}
.eyebrow{{font-size:12px;font-weight:700;letter-spacing:.19em;color:var(--accent);
  text-transform:uppercase;display:flex;align-items:center;gap:10px}}
.eyebrow::after{{content:"";flex:1;height:1px;background:var(--line)}}
.lede{{color:var(--muted);font-size:17px;max-width:52ch}}
section{{display:flex;flex-direction:column;gap:20px}}
.shead{{display:flex;align-items:baseline;gap:14px;border-bottom:2px solid var(--ink);
  padding-bottom:10px}}
.snum{{font-family:var(--mono);font-size:13px;font-weight:700;color:var(--accent);
  font-variant-numeric:tabular-nums}}
.num{{font-family:var(--mono);font-variant-numeric:tabular-nums}}

/* 러닝타임 자 — 어느 트랙이 어디에 앉는지 */
.ruler{{position:relative;height:62px;background:var(--surface);
  border:1px solid var(--line);border-radius:10px;overflow:hidden}}
.seg{{position:absolute;top:0;bottom:0;background:var(--accent-soft);
  border-left:2px solid var(--accent);display:flex;align-items:center;
  justify-content:center}}
.seg span{{font-family:var(--mono);font-size:13px;font-weight:700;color:var(--accent)}}
.ticks{{display:flex;justify-content:space-between;font-family:var(--mono);
  font-size:11px;color:var(--muted);margin-top:6px}}

.track{{background:var(--surface);border:1px solid var(--line);border-radius:12px;
  padding:22px 24px;display:flex;flex-direction:column;gap:16px}}
.track header{{display:flex;align-items:baseline;gap:12px;flex-wrap:wrap}}
.tnum{{font-family:var(--mono);font-size:12px;font-weight:700;color:var(--accent);
  background:var(--accent-soft);padding:3px 9px;border-radius:5px}}
.spec{{margin:0;display:grid;grid-template-columns:repeat(auto-fit,minmax(148px,1fr));
  gap:12px 20px;padding:14px 0;border-top:1px solid var(--line);
  border-bottom:1px solid var(--line)}}
.spec div{{display:flex;flex-direction:column;gap:2px}}
.spec dt{{font-size:11px;font-weight:700;letter-spacing:.11em;color:var(--muted)}}
.spec dd{{margin:0;font-size:16px;font-weight:700}}
.lines{{margin:0;padding-left:1.9em;display:flex;flex-direction:column;gap:7px;
  font-size:15.5px}}
.lines li::marker{{color:var(--muted);font-family:var(--mono);font-size:12px}}
.orig{{font-size:10.5px;font-weight:700;letter-spacing:.08em;color:var(--warn);
  background:var(--warn-soft);padding:2px 7px;border-radius:4px;margin-left:8px;
  white-space:nowrap;vertical-align:2px}}

table{{width:100%;border-collapse:collapse;font-size:15px}}
th{{text-align:left;font-size:11px;letter-spacing:.12em;color:var(--muted);
  font-weight:700;padding:0 14px 8px 0;border-bottom:1px solid var(--line)}}
td{{padding:11px 14px 11px 0;border-bottom:1px solid var(--line);vertical-align:top}}
.scroll{{overflow-x:auto}}

.rule{{background:var(--surface);border:1px solid var(--line);border-left:3px solid var(--warn);
  border-radius:0 10px 10px 0;padding:16px 20px;display:flex;flex-direction:column;gap:6px}}
.rule b{{font-weight:800}}
.rules{{display:flex;flex-direction:column;gap:12px}}

.paths{{display:grid;grid-template-columns:repeat(auto-fit,minmax(260px,1fr));gap:16px}}
.path{{background:var(--surface);border:1px solid var(--line);border-radius:12px;
  padding:20px 22px;display:flex;flex-direction:column;gap:10px}}
.path.pick{{border-color:var(--accent);box-shadow:0 0 0 1px var(--accent)}}
.tag{{font-size:11px;font-weight:700;letter-spacing:.1em;color:var(--accent)}}
code{{font-family:var(--mono);font-size:.88em;background:var(--accent-soft);
  padding:2px 6px;border-radius:4px;color:var(--ink)}}
pre{{margin:0;background:var(--surface);border:1px solid var(--line);border-radius:10px;
  padding:16px 18px;overflow-x:auto;font-family:var(--mono);font-size:13px;line-height:1.85}}
pre code{{background:none;padding:0}}
footer{{color:var(--muted);font-size:13.5px;border-top:1px solid var(--line);padding-top:22px}}
</style>

<div class="wrap">

<header style="display:flex;flex-direction:column;gap:16px">
  <div class="eyebrow">나레이션 재제작 사양</div>
  <h1>혈당 스파이크 3분 영상<br>나레이션 인수인계</h1>
  <p class="lede">영상·자막·BGM·효과음은 완성돼 있습니다. 나레이션만 다시 만들어
     얹으면 되는 상태이고, 이 문서는 그 작업에 필요한 사양 전부입니다.</p>
</header>

<section>
  <div class="shead"><span class="snum">01</span><h2>지금 상태</h2></div>
  <p>본편은 <b>1920×1080 · 30fps · 정확히 {TOTAL:.0f}.000초</b>로 완성돼 있습니다.
     화면, 타이포그래피 자막 {len(tl['subs'])}컷, 배경음악, 효과음, 썸네일까지 납품 가능한
     상태입니다. 나레이션은 TTS 로 만든 4개 트랙을 붙여 쓰고 있는데, 원본 음원을
     다시 뽑을 수 없는 상황에서 길이를 맞추려고 가공을 거듭한 탓에 매끄럽지 않습니다.
     <b>새 음성으로 교체하는 것이 가장 빠르고 확실합니다.</b></p>
  <div>
    <div class="ruler">{''.join(ruler)}</div>
    <div class="ticks"><span>0:00</span><span>0:45</span><span>1:45</span><span>2:30</span><span>3:00</span></div>
  </div>
</section>

<section>
  <div class="shead"><span class="snum">02</span><h2>두 가지 방법</h2></div>
  <div class="paths">
    <div class="path pick">
      <div class="tag">권장</div>
      <h3>프로젝트에서 다시 렌더</h3>
      <p>새 나레이션 wav 4개를 <code>audio/</code> 에 넣고 파이프라인을 돌리면
         자막 타이밍과 화면 연출 시점이 <b>새 음성에 맞춰 자동으로 다시 계산</b>됩니다.
         혈당 곡선의 정점·저점, 오렉신 스위치가 꺼지는 순간 같은 것들이 자막 위치에서
         나오기 때문입니다.</p>
    </div>
    <div class="path">
      <div class="tag">빠른 길</div>
      <h3>목소리만 갈아끼우기</h3>
      <p>같이 드리는 <b>나레이션 없는 마스터</b>(BGM·효과음만 들어간 영상)에
         새 음성을 아래 배치 시각대로 얹습니다. 렌더 없이 끝나지만, 길이가 사양에서
         크게 벗어나면 화면과 말이 어긋납니다.</p>
    </div>
  </div>
  <pre><code>git clone https://github.com/sonny4984/claude-trade-backend
cd production            # 브랜치: claude/lee-kang-in-atletico-shorts-chdc77

# 새 나레이션을 audio/s1.wav ~ s4.wav 로 넣은 뒤
python3 build_timeline.py    # 타이밍·자막·연출 비트 재계산
python3 render.py --video    # 프레임 렌더 (약 50분)
python3 mux.py               # 사운드 합성
python3 make_srt.py          # 자막 파일</code></pre>
</section>

<section>
  <div class="shead"><span class="snum">03</span><h2>트랙 사양</h2></div>
  <p class="lede">아래 문장을 그대로 읽히고, 각 트랙을 지정한 시각에 놓으면 됩니다.</p>
  {''.join(cards)}
</section>

<section>
  <div class="shead"><span class="snum">04</span><h2>읽는 법</h2></div>
  <p>숫자를 아라비아로 넣으면 한국어 TTS 가 <b>십일시</b>, <b>이퍼센트</b> 처럼 읽는
     경우가 많습니다. 화면 자막은 숫자로 나가고 음성은 아래 왼쪽 표기로 넣으세요.</p>
  <div class="scroll">
    <table>
      <thead><tr><th>TTS 에 넣을 표기</th><th>화면 자막 표기</th></tr></thead>
      <tbody>{read_rows}</tbody>
    </table>
  </div>
</section>

<section>
  <div class="shead"><span class="snum">05</span><h2>지켜야 할 것</h2></div>
  <div class="rules">
    <div class="rule">
      <b>문장 내용은 한 글자도 바꾸지 마세요.</b>
      <span>클라이언트 기획서 원문 13문장이 섞여 있습니다. 위 목록에서
        <b class="orig">기획서</b> 표시가 붙은 문장이 그것입니다. 나머지는 구간 길이를
        채우려고 덧붙인 연결 문장이라 빼거나 다듬어도 됩니다.</span>
    </div>
    <div class="rule">
      <b>네 트랙을 한 번에, 같은 설정으로 뽑으세요.</b>
      <span>트랙마다 따로 생성하면 목소리가 미세하게 달라집니다. 가능하면 한 요청에
        전체를 넣고 나중에 자르는 편이 안전합니다.</span>
    </div>
    <div class="rule">
      <b>길이가 안 맞아도 문장 안쪽을 자르지 마세요.</b>
      <span>어절 사이 틈에는 숨소리와 앞 음절의 여운이 실려 있습니다. 그 자리를 잘라
        붙이면 목소리가 끊겨 들립니다. 조절은 <b>문장 사이 호흡</b>이나 전체 배속으로
        하세요. 배속은 음색을 거의 건드리지 않습니다.</span>
    </div>
    <div class="rule">
      <b>라우드니스</b>
      <span>나레이션 단독 −16 LUFS, 최종 합본 −14 LUFS · True Peak −1.0 dBTP 로
        맞춰져 있습니다. 같은 기준으로 맞춰 주세요.</span>
    </div>
  </div>
</section>

<section>
  <div class="shead"><span class="snum">06</span><h2>같이 드리는 파일</h2></div>
  <div class="scroll">
    <table>
      <thead><tr><th>파일</th><th>내용</th></tr></thead>
      <tbody>
        <tr><td><code>영상_나레이션없음_BGM만.mp4</code></td>
            <td>화면 + 배경음악 + 효과음. 여기에 새 목소리를 얹으면 됩니다.</td></tr>
        <tr><td><code>혈당스파이크와_뇌과학의_비밀_FHD.mp4</code></td>
            <td>현재 나레이션이 들어간 본편. 비교용.</td></tr>
        <tr><td><code>샘플_1~4.mp3</code></td>
            <td>구간별 현재 나레이션. 어떤 톤이었는지 참고용.</td></tr>
        <tr><td><code>혈당스파이크와_뇌과학의_비밀.srt</code></td>
            <td>자막 {len(tl['subs'])}컷. 문장별 타임코드가 그대로 들어 있어 배치 기준으로 쓰기 좋습니다.</td></tr>
        <tr><td><code>나레이션_사양서.txt</code></td>
            <td>이 문서의 텍스트판. AI 에 그대로 붙여 넣기 좋은 형태입니다.</td></tr>
        <tr><td><code>thumbnail.jpg</code></td>
            <td>썸네일 FHD. 수정 불필요.</td></tr>
      </tbody>
    </table>
  </div>
</section>

<section>
  <div class="shead"><span class="snum">07</span><h2>어떤 도구로 만들까</h2></div>
  <p class="lede">이 일에 필요한 건 세 가지입니다. 한국어를 자연스럽게 읽을 것,
     한 목소리를 3분 내내 유지할 것, 문장별로 속도와 쉼을 조절할 수 있을 것.</p>
  <div class="paths">
    <div class="path pick">
      <div class="tag">1순위 · 한국어 전용</div>
      <h3>타입캐스트</h3>
      <p>한국 회사가 한국어 나레이션을 겨냥해 만든 물건이라 이 작업에 가장 맞습니다.
         500종 넘는 성우 캐릭터에서 교육·다큐 톤을 고를 수 있고,
         <b>문장마다 속도·쉼·감정을 따로 손볼 수 있어</b> 여기서 겪은 길이 문제를
         편집기 안에서 바로 해결할 수 있습니다.</p>
    </div>
    <div class="path pick">
      <div class="tag">1순위 · 품질</div>
      <h3>ElevenLabs</h3>
      <p>음성 AI 전반에서 가장 앞서 있습니다. 한국어는 <b>v3 보다 Multilingual v2</b> 를
         쓰세요 — v3 는 감정 표현이 풍부한 대신 긴 낭독에서 목소리 일관성과 외국어
         발음이 흔들린다는 평가가 있습니다. 3분짜리 한 목소리 유지에는 v2 가 안전합니다.
         Studio(장문 편집) 기능으로 문단별 조정이 됩니다.</p>
    </div>
    <div class="path">
      <div class="tag">가성비</div>
      <h3>네이버 CLOVA Voice / 더빙</h3>
      <p>한국어 발음과 억양이 방송 품질이고 100종의 목소리가 있습니다.
         <b>SSML 로 쉼·강조·속도를 태그로 지정</b>할 수 있어서 이 사양서의 타이밍을
         그대로 옮기기 좋습니다. CLOVA 더빙은 타임라인에 얹는 것까지 도구 안에서 됩니다.
         비용이 가장 낮습니다.</p>
    </div>
    <div class="path">
      <div class="tag">참고</div>
      <h3>수퍼톤</h3>
      <p>하이브가 인수한 한국 음성 기술 회사입니다. Supertonic 3 는 31개 언어를
         지원하고 읽기 안정성을 개선한 경량 모델이라, 기기에서 직접 돌리거나
         자체 파이프라인에 넣을 때 후보가 됩니다.</p>
    </div>
  </div>
  <div class="rules">
    <div class="rule">
      <b>어느 도구를 쓰든 이것만은</b>
      <span>4개 트랙을 <b>한 번에</b> 생성하고, 목소리·속도·감정 설정을 트랙마다 바꾸지
        마세요. 여기서 목소리가 갈라져 들린 원인이 정확히 그것이었습니다.
        길이가 안 맞으면 문장 사이 쉼으로 조절하고, 그래도 모자라면 전체 배속을
        한 번에 거세요.</span>
    </div>
  </div>
</section>

<footer>
  전체 소스는 <code>sonny4984/claude-trade-backend</code> 저장소의
  <code>claude/lee-kang-in-atletico-shorts-chdc77</code> 브랜치 <code>production/</code> 에 있습니다.
  화면은 전부 벡터로 직접 그린 것이고 BGM·효과음도 이 영상을 위해 합성한 오리지널이라
  추가 저작권료가 없습니다. 글꼴은 Pretendard(SIL OFL 1.1, 상업 이용 가능).
</footer>

</div>
"""

OUT = D / "out" / "handoff"
OUT.mkdir(parents=True, exist_ok=True)
(OUT / "나레이션_인수인계.html").write_text(page, encoding="utf8")
print(f"→ 나레이션_인수인계.html  ({len(page)/1024:.0f} KB)")

# AI 에 그대로 붙여 넣을 수 있는 텍스트판
L = ["나레이션 재제작 사양서", "=" * 74, "",
     f"영상: 1920x1080 / 30fps / 정확히 {TOTAL:.3f}초",
     "아래 4개 트랙을 지정한 시각에 배치하면 그림과 맞습니다.",
     "숫자는 읽는 그대로 적어 두었습니다. 아라비아 숫자로 바꾸면",
     "'십일시', '이퍼센트' 처럼 읽는 엔진이 많습니다.", ""]
for t in tracks:
    L += ["-" * 74, f"[트랙 {t['n']}] {t['name']}",
          f"  배치 시각   {t['at']:.2f}초",
          f"  목표 길이   {t['dur']:.1f}초  (허용 {t['lo']:.1f} ~ {t['hi']:.1f}초)",
          f"  장면 구간   {t['slot'][0]:.0f} ~ {t['slot'][1]:.0f}초",
          f"  분량        {t['syl']}음절 / {len(t['sents'])}문장",
          "  권장 속도   5.4 음절/초 · 문장 사이 호흡 0.75초", ""]
    L += [f"  {k:>2}. {s}" for k, s in enumerate(t["sents"], 1)] + [""]
L += ["-" * 74, "지켜야 할 것",
      "  · 문장 내용을 바꾸지 마세요. 클라이언트 기획서 원문이 섞여 있습니다.",
      "  · 네 트랙을 한 번에, 같은 목소리·같은 설정으로 뽑으세요.",
      "    트랙마다 따로 뽑으면 목소리가 미세하게 달라집니다.",
      "  · 길이가 안 맞아도 문장 안쪽을 자르지 마세요. 어절 사이 틈에는",
      "    숨소리가 실려 있어, 자르면 목소리가 끊겨 들립니다.",
      "    문장 사이 호흡이나 전체 배속으로 조절하세요.",
      "  · 라우드니스: 나레이션 -16 LUFS, 최종 합본 -14 LUFS / TP -1.0 dBTP"]
(OUT / "나레이션_사양서.txt").write_text("\n".join(L), encoding="utf8")
print(f"→ 나레이션_사양서.txt  ({len(L)}줄)")
