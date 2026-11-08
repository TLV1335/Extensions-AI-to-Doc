/**
 * gdocs-compiler.js
 * Biên dịch Markdown sang payload requests cho Google Docs REST API (batchUpdate)
 * Tương thích cả Browser Extension lẫn Node.js testing.
 */

(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.GDocsCompiler = factory();
  }
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const HEADINGS = [
    'HEADING_1',
    'HEADING_2',
    'HEADING_3',
    'HEADING_4',
    'HEADING_5',
    'HEADING_6'
  ];

  /**
   * Bóc tách inline style: **bold**, *italic*, `code`, [text](url)
   */
  function parseInline(text) {
    const re = /\*\*(.+?)\*\*|`([^`]+)`|\*(.+?)\*|\[([^\]]+)\]\((\S+?)\)/g;
    let plain = '';
    let last = 0;
    let m;
    const styles = [];

    while ((m = re.exec(text)) !== null) {
      plain += text.slice(last, m.index);
      const start = plain.length;
      if (m[1] !== undefined) {
        plain += m[1];
        styles.push({ type: 'bold', start, end: plain.length });
      } else if (m[2] !== undefined) {
        plain += m[2];
        styles.push({ type: 'code', start, end: plain.length });
      } else if (m[3] !== undefined) {
        plain += m[3];
        styles.push({ type: 'italic', start, end: plain.length });
      } else if (m[4] !== undefined) {
        plain += m[4];
        styles.push({ type: 'link', start, end: plain.length, url: m[5] });
      }
      last = re.lastIndex;
    }
    plain += text.slice(last);

    return { plain, styles };
  }

  /**
   * Chuyển đổi Markdown thành danh sách các blocks
   */
  function parseMarkdownToBlocks(md) {
    const lines = md.replace(/\r\n/g, '\n').split('\n');
    const blocks = [];
    let inCode = false;
    let codeBuffer = [];
    let tableBuffer = [];

    const flushCode = () => {
      if (codeBuffer.length) {
        blocks.push({
          type: 'code_block',
          lines: [...codeBuffer]
        });
        codeBuffer = [];
      }
    };

    const flushTable = () => {
      if (tableBuffer.length) {
        blocks.push({
          type: 'table',
          rawLines: [...tableBuffer]
        });
        tableBuffer = [];
      }
    };

    for (let i = 0; i < lines.length; i++) {
      const raw = lines[i];

      if (/^\s*`{3}/.test(raw)) {
        flushTable();
        if (inCode) {
          flushCode();
          inCode = false;
        } else {
          inCode = true;
        }
        continue;
      }

      if (inCode) {
        codeBuffer.push(raw);
        continue;
      }

      if (/^\s*\|.*\|\s*$/.test(raw)) {
        tableBuffer.push(raw);
        continue;
      }
      flushTable();

      if (!raw.trim()) {
        continue;
      }

      let m;
      if (/^\s*([-*_])(\s*\1){2,}\s*$/.test(raw)) {
        blocks.push({ type: 'hr' });
      } else if ((m = raw.match(/^(#{1,6})\s+(.*)$/))) {
        blocks.push({
          type: 'heading',
          level: m[1].length,
          text: m[2].trim()
        });
      } else if ((m = raw.match(/^(\s*)[-*+]\s+(.*)$/))) {
        blocks.push({
          type: 'bullet',
          indent: m[1].length,
          text: m[2].trim()
        });
      } else if ((m = raw.match(/^(\s*)\d+[.)]\s+(.*)$/))) {
        blocks.push({
          type: 'number',
          indent: m[1].length,
          text: m[2].trim()
        });
      } else if ((m = raw.match(/^>\s?(.*)$/))) {
        blocks.push({
          type: 'quote',
          text: m[1].trim()
        });
      } else {
        blocks.push({
          type: 'paragraph',
          text: raw.trim()
        });
      }
    }

    flushCode();
    flushTable();

    return blocks;
  }

  /**
   * Tạo toàn bộ text và các ranges định dạng để batchUpdate vào Google Docs API
   * @param {string} md Nội dung Markdown
   * @param {number} baseIndex Vị trí endIndex - 1 trong tài liệu hiện tại
   * @param {boolean} addDivider Thêm đường kẻ phân cách đầu mục
   */
  function compile(md, baseIndex = 1, addDivider = true) {
    const blocks = parseMarkdownToBlocks(md);
    let fullText = '';
    if (addDivider && baseIndex > 1) {
      fullText += '\n────────────────────────────────────────\n\n';
    } else if (baseIndex > 1) {
      fullText += '\n\n';
    }

    const requests = [];
    const textStartInDoc = baseIndex;

    // Danh sách các thao tác định dạng cần áp dụng sau khi insertText
    const formattingTasks = [];

    for (const block of blocks) {
      const blockStart = fullText.length;

      if (block.type === 'hr') {
        fullText += '────────────────────────────────────────\n\n';
        formattingTasks.push({
          kind: 'text_style',
          start: blockStart,
          end: fullText.length,
          style: {
            foregroundColor: { color: { rgbColor: { red: 0.6, green: 0.6, blue: 0.6 } } }
          },
          fields: 'foregroundColor'
        });
      } else if (block.type === 'heading') {
        const { plain, styles } = parseInline(block.text);
        fullText += plain + '\n';
        const blockEnd = fullText.length;

        const headingName = HEADINGS[Math.min(Math.max(block.level - 1, 0), 5)];
        formattingTasks.push({
          kind: 'paragraph_style',
          start: blockStart,
          end: blockEnd,
          style: { namedStyleType: headingName },
          fields: 'namedStyleType'
        });

        // Áp dụng inline styles cho heading nếu có
        for (const s of styles) {
          applyInlineStyleTask(formattingTasks, blockStart + s.start, blockStart + s.end, s);
        }
      } else if (block.type === 'bullet' || block.type === 'number') {
        const { plain, styles } = parseInline(block.text);
        fullText += plain + '\n';
        const blockEnd = fullText.length;

        formattingTasks.push({
          kind: 'bullet',
          start: blockStart,
          end: blockEnd,
          preset: block.type === 'bullet' ? 'BULLET_DISC_CIRCLE_SQUARE' : 'NUMBERED_DECIMAL_ALPHA_ROMAN'
        });

        for (const s of styles) {
          applyInlineStyleTask(formattingTasks, blockStart + s.start, blockStart + s.end, s);
        }
      } else if (block.type === 'quote') {
        const { plain, styles } = parseInline(block.text);
        fullText += plain + '\n';
        const blockEnd = fullText.length;

        formattingTasks.push({
          kind: 'paragraph_style',
          start: blockStart,
          end: blockEnd,
          style: {
            namedStyleType: 'NORMAL_TEXT',
            indentStart: { magnitude: 18, unit: 'PT' }
          },
          fields: 'namedStyleType,indentStart'
        });

        for (const s of styles) {
          applyInlineStyleTask(formattingTasks, blockStart + s.start, blockStart + s.end, s);
        }
      } else if (block.type === 'code_block') {
        const codeText = block.lines.join('\n') + '\n';
        fullText += codeText;
        const blockEnd = fullText.length;

        formattingTasks.push({
          kind: 'text_style',
          start: blockStart,
          end: blockEnd,
          style: {
            weightedFontFamily: { fontFamily: 'Consolas' },
            fontSize: { magnitude: 9.5, unit: 'PT' },
            backgroundColor: { color: { rgbColor: { red: 0.94, green: 0.95, blue: 0.96 } } }
          },
          fields: 'weightedFontFamily,fontSize,backgroundColor'
        });
      } else if (block.type === 'table') {
        // Biểu diễn bảng dạng text định dạng căn chỉnh đẹp
        const formattedTable = formatTableText(block.rawLines);
        fullText += formattedTable + '\n';
        const blockEnd = fullText.length;

        formattingTasks.push({
          kind: 'text_style',
          start: blockStart,
          end: blockEnd,
          style: {
            weightedFontFamily: { fontFamily: 'Consolas' },
            fontSize: { magnitude: 9, unit: 'PT' }
          },
          fields: 'weightedFontFamily,fontSize'
        });
      } else {
        // Paragraph bình thường
        const { plain, styles } = parseInline(block.text);
        fullText += plain + '\n';
        const blockEnd = fullText.length;

        formattingTasks.push({
          kind: 'paragraph_style',
          start: blockStart,
          end: blockEnd,
          style: { namedStyleType: 'NORMAL_TEXT' },
          fields: 'namedStyleType'
        });

        for (const s of styles) {
          applyInlineStyleTask(formattingTasks, blockStart + s.start, blockStart + s.end, s);
        }
      }
    }

    if (!fullText.trim()) {
      return { fullText: '', requests: [] };
    }

    // 1. Chèn toàn bộ nội dung text vào vị trí insertIndex
    requests.push({
      insertText: {
        location: { index: textStartInDoc },
        text: fullText
      }
    });

    // 2. Chuyển đổi các formattingTasks sang requests của Google Docs API
    // Áp dụng font chữ chuẩn ban đầu cho toàn bộ khối được chèn để tránh lem màu/font
    requests.push({
      updateTextStyle: {
        range: {
          startIndex: textStartInDoc,
          endIndex: textStartInDoc + fullText.length
        },
        textStyle: {
          bold: false,
          italic: false,
          underline: false,
          foregroundColor: { color: { rgbColor: { red: 0.1, green: 0.1, blue: 0.1 } } },
          weightedFontFamily: { fontFamily: 'Arial' },
          fontSize: { magnitude: 11, unit: 'PT' }
        },
        fields: 'bold,italic,underline,foregroundColor,weightedFontFamily,fontSize'
      }
    });

    for (const t of formattingTasks) {
      const start = textStartInDoc + t.start;
      const end = textStartInDoc + t.end;
      if (end <= start) continue;

      if (t.kind === 'paragraph_style') {
        requests.push({
          updateParagraphStyle: {
            range: { startIndex: start, endIndex: end },
            paragraphStyle: t.style,
            fields: t.fields
          }
        });
      } else if (t.kind === 'text_style') {
        requests.push({
          updateTextStyle: {
            range: { startIndex: start, endIndex: end },
            textStyle: t.style,
            fields: t.fields
          }
        });
      } else if (t.kind === 'bullet') {
        requests.push({
          createParagraphBullets: {
            range: { startIndex: start, endIndex: end },
            bulletPreset: t.preset
          }
        });
      }
    }

    return { fullText, requests };
  }

  function applyInlineStyleTask(tasks, start, end, s) {
    if (end <= start) return;
    if (s.type === 'bold') {
      tasks.push({
        kind: 'text_style',
        start,
        end,
        style: { bold: true },
        fields: 'bold'
      });
    } else if (s.type === 'italic') {
      tasks.push({
        kind: 'text_style',
        start,
        end,
        style: { italic: true },
        fields: 'italic'
      });
    } else if (s.type === 'code') {
      tasks.push({
        kind: 'text_style',
        start,
        end,
        style: {
          weightedFontFamily: { fontFamily: 'Consolas' },
          backgroundColor: { color: { rgbColor: { red: 0.94, green: 0.95, blue: 0.96 } } }
        },
        fields: 'weightedFontFamily,backgroundColor'
      });
    } else if (s.type === 'link') {
      tasks.push({
        kind: 'text_style',
        start,
        end,
        style: {
          link: { url: s.url },
          underline: true,
          foregroundColor: { color: { rgbColor: { red: 0.07, green: 0.45, blue: 0.9 } } }
        },
        fields: 'link,underline,foregroundColor'
      });
    }
  }

  function formatTableText(rawLines) {
    const rows = rawLines
      .filter((l) => !(/^[\s|:-]+$/.test(l) && l.indexOf('-') >= 0))
      .map((l) => l.trim().replace(/^\||\|$/g, '').split('|').map((c) => c.trim()));

    if (!rows.length) return '';
    const colWidths = [];
    rows.forEach((r) => {
      r.forEach((cell, idx) => {
        colWidths[idx] = Math.max(colWidths[idx] || 0, cell.length);
      });
    });

    const formatRow = (r) =>
      '| ' + r.map((c, idx) => c.padEnd(colWidths[idx], ' ')).join(' | ') + ' |';

    const sep = '|-' + colWidths.map((w) => '-'.repeat(w)).join('-|-') + '-|';

    const result = [formatRow(rows[0]), sep];
    for (let i = 1; i < rows.length; i++) {
      result.push(formatRow(rows[i]));
    }
    return result.join('\n');
  }

  return {
    compile,
    parseMarkdownToBlocks,
    parseInline
  };
});

