'use strict';

/**
 * Admin page logic: login / logout, drag & drop upload with progress,
 * file list with delete and download, and change password.
 */
(() => {
  const { iconFor, extensionOf, formatSize, formatDate } = FilePortal;
  const $ = (id) => document.getElementById(id);

  // Views & auth
  const loginView = $('loginView');
  const dashboardView = $('dashboardView');
  const logoutBtn = $('logoutBtn');
  const loginForm = $('loginForm');
  const passwordInput = $('passwordInput');
  const loginError = $('loginError');
  const loginBtn = $('loginBtn');

  // Dashboard
  const dashCount = $('dashCount');
  const dropzone = $('dropzone');
  const browseBtn = $('browseBtn');
  const fileInput = $('fileInput');
  const selectedList = $('selectedList');
  const uploadError = $('uploadError');
  const uploadSuccess = $('uploadSuccess');
  const progressWrap = $('progressWrap');
  const progressFill = $('progressFill');
  const progressText = $('progressText');
  const uploadBtn = $('uploadBtn');
  const adminLoading = $('adminLoading');
  const adminEmpty = $('adminEmpty');
  const filesTable = $('filesTable');
  const filesTbody = $('filesTbody');

  // Password
  const passwordForm = $('passwordForm');
  const passwordMsg = $('passwordMsg');

  let selectedFiles = [];
  let isUploading = false;

  // -------------------------------------------------------------------------
  // Auth
  // -------------------------------------------------------------------------
  function showView(authenticated) {
    loginView.classList.toggle('hidden', authenticated);
    dashboardView.classList.toggle('hidden', !authenticated);
    logoutBtn.classList.toggle('hidden', !authenticated);
    if (authenticated) loadFiles();
  }

  async function checkAuth() {
    try {
      const res = await fetch('/api/auth');
      const data = await res.json();
      showView(!!data.authenticated);
    } catch {
      showView(false);
    }
  }

  loginForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    loginError.classList.add('hidden');
    loginBtn.disabled = true;
    loginBtn.textContent = 'Logging in\u2026';
    try {
      const res = await fetch('/api/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password: passwordInput.value })
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Login failed');
      passwordInput.value = '';
      showView(true);
    } catch (err) {
      loginError.textContent = err.message;
      loginError.classList.remove('hidden');
    } finally {
      loginBtn.disabled = false;
      loginBtn.textContent = 'Log in';
    }
  });

  logoutBtn.addEventListener('click', async () => {
    try {
      await fetch('/api/logout', { method: 'POST' });
    } catch {
      /* ignore */
    }
    selectedFiles = [];
    renderSelected();
    showView(false);
  });

  // -------------------------------------------------------------------------
  // Upload: selection, drag & drop, progress
  // -------------------------------------------------------------------------
  function addFiles(list) {
    for (const f of list) {
      const duplicate = selectedFiles.some(
        (s) => s.name === f.name && s.size === f.size && s.lastModified === f.lastModified
      );
      if (!duplicate) selectedFiles.push(f);
    }
    renderSelected();
  }

  function renderSelected() {
    selectedList.innerHTML = '';
    selectedFiles.forEach((f, index) => {
      const row = document.createElement('div');
      row.className = 'selected-row';

      const icon = document.createElement('span');
      icon.textContent = iconFor(f.name, f.type);

      const name = document.createElement('span');
      name.className = 'truncate';
      name.textContent = f.name;
      name.title = f.name;

      const size = document.createElement('span');
      size.className = 'muted';
      size.textContent = formatSize(f.size);

      const removeBtn = document.createElement('button');
      removeBtn.type = 'button';
      removeBtn.className = 'icon-btn';
      removeBtn.textContent = '\u2715';
      removeBtn.title = 'Remove';
      removeBtn.addEventListener('click', () => {
        selectedFiles.splice(index, 1);
        renderSelected();
      });

      row.append(icon, name, size, removeBtn);
      selectedList.appendChild(row);
    });

    uploadBtn.disabled = selectedFiles.length === 0 || isUploading;
    uploadBtn.textContent =
      selectedFiles.length > 1 ? `Upload ${selectedFiles.length} files` : 'Upload';
  }

  browseBtn.addEventListener('click', () => fileInput.click());

  dropzone.addEventListener('click', (e) => {
    if (e.target.closest('button')) return;
    fileInput.click();
  });

  fileInput.addEventListener('change', () => {
    addFiles(fileInput.files);
    fileInput.value = '';
  });

  ['dragenter', 'dragover'].forEach((evt) =>
    dropzone.addEventListener(evt, (e) => {
      e.preventDefault();
      dropzone.classList.add('drag');
    })
  );

  ['dragleave', 'drop'].forEach((evt) =>
    dropzone.addEventListener(evt, (e) => {
      e.preventDefault();
      dropzone.classList.remove('drag');
    })
  );

  dropzone.addEventListener('drop', (e) => {
    if (e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files.length) {
      addFiles(e.dataTransfer.files);
    }
  });

  uploadBtn.addEventListener('click', () => {
    if (selectedFiles.length === 0 || isUploading) return;

    const formData = new FormData();
    for (const f of selectedFiles) formData.append('files', f);

    isUploading = true;
    uploadError.classList.add('hidden');
    uploadSuccess.classList.add('hidden');
    progressWrap.classList.remove('hidden');
    progressFill.style.width = '0%';
    progressText.textContent = 'Uploading\u2026';
    renderSelected();

    const xhr = new XMLHttpRequest();
    xhr.open('POST', '/api/upload');

    xhr.upload.addEventListener('progress', (e) => {
      if (e.lengthComputable) {
        const pct = Math.round((e.loaded / e.total) * 100);
        progressFill.style.width = `${pct}%`;
        progressText.textContent = `Uploading\u2026 ${pct}%`;
      }
    });

    xhr.addEventListener('load', () => {
      isUploading = false;
      progressWrap.classList.add('hidden');
      let data = {};
      try {
        data = JSON.parse(xhr.responseText);
      } catch {
        /* not JSON */
      }
      if (xhr.status >= 200 && xhr.status < 300) {
        const count = (data.uploaded || []).length;
        uploadSuccess.textContent =
          count === 1 ? '1 file uploaded successfully.' : `${count} files uploaded successfully.`;
        uploadSuccess.classList.remove('hidden');
        selectedFiles = [];
        renderSelected();
        loadFiles();
      } else if (xhr.status === 401) {
        renderSelected();
        showView(false);
      } else {
        uploadError.textContent = data.error || 'Upload failed. Please try again.';
        uploadError.classList.remove('hidden');
        renderSelected();
      }
    });

    xhr.addEventListener('error', () => {
      isUploading = false;
      progressWrap.classList.add('hidden');
      uploadError.textContent = 'Upload failed. Check your connection and try again.';
      uploadError.classList.remove('hidden');
      renderSelected();
    });

    xhr.send(formData);
  });

  // -------------------------------------------------------------------------
  // File list
  // -------------------------------------------------------------------------
  async function loadFiles() {
    adminLoading.classList.remove('hidden');
    adminEmpty.classList.add('hidden');
    filesTable.classList.add('hidden');

    try {
      const res = await fetch('/api/files');
      if (!res.ok) throw new Error('Request failed');
      const data = await res.json();
      const files = data.files || [];

      adminLoading.classList.add('hidden');
      dashCount.textContent = files.length === 1 ? '1 file' : `${files.length} files`;

      if (files.length === 0) {
        adminEmpty.classList.remove('hidden');
        return;
      }

      filesTbody.innerHTML = '';
      for (const f of files) filesTbody.appendChild(buildRow(f));
      filesTable.classList.remove('hidden');
    } catch {
      adminLoading.textContent = 'Could not load files.';
    }
  }

  function buildRow(f) {
    const tr = document.createElement('tr');

    const iconCell = document.createElement('td');
    iconCell.className = 'cell-icon';
    iconCell.textContent = iconFor(f.name, f.mime);

    const nameCell = document.createElement('td');
    nameCell.className = 'cell-name';
    const nameSpan = document.createElement('div');
    nameSpan.className = 'truncate';
    nameSpan.textContent = f.name;
    nameSpan.title = f.name;
    const typeSpan = document.createElement('small');
    typeSpan.className = 'muted';
    typeSpan.textContent = extensionOf(f.name) || (f.mime || '');
    nameCell.append(nameSpan, typeSpan);

    const sizeCell = document.createElement('td');
    sizeCell.textContent = formatSize(f.size);

    const dateCell = document.createElement('td');
    dateCell.textContent = formatDate(f.uploadedAt);

    const actionsCell = document.createElement('td');
    actionsCell.className = 'right';
    const wrap = document.createElement('div');
    wrap.className = 'row-actions';

    if (f.previewable) {
      const viewBtn = document.createElement('button');
      viewBtn.type = 'button';
      viewBtn.className = 'btn btn-sm btn-outline';
      viewBtn.textContent = 'View';
      viewBtn.addEventListener('click', () => window.open(f.viewUrl, '_blank'));
      wrap.appendChild(viewBtn);
    }

    const downloadLink = document.createElement('a');
    downloadLink.className = 'btn btn-sm btn-outline';
    downloadLink.href = f.downloadUrl;
    downloadLink.textContent = 'Download';
    wrap.appendChild(downloadLink);

    const deleteBtn = document.createElement('button');
    deleteBtn.type = 'button';
    deleteBtn.className = 'btn btn-sm btn-danger';
    deleteBtn.textContent = 'Delete';
    deleteBtn.addEventListener('click', async () => {
      if (!window.confirm(`Delete \u201C${f.name}\u201D? This cannot be undone.`)) return;
      deleteBtn.disabled = true;
      try {
        const res = await fetch(`/api/files/${encodeURIComponent(f.id)}`, { method: 'DELETE' });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.error || 'Delete failed');
        loadFiles();
      } catch (err) {
        deleteBtn.disabled = false;
        window.alert(err.message);
      }
    });
    wrap.appendChild(deleteBtn);

    actionsCell.appendChild(wrap);
    tr.append(iconCell, nameCell, sizeCell, dateCell, actionsCell);
    return tr;
  }

  // -------------------------------------------------------------------------
  // Change password
  // -------------------------------------------------------------------------
  passwordForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    passwordMsg.className = 'alert hidden';

    const current = $('currentPassword').value;
    const next = $('newPassword').value;
    const confirm = $('confirmPassword').value;

    if (next !== confirm) {
      passwordMsg.textContent = 'New passwords do not match.';
      passwordMsg.className = 'alert alert-error';
      return;
    }

    try {
      const res = await fetch('/api/password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ currentPassword: current, newPassword: next })
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Could not update password');
      passwordForm.reset();
      passwordMsg.textContent = 'Password updated successfully.';
      passwordMsg.className = 'alert alert-success';
    } catch (err) {
      passwordMsg.textContent = err.message;
      passwordMsg.className = 'alert alert-error';
    }
  });

  checkAuth();
})();
