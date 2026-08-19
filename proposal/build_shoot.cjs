// 교내대회 재편집 안내 + 촬영 지시서. 기획안과 같은 형식으로 만든다.
const fs = require('fs');
const { Document, Packer, Paragraph, TextRun,
        AlignmentType, ShadingType, BorderStyle } = require('docx');

const d = JSON.parse(fs.readFileSync('shoot.json', 'utf8'));
const F = '맑은 고딕';

const run = (text, o = {}) => new TextRun({ text, font: F, size: o.size || 20,
  bold: !!o.bold, color: o.color || '000000' });

const titleBar = (t) => new Paragraph({
  alignment: AlignmentType.CENTER,
  spacing: { before: 0, after: 160 },
  shading: { type: ShadingType.CLEAR, fill: 'EDE7D3' },
  // 테두리는 위아래만 쓴다. 네 방향을 다 쓰면 워드 스키마 순서와 어긋나 깨진다.
  border: { top:    { style: BorderStyle.SINGLE, size: 8, color: '000000' },
            bottom: { style: BorderStyle.SINGLE, size: 8, color: '000000' } },
  children: [run(t, { bold: true, size: 21 })],
});

const secHead = (n, t) => new Paragraph({
  spacing: { before: 220, after: 60 },
  children: [run(`${n}. ${t}`, { bold: true, size: 21 })],
});

const item = ([label, body]) => new Paragraph({
  spacing: { after: 60 }, indent: { left: 140 },
  children: [run(' ' + label + ': ', { bold: true }), run(body)],
});

const line = (label, body) => new Paragraph({
  spacing: { after: 30 }, indent: { left: 200 },
  children: [run(label, { bold: true }), run(body)],
});

// 컷 한 칸 — 화면 / 나레이션 / 요령
const cut = ([head, shot, narr, tip]) => ([
  new Paragraph({ spacing: { before: 120, after: 40 },
    children: [run(head, { bold: true })] }),
  line('-화면: ', shot),
  line('-그때 나오는 말: ', narr),
  line('-요령: ', tip),
]);

const children = [];
children.push(titleBar(d.title));
children.push(new Paragraph({ alignment: AlignmentType.CENTER,
  spacing: { after: 160 }, children: [run(d.tag, { size: 18, color: '555555' })] }));

children.push(secHead(1, '무엇을 왜 찍는가'));        d.s1.forEach(x => children.push(item(x)));
children.push(secHead(2, '찍을 여섯 컷 (다 합쳐 23초)'));
d.s2.forEach(x => cut(x).forEach(c => children.push(c)));
children.push(secHead(3, '촬영 공통 수칙'));          d.s3.forEach(x => children.push(item(x)));
children.push(secHead(4, '요강에 맞춰 이미 손본 것')); d.s4.forEach(x => children.push(item(x)));
children.push(secHead(5, '지금 상태와 더 할 수 있는 것')); d.s5.forEach(x => children.push(item(x)));

const doc = new Document({
  styles: { default: { document: { run: { font: F, size: 20 } } } },
  sections: [{
    properties: { page: { margin: { top: 1000, right: 1000, bottom: 1000, left: 1000 } } },
    children,
  }],
});

Packer.toBuffer(doc).then(b => {
  fs.writeFileSync('교내대회_재편집안내_및_촬영지시서.docx', b);
  console.log('→ 교내대회_재편집안내_및_촬영지시서.docx  ' + (b.length / 1024).toFixed(0) + ' KB');
});
