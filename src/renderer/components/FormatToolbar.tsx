import { useState, type MouseEvent } from 'react';
import type { Editor } from '@tiptap/react';
import { useEditorState } from '@tiptap/react';
import {
  Bold,
  ChevronDown,
  Highlighter,
  ImagePlus,
  Italic,
  Link2,
  List,
  ListChecks,
  ListOrdered,
  MoreHorizontal,
  Quote,
  Strikethrough,
  Table2,
  Underline as UnderlineIcon,
} from 'lucide-react';
import { Menu, MenuItem, MenuLabel, MenuSeparator } from './Menu';

interface FormatToolbarProps {
  editor: Editor;
  onOpenLink: () => void;
  onInsertImage: () => void;
  onInsertTable: () => void;
}

interface FormatState {
  bold: boolean;
  italic: boolean;
  underline: boolean;
  strike: boolean;
  highlight: boolean;
  bulletList: boolean;
  orderedList: boolean;
  taskList: boolean;
  blockquote: boolean;
  link: boolean;
  paragraph: boolean;
  heading1: boolean;
  heading2: boolean;
  heading3: boolean;
  codeBlock: boolean;
  inTable: boolean;
}

export function FormatToolbar({ editor, onOpenLink, onInsertImage, onInsertTable }: FormatToolbarProps) {
  const [styleAnchor, setStyleAnchor] = useState<DOMRect | null>(null);
  const [overflowAnchor, setOverflowAnchor] = useState<DOMRect | null>(null);
  const [tableAnchor, setTableAnchor] = useState<DOMRect | null>(null);

  const format = useEditorState<FormatState>({
    editor,
    selector: ({ editor: current }) => ({
      bold: current.isActive('bold'),
      italic: current.isActive('italic'),
      underline: current.isActive('underline'),
      strike: current.isActive('strike'),
      highlight: current.isActive('highlight'),
      bulletList: current.isActive('bulletList'),
      orderedList: current.isActive('orderedList'),
      taskList: current.isActive('taskList'),
      blockquote: current.isActive('blockquote'),
      link: current.isActive('link'),
      paragraph: current.isActive('paragraph'),
      heading1: current.isActive('heading', { level: 1 }),
      heading2: current.isActive('heading', { level: 2 }),
      heading3: current.isActive('heading', { level: 3 }),
      codeBlock: current.isActive('codeBlock'),
      inTable: current.isActive('table'),
    }),
  });

  const styleLabel = format.codeBlock
    ? '等宽'
    : format.heading1
      ? '标题'
      : format.heading2
        ? '小标题'
        : format.heading3
          ? '标题 3'
          : '正文';

  const chain = () => editor.chain().focus();
  const preventBlur = (event: MouseEvent<HTMLButtonElement>) => event.preventDefault();

  return (
    <div className="format-toolbar" role="toolbar" aria-label="文本格式">
      <button
        type="button"
        className={`style-picker${styleAnchor ? ' is-pressed' : ''}`}
        aria-label="段落样式"
        aria-haspopup="menu"
        onMouseDown={preventBlur}
        onClick={(event) => {
          if (styleAnchor) setStyleAnchor(null);
          else setStyleAnchor(event.currentTarget.getBoundingClientRect());
        }}
      >
        <span className="style-picker-label">{styleLabel}</span>
        <ChevronDown size={11} strokeWidth={2.2} />
      </button>

      <span className="toolbar-divider" aria-hidden="true" />

      <ToolbarButton
        label="粗体 (Ctrl+B)"
        active={format.bold}
        onClick={() => chain().toggleBold().run()}
        onMouseDown={preventBlur}
      >
        <Bold size={15} strokeWidth={2.2} />
      </ToolbarButton>
      <ToolbarButton
        label="斜体 (Ctrl+I)"
        active={format.italic}
        onClick={() => chain().toggleItalic().run()}
        onMouseDown={preventBlur}
      >
        <Italic size={15} strokeWidth={2.2} />
      </ToolbarButton>
      <ToolbarButton
        label="下划线 (Ctrl+U)"
        active={format.underline}
        onClick={() => chain().toggleUnderline().run()}
        onMouseDown={preventBlur}
      >
        <UnderlineIcon size={15} strokeWidth={2.1} />
      </ToolbarButton>
      <ToolbarButton
        label="删除线"
        active={format.strike}
        onClick={() => chain().toggleStrike().run()}
        onMouseDown={preventBlur}
      >
        <Strikethrough size={15} strokeWidth={2} />
      </ToolbarButton>
      <ToolbarButton
        label="高亮"
        active={format.highlight}
        onClick={() => chain().toggleHighlight().run()}
        onMouseDown={preventBlur}
        className="optional-tool"
      >
        <Highlighter size={15} strokeWidth={1.9} />
      </ToolbarButton>

      <span className="toolbar-divider" aria-hidden="true" />

      <ToolbarButton
        label="项目符号列表"
        active={format.bulletList}
        onClick={() => chain().toggleBulletList().run()}
        onMouseDown={preventBlur}
      >
        <List size={16} strokeWidth={1.9} />
      </ToolbarButton>
      <ToolbarButton
        label="编号列表"
        active={format.orderedList}
        onClick={() => chain().toggleOrderedList().run()}
        onMouseDown={preventBlur}
      >
        <ListOrdered size={16} strokeWidth={1.9} />
      </ToolbarButton>
      <ToolbarButton
        label="待办清单"
        active={format.taskList}
        onClick={() => chain().toggleTaskList().run()}
        onMouseDown={preventBlur}
      >
        <ListChecks size={16} strokeWidth={1.9} />
      </ToolbarButton>
      <ToolbarButton
        label="引用"
        active={format.blockquote}
        onClick={() => chain().toggleBlockquote().run()}
        onMouseDown={preventBlur}
        className="optional-tool"
      >
        <Quote size={15} strokeWidth={1.9} />
      </ToolbarButton>

      <span className="toolbar-divider optional-tool" aria-hidden="true" />

      <ToolbarButton
        label={format.link ? '编辑链接 (Ctrl+K)' : '添加链接 (Ctrl+K)'}
        active={format.link}
        onClick={onOpenLink}
        onMouseDown={preventBlur}
        className="optional-tool"
      >
        <Link2 size={15} strokeWidth={1.9} />
      </ToolbarButton>
      <ToolbarButton
        label="插入图片"
        onClick={onInsertImage}
        onMouseDown={preventBlur}
        className="optional-tool"
      >
        <ImagePlus size={15} strokeWidth={1.9} />
      </ToolbarButton>
      <ToolbarButton
        label={format.inTable ? '表格选项' : '插入表格'}
        active={format.inTable}
        onClick={(event) => {
          if (format.inTable) setTableAnchor(event.currentTarget.getBoundingClientRect());
          else onInsertTable();
        }}
        onMouseDown={preventBlur}
        className="optional-tool"
      >
        <Table2 size={15} strokeWidth={1.9} />
      </ToolbarButton>

      <button
        type="button"
        className={`format-button compact-only${overflowAnchor ? ' is-active' : ''}`}
        aria-label="更多格式和插入选项"
        title="更多格式"
        onMouseDown={preventBlur}
        onClick={(event) => {
          if (overflowAnchor) setOverflowAnchor(null);
          else setOverflowAnchor(event.currentTarget.getBoundingClientRect());
        }}
      >
        <MoreHorizontal size={16} strokeWidth={2} />
      </button>

      <Menu
        open={Boolean(overflowAnchor)}
        anchor={overflowAnchor}
        align="end"
        width={196}
        onClose={() => setOverflowAnchor(null)}
        label="更多格式"
      >
        <MenuItem
          icon={<Highlighter size={14} />}
          label="高亮"
          checked={format.highlight}
          onSelect={() => {
            chain().toggleHighlight().run();
            setOverflowAnchor(null);
          }}
        />
        <MenuItem
          icon={<Quote size={14} />}
          label="引用"
          checked={format.blockquote}
          onSelect={() => {
            chain().toggleBlockquote().run();
            setOverflowAnchor(null);
          }}
        />
        <MenuItem
          icon={<Link2 size={14} />}
          label={format.link ? '编辑链接' : '添加链接'}
          onSelect={() => {
            setOverflowAnchor(null);
            onOpenLink();
          }}
        />
        <MenuItem
          icon={<ImagePlus size={14} />}
          label="插入图片"
          onSelect={() => {
            setOverflowAnchor(null);
            onInsertImage();
          }}
        />
        <MenuItem
          icon={<Table2 size={14} />}
          label="插入表格"
          onSelect={() => {
            setOverflowAnchor(null);
            onInsertTable();
          }}
        />
        {format.inTable ? (
          <>
            <MenuLabel>表格</MenuLabel>
            <MenuItem
              label="在下方添加行"
              onSelect={() => {
                chain().addRowAfter().run();
                setOverflowAnchor(null);
              }}
            />
            <MenuItem
              label="在右侧添加列"
              onSelect={() => {
                chain().addColumnAfter().run();
                setOverflowAnchor(null);
              }}
            />
            <MenuItem
              label="删除当前行"
              onSelect={() => {
                chain().deleteRow().run();
                setOverflowAnchor(null);
              }}
            />
            <MenuItem
              label="删除当前列"
              onSelect={() => {
                chain().deleteColumn().run();
                setOverflowAnchor(null);
              }}
            />
            <MenuItem
              label="删除表格"
              destructive
              onSelect={() => {
                chain().deleteTable().run();
                setOverflowAnchor(null);
              }}
            />
          </>
        ) : null}
      </Menu>

      <Menu
        open={Boolean(tableAnchor)}
        anchor={tableAnchor}
        align="end"
        width={204}
        onClose={() => setTableAnchor(null)}
        label="表格选项"
      >
        <MenuLabel>表格</MenuLabel>
        <MenuItem
          label="在下方添加行"
          onSelect={() => {
            chain().addRowAfter().run();
            setTableAnchor(null);
          }}
        />
        <MenuItem
          label="在右侧添加列"
          onSelect={() => {
            chain().addColumnAfter().run();
            setTableAnchor(null);
          }}
        />
        <MenuSeparator />
        <MenuItem
          label="删除当前行"
          onSelect={() => {
            chain().deleteRow().run();
            setTableAnchor(null);
          }}
        />
        <MenuItem
          label="删除当前列"
          onSelect={() => {
            chain().deleteColumn().run();
            setTableAnchor(null);
          }}
        />
        <MenuSeparator />
        <MenuItem
          label="删除表格"
          destructive
          onSelect={() => {
            chain().deleteTable().run();
            setTableAnchor(null);
          }}
        />
      </Menu>

      <Menu
        open={Boolean(styleAnchor)}
        anchor={styleAnchor}
        onClose={() => setStyleAnchor(null)}
        width={196}
        label="段落样式"
      >
        <MenuItem
          label="标题"
          icon={<span className="style-glyph style-glyph-h1">H1</span>}
          checked={format.heading1}
          onSelect={() => {
            chain().setHeading({ level: 1 }).run();
            setStyleAnchor(null);
          }}
        />
        <MenuItem
          label="小标题"
          icon={<span className="style-glyph">H2</span>}
          checked={format.heading2}
          onSelect={() => {
            chain().setHeading({ level: 2 }).run();
            setStyleAnchor(null);
          }}
        />
        <MenuItem
          label="标题 3"
          icon={<span className="style-glyph">H3</span>}
          checked={format.heading3}
          onSelect={() => {
            chain().setHeading({ level: 3 }).run();
            setStyleAnchor(null);
          }}
        />
        <MenuItem
          label="正文"
          icon={<span className="style-glyph">¶</span>}
          checked={format.paragraph}
          onSelect={() => {
            chain().setParagraph().run();
            setStyleAnchor(null);
          }}
        />
        <MenuItem
          label="等宽"
          icon={<span className="style-glyph style-glyph-mono">Aa</span>}
          checked={format.codeBlock}
          onSelect={() => {
            chain().toggleCodeBlock().run();
            setStyleAnchor(null);
          }}
        />
      </Menu>
    </div>
  );
}

interface ToolbarButtonProps {
  label: string;
  active?: boolean;
  onClick: (event: MouseEvent<HTMLButtonElement>) => void;
  onMouseDown?: (event: MouseEvent<HTMLButtonElement>) => void;
  children: React.ReactNode;
  className?: string;
}

function ToolbarButton({ label, active, onClick, onMouseDown, children, className = '' }: ToolbarButtonProps) {
  return (
    <button
      type="button"
      className={`format-button${active ? ' is-active' : ''}${className ? ` ${className}` : ''}`}
      aria-label={label}
      aria-pressed={Boolean(active)}
      title={label}
      onMouseDown={onMouseDown}
      onClick={onClick}
    >
      {children}
    </button>
  );
}
