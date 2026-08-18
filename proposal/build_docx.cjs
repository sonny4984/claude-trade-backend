// 원본 기획서와 같은 형식으로 세 편을 한 문서에 담는다.
const fs = require('fs');
const { Document, Packer, Paragraph, TextRun, PageBreak,
        AlignmentType, ShadingType, BorderStyle } = require('docx');

const plans = JSON.parse(fs.readFileSync('plans.json', 'utf8'));
const F = '맑은 고딕';

const run = (text, o = {}) => new TextRun({ text, font: F, size: o.size || 20,
  bold: !!o.bold, color: o.color || '000000' });

// 제목 — 원본처럼 음영 박스에 가운데 정렬
const titleBar = (t) => new Paragraph({
  alignment: AlignmentType.CENTER,
  spacing: { before: 0, after: 160 },
  shading: { type: ShadingType.CLEAR, fill: 'EDE7D3' },
  // 위아래 선만 쓴다. docx 라이브러리가 테두리를 top→bottom→left→right 순으로
  // 내보내는데 스키마는 top→left→bottom→right 를 요구해서, 넷을 다 쓰면 깨진다.
  border: { top:    { style: BorderStyle.SINGLE, size: 8, color: '000000' },
            bottom: { style: BorderStyle.SINGLE, size: 8, color: '000000' } },
  children: [run(t, { bold: true, size: 21 })],
});

const secHead = (n, t) => new Paragraph({
  spacing: { before: 200, after: 60 },
  children: [run(`${n}. ${t}`, { bold: true, size: 21 })],
});

// 소항목 — " 라벨: 본문 " 형태, 라벨만 굵게
const item = ([label, body]) => new Paragraph({
  spacing: { after: 60 }, indent: { left: 140, hanging: 0 },
  children: [run(' ' + label + ': ', { bold: true }), run(body)],
});

// 콘티 한 칸
const cut = ([head, video, narration]) => ([
  new Paragraph({ spacing: { before: 100, after: 40 },
    children: [run(head, { bold: true })] }),
  new Paragraph({ spacing: { after: 30 }, indent: { left: 200 },
    children: [run('-영상: ', { bold: true }), run(video)] }),
  new Paragraph({ spacing: { after: 40 }, indent: { left: 200 },
    children: [run('-나레이션/자막: ', { bold: true }), run(narration)] }),
]);

const children = [];
plans.forEach((p, i) => {
  if (i > 0) children.push(new Paragraph({ children: [new PageBreak()] }));
  children.push(titleBar(p.title));
  children.push(new Paragraph({ alignment: AlignmentType.RIGHT,
    spacing: { after: 120 }, children: [run(p.tag, { size: 18, color: '555555' })] }));

  children.push(secHead(1, '기획 의도 및 목적'));   p.s1.forEach(x => children.push(item(x)));
  children.push(secHead(2, '핵심 과학적 지식 및 원리')); p.s2.forEach(x => children.push(item(x)));
  children.push(secHead(3, '영상 제작 형태 및 표현 방법')); p.s3.forEach(x => children.push(item(x)));
  children.push(secHead(4, '구체적인 콘티 및 스토리보드 (3분 구성)'));
  p.s4.forEach(x => cut(x).forEach(c => children.push(c)));
  children.push(secHead(5, '기대 효과'));           p.s5.forEach(x => children.push(item(x)));
});

const doc = new Document({
  styles: { default: { document: { run: { font: F, size: 20 } } } },
  sections: [{
    properties: { page: { margin: { top: 1000, right: 1000, bottom: 1000, left: 1000 } } },
    children,
  }],
});

Packer.toBuffer(doc).then(b => {
  fs.writeFileSync('과학영상_공모전_기획안_3편.docx', b);
  console.log('→ 과학영상_공모전_기획안_3편.docx  ' + (b.length / 1024).toFixed(0) + ' KB');
});
