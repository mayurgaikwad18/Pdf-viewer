'use strict';

/**
 * Shared helpers used by both the public page (main.js) and the admin
 * page (admin.js).
 */
const FilePortal = (() => {
  const ICONS = {
    pdf: '\uD83D\uDCD5',
    word: '\uD83D\uDCD8',
    excel: '\uD83D\uDCD7',
    ppt: '\uD83D\uDCD9',
    image: '\uD83D\uDDBC\uFE0F',
    text: '\uD83D\uDCC4',
    archive: '\uD83D\uDDDC\uFE0F',
    audio: '\uD83C\uDFB5',
    video: '\uD83C\uDFAC',
    file: '\uD83D\uDCC1'
  };

  function iconFor(name, mime) {
    const ext = (String(name).split('.').pop() || '').toLowerCase();
    const type = String(mime || '');
    if (ext === 'pdf' || type === 'application/pdf') return ICONS.pdf;
    if (['doc', 'docx', 'odt', 'rtf'].includes(ext)) return ICONS.word;
    if (['xls', 'xlsx', 'csv', 'ods'].includes(ext)) return ICONS.excel;
    if (['ppt', 'pptx', 'odp'].includes(ext)) return ICONS.ppt;
    if (['jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp', 'svg', 'avif'].includes(ext)) return ICONS.image;
    if (['txt', 'md', 'json', 'log'].includes(ext)) return ICONS.text;
    if (['zip', 'rar', '7z', 'tar', 'gz'].includes(ext)) return ICONS.archive;
    if (['mp3', 'wav', 'ogg', 'm4a', 'aac', 'flac'].includes(ext)) return ICONS.audio;
    if (['mp4', 'webm', 'mov', 'avi', 'mkv'].includes(ext)) return ICONS.video;
    if (type.startsWith('image/')) return ICONS.image;
    if (type.startsWith('audio/')) return ICONS.audio;
    if (type.startsWith('video/')) return ICONS.video;
    if (type.startsWith('text/')) return ICONS.text;
    return ICONS.file;
  }

  function extensionOf(name) {
    const ext = (String(name).split('.').pop() || '').toLowerCase();
    return ext === String(name).toLowerCase() ? '' : ext.toUpperCase();
  }

  function formatSize(bytes) {
    if (bytes === null || bytes === undefined) return '';
    const units = ['B', 'KB', 'MB', 'GB'];
    let value = Number(bytes);
    let i = 0;
    while (value >= 1024 && i < units.length - 1) {
      value /= 1024;
      i += 1;
    }
    const decimals = i === 0 || value >= 10 ? 0 : 1;
    return `${value.toFixed(decimals)} ${units[i]}`;
  }

  function formatDate(iso) {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return '';
    return d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
  }

  return { iconFor, extensionOf, formatSize, formatDate };
})();
