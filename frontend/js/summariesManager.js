// מנהל מסך בחירת תכנים — עץ תיקיות וסיכומים
const SummariesManager = (() => {

  let treeData        = [];   // עץ מלא מהשרת
  let sortBy          = 'name';
  let searchQuery     = '';
  let _eventsAttached = false;
  const expanded      = new Set(); // paths של תיקיות פתוחות

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
    if (!_eventsAttached) {
      bindToolbar();
      attachEvents();
      _eventsAttached = true;
    }
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

    // חיפוש (מדורג) — live filter
    document.getElementById('treeSearch').addEventListener(
      'input',
      debounce((e) => { searchQuery = e.target.value.trim(); render(); }, 250),
    );

    // כפתור חיפוש מתקדם — מציג תוצאות עם נתיב מלא
    document.getElementById('treeSearchBtn')?.addEventListener('click', () => {
      const q = document.getElementById('treeSearch').value.trim();
      if (q) _showSearchResults(q);
    });
    document.getElementById('treeSearch')?.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        const q = document.getElementById('treeSearch').value.trim();
        if (q) _showSearchResults(q);
      }
    });
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
              <button class="btn btn--xs btn--ghost" data-action="quiz-folder"   data-path="${p}" data-name="${rawName}" title="בחן על כל הסיכומים בתיקייה">🎯</button>
              <button class="btn btn--xs btn--ghost" data-action="import-file"   data-path="${p}" data-name="${rawName}" title="ייבא קובץ Word או שמע לתיקייה">📥</button>
              <button class="btn btn--xs btn--ghost" data-action="export-zip"    data-path="${p}" data-name="${rawName}" title="ייצא חומר לימוד (ZIP)">📦</button>
              <button class="btn btn--xs btn--ghost" data-action="new-folder"    data-path="${p}" title="תיקייה חדשה בתוך ${rawName}">📁+</button>
              <button class="btn btn--xs btn--ghost" data-action="new-summary"   data-path="${p}" title="סיכום חדש בתוך ${rawName}">📄+</button>
              <button class="btn btn--xs btn--ghost" data-action="rename"        data-path="${p}" data-name="${rawName}">✏️</button>
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
          <span class="tree-node__name tree-node__name--link"
                data-action="open" data-path="${p}"
                role="button" tabindex="0" title="פתח סיכום">${title}</span>
          <div class="tree-node__actions">
            <button class="btn btn--xs btn--ghost" data-action="quiz-node"  data-path="${p}" data-name="${rawName}" title="התחל בחינה על סיכום זה">🎯</button>
            <button class="btn btn--xs btn--ghost" data-action="edit-questions" data-path="${p}" data-name="${rawName}" title="ערוך שאלות">📝</button>
            <button class="btn btn--xs btn--ghost" data-action="plan"       data-path="${p}" data-name="${rawName}" title="תזמן חזרות מרווחות">📅</button>
            <button class="btn btn--xs btn--ghost" data-action="export-zip" data-path="${p}" data-name="${rawName}" title="ייצא חומר לימוד (ZIP)">📦</button>
            <button class="btn btn--xs btn--ghost" data-action="rename"     data-path="${p}" data-name="${rawName}">✏️</button>
            <button class="btn btn--xs btn--danger-ghost" data-action="delete" data-path="${p}" data-name="${rawName}" data-type="summary">🗑️</button>
          </div>
        </div>
      </li>`;
  }

  // ─── flatten (for editor navigation) ───────────────────────────────────────

  function flattenSummaries(nodes) {
    const out = [];
    for (const n of nodes) {
      if (n.type === 'summary')           out.push(n);
      else if (n.children?.length)        out.push(...flattenSummaries(n.children));
    }
    return out;
  }

  // ─── אירועים ────────────────────────────────────────────────────────────────

  function attachEvents() {
    // Delegate on the stable view section so the listener survives tree re-renders
    // and works regardless of which nav tab the user came from.
    // Scope to #summariesTree children to avoid intercepting toolbar buttons.
    const viewSection = document.getElementById('view-summaries');
    viewSection.addEventListener('click', async (e) => {
      const btn = e.target.closest('#summariesTree [data-action]');
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

      case 'open': {
        // If a search is active: clear it, re-render full tree, then reveal path
        if (searchQuery) {
          searchQuery = '';
          const searchInput = document.getElementById('treeSearch');
          if (searchInput) searchInput.value = '';
          render(); // render full tree
          // Expand all ancestor folders so the item is visible
          _revealPath(nodePath);
        }
        const flatList = flattenSummaries(sortTree(treeData));
        const node     = flatList.find(n => n.path === nodePath);
        if (node) EditorManager.open(node, flatList);
        break;
      }

      case 'edit-questions': {
        QuizManager.openEditor(nodePath, nodeName);
        break;
      }

      case 'quiz-node': {
        QuizManager.startQuiz([nodePath], nodeName);
        break;
      }

      case 'quiz-folder': {
        QuizManager.startQuiz([nodePath], `תיקייה: ${nodeName}`);
        break;
      }

      case 'plan': {
        // Show program selector modal then plan
        PlanProgramModal.open(nodePath, nodeName);
        break;
      }

      case 'export-zip': {
        const fname = `${(nodeName || nodePath.split('/').pop())}_${new Date().toISOString().slice(0, 10)}.zip`;
        const url   = Api.exportNodeZipUrl(nodePath);
        const a     = document.createElement('a');
        a.href      = url;
        a.download  = fname;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        break;
      }

      case 'import-file': {
        _importFileToFolder(nodePath);
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
          // אם הסיכום הנמחק פתוח בעורך — נקה את העורך וחזור לעץ
          const openNode = EditorManager.getCurrentNode();
          if (openNode && (openNode.path === nodePath || openNode.path.startsWith(nodePath + '/'))) {
            EditorManager.clear();
            WindowManager.showView('summaries');
          }
          await loadTree();
        } catch (err) {
          alert(`שגיאה: ${err.message}`);
        }
        break;
      }
    }
  }

  // ─── ייבוא קובץ לתיקייה ─────────────────────────────────────────────────────

  function _importFileToFolder(folderPath) {
    const input = document.getElementById('folderImportInput');
    input.value = '';
    input.onchange = async () => {
      const file = input.files?.[0];
      if (!file) return;
      try {
        const result = await Api.importFileToFolder(folderPath, file);
        await loadTree();
        alert(`✓ הקובץ "${result.title}" יובא בהצלחה לתיקייה`);
      } catch (err) {
        alert(`שגיאה בייבוא: ${err.message}`);
      }
    };
    input.click();
  }

  // ─── חיפוש מתקדם עם נתיב מלא ──────────────────────────────────────────────

  function _flattenWithPath(nodes, folderLabel) {
    const out = [];
    for (const n of nodes) {
      if (n.type === 'summary') {
        out.push({ ...n, folderLabel: folderLabel || '' });
      } else if (n.type === 'folder' && n.children) {
        const childLabel = folderLabel
          ? `${folderLabel} / ${n.title || n.name}`
          : (n.title || n.name);
        out.push(..._flattenWithPath(n.children, childLabel));
      }
    }
    return out;
  }

  function _showSearchResults(q) {
    const panel = document.getElementById('treeSearchResults');
    if (!panel) return;
    const lower = q.toLowerCase();
    const results = _flattenWithPath(treeData, '').filter(n =>
      (n.title || n.name).toLowerCase().includes(lower),
    );

    panel.classList.remove('hidden');

    if (!results.length) {
      panel.innerHTML = `<p class="placeholder-text" style="padding:0.5rem 0.8rem">לא נמצאו תוצאות עבור "${esc(q)}"</p>`;
      return;
    }

    panel.innerHTML = `
      <div class="tree-search-results__header">
        <span>נמצאו ${results.length} תוצאות</span>
        <button class="btn btn--xs btn--ghost" id="treeSearchClose">✕ סגור</button>
      </div>
      ${results.map(r => `
        <div class="tree-search-result" data-path="${esc(r.path)}" role="button" tabindex="0">
          <span class="tree-search-result__name">📄 ${esc(r.title || r.name)}</span>
          ${r.folderLabel ? `<span class="tree-search-result__path">${esc(r.folderLabel)}</span>` : ''}
        </div>
      `).join('')}`;

    panel.querySelector('#treeSearchClose')?.addEventListener('click', () => {
      panel.classList.add('hidden');
    });

    panel.querySelectorAll('.tree-search-result').forEach(el => {
      el.addEventListener('click', () => {
        const nodePath = el.dataset.path;
        panel.classList.add('hidden');
        searchQuery = '';
        const searchInput = document.getElementById('treeSearch');
        if (searchInput) searchInput.value = '';
        render();
        _revealPath(nodePath);
        const flatList = flattenSummaries(sortTree(treeData));
        const node = flatList.find(n => n.path === nodePath);
        if (node) EditorManager.open(node, flatList);
      });
    });
  }

  // ─── גילוי מסלול עץ (expand כל תיקיות ההורה + גלילה + הדגשה) ───────────────

  function _revealPath(targetPath) {
    // Build ancestor paths from root down to parent
    const parts = targetPath.split('/');
    const ancestors = [];
    for (let i = 1; i < parts.length; i++) {
      ancestors.push(parts.slice(0, i).join('/'));
    }

    const container = document.getElementById('summariesTree');

    // Expand each ancestor folder
    for (const ancestorPath of ancestors) {
      expanded.add(ancestorPath);
      const folderEl = container.querySelector(`.tree-node--folder[data-path="${CSS.escape(ancestorPath)}"]`);
      if (folderEl) {
        const children = folderEl.querySelector('.tree-node__children');
        const toggle   = folderEl.querySelector('.tree-node__toggle');
        if (children) children.hidden = false;
        if (toggle)   toggle.textContent = '▼';
      }
    }

    // After expansion, find and highlight the target node
    requestAnimationFrame(() => {
      const targetEl = container.querySelector(`[data-path="${CSS.escape(targetPath)}"]`);
      if (!targetEl) return;
      // Scroll into view
      targetEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
      // Flash highlight
      const row = targetEl.querySelector('.tree-node__row') || targetEl;
      row.classList.add('tree-node--highlight');
      setTimeout(() => row.classList.remove('tree-node--highlight'), 1800);
    });
  }

  // ─── ממשק ציבורי ────────────────────────────────────────────────────────────

  return { init, loadTree };
})();
