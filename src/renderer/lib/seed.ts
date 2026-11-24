import type { Folder, Note, NotebookData } from '../../shared/types';
import { stripHtml } from './format';

const now = Date.now();

const content = {
  welcome: `<p>这是一款本地优先的备忘录。它借鉴了 macOS 备忘录的安静与顺手，所有内容都只保存在你的电脑里。</p>
<h2>从这三个动作开始</h2>
<ul>
<li>按 <strong>Ctrl / ⌘ + N</strong> 新建一条备忘录，直接开始书写</li>
<li>按 <strong>Ctrl / ⌘ + F</strong> 搜索全部备忘录，关键词会在结果中高亮</li>
<li>把备忘录拖动到左侧文件夹，快速完成整理</li>
</ul>
<h2>已经为你准备好</h2>
<ul data-type="taskList">
<li data-type="taskItem" data-checked="true"><label><input type="checkbox" checked="checked"><span></span></label><div><p>自动保存，不需要手动点击保存</p></div></li>
<li data-type="taskItem" data-checked="true"><label><input type="checkbox" checked="checked"><span></span></label><div><p>富文本：标题、清单、表格、图片与链接</p></div></li>
<li data-type="taskItem" data-checked="false"><label><input type="checkbox"><span></span></label><div><p>试试上方的 <strong>Aa</strong> 样式菜单，写下一段属于今天的话</p></div></li>
</ul>
<blockquote><p>把想法放在一个随时找得到的地方。</p></blockquote>`,
  work: `<p>这周想把真正重要的事做完，而不是把清单填满。</p>
<h2>本周重点</h2>
<table>
<tbody>
<tr><th><p>事项</p></th><th><p>状态</p></th><th><p>备注</p></th></tr>
<tr><td><p>完成季度复盘</p></td><td><p>进行中</p></td><td><p>周五前</p></td></tr>
<tr><td><p>整理读书笔记</p></td><td><p>待开始</p></td><td><p>先归档到灵感文件夹</p></td></tr>
<tr><td><p>给家里打个电话</p></td><td><p>今天</p></td><td><p>晚上八点</p></td></tr>
</tbody>
</table>
<h2>今天</h2>
<ul data-type="taskList">
<li data-type="taskItem" data-checked="true"><label><input type="checkbox" checked="checked"><span></span></label><div><p>列出三件最重要的事</p></div></li>
<li data-type="taskItem" data-checked="false"><label><input type="checkbox"><span></span></label><div><p>关掉通知，专注 90 分钟</p></div></li>
<li data-type="taskItem" data-checked="false"><label><input type="checkbox"><span></span></label><div><p>散步，不带手机</p></div></li>
</ul>`,
  ideas: `<blockquote><p>好的工具应该退到内容后面。你打开它，然后开始想事情。</p></blockquote>
<h2>最近记下的</h2>
<ul>
<li>做一个只在本地运行的备忘录，搜索要快</li>
<li>周末去旧书店，找一本装帧好看的散文集</li>
<li>学一道新的汤，用番茄和烤过的蒜</li>
</ul>
<h2>想读</h2>
<p><strong>《写在身体上》</strong> · 珍妮特·温特森</p>
<p><strong>《观看之道》</strong> · 约翰·伯格</p>
<p><strong>《夏日终曲》</strong> · 安德烈·艾席蒙</p>
<p>有些灵感不需要马上完成，只要在需要的时候找得到。</p>`,
};

const makeNote = (partial: Omit<Note, 'text' | 'deletedAt'> & { text?: string; deletedAt?: number | null }): Note => ({
  ...partial,
  deletedAt: partial.deletedAt ?? null,
  text: partial.text ?? stripHtml(partial.content),
});

export function createSeedData(): NotebookData {
  const folders: Folder[] = [
    { id: 'folder-general', name: '备忘录', createdAt: now - 86400000 * 3 },
    { id: 'folder-work', name: '工作', createdAt: now - 86400000 * 2 },
    { id: 'folder-ideas', name: '灵感', createdAt: now - 86400000 },
  ];

  const notes: Note[] = [
    makeNote({
      id: 'welcome-note',
      folderId: 'folder-general',
      title: '欢迎使用备忘录',
      content: content.welcome,
      pinned: true,
      createdAt: now - 86400000 * 2,
      updatedAt: now - 1000 * 60 * 18,
    }),
    makeNote({
      id: 'work-note',
      folderId: 'folder-work',
      title: '本周待办',
      content: content.work,
      pinned: false,
      createdAt: now - 86400000 * 5,
      updatedAt: now - 1000 * 60 * 75,
    }),
    makeNote({
      id: 'ideas-note',
      folderId: 'folder-ideas',
      title: '一些值得记住的话',
      content: content.ideas,
      pinned: false,
      createdAt: now - 86400000 * 1.4,
      updatedAt: now - 86400000,
    }),
  ];

  return {
    version: 1,
    folders,
    notes,
    settings: {
      theme: 'system',
      sortBy: 'updatedAt',
      sortDir: 'desc',
      fontFamily: 'system',
      fontSize: 14,
    },
  };
}
