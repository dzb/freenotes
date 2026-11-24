import { describe, expect, it } from 'vitest';
import { buildStandaloneNoteHtml } from '../src/renderer/lib/noteExport';

describe('standalone note HTML export', () => {
  it('escapes the title and embeds the rich content', () => {
    const html = buildStandaloneNoteHtml(
      '<标题> & 分享',
      '<h2>小节</h2><table><tbody><tr><td><p>单元格</p></td></tr></tbody></table><p><img src="data:image/png;base64,abc" /></p>',
    );
    expect(html).toContain('<title>&lt;标题&gt; &amp; 分享</title>');
    expect(html).toContain('<h2>小节</h2>');
    expect(html).toContain('<table>');
    expect(html).toContain('data:image/png;base64,abc');
    expect(html).toContain('@page');
  });

  it('applies the selected note typography to shared HTML', () => {
    const html = buildStandaloneNoteHtml('字体', '<p>正文</p>', { fontFamily: 'serif', fontSize: 16 });
    expect(html).toContain('font-size: 16px');
    expect(html).toContain('Noto Serif CJK SC');
  });

  it('does not carry scripts or inline event handlers into a shared file', () => {
    const html = buildStandaloneNoteHtml(
      '安全',
      '<p onclick="alert(1)">正文</p><script>alert(2)</script>',
    );
    expect(html).not.toContain('<script');
    expect(html).not.toContain('onclick');
    expect(html).toContain('<p>正文</p>');
  });
});
