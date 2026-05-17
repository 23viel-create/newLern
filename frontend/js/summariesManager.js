// מנהל מסך בחירת תכנים — עץ תיקיות וסיכומים
const SummariesManager = (() => {

  let treeData     = [];   // עץ מלא מהשרת
  let sortBy       = 'name';
  let searchQuery  = '';
  const expanded   = new Set(); // paths של תיקיות פתוחות

  // ─── עזרים ──────────────────────────────────────────────────────────────────

  function esc(str) {
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function debounce(fn, ms) {
    let t;
    return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), ms); };
  }

  // ─── אתחול ──────────────────────────────────────────────────────────────────

  async function init() {
    bindToolbar();
    await loadTree();
  }

  function bindToolbar() {
    // כפתורי תיקייה/סיכום חדשים ברמת השורש (data-path="")
    document.querySelectorAll('.tree-toolbar [data-action]').forEach((btn) => {
      btn.addEventListener('click', () => handleAction(btn.dataset.action, ''));
    });

    // מיון
    document.getElementById('treeSort').addEventListener('change', (e) => {
      sortBy = e.target.value;
      render();
    });

    // חיפוש (מדורג)
    document.getElementById('treeSearch').addEventListener(
      'input',
      debounce((e) => { searchQuery = e.target.value.trim(); render(); }, 250),
    );
  }

  // ─── טעינה מהשרת ────────────────────────────────────────────────────────────

  async function loadTree() {
    const container = document.getElementById('summariesTree');
    container.innerHTML = '<p class="placeholder-text">טוען...</p>';
    try {
      treeData = await Api.getTree();
      render();
    } catch (err) {
      container.innerHTML = `<p class="placeholder-text error-text">שגיאה בטעינת הסיכומים: ${esc(err.message)}</p>`;
    }
  }

  // ─── פילטור ─────────────────────────────────────────────────────────────────

  function filterTree(nodes, q) {
    if (!q) return nodes;
    const lower = q.toLowerCase();
    return nodes.reduce((acc, node) => {
      const match = (node.title || node.name).toLowerCase().includes(lower);
      if (node.type === 'folder') {
        const filteredChildren = filterTree(node.children || [], q);
        if (match || filteredChildren.length) {
          acc.push({ ...node, children: filteredChildren });
        }
      } else if (match) {
        acc.push(node);
      }
      return acc;
    }, []);
  }

  // ─── מיון ───────────────────────────────────────────────────────────────────

  function sortTree(nodes) {
    const cmp = {
      name:      (a, b) => (a.title || a.name).localeCompare(b.title || b.name, 'he'),
      createdAt: (a, b) => new Date(b.createdAt) - new Date(a.createdAt),
      updatedAt: (a, b) => new Date(b.updatedAt) - new Date(a.updatedAt),
    }[sortBy] || (() => 0);

    return [...nodes]
      .sort(cmp)
      .map((n) => (n.type === 'folder' && n.children)
        ? { ...n, children: sortTree(n.children) }
        : n);
  }

  // ─── רינדור ─────────────────────────────────────────────────────────────────

  function render() {
    const container = document.getElementById('summariesTree');
    const filtered  = filterTree(treeData, searchQuery);
    const sorted    = sortTree(filtered);

    if (!sorted.length) {
      const msg = searchQuery
        ? `לא נמצאו תוצאות עבור "${esc(searchQuery)}"`
        : 'אין סיכומים עדיין — צור תיקייה או סיכום חדש.';
      container.innerHTML = `<p class="placeholder-text">${msg}</p>`;
      return;
    }

    container.innerHTML = renderNodes(sorted, 0);
    // אחרי רינדור מחדש — שחזר מצב expand
    container.querySelectorAll('.tree-node--folder').forEach((el) => {
      const p = el.dataset.path;
      if (expanded.has(p)) {
        el.querySelector('.tree-node__children').hidden = false;
        const toggle = el.querySelector('.tree-node__toggle');
        if (toggle) toggle.textContent = '▼';
      }
    });
    attachEvents(container);
  }

  function renderNodes(nodes, depth) {
    return `<ul class="tree-list">${nodes.map((n) => renderNode(n, depth)).join('')}</ul>`;
  }

  function renderNode(node, depth) {
    const title   = esc(node.title || node.name);
    const p       = esc(node.path);
    const rawName = esc(node.title || node.name);
    const indent  = `style="--depth:${depth}"`;

    if (node.type === 'folder') {
      const childrenHtml = (node.children && node.children.length)
        ? renderNodes(node.children, depth + 1)
        : '<li class="tree-empty"><span class="placeholder-text">תיקייה ריקה</span></li>';

      return `
        <li class="tree-node tree-node--folder" data-path="${p}" data-type="folder">
          <div class="tree-node__row" ${indent}>
            <button class="tree-node__toggle" data-action="toggle" data-path="${p}" aria-label="הרחב/כווץ">▶</button>
            <span class="tree-node__icon" aria-hidden="true">📁</span>
            <span class="tree-node__name">${title}</span>
            <div class="tree-node__actions">
              <button class="btn btn--xs btn--ghost" data-action="new-folder"  data-path="${p}" title="תיקייה חדשה בתוך ${rawName}">📁+</button>
              <button class="btn btn--xs btn--ghost" data-action="new-summary" data-path="${p}" title="סיכום חדש בתוך ${rawName}">📄+</button>
              <button class="btn btn--xs btn--ghost" data-action="rename"      data-path="${p}" data-name="${rawName}">✏️</button>
              <button class="btn btn--xs btn--danger-ghost" data-action="delete" data-path="${p}" data-name="${rawName}" data-type="folder">🗑️</button>
            </div>
          </div>
          <ul class="tree-node__children" hidden>${childrenHtml}</ul>
        </li>`;
    }

    return `
      <li class="tree-node tree-node--summary" data-path="${p}" data-type="summary">
        <div class="tree-node__row" ${indent}>
          <span class="tree-node__spacer"></span>
          <span class="tree-node__icon" aria-hidden="true">📄</span>
          <span class="tree-node__name">${title}</span>
          <div class="tree-node__actions">
            <button class="btn btn--xs btn--ghost" data-action="rename" data-path="${p}" data-name="${rawName}">✏️</button>
            <button class="btn btn--xs btn--danger-ghost" data-action="delete" data-path="${p}" data-name="${rawName}" data-type="summary">🗑️</button>
          </div>
        </div>
      </li>`;
  }

  // ─── אירועים ────────────────────────────────────────────────────────────────

  function attachEvents(container) {
    container.addEventListener('click', async (e) => {
      const btn = e.target.closest('[data-action]');
      if (!btn) return;
      e.stopPropagation();
      await handleAction(btn.dataset.action, btn.dataset.path, btn.dataset.name, btn.dataset.type, btn);
    });
  }

  async function handleAction(action, nodePath, nodeName, nodeType, triggerEl) {
    switch (action) {

      case 'toggle': {
        const li       = triggerEl.closest('.tree-node--folder');
        const children = li.querySelector('.tree-node__children');
        const isOpen   = !children.hidden;
        children.hidden = isOpen;
        triggerEl.textContent = isOpen ? '▶' : '▼';
        isOpen ? expanded.delete(nodePath) : expanded.add(nodePath);
        break;
      }

      case 'new-folder': {
        const name = await WindowManager.promptInput('שם התיקייה החדשה', 'לדוגמה: מתמטיקה');
        if (!name) return;
        try {
          await Api.createFolder(nodePath, name);
          expanded.add(nodePath); // פתח אוטומטית את תיקיית ההורה
          await loadTree();
        } catch (err) {
          alert(`שגיאה: ${err.message}`);
        }
        break;
      }

      case 'new-summary': {
        const name = await WindowManager.promptInput('שם הסיכום החדש', 'לדוגמה: פרק 3 — אלגברה');
        if (!name) return;
        try {
          await Api.createSummary(nodePath, name);
          expanded.add(nodePath);
          await loadTree();
        } catch (err) {
          alert(`שגיאה: ${err.message}`);
        }
        break;
      }

      case 'rename': {
        const newName = await WindowManager.promptInput(
          nodeType === 'folder' ? 'שנה שם תיקייה' : 'שנה שם סיכום',
          '',
          nodeName || '',
        );
        if (!newName || newName === nodeName) return;
        try {
          await Api.renameNode(nodePath, newName);
          // עדכן expanded set אם השם השתנה
          if (expanded.has(nodePath)) {
            expanded.delete(nodePath);
            const slashIdx  = nodePath.lastIndexOf('/');
            const parentPart = slashIdx >= 0 ? nodePath.slice(0, slashIdx) : '';
            expanded.add(parentPart ? `${parentPart}/${newName}` : newName);
          }
          await loadTree();
        } catch (err) {
          alert(`שגיאה: ${err.message}`);
        }
        break;
      }

      case 'delete': {
        const typeLabel = nodeType === 'folder' ? 'תיקייה' : 'סיכום';
        const msg = nodeType === 'folder'
          ? `האם למחוק את התיקייה "${nodeName}" וכל תוכנה? לא ניתן לשחזר.`
          : `האם למחוק את הסיכום "${nodeName}"? לא ניתן לשחזר.`;
        const confirmed = await WindowManager.confirm(msg);
        if (!confirmed) return;
        try {
          await Api.deleteNode(nodePath);
          expanded.delete(nodePath);
          await loadTree();
        } catch (err) {
          alert(`שגיאה: ${err.message}`);
        }
        break;
      }
    }
  }

  // ─── ממשק ציבורי ────────────────────────────────────────────────────────────

  return { init, loadTree };
})();
