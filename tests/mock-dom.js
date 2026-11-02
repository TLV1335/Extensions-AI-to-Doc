/**
 * Zero-dependency Mock DOM implementation for Node.js
 * Implements W3C Node and Element interfaces required by content.js md() converter.
 */

const Node = {
  ELEMENT_NODE: 1,
  TEXT_NODE: 3,
  DOCUMENT_FRAGMENT_NODE: 11
};

class MockNode {
  constructor(nodeType) {
    this.nodeType = nodeType;
    this.childNodes = [];
    this.parentElement = null;
  }

  get children() {
    return this.childNodes.filter((c) => c.nodeType === Node.ELEMENT_NODE);
  }

  appendChild(child) {
    child.parentElement = this;
    this.childNodes.push(child);
    return child;
  }
}

class MockTextNode extends MockNode {
  constructor(text) {
    super(Node.TEXT_NODE);
    this._text = String(text);
  }

  get textContent() {
    return this._text;
  }

  set textContent(v) {
    this._text = String(v);
  }
}

class MockElement extends MockNode {
  constructor(tagName, attributes = {}) {
    super(Node.ELEMENT_NODE);
    this.tagName = tagName.toUpperCase();
    this.attributes = attributes;
  }

  getAttribute(name) {
    return this.attributes[name] || null;
  }

  setAttribute(name, value) {
    this.attributes[name] = String(value);
  }

  get textContent() {
    return this.childNodes.map((c) => c.textContent).join('');
  }

  querySelector(selector) {
    const list = this.querySelectorAll(selector);
    return list.length > 0 ? list[0] : null;
  }

  querySelectorAll(selector) {
    const results = [];
    const selectors = selector.split(',').map((s) => s.trim());

    function matches(el, sel) {
      if (sel.startsWith('.')) {
        const cls = sel.slice(1);
        const elCls = el.getAttribute('class') || '';
        return elCls.split(/\s+/).includes(cls);
      }
      if (sel.startsWith('[') && sel.endsWith(']')) {
        const inner = sel.slice(1, -1);
        const [attr, val] = inner.split('=');
        const cleanVal = val ? val.replace(/^["']|["']$/g, '') : null;
        const actual = el.getAttribute(attr);
        return cleanVal !== null ? actual === cleanVal : actual !== null;
      }
      return el.tagName === sel.toUpperCase();
    }

    function walk(el) {
      for (const child of el.children) {
        if (selectors.some((s) => matches(child, s))) {
          results.push(child);
        }
        walk(child);
      }
    }
    walk(this);
    return results;
  }
}

class MockDocumentFragment extends MockNode {
  constructor() {
    super(Node.DOCUMENT_FRAGMENT_NODE);
  }

  get textContent() {
    return this.childNodes.map((c) => c.textContent).join('');
  }
}

/**
 * Lightweight HTML parser into Mock DOM trees for testing.
 */
function parseHTML(html) {
  const root = new MockDocumentFragment();
  const stack = [root];

  // Tokenize tags and texts
  const tokenRegex = /<(\/)?([a-zA-Z0-9_-]+)([^>]*)>|([^<]+)/g;
  let match;

  while ((match = tokenRegex.exec(html)) !== null) {
    const [full, isClosing, tagName, rawAttrs, text] = match;

    if (text) {
      if (text.length > 0) {
        stack[stack.length - 1].appendChild(new MockTextNode(text));
      }
      continue;
    }

    if (isClosing) {
      // Find matching open tag
      const upperTag = tagName.toUpperCase();
      for (let i = stack.length - 1; i > 0; i--) {
        if (stack[i].tagName === upperTag) {
          stack.splice(i);
          break;
        }
      }
    } else {
      // Self-closing void elements in HTML
      const isVoid = /^(br|hr|img|input|meta|link)$/i.test(tagName);
      const attrs = {};
      if (rawAttrs) {
        const attrRegex = /([a-zA-Z0-9_-]+)(?:=["']([^"']*)["'])?/g;
        let attrMatch;
        while ((attrMatch = attrRegex.exec(rawAttrs)) !== null) {
          attrs[attrMatch[1].toLowerCase()] = attrMatch[2] !== undefined ? attrMatch[2] : '';
        }
      }

      const el = new MockElement(tagName, attrs);
      stack[stack.length - 1].appendChild(el);

      if (!isVoid && !full.endsWith('/>')) {
        stack.push(el);
      }
    }
  }

  return root.childNodes.length === 1 ? root.childNodes[0] : root;
}

module.exports = {
  Node,
  MockNode,
  MockTextNode,
  MockElement,
  MockDocumentFragment,
  parseHTML
};

