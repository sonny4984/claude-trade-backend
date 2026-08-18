// 원본 기획서와 같은 형식으로 세 편을 한 문서에 담고, 뒤에 별지를 붙인다.
const fs = require('fs');
const { Document, Packer, Paragraph, TextRun, PageBreak, Table, TableRow, TableCell,
        WidthType, AlignmentType, ShadingType, BorderStyle, VerticalAlign } = require('docx');

const { plans, annex } = JSON.parse(fs.readFileSync('plans.json', 'utf8'));
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
  children: [run(n === null ? t : `${n}. ${t}`, { bold: true, size: 21 })],
});

// 소항목 — " 라벨: 본문 " 형태, 라벨만 굵게
const item = ([label, body]) => new Paragraph({
  spacing: { after: 60 }, indent: { left: 140, hanging: 0 },
  children: [run(' ' + label + ': ', { bold: true }), run(body)],
});

// 콘티 한 칸 — 영상 / 나레이션 / 자막 세 줄
const line = (label, body) => new Paragraph({
  spacing: { after: 30 }, indent: { left: 200 },
  children: [run(label, { bold: true }), run(body)],
});
const cut = ([head, video, narration, subtitle]) => {
  const out = [
    new Paragraph({ spacing: { before: 100, after: 40 },
      children: [run(head, { bold: true })] }),
    line('-영상: ', video),
    line('-나레이션: ', narration),
  ];
  if (subtitle) out.push(line('-자막(10자 내외): ', subtitle));
  return out;
};

// 별지 비교표 — A4 폭 11906 에서 좌우 여백 1000 씩 빼면 9906
const COLS = [1900, 2669, 2669, 2668];
const cell = (text, o = {}) => new TableCell({
  width: { size: COLS[o.i], type: WidthType.DXA },
  verticalAlign: VerticalAlign.CENTER,
  shading: o.head ? { type: ShadingType.CLEAR, fill: 'EDE7D3' } : undefined,
  margins: { top: 60, bottom: 60, left: 80, right: 80 },
  children: [new Paragraph({
    alignment: o.head ? AlignmentType.CENTER : AlignmentType.LEFT,
    children: [run(text, { bold: !!o.head || o.i === 0, size: 18 })] })],
});
const table = ({ head, rows }) => new Table({
  columnWidths: COLS,
  width: { size: 9906, type: WidthType.DXA },
  rows: [
    new TableRow({ tableHeader: true,
      children: head.map((t, i) => cell(t, { i, head: true })) }),
    ...rows.map(r => new TableRow({ children: r.map((t, i) => cell(t, { i })) })),
  ],
});

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

// 별지
children.push(new Paragraph({ children: [new PageBreak()] }));
children.push(titleBar(annex.title));
children.push(new Paragraph({ spacing: { after: 140 }, indent: { left: 140 },
  children: [run(annex.intro)] }));
children.push(table(annex.table));
children.push(secHead(null, '어느 것을 고를지'));
annex.pick.forEach(x => children.push(item(x)));
children.push(secHead(null, '교과 연계와 수준'));
annex.level.forEach(x => children.push(item(x)));
children.push(secHead(null, '세 안 공통 — 공모 요강 준수 사항'));
annex.rules.forEach(x => children.push(item(x)));

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
