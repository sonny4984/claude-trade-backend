// 촬영 지시서. 절 구성을 json 의 sections 배열이 정한다.
const fs = require('fs');
const { Document, Packer, Paragraph, TextRun,
        AlignmentType, ShadingType, BorderStyle } = require('docx');

const d = JSON.parse(fs.readFileSync('shoot_final.json', 'utf8'));
const F = '맑은 고딕';

const run = (t, o = {}) => new TextRun({ text: t, font: F, size: o.size || 20,
  bold: !!o.bold, color: o.color || '000000' });

const titleBar = (t) => new Paragraph({
  alignment: AlignmentType.CENTER, spacing: { before: 0, after: 160 },
  shading: { type: ShadingType.CLEAR, fill: 'EDE7D3' },
  // 테두리는 위아래만. 네 방향을 다 쓰면 워드 스키마 순서와 어긋나 깨진다.
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

const cut = ([head, shot, narr, tip]) => ([
  new Paragraph({ spacing: { before: 130, after: 40 },
    children: [run(head, { bold: true })] }),
  line('-화면: ', shot),
  line('-그때 나오는 말: ', narr),
  line('-연기: ', tip),
]);

const children = [titleBar(d.title),
  new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 160 },
    children: [run(d.tag, { size: 18, color: '555555' })] })];

d.sections.forEach(([name, kind, rows], i) => {
  children.push(secHead(i + 1, name));
  rows.forEach(r => (kind === 'cut' ? cut(r).forEach(x => children.push(x))
                                    : children.push(item(r))));
});

const doc = new Document({
  styles: { default: { document: { run: { font: F, size: 20 } } } },
  sections: [{
    properties: { page: { margin: { top: 1000, right: 1000, bottom: 1000, left: 1000 } } },
    children,
  }],
});

Packer.toBuffer(doc).then(b => {
  fs.writeFileSync('촬영지시서.docx', b);
  console.log('→ 촬영지시서.docx  ' + (b.length / 1024).toFixed(0) + ' KB');
});
