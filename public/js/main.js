'use strict';

/**
 * Public page logic: loads the file list, renders cards, opens the
 * preview modal (PDF, images, text, audio, video) and links downloads.
 */
(() => {
  const { iconFor, formatSize, formatDate } = FilePortal;

  const grid = document.getElementById('fileGrid');
  const loading = document.getElementById('loading');
  const empty = document.getElementById('empty');
  const countEl = document.getElementById('fileCount');
  const searchInput = document.getElementById('searchInput');
  const viewer = document.getElementById('viewer');
  const viewerTitle = document.getElementById('viewerTitle');
  const viewerBody = document.getElementById('viewerBody');
  const viewerDownload = document.getElementById('viewerDownload');

  let allFiles = [];

  function render() {
    const query = searchInput.value.trim().toLowerCase();
    const files = allFiles.filter((f) => f.name.toLowerCase().includes(query));

    countEl.textContent = allFiles.length === 1 ? '1 file' : `${allFiles.length} files`;
    grid.innerHTML = '';

    if (files.length === 0) {
      grid.classList.add('hidden');
      empty.classList.remove('hidden');
      empty.textContent =
        allFiles.length === 0
          ? 'No files have been uploaded yet. Please check back later.'
          : `No files match \u201C${searchInput.value.trim()}\u201D.`;
      return;
    }

    empty.classList.add('hidden');
    grid.classList.remove('hidden');
    for (const file of files) grid.appendChild(buildCard(file));
  }

  function buildCard(f) {
    const card = document.createElement('article');
    card.className = 'file-card';

    const icon = document.createElement('div');
    icon.className = 'file-icon';
    icon.textContent = iconFor(f.name, f.mime);

    const info = document.createElement('div');
    info.className = 'file-info';

    const name = document.createElement('h3');
    name.className = 'file-name';
    name.textContent = f.name;
    name.title = f.name;

    const meta = document.createElement('p');
    meta.className = 'file-meta';
    meta.textContent = `${formatSize(f.size)} \u2022 ${formatDate(f.uploadedAt)}`;

    info.append(name, meta);

    const actions = document.createElement('div');
    actions.className = 'file-actions';

    if (f.previewable) {
      const viewBtn = document.createElement('button');
      viewBtn.type = 'button';
      viewBtn.className = 'btn btn-sm';
      viewBtn.textContent = 'View';
      viewBtn.addEventListener('click', () => openViewer(f));
      actions.appendChild(viewBtn);
    }

    const download = document.createElement('a');
    download.className = 'btn btn-outline btn-sm';
    download.href = f.downloadUrl;
    download.textContent = 'Download';
    actions.appendChild(download);

    card.append(icon, info, actions);
    return card;
  }

  function openViewer(f) {
    viewerTitle.textContent = f.name;
    viewerDownload.href = f.downloadUrl;
    viewerBody.innerHTML = '';

    let node;
    if ((f.mime || '').startsWith('image/')) {
      node = document.createElement('img');
      node.src = f.viewUrl;
      node.alt = f.name;
      node.className = 'viewer-img';
    } else {
      node = document.createElement('iframe');
      node.src = f.viewUrl;
      node.title = f.name;
      node.className = 'viewer-frame';
    }

    viewerBody.appendChild(node);
    viewer.classList.remove('hidden');
    document.body.classList.add('no-scroll');
  }

  function closeViewer() {
    viewer.classList.add('hidden');
    viewerBody.innerHTML = '';
    document.body.classList.remove('no-scroll');
  }

  viewer.addEventListener('click', (e) => {
    if (e.target.closest('[data-close-viewer]')) closeViewer();
  });

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !viewer.classList.contains('hidden')) closeViewer();
  });

  searchInput.addEventListener('input', render);

  async function load() {
    try {
      const res = await fetch('/api/files');
      if (!res.ok) throw new Error('Request failed');
      const data = await res.json();
      allFiles = data.files || [];
      loading.classList.add('hidden');
      render();
    } catch {
      loading.textContent = 'Could not load files. Please refresh the page.';
    }
  }

  load();
})();
